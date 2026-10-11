# ImPacks contributor instructions

- Read `README.md` and `docs/TEAM.md` before implementing a task.
- Frontend owns `apps/web`; backend owns `apps/api`; `packages/contracts` is shared.
- Keep shared DTOs and validation in `@impacks/contracts`. Update the typed client, docs and tests together when changing contracts.
- Update `docs/TEAM.md` in the same change with current status, blockers, and handoff details. Never mark a vendor integration complete without evidence.
- Keep demo behavior explicitly labeled. Never silently substitute fixtures for a failed real provider.
- Keep credentials server-side. Do not put secrets in browser code or `VITE_*` variables.
- Preserve server-owned random selection, quote ownership and retry identity. External payments/orders require durable idempotency and reconciliation.
- For code changes run `npm run typecheck`, `npm test`, and `npm run build` as applicable. Use focused checks for documentation-only edits.
