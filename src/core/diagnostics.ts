/**
 * Feature Analysis (admin) data: what the local Python service measured for one recording.
 * Framework-free port of index.html's loadAdminData() / renderAdminViewOnly() row maths.
 * Everything here is a measurement or a research baseline, never a claim about the listener.
 */
import type { AudioSegment, TrackAnalysis } from '../data/types';
import { SERVICE } from './library.ts';

/** Parts of the service's /api/studio bundle the admin screen reads. */
export interface StudioBundle {
  multimodal?: TrackAnalysis;
  activeLearning?: ActiveLearningQuery[];
  dmerBenchmark?: { baselines?: DmerBaselines };
}
export interface ActiveLearningQuery {
  trackId?: string; startSec: number; endSec: number; question: string;
  acquisitionScore: number | string; uncertainty: number | string; modalDisagreement: number | string;
  suggestedChips?: string[];
}
export interface DmerScore { ccc: number; rmse: number }
export interface DmerBaselines {
  personalized_dmer: DmerScore; population_dual_scale_attention: DmerScore; static_ridge: DmerScore;
}
export interface PythonDiagnostics {
  activeLearning?: { queries?: ActiveLearningQuery[] } | null;
  dmer?: { baselines?: DmerBaselines } | null;
}

/** Studio bundle URL: the demo has its own endpoint. */
export function studioUrl(trackId: string): string {
  return trackId === 'original-demo' ? SERVICE + '/api/studio/demo' : SERVICE + '/api/studio/track/' + encodeURIComponent(trackId);
}

