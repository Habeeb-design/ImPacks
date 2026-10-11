import { randomUUID } from "node:crypto";
import type { Opening, SandboxExecution, SandboxOrderIntent } from "@impacks/contracts";
import type { Hash } from "viem";
import { CheckoutService } from "../services/checkout.js";
import { ExecutionService } from "../services/execution.js";
import { FulfillmentService } from "../services/fulfillment.js";
import { RefundService } from "../services/refunds.js";
import type { PaymentVerifier } from "../providers/ausd/verify.js";
import { PipelineStore } from "./store.js";
import type { OrderObservation, RefundTransport, TradingGateway } from "./ports.js";

export class PurchaseWorker {
  readonly execution: ExecutionService;
  private fulfillment: FulfillmentService;
  constructor(private ledger: PipelineStore, private gateway: TradingGateway,
    private checkout: CheckoutService, private payments: PaymentVerifier,
    private refunds: RefundService, private transfers?: RefundTransport) {
    if (ledger.policy.accountKey !== gateway.accountKey) throw new Error("Wrong exchange account");
    this.execution = new ExecutionService(ledger.store, { listEligible: theme => gateway.markets(theme) }, ledger.policy.feeReserveBps);
    this.fulfillment = new FulfillmentService(ledger.store);
  }
  async readiness() {
    try {
      if (!this.transfers) throw new Error("Refund transport is required before collecting payments");
      await this.transfers.pendingNonce();
      const { availableCents } = await this.gateway.readiness();
      if (availableCents < this.ledger.policy.capacityCents) throw new Error("Configured sandbox reservation ceiling exceeds available USD");
      const markets = await this.gateway.markets("crypto");
      if (new Set(markets.map(m => m.id)).size < 3) throw new Error("Fewer than three supported sandbox instruments");
      this.ledger.heartbeat(true, "Sandbox worker is ready");
    } catch {
      this.ledger.heartbeat(false, "Sandbox account, supported instruments, or balance is unavailable");
    }
  }
  async tick() {
    await this.readiness();
    const jobs = this.ledger.store.db.prepare("SELECT purchase_id FROM pipeline_jobs WHERE account_key=? AND state!='completed' ORDER BY updated_at LIMIT 50").all(this.gateway.accountKey);
    for (const row of jobs) await this.run(String(row.purchase_id));
  }
  async run(id: string) {
    const token = this.ledger.claim(id);
    if (!token) return;
    try {
      let purchase = this.ledger.store.get(id);
      const job = this.ledger.row(id)!;
      if (purchase.status !== "confirmed") {
        if (!job.payment_hash) { this.ledger.update(id, token, "awaiting-payment"); return; }
        purchase = await this.checkout.verify(id, job.payment_hash as Hash, purchase.buyerAddress);
      }
      // Re-check canonical payment evidence before EVERY side-effect phase, including refunds.
      await this.payments.verify(purchase, purchase.transactionHash as Hash);
      this.ledger.assertLease(id, token);
      if (this.ledger.readFinal({ purchaseId: id } as SandboxExecution)) { await this.refund(id, token); return; }
      this.ledger.update(id, token, "preparing");
      let fulfillment;
      try { fulfillment = this.fulfillment.get(id); } catch { /* new fulfillment */ }
      if (!fulfillment || Date.parse(fulfillment.leaseExpiresAt) <= Date.now()) fulfillment = this.fulfillment.claim(id, randomUUID());
      const attempt = { requestId: fulfillment.requestId, attempt: fulfillment.attempt };
      this.fulfillment.renew(id, attempt);
      this.execution.reserve(id, attempt);
      let execution = await this.execution.prepare(id, attempt);
      this.ledger.update(id, token, "executing");
      for (const original of execution.orders) {
        this.ledger.assertLease(id, token);
        this.fulfillment.renew(id, attempt);
        const order = this.execution.get(id).orders.find(value => value.clientOrderId === original.clientOrderId)!;
        const prior = this.ledger.observation(order.clientOrderId);
        if (prior?.feesFinal && prior.state !== "open") continue;
        let observed: OrderObservation | null;
        const submitted = this.ledger.store.db.prepare("SELECT 1 FROM pipeline_submissions WHERE client_order_id=?").get(order.clientOrderId);
        if (!submitted) {
          if (!this.ledger.ready()) throw new Error("Worker unavailable for new submissions; existing orders remain recoverable");
          await this.gateway.markets(execution.pack.theme); // Fresh metadata only needed for new submissions.
          await this.gateway.validate(order);
          await this.payments.verify(purchase, purchase.transactionHash as Hash);
          this.ledger.assertLease(id, token);
          if (!this.ledger.permit(id, token, order)) observed = await this.gateway.lookup(order);
          else {
            // Permit commits before network I/O. A timeout/crash never results in resubmission.
            try { observed = await this.gateway.submit(order); }
            catch { observed = null; }
          }
        } else observed = await this.gateway.lookup(order);
        this.ledger.assertLease(id, token);
        if (!observed) {
          this.ledger.update(id, token, "reconciliation-required", "Order result is uncertain. Looking up the original order; no duplicate order will be sent.");
          return;
        }
        // Retain over-budget evidence for reconciliation, but never issue holdings/refunds from it.
        if (observed.clientOrderId !== order.clientOrderId) throw new Error("Observation identity differs");
        this.ledger.observed(id, token, observed);
        this.validateObservation(order, observed);
        this.project(id, attempt, order, observed);
        if (!observed.feesFinal || observed.state === "open") {
          this.ledger.update(id, token, "reconciliation-required", "Waiting for final order and fee evidence. Funds remain reserved.");
          return;
        }
      }
      execution = this.execution.get(id);
      // Replay final observations persisted before a prior interrupted projection.
      for (const order of execution.orders) {
        const observation = this.ledger.observation(order.clientOrderId);
        if (!observation?.feesFinal || observation.state === "open") throw new Error("Final evidence unavailable");
        this.validateObservation(order, observation);
        this.project(id, attempt, order, observation);
      }
      execution = this.execution.get(id);
      if (execution.state === "reconciliation-required") throw new Error("Execution requires manual reconciliation; no automatic accounting clearance");
      await this.payments.verify(purchase, purchase.transactionHash as Hash);
      const opening: Opening = { id: execution.fulfillmentId, quoteId: id, packName: execution.pack.name, theme: execution.pack.theme,
        createdAt: execution.createdAt, mode: "sandbox", status: execution.state === "completed" ? "completed" : execution.state === "partial" ? "partial" : "failed",
        payment: { status: "confirmed", reference: purchase.transactionHash }, cards: execution.orders.map(order => order.card) };
      this.ledger.settle(id, token, execution, opening);
      await this.refund(id, token);
    } catch {
      // Do not expose upstream responses or signing material to the public status endpoint.
      try { this.ledger.update(id, token, "reconciliation-required", "Purchase needs reconciliation. Its payment and order identities are preserved; do not pay again."); } catch { /* lease taken over */ }
    } finally { this.ledger.release(id, token); }
  }
  private validateObservation(order: SandboxOrderIntent, value: OrderObservation) {
    if (value.clientOrderId !== order.clientOrderId || !value.exchangeOrderId || !value.evidence
      || !["open", "filled", "cancelled"].includes(value.state) || !Number.isSafeInteger(value.quantity) || value.quantity < order.filledQuantity
      || !Number.isSafeInteger(value.costCents) || !Number.isSafeInteger(value.feeCents) || value.costCents < order.costCents || value.feeCents < order.feeCents
      || !/^\d+$/.test(value.costAtomic) || !/^\d+$/.test(value.feeAtomic)
      || value.costCents !== Number((BigInt(value.costAtomic) + 9999n) / 10000n)
      || value.feeCents !== Number((BigInt(value.feeAtomic) + 9999n) / 10000n)
      || value.quantity > order.quantity || value.costCents > value.quantity * order.limitPriceCents
      || value.feeCents > order.feeReserveCents || value.costCents + value.feeCents > order.reservedCents
      || (value.quantity === 0 && value.costCents !== 0) || (value.state === "filled" && value.quantity !== order.quantity)
      || (order.exchangeOrderId !== null && value.exchangeOrderId !== order.exchangeOrderId)) throw new Error("Exchange evidence is inconsistent or over budget");
  }
  private project(id: string, attempt: { requestId: string; attempt: number }, order: SandboxOrderIntent, observed: OrderObservation) {
    const state = observed.feesFinal ? observed.state : "open";
    const same = order.state === state && order.exchangeOrderId === observed.exchangeOrderId && order.filledQuantity === observed.quantity
      && order.costCents === observed.costCents && order.feeCents === observed.feeCents;
    if (!same) this.execution.report(id, { ...attempt, clientOrderId: order.clientOrderId, revision: order.revision + 1,
      state, exchangeOrderId: observed.exchangeOrderId, filledQuantity: observed.quantity, costCents: observed.costCents, feeCents: observed.feeCents });
  }
  private async refund(id: string, token: string) {
    this.ledger.assertLease(id, token);
    let value = this.refunds.prepare(id);
    if (value.candidateAtomic === "0" && value.blockers.length === 0) { this.ledger.update(id, token, "completed"); return; }
    if (value.state === "pending") value = this.refunds.authorize(id);
    if (value.state === "confirmed") { this.ledger.update(id, token, "completed"); return; }
    if (value.state === "failed") throw new Error("Refund reverted; manual reconciliation required");
    this.ledger.update(id, token, "refunding", this.transfers ? "Returning the confirmed unused amount." : "Refund is authorized; the treasury transfer worker is not configured.");
    if (!this.transfers) return;
    if (!value.transactionHash) {
      // Serialize signing across this dedicated treasury. Existing unresolved transfers block new nonces.
      const other = this.ledger.store.db.prepare(`SELECT p.purchase_id FROM pipeline_refund_nonces p JOIN ausd_refunds r USING(purchase_id)
        WHERE p.purchase_id!=? AND r.state!='confirmed' LIMIT 1`).get(id);
      if (other) return;
      const networkNonce = await this.transfers.pendingNonce();
      const nonce = this.ledger.store.transaction(() => {
        this.ledger.assertLease(id, token);
        const current = this.ledger.store.db.prepare("SELECT nonce FROM pipeline_refund_nonces WHERE purchase_id=?").get(id);
        if (current) return Number(current.nonce);
        const occupied = this.ledger.store.db.prepare(`SELECT 1 FROM pipeline_refund_nonces p JOIN ausd_refunds r USING(purchase_id)
          WHERE p.purchase_id!=? AND r.state!='confirmed'`).get(id);
        if (occupied) return null;
        const previous = this.ledger.store.db.prepare("SELECT max(nonce) AS nonce FROM pipeline_refund_nonces").get();
        const next = Math.max(networkNonce, previous?.nonce === null ? 0 : Number(previous?.nonce ?? -1) + 1);
        this.ledger.store.db.prepare("INSERT INTO pipeline_refund_nonces VALUES (?,?)").run(id, next);
        return next;
      });
      if (nonce === null) return;
      if (nonce < networkNonce) throw new Error("Reserved refund nonce was consumed without a staged transaction; reconcile manually");
      const serialized = await this.transfers.sign({ id, to: value.recipientAddress, amountAtomic: value.authorizedAtomic!, nonce });
      this.ledger.assertLease(id, token);
      value = await this.refunds.stageSigned(id, serialized);
    }
    this.ledger.assertLease(id, token);
    const raw = this.ledger.store.db.prepare("SELECT signed_transaction FROM ausd_refunds WHERE purchase_id=?").get(id)!;
    // Every retry uses the same serialized transaction/hash/nonce, including uncertain broadcast responses.
    try {
      const hash = await this.transfers.broadcast(raw.signed_transaction as `0x${string}`);
      if (hash.toLowerCase() !== value.transactionHash!.toLowerCase()) throw new Error("Refund broadcast identity mismatch");
    } catch { /* receipt reconciliation decides the outcome */ }
    const result = await this.refunds.reconcile(id);
    if (result.state === "confirmed") this.ledger.update(id, token, "completed");
  }
}
