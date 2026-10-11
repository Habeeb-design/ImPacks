# ImPacks API contract

Canonical types and body schemas live in `packages/contracts/src/index.ts`. Routes below are implemented by the local demo API. Checkout payments use SQLite and server-side verification. Wallet ownership and fulfillment authorization are implemented; demo identity/storage and provider reconciliation remain separate tasks.

## Transport

- Next.js frontend at `http://localhost:3000`: `/api` rewrites to `http://127.0.0.1:3001`. The rewrite also runs in production; configure `API_PROXY_TARGET` before building for a remote API.
- JSON bodies; protected routes require `Authorization: Bearer <session token>`.
- Errors: `{ "error": { "code": "...", "message": "..." } }`.
- Money: AUSD atomic units are strings (6 decimals); sandbox allocations/spend/prices are integer cents. Never use floats for payment accounting.

| Method | Route | Input | Response | Auth |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | None | Mode and explicit integration status | No |
| POST | `/api/auth/wallet/challenge` | `{walletAddress}` + Origin | `WalletChallenge` | No |
| POST | `/api/auth/wallet/verify` | `{challengeId, signature}` + Origin | `WalletSession` | Signed challenge |
| GET | `/api/auth/wallet/me` | None | `WalletIdentity` | Wallet session |
| POST | `/api/auth/wallet/logout` | `{}` + Origin | 204 | Wallet session |
| POST | `/api/auth/demo` | `{displayName}` | `Session` | No |
| GET | `/api/me` | None | `{user, mode}` | Yes |
| POST | `/api/auth/logout` | `{}` | 204; session revoked | Yes |
| GET | `/api/packs` | None | `{packs: Pack[]}` | No |
| POST | `/api/quotes` | `{packId, budgetCents?}` | `Quote` valid for 5 minutes | Yes |

| POST | `/api/checkout` | `{packType, buyerAddress?}` | 201 `CheckoutPurchase` | Wallet session |
| GET | `/api/checkout/:purchaseId` | UUID purchase ID | `CheckoutPurchase` | Wallet session |
| POST | `/api/checkout/:purchaseId/verify` | `{transactionHash}` | Confirmed `CheckoutPurchase` or retryable/error response | Wallet session |
| POST | `/api/quotes` | `{packId}` | `Quote` valid for 5 minutes | Yes |
| POST | `/api/openings` | `OpenRequest` + `Idempotency-Key` | `Opening` | Yes |
| GET | `/api/openings/:id` | Path ID | Owned `Opening` | Yes |
| GET | `/api/portfolio` | None | `{openings: Opening[]}` | Yes |

## Wallet authentication

Set server-only `APP_ORIGIN` to the exact browser origin, e.g. `http://localhost:3000`
for the existing Next.js development proxy, or `https://impacks.example` when deployed.
No trailing slash, paths, credentials, wildcards or arbitrary HTTP hosts are accepted.
Messages never derive the domain from Host or forwarded headers.

1. POST `/api/auth/wallet/challenge` with `{walletAddress}` from that origin.
2. Sign the **exact returned `message`** with the wallet's `signMessage` / `personal_sign`
   operation (EIP-191). It uses the SIWE format with domain, URI/origin, wallet, chain
   11155111, a server-generated 256-bit nonce, issued time, five-minute expiry and request ID.
3. POST `/api/auth/wallet/verify` with `{challengeId, signature}`. The server loads its
   stored message and verifies the EOA signature using viem. It does not accept a
   client-supplied message, nonce, wallet override, chain or domain.
4. Keep the returned opaque `token` in frontend memory and send `Authorization: Bearer
   <token>` on checkout operations. Sessions last 15 minutes and are persisted by hash.
   Reauthenticate after expiry or page reload; do not put tokens in URLs or logs.
5. POST `{}` to `/api/auth/wallet/logout` to revoke the session persistently.

Auth POSTs and checkout POSTs require an exact matching `Origin` header. Browsers
supply it automatically; use the existing same-origin Next.js `/api` proxy. GETs
with bearer authentication allow an absent Origin but reject a different Origin.
Native/server test clients must explicitly send Origin on POST. There is no cookie
session or permissive CORS configuration. All wallet responses use `Cache-Control: no-store`.

Nonce consumption and session insertion are one SQLite transaction, so concurrent
verification/replay can issue only one session. Invalid signatures do not consume a
challenge; expired or consumed challenges return 401 `WALLET_UNAUTHORIZED`.
If a successful sign-in response is lost, obtain and sign a new challenge; consumed
challenges never reveal or reissue a session token. The inaccessible session expires.
Wrong Origin returns 403 `ORIGIN_MISMATCH`; missing/invalid server origin returns
503 `WALLET_AUTH_NOT_CONFIGURED`. Demo login tokens never authorize wallet checkout.
Smart-contract wallets (ERC-1271/6492) are not supported by this EOA-only milestone.

