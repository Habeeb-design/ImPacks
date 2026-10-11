import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { encodeFunctionData, erc20Abi, keccak256 } from "viem";
import { AUSD_ETHEREUM_SEPOLIA, type Market, type SandboxOrderIntent } from "@impacks/contracts";
import { CheckoutStore } from "../src/storage/checkout.js";
import { CheckoutService } from "../src/services/checkout.js";
import { RefundService } from "../src/services/refunds.js";
import { PipelineStore } from "../src/pipeline/store.js";
import { PurchaseWorker } from "../src/pipeline/worker.js";
import type { OrderObservation, TradingGateway, RefundTransport } from "../src/pipeline/ports.js";
import { checkoutStatus } from "../src/services/checkout-status.js";
import { HttpError } from "../src/errors.js";

const treasury = privateKeyToAccount(`0x${"11".repeat(32)}`);
const owner = privateKeyToAccount(`0x${"22".repeat(32)}`).address;
const proof = `0x${"ab".repeat(32)}` as const;
const evidence = { transactionHash: proof, blockNumber: "100", blockHash: `0x${"cd".repeat(32)}`, logIndex: 0 };
const policy = { accountKey: "fixture-sandbox", capacityCents: 100000, feeReserveBps: 1000 };
const markets: Market[] = Array.from({ length: 4 }, (_, i) => ({ id: `fixture-${i}`, question: `Fixture ${i}?`, theme: "crypto", active: true, yesPriceCents: 20, noPriceCents: 20 }));
function setup(t: test.TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "impacks-worker-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new CheckoutStore(join(dir, "checkout.sqlite")); t.after(() => { try { store.close(); } catch {} });
  const ledger = new PipelineStore(store, policy); ledger.heartbeat(true, "fixture");
  let feeAtomic = "10000";
  let paymentOk = true, feesFinal = true, refundOk = true, rejectSubmission = false, partial = false;
  const payments = { verify: async () => { if (!paymentOk) throw new Error("reorg fixture"); return evidence; } };
  const checkout = new CheckoutService(treasury.address, store, payments);
  const purchases = () => checkout.create({ packType: "category", packId: "crypto", budgetCents: 2000, disclosureVersion: "random-v1" }, owner, randomUUID());
  const purchase = purchases(); ledger.enqueue(purchase.purchaseId, owner, "did:privy:fixture"); ledger.paymentHash(purchase.purchaseId, owner, proof);
  const submitted: string[] = [], broadcasts: string[] = [];
  const remote = new Map<string, OrderObservation>(); let signatures = 0;
  function observation(order: SandboxOrderIntent): OrderObservation {
    const quantity = partial ? order.quantity - 1 : order.quantity, costCents = quantity * order.limitPriceCents;
    return { clientOrderId: order.clientOrderId, exchangeOrderId: `exchange-${order.clientOrderId}`, state: partial ? "cancelled" : "filled",
      quantity, costCents, feeCents: 1, costAtomic: String(costCents * 10000), feeAtomic, feesFinal, evidence: "fixture-evidence" };
  }
  const gateway: TradingGateway = { accountKey: policy.accountKey, readiness: async () => ({ availableCents: 100000 }), markets: async () => markets, validate: async () => {},
    submit: async order => { submitted.push(order.clientOrderId); const value = observation(order); remote.set(order.clientOrderId, value); if (rejectSubmission) throw new Error("response lost"); return value; },
    lookup: async order => { const value = remote.get(order.clientOrderId); return value ? { ...value, feesFinal } : null; } };
  const refunds = new RefundService(store, treasury.address, { verify: async refund => { if (!refundOk) throw new Error("receipt unavailable"); return { ...evidence, transactionHash: refund.transactionHash! }; } }, ledger);
  const transport: RefundTransport = { pendingNonce: async () => 0,
    sign: async ({ to, amountAtomic, nonce }) => { signatures++; return treasury.signTransaction({ chainId: 11155111, type: "eip1559", nonce, gas: 60000n, maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 100000000n, to: AUSD_ETHEREUM_SEPOLIA.tokenAddress, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to as `0x${string}`, BigInt(amountAtomic)] }) }); },
    broadcast: async signed => { broadcasts.push(signed); if (!refundOk) throw new Error("broadcast response lost"); return keccak256(signed); } };
  const worker = new PurchaseWorker(ledger, gateway, checkout, payments, refunds, transport);
  return { dir, store, ledger, checkout, purchases, purchase, worker, gateway, refunds, remote, submitted, broadcasts,
    set: (value: { feeAtomic?: string; paymentOk?: boolean; feesFinal?: boolean; refundOk?: boolean; rejectSubmission?: boolean; partial?: boolean }) => {
      feeAtomic = value.feeAtomic ?? feeAtomic;
      paymentOk = value.paymentOk ?? paymentOk; feesFinal = value.feesFinal ?? feesFinal; refundOk = value.refundOk ?? refundOk;
      rejectSubmission = value.rejectSubmission ?? rejectSubmission; partial = value.partial ?? partial;
    }, signatures: () => signatures };
}

