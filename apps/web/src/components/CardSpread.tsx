"use client";

import { PackArtwork } from "./PackArtwork";

export function CardSpread({ count, genre, overflow = false }: { count: number; genre: string; overflow?: boolean }) {
  const cards = Math.min(10, Math.max(3, count));
  const behind = cards - 1;
  const leftCount = Math.floor(behind / 2);
  const rightCount = behind - leftCount;
  const stepX = Math.max(18, 30 - behind);
  const stepAngle = 8;

  function card(key: string, side: -1 | 0 | 1, rank: number) {
    const slide = side * rank * stepX;
    const angle = side * rank * stepAngle;
    const depth = side === 0 ? 0 : rank;
    return (
      <span
        key={key}
        className={`table-card ${side === 0 ? "focus" : "behind"}`}
        style={{
          zIndex: side === 0 ? 30 : 20 - depth,
          transform: `translate(calc(-50% + ${slide}px), ${side === 0 ? 0 : 8 + depth * 2}px) rotate(${angle}deg)`,
        }}
      >
        <PackArtwork genre={genre} />
      </span>
    );
  }

  return (
    <div className="card-table" aria-hidden="true">
      <div className="card-table-felt">
        {Array.from({ length: leftCount }, (_, index) => card(`left-${index}`, -1, leftCount - index))}
        {Array.from({ length: rightCount }, (_, index) => card(`right-${index}`, 1, rightCount - index))}
        <span className="table-aura" />
        {card("focus", 0, 0)}
        {overflow && <span className="table-overflow">10+</span>}
      </div>
    </div>
  );
}
