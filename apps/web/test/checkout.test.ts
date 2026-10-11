import test from "node:test";
import assert from "node:assert/strict";
import { createSiweMessage } from "viem/siwe";
import { DISCLOSURE_VERSION, type WalletChallenge } from "@impacks/contracts";
import { checkoutAttemptKey, restoreCheckoutAttempt, validateCheckoutChallenge } from "../src/lib/checkout.js";

test("checkout retries retain edition, consent, budget and key and are isolated by wallet", () => {
  const attempt = { key: "saved-request-123", body: { packType: "category", packId: "sports", budgetCents: 5000, disclosureVersion: DISCLOSURE_VERSION } };
  assert.deepEqual(restoreCheckoutAttempt(JSON.stringify(attempt), "sports"), { ...attempt, purchaseId: undefined });
  assert.equal(restoreCheckoutAttempt(JSON.stringify(attempt), "crypto"), null);
  assert.equal(restoreCheckoutAttempt(JSON.stringify({ ...attempt, body: { ...attempt.body, budgetCents: 1 } }), "sports"), null);
  assert.equal(restoreCheckoutAttempt("{broken", "sports"), null);
  assert.notEqual(checkoutAttemptKey("0xaaa", "sports"), checkoutAttemptKey("0xbbb", "sports"));
  assert.equal(checkoutAttemptKey("0xAAA", "sports"), checkoutAttemptKey("0xaaa", "sports"));
});

test("wallet signs only the checkout login challenge matching the account, origin, chain and purpose", () => {
  const address = "0x1111111111111111111111111111111111111111", origin = "http://localhost:3000";
  const now = new Date(), expiresAt = new Date(now.getTime() + 300000);
  const challenge: WalletChallenge = { challengeId: "5b463cc2-1cb7-4b4c-b517-d83b4a0e2de7", walletAddress: address,
    origin, domain: "localhost:3000", nonce: "abcdef12345678", chainId: 11155111, issuedAt: now.toISOString(), expiresAt: expiresAt.toISOString(), message: "" };
  challenge.message = createSiweMessage({ domain: challenge.domain, address, uri: origin, version: "1", chainId: challenge.chainId,
    nonce: challenge.nonce, issuedAt: now, expirationTime: expiresAt, requestId: challenge.challengeId,
    statement: "Sign in to ImPacks. This signature does not authorize a payment." });
  assert.doesNotThrow(() => validateCheckoutChallenge(challenge, address, origin));
  assert.throws(() => validateCheckoutChallenge(challenge, "0x2222222222222222222222222222222222222222", origin));
  assert.throws(() => validateCheckoutChallenge(challenge, address, "https://another.example"));
  assert.throws(() => validateCheckoutChallenge({ ...challenge, message: challenge.message.replace("11155111", "84532") }, address, origin));
  assert.throws(() => validateCheckoutChallenge({ ...challenge, message: challenge.message.replace("Sign in to ImPacks.", "Approve a transfer.") }, address, origin));
  assert.throws(() => validateCheckoutChallenge(challenge, address, origin, expiresAt.getTime()));
});
