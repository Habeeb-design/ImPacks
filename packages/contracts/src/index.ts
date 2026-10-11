import { z } from "zod";

export const routes = {
  welcomeGrant: "/api/welcome-grant", privyWebhook: "/api/webhooks/privy",
  health: "/api/health", privyLogin: "/api/auth/privy", login: "/api/auth/demo", me: "/api/me",
  logout: "/api/auth/logout", packs: "/api/packs", quotes: "/api/quotes",
  wallets: "/api/wallets", openings: "/api/openings", portfolio: "/api/portfolio", marketCategories: "/api/market-categories",
  checkout: "/api/checkout", checkoutCapabilities: "/api/checkout-capabilities",
  walletChallenge: "/api/auth/wallet/challenge", walletVerify: "/api/auth/wallet/verify",
  walletMe: "/api/auth/wallet/me", walletLogout: "/api/auth/wallet/logout",
  internalFulfillment: "/api/internal/checkout",
} as const;
export const DISCLOSURE_VERSION = "random-v1";
export const DISCLOSURE = "Markets are randomly selected within your theme. Each YES/NO side is chosen with a 50/50 chance. Opening a pack automatically submits the selected positions within your stated budget. Selection is not investment advice or a prediction of returns.";
export const loginSchema = z.object({ displayName: z.string().trim().min(1).max(40) });
export const MIN_PACK_CENTS = 2000;
export const MAX_PACK_CENTS = 25000;
export const PACK_BUDGET_STEP_CENTS = 500;
export const PACK_PRICE_PRESETS_DOLLARS = [20, 50, 100] as const;
export function centsToAtomic(cents: number): string {
  return String(cents * 10_000);
}
export const quoteSchema = z.object({
  packId: z.string().min(1).max(80),
  budgetCents: z.number().int().min(MIN_PACK_CENTS).max(MAX_PACK_CENTS)
    .refine(value => value % PACK_BUDGET_STEP_CENTS === 0, "Budget must land on a $5 step.").optional(),
});
export const openSchema = z.object({
  quoteId: z.string().uuid(), disclosureVersion: z.literal(DISCLOSURE_VERSION),
  paymentProof: z.string().min(1).max(16384),
});
export type OpenRequest = z.infer<typeof openSchema>;
export const closePositionSchema = z.object({ confirmSimulation: z.literal(true) });
export interface MarketCategories { categories: string[]; fetchedAt: string; source: "gemini" }
export const walletAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Supply a 20-byte hexadecimal wallet address.")
  .refine(address => !/^0x0{40}$/.test(address), "The zero address is not a wallet.");
