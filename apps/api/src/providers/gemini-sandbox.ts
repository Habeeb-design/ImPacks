import { createHmac } from "node:crypto";
import type { SandboxOrderIntent } from "@impacks/contracts";

/** Mekila's HMAC/order payload port, for the future durable submission worker.
 * No HTTP call, terms acceptance, payment confirmation or startup activation.
 * The caller must persist a per-key nonce and submission permit before sending.
 * This signs the stored limit/quantity; it never reprices or redraws a selection.
 */
export function prepareGeminiSandboxBuy(intent: SandboxOrderIntent, credentials: {
  apiKey: string; apiSecret: string; nonce: number;
}) {
  const { apiKey, apiSecret, nonce } = credentials;
  if (!apiKey || !apiSecret || !Number.isSafeInteger(nonce) || nonce <= 0) {
    throw new Error("Server credentials and a persisted positive integer nonce are required.");
  }
  if (intent.state !== "prepared" || intent.exchangeOrderId !== null || intent.filledQuantity !== 0
    || intent.costCents !== 0 || intent.feeCents !== 0) {
    throw new Error("Only an untouched prepared intent can form a new order request.");
  }
  if (!intent.clientOrderId || !intent.card.marketId || !["YES", "NO"].includes(intent.card.side)
    || !Number.isSafeInteger(intent.quantity) || intent.quantity < 1
    || !Number.isInteger(intent.limitPriceCents) || intent.limitPriceCents < 1 || intent.limitPriceCents > 99
    || !Number.isSafeInteger(intent.feeReserveCents) || intent.feeReserveCents < 0
    || !Number.isSafeInteger(intent.reservedCents) || !Number.isSafeInteger(intent.card.allocationCents)
    || !Number.isSafeInteger(intent.quantity * intent.limitPriceCents + intent.feeReserveCents)
    || intent.quantity * intent.limitPriceCents + intent.feeReserveCents > intent.reservedCents
    || intent.reservedCents > intent.card.allocationCents) {
    throw new Error("Order must fit its persisted quantity, price and fee reservation.");
  }
  const path = "/v1/prediction-markets/order";
  const payload = Buffer.from(JSON.stringify({
    request: path, nonce, account: "primary", symbol: intent.card.marketId,
    orderType: "limit", side: "buy", quantity: String(intent.quantity),
    price: (intent.limitPriceCents / 100).toFixed(2), outcome: intent.card.side.toLowerCase(),
    timeInForce: "good-til-cancel", clientOrderId: intent.clientOrderId,
  })).toString("base64");
  return {
    url: `https://api.sandbox.gemini.com${path}`, method: "POST" as const,
    headers: {
      "X-GEMINI-APIKEY": apiKey, "X-GEMINI-PAYLOAD": payload,
      "X-GEMINI-SIGNATURE": createHmac("sha384", apiSecret).update(payload).digest("hex"),
      "Content-Type": "text/plain", "Cache-Control": "no-cache",
    },
  };
}
