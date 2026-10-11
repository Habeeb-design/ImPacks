export function PackArtwork({ genre = "", className = "" }: { genre?: string; className?: string }) {
  return <span className={`foil-pack ${className}`} aria-hidden="true">
    <img src="/images/impacks-black-foil.webp" alt="" width={1024} height={1536} draggable={false} />
    <span className="foil-genre">{genre}</span>
  </span>;
}
