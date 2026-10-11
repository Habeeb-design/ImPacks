import { AUSD_ETHEREUM_SEPOLIA, checkoutSchema, type CheckoutRequest, type WalletChallenge } from "@impacks/contracts";
import { parseSiweMessage } from "viem/siwe";

export type CheckoutAttempt = { key: string; body: CheckoutRequest; purchaseId?: string };
export function checkoutAttemptKey(address: string, packId: string) {
  return `impacks.checkout:${address.toLowerCase()}:${packId}`;
}
export function restoreCheckoutAttempt(raw: string | null, packId: string): CheckoutAttempt | null {
  try {
    const value = JSON.parse(raw ?? "null");
    const body = checkoutSchema.safeParse(value?.body);
    if (!body.success || body.data.packType !== "category" || body.data.packId !== packId || !/^[a-zA-Z0-9_-]{8,128}$/.test(value.key)) return null;
    if (value.purchaseId !== undefined && !/^[0-9a-f-]{36}$/i.test(value.purchaseId)) return null;
    return { key: value.key, body: body.data, purchaseId: value.purchaseId };
  } catch { return null; }
}
export function validateCheckoutChallenge(challenge: WalletChallenge, address: string, origin: string, now = Date.now()) {
  const message = parseSiweMessage(challenge.message);
  if (challenge.chainId !== AUSD_ETHEREUM_SEPOLIA.chainId || challenge.origin !== origin || challenge.domain !== new URL(origin).host
    || challenge.walletAddress.toLowerCase() !== address.toLowerCase() || Date.parse(challenge.expiresAt) <= now
    || message.address?.toLowerCase() !== address.toLowerCase() || message.chainId !== challenge.chainId
    || message.domain !== challenge.domain || message.uri !== origin || message.nonce !== challenge.nonce
    || message.requestId !== challenge.challengeId || message.expirationTime?.getTime() !== Date.parse(challenge.expiresAt)
    || message.statement !== "Sign in to ImPacks. This signature does not authorize a payment.") {
    throw new Error("The wallet sign-in request does not match your account, network or site.");
  }
}
