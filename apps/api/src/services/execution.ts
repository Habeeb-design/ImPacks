import { randomUUID } from "node:crypto";
import type { ExecutionReport, FulfillmentAttemptRequest, SandboxExecution, SandboxOrderIntent, Pack } from "@impacks/contracts";
import { CheckoutStore } from "../storage/checkout.js";
import { FulfillmentService } from "./fulfillment.js";
import { drawCards } from "./packs.js";
import type { MarketProvider } from "../providers/ports.js";
import { HttpError } from "../errors.js";

const budgets = { starter: 100, premium: 300, ultimate: 500 } as const;
const conflict = (message: string): never => { throw new HttpError(409, "EXECUTION_CONFLICT", message); };
/** Preparation/accounting only. There is intentionally no exchange submission capability. */
export class ExecutionService {
  constructor(private store: CheckoutStore, private markets: MarketProvider, private feeReserveBps?: number) {}

  private authorize(purchaseId: string, input: FulfillmentAttemptRequest) {
    const job = new FulfillmentService(this.store).get(purchaseId);
    const purchase = this.store.getOwned(purchaseId, job.buyerAddress);
    if (purchase.status !== "confirmed" || purchase.chainId !== 11155111 || purchase.mode !== "ausd-testnet") conflict("Confirmed testnet purchase required.");
    if (job.status !== "processing" || job.requestId !== input.requestId || job.attempt !== input.attempt || Date.parse(job.leaseExpiresAt) <= Date.now()) conflict("An active fulfillment lease is required.");
    return { job, purchase };
  }

  get(purchaseId: string): SandboxExecution {
    const row = this.store.db.prepare("SELECT execution_json FROM sandbox_executions WHERE purchase_id = ?").get(purchaseId);
    if (!row) throw new HttpError(404, "EXECUTION_NOT_FOUND", "Execution has not been reserved.");
    const execution = JSON.parse(row.execution_json as string) as SandboxExecution;
    execution.orders = this.store.db.prepare("SELECT intent_json FROM sandbox_order_intents WHERE fulfillment_id = ? ORDER BY rowid")
      .all(execution.fulfillmentId).map(row => JSON.parse(row.intent_json as string) as SandboxOrderIntent);
    return execution;
  }

  reserve(purchaseId: string, input: FulfillmentAttemptRequest): SandboxExecution {
    return this.store.transaction(() => {
      const { job, purchase } = this.authorize(purchaseId, input);
      if (this.store.db.prepare("SELECT 1 FROM sandbox_executions WHERE purchase_id = ?").get(purchaseId)) return this.get(purchaseId);
      const budgetCents = purchase.pack?.budgetCents ?? budgets[purchase.packType as keyof typeof budgets];
      if (BigInt(purchase.amountAtomic) !== BigInt(budgetCents) * 10000n || purchase.decimals !== 6) conflict("Purchase price does not match the server-controlled tier.");
      const pack: Pack = purchase.pack ?? { id: purchase.packType, name: `${purchase.packType} testnet pack`, theme: "mixed",
        description: "Sandbox demonstration; separately funded USD, no conversion.", cardCount: 3,
        priceAtomic: purchase.amountAtomic, budgetCents };
      const timestamp = new Date().toISOString();
      const value: SandboxExecution = { fulfillmentId: job.fulfillmentId, purchaseId,
        identity: { walletAddress: purchase.buyerAddress, chainId: 11155111 }, pack, budgetCents,
        reservedCents: budgetCents, mode: "sandbox", submissionEnabled: false, accountingRule: "demo-nominal-1:1",
        state: "pending", orders: [], createdAt: timestamp, updatedAt: timestamp };
      this.store.db.prepare("INSERT INTO sandbox_executions VALUES (?, ?, ?)").run(job.fulfillmentId, purchaseId, JSON.stringify(value));
      return value;
    });
  }

  async prepare(purchaseId: string, input: FulfillmentAttemptRequest): Promise<SandboxExecution> {
    this.authorize(purchaseId, input);
    const current = this.get(purchaseId);
    if (current.orders.length) return current;
    // No lock held across I/O. A competing request's committed selection always wins.
    let markets;
    try { markets = await this.markets.listEligible(current.pack.theme); }
    catch { throw new HttpError(503, "MARKETS_UNAVAILABLE", "Market discovery failed; retry the same execution."); }
    return this.store.transaction(() => {
      this.authorize(purchaseId, input);
      const value = this.get(purchaseId);
      if (value.orders.length) return value;
      const cards = drawCards(markets, value.pack);
      value.orders = cards.map(card => {
        // Legacy preparation allowance; the worker supplies an explicit fee ceiling, not a fee estimate.
        let feeReserveCents = Math.ceil(card.allocationCents / 10);
        let quantity = Math.floor((card.allocationCents - feeReserveCents) / card.priceCents);
        if (this.feeReserveBps !== undefined) {
          quantity = Math.floor(card.allocationCents * 10000 / (card.priceCents * (10000 + this.feeReserveBps)));
          feeReserveCents = Math.ceil(quantity * card.priceCents * this.feeReserveBps / 10000);
          while (quantity > 0 && quantity * card.priceCents + feeReserveCents > card.allocationCents) {
            quantity--; feeReserveCents = Math.ceil(quantity * card.priceCents * this.feeReserveBps / 10000);
          }
        }
        if (quantity < 1) conflict("Budget cannot fund three whole contracts plus fee allowances; no selection committed.");
        return { clientOrderId: randomUUID(), card, quantity, limitPriceCents: card.priceCents,
          feeReserveCents, reservedCents: quantity * card.priceCents + feeReserveCents,
          state: "prepared", revision: 0, exchangeOrderId: null, filledQuantity: 0, costCents: 0, feeCents: 0 };
      });
      if (value.orders.reduce((n, order) => n + order.reservedCents, 0) > value.budgetCents) conflict("Budget exceeded.");
      for (const order of value.orders) this.store.db.prepare("INSERT INTO sandbox_order_intents (client_order_id, fulfillment_id, intent_json) VALUES (?, ?, ?)")
        .run(order.clientOrderId, value.fulfillmentId, JSON.stringify(order));
      this.save(value);
      return value;
    });
  }

