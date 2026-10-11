import { randomInt, randomUUID } from "node:crypto";
import { AUSD_BASE_SEPOLIA, DISCLOSURE_VERSION, centsToAtomic, type Card, type Market, type Opening, type Pack, type Quote } from "@impacks/contracts";
import { HttpError } from "../errors.js";
import type { Providers } from "../providers/ports.js";

export function drawCards(markets: Market[], pack: Pack): Card[] {
  const pool = [...new Map(markets.filter(m => m.active && (pack.theme === "mixed" || m.theme === pack.theme)
    && Number.isInteger(m.yesPriceCents) && Number.isInteger(m.noPriceCents)
    && m.yesPriceCents > 0 && m.yesPriceCents < 100 && m.noPriceCents > 0 && m.noPriceCents < 100)
    .map(m => [m.id, m])).values()];
  if (pool.length < pack.cardCount) throw new HttpError(409, "INSUFFICIENT_MARKETS", "Not enough eligible markets for this pack.");
  return Array.from({ length: pack.cardCount }, (_, index) => {
    const [market] = pool.splice(randomInt(pool.length), 1);
    const side = randomInt(2) === 0 ? "YES" : "NO";
    return {
      id: randomUUID(), marketId: market.id, question: market.question, side,
      allocationCents: Math.floor(pack.budgetCents / pack.cardCount) + (index < pack.budgetCents % pack.cardCount ? 1 : 0),
      priceCents: side === "YES" ? market.yesPriceCents : market.noPriceCents,
      order: { id: null, status: "pending", quantity: 0, spentCents: 0 },
    };
  });
}

// Demo-only storage. Replace with transactions, unique constraints and durable jobs
// before connecting external payments/orders. A local promise is NOT durable.
export class PackService {
  private quotes = new Map<string, { userId: string; value: Quote }>();
  private attempts = new Map<string, { key: string; result: Promise<Opening> }>();
  private keys = new Map<string, string>();
  private history = new Map<string, { userId: string; value: Opening }>();
  private closeKeys = new Map<string, string>();
  private closes = new Map<string, Promise<Opening>>();
  constructor(private packs: Pack[], private providers: Providers) {}