/** Fetches the studio bundle; null when the service is off or answers with an error (e.g. 503). */
export async function fetchStudioBundle(trackId: string, fetcher: typeof fetch = fetch): Promise<StudioBundle | null> {
  try {
    const r = await fetcher(studioUrl(trackId), { signal: AbortSignal.timeout(4000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** The research studio (full plots), served by the local service. */
export const STUDIO_URL = SERVICE + '/studio';

const overlapsRange = (s: Pick<AudioSegment, 'startSec' | 'endSec'>, a: number, b: number) => Math.max(a, s.startSec) < Math.min(b, s.endSec);

/**
 * Windows to list: all of them when `showAll`, else those overlapping the selection, else the
 * first six. Indices are kept so "Window 7" means the same window in every view.
 * Example: 30 windows of 4 s, selection 10–18 s → windows 3, 4, 5 (indices 2, 3, 4).
 */
export function visibleWindows(segs: AudioSegment[], sel: { a: number; b: number }, showAll: boolean): { s: AudioSegment; i: number }[] {
  const all = segs.map((s, i) => ({ s, i }));
  if (showAll) return all;
  const inSel = all.filter(({ s }) => overlapsRange(s, sel.a, sel.b));
  return inSel.length ? inSel : all.slice(0, 6);
}

export const inSelection = (s: AudioSegment, sel: { a: number; b: number }) => overlapsRange(s, sel.a, sel.b);

/**
 * Energy slope words with the measured value.
 * Example: 0.12 → "Intensifying (+0.12/s)"; -0.05 → "Decaying (-0.05/s)"; 0.01 → "Steady (0.01/s)".
 */
export function slopeTag(slope: number): string {
  return slope > 0.03 ? 'Intensifying (+' + slope.toFixed(2) + '/s)' : slope < -0.03 ? 'Decaying (' + slope.toFixed(2) + '/s)' : 'Steady (' + slope.toFixed(2) + '/s)';
}

export const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** One window's measured values, formatted as the classic admin rows show them. */
export function windowSummary(s: AudioSegment) {
  const d = s.descriptors || ({} as AudioSegment['descriptors']);
  const slope = Number(d.energy_slope || 0);
  const dspVec = s.dspEmbedding || (s.embedding || []).slice(0, 25);
  const deepVec = s.deepEmbedding || s.embedding || [];
  return {
    vocalPct: Math.round(Number(d.vocal_presence || 0) * 100),
    slope,
    slopeTag: slopeTag(slope),
    brightnessHz: Math.round(Number(d.brightness_hz || 0)),
    flatness: Number(d.noisiness || 0),
    rms: Number(d.energy || 0),
    flux: Number(d.spectral_flux || 0),
    onset: Number(d.onset_activity || 0),
    zcr: Number(d.zero_crossing_rate || 0),
    chroma: PITCH_CLASSES.map((n, i) => ({ note: n, value: Number((d.chroma || [])[i] || 0) })),
    mfccs: dspVec.slice(17, 25).map(Number),
    embeddingDims: (s.embedding || []).length,
    deepHead: deepVec.slice(0, 16).map(Number),
    /** First 40 dimensions, for the small bar strip (bar height ∝ |value|, 2–28 px). */
    bars: (deepVec || []).slice(0, 40).map(v => ({ h: Math.max(2, Math.min(28, Math.round(Math.abs(Number(v)) * 110))), pos: Number(v) >= 0 })),
  };
}

/** DMER research baselines as rows (classic order; the first is the personalised model). */
export function dmerRows(b: DmerBaselines | undefined) {
  if (!b) return [];
  return [
    { name: 'Personalized-DMER (AAAI 2025)', desc: 'Dual-scale temporal attention + listener support-set adaptation', ...b.personalized_dmer, main: true },
    { name: 'Population Dual-Scale Attention', desc: 'Local + global temporal attention without listener adaptation', ...b.population_dual_scale_attention, main: false },
    { name: 'Static Ridge Baseline', desc: 'Frame-independent prediction without temporal context', ...b.static_ridge, main: false },
  ];
}

/**
 * LIVE EXPLORE FIX - the Explore panel used to show only the first window of the selection,
 * frozen while the loop played. It now follows the playhead.
 * LIVE SYNC FIX - windows overlap (12 s long, one every 6 s), and taking the first window that
 * contains the playhead showed one that had mostly played already. Now the window whose centre
 * is nearest the playhead is used, so what you hear sits in the middle of what is shown.
 * Example: windows 0–12, 6–18, 12–24; playhead 0:13 → 6–18 (centre 0:12), not 0–12.
 */
export function liveWindow(segs: AudioSegment[], t: number): { s: AudioSegment; i: number } | null {
  let best: { s: AudioSegment; i: number } | null = null, bestD = Infinity;
  segs.forEach((s, i) => {
    const d = Math.abs((s.startSec + s.endSec) / 2 - t);
    if (d < bestD) { best = { s, i }; bestD = d; }
  });
  return best;
}

const num = (s: AudioSegment, key: string) => Number((s.descriptors as unknown as Record<string, unknown>)?.[key] ?? 0);

/**
 * A measure at the playhead, blended between the two windows whose centres surround it, so the
 * value moves smoothly with the music instead of jumping every 6 s.
 * Example: energy 0.10 at centre 0:06 and 0.20 at centre 0:12; playhead 0:09 → 0.15.
 */
export function valueAt(segs: AudioSegment[], key: string, t: number): number {
  if (!segs.length) return 0;
  const c = (s: AudioSegment) => (s.startSec + s.endSec) / 2;
  const sorted = [...segs].sort((x, y) => c(x) - c(y));
  if (t <= c(sorted[0])) return num(sorted[0], key);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (t <= c(b)) { const f = (t - c(a)) / Math.max(1e-6, c(b) - c(a)); return num(a, key) + f * (num(b, key) - num(a, key)); }
  }
  return num(sorted[sorted.length - 1], key);
}

/**
 * The chord sounding now: a window's chords are spread evenly across it.
 * Example: window 0:06–0:18 with chords [Am, F, C, G]; playhead 0:13 → index 2 (C).
 */
export function chordIndexAt(s: AudioSegment, t: number): number {
  const n = s.descriptors?.chords?.length ?? 0;
  if (!n) return -1;
  const f = (t - s.startSec) / Math.max(1e-6, s.endSec - s.startSec);
  return Math.max(0, Math.min(n - 1, Math.floor(f * n)));
}

/** The live measures, each as 0..1 against this song's own range (so bars compare within the song). */
export const LIVE_MEASURES = [
  { key: 'energy', label: 'Energy' },
  { key: 'brightness_hz', label: 'Brightness' },
  { key: 'onset_activity', label: 'Rhythm activity' },
  { key: 'vocal_presence', label: 'Vocals' },
  { key: 'spectral_flux', label: 'Change' },
] as const;

/**
 * The live measures at the playhead, each also as 0..1 against this song's own range:
 * 0 = the song's lowest, 1 = its highest. Example: energy 0.15 in a song ranging 0.05–0.25 → 0.5.
 */
export function measuresAt(segs: AudioSegment[], t: number): { key: string; label: string; value: number; level: number }[] {
  return LIVE_MEASURES.map(({ key, label }) => {
    const all = segs.map(x => num(x, key));
    const v = valueAt(segs, key, t);
    const lo = Math.min(...all), hi = Math.max(...all);
    return { key, label, value: v, level: hi > lo ? (v - lo) / (hi - lo) : 0.5 };
  });
}

/**
 * LOOP SYNC FIX - a loop is any range (say 0:44–1:09), but the analysis comes on a fixed grid
 * of 12 s windows every 6 s, so no window matches the loop. This summarises exactly the loop:
 * it samples the loop every `step` seconds, reads each sample from the window centred nearest
 * it (the same rule the live view uses) and combines them.
 *   measures: average over the loop      key: the key heard for most of the loop
 *   tempo:    average over the loop      chords: the chords in order, with their times
 * Example: loop 0:44–1:09 → 50 samples across windows 36–48 … 66–78, chords "F 0:44–0:47, C 0:47–0:52, …".
 */
export function passageSummary(segs: AudioSegment[], r: { a: number; b: number }, step = 0.5) {
  if (!segs.length || r.b <= r.a) return null;
  const times: number[] = [];
  for (let x = r.a; x < r.b; x += step) times.push(x);
  const keyVotes = new Map<string, number>();
  const chords: { chord: string; from: number; to: number }[] = [];
  let tempoSum = 0, tempoN = 0;
  for (const x of times) {
    const w = liveWindow(segs, x)!.s;
    const d = w.descriptors;
    if (d?.key) keyVotes.set(d.key, (keyVotes.get(d.key) ?? 0) + 1);
    if (d?.tempoBpm) { tempoSum += Number(d.tempoBpm); tempoN++; }
    const i = chordIndexAt(w, x);
    if (i >= 0) {
      const c = d!.chords![i], last = chords[chords.length - 1];
      if (last && last.chord === c) last.to = Math.min(r.b, x + step);
      else chords.push({ chord: c, from: x, to: Math.min(r.b, x + step) });
    }
  }
  const key = [...keyVotes.entries()].sort((p, q) => q[1] - p[1])[0]?.[0];
  const measures = LIVE_MEASURES.map(({ key: k, label }) => {
    const all = segs.map(x => num(x, k));
    const lo = Math.min(...all), hi = Math.max(...all);
    const v = times.reduce((s, x) => s + valueAt(segs, k, x), 0) / times.length;
    return { key: k, label, value: v, level: hi > lo ? (v - lo) / (hi - lo) : 0.5 };
  });
  return { key, tempoBpm: tempoN ? Math.round(tempoSum / tempoN) : undefined, chords, measures };
}