## Purchase sequence

### AUSD checkout requests

These endpoints persist testnet payment instructions and verify on-chain transfers.
They do not generate cards or invoke Gemini. They are separate from the existing
15-AUSD themed demo quotes/openings below. Checkout tiers and prices are server-owned:

| `packType` | AUSD | `amountAtomic` (6 decimals) |
| --- | --- | --- |
| `starter` | 1 | `"1000000"` |
| `premium` | 3 | `"3000000"` |
| `ultimate` | 5 | `"5000000"` |

Example request:

```json
{"packType":"starter"}
```

`CheckoutPurchase` returns `purchaseId` (server UUID), `packType`, `buyerAddress`,
`asset: "AUSD"`, `amount` (decimal string), `amountAtomic` (integer string),
`decimals: 6`, `tokenAddress: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC"`,
`chainId: 11155111`, configured `recipientAddress`, UTC ISO `createdAt`/`expiresAt`,
and `status: "pending"`. It also explicitly returns `mode: "ausd-testnet"`,
`storage: "sqlite"`, and `paymentEnabled: false`. Added fields are `updatedAt`,
`expiredAt`, `confirmedAt`, `transactionHash`, `paymentBlockNumber`,
`paymentBlockHash`, and `paymentLogIndex`; evidence fields start as null.
`storage: "memory"` is retained in the type for explicitly injected SQLite tests only.

POST returns a `Location` header for the new purchase. Every POST creates a new ID,
including repeated submissions; there is no checkout idempotency yet. Retain the ID
and use GET to poll. Both successful endpoints return `Cache-Control: no-store`.
GET returns `status: "expired"` at or after the 15-minute server deadline;
expiration is persisted on retrieval/verification. Confirmed purchases never expire.
An expired purchase may still confirm an on-time mined transfer (see below).

Only `packType` and optional `buyerAddress` are allowed. The server always uses the
authenticated wallet as buyer; an optional buyer must match it or returns 403
`WALLET_MISMATCH`. Unauthenticated access returns 401. Another wallet's purchase
returns 404 for both status and verification, before any blockchain RPC call. Missing/invalid pack types,
malformed/zero optional wallet addresses, invalid mixed-case checksums, extra fields (including
prices, status or confirmation), and malformed path UUIDs return 400 `INVALID_REQUEST`.
Unknown purchase IDs return 404 `PURCHASE_NOT_FOUND`. A missing/invalid receiving
address returns 503 `CHECKOUT_NOT_CONFIGURED` on creation; other demo routes still work.
The token and chain are fixed to the shared Ethereum Sepolia constants. Checkout creation
needs no RPC call; connectivity verification remains a separate diagnostic.

### Verification and durable replay protection

```http
POST /api/checkout/<purchaseId>/verify
Content-Type: application/json

{"transactionHash":"0x<64 hexadecimal characters>"}
```

This strict body accepts no amount, status, wallet, or confirmation fields. The server
uses the purchase's immutable buyer, recipient, token, chain and amount. viem checks
RPC chain 11155111, a successful matching receipt, six token decimals at the mined block,
and exactly one strictly decoded AUSD `Transfer` from that buyer to that recipient
with the exact atomic amount. Multiple matching transfers in one transaction are
rejected. The event's emitting contract and receipt/log block and transaction hashes
must match; removed or malformed logs are rejected. The Transfer sender is the payer;
relayed transfers may have a different transaction signer.

At least `AUSD_MIN_CONFIRMATIONS` blocks (default/minimum 12, inclusive of the receipt
block) are required. The block hash is checked against the canonical chain twice.
This is an L2 confirmation-depth policy, not a claim of L1 finality. Deep reorgs after
confirmation need future reconciliation before production fulfillment.

A successful verification returns 200 with `status: "confirmed"` and durable evidence.
An atomic SQLite transaction sets the hash and confirmation status together, with a
case-insensitive UNIQUE hash constraint. The same purchase/hash returns the original
confirmation even if the RPC is down. A different hash cannot overwrite a confirmed
purchase. A hash consumed by another purchase returns 409. No pack is issued.

