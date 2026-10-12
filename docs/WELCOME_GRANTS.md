# Automatic 50-test-AUSD welcome grants

Implemented October 11, 2026. Opt-in and disabled by default. The external funding wallet sends **50 testnet AUSD**, not real USD, to each eligible new Privy user's embedded Ethereum wallet. This feature does not enable pack payments, the Gemini adapter, or an internal spendable balance.

## Flow

1. Privy's signed `user.created` or `user.wallet_created` webhook enqueues the Privy DID. The wallet UI also makes an authenticated, idempotent enqueue request after login, covering missed webhook deliveries.
2. A separate worker fetches that user from Privy using server credentials. The account must be non-guest, created on/after the configured launch time, and have a verified email plus exactly one distinct Privy embedded Ethereum wallet. Missing verification/wallet information is retried; old/deleted/guest users are ineligible. Multiple embedded addresses wait for an explicit recipient policy rather than selecting arbitrarily.
3. PostgreSQL pins one grant per user and one recipient allocation per wallet. A wallet change cannot redirect a previously allocated grant. Neither the browser nor the webhook's wallet fields decide the transfer recipient or amount.
4. The worker checks Ethereum Sepolia, the pinned AUSD token, six decimals, token funds and gas. It signs a 50-AUSD transfer and durably stores the exact signed bytes, hash and nonce **before broadcasting**.
5. Lost network responses and worker restarts retry the same signed transaction. The wallet UI shows pending/confirming status, then refreshes its on-chain balance once a canonical receipt in a `safe` block contains the exact transfer.

The transfer is an ERC-20 `transfer`, from our dedicated external wallet to the user's embedded wallet. No user approval is required to receive tokens. Only the worker holds the funding private key. The API, frontend and Privy user wallets do not need that key.

## Configure

Use the existing standalone Fastify API and a separate persistent worker, sharing one PostgreSQL database. Node.js 24 is required. On a hosted installation, configure the following through server secret storage. For local development, use the gitignored `apps/api/.env` for shared/API configuration and `apps/api/.env.grants-worker` for the funding key and Privy app secret. Only worker commands load the latter; restrict both files to owner read/write (`chmod 600`). Never paste a private key into chat, commit it, or use a `NEXT_PUBLIC_*` name.

| Variable | API | Worker | Purpose |
| --- | --- | --- | --- |
| `WELCOME_GRANTS_ENABLED=1` | Yes | Yes | Explicit opt-in; default is off |
| `DATABASE_URL` | Yes | Yes | Same durable PostgreSQL database |
| `PRIVY_APP_ID` | Yes | Yes | Existing Privy app |
| `WELCOME_GRANTS_STARTS_AT` | Yes | Yes | Same explicit ISO UTC launch time; older accounts excluded |
| `WELCOME_GRANTS_TREASURY_ADDRESS` | Yes | Yes | Dedicated external funding wallet's public address |
| `WELCOME_GRANTS_DAILY_LIMIT` | Yes | Yes | Maximum grants signed per UTC day; e.g. 100 = 5,000 test AUSD |
| `PRIVY_WEBHOOK_SIGNING_SECRET` | Yes | No | Secret for this API's Privy webhook endpoint |
| `PRIVY_APP_SECRET` | No | Yes | Server-side user lookup |
| `WELCOME_GRANTS_PRIVATE_KEY` | No | Yes | External funding wallet key, `0x` + 64 hex characters |
| `ETHEREUM_SEPOLIA_RPC_URL` | Optional | Recommended | Reliable RPC with receipt/history and `safe` block support |

