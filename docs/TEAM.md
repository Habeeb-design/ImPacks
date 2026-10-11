# ImPacks team board

Last updated: October 11, 2026. This is the shared source of truth for scope, ownership and handoffs. Update your rows in the same PR as your code; record what works, what remains simulated, and the next blocker. This file is versioned with the repository; it is not automatically synchronized to an external document.

## Product agreement

Visual direction revised October 11: **Mobbin’s white canvas, oversized black typography, and floating objects**, with realistic black foil ImPacks wrappers replacing the app icons. This supersedes the bubbly white/light-orange concept. Use crimped seals, fine texture, subtle wrinkles, restrained gold printing, and gentle floating motion. Crypto, Sports, and Chaos share the wrapper silhouette and differ through readable genre labels; revealed cards may remain colorful. [Design research](design/card-pack-research/index.html) contains the selected direction and original generated packaging assets. Add a continuously rotating horizontal category rail inspired by the user’s Mobbin screenshot: category labels above large black packs, a rounded All packs / Crypto / Sports / Chaos selector, pause/resume, and previous/next controls. Pause on hover and keyboard focus; default to stationary for reduced motion. The Next.js frontend now implements this direction, including the landing hero and category carousel. Local desktop/mobile browsing and login → three-card opening → collection restoration are verified. Vercel deployment is live at https://impacks.vercel.app; hosted API smoke checks pass. The Next.js dev app runs at http://localhost:3000.

An easy login leads directly to themed packs. The user agrees to the budget and random selection before opening. The backend randomly draws three distinct eligible markets and a 50/50 YES/NO side for each, confirms AUSD payment, then submits the selected positions. Cards reveal the stored result and show actual order status.

Target demo: AUSD on Ethereum Sepolia plus Gemini Predictions sandbox. AUSD purchases the pack; Gemini orders use separately funded test USD. No conversion or exchange deposit bridge is implemented. Demo providers currently simulate both systems.

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
| FE-2 | Pack reveal animation | Frontend | Single motion approved; multi-card draft ready; integration pending | Returned cards animate; reduced motion works |
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

October 11 motion revision: the tear advances left to right along the heat-seal seam in one-pixel increments. The edge now has gentle broad curves, with micro ripples and frayed fibers removed per user feedback. A textured, perspective-projected foil mesh curls smoothly toward the viewer, exposing the silver underside while the untouched right side remains sealed. The strip releases after reaching the far edge; the aura and card flip follow. The latest draft reduces the interior to a narrow 4–7px back-lining sliver tucked directly beneath the torn seam, with subtle pocket shadow; the tall raised rear wall was removed per user feedback. A finite rarity-colored reflection travels across the inner foil and curled strip, then the revealed card; it follows pause, scrub and reduced-motion behavior. The inner reflection is softened to match the smaller exposed lining. Latest extraction revision keeps the opaque wrapper stationary while the 156×260px card slides upward 300px through the 192×338px wrapper opening, with side clearance and an initially matching tilt. The glow follows the card, the flip waits until full clearance, and the empty wrapper fades afterward. The mid-extraction view was visually checked. This supersedes the downward-wrapper exit. The latest timing pass runs 8.4 seconds with quintic easing, a stronger smoothly ramped pre-tear shake, overlapping tear pulls, subpixel tear-front motion, and three full card spins plus a final half-turn before revealing the artwork and shimmer. Extraction and card-to-wrapper clearance are preserved. Reduced motion skips the shake and spins. The foil mesh uses 60% fewer triangles, shares the underside sheen gradient per frame, and stops rendering the detached strip when it is gone. User approved this single-pack direction. User clarified that multiple cards come from one pack: the revised multi-card draft uses one wrapper and three bets under the selected market category. The cards slide out with a 160ms stagger, fan apart after clearing the seam, then spin and reveal individually. Crypto, Sports and Chaos category selection updates all three illustrative bets together. One-pack playback, all-Sports results, and three-card mobile fit were checked with no browser script errors. This supersedes the multiple-pack batch design. One existing server opening should supply all three cards; no bulk purchase API is needed. Production integration remains pending.

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

## October 11 payment and escrow architecture

Research/design complete: [sandbox treasury and execution architecture](PAYMENTS_ARCHITECTURE.md) and [AUSD execution escrow specification](ESCROW_SPEC.md). Official Gemini, Agora, Privy, Base, ERC-3009 and OpenZeppelin documentation informs the design. No contract, payment adapter, database, trade, or deployment was implemented in this research pass.

