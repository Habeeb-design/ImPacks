# Frontend team

Run `npm run dev:web` from the repo root, with the API running in another terminal (`npm run dev:api`). Or use `npm run dev` for both.

## Own these files

- `src/App.tsx`: login, pack selection, checkout, collection flow.
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

The demo session and pending opening live in `sessionStorage`; this is not production authentication. Shared contract edits require backend review. Restart dev after changing contract runtime values to rebuild them. Production hosting must route `/api` to the API service (or configure an API origin with an appropriate CORS policy).
