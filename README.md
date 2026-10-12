# ImPacks

FIFA-style pack opening for prediction markets. Choose a theme, pay in AUSD, reveal randomly selected markets and YES/NO sides, and automatically submit positions to Gemini Predictions.

## Quick start

Use Node.js 24 LTS and npm 11.

```sh
npm install
npm run dev
```

Open http://localhost:3000. The Next.js App Router frontend proxies `/api` to the Fastify API at http://localhost:3001. Set the public Privy App ID as described in the app environment examples to enable email sign-in. Browse genres under Packs, select an available edition, accept random selection, and open it. Dashboard keeps the resulting cards grouped by opened pack and lets the signed-in owner inspect or close simulated positions.

**Checkout:** category Buy actions use the explicitly enabled testnet pipeline and require current per-edition readiness; otherwise checkout is unavailable. Legacy demo API endpoints and the paper marketplace remain separate simulated flows. Wallet-owned AUSD checkouts, receipt verification and the optional sandbox purchase worker use durable SQLite storage. The [purchase pipeline guide](docs/PURCHASE_PIPELINE.md) covers payment → Gemini IOC orders → reconciled holdings → exact remainder refund. It is implemented behind disabled-by-default flags; actual funded-wallet end-to-end acceptance remains outstanding.

AUSD runs on Ethereum Sepolia and Gemini uses separately funded sandbox USD. No conversion bridge or production trading is implemented. Credentials and refund signing keys stay in server/worker secrets.

## Ownership

| Directory | Owner | Purpose |
| --- | --- | --- |
| `apps/web` | Frontend team | Next.js App Router: login, packs, payment UX, reveal, collection |
| `apps/api` | Backend/API team | Identity, AUSD, Gemini, orchestration, persistence |
| `packages/contracts` | Both teams | Shared schemas, types, endpoints, disclosure |
| `docs/TEAM.md` | Both teams | Living task board, decisions, blockers, handoffs |

Start with [team roles and status](docs/TEAM.md), [API contract](docs/API.md), and [integration notes](docs/INTEGRATIONS.md). Update the team board in each PR.

**Integration branch:** [configuration and integration-test walkthrough](docs/INTEGRATION_TEST.md). The UI now connects the selected category/stake to durable testnet checkout, receipt verification and Dashboard payment history. The optional [durable purchase pipeline](docs/PURCHASE_PIPELINE.md) adds transfers and Gemini submissions when its dedicated worker is explicitly enabled and ready.

Backend build plan: [sandbox treasury, ledger and execution](docs/PAYMENTS_ARCHITECTURE.md), followed by the optional [AUSD execution escrow](docs/ESCROW_SPEC.md). These plans describe the broader execution system; the current gated testnet implementation and remaining live evidence are documented in the purchase pipeline guide.

Optional [50-test-AUSD welcome grants](docs/WELCOME_GRANTS.md) on **Ethereum Sepolia (11155111)** are implemented and disabled by default. A separate worker funds new, verified Privy users from a dedicated external wallet, with PostgreSQL records preventing duplicate grants. Follow the setup guide to configure server secrets, migrate the database, and run the worker. This does not fund Gemini or enable pack payments.

```sh
npm run dev:web       # UI only; needs API for data
npm run dev:api       # API with demo providers
npm run typecheck
npm test
npm run build
npm run start:api     # built API, after build
npm run start:web     # Next.js production server, after build
```

App-local `.env.example` files document configuration. Copy to `.env` in the same app only when overriding defaults. `NEXT_PUBLIC_*` values are public and inlined at build time; secrets belong in the API app only. Set `API_PROXY_TARGET` for a separately hosted API. The Next.js API route proxies to this origin by default and reports an unavailable API instead of falling back to fixtures.

## Vercel demo

Live demo: [impacks.vercel.app](https://impacks.vercel.app). Deployments currently use the Vercel CLI; automatic GitHub deployment is not connected.

Set the Vercel project root directory to `apps/web`, Node.js to `24.x`, and deploy from the repository root with the included `vercel.json`. The build compiles shared contracts and the API before Next.js. `IMPACKS_EMBEDDED_DEMO=1` explicitly hosts the existing simulated Fastify service within the Next.js server route. All random selection and retry logic remain server-side. Sessions, quotes, and collections live only in a warm process and can reset or become unavailable when serverless instances change; this is a visual/functional demo, not durable trading infrastructure. Real providers require a separately hosted durable API and `IMPACKS_EMBEDDED_DEMO=0`.

## MVP decisions

- Login → choose theme → approve budget and randomness → pay → reveal → collection.
- Three distinct markets per pack; equal probability among eligible markets, 50/50 YES/NO sides, no replacement within a pack.
- Judging demo: select 20 test AUSD for one Crypto pack, split across three positions, with no platform fee. Whole-contract fills and fees may leave a remainder. The older catalog's 15-AUSD default is not the selected demo checkout amount.
- Server owns selection, budget and execution; browser animates stored results, never rerolls.
- AUSD testnet payment and Gemini sandbox USD are separate. This MVP has no AUSD-to-Gemini bridge.
- Target Most Creative, Gemini Predictions and Agora AUSD tracks. Replace fixtures with working testnet/sandbox integrations before judging.

The historical [Stage 1 execution guide](docs/EXECUTION.md) documents reservation and preparation. The [purchase worker](docs/PURCHASE_PIPELINE.md) extends it with durable submission, final holdings and refund transport.

## Paper position marketplace

The isolated post-trade slice adds `/marketplace`: list existing position quantity, buy another user's listing, and transfer its future paper payout rights. It uses a durable SQLite ledger and separately labeled simulated AUSD. Enable the standalone API with `POSTTRADE_DEMO_ENABLED=1` and a persistent `POSTTRADE_DB_PATH`. See [setup, model and integration handoff](docs/POSTTRADE.md). Real-backed resale and payouts remain unimplemented.
