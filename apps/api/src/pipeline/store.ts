import { randomUUID } from "node:crypto";
import type { Opening, PipelineStatus, SandboxExecution, SandboxOrderIntent } from "@impacks/contracts";
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
  heartbeat(ready: boolean, message: string) {
    this.store.db.prepare("INSERT OR REPLACE INTO pipeline_heartbeats VALUES (?, ?, ?)")
      .run(this.policy.accountKey, ready ? Date.now() + 45_000 : 0, message);
  }
  ready() {
    const row = this.store.db.prepare("SELECT * FROM pipeline_heartbeats WHERE account_key=?").get(this.policy.accountKey);
    return !!row && Number(row.ready_until) > Date.now();
  }
  status(id: string): PipelineStatus | null {
    const row = this.row(id);
    if (!row) return null;
    return { state: row.state as PipelineStatus["state"], message: String(row.message),
      paymentRequested: !!row.payment_attempt, paymentHash: row.payment_hash as string | null };
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
      if (!purchase.pack || purchase.pack.id !== "crypto" || Date.parse(purchase.expiresAt) <= Date.now()) fail("CHECKOUT_EXPIRED", "Create a fresh Crypto checkout. Other sandbox editions are not enabled yet.");
      const budget = purchase.pack!.budgetCents;
      const usage = this.store.db.prepare("SELECT COALESCE(sum(COALESCE(spent_cents,reserved_cents)),0) AS total FROM pipeline_jobs WHERE account_key=?").get(this.policy.accountKey)!;
      if (Number(usage.total) + budget > this.policy.capacityCents) fail("TREASURY_CAPACITY", "Sandbox funds are reserved for other purchases. Try later.");
      this.store.db.prepare(`INSERT INTO pipeline_jobs (purchase_id,account_key,owner_id,state,reserved_cents,updated_at)
        VALUES (?,?,?,'awaiting-payment',?,?)`).run(id, this.policy.accountKey, owner, budget, Date.now());
      return this.status(id)!;
    });
  }
  paymentIntent(id: string, wallet: string, owner: string) {
    this.enqueue(id, wallet, owner);
    return this.store.transaction(() => {
      const purchase = this.store.getOwned(id, wallet), job = this.row(id)!;
      if (!this.ready() || purchase.status !== "pending" || Date.parse(purchase.expiresAt) <= Date.now()) fail("PAYMENT_UNAVAILABLE", "This purchase cannot start a payment.");
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
    this.assertLease(id, token);
    this.store.db.prepare("UPDATE pipeline_submissions SET observation_json=? WHERE client_order_id=? AND purchase_id=?")
      .run(JSON.stringify(observation), observation.clientOrderId, id);
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
