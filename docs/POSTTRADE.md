# User-to-user position resale

Implemented first slice on `codex/posttrade`, based on preserved UI/grant commit `b09afae`, and reconciled into `codex/integration-ui-backend` alongside checkout, execution and the current UI. See [the combined test walkthrough](INTEGRATION_TEST.md).

## Product decision

The buyer receives the seller's existing quantity and its future payout rights. This is a **resale of a position**, not an option to buy it later. An actual option would need a strike, premium, expiry, exercise rule, collateral and a separate settlement model. None is created here.

There are three distinct actions:

| Action | Changes | Implementation |
| --- | --- | --- |
| Sell to another ImPacks user | Internal owner allocation and buyer/seller cash balances; underlying pooled quantity remains constant | This paper MVP |
| Exit through Gemini | Exchange position decreases; confirmed exchange sale proceeds increase | Future provider integration |
| Withdraw AUSD | Treasury sends a verified chain transfer and debits a withdrawable liability | Separate payment/refund work |

A seller-set ask and a buyer acceptance quote implement resale. Gemini's current bid may eventually be shown as a reference or offered as a separate exchange-exit quote; it is not the price of another user's fixed listing. No Gemini sell is sent when a peer buys a listing.

## What exists elsewhere

- `main`/the preserved UI: pack receipts and a simulated full-position close stored in memory. That close does not transfer ownership to another user.
- `origin/feature/ausd-payments` at `0ebf90e`: SQLite checkout/payment replay protection, wallet authentication, fulfillment leases, execution reservation and cumulative order-intent reporting; refund preparation. Submission/issuance/broadcast remain guarded, not live evidence.
- `origin/mekila` at `0713d7c`: public Gemini discovery and a sandbox buy adapter. Public production markets can be absent from the sandbox. A buy request, open order or original receipt alone does not establish transferable backing.
- Gemini documents exchange buy/sell orders and account-level positions. A direct transfer of a specified prediction position between two customer accounts has **not** been established in this review. The API documentation is not approval for pooled customer custody or operating a secondary venue.

## Shipped paper slice

The opt-in standalone API owns a durable SQLite ledger separate from the checkout database. It accepts only trusted server-side, confirmed demo fills with demo order identifiers. No browser endpoint can mint a holding or provide an owner, fill, price reference or opening. Source card and source order IDs are unique. Importing an original opening after resale never recreates the seller's holding.

Each authenticated Privy account receives a one-time **100 simulated USD** credit in this ledger. It has no relation to the 50-test-AUSD welcome grant, any wallet balance, Gemini buying power or a redeemable claim. Paper cash credits and transfer debits/credits have unique references.

The authoritative `Position` contains remaining quantity, reserved/listed quantity, available quantity, source fill, market/side, and remaining cost basis. Original pack fills stay unchanged as history. The dashboard projects remaining ownership for original fills and directs managed positions into Trade; bought-from-user positions appear in the marketplace's current-holdings view. Pack history itself is still in memory and may disappear on restart; the post-trade ledger survives.

Listings reserve quantity in a `BEGIN IMMEDIATE` transaction. Creating another listing cannot reserve it twice. Listings sell at 1–99 integer cents per whole paper contract, may fill partially across buyers, and keep their price fixed. Cancellation releases only unsold reservations. No self-trades.

A buyer quote binds buyer, listing, quantity and price for at most 30 seconds. It does not reserve the listing. Confirmation checks expiry and current availability again. One transaction debits buyer paper cash, credits seller paper cash, reduces seller ownership and reservation, creates the buyer lot with its new cost basis, records the trade, and records retry identity. A database failure rolls all of these back. Completed trades survive lost responses and return the same result on same-key retry, even after quote expiry. A quote cannot be purchased again with another key.

Paper fixtures lack authoritative market-close timestamps. To avoid pretending otherwise, their trading window ends 24 hours after the original pack opening; the UI discloses this simulation policy. Production import must instead require the actual instrument close/halts/resolution state. Quantity precision and price grids here are demo-only; real instruments require their published increments/minimums.

There is no pending exchange order in this internal paper transfer. The server either commits the entire trade or rolls it back. A lost HTTP response remains *unconfirmed in the UI* until the exact saved request is retried. We do not invent pending/partial exchange execution statuses for an atomic ownership transfer. A listing can be partially bought; each completed purchase is fully settled within the paper ledger.

The UI preserves account-scoped listing commands or accepted quotes plus idempotency keys in `sessionStorage` **before** posting. Reload restores a retry prompt. It never automatically rerolls a quote after an uncertain purchase or reuses another account's pending command. The old simulated-close route is disabled when post-trade is active so it cannot bypass reservations.

## Run locally

Requires Node 24. Keep these settings in the standalone API's ignored `.env` or its runtime environment:

```dotenv
POSTTRADE_DEMO_ENABLED=1
POSTTRADE_DB_PATH=data/posttrade.sqlite
```

Use a persistent local volume. The runtime refuses `:memory:`, Vercel and embedded Next demo hosting. This SQLite design is for a standalone service on one host, not independent per-replica files or a network filesystem. Multiple connections to the same database serialize writes. Existing tests inject an in-memory database only for unit isolation.

```sh
npm ci
npm run dev
```

Open `/marketplace` from the Trade navigation item. Configure the usual public Privy app ID and backend verifier, sign in with two different test accounts, open a paper pack as A, list quantity, and purchase as B. Check A's remaining quantity/cash and B's holding/cash. Refresh both pages and restart the API, then sign in again; replay the original request and verify no second transfer. These instructions require no funding private key.

## Integration contract

