import { defineStore } from 'pinia';
import { computed, ref, shallowRef, watch } from 'vue';
import { fetchTimeline, hasFull, hasQuick, startTimeline, type Timeline } from '../core/timeline';
import { SPEC_SR, type Spectrum } from '../core/spectrum';
import { fallbackUrl } from '../core/library';
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
  const spectrum = shallowRef<Spectrum | null>(null);
  const spectrumState = ref<'idle' | 'decoding' | 'done' | 'error'>('idle');
  /** True after a start request failed: the service is not running. */
  const serviceOff = ref(false);

  let seq = 0;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let worker: Worker | null = null;
  let workerSeq = 0;

  const quick = computed(() => hasQuick(timeline.value));
  const full = computed(() => hasFull(timeline.value));

  /** One status line for the player header. */
  const statusText = computed(() => {
    const st = timeline.value?.status;
    if (full.value) return { busy: false, text: 'Analysed · stems, beats, chords, parts' };
    if (serviceOff.value) return { busy: false, text: spectrum.value ? 'Analysis service is off · spectrum only' : 'Analysis service is off' };
    if (st?.full === 'error' || st?.quick === 'error') return { busy: false, text: 'Analysis failed · ' + (st.error || 'try again') };
    if (quick.value) return { busy: true, text: (st?.stage || 'Separating stems') + '… · beats and chords ready' };
    if (st?.quick === 'running') return { busy: true, text: 'Finding beats and chords…' };
    if (st?.quick === 'waiting') return { busy: true, text: 'Waiting for the analysis service…' };
    return { busy: true, text: spectrum.value ? 'Starting analysis… · spectrum ready' : 'Reading audio…' };
  });

  function stopPolling(): void { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } }

  /** Polls every 2 s until the full tier is in (every 10 s while the service is off). */
  async function poll(id: string, mySeq: number): Promise<void> {
    if (mySeq !== seq) return;
    let tl = await fetchTimeline(id);
    if (mySeq !== seq) return;
    const st = tl?.status;
    const needsStart = !tl || (!hasFull(tl) && (st?.full === 'stale' || st?.quick === 'stale' || (!st?.full && !st?.quick)));
    if (needsStart) {
      serviceOff.value = !(await startTimeline(id));
      if (mySeq !== seq) return;
      if (!serviceOff.value) tl = (await fetchTimeline(id)) ?? tl;
    } else serviceOff.value = false;
    if (mySeq !== seq) return;
    if (tl) timeline.value = tl;
    const finished = hasFull(tl) || tl?.status?.full === 'error';
    if (!finished) pollTimer = setTimeout(() => poll(id, mySeq), serviceOff.value ? 10000 : 2000);
  }

  /** Decodes the song in the browser and hands the samples to the spectrum worker. */
  async function makeSpectrum(id: string, mySeq: number): Promise<void> {
    const t = useLibraryStore().track(id);
    if (!t) return;
    spectrumState.value = 'decoding';
    try {
      const bytes = t.audioBlob instanceof Blob && t.audioBlob.size > 0
        ? await t.audioBlob.arrayBuffer()
        : await fetch(fallbackUrl(t)).then(r => { if (!r.ok) throw new Error('audio ' + r.status); return r.arrayBuffer(); });
      if (mySeq !== seq) return;
      // An OfflineAudioContext decodes straight to 22.05 kHz, the rate the spectrum is made at.
      const buf = await new OfflineAudioContext(1, 1, SPEC_SR).decodeAudioData(bytes);
      if (mySeq !== seq) return;
      const mono = new Float32Array(buf.length);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const ch = buf.getChannelData(c);
        for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
      }
      worker ??= new Worker(new URL('../core/spectrum.worker.ts', import.meta.url), { type: 'module' });
      const myWorkerSeq = ++workerSeq;
      const result = await new Promise<Spectrum>((resolve, reject) => {
        worker!.onmessage = (e: MessageEvent<{ id: number; spectrum?: Spectrum; error?: string }>) => {
          if (e.data.id !== myWorkerSeq) return;
          e.data.spectrum ? resolve(e.data.spectrum) : reject(new Error(e.data.error));
        };
        worker!.postMessage({ id: myWorkerSeq, samples: mono }, [mono.buffer]);
      });
      if (mySeq !== seq) return;
      spectrum.value = result;
      spectrumState.value = 'done';
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
    spectrumState.value = 'idle';
    serviceOff.value = false;
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
  }

  return { trackId, timeline, spectrum, spectrumState, serviceOff, quick, full, statusText, load, bind };
});
