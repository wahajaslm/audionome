import { defineStore } from 'pinia';
import { computed, reactive, ref, shallowRef } from 'vue';
import type { Track } from '../data/types';
import { getSetting, loadTracks, putAnalysis, putSetting, putTrack, syncFromAnalysisService, updateTrackDuration } from '../core/repository';
import { runLocalAnalysis } from '../core/intelligence';
import type { PlayableTrack } from '../core/library';
import { useUiStore } from './ui';
import { useIntelligenceStore } from './intelligence';
import { usePlaybackStore } from './playback';
import { getProxyStreamUrl, listenToAnalysisStream, resolveStreamUrl } from '../services/streaming';

/** Tracks in the library and the local analysis jobs running on them. */
export const useLibraryStore = defineStore('library', () => {
  const tracks = shallowRef<PlayableTrack[]>([]);
  /** trackId -> current analysis step, while a job runs. */
  const analyzing = reactive<Record<string, string>>({});
  const autoAnalyze = ref(true);

  const byId = computed(() => new Map(tracks.value.map(t => [t.id, t])));
  const track = (id: string | null | undefined) => (id ? byId.value.get(id) : undefined);

  /** Reloads tracks, first pulling anything the local analysis service knows about. */
  async function load(): Promise<void> {
    await syncFromAnalysisService();
    tracks.value = await loadTracks();
  }

  async function loadSettings(): Promise<void> {
    const pref = await getSetting<boolean>('autoAnalyze');
    autoAnalyze.value = pref === undefined ? true : pref === true;
  }

  /** Corrects a placeholder duration once the media reports the real one (>1 s difference). */
  function correctDuration(id: string, durationSec: number): void {
    const t = track(id);
    if (!t || Math.abs((t.durationSec || 0) - durationSec) <= 1) return;
    t.durationSec = durationSec;
    tracks.value = [...tracks.value];
    updateTrackDuration(id, durationSec);
  }

  async function setAutoAnalyze(on: boolean): Promise<void> {
    autoAnalyze.value = on;
    await putSetting('autoAnalyze', on);
  }

  /** Runs the local Python analysis. Asks for confirmation unless `silent` or auto-analysis is on. */
  async function analyze(id: string, silent = false): Promise<boolean> {
    const ui = useUiStore();
    const t = track(id);
    if (!t || analyzing[id]) return false;
    if (!silent && !autoAnalyze.value && !confirm('Only proceed if you have rights to analyze this recording. File ownership or playback alone may not be enough. Run local audio analysis?')) return false;
    analyzing[id] = 'Starting…';
    try {
      if (!silent) ui.notify('Analyzing ' + t.title + ' locally…');
      await runLocalAnalysis(t, step => { analyzing[id] = step; }, putAnalysis);
      await useIntelligenceStore().refresh();
      delete analyzing[id];
      ui.notify('Analysis complete · ' + t.title + ' is ready for Music DNA.');
      return true;
    } catch (err) {
      delete analyzing[id];
      ui.notify('Python analysis unavailable: ' + String((err as Error).message || err).slice(0, 75));
      return false;
    }
  }

  /** Analyses every track that has no analysis yet, one at a time. */
  async function autoAnalyzeLibrary(): Promise<void> {
    if (!autoAnalyze.value) return;
    const analyses = useIntelligenceStore().analyses;
    const pending = tracks.value.filter(t => !analyses.some(a => a.trackId === t.id));
    let done = 0;
    for (const t of pending) if (await analyze(t.id, true)) done++;
    if (done > 0) useUiStore().notify('Automatically analyzed ' + done + ' song' + (done > 1 ? 's' : '') + ' for Music DNA.');
  }

  /** Adds or replaces a track row in memory (the caller has written it to Dexie). */
  function upsert(t: Track): void {
    tracks.value = [t, ...tracks.value.filter(x => x.id !== t.id)];
  }

  // Streams (YouTube, SoundCloud, direct links) opened through the local service.
  const isResolvingStream = ref(false);
  const isStreamingAnalysis = ref(false);
  const streamProgress = ref({ current: 0, total: 0 });

  /** Resolves a stream link, adds it to the library and opens it in the player. */
  async function openStream(url: string): Promise<void> {
    const ui = useUiStore();
    isResolvingStream.value = true;
    ui.notify('Connecting to audio stream…');
    try {
      const meta = await resolveStreamUrl(url);
      const t: PlayableTrack = {
        id: meta.id, title: meta.title, artist: meta.artist, durationSec: meta.durationSec,
        mimeType: 'audio/mpeg', source: 'external-reference', analysisRight: 'cleared', addedAt: Date.now(),
        streamPlaybackUrl: meta.isDirect ? meta.streamUrl : getProxyStreamUrl(meta.streamUrl),
      };
      await putTrack(t);
      await load();
      await usePlaybackStore().changeTrack(track(t.id) || t, false);
      ui.notify('Loaded "' + meta.title + '" · Playing from stream');
      startProgressiveAnalysis(t.id);
    } catch (err) {
      ui.notify('Stream Error: ' + (err as Error).message);
      throw err;
    } finally {
      isResolvingStream.value = false;
    }
  }

  /** Streams analysis windows from the service as they are computed. */
  function startProgressiveAnalysis(trackId: string): void {
    const intelligence = useIntelligenceStore();
    isStreamingAnalysis.value = true;
    streamProgress.value = { current: 0, total: 1 };
    listenToAnalysisStream(trackId, event => {
      streamProgress.value = { current: event.index + 1, total: event.total };
      const existing = intelligence.analyses.find(a => a.trackId === trackId);
      const target = existing ?? {
        trackId, method: 'dsp' as const, modelId: 'streaming-progressive-dsp',
        durationSec: usePlaybackStore().duration, analyzedAt: Date.now(), segments: [],
      };
      if (!target.segments.some(s => s.startSec === event.segment.startSec)) target.segments.push(event.segment);
      intelligence.analyses = existing ? [...intelligence.analyses] : [...intelligence.analyses, target];
    }, () => {
      isStreamingAnalysis.value = false;
      useUiStore().notify('Analysis stream complete');
    }, err => {
      isStreamingAnalysis.value = false;
      console.warn('Progressive stream notice:', err);
    });
  }

  return {
    tracks, analyzing, autoAnalyze, isResolvingStream, isStreamingAnalysis, streamProgress,
    track, load, loadSettings, correctDuration, setAutoAnalyze, analyze, autoAnalyzeLibrary, upsert, openStream,
  };
});
