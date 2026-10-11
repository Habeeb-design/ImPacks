# ImPacks team board

Last updated: October 11, 2026. This is the shared source of truth for scope, ownership and handoffs. Update your rows in the same PR as your code; record what works, what remains simulated, and the next blocker. This file is versioned with the repository; it is not automatically synchronized to an external document.

## Product agreement

Visual direction revised October 11: **Mobbin’s white canvas, oversized black typography, and floating objects**, with realistic black foil ImPacks wrappers replacing the app icons. This supersedes the bubbly white/light-orange concept. Use crimped seals, fine texture, subtle wrinkles, restrained gold printing, and gentle floating motion. Crypto, Sports, and Chaos share the wrapper silhouette and differ through readable genre labels; revealed cards may remain colorful. [Design research](design/card-pack-research/index.html) contains the selected direction and original generated packaging assets. Add a continuously rotating horizontal category rail inspired by the user’s Mobbin screenshot: category labels above large black packs, a rounded All packs / Crypto / Sports / Chaos selector, pause/resume, and previous/next controls. Pause on hover and keyboard focus; default to stationary for reduced motion. The Next.js frontend now implements this direction, including the landing hero and category carousel. Local desktop/mobile browsing and login → three-card opening → collection restoration are verified. Vercel deployment is live at https://impacks.vercel.app; hosted API smoke checks pass. The Next.js dev app runs at http://localhost:3000.

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
| FE-1 | Component structure and visual design | Frontend / Codex | Done (demo) | Mobile and desktop login → opening flow |
| FE-2 | Pack reveal animation | Frontend | Motion draft ready; integration pending | Returned cards animate; reduced motion works |
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
- Catalog starter remains 15 AUSD / three cards. Category pages quote optional `budgetCents` from $20, $50, $100, or custom $20–$250 on $5 steps. Still three cards; leftover cents go to the first cards. Zero platform fee.

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
| 2026-10-11 | User selected Monad Cards as the primary reference, with black/white/silver palette; reference board updated and monochrome concept prepared | Superseded by the white/light-orange direction below |
| 2026-10-11 | User scrapped the dark concept; selected bubbly white/light-orange UI and clearly differentiated genre packs. New interactive pack-picker and illustrative reveal concept prepared | Superseded by the Mobbin / realistic black-wrapper direction below |
| 2026-10-11 | User selected Mobbin’s layout with realistic black foil packs. Generated original transparent ImPacks artwork and prepared a responsive interactive concept; genre filters, pack preview, and help panel verified | FE-1 implements this direction; this pass changes design references and assets only |

| 2026-10-11 | Implemented Mobbin-style Next.js landing page, original foil artwork, accessible rotating categories, and preserved demo checkout/collection. Added an explicit ephemeral Vercel demo adapter around the existing server-owned service | Local typecheck/build and all 11 API tests pass. Local proxy, embedded production build, and https://impacks.vercel.app each passed catalog/login/opening/identical-retry/collection/logout checks. Responsive UI checked at 390px; no browser errors. Vercel project impacks uses apps/web and Node 24. GitHub auto-link failed; deployments use the CLI. Hosted memory can reset across instances; integrations remain simulated |
| 2026-10-11 | Category pack pages at `/category/{theme}` with $20 / $50 / $100 / custom stakes; quote accepts optional `budgetCents` | Amazon-style shop removed. Frontend still opens three random cards; stake is the only scaled input |

## Open decisions

Motion handoff: the [opening specification](design/pack-opening/animation-spec.json) uses the user's selected black-and-gold wrapper, three accelerating 3D tear beats, rarity aura, and a lifted face-up card. Play, pause, replay, skip, chapter selection, and timeline scrubbing are available in the conversation prototype. Rarity colors and the single revealed card are illustrative; no rarity contract or probability mapping is implemented. Production must reveal the server's existing result and preserve actual order status. The prototype does not change application code or vendor integrations.

October 11 motion revision: the tear now advances left to right in one-pixel increments along a ragged edge. A textured, perspective-projected foil mesh curls toward the viewer, exposes the silver underside, and remains connected to the intact right side until the tear passes. Local crease, fiber and light details follow the tear front. The strip releases only after reaching the far edge; the existing aura and card flip follow. Partial-tear views and playback were checked in the browser; this remains an isolated motion prototype, with production integration pending.

- Privy selected for email, Google and wallet sign-in. Embedded wallet creation and wallet binding for payments remain future work.
- Choose AUSD payment transport: ordinary testnet transfer verification first, or ERC-3009/x402 if the team can complete settlement and replay protection in time.
- Choose a database and job/reconciliation approach before connecting external side effects.
- Define refund/remainder handling and the mapping of demo users to Gemini sandbox accounts. A shared sandbox account does not create individual exchange-owned positions for each user.

## Branches and merge checks

Use `codex/frontend-<task>` and `codex/backend-<task>` branches. Keep PRs focused; both teams review contract changes. Run `npm run typecheck`, `npm test`, and `npm run build`. Do not merge secrets or hardcoded claims of successful vendor integration. Use the PR template to record the next team's handoff.

## October 11 landing + Privy update

Landing now centers “Gamble on gambling.” with floating Bitcoin, Ethereum, NFL, MLB, WNBA and NBA logos. The main CTA navigates to `/login`; the black-foil category rail remains below. `/packs` retains the existing simulated opening/collection flow. Cards show side, spend and gross conditional demo payout ($1 per winning contract); pending/failed orders never display a confirmed holding or payout. Random selection is explicitly distinguished from better odds.

