import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, encodeEventTopics, erc20Abi, type Hash, type Hex } from "viem";
import { AUSD_BASE_SEPOLIA, type AusdRefund, type SandboxExecution } from "@impacks/contracts";
import { CheckoutStore } from "../src/storage/checkout.js";
import { CheckoutService } from "../src/services/checkout.js";
import { FulfillmentService } from "../src/services/fulfillment.js";
import { ExecutionService } from "../src/services/execution.js";
import { RefundService, refundAccounting, executionDigest, type SettlementAuthority } from "../src/services/refunds.js";
import { AusdRefundVerifier } from "../src/providers/ausd/refund.js";
import type { VerificationClient } from "../src/providers/ausd/verify.js";
import { HttpError } from "../src/errors.js";
import { buildApp } from "../src/app.js";
import { appOrigin, walletHeaders } from "./wallet-helpers.js";
import { ausdReadiness } from "../src/providers/ausd/readiness.js";

const buyer = "0x1111111111111111111111111111111111111111";
// Ephemeral fixture signer only. Never stored or connected to any RPC/wallet transport.
const treasury = privateKeyToAccount(generatePrivateKey());
const databasePath = () => join(mkdtempSync(join(tmpdir(), "impacks-refund-")), "checkout.sqlite");
function fixture(t: test.TestContext, path = ":memory:") {
  const store = new CheckoutStore(path); let closed = false;
  const close = () => { if (!closed) { store.close(); closed = true; } }; t.after(close);
  const markets = { listEligible: async () => Array.from({ length: 3 }, (_, i) => ({ id: `fixture-${i}`, question: "Fixture", theme: "crypto" as const, active: true, yesPriceCents: 20, noPriceCents: 20 })) };
  const execution = new ExecutionService(store, markets);
  const state = { final: false, fees: true, digest: true, payment: true, network: "success" };
  const authority: SettlementAuthority = { readFinal: value => state.final ? { reference: "fixture:settlement",
    executionDigest: state.digest ? executionDigest(value) : "wrong", feesReconciled: state.fees as true,
    ordersFinalized: true, noFurtherOrders: true, paymentRevalidated: state.payment as true } : null };
  const verifier = { verify: async (value: AusdRefund) => {
    if (state.network === "timeout") throw new Error("https://rpc.invalid/PRIVATE");
    if (state.network === "missing") throw new HttpError(503, "NOT_FOUND", "Unknown");
    if (state.network === "pending") throw new HttpError(425, "REFUND_MINED_PENDING", "Pending");
    if (state.network === "reverted") throw new HttpError(422, "REFUND_REVERTED", "Reverted");
    return { transactionHash: value.transactionHash!, blockNumber: "100", blockHash: `0x${"ab".repeat(32)}`, logIndex: 0 };
  } };
  const refunds = new RefundService(store, treasury.address, verifier, authority);
  const create = async () => {
    const checkout = new CheckoutService(treasury.address, store, { verify: async () => { throw new Error("Use explicit fixture evidence"); } });
    const purchase = checkout.create({ packType: "premium" }, buyer);
    store.confirm(purchase.purchaseId, { transactionHash: `0x${randomBytes(32).toString("hex")}`, blockNumber: "1", blockHash: `0x${"cd".repeat(32)}`, logIndex: 0 });
    const job = new FulfillmentService(store).claim(purchase.purchaseId, randomUUID());
    const lease = { requestId: job.requestId, attempt: job.attempt };
    execution.reserve(purchase.purchaseId, lease);
    const prepared = await execution.prepare(purchase.purchaseId, lease);
    return { id: purchase.purchaseId, lease, prepared };
  };
  const finish = (id: string, lease: { requestId: string; attempt: number }, value: SandboxExecution, partial = false) => {
    for (const [i, order] of value.orders.entries()) execution.report(id, { ...lease, clientOrderId: order.clientOrderId,
      revision: 1, state: partial && i > 0 ? "cancelled" : "filled", exchangeOrderId: randomUUID(),
      filledQuantity: partial && i > 0 ? 0 : order.quantity,
      costCents: partial && i > 0 ? 0 : order.quantity * order.limitPriceCents, feeCents: partial && i > 0 ? 0 : 1 });
  };
  const sign = async (id: string, nonce = 1, overrides: Record<string, unknown> = {}) => {
    const intent = refunds.transferIntent(id);
    return treasury.signTransaction({ chainId: intent.chainId, to: intent.to, data: intent.data, value: 0n,
      gas: 100000n, maxFeePerGas: 100n, maxPriorityFeePerGas: 1n, nonce, type: "eip1559", ...overrides });
  };
  return { close, store, state, authority, verifier, execution, refunds, create, finish, sign };
}

