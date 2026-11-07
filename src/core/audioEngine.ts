/**
 * Native HTML5 audio engine shared by every Music DNA front-end.
 *
 * One hidden <audio> element plays the song. Nothing here knows about the UI: the engine
 * reports what the media element does (time, play, playing, waiting, pause, finish) and the
 * UI decides what to draw. It is the same engine index.html used inline before, with the
 * same fixes, moved here so the Vue player and the classic page cannot drift apart.
 */

import { dbToGain, type AudioGraphLike, type DeckGainLike } from './audioGraph.ts';

/** 'swap': a crossfade made the other deck the playing one (the waveform follows it). */
export type EngineEvent = 'timeupdate' | 'play' | 'pause' | 'finish' | 'playing' | 'waiting' | 'swap';
type Listener = (value?: number) => void;

/** The parts of HTMLAudioElement the engine uses. Tests pass a small fake with these fields. */
export type MediaElementLike = Pick<HTMLMediaElement,
  'addEventListener' | 'removeEventListener' | 'play' | 'pause' | 'load' |
  'paused' | 'ended' | 'seeking' | 'currentTime' | 'duration' | 'readyState' |
  'src' | 'error' | 'volume' | 'preload'> &
  Partial<Pick<HTMLMediaElement, 'crossOrigin' | 'playbackRate' | 'defaultPlaybackRate' | 'preservesPitch'>>;

export interface AudioEngineHooks {
  /** Called when the media reports a real duration (seconds). */
  onDuration?(durationSec: number): void;
  /** Where to resume when a source fails and the engine switches to its fallback URL. */
  resumePosition?(): number;
  /** Whether playback should continue after switching to the fallback URL. */
  wantsPlayback?(): boolean;
  /**
   * Builds the Web Audio graph on the first play (browsers only start audio inside a click).
   * Omitted in tests and old browsers: the element then plays directly.
   */
  createGraph?(): AudioGraphLike | null;
}

/**
 * CROSSFADE FIX - two decks (two <audio> elements). One plays; a crossfade starts the next
 * passage on the other and the two overlap, then the other becomes the playing deck. Every
 * event, time and control below follows the playing deck (`el`); the fading deck is ignored.
 * Tests pass one element: one deck, and crossfade() reports false.
 */
export class NativeAudioEngine {
  private readonly decks: MediaElementLike[];
  private gains: (DeckGainLike | null)[] = [];
  private active = 0;
  private crossfading: { from: number; timer: ReturnType<typeof setTimeout> } | null = null;
  /** The playing deck. */
  get el(): MediaElementLike { return this.decks[this.active]; }
  private get gain(): DeckGainLike | null { return this.gains[this.active] ?? null; }
  private readonly listeners: Record<EngineEvent, Listener[]> = {
    timeupdate: [], play: [], pause: [], finish: [], playing: [], waiting: [], swap: [],
  };
  private pendingTime: number | null = null;
  private currentFallbackUrl: string | null = null;
  private usedFallback = false;
  private graph: AudioGraphLike | null = null;
  private graphTried = false;
  private volume = 1;
  private normDb = 0;
  private rate = 1;

  private readonly hooks: AudioEngineHooks;

  /** `element`: tests pass one fake (one deck) or two (two decks, crossfade testable). */
  constructor(hooks: AudioEngineHooks = {}, element?: MediaElementLike | MediaElementLike[]) {
    this.hooks = hooks;
    const make = () => { const a = document.createElement('audio'); document.body.appendChild(a); return a; };
    this.decks = Array.isArray(element) ? element.slice(0, 2) : element ? [element] : [make(), make()];
    this.decks.forEach(d => this.wire(d));
  }

  /** True for this engine's own elements (the stray-media rule must not pause them). */
  owns(m: unknown): boolean { return this.decks.includes(m as MediaElementLike); }
  /** Both decks (teardown). */
  allDecks(): readonly MediaElementLike[] { return this.decks; }

