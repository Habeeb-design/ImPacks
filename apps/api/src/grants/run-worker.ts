import { grantConfig, required } from "./config.js";
import { grantPool, withGrantWorkerLock } from "./database.js";
import { GrantStore } from "./store.js";
import { createGrantChain } from "./chain.js";
import { createGrantUserLookup } from "./privy-user.js";
import { grantTick } from "./worker.js";

async function run() {
  const config = grantConfig();
  if (!config) throw new Error("Welcome grants are disabled");
  const key = required(process.env, "WELCOME_GRANTS_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Invalid funding key format");
  const chain = createGrantChain(config, key as `0x${string}`);
  const lookup = createGrantUserLookup(config.appId, required(process.env, "PRIVY_APP_SECRET"));
  const pool = grantPool(config);
  pool.on("error", () => console.error("Welcome-grant database connection unavailable"));
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  try {
    await new GrantStore(pool).bind(config);
    console.log("Welcome-grant worker: Ethereum Sepolia, 50 test AUSD per eligible user");
    while (!stopping) {
      try { await withGrantWorkerLock(pool, store => grantTick(store, lookup, chain, config)); }
      catch { console.error("Welcome-grant tick unavailable; durable transactions will be reconciled on retry"); }
      if (!stopping) await new Promise(resolve => setTimeout(resolve, 3000));
    }
  } finally { await pool.end(); }
}
// Do not print RPC/SDK errors that can contain credentials or signed payloads.
run().catch(() => { console.error("Welcome-grant worker could not start; verify its configuration, migration and funding wallet"); process.exitCode = 1; });