Recommended implementation decisions supersede the earlier unresolved remainder/database proposals: use Postgres with a transactional outbox and durable workers; start with verified test AUSD deposits into an ImPacks treasury; reserve per-user balances; execute with separately pre-funded Gemini sandbox USD; return unspent budget as withdrawable test AUSD. Track paper winnings separately without AUSD redemption in v1. Preserve all three random selections through retries/failures, and use live instrument increments rather than assuming whole contracts. These are design defaults awaiting implementation, not shipped behavior.

Optional escrow adds capped settlement and timeout refund credits to the same backend. It trusts ImPacks' report of Gemini execution, does not bridge assets, and does not back future winnings. If a timeout refund wins a race with a late Gemini fill, ImPacks absorbs the orphaned position. Pooled opposite-side netting, actual fees, account permissions/terms, wallet binding and finality behavior require integration evidence.

| Next work | Owner | Status / handoff |
| --- | --- | --- |
| Durable identity, payer binding, journal, reservations and jobs | Backend payments/platform | Ready to implement; prerequisite to external side effects |
| Gemini discovery, bounded order, fee/ID/recovery/netting proof | Backend markets | Ready for sandbox verification; record real order/fill evidence |
| Deposit and remainder withdrawal adapters | Backend payments/platform | After persistence; prove unique receipt credit and confirmed refund |
| Wallet confirmation and resumable purchase/refund screens | Frontend | Agree exact-money/status DTOs with backend; keep unknown execution visible |
| Full payment → fills → collection → remainder demo | Both | After adapters/reconciliation; prove recovery across restart |
| Optional Solidity escrow + adapter | Backend contracts/payments | Specification ready; build after the shared execution path works |

Documentation checks: local links, Markdown structure and diff whitespace reviewed. Application tests were not rerun for this documentation-only change. Authenticated vendor behavior, deployed token authorization ABI, and escrow invariants remain future implementation checks.

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

### Ahrian local category fan revision (2026-10-11)

- Centered the category pack fan and price rail as one group. Replaced the mirrored center-card stack with a 104-degree fan around a shared lower pivot, ordered left to right with the rightmost pack in front, matching the supplied playing-card reference.
- Removed the white rounded card panels and center highlight; foil wrappers retain their transparent silhouette. Narrow layouts stack the price controls beneath the fan with no horizontal page overflow in browser checks. Five-pack and ten-pack states were checked; stake behavior is unchanged.
- Local preview changes on `codex/ahrian-local-preview`; not deployed. Typecheck, all 16 API tests, and production build pass.

### Category buy flow and signed-in account (2026-10-11)

- Added a Buy pack CTA beside the stake picker and removed the category page’s separate display-name sign-in form. The category now waits for Privy, verifies any cached API session against that identity, and exchanges a current access token when the local session is absent or expired. No substitute account is created.
- Email sign-in returns to an allowlisted pack route with the selected amount. Signed-in accounts can confirm random selection and open using their verified identity; wallet setup and account reconnection have explicit states. Changed accounts cannot reuse another user’s cached session or pending opening. Pending retries lock the amount and preserve the quote/key.
- Typecheck, 17 API tests, six account-session/redirect tests, and production build pass. A verified-token integration test confirms quote/open/collection ownership and identical retries across renewed sessions. Browser checks verified the signed-out Buy CTA, email-only redirect and retained $50 selection. The browser was signed out, so real OTP sign-in/embedded-wallet creation remains unverified in this pass. Payments and trades are still simulated.
- Includes the centered category fan revision above for integration into main; retain the Ahrian branch for ongoing work.

### Collector dashboard and Gemini genre browser (2026-10-11)

- Local preview returned to the main checkout; Ahrian branches remain intact. Two parallel agents implemented the collector dashboard and genre browser, with shared account/API/navigation integration completed in the main task. Home, Packs, Dashboard navigation is consistent across landing, categories and email login and stays visible on narrow screens.
- `/dashboard` reads the verified Privy owner's portfolio. Opened packs become collection shelves with colorful YES/NO cards, edition/status filters, search and card details. Pending/unknown/failed orders never count as holdings; closed cards remain collectible and leave open exposure/conditional payout totals. Category reveals link into Dashboard. Login return paths now allow Dashboard, with no external redirects.
- Added authenticated paper-only full-position close endpoint with owner checks, explicit simulation acknowledgment and stable request identity. Close retries survive page reload through owner-scoped client keys; server concurrent requests share one result. Original buy receipts remain unchanged. Unavailable prices leave positions open; sandbox/live closes are unavailable. No real sell, AUSD redemption, durable storage or live P&L is implemented.
- Public Gemini discovery returned 13 category labels, grouped into nine core genres plus Chaos. Sports groups Pro Football/Pro Baseball; Politics groups Midterms; Live is not duplicated as a genre. Runtime server discovery validates data, limits fetch duration, coalesces/cache reads and surfaces upstream errors without fixture fallback. Packs has filters, search, foil genre slides, real logo overlays and selected-edition details. Only catalog-backed Crypto/Sports/Chaos can be opened; seven additional genres are explicit previews pending trading integration. Research and primary sources: [GEMINI_GENRES.md](GEMINI_GENRES.md).
- Verification: typecheck, 47 tests (34 API + 13 web including concurrent close/ownership/price failure and discovery failure coverage), production build, live read-only Gemini discovery and local guest UI checks pass. Existing grant work in the shared checkout is preserved and included in the full test count. Authenticated dashboard browser actions require the user's Privy sign-in and were not manually completed. Positions remain in memory and reset on service restart.