  private wire(el: MediaElementLike): void {
    const live = () => el === this.el;
    el.preload = 'auto';
    // WEB AUDIO FIX - the graph reads the samples, which browsers allow for other origins only
    // with CORS. Without this, a service URL would play as silence through the graph.
    // The local service sends CORS headers; a link without them fails and the fallback plays.
    if ('crossOrigin' in el) el.crossOrigin = 'anonymous';
    el.addEventListener('loadedmetadata', () => {
      if (!live()) return;
      if (el.duration && Number.isFinite(el.duration) && el.duration > 0) this.hooks.onDuration?.(el.duration);
      if (this.pendingTime !== null) {
        try { el.currentTime = this.pendingTime; } catch { /* not seekable yet */ }
        this.pendingTime = null;
      }
    });
    el.addEventListener('error', () => {
      if (!live()) return;
      if (el.error && el.error.code === 1) return; // MEDIA_ERR_ABORTED during track switch
      console.warn('Audio playback notice on source:', el.src, el.error);
      if (!this.usedFallback && this.currentFallbackUrl && el.src !== this.currentFallbackUrl) {
        this.usedFallback = true;
        const resumeTime = this.pendingTime !== null ? this.pendingTime : (this.hooks.resumePosition?.() || 0);
        el.src = this.currentFallbackUrl;
        el.load();
        this.pendingTime = resumeTime;
        if (this.hooks.wantsPlayback?.()) el.play().catch(() => { });
      }
    });
    el.addEventListener('timeupdate', () => { if (live()) this.fire('timeupdate', el.currentTime || 0); });
    el.addEventListener('play', () => { if (live()) this.fire('play'); });
    // SYNC FIX 1 - "requested" vs "audible".
    // 'play' fires the moment play() is called, even while the file is still buffering and
    // nothing can be heard. 'playing' fires when sound actually starts; 'waiting' fires when
    // playback stalls to buffer more data.
    // Example: on a track served over HTTP, you press play at 0:00 wall-clock, the browser
    // buffers, and sound starts about a second later. Before this fix that silent second
    // was logged as listening time and the playhead sat still while the UI said "playing".
    el.addEventListener('playing', () => { if (live()) this.fire('playing'); });
    el.addEventListener('waiting', () => { if (live()) this.fire('waiting'); });
    el.addEventListener('pause', () => { if (live()) this.fire('pause'); });
    el.addEventListener('ended', () => { if (live()) this.fire('finish'); });
    // SEEK CLICK FIX (core/audioGraph.ts): fade around every seek while sound is playing.
    el.addEventListener('seeking', () => { if (live() && !el.paused && !this.crossfading) this.gain?.duck(); });
    el.addEventListener('seeked', () => { if (live() && !this.crossfading) this.gain?.unduck(); });
  }

  private fire(ev: EngineEvent, value?: number): void {
    for (const fn of this.listeners[ev]) fn(value);
  }

