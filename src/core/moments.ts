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

/** The three automatic collections (classic COLLS), filled from what the listener said. */
export const COLLECTIONS = ['Moments that give me chills', 'Moments that remind me of home', 'Beautiful melodies'];

/** Collections a moment belongs to: 0 chills, 1 nostalgia/home, 2 melodies. */
export function collectionsOf(m: Pick<Moment, 'feelings' | 'qualities'>): number[] {
  return [
    ...(m.feelings || []).includes('Chills') ? [0] : [],
    ...(m.feelings || []).includes('Nostalgia') ? [1] : [],
    ...(m.qualities || []).includes('Melody') ? [2] : [],
  ];
}

/**
 * My Moments tab filter: tab 0 is "All moments", tab i is collection i - 1.
 * Example: a moment felt as 'Chills' shows under tab 0 and tab 1.
 */
export function inTab(m: Pick<Moment, 'feelings' | 'qualities'>, tab: number): boolean {
  return tab === 0 || collectionsOf(m).includes(tab - 1);
}

/**
 * Editing a saved moment from My Moments: unlike withTags (which only adds, for the ask row),
 * an edit replaces feelings, qualities and note with exactly what the listener left pressed.
 * Example: unpressing 'Vocals' on ['Vocals', 'Melody'] saves ['Melody'] — and the DNA ring
 * loses that vocal moment, because the ring only counts what you labelled.
 */
export function withEdits(m: Moment, feelings: string[], qualities: string[], note: string): Moment {
  return { ...m, feelings: [...new Set(feelings)], qualities: [...new Set(qualities)], note: note.trim() };
}

/** Total seconds of a list of moments ("Play 4 moments · 1:12"). */
export const totalSeconds = (list: Pick<Moment, 'startSec' | 'endSec'>[]) => list.reduce((s, m) => s + (m.endSec - m.startSec), 0);

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