| Response | Meaning / action |
| --- | --- |
| 400 `INVALID_REQUEST` | Invalid UUID/hash, extra fields, or invalid buyer (including self-payment) |
| 404 `PURCHASE_NOT_FOUND` | Unknown purchase |
| 409 `TRANSACTION_ALREADY_USED` | Hash belongs to another purchase |
| 409 `PURCHASE_ALREADY_CONFIRMED` | Purchase already has a different confirmed hash |
| 422 `INVALID_PAYMENT` | Reverted receipt, mismatched/malformed transfer, or outside payment window |
| 425 `PAYMENT_PENDING` | Receipt missing, insufficient depth, or changing/noncanonical chain; retry same hash |
| 503 `PAYMENT_NOT_CONFIGURED` | Missing/invalid server RPC, token, recipient or depth configuration |
| 503 `WRONG_PAYMENT_NETWORK` | RPC is not Ethereum Sepolia |
| 503 `PAYMENT_RPC_UNAVAILABLE` | Temporary RPC/read failure; retry same hash |

Invalid or pending submissions do not reserve hashes or permanently fail a purchase.
RPC errors are sanitized so provider URL credentials never reach responses. Only a
validated confirmation stores a transaction hash; untrusted submissions are not evidence.
The transfer block timestamp must be at/after `createdAt` and strictly before
`expiresAt`. Old transfers cannot pay new purchases. After expiry, an on-time mined
payment can still be verified following an RPC outage or delayed confirmations.
Late transfers return 422 and require manual reconciliation/refund policy; expiry
does not undo a blockchain transfer. GET can report expired until reconciliation.

**Payment collection remains disabled.** Wallet ownership and internal fulfillment
authorization are now implemented, but `paymentEnabled: false` remains until the
issuer implements the durable fulfillment contract and live testnet/reconciliation
checks are completed. Confirmed payment status does not itself issue a pack.

Checkout ownership, challenges, session hashes and fulfillment authorizations share
SQLite schema version 2. Migration preserves old records and consumed transaction
hashes. Legacy purchases without a verified owner remain inaccessible to public
checkout routes and cannot be fulfilled; manual reconciliation is required, not
automatic adoption of a previously client-supplied address. Nothing is deleted.