The database is bound to the app, treasury, chain and launch time. Startup rejects a different binding. Do not change the launch time to “now” on each restart. The AUSD address and chain ID are pinned in code: `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, chain **11155111**, amount **50000000 atomic units**. There is no configurable mainnet destination or arbitrary amount.

The October 11 network change supersedes the original Base Sepolia setup. Use `ETHEREUM_SEPOLIA_RPC_URL`; the previous Base RPC variable is no longer read. Fresh databases bind to Ethereum Sepolia. A legacy database without a chain binding, or one bound to Base Sepolia, fails closed: reconcile its old grants before any manual migration. Never relabel stored signed transactions or erase payment history. The worker also rejects signed transactions for any other chain before broadcasting. No grant database or transfers had been activated in this workspace when the network changed.

Fund the treasury with test AUSD and Ethereum Sepolia ETH. It must be a dedicated grant wallet: do not use it for manual transfers, deposits-to-exchange, or other workers that allocate its nonce. Gas quotes above 0.0001 ETH per transaction are rejected, and preparation requires an additional native ETH reserve. Receiving users need no ETH; later spending their AUSD needs test ETH or separately implemented sponsorship.

## Start

From the repo root, after configuring the environment:

```sh
# One-time, additive schema setup. Sends no transfers.
npm run grants:migrate -w @impacks/api

