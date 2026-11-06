/**
 * Data access for the Vue app. Stores call these; components never touch Dexie directly.
 * Same database ('music-dna-v1') and row shapes as index.html, so both UIs share data.
 */
import { db, ensureDemo, exportProfile, importFiles } from '../data/db';
import { deleteTrackFromSQLite } from '../intelligence/client';
import type { ListeningEvent, Moment, MomentRating, Track, TrackAnalysis, PassageAnalysis } from '../data/types';
import { SERVICE, namedFromCorpus, type CorpusTitles } from './library';
import { toDbMoment } from './moments';

export { ensureDemo };

/** Imports audio files into Dexie `tracks` (same rows as the classic importer). Non-audio files are skipped. */
export const importAudioFiles = (files: FileList | File[], onProgress?: (done: number, total: number, name: string) => void) => importFiles(files, onProgress);

/**
 * Downloads the profile JSON ('music-dna-profile.json'): tracks without audio, moments, events,
 * settings, ratings, analyses. Audio files are never included.
 */
export const downloadProfile = (): Promise<void> => exportProfile();

/**
 * Removes a song and everything derived from it: its analyses and saved moments here, and the
 * service's copy (silently skipped when the service is off). Same as the classic 'deltrack'.
 */
export async function deleteTrackEverywhere(id: string): Promise<void> {
  await rememberDeleted(id);
  await db.tracks.delete(id);
  await db.analyses.where('trackId').equals(id).delete();
  await db.moments.where('trackId').equals(id).delete();
  await deleteTrackFromSQLite(id);
}

/** "I like it" / "Not for me" on a suggestion. */
export const putRating = (r: MomentRating) => db.ratings.put(r);

/** Erases the private listening log; saved moments, ratings and settings are kept. */
export const clearListeningEvents = () => db.events.clear();

/**
 * Deletes everything this app stored on this device: imported songs, saved moments, ratings,
 * listening history, analyses and settings. The built-in demo recording is put back afterwards.
 * Also asks the local analysis service to drop its copies of those songs (skipped if it is off).
 * Example: after a reset the Library shows only "First Light", My Moments is empty, and
 * Settings are back to their defaults.
 */
export async function deleteAllUserData(): Promise<number> {
  const trackIds = (await db.tracks.toArray()).map(t => t.id).filter(id => id !== 'original-demo');
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
  });
  await Promise.all(trackIds.map(id => deleteTrackFromSQLite(id)));
  await ensureDemo();
  return trackIds.length;
}

/** Newest first, like the classic Library. */
export const loadTracks = (): Promise<Track[]> => db.tracks.orderBy('addedAt').reverse().toArray();
export const loadMoments = (): Promise<Moment[]> => db.moments.orderBy('createdAt').reverse().toArray();

export async function loadIntelligenceInputs(): Promise<{ analyses: TrackAnalysis[]; ratings: MomentRating[]; events: ListeningEvent[] }> {
  const [analyses, ratings, events] = await Promise.all([db.analyses.toArray(), db.ratings.toArray(), db.events.toArray()]);
  return { analyses, ratings, events };
}

export const putTrack = (t: Track) => db.tracks.put(t);
export const putMoment = (m: Moment) => db.moments.put(toDbMoment(m));
export const deleteMoment = (id: string) => Promise.all([db.moments.delete(String(id)), db.passages.delete(String(id))]);
export const loadPassages = (): Promise<PassageAnalysis[]> => db.passages.toArray();
export const putPassage = (p: PassageAnalysis) => db.passages.put(p);
export const putAnalysis = (a: TrackAnalysis) => db.analyses.put(a);
export const updateTrackDuration = (id: string, durationSec: number) => db.tracks.update(id, { durationSec }).catch(() => { });
export const updateTrackPeaks = (id: string, peaks: { peaks: number[][]; duration: number }) => db.tracks.update(id, { peaks }).catch(() => { });
export const updateTrackLoudness = (id: string, loudnessLufs: number, peakDb: number) => db.tracks.update(id, { loudnessLufs, peakDb }).catch(() => { });

