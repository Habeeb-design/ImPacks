import pg from "pg";
import { GrantStore } from "./store.js";
import type { GrantConfig } from "./config.js";

export function grantPool(config: GrantConfig) {
  return new pg.Pool({ connectionString: config.databaseUrl, max: 4, connectionTimeoutMillis: 8000,
    statement_timeout: 15000, application_name: "impacks-welcome-grants" });
}

// Session-level lock serializes funding across API worker replicas. Keep the
// same connection for all writes and destroy it if unlocking fails.
// Retain this lock key across network migrations so old/new workers still exclude
// each other if accidentally pointed at the same database. It is not a chain setting.
export async function withGrantWorkerLock(pool: pg.Pool, work: (store: GrantStore) => Promise<void>) {
  const client = await pool.connect();
  let locked = false;
  let broken = false;
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock(84532, 50000000) AS locked")).rows[0].locked;
    if (locked) await work(new GrantStore(client));
  } finally {
    if (locked) {
      try { await client.query("SELECT pg_advisory_unlock(84532, 50000000)"); }
      catch { broken = true; }
    }
    client.release(broken);
  }
}
