import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildApp } from "../src/app.js";
import { appOrigin, walletHeaders, walletInject } from "./wallet-helpers.js";

const internalKey = randomBytes(32).toString("hex");
const headers = { authorization: `Bearer ${internalKey}` };
const pathForTest = () => join(mkdtempSync(join(tmpdir(), "impacks-fulfill-")), "checkout.sqlite");
const path = (id: string) => `/api/internal/checkout/${id}/fulfillment`;
function setup(t: test.TestContext, databasePath = ":memory:", key = internalKey) {
  const app = buildApp({ checkoutDatabasePath: databasePath, appOrigin, internalFulfillmentKey: key,
    checkoutRecipientAddress: "0x2222222222222222222222222222222222222222",
    // Explicit test-only payment verifier. Receipt checks remain covered by payment-verification.test.ts.
    paymentVerifier: { verify: async (_purchase, hash) => ({ transactionHash: hash,
      blockNumber: "100", blockHash: `0x${"ab".repeat(32)}`, logIndex: 0 }) } });
  t.after(() => app.close());
  const purchase = async (confirmed = true) => {
    const created = await walletInject(app, { method: "POST", url: "/api/checkout", payload: { packType: "premium" } });
    assert.equal(created.statusCode, 201, created.body);
    const value = created.json();
    if (confirmed) {
      const response = await walletInject(app, { method: "POST", url: `/api/checkout/${value.purchaseId}/verify`,
        payload: { transactionHash: `0x${randomBytes(32).toString("hex")}` } });
      assert.equal(response.statusCode, 200, response.body);
    }
    return value.purchaseId as string;
  };
  const claim = (id: string, requestId = randomUUID()) => app.inject({ method: "POST", url: `${path(id)}/claim`, headers, payload: { requestId } });
  const complete = (id: string, job: { requestId: string; attempt: number }, resultId = "pack:result-1") => app.inject({
    method: "POST", url: `${path(id)}/complete`, headers, payload: { requestId: job.requestId, attempt: job.attempt, resultId } });
  return { app, purchase, claim, complete };
}

test("internal credential is required and frontend sessions cannot authorize fulfillment", async t => {
  const { app, purchase } = setup(t);
  const id = await purchase();
  for (const callerHeaders of [{}, await walletHeaders(app), { ...headers, origin: appOrigin }]) {
    for (const action of ["claim", "renew", "complete"]) {
      const response = await app.inject({ method: "POST", url: `${path(id)}/${action}`, headers: callerHeaders,
        payload: { requestId: randomUUID() } });
      assert.ok([401, 403].includes(response.statusCode), response.body);
    }
  }
  const disabled = setup(t, ":memory:", "").app;
  assert.equal((await disabled.inject({ method: "POST", url: `${path(id)}/claim`, headers, payload: { requestId: randomUUID() } })).statusCode, 503);
});

test("only confirmed purchases can be claimed; legacy unowned purchases fail closed", async t => {
  const dbPath = pathForTest();
  const { purchase, claim } = setup(t, dbPath);
  const pending = await purchase(false);
  assert.equal((await claim(pending)).statusCode, 409);
  const confirmed = await purchase();
  const db = new DatabaseSync(dbPath); t.after(() => db.close());
  db.prepare("UPDATE checkout_purchases SET owner_wallet = NULL WHERE id = ?").run(confirmed);
  assert.equal((await claim(confirmed)).statusCode, 409);
  assert.equal((await claim(randomUUID())).statusCode, 404);
});

test("one durable fulfillment ID and immutable result survive duplicate claims and completion", async t => {
  const { app, purchase, claim, complete } = setup(t);
  const id = await purchase(), requestId = randomUUID();
  const first = await claim(id, requestId);
  assert.equal(first.statusCode, 200, first.body);
  const job = first.json();
  assert.equal(job.purchaseId, id);
  assert.equal(job.packType, "premium");
  assert.equal(job.status, "processing");
  assert.equal(job.attempt, 1);
  assert.equal(job.recoveryRequired, false);
  assert.deepEqual((await claim(id, requestId)).json(), job);
  assert.equal((await claim(id)).statusCode, 409);
  const finished = await complete(id, job);
  assert.equal(finished.statusCode, 200);
  assert.equal(finished.json().status, "fulfilled");
  assert.deepEqual((await complete(id, job)).json(), finished.json());
  assert.deepEqual((await claim(id)).json(), finished.json());
  assert.equal((await complete(id, job, "different-pack")).statusCode, 409);
  assert.deepEqual((await app.inject({ url: path(id), headers })).json(), finished.json());
});

