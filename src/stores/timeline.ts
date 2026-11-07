import { defineStore } from 'pinia';
import { computed, ref, shallowRef, watch } from 'vue';
import { fetchTimeline, hasFull, hasQuick, startTimeline, type Timeline } from '../core/timeline';
import { SPEC_SR, type Spectrum, type SpectrumKind, type SpectrumView } from '../core/spectrum';
import { getSetting, putSetting } from '../core/repository';
import { fallbackUrl } from '../core/library';
import { measureLoudness } from '../core/audioGraph';
import { parseBitrate, type BitrateInfo } from '../core/bitrate';
import { useLibraryStore } from './library';
import { usePlaybackStore } from './playback';

/**
 * The loaded song's timeline, in three tiers that arrive one after another:
 *   instant  spectrogram + loudness + brightness, made in the browser (works with the service off)
 *   quick    beats, chords on the beat, song parts, repeats (service, seconds)
 *   full     Demucs stems, stem loudness, vocal melody (service, background, minutes)
 * Explore draws whatever has arrived and says what is still coming.
 */
export const useTimelineStore = defineStore('timeline', () => {
  const trackId = ref<string | null>(null);
  const timeline = shallowRef<Timeline | null>(null);
  /** The mel view and the instant curves (loudness, brightness). */
  const spectrum = shallowRef<Spectrum | null>(null);
  const spectrumState = ref<'idle' | 'decoding' | 'done' | 'error'>('idle');
  /** Codec and bitrate over time, read from the file's frames (core/bitrate.ts). */
  const bitrate = shallowRef<BitrateInfo | null>(null);
  /** Which spectrum view is drawn (SPECTRUM VIEWS), remembered across songs and reloads. */
  const spectrumKind = ref<SpectrumKind>('mel');
  getSetting<string>('spectrumKind').then(k => { if (k === 'mel' || k === 'cqt' || k === 'linear') spectrumKind.value = k; }).catch(() => { });
  /** CQT and linear views, made on first use for the loaded song. */
  const views = shallowRef<Partial<Record<SpectrumKind, SpectrumView>>>({});
  /** The view to draw: the chosen one, or mel while the chosen one is being made. */
  const spectrumView = computed<SpectrumView | null>(() => views.value[spectrumKind.value] ?? spectrum.value);
  const viewBusy = ref(false);
  /** True after a start request failed: the service is not running, or runs code without timelines. */
  const serviceOff = ref(false);
  const serviceOutdated = ref(false);

  let seq = 0;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let worker: Worker | null = null;
  let workerSeq = 0;
  const pending = new Map<number, { resolve: (v: SpectrumView) => void; reject: (e: Error) => void }>();
  /** Asks the worker for one view; the samples go along only the first time per song. */
  function askWorker(kind: SpectrumKind, samples?: Float32Array): Promise<SpectrumView> {
    if (!worker) {
      worker = new Worker(new URL('../core/spectrum.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; view?: SpectrumView; error?: string }>) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        e.data.view ? p.resolve(e.data.view) : p.reject(new Error(e.data.error));
      };
    }
    const id = ++workerSeq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker!.postMessage({ id, kind, samples }, samples ? [samples.buffer] : []);
    });
  }

  /** Switch the spectrum view; CQT and linear are computed the first time they are chosen. */
  async function setSpectrumKind(kind: SpectrumKind): Promise<void> {
    spectrumKind.value = kind;
    putSetting('spectrumKind', kind).catch(() => { });
    await ensureView(kind);
  }
  async function ensureView(kind: SpectrumKind): Promise<void> {
    if (kind === 'mel' || views.value[kind] || !spectrum.value || viewBusy.value) return;
    const mySeq = seq;
    viewBusy.value = true;
    try {
      const v = await askWorker(kind);
      if (mySeq === seq) views.value = { ...views.value, [kind]: v };
    } catch (err) { console.warn('Spectrum view notice:', err); }
    finally { viewBusy.value = false; }
    if (mySeq === seq && spectrumKind.value !== kind) ensureView(spectrumKind.value);
  }

  const quick = computed(() => hasQuick(timeline.value));
  const full = computed(() => hasFull(timeline.value));

  /** One status line for the player header. */
  const statusText = computed(() => {
    const st = timeline.value?.status;
    if (full.value) return { busy: false, text: 'Analysed · stems, beats, chords, parts' };
    if (serviceOutdated.value) return { busy: false, text: 'Restart the analysis service to see beats, chords and stems' };
    if (serviceOff.value) return { busy: false, text: spectrum.value ? 'Analysis service is off · spectrum only' : 'Analysis service is off' };
    if (st?.full === 'error' || st?.quick === 'error') return { busy: false, text: 'Analysis failed · ' + (st.error || 'try again') };
    if (quick.value) return { busy: true, text: (st?.stage || 'Separating stems') + '… · beats and chords ready' };
    if (st?.quick === 'running') return { busy: true, text: 'Finding beats and chords…' };
    if (st?.quick === 'waiting') return { busy: true, text: 'Waiting for the analysis service…' };
    return { busy: true, text: spectrum.value ? 'Starting analysis… · spectrum ready' : 'Reading audio…' };
  });

  function stopPolling(): void { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } }

  /**
   * Polls until the full tier is in: every 2 s while a job runs, every 10 s while the service
   * is off or a job failed (a failed job is started again, at most 3 times per song).
   *
   * LIVE UPDATE FIX - polling stopped for good on an 'error' status, and a new upload got one
   * (its timeline was asked for before the audio arrived). The job then ran anyway, but the
   * player never asked again, so Explore and the player kept the old view until a reload.
   * Now only a complete timeline stops polling, and coming back to the tab asks at once.
   * Example: import a song → Explore fills in with chords ~25 s later and stems ~2 min later,
   * without touching anything.
   */
  let retries = 0;
  async function poll(id: string, mySeq: number): Promise<void> {
    if (mySeq !== seq) return;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    let tl = await fetchTimeline(id);
    if (mySeq !== seq) return;
    const st = tl?.status;
    const failed = st?.quick === 'error' || st?.full === 'error';
    const idle = st?.quick === 'waiting' && st?.stage === 'Waiting for the audio upload';
    const needsStart = !tl || (!hasFull(tl) && (st?.full === 'stale' || st?.quick === 'stale' || (!st?.full && !st?.quick)
      || idle || (failed && retries < 3)));
    if (needsStart && failed) retries++;
    if (needsStart) {
      const started = await startTimeline(id);
      serviceOff.value = started !== 'ok';
      serviceOutdated.value = started === 'outdated';
      if (mySeq !== seq) return;
      if (!serviceOff.value) tl = (await fetchTimeline(id)) ?? tl;
    } else { serviceOff.value = false; serviceOutdated.value = false; }
    if (mySeq !== seq) return;
    if (tl) timeline.value = tl;
    if (!hasFull(tl)) pollTimer = setTimeout(() => poll(id, mySeq), serviceOff.value || failed ? 10000 : 2000);
  }

  /** Decodes the song in the browser and hands the samples to the spectrum worker. */
  async function makeSpectrum(id: string, mySeq: number): Promise<void> {
    const t = useLibraryStore().track(id);
    if (!t) return;
    spectrumState.value = 'decoding';
    try {
      // SPECTRUM SOURCE FIX - the browser's stored copy can report a size and still read back
      // nothing (or bytes that do not decode); the player then plays the service copy, but the
      // spectrum gave up with "Could not read the audio". Now each source is tried in turn:
      // the stored copy, then the service copy.
      // Example: after a refresh the stored Blob of song 2a970862 fails → service copy → spectrum.
      // An OfflineAudioContext decodes straight to 22.05 kHz, the rate the spectrum is made at.
      const decode = (bytes: ArrayBuffer) => new OfflineAudioContext(1, 1, SPEC_SR).decodeAudioData(bytes);
      const sources: (() => Promise<ArrayBuffer>)[] = [];
      if (t.audioBlob instanceof Blob && t.audioBlob.size > 0) sources.push(() => t.audioBlob!.arrayBuffer());
      sources.push(() => fetch(fallbackUrl(t)).then(r => { if (!r.ok) throw new Error('audio ' + r.status); return r.arrayBuffer(); }));
      let buf: AudioBuffer | null = null, lastErr: unknown = null;
      for (const read of sources) {
        try {
          const bytes = await read();
          if (!bytes.byteLength) throw new Error('empty audio');
          // Before decoding: decodeAudioData empties the buffer. A few ms, no second read.
          if (mySeq === seq) bitrate.value = parseBitrate(bytes);
          buf = await decode(bytes);
          break;
        } catch (err) { lastErr = err; }
        if (mySeq !== seq) return;
      }
      if (!buf) throw lastErr ?? new Error('no audio source');
      if (mySeq !== seq) return;
      const mono = new Float32Array(buf.length);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const ch = buf.getChannelData(c);
        for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
      }
      // LOUDNESS - measured once per song from the same decoded samples, before they go to the
      // worker (the transfer empties this array). About 30 ms for a 4-minute song.
      if (t.loudnessLufs === undefined) {
        const l = measureLoudness(mono, SPEC_SR);
        useLibraryStore().setLoudness(id, l.lufs, l.peakDb);
        usePlaybackStore().onLoudnessMeasured(id);
      }
      const result = await askWorker('mel', mono) as Spectrum;
      if (mySeq !== seq) return;
      spectrum.value = result;
      spectrumState.value = 'done';
      ensureView(spectrumKind.value);
    } catch (err) {
      console.warn('Spectrum notice:', err);
      if (mySeq === seq) spectrumState.value = 'error';
    }
  }

  function load(id: string | null): void {
    seq++;
    stopPolling();
    trackId.value = id;
    timeline.value = null;
    spectrum.value = null;
    bitrate.value = null;
    views.value = {};
    spectrumState.value = 'idle';
    serviceOff.value = false;
    serviceOutdated.value = false;
    retries = 0;
    if (!id) return;
    const mySeq = seq;
    poll(id, mySeq).catch(console.warn);
    // DELAY FIX 4 rule: decoding waits 1.5 s and an idle moment, so it does not compete with
    // the first seconds of playback.
    setTimeout(() => {
      const go = () => { if (mySeq === seq) makeSpectrum(id, mySeq).catch(console.warn); };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 3000 }); else go();
    }, 1500);
  }

  /** Follows the loaded track. Called once from App bootstrap. */
  function bind(): void {
    const playback = usePlaybackStore();
    watch(() => playback.trackId, id => { if (id !== trackId.value) load(id); }, { immediate: true });
    // Background tabs slow timers to about once a minute; ask straight away when the tab is back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && trackId.value && !hasFull(timeline.value)) poll(trackId.value, seq).catch(console.warn);
    });
    // The upload to the service (import, start-up sync) has finished: the job can run now.
    window.addEventListener('musicdna:audio-cached', e => {
      const id = (e as CustomEvent<string>).detail;
      if (id && id === trackId.value && !hasFull(timeline.value)) poll(id, seq).catch(console.warn);
    });
  }

  return { trackId, timeline, spectrum, bitrate, spectrumState, spectrumKind, spectrumView, viewBusy, setSpectrumKind, serviceOff, quick, full, statusText, load, bind };
});
