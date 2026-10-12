import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
import { buildApp } from "../src/app.js";
import { CheckoutStore } from "../src/storage/checkout.js";
import { PipelineStore } from "../src/pipeline/store.js";
import { walletHeaders, otherAccount, appOrigin } from "./wallet-helpers.js";

test("purchase APIs require both wallet proof and Privy identity, isolate owners and fence worker-managed reports", async t => {
  const dir = mkdtempSync(join(tmpdir(), "pipeline-api-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "db.sqlite"), policy = { accountKey: "fixture", capacityCents: 100000, feeReserveBps: 1000 };
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  let liveMarkets = true;
  const app = buildApp({ checkoutDatabasePath: path, pipelinePolicy: policy, pipelineMarkets: { listEligible: async () => liveMarkets ? Array.from({ length: 3 }, (_, i) => ({ id: `live-fixture-${i}`, question: "Fixture?", theme: "crypto" as const, active: true, yesPriceCents: 40, noPriceCents: 60 })) : [] }, privyAppId: "fixture", privyKey: async () => publicKey,
    appOrigin, checkoutRecipientAddress: `0x${"33".repeat(20)}`, internalFulfillmentKey: "fixture-internal-key-at-least-32-characters" });
  t.after(() => app.close()); const db = new CheckoutStore(path); t.after(() => db.close());
  const ledger = new PipelineStore(db, policy); ledger.heartbeat(true, "fixture");
  const auth = await walletHeaders(app), foreign = await walletHeaders(app, otherAccount);
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: "ES256" }).setIssuer("privy.io").setAudience("fixture").setSubject("did:privy:buyer").setIssuedAt().setExpirationTime("1h").sign(privateKey);
  const headers = { ...auth, "x-privy-token": jwt };
  const created = await app.inject({ method: "POST", url: "/api/checkout", headers: { ...auth, "idempotency-key": randomUUID() }, payload: { packType: "category", packId: "crypto", budgetCents: 2000, disclosureVersion: "random-v1" } });
  assert.equal(created.statusCode, 201); const id = created.json().purchaseId, base = `/api/checkout/${id}`;
  assert.equal((await app.inject({ method: "POST", url: `${base}/start`, headers: auth, payload: {} })).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url: `${base}/start`, headers, payload: {} })).statusCode, 200);
  liveMarkets = false;
  const unavailable = await app.inject({ method: "POST", url: `${base}/payment-intent`, headers, payload: {} });
  assert.equal(unavailable.statusCode, 409);
  assert.equal(unavailable.json().error.code, "EDITION_UNAVAILABLE");
  assert.equal(ledger.row(id)?.payment_attempt, null, "Stale readiness must never issue payment permission");
  liveMarkets = true;
  const intent = await app.inject({ method: "POST", url: `${base}/payment-intent`, headers, payload: {} }); assert.equal(intent.statusCode, 200);
  assert.equal(intent.json().purchase.paymentEnabled, true);
  assert.equal((await app.inject({ method: "POST", url: `${base}/payment-intent`, headers, payload: {} })).statusCode, 409);
  assert.equal((await app.inject({ url: `${base}/status`, headers: foreign })).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: `${base}/payment`, headers: foreign, payload: { transactionHash: `0x${"aa".repeat(32)}` } })).statusCode, 404);
  const attached = await app.inject({ method: "POST", url: `${base}/payment`, headers: auth, payload: { transactionHash: `0x${"aa".repeat(32)}` } });
  assert.equal(attached.statusCode, 200); assert.equal(attached.json().pipeline.paymentHash, `0x${"aa".repeat(32)}`);
  const status = (await app.inject({ url: `${base}/status`, headers: auth })).json();
  assert.equal(status.purchase.status, "pending"); assert.equal(status.opening, null);
  assert.equal(JSON.stringify(status).includes("lease_token"), false);
  for (const path of ["execution/report", "execution/prepare", "execution/reserve", "fulfillment/claim", "fulfillment/complete", "refund/authorize"]) {
    const blocked = await app.inject({ method: "POST", url: `/api/internal/checkout/${id}/${path}`, headers: { authorization: "Bearer fixture-internal-key-at-least-32-characters" }, payload: {} });
    assert.equal(blocked.statusCode, 409); assert.equal(blocked.json().error.code, "WORKER_MANAGED");
  }
  ledger.heartbeat(false, "offline"); assert.equal((await app.inject({ url: "/api/checkout-capabilities" })).json().paymentEnabled, false);
});
