# Shared contract

Both teams import `@impacks/contracts`; don't duplicate types in either app. Zod validates incoming API bodies. Money uses integer cents for sandbox budgets and decimal strings of atomic units for AUSD (6 decimals). These are separate ledgers, not a currency conversion guarantee.

Changes to endpoints, required fields, payment proof format, disclosure, or statuses need review from both teams. Update `docs/API.md`, fixtures, client and tests together. Run `npm run build -w @impacks/contracts` after runtime changes (or restart dev). Quote payment instructions are deliberately minimal; agree on typed wallet/x402 payloads before implementing them.
