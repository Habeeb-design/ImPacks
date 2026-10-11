import type { Card } from "@impacks/contracts";
export function PredictionCard({ card }: { card: Card }) {
  const filled = card.order.status === "filled" && card.order.quantity > 0;
  const closed = filled && card.position?.status === "closed";
  return <article className="prediction">
    <span className={`side ${card.side.toLowerCase()}`}>{closed ? "You held" : filled ? "You hold" : "Selected side"} {card.side}</span>
    <h3>{card.question}</h3>
    <p className="position-status">{closed ? "closed" : card.order.status} · {card.order.quantity} contracts</p>
    <dl><div><dt>Simulated spend</dt><dd>${(card.order.spentCents / 100).toFixed(2)}</dd></div><div><dt>{closed ? "Simulated close proceeds" : "Pays if your side wins"}</dt><dd>{closed ? `$${((card.position?.proceedsCents ?? 0) / 100).toFixed(2)}` : filled ? `$${card.order.quantity.toFixed(2)}` : "—"}</dd></div></dl>
    <small>{closed ? "This position is closed. The collectible stays; it no longer pays on resolution." : filled ? "Simulated gross payout at $1 per winning contract, including your stake. Not guaranteed." : card.order.message ?? "No confirmed position yet."}</small>
  </article>;
}
