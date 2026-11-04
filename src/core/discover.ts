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
  const mm = s.matchingMoment;
  if (!mm) return -1;
  const m = moments.find(x => x.trackId === mm.trackId && x.startSec <= mm.startSec + 3 && x.endSec >= mm.startSec);
  if (!m) return -1;
  const q = m.qualities || [];
  return TRAIT_DEFINITIONS.findIndex(d => q.some(x => d.keys.includes(x)));
}

/**
 * The "why" line. Honest about what the ranker knows: similarity to your own passages.
 * Example: anchor "First Light" → "It shares musical characteristics with one of your saved
 * passages in First Light."
 */
export function whyLine(anchorTitle?: string): string {
  return anchorTitle
    ? 'It shares musical characteristics with one of your saved passages in ' + anchorTitle + '.'
    : 'It has acoustic patterns resembling passages you have saved.';
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
