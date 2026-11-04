import { defineStore } from 'pinia';
import { computed, reactive, ref, shallowRef } from 'vue';
import type { Track } from '../data/types';
import { deleteTrackEverywhere, forgetDeleted, getSetting, importAudioFiles, loadTracks, putAnalysis, putSetting, putTrack, syncFromAnalysisService, updateTrackDuration } from '../core/repository';
import { uploadAudioToCache } from '../intelligence/client';
import { useMomentsStore } from './moments';
import { runLocalAnalysis } from '../core/intelligence';
import type { PlayableTrack } from '../core/library';
import { useUiStore } from './ui';
import { useIntelligenceStore } from './intelligence';
import { usePlaybackStore } from './playback';
import { expandPlaylist, listenToAnalysisStream, resolveStreamUrl, streamAudioUrl } from '../services/streaming';

/** Tracks in the library and the local analysis jobs running on them. */
/** Model id of the quick analysis a link gets while it plays; the full analysis replaces it. */
const QUICK_STREAM_MODEL = 'streaming-progressive-dsp';
/** True for the quick pass (made here, or saved by the service with a ':quick' model id). */
const isQuick = (a: { modelId: string }) => a.modelId === QUICK_STREAM_MODEL || a.modelId.endsWith(':quick');
/**
 * How many songs the background queue analyses at once. Each full analysis can separate stems
 * and run CLAP, so more than 2 at a time risks running the service out of memory.
 */
