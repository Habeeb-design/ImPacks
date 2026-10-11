import type { Pack } from "@impacks/contracts";

export const genreGroups = ["All editions", "Markets & money", "Sports", "World & culture", "Wildcards"] as const;
export type GenreGroup = typeof genreGroups[number];
export type Genre = {
  id: string;
  name: string;
  group: GenreGroup;
  description: string;
  topics: string[];
  providerCategories: string[];
  packId?: string;
};

const genres: Genre[] = [
  { id: "crypto", name: "Crypto", group: "Markets & money", description: "Big moves. New highs. A world that never sleeps.", topics: ["Bitcoin", "Ethereum", "Price milestones"], providerCategories: ["Crypto"], packId: "crypto" },
  { id: "sports", name: "Sports", group: "Sports", description: "The next play could change everything.", topics: ["Pro Football", "Pro Baseball", "Championships"], providerCategories: ["Sports", "Pro Football", "Pro Baseball"], packId: "sports" },
  { id: "mixed", name: "Chaos", group: "Wildcards", description: "Leave your comfort zone. Let the pack decide.", topics: ["Crypto", "Sports", "Unexpected combinations"], providerCategories: [], packId: "mixed" },
  { id: "politics", name: "Politics", group: "World & culture", description: "Big decisions. Close races. A new reason to follow.", topics: ["Elections", "Midterms", "Policy"], providerCategories: ["Politics", "Midterms"] },
  { id: "economics", name: "Economics", group: "Markets & money", description: "Small numbers. World-changing consequences.", topics: ["Interest rates", "Inflation", "Growth"], providerCategories: ["Economics"] },
  { id: "commodities", name: "Commodities", group: "Markets & money", description: "From the ground up. Follow what powers the world.", topics: ["Oil", "Gold", "Energy"], providerCategories: ["Commodities"] },
  { id: "business", name: "Business", group: "Markets & money", description: "Follow the companies making their next move.", topics: ["Companies", "Deals", "Earnings"], providerCategories: ["Business"] },
  { id: "tech", name: "Tech", group: "World & culture", description: "The future is being built. Pick a reason to watch.", topics: ["AI", "Technology", "Product launches"], providerCategories: ["Tech"] },
  { id: "culture", name: "Culture", group: "World & culture", description: "The moments everyone will be talking about.", topics: ["Music", "Awards", "Entertainment"], providerCategories: ["Culture", "Entertainment"] },
  { id: "weather", name: "Weather", group: "World & culture", description: "A forecast with a little more at stake.", topics: ["Temperature", "Forecasts", "Weather events"], providerCategories: ["Weather"] },
];

// Gemini includes navigation collections (Live) and subgenres alongside top-level genres.
// Keep its raw labels as evidence; do not turn those collections into duplicate pack editions.
export function groupMarketGenres(providerCategories: string[], packs: Pack[]): Genre[] {
  const known = new Set(genres.flatMap(genre => genre.providerCategories.map(value => value.toLowerCase())));
  const result = genres.filter(genre => genre.packId && packs.some(pack => pack.id === genre.packId) || genre.providerCategories.some(category => providerCategories.some(value => value.toLowerCase() === category.toLowerCase())));
  const seen = new Set<string>();
  for (const category of providerCategories) {
    const normalized = category.toLowerCase();
    if (known.has(normalized) || normalized === "live" || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push({ id: `gemini-${normalized.replace(/[^a-z0-9]+/g, "-")}`, name: category, group: "World & culture", description: "A new world to explore on Gemini Predictions.", topics: [], providerCategories: [category] });
  }
  return result;
}

export function matchingGenres(genres: Genre[], group: GenreGroup, search: string): Genre[] {
  const query = search.trim().toLowerCase();
  return genres.filter(genre => (group === "All editions" || genre.group === group) && [genre.name, genre.description, ...genre.topics, ...genre.providerCategories].join(" ").toLowerCase().includes(query));
}
