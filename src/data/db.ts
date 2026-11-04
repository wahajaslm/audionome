import Dexie, { type EntityTable } from 'dexie';
import type { ListeningEvent, Moment, Track, UserSetting, TrackAnalysis, MomentRating } from './types';
export class MusicDatabase extends Dexie {
  tracks!: EntityTable<Track, 'id'>;
  moments!: EntityTable<Moment, 'id'>;
  events!: EntityTable<ListeningEvent, 'id'>;
  settings!: EntityTable<UserSetting, 'key'>;
  analyses!: EntityTable<TrackAnalysis, 'trackId'>;
  ratings!: EntityTable<MomentRating, 'id'>;
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
  }
}
export const db = new MusicDatabase();
export async function importFiles(files: FileList | File[]): Promise<Track[]> {
  const added: Track[] = [];
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|flac|ogg|m4a|aac|opus)$/i.test(file.name)) continue;
    let durationSec = await audioDuration(file).catch(() => 0);
    if (!durationSec || !Number.isFinite(durationSec)) durationSec = 180;
    const title = file.name.replace(/\.[^.]+$/, '').replaceAll('_', ' ');
    const buf = await file.arrayBuffer();
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
    const trackItem: Track = {
      id: crypto.randomUUID(),
      title,
      artist: 'Your library',
      durationSec,
      mimeType,
      source: 'local-file',
      analysisRight: 'cleared',
      audioBlob,
      addedAt: Date.now()
    };
    await db.tracks.add(trackItem);
    added.push(trackItem);
  }
  return added;
}
export async function audioDuration(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio();
    audio.preload = 'metadata';
    const duration = await new Promise<number>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Audio metadata timeout')), 18000);
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
    tracks: tracks.map(t => ({ id: t.id, title: t.title, artist: t.artist, durationSec: t.durationSec, mimeType: t.mimeType, source: t.source, analysisRight: t.analysisRight, addedAt: t.addedAt, providerId: t.providerId })), moments, events, settings, ratings, analyses: analyses.map(a => ({ trackId: a.trackId, method: a.method, modelId: a.modelId, analyzedAt: a.analyzedAt, segments: a.segments })),
    notice: 'Audio files are not included. This profile may include sensitive listening preferences.'
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'music-dna-profile.json'; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
