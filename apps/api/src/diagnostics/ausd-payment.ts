import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { randomUUID } from "node:crypto";
import { encodeFunctionData, erc20Abi, getAddress, stringToHex } from "viem";
import { buildApp } from "../app.js";
import { readAusdConfig, verifyAusdConnectivity } from "../providers/ausd/index.js";
import type { CheckoutPurchase, WalletChallenge, WalletSession } from "@impacks/contracts";

// Interactive operator diagnostic, not an unattended payer. No wallet/private key API and no broadcast calls.
const terminal = createInterface({ input: stdin, output: stdout });
let app: ReturnType<typeof buildApp> | undefined;
try {
  const config = readAusdConfig();
  if (!config.recipientAddress || !process.env.APP_ORIGIN || !process.env.INTERNAL_FULFILLMENT_KEY || process.env.INTERNAL_FULFILLMENT_KEY.length < 32 || process.env.AUSD_DATABASE_PATH === ":memory:") throw new Error("Missing configuration");
  console.log(JSON.stringify(await verifyAusdConnectivity(config), null, 2));
  console.log("TESTNET ONLY. This diagnostic never signs or broadcasts. A new payment needs explicit operator approval through your wallet.");
  const buyer = getAddress(await terminal.question("Separate buyer PUBLIC wallet address: "));
  if (buyer === config.recipientAddress) throw new Error("Use a separate buyer");
  app = buildApp();
  const origin = process.env.APP_ORIGIN;
  const challengeResponse = await app.inject({ method: "POST", url: "/api/auth/wallet/challenge", headers: { origin }, payload: { walletAddress: buyer } });
  if (challengeResponse.statusCode !== 200) throw new Error("Challenge failed");
  const challenge = challengeResponse.json<WalletChallenge>();
  console.log("Review this login message, then sign it in your wallet on your configured application origin. It does not authorize a payment:");
  console.log(challenge.message);
  console.log("Wallet-console request (inspect before running; signature only):");
  console.log(`await window.ethereum.request(${JSON.stringify({ method: "personal_sign", params: [stringToHex(challenge.message), buyer] })})`);
  const signature = await terminal.question("Paste only the resulting login SIGNATURE (never a key or recovery phrase): ");
  const login = await app.inject({ method: "POST", url: "/api/auth/wallet/verify", headers: { origin }, payload: { challengeId: challenge.challengeId, signature } });
  if (login.statusCode !== 200) throw new Error("Signature authentication failed");
  const session = login.json<WalletSession>();
  const headers = { origin, authorization: `Bearer ${session.token}` };
  const created = await app.inject({ method: "POST", url: "/api/checkout", headers, payload: { packType: "starter" } });
  if (created.statusCode !== 201) throw new Error("Checkout failed");
  const purchase = created.json<CheckoutPurchase>();
  if (purchase.amountAtomic !== "1000000" || purchase.chainId !== 84532) throw new Error("Unexpected checkout");
  console.log(JSON.stringify({ purchase, unsignedWalletInstruction: { chainId: "0x14a34", from: buyer, to: purchase.tokenAddress, value: "0x0",
    data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [getAddress(purchase.recipientAddress), 1000000n] }) } }, null, 2));
  console.log("STOP for explicit approval before a new transfer. If approved, pay via your wallet before checkout expiry. No send request is executed by this tool.");
  await app.close(); app = buildApp();
  const persisted = await app.inject({ url: `/api/checkout/${purchase.purchaseId}`, headers });
  if (persisted.statusCode !== 200 || persisted.json().purchaseId !== purchase.purchaseId) throw new Error("Restart persistence failed");
  const transactionHash = await terminal.question("Existing approved testnet payment hash (blank exits without sending): ");
  if (transactionHash) {
    let verified = await app.inject({ method: "POST", url: `/api/checkout/${purchase.purchaseId}/verify`, headers, payload: { transactionHash } });
    while (verified.statusCode === 425 || verified.statusCode === 503) {
      console.log(`Verification retryable (${verified.statusCode}); same hash retained.`);
      if (await terminal.question("Wait for 12+ confirmations/RPC recovery, then enter retry (anything else exits): ") !== "retry") break;
      verified = await app.inject({ method: "POST", url: `/api/checkout/${purchase.purchaseId}/verify`, headers, payload: { transactionHash } });
    }
    if (verified.statusCode !== 200 || verified.json().status !== "confirmed") throw new Error("Live payment not verified; reauthenticate and retry the existing purchase if needed");
    await app.close(); app = buildApp();
    const restored = await app.inject({ url: `/api/checkout/${purchase.purchaseId}`, headers });
    if (restored.statusCode !== 200 || restored.json().status !== "confirmed") throw new Error("Confirmed persistence failed");
    const second = await app.inject({ method: "POST", url: "/api/checkout", headers, payload: { packType: "starter" } });
    if (second.statusCode !== 201) throw new Error("Replay-test checkout failed");
    const replay = await app.inject({ method: "POST", url: `/api/checkout/${second.json().purchaseId}/verify`, headers, payload: { transactionHash } });
    if (replay.statusCode !== 409 || replay.json().error.code !== "TRANSACTION_ALREADY_USED") throw new Error("Replay protection failed");
    const job = await app.inject({ method: "POST", url: `/api/internal/checkout/${purchase.purchaseId}/fulfillment/claim`,
      headers: { authorization: `Bearer ${process.env.INTERNAL_FULFILLMENT_KEY}` }, payload: { requestId: randomUUID() } });
    if (job.statusCode !== 200) throw new Error("Fulfillment authorization failed");
    console.log(JSON.stringify({ evidence: "genuine-base-sepolia-receipt-verified", purchaseId: purchase.purchaseId,
      transactionHash, fulfillmentId: job.json().fulfillmentId, restartPersistence: true, replayRejected: true }, null, 2));
  } else console.log("No real payment was verified. Checkout retained; no transfer sent.");
  await app.inject({ method: "POST", url: "/api/auth/wallet/logout", headers, payload: {} });
} catch {
  console.error("Diagnostic incomplete. Check configuration, wallet signature/session expiry, purchase expiry and receipt status. No transfer was sent by this tool. Existing records are retained; do not pay again blindly.");
  process.exitCode = 1;
} finally { await app?.close(); terminal.close(); }
