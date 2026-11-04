/**
 * The folded sections in Explore: Voice, Groove, Harmony and Similar passages, each measured
 * for the selected passage and compared with the song where that makes sense.
 *
 * DETAIL SECTIONS - the pipeline measured more than Explore showed (the vocal line, beat
 * steadiness, pulse clarity, harmonic stability, CLAP embeddings). These read it back in plain
 * words, folded by default so the lanes stay the first thing you see.
 * Example (5580a385, 1:35–2:41): Voice "C3–A4 · longest note 1.8 s on D4";
 * Groove "79 BPM · steady (±14 ms)"; Similar "First Light 0:12–0:24 · 91% alike".
 *
 * Left out on purpose: the window analysis's syncopation (≈ 0.9 on every song, so it tells
 * nothing apart) and its per-window tempo (often double the beat tracker's).
 */
import type { AudioSegment, TrackAnalysis } from '../data/types';
import { noteName, quantile, rankIn, type Timeline } from './timeline.ts';

export interface DetailRow { k: string; v: string; hint?: string }

const overlaps = (s: AudioSegment, r: { a: number; b: number }) => Math.max(r.a, s.startSec) < Math.min(r.b, s.endSec);
const mean = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : NaN);

/**
 * Voice, from the sung pitch line (pYIN on the Demucs vocal stem, 10 frames/s).
 * Example: [{k: 'Range', v: 'C3–A4 (21 semitones)'}, {k: 'Longest note', v: '1.8 s on D4'}, …]
 */
export function voiceDetails(tl: Timeline | null | undefined, r: { a: number; b: number }): DetailRow[] {
  const m = tl?.melody;
  if (!m) return [];
  const i0 = Math.floor(r.a * m.fps), i1 = Math.min(m.midi.length, Math.ceil(r.b * m.fps));
  const seg = m.midi.slice(i0, i1), sung = seg.filter((v): v is number => v != null);
  if (sung.length < 20) return [{ k: 'Singing', v: 'Hardly any in this passage' }];
  const lo = quantile(sung, 0.05), hi = quantile(sung, 0.95);
  // Longest held note: consecutive frames within half a semitone of where the note started.
  let best = { len: 0, note: sung[0] }, run = 0, start = NaN;
  for (const v of seg) {
    if (v != null && !isNaN(start) && Math.abs(v - start) <= 0.5) run++;
    else { run = v != null ? 1 : 0; start = v ?? NaN; }
    if (run > best.len) best = { len: run, note: start };
  }
  // Movement: average pitch change per second between neighbouring sung frames.
  const steps: number[] = [];
  for (let i = 1; i < seg.length; i++) { const p = seg[i - 1], q = seg[i]; if (p != null && q != null) steps.push(Math.abs(q - p) * m.fps); }
  const move = mean(steps);
  const songSung = m.midi.filter((v): v is number => v != null).sort((p, q) => p - q);
  const height = rankIn(songSung, quantile(sung, 0.5));
  return [
    { k: 'Range', v: `${noteName(lo)}–${noteName(hi)} (${Math.round(hi - lo)} semitones)`, hint: '5th to 95th percentile of the sung pitch' },
    { k: 'Typical note', v: `${noteName(quantile(sung, 0.5))} · ${height > 0.66 ? 'high' : height < 0.33 ? 'low' : 'middle'} for this singer`, hint: 'Median pitch, compared with the whole song' },
    { k: 'Longest note', v: `${(best.len / m.fps).toFixed(1)} s on ${noteName(best.note)}`, hint: 'Held within half a semitone' },
    { k: 'Movement', v: `${move < 4 ? 'Smooth' : move < 9 ? 'Lively' : 'Very ornamented'} (${move.toFixed(1)} semitones/s)`, hint: 'Average pitch change per second while singing' },
    { k: 'Singing', v: `${Math.round(sung.length / Math.max(1, seg.length) * 100)}% of the passage` },
  ];
}

