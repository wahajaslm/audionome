/**
 * Saved-moment rules: creating a moment from a selection and merging what the listener said
 * about it. Rows match what index.html writes to Dexie `moments`, so both UIs share them.
 */
import type { Moment } from '../data/types';
import { classifyFavReasons } from '../intelligence/personalize.ts';
import type { Range } from './playback';

/** Exactly the fields index.html stores (its modelMoment()). Extra in-memory fields are dropped. */
export function toDbMoment(m: Moment, now = Date.now()): Moment {
  return {
    id: String(m.id), trackId: m.trackId, startSec: m.startSec, endSec: m.endSec,
    feelings: m.feelings || [], qualities: m.qualities || [], note: m.note || '',
    createdAt: m.createdAt || now, updatedAt: now,
  };
}

/** A new, undescribed moment for a selection. */
export function newMoment(trackId: string, r: Range, id: string = crypto.randomUUID(), now = Date.now()): Moment {
  return { id, trackId, startSec: r.a, endSec: r.b, feelings: [], qualities: [], note: '', createdAt: now, updatedAt: now };
}

/**
 * Adds feelings and qualities to a moment without dropping earlier ones. Words in the note
 * that name a musical reason are added as qualities too.
 * Example: love ['Vocals'] + note "that guitar riff" -> qualities ['Vocals', 'Instruments'].
 */
export function withTags(m: Moment, feel: string[], love: string[], note: string): Moment {
  const extracted = classifyFavReasons(note || '', love || []);
  return {
    ...m,
    feelings: [...new Set([...(m.feelings || []), ...feel])],
    qualities: [...new Set([...(m.qualities || []), ...love, ...extracted])],
    note: note || m.note || '',
  };
}

/** One-line description used in lists: "Vocals · Melody", or "Saved moment". */
export const describeMoment = (m: Pick<Moment, 'qualities'>) => (m.qualities || []).join(' · ') || 'Saved moment';

/** Collections a moment belongs to: 0 chills, 1 nostalgia/home, 2 melodies. */
export function collectionsOf(m: Pick<Moment, 'feelings' | 'qualities'>): number[] {
  return [
    ...(m.feelings || []).includes('Chills') ? [0] : [],
    ...(m.feelings || []).includes('Nostalgia') ? [1] : [],
    ...(m.qualities || []).includes('Melody') ? [2] : [],
  ];
}

export interface SavedRange extends Range { id: string }

/** Saved moments of one track as waveform ranges. */
export function savedRanges(moments: Moment[], trackId: string | null): SavedRange[] {
  return moments.filter(m => m.trackId === trackId).map(m => ({ id: m.id, a: m.startSec, b: m.endSec }));
}

/** Feelings and qualities offered in the describe strip (same lists as index.html). */
export const FEELINGS = ['♡ Love', 'Chills', 'Nostalgia', 'Excitement', 'Calm', 'Sadness', 'Other'];
export const QUALITIES = ['Vocals', 'Melody', 'Harmony', 'Rhythm', 'Lyrics', 'Instruments', 'Build-up', 'Drop', 'Atmosphere'];
export const ASK_DEFAULT_CHIPS = ['Vocals', 'Melody', 'Instruments', 'Rhythm', 'Build-up'];
export const STEM_REASONS = ['Melody', 'Harmony', 'Groove', 'Instruments', 'Vocals', 'The combination'];