SQLite records survive restarts on the same persistent volume. Never delete consumed
hash records or start another replica with an independent database. See
[backend storage setup](../apps/api/README.md#persistent-checkout-and-verification).
Expired records are retained; there is no background expiry/receipt worker yet.

Typed client methods: `api.walletChallenge(walletAddress)`,
`api.walletVerify({challengeId, signature})`, `api.walletMe(token)`,
`api.walletLogout(token)`, `api.createCheckout(token, {packType})`,
`api.checkout(token, purchaseId)`, and
`api.verifyCheckout(token, purchaseId, {transactionHash})`.
No frontend components consume these methods yet. Existing callers must now pass
wallet session tokens; demo tokens are not interchangeable.

## Internal fulfillment API

The trusted issuer backend uses a **separate** `INTERNAL_FULFILLMENT_KEY` credential,
never a wallet session. Internal routes reject browser Origin headers, and must be
restricted to backend network access in deployment. No internal methods or secrets
are added to the frontend client. See [the fulfillment contract](FULFILLMENT.md)
for the complete lease, idempotency and restart-recovery protocol.

| Method | Route suffix under `/api/internal/checkout/:purchaseId/fulfillment` | Body |
| --- | --- | --- |
| GET | (none) | None |
| POST | `/claim` | `{requestId}` (worker-generated UUID) |
| POST | `/renew` | `{requestId, attempt}` |
| POST | `/complete` | `{requestId, attempt, resultId}` |

The server verifies a confirmed purchase with a verified owner before authorizing
work. Clients cannot specify buyer, pack, amount, status or fulfillment ID. A unique
purchase constraint allocates one stable fulfillment ID. No Gemini call, card draw,
pack issuance, or external order is performed by these endpoints.

### Existing demo opening flow

1. Create a demo session; fetch packs.
2. Display selected pack price, allocation, and shared disclosure. Require acceptance. Category pages may send `budgetCents` ($20–$250, $5 steps). Omitted budget uses the catalog 15 AUSD starter. The quote still draws three cards and splits the budget in integer cents.
3. Request a quote. Real payment UX will use its chain, asset, amount and recipient; the demo has a null recipient and moves no money.
4. Retain one random idempotency key and the quote before submitting the opening.
5. Post `{quoteId, disclosureVersion: "random-v1", paymentProof: "demo:<quoteId>"}` in local demo mode. A real proof must be separately specified and verified by the backend; the demo string is never valid payment outside demo mode.
6. Animate the returned cards. Only orders with `status: "filled"` count as filled positions.

## Retry and failure behavior

- Same quote + same key returns the original attempt, including concurrent requests; no second draw/payment/order set.
- Same key for a different quote → 409 `KEY_REUSED`.
- Same quote with a different key → 409 `QUOTE_USED`.
- A fresh attempt on an expired quote → 409 `QUOTE_EXPIRED`. An existing attempt can still be retrieved after expiry.
- Another user's quote/opening → 404. Missing/expired bearer session → 401.
- Missing/invalid key or missing disclosure version → 400.
- Too few eligible markets → 409 `INSUFFICIENT_MARKETS`, before payment.
- An uncertain payment result submits no orders and returns a failed opening with payment status `unknown`.
- An order exception is `unknown`, not a claim of rejection or a reason to resubmit blindly.
- Network errors: preserve quote/key and retry the same opening; do not request a new purchase.

Demo opening idempotency and ownership are process-local in this scaffold (checkout confirmation is durable). They do not survive a restart or work across API replicas. Before external integrations, implement durable unique keys and a recoverable state machine.

## Status model

Payment: `confirmed`, `failed`, `unknown`. Orders: `filled`, `pending`, `failed`, `unknown`. Opening: `completed` if all cards fill, `partial` if some fill, `pending` if unresolved and none fill, otherwise `failed`. Some statuses are reserved for future adapters.

`/api/portfolio` is opening history, including failures; derive holdings only from confirmed fills. Quote budget is an upper limit. Track actual spend, fees and any remainder separately. All current order IDs and payment references begin with `demo-`.

### Public wallet balance

`GET /api/wallets/:address/ausd` reads a valid EVM address on Ethereum Sepolia. Returns WalletBalance (`address`, `chainId:11155111`, `asset:"AUSD"`, `tokenAddress`, decimal-string `balanceAtomic`, exact `formatted` string, `network:"Ethereum Sepolia"`). Invalid addresses return 400; RPC/chain/token validation failures return 503. This read does not prove account ownership or authorize payments.

## Welcome grant extension

`POST /api/welcome-grant` (empty object) and `GET /api/welcome-grant` require a verified **Privy access token**, not the existing demo session token. They enqueue/read only that Privy user's one-time 50-test-AUSD grant. The shared `WelcomeGrant` DTO returns status, fixed asset/amount/chain, recipient and transaction hash. Clients cannot specify amount, recipient or user ID. Disabled servers return `status: disabled`; no token transfer is simulated.

`POST /api/webhooks/privy` verifies the raw request with Svix headers and enqueues supported Privy signup/wallet events. A separate persistent worker verifies identity and sends funds. See [welcome-grant setup and recovery](WELCOME_GRANTS.md). This extension does not change pack-payment semantics.

## Collector dashboard and genre discovery

- `GET /api/market-categories` reads Gemini's public active category endpoint and returns `{ categories: string[], fetchedAt: string, source: "gemini" }`. Concurrent reads coalesce and successful responses cache for 60 seconds. Upstream failure, timeout or invalid data returns `503 MARKET_CATEGORIES_UNAVAILABLE`; expired data is not silently reused. Discovery does not change pack trading eligibility.
- Openings now include optional `theme`; filled positive-quantity cards receive `position: { status: "open" }`. Order receipts retain the original entry quantity and spend.
- `POST /api/openings/:id/cards/:cardId/close` requires the current API bearer session, an `Idempotency-Key`, and `{ "confirmSimulation": true }`. Only the opening's owner can close a confirmed filled position. This paper-only action closes its entire quantity at the current fixture side price and returns the updated Opening. `position` gains `status: "closed"`, `closedAt`, `exitPriceCents`, and `proceedsCents`; the card remains in the portfolio. No wallet or Gemini order call occurs and proceeds are not redeemable funds.
- Concurrent/replayed close requests cannot close twice. Keys are bound to owner/opening/card; reuse for another position returns `409 KEY_REUSED`. Missing/unavailable prices leave the position open and permit a same-key retry. Nonfilled orders and sandbox openings fail closed. In-memory storage and these retry guards are not durable trading infrastructure.

## Internal sandbox execution (Stage 1)

Authenticated backend-only GET `/api/internal/checkout/:purchaseId/execution` and
POST suffixes `/reserve`, `/prepare`, `/report` use the existing internal fulfillment
credential and lease fencing. See [EXECUTION.md](EXECUTION.md) for strict request
contracts, states, budgets and reconciliation. No frontend methods or credentials
are added; checkout/wallet contracts are unchanged.

## Internal refund preparation

GET `/api/internal/checkout/:purchaseId/refund` and POST suffixes `/prepare`,
`/authorize`, `/reconcile` use the existing internal backend credential. POST bodies
are strictly empty objects. Authorization is blocked pending an authoritative final
settlement adapter; broadcasting is disabled. See [REFUNDS.md](REFUNDS.md).
