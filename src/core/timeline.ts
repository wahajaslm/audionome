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

/**
 * Starts the job, or moves it to the front (the song being played). front=false adds it to the
 * back of the service's line instead (background analysis queue).
 * 'off' = no answer; 'outdated' = the service answers but has no timeline route (started
 * before this code, needs a restart). Example: POST → 404 Not Found → 'outdated'.
 */
export async function startTimeline(trackId: string, fetcher: typeof fetch = fetch, front = true): Promise<'ok' | 'off' | 'outdated'> {
  try {
    const url = SERVICE_URL + '/api/timeline/' + encodeURIComponent(trackId) + (front ? '' : '?front=false');
    const r = await fetcher(url, { method: 'POST', signal: AbortSignal.timeout(5000) });
    return r.ok ? 'ok' : r.status === 404 || r.status === 405 ? 'outdated' : 'off';
  } catch { return 'off'; }
}

/** One song's job status from POST /api/timelines/status (Library progress bars). */
export interface TimelineJobStatus {
  quick?: 'waiting' | 'running' | 'done' | 'error' | 'stale';
  full?: 'waiting' | 'running' | 'done' | 'error' | 'stale';
  stage?: string;
  /** Place in the service's line while waiting (1 = next). */
  position?: number;
  running?: boolean;
}

/** Status for many songs in one call; songs never started are missing. Empty when the service is off. */
export async function fetchTimelineStatuses(ids: string[], fetcher: typeof fetch = fetch): Promise<Record<string, TimelineJobStatus>> {
  try {
    const r = await fetcher(SERVICE_URL + '/api/timelines/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }), signal: AbortSignal.timeout(5000),
    });
    return r.ok ? await r.json() : {};
  } catch { return {}; }
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

export interface PassageMoment { at: number; text: string; needs: 'quick' | 'full'; ghost?: number; /** Stems that drop out, for a drop-out moment. */ stems?: StemName[] }

const fmt = (s: number) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const STEM_WORD: Record<StemName, string> = { vocals: 'vocals', drums: 'drums', bass: 'bass', other: 'other instruments' };
/** "drums", "drums and bass", "drums, bass and other instruments". */
function listStems(stems: StemName[]): string {
  const w = stems.map(x => STEM_WORD[x]);
  return w.length < 2 ? w.join('') : w.slice(0, -1).join(', ') + ' and ' + w[w.length - 1];
}

/**
 * Up to three one-line moments in the passage, from the measured curves:
 *   stems that drop out and come back   (needs stems)
 *   a chord pattern heard elsewhere     (quick tier)
 *   the highest sung note and the range (needs stems)
 * Example (1:35–2:41): "1:44 Drums and bass drop out until 1:49."
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
          // SHORT DIP FIX - a gap under 1.5 s is a breath between phrases, not a drop-out.
          // Example: vocals, bass and other dip for 0.4 s at 1:40 → no "Almost everything stops".
          if (j - i >= 1.5 * fps) events.push({ s, a: i / fps, b: j / fps });
          i = j + 20;
        } else i++;
      }
    }
    if (events.length) {
      events.sort((x, y) => x.a - y.a);
      const g = events.filter(e => Math.abs(e.a - events[0].a) < 1.5);
      const stems = STEM_NAMES.filter(s => g.some(e => e.s === s));
      const back = Math.min(...g.map(e => e.b)), until = back < r.b ? ` until ${fmt(back)}` : ' for the rest of the passage';
      // Example: "Drums and bass drop out until 1:49. The voice carries it alone."
      const alone = ['drums', 'bass', 'other'].every(s => stems.includes(s as StemName)) && !stems.includes('vocals');
      const text = stems.length >= 3 && stems.includes('vocals')
        ? `Almost everything stops${until}.`
        : `${cap(listStems(stems))} ${stems.length === 1 && stems[0] === 'bass' ? 'drops' : 'drop'} out${until}.${alone ? ' The voice carries it alone.' : ''}`;
      out.push({ at: events[0].a, needs: 'full', stems, text });
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

export interface SheetBar { n: number; a: number; b: number; chords: string[] }
export interface SheetSection { label: string; a: number; b: number; bars: SheetBar[] }

/**
 * The song as a chord sheet: bars from the downbeats, each with the chords that fill at least a
 * quarter of it (at most two, in order), grouped into the song's parts.
 * Example: part D 1:57–3:46 → bars 39–74, "Dm | Dm C | F | C …".
 * Bars before the first downbeat form a pickup bar 0.
 */
