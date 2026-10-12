"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DISCLOSURE, type Pack } from "@impacks/contracts";
import { api } from "../lib/api";
import { categoryCopy, dollarsToCents, money, priceTiers, snapCustomDollars, tableCardCount, tableOverflow, type CategoryId } from "../lib/category";
import { CardSpread } from "./CardSpread";
import { TestnetCheckout, useCapabilities } from "./TestnetCheckout";
import { SiteHeader } from "./SiteHeader";
import { useAccountWallet } from "./WalletProvider";

export function CategoryPack({ category }: { category: CategoryId }) {
  const wallet = useAccountWallet();
  const availability = useCapabilities();
  const { capabilities } = availability;
  const sandbox = capabilities?.purchaseMode === "sandbox";
  const checkoutAction = useRef<(() => void) | null>(null);
  const [checkoutActivity, setCheckoutActivity] = useState<{ busy: boolean; budgetCents: number | null }>({ busy: false, budgetCents: null });
  const router = useRouter();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [tier, setTier] = useState<20 | 50 | 100 | "custom">(20);
  const [customText, setCustomText] = useState("75");
  const copy = categoryCopy[category];
  const pack = packs.find(item => item.id === category);
  const dollars = tier === "custom" ? snapCustomDollars(customText) : tier;
  const budgetCents = dollars === null ? null : dollarsToCents(dollars);
  const spread = dollars === null ? 5 : tableCardCount(dollars);
  const locked = checkoutActivity.busy || checkoutActivity.budgetCents !== null;
  const returnPath = `/category/${category}?amount=${dollars ?? 20}`;
  const loginPath = `/login?next=${encodeURIComponent(returnPath)}`;

  useEffect(() => { setAccepted(false); }, [wallet.userId, category]);

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
    if (!sandbox || checkoutActivity.budgetCents === null) return;
    const amount = checkoutActivity.budgetCents / 100;
    if (amount === 20 || amount === 50 || amount === 100) setTier(amount);
    else { setTier("custom"); setCustomText(String(amount)); }
  }, [sandbox, checkoutActivity.budgetCents]);

  async function buyPack() {
    if (!wallet.authenticated) { router.push(loginPath); return; }
    if (!sandbox || !capabilities?.available || !capabilities.paymentEnabled || !capabilities.enabledPackIds?.includes(category)) return;
    if (sandbox) {
      if (!wallet.address) { await wallet.create(); return; }
      checkoutAction.current?.(); document.getElementById("testnet-checkout")?.scrollIntoView({ behavior: "smooth" }); return;
    }
  }

  const connectionLoading = availability.loading || catalogLoading;
  const connectionError = availability.error || catalogError;
  const buyDisabled = !sandbox || connectionLoading || !!connectionError || checkoutActivity.busy || !capabilities?.available || !capabilities.paymentEnabled || !capabilities.enabledPackIds?.includes(category) || !wallet.configured || budgetCents === null
    || (wallet.authenticated && (!wallet.ready || wallet.creating || (!!wallet.address && !accepted)));
  const buyLabel = connectionLoading ? "Checking availability…" : connectionError ? "Connection unavailable" : checkoutActivity.busy ? "Connecting checkout…"
    : !capabilities?.paymentEnabled ? "Checkout unavailable" : !capabilities.enabledPackIds?.includes(category) ? "Markets unavailable"
    : wallet.authenticated && !wallet.address ? (wallet.creating ? "Creating wallet…" : "Create wallet") : `Buy ${copy.title} pack`;


  useEffect(() => {
    let active = true;
    void api.packs().then(result => { if (active) { setPacks(result.packs); setCatalogError(""); } })
      .catch(cause => { if (active) setCatalogError(cause instanceof Error ? cause.message : "Pack details are unavailable."); })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [catalogRevision]);

  function retryConnection() {
    availability.retry();
    setCatalogLoading(true); setCatalogError(""); setCatalogRevision(value => value + 1);
  }

  function applyCustom() {
    const snapped = snapCustomDollars(customText);
    if (snapped === null) return;
    setCustomText(String(snapped));
    setTier("custom");
  }

  return (
    <main className={`category-page category-${category}`}>
      <SiteHeader/>

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
                <span>{amount}</span><small>AUSD</small>
              </button>
            ))}
            <div className={`price-chip custom ${tier === "custom" ? "selected" : ""}`}>
              <label>
                Custom AUSD
                <input
                  inputMode="decimal"
                  disabled={locked}
                  value={customText}
                  onChange={event => { setCustomText(event.target.value); setTier("custom"); setAccepted(false); }}
                  onBlur={applyCustom}
                  aria-label="Custom pack amount in AUSD, from 20 to 250 in steps of 5"
                />
              </label>
            </div>
            <button className="primary category-buy" disabled={buyDisabled} onClick={() => void buyPack()}>{buyLabel}<span aria-hidden="true">↗</span></button>
            <p className="purchase-hint">{!sandbox || !capabilities?.paymentEnabled ? "Checkout is temporarily unavailable. Availability refreshes automatically." : !capabilities.enabledPackIds?.includes(category) ? "This edition is temporarily unavailable. Choose another pack." : !wallet.configured ? "Sign-in is currently unavailable." : wallet.authenticated && !accepted ? "Confirm the pack details below to continue." : !wallet.authenticated ? "Continue with your email to buy." : `${budgetCents ? money(budgetCents) : "—"} AUSD · ${pack?.cardCount ?? 3} predictions`}</p>
            {sandbox && capabilities?.paymentEnabled && !capabilities.enabledPackIds?.includes(category) && capabilities.enabledPackIds?.includes("mixed") && <Link className="text-button" href={`/category/mixed?amount=${dollars ?? 20}`}>Buy an available Chaos pack →</Link>}
          </aside>
        </div>
      </section>

      {connectionError && <p className="error" role="alert">{connectionError} <button className="text-button" disabled={connectionLoading} onClick={retryConnection}>Retry connection</button></p>}
      <section className="category-checkout">
        {wallet.error && <p className="error" role="alert">{wallet.error}</p>}
        {wallet.authenticated ? (
          <div className="purchase-details">
            <div className="purchase-account"><span className="wallet-status"/><span>Buying with your account{wallet.address ? ` · ${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}` : ""}</span></div>
            <>
              <details><summary>Pack details · {budgetCents ? money(budgetCents) : "—"} AUSD · {pack?.cardCount ?? 3} predictions</summary><p>{DISCLOSURE}</p><p>Your budget is split across three positions. No platform fee.</p></details>
              <label className="disclosure"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} disabled={checkoutActivity.busy}/><span>I accept random markets and YES/NO positions within my selected budget.</span></label>
            </>
          </div>
        ) : null}
        <p className="demo-note">Testnet only · AUSD on Ethereum Sepolia · Test assets have no real monetary value.</p>
      </section>

      <TestnetCheckout key={`${wallet.userId}:${wallet.address}:${category}`} packId={category} budgetCents={budgetCents} accepted={accepted} availability={availability} actionRef={checkoutAction} onActivity={setCheckoutActivity}/>

    </main>
  );
}
