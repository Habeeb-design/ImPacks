# AUSD and Gemini integration handoff

## Current boundary

The opening flow still runs demo providers. Independent AUSD checkout routes now persist purchases in SQLite and verify Base Sepolia transfers with durable replay protection. EIP-191 wallet login and durable internal fulfillment authorization are available. There is no transaction submission, Gemini connectivity, refund system or automatic reconciliation. The issuer handoff is documented in [the internal fulfillment contract](FULFILLMENT.md). Payment collection remains disabled. See [checkout setup](../apps/api/README.md#persistent-checkout-and-verification). Provider interfaces in `apps/api/src/providers/ports.ts` give the backend team an agreed starting point. The frontend calls only ImPacks endpoints.

## AUSD payments

Use Base Sepolia for the hackathon. Agora documents testnet AUSD at `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`; AUSD has six decimals. Verify the deployment before integration: [contract deployments](https://docs.agora.finance/developer/contract-deployments), [token precision](https://docs.agora.finance/api), [testnet faucet guide](https://docs.agora.finance/instant-settlement/guides/getting-testnet-tokens).

Backend tasks:

1. Configure a testnet RPC and project recipient address. Never place a private key in `NEXT_PUBLIC_*` or ask users to paste wallet secrets.
2. Bind the authenticated user to the signing/paying wallet. A wallet connection alone is not authenticated proof of ownership.
3. Persist a quote containing immutable amount, asset, chain, recipient, payer, expiry and disclosure version. Return payment instructions agreed with frontend.
4. Implement `PaymentProvider.confirm`: inspect a successful, sufficiently confirmed receipt; verify the actual AUSD transfer event, chain, contract, sender, recipient and exact amount. A supplied transaction hash alone proves nothing.
5. Enforce unique consumed proofs/transaction events and bind each proof to one quote; block cross-user replay. Define late-payment and chain-reorg handling.
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

Before external execution, define who owns the remainder when whole-contract rounding or partial fills leave unspent budget. Document refunds for payment confirmed but order execution failed. Do not silently replace failed orders with newly drawn markets or charge again.

## Enabling sandbox mode

Replace process-local maps with durable storage and atomic uniqueness constraints; implement verified auth and payer binding; wire real payment instructions/providers; add reconciliation and failure handling; update response mode labels. Only then change the intentional `APP_MODE` guard in `src/app.ts`. Setting keys or `APP_MODE=sandbox` alone cannot enable integrations.

## Stage 1 orchestration handoff

[EXECUTION.md](EXECUTION.md) defines the confirmed-purchase → durable fulfillment →
reserved sandbox budget/order-intent boundary and Gemini reporting protocol.
The `mekila` proof-echo and order-submission methods are replaced with fail-closed
guards in the selectively ported provider. Only public discovery is reusable now.
No funds are converted; all trading/issuance/refunds remain disabled.