export function chordSheet(tl: Timeline): SheetSection[] {
  const downs = tl.downbeats ?? [], chords = tl.chords ?? [], parts = tl.sections ?? [];
  const end = tl.durationSec ?? (chords.length ? chords[chords.length - 1].b : 0);
  if (!downs.length || !chords.length) return [];
  const edges = (downs[0] > 0.5 ? [0] : []).concat(downs, [end]);
  const first = downs[0] > 0.5 ? 0 : 1;
  const bars: SheetBar[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i], b = edges[i + 1];
    if (b - a < 0.05) continue;
    const inBar = chords
      .map(c => ({ c: c.c, a: Math.max(a, c.a), len: Math.min(b, c.b) - Math.max(a, c.a) }))
      .filter(x => x.len >= 0.25 * (b - a))
      .sort((x, y) => x.a - y.a)
      .slice(0, 2)
      .map(x => x.c);
    bars.push({ n: i + first, a, b, chords: inBar.length ? inBar : ['—'] });
  }
  const partAt = (t: number) => parts.find(p => t >= p.a && t < p.b)?.label ?? '';
  const out: SheetSection[] = [];
  for (const bar of bars) {
    const label = partAt((bar.a + bar.b) / 2), last = out[out.length - 1];
    if (last && last.label === label) { last.bars.push(bar); last.b = bar.b; }
    else out.push({ label, a: bar.a, b: bar.b, bars: [bar] });
  }
  return out;
}

export interface ChartPart {
  label: string;
  /** Every place this part is heard, in order. */
  times: { a: number; b: number }[];
  /** The bars that repeat, e.g. [['C#'], ['D#m']] for "| C# | D#m |". */
  pattern: string[][];
  /** How many times the pattern fills the part's longest take (rounded). */
  repeats: number;
  /** Bars not shown when the part has no repeating pattern (only its first 8 are). */
  more: number;
  /** Bars of the longest take, for "show every bar". */
  bars: SheetBar[];
}

/**
 * The chord sheet as a chord chart: each kind of part once, as its shortest repeating bar
 * pattern, with every place it is heard. A pattern of 1, 2, 4 or 8 bars is used when its main chords
 * match at least 75% of the bars; otherwise the first 8 bars are shown.
 *
 * CHART FIX - the sheet printed every bar of every take (127 cells for a 4:47 song), so the
 * page was all chords and no structure.
 * Example (song 06f0b181): part C, 23 bars → pattern "‖ D#m | G#m | G#m | C#m ‖" ×6, heard 5×.
 */
export function chordChart(tl: Timeline): { order: SheetSection[]; parts: ChartPart[] } {
  const order = chordSheet(tl), byLabel = new Map<string, SheetSection[]>();
  for (const s of order) { const list = byLabel.get(s.label) ?? []; list.push(s); byLabel.set(s.label, list); }
  const parts: ChartPart[] = [];
  for (const [label, takes] of byLabel) {
    const longest = takes.reduce((x, y) => (y.bars.length > x.bars.length ? y : x));
    // Bars are compared by their main (first) chord, so "D#m C#m" and "D#m" count as the same bar.
    const cells = longest.bars.map(b => b.chords[0]);
    let size = 0;
    for (const L of [1, 2, 4, 8]) {
      if (L * 2 > cells.length) break;
      const hits = cells.filter((c, i) => c === cells[i % L]).length;
      if (hits / cells.length >= 0.75) { size = L; break; }
    }
    // No repeating pattern: show the first 8 bars; "every bar" has the rest.
    const shown = size || Math.min(8, cells.length);
    parts.push({
      label,
      times: takes.map(t => ({ a: t.a, b: t.b })),
      pattern: longest.bars.slice(0, shown).map(b => b.chords),
      repeats: size ? Math.max(1, Math.round(cells.length / size)) : 1,
      more: size ? 0 : cells.length - shown,
      bars: longest.bars,
    });
  }
  parts.sort((x, y) => x.label.localeCompare(y.label));
  return { order, parts };
}

/** What the timeline measured in a passage, as salience for the "What stood out?" chips. */
export interface PassageEvidence {
  /** 0..1 per chip: how strongly the audio points at it. */
  salience: Record<string, number>;
  /** The question for the strongest evidence. */
  question: string;
}

/**
 * ADAPTIVE QUESTION FIX - the question after Save read one 12 s window's energy slope and vocal
 * share, so most passages got "What stood out?" or a guess about a build-up. It now asks about
 * what the timeline measured in this passage, strongest first:
 *   drums/bass drop out → Drop      loudness rises → Build-up      strong or wide voice → Vocals, Melody
 *   chords come back elsewhere → Harmony      heavy drums → Rhythm      other stem leads → Instruments
 * Example (1:35–2:41): "Saved. Was it the drop at 1:44, when the drums and bass cut out?"
 * Returns null before the quick tier has arrived (the window rule is used then).
 */
