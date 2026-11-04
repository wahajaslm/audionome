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
