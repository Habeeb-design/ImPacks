import { verifyAusdConnectivity } from "./index.js";

try {
  const result = await verifyAusdConnectivity();
  console.log(JSON.stringify({ status: "ok", scope: "testnet-connectivity-only", ...result }, null, 2));
} catch {
  // RPC errors can contain credential-bearing URLs. Never print raw provider errors.
  console.error("AUSD connectivity check failed. Check AUSD_RPC_URL, AUSD_CONTRACT_ADDRESS and optional AUSD_RECIPIENT_ADDRESS; verify RPC availability, chain 84532, deployed bytecode and 6 decimals. RPC details withheld to protect credentials.");
  process.exitCode = 1;
}
