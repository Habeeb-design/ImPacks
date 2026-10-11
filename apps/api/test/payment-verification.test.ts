import { appOrigin, walletAccount, walletInject } from "./wallet-helpers.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { encodeAbiParameters, encodeEventTopics, erc20Abi, TransactionReceiptNotFoundError, type Hash } from "viem";
import { AUSD_ETHEREUM_SEPOLIA, type CheckoutPurchase } from "@impacks/contracts";
import { buildApp } from "../src/app.js";
import { AusdPaymentVerifier, type VerificationClient } from "../src/providers/ausd/verify.js";
import { createAusdClient, readAusdConfig } from "../src/providers/ausd/index.js";

const buyer = walletAccount.address;
const recipient = "0x2222222222222222222222222222222222222222";
const other = "0x3333333333333333333333333333333333333333";
const hash = `0x${"ab".repeat(32)}` as Hash;
const hash2 = `0x${"cd".repeat(32)}` as Hash;
const blockHash = `0x${"ef".repeat(32)}` as Hash;
const now = 1_800_000_000_000;
const pathForTest = () => join(mkdtempSync(join(tmpdir(), "impacks-payment-")), "checkout.sqlite");

function fixture(t: test.TestContext, databasePath = ":memory:") {
  t.mock.method(Date, "now", () => now);
  const log = {
    address: AUSD_ETHEREUM_SEPOLIA.tokenAddress as string,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from: buyer, to: recipient } }),
    data: encodeAbiParameters([{ type: "uint256" }], [1_000_000n]),
    removed: false, transactionHash: hash, blockHash, blockNumber: 100n, logIndex: 0,
  };
  const state = {
    chainId: 11155111, head: 111n, decimals: 6, unavailable: false, missing: false, calls: 0,
    timestamp: BigInt(now / 1000 + 10), canonicalHash: blockHash, reorgDuringCheck: false,
    blockReads: 0, receipt: { status: "success", transactionHash: hash, blockNumber: 100n, blockHash, logs: [log] },
  };
  // Stub RPC actions, not the verifier: real ABI decoding and all checks still execute.
  const client = {
    getChainId: async () => state.chainId,
    getTransactionReceipt: async () => {
      state.calls++;
      if (state.unavailable) throw new Error("https://rpc.invalid/SECRET_CREDENTIAL");
      if (state.missing) throw new TransactionReceiptNotFoundError({ hash });
      return structuredClone(state.receipt);
    },
    getBlockNumber: async () => state.head,
    getBlock: async () => ({ hash: state.reorgDuringCheck && ++state.blockReads > 1 ? hash2 : state.canonicalHash, timestamp: state.timestamp }),
    readContract: async () => state.decimals,
  } as unknown as VerificationClient;
  const verifier = new AusdPaymentVerifier(client);
  const makeApp = (path = databasePath) => {
    const app = buildApp({ checkoutDatabasePath: path, checkoutRecipientAddress: recipient, paymentVerifier: verifier, appOrigin });
    t.after(() => app.close());
    return app;
  };
  const app = makeApp();
  const create = async (target = app) => {
    const response = await walletInject(target, { method: "POST", url: "/api/checkout", payload: { packType: "starter", buyerAddress: buyer } });
    assert.equal(response.statusCode, 201);
    return response.json<CheckoutPurchase>();
  };
  const verify = (id: string, transactionHash = hash, target = app) => walletInject(target, {
    method: "POST", url: `/api/checkout/${id}/verify`, payload: { transactionHash },
  });
  return { app, state, log, client, makeApp, create, verify };
}

test("verifies an exact AUSD Transfer and persists confirmation evidence", async t => {
  const { create, verify, app } = fixture(t, pathForTest());
  const purchase = await create();
  assert.equal(purchase.storage, "sqlite");
  const result = await verify(purchase.purchaseId);
  assert.equal(result.statusCode, 200, result.body);
  const confirmed = result.json<CheckoutPurchase>();
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.transactionHash, hash);
  assert.equal(confirmed.paymentBlockNumber, "100");
  assert.equal(confirmed.paymentBlockHash, blockHash);
  assert.equal(confirmed.paymentLogIndex, 0);
  assert.ok(confirmed.confirmedAt);
  assert.equal(confirmed.paymentEnabled, false);
  assert.deepEqual((await walletInject(app, { url: `/api/checkout/${purchase.purchaseId}` })).json(), confirmed);
});