test("competing workers across database connections cannot both claim or change fulfillment", async t => {
  const dbPath = pathForTest();
  const a = setup(t, dbPath), b = setup(t, dbPath);
  const id = await a.purchase();
  const results = await Promise.all([a.claim(id), b.claim(id)]);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 409]);
  const job = results.find(result => result.statusCode === 200)!.json();
  const finished = await Promise.all([a.complete(id, job), b.complete(id, job)]);
  assert.ok(finished.every(result => result.statusCode === 200));
  assert.deepEqual(finished[0].json(), finished[1].json());
});

test("unknown issuance outcome recovers after restart using the SAME external idempotency key", async t => {
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const dbPath = pathForTest();
  const a = setup(t, dbPath);
  const id = await a.purchase();
  const original = (await a.claim(id)).json();
  // Simulated issuer ledger represents the documented downstream UNIQUE fulfillmentId requirement.
  const issuerLedger = new Map<string, string>();
  issuerLedger.set(original.fulfillmentId, "pack:already-issued");
  // Crash after external issuance but before acknowledgement. No reset/deletion of the purchase.
  await a.app.close();
  const b = setup(t, dbPath);
  assert.deepEqual((await b.claim(id, original.requestId)).json(), original);
  assert.equal((await b.claim(id)).statusCode, 409);
  now = Date.parse(original.leaseExpiresAt);
  assert.equal((await b.complete(id, original, "pack:already-issued")).statusCode, 409);
  assert.equal((await b.claim(id, original.requestId)).statusCode, 409);
  const recovered = (await b.claim(id)).json();
  assert.equal(recovered.fulfillmentId, original.fulfillmentId);
  assert.equal(recovered.attempt, 2);
  assert.equal(recovered.recoveryRequired, true);
  assert.equal((await b.complete(id, original, "pack:already-issued")).statusCode, 409);
  const result = issuerLedger.get(recovered.fulfillmentId)!;
  const completed = await b.complete(id, recovered, result);
  assert.equal(completed.statusCode, 200);
  assert.equal(issuerLedger.size, 1);
  await b.app.close();
  const c = setup(t, dbPath);
  assert.deepEqual((await c.claim(id)).json(), completed.json());
  assert.deepEqual((await c.complete(id, recovered, result)).json(), completed.json());
});

test("recovery before issuance preserves the authorization ID and fences concurrent stale workers", async t => {
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const { app, purchase, claim, complete } = setup(t);
  const id = await purchase(), original = (await claim(id)).json();
  now = Date.parse(original.leaseExpiresAt);
  const results = await Promise.all([claim(id), claim(id)]);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 409]);
  const recovered = results.find(result => result.statusCode === 200)!.json();
  assert.equal(recovered.fulfillmentId, original.fulfillmentId);
  const staleRenewal = await app.inject({ method: "POST", url: `${path(id)}/renew`, headers,
    payload: { requestId: original.requestId, attempt: original.attempt } });
  assert.equal(staleRenewal.statusCode, 409);
  assert.equal((await complete(id, recovered)).statusCode, 200);
});

test("active worker may renew; expired lease cannot be revived", async t => {
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const { app, purchase, claim } = setup(t);
  const id = await purchase(), job = (await claim(id)).json();
  now += 60_000;
  const renew = () => app.inject({ method: "POST", url: `${path(id)}/renew`, headers,
    payload: { requestId: job.requestId, attempt: job.attempt } });
  const response = await renew();
  assert.equal(response.statusCode, 200);
  assert.ok(Date.parse(response.json().leaseExpiresAt) > Date.parse(job.leaseExpiresAt));
  now = Date.parse(response.json().leaseExpiresAt);
  assert.equal((await renew()).statusCode, 409);
});

test("same issuer result cannot fulfill two purchases", async t => {
  const { purchase, claim, complete } = setup(t);
  const a = await purchase(), b = await purchase();
  const first = (await claim(a)).json(), second = (await claim(b)).json();
  assert.equal((await complete(a, first, "pack:unique")).statusCode, 200);
  assert.equal((await complete(b, second, "pack:unique")).statusCode, 409);
});

test("strict internal contracts reject caller-controlled buyer, payment and fulfillment status", async t => {
  const { app, purchase } = setup(t);
  const id = await purchase();
  for (const extra of [{ status: "fulfilled" }, { buyerAddress: "fake" }, { amount: "0" }, { fulfillmentId: randomUUID() }]) {
    assert.equal((await app.inject({ method: "POST", url: `${path(id)}/claim`, headers,
      payload: { requestId: randomUUID(), ...extra } })).statusCode, 400);
  }
});
