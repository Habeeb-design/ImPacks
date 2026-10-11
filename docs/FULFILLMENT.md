# Internal pack fulfillment contract

Audience: the Gemini/pack-generation backend developer. This contract authorizes
work; it does not implement Gemini calls, random selection, or pack issuance.
Shared schemas/types are in `@impacks/contracts`. All calls are JSON over the
backend connection with `Authorization: Bearer <INTERNAL_FULFILLMENT_KEY>`.
Never put that credential in the browser or a `NEXT_PUBLIC_*` variable.

## Authorization and one-time consumption

Only a purchase with `status: confirmed` and a verified wallet owner can be claimed.
The server derives buyer, pack type, and transaction hash from SQLite. The frontend
cannot select or override those values, grant authorization, or mark work complete.
One unique database row per purchase creates one stable server-generated
`fulfillmentId`. Every retry and recovery returns that same ID; a completed purchase
cannot allocate another authorization. The blockchain hash uniqueness constraint
continues to prevent the same payment from confirming another purchase.

The API authenticates the trusted backend using a separate secret (minimum 32
characters, provision at least 32 random bytes encoded as hex/base64). Missing
configuration returns 503; wrong credentials return 401; any browser Origin header
returns 403. Require TLS and restrict access to the backend network in deployment.
Origin rejection is defense in depth, not a replacement for the credential.

## Worker protocol

All paths start with `/api/internal/checkout/:purchaseId/fulfillment`.

1. Persist a worker-generated UUID `requestId` for this attempt. POST `/claim` with
   `{requestId}`. Retry a lost response with the same ID; do not generate a new ID
   each time an HTTP request times out.
2. The response is `FulfillmentAuthorization`: `fulfillmentId`, `purchaseId`,
   `buyerAddress`, `packType`, `transactionHash`, `status`, `requestId`, `attempt`,
   `leaseExpiresAt`, `recoveryRequired`, timestamps and nullable `resultId`.
3. If status is `fulfilled`, return the existing result. Do not issue anything.
   If status is `processing`, persist the immutable fulfillment ID as the issuer's
   idempotency key **before** any random draw or external side effect.
4. Before the five-minute lease expires, POST `/renew` with `{requestId, attempt}`
   when more time is needed. Use the returned expiry. A different active worker
   receives 409 `FULFILLMENT_BUSY`; an expired attempt cannot renew itself.
5. Persist the issued result in the issuer's own database, then POST `/complete`
   with `{requestId, attempt, resultId}`. Result IDs are 1–200 letters, digits,
   colons, underscores or hyphens. They must uniquely identify one durable pack.
6. Duplicate completion with the same attempt/result returns the original record.
   A different result is rejected. SQLite enforces a unique result ID across purchases.

GET the base path to inspect the current durable state after a restart or lost
response. It returns 404 if no authorization has been claimed. It does not acquire
or extend a lease. Completed state is retained permanently for replay protection.

## Recovery and exactly-once boundary

If a worker fails or its outcome is unknown, retain the authorization and existing
purchase. Never reset payment state, delete the job, refund automatically, reroll,
or allocate a second fulfillment ID.

- Before lease expiry, the same `requestId` can retrieve its original claim and resume
  by inspecting its durable issuer state. Other request IDs cannot take over.
- After lease expiry, a new request ID can claim recovery. The server increments
  `attempt`, creates a new five-minute lease, and sets `recoveryRequired: true`.
  The fulfillment ID and purchase/buyer/pack remain unchanged.
- Stale attempt numbers cannot renew or complete, even if the old worker eventually
  returns. Completion at the exact lease deadline is rejected.
- Recovery MUST first query the issuer's durable ledger and any uncertain downstream
  operation using the existing fulfillment ID. If issuance already succeeded, submit
  that same result under the new attempt. If failure is known before issuance, resume
  the original stored selection/work. If outcome is unknown, reconcile; do not blindly
  retry or interpret an eventually-consistent lookup miss as proof of no issuance.

**Required issuer guarantee:** a unique fulfillment-ID constraint, immutable stored
selection/result, and stable external idempotency keys/reconciliation for every side
effect. The issuer must enforce this even if two workers execute concurrently after
a lease timeout. A lease and attempt number fence this API's database updates; they
cannot stop an old process from submitting an external order.

This API guarantees one durable authorization and one recorded completion per
purchase. Exactly-once external pack issuance depends on the issuer implementing
the contract above. No claim that distributed side effects are exactly-once is made
until that integration is implemented and tested. `paymentEnabled` remains false.

## Errors and operational requirements

- 400: invalid body, path or extra fields; never send status/buyer/price overrides.
- 404: purchase/job missing (public wallet routes also hide other wallets' purchases).
- 409 `PURCHASE_NOT_AUTHORIZED`: payment unconfirmed or legacy record has no verified owner.
- 409 `FULFILLMENT_BUSY`: another request owns an unexpired lease.
- 409 `LEASE_EXPIRED`: use a new request ID and reconcile the existing fulfillment.
- 409 `STALE_FULFILLMENT_ATTEMPT`: stop using the stale attempt.
- 409 `FULFILLMENT_RESULT_CONFLICT`: different completion or result already assigned elsewhere.
- Transient network/database errors: inspect/retry the same operation; do not start
  a new purchase or infer a permanent failure from a timeout.

Schema version 2 uses the existing persistent SQLite volume. Auth challenges, token
hashes, ownership and fulfillment leases survive API restarts. Back up the complete
database consistently and never delete consumed transaction hashes or fulfillment
records. Multi-host deployment needs one shared transactional database; separate
SQLite files do not provide a shared replay or authorization boundary.

Remaining rollout checks: issuer-side idempotency implementation, a real signed-wallet
and testnet payment end-to-end run, rate limits, and a post-confirmation reorg policy.
The current payment verifier's 12-block minimum is L2 depth, not L1 finality.

## Execution-managed purchases

See [EXECUTION.md](EXECUTION.md). After a worker reserves an execution using the
existing fulfillment lease, Stage 1 blocks `/fulfillment/complete` for that purchase.
Order accounting completion is not card issuance. Recovery preserves fulfillmentId,
clientOrderIds, selections and the full reservation; no automatic resubmission or
refund is authorized.