### Automatic Privy welcome funding (2026-10-11)

- Implemented opt-in **50 test AUSD** grants from a dedicated external wallet to each eligible new Privy embedded Ethereum wallet on Base Sepolia. The funding key belongs only in worker server secrets. New means created on/after the configured launch time, with a verified email and one embedded Ethereum address. Existing earlier accounts are excluded.
- Backend owns the signed Privy webhook, authenticated enqueue/status endpoints, additive PostgreSQL schema and separate worker. User and recipient uniqueness, serialized nonce allocation, and durable signed transactions prevent duplicate grants on replay or uncertain broadcast. Confirmation checks the canonical safe receipt and exact token transfer. Low funds remain queued; ambiguous receipts/nonces halt new signing for review.
- Frontend enqueues after authenticated wallet setup, displays grant status/explorer link in the wallet menu, and refreshes the on-chain balance after confirmation. Browser input cannot select a recipient or amount. Grants do not create Gemini USD, enable pack payments or make pack state durable.
- Verification: typecheck, 50 tests (34 API + 16 web), and production build passed. Grant tests cover database reopen, duplicate intake, write-before-send, uncertain broadcast recovery, eligibility, caps, exact signing, receipt validation and signed webhook/authentication boundaries. PostgreSQL multi-process locking and a real Privy-to-testnet transfer still require deployment evidence.
- Activation handoff: backend configures PostgreSQL, the public treasury address, launch cutoff, daily limit, Privy credentials/webhook, and worker-only funding key; funds the treasury with test AUSD and test ETH; runs migration and worker; then records one transfer plus replay/restart checks. Frontend points its API proxy at that standalone API. Feature remains disabled until configured. Commands, environment ownership and recovery: [WELCOME_GRANTS.md](WELCOME_GRANTS.md).

### Approved pack-opening animation integration (2026-10-11)

- CategoryPack now opens PackOpeningReveal only after usePackSession.openPack returns the account-owned Opening. It renders those exact cards; the animation never quotes, pays, retries, or selects cards. Account/category changes dismiss the reveal. Existing collection/dashboard handoff remains intact for the post-sell work.
- Ported the approved one-wrapper/three-card prototype: selected black/gold foil asset, stronger anticipation shake, three continuous left-to-right seam-tear beats with gently curved edges, textured 3D curling strip and narrow recessed lining, staggered upward extraction, fan-out after clearance, three full spins plus final half-turn, and shimmer. Mesh, timeline and React dialog are isolated in new frontend files.
- Pause/resume, reveal-all, replay, Escape/focus restoration and reduced-motion skipping are included. Asset/canvas failure falls through to the returned cards. Pending/failed order labels and simulation disclosure remain visible. Shimmer currently uses category colors: the server has no rarity field, so no fabricated rarity or odds are shown.
- Validation: desktop and 390px mobile component checks used an explicitly labeled temporary fixture route (removed before build); checked pause/replay/skip, exact questions/sides/statuses, no horizontal overflow, Escape and focus restoration. Full authenticated purchase-to-reveal through Privy remains unverified in this pass. Timeline tests cover clearance before fan/spin, concealment until final turn, continuous/staggered extraction and deterministic replay. No deployment performed.
- Final checks passed: `npm run typecheck`, `npm test` (all API and 16 web tests), `npm run build`, and `git diff --check`. The production route list excludes the temporary animation QA page.


### Collector dashboard (2026-10-11)

- Added `/dashboard` using the verified Privy owner's portfolio. Opened packs become collectible card shelves with edition/status filters, search and card details. Pending/unknown/failed orders never count as holdings; closed cards remain collectible and leave open exposure/conditional payout totals. Category reveals link into Dashboard. Shared Home / Packs / Dashboard navigation remains visible on narrow screens; email login supports a Dashboard return path.
- Added authenticated paper-only full-position closing with owner checks, explicit simulation acknowledgment and stable request identity. Client retry keys are owner-scoped; server concurrent requests share one result. Original buy receipts remain unchanged. Missing prices leave positions open; sandbox/live closing is unavailable. No AUSD redemption or live Gemini selling is enabled. Collections remain in memory and reset on service restart.
- Dashboard scope is isolated from the uncommitted genre browser, welcome grants, pack animation and architecture work. The isolated dashboard-only snapshot passed typecheck, all 28 tests (19 API + 9 web), and the production build. Authenticated ownership/closing/retries are covered by API tests; real Privy dashboard interaction was not manually completed.

