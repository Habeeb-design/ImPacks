"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Pack } from "@impacks/contracts";
import { PackTile } from "./PackTile";

export function PackCarousel({ packs, selected, disabled, onSelect }: { packs: Pack[]; selected: string; disabled: boolean; onSelect: (id: string) => void }) {
  const router = useRouter();
  const viewport = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const width = useRef(0);
  const [rotating, setRotating] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    setRotating(!media.matches);
    const change = () => { if (media.matches) setRotating(false); };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    const element = viewport.current, row = group.current;
    if (!element || !row) return;
    const resize = new ResizeObserver(() => {
      const previous = width.current;
      const progress = previous ? element.scrollLeft / previous : 1;
      width.current = row.getBoundingClientRect().width;
      element.scrollLeft = progress * width.current;
    });
    resize.observe(row);
    const intersection = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    intersection.observe(element);
    return () => { resize.disconnect(); intersection.disconnect(); };
  }, [packs.length]);

  useEffect(() => {
    if (!rotating || hovered || focused || disabled || !visible) return;
    let frame = 0, previous = 0;
    let position = viewport.current?.scrollLeft ?? 0;
    function tick(time: number) {
      const element = viewport.current;
      if (element && width.current) {
        const elapsed = previous ? Math.min(time - previous, 64) : 0;
        // Accumulate fractional pixels independently of browser scroll rounding.
        position += elapsed * 0.028;
        if (position >= width.current * 2) position -= width.current;
        element.scrollLeft = position;
      }
      previous = time;
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [rotating, hovered, focused, disabled, visible]);

  function choose(id: string, openCategory = false) {
    setRotating(false); setCategory(id); onSelect(id);
    if (openCategory) router.push(`/category/${id}`);
  }
  function jump(index: number) {
    const pack = packs[index];
    if (!pack || !viewport.current) return;
    choose(pack.id);
    viewport.current.scrollTo({ left: width.current + index * width.current / packs.length, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  function step(direction: number) {
    const index = category ? packs.findIndex(pack => pack.id === category) : Math.round(((viewport.current?.scrollLeft ?? 0) % width.current) / (width.current / packs.length));
    jump((index + direction + packs.length) % packs.length);
  }

  return <section className="pack-section" id="packs" aria-labelledby="packs-title">
    <div className="catalog-heading"><p className="eyebrow">FIND YOUR NEXT OBSESSION</p><h2 id="packs-title">A pack for every curiosity.</h2>
      <div className="category-tabs" role="group" aria-label="Pack categories">
        <button aria-pressed={category === null} disabled={disabled} onClick={() => { setCategory(null); setRotating(!matchMedia("(prefers-reduced-motion: reduce)").matches); }}>All packs</button>
        {packs.map((pack, index) => <button key={pack.id} aria-pressed={category === pack.id} disabled={disabled} onClick={() => jump(index)}>{pack.name.replace(/ Pack$/, "")}</button>)}
      </div>
    </div>
    <div className="pack-viewport" ref={viewport} aria-label="Pack categories" aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onPointerDown={() => setRotating(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      {[0, 1, 2].map(copy => <div className="pack-group" key={copy} ref={copy === 0 ? group : undefined} aria-hidden={copy === 0 ? undefined : true}>
        {packs.map(pack => <PackTile key={pack.id} pack={pack} selected={category !== null && selected === pack.id} disabled={disabled} duplicate={copy !== 0} onSelect={() => choose(pack.id, true)} />)}
      </div>)}
    </div>
    <div className="carousel-controls"><button aria-label="Previous category" disabled={disabled} onClick={() => step(-1)}>←</button><button disabled={disabled} onClick={() => { setRotating(value => !value); if (!rotating) setCategory(null); }}>{rotating ? "Pause rotation" : "Resume rotation"}</button><button aria-label="Next category" disabled={disabled} onClick={() => step(1)}>→</button></div>
  </section>;
}