/**
 * Groove, from the beat grid (Beat This) and the windows' pulse clarity and drum-fill flag.
 * Example: [{k: 'Tempo', v: '79 BPM'}, {k: 'Steadiness', v: 'Steady (±14 ms)'}, {k: 'Beat', v: 'Clear (0.62)'}]
 */
export function grooveDetails(tl: Timeline | null | undefined, segs: AudioSegment[], r: { a: number; b: number }): DetailRow[] {
  const out: DetailRow[] = [];
  const beats = (tl?.beats ?? []).filter(b => b >= r.a && b < r.b);
  if (beats.length >= 4) {
    const ibi = beats.slice(1).map((b, i) => b - beats[i]), med = quantile(ibi, 0.5);
    const jitter = Math.sqrt(mean(ibi.map(x => (x - med) ** 2))) * 1000;
    out.push({ k: 'Tempo', v: Math.round(60 / med) + ' BPM', hint: 'From the beats in this passage' });
    out.push({ k: 'Steadiness', v: `${jitter < 20 ? 'Steady' : jitter < 45 ? 'Loose' : 'Free'} (±${Math.round(jitter)} ms)`, hint: 'How much the gap between beats varies' });
    const downs = (tl?.downbeats ?? []).filter(d => d >= r.a && d < r.b);
    if (downs.length >= 2) {
      const per = downs.slice(1).map((d, i) => beats.filter(b => b >= downs[i] - 0.01 && b < d - 0.01).length);
      out.push({ k: 'Metre', v: `${quantile(per, 0.5)} beats per bar` });
    }
  }
  const win = segs.filter(s => overlaps(s, r)).map(s => s.descriptors?.dimensions?.rhythmGroove).filter(Boolean);
  const clarity = mean(win.map(g => Number(g!.pulseClarity)));
  if (!isNaN(clarity)) out.push({ k: 'Beat', v: `${clarity > 0.55 ? 'Clear' : clarity > 0.3 ? 'Present' : 'Faint'} (${clarity.toFixed(2)})`, hint: 'Pulse clarity: how strongly one beat stands out' });
  if (win.some(g => g!.drumFillDetected)) out.push({ k: 'Drum fill', v: 'Yes, in this passage' });
  const drums = tl?.stems?.drums;
  if (drums?.length) {
    const fps = tl!.fps ?? 10, inside = drums.slice(Math.floor(r.a * fps), Math.ceil(r.b * fps));
    const q = rankIn([...drums].sort((p, q2) => p - q2), mean(inside));
    out.push({ k: 'Drums', v: q > 0.66 ? 'Heavier than the rest of the song' : q < 0.33 ? 'Lighter than the rest of the song' : 'About the same as the rest of the song' });
  }
  return out;
}

/**
 * Harmony, from the chords on the beat and the windows' key and harmonic stability.
 * Example: [{k: 'Chords', v: 'Dm 46% · C 31% · F 12%'}, {k: 'Change rate', v: '1.4 per bar'}, …]
 */
