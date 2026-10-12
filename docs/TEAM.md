# ImPacks team board

Last updated: October 11, 2026. This is the shared source of truth for scope, ownership and handoffs. Update your rows in the same PR as your code; record what works, what remains simulated, and the next blocker. This file is versioned with the repository; it is not automatically synchronized to an external document.

## Product agreement

Visual direction revised October 11: **Mobbin’s white canvas, oversized black typography, and floating objects**, with realistic black foil ImPacks wrappers replacing the app icons. This supersedes the bubbly white/light-orange concept. Use crimped seals, fine texture, subtle wrinkles, restrained gold printing, and gentle floating motion. Crypto, Sports, and Chaos share the wrapper silhouette and differ through readable genre labels; revealed cards may remain colorful. [Design research](design/card-pack-research/index.html) contains the selected direction and original generated packaging assets. Add a continuously rotating horizontal category rail inspired by the user’s Mobbin screenshot: category labels above large black packs, a rounded All packs / Crypto / Sports / Chaos selector, pause/resume, and previous/next controls. Pause on hover and keyboard focus; default to stationary for reduced motion. The Next.js frontend now implements this direction, including the landing hero and category carousel. Local desktop/mobile browsing and login → three-card opening → collection restoration are verified. Vercel deployment is live at https://impacks.vercel.app; hosted API smoke checks pass. The Next.js dev app runs at http://localhost:3000.

An easy login leads directly to themed packs. The user agrees to the budget and random selection before opening. The backend randomly draws three distinct eligible markets and a 50/50 YES/NO side for each, confirms AUSD payment, then submits the selected positions. Cards reveal the stored result and show actual order status.

Target demo: AUSD on Ethereum Sepolia plus Gemini Predictions sandbox. AUSD purchases the pack; Gemini orders use separately funded test USD. No conversion or exchange deposit bridge is implemented. Demo providers currently simulate both systems.

## Roles and boundaries

| Role | Team | Owns | Handoff |
| --- | --- | --- | --- |
| UI and interaction lead — assign teammate | Frontend | Login, pack selection, reveal, responsive components | Screens consuming shared types |
| Client integration lead — assign teammate | Frontend | Typed API client, identity/wallet UX, error and retry states | Verified end-to-end client behavior |
| Markets and trading lead — assign teammate | Backend/API | Gemini discovery, quotes, order submission and fills | Normalized market/order adapters |
| Payments and platform lead — assign teammate | Backend/API | AUSD, identity, persistence, orchestration, reconciliation | Verified payment receipt and durable opening |

These are responsibilities within two teams, not four required people. Frontend owns `apps/web` (Next.js App Router); backend owns `apps/api` (Fastify). Both review `packages/contracts` and changes to the purchase flow. One teammate should take release/demo coordination before submission.

## Work board

| ID | Work | Owner | Status | Done when |
| --- | --- | --- | --- | --- |
| SETUP-1 | Workspaces, shared types, scripts and lockfile | Repo setup | Done | Both apps install and build from root |
| SETUP-2 | Demo login, pack open, collection | Repo setup | Done | Frontend consumes API, clearly labeled simulated |
| SETUP-3 | Next.js App Router migration | Repo setup | Done | Next build, hydration and API rewrite verified |
| FE-1 | Component structure and visual design | Frontend / Codex | Done (demo) | Mobile and desktop login → opening flow |
| FE-2 | Pack reveal animation | Frontend | Integrated on integration branch; user walkthrough pending | Returned cards animate; reduced motion works |
| FE-3 | Login and wallet payment UI | Frontend | Exact testnet payment and durable status connected; activation gated | Authenticated wallet pays exact quote; rejection recoverable |
| FE-4 | Order and payment result screens | Frontend | Ready | Pending, partial, failed and unknown states are explicit |
| BE-1 | Real auth and durable storage | Backend/API | Privy + wallet auth and SQLite checkout integrated; simulated packs remain in memory | Verified sessions, wallet binding, durable receipts/orders |
| BE-2 | Gemini markets adapter | Backend/API | Public discovery integrated; sandbox liquidity/execution proof pending | Live discovery, themes, fresh executable prices, sufficient liquidity |
| BE-3 | AUSD testnet payment adapter | AUSD payments developer | In progress: wallet auth, payment verification and durable fulfillment authorization tested; issuer/live rollout pending | Verify sender/token/chain/recipient/amount; proof cannot be reused |
| BE-4 | Gemini sandbox order adapter | Backend/API | Durable worker implemented; real fill/fee acceptance pending | Stable client IDs, bounded spend, actual fills and positions |
| BE-5 | Reconciliation and remainder policy | Backend/API | Durable settlement/refund worker tested with fixtures; live receipt pending | Unknown orders checked before retries; refund/remainder policy recorded |
| DEMO-1 | Real testnet end-to-end smoke test | Both | Waiting on integrations | Payment receipt + sandbox orders + portfolio match |
| DEMO-2 | Public repo, deployment, ≤2 minute recording | Release owner — assign | Not started | Submission links work and show non-hardcoded core behavior |

## Contract agreement

- Shared request/response definitions: `packages/contracts/src/index.ts`.
- Every opening uses one owned quote and one stable `Idempotency-Key`.
- Random selection runs on the server once per attempt. Refresh/retry returns the same result.
- Never describe a pending/unknown order as a holding or a simulated receipt as on-chain settlement.
- All keys stay server-side. Agree together before adding or renaming a required contract field.
- Catalog starter remains 15 AUSD / three cards. Category pages quote optional `budgetCents` from $20, $50, $100, or custom $20–$250 on $5 steps. Still three cards; leftover cents go to the first cards. Zero platform fee.

- Existing demo opening flow: fixed 15 AUSD pack, three cards, 5-unit budget each, zero platform fee. Authenticated checkout tiers: Starter 1, Premium 3, Ultimate 5 testnet AUSD; Stage 1 maps these to three mixed-theme cards with 100/300/500 nominal sandbox cents, with submission and issuance disabled. Whole-contract rounding remains a decision for the live testnet demo.

## Updating this document

1. Claim a task by replacing its owner placeholder or adding your name.
2. Move status to In progress; add a blocker with the specific input you need.
3. Include this board in your implementation PR. Mark Done only after its acceptance check passes.
4. Add an entry below for API changes, integration evidence and decisions. Both teams review shared-contract changes.

## Handoff log

### Execute first, collect after reveal — testnet advance (2026-10-11)

- User explicitly selected platform-funded execution before collecting the customer’s AUSD. Added opt-in `TESTNET_PLATFORM_ADVANCE_ENABLED=1`, pinned to Sepolia and the server’s sandbox gateway. Durable advance authorization precedes orders. Standard payment-first purchases retain canonical-payment gating; browser requests cannot grant an advance or mark payment confirmed.
- Actual final Gemini fills/fees can now produce a persisted opening with `payment.status: pending`; the same stored cards survive retries/restarts. A separate advance ceiling limits aggregate advance spend/reservations to 50,000 nominal cents (500 test AUSD equivalent), with one unpaid advance per verified Privy account or wallet. The normal shared account ceiling still applies too.
- Collection becomes available after the result. Payment and any unused-AUSD refund still require canonical receipts, original identities, and exact signed refund bytes. No refund is authorized from uncollected funds. New advances freeze a 24-hour payment window before any wallet request; existing uncertain payment attempts are not changed. Unpaid advances remain visible and block another advance rather than being silently forgotten.
- UI responds immediately with an opening state, polls active advances every second, reveals only actual exchange results, then offers Finish purchase with wallet authorization. The worker picks up jobs every second while throttling readiness checks to 15 seconds. Exchange response/fill time still applies; this removes the chain-confirmation wait, not vendor latency.
- Local activation preserved the original unpaid Chaos payment request and a SQLite backup. A concurrent change had already raised the shared platform ceiling to 100,000 cents; preserved that policy and applied the independent 50,000-cent advance ceiling. Enabled advance mode only for new purchases. No existing payment request, signed transaction or order record was deleted or reset. Hosted rollout remains outstanding.
- Live recovery evidence: the existing 20-AUSD Crypto advance `6cada5a6-3833-441b-b814-ace44dfd582e` submitted its first original Gemini order once. Fixed loss of precision for numeric int64 identifiers and recovered exact order `145853902277745098`: two contracts filled, 0.47 test USD cost and 0.03 USD fees. Gemini's account `/v1/orders/history` contains nested fills even though `/v1/mytrades` returns none; added strict identity/quantity/fee validation for this recovery path. Regression coverage rejects duplicate, foreign, broken and incomplete fill evidence.
- Live follow-up: the remaining SOL/BTC instruments temporarily switched to `post_only` without executable buy quotes. When readiness recovered, the worker used the second original submission permit (`e31d7af5-f6a0-4c36-8177-d4706c4a6f08`). Its response is uncertain; subsequent order-history reads timed out or returned no matching order. Absence is not proof of rejection: the worker retains this identity and only looks it up, with no resubmission. The third order is unsubmitted. The local worker is running with recovery fixes; no AUSD was collected and no completed opening/refund exists for this advance. Full real end-to-end acceptance remains outstanding. UI preserves expired checkout status for recovery and shows submitted advance payments as awaiting confirmation.
- Validation: full typecheck, **236 tests (201 API / 35 web)**, production build, diff whitespace checks and all three local browser outage/recovery scenarios passed. Unit coverage verifies advance → actual observed fills → reveal with pending payment → canonical collection → exact refund, including restart/uncertain-order idempotency. Browser outage checks use explicit fixtures and issue no purchases; they do not replace the pending funded-wallet acceptance test.

