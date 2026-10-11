"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DISCLOSURE, type Pack } from "@impacks/contracts";
import { api } from "../lib/api";
import { useDemoSession } from "../lib/session";
import { categoryCopy, dollarsToCents, money, priceTiers, snapCustomDollars, tableCardCount, tableOverflow, type CategoryId } from "../lib/category";
import { CardSpread } from "./CardSpread";
import { PredictionCard } from "./PredictionCard";
import { WalletAccount } from "./WalletAccount";

export function CategoryPack({ category }: { category: CategoryId }) {
  const shop = useDemoSession();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [tier, setTier] = useState<20 | 50 | 100 | "custom">(20);
  const [customText, setCustomText] = useState("75");
  const copy = categoryCopy[category];
  const pack = packs.find(item => item.id === category);
  const dollars = tier === "custom" ? snapCustomDollars(customText) : tier;
  const budgetCents = dollars === null ? null : dollarsToCents(dollars);
  const spread = dollars === null ? 5 : tableCardCount(dollars);
  const latest = shop.openings[0];

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
      <header className="site-header">
        <Link className="logo" href="/">im<span>packs</span><sup>®</sup></Link>
        <nav aria-label="Main navigation">
          <Link href="/">Home</Link>
          <Link href="/packs">Packs</Link>
          <Link href="/category/crypto">Crypto</Link>
          <Link href="/category/sports">Sports</Link>
          <Link href="/category/mixed">Chaos</Link>
        </nav>
        <div className="account">
          <WalletAccount />
          {shop.session && !shop.session.user.id.startsWith("did:privy:") && (
            <button className="text-button demo-logout" onClick={() => void shop.logout()} disabled={shop.busy}>Sign out</button>
          )}
        </div>
      </header>

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
              <button key={amount} type="button" className={`price-chip ${tier === amount ? "selected" : ""}`} onClick={() => setTier(amount)}>
                <span>${amount}</span>
              </button>
            ))}
            <div className={`price-chip custom ${tier === "custom" ? "selected" : ""}`}>
              <label>
                Custom
                <input
                  inputMode="decimal"
                  value={customText}
                  onChange={event => { setCustomText(event.target.value); setTier("custom"); }}
                  onBlur={applyCustom}
                  aria-label="Custom pack amount in dollars, from 20 to 250 in steps of 5"
                />
              </label>
            </div>
          </aside>
        </div>
      </section>

      {shop.error && <p className="error" role="alert">{shop.error}</p>}
      <section className="category-checkout">
        <p className="demo-note">Payments and trades are simulated. No money moves. Sessions may reset.</p>
        {!shop.session ? (
          <form className="login-panel" onSubmit={event => void shop.login(event)}>
            <div><p className="eyebrow">OPEN THIS PACK</p><h2>Sign in to buy {copy.title}.</h2><p>Choose a display name to explore this category.</p></div>
            <label>Your name<input value={shop.name} onChange={event => shop.setName(event.target.value)} required maxLength={40} autoComplete="nickname" placeholder="Enter your name"/></label>
            <button className="primary" disabled={shop.busy || !shop.name.trim()}>{shop.busy ? "Signing in…" : "Continue →"}</button>
          </form>
        ) : (
          <div className="checkout">
            <label className="disclosure">
              <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} disabled={shop.busy} />
              <span>{DISCLOSURE}<br/><strong>{budgetCents ? `${money(budgetCents)} AUSD total · split across ${pack?.cardCount ?? 3} cards · no platform fee.` : "Enter a valid custom amount."}</strong></span>
            </label>
            <button
              className="primary"
              onClick={() => { if (budgetCents) void shop.openPack(category, accepted, budgetCents); }}
              disabled={!accepted || shop.busy || !pack || budgetCents === null}
            >
              {shop.busy ? "Opening your pack…" : shop.attempt?.quote.pack.budgetCents === budgetCents ? "Retry same opening →" : `Open ${copy.title} pack · ${budgetCents ? money(budgetCents) : "—"} AUSD →`}
            </button>
            {shop.attempt && shop.attempt.quote.pack.budgetCents === budgetCents && <small>Retrying preserves your original pack and avoids another payment attempt.</small>}
          </div>
        )}
      </section>

      {latest && latest.packName.startsWith(pack?.name ?? "___") && (
        <section className="opening" aria-labelledby="opened-title">
          <div className="section-heading">
            <h2 id="opened-title">{latest.packName}</h2>
            <span>{latest.status} · payment {latest.payment.status}</span>
          </div>
          <div className="card-grid">{latest.cards.map(card => <PredictionCard key={card.id} card={card} />)}</div>
        </section>
      )}
    </main>
  );
}
