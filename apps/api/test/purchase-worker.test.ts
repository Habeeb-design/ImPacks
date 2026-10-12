import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, keccak256 } from "viem";
import { AUSD_ETHEREUM_SEPOLIA, PACK_THEMES, type Theme, type Market, type SandboxOrderIntent, type SandboxExecution } from "@impacks/contracts";
import { CheckoutStore } from "../src/storage/checkout.js";
import { CheckoutService } from "../src/services/checkout.js";
import { RefundService } from "../src/services/refunds.js";
import { PipelineStore } from "../src/pipeline/store.js";
import { PurchaseWorker } from "../src/pipeline/worker.js";
import type { OrderObservation, TradingGateway, RefundTransport } from "../src/pipeline/ports.js";
import { checkoutStatus } from "../src/services/checkout-status.js";
import { FulfillmentService } from "../src/services/fulfillment.js";
import { HttpError } from "../src/errors.js";
import { AusdPaymentVerifier, type PaymentVerifier, type VerificationClient } from "../src/providers/ausd/verify.js";

const treasury = privateKeyToAccount(`0x${"11".repeat(32)}`);
const owner = privateKeyToAccount(`0x${"22".repeat(32)}`).address;
const proof = `0x${"ab".repeat(32)}` as const;
const evidence = { transactionHash: proof, blockNumber: "100", blockHash: `0x${"cd".repeat(32)}`, logIndex: 0 };
const policy = { accountKey: "fixture-sandbox", capacityCents: 100000, feeReserveBps: 1000 };
const markets: Market[] = Array.from({ length: 4 }, (_, i) => ({ id: `fixture-${i}`, question: `Fixture ${i}?`, theme: "crypto", active: true, yesPriceCents: 20, noPriceCents: 20 }));
function setup(t: test.TestContext, theme: Theme = "crypto", platformAdvance = false) {
  const dir = mkdtempSync(join(tmpdir(), "impacks-worker-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new CheckoutStore(join(dir, "checkout.sqlite")); t.after(() => { try { store.close(); } catch {} });
  const ledger = new PipelineStore(store, { ...policy, platformAdvance }); ledger.heartbeat(true, "fixture", [theme]);
  let feeAtomic = "10000";
  let paymentOk = true, feesFinal = true, refundOk = true, rejectSubmission = false, partial = false;
  const payments: PaymentVerifier = { verify: async () => { if (!paymentOk) throw new Error("reorg fixture"); return evidence; } };
  const checkout = new CheckoutService(treasury.address, store, payments);
  const purchases = () => checkout.create({ packType: "category", packId: theme, budgetCents: 2000, disclosureVersion: "random-v1" }, owner, randomUUID());
  const purchase = purchases(); ledger.enqueue(purchase.purchaseId, owner, "did:privy:fixture"); if (!platformAdvance) ledger.paymentHash(purchase.purchaseId, owner, proof);
  const submitted: string[] = [], broadcasts: string[] = [];
  const remote = new Map<string, OrderObservation>(); let signatures = 0;
  function observation(order: SandboxOrderIntent): OrderObservation {
    const quantity = partial ? order.quantity - 1 : order.quantity, costCents = quantity * order.limitPriceCents;
    return { clientOrderId: order.clientOrderId, exchangeOrderId: `exchange-${order.clientOrderId}`, state: partial ? "cancelled" : "filled",
      quantity, costCents, feeCents: 1, costAtomic: String(costCents * 10000), feeAtomic, feesFinal, evidence: "fixture-evidence" };
  }
  const gateway: TradingGateway = { accountKey: policy.accountKey, readiness: async () => ({ availableCents: 100000 }), markets: async requested => markets.map(market => ({ ...market, theme: requested === "mixed" ? "crypto" : requested })), validate: async () => {},
    submit: async order => { submitted.push(order.clientOrderId); const value = observation(order); remote.set(order.clientOrderId, value); if (rejectSubmission) throw new Error("response lost"); return value; },
    lookup: async order => { const value = remote.get(order.clientOrderId); return value ? { ...value, feesFinal } : null; } };
  const refunds = new RefundService(store, treasury.address, { verify: async refund => { if (!refundOk) throw new Error("receipt unavailable"); return { ...evidence, transactionHash: refund.transactionHash! }; } }, ledger);
  const transport: RefundTransport = { pendingNonce: async () => 0,
    sign: async ({ to, amountAtomic, nonce }) => { signatures++; return treasury.signTransaction({ chainId: 11155111, type: "eip1559", nonce, gas: 60000n, maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 100000000n, to: AUSD_ETHEREUM_SEPOLIA.tokenAddress, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to as `0x${string}`, BigInt(amountAtomic)] }) }); },
    broadcast: async signed => { broadcasts.push(signed); if (!refundOk) throw new Error("broadcast response lost"); return keccak256(signed); } };
  const worker = new PurchaseWorker(ledger, gateway, checkout, payments, refunds, transport);
  return { dir, store, ledger, checkout, purchases, purchase, worker, gateway, refunds, payments, remote, submitted, broadcasts,
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
test("only a confirmed AUSD transfer into the company treasury unlocks platform orders", async t => {
  const x = setup(t), id = x.purchase.purchaseId;
  let recipient = owner, head = 111n;
  // RPC fixtures use the real ABI receipt verifier before the durable worker can trade.
  const verifier = new AusdPaymentVerifier({
    getChainId: async () => 11155111,
    getBlockNumber: async () => head,
    getBlock: async () => ({ hash: evidence.blockHash, timestamp: BigInt(Math.ceil(Date.parse(x.purchase.createdAt) / 1000) + 10) }),
    readContract: async () => 6,
    getTransactionReceipt: async () => ({ status: "success", transactionHash: proof, blockNumber: 100n, blockHash: evidence.blockHash,
      logs: [{ address: AUSD_ETHEREUM_SEPOLIA.tokenAddress, removed: false, transactionHash: proof,
        blockHash: evidence.blockHash, blockNumber: 100n, logIndex: 0,
        topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from: owner, to: recipient } }),
        data: encodeAbiParameters([{ type: "uint256" }], [20_000_000n]) }] }),
  } as unknown as VerificationClient);
  x.payments.verify = (purchase, hash) => verifier.verify(purchase, hash);
  const submit = x.gateway.submit;
  x.gateway.submit = async order => {
    const payment = x.store.get(id);
    assert.equal(payment.status, "confirmed");
    assert.equal(payment.recipientAddress, treasury.address);
    assert.equal(payment.transactionHash, proof);
    return submit(order);
  };

  await x.worker.run(id); // Correct token and amount, wrong receiving wallet.
  assert.equal(x.submitted.length, 0); assert.equal(x.signatures(), 0);
  assert.equal(x.store.get(id).status, "pending");
  recipient = treasury.address; head = 100n;
  await x.worker.run(id); // Correct treasury, insufficient confirmations.
  assert.equal(x.submitted.length, 0); assert.equal(x.ledger.opening(id), null);
  head = 111n;
  await x.worker.run(id);
  assert.equal(x.ledger.status(id)?.state, "completed");
  assert.equal(x.submitted.length, 3);
  assert.equal(x.refunds.get(id).recipientAddress.toLowerCase(), owner.toLowerCase());
  await x.worker.run(id);
  assert.equal(x.submitted.length, 3); assert.equal(x.signatures(), 1);
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

