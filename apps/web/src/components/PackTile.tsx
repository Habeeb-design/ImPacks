import type { Pack } from "@impacks/contracts";
export function PackTile({ pack, selected, disabled, onSelect }: { pack: Pack; selected: boolean; disabled: boolean; onSelect: () => void }) {
  return <button className={`pack ${pack.theme} ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onSelect} disabled={disabled}>
    <span className="pack-count">{pack.cardCount} RANDOM PICKS</span>
    <span className="pack-art" aria-hidden="true">{pack.theme === "crypto" ? "↗" : pack.theme === "sports" ? "◎" : "✳"}</span>
    <strong>{pack.name}</strong><span>{pack.description}</span>
    <span className="pack-price">{Number(pack.priceAtomic) / 1_000_000} AUSD <small>DEMO</small></span>
  </button>;
}
