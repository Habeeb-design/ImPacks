import type { Card } from "@impacks/contracts";
export function PredictionCard({ card }: { card: Card }) {
  return <article className="prediction">
    <span className={`side ${card.side.toLowerCase()}`}>{card.side}</span>
    <h3>{card.question}</h3>
    <p>{card.order.status} · {card.order.quantity} contracts</p>
    <p>{card.priceCents}¢ entry · ${(card.order.spentCents / 100).toFixed(2)} simulated spend</p>
    <small>Budget ${(card.allocationCents / 100).toFixed(2)} · {card.order.message ?? "Demo position"}</small>
  </article>;
}
