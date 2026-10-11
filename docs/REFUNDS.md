# Refund preparation (testnet only)

Refund broadcasting is hard-disabled. No treasury signer is configured. Preparation
and mocked tests are not evidence of a real refund or live payment.

Internal endpoints use the existing INTERNAL_FULFILLMENT_KEY and reject browser
Origins. Base: `/api/internal/checkout/:purchaseId/refund`. GET retrieves a record;
POST `/prepare`, `/authorize`, `/reconcile` accept strictly `{}`. The server-only
execution client exposes matching methods. No endpoint accepts spending, refund
amounts, signed transactions, or a caller-supplied refund hash.

Candidate atomic AUSD = confirmed deposit atomic units minus final cost/fee cents
multiplied by 10000, floored at zero. Overspend blocks authorization. Candidate amounts
are not spendable authorization. All orders must be terminal, fees reconciled, and
unknown outcomes cleared by an authoritative settlement adapter. Partial execution
with outstanding orders cannot refund. Final partial fills after cancellation may
leave a remainder only after final reconciliation. Zero balance never creates a
transfer. Preparation does not release execution reservations.

Production SettlementAuthority returns null: authorization remains blocked. A future
trusted reconciler must supply durable exchange evidence, the exact execution digest,
final fees/orders, no further orders, and revalidation of the original payment.
Neither a frontend claim nor ordinary Stage 1 order reports provide this evidence.
The attestation is persisted when authorized, and execution reporting is then sealed.

Schema 4 adds one refund per purchase/fulfillment, unique transaction hashes and
unique treasury/nonces. States: pending, authorized, submitting, submitted, confirmed,
reconciliation-required, failed. A future offline signer may stage only an exact
Ethereum Sepolia EIP-1559 AUSD transfer back to the original buyer. The signed payload,
hash and nonce commit before any network submission. Staging is server-only and is
not reachable over HTTP. Gas is capped at 150000 and max fee at 100 gwei as additional
preparation guards, not a live fee recommendation. Signed payloads are never returned
in DTOs; protect database backups as sensitive server material.

There is no broadcast implementation or enable flag. Explicit operator approval,
signer integration, treasury ownership/balance checks and a shared nonce coordinator
are required before a controlled testnet refund. Unknown outcomes retain the same
hash/nonce across restart; they never automatically allocate a replacement transfer.
Read-only reconciliation checks chain, exact Transfer, token, sender, recipient,
amount, decimals, canonical inclusion and at least 12 confirmations. Canonical
reverts become failed without automatic retry. Post-confirmation deep reorgs and
late accounting corrections still require an operational reconciliation policy.

## Diagnostics

Run in the existing Node 24 Docker container:

```sh
docker compose -f compose.node24.yaml exec dev npm run check:ausd-readiness -w @impacks/api
docker compose -f compose.node24.yaml exec dev npm run check:ausd-payment -w @impacks/api
```

Readiness is read-only and exits nonzero while blockers exist. Configure RPC, official
token, a treasury public address you control, APP_ORIGIN and INTERNAL_FULFILLMENT_KEY
privately in apps/api/.env. No replacement wallet or private key is needed for reads.

The interactive payment diagnostic asks for a separate public buyer address and an
EIP-191 wallet signature, creates a 1-AUSD Starter checkout, and prints unsigned
payment instructions. STOP for explicit approval before making any transfer through
your wallet. The diagnostic never signs/sends. After supplying an approved transaction
hash it verifies the receipt, closes/reopens the application to check persistence,
checks replay rejection with a second checkout, and claims fulfillment. It retains
all records. Sessions expire after 15 minutes; if interrupted, reauthenticate and
resume verification against the printed purchase ID rather than paying again.

Gemini handoff: keep fulfillmentId and clientOrderIds stable, report cumulative
quantities/costs/fees via the existing execution contract, reconcile unknown orders
by clientOrderId, and supply authoritative final settlement evidence before refund
authorization. Sandbox submission, treasury admission, verified fee caps and durable
card issuance remain integration work. No conversion between AUSD and Gemini USD.
