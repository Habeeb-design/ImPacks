# Stage 1: AUSD → Gemini sandbox orchestration

This is preparation and durable accounting, **not an order-submission integration**.
No exchange credentials, order HTTP requests, terms acceptance, blockchain transfers,
x402, refunds or pack issuance are implemented here. `paymentEnabled` stays false.
AUSD on Ethereum Sepolia and Gemini's separately pre-funded sandbox USD are independent.
The 1:1 nominal mapping is internal demonstration accounting, not conversion, backing,
a deposit into Gemini, or a promise of redeemability.

## Payment authority and reservation

Only the existing SQLite-confirmed, authenticated-wallet-owned purchase can fund an
execution. The worker first claims the existing fulfillment lease (see
[FULFILLMENT.md](FULFILLMENT.md)). The execution then uses that durable fulfillmentId
as its primary key and purchaseId as a second unique key. Wallet identity, chain,
tier, price and budget come from stored server records, never a worker/browser price
or supplied transaction hash. Starter/Premium/Ultimate reserve 100/300/500 integer
sandbox USD cents respectively, against the verified 1/3/5 AUSD price.

A reservation is a per-purchase accounting liability, not an exchange balance hold.
The full budget stays reserved, including remainder and unknown outcomes. This stage
never releases it or reassigns it to another execution. A shared sandbox treasury
balance reservation/admission check is required before order submission is enabled.

Schema 3 adds `sandbox_executions` and `sandbox_order_intents` to the existing SQLite
file, without replacing auth, checkout, fulfillment or replay records. Fulfillment
IDs, purchase IDs, client order IDs and non-null exchange order IDs are unique.
Transactions serialize reservations, selections and observations across connections.
Use one durable local SQLite file; independent files/multi-host replicas are unsafe.
Back up the volume before deployment; migration runs on application startup.

## Trusted internal contract

All endpoints use `Authorization: Bearer <INTERNAL_FULFILLMENT_KEY>`, HTTPS outside
local development, and reject requests containing an Origin header. The credential
must remain server-side. Lack of an Origin header alone is NOT authentication.
Existing wallet/demo sessions cannot authorize these endpoints. Responses are no-store.

Base: `/api/internal/checkout/:purchaseId/execution`

| Method / suffix | Request | Behavior |
| --- | --- | --- |
| GET base | None | Retrieve persisted execution and order observations |
| POST `/reserve` | `{requestId, attempt}` | Require active fulfillment lease; reserve once |
| POST `/prepare` | `{requestId, attempt}` | Require reservation and active lease; persist one selection and order intents |
| POST `/report` | Cumulative observation below | Require active lease; atomically record observation and derive execution state |

`SandboxExecution`, `SandboxOrderIntent` and strict report validation live in
`@impacks/contracts`. The server-only typed client is
`apps/api/src/clients/execution.ts`; there are deliberately no browser methods for
internal operations. Existing frontend checkout APIs and types are unchanged.

Execution contains fulfillmentId, purchaseId, verified wallet/chain identity, frozen
pack configuration, budgetCents, reservedCents, timestamps, orders and server-derived
state: `pending`, `processing`, `partial`, `completed`, `failed`, or
`reconciliation-required`. Every response has `mode: sandbox`,
`submissionEnabled: false`, and `accountingRule: demo-nominal-1:1`.

Server policy currently maps each tier to three mixed-theme cards. `drawCards`
retains existing server randomness and whole-contract allocation. Discovery is
adapted selectively from `mekila` commit `31d80d54c386dc2cf9f081dac4dd8909d8d6e52d`.
Only the current shared crypto/sports themes are supported. Discovery reads public
production market data; this does not establish sandbox instrument availability.
No fixture fallback is used on discovery failure. Network failure returns 503 and
preserves the reservation. Insufficient allocation/eligible markets returns 409.
No selection is committed on failure; once committed it is never rerolled.

