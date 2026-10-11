// Logical scene pixels. Keep cards pack-sized until they clear the foil.
export const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const phase = (t: number, start: number, end: number) => clamp((t - start) / (end - start));
export const smooth = (n: number) => n * n * n * (n * (n * 6 - 15) + 10);
export const beat = (t: number, start: number, end: number) => smooth(phase(t, start, end));
export function openingTiming(count: number) {
  const riseStep = Math.min(160, 640 / Math.max(1, count - 1));
  const spinStep = Math.min(120, 360 / Math.max(1, count - 1));
  const clearAt = 4700 + Math.max(0, count - 1) * riseStep;
  const fanStart = Math.max(5500, clearAt + 480);
  return { riseStep, spinStep, clearAt, fanStart, duration: fanStart + 4320 };
}
export const OPENING_DURATION = openingTiming(3).duration;
export function revealLayout(count: number, sceneWidth: number) {
  const total = Math.max(1, count), gap = 24, inset = 28;
  const available = Math.max(156, sceneWidth - inset * 2);
  const columns = Math.min(total, 4, Math.max(1, Math.floor((available + gap) / (210 + gap))));
  const cardWidth = Math.min(total === 1 ? 340 : 300, (available - gap * (columns - 1)) / columns);
  const scale = cardWidth / 156, cardHeight = 260 * scale;
  const rows = Math.ceil(total / columns);
  const height = Math.max(700, rows * cardHeight + (rows - 1) * gap + 96);
  return { columns, scale, height, cardWidth, cardHeight, gap };
}
export function cardMotion(time: number, index: number, count: number, sceneWidth = 900) {
  const timing = openingTiming(count), layout = revealLayout(count, sceneWidth);
  const rise = beat(time, 3380 + index * timing.riseStep, 4700 + index * timing.riseStep);
  const fan = beat(time, timing.fanStart, timing.fanStart + 640);
  const spinDelay = index * timing.spinStep;
  const angle = 1260 * (1 - beat(time, timing.fanStart + 660 + spinDelay, timing.fanStart + 3140 + spinDelay));
  const row = Math.floor(index / layout.columns);
  const rowCount = Math.min(layout.columns, count - row * layout.columns);
  const x = (index % layout.columns - (rowCount - 1) / 2) * (layout.cardWidth + layout.gap);
  const gridHeight = Math.ceil(Math.max(1,count) / layout.columns) * (layout.cardHeight + layout.gap) - layout.gap;
  const centerY = (layout.height - gridHeight) / 2 + layout.cardHeight / 2 + row * (layout.cardHeight + layout.gap);
  return {
    visible: time >= 3380 + index * timing.riseStep, rise, fan, angle,
    x: x * fan, y: -300 * rise + (centerY - 170) * fan,
    scale: 1 + (layout.scale - 1) * fan,
    reveal: smooth(clamp((180 - angle) / 100)),
    shimmer: -160 + 390 * beat(time, timing.fanStart + 3020 + spinDelay, timing.fanStart + 3930 + spinDelay),
    contentHeight: 700 + (layout.height - 700) * fan,
  };
}
export function openingPhase(time: number, count = 3) {
  const timing = openingTiming(count);
  return time < 1250 ? "Opening pack" : time < 3380 ? "Tearing the seam"
    : time < timing.fanStart ? "Cards sliding out" : time < timing.fanStart + 660 ? "Arranging cards"
    : time < timing.duration ? "Revealing cards" : `${count} cards revealed`;
}
