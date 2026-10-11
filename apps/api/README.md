# Backend and API team

Run `npm run dev:api` from the root. `src/app.ts` builds the Fastify app without listening, so tests use `app.inject()` and need no port. `src/index.ts` runs the server.

## Own these files

- `src/providers/ports.ts`: market discovery, payment confirmation and order execution interfaces.
- `src/providers/demo.ts`: isolated UI fixtures and fake providers; replace via dependency injection, never silently fall back from real services to mocks.
- `src/services/packs.ts`: server-side random selection, allocation, quote ownership, retry handling and opening history.
- `src/app.ts`: request validation, sessions and routes.
- `test/`: contract, payment and retry tests.

Demo login is just a display name with a random bearer session. Every login creates a new identity. Tokens expire after 24 hours. Demo sessions/openings reset on restart; checkout records persist in SQLite. API binds to localhost by default. `APP_MODE` other than `demo` throws intentionally.

## Implementation order

1. Durable tables for users, sessions, quotes, payment receipts, openings and orders. Unique constraints for consumed payment proofs, quote openings and client order IDs. Durable worker/reconciliation for external side effects.
2. Real identity verification and user-to-wallet binding; select an auth provider with the frontend team.
3. Gemini market discovery and executable order-book prices; preserve provider IDs and expiry/eligibility information.
4. AUSD testnet verification bound to a quote and payer, followed by Gemini sandbox execution with stable client IDs.
5. Fill reconciliation, partial failures, unspent allocations and a documented refund policy.

See [integration notes](../../docs/INTEGRATIONS.md) for credentials, sources and acceptance criteria. The starter is not ready for external payments simply because an adapter is added: replace memory storage and wire payment instructions/identity as well.

## AUSD connectivity infrastructure

`src/providers/ausd/index.ts` exports server-only configuration, a viem public client,
and `verifyAusdConnectivity`. This isolated, read-only module does not implement
`PaymentProvider.confirm` or enable checkout. No wallet library or private key is needed.

Using Node 24 and npm 11, copy `.env.example` to `.env` in this directory if no local
file exists. Set `AUSD_RPC_URL` to your Base Sepolia HTTP(S) endpoint. Keep
`AUSD_CONTRACT_ADDRESS=0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`.
Set `AUSD_RECIPIENT_ADDRESS` to the public address of your receiving wallet when
available; it is optional for this diagnostic. Keep `APP_MODE=demo`.

From the repository root:

```sh
npm run check:ausd -w @impacks/api
```

The diagnostic checks RPC chain ID 84532, deployed bytecode, and `decimals()` = 6
at the reported block. It exits nonzero on failure and suppresses raw RPC errors
to avoid exposing endpoint credentials. Success proves connectivity only, not a
payment, wallet ownership, or readiness to accept funds. Unit tests use explicitly
local JSON-RPC fixtures and do not constitute live integration evidence.

