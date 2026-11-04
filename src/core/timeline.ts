/**
 * The song's timeline from the local service (musicdna/features/timeline.py): beats, chords on
 * the beat, song parts, repeats and 10 frames/s curves, plus the stem tier once Demucs is done.
 * Pure helpers here; the store (stores/timeline.ts) fetches and polls.
 *
 * LIVE EXPLORE FIX - Explore used to read 12 s analysis windows, so nothing could follow the
 * playhead and chords were guessed in time. Everything below is on the song's own clock.
 * Example: at 1:43.6 → chord C (1:42.6–1:43.9), next Dm in 0.3 s, bar 30 beat 4, part D.
 */
import { SERVICE_URL } from './service.ts';

export type TierState = 'waiting' | 'running' | 'done' | 'error' | 'stale';
export interface TimelineStatus { quick?: TierState; full?: TierState; stage?: string; error?: string }
export interface ChordBlock { c: string; a: number; b: number; conf: number }
export interface SongPart { a: number; b: number; label: string; energy: number }
export interface ChordRepeat { at: number; same_as: number; sim: number }
export const STEM_NAMES = ['vocals', 'drums', 'bass', 'other'] as const;
export type StemName = typeof STEM_NAMES[number];

export interface Timeline {
  trackId: string;
  version: number;
  status: TimelineStatus;
  durationSec?: number;
  fps?: number;
  tempoBpm?: number | null;
  beats?: number[];
  downbeats?: number[];
  key?: string | null;
  chords?: ChordBlock[];
  /** 'mix' (quick tier) or 'bass+other' (redone from the stems). */
  chordSource?: string;
  sections?: SongPart[];
  repeats?: ChordRepeat[];
  mix?: number[];
  bright?: number[];
  stems?: Partial<Record<StemName, number[]>>;
  /** e.g. 'demucs:htdemucs'. */
  stemSource?: string;
  melody?: { fps: number; midi: (number | null)[] };
}

