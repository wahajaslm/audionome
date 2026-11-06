/**
 * Playback rules shared by every front-end: seek arithmetic, selection rules, and the loop /
 * preview controller that decides when a selected passage ends.
 *
 * Framework-free. The Vue playback store passes in its reactive state object, so changes made
 * here show up in the UI without this module knowing about Vue.
 */
import type { EventKind, ListeningEvent } from '../data/types';
import type { ExtraFields } from './listening';

/** A passage on the media timeline, in seconds. `a` = start, `b` = end. */
export interface Range { a: number; b: number }

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Position after a relative jump (transport ±15 s, arrow keys ±5 s), kept inside the song. */
export function seekTarget(t: number, deltaSec: number, durationSec: number): number {
  return clamp(t + deltaSec, 0, durationSec);
}

/** Media time under a pointer at `ratio` (0..1) across the waveform. */
export function timeAtRatio(ratio: number, durationSec: number): number {
  return clamp(ratio, 0, 1) * durationSec;
}

/** Waveform Enter key: select 10 s either side of the playhead. */
export function rangeAround(t: number, durationSec: number, halfSec = 10): Range {
  return { a: Math.max(0, t - halfSec), b: Math.min(durationSec, t + halfSec) };
}

/**
 * A drag shorter than the minimum is widened to it: min(3 s, 10 % of the song).
 * Example: a 1 s drag at 0:40 on a 4-minute song becomes 0:40 – 0:43.
 */
export function enforceMinimumSelection(sel: Range, durationSec: number): Range {
  const min = Math.min(3, durationSec * 0.1);
  return (sel.b - sel.a < min) ? { a: sel.a, b: Math.min(durationSec, sel.a + min) } : { ...sel };
}

/** Loop pressed with nothing selected: loop 12 s starting 5 s before the playhead. */
export function defaultLoopRange(t: number, durationSec: number): Range {
  const a = Math.max(0, t - 5);
  return { a, b: Math.min(durationSec, a + 12) };
}

/** Heart in the playback bar: save the last 20 s. */
export function quickSaveRange(t: number): Range {
  return { a: Math.max(0, t - 20), b: t };
}

/**
 * The song's rhythm, in seconds, from the analysis timeline. `strong` = downbeats and the
 * starts of song parts (verse, chorus …); `beats` = every beat. Both sorted.
 */
export interface BeatGrid { beats: number[]; strong: number[] }

/** Builds the grid from timeline fields; null when the song has no beats yet. */
export function beatGrid(tl: { beats?: number[]; downbeats?: number[]; sections?: { a: number }[] } | null | undefined): BeatGrid | null {
  const beats = tl?.beats ?? [];
  if (beats.length < 4) return null;
  const strong = [...(tl?.downbeats ?? []), ...(tl?.sections ?? []).map(p => p.a)].sort((x, y) => x - y);
  return { beats, strong };
}

/** Median gap between beats (seconds): one beat at the song's tempo. */
export function beatLength(beats: number[]): number {
  const gaps = beats.slice(1).map((b, i) => b - beats[i]).filter(g => g > 0).sort((x, y) => x - y);
  return gaps.length ? gaps[gaps.length >> 1] : 0;
}

/** The grid point closest to t (binary search), or null for an empty list. */
function nearestIn(sorted: number[], t: number): number | null {
  if (!sorted.length) return null;
  let lo = 0, hi = sorted.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < t) lo = mid + 1; else hi = mid; }
  const after = sorted[lo], before = lo > 0 ? sorted[lo - 1] : after;
  return Math.abs(after - t) < Math.abs(before - t) ? after : before;
}

/**
 * One edge to the beat: a downbeat or part start within ¾ of a beat wins (a loop then
 * starts on "one"), else the nearest beat within half a beat, else unchanged.
 * Example (120 bpm, beat 0.5 s, downbeat at 10.0): 10.3 → 10.0; 11.2 → beat 11.0.
 */
export function snapTime(t: number, grid: BeatGrid, beatSec = beatLength(grid.beats)): number {
  if (!(beatSec > 0)) return t;
  const strong = nearestIn(grid.strong, t);
  if (strong !== null && Math.abs(strong - t) <= 0.75 * beatSec) return strong;
  const beat = nearestIn(grid.beats, t);
  if (beat !== null && Math.abs(beat - t) <= 0.5 * beatSec) return beat;
  return t;
}

/**
 * BEAT SNAP FIX - selections used to start and end wherever the pointer let go, usually
 * between beats, so a loop jumped back mid-beat and stumbled every cycle.
 * Now both edges move to the beat (downbeats first), so a loop repeats in time.
 * Example (120 bpm, downbeats every 2 s from 0): drag 10.3–17.8 → 10.0–18.0, a 4-bar loop.
 * A range that would shrink below one beat is left as it was.
 */
