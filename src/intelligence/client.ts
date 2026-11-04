import type {Track, TrackAnalysis} from '../data/types';

// Strictly local: the browser sends an authorized file to the user's own
// localhost service on demand, never to a hosted AI provider.
import { SERVICE_URL } from '../core/service';
const ENDPOINT=SERVICE_URL;
export interface IntelligenceHealth {
  status: string;
  models: string[];
  database?: string;
  dbStats?: {tracks: number; analyses: number; moments: number; ratings: number};
  dataPolicy: string;
}

// BUSY FIX - the health check gave up after 2.5 s. While the service analyses another song it
// can take longer to answer, so the app said "Python analysis unavailable: Fetch is aborted"
// although the service was fine. It now waits up to 15 s.
// Example: upload two songs at once -> the second one's analysis waits instead of failing.
export async function intelligenceHealth(): Promise<IntelligenceHealth> {
  const reply=await fetch(`${ENDPOINT}/api/health`,{signal:AbortSignal.timeout(15000)});
  if(!reply.ok)throw new Error('Local intelligence service unavailable');
  return reply.json();
}

export async function saveAnalysisToSQLite(trackId: string, analysis: TrackAnalysis, title?: string, artist?: string): Promise<void> {
  try {
    await fetch(`${ENDPOINT}/api/db/save`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({trackId, title, artist, analysis})
    });
  } catch (e) {
    console.warn('SQLite persistence skipped:', e);
  }
}

export async function deleteTrackFromSQLite(trackId: string): Promise<void> {
  try {
    await fetch(`${ENDPOINT}/api/db/delete`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({trackId})
    });
  } catch (e) {
    console.warn('SQLite delete skipped:', e);
  }
}

export async function uploadAudioToCache(track: Track): Promise<void> {
  // EMPTY UPLOAD FIX - an empty Blob (IndexedDB after storage pressure) is never sent: the
  // service would have replaced the song's good copy with 0 bytes. It also refuses one now.
  if (!track.audioBlob || !track.audioBlob.size || track.id === 'original-demo') return;
  try {
    const form = new FormData();
    const mime = track.mimeType.toLowerCase();
    const ext = mime.includes('wav')?'.wav':mime.includes('flac')?'.flac':mime.includes('mpeg')?'.mp3':mime.includes('ogg')?'.ogg':mime.includes('mp4')||mime.includes('m4a')?'.m4a':mime.includes('aac')?'.aac':mime.includes('opus')?'.opus':'.wav';
    // A stored Blob can report a size and still read back nothing, so read it first and send
    // only real bytes. Example: after a reload every song re-uploaded as 0 bytes and the
    // service copies were wiped; now such a song is skipped and its server copy stays.
    const bytes = await track.audioBlob.arrayBuffer().catch(() => new ArrayBuffer(0));
    if (!bytes.byteLength) { console.warn('Audio cache sync skipped: the stored audio for "' + track.title + '" is empty'); return; }
    form.append('file', new Blob([bytes], { type: track.mimeType || 'audio/*' }), `audio${ext}`);
    form.append('track_id', track.id);
    form.append('track_title', track.title);
    const res = await fetch(`${ENDPOINT}/api/audio/cache`, {method: 'POST', body: form});
    // Tells the timeline store the service has the audio now (LIVE UPDATE FIX).
    if (res.ok) window.dispatchEvent(new CustomEvent('musicdna:audio-cached', { detail: track.id }));
  } catch (e) {
    console.warn('Audio cache sync skipped:', e);
  }
}

