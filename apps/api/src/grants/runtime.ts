import { grantConfig, required } from "./config.js";
import { grantPool } from "./database.js";
import { GrantStore } from "./store.js";

export async function createGrantApi(env: NodeJS.ProcessEnv = process.env) {
  const config = grantConfig(env);
  if (!config) return null;
  const webhookSecret = required(env, "PRIVY_WEBHOOK_SIGNING_SECRET");
  const pool = grantPool(config);
  pool.on("error", () => console.error("Welcome-grant database connection unavailable"));
  const store = new GrantStore(pool);
  try { await store.bind(config); }
  catch (error) { await pool.end(); throw error; }
  return { store, webhookSecret, close: () => pool.end() };
}
