# Durable Crypto sandbox purchase flow

Implemented behind `SANDBOX_PIPELINE_ENABLED=1`; disabled by default. This supersedes the submission/card-issuance limitations in the historical Stage 1 execution and refund guides. It is a testnet/sandbox integration, with no AUSD-to-Gemini bridge, production trading, resale of Gemini holdings, or resolution payouts.

## What is connected

The Crypto category Buy button creates/resumes one wallet-owned checkout, verifies Privy identity plus wallet signature, reserves a nominal sandbox USD budget, requests one exact Ethereum Sepolia AUSD transfer, and saves its hash. The worker verifies the canonical receipt, freezes three server-selected predictions and client order IDs, submits bounded Gemini sandbox IOC limit orders, reconciles fills and fees, persists the opening, and refunds the exact unused six-decimal AUSD amount. The reveal and Dashboard payment history read the persisted result. Prepared or fee-unresolved cards cannot appear as final holdings.

Sports and Chaos remain disabled in sandbox purchase mode until separately validated. With the pipeline off, the existing simulated pack flow remains explicitly labeled. The paper marketplace is separate and cannot receive these holdings.

## Company treasury model

The customer pays ImPacks once, in AUSD. The server fixes the receiving address (`AUSD_RECIPIENT_ADDRESS`) on the owned checkout; the browser cannot supply or change it. The receipt verifier requires the exact token, buyer, company recipient, amount, chain, payment window and canonical confirmations. Until that succeeds, the worker submits no Gemini order.

ImPacks holds that AUSD in its dedicated treasury. Gemini purchases spend the platform account’s separately prefunded test USD through server-side credentials (`account: primary` for the master key). This is platform-funded execution against a verified customer purchase, not a token bridge or an exchange deposit from the customer. The durable ledger allocates the resulting cards to the wallet-owned purchase; the tokens are not transferred to the buyer’s Gemini account. Unspent budget is returned as an exact AUSD refund from the same company treasury.

The customer flow is Buy → wallet confirmation → purchase status → reveal. No Gemini account or manual backend execution step is required. Receipt/recovery details remain available without explaining treasury funding in the main checkout. Testnet status, uncertain results and unsupported withdrawal/resale features must remain accurate.

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
- Final holdings require terminal orders and complete matching USD fee evidence. `/v1/mytrades` is matched by order ID, symbol and aggregate fill quantity. If unavailable or incomplete, `/v1/orders/history` supplies nested fills after checking the enclosing order's exact ID, client ID, symbol, side, original limits, quantities and terminal status. Recovery reads at most the latest 500 account orders; missing older history remains unresolved. Duplicate, broken, foreign, incomplete or missing-fee fills cannot authorize settlement. Gemini int64 order/trade identifiers retain their original wire digits. Six-decimal costs/fees determine the refund; cent projections round conservatively.
- Refunds revalidate the original payment, bind the final execution digest, reserve one dedicated treasury nonce, and persist signed bytes before sending. Uncertain broadcasts reuse those exact bytes/hash. A consumed unstaged nonce, reverted refund, reorg or accounting mismatch stops for reconciliation.
- The generic internal refund broadcast route remains disabled. Only the separately enabled worker transport broadcasts. Internal execution-report writes cannot alter worker-managed purchases.
- Completed purchases are not continuously monitored for later deep reorgs or vendor trade corrections. Add operational reconciliation/alerts before any broader rollout. Market-resolution payout and real-backed selling are also outside this slice.

## Evidence and acceptance test

Read-only live sandbox checks on October 11, 2026 verified authenticated terms status (already accepted), USD availability of $99,981.48, 33 Crypto contracts with supported quotes, and successful order-history/trade-history endpoint reads. The sampled history returned no trades, so this **does not prove fee evidence for a real prediction fill**. No actual order or transfer was sent during implementation.

Automated fixtures exercise canonical payment validation, durable submission recovery, unknown/missing fee handling, partial fills, exact sub-cent refunds, owner isolation, shared capacity/nonces, lease exclusion and repeat signed refund broadcasts. These establish implementation behavior, not live vendor completion.

