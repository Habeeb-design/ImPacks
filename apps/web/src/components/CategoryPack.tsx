"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DISCLOSURE, type Pack, type Opening } from "@impacks/contracts";
import { api } from "../lib/api";
import { usePackSession } from "../lib/session";
import { categoryCopy, dollarsToCents, money, priceTiers, snapCustomDollars, tableCardCount, tableOverflow, type CategoryId } from "../lib/category";
import { PackOpeningReveal } from "./PackOpeningReveal";
import { CardSpread } from "./CardSpread";
import { PredictionCard } from "./PredictionCard";
import { TestnetCheckout, useCapabilities } from "./TestnetCheckout";
import { SiteHeader } from "./SiteHeader";
import { useAccountWallet } from "./WalletProvider";

export function CategoryPack({ category }: { category: CategoryId }) {
  const shop = usePackSession();
  const wallet = useAccountWallet();
  const { capabilities } = useCapabilities();
  const sandbox = capabilities?.purchaseMode === "sandbox";
  const checkoutAction = useRef<(() => void) | null>(null);
  const [checkoutActivity, setCheckoutActivity] = useState<{ busy: boolean; budgetCents: number | null }>({ busy: false, budgetCents: null });
  const router = useRouter();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [reveal, setReveal] = useState<{ opening: Opening; owner: string; category: CategoryId } | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [tier, setTier] = useState<20 | 50 | 100 | "custom">(20);
  const [customText, setCustomText] = useState("75");
  const copy = categoryCopy[category];
  const pack = packs.find(item => item.id === category);
  const dollars = tier === "custom" ? snapCustomDollars(customText) : tier;
  const budgetCents = dollars === null ? null : dollarsToCents(dollars);
  const spread = dollars === null ? 5 : tableCardCount(dollars);
  const latest = shop.openings.find(opening => opening.packName.startsWith(pack?.name ?? "___"));
  const pendingHere = !sandbox && shop.attempt?.quote.pack.id === category;
  const pendingElsewhere = !sandbox && !!shop.attempt && !pendingHere;
  const locked = sandbox ? checkoutActivity.busy || checkoutActivity.budgetCents !== null : shop.busy || !!shop.attempt;
  const returnPath = `/category/${category}?amount=${dollars ?? 20}`;
  const loginPath = `/login?next=${encodeURIComponent(returnPath)}`;

  useEffect(() => { setAccepted(false); setReveal(null); }, [wallet.userId, category]);

  useEffect(() => {
    setTier(20); setCustomText("75");
    const raw = new URLSearchParams(window.location.search).get("amount");
    if (!raw) return;
    const amount = snapCustomDollars(raw);
    if (amount === null) return;
    if (amount === 20 || amount === 50 || amount === 100) setTier(amount);
    else { setTier("custom"); setCustomText(String(amount)); }
  }, [category]);

  useEffect(() => {
    if (!pendingHere || !shop.attempt) return;
    const amount = shop.attempt.quote.pack.budgetCents / 100;
    if (amount === 20 || amount === 50 || amount === 100) setTier(amount);
    else { setTier("custom"); setCustomText(String(amount)); }
  }, [pendingHere, shop.attempt]);

  useEffect(() => {
    if (!sandbox || checkoutActivity.budgetCents === null) return;
    const amount = checkoutActivity.budgetCents / 100;
    if (amount === 20 || amount === 50 || amount === 100) setTier(amount);
    else { setTier("custom"); setCustomText(String(amount)); }
  }, [sandbox, checkoutActivity.budgetCents]);

  async function buyPack() {
    if (!wallet.authenticated) { router.push(loginPath); return; }
    if (sandbox) {
      if (!wallet.address) { await wallet.create(); return; }
      checkoutAction.current?.(); document.getElementById("testnet-checkout")?.scrollIntoView({ behavior: "smooth" }); return;
    }
    if (shop.sessionError) { shop.retrySession(); return; }
    if (!wallet.address) { await wallet.create(); return; }
    if (budgetCents && wallet.userId) {
      const owner = wallet.userId;
      const result = await shop.openPack(category, accepted, budgetCents);
      if (result) setReveal({ opening: result, owner, category });
    }
  }

  const buyDisabled = checkoutActivity.busy || !capabilities || (sandbox && (!capabilities.paymentEnabled || !capabilities.enabledPackIds?.includes(category))) || !wallet.configured || (!sandbox && (shop.connecting || shop.busy)) || pendingElsewhere || budgetCents === null
    || (wallet.authenticated && (sandbox || !shop.sessionError) && (!wallet.ready || wallet.creating || (!sandbox && (!pack || !shop.session)) || (!!wallet.address && !accepted)));
  const buyLabel = checkoutActivity.busy ? "Connecting checkout…" : !sandbox && shop.busy ? "Opening your pack…" : !sandbox && shop.connecting ? "Connecting account…"
    : !sandbox && shop.sessionError ? "Reconnect account" : wallet.authenticated && !wallet.address ? (wallet.creating ? "Creating wallet…" : "Create wallet")
    : pendingHere ? "Retry same opening" : sandbox ? `Buy ${copy.title} testnet pack` : `Open simulated ${copy.title} pack`;


  useEffect(() => {
    void api.packs().then(result => setPacks(result.packs)).catch(shop.showError);
  }, [shop.showError]);

  function applyCustom() {
    const snapped = snapCustomDollars(customText);
    if (snapped === null) return;
    setCustomText(String(snapped));
    setTier("custom");
  }

  return (
    <main className={`category-page category-${category}`}>
      <SiteHeader/>
      {reveal && reveal.category === category && reveal.owner === wallet.userId && wallet.authenticated && <PackOpeningReveal key={reveal.opening.id} opening={reveal.opening} category={category} onClose={() => setReveal(null)}/>}

      <section className="category-stage">
        <div className="category-intro">
          <p className="eyebrow">{copy.kicker}</p>
          <h1>{copy.title} pack</h1>
          <p className="category-pitch">{copy.pitch}</p>
        </div>
        <div className="category-board">
          <div className="category-packs">
            <CardSpread count={spread} genre={copy.genre} overflow={dollars !== null && tableOverflow(dollars)} />
            {budgetCents && <p className="category-scale"><strong>{money(budgetCents)}</strong> AUSD</p>}
          </div>
          <aside className="price-rail" aria-label="Pack prices, lowest to highest">
            {priceTiers.map(amount => (
              <button key={amount} type="button" className={`price-chip ${tier === amount ? "selected" : ""}`} disabled={locked} aria-pressed={tier === amount} onClick={() => { setTier(amount); setAccepted(false); }}>
                <span>${amount}</span>
              </button>
            ))}
            <div className={`price-chip custom ${tier === "custom" ? "selected" : ""}`}>
              <label>
                Custom
                <input
                  inputMode="decimal"
                  disabled={locked}
                  value={customText}
                  onChange={event => { setCustomText(event.target.value); setTier("custom"); setAccepted(false); }}
                  onBlur={applyCustom}
                  aria-label="Custom pack amount in dollars, from 20 to 250 in steps of 5"
                />
              </label>
            </div>
            <button className="primary category-buy" disabled={buyDisabled} onClick={() => void buyPack()}>{buyLabel}<span aria-hidden="true">↗</span></button>
            <p className="purchase-hint">{sandbox && !capabilities.enabledPackIds?.includes(category) ? "Sandbox purchases are currently available for Crypto only." : sandbox && !capabilities.paymentEnabled ? "Sandbox checkout is waiting for its worker and treasury to be ready." : !wallet.configured ? "Sign-in is currently unavailable." : !sandbox && shop.sessionError ? "Reconnect to continue with your signed-in account." : wallet.authenticated && !accepted ? "Confirm the pack details below to continue." : !wallet.authenticated ? "Continue with your email to buy." : `${budgetCents ? money(budgetCents) : "—"} AUSD · ${pack?.cardCount ?? 3} predictions`}</p>
          </aside>
        </div>
      </section>

      {shop.error && <p className="error" role="alert">{shop.error}</p>}
      <section className="category-checkout">
        {!sandbox && shop.sessionError && <p className="error" role="alert">{shop.sessionError} <Link href={loginPath}>Sign in again</Link></p>}
        {wallet.error && <p className="error" role="alert">{wallet.error}</p>}
        {!sandbox && shop.connecting ? <p className="purchase-status" role="status">Connecting your signed-in account…</p> : (sandbox || shop.session) && wallet.authenticated ? (
          <div className="purchase-details">
            <div className="purchase-account"><span className="wallet-status"/><span>Buying with your account{wallet.address ? ` · ${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}` : ""}</span></div>
            {pendingElsewhere && shop.attempt ? <p>Finish your pending opening first. <Link href={`/category/${shop.attempt.quote.pack.id}?amount=${shop.attempt.quote.pack.budgetCents / 100}`}>Return to that pack →</Link></p> : <>
              <details><summary>Pack details · {budgetCents ? money(budgetCents) : "—"} AUSD · {pack?.cardCount ?? 3} predictions</summary><p>{DISCLOSURE}</p><p>Your budget is split across three positions. No platform fee.</p></details>
              <label className="disclosure"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} disabled={sandbox ? checkoutActivity.busy : shop.busy}/><span>I accept random markets and YES/NO positions within my selected budget.</span></label>
              {!sandbox && shop.attempt && <small>Retrying keeps your original selections and payment attempt.</small>}
            </>}
          </div>
        ) : null}
        <p className="demo-note">{sandbox ? "Test AUSD on Ethereum Sepolia funds this purchase; predictions execute using separately funded Gemini sandbox USD. Test assets only." : "Payments and trades are simulated. No money moves. Sessions may reset."}</p>
      </section>

      <TestnetCheckout key={`${wallet.userId}:${wallet.address}:${category}`} packId={category} budgetCents={budgetCents} accepted={accepted} actionRef={checkoutAction} onActivity={setCheckoutActivity}/>

      {latest && latest.packName.startsWith(pack?.name ?? "___") && (
        <section className="opening" aria-labelledby="opened-title">
          <div className="section-heading">
            <h2 id="opened-title">{latest.packName}</h2>
            <span>{latest.status} · payment {latest.payment.status}</span>
          </div>
          <div className="card-grid">{latest.cards.map(card => <PredictionCard key={card.id} card={card} />)}</div>
          <div className="collection-link"><Link className="primary" href={`/dashboard?opening=${latest.id}`}>View your collection & manage positions <span aria-hidden="true">↗</span></Link></div>
        </section>
      )}
    </main>
  );
}