test("confirmed retry is idempotent even with RPC offline; another hash cannot credit it again", async t => {
  const { create, verify, state } = fixture(t);
  const purchase = await create();
  const first = await verify(purchase.purchaseId);
  state.unavailable = true;
  const retry = await verify(purchase.purchaseId, `0x${hash.slice(2).toUpperCase()}`);
  assert.equal(retry.statusCode, 200);
  assert.deepEqual(retry.json(), first.json());
  assert.equal(state.calls, 1);
  assert.equal((await verify(purchase.purchaseId, hash2)).statusCode, 409);
});

test("transaction hash cannot confirm another purchase, including case variants", async t => {
  const { create, verify } = fixture(t);
  const a = await create(), b = await create();
  assert.equal((await verify(a.purchaseId)).statusCode, 200);
  const result = await verify(b.purchaseId, `0x${hash.slice(2).toUpperCase()}`);
  assert.equal(result.statusCode, 409);
  assert.equal(result.json().error.code, "TRANSACTION_ALREADY_USED");
});

for (const scenario of ["wrong token", "wrong sender", "wrong recipient", "wrong amount", "reverted receipt", "malformed log",
  "wrong event", "removed log", "wrong receipt hash", "wrong log hash", "wrong log block", "duplicate transfer", "wrong decimals", "old transfer", "late transfer"] as const) {
  test(`rejects ${scenario} without poisoning the purchase`, async t => {
    const { create, verify, app, state, log } = fixture(t);
    const purchase = await create();
    switch (scenario) {
      case "wrong token": log.address = other; break;
      case "wrong sender": log.topics = encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from: other, to: recipient } }); break;
      case "wrong recipient": log.topics = encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from: buyer, to: other } }); break;
      case "wrong amount": log.data = encodeAbiParameters([{ type: "uint256" }], [999_999n]); break;
      case "reverted receipt": state.receipt.status = "reverted"; break;
      case "malformed log": log.data = "0x"; break;
      case "wrong event": log.topics[0] = hash2; break;
      case "removed log": log.removed = true; break;
      case "wrong receipt hash": state.receipt.transactionHash = hash2; break;
      case "wrong log hash": log.transactionHash = hash2; break;
      case "wrong log block": log.blockNumber = 99n; break;
      case "duplicate transfer": state.receipt.logs.push({ ...log, logIndex: 1 }); break;
      case "wrong decimals": state.decimals = 18; break;
      case "old transfer": state.timestamp = BigInt(now / 1000 - 1); break;
      case "late transfer": state.timestamp = BigInt(Date.parse(purchase.expiresAt) / 1000); break;
    }
    const result = await verify(purchase.purchaseId);
    assert.equal(result.statusCode, 422, result.body);
    assert.equal(result.json().error.code, "INVALID_PAYMENT");
    const current = (await walletInject(app, { url: `/api/checkout/${purchase.purchaseId}` })).json();
    assert.equal(current.status, "pending");
    assert.equal(current.transactionHash, null);
  });
}

for (const scenario of ["pending receipt", "insufficient depth", "head behind", "noncanonical receipt", "reorg during verification"] as const) {
  test(`${scenario} stays retryable`, async t => {
    const { create, verify, state, app } = fixture(t);
    const purchase = await create();
    if (scenario === "pending receipt") state.missing = true;
    if (scenario === "insufficient depth") state.head = 110n;
    if (scenario === "head behind") state.head = 99n;
    if (scenario === "noncanonical receipt") state.canonicalHash = hash2;
    if (scenario === "reorg during verification") state.reorgDuringCheck = true;
    const result = await verify(purchase.purchaseId);
    assert.equal(result.statusCode, 425, result.body);
    assert.equal((await walletInject(app, { url: `/api/checkout/${purchase.purchaseId}` })).json().transactionHash, null);
    state.missing = false; state.head = 111n; state.canonicalHash = blockHash; state.reorgDuringCheck = false;
    assert.equal((await verify(purchase.purchaseId)).statusCode, 200);
  });
}