export const checkoutSchema = z.strictObject({
  packType: z.enum(["starter", "premium", "ultimate", "category"]),
  packId: z.enum(["crypto", "sports", "mixed"]).optional(),
  budgetCents: quoteSchema.shape.budgetCents,
  disclosureVersion: z.literal(DISCLOSURE_VERSION).optional(),
  buyerAddress: walletAddressSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.packType === "category") {
    if (!value.packId || value.budgetCents === undefined || !value.disclosureVersion) ctx.addIssue({ code: "custom", message: "Category checkout requires the edition, budget and randomness consent." });
  } else if (value.packId !== undefined || value.budgetCents !== undefined || value.disclosureVersion !== undefined) {
    ctx.addIssue({ code: "custom", message: "Legacy tiers cannot override their selection or budget." });
  }
});
export const walletChallengeSchema = z.strictObject({ walletAddress: walletAddressSchema });
export const walletSignatureSchema = z.strictObject({
  challengeId: z.string().uuid(), signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Supply a 65-byte EIP-191 signature."),
});
export const emptyBodySchema = z.strictObject({});
export type WalletSignatureRequest = z.infer<typeof walletSignatureSchema>;
export interface WalletChallenge {
  challengeId: string; walletAddress: string; nonce: string; origin: string; domain: string;
  chainId: 11155111; issuedAt: string; expiresAt: string; message: string;
}
export interface WalletIdentity { walletAddress: string; chainId: 11155111; expiresAt: string }
export interface WalletSession extends WalletIdentity { token: string }
export const fulfillmentClaimSchema = z.strictObject({ requestId: z.string().uuid() });
export const fulfillmentAttemptSchema = z.strictObject({ requestId: z.string().uuid(), attempt: z.number().int().positive() });
export const fulfillmentCompleteSchema = fulfillmentAttemptSchema.extend({
  resultId: z.string().min(1).max(200).regex(/^[a-zA-Z0-9:_-]+$/),
});
export type FulfillmentClaimRequest = z.infer<typeof fulfillmentClaimSchema>;
export type FulfillmentAttemptRequest = z.infer<typeof fulfillmentAttemptSchema>;
export type FulfillmentCompleteRequest = z.infer<typeof fulfillmentCompleteSchema>;
/** Internal backend-only contract. fulfillmentId MUST be the issuer's durable idempotency key. */
export interface FulfillmentAuthorization {
  fulfillmentId: string; purchaseId: string; buyerAddress: string; packType: CheckoutRequest["packType"];
  transactionHash: string; status: "processing" | "fulfilled";
  requestId: string; attempt: number; leaseExpiresAt: string; recoveryRequired: boolean;
  createdAt: string; updatedAt: string; fulfilledAt: string | null; resultId: string | null;
}
export const checkoutParamsSchema = z.strictObject({ purchaseId: z.string().uuid() });
export const verifyCheckoutSchema = z.strictObject({
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Supply a 32-byte transaction hash.").transform(hash => hash.toLowerCase()),
});
export type VerifyCheckoutRequest = z.infer<typeof verifyCheckoutSchema>;
export type CheckoutRequest = z.infer<typeof checkoutSchema>;
export interface CheckoutPurchase {
  pack?: Pack;
  purchaseId: string;
  packType: CheckoutRequest["packType"];
  buyerAddress: string;
  asset: "AUSD";
  amount: string;
  amountAtomic: string;
  decimals: 6;
  tokenAddress: string;
  chainId: 11155111;
  recipientAddress: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "expired" | "confirmed";
  mode: "ausd-testnet";
  storage: "memory" | "sqlite";
  paymentEnabled: boolean;
  updatedAt: string;
  expiredAt: string | null;
  confirmedAt: string | null;
  transactionHash: string | null;
  paymentBlockNumber: string | null;
  paymentBlockHash: string | null;
  paymentLogIndex: number | null;
}
export type Theme = "crypto" | "sports" | "politics" | "economics" | "commodities" | "business" | "culture" | "tech" | "weather" | "mixed";
export type Side = "YES" | "NO";
export interface User { id: string; displayName: string }
export interface Session { token: string; user: User; mode: "demo" }
export interface Pack {
  id: string; name: string; theme: Theme; description: string;
  cardCount: number; priceAtomic: string; budgetCents: number;
}
export interface Quote {
  id: string; pack: Pack; expiresAt: string; disclosureVersion: string;
  payment: { mode: "demo" | "ausd-testnet"; asset: "AUSD"; amountAtomic: string;
    chainId: 11155111; tokenAddress: string; recipient: string | null };
}
export interface Market {
  id: string; question: string; theme: Exclude<Theme, "mixed">;
  yesPriceCents: number; noPriceCents: number; active: boolean;
}
export interface Card {
  id: string; marketId: string; question: string; side: Side;
  allocationCents: number; priceCents: number;
  position?: { remainingQuantity?: number; listedQuantity?: number; costBasisCents?: number; status: "open" | "closed"; closedAt?: string; exitPriceCents?: number; proceedsCents?: number };
  order: { id: string | null; status: "filled" | "pending" | "failed" | "unknown";
    quantity: number; spentCents: number; message?: string };
}
export interface Opening {
  id: string; quoteId: string; packName: string; createdAt: string; theme?: Theme;
  status: "completed" | "partial" | "pending" | "failed";
  payment: { status: "confirmed" | "failed" | "unknown"; reference: string | null };
  cards: Card[]; mode: "demo" | "sandbox";
}
export interface Portfolio { openings: Opening[] }
export interface ApiErrorBody { error: { code: string; message: string } }
export const AUSD_ETHEREUM_SEPOLIA = {
  chainId: 11155111, tokenAddress: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC", decimals: 6,
} as const;

