import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Webhook } from "svix";
import { generateKeyPair, SignJWT } from "jose";
import { routes } from "@impacks/contracts";
import { grantSchema } from "../src/grants/schema.js";
import { GrantStore, grantDto } from "../src/grants/store.js";
import { grantTick, type GrantTransfer } from "../src/grants/worker.js";
import { grantConfig, type GrantConfig } from "../src/grants/config.js";
import { createGrantUserLookup, type GrantIdentity } from "../src/grants/privy-user.js";
import { buildApp } from "../src/app.js";

const recipient = `0x${"12".repeat(20)}` as const;
const config: GrantConfig = { databaseUrl: "unused", appId: "test-app", startsAt: new Date("2026-01-01T00:00:00Z"),
  treasury: `0x${"34".repeat(20)}`, dailyLimit: 100, rpcUrl: "unused" };
const identity: GrantIdentity = { createdAt: new Date("2026-02-01T00:00:00Z"), recipient, verifiedEmail: true, guest: false };
const now = new Date("2026-03-01T00:00:00Z");
const secret = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
const uid = "did:privy:new-user";

function storeFor(db: PGlite) {
  return new GrantStore({ async query(text, values) { return { rows: (await db.query(text, values)).rows }; } });
}
async function database(t: test.TestContext) {
  const db = new PGlite();
  await db.exec(grantSchema);
  const store = storeFor(db);
  await store.bind(config);
  t.after(() => db.close());
  return { db, store };
}
function chainStub() {
  let preparations = 0;
  let state: Awaited<ReturnType<GrantTransfer["inspect"]>> = "missing";
  const broadcasts: string[] = [];
  const chain: GrantTransfer = {
    async prepare() { preparations++; return { raw: "0xdeadbeef", hash: `0x${"ab".repeat(32)}`, nonce: 4 }; },
    async inspect() { return state; },
    async nonceConsumed() { return false; },
    async broadcast(raw) { broadcasts.push(raw); },
  };
  return { chain, broadcasts, preparations: () => preparations, state: (value: typeof state) => { state = value; } };
}