const ANALYSIS_WORKERS = 2;
/** The queue stops after this many failures in a row: the service is most likely off. */
const QUEUE_MAX_FAILS = 3;

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

  /**
   * Queues every track that has no analysis yet (BACKGROUND QUEUE). Runs at start-up, so this is
   * also the crash recovery: a song is only marked analysed once its analysis is saved, so
   * whatever was queued or half-done when the app or service went down is queued again.
   * Example: 25-song playlist, the app crashes after 10 → on reopening, the other 15 are queued.
   * Returns how many songs were queued.
   */
  async function autoAnalyzeLibrary(): Promise<number> {
    if (!autoAnalyze.value) return 0;
    return queueUnanalysed();
  }

  function queueUnanalysed(): number {
    const analyses = useIntelligenceStore().analyses;
    const pending = tracks.value.filter(t => !analyses.some(a => a.trackId === t.id)).map(t => t.id);
    return queueAnalysis(pending);
  }

  /** "Analyze all tracks" (Feature Analysis): queues every unanalysed track, even with auto-analysis off. */
  async function analyzeAll(): Promise<void> {
    const n = queueUnanalysed();
    useUiStore().notify(n ? 'Analysing ' + n + ' song' + (n > 1 ? 's' : '') + ' in the background…' : 'Every song is already analysed.');
  }

  /**
   * Imports audio files, then opens the first one in the player and plays it (classic
   * importAudio). Each new file is copied to the local service for analysis later, and analysed
   * now if automatic analysis is on. Returns the new tracks (empty when nothing was audio).
   */
  async function importFiles(files: FileList | File[]): Promise<Track[]> {
    const ui = useUiStore();
    const list = Array.from(files);   // a FileList empties when its input is reset
    ui.notify('Importing audio files…');
    const { added, failed } = await importAudioFiles(list, (done, total, name) => {
      if (total > 1 && done < total) ui.notify(`Importing ${done + 1} of ${total} · ${name}`);
    });
    if (!added.length) {
      ui.notify(failed.length ? `Could not import ${failed[0].name} (${failed[0].reason})${failed.length > 1 ? ` and ${failed.length - 1} more` : ''}.` : 'No supported audio files.');
      return added;
    }
    await load();
    const skipped = failed.length ? ` · ${failed.length} could not be imported: ${failed.map(f => f.name).join(', ').slice(0, 80)}` : '';
    ui.notify('Added ' + added.length + ' song' + (added.length > 1 ? 's' : '') + skipped);
    const first = track(added[0].id) || added[0];
    await usePlaybackStore().changeTrack(first, true);
    // MANY FILES FIX - only the first song was sent to the service, so the others had no beats,
    // chords or stems until the next start-up; and every song started its full analysis at
    // once. Now each song is sent in turn (its timeline queues as it lands), then analysed in turn.
    syncImported(added.map(t => t.id)).catch(console.warn);
    return added;
  }

  /** Sends imported songs to the service one by one, then queues their analysis. */
  async function syncImported(ids: string[]): Promise<void> {
    for (const id of ids) { const t = track(id); if (t) await uploadAudioToCache(t).catch(() => { }); }
    if (autoAnalyze.value) queueAnalysis(ids);
  }

  /**
   * BACKGROUND QUEUE - songs waiting for analysis, run ANALYSIS_WORKERS at a time while you keep
   * using the app. Library shows waiting songs as "Queued". One failing song (a video that is
   * region-blocked) no longer stops the rest; QUEUE_MAX_FAILS failures in a row do.
   * Example: import a 25-song playlist → songs 1 and 2 analyse, 23 are queued; each finished
   * song frees a worker for the next one.
   */
  const analysisQueue = ref<string[]>([]);
  let workers = 0;

  /** Adds songs to the end of the queue (skipping queued, running and analysed ones); returns how many. */
  function queueAnalysis(ids: string[]): number {
    const intelligence = useIntelligenceStore();
    const add = ids.filter((id, i) => ids.indexOf(id) === i && !analysisQueue.value.includes(id) && !analyzing[id] && !intelligence.analysisFor(id));
    analysisQueue.value = [...analysisQueue.value, ...add];
    // runWorker takes its first song before its first await, so this loop always ends.
    while (workers < ANALYSIS_WORKERS && analysisQueue.value.length) runWorker();
    return add.length;
  }

  async function runWorker(): Promise<void> {
    workers++;
    let failsInARow = 0;
    try {
      while (analysisQueue.value.length) {
        // NOW PLAYING FIRST - the song you are listening to is analysed next, wherever it sits
        // in the queue. Example: 23 queued, you play song 20 → it is the next one analysed.
        const playing = usePlaybackStore().trackId;
        const id = playing && analysisQueue.value.includes(playing) ? playing : analysisQueue.value[0];
        analysisQueue.value = analysisQueue.value.filter(x => x !== id);
        if (await analyze(id, true)) { failsInARow = 0; continue; }
        if (++failsInARow < QUEUE_MAX_FAILS) continue;
        if (analysisQueue.value.length) useUiStore().notify('Analysis queue stopped: the local service is not answering. Analyse the rest from Library later.');
        analysisQueue.value = [];
      }
    } finally {
      workers--;
    }
  }

  /** Deletes a song with its analyses and moments. If it was loaded, the next song is loaded. */
  async function deleteTrack(id: string): Promise<void> {
    if (id === 'original-demo') return;
    // The row leaves the list at once; the database and service work follows.
    tracks.value = tracks.value.filter(t => t.id !== id);
    analysisQueue.value = analysisQueue.value.filter(x => x !== id);
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
        mimeType: 'audio/mp4', source: 'external-reference', analysisRight: 'cleared', addedAt: Date.now(),
        streamPlaybackUrl: streamAudioUrl(meta.id, meta.originalUrl), originalUrl: meta.originalUrl,
      };
      await forgetDeleted(t.id);
      await putTrack(t);
      await load();
      // Opening a link plays it, like choosing a song in Library (it used to stop the old song
      // and leave the new one paused).
      await usePlaybackStore().changeTrack(track(t.id) || t, true);
      ui.notify('Loaded "' + meta.title + '" · Playing from stream');
      // A song opened before keeps its analysis; only a quick one is upgraded to the full one.
      const have = useIntelligenceStore().analysisFor(t.id);
      if (!have) startProgressiveAnalysis(t.id, meta.originalUrl);
      else if (isQuick(have)) analyze(t.id, true).catch(console.warn);
    } catch (err) {
      ui.notify('Stream Error: ' + (err as Error).message);
      throw err;
    } finally {
      isResolvingStream.value = false;
    }
  }

  /**
   * "Add from a link": a playlist adds all its songs to Library (PLAYLIST IMPORT) and queues
   * their analysis; any other link opens as one song (openStream). Returns which it was.
   * Nothing is downloaded on import: each song is fetched when played or analysed.
   * Example: a 25-song YouTube playlist → 25 Library rows at once, 2 analysing, 23 queued.
   */
  async function openLink(url: string): Promise<'song' | 'playlist'> {
    const ui = useUiStore();
    isResolvingStream.value = true;
    ui.notify('Reading the link…');
    let list: Awaited<ReturnType<typeof expandPlaylist>> | null = null;
    try {
      list = await expandPlaylist(url);
    } catch (err) {
      // An older service has no playlist endpoint: open the link as one song, as before.
      console.info('Playlist listing skipped:', (err as Error).message);
    } finally {
      isResolvingStream.value = false;
    }
    if (!list?.entries.length) { await openStream(url); return 'song'; }

    const fresh = list.entries.filter(e => !track(e.id));
    for (const e of fresh) {
      const t: PlayableTrack = {
        id: e.id, title: e.title, artist: e.artist, durationSec: e.durationSec,
        mimeType: 'audio/mp4', source: 'external-reference', analysisRight: 'cleared', addedAt: Date.now(),
        streamPlaybackUrl: streamAudioUrl(e.id, e.originalUrl), originalUrl: e.originalUrl,
      };
      await forgetDeleted(t.id);
      await putTrack(t);
    }
    await load();
    const known = list.entries.length - fresh.length;
    ui.notify(`Added ${fresh.length} song${fresh.length === 1 ? '' : 's'} from "${list.title}"`
      + (known ? ` · ${known} already in Library` : '')
      + (autoAnalyze.value ? ' · analysing in the background' : ''));
    // Songs already in Library but never analysed are queued too.
    if (autoAnalyze.value) queueAnalysis(list.entries.map(e => e.id));
    return 'playlist';
  }

  /** Streams analysis windows from the service as they are computed (the quick pass). */
  function startProgressiveAnalysis(trackId: string, originalUrl?: string): void {
    const intelligence = useIntelligenceStore();
    isStreamingAnalysis.value = true;
    streamProgress.value = { current: 0, total: 1 };
    listenToAnalysisStream(trackId, event => {
      streamProgress.value = { current: event.index + 1, total: event.total };
      const existing = intelligence.analyses.find(a => a.trackId === trackId);
      const target = existing ?? {
        trackId, method: event.method ?? ('dsp' as const), modelId: event.modelId ?? QUICK_STREAM_MODEL,
        durationSec: usePlaybackStore().duration, analyzedAt: Date.now(), segments: [],
      };
      if (!target.segments.some(s => s.startSec === event.segment.startSec)) target.segments.push(event.segment);
      intelligence.analyses = existing ? [...intelligence.analyses] : [...intelligence.analyses, target];
    }, () => {
      isStreamingAnalysis.value = false;
      // SAVE FIX - the finished analysis is stored on this device, so a reload keeps it.
      // Example: open a YouTube link, reload → the song still shows "Analyzed · N windows".
      const done = intelligence.analyses.find(a => a.trackId === trackId);
      if (done) putAnalysis(JSON.parse(JSON.stringify(done))).catch(console.warn);
      if (!done || !isQuick(done)) { useUiStore().notify('Analysis loaded'); return; }
      useUiStore().notify('Quick analysis ready · full analysis continues in the background');
      // FULL ANALYSIS FIX - the quick pass measures sound only (energy, key, chords, tempo).
      // The full analysis (stems + CLAP/multimodal when the service has them) used to need a
      // press on Analyze; now it starts by itself, reads the service's cached copy (no new
      // YouTube download) and replaces the quick result when done.
      // Example: open a link → "Analyzed · 47 windows · dsp" → a minute later "· multimodal".
      analyze(trackId, true).catch(console.warn);
    }, err => {
      isStreamingAnalysis.value = false;
      console.warn('Progressive stream notice:', err);
    }, originalUrl);
  }

  return {
    tracks, analyzing, autoAnalyze, rightsAsk, isResolvingStream, isStreamingAnalysis, streamProgress,
    analysisQueue,
    track, load, loadSettings, correctDuration, setAutoAnalyze, analyze, analyzeAll, autoAnalyzeLibrary, upsert, openStream,
    openLink, queueAnalysis, importFiles, deleteTrack,
  };
});
