import assert from "node:assert/strict";
import test from "node:test";
import type { Card, Opening } from "@impacks/contracts";
import { cardStatus, closeAttemptStorageKey, collectionSummary, filterCollection } from "../src/lib/collection.ts";

const card = (id: string, status: Card["order"]["status"], closed = false): Card => ({ id, marketId: id, question: `Will ${id} happen?`, side: "YES", allocationCents: 500, priceCents: 40, order: { id, status, quantity: status === "filled" ? 12 : 0, spentCents: status === "filled" ? 480 : 0 }, ...(closed ? { position: { status: "closed", proceedsCents: 480, exitPriceCents: 40, closedAt: "2026-10-11T00:00:00Z" } as Card["position"] } : {}) });
const opening: Opening = { id: "opening-1", quoteId: "quote-1", theme: "crypto", packName: "Crypto Pack", createdAt: "2026-10-11T00:00:00Z", status: "partial", payment: { status: "confirmed", reference: "simulation" }, mode: "demo", cards: [card("bitcoin", "filled"), card("ether", "filled", true), card("pending", "pending"), card("unknown", "unknown"), card("failed", "failed")] };

test("pending, unknown, failed, and zero-size orders never count as holdings", () => {
  assert.equal(cardStatus(opening.cards[2]!), "awaiting");
  assert.equal(cardStatus(opening.cards[3]!), "awaiting");
  assert.equal(cardStatus(opening.cards[4]!), "unfilled");
  const empty = card("empty", "filled"); empty.order.quantity = 0;
  assert.equal(cardStatus(empty), "unfilled");
  assert.deepEqual(collectionSummary([opening]), { cards: 5, packs: 1, open: 1, closed: 1, awaiting: 2, unfilled: 1, openSpentCents: 480, conditionalGrossCents: 1200 });
});
test("closed positions remain collectible while leaving exposure and payout totals", () => {
  const groups = filterCollection([opening], "closed", "Crypto", "ether");
  assert.equal(groups.length, 1); assert.equal(groups[0]!.cards[0]!.id, "ether");
  assert.equal(opening.cards.length, 5);
  assert.equal(filterCollection([opening], "open", "Crypto", "ether").length, 0);
  assert.equal(filterCollection([opening], "all", "Sports", "").length, 0);
});
test("close retries are isolated by account, opening, and card", () => {
  const key = closeAttemptStorageKey("alice", "pack", "card");
  assert.notEqual(key, closeAttemptStorageKey("bob", "pack", "card"));
  assert.notEqual(key, closeAttemptStorageKey("alice", "other-pack", "card"));
  assert.notEqual(key, closeAttemptStorageKey("alice", "pack", "other-card"));
  assert.notEqual(closeAttemptStorageKey("a:b", "c", "d"), closeAttemptStorageKey("a", "b:c", "d"));
});
