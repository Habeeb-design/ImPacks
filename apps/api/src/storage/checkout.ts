import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AUSD_ETHEREUM_SEPOLIA, type CheckoutPurchase } from "@impacks/contracts";
import { HttpError } from "../errors.js";

export const defaultCheckoutDatabasePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/checkout.sqlite");
export interface PaymentEvidence {
  transactionHash: string;
  blockNumber: string;
  blockHash: string;
  logIndex: number;
}

/** One durable file on local disk. Never use separate files across API replicas. */
export class CheckoutStore {
  /** Shared only with server-side auth/fulfillment services; never exposed over HTTP. */
  readonly db: DatabaseSync;
  readonly storage: "memory" | "sqlite";
  constructor(path: string) {
    if (!path) throw new Error("Checkout database path must not be empty.");
    this.storage = path === ":memory:" ? "memory" : "sqlite";
    if (this.storage === "sqlite") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    const version = this.db.prepare("PRAGMA user_version").get()!.user_version as number;
    if (version > 5) { this.db.close(); throw new Error("Unsupported checkout database schema version."); }
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
    `);
    this.transaction(() => {
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkout_purchases (
        id TEXT PRIMARY KEY,
        purchase_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending','expired','confirmed')),
        expires_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expired_at TEXT,
        confirmed_at TEXT,
        transaction_hash TEXT COLLATE NOCASE UNIQUE,
        block_number TEXT,
        block_hash TEXT,
        log_index INTEGER,
        CHECK ((status = 'confirmed' AND transaction_hash IS NOT NULL AND confirmed_at IS NOT NULL)
          OR (status != 'confirmed' AND transaction_hash IS NULL AND confirmed_at IS NULL))
      );
    `);
      const columns = this.db.prepare("PRAGMA table_info(checkout_purchases)").all();
      if (!columns.some(column => column.name === "owner_wallet")) {
        // Never infer verified ownership for legacy rows from their unverified buyer field.
        this.db.exec("ALTER TABLE checkout_purchases ADD COLUMN owner_wallet TEXT");
      }
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS wallet_challenges (
          id TEXT PRIMARY KEY, nonce TEXT NOT NULL UNIQUE, wallet TEXT NOT NULL,
          origin TEXT NOT NULL, message TEXT NOT NULL, issued_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL, consumed_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS wallet_sessions (
          token_hash TEXT PRIMARY KEY, wallet TEXT NOT NULL, origin TEXT NOT NULL,
          expires_at INTEGER NOT NULL, revoked_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS checkout_fulfillments (
          purchase_id TEXT PRIMARY KEY REFERENCES checkout_purchases(id),
          id TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('processing', 'fulfilled')),
          request_id TEXT NOT NULL, attempt INTEGER NOT NULL CHECK(attempt > 0),
          lease_expires_at INTEGER NOT NULL, recovery_required INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, fulfilled_at TEXT, result_id TEXT UNIQUE,
          CHECK ((status='fulfilled' AND result_id IS NOT NULL AND fulfilled_at IS NOT NULL)
            OR (status='processing' AND result_id IS NULL AND fulfilled_at IS NULL))
        );
        CREATE TABLE IF NOT EXISTS sandbox_executions (
          fulfillment_id TEXT PRIMARY KEY REFERENCES checkout_fulfillments(id),
          purchase_id TEXT NOT NULL UNIQUE REFERENCES checkout_purchases(id),
          execution_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sandbox_order_intents (
          client_order_id TEXT PRIMARY KEY,
          exchange_order_id TEXT UNIQUE,
          fulfillment_id TEXT NOT NULL REFERENCES sandbox_executions(fulfillment_id),
          intent_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ausd_refunds (
          id TEXT PRIMARY KEY,
          purchase_id TEXT NOT NULL UNIQUE REFERENCES checkout_purchases(id),
          fulfillment_id TEXT NOT NULL UNIQUE REFERENCES sandbox_executions(fulfillment_id),
          state TEXT NOT NULL CHECK(state IN ('pending','authorized','submitting','submitted','confirmed','reconciliation-required','failed')),
          refund_json TEXT NOT NULL,
          settlement_json TEXT,
          transaction_hash TEXT COLLATE NOCASE UNIQUE,
          treasury_address TEXT COLLATE NOCASE,
          nonce INTEGER,
          signed_transaction TEXT,
          evidence_json TEXT,
          UNIQUE(treasury_address, nonce)
        );
        CREATE TABLE IF NOT EXISTS checkout_keys (
          owner_wallet TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
          purchase_id TEXT NOT NULL REFERENCES checkout_purchases(id), PRIMARY KEY(owner_wallet, request_key)
        );
        PRAGMA user_version = 5;
      `);
      for (const table of ["wallet_sessions", "wallet_challenges"]) {
        if (!this.db.prepare(`PRAGMA table_info(${table})`).all().some(column => column.name === "chain_id")) this.db.exec(`ALTER TABLE ${table} ADD COLUMN chain_id INTEGER`);
      }
    });
  }
  close() { this.db.close(); }

  transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  insert(purchase: CheckoutPurchase, ownerWallet: string) {
    this.db.prepare(`INSERT INTO checkout_purchases
      (id, purchase_json, status, expires_at, updated_at, owner_wallet) VALUES (?, ?, 'pending', ?, ?, ?)`)
      .run(purchase.purchaseId, JSON.stringify(purchase), purchase.expiresAt, purchase.updatedAt, ownerWallet.toLowerCase());
  }

  getOwned(id: string, wallet: string): CheckoutPurchase {
    const row = this.db.prepare("SELECT owner_wallet FROM checkout_purchases WHERE id = ?").get(id);
    if (!row?.owner_wallet || row.owner_wallet !== wallet.toLowerCase()) {
      throw new HttpError(404, "PURCHASE_NOT_FOUND", "Purchase not found.");
    }
    const purchase = this.get(id);
    if (purchase.chainId !== AUSD_ETHEREUM_SEPOLIA.chainId) throw new HttpError(409, "LEGACY_CHECKOUT_NETWORK", "This purchase belongs to a previous network and requires reconciliation.");
    return purchase;
  }

  listOwned(wallet: string): CheckoutPurchase[] {
    return this.db.prepare("SELECT id FROM checkout_purchases WHERE owner_wallet = ? ORDER BY rowid DESC LIMIT 100")
      .all(wallet.toLowerCase()).map(row => this.expire(row.id as string, new Date().toISOString()))
      .filter(purchase => purchase.chainId === AUSD_ETHEREUM_SEPOLIA.chainId);
  }

  hasVerifiedOwner(id: string): boolean {
    return Boolean(this.db.prepare("SELECT owner_wallet FROM checkout_purchases WHERE id = ?").get(id)?.owner_wallet);
  }

  get(id: string): CheckoutPurchase {
    const row = this.db.prepare("SELECT * FROM checkout_purchases WHERE id = ?").get(id);
    if (!row) throw new HttpError(404, "PURCHASE_NOT_FOUND", "Purchase not found.");
    return {
      ...JSON.parse(row.purchase_json as string) as CheckoutPurchase,
      status: row.status as CheckoutPurchase["status"], storage: this.storage, paymentEnabled: false,
      updatedAt: row.updated_at as string, expiredAt: row.expired_at as string | null,
      confirmedAt: row.confirmed_at as string | null, transactionHash: row.transaction_hash as string | null,
      paymentBlockNumber: row.block_number as string | null, paymentBlockHash: row.block_hash as string | null,
      paymentLogIndex: row.log_index as number | null,
    };
  }

  expire(id: string, now: string) {
    this.db.prepare(`UPDATE checkout_purchases SET status = 'expired', expired_at = expires_at, updated_at = ?
      WHERE id = ? AND status = 'pending' AND expires_at <= ?`).run(now, id, now);
    return this.get(id);
  }

  assertHashAvailable(id: string, hash: string) {
    const owner = this.db.prepare("SELECT id FROM checkout_purchases WHERE transaction_hash = ?").get(hash);
    if (owner && owner.id !== id) throw new HttpError(409, "TRANSACTION_ALREADY_USED", "This transaction belongs to another purchase.");
  }

  /** No network awaits inside the lock. Uniqueness and state change commit together. */
  confirm(id: string, evidence: PaymentEvidence): CheckoutPurchase {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const purchase = this.get(id);
      if (purchase.status === "confirmed") {
        if (purchase.transactionHash !== evidence.transactionHash) {
          throw new HttpError(409, "PURCHASE_ALREADY_CONFIRMED", "Purchase is already confirmed with another transaction.");
        }
      } else {
        this.assertHashAvailable(id, evidence.transactionHash);
        const now = new Date().toISOString();
        this.db.prepare(`UPDATE checkout_purchases SET status = 'confirmed', transaction_hash = ?,
          confirmed_at = ?, updated_at = ?, block_number = ?, block_hash = ?, log_index = ? WHERE id = ?`)
          .run(evidence.transactionHash.toLowerCase(), now, now, evidence.blockNumber, evidence.blockHash, evidence.logIndex, id);
      }
      const result = this.get(id);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