test("verified category payment issues durable cards and returns exact remainder once across restart", async t => {
  const x = setup(t), id = x.purchase.purchaseId;
  await x.worker.run(id);
  assert.equal(x.ledger.status(id)?.state, "completed"); assert.equal(x.submitted.length, 3); assert.equal(x.signatures(), 1);
  const opening = x.ledger.opening(id)!; assert.equal(opening.cards.length, 3); assert.equal(opening.mode, "sandbox");
  assert.ok(opening.cards.every(card => card.position?.status === "open"));
  assert.equal(x.refunds.get(id).state, "confirmed");
  assert.equal(BigInt(x.refunds.get(id).authorizedAtomic!), 20000000n - opening.cards.reduce((n, card) => n + BigInt(card.order.spentCents + 1) * 10000n, 0n));
  await x.worker.run(id); assert.equal(x.submitted.length, 3); assert.equal(x.broadcasts.length, 1);
  x.store.close(); const reopened = new CheckoutStore(join(x.dir, "checkout.sqlite")); t.after(() => reopened.close());
  assert.deepEqual(new PipelineStore(reopened, policy).opening(id), opening);
  assert.equal(reopened.db.prepare("SELECT status FROM checkout_fulfillments WHERE purchase_id=?").get(id)?.status, "fulfilled");
});
test("lost submission response is recovered by the original client ID without another send or draw", async t => {
  const x = setup(t), id = x.purchase.purchaseId; x.set({ rejectSubmission: true });
  await x.worker.run(id); assert.equal(x.submitted.length, 1); assert.equal(x.ledger.status(id)?.state, "reconciliation-required");
  const ids = x.worker.execution.get(id).orders.map(order => order.clientOrderId);
  x.set({ rejectSubmission: false }); await x.worker.run(id);
  assert.equal(x.ledger.status(id)?.state, "completed"); assert.equal(new Set(x.submitted).size, 3); assert.equal(x.submitted.length, 3);
  assert.deepEqual(x.worker.execution.get(id).orders.map(order => order.clientOrderId), ids);
});
test("not-found after a possible submission remains unknown and never authorizes a retry or refund", async t => {
  const x = setup(t), id = x.purchase.purchaseId; x.set({ rejectSubmission: true });
  await x.worker.run(id); x.remote.clear();
  await x.worker.run(id); await x.worker.run(id);
  assert.equal(x.submitted.length, 1); assert.equal(x.signatures(), 0); assert.equal(x.ledger.opening(id), null);
});
test("unknown final fees block settlement; matched fees resume the same order and partial holdings survive", async t => {
  const x = setup(t), id = x.purchase.purchaseId; x.set({ feesFinal: false, partial: true });
  await x.worker.run(id); assert.equal(x.signatures(), 0); assert.equal(x.ledger.opening(id), null);
  x.set({ feesFinal: true }); await x.worker.run(id);
  assert.equal(x.ledger.status(id)?.state, "completed"); assert.equal(x.ledger.opening(id)?.status, "partial");
  assert.ok(x.ledger.opening(id)!.cards.every(card => card.order.status === "filled" && card.position!.remainingQuantity! > 0));
  assert.equal(x.submitted.length, 3);
});
test("uncertain refund reuses exact signed bytes and nonce, without signing another transfer", async t => {
  const x = setup(t), id = x.purchase.purchaseId; x.set({ refundOk: false });
  await x.worker.run(id); assert.equal(x.ledger.status(id)?.state, "refunding"); assert.equal(x.signatures(), 1);
  const hash = x.refunds.get(id).transactionHash;
  x.set({ refundOk: true }); await x.worker.run(id);
  assert.equal(x.ledger.status(id)?.state, "completed"); assert.equal(x.signatures(), 1);
  assert.equal(x.broadcasts[0], x.broadcasts[1]); assert.equal(x.refunds.get(id).transactionHash, hash);
});
test("payment reorg blocks both execution and already-authorized refund broadcasting", async t => {
  const x = setup(t), id = x.purchase.purchaseId; x.set({ paymentOk: false });
  await x.worker.run(id); assert.equal(x.submitted.length, 0); assert.equal(x.broadcasts.length, 0);
  x.set({ paymentOk: true, refundOk: false }); await x.worker.run(id);
  const broadcasts = x.broadcasts.length; x.set({ paymentOk: false }); await x.worker.run(id);
  assert.equal(x.broadcasts.length, broadcasts);
});
test("payment requests bind account/wallet, reserve budget, and prevent duplicate wallet requests", t => {
  const x = setup(t); const purchase = x.purchases(), id = purchase.purchaseId;
  const first = x.ledger.paymentIntent(id, owner, "did:privy:fixture");
  assert.equal(first.purchase.paymentEnabled, true);
  assert.throws(() => x.ledger.paymentIntent(id, owner, "did:privy:fixture"), { code: "PAYMENT_ALREADY_REQUESTED" });
  x.ledger.rejectPayment(id, owner, "wrong-attempt");
  assert.throws(() => x.ledger.paymentIntent(id, owner, "did:privy:fixture"));
  x.ledger.rejectPayment(id, owner, first.attemptId);
  assert.notEqual(x.ledger.paymentIntent(id, owner, "did:privy:fixture").attemptId, first.attemptId);
  assert.throws(() => x.ledger.enqueue(id, owner, "did:privy:other"), { code: "WALLET_OWNER_CONFLICT" });
  assert.throws(() => x.ledger.paymentHash(id, owner, proof), { code: "TRANSACTION_ALREADY_USED" });
  x.ledger.heartbeat(false, "offline"); assert.throws(() => x.ledger.enqueue(x.purchases().purchaseId, owner, "did:privy:fixture"), { code: "WORKER_UNAVAILABLE" });
});
test("independent connections share nonces, capacity and one submission permit", t => {
  const x = setup(t), second = new CheckoutStore(join(x.dir, "checkout.sqlite")); t.after(() => second.close());
  const other = new PipelineStore(second, policy);
  assert.equal(x.ledger.nonce("key", 1000), 1000); assert.equal(other.nonce("key", 1000), 1001);
  x.store.db.prepare("UPDATE pipeline_jobs SET reserved_cents=?").run(policy.capacityCents);
  assert.throws(() => other.enqueue(x.purchases().purchaseId, owner, "did:privy:fixture"), { code: "TREASURY_CAPACITY" });
  assert.throws(() => new PipelineStore(second, { ...policy, capacityCents: 200000 }), /policy changed/);
});
test("a second worker cannot run a purchase while its current worker owns the lease", async t => {
  const x = setup(t), id = x.purchase.purchaseId, token = x.ledger.claim(id)!;
  await x.worker.run(id); assert.equal(x.submitted.length, 0);
  x.store.db.prepare("UPDATE pipeline_jobs SET lease_until=0 WHERE purchase_id=?").run(id);
  await x.worker.run(id); assert.equal(x.ledger.status(id)?.state, "completed");
  assert.throws(() => x.ledger.update(id, token, "executing"), (error: unknown) => error instanceof HttpError && error.code === "STALE_PIPELINE_WORKER");
});

