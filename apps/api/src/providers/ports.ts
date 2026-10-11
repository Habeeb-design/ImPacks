import type { Card, Market, Quote, Theme } from "@impacks/contracts";

// Implement these ports without changing the frontend API.
export interface MarketProvider {
  listEligible(theme: Theme): Promise<Market[]>;
}
export interface PaymentProvider {
  // Verify amount, chain, asset, recipient, authenticated payer, expiry and replay.
  // A client success flag or transaction hash alone is not confirmation.
  confirm(input: { quote: Quote; userId: string; proof: string }): Promise<{ reference: string }>;
}
export interface OrderProvider {
  // Stable ID across retries. Query uncertain orders before resubmitting.
  buy(input: { card: Card; clientOrderId: string; userId: string }): Promise<Card["order"]>;
}
export interface Providers {
  markets: MarketProvider; payments: PaymentProvider; orders: OrderProvider;
}
