# Backend and API team

Run `npm run dev:api` from the root. `src/app.ts` builds the Fastify app without listening, so tests use `app.inject()` and need no port. `src/index.ts` runs the server.

## Own these files

- `src/providers/ports.ts`: market discovery, payment confirmation and order execution interfaces.
- `src/providers/demo.ts`: isolated UI fixtures and fake providers; replace via dependency injection, never silently fall back from real services to mocks.
- `src/services/packs.ts`: server-side random selection, allocation, quote ownership, retry handling and opening history.
- `src/app.ts`: request validation, sessions and routes.
- `test/`: contract, payment and retry tests.

Demo login is just a display name with a random bearer session. Every login creates a new identity. Tokens expire after 24 hours. Everything resets on restart. API binds to localhost by default. `APP_MODE` other than `demo` throws intentionally.

## Implementation order

1. Durable tables for users, sessions, quotes, payment receipts, openings and orders. Unique constraints for consumed payment proofs, quote openings and client order IDs. Durable worker/reconciliation for external side effects.
2. Real identity verification and user-to-wallet binding; select an auth provider with the frontend team.
3. Gemini market discovery and executable order-book prices; preserve provider IDs and expiry/eligibility information.
4. AUSD testnet verification bound to a quote and payer, followed by Gemini sandbox execution with stable client IDs.
5. Fill reconciliation, partial failures, unspent allocations and a documented refund policy.

See [integration notes](../../docs/INTEGRATIONS.md) for credentials, sources and acceptance criteria. The starter is not ready for external payments simply because an adapter is added: replace memory storage and wire payment instructions/identity as well.
