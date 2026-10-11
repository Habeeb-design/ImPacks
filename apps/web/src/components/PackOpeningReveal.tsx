"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Opening } from "@impacks/contracts";
import { createOpeningMotion } from "../lib/opening-motion";
import { OPENING_DURATION, openingPhase } from "../lib/opening-timeline";
import { PredictionCard } from "./PredictionCard";
import styles from "./PackOpeningReveal.module.css";

const palettes = {
  crypto: ["#edb63e", "#a75a11", "#fff2bf"],
  sports: ["#50aaff", "#254ec8", "#c6ebff"],
  mixed: ["#b275f8", "#6424b0", "#eee0ff"],
} as const;
type Controls = { toggle(): void; skip(): void; replay(): void };

// Presentation only: replay/skip never request a quote, payment, or new selection.
export function PackOpeningReveal({ opening, category, onClose }: {
  opening: Opening; category: keyof typeof palettes; onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), scene = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null);
  const controls = useRef<Controls | null>(null);
  const [playing, setPlaying] = useState(true), [complete, setComplete] = useState(false);
  const [status, setStatus] = useState("Preparing your pack…");
  const palette = palettes[category];
  const genre = category === "mixed" ? "Chaos" : category === "crypto" ? "Crypto" : "Sports";

  useEffect(() => {
    const modal=dialog.current!, root=scene.current!, windowEl=viewport.current!;
    const previouslyFocused=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.showModal();
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const resize = () => {
      const scale=Math.min(0.78,windowEl.clientWidth/620,Math.max(0.38,(window.innerHeight-(windowEl.clientWidth < 560 ? 330 : 285))/700));
      root.style.transform=`translateX(-50%) scale(${scale})`;
      windowEl.style.height=`${700*scale}px`;
    };
    const observer=new ResizeObserver(resize);observer.observe(windowEl);window.addEventListener('resize',resize);resize();
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let active=true, frame=0, time=0, last=0, running=false;
    let render: ((time: number)=>void) | undefined;
    const paint = () => {
      render?.(time); setStatus(openingPhase(time));
      setComplete(time>=OPENING_DURATION); setPlaying(running);
    };
    const stop = () => { running=false;cancelAnimationFrame(frame); };
    const skip = () => { stop(); time=OPENING_DURATION;paint(); };
    const tick = (now: number) => {
      if (!active||!running) return;
      time=Math.min(OPENING_DURATION,time+Math.min(now-last,64));last=now;
      if(time>=OPENING_DURATION)running=false;
      paint(); if(running)frame=requestAnimationFrame(tick);
    };
    const play = () => {
      if(reduced.matches){skip();return;}
      if(!render)return;
      running=true;last=performance.now();paint();frame=requestAnimationFrame(tick);
    };
    controls.current={skip,toggle(){if(running){stop();paint();}else play();},replay(){stop();time=0;play();}};
    const preferenceChanged=()=>{if(reduced.matches)skip();};
    reduced.addEventListener('change',preferenceChanged);
    // Failed/unsupported visual assets never prevent access to the returned cards.
    void createOpeningMotion(root,palette).then(draw=>{
      if(!active)return;render=draw;
      if(time>=OPENING_DURATION||reduced.matches)skip();else play();
    }).catch(()=>{if(active)skip();});
    return () => {
      active=false;stop();controls.current=null;
      reduced.removeEventListener('change',preferenceChanged);observer.disconnect();window.removeEventListener('resize',resize);
      document.body.style.overflow=previousOverflow;modal.close();previouslyFocused?.focus();
    };
  }, [opening.id, palette]);

  useEffect(() => {
    if (!dialog.current) return;
    dialog.current.scrollTop = 0;
    if (complete) dialog.current.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [complete]);

  const vars = { "--op-aura":palette[0], "--op-deep":palette[1], "--op-soft":palette[2] } as CSSProperties;
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="pack-reveal-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <header className={styles.header}><div><p>{genre} edition · {opening.cards.length} predictions</p><h2 id="pack-reveal-title" tabIndex={-1}>{complete ? "Meet your predictions." : "A little suspense. Then possibility."}</h2></div><button type="button" onClick={onClose} aria-label="Close opening">×</button></header>
    <p className={styles.disclosure}>{opening.mode === "demo" ? "Simulated payments and trades" : "Sandbox opening"} · {opening.status} · payment {opening.payment.status}</p>
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
    {complete && <div className={styles.results}>{opening.cards.map(card=><PredictionCard key={card.id} card={card}/>)}</div>}
    <footer className={styles.footer}><p role="status">{status}</p><div className={styles.actions}>
      {complete ? <><button type="button" onClick={()=>controls.current?.replay()}>Replay opening</button><Link href={`/dashboard?opening=${encodeURIComponent(opening.id)}`} onClick={onClose}>View collection ↗</Link></> : <><button type="button" onClick={()=>controls.current?.toggle()}>{playing ? "Pause" : "Resume"}</button><button type="button" onClick={()=>controls.current?.skip()}>Reveal all ↗</button></>}
    </div></footer>
  </dialog>;
}
