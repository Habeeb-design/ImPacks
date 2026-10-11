import test from "node:test";
import assert from "node:assert/strict";
import { readResaleAttempt, resaleStorageKey } from "../src/lib/posttrade-api";
import { postLoginPath } from "../src/lib/account-session";
import { collectionSummary } from "../src/lib/collection";
import type { Opening } from "@impacks/contracts";
test("saved resale retries preserve their original payload and are isolated by owner",()=>{
 const attempt={owner:"did:privy:alice",key:"stable-key",kind:"list",body:{positionId:"position",quantity:2,priceCents:50,confirmSimulation:true}};
 assert.deepEqual(readResaleAttempt(JSON.stringify(attempt),attempt.owner),attempt);
 assert.equal(readResaleAttempt(JSON.stringify(attempt),"did:privy:bob"),null);
 assert.equal(readResaleAttempt("broken",attempt.owner),null);
 assert.notEqual(resaleStorageKey(attempt.owner),resaleStorageKey("did:privy:bob"));
 assert.equal(postLoginPath("/marketplace"),"/marketplace");assert.equal(postLoginPath("//marketplace"),"/packs");
});
test("collection exposure uses remaining ownership instead of the original fill after a resale",()=>{
 const openings=[{cards:[{order:{status:"filled",quantity:10,spentCents:400},position:{status:"open",remainingQuantity:3,costBasisCents:120}}]}] as Opening[];
 const summary=collectionSummary(openings);assert.equal(summary.conditionalGrossCents,300);assert.equal(summary.openSpentCents,120);
});
