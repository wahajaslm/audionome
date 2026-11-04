import { defineStore } from 'pinia';
import { computed, reactive, ref, shallowRef, toRefs } from 'vue';
import type { NativeAudioEngine } from '../core/audioEngine';
import { fullMixUrl, resolveTrackSource, stemUrl, type PlayableTrack } from '../core/library';
import {
  contains, defaultLoopRange, enforceMinimumSelection, previewStart, quickSaveRange, rangeAround,
  RegionController, seekTarget, type Range, type RegionState,
} from '../core/playback';
import { PeakDecoder, placeholderPeaks } from '../core/waveformPeaks';
import { putSetting, getSetting } from '../core/repository';
import { useLibraryStore } from './library';
import { useListeningStore } from './listening';
import { useMomentFlowStore } from './momentFlow';
import { useMomentsStore } from './moments';
import { useIntelligenceStore } from './intelligence';
import { useUiStore } from './ui';

/** A passage queued by "Play all" in My Moments. */
export interface QueuedRange extends Range { trackId: string }

const isQuietPlayError = (err: unknown) => {
  const name = (err as Error | undefined)?.name;
  return name === 'NotAllowedError' || name === 'AbortError';
};

/**
 * The only owner of playback state: loaded track, media time, selection, loop and preview.
 * The single audio engine is attached once by composables/useAudioEngine.ts.
 */