  quote(userId: string, packId: string, budgetCents?: number): Quote {
    const catalog = this.packs.find(p => p.id === packId);
    if (!catalog) throw new HttpError(404, "PACK_NOT_FOUND", "Pack not found.");
    const budget = budgetCents ?? catalog.budgetCents;
    const pack: Pack = {
      ...catalog,
      budgetCents: budget,
      priceAtomic: centsToAtomic(budget),
      name: budget === catalog.budgetCents ? catalog.name : `${catalog.name} · $${(budget / 100).toFixed(0)}`,
    };
    const value: Quote = {
      id: randomUUID(), pack, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), disclosureVersion: DISCLOSURE_VERSION,
      payment: { mode: "demo", asset: "AUSD", amountAtomic: pack.priceAtomic, chainId: AUSD_BASE_SEPOLIA.chainId, tokenAddress: AUSD_BASE_SEPOLIA.tokenAddress, recipient: null },
    };
    this.quotes.set(value.id, { userId, value });
    return value;
  }

  open(userId: string, quoteId: string, key: string, proof: string): Promise<Opening> {
    const stored = this.quotes.get(quoteId);
    if (!stored || stored.userId !== userId) throw new HttpError(404, "QUOTE_NOT_FOUND", "Quote not found.");
    const usedQuote = this.keys.get(`${userId}:${key}`);
    if (usedQuote && usedQuote !== quoteId) throw new HttpError(409, "KEY_REUSED", "Use a new key for a different quote.");
    const previous = this.attempts.get(quoteId);
    if (previous) {
      if (previous.key !== key) throw new HttpError(409, "QUOTE_USED", "Retry this quote with the original key.");
      return previous.result;
    }
    if (Date.parse(stored.value.expiresAt) <= Date.now()) throw new HttpError(409, "QUOTE_EXPIRED", "Request a new quote; this one expired.");
    // Register before async execution so simultaneous retries share one result.
    const result = Promise.resolve().then(() => this.execute(userId, stored.value, proof));
    this.attempts.set(quoteId, { key, result });
    this.keys.set(`${userId}:${key}`, quoteId);
    return result;
  }

  private async execute(userId: string, quote: Quote, proof: string): Promise<Opening> {
    const cards = drawCards(await this.providers.markets.listEligible(quote.pack.theme), quote.pack);
    const opening: Opening = {
      id: randomUUID(), quoteId: quote.id, packName: quote.pack.name, theme: quote.pack.theme, createdAt: new Date().toISOString(),
      status: "pending", payment: { status: "unknown", reference: null }, cards, mode: "demo",
    };
    this.history.set(opening.id, { userId, value: opening });
    try {
      const receipt = await this.providers.payments.confirm({ quote, userId, proof });
      opening.payment = { status: "confirmed", reference: receipt.reference };
    } catch {
      // An unknown payment failure requires reconciliation, not automatic repayment.
      opening.status = "failed";
      for (const card of cards) card.order = { id: null, status: "failed", quantity: 0, spentCents: 0, message: "Payment not confirmed. No order submitted." };
      return opening;
    }
    for (const card of cards) {
      try {
        card.order = await this.providers.orders.buy({ card, userId, clientOrderId: card.id });
        if (card.order.status === "filled" && card.order.quantity > 0) card.position = { status: "open" };
      }
      catch { card.order = { id: null, status: "unknown", quantity: 0, spentCents: 0, message: "Order result unknown. Reconcile before retrying." }; }
    }
    const filled = cards.filter(c => c.order.status === "filled").length;
    opening.status = filled === cards.length ? "completed" : filled > 0 ? "partial"
      : cards.some(c => c.order.status === "pending" || c.order.status === "unknown") ? "pending" : "failed";
    return opening;
  }
  get(userId: string, id: string): Opening {
    const entry = this.history.get(id);
    if (!entry || entry.userId !== userId) throw new HttpError(404, "OPENING_NOT_FOUND", "Opening not found.");
    return entry.value;
  }
  portfolio(userId: string): Opening[] {
    return [...this.history.values()].filter(o => o.userId === userId).map(o => o.value).reverse();
  }
  closePosition(userId: string, openingId: string, cardId: string, key: string): Promise<Opening> {
    const opening = this.get(userId, openingId);
    const card = opening.cards.find(item => item.id === cardId);
    if (!card) throw new HttpError(404, "CARD_NOT_FOUND", "Card not found.");
    if (opening.mode !== "demo") throw new HttpError(409, "CLOSE_UNAVAILABLE", "Live position closing is not connected.");
    if (opening.payment.status !== "confirmed" || card.order.status !== "filled" || card.order.quantity <= 0) {
      throw new HttpError(409, "POSITION_NOT_FILLED", "Only confirmed filled positions can be closed.");
    }
    const target = `${openingId}:${cardId}`;
    const previousTarget = this.closeKeys.get(`${userId}:${key}`);
    if (previousTarget && previousTarget !== target) throw new HttpError(409, "KEY_REUSED", "Use a new key for a different position.");
    this.closeKeys.set(`${userId}:${key}`, target);
    if (card.position?.status === "closed") return Promise.resolve(opening);
    const previous = this.closes.get(target);
    if (previous) return previous;
    const result = Promise.resolve().then(async () => {
      // Paper close only: no order adapter call, wallet transfer or redemption.
      const market = (await this.providers.markets.listEligible(opening.theme ?? "mixed")).find(item => item.id === card.marketId && item.active);
      const price = card.side === "YES" ? market?.yesPriceCents : market?.noPriceCents;
      if (price === undefined || !Number.isInteger(price) || price <= 0 || price >= 100) {
        throw new HttpError(409, "EXIT_PRICE_UNAVAILABLE", "A simulated exit price is unavailable. Your position remains open.");
      }
      card.position = { status: "closed", closedAt: new Date().toISOString(), exitPriceCents: price, proceedsCents: price * card.order.quantity };
      return opening;
    });
    this.closes.set(target, result);
    // Failed price lookup has no side effect, so the same key may safely retry.
    void result.catch(() => { if (this.closes.get(target) === result) this.closes.delete(target); });
    return result;
  }
}
