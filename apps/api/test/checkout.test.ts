import { appOrigin, walletAccount, walletInject } from "./wallet-helpers.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AUSD_ETHEREUM_SEPOLIA, routes, type CheckoutPurchase } from "@impacks/contracts";
import { buildApp } from "../src/app.js";
import { demoProviders } from "../src/providers/demo.js";

const buyerAddress = walletAccount.address;
const recipient = "0x2222222222222222222222222222222222222222";
function setup(t: test.TestContext, checkoutRecipientAddress = recipient) {
  const app = buildApp({ checkoutRecipientAddress, checkoutDatabasePath: ":memory:", appOrigin });
  t.after(() => app.close());
  const create = (payload: unknown = { packType: "starter", buyerAddress }) =>
    walletInject(app, { method: "POST", url: routes.checkout, payload: payload as object });
  return { app, create };
}

test("checkout creates and retrieves each tier with server-owned payment instructions", async t => {
  const { app, create } = setup(t);
  const ids = new Set<string>();
  for (const [packType, amount, amountAtomic] of [["starter", "1", "1000000"], ["premium", "3", "3000000"], ["ultimate", "5", "5000000"]]) {
    const response = await create({ packType, buyerAddress });
    assert.equal(response.statusCode, 201);
    const purchase = response.json<CheckoutPurchase>();
    assert.match(purchase.purchaseId, /^[0-9a-f-]{36}$/);
    ids.add(purchase.purchaseId);
    assert.equal(purchase.packType, packType);
    assert.equal(purchase.amount, amount);
    assert.equal(purchase.amountAtomic, amountAtomic);
    assert.equal(purchase.buyerAddress, buyerAddress);
    assert.equal(purchase.recipientAddress, recipient);
    assert.equal(purchase.chainId, 11155111);
    assert.equal(purchase.tokenAddress, AUSD_ETHEREUM_SEPOLIA.tokenAddress);
    assert.equal(purchase.decimals, 6);
    assert.equal(purchase.asset, "AUSD");
    assert.equal(purchase.status, "pending");
    assert.equal(purchase.mode, "ausd-testnet");
    assert.equal(purchase.storage, "memory");
    assert.equal(purchase.paymentEnabled, false);
    assert.equal(Date.parse(purchase.expiresAt) - Date.parse(purchase.createdAt), 15 * 60_000);
    assert.equal(response.headers.location, `${routes.checkout}/${purchase.purchaseId}`);
    const fetched = await walletInject(app, { url: response.headers.location as string });
    assert.equal(fetched.statusCode, 200);
    assert.equal(fetched.headers["cache-control"], "no-store");
    assert.deepEqual(fetched.json(), purchase);
  }
  assert.equal(ids.size, 3);
});

test("each checkout submission gets its own purchase ID", async t => {
  const { create } = setup(t);
  const responses = await Promise.all([create(), create()]);
  assert.ok(responses.every(response => response.statusCode === 201));
  assert.notEqual(responses[0].json().purchaseId, responses[1].json().purchaseId);
});

test("checkout rejects malformed, zero and incorrectly checksummed optional buyer addresses", async t => {
  const { create } = setup(t);
  for (const address of [null, 123, "", "0x123", "0x" + "g".repeat(40), "0x" + "0".repeat(40), "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dd"]) {
    const response = await create({ packType: "starter", buyerAddress: address });
    assert.equal(response.statusCode, 400, String(address));
    assert.equal(response.json().error.code, "INVALID_REQUEST");
  }
});

test("checkout rejects unsupported and missing pack types", async t => {
  const { create } = setup(t);
  for (const packType of [undefined, null, 1, "", "Starter", "mixed", "__proto__"]) {
    assert.equal((await create({ packType, buyerAddress })).statusCode, 400);
  }
});

test("checkout rejects client-controlled prices, statuses, confirmations and instruction overrides", async t => {
  const { create } = setup(t);
  for (const [key, value] of Object.entries({ price: 0, amount: "0", amountAtomic: "1", status: "confirmed",
    paymentStatus: "confirmed", paymentConfirmation: true, paymentProof: "fake", purchaseId: randomUUID(),
    expiresAt: "2099-01-01T00:00:00.000Z", recipientAddress: buyerAddress, chainId: 1, tokenAddress: buyerAddress })) {
    const response = await create({ packType: "ultimate", buyerAddress, [key]: value });
    assert.equal(response.statusCode, 400, key);
  }
  assert.equal((await create({ packType: "ultimate", buyerAddress })).json().amountAtomic, "5000000");
});

test("purchase expires exactly at its server deadline and stays expired", async t => {
  const { app, create } = setup(t);
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const purchase = (await create()).json<CheckoutPurchase>();
  const url = `${routes.checkout}/${purchase.purchaseId}`;
  now = Date.parse(purchase.expiresAt) - 1;
  assert.equal((await walletInject(app, { url })).json().status, "pending");
  now++;
  const expired = (await walletInject(app, { url })).json<CheckoutPurchase>();
  assert.deepEqual(expired, { ...purchase, status: "expired", expiredAt: purchase.expiresAt, updatedAt: purchase.expiresAt });
  now -= 1000;
  assert.equal((await walletInject(app, { url })).json().status, "expired");
});

test("checkout lookup validates IDs and reports missing purchases", async t => {
  const { app } = setup(t);
  assert.equal((await walletInject(app, { url: `${routes.checkout}/invalid` })).statusCode, 400);
  const response = await walletInject(app, { url: `${routes.checkout}/${randomUUID()}` });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "PURCHASE_NOT_FOUND");
});

test("checkout fails closed without a valid recipient while demo API stays available", async t => {
  for (const address of ["", "invalid", "0x" + "0".repeat(40)]) {
    const { app, create } = setup(t, address);
    assert.equal((await walletInject(app, { url: routes.health })).statusCode, 200);
    const response = await create();
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, "CHECKOUT_NOT_CONFIGURED");
  }
});

test("isolated test databases do not share records and checkout invokes no external providers", async t => {
  const providers = demoProviders();
  const unexpected = async (): Promise<never> => { assert.fail("Checkout must not call providers"); };
  providers.payments.confirm = unexpected;
  providers.markets.listEligible = unexpected;
  providers.orders.buy = unexpected;
  const app = buildApp({ providers, checkoutRecipientAddress: recipient, checkoutDatabasePath: ":memory:", appOrigin });
  t.after(() => app.close());
  const response = await walletInject(app, { method: "POST", url: routes.checkout, payload: { packType: "starter", buyerAddress } });
  assert.equal(response.statusCode, 201);
  const restarted = setup(t).app;
  assert.equal((await walletInject(restarted, { url: `${routes.checkout}/${response.json().purchaseId}` })).statusCode, 404);
});
