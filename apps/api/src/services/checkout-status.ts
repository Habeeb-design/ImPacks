import type { PipelineStore } from "../pipeline/store.js";
import type { CheckoutStatus, Opening } from "@impacks/contracts";
import { HttpError } from "../errors.js";
import type { CheckoutService } from "./checkout.js";
import type { ExecutionService } from "./execution.js";
import type { RefundService } from "./refunds.js";

function optional<T>(read: () => T): T | null {
  try { return read(); } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) return null;
    throw error;
  }
}

/** Projection of persisted evidence, never simulated fills or a second random draw. */
export function checkoutStatus(checkout: CheckoutService, executionService: ExecutionService, refunds: RefundService,
  purchaseId: string, wallet: string, pipeline?: PipelineStore): CheckoutStatus {
  const purchase = checkout.get(purchaseId, wallet);
  const execution = optional(() => executionService.get(purchaseId));
  const refund = optional(() => refunds.get(purchaseId));
  const observed = execution?.orders.some(order => order.revision > 0);
  const opening: Opening | null = purchase.status === "confirmed" && execution?.orders.length && observed ? {
    id: execution.fulfillmentId, quoteId: purchase.purchaseId, packName: execution.pack.name,
    theme: execution.pack.theme, createdAt: execution.createdAt, mode: "sandbox",
    status: execution.state === "completed" ? "completed" : execution.state === "partial" ? "partial" : execution.state === "failed" ? "failed" : "pending",
    payment: { status: "confirmed", reference: purchase.transactionHash },
    cards: execution.orders.map(order => order.card),
  } : null;
  return { purchase, opening: pipeline?.row(purchaseId) ? pipeline.opening(purchaseId) : opening, pipeline: pipeline?.status(purchaseId) ?? null,
    execution: execution ? { state: execution.state, preparedCards: execution.orders.length, filledCards: execution.orders.filter(order => order.card.order.status === "filled").length } : null,
    refund: refund ? { state: refund.state, candidateAtomic: refund.candidateAtomic, authorizedAtomic: refund.authorizedAtomic,
      transactionHash: refund.transactionHash, broadcastEnabled: pipeline?.row(purchaseId) ? pipeline.ready() : refund.broadcastEnabled } : null };
}
