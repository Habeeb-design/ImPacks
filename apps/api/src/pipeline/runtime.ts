import { createHash } from "node:crypto";
import { CheckoutStore, defaultCheckoutDatabasePath } from "../storage/checkout.js";
import { CheckoutService } from "../services/checkout.js";
import { RefundService } from "../services/refunds.js";
import { configuredPaymentVerifier } from "../providers/ausd/verify.js";
import { configuredRefundVerifier } from "../providers/ausd/refund.js";
import { PipelineStore } from "./store.js";
import { GeminiSandboxGateway } from "./gemini.js";
import { PurchaseWorker } from "./worker.js";
import type { RefundTransport } from "./ports.js";

export function configuredPipeline(store: CheckoutStore, env: NodeJS.ProcessEnv = process.env) {
  if (env.SANDBOX_PIPELINE_ENABLED !== "1") return undefined;
  if (store.storage !== "sqlite" || env.VERCEL === "1" || env.IMPACKS_EMBEDDED_DEMO === "1") throw new Error("Sandbox pipeline requires a standalone durable API");
  if (!env.GEMINI_API_KEY || !env.GEMINI_API_SECRET) throw new Error("Configure sandbox credentials");
  if (!env.GEMINI_SANDBOX_BUDGET_CENTS || !env.GEMINI_FEE_RESERVE_BPS) throw new Error("Configure an explicit sandbox USD ceiling and fee reservation policy");
  return new PipelineStore(store, { accountKey: createHash("sha256").update(env.GEMINI_API_KEY).digest("hex"),
    capacityCents: Number(env.GEMINI_SANDBOX_BUDGET_CENTS), feeReserveBps: Number(env.GEMINI_FEE_RESERVE_BPS) });
}
export function createPurchaseWorker(transfers?: RefundTransport, env: NodeJS.ProcessEnv = process.env) {
  const store = new CheckoutStore(env.AUSD_DATABASE_PATH ?? defaultCheckoutDatabasePath);
  try {
    const ledger = configuredPipeline(store, env);
    if (!ledger) throw new Error("Set SANDBOX_PIPELINE_ENABLED=1 to start the worker");
    const payments = configuredPaymentVerifier();
    const checkout = new CheckoutService(env.AUSD_RECIPIENT_ADDRESS, store, payments);
    const refunds = new RefundService(store, env.AUSD_RECIPIENT_ADDRESS, configuredRefundVerifier(), ledger);
    const gateway = new GeminiSandboxGateway(ledger, env.GEMINI_API_KEY!, env.GEMINI_API_SECRET!, env.GEMINI_NONCE_MODE === "incremental" ? "incremental" : "time");
    return { store, ledger, worker: new PurchaseWorker(ledger, gateway, checkout, payments, refunds, transfers) };
  } catch (error) { store.close(); throw error; }
}
