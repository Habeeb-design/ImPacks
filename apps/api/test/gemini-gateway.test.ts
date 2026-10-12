import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import type { SandboxOrderIntent } from "@impacks/contracts";
import { CheckoutStore } from "../src/storage/checkout.js";
import { PipelineStore } from "../src/pipeline/store.js";
import { decimalAtomic, GeminiSandboxGateway, parseGeminiJson } from "../src/pipeline/gemini.js";

const key = "account-fixture", secret = "fixture-only", clientOrderId = "unique-client-id";
const intent = { clientOrderId, quantity: 4, limitPriceCents: 40, feeReserveCents: 20, reservedCents: 180,
  state: "prepared", revision: 0, exchangeOrderId: null, filledQuantity: 0, costCents: 0, feeCents: 0,
  card: { id: "fixture-card", marketId: "GEMI-FIXTURE-CONTRACT", question: "Fixture?", side: "YES", allocationCents: 200, priceCents: 40,
    order: { id: null, status: "pending", quantity: 0, spentCents: 0 } } } as SandboxOrderIntent;
const order = { orderId: 123, clientOrderId, symbol: intent.card.marketId, side: "buy", outcome: "yes", status: "filled",
  quantity: "4", filledQuantity: "4", remainingQuantity: "0", price: "0.40", avgExecutionPrice: "0.39", createdAt: "2026-10-11T00:00:00Z" };
function fixture(t: test.TestContext, apiKey = key) {
  const store = new CheckoutStore(":memory:"); t.after(() => store.close());
  const ledger = new PipelineStore(store, { accountKey: createHash("sha256").update(apiKey).digest("hex"), capacityCents: 10000, feeReserveBps: 1000 });
  let unquoted = false;
  let fees = true, badIdentity = false, failOrder = false, calls = 0;
  const payloads: Record<string, unknown>[] = [];
  const transport = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input); assert.ok(url.startsWith("https://api.sandbox.gemini.com/")); assert.equal(init.redirect, "error");
    const headers = init.headers as Record<string, string>;
    if (headers?.["X-GEMINI-PAYLOAD"]) {
      assert.equal(headers["X-GEMINI-APIKEY"], apiKey);
      assert.equal(init.body, undefined);
      assert.equal(headers["X-GEMINI-SIGNATURE"], createHmac("sha384", secret).update(headers["X-GEMINI-PAYLOAD"]).digest("hex"));
      const payload = JSON.parse(Buffer.from(headers["X-GEMINI-PAYLOAD"], "base64").toString()); payloads.push(payload);
      assert.equal(payload.account, apiKey.startsWith("master-") ? "primary" : undefined);
    }
    let body: unknown;
    if (url.endsWith("terms/status")) body = { hasAcceptedLatest: true };
    else if (url.endsWith("balances")) body = [{ currency: "USD", available: "1000.00" }];
    else if (url.includes("/categories?")) body = { categories: ["Crypto"] };
    else if (url.includes("/events?")) body = { data: [{ title: "Fixture", contracts: [{ instrumentSymbol: intent.card.marketId, marketState: "open", quantityIncrement: "1", quantityMinimum: "1", priceIncrement: "0.01", priceMinimum: "0.01", prices: { buy: { yes: "0.40", no: "0.60" } } }, ...(unquoted ? [{ instrumentSymbol: "UNQUOTED", marketState: "open", quantityIncrement: "1", quantityMinimum: "1", priceIncrement: "0.01", priceMinimum: "0.01", prices: { buy: {} } }, { instrumentSymbol: "BAD-INCREMENT", marketState: "open", quantityIncrement: "0", quantityMinimum: "1", priceIncrement: "0.01", priceMinimum: "0.01", prices: { buy: { yes: "0.40", no: "0.60" } } }] : [])] }] };
    else if (url.endsWith("/order")) { calls++; if (failOrder) return new Response("unavailable", { status: 503 }); body = { ...order, clientOrderId: badIdentity ? "foreign" : clientOrderId }; }
    else if (url.endsWith("/orders/active")) body = { orders: [] };
    else if (url.endsWith("/orders/history")) body = { orders: [order] };
    else if (url.endsWith("/mytrades")) body = fees ? [{ order_id: "unrelated", type: "Sell" }, { order_id: "123", tid: 1, amount: "4", price: "0.39", fee_amount: "0.001234", fee_currency: "USD", type: "Buy", symbol: intent.card.marketId }] : [];
    else throw new Error("Unexpected URL");
    return Response.json(body);
  }) as typeof fetch;
  return { gateway: new GeminiSandboxGateway(ledger, apiKey, secret, "incremental", transport), payloads,
    set: (options: { unquoted?: boolean; fees?: boolean; badIdentity?: boolean; failOrder?: boolean }) => { unquoted = options.unquoted ?? unquoted; fees = options.fees ?? fees; badIdentity = options.badIdentity ?? badIdentity; failOrder = options.failOrder ?? failOrder; }, calls: () => calls };
}
test("sandbox adapter signs empty-body requests, validates instruments and reconciles exact fees", async t => {
  const x = fixture(t); assert.equal((await x.gateway.readiness()).availableCents, 100000);
  assert.equal((await x.gateway.markets("crypto")).length, 1); await x.gateway.validate(intent);
  const observed = await x.gateway.submit(intent); assert.equal(observed.costAtomic, "1560000"); assert.equal(observed.feeAtomic, "1234");
  assert.equal(observed.feeCents, 1); assert.equal(observed.feesFinal, true);
  const sent = x.payloads.find(payload => payload.request === "/v1/prediction-markets/order")!;
  assert.equal(sent.timeInForce, "immediate-or-cancel"); assert.equal(sent.clientOrderId, clientOrderId);
  assert.ok(x.payloads.every((payload, index) => index === 0 || Number(payload.nonce) > Number(x.payloads[index - 1].nonce)));
  assert.equal((await x.gateway.lookup(intent))?.exchangeOrderId, "123");
});
test("platform master credentials fund orders from its primary Gemini account", async t => {
  const x = fixture(t, "master-platform-fixture");
  await x.gateway.readiness();
  await x.gateway.markets("crypto");
  await x.gateway.validate(intent);
  assert.equal((await x.gateway.submit(intent)).feesFinal, true);
  assert.ok(x.payloads.some(payload => payload.request === "/v1/balances"));
  assert.ok(x.payloads.some(payload => payload.request === "/v1/prediction-markets/order"));
  assert.ok(x.payloads.every(payload => payload.account === "primary"));
});

