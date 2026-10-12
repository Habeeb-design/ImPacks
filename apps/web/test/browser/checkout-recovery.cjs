// Run against a local dev server with Playwright available to Node:
// node apps/web/test/browser/checkout-recovery.cjs
// CHECKOUT_TEST_URL may override http://localhost:3000.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const origin = process.env.CHECKOUT_TEST_URL ?? "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Use a local test server");
const capabilities = { available: true, chainId: 11155111, network: "Ethereum Sepolia", purchaseMode: "sandbox",
  enabledPackIds: ["crypto"], paymentEnabled: true, orderSubmissionEnabled: false, refundBroadcastEnabled: false,
  reason: "Checkout connection restored (test fixture)." };
const packs = { packs: [{ id: "crypto", name: "Crypto Pack", theme: "crypto", description: "Test fixture",
  cardCount: 3, priceAtomic: "15000000", budgetCents: 1500 }] };

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  try {
    for (const scenario of ["capabilities", "catalog", "both"]) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        let outage = true, failedReads = 0, writes = 0;
        await page.route(`${new URL(origin).origin}/api/**`, async route => {
          const request = route.request(), path = new URL(request.url()).pathname;
          if (request.method() !== "GET") { writes++; return route.abort(); }
          const isCapabilities = path === "/api/checkout-capabilities", isCatalog = path === "/api/packs";
          if (!isCapabilities && !isCatalog) return route.continue();
          if (outage && (scenario === "both" || (scenario === "capabilities" && isCapabilities) || (scenario === "catalog" && isCatalog))) {
            failedReads++;
            return route.fulfill({ status: 503, json: { error: { code: "API_UNAVAILABLE", message: "The service is unavailable. Please try again shortly." } } });
          }
          return route.fulfill({ json: isCapabilities ? capabilities : packs });
        });
        await page.goto(`${origin}/category/crypto?amount=50`);
        const retry = page.getByRole("button", { name: "Retry connection", exact: true });
        const buy = page.locator("button.category-buy");
        await retry.waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent === "Retry connection" && !button.disabled));
        assert.equal(await buy.isDisabled(), true);

        // An unsuccessful retry must keep the controls disabled and offer another retry.
        const before = failedReads;
        await retry.click();
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent === "Retry connection" && !button.disabled));
        assert.ok(failedReads > before);
        assert.equal(await buy.isDisabled(), true);

        outage = false;
        await retry.click();
        await page.waitForFunction(() => document.querySelector("button.category-buy")?.disabled === false);
        assert.equal(await retry.count(), 0);
        assert.equal(await page.getByRole("alert").filter({ hasText: "The service is unavailable" }).count(), 0);
        assert.equal(await page.getByRole("heading", { name: "Your purchase.", exact: true }).count(), 0, "No second checkout flow before Buy");
        assert.equal(await page.getByText(/Testnet only/).count(), 1);
        assert.equal(/sandbox|separately funded|treasury/i.test(await page.locator("body").innerText()), false, "Funding mechanics stay out of the customer flow");
        assert.equal(await page.locator("button.price-chip").nth(1).getAttribute("aria-pressed"), "true");
        assert.equal(writes, 0, "Connection retries must never submit a purchase");
        console.log(`PASS: ${scenario} outage → failed retry → successful retry; button recovered without reload`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
