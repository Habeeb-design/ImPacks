import type { VisualIcon } from "../lib/resolve-card-visual";
/** Local decorative vector artwork, colored by the existing rarity frame. */
export function CardHeroIcon({icon}: {icon: VisualIcon}) {
  const art = {
    soccer: <><circle cx="32" cy="32" r="24"/><path d="m32 20 12 9-5 14H25l-5-14Z M32 20V8 M44 29l11-5 M39 43l7 10 M25 43l-7 10 M20 29 9 24"/></>,
    football: <><path d="M10 47C6 20 20 6 47 10c11 24-1 47-37 37Z"/><path d="m22 39 18-18 m-19 8 14 14 m-9-19 14 14 M10 35l19 19 M35 10l19 19"/></>,
    basketball: <><circle cx="32" cy="32" r="24"/><path d="M8 32h48 M32 8v48 M15 15c22 5 29 20 34 34 M49 15C27 20 20 35 15 49"/></>,
    baseball: <><circle cx="32" cy="32" r="24"/><path d="M16 14c13 11 13 25 0 36 M48 14c-13 11-13 25 0 36 M17 22l8-3 M19 32h9 M17 42l8 3 M47 22l-8-3 M45 32h-9 M47 42l-8 3"/></>,
    hockey: <><path d="m46 8-17 34H12l-4 9h25L55 12"/><ellipse cx="46" cy="49" rx="10" ry="4"/><path d="M36 49v6c0 5 20 5 20 0v-6"/></>,
    tennis: <><circle cx="32" cy="32" r="24"/><path d="M12 19c25 2 25 24 0 26 M52 19c-25 2-25 24 0 26"/></>,
    sports: <><path d="M21 10h22v17c0 18-22 18-22 0Z M21 15H10v7c0 10 11 11 11 11 M43 15h11v7c0 10-11 11-11 11 M32 40v13 M21 55h22"/></>,
    crypto: <><path d="m32 6 23 13v26L32 58 9 45V19Z M9 19l23 14 23-14 M32 33v25"/><circle cx="32" cy="21" r="5"/></>,
    business: <><path d="M10 53h46 M15 45V32h8v13 M28 45V24h8v21 M41 45V15h8v30 M12 22l17-11 9 3L52 6"/></>,
    politics: <><path d="m7 23 25-15 25 15Z M13 29v19 M26 29v19 M39 29v19 M51 29v19 M8 54h48"/></>,
    weather: <><circle cx="23" cy="22" r="10"/><path d="M23 4v4 M5 22h4 M10 9l4 4 M36 9l-4 4 M17 47h32c14 0 13-21 0-21-6-15-27-12-29 3-15-1-17 18-3 18Z M25 53l-3 5 M39 53l-3 5"/></>,
    technology: <><rect x="17" y="17" width="30" height="30" rx="5"/><path d="M25 8v9 M39 8v9 M25 47v9 M39 47v9 M8 25h9 M8 39h9 M47 25h9 M47 39h9"/><rect x="26" y="26" width="12" height="12" rx="2"/></>,
    culture: <><path d="M25 44V14l26-5v29 M25 24l26-5"/><ellipse cx="17" cy="46" rx="8" ry="6"/><ellipse cx="43" cy="40" rx="8" ry="6"/></>,
    news: <><rect x="10" y="10" width="44" height="44" rx="6"/><path d="M18 19h28 M34 28h12 M34 36h12 M18 45h28"/><rect x="18" y="27" width="9" height="10" rx="1"/></>,
  };
  return <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{art[icon]}</svg>;
}
