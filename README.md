# ImPacks

FIFA-style pack opening for prediction markets. Choose a theme, pay in AUSD, reveal randomly selected markets and YES/NO sides, and automatically submit positions to Gemini Predictions.

## Quick start

Use Node.js 24 LTS and npm 11.

```sh
npm install
npm run dev
```

Open http://localhost:3000. The Next.js App Router frontend proxies `/api` to the Fastify API at http://localhost:3001. Set the public Privy App ID as described in the app environment examples to enable email sign-in. Browse genres under Packs, select an available edition, accept random selection, and open it. Dashboard keeps the resulting cards grouped by opened pack and lets the signed-in owner inspect or close simulated positions.

**Team starter:** Privy email sign-in and on-chain wallet balance reads are implemented. Pack payments and fills are simulated, and pack state resets on API restart. Non-demo trading mode refuses to start until the backend team wires real providers and persistence. Do not collect money with this starter.

## Ownership

| Directory | Owner | Purpose |
| --- | --- | --- |
| `apps/web` | Frontend team | Next.js App Router: login, packs, payment UX, reveal, collection |
| `apps/api` | Backend/API team | Identity, AUSD, Gemini, orchestration, persistence |
| `packages/contracts` | Both teams | Shared schemas, types, endpoints, disclosure |
| `docs/TEAM.md` | Both teams | Living task board, decisions, blockers, handoffs |

Start with [team roles and status](docs/TEAM.md), [API contract](docs/API.md), and [integration notes](docs/INTEGRATIONS.md). Update the team board in each PR.

Backend build plan: [sandbox treasury, ledger and execution](docs/PAYMENTS_ARCHITECTURE.md), followed by the optional [AUSD execution escrow](docs/ESCROW_SPEC.md). These are researched specifications; pack payments and trading remain unimplemented.

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
- Starter price: 15 AUSD; three 5-unit allocations, no platform fee. Whole-contract fills may leave a remainder.
- Server owns selection, budget and execution; browser animates stored results, never rerolls.
- AUSD testnet payment and Gemini sandbox USD are separate. This MVP has no AUSD-to-Gemini bridge.
- Target Most Creative, Gemini Predictions and Agora AUSD tracks. Replace fixtures with working testnet/sandbox integrations before judging.

## Paper position marketplace

The isolated post-trade slice adds `/marketplace`: list existing position quantity, buy another user's listing, and transfer its future paper payout rights. It uses a durable SQLite ledger and separately labeled simulated USD. Enable the standalone API with `POSTTRADE_DEMO_ENABLED=1` and a persistent `POSTTRADE_DB_PATH`. See [setup, model and integration handoff](docs/POSTTRADE.md). Real-backed resale and payouts remain unimplemented.