test("refund integer accounting subtracts actual costs and fees; zero and overspend never transfer", async t => {
  const f = fixture(t), { prepared } = await f.create();
  for (const order of prepared.orders) { order.state = "filled"; order.costCents = 80; order.feeCents = 1; }
  prepared.state = "completed";
  assert.deepEqual(refundAccounting("3000000", prepared), { spentCents: 243, candidateAtomic: "570000", blockers: [] });
  for (const order of prepared.orders) { order.costCents = 100; order.feeCents = 0; }
  assert.equal(refundAccounting("3000000", prepared).candidateAtomic, "0");
  prepared.orders[0].feeCents = 1;
  assert.ok(refundAccounting("3000000", prepared).blockers.includes("SPENDING_EXCEEDS_DEPOSIT"));
  prepared.orders[0].feeCents = 0.1;
  assert.throws(() => refundAccounting("3000000", prepared), /Invalid execution currency/);
});

test("prepared/open/unknown orders reserve all funds and block refund authorization", async t => {
  for (const status of ["prepared", "open", "unknown"] as const) {
    const f = fixture(t), { id, lease, prepared } = await f.create(); f.state.final = true;
    if (status !== "prepared") f.execution.report(id, { ...lease, clientOrderId: prepared.orders[0].clientOrderId, revision: 1,
      state: status, exchangeOrderId: status === "open" ? "fixture" : null, filledQuantity: 0, costCents: 0, feeCents: 0 });
    const value = f.refunds.prepare(id);
    assert.ok(value.blockers.includes("OUTSTANDING_ORDERS")); assert.equal(value.authorizedAtomic, null);
    assert.throws(() => f.refunds.authorize(id), /OUTSTANDING_ORDERS/);
  }
});

test("terminal execution alone is insufficient; verified final fees, snapshot and payment revalidation required", async t => {
  const f = fixture(t), { id, lease, prepared } = await f.create(); f.finish(id, lease, prepared);
  f.refunds.prepare(id);
  assert.throws(() => f.refunds.authorize(id), /AUTHORITATIVE_SETTLEMENT_REQUIRED/);
  f.state.final = true;
  for (const field of ["fees", "digest", "payment"] as const) {
    f.state[field] = false;
    assert.throws(() => f.refunds.authorize(id), /AUTHORITATIVE_SETTLEMENT_REQUIRED/);
    f.state[field] = true;
  }
  const liveDefault = new RefundService(f.store, treasury.address, f.verifier);
  assert.throws(() => liveDefault.authorize(id), /AUTHORITATIVE_SETTLEMENT_REQUIRED/);
});

test("finalized partial fills refund only the reconciled unused amount and freeze accounting", async t => {
  const f = fixture(t), { id, lease, prepared } = await f.create();
  f.finish(id, lease, prepared, true); f.state.final = true;
  const pending = f.refunds.prepare(id), authorized = f.refunds.authorize(id);
  assert.equal(authorized.refundId, pending.refundId); assert.equal(authorized.state, "authorized");
  assert.equal(authorized.authorizedAtomic, "2190000"); assert.equal(authorized.broadcastEnabled, false);
  assert.equal(f.refunds.transferIntent(id).to, AUSD_BASE_SEPOLIA.tokenAddress);
  assert.throws(() => f.execution.report(id, { ...lease, clientOrderId: prepared.orders[0].clientOrderId, revision: 2,
    state: "filled", exchangeOrderId: "changed", filledQuantity: 4, costCents: 80, feeCents: 2 }), /sealed/);
  assert.throws(() => f.refunds.broadcast(), /disabled/);
});