Each prepared order has a server UUID clientOrderId, market/side, integer whole
quantity, integer limit price, and a fee reserve. Preparation uses **10% of each
allocation rounded up as a demonstration allowance, not a verified Gemini fee cap**.
Quantity × limit price + fee reserve must fit that allocation and the total budget.
The live adapter must replace this allowance with a verified conservative fee bound
and enforce it before any submission. Starter may not fund three whole contracts at
current prices; do not silently increase its budget or debit extra AUSD.

## Gemini developer: report and recovery protocol

A report is an authenticated server observation, never a frontend entitlement:

```json
{
  "requestId": "current-fulfillment-lease-uuid",
  "attempt": 1,
  "clientOrderId": "stored-order-intent-uuid",
  "revision": 1,
  "state": "open",
  "exchangeOrderId": "sandbox-exchange-order-id",
  "filledQuantity": 0,
  "costCents": 0,
  "feeCents": 0
}
```

States are `unknown`, `open`, `filled`, `cancelled`, `rejected`. Values are cumulative,
not deltas. Exact same-revision retries are idempotent; conflicting/stale/skipped
revisions return 409. Quantity/cost/fees cannot decrease. Exchange ID cannot change
or credit another intent. Terminal observations are immutable; report a terminal
state only after final fill/fee reconciliation, including fills before cancellation.
Never treat an accepted/open order as a holding or zero the fills of a cancelled
order. `filled` requires the entire requested quantity. Existing card projections
retain actual quantities/costs; `feeCents` is separate from card `spentCents`.

Unknown submission outcomes must be queried **by the stored clientOrderId**. Never
create another ID, reroll, submit again based on a timeout, or infer rejection from a
single transient not-found response. Unknown is sticky `reconciliation-required`;
no automated clearance/resubmission/release exists in Stage 1. Fills, costs and fees
above prepared limits are retained as actual liabilities and also freeze execution
for reconciliation, rather than hiding them by rejecting the evidence.

A future submitting worker must durably mark an intent as possibly submitted BEFORE
network I/O, enforce one submission permit, query after any crash, and preserve the
same clientOrderId. Current leases fence database writes only, not remote side
effects. Do not wire the old `PackService.orders.buy` path to an exchange: the new
Gemini provider's legacy payment confirmation and order methods fail closed.

`completed` means all order observations are fully filled; `partial` means some
quantity filled (other orders may still be outstanding); `failed` requires all
orders terminal with no fills. Neither completed nor failed releases the reservation
or issues cards. Existing fulfillment completion rejects execution-managed purchases
in Stage 1. The future issuer must persist one card result per fulfillmentId and
reconcile outstanding orders before final issuance/settlement. No automatic refunds.

## Before the first sandbox order

- Agree on shared themes and low-budget whole-contract pack behavior with Gemini/frontend owners.
- Implement a sandbox-only adapter with a fixed/allowlisted sandbox trading host; keep production discovery separate.
- Verify sandbox symbols, API protocol, final fees, precision/rounding and fill/cancellation semantics against authoritative Gemini documentation and sandbox evidence.
- Reserve available pre-funded sandbox USD across all executions; never rely on AUSD to fund Gemini.
- Add durable submission permits, per-key nonce coordination and reconciliation by clientOrderId, including the crash-before/after-network boundary.
- Implement audited reconciliation clearance and safe handling of late fills/fees, post-payment reorgs, balances, rate limits and provider outages.
- Add durable card issuance keyed by fulfillmentId, then integrate frontend result retrieval without exposing internal credentials.
- Run an explicitly approved end-to-end Ethereum Sepolia/sandbox smoke test. Do not enable mainnet or production trading.

No new environment variables or dependencies are required for Stage 1. Continue
using AUSD_DATABASE_PATH, APP_ORIGIN, INTERNAL_FULFILLMENT_KEY and the existing AUSD
RPC/token/recipient/confirmation settings. Gemini API keys are not used at this stage.

Refund preparation now consumes this ledger; see [REFUNDS.md](REFUNDS.md). Stage 1
reports alone do not authorize refunds. Authoritative final settlement is still
missing, and broadcasting remains disabled.
