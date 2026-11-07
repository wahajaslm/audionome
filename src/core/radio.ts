/**
 * Moment radio: an endless stream of passages chosen for you, faded into each other.
 *
 * Mostly passages the personal ranker suggests (Discover), with one of your saved moments
 * every 4th, so the stream stays familiar. Never a passage you said "Not for me" to, never
 * the same passage twice in one run, never the same song twice in a row when avoidable.
 * Example: suggestions S1..S9, moments M1..M3 → S1 S2 S3 M1 S4 S5 S6 M2 S7 …
 */
import type { MomentRating } from '../data/types';

export interface RadioItem { trackId: string; a: number; b: number; source: 'suggestion' | 'moment' }

/** Every Nth item is one of your saved moments. */
export const MOMENT_EVERY = 4;

export const radioKey = (x: { trackId: string; a: number }) => x.trackId + ':' + Math.round(x.a);

const overlap = (x: { trackId: string; a: number; b: number }, y: { trackId: string; startSec: number; endSec: number }) =>
  x.trackId === y.trackId && Math.max(x.a, y.startSec) < Math.min(x.b, y.endSec);

/**
 * The next `n` passages. `suggestions` are best first; `played` holds radioKey of what this run
 * already played; `lastTrackId` is the song playing now (the next item avoids it).
 */
export function radioQueue(
  suggestions: { trackId: string; startSec: number; endSec: number }[],
  moments: { trackId: string; startSec: number; endSec: number }[],
  ratings: Pick<MomentRating, 'trackId' | 'startSec' | 'endSec' | 'value'>[],
  played: Set<string>,
  n = 8,
  lastTrackId: string | null = null,
): RadioItem[] {
  const disliked = ratings.filter(r => r.value === 'dislike');
  const fresh = (x: RadioItem) => !played.has(radioKey(x)) && !disliked.some(d => overlap(x, d));
  const sugg = suggestions.map(s => ({ trackId: s.trackId, a: s.startSec, b: s.endSec, source: 'suggestion' as const }))
    .filter(x => fresh(x) && !moments.some(m => overlap(x, m)));
  const moms = moments.map(m => ({ trackId: m.trackId, a: m.startSec, b: m.endSec, source: 'moment' as const })).filter(fresh);
  const out: RadioItem[] = [];
  const taken = new Set<string>();
  let last = lastTrackId;
  // Prefer a different song from the one just played; fall back to any.
  const pick = (pool: RadioItem[]) => {
    const ok = pool.filter(x => !taken.has(radioKey(x)));
    return ok.find(x => x.trackId !== last) ?? ok[0];
  };
  while (out.length < n) {
    const wantMoment = (played.size + out.length + 1) % MOMENT_EVERY === 0;
    const next = (wantMoment ? pick(moms) : undefined) ?? pick(sugg) ?? pick(moms);
    if (!next) break;
    out.push(next); taken.add(radioKey(next)); last = next.trackId;
  }
  return out;
}
