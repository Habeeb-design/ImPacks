import type { Market, Pack } from "@impacks/contracts";
import type { Providers } from "./ports.js";

export const packs: Pack[] = [
  { id: "crypto",      name: "Crypto Pack",      theme: "crypto",      description: "Three surprises from the world of crypto.",              cardCount: 3, priceAtomic: "15000000", budgetCents: 1500 },
  { id: "sports",      name: "Sports Pack",       theme: "sports",      description: "Three picks. A whole new reason to watch.",              cardCount: 3, priceAtomic: "15000000", budgetCents: 1500 },
  { id: "politics",    name: "Politics Pack",     theme: "politics",    description: "Three questions the world is watching.",                 cardCount: 3, priceAtomic: "15000000", budgetCents: 1500 },
  { id: "economics",   name: "Economics Pack",    theme: "economics",   description: "Three bets on how the economy moves.",                   cardCount: 3, priceAtomic: "15000000", budgetCents: 1500 },
  { id: "commodities", name: "Commodities Pack",  theme: "commodities", description: "Three picks on raw materials and energy markets.",       cardCount: 3, priceAtomic: "15000000", budgetCents: 1500 },
  { id: "business",    name: "Business Pack",     theme: "business",    description: "Three corporate outcomes you didn't see coming.",        cardCount: 3, priceAtomic: "15000000", budgetCents: 1500 },
  { id: "culture",     name: "Culture Pack",      theme: "culture",     description: "Three picks on pop culture, awards, and entertainment.", cardCount: 3, priceAtomic: "15000000", budgetCents: 1500 },
  { id: "tech",        name: "Tech Pack",         theme: "tech",        description: "Three bets on the future of technology.",                cardCount: 3, priceAtomic: "15000000", budgetCents: 1500 },
  { id: "weather",     name: "Weather Pack",      theme: "weather",     description: "Three short-term weather outcomes near you.",            cardCount: 3, priceAtomic: "15000000", budgetCents: 1500 },
  { id: "mixed",       name: "Chaos Pack",        theme: "mixed",       description: "A little bit of everything. Expect the unexpected.",     cardCount: 3, priceAtomic: "15000000", budgetCents: 1500 },
];
// UI fixtures, not Gemini markets or live odds.
const markets: Market[] = [
  { id: "demo-btc", question: "Will Bitcoin finish the month above $100,000?", theme: "crypto", yesPriceCents: 55, noPriceCents: 45, active: true },
  { id: "demo-eth", question: "Will Ethereum outperform Bitcoin this week?", theme: "crypto", yesPriceCents: 40, noPriceCents: 60, active: true },
  { id: "demo-sol", question: "Will Solana close above $200 this month?", theme: "crypto", yesPriceCents: 30, noPriceCents: 70, active: true },
  { id: "demo-home", question: "Will the home team win the championship?", theme: "sports", yesPriceCents: 60, noPriceCents: 40, active: true },
  { id: "demo-goals", question: "Will the final have more than two goals?", theme: "sports", yesPriceCents: 45, noPriceCents: 55, active: true },
  { id: "demo-overtime", question: "Will the next game go to overtime?", theme: "sports", yesPriceCents: 20, noPriceCents: 80, active: true },
];
export function demoProviders(): Providers {
  return {
    markets: { async listEligible(theme) { return markets.filter(m => m.active && (theme === "mixed" || m.theme === theme)); } },
    payments: { async confirm({ quote, proof }) {
      if (proof !== `demo:${quote.id}`) throw new Error("Invalid demo proof");
      return { reference: `demo-payment:${quote.id}` };
    } },
    orders: { async buy({ card, clientOrderId }) {
      const quantity = Math.floor(card.allocationCents / card.priceCents);
      return { id: `demo-order:${clientOrderId}`, status: "filled", quantity, spentCents: quantity * card.priceCents };
    } },
  };
}
