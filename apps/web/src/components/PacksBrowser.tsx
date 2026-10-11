"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Pack } from "@impacks/contracts";
import { api } from "../lib/api";
import { genreGroups, groupMarketGenres, matchingGenres, type GenreGroup } from "../lib/genres";
import { PackArtwork } from "./PackArtwork";
import styles from "./PacksBrowser.module.css";

type Discovery = Awaited<ReturnType<typeof api.marketCategories>>;

export function PacksBrowser({ compact = false }: { compact?: boolean }) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [discoveryError, setDiscoveryError] = useState("");
  const [group, setGroup] = useState<GenreGroup>("All editions");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("crypto");
  const [rotating, setRotating] = useState(false);
  const [paused, setPaused] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    setLoading(true); setCatalogError(""); setDiscoveryError("");
    const [catalog, markets] = await Promise.allSettled([api.packs(), api.marketCategories()]);
    if (catalog.status === "fulfilled") setPacks(catalog.value.packs);
    else { setPacks([]); setCatalogError("Pack availability couldn’t load."); }
    if (markets.status === "fulfilled") setDiscovery(markets.value);
    else { setDiscovery(null); setDiscoveryError("Gemini genres are unavailable right now."); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const genres = groupMarketGenres(discovery?.categories ?? [], packs);
  const filtered = matchingGenres(genres, group, search);
  const current = filtered.find(genre => genre.id === selected) ?? filtered[0];
  const currentPack = packs.find(pack => pack.id === current?.packId);
  const currentIndex = current ? filtered.findIndex(genre => genre.id === current.id) : 0;
  const liveCategories = current?.providerCategories.filter(category => discovery?.categories.some(value => value.toLowerCase() === category.toLowerCase())) ?? [];

  const selectIndex = useCallback((index: number) => {
    const genre = filtered[(index + filtered.length) % filtered.length];
    if (!genre) return;
    setSelected(genre.id);
    const element = rail.current?.querySelector<HTMLElement>(`[data-genre="${genre.id}"]`);
    if (element && rail.current) rail.current.scrollTo({ left: element.offsetLeft - rail.current.offsetLeft - (rail.current.clientWidth - element.clientWidth) / 2, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [filtered]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => { if (media.matches) setRotating(false); };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!rotating || paused || filtered.length < 2) return;
    const timer = window.setTimeout(() => selectIndex(currentIndex + 1), 4200);
    return () => clearTimeout(timer);
  }, [rotating, paused, filtered.length, currentIndex, selectIndex]);

  function reset() { setGroup("All editions"); setSearch(""); setRotating(false); }

  return <section className={`${styles.browser} ${compact ? styles.compact : ""}`} id="packs" aria-labelledby="editions-title">
    <div className={styles.heading}>
      <p className="eyebrow">A WORLD INSIDE EVERY WRAPPER</p>
      {compact ? <h2 id="editions-title">Find your kind of chance.</h2> : <h1 id="editions-title">Every obsession.<br/><span>An edition.</span></h1>}
      <p>Choose a world you love. Discover a reason to follow it.</p>
    </div>
    <div className={styles.toolbar}>
      <div className={styles.filters} role="group" aria-label="Edition groups">{genreGroups.map(value => <button key={value} aria-pressed={group === value} onClick={() => { setGroup(value); setRotating(false); rail.current?.scrollTo({left:0}); }}>{value}</button>)}</div>
      <label className={styles.search}><span aria-hidden="true">⌕</span><input aria-label="Search editions or topics" placeholder="Find your world" value={search} onChange={event => { setSearch(event.target.value); setRotating(false); }}/>{search && <button aria-label="Clear search" onClick={() => setSearch("")}>×</button>}</label>
    </div>
    {(catalogError || discoveryError) && <div className={styles.error} role="status"><span>{catalogError} {discoveryError} {discoveryError && "Only confirmed pack catalog entries are shown."}</span><button onClick={() => void load()} disabled={loading}>Try again</button></div>}
    {loading && genres.length === 0 ? <p className={styles.empty} role="status">Unwrapping the editions…</p> : filtered.length === 0 ? <div className={styles.empty}><h3>No editions found.</h3><p>Try another topic or explore all editions.</p><button className="secondary" onClick={reset}>Reset filters</button></div> : <>
      <div className={styles.rail} ref={rail} aria-roledescription="carousel" aria-label="Pack editions"
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onPointerDown={() => setRotating(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={event => {if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);}}
        onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); setRotating(false); selectIndex(currentIndex + (event.key === "ArrowRight" ? 1 : -1)); } }}>
        {filtered.map((genre, index) => {
          const pack = packs.find(item => item.id === genre.packId);
          const className = `${styles.edition} ${current?.id === genre.id ? styles.selected : ""}`;
          const content = <>
            <span className={styles.editionTitle}>{genre.name}<span aria-hidden="true">{pack ? "↗" : "+"}</span></span>
            <span className={styles.artwork}><PackArtwork genre={genre.name}/></span>
            <span className={styles.editionStatus}>{pack ? "Explore pack" : "Preview edition"}</span>
          </>;
          return pack ? <Link key={genre.id} data-genre={genre.id} className={className} href={`/category/${pack.theme}`} aria-label={`Open ${genre.name} pack`} onClick={() => setRotating(false)}>{content}</Link>
            : <button key={genre.id} data-genre={genre.id} className={className} aria-pressed={current?.id === genre.id} aria-label={`Preview ${genre.name} edition`} onClick={() => { setRotating(false); selectIndex(index); }}>{content}</button>;
        })}
      </div>
      <div className={styles.controls}><span>{String(currentIndex + 1).padStart(2, "0")} <span>/ {String(filtered.length).padStart(2, "0")}</span></span><div><button onClick={() => { setRotating(false); selectIndex(currentIndex - 1); }} aria-label="Previous edition">←</button><button className={styles.rotate} onClick={() => setRotating(value => !value)}>{rotating ? "Pause slideshow" : "Play slideshow"}</button><button onClick={() => { setRotating(false); selectIndex(currentIndex + 1); }} aria-label="Next edition">→</button></div></div>
      {current && <div className={styles.detail} aria-live="polite">
        <div><p className="eyebrow">{current.group.toUpperCase()}</p><h2>{current.name} edition<span>®</span></h2><p>{current.description}</p><div className={styles.topics}>{current.topics.map(topic => <span key={topic}>{topic}</span>)}</div></div>
        <div className={styles.detailAction}>{currentPack ? <><span className={styles.available}><i/> {currentPack.cardCount} cards inside</span><Link className="primary" href={`/category/${currentPack.theme}`}>Explore {current.name} pack <span aria-hidden="true">↗</span></Link><small>Choose your AUSD budget next.<br/>Payments and positions are simulated.</small></> : <><span className={styles.preview}>On the horizon</span><p>This genre is on Gemini. Its ImPacks edition isn’t available to open yet.</p><Link className="secondary" href="https://www.gemini.com/predictions" target="_blank" rel="noreferrer">Explore Gemini <span aria-hidden="true">↗</span></Link></>}
        {liveCategories.length > 0 && <small className={styles.provider}>Gemini categories: {liveCategories.join(" · ")}</small>}</div>
      </div>}
    </>}
    <div className={styles.note}><p>{discovery ? <>Genres from Gemini’s active category feed · checked {new Date(discovery.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Category availability does not mean an ImPacks edition is tradable.</> : "Pack catalog availability is separate from Gemini market discovery."}</p>{compact ? <Link href="/packs">All editions ↗</Link> : <Link href="/dashboard">Your collection ↗</Link>}</div>
  </section>;
}
