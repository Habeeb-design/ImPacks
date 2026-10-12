import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DISCLOSURE_VERSION, type CheckoutStatus, type SandboxExecution } from "@impacks/contracts";
import { buildApp } from "../src/app.js";
import { demoProviders } from "../src/providers/demo.js";
import { appOrigin, walletHeaders, walletAccount, otherAccount } from "./wallet-helpers.js";

const recipient = "0x2222222222222222222222222222222222222222";
const internalKey = "integration-fixture-internal-key-not-a-secret";
const body = { packType: "category", packId: "crypto", budgetCents: 5000, disclosureVersion: DISCLOSURE_VERSION };
function appAt(database = ":memory:") {
  // Explicit fixtures: these tests exercise orchestration, not a live chain/exchange.
  return buildApp({ checkoutDatabasePath: database, appOrigin, checkoutRecipientAddress: recipient,
    executionMarkets: demoProviders().markets, internalFulfillmentKey: internalKey,
    paymentVerifier: { verify: async (_purchase, hash) => ({ transactionHash: hash, blockNumber: "100", blockHash: `0x${"ab".repeat(32)}`, logIndex: 0 }) } });
}

async function create(app: ReturnType<typeof appAt>, key = randomUUID()) {
  const headers = { ...await walletHeaders(app), "idempotency-key": key };
  const response = await app.inject({ method: "POST", url: "/api/checkout", headers, payload: body });
  assert.equal(response.statusCode, 201, response.body);
  return { headers, key, purchase: response.json<CheckoutStatus["purchase"]>() };
}

test("category checkout preserves UI edition, exact budget, consent and retry identity across restart", async t => {
  const database = join(mkdtempSync(join(tmpdir(), "impacks-ui-")), "checkout.sqlite");
  const app = appAt(database);
  const { headers, key, purchase } = await create(app);
  assert.equal(purchase.amountAtomic, "50000000"); assert.equal(purchase.pack?.theme, "crypto");
  assert.equal(purchase.pack?.budgetCents, 5000); assert.equal(purchase.chainId, 11155111);
  const repeats = await Promise.all(Array.from({ length: 3 }, () => app.inject({ method: "POST", url: "/api/checkout", headers, payload: body })));
  assert.ok(repeats.every(result => result.json().purchaseId === purchase.purchaseId));
  assert.equal((await app.inject({ method: "POST", url: "/api/checkout", headers, payload: { ...body, budgetCents: 2000 } })).statusCode, 409);
  await app.close();
  const reopened = appAt(database); t.after(() => reopened.close());
  const retry = await create(reopened, key);
  assert.equal(retry.purchase.purchaseId, purchase.purchaseId);
  assert.equal((await reopened.inject({ url: "/api/checkout", headers: retry.headers })).json().purchases.length, 1);
});

test("category checkout rejects missing consent, missing retry identity and invented editions without affecting demo opening", async t => {
  const app = appAt(); t.after(() => app.close());
  const headers = await walletHeaders(app);
  assert.equal((await app.inject({ method: "POST", url: "/api/checkout", headers, payload: body })).statusCode, 400);
  for (const invalid of [{ ...body, disclosureVersion: undefined }, { ...body, packId: "not-a-pack" }, { ...body, budgetCents: 2001 }]) {
    assert.equal((await app.inject({ method: "POST", url: "/api/checkout", headers: { ...headers, "idempotency-key": randomUUID() }, payload: invalid })).statusCode, 400);
  }
  assert.equal((await app.inject({ url: "/api/packs" })).json().packs.length, 10);
  assert.equal((await app.inject({ url: "/api/health" })).json().integrations.orders, "simulated");
});

