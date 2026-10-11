"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DISCLOSURE, DISCLOSURE_VERSION, type Opening, type Pack, type Quote, type Session } from "@impacks/contracts";
import { api, ApiError } from "./lib/api";
import { PackCarousel } from "./components/PackCarousel";
import { LandingHero } from "./components/LandingHero";
import { WalletAccount } from "./components/WalletAccount";
import { PredictionCard } from "./components/PredictionCard";

const sessionKey = "impacks.demo.session";
const attemptKey = "impacks.demo.attempt";
type Attempt = { userId: string; quote: Quote; key: string };
function readStored<T>(key: string): T | null {
  try { return JSON.parse(sessionStorage.getItem(key) ?? "null") as T | null; } catch { return null; }
}
export function App({ landing = false }: { landing?: boolean }) {
  const [session, setSession] = useState<Session | null>(null);
  const [name, setName] = useState("");
  const [packs, setPacks] = useState<Pack[]>([]);
  const [selected, setSelected] = useState("crypto");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const pack = packs.find(p => p.id === selected);

  function clearSession() {
    sessionStorage.removeItem(sessionKey); sessionStorage.removeItem(attemptKey);
    setSession(null); setAttempt(null); setOpenings([]); setAccepted(false);
  }
  function showError(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 401) clearSession();
    setError(cause instanceof Error ? cause.message : "Something went wrong.");
  }
  useEffect(() => {
    // Read browser storage after hydration; server and initial client markup must match.
    setSession(readStored<Session>(sessionKey));
    setAttempt(readStored<Attempt>(attemptKey));
    void api.packs().then(result => setPacks(result.packs)).catch(showError);
  }, []);
  useEffect(() => {
    if (session) void api.portfolio(session.token).then(result => setOpenings(result.openings)).catch(showError);
  }, [session]);

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const next = await api.login(name);
      sessionStorage.setItem(sessionKey, JSON.stringify(next)); setSession(next);
    } catch (cause) { showError(cause); } finally { setBusy(false); }
  }
  async function openPack() {
    if (!session || !pack || !accepted || busy) return;
    setBusy(true); setError("");
    try {
      const current = attempt?.userId === session.user.id ? attempt : {
        userId: session.user.id, quote: await api.quote(session.token, pack.id), key: crypto.randomUUID(),
      };
      setAttempt(current); sessionStorage.setItem(attemptKey, JSON.stringify(current));
      if (current.quote.payment.mode !== "demo") throw new Error("The wallet payment flow is not connected yet.");
      const result = await api.open(session.token, {
        quoteId: current.quote.id, disclosureVersion: DISCLOSURE_VERSION, paymentProof: `demo:${current.quote.id}`,
      }, current.key);
      setOpenings(previous => [result, ...previous.filter(o => o.id !== result.id)]);
      setAttempt(null); sessionStorage.removeItem(attemptKey);
    } catch (cause) {
      // Network/unknown errors retain the key across retries and reloads.
      if (cause instanceof ApiError && ["QUOTE_EXPIRED", "QUOTE_NOT_FOUND", "INSUFFICIENT_MARKETS"].includes(cause.code)) {
        setAttempt(null); sessionStorage.removeItem(attemptKey);
      }
      showError(cause);
    } finally { setBusy(false); }
  }
  async function logout() {
    if (!session) return;
    setBusy(true);
    try { await api.logout(session.token); clearSession(); if (session.user.id.startsWith("did:privy:")) window.location.assign("/login?logout=1"); }
    catch (cause) { showError(cause); }
    finally { setBusy(false); }
  }

  return <main>
    <header className="site-header app-header"><a className="logo" href="/">im<span>packs</span><sup>®</sup></a><nav aria-label="Main navigation"><a href="/">Home</a><a href="/packs">Packs</a><a href="/dashboard">Dashboard</a></nav><div className="account"><WalletAccount/>{session && !session.user.id.startsWith("did:privy:") && <button className="text-button demo-logout" onClick={() => void logout()} disabled={busy}>Sign out</button>}</div></header>
    {landing ? <LandingHero/> : <section className="pack-page-intro"><p className="eyebrow">A SURPRISE WORTH FOLLOWING</p><h1>Pick your world.</h1><p>One pack. Three predictions. See where they take you.</p></section>}
    {error && <p className="error" role="alert">{error}</p>}
    {packs.length > 0 ? <PackCarousel packs={packs} selected={selected} disabled={busy || !!attempt} onSelect={id => { setSelected(id); setAccepted(false); }} /> : <p className="catalog-loading" role="status">{error ? "The pack catalog is unavailable. Please refresh to try again." : "Unwrapping the collection…"}</p>}
    {!landing && <><section id="checkout" className="checkout-area">
      <p className="demo-note">Payments and trades are simulated. No money moves. Sessions may reset.</p>
      {!session ? <form className="login-panel" onSubmit={event => void login(event)}><div><p className="eyebrow">YOUR FIRST PACK IS WAITING</p><h2>Let curiosity take over.</h2><p>Choose a display name to explore packs.</p></div><label>Your name<input value={name} onChange={event => setName(event.target.value)} required maxLength={40} autoComplete="nickname" placeholder="Enter your name"/></label><button className="primary" disabled={busy || !name.trim()}>{busy ? "Logging in…" : "Explore packs →"}</button></form> : <section className="checkout" aria-labelledby="checkout-title"><div><p className="eyebrow">YOUR NEXT THREE PREDICTIONS</p><h2 id="checkout-title">{attempt?.quote.pack.name ?? pack?.name ?? "Choose a pack"}</h2></div><label className="disclosure"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} disabled={busy}/><span>{DISCLOSURE}<br/><strong>15 AUSD total · 5 per card · no platform fee.</strong></span></label><button className="primary" onClick={() => void openPack()} disabled={!accepted || busy || !pack}>{busy ? "Opening your pack…" : attempt ? "Retry same opening →" : "Open pack · 15 AUSD →"}</button>{attempt && <small>Retrying preserves your original pack and avoids another payment attempt.</small>}</section>}
    </section>
    {session && <section id="collection" aria-labelledby="collection-title"><div className="section-heading"><h2 id="collection-title">Your collection</h2><span>{openings.length} packs opened</span></div>{openings.length === 0 ? <p className="empty">A fresh collection. Your first three cards are waiting.</p> : openings.map(opening => <div className="opening" key={opening.id}><div className="section-heading"><h3>{opening.packName}</h3><span>{opening.status} · payment {opening.payment.status}</span></div><div className="card-grid">{opening.cards.map(card => <PredictionCard key={card.id} card={card}/>)}</div></div>)}</section>}
    </>}
    <section className="how-section" id="how" aria-labelledby="how-title"><p className="eyebrow">A LITTLE CHANCE. A NEW PERSPECTIVE.</p><h2 id="how-title">First, reveal your bets. Then, follow the story.</h2><div className="how-steps"><div><span>01</span><h3>Choose your world.</h3><p>Crypto, sports, or a mix of both. Follow whatever catches your curiosity.</p></div><div><span>02</span><h3>Reveal your positions.</h3><p>Three randomly selected markets. Random YES or NO sides. Review the budget before opening.</p></div><div><span>03</span><h3>Follow what happens.</h3><p>See what needs to happen, your YES or NO side, what you spent, and what a win could pay.</p></div></div><p className="chance-note">Random selection changes which bets you get. It doesn’t improve their odds.</p></section>
    <footer><span>imPacks / Gamble on gambling.</span><span>Payments and trades are simulated</span></footer>
  </main>;
}
