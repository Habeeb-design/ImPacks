import { AUSD_ETHEREUM_SEPOLIA, WELCOME_GRANT_AMOUNT_ATOMIC, type WelcomeGrant } from "@impacks/contracts";
import type { GrantConfig } from "./config.js";

export interface GrantRow {
  user_id: string;
  recipient: string | null;
  status: "queued" | "prepared" | "confirmed" | "ineligible" | "failed" | "needs_review";
  tx_hash: `0x${string}` | null;
  raw_transaction: `0x${string}` | null;
  nonce: string | null;
  last_error: string | null;
}
export interface Sql {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}

export class GrantStore {
  constructor(private sql: Sql) {}

  async bind(config: GrantConfig) {
    await this.sql.query(`INSERT INTO welcome_grant_settings (id, app_id, treasury, starts_at, chain_id)
      VALUES (1,$1,$2,$3,$4) ON CONFLICT DO NOTHING`, [config.appId, config.treasury, config.startsAt, AUSD_ETHEREUM_SEPOLIA.chainId]);
    const { rows } = await this.sql.query("SELECT * FROM welcome_grant_settings WHERE id=1");
    const row = rows[0];
    if (row.chain_id !== AUSD_ETHEREUM_SEPOLIA.chainId) {
      throw new Error("Grant database has a different or unknown chain binding; reconcile legacy grants before switching networks");
    }
    if (row.app_id !== config.appId || row.treasury !== config.treasury || new Date(row.starts_at).getTime() !== config.startsAt.getTime()) {
      throw new Error("Grant database is bound to a different app, treasury or start date; do not reset it to retry grants");
    }
  }
  async enqueue(userId: string): Promise<GrantRow> {
    await this.sql.query("INSERT INTO welcome_grants (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
    return (await this.get(userId))!;
  }
  async get(userId: string): Promise<GrantRow | null> {
    return (await this.sql.query("SELECT * FROM welcome_grants WHERE user_id=$1", [userId])).rows[0] ?? null;
  }
  async next(): Promise<GrantRow | null> {
    // Never skip an uncertain signed transfer to allocate another treasury nonce.
    return (await this.sql.query(`SELECT * FROM welcome_grants
      WHERE status IN ('prepared','needs_review') OR (status='queued' AND next_attempt_at <= now())
      ORDER BY CASE WHEN status='needs_review' THEN 0 WHEN status='prepared' THEN 1 ELSE 2 END, created_at, user_id LIMIT 1`)).rows[0] ?? null;
  }
  async bindRecipient(userId: string, recipient: string): Promise<boolean> {
    // ON CONFLICT is not applicable to an UPDATE; preserve the first user's wallet allocation.
    try {
      const { rows } = await this.sql.query(`UPDATE welcome_grants SET recipient=$2, updated_at=now()
        WHERE user_id=$1 AND status='queued' AND (recipient IS NULL OR recipient=$2) RETURNING user_id`, [userId, recipient.toLowerCase()]);
      return rows.length === 1;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return false;
      throw error;
    }
  }
  async signedToday(): Promise<number> {
    const { rows } = await this.sql.query(`SELECT count(*)::integer AS count FROM welcome_grants
      WHERE prepared_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
    return rows[0].count;
  }
  async prepared(userId: string, tx: { raw: string; hash: string; nonce: number }) {
    const { rows } = await this.sql.query(`UPDATE welcome_grants SET status='prepared', raw_transaction=$2,
      tx_hash=$3, nonce=$4, prepared_at=now(), updated_at=now(), last_error=NULL
      WHERE user_id=$1 AND status='queued' AND recipient IS NOT NULL RETURNING user_id`, [userId, tx.raw, tx.hash, String(tx.nonce)]);
    if (rows.length !== 1) throw new Error("Grant was not queued; refusing broadcast");
  }
  async defer(userId: string, reason: string, seconds = 30) {
    await this.sql.query(`UPDATE welcome_grants SET last_error=$2, updated_at=now(),
      next_attempt_at=now()+($3::integer * interval '1 second') WHERE user_id=$1`, [userId, reason, seconds]);
  }
  async finish(userId: string, status: "confirmed" | "ineligible" | "failed" | "needs_review", reason: string | null = null) {
    await this.sql.query(`UPDATE welcome_grants SET status=$2, last_error=$3, updated_at=now(),
      confirmed_at=CASE WHEN $2='confirmed' THEN now() ELSE confirmed_at END WHERE user_id=$1`, [userId, status, reason]);
  }
}

export function grantDto(row: GrantRow | null, enabled = true): WelcomeGrant {
  return {
    status: !enabled ? "disabled" : !row || row.status === "queued" ? "pending"
      : row.status === "prepared" ? "confirming"
      : row.status === "failed" || row.status === "needs_review" ? "needs_attention" : row.status,
    amountAtomic: WELCOME_GRANT_AMOUNT_ATOMIC, asset: "AUSD", chainId: 11155111,
    recipient: row?.recipient ?? null, transactionHash: row?.tx_hash ?? null,
  };
}