// All exchange/chain effects in these regressions use local test transports.
test("every edition executes through the durable worker when its sandbox markets are available", async t => {
  for (const theme of PACK_THEMES) await t.test(theme, async t => {
    const x = setup(t, theme);
    await x.worker.readiness();
    assert.ok(x.ledger.enabledPackIds().includes(theme));
    await x.worker.run(x.purchase.purchaseId);
    assert.equal(x.ledger.status(x.purchase.purchaseId)?.state, "completed");
    assert.equal(x.submitted.length, 3);
    assert.equal(x.ledger.opening(x.purchase.purchaseId)?.theme, theme);
  });
});
test("readiness isolates unavailable editions and rechecks eligibility before payment", async t => {
  const x = setup(t);
  x.gateway.markets = async theme => {
    if (theme === "sports") throw new Error("upstream unavailable");
    return theme === "crypto" || theme === "mixed" ? markets : [];
  };
  await x.worker.readiness();
  assert.deepEqual(x.ledger.enabledPackIds(), ["crypto", "mixed"]);
  const unavailable = x.checkout.create({ packType: "category", packId: "tech", budgetCents: 2000, disclosureVersion: "random-v1" }, owner, randomUUID());
  assert.throws(() => x.ledger.paymentIntent(unavailable.purchaseId, owner, "did:privy:fixture"), { code: "EDITION_UNAVAILABLE" });
  assert.equal(x.ledger.row(unavailable.purchaseId), undefined);
  const pending = x.purchases();
  x.ledger.enqueue(pending.purchaseId, owner, "did:privy:fixture");
  x.ledger.heartbeat(true, "only mixed", ["mixed"]);
  assert.throws(() => x.ledger.paymentIntent(pending.purchaseId, owner, "did:privy:fixture"), { code: "PAYMENT_UNAVAILABLE" });
  x.store.db.prepare("UPDATE pipeline_pack_readiness SET ready_until=0").run();
  assert.deepEqual(x.ledger.enabledPackIds(), []);
});


