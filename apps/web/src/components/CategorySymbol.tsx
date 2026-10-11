export type SymbolCategory = "politics" | "economics" | "commodities" | "business" | "culture" | "tech" | "weather";

// Original category illustrations, separate from the existing brand/league marks.
export function CategorySymbol({ category }: { category: SymbolCategory }) {
  const art = {
    politics: <><path d="M13 28 40 10l27 18Z" fill="#496ca8"/><path d="M19 33h42v28H19z" fill="#edf2ff"/><path d="M25 33v27m15-27v27m15-27v27" stroke="#7193ca" strokeWidth="7"/><path d="M12 65h56M17 29h46" stroke="#345486" strokeWidth="6" strokeLinecap="round"/><circle cx="40" cy="23" r="3" fill="#fff"/></>,
    economics: <><rect x="12" y="45" width="13" height="23" rx="3" fill="#b5e2ce"/><rect x="32" y="33" width="13" height="35" rx="3" fill="#69bc95"/><rect x="52" y="20" width="13" height="48" rx="3" fill="#258a63"/><path d="m14 32 19-14 14 5L66 9m-13 0h13v13" fill="none" stroke="#176344" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></>,
    commodities: <><path d="m11 46 22-4 9 23-35 3Z" fill="#e8a329"/><path d="m33 42 12 7 5 18-8-2Z" fill="#b97b14"/><path d="m41 47 24-3 8 21-31 3Z" fill="#f2ba45"/><path d="m28 20 26-3 9 22-41 4Z" fill="#ffd467"/><path d="m54 17 10 7 7 19-8-4Z" fill="#cd8e23"/><path d="m27 28 23-3" stroke="#ffe9a4" strokeWidth="3" strokeLinecap="round"/></>,
    business: <><path d="M28 23v-8h24v8" stroke="#304f6c" strokeWidth="6" fill="none" strokeLinejoin="round"/><rect x="10" y="23" width="60" height="44" rx="8" fill="#4d769c"/><path d="M10 38q30 19 60 0V29a6 6 0 0 0-6-6H16a6 6 0 0 0-6 6Z" fill="#759fc3"/><rect x="35" y="41" width="10" height="13" rx="3" fill="#e9cf91"/></>,
    culture: <><path d="M22 17H10v12q0 15 20 17m28-29h12v12q0 15-20 17" fill="none" stroke="#e6ad57" strokeWidth="6" strokeLinejoin="round"/><path d="M22 12h36v17q0 22-18 22T22 29Z" fill="#f4c96e"/><path d="M40 51v12m-13 4h26" stroke="#c08b36" strokeWidth="7" strokeLinecap="round"/><path d="m40 21 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="#fff0c7"/></>,
    tech: <><path d="M27 8v12m13-12v12M53 8v12M27 60v12m13-12v12m13-12v12M8 27h12M8 40h12M8 53h12m40-26h12M60 40h12M60 53h12" stroke="#aca1dd" strokeWidth="5" strokeLinecap="round"/><rect x="18" y="18" width="44" height="44" rx="9" fill="#7965bb"/><rect x="28" y="28" width="24" height="24" rx="5" fill="#c9bfee"/><path d="m40 32 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="#fff"/></>,
    weather: <><g stroke="#f3bd53" strokeWidth="4" strokeLinecap="round"><path d="M29 7v7M9 16l5 5M4 35h7m37-19-5 5M48 35h7"/></g><circle cx="29" cy="34" r="16" fill="#ffd268"/><path d="M23 66a13 13 0 0 1-1-26 20 20 0 0 1 36-4 15 15 0 0 1 3 30Z" fill="#c5dcec"/><path d="M22 60h36" stroke="#dfedf6" strokeWidth="4" strokeLinecap="round"/></>,
  };
  return <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">{art[category]}</svg>;
}