test("wrong RPC chain is rejected before reading a receipt", async t => {
  const { create, verify, state } = fixture(t);
  state.chainId = 8453;
  const result = await verify((await create()).purchaseId);
  assert.equal(result.statusCode, 503);
  assert.equal(result.json().error.code, "WRONG_PAYMENT_NETWORK");
  assert.equal(state.calls, 0);
});

test("temporary RPC failure leaks no credentials and allows later confirmation", async t => {
  const { create, verify, state } = fixture(t);
  const purchase = await create();
  state.unavailable = true;
  const result = await verify(purchase.purchaseId);
  assert.equal(result.statusCode, 503);
  assert.equal(result.json().error.code, "PAYMENT_RPC_UNAVAILABLE");
  assert.ok(!result.body.includes("SECRET_CREDENTIAL"));
  state.unavailable = false;
  assert.equal((await verify(purchase.purchaseId)).statusCode, 200);
});

test("expired checkout can reconcile an on-time payment, and confirmed status never expires", async t => {
  const { create, verify, app } = fixture(t);
  const purchase = await create();
  t.mock.method(Date, "now", () => Date.parse(purchase.expiresAt) + 60_000);
  assert.equal((await walletInject(app, { url: `/api/checkout/${purchase.purchaseId}` })).json().status, "expired");
  const result = await verify(purchase.purchaseId);
  assert.equal(result.statusCode, 200);
  assert.equal(result.json().status, "confirmed");
  assert.equal((await walletInject(app, { url: `/api/checkout/${purchase.purchaseId}` })).json().status, "confirmed");
});

test("verification schema rejects everything except a transaction hash", async t => {
  const { app, create, state } = fixture(t);
  const purchase = await create();
  for (const payload of [{}, { transactionHash: "0x123" }, { transactionHash: 123 },
    { transactionHash: hash, status: "confirmed" }, { transactionHash: hash, amount: "1" }]) {
    assert.equal((await walletInject(app, { method: "POST", url: `/api/checkout/${purchase.purchaseId}/verify`, payload })).statusCode, 400);
  }
  assert.equal(state.calls, 0);
});

test("same purchase and hash concurrently confirm once across two database connections", async t => {
  const path = pathForTest();
  const { create, verify, makeApp } = fixture(t, path);
  const secondApp = makeApp();
  const purchase = await create();
  const results = await Promise.all([verify(purchase.purchaseId), verify(purchase.purchaseId, hash, secondApp)]);
  assert.ok(results.every(result => result.statusCode === 200));
  assert.deepEqual(results[0].json(), results[1].json());
});

test("competing purchases atomically claim one transaction across database connections", async t => {
  const { create, verify, makeApp } = fixture(t, pathForTest());
  const secondApp = makeApp();
  const a = await create(), b = await create(secondApp);
  const results = await Promise.all([verify(a.purchaseId), verify(b.purchaseId, hash, secondApp)]);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 409]);
});

test("different valid hashes cannot overwrite one purchase during concurrent verification", async t => {
  const { create, app, state, client } = fixture(t, pathForTest());
  const purchase = await create();
  client.getTransactionReceipt = (async ({ hash: requested }: { hash: Hash }) => ({
    ...state.receipt, transactionHash: requested,
    logs: state.receipt.logs.map(log => ({ ...log, transactionHash: requested })),
  })) as VerificationClient["getTransactionReceipt"];
  const requests = [hash, hash2].map(transactionHash => walletInject(app, { method: "POST",
    url: `/api/checkout/${purchase.purchaseId}/verify`, payload: { transactionHash } }));
  const results = await Promise.all(requests);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 409]);
  const winner = results.find(result => result.statusCode === 200)!.json();
  assert.equal((await walletInject(app, { url: `/api/checkout/${purchase.purchaseId}` })).json().transactionHash, winner.transactionHash);
});

