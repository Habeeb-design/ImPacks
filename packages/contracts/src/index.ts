import { z } from "zod";

export const routes = {
  health: "/api/health", login: "/api/auth/demo", me: "/api/me",
  logout: "/api/auth/logout", packs: "/api/packs", quotes: "/api/quotes",
  openings: "/api/openings", portfolio: "/api/portfolio",
} as const;
export const DISCLOSURE_VERSION = "random-v1";
export const DISCLOSURE = "Markets are randomly selected within your theme. Each YES/NO side is chosen with a 50/50 chance. Opening a pack automatically submits the selected positions within your stated budget. Selection is not investment advice or a prediction of returns.";
export const loginSchema = z.object({ displayName: z.string().trim().min(1).max(40) });
export const quoteSchema = z.object({ packId: z.string().min(1).max(80) });
export const openSchema = z.object({
  quoteId: z.string().uuid(), disclosureVersion: z.literal(DISCLOSURE_VERSION),
  paymentProof: z.string().min(1).max(16384),
});
export type OpenRequest = z.infer<typeof openSchema>;
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
    chainId: 84532; tokenAddress: string; recipient: string | null };
}
export interface Market {
  id: string; question: string; theme: Exclude<Theme, "mixed">;
  yesPriceCents: number; noPriceCents: number; active: boolean;
}
export interface Card {
  id: string; marketId: string; question: string; side: Side;
  allocationCents: number; priceCents: number;
  order: { id: string | null; status: "filled" | "pending" | "failed" | "unknown";
    quantity: number; spentCents: number; message?: string };
}
export interface Opening {
  id: string; quoteId: string; packName: string; createdAt: string;
  status: "completed" | "partial" | "pending" | "failed";
  payment: { status: "confirmed" | "failed" | "unknown"; reference: string | null };
  cards: Card[]; mode: "demo" | "sandbox";
}
export interface Portfolio { openings: Opening[] }
export interface ApiErrorBody { error: { code: string; message: string } }
export const AUSD_BASE_SEPOLIA = {
  chainId: 84532, tokenAddress: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC", decimals: 6,
} as const;
