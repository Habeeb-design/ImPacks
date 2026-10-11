"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DISCLOSURE, DISCLOSURE_VERSION, type Opening, type Pack, type Quote, type Session } from "@impacks/contracts";
import { api, ApiError } from "./lib/api";
import { PackTile } from "./components/PackTile";
import { PredictionCard } from "./components/PredictionCard";

const sessionKey = "impacks.demo.session";
const attemptKey = "impacks.demo.attempt";
type Attempt = { userId: string; quote: Quote; key: string };
function readStored<T>(key: string): T | null {
  try { return JSON.parse(sessionStorage.getItem(key) ?? "null") as T | null; } catch { return null; }
}
export function App() {
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
    try { await api.logout(session.token); clearSession(); }
    catch (cause) { showError(cause); }
    finally { setBusy(false); }
  }

  return <main>
    <header><a className="logo" href="/">im<span>packs</span><sup>✳</sup></a><div className="account"><span className="badge">LOCAL DEMO</span>{session && <button className="text-button" onClick={() => void logout()} disabled={busy}>{session.user.displayName} · Log out</button>}</div></header>
    <section className="intro"><p className="eyebrow">A LITTLE CHANCE. A NEW PERSPECTIVE.</p><h1>Big questions.<br/><span>Small packs.</span></h1><p>Pick your world. Rip a pack. Discover your next three predictions.</p></section>
    <p className="demo-note">Development preview · Payments and trades are simulated. No money moves.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {!session ? <form className="login-panel" onSubmit={event => void login(event)}><div><h2>Your next prediction starts here.</h2><p>Use a display name to explore the demo.</p></div><label>Your name<input value={name} onChange={event => setName(event.target.value)} required maxLength={40} autoComplete="nickname" placeholder="Enter your name"/></label><button className="primary" disabled={busy || !name.trim()}>{busy ? "Logging in…" : "Enter demo →"}</button></form> : <>
      <section aria-labelledby="packs-title"><div className="section-heading"><h2 id="packs-title">Choose your pack</h2><span>3 cards · 15 demo AUSD</span></div><div className="pack-grid">{packs.map(p => <PackTile key={p.id} pack={p} selected={selected === p.id} disabled={busy || !!attempt} onSelect={() => { setSelected(p.id); setAccepted(false); }}/>)}</div></section>
      <section className="checkout"><label className="disclosure"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} disabled={busy}/><span>{DISCLOSURE}<br/><strong>15 demo AUSD total · 5 per card · no platform fee.</strong></span></label><button className="primary" onClick={() => void openPack()} disabled={!accepted || busy || !pack}>{busy ? "Opening your pack…" : attempt ? "Retry same opening →" : "Open pack · 15 demo AUSD →"}</button>{attempt && <small>Retrying preserves your original pack and avoids another payment attempt.</small>}</section>
      <section aria-labelledby="collection-title"><div className="section-heading"><h2 id="collection-title">Your collection</h2><span>{openings.length} packs opened</span></div>{openings.length === 0 ? <p className="empty">A fresh collection. Your first three cards are waiting.</p> : openings.map(opening => <div className="opening" key={opening.id}><div className="section-heading"><h3>{opening.packName}</h3><span>{opening.status} · payment {opening.payment.status}</span></div><div className="card-grid">{opening.cards.map(card => <PredictionCard key={card.id} card={card}/>)}</div></div>)}</section>
    </>}
    <footer>ImPacks / Hackathon starter <span>AUSD payments + Gemini Predictions integration points</span></footer>
  </main>;
}
