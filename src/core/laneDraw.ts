/**
 * Lane drawing shared by Explore (LiveLanes) and Nerds (BitrateLanes), so both show the same
 * picture at the same place in time.
 *
 * PRECISION FIX - spectrogram column f is centred on f / fps (centred STFT, like librosa), so it
 * covers (f − ½ … f + ½) / fps. It used to be drawn from f / fps: the whole picture half a column
 * (~5.8 ms at 86 columns/s) late.
 */
import { bandForHz, spectrumLabels, spectrumTiles, SPEC_TILE, type SpectrumView } from './spectrum.ts';

export interface LaneBox { y: number; h: number }

/** Draws the spectrum tiles for [v0, v1] into `box`; `crisp` = no smoothing (frame zoom). */
export function drawSpectrum(
  g: CanvasRenderingContext2D, sp: SpectrumView, tiles: HTMLCanvasElement[], X: (sec: number) => number,
  v0: number, v1: number, box: LaneBox, crisp = false,
): void {
  const f0 = Math.max(0, v0 * sp.fps - 1), f1 = Math.min(sp.frames, v1 * sp.fps + 1);
  g.imageSmoothingEnabled = !crisp;
  for (let ti = Math.floor(f0 / SPEC_TILE); ti <= Math.floor((f1 - 1) / SPEC_TILE) && ti < tiles.length; ti++) {
    const t0 = ti * SPEC_TILE, a = Math.max(f0, t0), b = Math.min(f1, t0 + tiles[ti].width);
    if (b <= a) continue;
    const xa = X((a - 0.5) / sp.fps), xb = X((b - 0.5) / sp.fps);
    g.drawImage(tiles[ti], a - t0, 0, b - a, sp.bands, xa, box.y, xb - xa, box.h);
  }
  g.imageSmoothingEnabled = true;
}

/** Frequency labels for the view (Hz for mel and linear, note names for CQT). */
export function drawSpectrumLabels(g: CanvasRenderingContext2D, sp: SpectrumView, box: LaneBox, font: string, ink: string): void {
  g.font = '600 10px ' + font;
  for (const [hz, label] of spectrumLabels(sp.kind)) {
    const yy = box.y + box.h - (bandForHz(sp, hz) + 0.5) / sp.bands * box.h;
    if (yy < box.y + 6 || yy > box.y + box.h - 4) continue;
    g.fillStyle = 'rgba(14,14,16,0.72)'; g.fillRect(2, yy - 7, 40, 13);
    g.fillStyle = ink; g.fillText(label, 5, yy + 3);
  }
}

/** One column of the spectrum in seconds (the time step of the picture). */
export const columnSec = (sp: Pick<SpectrumView, 'fps'>) => 1 / sp.fps;

/**
 * SPEED FIX - the drawn tiles of each spectrum view, made once and shared by Explore and Nerds
 * (they used to be rebuilt on every switch: ~50–230 ms each time).
 */
const TILE_CACHE = new WeakMap<SpectrumView, HTMLCanvasElement[]>();
export function tilesFor(view: SpectrumView): HTMLCanvasElement[] {
  let t = TILE_CACHE.get(view);
  if (!t) { t = spectrumTiles(view); TILE_CACHE.set(view, t); }
  return t;
}
/** Builds tiles for views not drawn yet, when the browser is idle, so the first switch is instant too. */
export function warmTiles(views: (SpectrumView | null | undefined)[]): void {
  const todo = views.filter((v): v is SpectrumView => !!v && !TILE_CACHE.has(v));
  const next = () => { const v = todo.shift(); if (!v) return; tilesFor(v); idle(next); };
  idle(next);
}
const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 50));
