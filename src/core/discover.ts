/**
 * Discover rules, framework-free (ported from index.html's renderDiscover() and rate()).
 * Suggestions come from the personal ranker (intelligence/personalize.ts personalRecommendations);
 * this file only groups them, explains them and turns feedback into rating rows.
 */
import type { Moment, MomentRating } from '../data/types';
import type { PreferenceSuggestion } from '../intelligence/personalize';
import { TRAIT_DEFINITIONS } from './dna.ts';

/** Tabs: "All suggestions" then one per trait. Tab i > 0 shows trait i - 1. */
export const DISCOVER_TABS = ['All suggestions', ...TRAIT_DEFINITIONS.map(d => d.label)];

/**
 * Which trait a suggestion belongs to: the trait of the saved moment it resembles
 * (first match in ring order), or -1 when it has no labelled anchor.
 * Example: a suggestion anchored on a moment tagged ['Melody'] → 1 (Melody tab).
 */
export function suggestionFamily(s: Pick<PreferenceSuggestion, 'matchingMoment'>, moments: Moment[]): number {
  const m = anchorMoment(s, moments);
  if (!m) return -1;
  const q = m.qualities || [];
  return TRAIT_DEFINITIONS.findIndex(d => q.some(x => d.keys.includes(x)));
}

/** The saved moment a suggestion resembles (undefined when it matched a liked suggestion instead). */
export function anchorMoment(s: Pick<PreferenceSuggestion, 'matchingMoment'>, moments: Moment[]): Moment | undefined {
  const mm = s.matchingMoment;
  return mm ? moments.find(x => x.trackId === mm.trackId && x.startSec <= mm.startSec + 3 && x.endSec >= mm.startSec) : undefined;
}

const mmss = (sec: number) => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');

/**
 * The line under a suggestion, in plain words: how close it is and to which of your moments.
 * PLAIN WORDS FIX - it used to read "It shares musical characteristics with one of your saved
 * passages in …" on every row. Example: (score 0.8, 'First Light', 102) →
 * "Close to your moment in First Light · 1:42".
 */
export function whyLine(anchorTitle?: string, score = 0.5, anchorStartSec?: number): string {
  const how = score >= 0.7 ? 'Close to' : score >= 0.5 ? 'Like' : 'A little like';
  if (!anchorTitle) return how + ' passages you liked';
  return `${how} your moment in ${anchorTitle}` + (anchorStartSec !== undefined ? ' · ' + mmss(anchorStartSec) : '');
}

/** Ranker evidence → the quality words used on moments. Measures with no listener word are dropped. */
const EVIDENCE_TO_QUALITY: [RegExp, string][] = [
  [/vocals/, 'Vocals'], [/^shared .* key$/, 'Harmony'], [/groove|rhythmic/, 'Rhythm'],
  [/instruments/, 'Instruments'], [/texture|brightness|tonal\/noise/, 'Atmosphere'],
];

/**
 * Discover's pills, in the same words as My Moments: the tags of the moment it resembles, then
 * what it shares with it, as qualities. At most 4, no repeats.
 * PILLS FIX - pills read "Strong match", "similar tonal/noise balance": measurements, not words
 * a listener uses. Example: anchor tagged Chills + Vocals, evidence ['shared B Minor key',
 * 'vocals up front', 'similar energy'] → ['Chills', 'Vocals', 'Harmony'].
 */
export function suggestionPills(evidence: string[], anchor?: Pick<Moment, 'feelings' | 'qualities'>): string[] {
  const shared = evidence.flatMap(e => EVIDENCE_TO_QUALITY.filter(([re]) => re.test(e)).map(([, q]) => q));
  return [...new Set([...(anchor?.feelings || []), ...(anchor?.qualities || []), ...shared])].slice(0, 4);
}

/**
 * The Dexie `ratings` row for "I like it" / "Not for me". The id is trackId:startSec, so
 * rating the same passage again replaces the earlier answer instead of adding a second one.
 * Example: ('t1', 12, 24, 'like') → { id: 't1:12', value: 'like', … }.
 */
export function ratingRow(s: Pick<PreferenceSuggestion, 'trackId' | 'startSec' | 'endSec'>, value: MomentRating['value'], now = Date.now()): MomentRating {
  return { id: s.trackId + ':' + s.startSec, trackId: s.trackId, startSec: s.startSec, endSec: s.endSec, value, createdAt: now };
}

/** The listener's current answer for a suggestion, if any. */
export function ratingOf(s: Pick<PreferenceSuggestion, 'trackId' | 'startSec'>, ratings: MomentRating[]): MomentRating['value'] | undefined {
  return ratings.find(r => r.id === s.trackId + ':' + s.startSec)?.value;
}
