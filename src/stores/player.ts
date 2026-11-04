/**
 * Reactive Player Store for Music DNA Player.
 * Manages active playback, tracks, WaveSurfer instances, moments, and streaming analyses.
 */
import { reactive, computed } from 'vue';
import type { Track, Moment, TrackAnalysis, AudioSegment } from '../data/types';
import { db, ensureDemo } from '../data/db';
import { resolveStreamUrl, getProxyStreamUrl, listenToAnalysisStream } from '../services/streaming';

export interface PlayerState {
  currentTrack: Track | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
  selectedRange: { start: number; end: number } | null;
  isLooping: boolean;
  activeStem: string;
  activeView: 'player' | 'library' | 'moments' | 'discover' | 'dna' | 'admin' | 'stream';
  tracks: Track[];
  moments: Moment[];
  analyses: TrackAnalysis[];
  isResolvingStream: boolean;
  isStreamingAnalysis: boolean;
  streamProgress: { current: number; total: number };
  toastMessage: string | null;
}

export const playerState = reactive<PlayerState>({
  currentTrack: null,
  currentTime: 0,
  duration: 32,
  isPlaying: false,
  volume: 0.85,
  selectedRange: null,
  isLooping: false,
  activeStem: 'all',
  activeView: 'player',
  tracks: [],
  moments: [],
  analyses: [],
  isResolvingStream: false,
  isStreamingAnalysis: false,
  streamProgress: { current: 0, total: 0 },
  toastMessage: null,
});

let toastTimeout: any = null;

export function showToast(message: string, durationMs = 3000) {
  playerState.toastMessage = message;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    playerState.toastMessage = null;
  }, durationMs);
}

export async function loadLibrary() {
  await ensureDemo();
  const [tracks, moments, analyses] = await Promise.all([
    db.tracks.toArray(),
    db.moments.toArray(),
    db.analyses.toArray(),
  ]);
  playerState.tracks = tracks;
  playerState.moments = moments;
  playerState.analyses = analyses;

  if (!playerState.currentTrack && tracks.length > 0) {
    playerState.currentTrack = tracks[0];
    playerState.duration = tracks[0].durationSec || 32;
  }
}

export async function selectTrack(track: Track, startTime = 0) {
  playerState.currentTrack = track;
  playerState.duration = track.durationSec || 32;
  playerState.currentTime = startTime;
  playerState.selectedRange = null;
  playerState.isLooping = false;
  playerState.activeStem = 'all';
}

export async function loadOnlineStream(url: string) {
  playerState.isResolvingStream = true;
  showToast('Connecting to audio stream…');
  try {
    const meta = await resolveStreamUrl(url);
    const audioUrl = meta.isDirect ? meta.streamUrl : getProxyStreamUrl(meta.streamUrl);

    const newTrack: Track = {
      id: meta.id,
      title: meta.title,
      artist: meta.artist,
      durationSec: meta.durationSec,
      mimeType: 'audio/mpeg',
      source: 'external-reference',
      analysisRight: 'cleared',
      addedAt: Date.now(),
    };

    // Attach stream URL for playback
    (newTrack as any).streamPlaybackUrl = audioUrl;
    (newTrack as any).thumbnailUrl = meta.thumbnail;

    await db.tracks.put(newTrack);
    await loadLibrary();
    await selectTrack(newTrack);
    showToast(`Loaded "${meta.title}" · Playing from stream`);

    // Automatically initiate progressive feature streaming
    startProgressiveAnalysis(meta.id);
  } catch (err: any) {
    showToast(`Stream Error: ${err.message}`);
    throw err;
  } finally {
    playerState.isResolvingStream = false;
  }
}

export function startProgressiveAnalysis(trackId: string) {
  playerState.isStreamingAnalysis = true;
  playerState.streamProgress = { current: 0, total: 1 };

  listenToAnalysisStream(
    trackId,
    (event) => {
      playerState.streamProgress = { current: event.index + 1, total: event.total };
      // Real-time update into analysis records
      let target = playerState.analyses.find(a => a.trackId === trackId);
      if (!target) {
        target = {
          trackId,
          method: 'dsp',
          modelId: 'streaming-progressive-dsp',
          durationSec: playerState.duration,
          analyzedAt: Date.now(),
          segments: [],
        };
        playerState.analyses.push(target);
      }
      if (!target.segments.some(s => s.startSec === event.segment.startSec)) {
        target.segments.push(event.segment);
      }
    },
    () => {
      playerState.isStreamingAnalysis = false;
      showToast('Analysis stream complete');
    },
    (err) => {
      playerState.isStreamingAnalysis = false;
      console.warn('Progressive stream notice:', err);
    }
  );
}