test("platform advance reveals real observed fills before collection and never refunds uncollected funds", async t => {
  const x = setup(t, "crypto", true), id = x.purchase.purchaseId;
  x.set({ paymentOk: false });
  assert.throws(() => new FulfillmentService(x.store).claim(id, randomUUID()), { code: "PURCHASE_NOT_AUTHORIZED" });
  await x.worker.run(id);
  assert.equal(x.submitted.length, 3, "The explicit advance does not wait for an AUSD receipt");
  assert.equal(x.store.get(id).status, "pending");
  assert.equal(x.ledger.opening(id)?.payment.status, "pending");
  assert.equal(x.ledger.opening(id)?.cards.filter(card => card.order.status === "filled").length, 3);
  assert.equal(x.signatures(), 0); assert.equal(x.ledger.readFinal({ purchaseId: id } as SandboxExecution), null);
  await x.worker.run(id); assert.equal(x.submitted.length, 3);
  assert.throws(() => x.ledger.enqueue(x.purchases().purchaseId, owner, "did:privy:fixture"), { code: "ADVANCE_OUTSTANDING" });
  const reopened = new CheckoutStore(join(x.dir, "checkout.sqlite")); t.after(() => reopened.close());
  const second = new PipelineStore(reopened, policy); // Turning the opt-in off cannot erase an existing advance.
  assert.equal(second.isAdvanced(id), true); assert.deepEqual(second.opening(id), x.ledger.opening(id));

  x.ledger.heartbeat(false, "market unavailable after fill");
  const intent = x.ledger.paymentIntent(id, owner, "did:privy:fixture");
  assert.equal(intent.purchase.paymentEnabled, true, "Collection of delivered cards is independent of new market availability");
  assert.ok(Date.parse(intent.purchase.expiresAt) - Date.parse(intent.purchase.createdAt) >= 23 * 60 * 60_000);
  x.ledger.paymentHash(id, owner, proof);
  await x.worker.run(id); assert.equal(x.signatures(), 0, "Unverified collection cannot authorize a refund");
  x.set({ paymentOk: true }); await x.worker.run(id);
  assert.equal(x.ledger.status(id)?.state, "completed");
  assert.equal(x.ledger.opening(id)?.payment.status, "confirmed");
  assert.equal(x.signatures(), 1); assert.equal(x.submitted.length, 3);
  await x.worker.run(id); assert.equal(x.signatures(), 1); assert.equal(x.submitted.length, 3);
});

test("advance cannot collect early, exceed capacity, or duplicate uncertain orders", async t => {
  const x = setup(t, "crypto", true), id = x.purchase.purchaseId;
  assert.throws(() => x.ledger.paymentIntent(id, owner, "did:privy:fixture"), { code: "ADVANCE_PROCESSING" });
  x.set({ rejectSubmission: true }); await x.worker.run(id);
  assert.equal(x.ledger.opening(id), null); assert.equal(x.submitted.length, 1);
  x.set({ rejectSubmission: false }); await x.worker.run(id);
  assert.equal(x.submitted.length, 3); assert.equal(x.ledger.opening(id)?.payment.status, "pending");
  assert.equal(x.signatures(), 0);
  const other = privateKeyToAccount(`0x${"33".repeat(32)}`).address;
  const purchase = x.checkout.create({ packType: "category", packId: "crypto", budgetCents: 2000, disclosureVersion: "random-v1" }, other, randomUUID());
  assert.throws(() => x.ledger.enqueue(purchase.purchaseId, other, "did:privy:fixture"), { code: "ADVANCE_OUTSTANDING" });
  x.store.db.prepare("UPDATE pipeline_jobs SET spent_cents=?").run(49000);
  assert.throws(() => x.ledger.enqueue(purchase.purchaseId, other, "did:privy:other"), { code: "ADVANCE_CAPACITY" });
});
