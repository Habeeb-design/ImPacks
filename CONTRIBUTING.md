# Working together

1. Read `docs/TEAM.md`, then claim a frontend/backend task.
2. Branch from the shared default branch using `codex/frontend-<task>` or `codex/backend-<task>`.
3. Work inside your team's app. Coordinate changes to `packages/contracts`, root scripts and purchase semantics with the other team.
4. Run `npm run typecheck`, `npm test`, and `npm run build`.
5. Update `docs/TEAM.md` with status, blockers, changed contracts, and integration evidence in the same PR.
6. Request other-team review for contract changes and keep vendor secrets out of commits.

Use `npm ci` after the lockfile exists. Commit lockfile changes when dependencies change. `npm run dev` starts both applications. Existing demo fixtures are for development only; the final submission must use working testnet/sandbox core functionality.