test("missing fees never become zero-fee final settlement; foreign orders and HTTP failures are not retried", async t => {
  const x = fixture(t); x.set({ fees: false }); assert.equal((await x.gateway.submit(intent)).feesFinal, false);
  x.set({ badIdentity: true }); await assert.rejects(x.gateway.submit(intent), /identity/);
  x.set({ failOrder: true }); const before = x.calls(); await assert.rejects(x.gateway.submit(intent), /503/); assert.equal(x.calls(), before + 1);
});
test("exact currency parser rejects negative, invalid and unsupported sub-micro precision", () => {
  assert.equal(decimalAtomic("0.001234"), 1234n); assert.equal(decimalAtomic("2.00000000"), 2000000n);
  for (const input of ["-1", "NaN", "1e3", "0.0000001"]) assert.throws(() => decimalAtomic(input));
});

test("market discovery excludes unquoted and unsupported instruments without inventing prices", async t => {
  const x = fixture(t); x.set({ unquoted: true });
  const markets = await x.gateway.markets("crypto");
  assert.deepEqual(markets.map(m => m.id), [intent.card.marketId]);
});

test("Chaos uses available sandbox categories without substituting unsupported editions", async t => {
  const x = fixture(t);
  assert.equal((await x.gateway.markets("mixed")).length, 1);
  assert.equal((await x.gateway.markets("tech")).length, 0);
  assert.equal((await x.gateway.markets("culture")).length, 0);
});


