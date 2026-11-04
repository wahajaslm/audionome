/**
 * Native HTML5 audio engine shared by every Music DNA front-end.
 *
 * One hidden <audio> element plays the song. Nothing here knows about the UI: the engine
 * reports what the media element does (time, play, playing, waiting, pause, finish) and the
 * UI decides what to draw. It is the same engine index.html used inline before, with the
 * same fixes, moved here so the Vue player and the classic page cannot drift apart.
 */

export type EngineEvent = 'timeupdate' | 'play' | 'pause' | 'finish' | 'playing' | 'waiting';
type Listener = (value?: number) => void;

/** The parts of HTMLAudioElement the engine uses. Tests pass a small fake with these fields. */
export type MediaElementLike = Pick<HTMLMediaElement,
  'addEventListener' | 'removeEventListener' | 'play' | 'pause' | 'load' |
  'paused' | 'ended' | 'seeking' | 'currentTime' | 'duration' | 'readyState' |
  'src' | 'error' | 'volume' | 'preload'>;

export interface AudioEngineHooks {
  /** Called when the media reports a real duration (seconds). */
  onDuration?(durationSec: number): void;
  /** Where to resume when a source fails and the engine switches to its fallback URL. */
  resumePosition?(): number;
  /** Whether playback should continue after switching to the fallback URL. */
  wantsPlayback?(): boolean;
}

export class NativeAudioEngine {
  readonly el: MediaElementLike;
  private readonly listeners: Record<EngineEvent, Listener[]> = {
    timeupdate: [], play: [], pause: [], finish: [], playing: [], waiting: [],
  };
  private pendingTime: number | null = null;
  private currentFallbackUrl: string | null = null;
  private usedFallback = false;

  private readonly hooks: AudioEngineHooks;

  constructor(hooks: AudioEngineHooks = {}, element?: MediaElementLike) {
    this.hooks = hooks;
    if (element) {
      this.el = element;
    } else {
      const audio = document.createElement('audio');
      document.body.appendChild(audio);
      this.el = audio;
    }
    const el = this.el;
    el.preload = 'auto';
    el.addEventListener('loadedmetadata', () => {
      if (el.duration && Number.isFinite(el.duration) && el.duration > 0) this.hooks.onDuration?.(el.duration);
      if (this.pendingTime !== null) {
        try { el.currentTime = this.pendingTime; } catch { /* not seekable yet */ }
        this.pendingTime = null;
      }
    });
    el.addEventListener('error', () => {
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
    el.addEventListener('timeupdate', () => this.fire('timeupdate', el.currentTime || 0));
    el.addEventListener('play', () => this.fire('play'));
    // SYNC FIX 1 - "requested" vs "audible".
    // 'play' fires the moment play() is called, even while the file is still buffering and
    // nothing can be heard. 'playing' fires when sound actually starts; 'waiting' fires when
    // playback stalls to buffer more data.
    // Example: on a track served over HTTP, you press play at 0:00 wall-clock, the browser
    // buffers, and sound starts about a second later. Before this fix that silent second
    // was logged as listening time and the playhead sat still while the UI said "playing".
    el.addEventListener('playing', () => this.fire('playing'));
    el.addEventListener('waiting', () => this.fire('waiting'));
    el.addEventListener('pause', () => this.fire('pause'));
    el.addEventListener('ended', () => this.fire('finish'));
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

  pause(): void { this.el.pause(); }
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

  setVolume(v: number): void { this.el.volume = Math.max(0, Math.min(1, Number(v) || 0)); }

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
