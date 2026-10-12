"use client";
import { useState, type CSSProperties } from "react";
import type { Card } from "@impacks/contracts";
import { cardHolding, cardRarity, cardTitle } from "../lib/card-presentation";
import { resolveCardVisual } from "../lib/resolve-card-visual";
import { CardHeroIcon } from "./CardHeroIcon";
import styles from "./PredictionCard.module.css";
export const rarityColors = { Common: "#b8c5d8", Rare: "#65bcff", Epic: "#c79aff", Legendary: "#f5ce76" };
export function CardVisual({ card, category, mode = "demo", compact = false }: { card: Card; category?: string; mode?: "demo" | "sandbox"; compact?: boolean }) {
  const brand = resolveCardVisual(card, category), rarity = cardRarity(card), holding = cardHolding(card);
  const [broken, setBroken] = useState<string | null>(null);
  return <div className={`${styles.face} ${compact ? styles.compact : ""}`} data-rarity={rarity} style={{ "--card-accent": rarityColors[rarity] } as CSSProperties}>
    <div className={styles.top}><span>{brand.category}</span><span title="Cosmetic finish, not official market rarity">{rarity}</span></div>
    <div className={styles.art} aria-hidden="true"><div className={styles.orbit}/>{brand.src && broken !== brand.src ? <img src={brand.src} alt="" width={90} height={90} onError={() => setBroken(brand.src)}/> : <span className={styles.symbol}><CardHeroIcon icon={brand.icon}/></span>}</div>
    <div className={styles.identity}><span>{brand.name}</span><b data-side={card.side}>{card.side === "YES" || card.side === "NO" ? card.side : "—"}</b></div>
    <h3>{cardTitle(card.question)}</h3>
    <p className={styles.status}>{holding.status} · {holding.quantity === null ? "Awaiting confirmed holding" : `${holding.quantity} contracts held`}</p>
    <dl><div><dt>{mode === "demo" ? "Simulated spend" : "Sandbox spend"}</dt><dd>{holding.spent === null ? "—" : `$${(holding.spent / 100).toFixed(2)}`}</dd></div><div><dt>Potential gross payout</dt><dd>{holding.quantity === null ? "—" : `$${holding.quantity.toFixed(2)}`}</dd></div></dl>
    <p className={styles.note}>$1 per winning contract · not guaranteed</p><span className={styles.finish}>IMPACKS / COSMETIC {rarity.toUpperCase()} FINISH</span>
  </div>;
}
export function PredictionCard({ card, mode = "demo", category }: { card: Card; mode?: "demo" | "sandbox"; category?: string }) {
  return <article className={styles.card}><CardVisual card={card} mode={mode} category={category}/><details className={styles.details}><summary>Inspect market question <span aria-hidden="true">↗</span></summary><p>{card.question || "Market question unavailable."}</p><p>{card.order?.message}</p><small>Finish is a presentation-only classification, not Gemini rarity, probability or investment value. {card.position?.status === "closed" ? "Closed position: no remaining payout entitlement." : "Gross payout includes your stake; fees are not deducted."}</small></details></article>;
}
