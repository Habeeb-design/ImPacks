import { grantConfig } from "./config.js";
import { grantPool } from "./database.js";
import { grantSchema } from "./schema.js";
import { GrantStore } from "./store.js";

const config = grantConfig();
if (!config) throw new Error("Configure and enable welcome grants before running their migration");
const pool = grantPool(config);
try {
  await pool.query(grantSchema);
  await new GrantStore(pool).bind(config);
  console.log("Welcome-grant schema ready (no transfers sent)");
} finally { await pool.end(); }
