import { defineStore } from 'pinia';
import { computed, reactive, ref, shallowRef } from 'vue';
import type { Track } from '../data/types';
import { deleteTrackEverywhere, getSetting, importAudioFiles, loadTracks, putAnalysis, putSetting, putTrack, syncFromAnalysisService, updateTrackDuration } from '../core/repository';
import { uploadAudioToCache } from '../intelligence/client';
import { useMomentsStore } from './moments';
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

  /** Settings switch. Turning it on also analyses what is still unanalysed (classic behaviour). */
  async function setAutoAnalyze(on: boolean): Promise<void> {
    autoAnalyze.value = on;
    await putSetting('autoAnalyze', on);
    useUiStore().notify(on ? 'Automatic local audio analysis enabled' : 'Automatic local audio analysis turned off');
    if (on) autoAnalyzeLibrary().catch(console.warn);
  }

  /**
   * Rights rule (as in the classic player): analysis runs without asking only when the listener
   * turned on automatic analysis in Settings. Otherwise the Library row asks first, in place:
   * "Only proceed if you have rights to analyze this recording…". `rightsAsk` is the track
   * waiting for that answer. Example: auto-analysis off → Analyze locally → the row shows the
   * question; only "I have the rights" calls analyze(id, false, true).
   */
  const rightsAsk = ref<string | null>(null);

  /** Runs the local Python analysis. Without auto-analysis it needs `rightsConfirmed`. */
  async function analyze(id: string, silent = false, rightsConfirmed = false): Promise<boolean> {
    const ui = useUiStore();
    const t = track(id);
    if (!t || analyzing[id]) return false;
    if (!silent && !autoAnalyze.value && !rightsConfirmed) {
      rightsAsk.value = id;
      ui.notify('Confirm you have the rights to analyze this recording.', 'Library', '/library');
      return false;
    }
    if (rightsAsk.value === id) rightsAsk.value = null;
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
      // Background jobs (silent) fail quietly: with the service off, every page load used to
      // end in an error toast. The Library row still says "Not analysed yet".
      if (!silent) ui.notify('Python analysis unavailable: ' + String((err as Error).message || err).slice(0, 75));
      else console.info('Background analysis skipped:', (err as Error).message || err);
      return false;
    }
  }

  /** Analyses every track that has no analysis yet, one at a time. */
  async function autoAnalyzeLibrary(): Promise<number> {
    if (!autoAnalyze.value) return 0;
    const analyses = useIntelligenceStore().analyses;
    const pending = tracks.value.filter(t => !analyses.some(a => a.trackId === t.id));
    let done = 0;
    for (const t of pending) {
      if (await analyze(t.id, true)) done++;
      else if (!done) break; // the first failure means the service is off: do not try every song
    }
    if (done > 0) useUiStore().notify('Automatically analyzed ' + done + ' song' + (done > 1 ? 's' : '') + ' for Music DNA.');
    return done;
  }

  /** "Analyze all tracks" (Feature Analysis): analyses every unanalysed track once, as if auto-analysis were on. */
  async function analyzeAll(): Promise<void> {
    const prev = autoAnalyze.value;
    autoAnalyze.value = true;
    useUiStore().notify('Analyzing all tracks with the local service…');
    let done = 0;
    try { done = await autoAnalyzeLibrary(); } finally { autoAnalyze.value = prev; }
    const pending = tracks.value.some(t => !useIntelligenceStore().analyses.some(a => a.trackId === t.id));
    if (!done && pending) useUiStore().notify('Could not reach the local analysis service. Start it and try again.');
  }

  /**
   * Imports audio files, then opens the first one in the player and plays it (classic
   * importAudio). Each new file is copied to the local service for analysis later, and analysed
   * now if automatic analysis is on. Returns the new tracks (empty when nothing was audio).
   */
  async function importFiles(files: FileList | File[]): Promise<Track[]> {
    const ui = useUiStore();
    ui.notify('Importing audio files…');
    const added = await importAudioFiles(files);
    if (!added.length) { ui.notify('No supported audio files.'); return added; }
    await load();
    ui.notify('Added ' + added.length + ' song' + (added.length > 1 ? 's' : '') + ' · loading into player…');
    const first = track(added[0].id) || added[0];
    uploadAudioToCache(first).catch(() => { });
    await usePlaybackStore().changeTrack(first, true);
    if (autoAnalyze.value) for (const t of added) analyze(t.id, true).catch(console.warn);
    return added;
  }

  /** Deletes a song with its analyses and moments. If it was loaded, the next song is loaded. */
  async function deleteTrack(id: string): Promise<void> {
    if (id === 'original-demo') return;
    await deleteTrackEverywhere(id);
    await load();
    await useMomentsStore().load();
    await useIntelligenceStore().refresh();
    const playback = usePlaybackStore();
    if (playback.trackId === id && tracks.value.length) await playback.selectTrack(tracks.value[0], 0, false);
    useUiStore().notify('Removed song from library.');
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
    tracks, analyzing, autoAnalyze, rightsAsk, isResolvingStream, isStreamingAnalysis, streamProgress,
    track, load, loadSettings, correctDuration, setAutoAnalyze, analyze, analyzeAll, autoAnalyzeLibrary, upsert, openStream,
    importFiles, deleteTrack,
  };
});