### Company treasury and platform-funded predictions (2026-10-11)

- Confirmed the requested custody flow: wallet checkout transfers exact Sepolia AUSD into the company payment/refund treasury `0xcf0C5EB7cE054ae0FD4F8863427E516fEf40381D`. Its worker-only signing key matches that address. The configured Gemini master key buys predictions from the platform primary account’s prefunded test USD after canonical payment verification; customers need no Gemini login or exchange deposit. Incoming AUSD is not automatically converted or forwarded to Gemini.
- Added worker coverage using the actual ABI receipt verifier: a wrong receiving wallet and insufficient confirmations produce no orders; a valid treasury payment creates three positions, returns the exact remainder to the buyer, and replay does not duplicate orders/refunds. Added authenticated adapter coverage for the platform master key’s primary account.
- Customer checkout now focuses on Buy → wallet confirmation → progress → reveal, with payment recovery and the receipt address in collapsed details. Removed the duplicate preparation panel before Buy and vendor/treasury explanation from category copy. Testnet labeling, actual failed/pending states and winnings-withdrawal limitations remain visible. Saved purchases can resume when new-purchase availability is down, and checkout status is retained before a wallet prompt fails.
- Local pipeline remains subject to its existing 2,000-cent cumulative platform ceiling; incoming AUSD does not raise that limit. No new live order, payment or hosted deployment was performed for this change. A fully completed funded-wallet purchase remains required before claiming live end-to-end acceptance.
- Validation passed: typecheck, 230 tests (197 API / 33 web), production build, and all three local browser outage/recovery scenarios. Browser assertions confirm no second preparation flow before Buy, retained testnet disclosure, no visible vendor/treasury explanation, preserved selected budget, and zero purchase writes during retries. Authenticated wallet interaction remains the user’s acceptance step.

### Testnet wording and local welcome funding (2026-10-11)

- Replaced customer-facing sandbox wording across category checkout, purchase details, prediction cards, Dashboard and reveal, plus API availability/error copy, with purchase/testnet language. Ethereum Sepolia and test-asset disclosures remain; simulated paths stay explicitly simulated. Internal provider modes are unchanged. Unavailable editions use generic purchase copy, compatible with concurrent per-edition readiness work; these wording changes do not enable additional editions or real-backed resale.
- With explicit user approval, enabled local welcome grants of 50 test AUSD per eligible verified account created from `2026-10-11T07:00:00.000Z`, capped at 10 signed grants (500 test AUSD) per UTC day. Added loopback-only PostgreSQL Compose setup; generated credentials and worker secrets are ignored, owner-only files. Migration and the dedicated grant worker are running locally.
- Authenticated Privy lookup verified three accounts created today and idempotently queued them. The first transfer to `0xdc9c467fa692fbf32793d4c282de726de8aa151d` succeeded in Sepolia block 11895148: `0xbf99b4749a54b302d9d727c8142dfe2191d0b237c7babe3ee164bfa1d91f1f1b`. Safe-block reconciliation and the remaining two grants are pending; an initial uncertain broadcast response did not require a replacement transaction.
- Privy webhook registration and hosted rollout remain outstanding. Authenticated login enqueue is active locally; existing pages that observed disabled grants need refresh. Welcome grants provide AUSD only; buyers still need Sepolia ETH or separately implemented sponsorship for gas. Full purchase/reveal/refund acceptance remains pending.
- Gracefully restarted the local purchase worker after concurrent per-edition readiness changes, with an empty purchase queue. The frontend proxy now reports Crypto and Chaos (`mixed`) enabled, with payment/order/refund readiness true. No purchase was submitted.
- Read-only balance check confirmed the first recipient holds 50 test AUSD. Validation passed: typecheck, 216 tests (183 API / 33 web), production build and whitespace checks. Updated the invalid-edition test fixture to a nonexistent ID because Politics is now valid in the concurrent catalog work. No hosted deployment was performed.

### Pack links while discovery loads (2026-10-11)

- Fixed `/packs` and the Home edition browser waiting for the optional Gemini genre request before publishing a successful pack catalog. Catalog and discovery now update independently, with stale/unmounted request results ignored. Crypto, Sports and Chaos links become available as soon as their catalog arrives; provider-only editions remain previews.
- Frontend production build passed. Change is local; no deployment or payment was performed.
- Regression reproduced before the fix: successful catalog response plus pending discovery yielded zero clickable Crypto cards. `apps/web/test/browser/packs-navigation.cjs` holds discovery pending and verifies actual wrapper clicks navigate all three editions at 1440px and 390px. All six checks, full typecheck and 32 frontend tests pass. Run with Playwright available to Node and a local dev server: `BROWSER_CHANNEL=chrome node apps/web/test/browser/packs-navigation.cjs`.

### Local Crypto test activation after treasury funding (2026-10-11)

- User funded the dedicated payment/refund treasury. Read-only Ethereum Sepolia check at block 11895122 confirmed 0.05 ETH and 0 AUSD at `0xcf0C5EB7cE054ae0FD4F8863427E516fEf40381D`.
- Backed up the local checkout database before activation. It contained no pipeline jobs/accounts or confirmed purchases. Enabled local sandbox purchase processing and the worker-only refund transport, with a 2,000-cent cumulative budget ceiling and 1,000-basis-point fee reserve. Ignored secret files remain mode 0600.
- Started the purchase worker and reloaded the existing API watcher. Verified its ready heartbeat and the frontend proxy capabilities: sandbox mode, Crypto only, payment/order/refund readiness true. No payment, order or refund was submitted during activation. The user's funded-wallet $20 acceptance test is still pending; refresh the category page before testing. Hosted deployment is unchanged.

### Purchase availability recovery (2026-10-11)

- CategoryPack now owns one checkout availability result and passes it to TestnetCheckout, so a successful connection retry updates both the purchase button and checkout panel. Catalog failures have their own recoverable error; Retry connection refreshes both read-only endpoints, preserving the selected budget and saved purchase identity. Loading/error states keep purchase controls disabled.
- Added `apps/web/test/browser/checkout-recovery.cjs`: against a local dev server, inject availability-only, catalog-only and combined 503 failures, retry while unavailable, then recover without reloading. Assert the error clears, the purchase button enables, the selected amount survives and no application POST is sent. Run with Playwright available to Node: `node apps/web/test/browser/checkout-recovery.cjs` (optional `BROWSER_CHANNEL=chrome`; `CHECKOUT_TEST_URL` defaults to `http://localhost:3000`). This is a signed-out UI regression, not evidence of an authenticated payment.
- Validation passed: all three browser scenarios, typecheck, 214 API/web tests and production build. No deployment or live transaction was performed; API hosting and sandbox worker activation remain separate prerequisites.

### Consistent AUSD presentation (2026-10-11)

- User requested AUSD labels throughout packs, cards, wallet balances and trading. Pack presets/names, card spend and payout displays, dashboard totals, listing inputs, quotes, fees and trade history now name AUSD instead of dollar symbols or USD labels. Listing input is in AUSD (for example 0.50), converted to integer cents for existing server validation.
- Paper API denomination is now `SIMULATED_AUSD`, with `mode: paper` and `payout: not_redeemable` retained. Existing ledger amounts are unchanged; this is a nominal-unit naming change, not a token transfer or currency conversion. Market pages explicitly distinguish this balance from testnet wallet funds.
- Gemini's actual sandbox accounting remains USD. Sandbox prediction cards show explicitly labeled nominal 1:1 AUSD equivalents and explain that no conversion or AUSD winnings payout exists. Payment/refund adapters still handle exact on-chain test AUSD. The pending two-user sandbox resale gap is not resolved by these labels.
- Validation: typecheck, all 214 tests and production build passed; local browser confirmed 20/50/100 AUSD presets and the Custom AUSD input render correctly. API resale assertions check `SIMULATED_AUSD` on portfolio, quote and completed trade while retaining non-redeemable status.

### Two-account, 20-test-AUSD judging target (2026-10-11)

- User selected one **20-test-AUSD Crypto pack**, three positions, zero platform fee, followed by another user buying a revealed position. Use two distinct verified Privy accounts in separate browser profiles; a second tab in the same profile is not a separate identity.
- Required acceptance: A pays once, receives actual confirmed sandbox cards, lists a full card's quantity; B purchases it; A's available quantity decreases and B's increases by exactly the same amount. The payment, trade and both accounts' holdings must survive refresh/restart and same-request replay without duplicate ownership or payment.
- **Not ready as a connected scenario:** the new purchase pipeline creates sandbox openings, but `PostTradeStore.importOpening` intentionally only accepts confirmed `demo-order:` fills. The existing marketplace settles in `SIMULATED_USD`; it cannot sell the resulting sandbox card or settle a buyer's test-AUSD payment. Do not remove that boundary or relabel paper cash as AUSD to stage the demo.
- Strengthened the two-account API rehearsal to use an explicit 2000-cent pack and transfer an entire card, checking self-trade rejection, retry deduplication, seller/buyer balances and conserved ownership. This is labeled paper and uses signed test identities; it is not evidence of a real Privy OTP, on-chain payment or Gemini fill.
- Validation after the rehearsal change: typecheck, all 214 tests (182 API + 32 web), production build and diff whitespace checks passed. RPC fixture tests require local loopback permission; the restricted first attempt was rerun with that permission. No vendor trade or token transfer was performed.
- Open decision: whether the resale segment may be explicitly paper or must use test AUSD and the actual sandbox allocation. The latter requires a sandbox holding-allocation bridge, listing reservations, receipt-verified buyer payment and seller settlement, plus both users' collection views. Fund the first buyer with at least 20 test AUSD and Sepolia ETH; the dedicated treasury needs refund gas. A second on-chain buyer would also need test AUSD and Sepolia ETH.

