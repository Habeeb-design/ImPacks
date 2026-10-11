import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildApp } from "../src/app.js";
import { geminiProviders } from "../src/providers/gemini.js";
import { appOrigin, walletInject, walletHeaders } from "./wallet-helpers.js";
import type { SandboxExecution, Market, ExecutionReport } from "@impacks/contracts";

const key = randomBytes(32).toString("hex");
const headers = { authorization: `Bearer ${key}` };
const markets: Market[] = Array.from({ length: 4 }, (_, i) => ({ id: `fixture-${i}`, question: `Test ${i}`, theme: "crypto", active: true, yesPriceCents: 20, noPriceCents: 20 }));
const dbPath = () => join(mkdtempSync(join(tmpdir(), "impacks-execution-")), "checkout.sqlite");
const path = (id: string) => `/api/internal/checkout/${id}/execution`;
function setup(t: test.TestContext, database = ":memory:", listEligible = async () => markets) {
  const app = buildApp({ checkoutDatabasePath: database, appOrigin, internalFulfillmentKey: key,
    checkoutRecipientAddress: "0x2222222222222222222222222222222222222222", executionMarkets: { listEligible },
    paymentVerifier: { verify: async (_purchase, hash) => ({ transactionHash: hash, blockNumber: "100", blockHash: `0x${"ab".repeat(32)}`, logIndex: 0 }) } });
  t.after(() => app.close());
  const post = (id: string, action: string, payload: unknown) => app.inject({ method: "POST", url: `${path(id)}/${action}`, headers, payload: payload as object });
  const purchase = async (confirmed = true, packType = "premium") => {
    const created = await walletInject(app, { method: "POST", url: "/api/checkout", payload: { packType } });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().purchaseId as string;
    if (confirmed) assert.equal((await walletInject(app, { method: "POST", url: `/api/checkout/${id}/verify`, payload: { transactionHash: `0x${randomBytes(32).toString("hex")}` } })).statusCode, 200);
    return id;
  };
  const claim = async (id: string) => {
    const response = await app.inject({ method: "POST", url: `/api/internal/checkout/${id}/fulfillment/claim`, headers, payload: { requestId: randomUUID() } });
    assert.equal(response.statusCode, 200, response.body);
    const job = response.json();
    return { requestId: job.requestId as string, attempt: job.attempt as number };
  };
  const prepare = async () => {
    const id = await purchase(), lease = await claim(id);
    assert.equal((await post(id, "reserve", lease)).statusCode, 200);
    const response = await post(id, "prepare", lease);
    assert.equal(response.statusCode, 200, response.body);
    return { id, lease, value: response.json<SandboxExecution>() };
  };
  return { app, post, purchase, claim, prepare };
}
function report(value: SandboxExecution, lease: { requestId: string; attempt: number }, extra: Partial<ExecutionReport> = {}): ExecutionReport {
  return { ...lease, clientOrderId: value.orders[0].clientOrderId, revision: 1, state: "open", exchangeOrderId: "fixture-order", filledQuantity: 0, costCents: 0, feeCents: 0, ...extra };
}

test("confirmed wallet-owned tiers reserve server-priced sandbox budgets only", async t => {
  const a = setup(t);
  for (const [tier, budget] of [["starter", 100], ["premium", 300], ["ultimate", 500]] as const) {
    const id = await a.purchase(true, tier), lease = await a.claim(id);
    const response = await a.post(id, "reserve", lease), value = response.json<SandboxExecution>();
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(value.budgetCents, budget); assert.equal(value.reservedCents, budget);
    assert.equal(value.state, "pending"); assert.equal(value.submissionEnabled, false);
    assert.equal(value.identity.chainId, 11155111); assert.equal(value.mode, "sandbox");
    assert.deepEqual((await a.post(id, "reserve", lease)).json(), value);
    assert.equal((await a.post(id, "reserve", { ...lease, budgetCents: 99999 })).statusCode, 400);
  }
});

test("unpaid, expired and unowned purchases cannot reserve execution", async t => {
  const database = dbPath(), a = setup(t, database), id = await a.purchase(false);
  assert.equal((await a.post(id, "reserve", { requestId: randomUUID(), attempt: 1 })).statusCode, 404);
  const confirmed = await a.purchase(), lease = await a.claim(confirmed);
  const db = new DatabaseSync(database); t.after(() => db.close());
  db.prepare("UPDATE checkout_purchases SET owner_wallet=NULL WHERE id=?").run(confirmed);
  assert.equal((await a.post(confirmed, "reserve", lease)).statusCode, 404);
  db.prepare("UPDATE checkout_purchases SET status='expired' WHERE id=?").run(id);
  assert.equal((await a.post(id, "reserve", lease)).statusCode, 404);
});

