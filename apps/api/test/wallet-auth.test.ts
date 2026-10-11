import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { WalletChallenge } from "@impacks/contracts";
import { buildApp } from "../src/app.js";
import { appOrigin, walletAccount, otherAccount, loginWallet, walletHeaders } from "./wallet-helpers.js";

const recipient = "0x2222222222222222222222222222222222222222";
const pathForTest = () => join(mkdtempSync(join(tmpdir(), "impacks-auth-")), "auth.sqlite");
function setup(t: test.TestContext, path = ":memory:", origin = appOrigin) {
  const app = buildApp({ checkoutDatabasePath: path, checkoutRecipientAddress: recipient, appOrigin: origin });
  t.after(() => app.close());
  const challenge = async (walletAddress = walletAccount.address) => {
    const result = await app.inject({ method: "POST", url: "/api/auth/wallet/challenge", headers: { origin }, payload: { walletAddress } });
    assert.equal(result.statusCode, 200, result.body);
    return result.json<WalletChallenge>();
  };
  const verify = (challengeId: string, signature: string) => app.inject({ method: "POST", url: "/api/auth/wallet/verify",
    headers: { origin }, payload: { challengeId, signature } });
  return { app, challenge, verify };
}

test("wallet challenges bind origin, domain, chain, wallet and unique cryptographic nonce", async t => {
  const { challenge, verify, app } = setup(t);
  const a = await challenge(), b = await challenge();
  assert.notEqual(a.nonce, b.nonce);
  assert.notEqual(a.challengeId, b.challengeId);
  assert.match(a.nonce, /^[0-9a-f]{64}$/);
  assert.equal(a.origin, appOrigin);
  assert.equal(a.domain, "localhost:3000");
  assert.equal(a.chainId, 11155111);
  assert.equal(a.walletAddress, walletAccount.address);
  assert.equal(Date.parse(a.expiresAt) - Date.parse(a.issuedAt), 300_000);
  for (const bound of [a.domain, a.origin, a.walletAddress, a.nonce, a.expiresAt, "11155111"]) assert.ok(a.message.includes(bound));
  const response = await verify(a.challengeId, await walletAccount.signMessage({ message: a.message }));
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  const session = response.json();
  assert.match(session.token, /^[0-9a-f]{64}$/);
  assert.equal(session.walletAddress, walletAccount.address);
  const me = await app.inject({ url: "/api/auth/wallet/me", headers: { authorization: `Bearer ${session.token}` } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().walletAddress, walletAccount.address);
  assert.equal(me.json().token, undefined);
});

for (const scenario of ["wrong signer", "changed nonce", "changed domain", "changed chain", "malformed signature", "other challenge"] as const) {
  test(`wallet authentication rejects ${scenario}`, async t => {
    const { challenge, verify } = setup(t);
    const a = await challenge();
    let message = a.message;
    if (scenario === "changed nonce") message = message.replace(a.nonce, "a".repeat(64));
    if (scenario === "changed domain") message = message.replaceAll("localhost:3000", "evil.example");
    if (scenario === "changed chain") message = message.replace("11155111", "1");
    const account = scenario === "wrong signer" ? otherAccount : walletAccount;
    const signature = scenario === "malformed signature" ? `0x${"00".repeat(65)}` : await account.signMessage({ message });
    const id = scenario === "other challenge" ? (await challenge()).challengeId : a.challengeId;
    const response = await verify(id, signature);
    assert.equal(response.statusCode, 401, response.body);
    assert.equal(response.json().error.code, "WALLET_UNAUTHORIZED");
  });
}

test("expired challenge and reused nonce cannot create a session", async t => {
  const { challenge, verify } = setup(t);
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  const a = await challenge();
  const signature = await walletAccount.signMessage({ message: a.message });
  now = Date.parse(a.expiresAt);
  assert.equal((await verify(a.challengeId, signature)).statusCode, 401);
  const b = await challenge();
  const signed = await walletAccount.signMessage({ message: b.message });
  assert.equal((await verify(b.challengeId, signed)).statusCode, 200);
  assert.equal((await verify(b.challengeId, signed)).statusCode, 401);
});

test("concurrent signature verification consumes the challenge once across connections", async t => {
  const path = pathForTest();
  const a = setup(t, path), b = setup(t, path);
  const challenge = await a.challenge();
  const signature = await walletAccount.signMessage({ message: challenge.message });
  const results = await Promise.all([a.verify(challenge.challengeId, signature), b.verify(challenge.challengeId, signature)]);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 401]);
});

test("auth requires configured origin and does not trust forwarded host headers", async t => {
  const { app } = setup(t);
  for (const origin of [undefined, "https://evil.example", "null"]) {
    const response = await app.inject({ method: "POST", url: "/api/auth/wallet/challenge",
      headers: origin ? { origin } : {}, payload: { walletAddress: walletAccount.address } });
    assert.equal(response.statusCode, 403);
  }
  const response = await app.inject({ method: "POST", url: "/api/auth/wallet/challenge",
    headers: { origin: appOrigin, host: "evil.example", "x-forwarded-host": "evil.example" }, payload: { walletAddress: walletAccount.address } });
  assert.equal(response.json().domain, "localhost:3000");
  for (const bad of ["", "https://example.com/path", "https://example.com/", "http://example.com", "https://user:pass@example.com"]) {
    const other = setup(t, ":memory:", bad).app;
    assert.equal((await other.inject({ method: "POST", url: "/api/auth/wallet/challenge", headers: { origin: bad }, payload: { walletAddress: walletAccount.address } })).statusCode, 503);
  }
});

