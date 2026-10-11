"use client";

import { PackArtwork } from "./PackArtwork";

export function CardSpread({ count, genre, overflow = false }: { count: number; genre: string; overflow?: boolean }) {
  const cards = Math.min(10, Math.max(3, count));
  const spreadAngle = 104;

  return (
    <div className="card-table" aria-hidden="true">
      <div className="card-table-felt">
        <span className="table-aura" />
        {Array.from({ length: cards }, (_, index) => {
          const angle = -spreadAngle / 2 + index * spreadAngle / (cards - 1);
          return <span
            key={index}
            className="table-card"
            style={{ zIndex: index + 1, transform: `translateX(-50%) rotate(${angle}deg)` }}
          >
            <PackArtwork genre={genre} />
          </span>;
        })}
        {overflow && <span className="table-overflow">10+</span>}
      </div>
    </div>
  );
}
