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

`GET /api/wallets/:address/ausd` reads a valid EVM address on Base Sepolia. Returns WalletBalance (`address`, `chainId:84532`, `asset:"AUSD"`, `tokenAddress`, decimal-string `balanceAtomic`, exact `formatted` string, `network:"Base Sepolia"`). Invalid addresses return 400; RPC/chain/token validation failures return 503. This read does not prove account ownership or authorize payments.


## Collector dashboard

- Openings now include optional `theme`; filled positive-quantity cards receive `position: { status: "open" }`. Order receipts retain the original entry quantity and spend.
- `POST /api/openings/:id/cards/:cardId/close` requires the current API bearer session, an `Idempotency-Key`, and `{ "confirmSimulation": true }`. Only the opening's owner can close a confirmed filled position. This paper-only action closes its entire quantity at the current fixture side price and returns the updated Opening. `position` gains `status: "closed"`, `closedAt`, `exitPriceCents`, and `proceedsCents`; the card remains in the portfolio. No wallet or Gemini order call occurs and proceeds are not redeemable funds.
- Concurrent/replayed close requests cannot close twice. Keys are bound to owner/opening/card; reuse for another position returns `409 KEY_REUSED`. Missing/unavailable prices leave the position open and permit a same-key retry. Nonfilled orders and sandbox openings fail closed. In-memory storage and these retry guards are not durable trading infrastructure.