test("refund preparation/authorization races persist one record across connections and restart", async t => {
  const path = databasePath(), f = fixture(t, path), { id, lease, prepared } = await f.create();
  f.finish(id, lease, prepared); f.state.final = true;
  const b = fixture(t, path); b.state.final = true;
  const values = await Promise.all([Promise.resolve().then(() => f.refunds.prepare(id)), Promise.resolve().then(() => b.refunds.prepare(id))]);
  assert.equal(values[0].refundId, values[1].refundId);
  const authorized = await Promise.all([Promise.resolve().then(() => f.refunds.authorize(id)), Promise.resolve().then(() => b.refunds.authorize(id))]);
  assert.deepEqual(authorized[0], authorized[1]);
  const c = fixture(t, path);
  assert.deepEqual(c.refunds.get(id), authorized[0]);
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM ausd_refunds").get()!.n, 1);
});

test("signed identity is durable before network I/O and rejects recipient/chain/value changes", async t => {
  const f = fixture(t), { id, lease, prepared } = await f.create(); f.finish(id, lease, prepared); f.state.final = true;
  f.refunds.prepare(id); f.refunds.authorize(id);
  for (const bad of [{ chainId: 1 }, { value: 1n }, { to: buyer }, { data: "0x" as Hex }]) {
    await assert.rejects(f.refunds.stageSigned(id, await f.sign(id, 1, bad)), /does not match/);
  }
  const signed = await f.sign(id), staged = await f.refunds.stageSigned(id, signed);
  assert.equal(staged.state, "submitting"); assert.ok(staged.transactionHash);
  assert.deepEqual(await f.refunds.stageSigned(id, signed), staged);
  const row = f.store.db.prepare("SELECT transaction_hash, nonce, signed_transaction FROM ausd_refunds WHERE purchase_id=?").get(id)!;
  assert.equal(row.transaction_hash, staged.transactionHash); assert.equal(row.nonce, 1); assert.equal(row.signed_transaction, signed);
  await assert.rejects(f.refunds.stageSigned(id, await treasury.signTransaction({ chainId: 84532, to: AUSD_BASE_SEPOLIA.tokenAddress,
    data: "0x", nonce: 2, gas: 100000n, maxFeePerGas: 100n, maxPriorityFeePerGas: 1n, type: "eip1559" })), /authorized first/);
});

test("treasury nonce cannot stage another refund", async t => {
  const f = fixture(t);
  for (let i = 0; i < 2; i++) {
    const { id, lease, prepared } = await f.create(); f.finish(id, lease, prepared); f.state.final = true;
    f.refunds.prepare(id); f.refunds.authorize(id);
    const signed = await f.sign(id, 7);
    if (i === 0) await f.refunds.stageSigned(id, signed);
    else await assert.rejects(f.refunds.stageSigned(id, signed), /nonce already reserved/);
  }
});

test("unknown refund outcomes retain identity across actual database close/reopen; success is idempotent", async t => {
  const path = databasePath(), f = fixture(t, path), { id, lease, prepared } = await f.create();
  f.finish(id, lease, prepared); f.state.final = true; f.refunds.prepare(id); f.refunds.authorize(id);
  const staged = await f.refunds.stageSigned(id, await f.sign(id));
  for (const outcome of ["timeout", "missing"]) {
    f.state.network = outcome;
    const value = await f.refunds.reconcile(id);
    assert.equal(value.state, "reconciliation-required"); assert.equal(value.transactionHash, staged.transactionHash);
    assert.ok(!JSON.stringify(value).includes("PRIVATE"));
  }
  // Close/reopen this connection explicitly; cleanup registered above tolerates a closed handle.
  f.close();
  const recovered = fixture(t, path);
  assert.equal(recovered.refunds.get(id).transactionHash, staged.transactionHash);
  recovered.state.network = "pending"; assert.equal((await recovered.refunds.reconcile(id)).state, "submitted");
  recovered.state.network = "success";
  const results = await Promise.all([recovered.refunds.reconcile(id), recovered.refunds.reconcile(id)]);
  assert.equal(results[0].state, "confirmed"); assert.deepEqual(results[0], results[1]);
  recovered.state.network = "timeout"; assert.deepEqual(await recovered.refunds.reconcile(id), results[0]);
});

