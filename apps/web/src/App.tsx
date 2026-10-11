import { LandingHero } from "./components/LandingHero";
import { PacksBrowser } from "./components/PacksBrowser";
import { SiteHeader } from "./components/SiteHeader";

export function App({ landing = false }: { landing?: boolean }) {
  return <main>
    <SiteHeader/>
    {landing && <LandingHero/>}
    <PacksBrowser compact={landing}/>
    {landing && <section className="how-section" id="how" aria-labelledby="how-title"><p className="eyebrow">A LITTLE CHANCE. A NEW PERSPECTIVE.</p><h2 id="how-title">First, reveal your bets. Then, follow the story.</h2><div className="how-steps"><div><span>01</span><h3>Choose your world.</h3><p>Find an edition that catches your curiosity, then choose your budget.</p></div><div><span>02</span><h3>Reveal your positions.</h3><p>Three randomly selected markets. Random YES or NO sides. Review the budget before opening.</p></div><div><span>03</span><h3>Build your collection.</h3><p>Your dashboard keeps your cards together. Follow every prediction from opening to outcome.</p></div></div><p className="chance-note">Random selection changes which bets you get. It doesn’t improve their odds.</p></section>}
    <footer><span>imPacks / Gamble on gambling.</span><span>Payments and trades are simulated</span></footer>
  </main>;
}