test("welcome grants survive database reopen and duplicate signup events without a second transfer", async t => {
  const dir = await mkdtemp(join(tmpdir(), "impacks-grants-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let db = new PGlite(dir);
  await db.exec(grantSchema);
  let store = storeFor(db);
  await store.bind(config);
  await Promise.all(Array.from({ length: 8 }, () => store.enqueue(uid)));
  const fake = chainStub();
  // Simulate broadcast reaching the chain but its HTTP response being lost.
  fake.chain.broadcast = async raw => { fake.broadcasts.push(raw); throw new Error("connection lost"); };
  await grantTick(store, async () => identity, fake.chain, config, now);
  assert.equal((await store.get(uid))?.status, "prepared");
  await db.close();
  db = new PGlite(dir); store = storeFor(db);
  t.after(() => db.close());
  await store.bind(config);
  await store.enqueue(uid);
  await grantTick(store, async () => { throw new Error("must not reselect recipient"); }, fake.chain, config, now);
  assert.equal(fake.preparations(), 1);
  assert.deepEqual(fake.broadcasts, ["0xdeadbeef", "0xdeadbeef"]);
  fake.state("confirmed");
  await grantTick(store, async () => identity, fake.chain, config, now);
  await store.enqueue(uid);
  await grantTick(store, async () => identity, fake.chain, config, now);
  assert.equal(fake.preparations(), 1);
  assert.equal(grantDto(await store.get(uid)).status, "confirmed");
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM welcome_grants")).rows[0]?.n, 1);
  const dto = JSON.stringify(grantDto(await store.get(uid)));
  assert.ok(!dto.includes("deadbeef") && !dto.includes("nonce") && !dto.includes("last_error"));
});

test("a failed persistence commit never broadcasts a signed transaction", async t => {
  const { store } = await database(t);
  await store.enqueue(uid);
  const fake = chainStub();
  t.mock.method(store, "prepared", async () => { throw new Error("database disconnected"); });
  await assert.rejects(grantTick(store, async () => identity, fake.chain, config, now), /disconnected/);
  assert.equal(fake.broadcasts.length, 0);
});

test("old, guest and deleted users are ineligible; unverified email or absent wallet waits", async t => {
  const { store } = await database(t);
  const fake = chainStub();
  const cases: [GrantIdentity | null, string][] = [
    [{ ...identity, createdAt: new Date("2025-01-01") }, "ineligible"],
    [{ ...identity, guest: true }, "ineligible"], [null, "ineligible"],
    [{ ...identity, recipient: null }, "queued"], [{ ...identity, verifiedEmail: false }, "queued"],
  ];
  for (let i = 0; i < cases.length; i++) {
    const userId = `${uid}-${i}`;
    await store.enqueue(userId);
    await grantTick(store, async () => cases[i][0], fake.chain, config, now);
    assert.equal((await store.get(userId))?.status, cases[i][1]);
  }
  assert.equal(fake.preparations(), 0);
});

test("a wallet receives at most one grant even if another Privy user is linked to it", async t => {
  const { store } = await database(t);
  const fake = chainStub();
  await store.enqueue(uid);
  await grantTick(store, async () => identity, fake.chain, config, now);
  fake.state("confirmed"); await grantTick(store, async () => identity, fake.chain, config, now);
  await store.enqueue(`${uid}-other`);
  await grantTick(store, async () => identity, fake.chain, config, now);
  assert.equal((await store.get(`${uid}-other`))?.status, "ineligible");
  assert.equal(fake.preparations(), 1);
});

test("daily cap reserves signed grants and low funding keeps the user queued", async t => {
  const { store } = await database(t);
  const fake = chainStub();
  await store.enqueue(uid);
  await grantTick(store, async () => identity, fake.chain, config, now);
  fake.state("confirmed"); await grantTick(store, async () => identity, fake.chain, config, now);
  const other = `${uid}-next`;
  await store.enqueue(other);
  await grantTick(store, async () => ({ ...identity, recipient: `0x${"56".repeat(20)}` }), fake.chain, { ...config, dailyLimit: 1 }, now);
  assert.equal((await store.get(other))?.last_error, "DAILY_LIMIT");
  assert.equal(fake.preparations(), 1);
  await store.defer(other, "", -1);
  fake.chain.prepare = async () => { throw new Error("insufficient AUSD"); };
  await grantTick(store, async () => ({ ...identity, recipient: `0x${"56".repeat(20)}` }), fake.chain, config, now);
  assert.equal((await store.get(other))?.status, "queued");
  assert.equal((await store.get(other))?.last_error, "FUNDING_OR_RPC_UNAVAILABLE");
});

test("consumed nonce without receipt halts the queue instead of paying another nonce", async t => {
  const { store } = await database(t);
  const fake = chainStub();
  await store.enqueue(uid);
  await grantTick(store, async () => identity, fake.chain, config, now);
  fake.chain.nonceConsumed = async () => true;
  await grantTick(store, async () => identity, fake.chain, config, now);
  await store.enqueue(`${uid}-next`);
  await grantTick(store, async () => identity, fake.chain, config, now);
  assert.equal((await store.get(uid))?.status, "needs_review");
  assert.equal(fake.preparations(), 1);
});

test("pending, reverted and mismatched transfers never become successful grants", async t => {
  const { store } = await database(t);
  const fake = chainStub();
  await store.enqueue(uid);
  await grantTick(store, async () => identity, fake.chain, config, now);
  fake.state("pending"); await grantTick(store, async () => identity, fake.chain, config, now);
  assert.equal((await store.get(uid))?.status, "prepared");
  fake.state("failed"); await grantTick(store, async () => identity, fake.chain, config, now);
  assert.equal((await store.get(uid))?.status, "failed");
  await store.enqueue(uid);
  assert.equal((await store.get(uid))?.status, "failed");
  assert.equal(fake.preparations(), 1);
});

test("Privy lookup uses server data, rejects identity mismatch and excludes external wallets", async () => {
  let data: Record<string, unknown> = { id: uid, created_at: 1769904000, is_guest: false,
    linked_accounts: [{ type: "email", verified_at: 1769904000 },
      { type: "wallet", wallet_client_type: "privy", chain_type: "ethereum", address: recipient }] };
  const request: typeof fetch = async (url, init) => {
    assert.equal(String(url), `https://api.privy.io/v1/users/${encodeURIComponent(uid)}`);
    assert.equal(new Headers(init?.headers).get("privy-app-id"), config.appId);
    return Response.json(data);
  };
  const lookup = createGrantUserLookup(config.appId, "test-secret", request);
  assert.equal((await lookup(uid))?.recipient, recipient);
  data = { ...data, linked_accounts: [{ type: "wallet", wallet_client_type: "metamask", chain_type: "ethereum", address: recipient }] };
  assert.equal((await lookup(uid))?.recipient, null);
  data = { ...data, id: "did:privy:attacker" };
  await assert.rejects(lookup(uid), /identity mismatch/);
});

test("grant routes authenticate the user; forged, changed and expired webhooks cannot enqueue grants", async t => {
  const { db, store } = await database(t);
  const keys = await generateKeyPair("ES256");
  const app = buildApp({ privyAppId: config.appId, privyKey: async () => keys.publicKey, grants: { store, webhookSecret: secret } });
  t.after(() => app.close());
  const token = await new SignJWT({}).setProtectedHeader({ alg: "ES256" }).setSubject(uid)
    .setAudience(config.appId).setIssuer("privy.io").setIssuedAt().setExpirationTime("1h").sign(keys.privateKey);
  const headers = { authorization: `Bearer ${token}` };
  assert.equal((await app.inject({ method: "POST", url: routes.welcomeGrant, payload: {} })).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url: routes.welcomeGrant, headers, payload: { recipient, amount: "999" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: routes.welcomeGrant, headers, payload: {} })).statusCode, 200);
  const demo = (await app.inject({ method: "POST", url: routes.login, payload: { displayName: "Guest" } })).json();
  assert.equal((await app.inject({ url: routes.welcomeGrant, headers: { authorization: `Bearer ${demo.token}` } })).statusCode, 401);
  const payload = JSON.stringify({ type: "user.wallet_created", user: { id: uid }, amount: "999", recipient: "attacker" });
  const date = new Date();
  const webhookHeaders = { "content-type": "application/json", "svix-id": "event-1", "svix-timestamp": String(Math.floor(date.getTime() / 1000)), "svix-signature": new Webhook(secret).sign("event-1", date, payload) };
  const send = (body: string, h = webhookHeaders) => app.inject({ method: "POST", url: routes.privyWebhook, headers: h, payload: body });
  const validWebhook = await send(payload);
  assert.equal(validWebhook.statusCode, 204, validWebhook.body);
  assert.equal((await send(payload)).statusCode, 204);
  assert.equal((await send(payload + " ")).statusCode, 401);
  assert.equal((await send(payload, { ...webhookHeaders, "svix-signature": "v1,forged" })).statusCode, 401);
  const old = new Date(Date.now() - 600000);
  assert.equal((await send(payload, { ...webhookHeaders, "svix-timestamp": String(Math.floor(old.getTime() / 1000)), "svix-signature": new Webhook(secret).sign("event-1", old, payload) })).statusCode, 401);
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM welcome_grants")).rows[0]?.n, 1);
  assert.equal((await store.get(uid))?.recipient, null);
});

