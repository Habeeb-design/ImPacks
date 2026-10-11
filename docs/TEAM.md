# ImPacks team board

Last updated: October 11, 2026. This is the shared source of truth for scope, ownership and handoffs. Update your rows in the same PR as your code; record what works, what remains simulated, and the next blocker. This file is versioned with the repository; it is not automatically synchronized to an external document.

## Product agreement

An easy login leads directly to themed packs. The user agrees to the budget and random selection before opening. The backend randomly draws three distinct eligible markets and a 50/50 YES/NO side for each, confirms AUSD payment, then submits the selected positions. Cards reveal the stored result and show actual order status.

Target demo: AUSD on Base Sepolia plus Gemini Predictions sandbox. AUSD purchases the pack; Gemini orders use separately funded test USD. No conversion or exchange deposit bridge is implemented. Demo providers currently simulate both systems.

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
| FE-1 | Component structure and visual design | Frontend | Ready | Mobile and desktop login → opening flow |
| FE-2 | Pack reveal animation | Frontend | Ready | Returned cards animate; reduced motion works |
| FE-3 | Login and wallet payment UI | Frontend | Waiting on BE-1 / BE-3 | Authenticated wallet pays exact quote; rejection recoverable |
| FE-4 | Order and payment result screens | Frontend | Ready | Pending, partial, failed and unknown states are explicit |
| BE-1 | Real auth and durable storage | Backend/API | Ready | Verified sessions, wallet binding, durable receipts/orders |
| BE-2 | Gemini markets adapter | Backend/API | Ready | Live discovery, themes, fresh executable prices, sufficient liquidity |
| BE-3 | AUSD testnet payment adapter | AUSD payments developer | In progress: wallet auth, payment verification and durable fulfillment authorization tested; issuer/live rollout pending | Verify sender/token/chain/recipient/amount; proof cannot be reused |
| BE-4 | Gemini sandbox order adapter | Backend/API | Waiting on BE-1 / BE-2 | Stable client IDs, bounded spend, actual fills and positions |
| BE-5 | Reconciliation and remainder policy | Backend/API | Ready | Unknown orders checked before retries; refund/remainder policy recorded |
| DEMO-1 | Real testnet end-to-end smoke test | Both | Waiting on integrations | Payment receipt + sandbox orders + portfolio match |
| DEMO-2 | Public repo, deployment, ≤2 minute recording | Release owner — assign | Not started | Submission links work and show non-hardcoded core behavior |

## Contract agreement

- Shared request/response definitions: `packages/contracts/src/index.ts`.
- Every opening uses one owned quote and one stable `Idempotency-Key`.
- Random selection runs on the server once per attempt. Refresh/retry returns the same result.
- Never describe a pending/unknown order as a holding or a simulated receipt as on-chain settlement.
- All keys stay server-side. Agree together before adding or renaming a required contract field.
- Existing demo opening flow: fixed 15 AUSD pack, three cards, 5-unit budget each, zero platform fee. Authenticated checkout tiers: Starter 1, Premium 3, Ultimate 5 testnet AUSD; Stage 1 maps these to three mixed-theme cards with 100/300/500 nominal sandbox cents, with submission and issuance disabled. Whole-contract rounding remains a decision for the live testnet demo.

## Updating this document

1. Claim a task by replacing its owner placeholder or adding your name.
2. Move status to In progress; add a blocker with the specific input you need.
3. Include this board in your implementation PR. Mark Done only after its acceptance check passes.
4. Add an entry below for API changes, integration evidence and decisions. Both teams review shared-contract changes.

## Handoff log

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

## Open decisions

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
