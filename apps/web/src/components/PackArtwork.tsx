import styles from "./PackArtwork.module.css";

const editionLogos: Record<string, string[]> = {
  Crypto: ["btc.svg", "eth.svg"],
  Sports: ["nfl.png", "nba.png", "mlb.png", "wnba.png"],
  Chaos: ["btc.svg", "nfl.png", "nvidia.svg", "spotify.svg", "ebay.svg"],
  Politics: ["democrats.svg", "republicans.svg"],
  Economics: ["federal-reserve.svg"],
  Commodities: ["shell.svg"],
  Business: ["ebay.svg"],
  Tech: ["nvidia.svg"],
  Culture: ["spotify.svg"],
  Weather: ["noaa.svg"],
};

export function PackArtwork({ genre = "Chaos", className = "" }: { genre?: string; className?: string }) {
  const logos = editionLogos[genre] ?? [];
  return <span className={`foil-pack foil-edition-${genre.toLowerCase().replace(/[^a-z0-9]+/g, "-")} ${logos.length === 1 ? styles.single : logos.length === 2 ? styles.pair : ""} ${className}`} aria-hidden="true">
    <img className="foil-wrapper" src="/images/impacks-blank-foil.webp" alt="" width={1024} height={1536} draggable={false} />
    <span className="foil-logo-collage">
      {logos.map((file, index) => <img key={file} className={`foil-logo foil-logo-${index + 1}`} src={`/images/brands/${file}`} alt="" width={100} height={100} draggable={false} />)}
    </span>
    <span className="foil-genre"><strong>{genre}</strong><span>Edition</span></span>
  </span>;
}
