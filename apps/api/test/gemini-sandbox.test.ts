import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { SandboxOrderIntent } from "@impacks/contracts";
import { prepareGeminiSandboxBuy } from "../src/providers/gemini-sandbox.js";
import { geminiPacks } from "../src/providers/gemini-catalog.js";
import { packs } from "../src/providers/demo.js";

const credentials = { apiKey: "fixture-key", apiSecret: "fixture-secret", nonce: 1791760000 };
function intent(): SandboxOrderIntent {
  return { clientOrderId: "persisted-client-order", quantity: 4, limitPriceCents: 40,
    feeReserveCents: 20, reservedCents: 180, state: "prepared", revision: 0,
    exchangeOrderId: null, filledQuantity: 0, costCents: 0, feeCents: 0,
    card: { id: "persisted-card", marketId: "GEMI-FIXTURE-CONTRACT", question: "Fixture only?", side: "NO",
      allocationCents: 200, priceCents: 55, order: { id: null, status: "pending", quantity: 0, spentCents: 0 } } };
}
test("Mekila order request signs persisted selection and limits without network side effects", () => {
  const stored = intent(), before = structuredClone(stored);
  const request = prepareGeminiSandboxBuy(stored, credentials);
  assert.equal(request.url, "https://api.sandbox.gemini.com/v1/prediction-markets/order");
  assert.equal(request.method, "POST");
  const expected = { request: "/v1/prediction-markets/order", nonce: 1791760000, account: "primary",
    symbol: "GEMI-FIXTURE-CONTRACT", orderType: "limit", side: "buy", quantity: "4", price: "0.40",
    outcome: "no", timeInForce: "good-til-cancel", clientOrderId: "persisted-client-order" };
  assert.deepEqual(JSON.parse(Buffer.from(request.headers["X-GEMINI-PAYLOAD"], "base64").toString()), expected);
  assert.equal(request.headers["X-GEMINI-SIGNATURE"], createHmac("sha384", "fixture-secret")
    .update(Buffer.from(JSON.stringify(expected)).toString("base64")).digest("hex"));
  assert.deepEqual(stored, before);
});
test("new requests reject prior outcomes, invalid nonces and spending beyond the frozen reservation", () => {
  for (const state of ["unknown", "open", "filled", "cancelled", "rejected"] as const) {
    assert.throws(() => prepareGeminiSandboxBuy({ ...intent(), state }, credentials));
  }
  for (const patch of [{ quantity: 5 }, { quantity: 0 }, { quantity: 1.5 }, { limitPriceCents: 100 },
    { feeReserveCents: -1 }, { reservedCents: 201 }, { exchangeOrderId: "existing" }, { filledQuantity: 1 }]) {
    assert.throws(() => prepareGeminiSandboxBuy({ ...intent(), ...patch }, credentials));
  }
  for (const nonce of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => prepareGeminiSandboxBuy(intent(), { ...credentials, nonce }));
  }
  assert.throws(() => prepareGeminiSandboxBuy(intent(), { ...credentials, apiSecret: "" }));
});
test("all ten Mekila catalog definitions are available in the shared catalog", () => {
  assert.equal(geminiPacks.length, 10);
  assert.equal(new Set(geminiPacks.map(pack => pack.theme)).size, 10);
  assert.deepEqual(packs, geminiPacks);
});
