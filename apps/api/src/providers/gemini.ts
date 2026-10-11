import type { Market, Theme } from "@impacks/contracts";
import type { Providers } from "./ports.js";

// Nine-genre discovery from mekila, reconciled with durable checkout.
// Production discovery is not sandbox tradability evidence; submission stays disabled.
const MARKET_BASE = "https://api.gemini.com";
const ALL_CATEGORIES: Exclude<Theme, "mixed">[] = ["crypto", "sports", "politics", "economics", "commodities", "business", "culture", "tech", "weather"];
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${MARKET_BASE}${path}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("Gemini market discovery unavailable.");
  return res.json() as Promise<T>;
}
interface GeminiContract {
  instrumentSymbol: string; status: string; marketState: string;
  prices: { buy: { yes: string; no: string } };
}
interface GeminiEvent {
  ticker: string; title: string; category: string; status: string;
  contracts: GeminiContract[];
}

function contractsToMarkets(event: GeminiEvent, theme: Exclude<Theme, "mixed">): Market[] {
  if (event.status !== "active") return [];
  return (event.contracts ?? [])
    .filter(c => c.status === "active" && c.marketState === "open")
    .map(c => {
      const yesPriceCents = Math.round(parseFloat(c.prices?.buy?.yes ?? "0") * 100);
      const noPriceCents = Math.round(parseFloat(c.prices?.buy?.no ?? "0") * 100);
      return { id: c.instrumentSymbol, question: event.title, theme, yesPriceCents, noPriceCents, active: true };
    })
    .filter(m => m.yesPriceCents > 0 && m.yesPriceCents < 100 && m.noPriceCents > 0 && m.noPriceCents < 100);
}

async function listCategory(category: Exclude<Theme, "mixed">): Promise<Market[]> {
  const { data = [] } = await get<{ data: GeminiEvent[] }>(
    `/v1/prediction-markets/events?category=${category}&limit=100`
  );
  return data.flatMap(e => contractsToMarkets(e, category));
}


export function geminiProviders(): Providers {
  return {
    markets: { async listEligible(theme) {
      return theme === "mixed" ? (await Promise.all(ALL_CATEGORIES.map(listCategory))).flat() : listCategory(theme);
    } },
    payments: { async confirm() { throw new Error("Use SQLite-confirmed wallet checkout and fulfillment authorization."); } },
    orders: { async buy() { throw new Error("Stage 1: Gemini order submission is disabled."); } },
  };
}
