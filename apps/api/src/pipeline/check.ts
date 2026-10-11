import { createHash } from "node:crypto";
import { CheckoutStore } from "../storage/checkout.js";
import { PipelineStore } from "./store.js";
import { GeminiSandboxGateway } from "./gemini.js";
// Read-only diagnostic: no purchase worker, signer, order or terms-accept call.
const key = process.env.GEMINI_API_KEY, secret = process.env.GEMINI_API_SECRET;
if (!key || !secret) throw new Error("Configure Gemini sandbox credentials in server secrets");
const store = new CheckoutStore(":memory:");
try {
  const ledger = new PipelineStore(store, { accountKey: createHash("sha256").update(key).digest("hex"), capacityCents: 1, feeReserveBps: 0 });
  const gateway = new GeminiSandboxGateway(ledger, key, secret, process.env.GEMINI_NONCE_MODE === "incremental" ? "incremental" : "time");
  const result = await gateway.readiness();
  const markets = await gateway.markets("crypto");
  console.log(JSON.stringify({ authenticated: true, availableSandboxUsdCents: result.availableCents, supportedCryptoMarkets: markets.length, ordersSubmitted: 0 }));
} catch (error) {
  // Adapter errors contain only status/validation information, never credentials or headers.
  console.error(error instanceof Error ? error.message.slice(0, 500) : "Sandbox readiness failed"); process.exitCode = 1;
} finally { store.close(); }
