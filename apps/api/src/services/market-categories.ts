import type { MarketCategories } from "@impacks/contracts";
import { HttpError } from "../errors.js";

export const GEMINI_CATEGORIES_URL = "https://api.gemini.com/v1/prediction-markets/categories?status=active";

// Public discovery only. This does not enable exchange trading or pack eligibility.
export function createMarketCategoryReader(fetcher: typeof fetch = fetch, now = Date.now) {
  let cached: MarketCategories | undefined;
  let expiresAt = 0;
  let pending: Promise<MarketCategories> | undefined;
  return async function read(): Promise<MarketCategories> {
    if (cached && now() < expiresAt) return cached;
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetcher(GEMINI_CATEGORIES_URL, { signal: AbortSignal.timeout(6000), headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Gemini discovery unavailable");
        const body: unknown = await response.json();
        const categories = body && typeof body === "object" && "categories" in body ? body.categories : undefined;
        if (!Array.isArray(categories) || categories.length > 200 || !categories.every(value => typeof value === "string" && value.trim().length > 0 && value.length <= 100)) throw new Error("Unexpected Gemini response");
        cached = { categories: [...new Set(categories as string[])], fetchedAt: new Date(now()).toISOString(), source: "gemini" };
        expiresAt = now() + 60_000;
        return cached;
      } catch {
        throw new HttpError(503, "MARKET_CATEGORIES_UNAVAILABLE", "Gemini categories are unavailable right now. Try again shortly.");
      } finally { pending = undefined; }
    })();
    return pending;
  };
}
