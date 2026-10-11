import type { GrantStore } from "./store.js";
import type { GrantIdentity } from "./privy-user.js";

export interface GrantTransfer {
  prepare(recipient: `0x${string}`): Promise<{ raw: `0x${string}`; hash: `0x${string}`; nonce: number }>;
  inspect(hash: `0x${string}`, recipient: `0x${string}`): Promise<"missing" | "pending" | "confirmed" | "failed" | "invalid">;
  nonceConsumed(nonce: number): Promise<boolean>;
  broadcast(raw: `0x${string}`, expectedHash: `0x${string}`): Promise<void>;
}

// The caller must hold the database worker lock for the complete tick. All
// broadcast retries reuse durable signed bytes, including after process crashes.
export async function grantTick(store: GrantStore, lookup: (id: string) => Promise<GrantIdentity | null>,
  chain: GrantTransfer, policy: { startsAt: Date; dailyLimit: number }, now = new Date()): Promise<void> {
  const row = await store.next();
  if (!row || row.status === "needs_review") return;
  if (row.status === "prepared") {
    const state = await chain.inspect(row.tx_hash!, row.recipient as `0x${string}`);
    if (state === "confirmed" || state === "failed") { await store.finish(row.user_id, state); return; }
    if (state === "invalid") { await store.finish(row.user_id, "needs_review", "TRANSFER_MISMATCH"); return; }
    if (state === "missing") {
      if (await chain.nonceConsumed(Number(row.nonce))) {
        await store.finish(row.user_id, "needs_review", "NONCE_CONSUMED_WITHOUT_RECEIPT"); return;
      }
      try { await chain.broadcast(row.raw_transaction!, row.tx_hash!); }
      catch { await store.defer(row.user_id, "BROADCAST_UNCERTAIN"); }
    }
    return;
  }
  let identity: GrantIdentity | null;
  try { identity = await lookup(row.user_id); }
  catch { await store.defer(row.user_id, "IDENTITY_UNAVAILABLE"); return; }
  if (!identity || identity.guest || identity.createdAt < policy.startsAt || identity.createdAt > now) {
    await store.finish(row.user_id, "ineligible", "NOT_A_NEW_ELIGIBLE_USER"); return;
  }
  if (!identity.verifiedEmail || !identity.recipient) {
    await store.defer(row.user_id, "WAITING_FOR_VERIFIED_EMAIL_AND_EMBEDDED_WALLET"); return;
  }
  if (!await store.bindRecipient(row.user_id, identity.recipient)) {
    await store.finish(row.user_id, "ineligible", "WALLET_ALREADY_ALLOCATED_OR_CHANGED"); return;
  }
  if (await store.signedToday() >= policy.dailyLimit) {
    await store.defer(row.user_id, "DAILY_LIMIT", 300); return;
  }
  let tx: Awaited<ReturnType<GrantTransfer["prepare"]>>;
  try { tx = await chain.prepare(identity.recipient); }
  catch { await store.defer(row.user_id, "FUNDING_OR_RPC_UNAVAILABLE"); return; }
  // If this commit fails, do not broadcast. If the process dies after commit,
  // the next worker finds the prepared transaction and sends the same bytes.
  await store.prepared(row.user_id, tx);
  try { await chain.broadcast(tx.raw, tx.hash); }
  catch { await store.defer(row.user_id, "BROADCAST_UNCERTAIN"); }
}