export function snapRange(sel: Range, grid: BeatGrid | null, durationSec: number): Range {
  if (!grid) return { ...sel };
  const beatSec = beatLength(grid.beats);
  if (!(beatSec > 0)) return { ...sel };
  const a = clamp(snapTime(sel.a, grid, beatSec), 0, durationSec);
  const b = clamp(snapTime(sel.b, grid, beatSec), 0, durationSec);
  return b - a >= beatSec * 0.99 ? { a, b } : { ...sel };
}

export const overlaps = (x: Range, y: Range) => Math.max(x.a, y.a) < Math.min(x.b, y.b);
export const contains = (r: Range, t: number) => t >= r.a && t <= r.b;

/**
 * Play/pause pressed with a selection: play the selection to its end (a preview). If the
 * playhead is outside it, or within 0.15 s of its end, start from the selection start.
 * Returns where to start, or null to keep the current position.
 */
export function previewStart(t: number, sel: Range): number | null {
  return (t < sel.a || t >= sel.b - 0.15) ? sel.a : null;
}

/** The reactive fields the loop / preview controller reads and writes. */
export interface RegionState {
  /** UI copy of the media time. */
  t: number;
  sel: Range | null;
  loop: boolean;
  /** Completed loop cycles since the loop was switched on. */
  loops: number;
  /** When set, playback pauses here (playing a selection or a saved moment once). */
  previewEnd: number | null;
}

export interface RegionEngine {
  isSeeking(): boolean;
  pause(): void;
  setTime(sec: number): void;
}

export interface RegionLog {
  flushSpan(endedBy?: string): unknown;
  emit(kind: EventKind, origin?: ListeningEvent['origin'], extra?: ExtraFields): unknown;
  openSpan(atSec?: number): void;
}

export type RegionOutcome = 'none' | 'preview-end' | 'loop-restart';

export interface RegionControllerOptions {
  engine: RegionEngine;
  log: RegionLog;
  /** True while a track is loading; checks are skipped then. */
  isLoading?(): boolean;
  /** Preview reached its end. Return true if the caller handled it (e.g. played the next queued moment). */
  onPreviewEnd?(): boolean;
  /** A loop cycle completed; `loops` is the new count. */
  onLoopCycle?(loops: number): void;
}

/** Loop tolerance: jump back when within 20 ms of the loop end (one frame is ~16 ms). */
export const LOOP_EPSILON_SEC = 0.02;

export class RegionController {
  private readonly state: RegionState;
  private readonly opts: RegionControllerOptions;

  constructor(state: RegionState, opts: RegionControllerOptions) {
    this.state = state;
    this.opts = opts;
  }

  // SYNC FIX 5 - loop and preview ends are checked every animation frame (~16 ms) from the
  // media-clock loop (see composables/useMediaClock.ts), not only on 'timeupdate', which
  // browsers fire about every 250 ms.
  // Example: a loop ending at 1:30.00 used to play on to as late as 1:30.25 before jumping
  // back; now it jumps within one frame. 'timeupdate' still calls this as a backup for
  // background tabs, where animation frames pause.
  //
  // SYNC FIX 6 - the old guard ignored every check for 250-350 ms after any seek, so a short
  // loop could run past its end during that window. Now checks are skipped only while the
  // browser reports it is still seeking; once it has arrived, the position is trustworthy.
  // Example: a 3 s loop restarted at 0:10.00 is checked again from the first frame after the
  // seek lands, not 300 ms later.
  check(t: number): RegionOutcome {
    const s = this.state, { engine, log } = this.opts;
    if (this.opts.isLoading?.() || engine.isSeeking()) return 'none';
    if (s.previewEnd !== null && t >= s.previewEnd && !s.loop) {
      s.previewEnd = null;
      if (this.opts.onPreviewEnd?.()) return 'preview-end';
      engine.pause();
      if (s.sel) { s.t = s.sel.a; engine.setTime(s.sel.a); }
      return 'preview-end';
    }
    if (s.loop && s.sel && t >= s.sel.b - LOOP_EPSILON_SEC && t < s.sel.b + 1) {
      log.flushSpan('loop_cycle');
      // Logged at the loop end, where it happened (it used to log the restart position).
      log.emit('loop_cycle', 'player', { momentStartSec: s.sel.a, momentEndSec: s.sel.b, positionSec: s.sel.b });
      engine.setTime(s.sel.a); s.t = s.sel.a; s.loops++;
      // LOOP SPAN FIX (loop span restart) - the next audible stretch starts at the loop start.
      // Example: looping 0:10–0:22 logs spans 10→22, 10→22, … instead of one span 10→22 and
      // then nothing, because 'playing' does not fire again after an in-place seek.
      log.openSpan(s.sel.a);
      this.opts.onLoopCycle?.(s.loops);
      return 'loop-restart';
    }
    return 'none';
  }
}
