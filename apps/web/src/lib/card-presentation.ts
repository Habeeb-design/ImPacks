import type { Card } from "@impacks/contracts";

export const rarities = ["Common", "Rare", "Epic", "Legendary"] as const;
export type Rarity = typeof rarities[number];
// Cosmetic finish only. Stable market/side identity; never odds, value or vendor rarity.
export function cardRarity(card: Pick<Card, "marketId" | "side">): Rarity {
  const hash = Array.from(`${card.marketId ?? "unknown"}:${card.side ?? ""}`).reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 0);
  return rarities[hash % rarities.length]!;
}
const brands = [
  { name: "Bitcoin", pattern: /\b(bitcoin|btc)\b/i, asset: "btc.svg", category: "Crypto" },
  { name: "Ethereum", pattern: /\b(ethereum|ether|eth)\b/i, asset: "eth.svg", category: "Crypto" },
  { name: "Solana", pattern: /\b(?:[Ss]olana|SOLANA|SOL)\b/, asset: null, category: "Crypto" },
  ...["NBA", "WNBA", "NFL", "MLB"].map(name => ({ name, pattern: new RegExp(`\\b${name}\\b`, "i"), asset: `${name.toLowerCase()}.png`, category: "Sports" })),
  ...["Nvidia", "eBay", "Spotify", "NOAA"].map(name => ({ name, pattern: new RegExp(`\\b${name}\\b`, "i"), asset: `${name.toLowerCase()}.svg`, category: name === "NOAA" ? "Weather" : "Business" })),
];
const categories: Record<string, string> = { crypto: "Crypto", sports: "Sports", politics: "Politics", economics: "Economics", commodities: "Commodities", business: "Business", culture: "Culture", tech: "Technology", weather: "Weather", mixed: "Mixed", chaos: "Mixed" };
export function cardBrand(question: string | undefined, category?: string) {
  const matches = brands.filter(brand => brand.pattern.test(question ?? ""));
  // Multi-asset questions must not imply a single issuer/asset association.
  const brand = matches.length === 1 ? matches[0] : undefined;
  const edition = categories[category?.toLowerCase() ?? ""];
  const label = brand?.category ?? edition ?? "Prediction";
  return { name: brand?.name ?? label, category: label, src: brand?.asset ? `/images/brands/${brand.asset}` : null,
    symbol: brand?.name === "Solana" ? "SOL" : ({ Crypto: "◈", Sports: "✦", Politics: "⚑", Economics: "↗", Weather: "☁" } as Record<string,string>)[label] ?? "◇" };
}
export function cardTitle(question?: string) {
  const text = question?.trim() || "Market details unavailable";
  return text.length > 70 ? `${text.slice(0, 67).replace(/\s+\S*$/, "")}…` : text;
}
export function cardHolding(card: Card) {
  const confirmed = card.order?.status === "filled" && Number.isFinite(card.order.quantity) && card.order.quantity > 0;
  const quantity = confirmed ? Math.max(0, card.position?.status === "closed" ? 0 : (card.position?.remainingQuantity ?? card.order.quantity)) : null;
  return { quantity, spent: Number.isFinite(card.order?.spentCents) ? card.order.spentCents : null, status: card.position?.status === "closed" ? "closed" : card.order?.status ?? "unknown" };
}
