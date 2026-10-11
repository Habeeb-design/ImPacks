"use client";

import { useEffect, useRef, useState } from "react";
import type { Card, Opening } from "@impacks/contracts";
import { api, ApiError } from "../lib/api";
import { heldQuantity, cardStatus, closeAttemptStorageKey, collectionSummary, filterCollection, openingGenre, statusLabels, type CollectionFilter } from "../lib/collection";
import { usePackSession } from "../lib/session";
import { CheckoutHistory } from "./TestnetCheckout";
import { SiteHeader } from "./SiteHeader";
import { useAccountWallet } from "./WalletProvider";
import "./dashboard.css";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const date = (value: string) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const filters: { value: CollectionFilter; label: string }[] = [
  { value: "all", label: "All cards" }, { value: "open", label: "Open" }, { value: "closed", label: "Closed" },
  { value: "awaiting", label: "Awaiting" }, { value: "unfilled", label: "Not filled" },
];

function CardFace({ card, genre, index }: { card: Card; genre: string; index: number }) {
  const status = cardStatus(card);
  return <div className={`collector-face collector-${genre.toLowerCase()} collector-status-${status}`}>
    <div className="collector-card-top"><span>{genre} edition</span><span>#{String(index + 1).padStart(2, "0")}</span></div>
    <div className="collector-card-art" aria-hidden="true"><span>{card.side === "YES" ? "↗" : "↘"}</span><i/><i/><i/></div>
    <div className="collector-card-copy"><span className={`collector-side collector-side-${card.side.toLowerCase()}`}>{status === "open" ? "You hold" : status === "closed" ? "You held" : "Selected"} {card.side}</span><h3>{card.question}</h3></div>
    <div className="collector-card-bottom"><span>{statusLabels[status]}</span><span>{status === "open" || status === "closed" ? `${card.position?.remainingQuantity ?? card.order.quantity} contracts` : "No confirmed holding"}</span></div>
  </div>;
}

