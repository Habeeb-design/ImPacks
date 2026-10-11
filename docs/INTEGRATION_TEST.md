# Integration branch handoff

Branch: `codex/integration-ui-backend`. The user has authorized main promotion after integrating Mekila's changes and completing checks. The walkthrough below still records required manual and vendor validation.

## What is combined

- Current main and merged Ahrian: email-only Privy login, wallet, category fan/stakes, collector dashboard, simulated position closing.
- Previously local work: genre browser, approved one-wrapper/three-card reveal, Ethereum Sepolia wallet and welcome grants, architecture specifications.
- AUSD branch: SQLite checkout, wallet-signature ownership, receipt verification, fulfillment leases, durable selection/order intents, refund preparation, diagnostics and Docker environment.
- Mekila: nine-genre Gemini discovery and shared Theme definitions. Its unverified payment proof echo and ungated order submission are superseded by the verified checkout and disabled execution ports. The original code is preserved in Git history.
- Additional Mekila port: all ten catalog definitions and a server-only HMAC/sandbox buy-request builder using persisted order limits. The builder does not send requests; a durable submitting/reconciling worker is still required.
- Posttrade: the Trade navigation, marketplace, durable paper resale ledger, and remaining-ownership projection in Dashboard. Paper holdings and simulated cash remain separate from testnet checkout.

## Current boundaries

The existing Buy pack flow remains explicitly simulated, including paper closing. The separate **Your testnet checkout** panel uses the same selected edition, stake and randomness consent. It requests a login signature from the current Privy wallet; that signature cannot transfer funds. It creates a durable checkout, verifies an existing receipt, prepares the server's three selections, and shows payment/execution/refund status under **Dashboard → Testnet purchases**.

There is no testnet transfer button. Gemini submission and refund broadcasting are disabled in the underlying branches and remain disabled here. Prepared selections are not holdings. Cards/reveal appear in payment history only after trusted internal order observations exist; unknown/unfilled cards retain those labels. Never submit fake fill reports to a real environment. Internal credentials and signed transactions are never returned to the browser.

A full live payment → Gemini fill → refund test is still blocked by the missing submission/reconciliation/settlement adapters. The integrated UI/API and explicitly simulated flow can be tested now. Passing automated tests is not evidence of live vendor execution.

## Configuration

Use Node 24 and npm 11 (`nvm use` when available). Do not overwrite existing `.env` files or copy secrets into browser variables.

In `apps/api/.env`:

```dotenv
APP_MODE=demo
PRIVY_APP_ID=<same public app ID as the frontend>
APP_ORIGIN=http://localhost:3000
ETHEREUM_SEPOLIA_RPC_URL=<Ethereum Sepolia RPC>
AUSD_RPC_URL=<Ethereum Sepolia RPC>
AUSD_CONTRACT_ADDRESS=0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC
AUSD_RECIPIENT_ADDRESS=<dedicated public payment treasury address>
AUSD_MIN_CONFIRMATIONS=12
# AUSD_DATABASE_PATH=<persistent absolute path>; defaults to apps/api/data/checkout.sqlite
WELCOME_GRANTS_ENABLED=0
# Enable for the two-account paper marketplace walkthrough:
POSTTRADE_DEMO_ENABLED=1
POSTTRADE_DB_PATH=data/posttrade.sqlite
```

Frontend `apps/web/.env.local` uses `NEXT_PUBLIC_PRIVY_APP_ID`, `API_PROXY_TARGET=http://127.0.0.1:3001` and `IMPACKS_EMBEDDED_DEMO=0`. APP_ORIGIN must match the browser's exact scheme/host/port. The Next.js proxy forwards that origin without inventing it. All balances, signatures, receipts and explorers now use Ethereum Sepolia (11155111).

The payment receiving wallet is separate from the welcome-grant funding wallet. Grants still require their own PostgreSQL database, worker and Privy webhook/server credentials; see [WELCOME_GRANTS.md](WELCOME_GRANTS.md). Do not enable grants as a prerequisite for simulated testing. Checkout SQLite schema 5 preserves old records; Base purchases are inaccessible for new execution, and old wallet sessions/challenges without chain binding require fresh authentication. Reconcile historical Base records rather than relabeling them.

Only trusted backend tooling may receive `INTERNAL_FULFILLMENT_KEY` (32+ characters). Leave it unset for UI preparation tests. Live market preparation uses public Gemini data and may report insufficient or unavailable markets; it never falls back to fixtures. The 1/3/5 test-AUSD legacy diagnostic tiers remain available, separate from category stakes.

## Start and automated checks

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

RPC transport tests open local loopback servers. Grant tests use a PostgreSQL-compatible fixture database, not a deployed multi-process service. API integration tests use ephemeral signer keys and explicit market/payment fixtures; they cover category pricing/consent, identical retries, restart persistence, wallet isolation, disabled embedded checkout, preparation and reported-result projection. Tests never broadcast transfers or submit Gemini orders.

For production-style local testing after building, run `npm run start:api` and `npm run start:web` in separate terminals. Do not point tests at a valuable treasury or use fixture reports as real execution evidence.

## Manual walkthrough

1. Open Home, Packs, Crypto/Sports/Chaos category pages, Login and Dashboard. Confirm desktop/mobile layout, category filtering and stake selection. Seven additional Gemini genres remain previews until execution support exists.
2. Sign in by email, finish Privy wallet creation, confirm Ethereum Sepolia balance and refresh behavior. Sign out/reconnect and ensure another account cannot see the prior account's cards.
3. Accept randomness and use **Buy pack** for the simulated flow. Check pause/skip/replay, the exact three returned cards, Dashboard, paper closing and retry behavior. This existing path still uses in-memory pack state.
4. On a category page, accept details and click **Prepare testnet checkout**. Confirm the wallet prompt is a login message, contains chain 11155111 and the correct origin, and does not ask for a transfer. Confirm the receipt panel preserves the selected category/amount.
5. Reload and choose **Resume saved checkout**. The same purchase ID and amount must return. Change accounts and confirm the previous checkout is not accessible. An expired or confirmed checkout offers **Start a new checkout**; history remains stored.
6. Connect **Dashboard → Testnet purchases**. The wallet session stays in memory; a refresh may need a fresh signature. The history shows the latest 100 owned purchases. Restart the standalone API and confirm the same records remain.
7. Receipt verification is for an existing authorized test payment only. Do not send funds just to bypass the disabled checkout gate. In controlled API tests, verify pending/reorg/wrong token/amount/sender/recipient/replay cases; then prepare the exact same selection twice.
8. Trusted backend fixture tests exercise reported fills and refund states. UI cards must retain pending/unknown/failed labels; only actual confirmed fills count as holdings. No public route may authorize execution reports, settlement or refund broadcast.
9. Test unavailable RPC/Gemini/API states. Errors must stay visible and retries must preserve purchase/selection identity. Embedded Vercel mode must report checkout unavailable.
10. Open **Trade** (`/marketplace`) with two Privy test accounts. Account A opens a simulated pack, lists some quantity, and account B purchases it. Check reserved/remaining quantity, both paper balances, Dashboard ownership and trade history. Retry the same saved request and restart the API to confirm no duplicate transfer. With the paper ledger enabled, the former full-position close action is replaced by marketplace management. Follow [POSTTRADE.md](POSTTRADE.md) for detailed checks; real checkout fills and AUSD balances do not enter this paper ledger.

Record walkthrough results and any remaining failures in `docs/TEAM.md`. CI and this checklist do not replace the user's Privy/wallet or live vendor integration test.