test("concurrent connections reserve once and preserve a single random selection and unique intents", async t => {
  const database = dbPath(), a = setup(t, database), b = setup(t, database);
  const id = await a.purchase(), lease = await a.claim(id);
  const results = await Promise.all([a.post(id, "reserve", lease), b.post(id, "reserve", lease)]);
  assert.ok(results.every(r => r.statusCode === 200)); assert.deepEqual(results[0].json(), results[1].json());
  const prepared = await Promise.all([a.post(id, "prepare", lease), b.post(id, "prepare", lease)]);
  assert.ok(prepared.every(r => r.statusCode === 200)); assert.deepEqual(prepared[0].json(), prepared[1].json());
  const db = new DatabaseSync(database); t.after(() => db.close());
  assert.equal(db.prepare("SELECT count(*) AS n FROM sandbox_executions").get()!.n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sandbox_order_intents").get()!.n, 3);
  assert.throws(() => db.exec("INSERT INTO sandbox_executions SELECT * FROM sandbox_executions"), /UNIQUE/);
  assert.throws(() => db.exec("INSERT INTO sandbox_order_intents SELECT * FROM sandbox_order_intents"), /UNIQUE/);
});

test("prepared limits include fees; impossible allocations never commit or spend", async t => {
  const a = setup(t), { value } = await a.prepare();
  assert.ok(value.orders.reduce((n, o) => n + o.reservedCents, 0) <= value.budgetCents);
  for (const order of value.orders) {
    assert.ok(order.quantity > 0); assert.ok(order.feeReserveCents > 0);
    assert.equal(order.reservedCents, order.quantity * order.limitPriceCents + order.feeReserveCents);
    assert.equal(order.state, "prepared");
  }
  const expensive = setup(t, ":memory:", async () => markets.map(m => ({ ...m, yesPriceCents: 99, noPriceCents: 99 })));
  const id = await expensive.purchase(true, "starter"), lease = await expensive.claim(id);
  await expensive.post(id, "reserve", lease);
  assert.equal((await expensive.post(id, "prepare", lease)).statusCode, 409);
  assert.deepEqual((await expensive.app.inject({ url: path(id), headers })).json().orders, []);
});

test("accepted orders are not fills; cumulative reports are idempotent and bounded", async t => {
  const a = setup(t), { id, lease, value } = await a.prepare();
  const open = report(value, lease);
  const response = await a.post(id, "report", open);
  assert.equal(response.statusCode, 200); assert.equal(response.json().state, "processing");
  assert.equal(response.json().orders[0].filledQuantity, 0);
  assert.deepEqual((await a.post(id, "report", open)).json(), response.json());
  assert.equal((await a.post(id, "report", { ...open, costCents: 1 })).statusCode, 409);
  const filled = report(value, lease, { revision: 2, state: "filled", filledQuantity: value.orders[0].quantity,
    costCents: value.orders[0].quantity * value.orders[0].limitPriceCents, feeCents: 1 });
  assert.equal((await a.post(id, "report", filled)).json().state, "partial");
  assert.equal((await a.post(id, "report", { ...filled, revision: 3, state: "open" })).statusCode, 409);
});

test("unknown outcomes retain budget and client IDs across restart; no blind resubmission", async t => {
  const database = dbPath(), a = setup(t, database), { id, lease, value } = await a.prepare();
  const unknown = report(value, lease, { state: "unknown", exchangeOrderId: null });
  assert.equal((await a.post(id, "report", unknown)).json().state, "reconciliation-required");
  await a.app.close();
  const b = setup(t, database);
  const recovered = (await b.post(id, "prepare", lease)).json<SandboxExecution>();
  assert.equal(recovered.state, "reconciliation-required"); assert.equal(recovered.reservedCents, value.budgetCents);
  assert.deepEqual(recovered.orders.map(o => o.clientOrderId), value.orders.map(o => o.clientOrderId));
  assert.equal((await b.post(id, "report", report(value, lease, { revision: 2 }))).json().state, "reconciliation-required");
});

test("over-limit actual costs are retained and freeze execution for reconciliation", async t => {
  const a = setup(t), { id, lease, value } = await a.prepare();
  const observed = report(value, lease, { filledQuantity: 1, costCents: 200, feeCents: 20 });
  const response = await a.post(id, "report", observed);
  assert.equal(response.statusCode, 200); assert.equal(response.json().state, "reconciliation-required");
  assert.equal(response.json().orders[0].costCents, 200);
});

test("all execution endpoints reject anonymous, wallet and browser callers", async t => {
  const a = setup(t), { id, lease } = await a.prepare();
  for (const caller of [{}, await walletHeaders(a.app), { ...headers, origin: appOrigin }]) {
    for (const action of ["reserve", "prepare", "report"]) {
      const response = await a.app.inject({ method: "POST", url: `${path(id)}/${action}`, headers: caller, payload: lease });
      assert.ok([401, 403].includes(response.statusCode), response.body);
    }
    assert.ok([401, 403].includes((await a.app.inject({ url: path(id), headers: caller })).statusCode));
  }
});

test("stale leases cannot write; stage-one executions cannot bypass card issuance gate", async t => {
  const a = setup(t), { id, lease } = await a.prepare();
  assert.equal((await a.post(id, "reserve", { ...lease, attempt: lease.attempt + 1 })).statusCode, 409);
  const response = await a.app.inject({ method: "POST", url: `/api/internal/checkout/${id}/fulfillment/complete`, headers, payload: { ...lease, resultId: "pack:fake" } });
  assert.equal(response.statusCode, 409); assert.equal(response.json().error.code, "EXECUTION_ISSUANCE_DISABLED");
});

test("market failures keep reservation recoverable and never substitute fixtures", async t => {
  const a = setup(t, ":memory:", async () => { throw new Error("private upstream information"); });
  const id = await a.purchase(), lease = await a.claim(id);
  await a.post(id, "reserve", lease);
  const response = await a.post(id, "prepare", lease);
  assert.equal(response.statusCode, 503); assert.ok(!response.body.includes("private"));
  assert.equal((await a.app.inject({ url: path(id), headers })).json().state, "pending");
});

test("Gemini legacy proof echo and order submission fail closed without network calls", async () => {
  const provider = geminiProviders();
  await assert.rejects(provider.payments.confirm({ proof: "arbitrary", userId: "frontend", quote: {} as never }), /SQLite/);
  await assert.rejects(provider.orders.buy({ card: {} as never, clientOrderId: randomUUID(), userId: "frontend" }), /disabled/);
});

test("terminal fills and cancellations retain actual costs; final state is server-derived", async t => {
  const a = setup(t);
  for (const finalState of ["completed", "partial", "failed"] as const) {
    const { id, lease, value } = await a.prepare();
    for (const [i, order] of value.orders.entries()) {
      const fill = finalState === "completed" || (finalState === "partial" && i === 0);
      const response = await a.post(id, "report", report(value, lease, { clientOrderId: order.clientOrderId,
        exchangeOrderId: randomUUID(), state: fill ? "filled" : "cancelled",
        filledQuantity: fill ? order.quantity : 0, costCents: fill ? order.quantity * order.limitPriceCents : 0, feeCents: fill ? 1 : 0 }));
      assert.equal(response.statusCode, 200, response.body);
      if (i === value.orders.length - 1) assert.equal(response.json().state, finalState);
    }
  }
});

test("concurrent reports have one durable revision; exchange order cannot credit two intents", async t => {
  const database = dbPath(), a = setup(t, database), b = setup(t, database);
  const { id, lease, value } = await a.prepare(), observation = report(value, lease);
  const replies = await Promise.all([a.post(id, "report", observation), b.post(id, "report", observation)]);
  assert.ok(replies.every(r => r.statusCode === 200)); assert.deepEqual(replies[0].json(), replies[1].json());
  assert.equal((await b.post(id, "report", { ...observation, clientOrderId: value.orders[1].clientOrderId })).statusCode, 409);
  const bad = await a.post(id, "report", { ...observation, status: "completed", budgetCents: 10000 });
  assert.equal(bad.statusCode, 400);
});

test("lease recovery after restart keeps immutable execution budget and selection", async t => {
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const database = dbPath(), a = setup(t, database), { id, lease, value } = await a.prepare();
  await a.app.close(); now += 5 * 60_000;
  const b = setup(t, database), recoveredLease = await b.claim(id);
  assert.equal(recoveredLease.attempt, lease.attempt + 1);
  assert.equal((await b.post(id, "prepare", lease)).statusCode, 409);
  assert.deepEqual((await b.post(id, "prepare", recoveredLease)).json(), value);
});