  // SYNC FIX 2 - load() resolves only when the file's metadata (duration, seekable range) is
  // known, or the source fails, or 8 s pass.
  // Before, it returned immediately, so:
  //   - getDuration() right after load() was 0, and the stored duration was never fixed
  //     (tracks kept placeholder lengths such as 180 s or 32 s);
  //   - a start offset was applied only after playback had begun.
  // Example: opening a saved moment at 1:20 could start at 0:00 and jump to 1:20.
  // Now the position is set first, then play() starts at 1:20. The browser needs the
  // metadata before it can play anyway, so waiting for it adds no delay.
  load(url: string, startSec = 0, fallbackUrl: string | null = null): Promise<void> {
    const el = this.el;
    this.pendingTime = startSec || 0;
    this.currentFallbackUrl = fallbackUrl;
    this.usedFallback = false;
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        el.removeEventListener('loadedmetadata', done);
        el.removeEventListener('error', done);
        resolve();
      };
      const timer = setTimeout(done, 8000);
      // Registered after the engine's own 'loadedmetadata' handler, so the start offset
      // (pendingTime) is already applied when this resolves.
      el.addEventListener('loadedmetadata', done);
      el.addEventListener('error', done);
      el.src = url;
      el.load();
    });
  }

  async play(): Promise<void> {
    const el = this.el;
    // Inside the click that started playback: build the graph once and start its clock.
    // Not awaited, so el.play() below still runs inside the click (Safari is strict here).
    this.ensureGraph();
    this.graph?.resume();
    if (!this.crossfading) this.gain?.unduck(); // never stay faded out if a seek did not finish
    try {
      return await el.play();
    } catch (err) {
      if ((err as Error | undefined)?.name === 'AbortError') return;
      if (!this.usedFallback && this.currentFallbackUrl && el.src !== this.currentFallbackUrl) {
        this.usedFallback = true;
        el.src = this.currentFallbackUrl;
        el.load();
        return await el.play();
      }
      throw err;
    }
  }

  /** Pauses; during a crossfade both decks stop and the new one stays the playing deck. */
  pause(): void {
    if (this.crossfading) this.finishCrossfade();
    this.el.pause();
  }
  hasSource(): boolean { return Boolean(this.el.src) && (!this.el.error || this.el.error.code === 1); }
  isPlaying(): boolean { return !this.el.paused && !this.el.ended; }
  /** True while the browser is still moving to a new position after setTime(). */
  isSeeking(): boolean { return this.el.seeking; }
  /** True when a position was requested before metadata arrived and is not applied yet. */
  hasPendingSeek(): boolean { return this.pendingTime !== null; }
  getCurrentTime(): number { return this.el.currentTime || 0; }

  setTime(sec: number): void {
    const target = Math.max(0, Number(sec) || 0);
    if (this.el.readyState >= 1) {
      try { this.el.currentTime = target; this.pendingTime = null; } catch { this.pendingTime = target; }
    } else {
      this.pendingTime = target;
    }
  }

  getDuration(): number {
    const d = this.el.duration;
    return (d && Number.isFinite(d)) ? d : 0;
  }

  private ensureGraph(): void {
    if (this.graphTried || !this.hooks.createGraph) return;
    this.graphTried = true;
    try { this.graph = this.hooks.createGraph(); } catch (err) { console.warn('Web Audio notice:', err); this.graph = null; }
    try { this.gains = this.graph ? this.decks.map(d => this.graph!.addDeck(d as HTMLMediaElement)) : []; }
    catch (err) { console.warn('Web Audio notice:', err); this.gains = []; }
    this.applyLevel(0);
  }

  /**
   * With the graph: volume and loudness are two gain stages, the element stays at 1.
   * Without it: both fold into el.volume, so loudness can only turn songs down (volume ≤ 1).
   */
  private applyLevel(rampSec: number): void {
    if (this.graph) {
      for (const d of this.decks) d.volume = 1;
      this.graph.setVolume(this.volume);
      this.gain?.setNormalization(this.normDb, rampSec);
    } else {
      this.el.volume = Math.max(0, Math.min(1, this.volume * Math.min(1, dbToGain(this.normDb))));
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (this.graph) this.graph.setVolume(this.volume); else this.applyLevel(0);
  }

  /**
   * Loudness gain for the loaded song (dB, 0 = as mastered), eased over `rampSec`.
   * Example: setNormalization(-8, 0) before play → a loud master starts 8 dB down, no jump.
   */
  setNormalization(db: number, rampSec = 0): void {
    this.normDb = Number.isFinite(db) ? db : 0;
    this.applyLevel(rampSec);
  }

  /**
   * Playback speed with the pitch kept (practice a passage slower in the same key).
   * Set on defaultPlaybackRate too: loading a new source resets playbackRate to it, so the
   * speed survives a stem switch.
   * Example: setRate(0.75) on a 12 s loop → each cycle takes 16 s, notes stay in key.
   */
  setRate(r: number): void {
    const rate = Math.max(0.25, Math.min(2, Number(r) || 1));
    this.rate = rate;
    for (const d of this.decks) {
      d.preservesPitch = true;
      d.defaultPlaybackRate = rate;
      d.playbackRate = rate;
    }
  }
  getRate(): number { return this.rate; }

  /** Fades the playing deck to `target` (0..1) over `sec`; no-op without the graph. */
  fade(target: number, sec: number): void { this.gain?.fade(target, sec); }

  /** True when crossfade() can run: two decks routed through the graph. */
  canCrossfade(): boolean { return this.decks.length > 1 && this.gains.length === this.decks.length; }

  /**
   * Starts `url` at `startSec` on the idle deck and fades it in over `sec` while the playing
   * deck fades out (equal-power, so the overlap does not get louder). The idle deck becomes the
   * playing one as soon as it starts; 'swap' tells the UI. Resolves false (nothing changed)
   * when it cannot crossfade or the new source fails to load: the caller then loads normally.
   * `normDb` is the new song's loudness gain.
   * Example: suggestion 1 ends at 1:42 → at 1:40.5 suggestion 2 starts under it; by 1:42 only
   * suggestion 2 is heard.
   */
  async crossfade(url: string, startSec: number, fallbackUrl: string | null, sec: number, normDb: number): Promise<boolean> {
    if (!this.canCrossfade() || !this.isPlaying()) return false;
    if (this.crossfading) this.finishCrossfade();
    const from = this.active, to = 1 - from, nb = this.decks[to], ng = this.gains[to]!;
    ng.fade(0, 0);
    const ready = await new Promise<boolean>(resolve => {
      const done = (ok: boolean) => {
        clearTimeout(timer);
        nb.removeEventListener('loadedmetadata', onMeta); nb.removeEventListener('error', onErr);
        resolve(ok);
      };
      const onMeta = () => {
        try { nb.currentTime = startSec; } catch { /* not seekable */ }
        done(true);
      };
      const onErr = () => done(false);
      const timer = setTimeout(() => done(false), 4000);
      nb.addEventListener('loadedmetadata', onMeta);
      nb.addEventListener('error', onErr);
      nb.src = url;
      nb.load();
    });
    if (!ready || this.active !== from || !this.isPlaying()) { nb.pause(); return false; }
    ng.setNormalization(normDb, 0);
    try { await nb.play(); } catch { nb.pause(); return false; }
    // The new deck plays: from here every event and control follows it.
    this.active = to;
    this.normDb = Number.isFinite(normDb) ? normDb : 0;
    this.currentFallbackUrl = fallbackUrl; this.usedFallback = false; this.pendingTime = null;
    const d = this.getDuration();
    if (d > 0) this.hooks.onDuration?.(d);
    ng.fade(1, sec);
    this.gains[from]?.fade(0, sec);
    this.crossfading = { from, timer: setTimeout(() => this.finishCrossfade(), sec * 1000 + 60) };
    this.fire('swap');
    // The new deck was paused when it became the playing one; tell the UI it plays.
    this.fire('play'); this.fire('playing');
    return true;
  }

  /** Ends a crossfade at once: the old deck stops, the new deck is at full level. */
  private finishCrossfade(): void {
    const x = this.crossfading;
    if (!x) return;
    clearTimeout(x.timer);
    this.crossfading = null;
    this.decks[x.from].pause();
    this.gain?.fade(1, 0.02);
  }

  /** Releases the audio device (hot-reload teardown). */
  closeGraph(): void { this.graph?.close(); this.graph = null; }

  on(ev: EngineEvent, fn: Listener): void { this.listeners[ev]?.push(fn); }

  off(ev: EngineEvent, fn: Listener): void {
    const list = this.listeners[ev];
    const i = list ? list.indexOf(fn) : -1;
    if (i >= 0) list.splice(i, 1);
  }
}

/** Same call shape as the old inline factory in index.html. */
export function createNativeAudioEngine(hooks: AudioEngineHooks = {}, element?: MediaElementLike): NativeAudioEngine {
  return new NativeAudioEngine(hooks, element);
}