# Run in separate terminals/processes.
npm run dev:api
npm run grants:worker -w @impacks/api
```

For a built release:

```sh
npm run build
npm run start:api
npm run grants:worker:prod -w @impacks/api
```

The normal Next.js `/api` proxy can route to the standalone API using `API_PROXY_TARGET`. Set `IMPACKS_EMBEDDED_DEMO=0` on the web deployment. The embedded Vercel demo has no grant runtime; do not put funding keys there. Enabling the runtime in a Vercel/embedded process is rejected. `APP_MODE=demo` can remain until the separate pack/trading backend is implemented; welcome grants are an independent, explicitly enabled on-chain feature.

Configure Privy's webhook endpoint to the public standalone API's `/api/webhooks/privy`, subscribing to `user.created` and `user.wallet_created`. Use its `whsec_...` secret. Verification uses the unmodified request body and Svix signature/timestamp checks. Deliveries return success only after the candidate is persisted; retries deduplicate by user. The logged-in UI provides a fallback for users who arrive before the webhook is configured.

## Endpoints and UI

- `POST /api/welcome-grant`, empty JSON object, **Privy access token** in Authorization: enqueue/check the authenticated user. Demo session tokens are rejected. Recipient, amount and user-ID inputs are rejected.
- `GET /api/welcome-grant`, same authentication: read only the caller's status.
- `POST /api/webhooks/privy`: Svix-authenticated event intake. Disabled installations return 503 so deliveries can retry after configuration.

Shared `WelcomeGrant` DTO states: `disabled`, `pending`, `confirming`, `confirmed`, `ineligible`, `needs_attention`. The DTO contains the fixed asset/amount/chain, recipient and transaction hash, never a signed transaction or internal error. Disabled/ineligible grants are not advertised in the wallet menu. Enabled grants show progress and an explorer link; failed status polling retries without blocking login. Page refresh or leaving the page does not stop an already queued grant.

## Operations and recovery

The first version serializes one in-flight transaction using a PostgreSQL session advisory lock. Multiple worker replicas sharing the database cannot allocate independent treasury transactions concurrently. Waiting for a safe block can take minutes; later signups remain queued during that interval. This favors correctness over faucet throughput.

| Condition | Behavior |
| --- | --- |
| Repeat login, webhook replay, concurrent enqueue | Same database grant; no additional payment |
| Low AUSD/ETH, high gas, Privy/RPC unavailable | Remains queued; worker retries |
| Daily cap | Remains queued; checks again later; signed/failed attempts conservatively count for that UTC day |
| Broadcast response lost or dropped transaction | Inspect hash; rebroadcast the exact persisted bytes if absent and nonce unconsumed |
| Reverted transfer | Terminal `failed`; not automatically retried with a new nonce |
| Consumed nonce without matching receipt, unexpected transfer receipt | `needs_review`; halts new signing until investigated |
| RPC lacks `safe` blocks or conflicting block hash | No successful grant reported; keep reconciling |
| Admin pauses worker | No new transfers; prepared work stays durable for restart |

Before resolving a failure, inspect the saved transaction and canonical chain history. Do not delete/reset grants, regenerate their transaction with a fresh nonce, or recreate the database to “retry”: the original transfer may already have executed. Fee-bump/cancellation tooling and automatic retry of reverted transactions are not implemented. A stuck transaction requires an operator procedure that preserves its nonce and full transaction history. Keep the funding signer dedicated and the database backed up; restoring stale backups requires chain reconciliation before resuming.

Useful read-only checks:

```sql
SELECT status, count(*) FROM welcome_grants GROUP BY status;
SELECT user_id, recipient, status, tx_hash, last_error, updated_at
FROM welcome_grants WHERE status NOT IN ('confirmed', 'ineligible')
ORDER BY created_at;
SELECT count(*) AS grants_signed_today
FROM welcome_grants
WHERE prepared_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
```

Daily caps limit expenditure; one-per-user/email verification is not proof of a unique human. Restrict demo signup access if account farming becomes an issue. Safe-block confirmation reduces reorg exposure but is not finalized-block confirmation; investigate deep reorgs before issuing any replacement grant.

## Validation and activation evidence

Automated tests cover a file-backed PostgreSQL-compatible database reopen, duplicate enqueue, crash/broadcast uncertainty, write-before-send, eligibility, wallet uniqueness, daily caps, low funds, exact signed transfer, chain/token/receipt checks, webhook signatures/replays and authentication isolation. PGlite tests validate the schema and SQL behavior; they do not substitute for a multi-process PostgreSQL deployment test.

Before marking the deployed integration verified: run two workers against the real PostgreSQL service, create one new verified Privy account, record its one 50-AUSD transfer, repeat login/webhook delivery, restart the worker, and confirm there is still exactly one transfer and the wallet balance displays it. Funding secrets, hosted PostgreSQL, webhook configuration and this live testnet smoke test are not supplied by the code change.

Primary references: [Privy user lookup](https://docs.privy.io/api-reference/users/get), [Privy events](https://docs.privy.io/user-management/users/webhooks/handling-events), [Svix verification](https://www.svix.com/guides/receiving/receive-webhooks-with-javascript-nodejs/), [Agora deployments](https://docs.agora.finance/developer/contract-deployments).

## Local activation — October 11, 2026

The local API and grant worker are enabled with an explicitly approved **10-account / 500-test-AUSD cap per UTC day**, one 50-test-AUSD grant per eligible account, and eligibility beginning `2026-10-11T07:00:00.000Z`. The dedicated treasury is `0x23a78B7ebaA6B7b34b0C59fc55287B81F5B79632`. This is distinct from the pack payment/refund treasury.

`compose.grants.yaml` provisions PostgreSQL on loopback port 15432 with a persistent Docker volume. Its gitignored `apps/api/.env.grants-db` supplies `POSTGRES_USER`, `POSTGRES_DB` and a generated `POSTGRES_PASSWORD`; the shared API `DATABASE_URL` must match. Keep this file mode 0600. Start the configured database with:

```sh
docker compose -f compose.grants.yaml up -d --wait
```

Then use the migration and worker commands above. Do not remove the volume to retry a grant. The database, API and worker must remain running for automatic local funding.

Three eligible accounts were queued through verified server-side Privy lookup. The first 50-AUSD transfer was mined successfully at block 11895148, transaction `0xbf99b4749a54b302d9d727c8142dfe2191d0b237c7babe3ee164bfa1d91f1f1b`; the recipient’s balance is 50 test AUSD. Safe confirmation and the remaining queue are being reconciled. No replacement transaction was created after the initial uncertain broadcast response.

The local webhook signing secret is not registered in Privy, so webhook delivery is **not verified**. Authenticated UI enqueue after login supplies automatic funding locally. Refresh pages that previously observed grants disabled. Hosted rollout, multi-worker live acceptance and browser balance-display evidence remain outstanding. Grants transfer AUSD only, not Sepolia ETH for subsequent purchase gas.
