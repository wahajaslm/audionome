import Dexie, { type EntityTable } from 'dexie';
import type { ListeningEvent, Moment, Track, UserSetting, TrackAnalysis, MomentRating, PassageAnalysis } from './types';
import { extractEmbeddedPicture, toArtwork } from '../core/artwork';
export class MusicDatabase extends Dexie {
  tracks!: EntityTable<Track, 'id'>;
  moments!: EntityTable<Moment, 'id'>;
  events!: EntityTable<ListeningEvent, 'id'>;
  settings!: EntityTable<UserSetting, 'key'>;
  analyses!: EntityTable<TrackAnalysis, 'trackId'>;
  ratings!: EntityTable<MomentRating, 'id'>;
  passages!: EntityTable<PassageAnalysis, 'id'>;
  constructor() {
    super('music-dna-v1');
    this.version(1).stores({
      tracks: 'id, title, addedAt, source',
      moments: 'id, trackId, createdAt, updatedAt',
      events: 'id, trackId, sessionId, kind, at',
      settings: 'key'
    });
    this.version(2).stores({
      tracks: 'id, title, addedAt, source',
      moments: 'id, trackId, createdAt, updatedAt',
      events: 'id, trackId, sessionId, kind, at',
      settings: 'key',
      analyses: 'trackId, method, modelId, analyzedAt',
      ratings: 'id, trackId, value, createdAt'
    });
    // v3: exact analyses of saved passages (one row per moment id). Existing data is untouched.
    this.version(3).stores({
      tracks: 'id, title, addedAt, source',
      moments: 'id, trackId, createdAt, updatedAt',
      events: 'id, trackId, sessionId, kind, at',
      settings: 'key',
      analyses: 'trackId, method, modelId, analyzedAt',
      ratings: 'id, trackId, value, createdAt',
      passages: 'id, trackId'
    });
  }
}
export const db = new MusicDatabase();
/**
 * MANY FILES FIX - importing many files stopped at the first bad one ("Import failed." and the
 * rest skipped), and each file could wait 18 s for its duration, one after another.
 * Now every file is tried on its own (failures are listed, the rest still import), the duration
 * probe waits at most 4 s and runs while the file is read, and `onProgress` reports each file.
 * Example: 12 files, one broken .m4a → 11 imported, "1 could not be imported: x.m4a (Unsupported audio)".
 */
export interface ImportResult { added: Track[]; failed: { name: string; reason: string }[] }
export async function importFiles(files: FileList | File[], onProgress?: (done: number, total: number, name: string) => void): Promise<ImportResult> {
  const added: Track[] = [], failed: ImportResult['failed'] = [];
  const audio = Array.from(files).filter(file => file.type.startsWith('audio/') || /\.(mp3|wav|flac|ogg|m4a|aac|opus)$/i.test(file.name));
  for (const [i, file] of audio.entries()) {
    onProgress?.(i, audio.length, file.name);
    try {
      added.push(await importOne(file));
    } catch (err) {
      const reason = (err as Error)?.name === 'QuotaExceededError' ? 'browser storage is full' : String((err as Error)?.message || err).slice(0, 60);
      failed.push({ name: file.name, reason });
    }
  }
  onProgress?.(audio.length, audio.length, '');
  return { added, failed };
}

async function importOne(file: File): Promise<Track> {
  {
    // A file the browser cannot decode is refused (it would be a song that never plays);
    // a slow metadata read only falls back to a placeholder duration.
    const [probed, buf] = await Promise.all([
      audioDuration(file, 4000).catch((err: Error) => { if (err.message === 'Unsupported audio') throw new Error('not playable audio'); return 0; }),
      file.arrayBuffer(),
    ]);
    let durationSec = probed;
    if (!durationSec || !Number.isFinite(durationSec)) durationSec = 180;
    const title = file.name.replace(/\.[^.]+$/, '').replaceAll('_', ' ');
    const sha256 = await sha256Hex(buf);
    const nameLower = file.name.toLowerCase();
    const mimeType = file.type || (
      nameLower.endsWith('.wav') ? 'audio/wav' :
      nameLower.endsWith('.flac') ? 'audio/flac' :
      nameLower.endsWith('.ogg') ? 'audio/ogg' :
      (nameLower.endsWith('.m4a') || nameLower.endsWith('.mp4')) ? 'audio/mp4' :
      nameLower.endsWith('.aac') ? 'audio/aac' :
      nameLower.endsWith('.opus') ? 'audio/opus' : 'audio/mpeg'
    );
    const audioBlob = new Blob([buf], { type: mimeType });
    // Cover art from the file's tags; '' marks "checked, none" so it is not looked for again.
    const pic = extractEmbeddedPicture(buf);
    const art = pic ? await toArtwork(pic) : null;
    const trackItem: Track = {
      id: crypto.randomUUID(),
      title,
      artist: 'Your library',
      durationSec,
      mimeType,
      source: 'local-file',
      analysisRight: 'cleared',
      audioBlob,
      addedAt: Date.now(),
      sha256,
      artwork: art?.artwork ?? '',
      artworkColor: art?.artworkColor,
    };
    await db.tracks.add(trackItem);
    return trackItem;
  }
}
/** Hex SHA-256 of a file, or undefined where WebCrypto is unavailable (pages served over plain http from a LAN address). */
async function sha256Hex(buf: ArrayBuffer): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}
export async function audioDuration(blob: Blob, timeoutMs = 18000): Promise<number> {
  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio();
    audio.preload = 'metadata';
    const duration = await new Promise<number>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Audio metadata timeout')), timeoutMs);
      audio.onloadedmetadata = () => { clearTimeout(timeout); resolve(audio.duration); };
      audio.onerror = () => { clearTimeout(timeout); reject(new Error('Unsupported audio')); };
      audio.src = url;
    });
    return duration;
  } finally { URL.revokeObjectURL(url); }
}
export async function ensureDemo(): Promise<void> {
  const existing = await db.tracks.get('original-demo');
  if (existing?.audioBlob && existing.audioBlob.size > 1000) {
    if (existing.addedAt > 1000) await db.tracks.update('original-demo', { addedAt: 1000, analysisRight: 'cleared' });
    return;
  }
  const response = await fetch('/demo.wav');
  if (!response.ok) return;
  const blob = await response.blob();
  if (blob.size < 1000) return;
  await db.tracks.put({
    id: 'original-demo', title: 'First Light', artist: 'Music DNA • original demo', durationSec: 32,
    mimeType: 'audio/wav', source: 'demo-original', analysisRight: 'cleared', audioBlob: blob, addedAt: 1000
  });
}
export async function exportProfile(): Promise<void> {
  const [tracks, moments, events, settings, analyses, ratings] = await Promise.all([db.tracks.toArray(), db.moments.toArray(), db.events.toArray(), db.settings.toArray(), db.analyses.toArray(), db.ratings.toArray()]);
  const payload = {
    format: 'music-dna-profile-v1', exportedAt: new Date().toISOString(),
    tracks: tracks.map(t => ({ id: t.id, title: t.title, artist: t.artist, durationSec: t.durationSec, mimeType: t.mimeType, source: t.source, analysisRight: t.analysisRight, addedAt: t.addedAt, providerId: t.providerId, sha256: t.sha256 })), moments, events, settings, ratings, analyses: analyses.map(a => ({ trackId: a.trackId, method: a.method, modelId: a.modelId, analyzedAt: a.analyzedAt, segments: a.segments })),
    notice: 'Audio files are not included. This profile may include sensitive listening preferences.'
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'music-dna-profile.json'; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
