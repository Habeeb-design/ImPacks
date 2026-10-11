import type { Card, Opening } from "@impacks/contracts";

export type CollectionStatus = "open" | "closed" | "awaiting" | "unfilled";
export type CollectionFilter = "all" | CollectionStatus;
export function cardStatus(card: Card): CollectionStatus {
  if (card.order.status === "pending" || card.order.status === "unknown") return "awaiting";
  if (card.order.status !== "filled" || card.order.quantity <= 0) return "unfilled";
  return card.position?.status === "closed" ? "closed" : "open";
}
export const statusLabels: Record<CollectionStatus, string> = {
  open: "Open position", closed: "Closed position", awaiting: "Awaiting confirmation", unfilled: "Not filled",
};
export function openingGenre(opening: Opening): string {
  if (opening.theme === "mixed") return "Chaos";
  if (opening.theme) return opening.theme.charAt(0).toUpperCase() + opening.theme.slice(1);
  return opening.packName.replace(/\s+pack$/i, "").replace(/\s+edition$/i, "") || "Collection";
}
export function collectionSummary(openings: Opening[]) {
  const cards = openings.flatMap(opening => opening.cards);
  const open = cards.filter(card => cardStatus(card) === "open");
  return {
    cards: cards.length, packs: openings.length, open: open.length,
    closed: cards.filter(card => cardStatus(card) === "closed").length,
    awaiting: cards.filter(card => cardStatus(card) === "awaiting").length,
    unfilled: cards.filter(card => cardStatus(card) === "unfilled").length,
    openSpentCents: open.reduce((sum, card) => sum + card.order.spentCents, 0),
    conditionalGrossCents: open.reduce((sum, card) => sum + card.order.quantity * 100, 0),
  };
}
export function filterCollection(openings: Opening[], filter: CollectionFilter, genre: string, search: string) {
  const query = search.trim().toLowerCase();
  return openings.filter(opening => genre === "all" || openingGenre(opening) === genre)
    .map(opening => ({ ...opening, cards: opening.cards.filter(card =>
      (filter === "all" || cardStatus(card) === filter) &&
      (!query || `${card.question} ${card.side} ${opening.packName}`.toLowerCase().includes(query)),
    ) })).filter(opening => opening.cards.length > 0);
}
export function closeAttemptStorageKey(userId: string, openingId: string, cardId: string) {
  return `impacks.position-close:${encodeURIComponent(userId)}:${encodeURIComponent(openingId)}:${encodeURIComponent(cardId)}`;
}
