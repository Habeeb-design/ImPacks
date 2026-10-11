# Frontend team

The frontend uses Next.js 16 with the App Router and TypeScript. Run `npm run dev:web` from the repo root, with the API running in another terminal (`npm run dev:api`). Or use `npm run dev` for both. Open http://localhost:3000.

## Own these files

- `src/app/layout.tsx`: root document, metadata and global styles.
- `src/app/page.tsx`: home route; add future routes in `src/app`.
- `src/App.tsx`: client component for login, pack selection, checkout and collection. Browser session state restores after hydration.
- `src/components/PackTile.tsx`: theme selection and pack artwork.
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

`next.config.ts` rewrites `/api/*` to the backend in both development and production. Set `API_PROXY_TARGET` before `npm run build` when hosting the API elsewhere; it defaults to `http://127.0.0.1:3001`. `NEXT_PUBLIC_API_BASE_URL` is an optional browser-visible override, inlined at build time; cross-origin requests require backend CORS configuration. Keep it empty for same-origin requests. Use `npm run start:web` after building and run the API separately. Static export is not supported by this proxy setup.

Framework references: [App Router setup](https://nextjs.org/docs/app/getting-started/installation) and [API rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites).
