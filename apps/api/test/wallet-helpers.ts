import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { buildApp } from "../src/app.js";
import type { WalletChallenge, WalletSession } from "@impacks/contracts";

// Ephemeral test-only signers. No keys are persisted or supplied to application code.
export const walletAccount = privateKeyToAccount(generatePrivateKey());
export const otherAccount = privateKeyToAccount(generatePrivateKey());
export const appOrigin = "http://localhost:3000";
type App = ReturnType<typeof buildApp>;
type Account = typeof walletAccount;
const sessions = new WeakMap<App, Map<string, Promise<WalletSession>>>();

export async function loginWallet(app: App, account: Account = walletAccount) {
  const challengeResponse = await app.inject({ method: "POST", url: "/api/auth/wallet/challenge",
    headers: { origin: appOrigin }, payload: { walletAddress: account.address } });
  assert.equal(challengeResponse.statusCode, 200, challengeResponse.body);
  const challenge = challengeResponse.json<WalletChallenge>();
  const signature = await account.signMessage({ message: challenge.message });
  const response = await app.inject({ method: "POST", url: "/api/auth/wallet/verify",
    headers: { origin: appOrigin }, payload: { challengeId: challenge.challengeId, signature } });
  assert.equal(response.statusCode, 200, response.body);
  return response.json<WalletSession>();
}

export async function walletHeaders(app: App, account: Account = walletAccount) {
  let entries = sessions.get(app);
  if (!entries) { entries = new Map(); sessions.set(app, entries); }
  let pending = entries.get(account.address);
  if (!pending || Date.parse((await pending).expiresAt) <= Date.now()) {
    pending = loginWallet(app, account); entries.set(account.address, pending);
  }
  return { authorization: `Bearer ${(await pending).token}`, origin: appOrigin };
}

export async function walletInject(app: App, options: {
  method?: "GET" | "POST"; url: string; payload?: object; headers?: Record<string, string>;
}) {
  return app.inject({ ...options, headers: { ...await walletHeaders(app), ...options.headers } });
}
