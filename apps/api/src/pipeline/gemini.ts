import { createHash, createHmac } from "node:crypto";
import type { Market, SandboxOrderIntent, Theme } from "@impacks/contracts";
import { z } from "zod";
import { geminiPacks } from "../providers/gemini-catalog.js";
import { prepareGeminiSandboxBuy } from "../providers/gemini-sandbox.js";
import type { OrderObservation, TradingGateway } from "./ports.js";
import { PipelineStore } from "./store.js";

const BASE = "https://api.sandbox.gemini.com";
/** Gemini emits numeric identifiers beyond JS's safe integer range. Preserve their wire digits. */
export function parseGeminiJson(text: string): unknown {
  return JSON.parse(text, (key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value !== "number" || Number.isSafeInteger(value) || !Number.isInteger(value)) return value;
    if (["orderId", "order_id", "tid"].includes(key) && context?.source && /^\d+$/.test(context.source)) return context.source;
    throw new Error("Unsupported unsafe numeric value in Gemini response");
  });
}
/** Exact six-decimal USD; reject unsupported precision instead of rounding fees away. */
export function decimalAtomic(value: string): bigint {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("Invalid decimal money");
  const [whole, fraction = ""] = value.split(".");
  if (/[1-9]/.test(fraction.slice(6))) throw new Error("Unsupported currency precision");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.slice(0, 6).padEnd(6, "0"));
}
const cents = (value: bigint) => {
  const result = Number((value + 9999n) / 10000n);
  if (!Number.isSafeInteger(result)) throw new Error("Currency overflow");
  return result;
};
const positive = z.string().min(1);
const orderSchema = z.object({ orderId: z.union([z.number().int().safe().nonnegative(), positive]), clientOrderId: positive,
  symbol: positive, side: z.literal("buy"), outcome: z.enum(["yes", "no"]), status: z.enum(["open", "filled", "cancelled"]),
  quantity: positive, filledQuantity: positive, remainingQuantity: positive, price: positive,
  avgExecutionPrice: z.string().nullable(), createdAt: positive });
const tradeSchema = z.object({ order_id: positive, tid: z.union([positive, z.number().int().safe().nonnegative()]),
  amount: positive, price: positive, fee_amount: positive, fee_currency: z.literal("USD"), type: z.literal("Buy"),
  symbol: positive.optional(), break: z.string().optional() });
const historyOrderSchema = z.object({ order_id: positive, client_order_id: positive, symbol: positive,
  side: z.literal("buy"), price: positive, original_amount: positive, executed_amount: positive,
  remaining_amount: positive, is_live: z.boolean(), is_cancelled: z.boolean(), trades: z.array(tradeSchema) });
const contractSchema = z.object({ instrumentSymbol: positive, marketState: z.string(),
  quantityIncrement: positive, quantityMinimum: positive, priceIncrement: positive, priceMinimum: positive,
  prices: z.object({ buy: z.object({ yes: positive.optional(), no: positive.optional() }) }) });
const eventsSchema = z.object({ data: z.array(z.object({ title: positive, contracts: z.array(contractSchema) })) });
const categoryAliases: Partial<Record<Theme, string[]>> = { culture: ["culture", "entertainment"], tech: ["tech", "technology"] };

