/**
 * My Music DNA rules, framework-free (ported from index.html's renderDNA()).
 * Every number here comes from qualities the listener named on saved moments. Nothing is
 * predicted: a trait with no labelled moments stays at 0 %.
 */
import type { Moment } from '../data/types';
import type { MusicDnaInsight } from '../intelligence/personalize';

export interface TraitDefinition {
  /** Row name, e.g. "Vocals and lyrics". */
  name: string;
  /** Lower-case phrase used in sentences, e.g. "vocals". */
  short: string;
  /** Ring label and tab, e.g. "Vocals". */
  label: string;
  /** Qualities (from the describe strip) that count towards this trait. */
  keys: string[];
  desc: string;
}

/** The four traits, in ring order (same as index.html). */
export const TRAIT_DEFINITIONS: TraitDefinition[] = [
  { name: 'Vocals and lyrics', short: 'vocals', label: 'Vocals', keys: ['Vocals', 'Lyrics'], desc: 'The voice and words you explicitly marked' },
  { name: 'Melody and rhythm', short: 'melodic moments', label: 'Melody', keys: ['Melody', 'Rhythm', 'Build-up', 'Drop'], desc: 'Melodies, grooves and changing intensity' },
  { name: 'Atmosphere and instruments', short: 'textures', label: 'Textures', keys: ['Atmosphere', 'Instruments'], desc: 'The instrumental sounds that stood out to you' },
  { name: 'Harmony', short: 'harmony', label: 'Harmony', keys: ['Harmony'], desc: 'Chord movement you said you enjoyed' },
];

export interface Trait extends TraitDefinition {
  /** Number of saved moments labelled with any of the trait's keys. */
  n: number;
  /** Those moments, newest first (the order they come in). */
  items: Moment[];
}

/**
 * Groups moments by the qualities the listener named.
 * Example: one moment tagged ['Vocals', 'Melody'] counts once for Vocals and once for Melody.
 */
export function computeTraits(moments: Moment[]): Trait[] {
  return TRAIT_DEFINITIONS.map(d => {
    const items = moments.filter(m => (m.qualities || []).some(q => d.keys.includes(q)));
    return { ...d, n: items.length, items };
  });
}

/**
 * Share of one trait among all labelled trait-moments, rounded to whole percent.
 * Example: Vocals 3, Melody 1 → Vocals 75 %, Melody 25 %. With nothing labelled → 0.
 */
export function traitShare(n: number, total: number): number {
  return total ? Math.round((100 * n) / total) : 0;
}

/**
 * TraitRow meter level, 0–4 (classic thresholds): 1 moment Emerging (1), 2–4 Growing (2),
 * 5–7 Growing (3), 8+ Strong (4).
 */
export function traitLevel(n: number): number {
  return n >= 8 ? 4 : n >= 5 ? 3 : n >= 2 ? 2 : n ? 1 : 0;
}

/** TraitRow right-hand column words for a level. */
export function levelWord(n: number): string {
  const l = traitLevel(n);
  return l === 4 ? 'Strong match' : l >= 2 ? 'Growing' : l === 1 ? 'Emerging' : 'Not heard yet';
}

export interface RingTick { deg: number; len: number; tone: 'selected' | 'other' | 'idle' | 'empty' }
export interface RingLabel { index: number; label: string; pct: number; x: number; y: number; right: boolean }

/**
 * TraitRing geometry: each trait gets 3 ticks per moment (at least 2) plus a 3-tick gap.
 * Tick length 12–36 px swells towards the middle of its arc; empty traits and gaps are short.
 * `selected` = -1 means no trait is selected (others draw in the light "idle" tone).
 * Example: traits with n = [1, 0, 0, 0] → spans [3, 2, 2, 2] + 4 gaps of 3 → 21 ticks.
 */
