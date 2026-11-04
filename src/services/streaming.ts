/**
 * Streaming Client Service for YouTube, SoundCloud, Direct Web Audio, and Progressive SSE.
 */
import type { Track, TrackAnalysis, AudioSegment } from '../data/types';

import { SERVICE_URL } from '../core/service';
const ENDPOINT = SERVICE_URL;

export interface StreamResolvedMetadata {
  id: string;
  source: 'youtube' | 'soundcloud' | 'bandcamp' | 'direct' | 'web-stream';
  title: string;
  artist: string;
  durationSec: number;
  thumbnail: string;
  originalUrl: string;
  streamUrl: string;
  isDirect: boolean;
}

export interface StreamAnalysisEvent {
  trackId: string;
  /** Which analysis is being sent: a replay of a saved one, or the quick pass (modelId ends ':quick'). */
  method?: TrackAnalysis['method'];
  modelId?: string;
  index: number;
  total: number;
  segment: AudioSegment;
  status: 'processing' | 'complete';
  error?: string;
}

/**
 * Resolves a streaming URL (YouTube, SoundCloud, direct audio) via the Python backend.
 */
export async function resolveStreamUrl(url: string): Promise<StreamResolvedMetadata> {
  const res = await fetch(`${ENDPOINT}/api/stream/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() })
  });

  if (!res.ok) {
    let msg = `Stream resolution failed (${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) msg = err.detail;
    } catch { }
    throw new Error(msg);
  }

  return res.json();
}

export interface PlaylistEntry {
  id: string;
  source: StreamResolvedMetadata['source'];
  title: string;
  artist: string;
  /** 0 when the playlist did not say; the player corrects it once the song loads. */
  durationSec: number;
  originalUrl: string;
}

/**
 * Lists the songs of a YouTube or SoundCloud playlist (PLAYLIST IMPORT, see
 * musicdna/service/streaming.py). Nothing is downloaded. `entries` is empty for a single song.
 */
export async function expandPlaylist(url: string): Promise<{ title: string; entries: PlaylistEntry[] }> {
  const res = await fetch(`${ENDPOINT}/api/stream/playlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() })
  });
  if (!res.ok) throw new Error(`Playlist listing failed (${res.status})`);
  return res.json();
}

/**
 * The one URL a streamed song plays from (ONE DOWNLOAD FIX, see musicdna/service/app.py):
 * the service's cached copy when it has one, else the live stream while it caches.
 * `originalUrl` lets the service find the song again after a restart or an expired link.
 * Example: streamAudioUrl('youtube-abc', 'https://youtu.be/abc')
 *   → http://127.0.0.1:8765/api/stream/audio/youtube-abc?src=https%3A%2F%2Fyoutu.be%2Fabc
 */
export function streamAudioUrl(trackId: string, originalUrl: string): string {
  return `${ENDPOINT}/api/stream/audio/${encodeURIComponent(trackId)}?src=${encodeURIComponent(originalUrl)}`;
}

/**
 * Connects to the Server-Sent Events (SSE) analysis stream for progressive window-by-window features.
 */
export function listenToAnalysisStream(
  trackId: string,
  onWindow: (event: StreamAnalysisEvent) => void,
  onComplete?: () => void,
  onError?: (err: any) => void,
  originalUrl?: string
): () => void {
  const src = originalUrl ? `?src=${encodeURIComponent(originalUrl)}` : '';
  const eventSource = new EventSource(`${ENDPOINT}/api/analyze/stream/${encodeURIComponent(trackId)}${src}`);

  eventSource.onmessage = (e) => {
    try {
      const data: StreamAnalysisEvent = JSON.parse(e.data);
      if (data.error) {
        if (onError) onError(new Error(data.error));
        eventSource.close();
        return;
      }
      onWindow(data);
      if (data.status === 'complete' && onComplete) {
        onComplete();
        eventSource.close();
      }
    } catch (err) {
      console.warn('Failed to parse SSE event:', err);
    }
  };

  eventSource.onerror = (err) => {
    if (onError) onError(err);
    eventSource.close();
  };

  return () => {
    eventSource.close();
  };
}
