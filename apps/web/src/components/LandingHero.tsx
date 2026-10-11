const logos = [
  {name: "Bitcoin", file: "btc.svg", style: "bitcoin"},
  {name: "Ethereum", file: "eth.svg", style: "ethereum"},
  {name: "NFL", file: "nfl.png", style: "nfl"},
  {name: "MLB", file: "mlb.png", style: "mlb"},
  {name: "WNBA", file: "wnba.png", style: "wnba"},
  {name: "NBA", file: "nba.png", style: "nba"},
  {name: "Federal Reserve", file: "federal-reserve.svg", style: "category economics"},
  {name: "Shell", file: "shell.svg", style: "category commodities"},
  {name: "eBay", file: "ebay.svg", style: "category business"},
  {name: "Spotify", file: "spotify.svg", style: "category culture"},
  {name: "NVIDIA", file: "nvidia.svg", style: "category tech"},
  {name: "NOAA", file: "noaa.svg", style: "category weather"},
];

export function LandingHero() {
  return <section className="gamble-hero" aria-labelledby="hero-title">
    <div className="logo-orbit" aria-hidden="true">{logos.map(logo => <div key={logo.name} className={`orbit-logo ${logo.style.split(" ").map(style => `orbit-${style}`).join(" ")}`}><img src={`/images/brands/${logo.file}`} alt="" width="100" height="100"/></div>)}<div className="orbit-logo orbit-politics"><img src="/images/brands/democrats.svg" alt="" width="60" height="60"/><img src="/images/brands/republicans.svg" alt="" width="72" height="34"/></div><span className="orbit-spark spark-one">✦</span><span className="orbit-spark spark-two">✦</span><span className="orbit-dot"/></div>
    <div className="gamble-copy"><p className="hero-kicker"><span/> A LITTLE CHANCE. A LOT TO FOLLOW.</p><h1 id="hero-title">Gamble on<br/>gambling<span className="title-period">.</span></h1><p className="hero-description">Open a pack. Reveal your bets.<br/>Follow what happens next.</p><a className="primary open-pack-cta" href="/login">Open a pack <span aria-hidden="true">↗</span></a><p className="hero-footnote">Your world. Your budget. A surprise inside.</p></div>
    <a className="scroll-hint" href="#packs">Find your kind of chance <span aria-hidden="true">↓</span></a>
  </section>;
}
