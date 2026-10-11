# ImPacks API contract

Canonical types and body schemas live in `packages/contracts/src/index.ts`. Routes below are implemented by the local demo API. Production identity, wallet signing instructions, persistence and provider reconciliation remain backend tasks.

## Transport

- Next.js frontend at `http://localhost:3000`: `/api` rewrites to `http://127.0.0.1:3001`. The rewrite also runs in production; configure `API_PROXY_TARGET` before building for a remote API.
- JSON bodies; protected routes require `Authorization: Bearer <session token>`.
- Errors: `{ "error": { "code": "...", "message": "..." } }`.
- Money: AUSD atomic units are strings (6 decimals); sandbox allocations/spend/prices are integer cents. Never use floats for payment accounting.

| Method | Route | Input | Response | Auth |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | None | Mode and explicit integration status | No |
| POST | `/api/auth/demo` | `{displayName}` | `Session` | No |
| GET | `/api/me` | None | `{user, mode}` | Yes |
| POST | `/api/auth/logout` | `{}` | 204; session revoked | Yes |
| GET | `/api/packs` | None | `{packs: Pack[]}` | No |
| POST | `/api/quotes` | `{packId, budgetCents?}` | `Quote` valid for 5 minutes | Yes |
| POST | `/api/openings` | `OpenRequest` + `Idempotency-Key` | `Opening` | Yes |
| GET | `/api/openings/:id` | Path ID | Owned `Opening` | Yes |
| GET | `/api/portfolio` | None | `{openings: Opening[]}` | Yes |

## Purchase sequence

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

Idempotency and ownership are process-local in this scaffold. They do not survive a restart or work across API replicas. Before external integrations, implement durable unique keys and a recoverable state machine.

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

## User-to-user paper resale

The optional `/api/posttrade` extension has a durable ownership/cash ledger, owner-only listings, expiring purchase quotes and atomic paper trades. It requires Privy-backed sessions and uses distinct `Position`, `ResaleListing`, `ResaleQuote` and `ResaleTrade` contracts. Current holdings are separate from original pack receipts; the old close route is blocked when this ledger is active. See [POSTTRADE.md](POSTTRADE.md) for endpoints, retry rules and the integration handoff. This does not execute Gemini sells, create option contracts or pay AUSD.