### Welcome funding configuration (2026-10-11)

- Configured the supplied external wallet locally in the ignored, owner-only worker secret file; worker commands load it separately from API configuration. Verified the API does not load the funding key and the worker key matches the configured public treasury. No secret was added to tracked files.
- Read-only Base Sepolia checks returned 0 test AUSD and 0 test ETH. Transfers remain disabled. PostgreSQL, Privy app/webhook secrets, launch cutoff, daily cap and service setup are still required; no new account has been funded. The key was disclosed in chat and should be replaced before valuable funding.

### Ethereum Sepolia network switch (2026-10-11)

- User selected Ethereum Sepolia, chain 11155111, superseding the earlier Base Sepolia setup. Updated shared payment/grant DTOs, the wallet balance adapter, grant signer, Privy default/supported network, UI labels and Etherscan links. The API/worker now use ETHEREUM_SEPOLIA_RPC_URL; local configuration and integration/escrow plans match.
- Grant databases now bind to the chain. Legacy or mismatched bindings fail closed and require reconciliation; stored Base transactions are rejected before broadcast. No existing grant database or transfer was activated here. The database worker lock retains its old numeric key solely to serialize old/new processes during a transition.
- Verification: typecheck, all 51 tests (35 API + 16 web), and production build passed. Added checks for Base RPC rejection, Base-signed transaction rejection, and legacy database migration. The actual updated balance adapter read 9,800 test AUSD from the supplied treasury on Ethereum Sepolia. No transfer was signed or sent in the live check.
- Activation remains pending PostgreSQL, Privy app/webhook secrets, launch cutoff/daily cap, and standalone API/worker configuration. Changes are local; no deployment was performed. See [WELCOME_GRANTS.md](WELCOME_GRANTS.md).

### User-to-user paper post-trade slice (2026-10-11)

- User confirmed resale of the seller's existing position and future payout rights, not a new option contract. Work is isolated in `codex/posttrade` from preserved UI/grant commit `b09afae`, while `codex/integration-ui-backend` owns the concurrent backend merge. Inspected `feature/ausd-payments` and `mekila`; do not overwrite their checkout/execution work.
- Added durable paper lots, one-time simulated USD account credits, reserved listings, buyer-bound expiring quotes, atomic ownership/cash transfers and durable idempotency. Source receipt replay cannot recreate sold holdings; partial resale/cancellation preserve total quantity. The optional ledger blocks the legacy simulated close route.
- `/marketplace` supports owned lots, listings, review/confirm, partial quantity, cancel, paper balance/history, and owner-scoped sessionStorage retries. Dashboard preserves original fills and projects remaining ownership. Payout rights follow the buyer in the ledger; actual resolution settlement is not implemented.
- Setup, routes, architecture corrections and integration boundaries are in [POSTTRADE.md](POSTTRADE.md). Activation is explicit and requires standalone persistent SQLite. No Gemini sale, on-chain transfer, redeemable balance or option derivative was enabled.
- Validation: typecheck, 64 tests (46 API + 18 web) and production build passed. The Privy-signed API test exercises pack opening → listing → quote → two concurrent same-key purchase requests → updated ownership; no live vendor call occurs. Desktop and 390px guest browser checks found no horizontal overflow or JavaScript errors. Real two-account Privy browser interaction and any real-backed trade remain unverified.

### Post-trade local verification (2026-10-11)

Ran the existing codex/posttrade implementation in the established Node 24 Docker
container. Installed missing branch dependencies without changing manifests, and
configured the user-supplied public Privy App ID in ignored local environment files.
The standalone API runs on container loopback port 3002 with persistent
`/var/lib/impacks/posttrade.sqlite`; the frontend at localhost:3001 proxies to it.
Embedded API mode and welcome-grant funding are disabled. No signer/worker or
blockchain transfer was started.

Validation: all 46 API and 18 frontend tests passed, including authenticated resale,
quantity/cash conservation, rollback, duplicate requests and database restart/retry.
Typecheck and full build passed; the frontend was rebuilt with the configured public
Privy ID. `/marketplace` and proxied health return HTTP 200; unauthenticated portfolio
returns 401. Persistent ledger tables were verified read-only. Real two-account
email sign-in and browser trades still require the user to complete login; test JWTs
are not live Privy evidence. Local start instructions are in POSTTRADE.md.