export function ringLayout(traits: Trait[], selected: number, radius = 150): { ticks: RingTick[]; labels: RingLabel[] } {
  const spans = traits.map(t => Math.max(2, t.n * 3));
  const total = spans.reduce((n, v) => n + v + 3, 0);
  const sum = traits.reduce((n, t) => n + t.n, 0);
  const ticks: RingTick[] = [];
  const labels: RingLabel[] = [];
  let idx = 0, pos = 0;
  traits.forEach((t, ti) => {
    const span = spans[ti];
    for (let k = 0; k < span; k++) {
      const len = t.n ? Math.round(12 + 24 * Math.sin(Math.PI * (k + 0.5) / span)) : 9;
      const tone = !t.n ? 'empty' : ti === selected ? 'selected' : selected === -1 ? 'idle' : 'other';
      ticks.push({ deg: (idx++ / total) * 360, len, tone });
    }
    for (let g = 0; g < 3; g++) ticks.push({ deg: (idx++ / total) * 360, len: 4, tone: 'empty' });
    const mid = ((pos + span / 2) / total) * 2 * Math.PI;
    pos += span + 3;
    const x = Math.sin(mid), y = -Math.cos(mid);
    labels.push({ index: ti, label: t.label, pct: traitShare(t.n, sum), x: Math.round(x * (radius + 46)), y: Math.round(y * (radius + 34)), right: x >= 0 });
  });
  return { ticks, labels };
}

/** One part of the portrait sentence; `trait` parts are buttons that select that trait. */
export interface PortraitPart { text: string; trait?: number; strong?: boolean }

/**
 * The sentence under the ring (classic wording). A verified model insight wins; otherwise the
 * sentence only repeats what the listener labelled, and asks rather than concludes.
 * Example: Vocals 3, Melody 1 → "In your saved moments, you often mention vocals and melodic
 * moments. Is that what draws you in?"
 */
export function portraitParts(traits: Trait[], insight?: Pick<MusicDnaInsight, 'status' | 'headline' | 'evidence'>): PortraitPart[] {
  if (insight && insight.status === 'verified') {
    return [{ text: insight.headline, strong: true }, { text: ' ' + insight.evidence.join(' ') }];
  }
  const ranked = traits.map((t, i) => ({ t, i })).filter(x => x.t.n > 0).sort((a, b) => b.t.n - a.t.n);
  if (ranked.length > 1) {
    return [
      { text: 'In your saved moments, you often mention ' },
      { text: ranked[0].t.short, trait: ranked[0].i },
      { text: ' and ' },
      { text: ranked[1].t.short, trait: ranked[1].i },
      { text: '. Is that what draws you in?' },
    ];
  }
  if (ranked.length) {
    return [{ text: 'You have marked ' }, { text: ranked[0].t.short, trait: ranked[0].i }, { text: ' in your saved moments. We will keep learning as you listen.' }];
  }
  return [{ text: 'Your Music DNA begins with the moments you love. Save a passage and tell us what stood out.' }];
}

/**
 * Evidence line under one passage: what the listener marked and felt.
 * Example: qualities ['Vocals', 'Melody'], feelings ['Chills'] in the Vocals trait →
 * "You marked vocals · felt: Chills".
 */
export function evidenceNote(m: Pick<Moment, 'qualities' | 'feelings'>, trait: Pick<TraitDefinition, 'keys'>): string {
  const marked = (m.qualities || []).filter(q => trait.keys.includes(q)).join(' and ').toLowerCase();
  return 'You marked ' + marked + ((m.feelings || []).length ? ' · felt: ' + m.feelings.join(', ') : '');
}

/**
 * "Correct": removes this trait's labels from one moment and keeps everything else.
 * Example: ['Vocals', 'Lyrics', 'Melody'] corrected out of Vocals → ['Melody'].
 */
export function withoutTrait(m: Moment, trait: Pick<TraitDefinition, 'keys'>): Moment {
  return { ...m, qualities: (m.qualities || []).filter(q => !trait.keys.includes(q)) };
}