export async function analyzeLocalTrack(
  track: Track,
  method: 'dsp' | 'clap' | 'multimodal' | 'both' = 'dsp'
): Promise<TrackAnalysis | TrackAnalysis[]> {
  if (track.analysisRight === 'restricted') {
    throw new Error('Analysis restricted by policy');
  }

  let audioBlob = track.audioBlob;
  if (!audioBlob) {
    if (track.id === 'original-demo') {
      try {
        const res = await fetch('/demo.wav');
        if (res.ok) audioBlob = await res.blob();
      } catch { }
    } else if ((track as any).streamPlaybackUrl) {
      try {
        const res = await fetch((track as any).streamPlaybackUrl);
        if (res.ok) audioBlob = await res.blob();
      } catch { }
    } else {
      try {
        const res = await fetch(`${ENDPOINT}/api/audio/${encodeURIComponent(track.id)}`);
        if (res.ok) audioBlob = await res.blob();
      } catch { }
    }
  }

  if (!audioBlob) {
    throw new Error('Audio unavailable for analysis');
  }

  const form = new FormData();
  const mime = (track.mimeType || 'audio/wav').toLowerCase();
  const ext = mime.includes('wav') ? '.wav' : mime.includes('flac') ? '.flac' : mime.includes('mpeg') ? '.mp3' : mime.includes('ogg') ? '.ogg' : mime.includes('mp4') || mime.includes('m4a') ? '.m4a' : mime.includes('aac') ? '.aac' : mime.includes('opus') ? '.opus' : '.wav';
  const safeName = track.title.toLowerCase().match(/\.(wav|mp3|flac|ogg|m4a|aac|opus)$/) ? track.title : `audio${ext}`;
  form.append('file', audioBlob, safeName);
  form.append('method',method);
  form.append('track_id',track.id);
  form.append('track_title',track.title);
  form.append('local_analysis_confirmed','true');
  const response=await fetch(`${ENDPOINT}/api/analyze`,{method:'POST',body:form});
  if(!response.ok){let message=`Analysis failed (${response.status})`;
    try{const body=await response.json();message=String(body.detail||message);}catch{/* ignore */}
    throw new Error(message);
  }
  const result=await response.json();
  if (method === 'both') {
    const list: TrackAnalysis[] = [];
    for (const key of ['dsp', 'clap', 'multimodal'] as const) {
      if (result[key]) {
        list.push({
          trackId: track.id,
          method: result[key].method,
          modelId: result[key].modelId,
          durationSec: result[key].durationSec,
          analyzedAt: Date.now(),
          segments: result[key].segments,
          components: result[key].components
        });
      }
    }
    return list;
  }
  if(!Array.isArray(result.segments)||!result.segments.length||!result.modelId)
    throw new Error('Invalid analysis response');
  return {
    trackId: track.id,
    method: result.method,
    modelId: result.modelId,
    durationSec: result.durationSec,
    analyzedAt: Date.now(),
    segments: result.segments,
    components: result.components,
    musicalDimensions: result.musicalDimensions,
    stemsAvailable: result.stemsAvailable,
  };
}

/**
 * Asks the service to analyse exactly one passage (PASSAGE FIX in musicdna/service/app.py).
 * `src` is the original link of a streamed song, so the service can fetch it if not cached.
 */
export async function analyzePassage(trackId: string, a: number, b: number, src = ''): Promise<{ modelId: string; segments: TrackAnalysis['segments']; musicalDimensions?: TrackAnalysis['musicalDimensions'] }> {
  const res = await fetch(`${ENDPOINT}/api/analyze/passage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId, a, b, src }),
  });
  if (!res.ok) throw new Error(`Passage analysis failed (${res.status})`);
  return res.json();
}

export function stemAudioUrl(trackId: string, stem: string): string {
  if (stem === 'all' && trackId === 'original-demo') return '/demo.wav';
  return `${ENDPOINT}/api/audio/stem/${encodeURIComponent(trackId)}/${encodeURIComponent(stem)}`;
}

export async function fetchTrackStems(trackId: string): Promise<{
  trackId: string;
  stems: string[];
  available: Record<string, boolean>;
  dimensions?: unknown;
} | null> {
  try {
    const res = await fetch(`${ENDPOINT}/api/stems/${encodeURIComponent(trackId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

export async function fetchPythonDiagnostics(payload: {
  analyses: unknown[];
  moments: unknown[];
  ratings: unknown[];
  events: unknown[];
}): Promise<{activeLearning?: unknown; dmer?: unknown; insight?: unknown}> {
  const headers = {'Content-Type': 'application/json'};
  const body = JSON.stringify(payload);
  const [alRes, dmerRes, insRes] = await Promise.all([
    fetch(`${ENDPOINT}/api/research/active-learning`, {method: 'POST', headers, body}).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${ENDPOINT}/api/research/dmer`, {method: 'POST', headers, body}).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${ENDPOINT}/api/research/insight`, {method: 'POST', headers, body}).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  return {activeLearning: alRes, dmer: dmerRes, insight: insRes};
}
