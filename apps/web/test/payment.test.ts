import test from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, erc20Abi } from "viem";
import { AUSD_ETHEREUM_SEPOLIA, type CheckoutPurchase } from "@impacks/contracts";
import { checkoutTransaction, paymentProofKey } from "../src/lib/payment.js";
const wallet = `0x${"11".repeat(20)}`;
const purchase = { purchaseId: "fixture", buyerAddress: wallet, recipientAddress: `0x${"22".repeat(20)}`,
  tokenAddress: AUSD_ETHEREUM_SEPOLIA.tokenAddress, chainId: 11155111, decimals: 6, amountAtomic: "20000000",
  paymentEnabled: true, status: "pending", expiresAt: new Date(Date.now() + 60000).toISOString(), pack: { budgetCents: 2000 } } as CheckoutPurchase;
test("wallet payment contains only the exact quoted Sepolia AUSD transfer", () => {
  const tx = checkoutTransaction(purchase, wallet);
  assert.equal(tx.to, AUSD_ETHEREUM_SEPOLIA.tokenAddress); assert.equal(tx.value, "0x0");
  const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
  assert.equal(decoded.functionName, "transfer"); assert.deepEqual(decoded.args, [purchase.recipientAddress, 20000000n]);
});
test("wrong owner, chain, token, amount, expired or disabled payment cannot reach the wallet", () => {
  for (const patch of [{ chainId: 84532 }, { paymentEnabled: false }, { tokenAddress: wallet }, { amountAtomic: "21000000" },
    { buyerAddress: purchase.recipientAddress }, { expiresAt: "2000-01-01" }, { status: "confirmed" }, { recipientAddress: wallet }]) {
    assert.throws(() => checkoutTransaction({ ...purchase, ...patch } as CheckoutPurchase, wallet));
  }
  assert.notEqual(paymentProofKey(wallet, "one"), paymentProofKey(purchase.recipientAddress, "one"));
});