test("wallet sessions expire and logout revokes them persistently", async t => {
  const path = pathForTest();
  const { app } = setup(t, path);
  const session = await loginWallet(app);
  const headers = { authorization: `Bearer ${session.token}`, origin: appOrigin };
  assert.equal((await app.inject({ url: "/api/auth/wallet/me", headers: { ...headers, origin: "https://evil.example" } })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/api/auth/wallet/logout", headers, payload: {} })).statusCode, 204);
  await app.close();
  const reopened = setup(t, path).app;
  assert.equal((await reopened.inject({ url: "/api/auth/wallet/me", headers })).statusCode, 401);
  const fresh = await loginWallet(reopened);
  t.mock.method(Date, "now", () => Date.parse(fresh.expiresAt));
  assert.equal((await reopened.inject({ url: "/api/auth/wallet/me", headers: { authorization: `Bearer ${fresh.token}` } })).statusCode, 401);
});

test("challenge consumption, session ownership and hashed tokens survive restart", async t => {
  const path = pathForTest();
  const { app, challenge, verify } = setup(t, path);
  const pending = await challenge();
  const used = await challenge();
  const signature = await walletAccount.signMessage({ message: used.message });
  const session = (await verify(used.challengeId, signature)).json();
  await app.close();
  const reopened = setup(t, path);
  const headers = { authorization: `Bearer ${session.token}`, origin: appOrigin };
  assert.equal((await reopened.app.inject({ url: "/api/auth/wallet/me", headers })).statusCode, 200);
  assert.equal((await reopened.verify(used.challengeId, signature)).statusCode, 401);
  assert.equal((await reopened.verify(pending.challengeId, await walletAccount.signMessage({ message: pending.message }))).statusCode, 200);
  const db = new DatabaseSync(path); t.after(() => db.close());
  const stored = JSON.stringify(db.prepare("SELECT * FROM wallet_sessions").all());
  assert.ok(!stored.includes(session.token));
});

test("checkout derives buyer identity and hides another wallet's purchases", async t => {
  const { app } = setup(t);
  const headers = await walletHeaders(app);
  const result = await app.inject({ method: "POST", url: "/api/checkout", headers, payload: { packType: "starter" } });
  assert.equal(result.statusCode, 201, result.body);
  const purchase = result.json();
  assert.equal(purchase.buyerAddress, walletAccount.address);
  assert.equal((await app.inject({ method: "POST", url: "/api/checkout", headers,
    payload: { packType: "starter", buyerAddress: otherAccount.address } })).statusCode, 403);
  const otherHeaders = await walletHeaders(app, otherAccount);
  assert.equal((await app.inject({ url: `/api/checkout/${purchase.purchaseId}`, headers: otherHeaders })).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: `/api/checkout/${purchase.purchaseId}/verify`, headers: otherHeaders,
    payload: { transactionHash: `0x${"ab".repeat(32)}` } })).statusCode, 404);
  assert.equal((await app.inject({ url: `/api/checkout/${purchase.purchaseId}`, headers })).statusCode, 200);
});

test("anonymous and demo sessions cannot access wallet checkout operations", async t => {
  const { app } = setup(t);
  const demo = (await app.inject({ method: "POST", url: "/api/auth/demo", payload: { displayName: "Demo" } })).json();
  for (const authorization of [undefined, `Bearer ${demo.token}`]) {
    const headers = { origin: appOrigin, ...(authorization ? { authorization } : {}) };
    assert.equal((await app.inject({ method: "POST", url: "/api/checkout", headers, payload: { packType: "starter" } })).statusCode, 401);
    assert.equal((await app.inject({ url: `/api/checkout/${randomUUID()}`, headers })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: `/api/checkout/${randomUUID()}/verify`, headers,
      payload: { transactionHash: `0x${"ab".repeat(32)}` } })).statusCode, 401);
  }
});

test("version-1 database migration preserves legacy records without granting ownership", async t => {
  const path = pathForTest(), id = randomUUID();
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE checkout_purchases (id TEXT PRIMARY KEY, purchase_json TEXT NOT NULL,
    status TEXT, expires_at TEXT, updated_at TEXT, expired_at TEXT, confirmed_at TEXT,
    transaction_hash TEXT COLLATE NOCASE UNIQUE, block_number TEXT, block_hash TEXT, log_index INTEGER);
    PRAGMA user_version=1;`);
  db.prepare("INSERT INTO checkout_purchases (id, purchase_json, status) VALUES (?, ?, 'pending')")
    .run(id, JSON.stringify({ buyerAddress: walletAccount.address }));
  db.close();
  const { app } = setup(t, path);
  assert.equal((await app.inject({ url: `/api/checkout/${id}`, headers: await walletHeaders(app) })).statusCode, 404);
  const inspected = new DatabaseSync(path); t.after(() => inspected.close());
  assert.equal(inspected.prepare("PRAGMA user_version").get()!.user_version, 5);
  assert.equal(inspected.prepare("SELECT owner_wallet FROM checkout_purchases WHERE id=?").get(id)!.owner_wallet, null);
  assert.equal(inspected.prepare("SELECT count(*) AS n FROM checkout_purchases").get()!.n, 1);
});
