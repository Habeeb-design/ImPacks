// Approved one-wrapper / three-card timeline. Milliseconds, logical scene pixels.
export const OPENING_DURATION = 9200;
export const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const phase = (t: number, start: number, end: number) => clamp((t - start) / (end - start));
export const smooth = (n: number) => n * n * n * (n * (n * 6 - 15) + 10);
export const beat = (t: number, start: number, end: number) => smooth(phase(t, start, end));
export function cardMotion(time: number, index: number, count: number) {
  const rise = beat(time, 3380 + index * 160, 4700 + index * 160);
  const fanStart = Math.max(5000, 4700 + (count - 1) * 160);
  const fan = beat(time, fanStart, fanStart + 640);
  const angle = 1260 * (1 - beat(time, fanStart + 660 + index * 120, fanStart + 3140 + index * 120));
  const offset = count === 3 ? [0, -165, 165][index]! : (index - (count - 1) / 2) * 165;
  return {
    visible: time >= 3380 + index * 160, rise, fan, angle,
    x: offset * fan, y: -300 * rise + Math.abs(offset / 165) * 12 * fan,
    reveal: smooth(clamp((180 - angle) / 100)),
    shimmer: -160 + 390 * beat(time, 8020 + index * 120, 8930 + index * 120),
  };
}
export function openingPhase(time: number) {
  return time < 1250 ? "A little anticipation…" : time < 3380 ? "Tearing the seam…"
    : time < 5000 ? "Sliding your cards out…" : time < 5660 ? "Making room for the reveal…"
    : time < 8400 ? "Here come your predictions…" : "Your cards, revealed.";
}
