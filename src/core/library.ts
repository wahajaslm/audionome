/**
 * Track sources and the local analysis service: which URL plays a track, which stem URL to
 * switch to, and the background jobs that keep the service's copy of the library in sync.
 */
import type { Track } from '../data/types';

export const SERVICE = 'http://127.0.0.1:8765';

/** Tracks opened from a stream carry their playable URL (set by the stream importer). */
export type PlayableTrack = Track & { streamPlaybackUrl?: string };

/** The URL used when the track has no stored audio, or the stored audio fails to play. */
export function fallbackUrl(t: PlayableTrack): string {
  return t.id === 'original-demo' ? '/demo.wav' : (t.streamPlaybackUrl || (SERVICE + '/api/audio/' + encodeURIComponent(t.id)));
}

/** Full-mix URL used when switching back from a stem (index.html's behaviour). */
export function fullMixUrl(trackId: string): string {
  return trackId === 'original-demo' ? '/demo.wav' : (SERVICE + '/api/audio/' + encodeURIComponent(trackId));
}

/** URL of one separated stem ('vocals', 'drums', 'bass', 'other'); 'all' is the full mix. */
export function stemUrl(trackId: string, stem: string): string {
  return stem === 'all' ? fullMixUrl(trackId)
    : (SERVICE + '/api/audio/stem/' + encodeURIComponent(trackId) + '/' + encodeURIComponent(stem));
}

export interface ResolvedSource {
  /** What the <audio> element loads. */
  srcUrl: string;
  /** Used if srcUrl fails. */
  fallbackUrl: string;
  /** The stored audio, when there is one (decoded for peaks without a second download). */
  blob: Blob | null;
  /** Object URL created for the blob; revoke it when the track changes. */
  objectUrl: string | null;
}

/**
 * Picks the stored audio when it is readable, otherwise the fallback URL.
 * Reading the first 16 bytes proves the Blob is still backed by data (IndexedDB can return
 * an empty or detached Blob after storage pressure).
 */
export async function resolveTrackSource(t: PlayableTrack): Promise<ResolvedSource> {
  const fb = fallbackUrl(t);
  if (t.audioBlob) {
    try {
      const candidate = (t.audioBlob instanceof Blob) ? t.audioBlob : new Blob([t.audioBlob], { type: t.mimeType || 'audio/mpeg' });
      if (candidate.size > 0) {
        await candidate.slice(0, 16).arrayBuffer();
        const objectUrl = URL.createObjectURL(candidate);
        return { srcUrl: objectUrl, fallbackUrl: fb, blob: candidate, objectUrl };
      }
    } catch { /* fall through to the fallback URL */ }
  }
  return { srcUrl: fb, fallbackUrl: fb, blob: null, objectUrl: null };
}

// DELAY FIX 4 - copy library audio to the local analysis service one file at a time, 3 s
// after start-up, instead of every file at once while the first track is loading.
// Example: 30 imported songs used to start 30 parallel uploads just as you pressed play.
export function scheduleSequentialUploads(tracks: () => Track[], upload: (t: Track) => Promise<void>, delayMs = 3000): void {
  setTimeout(async () => {
    for (const t of tracks()) {
      if (t.id !== 'original-demo') await upload(t).catch(() => { });
    }
  }, delayMs);
}