export const usePlaybackStore = defineStore('playback', () => {
  // Loop / preview fields are one reactive object so core/playback.ts can update them directly.
  const region = reactive<RegionState>({ t: 0, sel: null, loop: false, loops: 0, previewEnd: null });
  const trackId = ref<string | null>(null);
  /** Media duration in seconds (placeholder until metadata arrives). */
  const duration = ref(32);
  /** Button state: true from 'play' until 'pause'/'ended'. Listening time uses 'playing'. */
  const playing = ref(false);
  const loading = ref(false);
  const volume = ref(0.62);
  const activeStem = ref('all');
  /** 400 amplitudes, 0–1, laid out on the media duration. */
  const peaks = shallowRef<number[]>(placeholderPeaks());
  const queue = ref<QueuedRange[]>([]);

  let engineRef: NativeAudioEngine | null = null;
  let controller: RegionController | null = null;
  let loadSeq = 0;
  let loadedTrackId: string | null = null;
  let objectUrl: string | null = null;
  const peakDecoder = new PeakDecoder({ mediaDuration: () => duration.value });

  const engine = () => engineRef;
  const currentTrack = computed<PlayableTrack | undefined>(() => useLibraryStore().track(trackId.value));

  /** Called once by useAudioEngine with the app's single engine instance. */
  function attachEngine(e: NativeAudioEngine): void {
    engineRef = e;
    const listening = useListeningStore();
    controller = new RegionController(region, {
      engine: e,
      log: { flushSpan: listening.flushSpan, emit: listening.emit, openSpan: listening.openSpan },
      isLoading: () => loading.value,
      onPreviewEnd: () => {
        if (!queue.value.length) return false;
        playNext().catch(console.error);
        return true;
      },
      onLoopCycle: loops => useMomentFlowStore().onLoopCycle(loops),
    });
    e.setVolume(volume.value);
  }

  /** Engine hook: the media reported its real duration. */
  function onDuration(d: number): void { duration.value = d; }

  /** Loop / preview end check: every frame (useMediaClock) and on 'timeupdate' as a backup. */
  function checkRegionEnd(t: number): void { controller?.check(t); }

  /** Media-clock tick (SYNC FIX 5): copy the element's time into the UI, then check region ends. */
  function onFrame(t: number): void {
    region.t = t;
    checkRegionEnd(t);
  }

  async function loadSettings(): Promise<void> {
    const v = await getSetting<number>('volume');
    if (typeof v === 'number') volume.value = v;
    engineRef?.setVolume(volume.value);
  }

  /**
   * Loads a track (or seeks within it if it is already loaded) and optionally plays it.
   * Port of index.html's selectTrack(): a newer call cancels an older one (loadSeq).
   */
  async function selectTrack(t: PlayableTrack | undefined, seconds = 0, play = false): Promise<void> {
    const ui = useUiStore(), flow = useMomentFlowStore();
    const e = engineRef;
    if (!t || !e) { if (play) ui.notify('Audio is unavailable.'); return; }
    if (!loading.value && loadedTrackId === t.id && trackId.value === t.id && e.hasSource()) {
      region.previewEnd = null; region.sel = null; region.loop = false;
      flow.describe = null; flow.ask = null; flow.justSaved = false;
      region.t = Math.min(seconds, duration.value); e.setTime(region.t);
      if (play) { try { await e.play(); playing.value = true; } catch (err) { console.warn(err); } }
      return;
    }
    const seq = ++loadSeq;
    loading.value = true; loadedTrackId = null; region.previewEnd = null;
    trackId.value = t.id; duration.value = t.durationSec || 32; region.sel = null;
    flow.resetForTrack();
    activeStem.value = 'all';
    region.loop = false; playing.value = false; region.t = seconds;
    useIntelligenceStore().recomputeInterest();
    try { if (e.isPlaying()) e.pause(); } catch { /* ignore */ }
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    const src = await resolveTrackSource(t);
    if (seq !== loadSeq) { if (src.objectUrl) URL.revokeObjectURL(src.objectUrl); return; }
    objectUrl = src.objectUrl;
    peaks.value = placeholderPeaks();
    peakDecoder.invalidate(seq);
    try {
      await e.load(src.srcUrl, seconds, src.fallbackUrl);
      if (seq !== loadSeq) return;
      loadedTrackId = t.id;
      loading.value = false;
      if (play) {
        try { await e.play(); playing.value = true; } catch (err) { console.warn('Play error:', err); }
      }
      // Real media duration: load() has waited for metadata (SYNC FIX 2), so this is no longer 0
      // and placeholder lengths in the library are corrected here.
      const d = e.getDuration();
      if (d && Number.isFinite(d) && d > 0) {
        duration.value = d;
        useLibraryStore().correctDuration(t.id, d);
      }
      peakDecoder.schedule(src.blob || src.srcUrl, seq, p => { if (seq === loadSeq) peaks.value = p; });
    } catch (err) {
      if (seq !== loadSeq) return;
      loading.value = false; console.warn('Audio load status:', err);
      if (play && !isQuietPlayError(err)) ui.notify('Unable to play this recording.');
    }
  }

  /** A deliberate switch to another song (Library): closes the listening span and logs it. */
  async function changeTrack(t: PlayableTrack, play = true): Promise<void> {
    const listening = useListeningStore();
    listening.flushSpan('track_change');
    listening.emit('track_change');
    await selectTrack(t, 0, play);
  }

  /**
   * Opens a passage of any track selected and plays it once (lists, previews, play-window).
   * Pressing it again while that passage plays pauses it.
   */
  async function openRange(a: number, b: number, id: string, toggle = true): Promise<void> {
    const e = engineRef;
    const t = useLibraryStore().track(id) || currentTrack.value;
    if (!t || !e) return;
    const sel = region.sel;
    const sameRange = trackId.value === t.id && sel && Math.abs(sel.a - a) < 0.5 && Math.abs(sel.b - b) < 0.5;
    if (toggle && sameRange && e.isPlaying()) { e.pause(); return; }
    await selectTrack(t, a, false);
    const flow = useMomentFlowStore();
    region.sel = { a, b }; region.t = a; region.loop = false; flow.nudge = false; flow.justSaved = false;
    region.previewEnd = b; e.setTime(a);
    try { await e.play(); } catch (err) { console.warn(err); }
  }

  /** Plays queued passages back to back. */
  async function playQueue(items: QueuedRange[]): Promise<void> {
    queue.value = [...items];
    await playNext();
  }

  async function playNext(): Promise<void> {
    const next = queue.value.shift();
    if (next) await openRange(next.a, next.b, next.trackId, false);
    else { region.previewEnd = null; engineRef?.pause(); }
  }

  /** Play/pause. With a selection, plays the selection to its end (a preview). */
  async function togglePlay(): Promise<void> {
    const e = engineRef, listening = useListeningStore();
    if (!e) return;
    if (e.isPlaying()) { e.pause(); listening.emit('pause'); return; }
    if (region.sel) {
      region.previewEnd = region.sel.b;
      const start = previewStart(region.t, region.sel);
      if (start !== null) { region.t = start; e.setTime(start); }
    } else {
      region.previewEnd = null;
    }
    try { await e.play(); listening.emit('play'); } catch (err) {
      console.warn('Playback notice:', err);
      if (!isQuietPlayError(err)) useUiStore().notify('Unable to play this recording.');
    }
  }

  async function playSelection(): Promise<void> {
    const e = engineRef;
    if (!e || !region.sel) return;
    region.t = region.sel.a; region.previewEnd = region.sel.b; e.setTime(region.sel.a);
    try { await e.play(); useListeningStore().emit('play'); } catch (err) { console.warn(err); }
  }

  /** Transport previous / next: jump ±15 s. Leaving the selection cancels its preview end. */
  function seekBy(deltaSec: number): void {
    const e = engineRef;
    if (!e) return;
    const from = region.t, to = seekTarget(region.t, deltaSec, duration.value);
    if (!region.sel || to < region.sel.a || to > region.sel.b) region.previewEnd = null;
    e.setTime(to); region.t = to;
    useListeningStore().emit('seek', 'user', { fromSec: from, toSec: to });
  }

  /** Waveform arrow keys: ±5 s, logged as a seek. */
  function stepBy(deltaSec: number): void {
    const e = engineRef;
    if (!e) return;
    const from = region.t;
    region.t = seekTarget(region.t, deltaSec, duration.value);
    e.setTime(region.t);
    useListeningStore().emit('seek', 'user', { fromSec: from, toSec: region.t });
  }

  /**
   * Waveform click (no drag). Inside the selection: jump there and keep the preview end.
   * On a saved moment: select it and play it once. Elsewhere: clear the selection and seek.
   * A click more than 3 s back also counts as a return to that spot (attention hint).
   */
  function clickSeek(target: number): void {
    const e = engineRef;
    if (!e) return;
    const flow = useMomentFlowStore();
    const from = region.t;
    if (target < region.t - 3) useIntelligenceStore().rewoundTo(target);
    if (region.sel && contains(region.sel, target)) { region.t = target; region.previewEnd = region.sel.b; }
    else {
      const hit = useMomentsStore().savedForCurrent.find(r => contains(r, target));
      if (hit) { region.t = hit.a; region.sel = { a: hit.a, b: hit.b }; region.previewEnd = hit.b; }
      else {
        region.t = target; region.sel = null; region.previewEnd = null; region.loop = false;
        flow.describe = null; flow.explore = false; flow.nudge = false;
      }
    }
    e.setTime(region.t);
    useListeningStore().emit('seek', 'user', { fromSec: from, toSec: region.t });
  }

  /** A drag on the waveform started: close any open question and stop looping. */
  function beginSelection(): void {
    const flow = useMomentFlowStore();
    flow.describe = null; flow.ask = null; flow.explore = false; flow.nudge = false; flow.justSaved = false;
    region.loop = false; region.loops = 0;
  }

  function updateSelection(a: number, b: number): void {
    region.sel = { a: Math.min(a, b), b: Math.max(a, b) };
  }

  /** Drag released: widen to the minimum, jump to its start and play it once. */
  function commitSelection(): void {
    const e = engineRef;
    if (!e || !region.sel) return;
    region.sel = enforceMinimumSelection(region.sel, duration.value);
    const from = region.t;
    region.t = region.sel.a; region.previewEnd = region.sel.b; e.setTime(region.sel.a);
    useListeningStore().emit('seek', 'user', { fromSec: from, toSec: region.sel.a });
    e.play().catch(() => { });
  }

  /** Waveform Enter: select ±10 s around the playhead (only when nothing is selected). */
  function selectAroundPlayhead(): void {
    if (region.sel) return;
    region.sel = rangeAround(region.t, duration.value);
    region.previewEnd = region.sel.b;
  }

  function clearSelection(): void {
    const flow = useMomentFlowStore();
    region.sel = null; region.previewEnd = null; region.loop = false;
    flow.describe = null; flow.nudge = false;
  }

  /** Loop toggle. With nothing selected, loops 12 s starting 5 s before the playhead. */
  function toggleLoop(): void {
    const e = engineRef;
    if (!e) return;
    if (!region.sel) region.sel = defaultLoopRange(region.t, duration.value);
    region.loop = !region.loop; region.loops = 0;
    if (region.loop) {
      region.t = region.sel.a; region.previewEnd = region.sel.b; e.setTime(region.t);
      if (!e.isPlaying()) e.play().catch(() => { });
    }
    useListeningStore().emit(region.loop ? 'loop_enabled' : 'loop_disabled', 'user',
      { momentStartSec: region.sel.a, momentEndSec: region.sel.b });
  }

  /** Heart in the playback bar: select the last 20 s (the caller then saves it). */
  function selectLast20s(): boolean {
    if (region.t < 2) { useUiStore().notify('Listen a little before saving a moment.'); return false; }
    region.sel = quickSaveRange(region.t);
    return true;
  }

  /** Switches the audio source to one separated stem (or back to 'all'), keeping position. */
  async function switchStem(stem: string): Promise<void> {
    const e = engineRef;
    stem = String(stem).toLowerCase();
    if (!e || !trackId.value || activeStem.value === stem) return;
    activeStem.value = stem;
    const pos = region.t, wasPlaying = playing.value;
    useUiStore().notify('Loading ' + stem + ' stem…');
    try {
      await e.load(stemUrl(trackId.value, stem), pos);
      if (wasPlaying) { await e.play(); playing.value = true; }
    } catch (err) { console.warn('Stem loading notice:', err); }
  }

  /** Leaving Explore returns to the full mix. */
  function restoreFullMix(): void {
    const e = engineRef;
    if (!e || !trackId.value || activeStem.value === 'all') return;
    activeStem.value = 'all';
    const pos = region.t, wasPlaying = playing.value;
    e.load(fullMixUrl(trackId.value), pos).then(() => { if (wasPlaying) e.play().catch(console.warn); }).catch(console.warn);
  }

  function setVolume(v: number): void {
    volume.value = v;
    engineRef?.setVolume(v);
    useListeningStore().emit('volume', 'user', { volume: v });
    putSetting('volume', v).catch(console.warn);
  }

  // SYNC FIX 8 - remember where a drag on the progress rail started, so the seek event has a
  // real fromSec. Before, only toSec was logged; the analysis then read the missing fromSec as
  // 0:00 and treated every drag as "skipped ahead from 0:00", adding false "left early" evidence.
  // Example: dragging from 0:30 to 2:10 now logs { fromSec: 30, toSec: 130 }.
  let scrubFrom: number | null = null;
  function beginScrub(): void { scrubFrom = useListeningStore().mediaTime(); }
  function scrubTo(sec: number): void {
    region.t = Math.max(0, Math.min(duration.value, sec));
    engineRef?.setTime(region.t);
  }
  function endScrub(sec: number): void {
    scrubTo(sec);
    if (scrubFrom !== null) useListeningStore().emit('seek', 'user', { fromSec: scrubFrom, toSec: region.t });
    scrubFrom = null;
  }

  return {
    ...toRefs(region), trackId, duration, playing, loading, volume, activeStem, peaks, queue, currentTrack,
    engine, attachEngine, onDuration, onFrame, checkRegionEnd, loadSettings,
    selectTrack, changeTrack, openRange, playQueue, playNext, togglePlay, playSelection, seekBy, stepBy,
    clickSeek, beginSelection, updateSelection, commitSelection, selectAroundPlayhead, clearSelection,
    toggleLoop, selectLast20s, switchStem, restoreFullMix, setVolume, beginScrub, scrubTo, endScrub,
  };
});