test("canonical reverted refund is failed, never automatically restaged", async t => {
  const f = fixture(t), { id, lease, prepared } = await f.create(); f.finish(id, lease, prepared); f.state.final = true;
  f.refunds.prepare(id); f.refunds.authorize(id); await f.refunds.stageSigned(id, await f.sign(id));
  f.state.network = "reverted";
  assert.equal((await f.refunds.reconcile(id)).state, "failed");
  assert.throws(() => f.refunds.transferIntent(id), /authorized first/);
});

test("internal refund routes reject anonymous/wallet/origin callers and client currency overrides", async t => {
  const key = randomBytes(32).toString("hex");
  const app = buildApp({ checkoutDatabasePath: ":memory:", appOrigin, internalFulfillmentKey: key }); t.after(() => app.close());
  const path = `/api/internal/checkout/${randomUUID()}/refund`;
  for (const headers of [{}, await walletHeaders(app), { authorization: `Bearer ${key}`, origin: appOrigin }]) {
    assert.ok([401, 403].includes((await app.inject({ url: path, headers })).statusCode));
    for (const action of ["prepare", "authorize", "reconcile"]) assert.ok([401, 403].includes((await app.inject({ method: "POST", url: `${path}/${action}`, headers, payload: {} })).statusCode));
  }
  assert.equal((await app.inject({ method: "POST", url: `${path}/prepare`, headers: { authorization: `Bearer ${key}` }, payload: { amount: "1", status: "authorized" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: `${path}/broadcast`, headers: { authorization: `Bearer ${key}` }, payload: {} })).statusCode, 404);
});

test("readiness fails closed without credentials and does not print secrets", async () => {
  const result = await ausdReadiness({ AUSD_DATABASE_PATH: ":memory:", INTERNAL_FULFILLMENT_KEY: "sensitive", AUSD_MIN_CONFIRMATIONS: "1" });
  assert.equal(result.paymentEnabled, false); assert.equal(result.refundBroadcastEnabled, false);
  assert.ok(result.blockers.includes("MISSING_AUSD_RECIPIENT_ADDRESS")); assert.ok(result.blockers.includes("INVALID_CONFIRMATION_DEPTH"));
  assert.ok(!JSON.stringify(result).includes("sensitive"));
});

for (const scenario of ["success", "wrong amount", "wrong sender", "wrong recipient", "wrong token", "pending", "reverted", "reorg", "timeout"] as const) {
  test(`refund receipt verification: ${scenario}`, async () => {
    const hash = `0x${"ab".repeat(32)}` as Hash, blockHash = `0x${"cd".repeat(32)}` as Hash;
    const log = { address: scenario === "wrong token" ? buyer : AUSD_BASE_SEPOLIA.tokenAddress, removed: false,
      transactionHash: hash, blockHash, blockNumber: 100n, logIndex: 0,
      topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: {
        from: scenario === "wrong sender" ? buyer : treasury.address, to: scenario === "wrong recipient" ? treasury.address : buyer } }),
      data: encodeAbiParameters([{ type: "uint256" }], [scenario === "wrong amount" ? 1n : 570000n]) };
    const client = { getChainId: async () => 84532,
      getTransactionReceipt: async () => { if (scenario === "timeout") throw new Error("private RPC"); return { transactionHash: hash, blockNumber: 100n, blockHash, status: scenario === "reverted" ? "reverted" : "success", logs: [log] }; },
      getBlockNumber: async () => scenario === "pending" ? 110n : 111n,
      getBlock: async () => ({ hash: scenario === "reorg" ? hash : blockHash, timestamp: 1800000001n }), readContract: async () => 6 } as unknown as VerificationClient;
    const refund = { transactionHash: hash, authorizedAtomic: "570000", treasuryAddress: treasury.address,
      recipientAddress: buyer, purchaseId: randomUUID(), createdAt: "2027-01-15T08:00:00.000Z" } as AusdRefund;
    const verify = new AusdRefundVerifier(client).verify(refund);
    if (scenario === "success") assert.equal((await verify).transactionHash, hash);
    else await assert.rejects(verify);
  });
}