  /** Trusted cumulative exchange observations, never client payment proof. No automatic resubmission. */
  report(purchaseId: string, input: ExecutionReport): SandboxExecution {
    return this.store.transaction(() => {
      this.authorize(purchaseId, input);
      const refund = this.store.db.prepare("SELECT state FROM ausd_refunds WHERE purchase_id = ?").get(purchaseId);
      if (refund && refund.state !== "pending") conflict("Execution accounting is sealed by refund authorization; reconcile corrections manually.");
      const value = this.get(purchaseId);
      const order = value.orders.find(order => order.clientOrderId === input.clientOrderId);
      if (!order) conflict("Unknown client order ID.");
      const target = order!;
      const fields = ["state", "exchangeOrderId", "filledQuantity", "costCents", "feeCents"] as const;
      if (input.revision === target.revision && fields.every(key => target[key] === input[key])) return value;
      if (input.revision !== target.revision + 1) conflict("Report must use the next revision; reconcile stale or conflicting observations.");
      if (["filled", "cancelled", "rejected"].includes(target.state)) conflict("Terminal order observations are immutable; escalate corrections for reconciliation.");
      if (input.filledQuantity < target.filledQuantity || input.costCents < target.costCents || input.feeCents < target.feeCents) conflict("Cumulative fills and fees cannot decrease.");
      if (target.exchangeOrderId && input.exchangeOrderId !== target.exchangeOrderId) conflict("Exchange order identity cannot change.");
      if (["open", "filled", "cancelled"].includes(input.state) && !input.exchangeOrderId) conflict("Exchange order identity required.");
      if (input.filledQuantity && !input.exchangeOrderId) conflict("Actual fills require an exchange order identity.");
      if (input.exchangeOrderId) {
        const other = this.store.db.prepare("SELECT client_order_id FROM sandbox_order_intents WHERE exchange_order_id = ?").get(input.exchangeOrderId);
        if (other && other.client_order_id !== target.clientOrderId) conflict("Exchange order already belongs to another intent.");
      }
      if (input.state === "filled" && input.filledQuantity !== target.quantity) conflict("Accepted/open orders are not full fills.");
      if (input.state === "rejected" && (input.filledQuantity || input.costCents || input.feeCents)) conflict("Rejected orders cannot erase actual fills.");
      if ((!input.filledQuantity && input.costCents) || (input.filledQuantity && !input.costCents)) conflict("Fill quantity and cost must agree.");
      // Keep actual over-limit observations for reconciliation, never hide an external liability.
      const breach = input.filledQuantity > target.quantity || input.costCents > input.filledQuantity * target.limitPriceCents
        || input.feeCents > target.feeReserveCents || input.costCents + input.feeCents > target.reservedCents;
      Object.assign(target, Object.fromEntries(fields.map(key => [key, input[key]])), { revision: input.revision });
      target.card.order = { id: target.exchangeOrderId,
        status: (["filled", "cancelled"].includes(target.state) && target.filledQuantity > 0) ? "filled" : target.state === "unknown" ? "unknown"
          : ["cancelled", "rejected"].includes(target.state) ? "failed" : "pending",
        quantity: target.filledQuantity, spentCents: target.costCents };
      if (target.card.order.status === "filled") target.card.position = { status: "open", remainingQuantity: target.filledQuantity, costBasisCents: target.costCents };
      const unknown = value.orders.some(order => order.state === "unknown");
      const terminal = value.orders.every(order => ["filled", "cancelled", "rejected"].includes(order.state));
      const anyFill = value.orders.some(order => order.filledQuantity > 0);
      value.state = breach || value.state === "reconciliation-required" || unknown ? "reconciliation-required"
        : value.orders.every(order => order.state === "filled") ? "completed"
        : anyFill ? "partial" : terminal ? "failed" : "processing";
      // Unknown is sticky: an operator must reconcile all orders before a future rollout can release it.
      this.store.db.prepare("UPDATE sandbox_order_intents SET intent_json = ?, exchange_order_id = ? WHERE client_order_id = ?")
        .run(JSON.stringify(target), target.exchangeOrderId, target.clientOrderId);
      this.save(value);
      return value;
    });
  }

  private save(value: SandboxExecution) {
    value.updatedAt = new Date().toISOString();
    this.store.db.prepare("UPDATE sandbox_executions SET execution_json = ? WHERE fulfillment_id = ?")
      .run(JSON.stringify({ ...value, orders: [] }), value.fulfillmentId);
  }
}
