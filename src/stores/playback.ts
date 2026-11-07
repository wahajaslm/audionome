import { defineStore } from 'pinia';
import { computed, reactive, ref, toRefs, watch } from 'vue';
import type { NativeAudioEngine } from '../core/audioEngine';
import { fullMixUrl, resolveTrackSource, stemUrl, type PlayableTrack } from '../core/library';
import {
  beatGrid, contains, defaultLoopRange, enforceMinimumSelection, quickSaveRange, rangeAround,
  RegionController, seekTarget, snapRange, type Range, type RegionState,
} from '../core/playback';
import { normalizationGainDb } from '../core/audioGraph';
import { practicingNow } from '../core/practice';
import { radioKey, radioQueue, type RadioItem } from '../core/radio';
import { cleanEffects, effectsActive, GROUPS, NEUTRAL, PRESETS, withControl, type EffectGroup, type EffectParams, type PresetName, type StemMode } from '../core/effects';
import { putSetting, getSetting } from '../core/repository';
import { useLibraryStore } from './library';
import { useListeningStore } from './listening';
import { useMomentFlowStore } from './momentFlow';
import { useMomentsStore } from './moments';
import { useIntelligenceStore } from './intelligence';
import { useUiStore } from './ui';
import { useTimelineStore } from './timeline';

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
  /** Playback speed, pitch kept. Back to 1 for each new song. */
  const rate = ref(1);
  /** Settings: play every song at the same loudness. */
  const normalize = ref(true);
  /** Settings: selection edges move to the beat. */
  const snapToBeat = ref(true);
  /** Effects on what you hear (core/effects.ts), remembered between visits. */
  const effects = ref<EffectParams>({ ...NEUTRAL });
  const effectsOn = computed(() => effectsActive(effects.value));
  /** The Effects drawer under the strip is open, and which group it shows (remembered). */
  const effectsOpen = ref(false);
  const effectsTab = ref<EffectGroup>('space');
  function setEffectsTab(g: EffectGroup): void { effectsTab.value = g; putSetting('effectsTab', g).catch(() => { }); }
  /** Bumped when a crossfade swaps decks, so the waveform follows the playing element. */
  const deck = ref(0);
  /** Moment radio (core/radio.ts): on while it runs; `radioNow` is the passage playing. */
  const radio = ref(false);
  const radioNow = ref<RadioItem | null>(null);
  let radioPlayed = new Set<string>();
  let radioUpcoming: RadioItem[] = [];
  /** True while the radio is moving to its next passage (loading, then crossfading). */
  let radioBusy = false;
  /** Crossfade length between passages, and after Skip (seconds). */
  const RADIO_XF = 1.5, SKIP_XF = 0.8;
  /** The next passage starts loading this much before the crossfade should begin. */
  const RADIO_LEAD = 0.4;
  /** Practising now (slowed down, or a long loop): events are tagged so taste ignores them. */
  const practicing = computed(() => practicingNow({ rate: rate.value, loop: region.loop, loops: region.loops }));
  // QUIET FIX - said once per device (it was once per song), the first time practice starts,
  // so the listener knows why their loops do not show up as "moments you return to".
  watch(practicing, async on => {
    if (!on || await getSetting<boolean>('practiceTold')) return;
    putSetting('practiceTold', true).catch(() => { });
    useUiStore().notify('Practice mode: these loops will not change your taste profile.', 'See Practising', '/moments?c=4');
  });
  const queue = ref<QueuedRange[]>([]);

  let engineRef: NativeAudioEngine | null = null;
  let controller: RegionController | null = null;
  let loadSeq = 0;
  let loadedTrackId: string | null = null;
  let objectUrl: string | null = null;

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
        if (!queue.value.length && !radio.value) return false;
        if (radioBusy) return true; // the crossfade is on its way: keep playing into it
        playNext().catch(console.error);
        return true;
      },
      onLoopCycle: loops => useMomentFlowStore().onLoopCycle(loops),
    });
    e.setVolume(volume.value);
    applyEffects();
    // Echo repeats on the beat: re-time it when a song's tempo arrives.
    watch(() => useTimelineStore().timeline?.tempoBpm, applyEffects);
    // A stem mode (Karaoke, A cappella, No drums) carries over to the next song once its stems
    // exist, without a toast each time.
    watch(() => [trackId.value, useTimelineStore().full] as const, ([, full]) => {
      const want = stemFor(effects.value.stem);
      if (want !== 'all' && full && activeStem.value !== want) switchStem(want, true).catch(console.warn);
    });
  }

  /** Engine hook: the media reported its real duration. */
  function onDuration(d: number): void { duration.value = d; }

  /** Loop / preview end check: every frame (useMediaClock) and on 'timeupdate' as a backup. */
  function checkRegionEnd(t: number): void { controller?.check(t); }

  /** Media-clock tick (SYNC FIX 5): copy the element's time into the UI, then check region ends. */
  function onFrame(t: number): void {
    region.t = t;
    checkRegionEnd(t);
    if (Date.now() - savedAt > 5000) rememberPosition();
    // Moment radio: the next passage starts under the end of this one (crossfade).
    if (radio.value && region.previewEnd !== null && !radioBusy && t >= region.previewEnd - RADIO_XF - RADIO_LEAD) {
      radioAdvance(RADIO_XF).catch(console.warn);
    }
  }

  /**
   * Moment radio. Starts from a button (Discover); runs until you stop it or take over
   * (play another song or moment, or click away from the passage).
   * Next skips (logged as a 'skip', a mild "not this" for the ranker); ♡ saves the passage.
   * Example: start → suggestion 1 crossfades into suggestion 2 … every 4th is a saved moment.
   */
  async function startRadio(): Promise<void> {
    radioPlayed = new Set(); radioUpcoming = [];
    radio.value = true;
    await radioAdvance();
  }

  function stopRadio(): void {
    if (!radio.value) return;
    radio.value = false; radioNow.value = null; radioUpcoming = [];
  }

  /** The bar's back button on the radio: the passage from its start. */
  function radioRestart(): void {
    if (!radio.value || !region.sel) return;
    region.t = region.sel.a; engineRef?.setTime(region.sel.a);
  }

  /** Skip: logs it at the current position and moves on. */
  async function radioSkip(): Promise<void> {
    if (!radio.value) return;
    if (radioBusy) return;
    useListeningStore().emit('skip', 'user', { positionSec: region.t });
    await radioAdvance(SKIP_XF);
  }

  /**
   * Moves the radio to its next passage: a crossfade of `xfSec` while playing; otherwise (paused,
   * no Web Audio, or the source failed) a short fade out, load, fade in.
   */
  async function radioAdvance(xfSec = 0): Promise<void> {
    if (!radio.value || radioBusy) return;
    radioBusy = true;
    try { await radioAdvanceNow(xfSec); } finally { radioBusy = false; }
  }

  async function radioAdvanceNow(xfSec: number): Promise<void> {
    if (radioUpcoming.length < 2) {
      const intel = useIntelligenceStore(), lib = useLibraryStore();
      const playable = (x: { trackId: string }) => !!lib.track(x.trackId);
      const more = () => radioQueue(intel.suggestions.filter(playable), useMomentsStore().moments.filter(playable),
        intel.ratings, new Set([...radioPlayed, ...radioUpcoming.map(radioKey)]), 8, radioUpcoming.at(-1)?.trackId ?? trackId.value);
      let next = more();
      // Everything played once: start the round again rather than stop.
      if (!next.length && radioPlayed.size) { radioPlayed = new Set(); next = more(); }
      radioUpcoming.push(...next);
    }
    const item = radioUpcoming.shift();
    if (!item) { stopRadio(); useUiStore().notify('Save a moment or analyse a song first; then the radio has something to play.'); return; }
    radioPlayed.add(radioKey(item));
    if (xfSec > 0 && await crossfadeTo(item, xfSec)) { radioNow.value = item; return; }
    if (!radio.value) return;
    radioNow.value = item;
    if (engineRef?.isPlaying()) { engineRef.fade(0, 0.25); await new Promise(r => setTimeout(r, 250)); }
    await openRangeInternal(item.a, item.b, item.trackId, false, true);
    engineRef?.fade(1, 0.35);
  }

  /**
   * CROSSFADE FIX - plays a passage by crossfading into it on the engine's idle deck, and moves
   * the player's state (song, selection, passage end) to it. False when it could not (the
   * caller then loads it the normal way). The old song's object URL is released only after
   * the old deck has stopped reading it.
   */
  async function crossfadeTo(item: RadioItem, sec: number): Promise<boolean> {
    const e = engineRef, t = useLibraryStore().track(item.trackId);
    if (!e || !t || !e.canCrossfade() || !e.isPlaying()) return false;
    const src = await resolveTrackSource(t);
    const db = normalize.value ? normalizationGainDb({ lufs: t.loudnessLufs, peakDb: t.peakDb }) : 0;
    // The old passage's listening span ends here, while its deck is still the playing one
    // (after the swap the clock reads the new passage). The new deck's 'playing' opens the next.
    const listening = useListeningStore();
    listening.flushSpan('radio_next');
    const ok = radio.value && await e.crossfade(src.srcUrl, item.a, src.fallbackUrl, sec, db);
    if (!ok) {
      if (src.objectUrl) URL.revokeObjectURL(src.objectUrl);
      if (e.isPlaying()) listening.openSpan();
      return false;
    }
    const old = objectUrl;
    objectUrl = src.objectUrl;
    if (old) setTimeout(() => URL.revokeObjectURL(old), (sec + 2) * 1000);
    loadSeq++; // any slower load still running is now out of date
    const changed = trackId.value !== t.id;
    trackId.value = t.id; loadedTrackId = t.id; loading.value = false;
    if (changed) {
      useMomentFlowStore().resetForTrack();
      activeStem.value = 'all';
      const d = e.getDuration();
      duration.value = d > 0 ? d : (t.durationSec || duration.value);
      useIntelligenceStore().recomputeInterest();
    }
    region.sel = { a: item.a, b: item.b }; region.t = item.a; region.loop = false; region.loops = 0;
    region.previewEnd = item.b;
    playing.value = true;
    deck.value++; // now the waveform re-binds, with the new song's state already in place
    rememberPosition();
    return true;
  }

  // RESUME FIX - where you are is stored every 5 s while playing, on pause, on a song change and
  // when the tab is hidden or closed, so a refresh reopens the same song at the same place.
  let savedAt = 0;
  function rememberPosition(): void {
    savedAt = Date.now();
    if (!trackId.value || loading.value) return;
    putSetting('lastPlayed', JSON.stringify({ trackId: trackId.value, t: Math.round(region.t * 10) / 10 })).catch(() => { });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') rememberPosition(); });
    window.addEventListener('pagehide', rememberPosition);
  }
  watch(playing, p => { if (!p) rememberPosition(); });

  /** The song and position stored by rememberPosition, or null. Near the end → from the start. */
  async function lastPlayed(): Promise<{ trackId: string; t: number } | null> {
    try {
      const v = JSON.parse((await getSetting<string>('lastPlayed')) || 'null');
      if (!v || typeof v.trackId !== 'string') return null;
      const d = useLibraryStore().track(v.trackId)?.durationSec || 0;
      return { trackId: v.trackId, t: d && v.t > d - 5 ? 0 : Math.max(0, Number(v.t) || 0) };
    } catch { return null; }
  }

  async function loadSettings(): Promise<void> {
    const v = await getSetting<number>('volume');
    if (typeof v === 'number') volume.value = v;
    engineRef?.setVolume(volume.value);
    const n = await getSetting<boolean>('normalizeLoudness');
    if (typeof n === 'boolean') normalize.value = n;
    const snap = await getSetting<boolean>('snapToBeat');
    if (typeof snap === 'boolean') snapToBeat.value = snap;
    try { effects.value = cleanEffects(JSON.parse((await getSetting<string>('effects')) || 'null')); } catch { effects.value = { ...NEUTRAL }; }
    const tab = await getSetting<string>('effectsTab');
    if (GROUPS.some(g => g.id === tab)) effectsTab.value = tab as EffectGroup;
    applyEffects();
    applyLoudness(0);
  }

  /**
   * Sets the loudness gain for the loaded song. 0 s ramp when a song loads (before sound),
   * a slow ramp when the first measurement arrives during playback.
   * Example: a −9 LUFS master loads → −8 dB from its first sample.
   */
  function applyLoudness(rampSec: number): void {
    const t = currentTrack.value;
    engineRef?.setNormalization(normalize.value && t ? normalizationGainDb({ lufs: t.loudnessLufs, peakDb: t.peakDb }) : 0, rampSec);
  }

  /** The timeline store measured a song: level it now if it is the one playing. */
  function onLoudnessMeasured(id: string): void {
    if (id === trackId.value) applyLoudness(2);
  }

  async function setNormalize(on: boolean): Promise<void> {
    normalize.value = on;
    applyLoudness(0.3);
    await putSetting('normalizeLoudness', on);
  }

  async function setSnapToBeat(on: boolean): Promise<void> {
    snapToBeat.value = on;
    await putSetting('snapToBeat', on);
  }

  /**
   * Speed for practising a passage: same key, slower. Cycles 1 → 0.9 → 0.75 → 0.5 → 1.
   * Example: looping a fast taan at 0.75× → each note is audible, still in the singer's key.
   */
  const RATES = [1, 0.9, 0.75, 0.5];
  function setRate(r: number): void {
    rate.value = r;
    engineRef?.setRate(r);
  }
  function cycleRate(): void {
    const i = RATES.indexOf(rate.value);
    setRate(RATES[(i + 1) % RATES.length]);
  }

  /** Sends the effects to the engine; echo and tremolo follow the song's tempo when it is known. */
  function applyEffects(): void {
    engineRef?.setEffects(effects.value, useTimelineStore().timeline?.tempoBpm ?? null);
  }

  /** The stem source for a stem mode: Karaoke = without vocals, A cappella = vocals only. */
  const stemFor = (m: StemMode) => (m === 'mix' ? 'all' : m);

  /**
   * Sets the effects (a preset or one moved control), remembers them, and handles Karaoke,
   * which plays the song without its vocal stem.
   * Example: setEffects(PRESETS.hall.params) → a large room; withControl(p, 'pan', -0.5) → custom.
   */
  async function setEffects(p: EffectParams): Promise<void> {
    const prevStem = effects.value.stem;
    effects.value = p;
    applyEffects();
    putSetting('effects', JSON.stringify(p)).catch(() => { });
    if (p.stem !== prevStem && activeStem.value !== stemFor(p.stem)) await switchStem(stemFor(p.stem));
  }
  const applyPreset = (name: Exclude<PresetName, 'custom'>) => setEffects({ ...PRESETS[name].params });
  function setControl<K extends keyof EffectParams>(key: K, value: EffectParams[K]): Promise<void> {
    return setEffects(withControl(effects.value, key, value));
  }

  /** The selection on the beat (when the setting is on and the song has beats). */
  function snapped(r: Range): Range {
    return snapToBeat.value ? snapRange(r, beatGrid(useTimelineStore().timeline), duration.value) : r;
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
    if (rate.value !== 1) setRate(1);
    region.loop = false; playing.value = false; region.t = seconds;
    useIntelligenceStore().recomputeInterest();
    try { if (e.isPlaying()) e.pause(); } catch { /* ignore */ }
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    const src = await resolveTrackSource(t);
    if (seq !== loadSeq) { if (src.objectUrl) URL.revokeObjectURL(src.objectUrl); return; }
    objectUrl = src.objectUrl;
    // Level set before the first sample plays (known songs); new songs are levelled once measured.
    applyLoudness(0);
    try {
      await e.load(src.srcUrl, seconds, src.fallbackUrl);
      if (seq !== loadSeq) return;
      loadedTrackId = t.id;
      loading.value = false;
      rememberPosition();
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
    stopRadio();
    await selectTrack(t, 0, play);
  }

  /**
   * Opens a passage of any track selected and plays from its start (lists, previews, play-window).
   * Pressing it again while that passage plays pauses it.
   */
  /** Opens a passage chosen by the user: Moment radio stops (you took over). */
  async function openRange(a: number, b: number, id: string, toggle = true, stopAtEnd = false): Promise<void> {
    stopRadio();
    await openRangeInternal(a, b, id, toggle, stopAtEnd);
  }

  async function openRangeInternal(a: number, b: number, id: string, toggle = true, stopAtEnd = false): Promise<void> {
    const e = engineRef;
    const t = useLibraryStore().track(id) || currentTrack.value;
    if (!t || !e) return;
    const sel = region.sel;
    const sameRange = trackId.value === t.id && sel && Math.abs(sel.a - a) < 0.5 && Math.abs(sel.b - b) < 0.5;
    if (toggle && sameRange && e.isPlaying()) { e.pause(); return; }
    // KEEPS PLAYING FIX 2 - opening what is already playing must not touch playback (Spotify:
    // tapping the playing song just shows it). Before, it reloaded the passage from its start.
    // Example: a moment plays at 1:50 of 1:42–2:49, you open it -> it keeps playing at 1:50.
    const playingHere = trackId.value === t.id && loadedTrackId === t.id && e.isPlaying()
      && region.t >= a - 0.5 && region.t <= b + 0.5;
    if (!toggle && !stopAtEnd && playingHere) { region.sel = { a, b }; return; }
    await selectTrack(t, a, false);
    const flow = useMomentFlowStore();
    region.sel = { a, b }; region.t = a; region.loop = false; flow.nudge = false; flow.justSaved = false;
    // KEEPS PLAYING FIX 3 - a moment used to pause at its end and rewind ("plays it once"),
    // so playback seemed to stop by itself. Now it plays on into the song. Only a queue
    // (Play all) stops at each end, to move to the next passage.
    // Example: play moment 1:42–2:49 -> at 2:49 the song carries on to 2:50, 2:51, ...
    region.previewEnd = stopAtEnd ? b : null; e.setTime(a);
    try { await e.play(); } catch (err) { console.warn(err); }
  }

  /** Plays queued passages back to back. */
  async function playQueue(items: QueuedRange[]): Promise<void> {
    stopRadio();
    queue.value = [...items];
    await playNext();
  }

  async function playNext(): Promise<void> {
    if (radio.value) { await radioAdvance(); return; }
    const next = queue.value.shift();
    if (next) await openRangeInternal(next.a, next.b, next.trackId, false, true);
    else { region.previewEnd = null; engineRef?.pause(); }
  }

  /**
   * Play/pause from the playhead.
   * KEEPS PLAYING FIX - with a passage selected, Play used to play only that passage and stop
   * at its end, so the music seemed to stop by itself. Now, like Spotify, playback runs until
   * you pause, the song ends or another song starts. Loop still repeats the passage.
   * Example: 0:40–0:55 selected, playhead 0:42, Play → plays on past 0:55.
   */
  async function togglePlay(): Promise<void> {
    const e = engineRef, listening = useListeningStore();
    if (!e) return;
    if (e.isPlaying()) { e.pause(); listening.emit('pause'); return; }
    if (!radio.value) region.previewEnd = null; // the radio keeps its passage end across a pause
    try { await e.play(); listening.emit('play'); } catch (err) {
      console.warn('Playback notice:', err);
      if (!isQuietPlayError(err)) useUiStore().notify('Unable to play this recording.');
    }
  }

  /**
   * The loop bar's ▶ / ⏸: pauses, or plays the passage — from the playhead when it is inside
   * the passage, else from its start. Playback carries on past the end unless Loop is on.
   */
  async function playSelection(): Promise<void> {
    const e = engineRef;
    if (!e || !region.sel) return;
    if (e.isPlaying()) { e.pause(); useListeningStore().emit('pause'); return; }
    region.previewEnd = null;
    if (!contains(region.sel, region.t)) { region.t = region.sel.a; e.setTime(region.sel.a); }
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
    if (target < region.t - 3 && !practicing.value) useIntelligenceStore().rewoundTo(target);
    // KEEPS PLAYING FIX - clicks on the waveform only move the playhead; they never set an end.
    // Inside the passage: jump there. The radio keeps its passage end, so it still moves on.
    if (region.sel && contains(region.sel, target)) { region.t = target; if (!radio.value) region.previewEnd = null; }
    else {
      // A saved moment, else a faint "you come back here" mark (QUIET FIX: the mark replaced
      // the text line; clicking it selects the passage, so ♡ saves it).
      const hit = useMomentsStore().savedForCurrent.find(r => contains(r, target))
        ?? (useListeningStore().learning ? useIntelligenceStore().interest.find(r => r.n >= 2 && contains(r, target)) : undefined);
      if (hit) { stopRadio(); region.t = hit.a; region.sel = { a: hit.a, b: hit.b }; region.previewEnd = null; }
      else {
        stopRadio(); // clicking away from the passage: you took over
        region.t = target; region.sel = null; region.previewEnd = null; region.loop = false;
        flow.describe = null; flow.nudge = false; // Explore stays open: it follows the whole song now
      }
    }
    e.setTime(region.t);
    useListeningStore().emit('seek', 'user', { fromSec: from, toSec: region.t });
  }

  /**
   * A drag on the waveform started: close any open question.
   * EXPLORE STAYS FIX - a new drag used to close Explore and stop the loop, so picking the next
   * passage to study meant reopening Explore and pressing Loop again every time.
   * Now Explore stays open on the new passage, and a running loop moves to it on release.
   * Example: Explore open, looping 0:10–0:18, drag 0:20–0:28 → Explore shows 0:20–0:28 and
   * the loop plays 0:20–0:28.
   */
  let reloopOnCommit = false;
  function beginSelection(): void {
    const flow = useMomentFlowStore();
    flow.describe = null; flow.ask = null; flow.nudge = false; flow.justSaved = false;
    reloopOnCommit = region.loop;
    region.loop = false; region.loops = 0;
  }

  function updateSelection(a: number, b: number): void {
    region.sel = { a: Math.min(a, b), b: Math.max(a, b) };
  }

  /**
   * Drag released: widen to the minimum. Nothing else.
   * NO AUTO-PLAY FIX - releasing a drag used to jump to the passage start and play it, so just
   * marking a passage (to loop or save it) started it. Now the selection is only marked;
   * Play or Loop starts it.
   * Example: paused at 0:40, drag 1:10–1:25 -> still paused at 0:40, 1:10–1:25 selected.
   */
  function commitSelection(): void {
    if (!engineRef || !region.sel) return;
    region.sel = snapped(enforceMinimumSelection(region.sel, duration.value));
    region.previewEnd = null;
    if (reloopOnCommit) { reloopOnCommit = false; toggleLoop(); }
  }

  /**
   * RESIZE FIX - dragging an edge of the selection changes its range and keeps the loop and
   * Explore open (a new drag would reset both). If the playhead falls outside the new range
   * while looping, it jumps to the new start.
   * Example: looping 1:10–1:25 at 1:20, drag the right edge to 1:15 → playhead jumps to 1:10.
   */
  function resizeSelection(a: number, b: number): void {
    const e = engineRef;
    if (!e || !region.sel) return;
    region.sel = { a, b };
    if (region.previewEnd !== null) region.previewEnd = b;
    if (region.loop && !contains(region.sel, region.t)) { region.t = a; e.setTime(a); }
  }

  /** Edge drag released: widen to the minimum length. */
  function endResize(): void {
    if (!region.sel) return;
    region.sel = snapped(enforceMinimumSelection(region.sel, duration.value));
    if (region.previewEnd !== null) region.previewEnd = region.sel.b;
    if (region.loop && !contains(region.sel, region.t)) { region.t = region.sel.a; engineRef?.setTime(region.sel.a); }
  }

  /** Waveform Enter: select ±10 s around the playhead (only when nothing is selected). */
  function selectAroundPlayhead(): void {
    if (region.sel) return;
    region.sel = snapped(rangeAround(region.t, duration.value));
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
    if (!region.sel) region.sel = snapped(defaultLoopRange(region.t, duration.value));
    region.loop = !region.loop; region.loops = 0;
    // NO AUTO-PLAY FIX - switching the loop on no longer starts playback. Paused: the playhead
    // moves to the loop start, so Play starts the loop. Playing: it jumps to the loop start.
    // Example: paused, select 1:10–1:25, press Loop -> still paused, playhead at 1:10.
    if (region.loop) {
      region.t = region.sel.a; region.previewEnd = region.sel.b; e.setTime(region.t);
      // LIVE EXPLORE FIX - looping a passage opens Explore, so its live analysis is on screen.
      const flow = useMomentFlowStore();
      flow.explore = true; flow.describe = null; flow.nudge = false;
    }
    useListeningStore().emit(region.loop ? 'loop_enabled' : 'loop_disabled', 'user',
      { momentStartSec: region.sel.a, momentEndSec: region.sel.b });
  }

  /** Heart in the playback bar: select the last 20 s (the caller then saves it). */
  function selectLast20s(): boolean {
    if (region.t < 2) { useUiStore().notify('Listen a little before saving a moment.'); return false; }
    region.sel = snapped(quickSaveRange(region.t));
    return true;
  }

  /** Switches the audio source to one separated stem (or back to 'all'), keeping position. */
  async function switchStem(stem: string, quiet = false): Promise<void> {
    const e = engineRef;
    stem = String(stem).toLowerCase();
    if (!e || !trackId.value || activeStem.value === stem) return;
    // STEM STALL FIX - ask first whether the stem exists, and only then swap the source.
    // Before, the source was swapped blind: a missing stem left the player on a dead URL
    // (silence, "stalled") and the song had to be reloaded.
    // Example: Vocals on a song not fully analysed -> "not separated yet", the mix keeps playing.
    const url = stemUrl(trackId.value, stem), id = trackId.value;
    const ok = stem === 'all' || await fetch(url, { headers: { Range: 'bytes=0-1' } }).then(r => r.ok, () => false);
    if (trackId.value !== id) return;
    // 'no_drums' etc. is the song without that stem (Explore's Mute). Example: "Without drums".
    const name = stem.startsWith('no_') ? 'Without ' + stem.slice(3) : stem.charAt(0).toUpperCase() + stem.slice(1);
    if (!ok) { if (!quiet) useUiStore().notify(name + ': stems are not separated yet. They are on the way.'); return; }
    const prevSrc = e.el.src, prevStem = activeStem.value;
    activeStem.value = stem;
    const pos = region.t, wasPlaying = playing.value;
    if (!quiet) useUiStore().notify('Loading ' + name.toLowerCase() + '…');
    try {
      await e.load(url, pos);
      if (!e.hasSource()) throw new Error('stem failed to load');
      if (wasPlaying) { await e.play(); playing.value = true; }
    } catch (err) {
      console.warn('Stem loading notice:', err);
      useUiStore().notify('Could not play ' + name.toLowerCase() + ' · back to what was playing.');
      activeStem.value = prevStem;
      await e.load(prevSrc, region.t || pos);
      if (wasPlaying) e.play().catch(console.warn);
    }
  }

  /** Leaving Explore returns to the full mix (Karaoke keeps the song without vocals). */
  function restoreFullMix(): void {
    const e = engineRef;
    if (!e || !trackId.value || activeStem.value === 'all') return;
    if (effects.value.stem !== 'mix' && activeStem.value === stemFor(effects.value.stem)) return;
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
    ...toRefs(region), trackId, duration, playing, loading, volume, activeStem, queue, currentTrack,
    rate, normalize, snapToBeat, practicing, setRate, effects, effectsOn, effectsOpen, effectsTab, setEffectsTab, setEffects, applyPreset, setControl, deck, radio, radioNow, startRadio, stopRadio, radioSkip, radioRestart, cycleRate, setNormalize, setSnapToBeat, onLoudnessMeasured,
    engine, attachEngine, onDuration, onFrame, checkRegionEnd, loadSettings, lastPlayed,
    selectTrack, changeTrack, openRange, playQueue, playNext, togglePlay, playSelection, seekBy, stepBy,
    clickSeek, beginSelection, updateSelection, commitSelection, resizeSelection, endResize, selectAroundPlayhead, clearSelection,
    toggleLoop, selectLast20s, switchStem, restoreFullMix, setVolume, beginScrub, scrubTo, endScrub,
  };
});