test("sub-cent final fees preserve the exact six-decimal refund amount", async t => {
  const x = setup(t), id = x.purchase.purchaseId; x.set({ feeAtomic: "1234" });
  await x.worker.run(id);
  assert.equal(x.ledger.status(id)?.state, "completed");
  const spent = x.ledger.opening(id)!.cards.reduce((n, card) => n + BigInt(card.order.spentCents) * 10000n + 1234n, 0n);
  assert.equal(x.refunds.get(id).authorizedAtomic, String(20000000n - spent));
});
test("new-purchase readiness failure does not block original order reconciliation or reveal provisional holdings", async t => {
  const x = setup(t), id = x.purchase.purchaseId; x.set({ feesFinal: false });
  await x.worker.run(id);
  assert.equal(checkoutStatus(x.checkout, x.worker.execution, x.refunds, id, owner, x.ledger).opening, null);
  x.set({ feesFinal: true }); x.ledger.heartbeat(false, "unavailable");
  await x.worker.run(id);
  const first = x.worker.execution.get(id).orders[0];
  assert.equal(first.state, "filled"); assert.equal(x.submitted.length, 1);
  assert.equal(x.ledger.opening(id), null);
  x.ledger.heartbeat(true, "ready"); await x.worker.run(id);
  assert.equal(x.ledger.status(id)?.state, "completed");
});
test("observed overspending is retained for review and cannot issue holdings or refunds", async t => {
  const x = setup(t), id = x.purchase.purchaseId; x.set({ rejectSubmission: true });
  await x.worker.run(id);
  const [key, observed] = [...x.remote][0];
  x.remote.set(key, { ...observed, costCents: 100000, costAtomic: "1000000000" });
  await x.worker.run(id);
  assert.equal(x.ledger.observation(key)?.costCents, 100000);
  assert.equal(x.ledger.opening(id), null); assert.equal(x.signatures(), 0);
  assert.equal(x.submitted.length, 1);
});

test("exhausted time nonce window does not keep moving the persisted nonce into the future", t => {
  const x = setup(t);
  assert.equal(x.ledger.nonce("time-key", 1000, 1001), 1000);
  assert.equal(x.ledger.nonce("time-key", 1000, 1001), 1001);
  for (let i = 0; i < 10; i++) assert.throws(() => x.ledger.nonce("time-key", 1000, 1001), /window exhausted/);
  assert.equal(x.ledger.nonce("time-key", 1001, 1002), 1002);
});
