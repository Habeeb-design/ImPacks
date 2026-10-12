import type { Card } from "@impacks/contracts";
import { formatAusd } from "../lib/currency";
export function PredictionCard({ card, mode = "demo" }: { card: Card; mode?: "demo" | "sandbox" }) {
  const filled = card.order.status === "filled" && card.order.quantity > 0;
  const closed = filled && card.position?.status === "closed";
  return <article className="prediction">
    <span className={`side ${card.side.toLowerCase()}`}>{closed ? "You held" : filled ? "You hold" : "Selected side"} {card.side}</span>
    <h3>{card.question}</h3>
    <p className="position-status">{closed ? "closed" : card.order.status} · {card.order.quantity} contracts</p>
    <dl><div><dt>{mode === "demo" ? "Simulated spend" : "Testnet spend equivalent"}</dt><dd>{formatAusd(card.order.spentCents)}</dd></div><div><dt>{closed ? "Simulated close proceeds" : mode === "sandbox" ? "Potential payout equivalent" : "Pays if your side wins"}</dt><dd>{closed ? formatAusd(card.position?.proceedsCents ?? 0) : filled ? formatAusd(card.order.quantity * 100) : "—"}</dd></div></dl>
    <small>{closed ? "This position is closed. The collectible stays; it no longer pays on resolution." : filled ? mode === "demo" ? "Simulated gross payout of 1 AUSD per winning contract, including your stake. Not guaranteed." : "Testnet position. Potential payouts are estimates in AUSD equivalents; winnings withdrawals are not available." : card.order.message ?? "No confirmed position yet."}</small>
  </article>;
}