### Durable Crypto purchase integration and dedicated AUSD treasury (2026-10-11)

- Implemented the gated purchase worker: verified AUSD payment → stable Gemini sandbox IOC orders → matched final fills/fees → persisted holdings/reveal → exact six-decimal remainder refund. The Crypto Buy action and Dashboard history consume the same durable status. Simulated packs and the paper marketplace remain explicitly separate. Sports/Chaos sandbox purchase activation is deferred.
- SQLite schema 6 persists admission reservations, Privy/wallet binding, one-use payment requests and order submission permits, observations, shared nonces, worker leases and final settlement. Unknown submission outcomes use original-client-ID lookup; no not-found result authorizes a second send. Legacy internal mutations are fenced for worker-managed purchases. Signed refunds persist before broadcast and reuse identical bytes on recovery.
- Created dedicated Ethereum Sepolia recipient/refund treasury `0xcf0C5EB7cE054ae0FD4F8863427E516fEf40381D`. Generated signer is in ignored worker-only local secrets; supplied Gemini credentials stay in ignored API secrets. Initial balances: 0 ETH / 0 AUSD. No actual transfer or order was submitted.
- Live read-only evidence: sandbox authentication and already-accepted terms succeeded; $99,981.48 sandbox USD available; 33 Crypto markets had compatible buy quotes; order-history and trade-history reads returned HTTP 200. Empty sampled trade history does not prove actual prediction fill/fee reconciliation. No vendor completion claim is made.
- Validation: Node 24 typecheck, **214 tests (182 API + 32 web)**, production build and diff whitespace checks passed. Added recovery, partial-fill, sub-cent refund, nonce-window, account isolation and gating coverage. Production browser checks confirmed Crypto Buy stays disabled without worker readiness and Sports explains its unavailable sandbox status. Authenticated wallet signing and actual vendor execution remain for the controlled test.
- Activation blockers: fund the new treasury with Sepolia ETH, configure the explicit sandbox budget and fee reserve, then enable the worker for one controlled $20 purchase with a funded buyer. Confirm real fill/fee records, reveal/holdings and refund receipt, including restart/retry. Operational reconciliation for deep reorgs/trade corrections, capacity/key migration, additional categories, real-backed resale and resolution payouts remain future work. Follow [purchase setup and acceptance](PURCHASE_PIPELINE.md); local payment activation remains disabled.

### Marketplace page guidance (2026-10-11)

- Replaced the marketplace introduction’s technical disclosure paragraph with instructions for listing holdings, requesting purchase quotes, and managing listings and trade history. Paper mode remains labeled; this is a copy-only change with no API or trading behavior changes. Verified the replacement text and diff whitespace; no integration blocker changed.

### Additional Mekila reconciliation before main promotion (2026-10-11)

- Latest fetched `mekila` is `0713d7c`; its history already belongs to the integration branch. Retained its ten pack definitions in `providers/gemini-catalog.ts`, used by nine-category Gemini discovery and the existing three-edition demo catalog. Definitions alone do not enable purchases for the seven preview genres.
- Ported Mekila's HMAC-SHA384 authentication and sandbox limit-buy payload into `providers/gemini-sandbox.ts`. The request builder consumes persisted selection, quantity, limit, fee reservation, client order ID and caller-provided durable nonce. It performs no HTTP request or terms acceptance. It rejects previously observed orders and requests that exceed the frozen budget.
- The old proof-echo payment implementation and direct startup-to-order path are not activated: they bypass verified checkout and durable submission/reconciliation. A submitting worker, per-key nonce coordination, verified vendor protocol/fees, and final settlement remain outstanding. Authentication/request construction is integrated code, not evidence of a completed Gemini trade.
- User authorized promotion to main and clarified that the additional branch meant Mekila. No four-person assignment is being created. Final validation passed: typecheck, all 194 tests (164 API + 30 web), production build and diff whitespace checks. Live execution remains disabled.

Wallet ownership and fulfillment authorization — October 11, 2026: five-minute
EIP-191/SIWE challenges now bind a 256-bit server nonce, wallet, Base Sepolia chain,
configured application origin/domain, issue time and expiry. viem verifies the exact
stored message. Challenge consumption and creation of a 15-minute wallet session
commit atomically; SQLite persists only session-token hashes and supports revocation.
Checkout creation derives its owner from this identity, and status/verification
require the same owner. Demo login cannot authorize wallet checkout.

Schema version 2 adds challenges, sessions, purchase ownership and fulfillment jobs
without deleting prior records. Legacy purchases retain NULL ownership and require
manual reconciliation; their old buyer field is not automatically trusted. Internal
fulfillment uses a separate backend-only credential, one stable authorization ID
per confirmed owned purchase, five-minute leases, increasing attempt numbers and
immutable completion. Concurrent and stale requests cannot allocate another job
or overwrite its result. Recovery keeps the same fulfillment ID after restart.

The Gemini/pack-generation developer must implement the documented
[internal fulfillment contract](FULFILLMENT.md): durable deduplication of issuance
by fulfillment ID and reconciliation before retrying unknown external outcomes.
Leases fence this API's writes, not external side effects. No Gemini logic, card
generation, pack issuance or UI components were changed. Exactly-once external
issuance cannot be claimed until the issuer implements this contract.

Validation: Docker Node 24/npm 11 typecheck, all 85 tests (61 prior plus 24 auth/
fulfillment tests), and full build passed. Coverage includes signature tampering,
nonce replay, origin binding, session expiry/revocation, owner isolation, concurrent
claims/completions, database migration and restart recovery. Existing strict payment
checks remain intact and run behind real signed test sessions.

Configure `APP_ORIGIN` as the exact frontend origin, with HTTPS except localhost;
provision `INTERNAL_FULFILLMENT_KEY` only to the API and trusted issuer. Frontend
must sign the challenge message and pass the wallet bearer token to the new typed
client methods (keep it in memory; reauthenticate on reload/expiry). EOA wallets
only for this milestone; contract-wallet signatures are unsupported. `paymentEnabled`
stays false pending issuer idempotency integration, live wallet/testnet end-to-end
evidence, rate limits and post-confirmation reorg/reconciliation policy.

Persistent checkout and verification — October 11, 2026: checkout records now use
Node 24's SQLite driver with WAL/FULL synchronization and a UNIQUE transaction-hash
constraint. The persistent Compose volume is `impacks-node24_checkout_data`, mounted
at `/var/lib/impacks`; schema version 1 initializes automatically. No new npm packages.
`POST /api/checkout/:purchaseId/verify` accepts only a hash and checks Base Sepolia,
successful receipt, official token, strict Transfer event, buyer, stored recipient,
exact amount/decimals, at least 12 confirmations and canonical inclusion. Confirmation
and hash consumption are atomic; repeats are idempotent across database connections.
An expired purchase may reconcile an on-time mined payment; old/late transfers are
rejected. RPC failures and pending receipts do not permanently fail purchases.

Validation: Docker Node 24.21.0/npm 11.19.0 `npm run typecheck`, all 61 tests, and
`npm run build` passed. Tests include real viem HTTP decoding against a local RPC
fixture, invalid receipts, depth/reorg checks, concurrent claims, database reopen
persistence and the actual SQLite uniqueness constraint. The empty persistent-volume
schema was also initialized and inspected in separate Node processes. No real payment
receipt was available: do not label live payment verification complete.

