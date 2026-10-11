import { createHmac } from "node:crypto";
import type { Card, Market, Theme } from "@impacks/contracts";
import type { Providers } from "./ports.js";

const BASE = process.env.GEMINI_SANDBOX_BASE_URL ?? "https://api.sandbox.gemini.com";
// Public market data comes from production — sandbox prediction market events are not populated
const MARKET_BASE = "https://api.gemini.com";

// Nonce must be seconds-scale and strictly increasing per API key
let _lastNonce = 0;
function nextNonce(): number {
  const s = Math.floor(Date.now() / 1000);
  _lastNonce = Math.max(s, _lastNonce + 1);
  return _lastNonce;
}

const ALL_CATEGORIES: Exclude<Theme, "mixed">[] = [
  "crypto", "sports", "politics", "economics", "commodities", "business", "culture", "tech", "weather",
];

function sign(path: string, body: Record<string, unknown> = {}) {
  const key = process.env.GEMINI_API_KEY;
  const secret = process.env.GEMINI_API_SECRET;
  if (!key || !secret) throw new Error("GEMINI_API_KEY and GEMINI_API_SECRET must be set in .env");
  const payload = Buffer.from(JSON.stringify({ request: path, nonce: nextNonce(), account: "primary", ...body })).toString("base64");
  const sig = createHmac("sha384", secret).update(payload).digest("hex");
  return { "X-GEMINI-APIKEY": key, "X-GEMINI-PAYLOAD": payload, "X-GEMINI-SIGNATURE": sig, "Content-Type": "text/plain", "Cache-Control": "no-cache" };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${MARKET_BASE}${path}`);
  if (!res.ok) throw new Error(`Gemini GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function authGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: sign(path) });
  if (!res.ok) throw new Error(`Gemini GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

class GeminiApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

async function post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: sign(path, body) });
  if (!res.ok) {
    const json = await res.json().catch(() => ({ error: "Unknown", message: res.statusText })) as { error: string; message: string };
    throw new GeminiApiError(json.error ?? "Unknown", `Gemini POST ${path} → ${res.status}: ${json.message}`);
  }
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

async function livePrice(instrumentSymbol: string, side: "YES" | "NO"): Promise<number> {
  // Derive eventTicker from GEMI-{EVENT_TICKER}-{CONTRACT_TICKER} by splitting on the last hyphen
  const inner = instrumentSymbol.slice("GEMI-".length);
  const eventTicker = inner.includes("-") ? inner.slice(0, inner.lastIndexOf("-")) : inner;
  // Single-event endpoint may return the event directly or wrapped — handle both
  const raw = await get<GeminiEvent | { event: GeminiEvent }>(`/v1/prediction-markets/events/${eventTicker}`);
  const event: GeminiEvent = "contracts" in raw ? raw : (raw as { event: GeminiEvent }).event;
  const contract = event.contracts?.find(c => c.instrumentSymbol === instrumentSymbol);
  if (!contract || contract.marketState !== "open") throw new Error(`${instrumentSymbol} is not tradable`);
  return parseFloat(side === "YES" ? contract.prices.buy.yes : contract.prices.buy.no);
}

export async function geminiProviders(): Promise<Providers> {
  const terms = await authGet<{ accepted: boolean }>("/v1/prediction-markets/terms/status");
  if (!terms.accepted) await post("/v1/prediction-markets/terms/accept");

  return {
    markets: {
      async listEligible(theme: Theme): Promise<Market[]> {
        if (theme === "mixed") {
          const results = await Promise.all(ALL_CATEGORIES.map(listCategory));
          return results.flat();
        }
        return listCategory(theme);
      },
    },
    payments: {
      // AUSD payment is verified upstream; proof is the on-chain receipt / x402 tx hash.
      async confirm({ proof }) { return { reference: proof }; },
    },
    orders: {
      async buy({ card, clientOrderId }): Promise<Card["order"]> {
        const price = await livePrice(card.marketId, card.side);
        const priceCents = Math.round(price * 100);
        const quantity = Math.floor(card.allocationCents / priceCents);
        if (quantity < 1) throw new Error(`Allocation ${card.allocationCents}¢ too small at ${priceCents}¢ per contract`);
        try {
          const order = await post<{
            orderId: number; clientOrderId: string;
            status: "open" | "filled" | "cancelled";
            filledQuantity: string; avgExecutionPrice: string | null;
          }>("/v1/prediction-markets/order", {
            symbol: card.marketId, orderType: "limit", side: "buy",
            quantity: String(quantity), price: String(price),
            outcome: card.side.toLowerCase(), timeInForce: "good-til-cancel", clientOrderId,
          });
          const filled = parseFloat(order.filledQuantity ?? "0");
          const avg = parseFloat(order.avgExecutionPrice ?? String(price));
          const spentCents = Math.round(filled * avg * 100);
          if (order.status === "filled") return { id: String(order.orderId), status: "filled", quantity: filled, spentCents };
          if (order.status === "open") return { id: String(order.orderId), status: "pending", quantity: filled, spentCents };
          return { id: String(order.orderId), status: "failed", quantity: 0, spentCents: 0, message: "Order cancelled by exchange." };
        } catch (err) {
          // SymbolNotFound = instrument doesn't exist in sandbox; return failed (known outcome)
          if (err instanceof GeminiApiError && err.code === "SymbolNotFound") {
            return { id: null, status: "failed", quantity: 0, spentCents: 0, message: "Market not available in sandbox." };
          }
          throw err; // unknown outcome — let PackService mark as unknown
        }
      },
    },
  };
}
