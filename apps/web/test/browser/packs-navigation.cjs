// Requires a local dev server and Playwright available to Node.
// BROWSER_CHANNEL=chrome node apps/web/test/browser/packs-navigation.cjs
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const origin = process.env.CHECKOUT_TEST_URL ?? "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const editions = ["crypto", "sports", "politics", "economics", "commodities", "business", "culture", "tech", "weather", "mixed"]
  .map(id => ({ id, name: id === "mixed" ? "Chaos" : id[0].toUpperCase() + id.slice(1) }));
const packs = editions.map(({ id, name }) => ({ id, name: `${name} Pack`, theme: id, description: "Test fixture", cardCount: 3, priceAtomic: "15000000", budgetCents: 1500 }));

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        for (const edition of editions) {
          const page = await context.newPage();
          page.setDefaultTimeout(10_000);
          let release;
          const discovery = new Promise(resolve => { release = resolve; });
          try {
            await page.route(`${new URL(origin).origin}/api/packs`, route => route.fulfill({ json: { packs } }));
            await page.route(`${new URL(origin).origin}/api/checkout-capabilities`, route => route.fulfill({ json: {
              available: true, purchaseMode: "sandbox", enabledPackIds: editions.map(item => item.id), paymentEnabled: true,
              orderSubmissionEnabled: false, refundBroadcastEnabled: false, chainId: 11155111, network: "Ethereum Sepolia", reason: "Demo test fixture",
            } }));
            await page.route(`${new URL(origin).origin}/api/market-categories`, async route => {
              await discovery;
              await route.fulfill({ json: { categories: ["Crypto", "Sports", "Politics"], fetchedAt: new Date().toISOString() } }).catch(() => {});
            });
            await page.goto(`${origin}/packs`);
            // Discovery remains unresolved throughout these checks. Catalog cards must work anyway.
            for (const item of editions) await page.getByRole("link", { name: `Open ${item.name} pack`, exact: true }).waitFor();
            await page.getByRole("link", { name: `Open ${edition.name} pack`, exact: true }).locator(".foil-pack").click();
            await page.waitForURL(`${origin}/category/${edition.id}`);
            await page.getByRole("heading", { name: `${edition.name} pack`, exact: true }).waitFor();
            await page.locator("button.category-buy").click();
            await page.waitForURL(url => url.pathname === "/login");
            assert.equal(new URL(page.url()).searchParams.get("next"), `/category/${edition.id}?amount=20`);
            console.log(`PASS: ${edition.name} wrapper → category → sign-in return at ${width}px with genre discovery pending`);
          } finally { release(); await page.close(); }
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