Agora's [official deployments](https://docs.agora.finance/developer/contract-deployments)
and [precision documentation](https://docs.agora.finance/api) were checked on
October 11, 2026; they agree with the existing `@impacks/contracts` constants.
One AUSD is 1,000,000 atomic units. Connectivity uses the existing shared constants;
the persistent checkout below adds separate shared contracts.

## Persistent checkout and verification

`POST /api/checkout` requires a verified wallet session and accepts `{packType, buyerAddress?}` with server-owned prices
of 1/3/5 AUSD for starter/premium/ultimate. `GET /api/checkout/:purchaseId` returns
pending, expired or confirmed status. `POST /api/checkout/:purchaseId/verify` accepts
only `{transactionHash}`. See [API contract](../../docs/API.md) for checks and errors.
Existing routes remain; wallet authentication is now required. Optional buyerAddress must match the session.

Node 24's built-in `node:sqlite` stores purchases with WAL, FULL synchronization,
a 5-second busy timeout, and a UNIQUE case-insensitive transaction-hash constraint.
Schema version 2 is initialized/migrated automatically without deleting records. Confirmation and hash consumption
commit in one short database transaction; RPC calls happen outside the write lock.
`src/storage/checkout.ts` owns persistence; `src/providers/ausd/verify.ts` verifies
receipts; `src/services/checkout.ts` coordinates them without calling pack providers.
No additional npm dependency or separate database service is required.

Configuration in `apps/api/.env`:

```dotenv
APP_MODE=demo
AUSD_RPC_URL=<trusted Base Sepolia HTTP(S) endpoint>
AUSD_CONTRACT_ADDRESS=0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC
AUSD_RECIPIENT_ADDRESS=<your nonzero receiving wallet>
AUSD_MIN_CONFIRMATIONS=12
APP_ORIGIN=http://localhost:3000
INTERNAL_FULFILLMENT_KEY=<secure random backend-only secret, at least 32 characters>
```

`AUSD_DATABASE_PATH` defaults outside Docker to `apps/api/data/checkout.sqlite`;
set an absolute path on persistent local disk for deployment. Compose sets it to
`/var/lib/impacks/checkout.sqlite` on the `impacks-node24_checkout_data` named volume.
Run `docker compose -f compose.node24.yaml up -d` to apply the volume configuration.
No private key is used. Unconfigured RPC verification fails closed with 503, without
preventing request creation or the independent demo flow. Recipient configuration
is required for creation. Existing records retain their original recipient after
configuration changes. Never switch an existing payment database to another chain.

Deploy one API instance with this persistent volume. Multiple connections on the same
local file are safe; separate files across hosts are not a shared replay registry.
For multi-host/serverless deployment, migrate purchases and all consumed hashes to a
shared transactional database first. Do not place WAL databases on network filesystems.
Back up using SQLite's backup facility or a consistent stopped-volume snapshot;
copying only the live `.sqlite` file can omit WAL writes. Retain the volume and replay
history across restarts/deployments. Existing in-memory purchases cannot be recovered.

On-time mined transfers can reconcile after expiry. RPC failures and insufficient
confirmations do not create permanent failures. The default 12-block policy verifies
L2 depth and current canonical inclusion, not irreversible L1 finality. No automatic
post-confirmation reorg worker, refunds or pack issuance exists. Wallet authentication
and durable fulfillment authorization now exist; `paymentEnabled` remains false
until the issuer integration and live testnet/reconciliation checks are complete.
Keep this API private during development.

Tests explicitly inject in-memory SQLite or temporary file databases and local RPC
fixtures; they never substitute a fixture for a failed real RPC. No real payment
receipt has been supplied for end-to-end verification yet.

## Wallet ownership and internal fulfillment

`src/services/wallet-auth.ts` creates five-minute EIP-191/SIWE challenges and verifies
EOA signatures with viem. Domain and URI come exclusively from `APP_ORIGIN`.
Challenge consumption and issuance of a 15-minute session are atomic. SQLite stores
only SHA-256 session-token hashes; no wallet private key or signature is stored.
Wallet sessions and revocations survive restart. Legacy demo sessions are separate.
Challenge and session cleanup/rate limiting remain deployment work; do not expose
unlimited challenge creation publicly for the hackathon.

Checkout creation derives buyer identity from the session. All checkout reads and
verification require the same wallet owner. Version-1 purchases are preserved with
NULL ownership and require manual reconciliation; migration never trusts their
previously client-supplied buyer field as authenticated ownership.

`src/services/fulfillment.ts` authorizes a confirmed purchase once, identified by one
stable fulfillment ID. The internal credential requires at least 32 characters;
generate it from a secure random source and provision it to the API and trusted
issuer backend only. Do not use a wallet private key as this credential.
A five-minute worker lease and increasing attempt number fence stale completion.
Retries and recovery reuse the fulfillment ID, and committed results are immutable.

The issuer MUST persist work/results uniquely by fulfillment ID and reconcile unknown
external outcomes before retrying. This API cannot make external issuance exactly-once
by itself. See [internal contract](../../docs/FULFILLMENT.md) before integrating.
Use TLS and backend network restrictions for internal routes in deployment. The
current Next.js catch-all API proxy is not a private-network boundary; the internal
credential remains mandatory and must never reach browser code.

## Sandbox execution preparation

See [the internal execution contract](../../docs/EXECUTION.md). SQLite schema 3 adds
execution and order-intent ledgers; the existing database path/volume and internal
credential are reused. No Gemini credentials or new dependencies are needed.
Read-only discovery is selectively adapted from `mekila`; no order submission or
proof-echo payment confirmation is available. The frontend APIs remain unchanged.
