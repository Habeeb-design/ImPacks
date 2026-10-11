# ImPacks team board

Last updated: October 11, 2026. This is the shared source of truth for scope, ownership and handoffs. Update your rows in the same PR as your code; record what works, what remains simulated, and the next blocker. This file is versioned with the repository; it is not automatically synchronized to an external document.

## Product agreement

An easy login leads directly to themed packs. The user agrees to the budget and random selection before opening. The backend randomly draws three distinct eligible markets and a 50/50 YES/NO side for each, confirms AUSD payment, then submits the selected positions. Cards reveal the stored result and show actual order status.

Target demo: AUSD on Base Sepolia plus Gemini Predictions sandbox. AUSD purchases the pack; Gemini orders use separately funded test USD. No conversion or exchange deposit bridge is implemented. Demo providers currently simulate both systems.

## Roles and boundaries

| Role | Team | Owns | Handoff |
| --- | --- | --- | --- |
| UI and interaction lead — assign teammate | Frontend | Login, pack selection, reveal, responsive components | Screens consuming shared types |
| Client integration lead — assign teammate | Frontend | Typed API client, identity/wallet UX, error and retry states | Verified end-to-end client behavior |
| Markets and trading lead — assign teammate | Backend/API | Gemini discovery, quotes, order submission and fills | Normalized market/order adapters |
| Payments and platform lead — assign teammate | Backend/API | AUSD, identity, persistence, orchestration, reconciliation | Verified payment receipt and durable opening |

These are responsibilities within two teams, not four required people. Frontend owns `apps/web` (Next.js App Router); backend owns `apps/api` (Fastify). Both review `packages/contracts` and changes to the purchase flow. One teammate should take release/demo coordination before submission.

## Work board

| ID | Work | Owner | Status | Done when |
| --- | --- | --- | --- | --- |
| SETUP-1 | Workspaces, shared types, scripts and lockfile | Repo setup | Done | Both apps install and build from root |
| SETUP-2 | Demo login, pack open, collection | Repo setup | Done | Frontend consumes API, clearly labeled simulated |
| SETUP-3 | Next.js App Router migration | Repo setup | Done | Next build, hydration and API rewrite verified |
| FE-1 | Component structure and visual design | Frontend | Ready | Mobile and desktop login → opening flow |
| FE-2 | Pack reveal animation | Frontend | Ready | Returned cards animate; reduced motion works |
| FE-3 | Login and wallet payment UI | Frontend | Waiting on BE-1 / BE-3 | Authenticated wallet pays exact quote; rejection recoverable |
| FE-4 | Order and payment result screens | Frontend | Ready | Pending, partial, failed and unknown states are explicit |
| BE-1 | Real auth and durable storage | Backend/API | Ready | Verified sessions, wallet binding, durable receipts/orders |
| BE-2 | Gemini markets adapter | Backend/API | Ready | Live discovery, themes, fresh executable prices, sufficient liquidity |
| BE-3 | AUSD testnet payment adapter | Backend/API | Ready | Verify sender/token/chain/recipient/amount; proof cannot be reused |
| BE-4 | Gemini sandbox order adapter | Backend/API | Waiting on BE-1 / BE-2 | Stable client IDs, bounded spend, actual fills and positions |
| BE-5 | Reconciliation and remainder policy | Backend/API | Ready | Unknown orders checked before retries; refund/remainder policy recorded |
| DEMO-1 | Real testnet end-to-end smoke test | Both | Waiting on integrations | Payment receipt + sandbox orders + portfolio match |
| DEMO-2 | Public repo, deployment, ≤2 minute recording | Release owner — assign | Not started | Submission links work and show non-hardcoded core behavior |

## Contract agreement

- Shared request/response definitions: `packages/contracts/src/index.ts`.
- Every opening uses one owned quote and one stable `Idempotency-Key`.
- Random selection runs on the server once per attempt. Refresh/retry returns the same result.
- Never describe a pending/unknown order as a holding or a simulated receipt as on-chain settlement.
- All keys stay server-side. Agree together before adding or renaming a required contract field.
- Fixed 15 AUSD pack, three cards, 5-unit budget each, zero platform fee for the starter. Whole-contract rounding leaves a remainder; decide handling before the live testnet demo.

## Updating this document

1. Claim a task by replacing its owner placeholder or adding your name.
2. Move status to In progress; add a blocker with the specific input you need.
3. Include this board in your implementation PR. Mark Done only after its acceptance check passes.
4. Add an entry below for API changes, integration evidence and decisions. Both teams review shared-contract changes.

## Handoff log

Next.js migration verification: `npm run typecheck`, all 11 API tests, and `npm run build` passed. Browser smoke testing against the built Next.js server verified login, pack opening, collection and session restoration after reload through the API rewrite, with no browser warning/error logs. Real vendor integrations remain unverified.

| Date | Change | Next handoff |
| --- | --- | --- |
| 2026-10-11 | Repository scaffold, local demo, provider ports, API contract and CI added | Frontend starts FE-1/FE-2; backend starts BE-1/BE-2/BE-3 |
| 2026-10-11 | Frontend migrated to Next.js App Router; API ownership and shared types retained | Frontend uses `src/app` routes and port 3000; build, tests and browser smoke checks pass |

## Open decisions

- Choose login/wallet provider with the frontend team; target email or social login plus wallet attachment/embedded wallet.
- Choose AUSD payment transport: ordinary testnet transfer verification first, or ERC-3009/x402 if the team can complete settlement and replay protection in time.
- Choose a database and job/reconciliation approach before connecting external side effects.
- Define refund/remainder handling and the mapping of demo users to Gemini sandbox accounts. A shared sandbox account does not create individual exchange-owned positions for each user.

## Branches and merge checks

Use `codex/frontend-<task>` and `codex/backend-<task>` branches. Keep PRs focused; both teams review contract changes. Run `npm run typecheck`, `npm test`, and `npm run build`. Do not merge secrets or hardcoded claims of successful vendor integration. Use the PR template to record the next team's handoff.
