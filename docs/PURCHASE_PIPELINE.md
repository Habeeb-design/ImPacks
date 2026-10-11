# Durable Crypto sandbox purchase flow

Implemented behind `SANDBOX_PIPELINE_ENABLED=1`; disabled by default. This supersedes the submission/card-issuance limitations in the historical Stage 1 execution and refund guides. It is a testnet/sandbox integration, with no AUSD-to-Gemini bridge, production trading, resale of Gemini holdings, or resolution payouts.

## What is connected

The Crypto category Buy button creates/resumes one wallet-owned checkout, verifies Privy identity plus wallet signature, reserves a nominal sandbox USD budget, requests one exact Ethereum Sepolia AUSD transfer, and saves its hash. The worker verifies the canonical receipt, freezes three server-selected predictions and client order IDs, submits bounded Gemini sandbox IOC limit orders, reconciles fills and fees, persists the opening, and refunds the exact unused six-decimal AUSD amount. The reveal and Dashboard payment history read the persisted result. Prepared or fee-unresolved cards cannot appear as final holdings.

Sports and Chaos remain disabled in sandbox purchase mode until separately validated. With the pipeline off, the existing simulated pack flow remains explicitly labeled. The paper marketplace is separate and cannot receive these holdings.

## Process and configuration

Run the standalone API and worker against the **same persistent local SQLite database**. Schema 6 adds durable account reservations, payment attempts, order submission permits, observations, time nonces, worker leases, final settlement and refund nonces. Back up the database before migration; do not delete it or replay production data against a blank copy. Multi-host replicas require a shared transactional database implementation first.

Keep `APP_MODE=demo` for the independent simulated services. Configure API and worker server secrets:

```dotenv
SANDBOX_PIPELINE_ENABLED=1
AUSD_DATABASE_PATH=/absolute/persistent/path/checkout.sqlite
APP_ORIGIN=http://localhost:3000
PRIVY_APP_ID=<same application as the frontend>
AUSD_RPC_URL=<Ethereum Sepolia RPC>
AUSD_CONTRACT_ADDRESS=0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC
AUSD_RECIPIENT_ADDRESS=<dedicated receiving and refund treasury>
GEMINI_API_KEY=<sandbox key>
GEMINI_API_SECRET=<sandbox secret>
GEMINI_NONCE_MODE=time
GEMINI_SANDBOX_BUDGET_CENTS=2000
GEMINI_FEE_RESERVE_BPS=1000
```

The example ceiling limits cumulative reserved/spent sandbox USD to $20. The 10% fee reserve is a conservative execution ceiling, **not a statement of Gemini's fee schedule**. Confirm the account's actual fees before activation. Order quantities are reduced to keep maximum limit cost plus this reserve within each allocation. Fees exceeding the reserve stop settlement for manual reconciliation.

Use a dedicated sandbox account/key, exclusively with this database and worker installation. API-key fingerprint binds the ledger; changing the key, account, ceiling or fee policy requires explicit reconciliation/migration. Reservations are conservative: expired unpaid attempts are retained for late evidence, and spent amounts continue consuming the lifetime ceiling. Capacity release/refill and key rotation are operator procedures, not automatic balance resets. Do not edit rows to bypass uncertain orders.

Worker-only local file `apps/api/.env.pipeline-worker` (ignored by Git; mode 0600):

```dotenv
AUSD_REFUND_PRIVATE_KEY=<private key controlling AUSD_RECIPIENT_ADDRESS>
AUSD_REFUND_BROADCAST_ENABLED=1
```

Never load this file in the API or frontend. Hosted workers need equivalent server secrets. The new local treasury created for this integration is **`0xcf0C5EB7cE054ae0FD4F8863427E516fEf40381D`**, on Ethereum Sepolia (11155111). It is distinct from the welcome-grant treasury. At creation, both ETH and AUSD balances were zero. It needs Sepolia ETH for refund gas; verified incoming AUSD funds the remainder refund. The generated key and supplied Gemini credentials are in ignored, permission-restricted local files, not committed here.

```sh
npm run check:purchases -w @impacks/api  # read-only auth, balance, eligible Crypto quotes
npm run purchases:worker -w @impacks/api
# After npm run build:
npm run purchases:worker:prod -w @impacks/api
```

Run the read-only diagnostic before starting the worker; its isolated diagnostic nonce allocator must not compete with an active account key.

The worker publishes a 45-second readiness heartbeat after checking the refund signer/gas, sandbox terms status, USD budget and at least three supported quoted Crypto markets. New payments require this heartbeat. The worker does not accept vendor terms automatically. It only contacts `api.sandbox.gemini.com`, never the production trading host. Unsupported/unquoted markets are excluded without fabricated prices.

## Recovery rules

- A wallet payment request is claimed durably once. Only an explicit wallet rejection (`4001`) releases that request. If the browser or wallet response is lost, recover its transaction hash from wallet history and attach it; never send a second transfer. Account switching cannot change the frozen buyer, amount or recipient.
- The server commits a one-use submission permit **before** network I/O. A lost response, including a crash between permit and send, causes lookup by the original client order ID. “Not found” never grants another send. Unresolved absence requires operator investigation.
- Existing orders can be reconciled while new-purchase readiness is unavailable. New orders require readiness and refreshed instrument metadata. Price movement does not reprice or redraw the saved order.
- Final holdings require terminal orders and complete matching USD fee evidence. `/v1/mytrades` is matched by order ID, symbol and aggregate fill quantity; unavailable or incomplete fee evidence keeps funds reserved. Six-decimal costs/fees determine the refund; cent projections round conservatively.
- Refunds revalidate the original payment, bind the final execution digest, reserve one dedicated treasury nonce, and persist signed bytes before sending. Uncertain broadcasts reuse those exact bytes/hash. A consumed unstaged nonce, reverted refund, reorg or accounting mismatch stops for reconciliation.
- The generic internal refund broadcast route remains disabled. Only the separately enabled worker transport broadcasts. Internal execution-report writes cannot alter worker-managed purchases.
- Completed purchases are not continuously monitored for later deep reorgs or vendor trade corrections. Add operational reconciliation/alerts before any broader rollout. Market-resolution payout and real-backed selling are also outside this slice.

## Evidence and acceptance test

Read-only live sandbox checks on October 11, 2026 verified authenticated terms status (already accepted), USD availability of $99,981.48, 33 Crypto contracts with supported quotes, and successful order-history/trade-history endpoint reads. The sampled history returned no trades, so this **does not prove fee evidence for a real prediction fill**. No actual order or transfer was sent during implementation.

Automated fixtures exercise canonical payment validation, durable submission recovery, unknown/missing fee handling, partial fills, exact sub-cent refunds, owner isolation, shared capacity/nonces, lease exclusion and repeat signed refund broadcasts. These establish implementation behavior, not live vendor completion.

For the controlled integration test, fund the new treasury with Sepolia ETH, fund the buyer with official test AUSD, configure the explicit $20 ceiling/fee policy and enable both flags. Restart the API and start the worker. In Crypto, sign in, select $20, accept randomness, and confirm exactly one testnet transfer. Record the purchase ID, payment hash and original Gemini client IDs. Wait for confirmations, all three final order/fee observations, persisted reveal/Dashboard cards and a confirmed remainder refund. Refresh and restart the worker/API; assert the same cards, no duplicate orders and the same refund hash. If fee evidence is absent, preserve the purchase and investigate the vendor history response rather than injecting a zero fee or enabling fixtures.

Do not describe the full live flow as verified until that acceptance evidence exists. Local activation remains off pending treasury funding and this controlled test.