/** Saved timeline with its status; null when the service has never started one (404) or is off. */
export async function fetchTimeline(trackId: string, fetcher: typeof fetch = fetch): Promise<Timeline | null> {
  try {
    const r = await fetcher(SERVICE_URL + '/api/timeline/' + encodeURIComponent(trackId), { signal: AbortSignal.timeout(5000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** Starts the job, or moves it to the front (the song being played). False when the service is off. */
export async function startTimeline(trackId: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const r = await fetcher(SERVICE_URL + '/api/timeline/' + encodeURIComponent(trackId), { method: 'POST', signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch { return false; }
}

export const hasQuick = (tl: Timeline | null | undefined): boolean => !!tl?.chords?.length && !!tl.beats?.length;
export const hasFull = (tl: Timeline | null | undefined): boolean => !!tl?.stems && Object.keys(tl.stems).length > 0;

/** Value of a 10 frames/s curve at time t (nearest frame). */
export function curveAt(curve: ArrayLike<number> | undefined, t: number, fps = 10): number {
  if (!curve || !curve.length) return 0;
  return Number(curve[Math.max(0, Math.min(curve.length - 1, Math.round(t * fps)))]) || 0;
}

/** 1-based bar number at t (bar 1 until the first downbeat). Example: downbeats [17.1, 20.2]; t 19 → 1, t 21 → 2. */
export function barAt(downbeats: number[], t: number): number {
  let n = 0;
  for (const d of downbeats) { if (d <= t) n++; else break; }
  return Math.max(1, n);
}

/** 1-based beat within the bar. Example: downbeat 20.22, beats 20.22, 20.99, 21.76; t 21.8 → 3. */
export function beatInBar(beats: number[], downbeats: number[], t: number): number {
  let d = 0;
  for (const x of downbeats) { if (x <= t) d = x; else break; }
  let n = 0;
  for (const b of beats) { if (b < d - 0.01) continue; if (b > t) break; n++; }
  return Math.max(1, n);
}

/** Index of the block containing t, or -1. Blocks are sorted and do not overlap. */
export function blockIndexAt<T extends { a: number; b: number }>(blocks: T[], t: number): number {
  let lo = 0, hi = blocks.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (t < blocks[m].a) hi = m - 1; else if (t >= blocks[m].b) lo = m + 1; else return m;
  }
  return -1;
}

/** q-quantile of a list (0..1). */
export function quantile(values: ArrayLike<number>, q: number): number {
  const s = Array.from(values).sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] : 0;
}

/** Share of a sorted list below v (0..1). */
export function rankIn(sorted: number[], v: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
  return sorted.length ? lo / sorted.length : 0;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** MIDI number → note name. Example: 69 → "A4", 49.5 → "D3" (rounded). */
export function noteName(midi: number): string {
  const m = Math.round(midi);
  return NOTES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

function movingAverage(curve: ArrayLike<number>, w: number): Float32Array {
  const out = new Float32Array(curve.length);
  let s = 0;
  for (let i = 0; i < curve.length; i++) {
    s += Number(curve[i]);
    if (i >= w) s -= Number(curve[i - w]);
    out[i] = s / Math.min(i + 1, w);
  }
  return out;
}

export interface PassageMoment { at: number; text: string; needs: 'quick' | 'full'; ghost?: number }

const fmt = (s: number) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Up to three one-line moments in the passage, from the measured curves:
 *   stems that drop out and come back   (needs stems)
 *   a chord pattern heard elsewhere     (quick tier)
 *   the highest sung note and the range (needs stems)
 * Example (1:35–2:41): "1:44 Bass and drums drop out. The voice carries it alone until 1:49."
 */
export function passageMoments(tl: Timeline, r: { a: number; b: number }): PassageMoment[] {
  const fps = tl.fps ?? 10, out: PassageMoment[] = [];
  if (tl.stems) {
    const events: { s: string; a: number; b: number }[] = [];
    for (const s of STEM_NAMES) {
      const curve = tl.stems[s];
      if (!curve) continue;
      const sm = movingAverage(curve, 6), end = Math.min(sm.length, Math.floor(r.b * fps));
      let i = Math.ceil(r.a * fps) + 10;
      while (i < end) {
        if (sm[i] < 0.12 && sm[i - 10] > 0.3) {
          let j = i;
          while (j < end && sm[j] < 0.3) j++;
          events.push({ s, a: i / fps, b: j / fps });
          i = j + 20;
        } else i++;
      }
    }
    if (events.length) {
      events.sort((x, y) => x.a - y.a);
      const g = events.filter(e => Math.abs(e.a - events[0].a) < 1.5);
      const who = g.map(e => cap(e.s)).join(' and ');
      const back = Math.min(...g.map(e => e.b));
      const alone = g.length >= 2 && !g.some(e => e.s === 'vocals');
      out.push({ at: events[0].a, needs: 'full', text: back < r.b
        ? `${who} drop out${alone ? '. The voice carries it alone' : ''} until ${fmt(back)}.`
        : `${who} drop out for the rest of the passage.` });
    }
  }
  const rep = (tl.repeats ?? []).filter(x => x.at >= r.a && x.at < r.b).sort((x, y) => y.sim - x.sim)[0];
  if (rep) out.push({ at: rep.at, needs: 'quick', ghost: rep.same_as, text: `Same chords as ${fmt(rep.same_as)}.` });
  const mel = tl.melody;
  if (mel) {
    let top = -1, topV = -Infinity;
    const vals: number[] = [];
    for (let i = Math.floor(r.a * mel.fps); i < Math.min(mel.midi.length, r.b * mel.fps); i++) {
      const v = mel.midi[i];
      if (v == null) continue;
      vals.push(v);
      if (v > topV) { topV = v; top = i; }
    }
    if (vals.length > 50) {
      out.push({ at: top / mel.fps, needs: 'full',
        text: `Highest sung note. The voice spans ${noteName(quantile(vals, 0.05))}–${noteName(quantile(vals, 0.95))} here.` });
    }
  }
  return out.sort((x, y) => x.at - y.at).slice(0, 3);
}
