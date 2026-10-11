import type { Pack } from "@impacks/contracts";
import { PackArtwork } from "./PackArtwork";
export function PackTile({ pack, selected, disabled, duplicate = false, onSelect }: { pack: Pack; selected: boolean; disabled: boolean; duplicate?: boolean; onSelect: () => void }) {
  return <button className={`pack ${pack.theme} ${selected ? "selected" : ""}`} aria-label={`Select ${pack.name}`} aria-pressed={selected} tabIndex={duplicate ? -1 : undefined} onClick={onSelect} disabled={disabled}>
    <strong className="category-name">{pack.name.replace(/ Pack$/, "")}</strong>
    <span className="pack-stage"><PackArtwork genre={pack.name.replace(/ Pack$/, "")} /></span>
    <span className="pack-price">{Number(pack.priceAtomic) / 1_000_000} AUSD <span>· {pack.cardCount} picks</span></span>
    <span className="pack-description">{pack.description}</span>
  </button>;
}
