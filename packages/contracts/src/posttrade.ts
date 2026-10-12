import { z } from "zod";

export const postTradeRoutes = { portfolio: "/api/posttrade/portfolio", listings: "/api/posttrade/listings", quotes: "/api/posttrade/quotes", trades: "/api/posttrade/trades" } as const;
export const listingSchema = z.object({ positionId: z.string().uuid(), quantity: z.number().int().min(1).max(1000000), priceCents: z.number().int().min(1).max(99), confirmSimulation: z.literal(true) }).strict();
export const resaleQuoteSchema = z.object({ listingId: z.string().uuid(), quantity: z.number().int().min(1).max(1000000) }).strict();
export const resaleSchema = z.object({ quoteId: z.string().uuid(), confirmSimulation: z.literal(true) }).strict();
export type ListingRequest = z.infer<typeof listingSchema>;
export type ResaleQuoteRequest = z.infer<typeof resaleQuoteSchema>;
export interface Position {
  id: string; sourceCardId: string; marketId: string; question: string; side: "YES" | "NO";
  remainingQuantity: number; listedQuantity: number; availableQuantity: number; costBasisCents: number;
  marketClosesAt: string; mode: "paper";
}
export interface ResaleListing {
  id: string; positionId: string; marketId: string; question: string; side: "YES" | "NO";
  remainingQuantity: number; priceCents: number; status: "open" | "filled" | "cancelled" | "expired";
  mine: boolean; expiresAt: string; mode: "paper";
}
export interface ResaleQuote {
  id: string; listingId: string; quantity: number; priceCents: number; subtotalCents: number; feeCents: 0;
  totalCents: number; expiresAt: string; mode: "paper"; currency: "SIMULATED_AUSD";
}
export interface ResaleTrade {
  id: string; quoteId: string; listingId: string; quantity: number; priceCents: number; proceedsCents: number;
  buyerPositionId: string; role: "buyer" | "seller"; status: "completed"; createdAt: string;
  mode: "paper"; currency: "SIMULATED_AUSD"; payout: "not_redeemable";
}
export interface PostTradePortfolio {
  positions: Position[]; listings: ResaleListing[]; trades: ResaleTrade[];
  balanceCents: number; mode: "paper"; currency: "SIMULATED_AUSD";
}
