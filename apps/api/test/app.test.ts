import test from "node:test";
import assert from "node:assert/strict";
import { DISCLOSURE_VERSION, routes, type Opening, type Quote, type Session } from "@impacks/contracts";
import { buildApp } from "../src/app.js";
import { demoProviders, packs } from "../src/providers/demo.js";
import { drawCards, PackService } from "../src/services/packs.js";

async function setup(t: test.TestContext, providers = demoProviders()) {
  const app = buildApp({ providers, checkoutDatabasePath: ":memory:" });
  t.after(() => app.close());
  const login = await app.inject({ method: "POST", url: routes.login, payload: { displayName: "Builder" } });
  assert.equal(login.statusCode, 200);
  const session = login.json<Session>();
  const headers = { authorization: `Bearer ${session.token}` };
  const response = await app.inject({ method: "POST", url: routes.quotes, headers, payload: { packId: "mixed" } });
  assert.equal(response.statusCode, 200);
  const quote = response.json<Quote>();
  const open = (key = "attempt-key-123", proof = `demo:${quote.id}`) => app.inject({
    method: "POST", url: routes.openings, headers: { ...headers, "idempotency-key": key },
    payload: { quoteId: quote.id, disclosureVersion: DISCLOSURE_VERSION, paymentProof: proof },
  });
  return { app, quote, headers, open };
}

test("login → quote → opening → portfolio conserves budget and preserves results", async t => {
  const { app, quote, headers, open } = await setup(t);
  const response = await open();
  assert.equal(response.statusCode, 200);
  const result = response.json<Opening>();
  assert.equal(result.status, "completed");
  assert.equal(result.payment.status, "confirmed");
  assert.equal(result.cards.length, 3);
  assert.equal(new Set(result.cards.map(c => c.marketId)).size, 3);
  assert.equal(result.cards.reduce((n, c) => n + c.allocationCents, 0), quote.pack.budgetCents);
  for (const card of result.cards) {
    assert.ok(card.order.spentCents <= card.allocationCents);
    assert.equal(card.order.spentCents, card.order.quantity * card.priceCents);
  }
  const portfolio = await app.inject({ url: routes.portfolio, headers });
  assert.deepEqual(portfolio.json().openings, [result]);
  const detail = await app.inject({ url: `${routes.openings}/${result.id}`, headers });
  assert.deepEqual(detail.json(), result);
});

test("concurrent replay confirms payment once and places only three orders", async t => {
  const providers = demoProviders();
  const originalPayment = providers.payments.confirm;
  const originalBuy = providers.orders.buy;
  let payments = 0, orders = 0;
  providers.payments.confirm = async input => { payments++; return originalPayment(input); };
  providers.orders.buy = async input => { orders++; return originalBuy(input); };
  const { open } = await setup(t, providers);
  const results = await Promise.all([open(), open(), open()]);
  assert.ok(results.every(result => result.statusCode === 200));
  assert.deepEqual(results[0].json(), results[2].json());
  assert.equal(payments, 1); assert.equal(orders, 3);
  assert.equal((await open("different-key-456")).statusCode, 409);
});

test("key cannot be reused for a different quote", async t => {
  const { app, headers, open } = await setup(t);
  await open();
  const quote = (await app.inject({ method: "POST", url: routes.quotes, headers, payload: { packId: "crypto" } })).json<Quote>();
  const response = await app.inject({ method: "POST", url: routes.openings, headers: { ...headers, "idempotency-key": "attempt-key-123" }, payload: { quoteId: quote.id, disclosureVersion: DISCLOSURE_VERSION, paymentProof: `demo:${quote.id}` } });
  assert.equal(response.statusCode, 409); assert.equal(response.json().error.code, "KEY_REUSED");
});

