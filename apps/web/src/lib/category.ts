import { MAX_PACK_CENTS, MIN_PACK_CENTS, PACK_BUDGET_STEP_CENTS, PACK_PRICE_PRESETS_DOLLARS, type Theme } from "@impacks/contracts";

export const categories = ["crypto", "sports", "mixed"] as const;
export type CategoryId = (typeof categories)[number];

export function isCategory(value: string): value is CategoryId {
  return categories.includes(value as CategoryId);
}

export const categoryCopy: Record<CategoryId, { title: string; genre: string; kicker: string; pitch: string }> = {
  crypto: {
    title: "Crypto",
    genre: "Crypto",
    kicker: "YOUR WORLD. YOUR BUDGET.",
    pitch: "Pick a stake. Cards fan across the table — overlapped, not fully shown. Opening still draws three random crypto markets.",
  },
  sports: {
    title: "Sports",
    genre: "Sports",
    kicker: "YOUR WORLD. YOUR BUDGET.",
    pitch: "Pick a stake. Cards fan across the table — overlapped, not fully shown. Opening still draws three random sports markets.",
  },
  mixed: {
    title: "Chaos",
    genre: "Chaos",
    kicker: "YOUR WORLD. YOUR BUDGET.",
    pitch: "Pick a stake. Cards fan across the table — overlapped, not fully shown. Opening still draws three random mixed markets.",
  },
};

export const priceTiers = [20, 50, 100] as const;

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function snapCustomDollars(raw: string): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const cents = Math.round(parsed * 100);
  const stepped = Math.round(cents / PACK_BUDGET_STEP_CENTS) * PACK_BUDGET_STEP_CENTS;
  const clamped = Math.min(MAX_PACK_CENTS, Math.max(MIN_PACK_CENTS, stepped));
  return clamped / 100;
}

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export const TABLE_CARD_CAP = 10;

export function tableCardCount(dollars: number): number {
  const amount = Math.min(250, Math.max(20, dollars));
  if (amount <= 20) return 5;
  if (amount <= 50) return 5 + Math.round(((amount - 20) / 30) * 3);
  if (amount < 100) return 8 + Math.round(((amount - 50) / 50) * 2);
  return TABLE_CARD_CAP;
}

export function tableOverflow(dollars: number): boolean {
  return tableCardCount(dollars) >= TABLE_CARD_CAP;
}

export { MIN_PACK_CENTS, MAX_PACK_CENTS, PACK_BUDGET_STEP_CENTS, PACK_PRICE_PRESETS_DOLLARS };
export type { Theme };