Shared types and schemas are in `packages/contracts/src/posttrade.ts`, re-exported by the contracts package. Endpoints are namespaced under `/api/posttrade` so they do not redefine the integration branch's purchase, execution or refund routes. They use the current API session established from a verified Privy token; arbitrary demo identities are rejected.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/posttrade/portfolio` | Own current lots, paper cash, listings and trade history; imports only own server-held eligible demo fills |
| `GET /api/posttrade/listings` | Open paper listings, with `mine` scoped to the caller |
| `POST /api/posttrade/listings` | `{positionId, quantity, priceCents, confirmSimulation:true}` and Idempotency-Key |
| `POST /api/posttrade/listings/:id/cancel` | Owner-only cancellation with `{confirmSimulation:true}`; repeated cancel is safe |
| `POST /api/posttrade/quotes` | `{listingId, quantity}`; owner-bound, 30-second purchase quote |
| `POST /api/posttrade/trades` | `{quoteId, confirmSimulation:true}` and original Idempotency-Key |
| `GET /api/posttrade/trades/:id` | Only buyer or seller can retrieve the completed paper trade |

The DTOs explicitly say `mode: paper`, `currency: SIMULATED_USD` and `payout: not_redeemable`. No on-chain success is claimed. Fees are zero in the paper demonstration. Session failure requires reconnecting the same Privy identity; the pending command remains scoped to that identity.

## Handoff to the integration branch

Merge/cherry-pick this branch after reconciling the payment branch. Resolve the small app/index/contracts/dashboard hooks deliberately; preserve both the integration branch's checkout/worker guards and these post-trade routes. The new store, routes, UI, types and tests are separate files. Do not copy local environment files or reset any existing database.

Before enabling real-backed resale:

1. Choose one canonical owner identity and map Privy users to verified execution wallets/accounts. A client-supplied linked wallet is not enough.
2. Feed the ledger from an authenticated, durable **confirmed-fill** outbox. Partial orders may contain transferable confirmed quantities; unknown/unconfirmed quantities cannot back holdings. Use exchange account, order and fill IDs plus revision handling to avoid duplicate allocation.
3. Establish the supported Gemini account/custody model and obtain applicable approval for customer allocations/resale. Internal reassignment changes ImPacks' ledger; it does not change Gemini's account owner.
4. Reconcile each instrument/side against actual exchange backing, including holds and opposing-side netting. Reserve shared backing across listings, exchange exits and settlement. Halt trading on an unexplained mismatch.
5. Replace paper cash with the chosen durable settlement asset ledger. AUSD and Gemini sandbox USD remain distinct assets. Do not credit withdrawable AUSD merely because a Gemini trade executed.
6. Ingest real close/halts/resolution rules and implement settlement to the **current** owner, excluding former owners. Freeze/cancel listings atomically before payout allocation. Oracle/result corrections, dispute handling and payout replay protection are unimplemented.
7. Add separate exchange-exit quote/order/reconciliation and AUSD withdrawal adapters when required. They need durable intent, quantity reservation, cumulative fills, fees and uncertain-outcome recovery. They are not called by peer resale.

## Evidence and limitations

Automated tests cover ownership/authentication, fill deduplication, partial transfer and repeat resale, quantity and cash conservation, reservations, stale/foreign quotes, self-trade rejection, insufficient cash, cancellation/expiry, independent SQLite connections, rollback after an injected database failure, restart/retry and blocking legacy close. UI helper tests cover owner-scoped stored requests and remaining-quantity exposure. No real Gemini sale, cross-account exchange transfer, AUSD payout or market-resolution payout is implemented.

Primary sources inspected October 11, 2026: [Gemini trading](https://developer.gemini.com/prediction-markets-spec/trading), [Gemini positions](https://developer.gemini.com/prediction-markets-spec/positions). These establish exchange trading/account positions and instrument-specific constraints, not portability of customer claims or commercial permission for the proposed pooled model.

## Existing local Docker workspace

For the established `impacks-node24-dev-1` container, the local setup uses:

- Frontend: `http://localhost:3001/marketplace` on the existing localhost-only published port.
- Standalone API: `http://127.0.0.1:3002` inside the container, reached by the frontend proxy.
- Persistent ledger: `/var/lib/impacks/posttrade.sqlite` on the existing Docker volume.
- Ignored `apps/api/.env`: public Privy App ID, POSTTRADE_DEMO_ENABLED=1,
  POSTTRADE_DB_PATH, WELCOME_GRANTS_ENABLED=0, and port 3002.
- Ignored `apps/web/.env.local`: matching NEXT_PUBLIC_PRIVY_APP_ID,
  API_PROXY_TARGET=http://127.0.0.1:3002, IMPACKS_EMBEDDED_DEMO=0.

With these local files configured, start the servers in two terminals (only when
those ports are free):

```sh
docker exec -it -w /workspace/apps/api -e PORT=3002 -e HOST=127.0.0.1 -e WELCOME_GRANTS_ENABLED=0 -e IMPACKS_EMBEDDED_DEMO=0 impacks-node24-dev-1 node --env-file=.env dist/index.js
docker exec -it -w /workspace/apps/web -e IMPACKS_EMBEDDED_DEMO=0 -e API_PROXY_TARGET=http://127.0.0.1:3002 impacks-node24-dev-1 ../../node_modules/.bin/next start --hostname 0.0.0.0 --port 3001
```

Build first after source changes: `docker exec impacks-node24-dev-1 npm run build`.
The public Privy ID must be present during the frontend build. Allow the local
frontend origin in Privy if required by the app's dashboard configuration. Use two
actual email accounts in separate browser profiles for manual testing. Automated
signed-token fixtures do not establish that real email delivery/sign-in succeeded.
No welcome-grant worker is started by this setup; paper trading never moves AUSD.
