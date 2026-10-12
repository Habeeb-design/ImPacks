"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Opening } from "@impacks/contracts";
import { createOpeningMotion } from "../lib/opening-motion";
import { openingTiming, openingPhase } from "../lib/opening-timeline";
import { PredictionCard } from "./PredictionCard";
import styles from "./PackOpeningReveal.module.css";
import { categoryCopy, type CategoryId } from "../lib/category";

const palettes = {
  crypto: ["#edb63e", "#a75a11", "#fff2bf"],
  sports: ["#50aaff", "#254ec8", "#c6ebff"],
  mixed: ["#b275f8", "#6424b0", "#eee0ff"],
  politics: ["#ec7b7b", "#923c58", "#ffe2e2"],
  economics: ["#66b79a", "#216d53", "#d7f5e6"],
  commodities: ["#e3b658", "#986322", "#fff1d0"],
  business: ["#6b9cd6", "#305985", "#e0edff"],
  culture: ["#e88ec7", "#91376f", "#ffe2f3"],
  tech: ["#93c54c", "#4b7221", "#eaf8d1"],
  weather: ["#6ebdcf", "#316b91", "#dff7ff"],
} as const;
type Controls = { toggle(): void; skip(): void; replay(): void };

// Presentation only: replay/skip never request a quote, payment, or new selection.
export function PackOpeningReveal({ opening, category, onClose, paymentAction }: {
  opening: Opening; category: CategoryId; onClose(): void;
  paymentAction?: { label: string; onClick(): void };
}) {
  const dialog = useRef<HTMLDialogElement>(null), scene = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null);
  const controls = useRef<Controls | null>(null);
  const [playing, setPlaying] = useState(true), [complete, setComplete] = useState(false);
  const [status, setStatus] = useState("Preparing your pack…");
  const palette = palettes[category];
  const genre = categoryCopy[category].genre;

  useEffect(() => {
    const modal=dialog.current!, root=scene.current!, windowEl=viewport.current!;
    const previouslyFocused=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.showModal();
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const duration=openingTiming(opening.cards.length).duration;
    let render: ((time: number)=>void) | undefined;
    let active=true, frame=0, time=0, last=0, running=false;
    const resize = () => {
      if (!windowEl.clientWidth) return;
      const scale=Math.min(1,Math.max(0.4,(window.innerHeight-190)/700));
      root.style.width=`${windowEl.clientWidth/scale}px`;
      root.dataset.scale=String(scale);
      root.style.transform=`translateX(-50%) scale(${scale})`;
      windowEl.style.height=`${700*scale}px`;
      render?.(time);
    };
    const observer=new ResizeObserver(resize);observer.observe(windowEl);window.addEventListener('resize',resize);resize();
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const paint = () => {
      render?.(time); setStatus(openingPhase(time,opening.cards.length));
      setComplete(time>=duration); setPlaying(running);
    };
    const stop = () => { running=false;cancelAnimationFrame(frame); };
    const skip = () => { stop(); time=duration;paint(); };
    const tick = (now: number) => {
      if (!active||!running) return;
      time=Math.min(duration,time+Math.min(now-last,64));last=now;
      if(time>=duration)running=false;
      paint(); if(running)frame=requestAnimationFrame(tick);
    };
    const play = () => {
      if(reduced.matches){skip();return;}
      if(!render)return;
      running=true;last=performance.now();paint();frame=requestAnimationFrame(tick);
    };
    controls.current={skip,toggle(){if(running){stop();paint();}else play();},replay(){stop();time=0;windowEl.scrollTop=0;play();}};
    const preferenceChanged=()=>{if(reduced.matches)skip();};
    reduced.addEventListener('change',preferenceChanged);
    // Failed/unsupported visual assets never prevent access to the returned cards.
    void createOpeningMotion(root,palette).then(draw=>{
      if(!active)return;render=draw;
      if(time>=duration||reduced.matches)skip();else play();
    }).catch(()=>{if(active)skip();});
    return () => {
      active=false;stop();controls.current=null;
      reduced.removeEventListener('change',preferenceChanged);observer.disconnect();window.removeEventListener('resize',resize);
      document.body.style.overflow=previousOverflow;modal.close();previouslyFocused?.focus();
    };
  }, [opening.id, opening.cards.length, palette]);

  useEffect(() => {
    if (!dialog.current) return;
    dialog.current.scrollTop = 0;
    if (complete) dialog.current.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [complete]);

  const vars = { "--op-aura":palette[0], "--op-deep":palette[1], "--op-soft":palette[2] } as CSSProperties;
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="pack-reveal-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <header className={styles.header}><h2 id="pack-reveal-title" tabIndex={-1}>{genre} · {opening.cards.length} cards</h2><button type="button" onClick={onClose} aria-label="Close opening">×</button></header>
    <div ref={viewport} className={styles.viewport} hidden={complete} aria-hidden="true">
      <div ref={scene} className={styles.scene} style={vars}>
        <div className="op-stage">
          <div className="op-floor"/><div className="op-aura"/><div className="op-rays"/>
          <div className="op-particles">{Array.from({length:20},(_,i)=><span key={i} className="op-particle"/>)}</div>
          {opening.cards.map((card,index)=><div key={card.id} className="op-card-lift"><div className="op-card-turn">
            <div className="op-card-back"><span>IMPACKS</span><strong>IM</strong><small>DISCOVER WHAT’S INSIDE</small></div>
            <div className="op-card-front">
              <div className="op-card-veil"><span>IMPACKS</span><strong>IM</strong><small>DISCOVER WHAT’S INSIDE</small></div>
              <div className="op-card-art"><span className="op-card-series">{genre.toUpperCase()} / {String(index+1).padStart(3,"0")}</span><span className="op-coin">{category === "crypto" ? "₿" : category === "sports" ? "✦" : "∞"}</span><span className="op-rarity-label">{card.side}</span></div>
              <div className="op-card-copy"><h3>{card.question}</h3><span>{card.order.status} · {card.order.quantity} contracts</span></div>
            </div>
          </div></div>)}
          <div className="op-pack"><div className="op-pack-body op-wrapper-image"/><canvas className="op-foil-mesh" width={1080} height={1000}/></div>
        </div>
      </div>
    </div>
    {complete && <div className={styles.results} role="region" aria-label="Revealed cards" tabIndex={0} style={{ "--result-columns": Math.min(4,Math.max(1,opening.cards.length)) } as CSSProperties}>{opening.cards.map(card=><PredictionCard key={card.id} card={card} mode={opening.mode}/>)}</div>}
    <footer className={styles.footer}><div><p className={styles.disclosure}>{opening.mode === "demo" ? "Simulated payments and trades" : "Testnet opening"}</p><p className={styles.disclosure}>{opening.status} · payment {opening.payment.status}</p><span className={styles.srOnly} role="status">{status}</span></div><div className={styles.actions}>
      {complete ? <><button type="button" onClick={()=>controls.current?.replay()}>Replay opening</button>{paymentAction ? <button type="button" onClick={paymentAction.onClick}>{paymentAction.label}</button> : <Link href={`/dashboard?opening=${encodeURIComponent(opening.id)}`} onClick={onClose}>View collection ↗</Link>}</> : <><button type="button" onClick={()=>controls.current?.toggle()}>{playing ? "Pause" : "Resume"}</button><button type="button" onClick={()=>controls.current?.skip()}>Reveal all ↗</button></>}
    </div></footer>
  </dialog>;
}
