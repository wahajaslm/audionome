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

/**
 * Generates the local proxy URL for a resolved stream to bypass CORS and support HTTP Range requests.
 */
export function getProxyStreamUrl(streamUrl: string): string {
  return `${ENDPOINT}/api/stream/proxy?url=${encodeURIComponent(streamUrl)}`;
}

/**
 * Connects to the Server-Sent Events (SSE) analysis stream for progressive window-by-window features.
 */
export function listenToAnalysisStream(
  trackId: string,
  onWindow: (event: StreamAnalysisEvent) => void,
  onComplete?: () => void,
  onError?: (err: any) => void
): () => void {
  const eventSource = new EventSource(`${ENDPOINT}/api/analyze/stream/${encodeURIComponent(trackId)}`);

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