Existing checkout fields/routes are preserved; shared types gain confirmed status,
SQLite storage and evidence timestamps/hash/block/log fields. The typed client gains
`verifyCheckout`; no frontend components, Gemini or pack generation were changed.
`paymentEnabled` remains false: a supplied buyer address is not authenticated ownership,
and these public verification records must not grant an entitlement to the caller.
Before rollout: bind users to wallets, authorize fulfillment and consume each purchase
once, add rate limits and post-confirmation reorg/reconciliation policy, record a real
testnet receipt, and back up the database. Twelve L2 blocks are not L1 finality.
One persistent local database is required; use a shared transactional database for
multi-host deployment. Do not delete the checkout volume or consumed hashes.
Set RPC/token/recipient and optional confirmation depth in the API environment;
see [backend setup](../apps/api/README.md#persistent-checkout-and-verification).

Checkout request handoff — October 11, 2026: `POST /api/checkout` and
`GET /api/checkout/:purchaseId` now use shared Zod schemas/DTOs and the isolated
`CheckoutService`. Prices are server-owned (1/3/5 AUSD), IDs are server UUIDs,
expiry is 15 minutes, and only pending/expired states exist. Configure
`AUSD_RECIPIENT_ADDRESS`; missing/invalid configuration returns 503 on creation.
Responses declare in-memory storage and `paymentEnabled: false`. No transaction
confirmation, Gemini calls, pack generation or UI components were implemented.
The typed client has two additive checkout methods as required by contract policy.
These unauthenticated request-only routes do not verify wallet ownership; UUID
lookup is not authentication. Records disappear on restart and do not span replicas.
Before actual testnet purchases: durable storage, payer binding, receipt verification,
replay protection, retry/reconciliation and fulfillment mapping are still required.
The existing 15-AUSD demo packs/quotes remain unchanged. See [API details](API.md).
Validation in the existing Node 24/npm 11 Docker container: `npm run typecheck`,
`npm test` (26 passing: 17 existing plus nine checkout tests), and `npm run build`
all passed. `git diff --check` passed. The new tests cover all three prices,
unique IDs, retrieval, invalid wallets/types, rejected client overrides, exact
expiry, missing records/configuration, process-local storage and provider isolation.

Docker development environment verified October 11, 2026: existing Docker Desktop
4.22.0 starts successfully on Intel macOS 11.7.11. `compose.node24.yaml` provides
Linux Node 24.21.0/npm 11.19.0 from a digest-pinned official image, with live source
mounts and separate dependency/build volumes for all workspaces. See
[Docker setup](DOCKER.md) for start, install, backend and check commands.
`npm install --no-save` succeeded with lifecycle scripts enabled; esbuild 0.28.2's
install script and Linux binary were explicitly verified. Standard
`npm run typecheck`, `npm test` (all 17 tests) and `npm run build` passed in Linux.
The backend dev server responded on host `http://localhost:3001/api/health` with
the expected demo labels. This supersedes the local macOS test-runner blocker for
container development; native macOS Node/npm remain unchanged. No application
features or dependency manifests were changed for this environment setup.

Next.js migration verification: `npm run typecheck`, all 11 API tests, and `npm run build` passed. Browser smoke testing against the built Next.js server verified login, pack opening, collection and session restoration after reload through the API rewrite, with no browser warning/error logs. Real vendor integrations remain unverified.

| Date | Change | Next handoff |
| --- | --- | --- |
| 2026-10-11 | Repository scaffold, local demo, provider ports, API contract and CI added | Frontend starts FE-1/FE-2; backend starts BE-1/BE-2/BE-3 |
| 2026-10-11 | Frontend migrated to Next.js App Router; API ownership and shared types retained | Frontend uses `src/app` routes and port 3000; build, tests and browser smoke checks pass |
| 2026-10-11 | User selected Monad Cards as the primary reference, with black/white/silver palette; reference board updated and monochrome concept prepared | Superseded by the white/light-orange direction below |
| 2026-10-11 | User scrapped the dark concept; selected bubbly white/light-orange UI and clearly differentiated genre packs. New interactive pack-picker and illustrative reveal concept prepared | Superseded by the Mobbin / realistic black-wrapper direction below |
| 2026-10-11 | User selected Mobbin’s layout with realistic black foil packs. Generated original transparent ImPacks artwork and prepared a responsive interactive concept; genre filters, pack preview, and help panel verified | FE-1 implements this direction; this pass changes design references and assets only |

| 2026-10-11 | Implemented Mobbin-style Next.js landing page, original foil artwork, accessible rotating categories, and preserved demo checkout/collection. Added an explicit ephemeral Vercel demo adapter around the existing server-owned service | Local typecheck/build and all 11 API tests pass. Local proxy, embedded production build, and https://impacks.vercel.app each passed catalog/login/opening/identical-retry/collection/logout checks. Responsive UI checked at 390px; no browser errors. Vercel project impacks uses apps/web and Node 24. GitHub auto-link failed; deployments use the CLI. Hosted memory can reset across instances; integrations remain simulated |
| 2026-10-11 | Category pack pages at `/category/{theme}` with $20 / $50 / $100 / custom stakes; quote accepts optional `budgetCents` | Amazon-style shop removed. Frontend still opens three random cards; stake is the only scaled input |

### Stuck advance recovery: unplaced-order verdicts and worker back-off (2026-10-11)

- Symptom reported by the user: the category Buy flow showed “Finish payment for your existing pack in purchase history before opening another.” and readiness kept dropping. Cause: advance purchase `6cada5a6…` had one order whose submission response was lost and which Gemini never recorded. The worker re-ran its lookup every second; in time-mode nonces that exhausts the 20-nonce window, so readiness checks also failed, the heartbeat expired, and the job cycled `executing` ↔ `reconciliation-required` without ever finalizing. The one-unpaid-advance rule then blocked every new pack for that account.
- Fix in `apps/api/src/pipeline/worker.ts` and `store.ts`: (1) a permitted order still absent from both exchange order listings ten minutes after its attempt is finalized `rejected` (hashed absence verdict, zero fills/fees, final evidence) and the remaining cards proceed; (2) a never-permitted order whose instrument no longer validates fifteen minutes after preparation gets the same verdict; (3) `reconciliation-required` jobs retry at most once per minute; (4) worker failures now log the purchase ID and adapter status text to stderr. `OrderObservation.state` gains `rejected`; rejected verdicts persist a `pipeline_submissions` row so the client ID can never be permitted later. No resubmission, repricing or redraw was added.
- Tests: four new worker regressions (absent-after-grace completes the pack and refunds the unfilled allocation; closed-window unpermitted order; stuck platform advance reaches `awaiting-payment` with a partial opening; back-off skips freshly failed jobs). The existing “not-found stays unknown” test still holds inside the grace period.
- Operations: the running local worker was started without a file watcher, so it must be restarted to pick this up. Verified after restart: the stuck purchase finalized as partial (2 XRP contracts, 0.50 test USD) and sits in `awaiting-payment` with its opening, so purchase history can offer Finish purchase; collection still requires the user's wallet signature and Sepolia gas, then the exact remainder refund. Readiness remains unavailable while the sandbox lists fewer than three open, quoted instruments (one crypto contract right after the daily 9pm EDT settlement); that is vendor inventory, not code. No order or transfer was sent by this task. The replacement worker runs from the session shell; restart it with `node --import tsx --env-file-if-exists=.env --env-file-if-exists=.env.pipeline-worker src/pipeline/run-worker.ts` in `apps/api` if it stops.

## Open decisions

Motion handoff: the [opening specification](design/pack-opening/animation-spec.json) uses the user's selected black-and-gold wrapper, three accelerating 3D tear beats, rarity aura, and a lifted face-up card. Play, pause, replay, skip, chapter selection, and timeline scrubbing are available in the conversation prototype. Rarity colors and the single revealed card are illustrative; no rarity contract or probability mapping is implemented. Production must reveal the server's existing result and preserve actual order status. The prototype does not change application code or vendor integrations.

October 11 motion revision: the tear advances left to right along the heat-seal seam in one-pixel increments. The edge now has gentle broad curves, with micro ripples and frayed fibers removed per user feedback. A textured, perspective-projected foil mesh curls smoothly toward the viewer, exposing the silver underside while the untouched right side remains sealed. The strip releases after reaching the far edge; the aura and card flip follow. The latest draft reduces the interior to a narrow 4–7px back-lining sliver tucked directly beneath the torn seam, with subtle pocket shadow; the tall raised rear wall was removed per user feedback. A finite rarity-colored reflection travels across the inner foil and curled strip, then the revealed card; it follows pause, scrub and reduced-motion behavior. The inner reflection is softened to match the smaller exposed lining. Latest extraction revision keeps the opaque wrapper stationary while the 156×260px card slides upward 300px through the 192×338px wrapper opening, with side clearance and an initially matching tilt. The glow follows the card, the flip waits until full clearance, and the empty wrapper fades afterward. The mid-extraction view was visually checked. This supersedes the downward-wrapper exit. The latest timing pass runs 8.4 seconds with quintic easing, a stronger smoothly ramped pre-tear shake, overlapping tear pulls, subpixel tear-front motion, and three full card spins plus a final half-turn before revealing the artwork and shimmer. Extraction and card-to-wrapper clearance are preserved. Reduced motion skips the shake and spins. The foil mesh uses 60% fewer triangles, shares the underside sheen gradient per frame, and stops rendering the detached strip when it is gone. User approved this single-pack direction. User clarified that multiple cards come from one pack: the revised multi-card draft uses one wrapper and three bets under the selected market category. The cards slide out with a 160ms stagger, fan apart after clearing the seam, then spin and reveal individually. Crypto, Sports and Chaos category selection updates all three illustrative bets together. One-pack playback, all-Sports results, and three-card mobile fit were checked with no browser script errors. This supersedes the multiple-pack batch design. One existing server opening should supply all three cards; no bulk purchase API is needed. Production integration remains pending.

- Privy selected for email, Google and wallet sign-in. Embedded wallet creation and wallet binding for payments remain future work.

### AUSD infrastructure handoff — October 11, 2026

- Branch: `feature/ausd-payments`. Added only viem as a direct dependency, isolated
  `apps/api/src/providers/ausd` configuration/client/diagnostic, and six focused tests.
  Shared contracts, frontend, Gemini, pack generation and demo wiring are unchanged.
- Agora's official deployment and precision documentation agree with the existing
  shared constants: Base Sepolia 84532, token
  `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, six decimals.
- Live evidence: compiled diagnostic against `https://sepolia.base.org` succeeded
  at block `47991891`, checking chain ID, contract bytecode and `decimals()` = 6.
  No recipient was configured; no transaction was signed or sent. This is
  connectivity evidence, not payment verification or a completed vendor integration.
- Checks: `npm run typecheck`, `npm run build`, and `git diff --check` passed.
  Standard `npm test` is blocked by the existing esbuild binary requiring macOS 12
  (`_SecTrustCopyCertificateChain` missing on macOS 11.7.11). The local shell has
  Node 20.18/npm 10.8 rather than the required Node 24/npm 11. Dependency installation
  succeeded with lifecycle scripts disabled. No dependency versions were downgraded.
- Fallback validation: TypeScript compiled both test files with strict checking
  into ignored `apps/api/node_modules/.ausd-check`; running
  `node --experimental-require-module --test apps/api/node_modules/.ausd-check/test/*.test.js`
  with local listeners allowed passed all 17 tests (11 existing, six AUSD).
- Next configuration: provide `AUSD_RPC_URL` and the public receiving wallet in
  `apps/api/.env`; retain the documented token address. Run
  `npm run check:ausd -w @impacks/api` on the supported toolchain. No private key
  is required. Recipient is optional for connectivity only.
- Remaining BE-3 work: payer/quote-bound receipt verification, confirmations and
  replay protection backed by durable storage. Coordinate identity/storage with
  their owners before wiring checkout; these are outside this infrastructure task.

- Choose login/wallet provider with the frontend team; target email or social login plus wallet attachment/embedded wallet.
- Choose AUSD payment transport: ordinary testnet transfer verification first, or ERC-3009/x402 if the team can complete settlement and replay protection in time.
- Choose a database and job/reconciliation approach before connecting external side effects.
- Define refund/remainder handling and the mapping of demo users to Gemini sandbox accounts. A shared sandbox account does not create individual exchange-owned positions for each user.

## Branches and merge checks

Use `codex/frontend-<task>` and `codex/backend-<task>` branches. Keep PRs focused; both teams review contract changes. Run `npm run typecheck`, `npm test`, and `npm run build`. Do not merge secrets or hardcoded claims of successful vendor integration. Use the PR template to record the next team's handoff.

## October 11 landing + Privy update

Landing now centers “Gamble on gambling.” with floating Bitcoin, Ethereum, NFL, MLB, WNBA and NBA logos. The main CTA navigates to `/login`; the black-foil category rail remains below. `/packs` retains the existing simulated opening/collection flow. Cards show side, spend and gross conditional demo payout ($1 per winning contract); pending/failed orders never display a confirmed holding or payout. Random selection is explicitly distinguished from better odds.

`POST /api/auth/privy` accepts a Privy access token in the Authorization bearer header, verifies ES256 signature, issuer, app audience, required subject/expiry/issued-at against Privy’s public JWKS, and returns the existing demo Session DTO. The server identity is the verified Privy DID; local session expiry is capped to token expiry. The client exchanges after authentication and navigates to packs. App logout also ends Privy login. No app secret is needed or stored. Public app ID is configured locally and in Vercel.

Evidence: local Privy modal loads with email, Google, wallet options; signature/issuer/audience/expiry rejection tests pass (13 API tests total). Actual user authentication still requires a user to complete their email/OAuth/wallet sign-in; do not call end-to-end identity verified yet. Payments, orders, fixtures and in-memory storage remain demo-only. Hosted state can reset.

## October 11 wallet account update

A site-wide Privy provider now configures automatic Ethereum embedded wallet creation for all users on login, with Base Sepolia as the supported/default chain. The top-right Connect wallet control leads through login; connected accounts show an address menu, testnet AUSD balance, copy/explorer/refresh and disconnect. Existing signed-in accounts without a wallet can explicitly create one. The login exchange waits for a connected wallet before navigating to packs. Embedded wallets are preferred; a linked external wallet is the fallback.

Added public read-only `GET /api/wallets/:address/ausd` and shared WalletBalance DTO. The API reads the Agora token from Base Sepolia, verifies RPC chain ID and token decimals, and preserves exact atomic balance. RPC failures show unavailable, never a fabricated zero. Set optional server-only BASE_SEPOLIA_RPC_URL for a dedicated RPC. The public Base RPC returned a verified testnet balance during local testing; 15 API tests cover precision and invalid chain/token/RPC failure handling. Privy wallet creation itself requires completing real user sign-in and remains unverified end-to-end.

AUSD settlement remains blocked on the project receiving wallet and durable payer/quote/payment verification; no transfer button, signature request or real debit has been enabled. Demo openings remain explicitly simulated and separate from the displayed on-chain balance.

## October 11 category symbol expansion

Added original SVG illustrations for Politics, Economics, Commodities, Business, Culture, Tech and Weather to the floating landing-page composition alongside the six existing crypto/sports marks. Desktop and 390px mobile positioning preserve the central headline and CTA; reduced-motion styling applies to the new symbols. This is a visual category expansion only, not a change to the available pack catalog or market providers. Typecheck, 15 API tests and production build pass; desktop/mobile composition checked with no horizontal overflow.

## October 11 email-only sign-in

Replaced provider selection with a direct email field and Privy one-time-code verification on `/login`. Removed Google and external-wallet login options from provider configuration and screen copy. Resend/change-email/retry states are included. Because Privy custom email authentication bypasses modal automatic wallet creation, the page explicitly creates an embedded wallet once after verified login, with a manual retry on failure, before the existing verified session exchange. No wallet is created before authentication. Existing wallet menu and AUSD balances are retained. Full OTP delivery/authentication requires a user-supplied email and remains unverified end-to-end.

## October 11 payment and escrow architecture

Research/design complete: [sandbox treasury and execution architecture](PAYMENTS_ARCHITECTURE.md) and [AUSD execution escrow specification](ESCROW_SPEC.md). Official Gemini, Agora, Privy, Base, ERC-3009 and OpenZeppelin documentation informs the design. No contract, payment adapter, database, trade, or deployment was implemented in this research pass.

Recommended implementation decisions supersede the earlier unresolved remainder/database proposals: use Postgres with a transactional outbox and durable workers; start with verified test AUSD deposits into an ImPacks treasury; reserve per-user balances; execute with separately pre-funded Gemini sandbox USD; return unspent budget as withdrawable test AUSD. Track paper winnings separately without AUSD redemption in v1. Preserve all three random selections through retries/failures, and use live instrument increments rather than assuming whole contracts. These are design defaults awaiting implementation, not shipped behavior.

Optional escrow adds capped settlement and timeout refund credits to the same backend. It trusts ImPacks' report of Gemini execution, does not bridge assets, and does not back future winnings. If a timeout refund wins a race with a late Gemini fill, ImPacks absorbs the orphaned position. Pooled opposite-side netting, actual fees, account permissions/terms, wallet binding and finality behavior require integration evidence.

| Next work | Owner | Status / handoff |
| --- | --- | --- |
| Durable identity, payer binding, journal, reservations and jobs | Backend payments/platform | Ready to implement; prerequisite to external side effects |
| Gemini discovery, bounded order, fee/ID/recovery/netting proof | Backend markets | Ready for sandbox verification; record real order/fill evidence |
| Deposit and remainder withdrawal adapters | Backend payments/platform | After persistence; prove unique receipt credit and confirmed refund |
| Wallet confirmation and resumable purchase/refund screens | Frontend | Agree exact-money/status DTOs with backend; keep unknown execution visible |
| Full payment → fills → collection → remainder demo | Both | After adapters/reconciliation; prove recovery across restart |
| Optional Solidity escrow + adapter | Backend contracts/payments | Specification ready; build after the shared execution path works |

Documentation checks: local links, Markdown structure and diff whitespace reviewed. Application tests were not rerun for this documentation-only change. Authenticated vendor behavior, deployed token authorization ABI, and escrow invariants remain future implementation checks.

### Real organization marks in the landing hero (2026-10-11)

- Replaced the generic category pictograms with actual Democratic/Republican party, Federal Reserve, Shell, eBay, Spotify, NVIDIA, and NOAA logo assets. Existing crypto and sports marks remain in the animated layout.
- Logo sources and color adaptations are recorded in `apps/web/public/images/brands/SOURCES.md`; SVGs are served locally. Removed the unused `CategorySymbol` component.
- Verified all 14 images load on desktop (1440px) and mobile (390px), with no horizontal overflow. Typecheck, all 15 API tests, and production build pass.

### Logo collage pack editions (2026-10-11)

- Replaced the central IM shield with real logo overlays on the shared pack artwork. Crypto uses BTC/ETH, Sports uses NFL/NBA/MLB/WNBA, and Chaos combines crypto, sports, tech, culture and business marks. Each wrapper reads Crypto Edition, Sports Edition or Chaos Edition. Catalog data, prices, and opening behavior are unchanged.
- Built-in imagegen removed the shield from a sibling foil asset; original artwork is preserved. Logos and edition typography remain HTML/CSS overlays. Asset provenance and exact generation prompt: `apps/web/public/images/PACK-ARTWORK.md`.
- Typecheck, all 15 API tests, and production build pass. Desktop/mobile catalog and desktop login fan visually checked; all pack assets load and mobile has no horizontal page overflow.

### Centered logo fans (2026-10-11)

- Tightened the pack logo overlays into centered, overlapping fans with angled outer marks and raised middle marks. Edition labels and foil artwork stay intact.
- Desktop and 390px mobile checked; all pack images load without horizontal page overflow. Typecheck, 15 API tests and production build pass.

### Remove demo wording from site copy (2026-10-11)

- Removed the DEMO header badge and demo wording from pack prices, sign-in/fallback/sign-out controls, checkout, wallet text, payout copy, login note, footer and unavailable-service message. Brief simulation disclosures remain accurate; no real payment/trading integration was enabled.
- Internal API modes, payment proof prefixes, storage keys and routes remain compatible. Verified visible text on landing, login and packs contains no standalone demo wording. Typecheck, all 15 API tests, and production build pass.

### Ahrian local category fan revision (2026-10-11)

- Centered the category pack fan and price rail as one group. Replaced the mirrored center-card stack with a 104-degree fan around a shared lower pivot, ordered left to right with the rightmost pack in front, matching the supplied playing-card reference.
- Removed the white rounded card panels and center highlight; foil wrappers retain their transparent silhouette. Narrow layouts stack the price controls beneath the fan with no horizontal page overflow in browser checks. Five-pack and ten-pack states were checked; stake behavior is unchanged.
- Local preview changes on `codex/ahrian-local-preview`; not deployed. Typecheck, all 16 API tests, and production build pass.

### Category buy flow and signed-in account (2026-10-11)

- Added a Buy pack CTA beside the stake picker and removed the category page’s separate display-name sign-in form. The category now waits for Privy, verifies any cached API session against that identity, and exchanges a current access token when the local session is absent or expired. No substitute account is created.
- Email sign-in returns to an allowlisted pack route with the selected amount. Signed-in accounts can confirm random selection and open using their verified identity; wallet setup and account reconnection have explicit states. Changed accounts cannot reuse another user’s cached session or pending opening. Pending retries lock the amount and preserve the quote/key.
- Typecheck, 17 API tests, six account-session/redirect tests, and production build pass. A verified-token integration test confirms quote/open/collection ownership and identical retries across renewed sessions. Browser checks verified the signed-out Buy CTA, email-only redirect and retained $50 selection. The browser was signed out, so real OTP sign-in/embedded-wallet creation remains unverified in this pass. Payments and trades are still simulated.
- Includes the centered category fan revision above for integration into main; retain the Ahrian branch for ongoing work.

### Collector dashboard and Gemini genre browser (2026-10-11)

- Local preview returned to the main checkout; Ahrian branches remain intact. Two parallel agents implemented the collector dashboard and genre browser, with shared account/API/navigation integration completed in the main task. Home, Packs, Dashboard navigation is consistent across landing, categories and email login and stays visible on narrow screens.
- `/dashboard` reads the verified Privy owner's portfolio. Opened packs become collection shelves with colorful YES/NO cards, edition/status filters, search and card details. Pending/unknown/failed orders never count as holdings; closed cards remain collectible and leave open exposure/conditional payout totals. Category reveals link into Dashboard. Login return paths now allow Dashboard, with no external redirects.
- Added authenticated paper-only full-position close endpoint with owner checks, explicit simulation acknowledgment and stable request identity. Close retries survive page reload through owner-scoped client keys; server concurrent requests share one result. Original buy receipts remain unchanged. Unavailable prices leave positions open; sandbox/live closes are unavailable. No real sell, AUSD redemption, durable storage or live P&L is implemented.
- Public Gemini discovery returned 13 category labels, grouped into nine core genres plus Chaos. Sports groups Pro Football/Pro Baseball; Politics groups Midterms; Live is not duplicated as a genre. Runtime server discovery validates data, limits fetch duration, coalesces/cache reads and surfaces upstream errors without fixture fallback. Packs has filters, search, foil genre slides, real logo overlays and selected-edition details. Only catalog-backed Crypto/Sports/Chaos can be opened; seven additional genres are explicit previews pending trading integration. Research and primary sources: [GEMINI_GENRES.md](GEMINI_GENRES.md).
- Verification: typecheck, 47 tests (34 API + 13 web including concurrent close/ownership/price failure and discovery failure coverage), production build, live read-only Gemini discovery and local guest UI checks pass. Existing grant work in the shared checkout is preserved and included in the full test count. Authenticated dashboard browser actions require the user's Privy sign-in and were not manually completed. Positions remain in memory and reset on service restart.

### Automatic Privy welcome funding (2026-10-11)

- Implemented opt-in **50 test AUSD** grants from a dedicated external wallet to each eligible new Privy embedded Ethereum wallet on Base Sepolia. The funding key belongs only in worker server secrets. New means created on/after the configured launch time, with a verified email and one embedded Ethereum address. Existing earlier accounts are excluded.
- Backend owns the signed Privy webhook, authenticated enqueue/status endpoints, additive PostgreSQL schema and separate worker. User and recipient uniqueness, serialized nonce allocation, and durable signed transactions prevent duplicate grants on replay or uncertain broadcast. Confirmation checks the canonical safe receipt and exact token transfer. Low funds remain queued; ambiguous receipts/nonces halt new signing for review.
- Frontend enqueues after authenticated wallet setup, displays grant status/explorer link in the wallet menu, and refreshes the on-chain balance after confirmation. Browser input cannot select a recipient or amount. Grants do not create Gemini USD, enable pack payments or make pack state durable.
- Verification: typecheck, 50 tests (34 API + 16 web), and production build passed. Grant tests cover database reopen, duplicate intake, write-before-send, uncertain broadcast recovery, eligibility, caps, exact signing, receipt validation and signed webhook/authentication boundaries. PostgreSQL multi-process locking and a real Privy-to-testnet transfer still require deployment evidence.
- Activation handoff: backend configures PostgreSQL, the public treasury address, launch cutoff, daily limit, Privy credentials/webhook, and worker-only funding key; funds the treasury with test AUSD and test ETH; runs migration and worker; then records one transfer plus replay/restart checks. Frontend points its API proxy at that standalone API. Feature remains disabled until configured. Commands, environment ownership and recovery: [WELCOME_GRANTS.md](WELCOME_GRANTS.md).

### Approved pack-opening animation integration (2026-10-11)

- CategoryPack now opens PackOpeningReveal only after usePackSession.openPack returns the account-owned Opening. It renders those exact cards; the animation never quotes, pays, retries, or selects cards. Account/category changes dismiss the reveal. Existing collection/dashboard handoff remains intact for the post-sell work.
- Ported the approved one-wrapper/three-card prototype: selected black/gold foil asset, stronger anticipation shake, three continuous left-to-right seam-tear beats with gently curved edges, textured 3D curling strip and narrow recessed lining, staggered upward extraction, fan-out after clearance, three full spins plus final half-turn, and shimmer. Mesh, timeline and React dialog are isolated in new frontend files.
- Pause/resume, reveal-all, replay, Escape/focus restoration and reduced-motion skipping are included. Asset/canvas failure falls through to the returned cards. Pending/failed order labels and simulation disclosure remain visible. Shimmer currently uses category colors: the server has no rarity field, so no fabricated rarity or odds are shown.
- Validation: desktop and 390px mobile component checks used an explicitly labeled temporary fixture route (removed before build); checked pause/replay/skip, exact questions/sides/statuses, no horizontal overflow, Escape and focus restoration. Full authenticated purchase-to-reveal through Privy remains unverified in this pass. Timeline tests cover clearance before fan/spin, concealment until final turn, continuous/staggered extraction and deterministic replay. No deployment performed.
- Final checks passed: `npm run typecheck`, `npm test` (all API and 16 web tests), `npm run build`, and `git diff --check`. The production route list excludes the temporary animation QA page.


### Collector dashboard (2026-10-11)

- Added `/dashboard` using the verified Privy owner's portfolio. Opened packs become collectible card shelves with edition/status filters, search and card details. Pending/unknown/failed orders never count as holdings; closed cards remain collectible and leave open exposure/conditional payout totals. Category reveals link into Dashboard. Shared Home / Packs / Dashboard navigation remains visible on narrow screens; email login supports a Dashboard return path.
- Added authenticated paper-only full-position closing with owner checks, explicit simulation acknowledgment and stable request identity. Client retry keys are owner-scoped; server concurrent requests share one result. Original buy receipts remain unchanged. Missing prices leave positions open; sandbox/live closing is unavailable. No AUSD redemption or live Gemini selling is enabled. Collections remain in memory and reset on service restart.
- Dashboard scope is isolated from the uncommitted genre browser, welcome grants, pack animation and architecture work. The isolated dashboard-only snapshot passed typecheck, all 28 tests (19 API + 9 web), and the production build. Authenticated ownership/closing/retries are covered by API tests; real Privy dashboard interaction was not manually completed.

### Welcome funding configuration (2026-10-11)

- Configured the supplied external wallet locally in the ignored, owner-only worker secret file; worker commands load it separately from API configuration. Verified the API does not load the funding key and the worker key matches the configured public treasury. No secret was added to tracked files.
- Read-only Base Sepolia checks returned 0 test AUSD and 0 test ETH. Transfers remain disabled. PostgreSQL, Privy app/webhook secrets, launch cutoff, daily cap and service setup are still required; no new account has been funded. The key was disclosed in chat and should be replaced before valuable funding.

### Ethereum Sepolia network switch (2026-10-11)

- User selected Ethereum Sepolia, chain 11155111, superseding the earlier Base Sepolia setup. Updated shared payment/grant DTOs, the wallet balance adapter, grant signer, Privy default/supported network, UI labels and Etherscan links. The API/worker now use ETHEREUM_SEPOLIA_RPC_URL; local configuration and integration/escrow plans match.
- Grant databases now bind to the chain. Legacy or mismatched bindings fail closed and require reconciliation; stored Base transactions are rejected before broadcast. No existing grant database or transfer was activated here. The database worker lock retains its old numeric key solely to serialize old/new processes during a transition.
- Verification: typecheck, all 51 tests (35 API + 16 web), and production build passed. Added checks for Base RPC rejection, Base-signed transaction rejection, and legacy database migration. The actual updated balance adapter read 9,800 test AUSD from the supplied treasury on Ethereum Sepolia. No transfer was signed or sent in the live check.
- Activation remains pending PostgreSQL, Privy app/webhook secrets, launch cutoff/daily cap, and standalone API/worker configuration. Changes are local; no deployment was performed. See [WELCOME_GRANTS.md](WELCOME_GRANTS.md).

## Stage 1 execution integration handoff — October 11, 2026

Inspected remote `mekila` at `31d80d54c386dc2cf9f081dac4dd8909d8d6e52d`; it was not
merged into `feature/ausd-payments`. Fetched for inspection only. Its auth, frontend,
expanded themes and sandbox startup differ from this working tree; no blanket merge
or changes to those teammate files. Existing uncommitted AUSD work is preserved.

Added schema-3 durable execution/budget/order-intent records and backend-only lease-
fenced endpoints. Confirmed owned Starter/Premium/Ultimate purchases reserve
100/300/500 nominal sandbox cents. Selection is persisted once using existing
server-side draw logic; client IDs and exchange IDs are unique. Cumulative fill/fee
reports are idempotent and unknown/over-limit outcomes require reconciliation.
Selective Gemini discovery port replaces legacy proof echo and order submission
with fail-closed guards. No live orders, transfers, card issuance, refunds or x402.

Contract/client/docs: [EXECUTION.md](EXECUTION.md), shared SandboxExecution/report
types, server-only typed execution client. Frontend APIs/components unchanged.
Blockers: verified fees (10% preparation allowance is NOT a live cap), sandbox
tradability, shared treasury reservation, durable submission permits/reconciliation,
small-budget card policy, final issuance and live test evidence. `paymentEnabled`
remains false. This is safe preparation/accounting, not a complete vendor integration.

Stage 1 validation: existing Node 24/npm 11 Docker `npm test` passed all 99 tests
(85 prior + 14 orchestration tests), `npm run typecheck` and `npm run build` passed.
`git diff --check` passed. Tests use explicit mock markets/payment evidence; no live
Gemini order or new blockchain transfer was performed. Migration/restart behavior
was exercised on test SQLite files; the existing development volume migrates to
schema 3 on next API startup. No commits, pushes, merges or deletions.

Refund preparation handoff — October 11, 2026: schema 4 adds unique refund records,
integer remainder accounting, a server-only signed-transaction staging boundary and
read-only receipt reconciliation. Production refund authorization is blocked until
an authoritative Gemini settlement adapter supplies final orders/fees, no further
orders, the exact execution digest and revalidated payment evidence. Broadcasting
is hard-disabled; no signer is configured and no transfer has been performed.
Authorized accounting is sealed against later execution reports. Test signers are
fresh ephemeral fixtures only. See [REFUNDS.md](REFUNDS.md).

Read-only public RPC check verified Base Sepolia block 47995324, official AUSD
contract bytecode and six decimals. Actual API configuration is missing RPC/token,
recipient, APP_ORIGIN and INTERNAL_FULFILLMENT_KEY; the existing persistent database
was schema 2 with zero purchases at inspection. New startup migrations are additive.
Treasury control and live payment/refund evidence remain unverified. The interactive
payment diagnostic prepares a wallet-signature login and Starter checkout, but
never signs or broadcasts. Initial expanded suite: all 119 tests passed.

Pre-push validation: all 119 tests, full typecheck and API/frontend build passed in
Node 24 Docker; staged diff whitespace checks passed. Refund broadcasting remains
disabled and final settlement authorization remains blocked. User explicitly
requested committing/pushing the current work to feature/ausd-payments.

### Pack artwork navigation fix (2026-10-11)

- Available edition tiles in the shared Home/Packs browser now use full-tile Next.js links to their category purchase pages. Previously clicking the wrapper only changed the selected edition, requiring a separate button farther down the page. Native links also support keyboard activation and opening in a new tab.
- Unavailable genres remain explicit preview controls; they cannot route to unsupported purchase pages. Slideshow controls still change the selected edition without navigating.

### Contracts build-output guard (2026-10-11)

- Investigated the category-page Turbopack parse error in `packages/contracts/dist/index.js` during the active integration merge. By inspection time the source and generated output had already been corrected by concurrent integration work; the current `/category/crypto` page loaded successfully.
- Set `noEmitOnError` in the contracts compiler configuration. Failed compilation now preserves the last valid JavaScript and declarations instead of publishing malformed output that the running Next dev server can consume. No DTO, route, selection or payment behavior changed; merge staging/resolution is left to the ongoing integration work.
- Isolated regression check: compile a valid fixture, introduce merge-conflict syntax, assert compiler failure and byte-identical prior JS/declaration output. Check passed. Also restored missing CheckoutCapabilities/CheckoutStatus type imports in the concurrently integrated frontend client, resolving the remaining production type errors. Final verification passed: `npm run typecheck`, all 159 tests (143 API + 16 web), `npm run build`, and focused diff whitespace checks. The HTTP-transport test required local loopback permission; no external transaction was performed.
- Verification: clicked Crypto from Packs and Sports from Home, and used Enter on Chaos; each opened its category purchase page. Typecheck, all 159 current API/web tests, and production build pass. This patch does not change purchase execution.

## Unified integration branch — October 11, 2026

Integration is assembled on `codex/integration-ui-backend`, based on current main and a preservation commit of the local genre browser, reveal animation, welcome grants and Ethereum Sepolia migration. The payment branch is being reconciled with the current UI and contracts. Ethereum Sepolia (11155111) is authoritative; earlier Base Sepolia handoffs are historical evidence, not current configuration. Checkout retains SQLite on a persistent standalone API; welcome grants independently retain PostgreSQL. Neither database is a substitute for the other.

The category UI keeps its $20/$50/$100/custom budget and three predictions. Additive category checkout snapshots the same catalog edition and budget, consent and durable retry key. Legacy 1/3/5 test-AUSD endpoints remain compatible for backend diagnostics. Privy login is retained; the same embedded wallet signs the existing EIP-191 checkout challenge. The server verifies ownership separately; no display name or browser-provided wallet address grants access.

Category checkout and Dashboard payment history now connect to wallet authentication, receipt verification, persisted selection preparation and owner-only execution/refund status. Reveals use stored results, never a client-side redraw. Checkout creation, signature and preparation do not transfer funds. Actual Gemini submissions and refund broadcasting remain disabled pending vendor execution/reconciliation; the simulated opening/closing flow remains explicitly labeled. Public UI cannot access internal fulfillment credentials or report fills. Embedded Vercel demo rejects persistent checkout operations.

Final handoff: [integration test guide](INTEGRATION_TEST.md). The user subsequently authorized main promotion; the manual and vendor tests remain outstanding.

Mekila reconciliation: merged its branch history and retained nine-genre Gemini discovery and expanded shared Theme definitions. The current three fixture-backed opening editions and seven preview genres stay honest about availability. Its proof-echo payment method and unaudited submission path are superseded by receipt verification and durable execution preparation; startup still refuses sandbox mode. Original implementation remains available in its source commits. The current package lock is retained because the older branch's lockfile rewrite would discard newer dependencies.

Latest-main reconciliation: incorporated `18db4e0`, including the durable database path correction and ephemeral-host regression test. `ephemeralDemo` remains a supported alias of the integration branch’s embedded mode; both reject wallet checkout/internal routes. No update to main was performed by this integration task.

### Focused, adaptive pack reveal (2026-10-11)

- Removed the suspense/possibility headline and visible narration. The opening now occupies its own larger dialog over the blurred page, with a quiet category/card count label and persistent controls. Status announcements remain available to screen readers; payment/trade mode stays disclosed below the scene.
- Cards retain their packaging dimensions during extraction, then enlarge after every card clears the seam and the wrapper fades. Card count and available width determine size/columns. Larger reveals wrap into scrollable rows rather than shrinking into an unreadable fan; the final cards also use a responsive, keyboard-scrollable grid with controls kept outside the scroll area.
- Timing now adapts to the actual returned card count. Staggers are bounded so large reveals finish in about ten seconds; all cards finish their flips/shimmer before completion. Replay/skip continue to reuse returned cards, with no API or purchase changes. The current catalog still returns three cards; larger counts were explicit QA fixtures only.
- Checks cover 1/2/3/6/12/40 cards at narrow and wide widths, wrapper clearance before enlargement, non-overlap, bounds, final reveal and bounded duration. Browser checks verified the enlarged desktop three-card scene, mobile twelve-card scroll area, no horizontal overflow, keyboard scrolling and visible collection controls. The temporary fixture route was removed before the production build.
- Final validation passed: `npm run typecheck`, all 177 tests (149 API + 28 web), `npm run build`, and `git diff --check`. No deployment or live purchase was performed.


### Integration validation and promotion handoff (2026-10-11)

- Final code snapshot `c28e70c` was checked in a separate clean worktree installed from the lockfile: typecheck, all **178 tests (150 API + 28 web)** and production build passed. No temporary QA route is in the route output. Diff whitespace checks pass.
- Browser smoke verified category stake changes and the preserved sign-in return amount, the checkout panel, and narrow layout at 390 CSS pixels with no horizontal overflow. The ten-pack fan now uses the narrower sizing below 420px. No browser errors were observed in these guest checks. Real Privy OTP and wallet-signature prompts remain for the user's test.
- Production proxy smoke passed explicit demo login → $50 Sports quote → three-card opening → identical retry → portfolio → simulated close. No transfer or Gemini order was submitted. API tests separately prove durable category retries/restart recovery, owner isolation, legacy-chain rejection, receipt-to-selection/status projection, reported-fill card identity and disabled refund broadcasting using explicit fixtures.
- All requested remote branches and latest main are ancestors of this integration branch. The most recent adaptive animation revision is included. Main remains outside this task's promotion scope until the user finishes testing; background updates from another task were reconciled through `18db4e0`.
- Still blocked for a fully live money-to-trade demonstration: authenticated Gemini submission with durable permits/reconciliation, final settlement/refund broadcaster, deployed grant-worker evidence, and the user's real Privy/wallet walkthrough. The UI states these boundaries rather than reporting simulated execution as real.

### User-to-user paper post-trade slice (2026-10-11)

- User confirmed resale of the seller's existing position and future payout rights, not a new option contract. Work is isolated in `codex/posttrade` from preserved UI/grant commit `b09afae`, while `codex/integration-ui-backend` owns the concurrent backend merge. Inspected `feature/ausd-payments` and `mekila`; do not overwrite their checkout/execution work.
- Added durable paper lots, one-time simulated USD account credits, reserved listings, buyer-bound expiring quotes, atomic ownership/cash transfers and durable idempotency. Source receipt replay cannot recreate sold holdings; partial resale/cancellation preserve total quantity. The optional ledger blocks the legacy simulated close route.
- `/marketplace` supports owned lots, listings, review/confirm, partial quantity, cancel, paper balance/history, and owner-scoped sessionStorage retries. Dashboard preserves original fills and projects remaining ownership. Payout rights follow the buyer in the ledger; actual resolution settlement is not implemented.
- Setup, routes, architecture corrections and integration boundaries are in [POSTTRADE.md](POSTTRADE.md). Activation is explicit and requires standalone persistent SQLite. No Gemini sale, on-chain transfer, redeemable balance or option derivative was enabled.
- Validation: typecheck, 64 tests (46 API + 18 web) and production build passed. The Privy-signed API test exercises pack opening → listing → quote → two concurrent same-key purchase requests → updated ownership; no live vendor call occurs. Desktop and 390px guest browser checks found no horizontal overflow or JavaScript errors. Real two-account Privy browser interaction and any real-backed trade remain unverified.

### Marketplace reconciliation into the integration candidate (2026-10-11)

- Included newly published `codex/posttrade` at `6689985`. Preserved checkout authentication, execution/refund guards and Dashboard testnet history while adding the Trade route, paper ledger and remaining-ownership projection. SQLite paper holdings/cash and checkout remain separate; sandbox fills cannot mint paper lots.
- The combined guide now includes explicit marketplace configuration and a two-account walkthrough. With the paper ledger enabled, legacy simulated closing is blocked to prevent bypassing reserved or sold holdings. Privy browser interaction remains for the user's test; no live money or vendor execution is enabled.
- Combined verification passed: typecheck, all **191 tests (161 API + 30 web)**, production build including `/marketplace`, and diff whitespace checks. The authenticated API test covers pack opening, listing, concurrent same-key resale, ownership projection and blocked legacy closing in the merged application. The earlier clean-checkout/browser evidence above predates this additive marketplace merge.

### Ten-second ImPacks motion demo (2026-10-11)

- Created an original 1080p/60 fps, 10-second promotional concept in `docs/design/launch-video/`, with local editable rendering source, poster, storyboard and original synthesized sound. Direction follows the supplied Intently Trust Wallet reference's white product stage, bold typography, floating objects and black end card; no reference footage or soundtrack is reused.
- Uses existing ImPacks foil artwork and an edition selection → foil opening → three illustrative card reveal → brand/URL sequence. Persistent concept labeling and explicit simulated-market labeling avoid presenting this animation as live transaction evidence.
- Artifact-only change; app, shared contracts and provider behavior are unchanged. Paid generation was not used after automatic review blocked a wallet-related balance check. Local rendering needs no wallet or external integration. Validation and handoff: see the artifact README and exported video; live vendor blockers remain unchanged.
- Final artifact validation passed: complete MP4 decode, exact 10.00-second duration, 600 frames, 1920 × 1080 / 60 fps, stereo audio without source clipping, twelve-frame visual review, Python syntax and focused diff whitespace checks. No application build/test claim is made for concurrent application changes.

### Motion demo aligned to production brand components (2026-10-11)

- Revised the ten-second video at the user's request to use the actual brand components: imported `PackArtwork`, `LandingHero` and `CardSpread`; exported the existing Dashboard `CardFace` markup/CSS and SiteHeader `impacks®` wordmark. The film now uses the real pack logo collages, pastel collectible treatments, Inter fonts, existing CTA and product copy.
- Export tooling is isolated in `docs/design/launch-video/`; no application code or vendor behavior changed. Card data remains explicit local fixtures with concept/simulated labeling. The component export server binds loopback only and sends no payment/order requests. Existing live integration blockers remain unchanged.
- Handoff: regenerate PNGs with the local export page after brand changes, then rerender `impacks-demo-10s.mp4`. See the adjacent README for source mapping and reproducible commands. Component/shot visual review and Python/JavaScript syntax checks passed; final media decode is verified separately.
- Revised export verification passed: full decode, exactly 10.00 seconds / 600 frames, 1080p60 H.264 with AAC audio. A decoded reveal frame was visually inspected after encoding.

### Per-edition testnet checkout availability (2026-10-11)

- All ten catalog editions now have pack links, category pages, wallet return paths, and validated category checkout requests. Removed the hardcoded Crypto-only payment gate. The worker publishes expiring readiness for each edition, requiring at least three distinct active sandbox instruments; the API checks that edition again before requesting payment.
- Chaos draws from the available sandbox categories. Unsupported or empty categories never become fixture-backed trades. Current local capabilities report Crypto and Chaos enabled; the remaining editions depend on Gemini sandbox inventory.
- Checkout availability refreshes every 15 seconds, with visible connection recovery and an explicit unavailable-market button state. The primary Buy action uses the testnet checkout; it cannot fall back to simulated pack opening. Wallet confirmation remains user initiated.
- Added worker regressions for all ten editions using isolated test transports, per-edition outage isolation, and eligibility changes before payment. Local live guest browser checks and build/test results are recorded below once complete. Authenticated wallet payment and actual Gemini fill evidence remain separate acceptance checks.

- Follow-up: payment intent now verifies fresh sandbox instruments before issuing wallet payment permission; a route regression proves a stale ready heartbeat cannot authorize payment after markets disappear. Removed the unused simulated session/portfolio hook from the category page so that legacy connection errors cannot mask checkout readiness. The Next proxy briefly retries only disconnected GET/HEAD requests; POSTs are never automatically replayed.

- Validation: typecheck, 228 tests (195 API + 33 web), production build and diff whitespace checks pass. The 20 desktop/mobile navigation checks passed with explicit availability fixtures, and all three outage/retry browser checks passed after the final category cleanup. Live local capabilities report Crypto/Chaos, but worker readiness also briefly became unavailable during browser checks; the UI correctly blocked payment during that interval. No authenticated wallet payment or Gemini order was submitted by this task.

### Local sandbox spending ceiling increase (2026-10-11)

- At the user's request, raised the shared local Gemini sandbox lifetime reservation/spending ceiling from $20 to $1,000 (`GEMINI_SANDBOX_BUDGET_CENTS=100000`). Read-only authenticated balance check returned $99,981.48 available sandbox USD before migration.
- Backed up the checkout database under ignored `apps/api/data/limit-backups/`, migrated only the account capacity, and updated the ignored server environment. Verified all purchase job rows were byte-for-byte unchanged: the existing $20 Chaos reservation remains, leaving $980 of capacity. Fee policy, nonce history, payment attempts and order identities were retained.
- API and purchase worker reload use the same increased ceiling. This is a local configuration/ledger migration; it does not fund user wallets, release uncertain purchases, or change Gemini balances.

### Pack progress reflects reconciliation (2026-10-11)

- The newer platform-advance checkout is awaiting final exchange order/fee evidence. Backend reconciliation work is active in the existing project-status task; no duplicate exchange submission or payment was initiated here.
- Replaced the unconditional platform-advance opening spinner with state-based progress: preparing/executing can animate, wallet connection has its own message, and reconciliation shows a stationary “Checking order status” notice. Added regressions covering reconciliation, payment waits and completed results. This UI correction does not manufacture a reveal or mark incomplete fills as settled.

- Progress UI validation passed: workspace typecheck, API/web regression tests, production build, and focused whitespace checks. Live checkout still reports a partial first order with unresolved fees; the UI fix does not claim the pack is complete.

### Shared snapshot push (2026-10-11)

- User requested publishing the current shared workspace on `codex/durable-purchase-flow`. Snapshot includes themed testnet checkout, platform-advance plumbing, exact Gemini identifier/fee-history recovery, purchase progress UI, grant setup, marketplace copy/currency changes, browser regressions, and demo-video assets.
- Validation for this snapshot: typecheck, all 236 tests (201 API + 35 web), and production build passed. Staged files were checked against configured private secret values; ignored environments, signing keys and SQLite data/backups are excluded. The bundled font license is retained verbatim, including its upstream trailing space.
- Live acceptance remains incomplete: the original partial Gemini fill and fee evidence are preserved, while the remaining pack execution/reconciliation is still under investigation. This push is a code snapshot, not a claim that the pending user's pack or payment has completed.

### Post-trade branch promotion (2026-10-11)

- Reconciled the local post-trade history with current main, preserving its already-integrated marketplace, checkout UI and Gemini preparation. Replaced committed conflict markers with the current main implementation.
- Retained the local Docker marketplace startup instructions in POSTTRADE.md. Local Privy/environment configuration stays ignored; real two-account email sign-in remains unverified. No transfers or exchange orders were enabled.
- Promotion checks passed in the Node 24 Docker container: typecheck, all 194 tests (164 API + 30 web), production build, and diff whitespace validation.

### Main snapshot promotion (2026-10-11)

- At the user’s request, merged the verified shared snapshot with the latest main, preserving the post-trade setup documentation and both status histories. Only documentation changed during reconciliation; application code matches the snapshot that passed typecheck, 236 tests, and production build. Live pack reconciliation remains incomplete.