test("Gemini numeric order and trade identifiers retain exact wire digits above Number.MAX_SAFE_INTEGER", () => {
  const value = parseGeminiJson('{"orderId":12345678901234567891,"orders":[{"order_id":12345678901234567893,"tid":12345678901234567895}],"count":3}') as { orderId: string; orders: { order_id: string; tid: string }[]; count: number };
  assert.equal(value.orderId, "12345678901234567891");
  assert.equal(value.orders[0].order_id, "12345678901234567893");
  assert.equal(value.orders[0].tid, "12345678901234567895");
  assert.equal(value.count, 3);
  assert.throws(() => parseGeminiJson('{"amount":12345678901234567891}'), /unsafe numeric/);
});

test("prediction fee recovery uses identity-checked account history when mytrades is empty", async t => {
  const store = new CheckoutStore(":memory:"); t.after(() => store.close());
  const ledger = new PipelineStore(store, { accountKey: createHash("sha256").update(key).digest("hex"), capacityCents: 10000, feeReserveBps: 1000 });
  const exchangeId = "145853902277745098";
  const prediction = { ...order, orderId: exchangeId, status: "cancelled", quantity: "4", filledQuantity: "2", remainingQuantity: "2", avgExecutionPrice: "0.235" };
  const history = { order_id: exchangeId, client_order_id: clientOrderId, symbol: intent.card.marketId.toLowerCase(), side: "buy",
    price: "0.40", original_amount: "4", executed_amount: "2", remaining_amount: "2", is_live: false, is_cancelled: true,
    trades: [
      { order_id: exchangeId, tid: "1893456279793219", amount: "1", price: "0.23", fee_amount: "0.02", fee_currency: "USD", type: "Buy" },
      { order_id: exchangeId, tid: "1893456279793220", amount: "1", price: "0.24", fee_amount: "0.01", fee_currency: "USD", type: "Buy" },
    ] };
  let historyRows: unknown[] = [history];
  let writes = 0;
  const gateway = new GeminiSandboxGateway(ledger, key, secret, "incremental", (async input => {
    const url = String(input);
    if (url.endsWith("/orders/active")) return Response.json({ orders: [] });
    if (url.endsWith("/prediction-markets/orders/history")) {
      // The real endpoint emits an unquoted int64, not a JSON string.
      return new Response(JSON.stringify({ orders: [prediction] }).replace(`"${exchangeId}"`, exchangeId));
    }
    if (url.endsWith("/mytrades")) return Response.json([]);
    if (url.endsWith("/v1/orders/history")) return Response.json(historyRows);
    writes++; throw new Error("Unexpected order submission");
  }) as typeof fetch);
  const recovered = await gateway.lookup(intent);
  assert.equal(recovered?.exchangeOrderId, exchangeId);
  assert.equal(recovered?.quantity, 2);
  assert.equal(recovered?.costAtomic, "470000");
  assert.equal(recovered?.feeAtomic, "30000");
  assert.equal(recovered?.feesFinal, true);
  for (const invalid of [
    [], [history, history], [{ ...history, client_order_id: "foreign" }], [{ ...history, symbol: "foreign" }],
    [{ ...history, is_cancelled: false }], [{ ...history, executed_amount: "3" }],
    [{ ...history, trades: history.trades.slice(0, 1) }],
    [{ ...history, trades: [history.trades[0], history.trades[0]] }],
    [{ ...history, trades: history.trades.map(trade => ({ ...trade, order_id: "foreign" })) }],
    [{ ...history, trades: history.trades.map(trade => ({ ...trade, fee_currency: "ETH" })) }],
    [{ ...history, trades: history.trades.map(trade => ({ ...trade, break: "full" })) }],
    [{ ...history, trades: history.trades.map(trade => ({ ...trade, fee_amount: undefined })) }],
  ]) {
    historyRows = invalid;
    assert.equal((await gateway.lookup(intent))?.feesFinal, false, "unusable history cannot finalize fees");
  }
  assert.equal(writes, 0);
});
