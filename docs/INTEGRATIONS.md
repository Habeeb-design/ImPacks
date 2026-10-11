# AUSD and Gemini integration handoff

## Current boundary

The API runs demo pack-payment and order providers. Privy access-token verification, embedded-wallet configuration and a read-only Ethereum Sepolia AUSD balance endpoint now exist; the full authenticated payer/payment flow still needs end-to-end verification. There is no pack-payment settlement, authenticated Gemini execution, durable purchase ledger or refund execution. Provider interfaces in `apps/api/src/providers/ports.ts` give the backend team a starting point. The frontend calls ImPacks endpoints for trading and payment verification.

The optional [welcome-grant extension](WELCOME_GRANTS.md) adds PostgreSQL persistence and a separate worker specifically for one-time 50-test-AUSD transfers to new Privy users. It is disabled until configured and has not been verified with a live transfer. Grant persistence does not make the existing pack state durable or fund Gemini sandbox balances.

## Detailed implementation plan

Read [sandbox treasury and execution architecture](PAYMENTS_ARCHITECTURE.md) before wiring external side effects, and [AUSD execution escrow specification](ESCROW_SPEC.md) for the optional contract. These researched designs recommend a durable treasury/ledger sandbox first, with escrow added to the same execution backend later. They specify wallet binding, exact-money accounting, order recovery, unspent-budget withdrawals, role boundaries, and acceptance evidence. They are proposals, not implemented integrations.

## AUSD payments

Use Ethereum Sepolia for the hackathon. Agora documents testnet AUSD at `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`; AUSD has six decimals. Verify the deployment before integration: [contract deployments](https://docs.agora.finance/developer/contract-deployments), [token precision](https://docs.agora.finance/api), [testnet faucet guide](https://docs.agora.finance/instant-settlement/guides/getting-testnet-tokens).

Backend tasks:

1. Configure a testnet RPC and project recipient address. Never place a private key in `NEXT_PUBLIC_*` or ask users to paste wallet secrets.
2. Bind the authenticated user to the signing/paying wallet. A wallet connection alone is not authenticated proof of ownership.
3. Persist payment instructions containing asset, chain, recipient and authenticated payer. For the treasury design, credit verified transfers as user deposits, then reserve an immutable owned quote with amount, expiry and disclosure version. Ordinary ERC-20 transfers contain no quote ID.
4. Replace/extend `PaymentProvider.confirm` with durable event observation: inspect a successful receipt under the chosen finality policy; verify the actual AUSD transfer event, chain, contract, sender, recipient and amount. A supplied transaction hash alone proves nothing.
5. Enforce unique consumed transaction events, credit only the bound user, and reserve each quote once; block cross-user replay. Define late-payment and chain-reorg handling. For escrow, additionally bind the verified funding event to the contract's unique purchase ID.
6. If using ERC-3009/x402, confirm current facilitator support for AUSD and the exact network/domain, implement nonce/validity checks and actual settlement verification. This starter does not pretend to implement x402 through a mock HTTP 402 response.
7. Add tests for wrong amount, token, network, recipient, payer, reverted/pending transactions and replay. Record a real testnet receipt in the team handoff.

The hackathon brief favors agentic payments and x402. AUSD checkout is the minimum product integration; a complete verified x402 flow is a stretch goal, not a working feature of this scaffold.

## Gemini Predictions

Use Gemini **exchange Predictions**, not Google's Gemini AI API. The official SDK is `@gemini-markets/sdk`, with a server entry point for private credentials. Start with [Gemini's SDK and tools](https://developer.gemini.com/tools) and [developer platform](https://developer.gemini.com/), then use the linked Prediction Markets and demo-environment guides. Do not substitute spot-trading endpoints for prediction orders.

Backend tasks:

1. Create the demo account and API credentials described in the hackathon brief; store credentials only in `apps/api/.env` or server secret storage. Confirm current sandbox host and permissions in official docs.
2. Implement `MarketProvider.listEligible`: discover actual events, normalize categories, exclude closed/resolved/untradable markets, check close times, liquidity, and both side prices. Preserve real provider identifiers. Expand the normalized `Market` type with both-team review if needed.
3. Revalidate executable prices and liquidity before charging or ordering. Keep spending within the quoted allocation, including fees. Do not assume NO ask is simply 1 minus YES ask.
4. Implement `OrderProvider.buy`: authenticated sandbox requests, stable client order IDs, quantity/tick/minimum validation, conservative limit prices and explicit response normalization.
5. Persist order intent before submission, reconcile unknown outcomes, and distinguish accepted orders from confirmed fills. Never blindly retry after a network timeout.
6. Reconcile fills and positions into the collection; record order IDs and evidence of actual sandbox execution.

## Funding and accounting

The AUSD payment and Gemini sandbox account are separate. The demo may charge testnet AUSD for a pack and allocate an equivalent nominal test-USD budget in a pre-funded sandbox account. This is demo accounting, not a transfer, deposit or conversion. If using one shared sandbox account, disclose that the app's per-user allocation is internal bookkeeping.

The detailed architecture proposes returning unspent budget to a withdrawable test AUSD balance, with sandbox winnings tracked separately as non-withdrawable paper USD. Apply the live instrument's quantity/price increments rather than assuming whole contracts. Pooled opposing positions and fee rounding require sandbox verification before shared-account execution. Do not silently replace failed orders with newly drawn markets or charge again.

## Enabling sandbox mode

Replace process-local maps with durable storage and atomic uniqueness constraints; implement verified auth and payer binding; wire real payment instructions/providers; add reconciliation and failure handling; update response mode labels. Only then change the intentional `APP_MODE` guard in `src/app.ts`. Setting keys or `APP_MODE=sandbox` alone cannot enable integrations.