export function passageEvidence(tl: Timeline | null | undefined, r: { a: number; b: number }): PassageEvidence | null {
  if (!tl?.mix?.length) return null;
  const fps = tl.fps ?? 10, i0 = Math.floor(r.a * fps), i1 = Math.max(i0 + 1, Math.ceil(r.b * fps));
  const mean = (c: ArrayLike<number> | undefined, a = i0, b = i1) => {
    if (!c) return 0;
    let s = 0, n = 0;
    for (let i = a; i < Math.min(b, c.length); i++) { s += Number(c[i]); n++; }
    return n ? s / n : 0;
  };
  /** Where the passage sits among every frame of the song (0..1). */
  const songRank = (c: number[] | undefined) => (c?.length ? rankIn([...c].sort((x, y) => x - y), mean(c)) : 0);
  const sal: Record<string, number> = { Vocals: 0.35, Melody: 0.35, Harmony: 0.3, Rhythm: 0.3, Instruments: 0.3, 'Build-up': 0.2, Drop: 0.15, Atmosphere: 0.3 };
  const asks: { score: number; q: string }[] = [];

  // Only the backing leaving is a drop (drums, or bass with the other instruments); everything
  // stopping is a break; the bass alone pausing is neither. Example: bass only → no drop question.
  const out = passageMoments(tl, r).find(m => m.stems?.length);
  const st = out?.stems ?? [];
  if (out && st.length >= 3 && st.includes('vocals')) {
    sal.Drop = 0.85;
    asks.push({ score: 0.85, q: `Saved. Was it the break at ${fmt(out.at)}, when almost everything stops?` });
  } else if (out && (st.includes('drums') || (st.includes('bass') && st.includes('other')))) {
    sal.Drop = 0.95;
    asks.push({ score: 0.95, q: `Saved. Was it the drop at ${fmt(out.at)}, when the ${listStems(st)} cut out?` });
  }
  const third = Math.max(1, Math.floor((i1 - i0) / 3));
  const rise = mean(tl.mix, i1 - third, i1) - mean(tl.mix, i0, i0 + third);
  if (rise > 0.08) {
    sal['Build-up'] = Math.min(1, 0.5 + rise * 3);
    asks.push({ score: sal['Build-up'], q: `Saved. Was it the build-up? It gets louder towards ${fmt(r.b)}.` });
  }
  const vocals = songRank(tl.stems?.vocals);
  const mel = tl.melody ? tl.melody.midi.slice(Math.floor(r.a * tl.melody.fps), Math.ceil(r.b * tl.melody.fps)).filter((v): v is number => v != null) : [];
  const span = mel.length > 50 ? quantile(mel, 0.95) - quantile(mel, 0.05) : 0;
  if (tl.stems) sal.Vocals = Math.max(sal.Vocals, vocals);
  if (span) sal.Melody = Math.min(1, 0.3 + span / 20);
  if (vocals > 0.7 || span >= 12) {
    asks.push({ score: Math.min(0.9, Math.max(vocals, span / 16)),   // a real drop (0.95) outranks the voice
      q: span >= 12 ? `Saved. Was it the voice? It climbs to ${noteName(quantile(mel, 0.95))} here.` : 'Saved. Was it the voice? It is up front here.' });
  }
  const rep = (tl.repeats ?? []).filter(x => x.at >= r.a && x.at < r.b).sort((x, y) => y.sim - x.sim)[0];
  if (rep) {
    sal.Harmony = Math.max(sal.Harmony, rep.sim * 0.8);
    asks.push({ score: rep.sim * 0.7, q: `Saved. Was it this chord pattern? It comes back at ${fmt(rep.same_as)}.` });
  }
  const drums = songRank(tl.stems?.drums), other = songRank(tl.stems?.other);
  if (tl.stems) {
    sal.Rhythm = Math.max(sal.Rhythm, drums);
    sal.Instruments = Math.max(sal.Instruments, other * (1 - vocals * 0.5));
    if (drums > 0.75) asks.push({ score: drums * 0.75, q: 'Saved. Was it the rhythm? The drums are at their heaviest here.' });
    if (other > 0.75 && vocals < 0.4) asks.push({ score: other * 0.7, q: 'Saved. Was it the instruments? They carry this part.' });
  }
  asks.sort((x, y) => y.score - x.score);
  return { salience: sal, question: asks[0]?.q ?? 'Saved. What stood out in this passage?' };
}

/**
 * LABEL FIX - the lanes labelled every bar (or every 4th) and every 10 s whatever the zoom, so
 * across a whole song the numbers ran into each other. This picks the smallest step from
 * `steps` whose labels are at least `minPx` apart.
 * Example: 137 bars on 820 px (6 px per bar), steps 1·2·4·8·16…, 34 px → every 8th bar.
 */
export function labelStep(pxPerUnit: number, steps: number[], minPx: number): number {
  for (const s of steps) if (s * pxPerUnit >= minPx) return s;
  return steps[steps.length - 1];
}
export const BAR_STEPS = [1, 2, 4, 8, 16, 32, 64];
export const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300];