test("database binding and configuration prevent changing app/treasury/chain or using the embedded host", async t => {
  const { db, store } = await database(t);
  await assert.rejects(store.bind({ ...config, appId: "other" }), /different app/);
  await assert.rejects(store.bind({ ...config, treasury: recipient }), /different app/);
  assert.equal(grantConfig({}), null);
  assert.throws(() => grantConfig({ WELCOME_GRANTS_ENABLED: "1", VERCEL: "1" }), /standalone/);
  assert.throws(() => grantConfig({ WELCOME_GRANTS_ENABLED: "1" }), /required/);
  assert.equal(grantDto(null, false).status, "disabled");
  assert.equal(grantDto(null, false).chainId, 11155111);
  await db.query("UPDATE welcome_grant_settings SET chain_id=84532");
  await assert.rejects(store.bind(config), /chain binding/);
});

test("migration does not relabel a legacy grant database as Ethereum Sepolia", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE TABLE welcome_grant_settings (
    id integer PRIMARY KEY, app_id text NOT NULL, treasury text NOT NULL, starts_at timestamptz NOT NULL
  )`);
  await db.query("INSERT INTO welcome_grant_settings VALUES (1,$1,$2,$3)", [config.appId, config.treasury, config.startsAt]);
  await db.exec(grantSchema);
  assert.equal((await db.query("SELECT chain_id FROM welcome_grant_settings")).rows[0]?.chain_id, null);
  await assert.rejects(storeFor(db).bind(config), /unknown chain binding/);
});
