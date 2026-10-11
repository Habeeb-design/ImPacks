# Frontend team

The frontend uses Next.js 16 with the App Router and TypeScript. Run `npm run dev:web` from the repo root, with the API running in another terminal (`npm run dev:api`). Or use `npm run dev` for both. Open http://localhost:3000.

## Own these files

- `src/app/layout.tsx`: root document, metadata and global styles.
- `src/app/page.tsx`: home route; add future routes in `src/app`.
- `src/App.tsx`: client component for login, pack selection, checkout and collection. Browser session state restores after hydration.
- `src/components/PackTile.tsx`: theme selection and pack artwork.
- `src/components/PackArtwork.tsx`: shared black foil wrapper and genre label.
- `src/components/PackCarousel.tsx`: rotating categories, keyboard/touch browsing, pause and reduced motion.
- `src/components/PredictionCard.tsx`: reveal and order status.
- `src/lib/api.ts`: single typed API client; components should not call vendor APIs.
- `src/styles.css`: starting styles; replace with the team's component system.

All data comes from the local API with demo providers. No keys are needed. Build the design against these responses while the backend team integrates vendors. Add animations around returned cards, never around browser-generated trades.

## Next tasks

1. Split login, pack picker, checkout and collection into focused components.
2. Implement responsive pack artwork and reveal sequencing; respect reduced motion.
3. Pair with backend on real identity and wallet payment UX.
4. Render quoted amount, chain and recipient for payment; support rejection, expiry, pending, partial and unknown results.
5. Preserve the original quote and idempotency key on retries. Never make a fresh purchase on refresh.

The demo session and pending opening live in `sessionStorage`; this is not production authentication. Shared contract edits require backend review. Restart dev after changing contract runtime values to rebuild them.

`src/app/api/[...path]/route.ts` proxies `/api/*` to the backend by default. Set `API_PROXY_TARGET` when hosting the API elsewhere; it defaults to `http://127.0.0.1:3001`. `NEXT_PUBLIC_API_BASE_URL` is an optional browser-visible override, inlined at build time; cross-origin requests require backend CORS configuration. Keep it empty for same-origin requests. Use `npm run start:web` after building and run the API separately. Static export is not supported.

Vercel explicitly sets `IMPACKS_EMBEDDED_DEMO=1` to reuse the simulated Fastify service inside one Next.js route. Its in-memory sessions and results can reset across instances; no real vendor flow is enabled. The hosted route uses an explicit `light-my-request` 6.6.0 API dependency because 6.8.0 requires an ESM-only cookie package through CommonJS, which failed under the verified Vercel Node.js runtime. Re-evaluate that pin when the runtime supports it.

Framework references: [App Router setup](https://nextjs.org/docs/app/getting-started/installation) and [Route handlers](https://nextjs.org/docs/app/getting-started/route-handlers).

### Landing and Privy

`/` is the public landing; `/login` mounts Privy; `/packs` is the existing demo catalog and collection. Set `NEXT_PUBLIC_PRIVY_APP_ID` in the web app and `PRIVY_APP_ID` in the separate API (the embedded Vercel API can use the public variable). Configure allowed origins in the Privy dashboard for localhost and the deployment if origin restrictions are enabled. No Privy app secret is used. Authenticated users exchange their access token at `POST /api/auth/privy`; the API verifies against the public app JWKS before creating a demo session. Real identity does not enable real payments/trades.

The root Privy provider persists wallet state across pages and requests an embedded Ethereum wallet for all users during Privy modal login. Base Sepolia is the only configured chain. The account control shows the actual AUSD balance through the API’s read-only wallet endpoint. Real transfers remain disabled until settlement and durable payer binding are implemented. Never equate a displayed/linked wallet with backend proof of payment ownership.