test("another user cannot open a quote or read its result", async t => {
  const { app, quote, open } = await setup(t);
  const opening = (await open()).json<Opening>();
  const session = (await app.inject({ method: "POST", url: routes.login, payload: { displayName: "Other" } })).json<Session>();
  const headers = { authorization: `Bearer ${session.token}`, "idempotency-key": "other-key-123" };
  const response = await app.inject({ method: "POST", url: routes.openings, headers, payload: { quoteId: quote.id, disclosureVersion: DISCLOSURE_VERSION, paymentProof: `demo:${quote.id}` } });
  assert.equal(response.statusCode, 404);
  assert.equal((await app.inject({ url: `${routes.openings}/${opening.id}`, headers })).statusCode, 404);
  assert.deepEqual((await app.inject({ url: routes.portfolio, headers })).json().openings, []);
});

test("payment failure submits no orders and retry does not charge again", async t => {
  const providers = demoProviders();
  let payments = 0, orders = 0;
  providers.payments.confirm = async () => { payments++; throw new Error("timeout"); };
  providers.orders.buy = async () => { orders++; throw new Error("must not execute"); };
  const { open } = await setup(t, providers);
  const result = (await open()).json<Opening>();
  assert.equal(result.status, "failed"); assert.equal(result.payment.status, "unknown");
  await open(); assert.equal(payments, 1); assert.equal(orders, 0);
});

test("uncertain order is not retried or reported as filled", async t => {
  const providers = demoProviders();
  const buy = providers.orders.buy;
  let calls = 0;
  providers.orders.buy = async input => { if (++calls === 2) throw new Error("timeout after submit"); return buy(input); };
  const { open } = await setup(t, providers);
  const result = (await open()).json<Opening>();
  assert.equal(result.status, "partial");
  assert.equal(result.cards[1].order.status, "unknown");
  await open(); assert.equal(calls, 3);
});

test("empty market pool prevents payment", async t => {
  const providers = demoProviders();
  let payments = 0;
  providers.markets.listEligible = async () => [];
  providers.payments.confirm = async () => { payments++; return { reference: "should-not-happen" }; };
  const { open } = await setup(t, providers);
  const result = await open();
  assert.equal(result.statusCode, 409); assert.equal(result.json().error.code, "INSUFFICIENT_MARKETS");
  assert.equal(payments, 0);
});

test("invalid consent, missing auth and missing idempotency key are rejected", async t => {
  const { app, headers, quote } = await setup(t);
  assert.equal((await app.inject({ url: routes.portfolio })).statusCode, 401);
  const payload = { quoteId: quote.id, paymentProof: `demo:${quote.id}` };
  assert.equal((await app.inject({ method: "POST", url: routes.openings, headers: { ...headers, "idempotency-key": "valid-key-123" }, payload })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: routes.openings, headers, payload: { ...payload, disclosureVersion: DISCLOSURE_VERSION } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: routes.logout, headers, payload: {} })).statusCode, 204);
  assert.equal((await app.inject({ url: routes.portfolio, headers })).statusCode, 401);
});

test("expired quotes cannot start new openings", async t => {
  const service = new PackService(packs, demoProviders());
  const quote = service.quote("user", "crypto");
  t.mock.method(Date, "now", () => Date.parse(quote.expiresAt) + 1);
  assert.throws(() => service.open("user", quote.id, "valid-key", `demo:${quote.id}`), /expired/);
});

test("draw filters duplicate, inactive and wrong-theme markets; allocation retains remainder", async () => {
  const providers = demoProviders();
  const markets = await providers.markets.listEligible("mixed");
  const cryptoPack = { ...packs[0], budgetCents: 1501 };
  const cards = drawCards([...markets, markets[0], { ...markets[0], id: "closed", active: false }], cryptoPack);
  assert.equal(new Set(cards.map(c => c.marketId)).size, 3);
  assert.ok(cards.every(c => markets.find(m => m.id === c.marketId)?.theme === "crypto"));
  assert.equal(cards.reduce((sum, card) => sum + card.allocationCents, 0), 1501);
});

test("unimplemented external mode fails closed", () => {
  assert.throws(() => buildApp({ mode: "sandbox" }), /Only demo mode/);
});
