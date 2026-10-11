import { z } from "zod";

export const routes = {
  welcomeGrant: "/api/welcome-grant", privyWebhook: "/api/webhooks/privy",
  health: "/api/health", privyLogin: "/api/auth/privy", login: "/api/auth/demo", me: "/api/me",
  logout: "/api/auth/logout", packs: "/api/packs", quotes: "/api/quotes",
  wallets: "/api/wallets", openings: "/api/openings", portfolio: "/api/portfolio", marketCategories: "/api/market-categories",
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
export type Theme = "crypto" | "sports" | "mixed";
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
  position?: { status: "open" | "closed"; closedAt?: string; exitPriceCents?: number; proceedsCents?: number };
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
