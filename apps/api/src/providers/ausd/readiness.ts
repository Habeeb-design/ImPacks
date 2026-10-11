import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { erc20Abi } from "viem";
import { defaultCheckoutDatabasePath } from "../../storage/checkout.js";
import { createAusdClient, readAusdConfig, verifyAusdConnectivity } from "./index.js";

/** Prints presence/check results only; never credential-bearing RPC URLs or internal tokens. */
export async function ausdReadiness(env: NodeJS.ProcessEnv = process.env) {
  const required = ["AUSD_RPC_URL", "AUSD_CONTRACT_ADDRESS", "AUSD_RECIPIENT_ADDRESS", "APP_ORIGIN", "INTERNAL_FULFILLMENT_KEY"];
  const blockers = required.filter(key => !env[key]).map(key => `MISSING_${key}`);
  const confirmations = Number(env.AUSD_MIN_CONFIRMATIONS ?? 12);
  if (!Number.isInteger(confirmations) || confirmations < 12 || confirmations > 10000) blockers.push("INVALID_CONFIRMATION_DEPTH");
  if (env.INTERNAL_FULFILLMENT_KEY && env.INTERNAL_FULFILLMENT_KEY.length < 32) blockers.push("WEAK_INTERNAL_CREDENTIAL");
  if (env.APP_ORIGIN) {
    try {
      const origin = new URL(env.APP_ORIGIN);
      if (origin.origin !== env.APP_ORIGIN || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))) throw new Error();
    } catch { blockers.push("INVALID_APP_ORIGIN"); }
  }
  let connectivity: Awaited<ReturnType<typeof verifyAusdConnectivity>> | null = null;
  let treasury: { address: string; ausdBalanceAtomic: string; gasBalanceWei: string; controlVerified: false } | null = null;
  try {
    const config = readAusdConfig(env);
    connectivity = await verifyAusdConnectivity(config);
    if (config.recipientAddress) {
      const client = createAusdClient(config);
      const [ausd, gas] = await Promise.all([
        client.readContract({ address: config.tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [config.recipientAddress] }),
        client.getBalance({ address: config.recipientAddress }),
      ]);
      treasury = { address: config.recipientAddress, ausdBalanceAtomic: ausd.toString(), gasBalanceWei: gas.toString(), controlVerified: false };
    }
  } catch { blockers.push("RPC_OR_TOKEN_CONFIGURATION_UNVERIFIED"); }
  const path = env.AUSD_DATABASE_PATH ?? defaultCheckoutDatabasePath;
  let database: { schema: number; purchaseCount: number; confirmedCount: number } | null = null;
  if (path === ":memory:" || !existsSync(path)) blockers.push("DURABLE_DATABASE_UNAVAILABLE");
  else {
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(path, { readOnly: true });
      database = { schema: Number(db.prepare("PRAGMA user_version").get()!.user_version),
        purchaseCount: Number(db.prepare("SELECT count(*) AS n FROM checkout_purchases").get()!.n),
        confirmedCount: Number(db.prepare("SELECT count(*) AS n FROM checkout_purchases WHERE status='confirmed'").get()!.n) };
    } catch { blockers.push("DATABASE_READ_FAILED"); }
    finally { db?.close(); }
  }
  blockers.push("TREASURY_CONTROL_NOT_ATTESTED", "LIVE_PAYMENT_EVIDENCE_REQUIRED", "GEMINI_FINAL_RECONCILIATION_REQUIRED", "ISSUER_AND_ROLLOUT_SAFEGUARDS_REQUIRED");
  return { paymentEnabled: false, refundBroadcastEnabled: false, confirmations, connectivity, treasury, database, blockers };
}
