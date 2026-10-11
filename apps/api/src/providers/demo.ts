import { geminiPacks } from "./gemini-catalog.js";
import type { Market, Pack } from "@impacks/contracts";
import type { Providers } from "./ports.js";

// Only these editions have explicit demo fixtures. Other catalog entries stay previews.
export const packs: Pack[] = geminiPacks.filter(pack => ["crypto", "sports", "mixed"].includes(pack.id));
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
