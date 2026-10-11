import { AUSD_ETHEREUM_SEPOLIA, type CheckoutPurchase } from "@impacks/contracts";
import { encodeFunctionData, erc20Abi, isAddress } from "viem";

/** Only the exact server-owned Sepolia token transfer is offered to the user's wallet. */
export function checkoutTransaction(purchase: CheckoutPurchase, wallet: string) {
  if (!purchase.paymentEnabled || purchase.status !== "pending" || Date.parse(purchase.expiresAt) <= Date.now()
    || purchase.chainId !== AUSD_ETHEREUM_SEPOLIA.chainId || purchase.decimals !== 6
    || purchase.tokenAddress.toLowerCase() !== AUSD_ETHEREUM_SEPOLIA.tokenAddress.toLowerCase()
    || purchase.buyerAddress.toLowerCase() !== wallet.toLowerCase()
    || !isAddress(purchase.recipientAddress) || /^0x0{40}$/i.test(purchase.recipientAddress)
    || purchase.recipientAddress.toLowerCase() === wallet.toLowerCase()
    || !/^\d+$/.test(purchase.amountAtomic) || BigInt(purchase.amountAtomic) <= 0n
    || !purchase.pack || BigInt(purchase.pack.budgetCents) * 10000n !== BigInt(purchase.amountAtomic)) {
    throw new Error("Payment instruction is unavailable or does not match this wallet and purchase.");
  }
  return { from: wallet as `0x${string}`, to: AUSD_ETHEREUM_SEPOLIA.tokenAddress, value: "0x0",
    data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [purchase.recipientAddress, BigInt(purchase.amountAtomic)] }) };
}
export const paymentProofKey = (wallet: string, id: string) => `impacks.checkout-proof:${wallet.toLowerCase()}:${id}`;
