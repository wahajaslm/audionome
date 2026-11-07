/**
 * Zoom and pan for the Nerds lanes, like an audio editor.
 *   − / +     step through ZOOM_STEPS (seconds across the screen); past the passage = Fit
 *   pinch / ⌘-scroll  continuous zoom that keeps the time under the pointer in place
 *   ⇧-scroll / swipe  pan; panning stops Follow
 *   Follow    the view stays centred on the playhead
 * Example: passage 0:10–0:22 (12 s), Fit → 0:10–0:22; + → 10 s; + → 5 s; + → 2 s (frame bars).
 */
export const ZOOM_STEPS = [0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300, 600];
/** At this span or less the lanes draw one bar per frame and the frame edges. */
export const FRAME_DETAIL_SEC = 3;
export const MIN_SPAN = 0.1;

export interface ZoomState {
  /** Seconds across the screen; null = Fit (the whole passage). */
  span: number | null;
  /** Centre of the view when not following the playhead. */
  center: number;
  follow: boolean;
}
type R = { a: number; b: number };

const clampC = (c: number, s: number, r: R) => (r.b - r.a <= s ? (r.a + r.b) / 2 : Math.max(r.a + s / 2, Math.min(r.b - s / 2, c)));

/** The visible [start, end] for a zoom state, the passage and the playhead. */
export function viewOf(z: ZoomState, r: R, t: number): [number, number] {
  const len = r.b - r.a;
  if (z.span === null || z.span >= len) return [r.a, r.b];
  const c = clampC(z.follow ? t : z.center, z.span, r);
  return [c - z.span / 2, c + z.span / 2];
}

/** One step in (dir −1) or out (+1). Out past the passage's length = Fit. */
export function stepZoom(z: ZoomState, r: R, t: number, dir: -1 | 1): ZoomState {
  const len = r.b - r.a, cur = z.span ?? len, [v0, v1] = viewOf(z, r, t);
  const center = z.follow ? z.center : (v0 + v1) / 2;
  if (dir < 0) {
    const next = [...ZOOM_STEPS].reverse().find(s => s < cur * 0.99) ?? ZOOM_STEPS[0];
    // Zooming in from Fit: centre on the playhead when it is in the passage, else the middle.
    const c = z.span === null && !z.follow ? (t >= r.a && t <= r.b ? t : (r.a + r.b) / 2) : center;
    return { ...z, span: next, center: c };
  }
  const next = ZOOM_STEPS.find(s => s > cur * 1.01);
  return { ...z, span: next === undefined || next >= len ? null : next, center };
}

/** Continuous zoom by `factor` (>1 out, <1 in) keeping `atSec` under the pointer. */
export function zoomAt(z: ZoomState, r: R, t: number, factor: number, atSec: number): ZoomState {
  const len = r.b - r.a, [v0, v1] = viewOf(z, r, t), cur = v1 - v0;
  const ns = Math.max(MIN_SPAN, Math.min(len, cur * factor));
  if (ns >= len * 0.999) return { ...z, span: null };
  const frac = (atSec - v0) / Math.max(1e-9, cur), nv0 = atSec - frac * ns;
  return { span: ns, center: clampC(nv0 + ns / 2, ns, r), follow: false };
}

/** Pan by `deltaSec`; stops Follow. Nothing to pan at Fit. */
export function panBy(z: ZoomState, r: R, t: number, deltaSec: number): ZoomState {
  if (z.span === null || z.span >= r.b - r.a) return z;
  const [v0, v1] = viewOf(z, r, t);
  return { span: z.span, center: clampC((v0 + v1) / 2 + deltaSec, z.span, r), follow: false };
}

/** Readable span. Example: 0.5 → "500 ms", 2 → "2 s", 90 → "1:30". */
export function spanLabel(s: number): string {
  if (s < 1) return Math.round(s * 1000) + ' ms';
  if (s < 60) return (s < 10 ? s.toFixed(s % 1 ? 1 : 0) : Math.round(s)) + ' s';
  return Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
}