export function Dashboard() {
  const wallet = useAccountWallet();
  const { session, connecting, sessionError, retrySession, openings, openingsLoading, refreshPortfolio, updateOpening, error, showError } = usePackSession();
  const [filter, setFilter] = useState<CollectionFilter>("all");
  const [genre, setGenre] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ openingId: string; cardId: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [notice, setNotice] = useState("");
  const closeInFlight = useRef(false);
  const identity = useRef(wallet.userId);
  identity.current = wallet.authenticated ? wallet.userId : null;
  const dialog = useRef<HTMLDialogElement>(null);
  const summary = collectionSummary(openings);
  const genres = Array.from(new Set(openings.map(openingGenre))).sort();
  const groups = filterCollection(openings, filter, genre, search);
  const selectedOpening = openings.find(opening => opening.id === selected?.openingId);
  const selectedCard = selectedOpening?.cards.find(card => card.id === selected?.cardId);
  const selectedStatus = selectedCard ? cardStatus(selectedCard) : null;

  useEffect(() => {
    setSelected(null); setConfirming(false); setCloseError(""); setNotice("");
    setFilter("all"); setGenre("all"); setSearch("");
  }, [wallet.userId, wallet.authenticated]);
  useEffect(() => {
    if (selectedCard) {
      if (dialog.current && !dialog.current.open) dialog.current.showModal();
    } else dialog.current?.close();
  }, [selectedCard]);

  function inspect(opening: Opening, card: Card) {
    setSelected({ openingId: opening.id, cardId: card.id }); setConfirming(false); setCloseError(""); setNotice("");
  }
  function dismiss() { if (!closeInFlight.current) { setSelected(null); setConfirming(false); } }
  async function closePosition() {
    if (!session || !selectedOpening || selectedOpening.mode !== "demo" || !selectedCard || selectedStatus !== "open" || !confirming || closeInFlight.current) return;
    const owner = session.user.id;
    if (owner !== identity.current) return;
    const storageKey = closeAttemptStorageKey(owner, selectedOpening.id, selectedCard.id);
    closeInFlight.current = true; setClosing(true); setCloseError("");
    try {
      // Save before submitting: interrupted requests and reloads reuse the original identity.
      const key = sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
      sessionStorage.setItem(storageKey, key);
      const result = await api.closePosition(session.token, selectedOpening.id, selectedCard.id, key);
      if (identity.current !== owner) return;
      updateOpening(result, owner); sessionStorage.removeItem(storageKey); setConfirming(false);
      setNotice("Position closed. Your card stays in your collection.");
    } catch (cause) {
      if (identity.current === owner) {
        if (cause instanceof ApiError && cause.status === 401) { setSelected(null); showError(cause); }
        else setCloseError(cause instanceof Error ? cause.message : "Could not confirm the close. Retry uses the same request.");
      }
    } finally {
      closeInFlight.current = false; setClosing(false);
    }
  }

  return <main className="dashboard-page">
    <SiteHeader />
    <section className="collection-heading"><div><p className="eyebrow">YOUR PERSONAL CARD ROOM</p><h1>The collection.</h1><p>Every pack is a new story. Keep your cards. Follow your positions.</p></div><a className="primary" href="/packs">Open a pack <span aria-hidden="true">↗</span></a></section>

    {!wallet.configured ? <section className="collection-empty"><span className="empty-collection-mark" aria-hidden="true">▱</span><h2>Your collection is waiting.</h2><p>Account sign-in isn’t configured on this deployment yet.</p><a className="secondary" href="/packs">Explore packs</a></section>
      : connecting || !wallet.authReady ? <section className="collection-empty" role="status"><h2>Opening your card room…</h2><p>Connecting your account and collection.</p></section>
      : !wallet.authenticated ? <section className="collection-empty"><div className="collection-empty-fan" aria-hidden="true"><i/><i/><i/></div><p className="eyebrow">A COLLECTION THAT’S YOURS</p><h2>Good stories start with a pack.</h2><p>Sign in to see your revealed cards, follow open positions, and keep your favorite moments together.</p><a className="primary" href="/login?next=%2Fdashboard">Sign in to your collection <span aria-hidden="true">↗</span></a></section>
      : !session ? <section className="collection-empty"><h2>Let’s reconnect your collection.</h2><p role="alert">{sessionError || "Your account connection needs to be refreshed."}</p><button className="primary" onClick={retrySession}>Reconnect account</button></section>
      : <>
        <div className="collection-stats" aria-label="Collection summary">
          <div><span>Cards collected</span><strong>{summary.cards}<small>across {summary.packs} {summary.packs === 1 ? "pack" : "packs"}</small></strong></div>
          <div><span>Open positions</span><strong>{summary.open}<small>{summary.closed} kept after closing</small></strong></div>
          <div><span>Spent on open positions</span><strong>{money(summary.openSpentCents)}<small>simulated cost basis</small></strong></div>
          <div><span>If every open side wins</span><strong>{money(summary.conditionalGrossCents)}<small>conditional gross · includes stake</small></strong></div>
        </div>
        <p className="collection-data-note">Simulated positions. Values are not a live quote or wallet balance. Conditional payouts are not guaranteed; some outcomes may be mutually exclusive. Pack history resets when the service restarts. The optional paper marketplace keeps its own durable holdings; its totals include positions bought from other users.</p>
        <div className="collection-tools"><div className="collection-filters" aria-label="Position status">{filters.map(item => <button key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}<span>{item.value === "all" ? summary.cards : summary[item.value]}</span></button>)}</div><button className="collection-refresh" disabled={openingsLoading} onClick={() => void refreshPortfolio().catch(() => undefined)}>{openingsLoading ? "Refreshing…" : "Refresh collection"} <span aria-hidden="true">↻</span></button></div>
        <div className="collection-search-row"><label><span className="sr-only">Search your cards</span><span aria-hidden="true">⌕</span><input type="search" placeholder="Find a prediction in your collection" value={search} onChange={event => setSearch(event.target.value)}/></label><label><span className="sr-only">Filter by edition</span><select value={genre} onChange={event => setGenre(event.target.value)}><option value="all">Every edition</option>{genres.map(item => <option key={item} value={item}>{item} edition</option>)}</select></label></div>
        {error && <p className="collection-error" role="alert">{error} <button onClick={() => void refreshPortfolio().catch(() => undefined)}>Try again</button></p>}
        {openingsLoading && openings.length === 0 ? <section className="collection-empty" role="status"><h2>Finding your cards…</h2></section>
          : openings.length === 0 && !error ? <section className="collection-empty"><div className="collection-empty-fan" aria-hidden="true"><i/><i/><i/></div><h2>Your first edition is waiting.</h2><p>Open a pack and your three revealed cards will live here, ready to follow and manage.</p><a href="/packs" className="primary">Find your first pack <span aria-hidden="true">↗</span></a></section>
          : groups.length === 0 && !error ? <section className="collection-empty collection-empty-small"><h2>No cards in this view.</h2><p>Try another edition, status, or prediction.</p><button className="secondary" onClick={() => { setFilter("all"); setGenre("all"); setSearch(""); }}>Show every card</button></section>
          : <div className="collection-shelves">{groups.map(opening => <section className="collection-shelf" key={opening.id}><div className="collection-shelf-heading"><div><p className="eyebrow">{openingGenre(opening).toUpperCase()} EDITION</p><h2>{opening.packName}</h2><p>Opened {date(opening.createdAt)} <span>·</span> Pack {opening.id.slice(0, 8)}</p></div><span>{opening.cards.length} {opening.cards.length === 1 ? "card" : "cards"}{filter !== "all" || search ? " in this view" : " in this pack"}</span></div><div className="collector-grid">{opening.cards.map(card => {
            const original = openings.find(item => item.id === opening.id)!;
            const status = cardStatus(card);
            return <button className="collector-item" key={card.id} onClick={() => inspect(original, card)} aria-label={`View ${card.side}: ${card.question}. ${statusLabels[status]}`}><CardFace card={card} genre={openingGenre(opening)} index={original.cards.findIndex(item => item.id === card.id)}/><div className="collector-item-meta"><span>{status === "open" ? `${money(card.position?.costBasisCents ?? card.order.spentCents)} remaining basis` : status === "closed" ? card.position?.remainingQuantity !== undefined ? "Transferred · see Trade" : `${money(card.position?.proceedsCents ?? 0)} returned (simulated)` : statusLabels[status]}</span><span>{status === "open" ? "Manage position" : "View card"} <b aria-hidden="true">↗</b></span></div></button>;
          })}</div></section>)}</div>}
      </>}

    {wallet.authenticated && <CheckoutHistory key={`${wallet.userId}:${wallet.address}`}/>}

    <dialog className="collection-detail" aria-label="Prediction card details" ref={dialog} onCancel={event => { if (closing) event.preventDefault(); else dismiss(); }} onClose={dismiss}>
      {selectedCard && selectedOpening && selectedStatus && <><button className="collection-detail-dismiss" aria-label="Close card details" disabled={closing} onClick={dismiss}>×</button><div className="collection-detail-layout"><CardFace card={selectedCard} genre={openingGenre(selectedOpening)} index={selectedOpening.cards.findIndex(card => card.id === selectedCard.id)}/><div className="collection-detail-info"><p className="eyebrow">{statusLabels[selectedStatus].toUpperCase()}</p><h2>Your {selectedCard.side} card.</h2><p>{selectedCard.side === "YES" ? "Your side wins if this market resolves YES." : "Your side wins if this market resolves NO."} Resolution follows the market’s rules.</p><dl><div><dt>Contracts {selectedStatus === "closed" ? "closed" : "filled"}</dt><dd>{selectedStatus === "open" || selectedStatus === "closed" ? selectedCard.order.quantity : "—"}</dd></div><div><dt>Simulated amount spent</dt><dd>{money(selectedCard.order.spentCents)}</dd></div><div><dt>Entry price per contract</dt><dd>{money(selectedCard.priceCents)}</dd></div><div><dt>{selectedStatus === "closed" ? "Simulated close proceeds" : "Gross payout if your side wins"}</dt><dd>{selectedStatus === "closed" ? selectedCard.position?.remainingQuantity !== undefined ? "See trade history" : money(selectedCard.position?.proceedsCents ?? 0) : selectedStatus === "open" ? money(heldQuantity(selectedCard) * 100) : "—"}</dd></div></dl>
      {selectedStatus === "open" && <p className="collection-detail-note">Conditional gross payout includes your stake. It is not a current valuation or a guaranteed return. Closing ends exposure to this outcome.</p>}
      {selectedStatus === "closed" && selectedCard.position?.remainingQuantity === undefined && <p className="collection-detail-note">Closed {selectedCard.position?.closedAt ? date(selectedCard.position.closedAt) : "previously"}. This card stays in your collection; it no longer pays if the outcome wins.</p>}
      {(selectedStatus === "awaiting" || selectedStatus === "unfilled") && <p className="collection-detail-note">{selectedCard.order.message || "This order has no confirmed holding. It cannot be closed or counted as an open position."}</p>}
      {notice && <p className="collection-success" role="status">{notice}</p>}{closeError && <p className="collection-error" role="alert">{closeError} Retrying preserves the original request.</p>}
      {selectedStatus === "open" && selectedOpening.mode === "demo" && selectedCard.position?.remainingQuantity === undefined && (confirming ? <div className="collection-confirm"><strong>Close all {selectedCard.order.quantity} contracts?</strong><p>This is a simulated close at the service’s fixture price. No Gemini trade is submitted and no AUSD moves. Final proceeds appear after confirmation. Your collectible card stays.</p><button className="primary" disabled={closing} onClick={() => void closePosition()}>{closing ? "Confirming close…" : closeError ? "Retry simulated close" : "Confirm simulated close"}</button><button className="text-button" disabled={closing} onClick={() => { setConfirming(false); setCloseError(""); }}>Keep position open</button></div> : <button className="primary collection-close-position" onClick={() => setConfirming(true)}>Close position <span aria-hidden="true">↗</span></button>)}
      {selectedCard.position?.remainingQuantity !== undefined && <p className="collection-detail-note">You currently own {selectedCard.position.remainingQuantity} contracts from this fill. <a href="/marketplace">Manage current holdings and resale proceeds in Trade →</a></p>}
      {selectedStatus === "open" && selectedOpening.mode !== "demo" && <p className="collection-detail-note">Position closing is not connected for sandbox execution yet.</p>}
      <p className="collection-detail-note">{selectedOpening.mode === "demo" ? "Simulated execution" : "Sandbox execution"} · Opened {date(selectedOpening.createdAt)}</p></div></div></>}
    </dialog>
    <footer className="collection-footer"><span>Collect the moments. Follow the outcomes.</span><a href="/packs">Find your next edition ↗</a></footer>
  </main>;
}