test("confirmation, pending purchases and replay protection survive closing and reopening the database", async t => {
  const path = pathForTest();
  const { app, create, verify, makeApp, state } = fixture(t, path);
  const a = await create(), b = await create();
  const confirmed = (await verify(a.purchaseId)).json();
  await app.close();
  const restarted = makeApp();
  state.unavailable = true;
  assert.deepEqual((await verify(a.purchaseId, hash, restarted)).json(), confirmed);
  assert.equal((await walletInject(restarted, { url: `/api/checkout/${b.purchaseId}` })).json().status, "pending");
  assert.equal((await verify(b.purchaseId, hash, restarted)).statusCode, 409);
  // Database constraint remains effective even if application-level checks are bypassed.
  const db = new DatabaseSync(path);
  t.after(() => db.close());
  assert.throws(() => db.prepare(`UPDATE checkout_purchases SET status='confirmed', confirmed_at=?, transaction_hash=? WHERE id=?`)
    .run(confirmed.confirmedAt, hash.toUpperCase(), b.purchaseId), /UNIQUE/);
});

test("expired status and expiry timestamp survive database restart", async t => {
  const { app, create, makeApp } = fixture(t, pathForTest());
  const purchase = await create();
  t.mock.method(Date, "now", () => Date.parse(purchase.expiresAt));
  const expired = (await walletInject(app, { url: `/api/checkout/${purchase.purchaseId}` })).json();
  await app.close();
  assert.deepEqual((await walletInject(makeApp(), { url: `/api/checkout/${purchase.purchaseId}` })).json(), expired);
});

test("confirmation depth cannot be configured below the safety minimum", t => {
  const { client } = fixture(t);
  for (const depth of [0, 1, 11, 12.5, NaN]) assert.throws(() => new AusdPaymentVerifier(client, depth));
});

test("buyer override cannot substitute the receiving wallet", async t => {
  const { app } = fixture(t);
  assert.equal((await walletInject(app, { method: "POST", url: "/api/checkout", payload: { packType: "starter", buyerAddress: recipient } })).statusCode, 403);
});

test("real viem HTTP transport decodes a JSON-RPC receipt and verifies it", async t => {
  const { create } = fixture(t);
  const purchase = await create();
  const topics = encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from: buyer, to: recipient } });
  const rpcReceipt = {
    transactionHash: hash, transactionIndex: "0x0", blockNumber: "0x64", blockHash,
    from: buyer, to: AUSD_ETHEREUM_SEPOLIA.tokenAddress, status: "0x1", type: "0x2",
    gasUsed: "0x100", cumulativeGasUsed: "0x100", effectiveGasPrice: "0x1", contractAddress: null,
    logs: [{ address: AUSD_ETHEREUM_SEPOLIA.tokenAddress, topics,
      data: encodeAbiParameters([{ type: "uint256" }], [1_000_000n]), removed: false,
      transactionHash: hash, transactionIndex: "0x0", blockHash, blockNumber: "0x64", logIndex: "0x0" }],
  };
  const methods: string[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const rpc = JSON.parse(body);
    methods.push(rpc.method);
    const result: Record<string, unknown> = {
      eth_chainId: "0xaa36a7", eth_getTransactionReceipt: rpcReceipt, eth_blockNumber: "0x6f",
      eth_getBlockByNumber: { number: "0x64", hash: blockHash, timestamp: `0x${BigInt(now / 1000 + 10).toString(16)}`, transactions: [] },
      eth_call: encodeAbiParameters([{ type: "uint8" }], [6]),
    };
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: result[rpc.method] }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const client = createAusdClient(readAusdConfig({ AUSD_RPC_URL: `http://127.0.0.1:${address.port}`, AUSD_CONTRACT_ADDRESS: AUSD_ETHEREUM_SEPOLIA.tokenAddress }));
  const evidence = await new AusdPaymentVerifier(client).verify(purchase, hash);
  assert.equal(evidence.transactionHash, hash);
  assert.equal(evidence.logIndex, 0);
  assert.ok(methods.includes("eth_getTransactionReceipt"));
  assert.equal(methods.filter(method => method === "eth_getBlockByNumber").length, 2);
});