type Contract = z.infer<typeof contractSchema>;
export class GeminiSandboxGateway implements TradingGateway {
  readonly accountKey: string;
  private metadata = new Map<string, Contract>();
  private categories?: { values: string[]; until: number };
  private categoryRequest?: Promise<string[]>;
  private eventRequests = new Map<string, Promise<z.infer<typeof eventsSchema>>>();
  constructor(private ledger: PipelineStore, private key: string, private secret: string,
    private nonceMode: "incremental" | "time" = "incremental", private transport: typeof fetch = fetch) {
    if (!key || !secret) throw new Error("Gemini sandbox credentials are required");
    this.accountKey = createHash("sha256").update(key).digest("hex");
    if (this.accountKey !== ledger.policy.accountKey) throw new Error("Exchange account binding differs");
  }
  private nonce() {
    const floor = this.nonceMode === "time" ? Math.floor(Date.now() / 1000) : Date.now();
    const value = this.ledger.nonce(`gemini:${this.accountKey}`, floor, this.nonceMode === "time" ? floor + 20 : Number.MAX_SAFE_INTEGER);
    return value;
  }
  private async response(url: string, init: RequestInit = {}) {
    const response = await this.transport(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Gemini sandbox request failed (${response.status})`);
    return parseGeminiJson(await response.text());
  }
  private auth(path: string, body: Record<string, unknown> = {}, method = "POST") {
    const payload = Buffer.from(JSON.stringify({ ...body, request: path, nonce: this.nonce(), ...(this.key.startsWith("master-") ? { account: "primary" } : {}) })).toString("base64");
    return this.response(`${BASE}${path}`, { method, headers: { "X-GEMINI-APIKEY": this.key,
      "X-GEMINI-PAYLOAD": payload, "X-GEMINI-SIGNATURE": createHmac("sha384", this.secret).update(payload).digest("hex"),
      "Content-Type": "text/plain", "Cache-Control": "no-cache", ...(method === "POST" ? { "Content-Length": "0" } : {}) } });
  }
  async readiness() {
    const terms = z.object({ hasAcceptedLatest: z.boolean() }).parse(await this.auth("/v1/prediction-markets/terms/status", {}, "GET"));
    if (!terms.hasAcceptedLatest) throw new Error("Accept Gemini prediction terms in the sandbox account before enabling purchases");
    const balances = z.array(z.object({ currency: z.string(), available: z.string() })).parse(await this.auth("/v1/balances"));
    const usd = balances.find(value => value.currency.toUpperCase() === "USD");
    if (!usd) throw new Error("Sandbox USD balance unavailable");
    const availableCents = Number(decimalAtomic(usd.available) / 10000n);
    if (!Number.isSafeInteger(availableCents)) throw new Error("Invalid sandbox balance");
    return { availableCents };
  }
  async markets(theme: Theme): Promise<Market[]> {
    const available = await this.availableCategories();
    const themes = (theme === "mixed" ? geminiPacks.map(pack => pack.theme).filter(value => value !== "mixed") : [theme])
      .flatMap(value => (categoryAliases[value] ?? [value]).filter(category => available.includes(category)).map(category => ({ theme: value, category })));
    const result: Market[] = [];
    this.metadata.clear();
    const reads = await Promise.allSettled(themes.map(({ category }) => this.events(category)));
    for (const [index, read] of reads.entries()) {
      if (read.status === "rejected") {
        if (theme !== "mixed") throw read.reason;
        continue; // Chaos draws only from categories that actually supplied quotes.
      }
      const events = read.value, category = themes[index].theme;
      for (const event of events.data) for (const contract of event.contracts) {
        if (contract.marketState !== "open" || !contract.prices.buy.yes || !contract.prices.buy.no) continue;
        const yes = decimalAtomic(contract.prices.buy.yes), no = decimalAtomic(contract.prices.buy.no);
        // Current shared DTOs use whole contracts and cent prices. Unsupported instruments are excluded.
        if (yes % 10000n || no % 10000n || yes <= 0n || no <= 0n || yes >= 1_000_000n || no >= 1_000_000n) continue;
        const increment = decimalAtomic(contract.quantityIncrement);
        if (increment <= 0n || increment > 1_000_000n || 1_000_000n % increment !== 0n) continue;
        this.metadata.set(contract.instrumentSymbol, contract);
        result.push({ id: contract.instrumentSymbol, question: event.title, theme: category as Market["theme"],
          yesPriceCents: Number(yes / 10000n), noPriceCents: Number(no / 10000n), active: true });
      }
    }
    return [...new Map(result.map(market => [market.id, market])).values()];
  }
  private async availableCategories(): Promise<string[]> {
    if (this.categories && this.categories.until > Date.now()) return this.categories.values;
    if (this.categoryRequest) return this.categoryRequest;
    this.categoryRequest = this.response(`${BASE}/v1/prediction-markets/categories?status=active`).then(body => {
      const values = z.object({ categories: z.array(positive) }).parse(body).categories.map(value => value.toLowerCase());
      this.categories = { values, until: Date.now() + 30_000 };
      return values;
    }).finally(() => { this.categoryRequest = undefined; });
    return this.categoryRequest;
  }
  private events(category: string) {
    const existing = this.eventRequests.get(category);
    if (existing) return existing;
    const request = this.response(`${BASE}/v1/prediction-markets/events?category=${encodeURIComponent(category)}&limit=100`)
      .then(body => eventsSchema.parse(body)).finally(() => { this.eventRequests.delete(category); });
    this.eventRequests.set(category, request);
    return request;
  }
  async validate(order: SandboxOrderIntent) {
    if (!this.metadata.has(order.card.marketId)) throw new Error("Sandbox instrument metadata unavailable");
    const meta = this.metadata.get(order.card.marketId)!;
    const quantity = BigInt(order.quantity) * 1_000_000n, price = BigInt(order.limitPriceCents) * 10000n;
    const qi = decimalAtomic(meta.quantityIncrement), pi = decimalAtomic(meta.priceIncrement);
    if (!qi || !pi || quantity % qi || price % pi || quantity < decimalAtomic(meta.quantityMinimum)
      || price < decimalAtomic(meta.priceMinimum) || meta.marketState !== "open") throw new Error("Stored order violates sandbox instrument increments");
    const current = decimalAtomic(order.card.side === "YES" ? meta.prices.buy.yes! : meta.prices.buy.no!);
    if (current > price) throw new Error("Price moved beyond the stored limit; no repricing or redraw is allowed");
  }
  async submit(order: SandboxOrderIntent) {
    const request = prepareGeminiSandboxBuy(order, { apiKey: this.key, apiSecret: this.secret, nonce: this.nonce() });
    // IOC keeps an unfilled remainder from becoming an indefinite GTC liability.
    const payload = JSON.parse(Buffer.from(request.headers["X-GEMINI-PAYLOAD"], "base64").toString());
    payload.timeInForce = "immediate-or-cancel";
    if (!this.key.startsWith("master-")) delete payload.account;
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    return this.observe(order, await this.response(request.url, { method: "POST", headers: { ...request.headers,
      "X-GEMINI-PAYLOAD": encoded, "X-GEMINI-SIGNATURE": createHmac("sha384", this.secret).update(encoded).digest("hex"), "Content-Length": "0" } }));
  }
  async lookup(order: SandboxOrderIntent): Promise<OrderObservation | null> {
    for (const path of ["/v1/prediction-markets/orders/active", "/v1/prediction-markets/orders/history"]) {
      for (let offset = 0; offset < 10000; offset += 100) {
        const data = z.object({ orders: z.array(z.unknown()) }).parse(await this.auth(path, { symbol: order.card.marketId, limit: 100, offset }));
        const found = data.orders.filter(value => typeof value === "object" && value !== null && "clientOrderId" in value && value.clientOrderId === order.clientOrderId);
        if (found.length > 1) throw new Error("Duplicate exchange client order identity");
        if (found.length) return this.observe(order, found[0]);
        if (data.orders.length < 100) break;
      }
    }
    // Absence is NOT a rejection and never grants another submission permit.
    return null;
  }
  private async historyTrades(order: z.infer<typeof orderSchema>) {
    // Prediction fills can be absent from /mytrades while account order history includes them.
    // Bound this recovery read; missing/older history remains unresolved, never zero-fee settlement.
    const rows = z.array(z.unknown()).parse(await this.auth("/v1/orders/history", { limit_orders: 500 }));
    const found = rows.filter(row => typeof row === "object" && row !== null && "order_id" in row
      && String(row.order_id) === String(order.orderId));
    if (found.length !== 1) throw new Error("Order fee history unavailable or ambiguous");
    const history = historyOrderSchema.parse(found[0]);
    if (history.client_order_id !== order.clientOrderId || history.symbol.toUpperCase() !== order.symbol.toUpperCase()
      || decimalAtomic(history.price) !== decimalAtomic(order.price)
      || decimalAtomic(history.original_amount) !== decimalAtomic(order.quantity)
      || decimalAtomic(history.executed_amount) !== decimalAtomic(order.filledQuantity)
      || decimalAtomic(history.remaining_amount) !== decimalAtomic(order.remainingQuantity)
      || history.is_live !== (order.status === "open") || history.is_cancelled !== (order.status === "cancelled")) {
      throw new Error("Order fee history differs from prediction order");
    }
    // The enclosing, identity-checked order supplies the symbol omitted by nested fill rows.
    return history.trades.map(trade => ({ ...trade, symbol: trade.symbol ?? history.symbol }));
  }
  private tradeTotals(rows: unknown[], order: z.infer<typeof orderSchema>) {
    const trades = z.array(tradeSchema.extend({ symbol: positive })).parse(rows);
    if (trades.some(trade => trade.order_id !== String(order.orderId)
      || trade.symbol.toUpperCase() !== order.symbol.toUpperCase() || trade.break)
      || new Set(trades.map(trade => String(trade.tid))).size !== trades.length) throw new Error("Unusable trade evidence");
    let quantity = 0n, cost = 0n, fees = 0n;
    for (const trade of trades) {
      const q = decimalAtomic(trade.amount), price = decimalAtomic(trade.price);
      if (q <= 0n || price <= 0n || price > decimalAtomic(order.price) || (q * price) % 1_000_000n) throw new Error("Unsupported fill cost");
      quantity += q; cost += q * price / 1_000_000n; fees += decimalAtomic(trade.fee_amount);
    }
    if (quantity !== decimalAtomic(order.filledQuantity)) throw new Error("Incomplete fee evidence");
    return { cost, fees, trades };
  }
  private async observe(intent: SandboxOrderIntent, input: unknown): Promise<OrderObservation> {
    const order = orderSchema.parse(input);
    if (order.clientOrderId !== intent.clientOrderId || order.symbol !== intent.card.marketId
      || order.outcome !== intent.card.side.toLowerCase() || decimalAtomic(order.quantity) !== BigInt(intent.quantity) * 1_000_000n
      || decimalAtomic(order.price) !== BigInt(intent.limitPriceCents) * 10000n) throw new Error("Exchange order identity or limits differ");
    const filled = decimalAtomic(order.filledQuantity), remaining = decimalAtomic(order.remainingQuantity);
    if (filled % 1_000_000n || filled + remaining !== BigInt(intent.quantity) * 1_000_000n) throw new Error("Unsupported or inconsistent fill quantities");
    const quantity = Number(filled / 1_000_000n);
    let cost = quantity ? decimalAtomic(order.avgExecutionPrice ?? "invalid") * BigInt(quantity) : 0n;
    let fee = 0n, feesFinal = quantity === 0 && order.status === "cancelled";
    let evidence = JSON.stringify(order);
    if (quantity > 0) {
      const sources = [async () => {
        const rows = z.array(z.unknown()).parse(await this.auth("/v1/mytrades", { symbol: intent.card.marketId, timestamp: Date.parse(order.createdAt), limit_trades: 500 }));
        return rows.filter(row => typeof row === "object" && row !== null && "order_id" in row && String(row.order_id) === String(order.orderId));
      }, () => this.historyTrades(order)];
      for (const source of sources) {
        try {
          const total = this.tradeTotals(await source(), order);
          cost = total.cost; fee = total.fees; feesFinal = order.status !== "open";
          evidence = JSON.stringify({ order, trades: total.trades });
          break;
        } catch { /* Preserve observed fills; absent fee evidence never authorizes settlement. */ }
      }
    }
    return { clientOrderId: intent.clientOrderId, exchangeOrderId: String(order.orderId), state: order.status,
      quantity, costCents: cents(cost), feeCents: cents(fee), costAtomic: String(cost), feeAtomic: String(fee), feesFinal,
      evidence: createHash("sha256").update(evidence).digest("hex") };
  }
}
