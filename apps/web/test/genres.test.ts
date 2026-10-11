import assert from "node:assert/strict";
import test from "node:test";
import { groupMarketGenres, matchingGenres } from "../src/lib/genres.ts";
import type { Pack } from "@impacks/contracts";

const packs = [{id: "crypto"}, {id: "sports"}, {id: "mixed"}] as Pack[];

test("Gemini navigation collections and subgenres group into distinct editions", () => {
  const genres = groupMarketGenres(["Live", "Sports", "Pro Football", "Pro Baseball", "Midterms", "Politics", "Crypto", "Weather"], packs);
  assert.deepEqual(genres.map(genre => genre.id), ["crypto", "sports", "mixed", "politics", "weather"]);
  assert.equal(genres.find(genre => genre.id === "politics")?.packId, undefined);
});

test("failed discovery retains only returned pack entries without inventing provider genres", () => {
  assert.deepEqual(groupMarketGenres([], packs).map(genre => genre.id), ["crypto", "sports", "mixed"]);
  assert.deepEqual(groupMarketGenres([], []), []);
});

test("new provider genres are visible without becoming purchasable", () => {
  const genres = groupMarketGenres(["Science", "science", "CRYPTO"], []);
  assert.equal(genres.length, 2);
  assert.equal(genres[1].name, "Science");
  assert.equal(genres[1].packId, undefined);
});

test("group and topic search compose without hiding grouped provider subgenres", () => {
  const genres = groupMarketGenres(["Politics", "Sports"], packs);
  assert.deepEqual(matchingGenres(genres, "World & culture", "midterms").map(genre => genre.id), ["politics"]);
  assert.equal(matchingGenres(genres, "Markets & money", "midterms").length, 0);
  assert.deepEqual(matchingGenres(genres, "All editions", "  football  ").map(genre => genre.id), ["sports"]);
});