export interface WalletBalance { address: string; chainId: 11155111; asset: "AUSD"; tokenAddress: string; balanceAtomic: string; formatted: string; network: "Ethereum Sepolia" }

export const WELCOME_GRANT_AMOUNT_ATOMIC = "50000000";
export interface WelcomeGrant {
  status: "disabled" | "pending" | "confirming" | "confirmed" | "ineligible" | "needs_attention";
  amountAtomic: "50000000";
  asset: "AUSD";
  chainId: 11155111;
  recipient: string | null;
  transactionHash: string | null;
}

/** Trusted backend only; never an authorization supplied by a browser. */
export type ExecutionState = "pending" | "processing" | "partial" | "completed" | "failed" | "reconciliation-required";
export type OrderIntentState = "prepared" | "unknown" | "open" | "filled" | "cancelled" | "rejected";
export interface SandboxOrderIntent {
  clientOrderId: string; card: Card; quantity: number; limitPriceCents: number;
  feeReserveCents: number; reservedCents: number; state: OrderIntentState;
  revision: number; exchangeOrderId: string | null; filledQuantity: number;
  costCents: number; feeCents: number;
}
export interface SandboxExecution {
  fulfillmentId: string; purchaseId: string;
  identity: { walletAddress: string; chainId: 11155111 };
  pack: Pack; budgetCents: number; reservedCents: number;
  mode: "sandbox"; submissionEnabled: false; accountingRule: "demo-nominal-1:1";
  state: ExecutionState; orders: SandboxOrderIntent[];
  createdAt: string; updatedAt: string;
}
export const executionReportSchema = fulfillmentAttemptSchema.extend({
  clientOrderId: z.string().uuid(), revision: z.number().int().positive().max(1000000),
  state: z.enum(["unknown", "open", "filled", "cancelled", "rejected"]),
  exchangeOrderId: z.string().min(1).max(100).nullable(),
  filledQuantity: z.number().int().min(0).max(MAX_PACK_CENTS),
  costCents: z.number().int().min(0).max(1000000),
  feeCents: z.number().int().min(0).max(1000000),
});
export type ExecutionReport = z.infer<typeof executionReportSchema>;

export type RefundState = "pending" | "authorized" | "submitting" | "submitted" | "confirmed" | "reconciliation-required" | "failed";
/** Internal accounting only. Candidate amounts are NOT permission to transfer. */
export interface AusdRefund {
  refundId: string; purchaseId: string; fulfillmentId: string;
  state: RefundState; depositAtomic: string; spentCents: number;
  candidateAtomic: string; authorizedAtomic: string | null;
  recipientAddress: string; treasuryAddress: string; chainId: 11155111; tokenAddress: string;
  executionDigest: string; settlementReference: string | null;
  blockers: string[]; broadcastEnabled: boolean; transactionHash: string | null;
  createdAt: string; updatedAt: string; confirmedAt: string | null;
}

/** Public status; never includes internal credentials, leases or signed transactions. */
export interface CheckoutCapabilities {
  purchaseMode?: "demo" | "sandbox"; enabledPackIds?: string[];
  available: boolean; chainId: 11155111; network: "Ethereum Sepolia";
  paymentEnabled: boolean; orderSubmissionEnabled: boolean; refundBroadcastEnabled: boolean;
  reason: string;
}
export const paymentAttemptSchema = z.strictObject({ attemptId: z.string().uuid() });
export interface PaymentIntent { attemptId: string; purchase: CheckoutPurchase }
export interface PipelineStatus {
  state: "awaiting-payment" | "preparing" | "executing" | "reconciliation-required" | "settled" | "refunding" | "completed";
  message: string; paymentRequested: boolean; paymentHash: string | null;
}
export interface CheckoutStatus {
  pipeline?: PipelineStatus | null;
  purchase: CheckoutPurchase;
  execution: { state: ExecutionState; preparedCards: number; filledCards: number } | null;
  refund: Pick<AusdRefund, "state" | "candidateAtomic" | "authorizedAtomic" | "transactionHash" | "broadcastEnabled"> | null;
  opening: Opening | null;
}

export * from "./posttrade.js";
