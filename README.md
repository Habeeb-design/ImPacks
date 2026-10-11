# ImPacks

FIFA-style pack opening for prediction markets. Choose a theme, pay in AUSD, reveal randomly selected markets and YES/NO sides, and automatically submit positions to Gemini Predictions.

## Quick start

Use Node.js 24 LTS and npm 11.

```sh
npm install
npm run dev
```

Open http://localhost:5173. API: http://localhost:3001. No credentials needed for local development. Enter a display name, select a pack, accept random selection, and open it.

**Team starter:** login, AUSD payments, market data, and fills are simulated. In-memory data resets on API restart. Non-demo mode refuses to start until the backend team wires real providers and persistence. Do not collect money with this starter.

## Ownership

| Directory | Owner | Purpose |
| --- | --- | --- |
| `apps/web` | Frontend team | Login, packs, payment UX, reveal, collection |
| `apps/api` | Backend/API team | Identity, AUSD, Gemini, orchestration, persistence |
| `packages/contracts` | Both teams | Shared schemas, types, endpoints, disclosure |
| `docs/TEAM.md` | Both teams | Living task board, decisions, blockers, handoffs |

Start with [team roles and status](docs/TEAM.md), [API contract](docs/API.md), and [integration notes](docs/INTEGRATIONS.md). Update the team board in each PR.

```sh
npm run dev:web       # UI only; needs API for data
npm run dev:api       # API with demo providers
npm run typecheck
npm test
npm run build
npm run start:api     # built API, after build
```

App-local `.env.example` files document configuration. Copy to `.env` in the same app only when overriding defaults. `VITE_*` values are public; secrets belong in the API app only.

## MVP decisions

- Login → choose theme → approve budget and randomness → pay → reveal → collection.
- Three distinct markets per pack; equal probability among eligible markets, 50/50 YES/NO sides, no replacement within a pack.
- Starter price: 15 AUSD; three 5-unit allocations, no platform fee. Whole-contract fills may leave a remainder.
- Server owns selection, budget and execution; browser animates stored results, never rerolls.
- AUSD testnet payment and Gemini sandbox USD are separate. This MVP has no AUSD-to-Gemini bridge.
- Target Most Creative, Gemini Predictions and Agora AUSD tracks. Replace fixtures with working testnet/sandbox integrations before judging.