/** Event sink for ListeningLog. */
export const eventSink = { add: (e: ListeningEvent) => db.events.add(e) };

export async function getSetting<T extends boolean | number | string>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined;
}
export const putSetting = (key: string, value: boolean | number | string) => db.settings.put({ key, value });

// DELETE FIX - a deleted song came back on the next library load: the sync below re-adds
// every song the analysis service still has, and the service's copy could survive (delete
// request failed while the service was busy, or a running analysis saved it again).
// Deleted ids are remembered on this device and never re-added by the sync.
// Example: delete "Naina Moray" while its analysis runs -> it stays deleted after reload.
const DELETED_KEY = 'deletedTrackIds';
async function deletedIds(): Promise<Set<string>> {
  try { return new Set(JSON.parse((await getSetting<string>(DELETED_KEY)) || '[]') as string[]); } catch { return new Set(); }
}
async function rememberDeleted(id: string): Promise<void> {
  const ids = await deletedIds();
  ids.add(id);
  await putSetting(DELETED_KEY, JSON.stringify([...ids]));
}
/** The listener added this song again (e.g. the same link): the sync may bring it back. */
export async function forgetDeleted(id: string): Promise<void> {
  const ids = await deletedIds();
  if (ids.delete(id)) await putSetting(DELETED_KEY, JSON.stringify([...ids]));
}

/**
 * Pulls analyses the local Python service already holds (e.g. from another browser) into
 * IndexedDB, adding placeholder track rows for unknown ids. Silent when the service is off.
 * Same merge rules as index.html's refreshLibrary().
 */
/** Renames placeholder-named songs from the corpus manifests (rule: namedFromCorpus). */
export async function nameFromCorpus(): Promise<number> {
  const res = await fetch(SERVICE + '/api/corpus/titles', { signal: AbortSignal.timeout(3000) }).catch(() => null);
  if (!res || !res.ok) return 0;
  const titles: CorpusTitles = await res.json();
  let renamed = 0;
  for (const t of await db.tracks.toArray()) {
    const name = namedFromCorpus(t, titles);
    if (name) { await db.tracks.update(t.id, name).catch(() => { }); renamed++; }
  }
  return renamed;
}

export async function syncFromAnalysisService(): Promise<void> {
  try {
    const res = await fetch(SERVICE + '/api/db/analyses', { signal: AbortSignal.timeout(1800) }).catch(() => null);
    if (!res || !res.ok) return;
    const sqlRows: Array<Partial<TrackAnalysis> & { trackId?: string; title?: string; artist?: string }> = await res.json();
    const existingIds = new Set((await db.tracks.toArray()).map(x => x.id));
    const deleted = await deletedIds();
    for (const r of sqlRows) {
      if (!r.trackId || deleted.has(r.trackId)) continue;
      if (!existingIds.has(r.trackId) && r.trackId !== 'original-demo') {
        existingIds.add(r.trackId);
        await db.tracks.put({
          id: r.trackId,
          title: (r.title && r.title !== r.trackId) ? r.title : r.trackId,
          artist: r.artist || 'Your library',
          durationSec: r.durationSec || 180,
          mimeType: 'audio/mpeg', source: 'local-file', analysisRight: 'cleared', addedAt: Date.now(),
        }).catch(() => { });
      }
      if (r.method === 'multimodal' || !sqlRows.some(x => x.trackId === r.trackId && x.method === 'multimodal')) {
        await db.analyses.put({
          trackId: r.trackId, method: r.method || 'multimodal', modelId: r.modelId || 'multimodal',
          durationSec: r.durationSec || 32, analyzedAt: Date.now(), segments: r.segments || [],
        }).catch(() => { });
      }
    }
  } catch { /* service unavailable: keep local data */ }
}
