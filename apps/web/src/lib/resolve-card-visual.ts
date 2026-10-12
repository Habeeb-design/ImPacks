import { cardBrand } from "./card-presentation";
export type VisualIcon = "soccer" | "football" | "basketball" | "baseball" | "hockey" | "tennis" | "sports" | "crypto" | "business" | "politics" | "weather" | "technology" | "culture" | "news";
const sports: [VisualIcon, RegExp][] = [
  ["soccer", /\b(soccer|premier league|uefa|fifa|la liga|champions league)\b/i],
  ["football", /\b(nfl|super bowl|touchdown|quarterback|american football)\b/i],
  ["basketball", /\b(basketball|nba|wnba|three.pointer|slam dunk)\b/i],
  ["baseball", /\b(baseball|mlb|home run|world series)\b/i],
  ["hockey", /\b(hockey|nhl|stanley cup|puck)\b/i],
  ["tennis", /\b(tennis|wimbledon|atp|wta)\b/i],
];
const fallbacks: Record<string, VisualIcon> = { Sports:"sports", Crypto:"crypto", Business:"business", Economics:"business", Commodities:"business", Politics:"politics", Weather:"weather", Technology:"technology", Culture:"culture" };
/** Uses only available public card question + parent edition. No guessed IDs or invented metadata. */
export function resolveCardVisual(card: {question?: string}, category?: string) {
  const text=card.question ?? "", brand=cardBrand(text,category);
  const matches=sports.filter(([,pattern])=>pattern.test(text));
  // Multiple sports / ambiguous overtime retain a neutral sports trophy.
  const sport=matches.length===1 ? matches[0]![0] : matches.length>1 ? "sports" : /\bfootball\b/i.test(text) ? "soccer" : (/\b(playoffs|championship)\b/i.test(text) || (brand.category === "Sports" && /\bovertime\b/i.test(text))) ? "sports" : undefined;
  if(sport) return {...brand,category:"Sports",name:brand.src ? brand.name : sport==="sports" ? "Sports" : sport==="football" ? "American football" : sport[0]!.toUpperCase()+sport.slice(1),src:null,icon:sport};
  const inferred=/\b(election|president|senate|parliament|ballot)\b/i.test(text) ? "Politics" : /\b(stock|shares|ipo|earnings|interest rates|inflation)\b/i.test(text) ? "Business" : /\b(crypto|blockchain|token|bitcoin|ethereum|solana|btc|eth)\b/i.test(text) ? "Crypto" : /\b(hurricane|rainfall|temperature|snowfall)\b/i.test(text) ? "Weather" : undefined;
  const label=brand.category==="Prediction" || brand.category==="Mixed" ? inferred ?? brand.category : brand.category;
  return {...brand,category:label,name:brand.name===brand.category ? label : brand.name,src:brand.name==="Solana" ? "/images/brands/sol.svg" : brand.src,icon:fallbacks[label] ?? "news"};
}
