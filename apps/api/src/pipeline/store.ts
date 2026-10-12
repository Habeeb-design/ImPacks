import { randomUUID } from "node:crypto";
import { PACK_THEMES, type Opening, type PipelineStatus, type SandboxExecution, type SandboxOrderIntent, type Theme } from "@impacks/contracts";
import type { FinalSettlement, SettlementAuthority } from "../services/refunds.js";
import { executionDigest } from "../services/refunds.js";
import { CheckoutStore } from "../storage/checkout.js";
import { HttpError } from "../errors.js";
import type { OrderObservation, PipelinePolicy } from "./ports.js";

const fail = (code: string, message: string): never => { throw new HttpError(409, code, message); };
export class PipelineStore implements SettlementAuthority {
  constructor(readonly store: CheckoutStore, readonly policy: PipelinePolicy) {
    if (!policy.accountKey || !Number.isSafeInteger(policy.capacityCents) || policy.capacityCents < 1
      || !Number.isSafeInteger(policy.feeReserveBps) || policy.feeReserveBps < 0 || policy.feeReserveBps > 10000) throw new Error("Invalid pipeline policy");
    store.transaction(() => {
      store.db.prepare("INSERT OR IGNORE INTO pipeline_accounts VALUES (?, ?, ?)")
        .run(policy.accountKey, policy.capacityCents, policy.feeReserveBps);
      const row = store.db.prepare("SELECT * FROM pipeline_accounts WHERE account_key=?").get(policy.accountKey)!;
      if (row.capacity !== policy.capacityCents || row.fee_bps !== policy.feeReserveBps) throw new Error("Pipeline policy changed. Reconcile existing reservations before migration.");
    });
  }
  heartbeat(ready: boolean, message: string, packIds: readonly Theme[] = ["crypto"]) {
    const until = ready ? Date.now() + 45_000 : 0;
    this.store.transaction(() => {
      this.store.db.prepare("INSERT OR REPLACE INTO pipeline_heartbeats VALUES (?, ?, ?)").run(this.policy.accountKey, until, message);
      this.store.db.prepare("DELETE FROM pipeline_pack_readiness WHERE account_key=?").run(this.policy.accountKey);
      for (const packId of new Set(packIds)) if (ready && PACK_THEMES.includes(packId)) {
        this.store.db.prepare("INSERT INTO pipeline_pack_readiness VALUES (?, ?, ?)").run(this.policy.accountKey, packId, until);
      }
    });
  }
  enabledPackIds(): Theme[] {
    if (!this.ready()) return [];
    return this.store.db.prepare("SELECT pack_id FROM pipeline_pack_readiness WHERE account_key=? AND ready_until>? ORDER BY pack_id")
      .all(this.policy.accountKey, Date.now()).map(row => row.pack_id as Theme);
  }
  ready() {
    const row = this.store.db.prepare("SELECT * FROM pipeline_heartbeats WHERE account_key=?").get(this.policy.accountKey);
    return !!row && Number(row.ready_until) > Date.now();
  }
  status(id: string): PipelineStatus | null {
    const row = this.row(id);
    if (!row) return null;
    return { state: row.state as PipelineStatus["state"], message: String(row.message),
      fundingMode: this.isAdvanced(id) ? "platform-advance" : "payment-first",
      paymentRequested: !!row.payment_attempt, paymentHash: row.payment_hash as string | null };
  }
  isAdvanced(id: string): boolean {
    const row = this.row(id);
    if (!row || row.account_key !== this.policy.accountKey) return false;
    const purchase = this.store.get(id);
    return purchase.chainId === 11155111 && purchase.mode === "ausd-testnet" && this.store.hasVerifiedOwner(id)
      && !!this.store.db.prepare("SELECT 1 FROM pipeline_advances WHERE purchase_id=?").get(id);
  }
  row(id: string) { return this.store.db.prepare("SELECT * FROM pipeline_jobs WHERE purchase_id=?").get(id); }
  enqueue(id: string, wallet: string, owner: string) {
    return this.store.transaction(() => {
      const purchase = this.store.getOwned(id, wallet);
      if (!owner.startsWith("did:privy:")) fail("PRIVY_REQUIRED", "Sign in before starting checkout.");
      const bound = this.store.db.prepare("SELECT owner_id FROM pipeline_wallet_owners WHERE wallet=?").get(wallet);
      if (bound && bound.owner_id !== owner) fail("WALLET_OWNER_CONFLICT", "This wallet is already bound to another account.");
      this.store.db.prepare("INSERT OR IGNORE INTO pipeline_wallet_owners VALUES (?, ?)").run(wallet.toLowerCase(), owner);
      const existing = this.row(id);
      if (existing) {
        if (existing.owner_id !== owner || existing.account_key !== this.policy.accountKey) fail("PURCHASE_OWNER_CONFLICT", "Purchase ownership or execution account differs.");
        return this.status(id)!;
      }
      if (!this.ready()) fail("WORKER_UNAVAILABLE", "The execution worker is not ready. No payment should be sent.");
      if (!purchase.pack || Date.parse(purchase.expiresAt) <= Date.now()) fail("CHECKOUT_EXPIRED", "Create a fresh checkout.");
      if (!this.enabledPackIds().includes(purchase.pack!.theme)) fail("EDITION_UNAVAILABLE", "This edition has too few available testnet markets. No payment was requested.");
      if (this.policy.platformAdvance) {
        if (purchase.chainId !== 11155111 || purchase.mode !== "ausd-testnet") fail("ADVANCE_TESTNET_ONLY", "Advances require Ethereum Sepolia.");
        const outstanding = this.store.db.prepare(`SELECT j.purchase_id FROM pipeline_advances a
          JOIN pipeline_jobs j USING(purchase_id) JOIN checkout_purchases p ON p.id=j.purchase_id
          WHERE j.account_key=? AND (j.owner_id=? OR p.owner_wallet=?) AND p.status!='confirmed' LIMIT 1`)
          .get(this.policy.accountKey, owner, wallet.toLowerCase());
        if (outstanding) fail("ADVANCE_OUTSTANDING", "Finish payment for your existing pack in purchase history before opening another.");
        const advanced = this.store.db.prepare(`SELECT coalesce(sum(coalesce(j.spent_cents,j.reserved_cents)),0) AS total
          FROM pipeline_advances a JOIN pipeline_jobs j USING(purchase_id) WHERE j.account_key=?`).get(this.policy.accountKey)!;
        if (Number(advanced.total) + purchase.pack!.budgetCents > 50000) fail("ADVANCE_CAPACITY", "The testnet demo advance limit has been reached.");
      }
      const budget = purchase.pack!.budgetCents;
      const usage = this.store.db.prepare("SELECT COALESCE(sum(COALESCE(spent_cents,reserved_cents)),0) AS total FROM pipeline_jobs WHERE account_key=?").get(this.policy.accountKey)!;
      if (Number(usage.total) + budget > this.policy.capacityCents) fail("TREASURY_CAPACITY", "Test funds are reserved for other purchases. Try later.");
      this.store.db.prepare(`INSERT INTO pipeline_jobs (purchase_id,account_key,owner_id,state,reserved_cents,updated_at)
        VALUES (?,?,?,'awaiting-payment',?,?)`).run(id, this.policy.accountKey, owner, budget, Date.now());
      if (this.policy.platformAdvance) {
        const now = new Date().toISOString();
        // Fixed at authorization, before any payment request; retries never extend the deadline.
        const extended = { ...purchase, expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString() };
        this.store.db.prepare("UPDATE checkout_purchases SET purchase_json=?,expires_at=?,updated_at=? WHERE id=?")
          .run(JSON.stringify(extended), extended.expiresAt, now, id);
        this.store.db.prepare("INSERT INTO pipeline_advances VALUES (?,?)").run(id, now);
        this.store.db.prepare("UPDATE pipeline_jobs SET state='preparing' WHERE purchase_id=?").run(id);
      }
      return this.status(id)!;
    });
  }
  paymentIntent(id: string, wallet: string, owner: string) {
    this.enqueue(id, wallet, owner);
    return this.store.transaction(() => {
      const purchase = this.store.getOwned(id, wallet), job = this.row(id)!;
      const collectingAdvance = this.isAdvanced(id) && !!this.opening(id);
      if ((!collectingAdvance && (!this.ready() || !purchase.pack || !this.enabledPackIds().includes(purchase.pack.theme))) || purchase.status !== "pending" || Date.parse(purchase.expiresAt) <= Date.now()) fail("PAYMENT_UNAVAILABLE", "This purchase cannot start a payment.");
      if (this.isAdvanced(id) && !collectingAdvance) fail("ADVANCE_PROCESSING", "Your pack is still opening. Payment follows the result.");
      if (job.payment_attempt || job.payment_hash) fail("PAYMENT_ALREADY_REQUESTED", "A wallet request already exists. Resume its hash; do not send another transfer.");
      const attemptId = randomUUID();
      this.store.db.prepare("UPDATE pipeline_jobs SET payment_attempt=?, updated_at=? WHERE purchase_id=?").run(attemptId, Date.now(), id);
      return { attemptId, purchase: { ...purchase, paymentEnabled: true } };
    });
  }
  rejectPayment(id: string, wallet: string, attemptId: string) {
    this.store.getOwned(id, wallet);
    this.store.db.prepare("UPDATE pipeline_jobs SET payment_attempt=NULL WHERE purchase_id=? AND payment_attempt=? AND payment_hash IS NULL AND state='awaiting-payment'").run(id, attemptId);
  }
  paymentHash(id: string, wallet: string, hash: string) {
    this.store.getOwned(id, wallet);
    return this.store.transaction(() => {
      const job = this.row(id);
      if (!job) fail("PIPELINE_NOT_STARTED", "Start this purchase before attaching payment.");
      if (job!.payment_hash && job!.payment_hash !== hash.toLowerCase()) fail("PAYMENT_HASH_CONFLICT", "Reconcile the original payment hash.");
      const duplicate = this.store.db.prepare("SELECT purchase_id FROM pipeline_jobs WHERE payment_hash=?").get(hash.toLowerCase());
      if (duplicate && duplicate.purchase_id !== id) fail("TRANSACTION_ALREADY_USED", "Payment already belongs to another purchase.");
      this.store.db.prepare("UPDATE pipeline_jobs SET payment_hash=?,updated_at=? WHERE purchase_id=?").run(hash.toLowerCase(), Date.now(), id);
      return this.status(id)!;
    });
  }
  claim(id: string) {
    return this.store.transaction(() => {
      const job = this.row(id);
      if (!job || job.account_key !== this.policy.accountKey || job.state === "completed" || Number(job.lease_until) > Date.now()) return null;
      const token = randomUUID();
      this.store.db.prepare("UPDATE pipeline_jobs SET lease_token=?,lease_until=? WHERE purchase_id=?").run(token, Date.now() + 120_000, id);
      return token;
    });
  }
  assertLease(id: string, token: string) {
    const job = this.row(id);
    if (!job || job.lease_token !== token || Number(job.lease_until) <= Date.now()) fail("STALE_PIPELINE_WORKER", "Worker lease expired; reconcile stored identities.");
  }
  release(id: string, token: string) { this.store.db.prepare("UPDATE pipeline_jobs SET lease_token=NULL,lease_until=0 WHERE purchase_id=? AND lease_token=?").run(id, token); }
  update(id: string, token: string, state: PipelineStatus["state"], message = "") {
    this.assertLease(id, token);
    this.store.db.prepare("UPDATE pipeline_jobs SET state=?,message=?,updated_at=? WHERE purchase_id=?").run(state, message, Date.now(), id);
  }
  permit(id: string, token: string, order: SandboxOrderIntent): boolean {
    return this.store.transaction(() => {
      this.assertLease(id, token);
      if (this.store.db.prepare("SELECT 1 FROM pipeline_submissions WHERE client_order_id=?").get(order.clientOrderId)) return false;
      if (order.state !== "prepared" || order.revision !== 0) fail("LEGACY_ORDER_REQUIRES_REVIEW", "Existing order reports require reconciliation before worker adoption.");
      this.store.db.prepare("INSERT INTO pipeline_submissions VALUES (?,?,NULL,?)").run(order.clientOrderId, id, Date.now());
      return true;
    });
  }
  observed(id: string, token: string, observation: OrderObservation) {
    this.store.transaction(() => {
      this.assertLease(id, token);
      // An unplaced verdict for a never-permitted order still needs a durable row so no later permit can be issued for it.
      if (observation.state === "rejected") this.store.db.prepare("INSERT OR IGNORE INTO pipeline_submissions VALUES (?,?,NULL,?)").run(observation.clientOrderId, id, Date.now());
      this.store.db.prepare("UPDATE pipeline_submissions SET observation_json=? WHERE client_order_id=? AND purchase_id=?")
        .run(JSON.stringify(observation), observation.clientOrderId, id);
    });
  }
  submission(clientId: string): { attemptedAt: number } | null {
    const row = this.store.db.prepare("SELECT attempted_at FROM pipeline_submissions WHERE client_order_id=?").get(clientId);
    return row ? { attemptedAt: Number(row.attempted_at) } : null;
  }
  observation(clientId: string): OrderObservation | null {
    const row = this.store.db.prepare("SELECT observation_json FROM pipeline_submissions WHERE client_order_id=?").get(clientId);
    return row?.observation_json ? JSON.parse(String(row.observation_json)) : null;
  }
  nonce(key: string, floor: number, ceiling = Number.MAX_SAFE_INTEGER): number {
    return this.store.transaction(() => {
      const previous = this.store.db.prepare("SELECT value FROM pipeline_nonces WHERE key=?").get(key);
      const next = Math.max(floor, Number(previous?.value ?? 0) + 1);
      if (!Number.isSafeInteger(next)) throw new Error("Nonce overflow");
      if (next > ceiling) throw new Error("Nonce window exhausted; retry after time advances");
      this.store.db.prepare("INSERT OR REPLACE INTO pipeline_nonces VALUES (?,?)").run(key, next);
      return next;
    });
  }
  readFinal(execution: SandboxExecution): FinalSettlement | null {
    const row = this.row(execution.purchaseId);
    return row?.settlement_json ? JSON.parse(String(row.settlement_json)) : null;
  }
  opening(id: string): Opening | null { const row = this.row(id); return row?.opening_json ? JSON.parse(String(row.opening_json)) : null; }
  recordAdvanceResult(id: string, token: string, execution: SandboxExecution, opening: Opening) {
    this.store.transaction(() => {
      this.assertLease(id, token);
      if (!this.isAdvanced(id) || opening.payment.status !== "pending") fail("ADVANCE_REQUIRED", "A pending platform advance is required.");
      if (execution.orders.length !== execution.pack.cardCount || execution.orders.some(order => {
        const evidence = this.observation(order.clientOrderId);
        return !evidence?.feesFinal || evidence.state === "open";
      })) fail("FINAL_EVIDENCE_REQUIRED", "All fills and fees must be reconciled.");
      const spent = execution.orders.reduce((sum, order) => sum + order.costCents + order.feeCents, 0);
      if (spent > Number(this.row(id)!.reserved_cents)) fail("BUDGET_BREACH", "Spending exceeded the advance.");
      this.store.db.prepare("UPDATE pipeline_jobs SET state='awaiting-payment',spent_cents=?,opening_json=?,message='',updated_at=? WHERE purchase_id=?")
        .run(spent, JSON.stringify(opening), Date.now(), id);
    });
  }
  settle(id: string, token: string, execution: SandboxExecution, opening: Opening) {
    this.store.transaction(() => {
      this.assertLease(id, token);
      const evidence = execution.orders.map(order => this.observation(order.clientOrderId));
      if (evidence.some(item => !item || !item.feesFinal || item.state === "open")) fail("FINAL_EVIDENCE_REQUIRED", "All fills and fees must be reconciled.");
      const spent = execution.orders.reduce((n, order) => n + order.costCents + order.feeCents, 0);
      if (spent > Number(this.row(id)!.reserved_cents)) fail("BUDGET_BREACH", "Spending exceeded reservation; manual reconciliation required.");
      const final: FinalSettlement = { reference: `sandbox:${execution.fulfillmentId}`, executionDigest: executionDigest(execution),
        spentAtomic: evidence.reduce((sum, item) => sum + BigInt(item!.costAtomic) + BigInt(item!.feeAtomic), 0n).toString(),
        feesReconciled: true, ordersFinalized: true, noFurtherOrders: true, paymentRevalidated: true };
      this.store.db.prepare("UPDATE checkout_fulfillments SET status='fulfilled',result_id=?,fulfilled_at=?,updated_at=? WHERE purchase_id=?")
        .run(opening.id, new Date().toISOString(), new Date().toISOString(), id);
      this.store.db.prepare("UPDATE pipeline_jobs SET state='settled',spent_cents=?,opening_json=?,settlement_json=?,message='',updated_at=? WHERE purchase_id=?")
        .run(spent, JSON.stringify(opening), JSON.stringify(final), Date.now(), id);
    });
  }
}
