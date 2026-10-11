import type { Card } from "@impacks/contracts";
export function PredictionCard({ card }: { card: Card }) {
  const filled = card.order.status === "filled";
  return <article className="prediction">
    <span className={`side ${card.side.toLowerCase()}`}>{filled ? "You hold" : "Selected side"} {card.side}</span>
    <h3>{card.question}</h3>
    <p className="position-status">{card.order.status} · {card.order.quantity} contracts</p>
    <dl><div><dt>Simulated spend</dt><dd>${(card.order.spentCents / 100).toFixed(2)}</dd></div><div><dt>Pays if your side wins</dt><dd>{filled ? `$${card.order.quantity.toFixed(2)}` : "—"}</dd></div></dl>
    <small>{filled ? "Simulated gross payout at $1 per winning contract, including your stake. Not guaranteed." : card.order.message ?? "No confirmed position yet."}</small>
  </article>;
}
