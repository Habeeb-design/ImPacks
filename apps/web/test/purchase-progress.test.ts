import test from "node:test";
import assert from "node:assert/strict";
import { purchaseProgress } from "../src/lib/purchase-progress";

test("uncertain exchange execution stops the opening spinner even for a platform advance", () => {
  for (const busy of [false, true]) {
    const result = purchaseProgress({ state: "reconciliation-required", fundingMode: "platform-advance" }, false, busy);
    assert.equal(result?.spinning, false);
    assert.match(result!.label, /Checking order status/);
  }
});
test("payment waits and completed results are not represented as opening", () => {
  assert.equal(purchaseProgress({ state: "awaiting-payment", fundingMode: "payment-first" }, false, false), null);
  assert.equal(purchaseProgress({ state: "awaiting-payment", fundingMode: "platform-advance" }, true, false), null);
  assert.equal(purchaseProgress({ state: "executing", fundingMode: "platform-advance" }, false, false)?.spinning, true);
  assert.match(purchaseProgress(null, false, true)!.label, /Check your wallet/);
});
