import type { Pack } from "@impacks/contracts";

// Catalog from mekila 31d80d5. A definition does not establish sandbox tradability.
export const geminiPacks: Pack[] = [
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