test("wallet-owned checkout status connects receipt, immutable selection and reported results to the reveal shape", async t => {
  const app = appAt(); t.after(() => app.close());
  const { headers, purchase } = await create(app);
  const root = `/api/checkout/${purchase.purchaseId}`;
  assert.equal((await app.inject({ method: "POST", url: `${root}/prepare`, headers, payload: {} })).statusCode, 409);
  const proof = `0x${"42".repeat(32)}`;
  assert.equal((await app.inject({ method: "POST", url: `${root}/verify`, headers, payload: { transactionHash: proof } })).statusCode, 200);
  const prepared = await app.inject({ method: "POST", url: `${root}/prepare`, headers, payload: {} });
  assert.equal(prepared.statusCode, 200, prepared.body);
  const status = prepared.json<CheckoutStatus>();
  assert.equal(status.execution?.preparedCards, 3); assert.equal(status.execution?.filledCards, 0);
  assert.equal(status.opening, null, "Preparation is not execution or issuance");
  assert.equal(status.purchase.paymentEnabled, false);
  assert.equal(JSON.stringify(status).includes("requestId"), false, "No internal lease is exposed");
  const internal = `/api/internal/checkout/${purchase.purchaseId}`;
  const serverHeaders = { authorization: `Bearer ${internalKey}` };
  const job = (await app.inject({ url: `${internal}/fulfillment`, headers: serverHeaders })).json();
  const execution = (await app.inject({ url: `${internal}/execution`, headers: serverHeaders })).json<SandboxExecution>();
  const retry = await app.inject({ method: "POST", url: `${root}/prepare`, headers, payload: {} });
  assert.equal(retry.statusCode, 200);
  const again = (await app.inject({ url: `${internal}/execution`, headers: serverHeaders })).json<SandboxExecution>();
  assert.deepEqual(again.orders, execution.orders);
  for (const [index, order] of execution.orders.entries()) {
    const report = { requestId: job.requestId, attempt: job.attempt, clientOrderId: order.clientOrderId,
      revision: 1, state: "filled", exchangeOrderId: `fixture-fill-${index}`, filledQuantity: order.quantity,
      costCents: order.quantity * order.limitPriceCents, feeCents: 0 };
    assert.equal((await app.inject({ method: "POST", url: `${internal}/execution/report`, headers, payload: report })).statusCode, 403);
    const response = await app.inject({ method: "POST", url: `${internal}/execution/report`, headers: serverHeaders, payload: report });
    assert.equal(response.statusCode, 200, response.body);
  }
  const done = (await app.inject({ url: `${root}/status`, headers })).json<CheckoutStatus>();
  assert.equal(done.execution?.filledCards, 3); assert.equal(done.opening?.mode, "sandbox");
  assert.equal(done.opening?.status, "completed"); assert.equal(done.opening?.payment.reference, proof);
  assert.deepEqual(done.opening?.cards.map(card => card.id), execution.orders.map(order => order.card.id));
  assert.equal((await app.inject({ method: "POST", url: `${internal}/refund/prepare`, headers: serverHeaders, payload: {} })).statusCode, 200);
  const final = (await app.inject({ url: `${root}/status`, headers })).json<CheckoutStatus>();
  assert.equal(final.refund?.broadcastEnabled, false); assert.equal(final.refund?.authorizedAtomic, null);
  assert.equal(JSON.stringify(final).includes("signedTransaction"), false);
  const history = (await app.inject({ url: "/api/checkout", headers })).json<{ purchases: CheckoutStatus[] }>();
  assert.equal(history.purchases[0].opening?.id, done.opening?.id);
});

test("purchase history, status and preparation do not cross wallet identities", async t => {
  const app = appAt(); t.after(() => app.close());
  const { purchase } = await create(app);
  const headers = await walletHeaders(app, otherAccount);
  assert.equal((await app.inject({ url: "/api/checkout", headers })).json().purchases.length, 0);
  for (const action of ["status", "prepare"]) {
    const response = await app.inject({ method: action === "prepare" ? "POST" : "GET", url: `/api/checkout/${purchase.purchaseId}/${action}`, headers, ...(action === "prepare" ? { payload: {} } : {}) });
    assert.equal(response.statusCode, 404);
  }
});

test("embedded demo advertises unavailable checkout and rejects wallet/checkout/internal operations", async t => {
  const app = buildApp({ embeddedDemo: true, checkoutRecipientAddress: recipient, appOrigin }); t.after(() => app.close());
  assert.equal((await app.inject({ url: "/api/checkout-capabilities" })).json().available, false);
  for (const url of ["/api/checkout", "/api/auth/wallet/me", "/api/internal/checkout/test/fulfillment"]) assert.equal((await app.inject({ url })).statusCode, 503);
  assert.equal((await app.inject({ url: "/api/packs" })).statusCode, 200);
});

test("legacy Base purchases and old unbound wallet sessions cannot be used after the network switch", async t => {
  const database = join(mkdtempSync(join(tmpdir(), "impacks-legacy-")), "checkout.sqlite");
  const app = appAt(database); const { purchase, headers } = await create(app);
  await app.close();
  const db = new DatabaseSync(database);
  db.prepare("UPDATE checkout_purchases SET purchase_json=? WHERE id=?").run(JSON.stringify({ ...purchase, chainId: 84532 }), purchase.purchaseId);
  db.prepare("UPDATE wallet_sessions SET chain_id=NULL").run(); db.close();
  const reopened = appAt(database); t.after(() => reopened.close());
  assert.equal((await reopened.inject({ url: "/api/checkout", headers })).statusCode, 401);
  const fresh = await walletHeaders(reopened, walletAccount);
  assert.equal((await reopened.inject({ url: `/api/checkout/${purchase.purchaseId}`, headers: fresh })).statusCode, 409);
  assert.equal((await reopened.inject({ url: "/api/checkout", headers: fresh })).json().purchases.length, 0);
});