`POST /api/auth/privy` accepts a Privy access token in the Authorization bearer header, verifies ES256 signature, issuer, app audience, required subject/expiry/issued-at against Privy’s public JWKS, and returns the existing demo Session DTO. The server identity is the verified Privy DID; local session expiry is capped to token expiry. The client exchanges after authentication and navigates to packs. App logout also ends Privy login. No app secret is needed or stored. Public app ID is configured locally and in Vercel.

Evidence: local Privy modal loads with email, Google, wallet options; signature/issuer/audience/expiry rejection tests pass (13 API tests total). Actual user authentication still requires a user to complete their email/OAuth/wallet sign-in; do not call end-to-end identity verified yet. Payments, orders, fixtures and in-memory storage remain demo-only. Hosted state can reset.

## October 11 wallet account update

A site-wide Privy provider now configures automatic Ethereum embedded wallet creation for all users on login, with Base Sepolia as the supported/default chain. The top-right Connect wallet control leads through login; connected accounts show an address menu, testnet AUSD balance, copy/explorer/refresh and disconnect. Existing signed-in accounts without a wallet can explicitly create one. The login exchange waits for a connected wallet before navigating to packs. Embedded wallets are preferred; a linked external wallet is the fallback.

Added public read-only `GET /api/wallets/:address/ausd` and shared WalletBalance DTO. The API reads the Agora token from Base Sepolia, verifies RPC chain ID and token decimals, and preserves exact atomic balance. RPC failures show unavailable, never a fabricated zero. Set optional server-only BASE_SEPOLIA_RPC_URL for a dedicated RPC. The public Base RPC returned a verified testnet balance during local testing; 15 API tests cover precision and invalid chain/token/RPC failure handling. Privy wallet creation itself requires completing real user sign-in and remains unverified end-to-end.

AUSD settlement remains blocked on the project receiving wallet and durable payer/quote/payment verification; no transfer button, signature request or real debit has been enabled. Demo openings remain explicitly simulated and separate from the displayed on-chain balance.

## October 11 category symbol expansion

Added original SVG illustrations for Politics, Economics, Commodities, Business, Culture, Tech and Weather to the floating landing-page composition alongside the six existing crypto/sports marks. Desktop and 390px mobile positioning preserve the central headline and CTA; reduced-motion styling applies to the new symbols. This is a visual category expansion only, not a change to the available pack catalog or market providers. Typecheck, 15 API tests and production build pass; desktop/mobile composition checked with no horizontal overflow.

## October 11 email-only sign-in

Replaced provider selection with a direct email field and Privy one-time-code verification on `/login`. Removed Google and external-wallet login options from provider configuration and screen copy. Resend/change-email/retry states are included. Because Privy custom email authentication bypasses modal automatic wallet creation, the page explicitly creates an embedded wallet once after verified login, with a manual retry on failure, before the existing verified session exchange. No wallet is created before authentication. Existing wallet menu and AUSD balances are retained. Full OTP delivery/authentication requires a user-supplied email and remains unverified end-to-end.

### Real organization marks in the landing hero (2026-10-11)

- Replaced the generic category pictograms with actual Democratic/Republican party, Federal Reserve, Shell, eBay, Spotify, NVIDIA, and NOAA logo assets. Existing crypto and sports marks remain in the animated layout.
- Logo sources and color adaptations are recorded in `apps/web/public/images/brands/SOURCES.md`; SVGs are served locally. Removed the unused `CategorySymbol` component.
- Verified all 14 images load on desktop (1440px) and mobile (390px), with no horizontal overflow. Typecheck, all 15 API tests, and production build pass.

### Logo collage pack editions (2026-10-11)

- Replaced the central IM shield with real logo overlays on the shared pack artwork. Crypto uses BTC/ETH, Sports uses NFL/NBA/MLB/WNBA, and Chaos combines crypto, sports, tech, culture and business marks. Each wrapper reads Crypto Edition, Sports Edition or Chaos Edition. Catalog data, prices, and opening behavior are unchanged.
- Built-in imagegen removed the shield from a sibling foil asset; original artwork is preserved. Logos and edition typography remain HTML/CSS overlays. Asset provenance and exact generation prompt: `apps/web/public/images/PACK-ARTWORK.md`.
- Typecheck, all 15 API tests, and production build pass. Desktop/mobile catalog and desktop login fan visually checked; all pack assets load and mobile has no horizontal page overflow.

### Centered logo fans (2026-10-11)

- Tightened the pack logo overlays into centered, overlapping fans with angled outer marks and raised middle marks. Edition labels and foil artwork stay intact.
- Desktop and 390px mobile checked; all pack images load without horizontal page overflow. Typecheck, 15 API tests and production build pass.

### Remove demo wording from site copy (2026-10-11)

- Removed the DEMO header badge and demo wording from pack prices, sign-in/fallback/sign-out controls, checkout, wallet text, payout copy, login note, footer and unavailable-service message. Brief simulation disclosures remain accurate; no real payment/trading integration was enabled.
- Internal API modes, payment proof prefixes, storage keys and routes remain compatible. Verified visible text on landing, login and packs contains no standalone demo wording. Typecheck, all 15 API tests, and production build pass.
