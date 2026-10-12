import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { FulfillmentAuthorization, FulfillmentAttemptRequest, FulfillmentCompleteRequest } from "@impacks/contracts";
import { CheckoutStore } from "../storage/checkout.js";
import { HttpError } from "../errors.js";

const leaseMs = 5 * 60_000;
const hash = (value: string) => createHash("sha256").update(value).digest();

/** Server-to-server credential, independent of wallet and demo session tokens. */
export function authorizeFulfillment(key: string | undefined, authorization: string | undefined, origin: string | undefined) {
  if (!key || key.length < 32) throw new HttpError(503, "FULFILLMENT_NOT_CONFIGURED", "Configure a strong internal fulfillment credential.");
  if (origin !== undefined) throw new HttpError(403, "INTERNAL_ONLY", "Fulfillment is a server-to-server operation.");
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!supplied || !timingSafeEqual(hash(supplied), hash(key))) throw new HttpError(401, "INTERNAL_UNAUTHORIZED", "Internal backend authentication required.");
}

/** Authorizes work but never issues a pack. External issuance MUST deduplicate by fulfillmentId. */
export class FulfillmentService {
  constructor(private readonly store: CheckoutStore, private readonly advanceAllowed: (id: string) => boolean = () => false) {}

  get(purchaseId: string): FulfillmentAuthorization {
    const row = this.store.db.prepare("SELECT * FROM checkout_fulfillments WHERE purchase_id = ?").get(purchaseId);
    if (!row) throw new HttpError(404, "FULFILLMENT_NOT_FOUND", "No fulfillment authorization exists.");
    const purchase = this.store.get(purchaseId);
    return { fulfillmentId: row.id as string, purchaseId, buyerAddress: purchase.buyerAddress,
      packType: purchase.packType, transactionHash: purchase.transactionHash, status: row.status as FulfillmentAuthorization["status"],
      requestId: row.request_id as string, attempt: row.attempt as number,
      leaseExpiresAt: new Date(Number(row.lease_expires_at)).toISOString(), recoveryRequired: Boolean(row.recovery_required),
      createdAt: row.created_at as string, updatedAt: row.updated_at as string,
      fulfilledAt: row.fulfilled_at as string | null, resultId: row.result_id as string | null };
  }

  claim(purchaseId: string, requestId: string): FulfillmentAuthorization {
    return this.store.transaction(() => {
      const purchase = this.store.get(purchaseId);
      if ((purchase.status !== "confirmed" && !this.advanceAllowed(purchaseId)) || !this.store.hasVerifiedOwner(purchaseId)) {
        throw new HttpError(409, "PURCHASE_NOT_AUTHORIZED", "A confirmed, wallet-owned purchase is required.");
      }
      const row = this.store.db.prepare("SELECT * FROM checkout_fulfillments WHERE purchase_id = ?").get(purchaseId);
      const now = Date.now(), timestamp = new Date(now).toISOString();
      if (!row) {
        this.store.db.prepare(`INSERT INTO checkout_fulfillments
          (purchase_id, id, status, request_id, attempt, lease_expires_at, created_at, updated_at)
          VALUES (?, ?, 'processing', ?, 1, ?, ?, ?)`)
          .run(purchaseId, randomUUID(), requestId, now + leaseMs, timestamp, timestamp);
      } else if (row.status !== "fulfilled") {
        if (Number(row.lease_expires_at) > now) {
          if (row.request_id !== requestId) throw new HttpError(409, "FULFILLMENT_BUSY", "Another worker holds the active lease.");
        } else {
          if (row.request_id === requestId) throw new HttpError(409, "LEASE_EXPIRED", "Recover with a new request ID and the existing fulfillment ID.");
          this.store.db.prepare(`UPDATE checkout_fulfillments SET request_id = ?, attempt = attempt + 1,
            lease_expires_at = ?, recovery_required = 1, updated_at = ? WHERE purchase_id = ?`)
            .run(requestId, now + leaseMs, timestamp, purchaseId);
        }
      }
      return this.get(purchaseId);
    });
  }

  private checkAttempt(job: FulfillmentAuthorization, input: FulfillmentAttemptRequest) {
    if (job.requestId !== input.requestId || job.attempt !== input.attempt) {
      throw new HttpError(409, "STALE_FULFILLMENT_ATTEMPT", "This attempt no longer owns the fulfillment.");
    }
  }

  renew(purchaseId: string, input: FulfillmentAttemptRequest): FulfillmentAuthorization {
    return this.store.transaction(() => {
      const job = this.get(purchaseId);
      this.checkAttempt(job, input);
      if (job.status === "fulfilled") return job;
      if (Date.parse(job.leaseExpiresAt) <= Date.now()) throw new HttpError(409, "LEASE_EXPIRED", "Recover with a new request ID.");
      this.store.db.prepare("UPDATE checkout_fulfillments SET lease_expires_at = ?, updated_at = ? WHERE purchase_id = ?")
        .run(Date.now() + leaseMs, new Date(Date.now()).toISOString(), purchaseId);
      return this.get(purchaseId);
    });
  }

  complete(purchaseId: string, input: FulfillmentCompleteRequest): FulfillmentAuthorization {
    return this.store.transaction(() => {
      const job = this.get(purchaseId);
      this.checkAttempt(job, input);
      if (job.status === "fulfilled") {
        if (job.resultId !== input.resultId) throw new HttpError(409, "FULFILLMENT_RESULT_CONFLICT", "A different result is already recorded.");
        return job;
      }
      if (Date.parse(job.leaseExpiresAt) <= Date.now()) throw new HttpError(409, "LEASE_EXPIRED", "Recover and reconcile the existing fulfillment before completion.");
      if (this.store.db.prepare("SELECT 1 FROM sandbox_executions WHERE purchase_id = ?").get(purchaseId)) {
        throw new HttpError(409, "EXECUTION_ISSUANCE_DISABLED", "Stage 1 execution cannot issue cards or complete fulfillment yet.");
      }
      const existing = this.store.db.prepare("SELECT purchase_id FROM checkout_fulfillments WHERE result_id = ?").get(input.resultId);
      if (existing) throw new HttpError(409, "FULFILLMENT_RESULT_CONFLICT", "Result is already assigned to another purchase.");
      const now = new Date(Date.now()).toISOString();
      this.store.db.prepare(`UPDATE checkout_fulfillments SET status = 'fulfilled', result_id = ?, fulfilled_at = ?, updated_at = ?
        WHERE purchase_id = ?`).run(input.resultId, now, now, purchaseId);
      return this.get(purchaseId);
    });
  }
}