export function harmonyDetails(tl: Timeline | null | undefined, segs: AudioSegment[], r: { a: number; b: number }): DetailRow[] {
  const out: DetailRow[] = [];
  const chords = (tl?.chords ?? []).filter(c => c.b > r.a && c.a < r.b);
  if (chords.length) {
    const time = new Map<string, number>();
    for (const c of chords) time.set(c.c, (time.get(c.c) ?? 0) + Math.min(r.b, c.b) - Math.max(r.a, c.a));
    const total = [...time.values()].reduce((p, q) => p + q, 0);
    const top = [...time.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
    out.push({ k: 'Chords', v: top.map(([c, t]) => `${c} ${Math.round(t / total * 100)}%`).join(' · '), hint: 'Share of the passage each chord is heard' });
    const bars = (tl?.downbeats ?? []).filter(d => d >= r.a && d < r.b).length;
    if (bars) out.push({ k: 'Change rate', v: `${(chords.length / bars).toFixed(1)} per bar`, hint: 'Chord changes divided by bars' });
  }
  const win = segs.filter(s => overlaps(s, r)).map(s => s.descriptors?.dimensions?.melodyHarmony).filter(Boolean);
  const stab = mean(win.map(h => Number(h!.harmonicStability))), conf = mean(win.map(h => Number(h!.keyConfidence)));
  if (win.length && win[0]!.key) out.push({ k: 'Key', v: `${win[0]!.key}${isNaN(conf) ? '' : ` · ${conf > 0.7 ? 'clear' : conf > 0.45 ? 'fairly clear' : 'ambiguous'} (${conf.toFixed(2)})`}`, hint: 'Key confidence: how well the notes fit one key' });
  if (!isNaN(stab)) out.push({ k: 'Tension', v: `${stab > 0.7 ? 'Settled' : stab > 0.5 ? 'Some tension' : 'Restless'} (stability ${stab.toFixed(2)})`, hint: 'Harmonic stability: how much the harmony stays put' });
  return out;
}

export interface SimilarPassage { trackId: string; a: number; b: number; sim: number }

/**
 * Passages elsewhere in the library (or later in this song) that sound most like this one:
 * cosine similarity of the windows' embeddings (multimodal = CLAP + DSP, else CLAP, else DSP),
 * the passage as the mean of the windows it covers. Its own windows are left out, and only the
 * best window per 30 s of another place is kept, so the list is not three neighbours.
 * Example: [{trackId: 'original-demo', a: 12, b: 24, sim: 0.91}, …]
 */
export function similarPassages(analyses: TrackAnalysis[], trackId: string, r: { a: number; b: number }, top = 3): SimilarPassage[] {
  const rank = (m: string) => (m === 'multimodal' ? 0 : m === 'clap' ? 1 : 2);
  const best = new Map<string, TrackAnalysis>();
  for (const an of analyses) { const cur = best.get(an.trackId); if (!cur || rank(an.method) < rank(cur.method)) best.set(an.trackId, an); }
  const mine = best.get(trackId);
  const own = mine?.segments.filter(s => overlaps(s, r) && s.embedding?.length) ?? [];
  if (!own.length) return [];
  const dim = own[0].embedding.length, q = new Float64Array(dim);
  for (const s of own) for (let i = 0; i < dim; i++) q[i] += s.embedding[i] / own.length;
  const norm = (v: ArrayLike<number>) => Math.sqrt(Array.from(v).reduce((p, x) => p + x * x, 0)) || 1;
  const qn = norm(q);
  const hits: SimilarPassage[] = [];
  for (const [tid, an] of best) {
    if (an.method !== mine!.method) continue;   // embeddings of different models do not compare
    for (const s of an.segments) {
      if (!s.embedding || s.embedding.length !== dim) continue;
      if (tid === trackId && Math.max(r.a - 6, s.startSec) < Math.min(r.b + 6, s.endSec)) continue;
      let dot = 0;
      for (let i = 0; i < dim; i++) dot += q[i] * s.embedding[i];
      hits.push({ trackId: tid, a: s.startSec, b: s.endSec, sim: dot / (qn * norm(s.embedding)) });
    }
  }
  hits.sort((x, y) => y.sim - x.sim);
  const out: SimilarPassage[] = [];
  for (const h of hits) {
    if (out.some(o => o.trackId === h.trackId && Math.abs(o.a - h.a) < 30)) continue;
    out.push(h);
    if (out.length >= top) break;
  }
  return out;
}

/** One-line teaser for a folded section's title. Example: "C3–A4 · longest note 1.8 s". */
export function teaser(rows: DetailRow[], keys: string[]): string {
  return keys.map(k => rows.find(x => x.k === k)?.v.split(' (')[0]).filter(Boolean).join(' · ');
}

