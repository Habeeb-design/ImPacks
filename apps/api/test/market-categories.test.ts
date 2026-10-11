import test from "node:test";
import assert from "node:assert/strict";
import { createMarketCategoryReader, GEMINI_CATEGORIES_URL } from "../src/services/market-categories.js";

test("Gemini category discovery validates upstream data, deduplicates and coalesces reads", async () => {
  let calls = 0;
  const read = createMarketCategoryReader(async (url, init) => {
    assert.equal(url, GEMINI_CATEGORIES_URL);
    assert.ok(init?.signal);
    calls++;
    return Response.json({ categories: ["Sports", "Crypto", "Sports", "Midterms"] });
  });
  const result = await Promise.all([read(), read()]);
  assert.equal(calls, 1);
  assert.deepEqual(result[0].categories, ["Sports", "Crypto", "Midterms"]);
  assert.equal(result[0].source, "gemini");
  await read();
  assert.equal(calls, 1);
});

test("expired discovery does not silently substitute cached data on an upstream failure", async () => {
  let now = 100_000;
  let fails = false;
  const read = createMarketCategoryReader(async () => fails ? new Response("down", { status: 503 }) : Response.json({ categories: ["Crypto"] }), () => now);
  await read();
  now += 61_000; fails = true;
  await assert.rejects(read(), /unavailable/);
  fails = false;
  assert.equal((await read()).fetchedAt, new Date(now).toISOString());
  for (const body of [["Crypto"], { categories: [42] }, { categories: [""] }]) {
    await assert.rejects(createMarketCategoryReader(async () => Response.json(body))(), /unavailable/);
  }
});