For the controlled integration test, fund the new treasury with Sepolia ETH, fund the buyer with official test AUSD, configure the explicit $20 ceiling/fee policy and enable both flags. Restart the API and start the worker. In Crypto, sign in, select $20, accept randomness, and confirm exactly one testnet transfer. Record the purchase ID, payment hash and original Gemini client IDs. Wait for confirmations, all three final order/fee observations, persisted reveal/Dashboard cards and a confirmed remainder refund. Refresh and restart the worker/API; assert the same cards, no duplicate orders and the same refund hash. If fee evidence is absent, preserve the purchase and investigate the vendor history response rather than injecting a zero fee or enabling fixtures.

Do not describe the full live flow as verified until that acceptance evidence exists. Local activation was enabled on October 11 after the treasury received 0.05 Sepolia ETH, with a $20 cumulative ceiling and a ready worker. No purchase had been submitted at activation; the funded-wallet acceptance test remains pending. Hosted deployment is unchanged.

## Local ceiling update — October 11, 2026

The local development account now uses a $1,000 cumulative reserved/spent sandbox USD ceiling (`GEMINI_SANDBOX_BUDGET_CENTS=100000`), increased from the original $20 acceptance-test setting at the user's request. A pre-migration balance check showed $99,981.48 available sandbox USD. The existing $20 Chaos reservation was retained, leaving $980 capacity immediately after migration. The original conservative example above remains appropriate for a fresh deployment; this local increase is not an automatic default. Account policy and server/worker configuration were migrated together, with an ignored database backup and unchanged purchase records.

## Optional execute-first testnet demo

With `TESTNET_PLATFORM_ADVANCE_ENABLED=1`, new purchases receive a durable platform advance before execution. This supersedes payment-first sequencing only for those explicitly authorized rows. All other purchases retain the original sequence. Schema 7 adds `pipeline_advances`; do not downgrade or remove its rows to retry a purchase.

The worker may issue real observed Gemini test positions while AUSD remains unpaid. Returned opening payment status is `pending`, not `confirmed`. `fundingMode: platform-advance` on capabilities and purchase status tells the typed frontend to skip the initial transfer, display progress immediately, reveal reconciled results, then offer Finish purchase. Wallet authorization is still required to collect; there is no silent debit or invented on-chain receipt. Accounts without Sepolia ETH need gas before collection can succeed.

Advance spend/reservations have a hard 500-test-AUSD-equivalent cumulative cap, additionally bounded by the configured shared platform budget. One unpaid advance per Privy account or wallet is enforced transactionally. The collection deadline is fixed to 24 hours at advance authorization, before any wallet request. New market availability is not required to collect an already delivered pack. Unpaid or expired advances stay recorded; manual recovery is required after their deadline. No automatic write-off, retry identity reset or real-money credit facility exists.

The original exact-amount payment, canonical receipt, six-decimal remainder refund, persisted order IDs, and account ownership checks still apply. Advance execution does not authorize refunds until payment has really arrived. Disabling the flag stops new advances without erasing existing obligations. Final cards require terminal exchange orders and fee evidence, so the experience removes the blockchain wait but cannot guarantee instantaneous vendor fills.

Local acceptance on October 11: purchase `6cada5a6-3833-441b-b814-ace44dfd582e` has an actual partial Gemini fill. Original order `145853902277745098` filled two contracts for 0.47 test USD plus 0.03 USD fees, recovered from account order history; `/v1/mytrades` returned no fills and `/v1/order/status` explicitly rejected prediction orders. This is partial vendor evidence, not completed end-to-end acceptance. The remaining instruments temporarily reported `post_only` without buy quotes. After readiness returned, the second original submission was attempted once, but its response is uncertain and recovery reads have timed out or found no matching order. Its permit remains consumed: only lookup is allowed, never blind resubmission. The third order remains unsubmitted. No AUSD collection or refund has occurred for this advance. The local worker is running; vendor reconciliation, hosted activation and the user's wallet collection/refund walkthrough remain outstanding.
