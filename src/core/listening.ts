/**
 * Listening event log: what the listener did, stamped with the media clock.
 *
 * Every event lands in the Dexie `events` table with the same shape the classic player
 * (index.html) writes, so both front-ends share one history. The attention model in
 * src/intelligence/personalize.ts reads these rows.
 */
import type { EventKind, ListeningEvent } from '../data/types';

/** Where events are written. In the app this is `db.events`; tests pass an array-backed fake. */
export interface EventSink {
  add(event: ListeningEvent): Promise<unknown>;
}

/** The parts of the audio engine needed to read the media clock. */
export interface MediaClockSource {
  hasSource(): boolean;
  hasPendingSeek(): boolean;
  getCurrentTime(): number;
}

// SYNC FIX 7 - events are stamped with the audio element's own clock.
// The UI copy of the time (the store's `t`) is written once per animation frame, and click
// handlers write the *requested* position before the browser has moved there. Reading the
// element directly gives the position you actually heard.
// Example: pausing at 42.731 s used to log positionSec 42.715 (the last drawn frame).
// Falls back to the UI copy only while a seek is still waiting for metadata.
export function readMediaTime(engine: MediaClockSource | null | undefined, fallbackSec: number): number {
  return (engine && engine.hasSource() && !engine.hasPendingSeek()) ? engine.getCurrentTime() : fallbackSec;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** Optional: browsers provide it; Node tests and Safari may not. */
  requestIdleCallback?(fn: () => void, opts: { timeout: number }): unknown;
}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  requestIdleCallback: typeof globalThis.requestIdleCallback === 'function'
    ? (fn, opts) => globalThis.requestIdleCallback(fn, opts)
    : undefined,
};

export interface ListeningLogOptions {
  sink: EventSink;
  /** Current track and whether "Learning" is on. Nothing is logged when learning is off. */
  context(): { trackId: string | null; learning: boolean };
  /** The media clock (use readMediaTime). */
  mediaTime(): number;
  /** Heavy refresh (reload events, re-rank). Run batched, see DELAY FIX 3. */
  refresh(): Promise<void> | void;
  sessionId?: string;
  uid?(): string;
  now?(): number;
  timers?: Timers;
  /** Quiet period before the batched refresh runs. index.html uses 1000 ms. */
  refreshDelayMs?: number;
}

// trackId may be overridden: dismissing a candidate logs it against the candidate's track.
export type ExtraFields = Partial<Omit<ListeningEvent, 'id' | 'sessionId' | 'kind' | 'origin' | 'at'>>;

export class ListeningLog {
  readonly sessionId: string;
  /** Media time (seconds) where the current audible stretch began, or null when silent. */
  spanStart: number | null = null;
  private refreshTimer: unknown = null;
  private readonly timers: Timers;

  private readonly opts: ListeningLogOptions;

  constructor(opts: ListeningLogOptions) {
    this.opts = opts;
    this.sessionId = opts.sessionId ?? crypto.randomUUID();
    this.timers = opts.timers ?? defaultTimers;
  }

  // DELAY FIX 3 - every saved event used to reload all events and re-rank the whole library
  // straight away, on the main thread. Pressing play saves a 'play' event, so that heavy work
  // ran in the very frames where the playhead should start moving: sound started, but the
  // screen looked frozen for a moment.
  // Now refreshes are batched: one runs 1 s after the last event, when the browser is idle.
  // Example: play, seek, seek, loop within a second -> one refresh instead of four.
  scheduleRefresh(): void {
    this.timers.clearTimeout(this.refreshTimer);
    this.refreshTimer = this.timers.setTimeout(() => {
      const run = () => { Promise.resolve(this.opts.refresh()).catch(console.warn); };
      if (this.timers.requestIdleCallback) this.timers.requestIdleCallback(run, { timeout: 2000 }); else run();
    }, this.opts.refreshDelayMs ?? 1000);
  }

  /** Writes one event. Returns the stored row, or null when learning is off or no track is loaded. */
  emit(kind: EventKind, origin: ListeningEvent['origin'] = 'user', extra: ExtraFields = {}): ListeningEvent | null {
    const ctx = this.opts.context();
    if (!ctx.learning || !ctx.trackId) return null;
    const event: ListeningEvent = {
      id: this.opts.uid ? this.opts.uid() : crypto.randomUUID(),
      trackId: ctx.trackId,
      sessionId: this.sessionId,
      kind,
      origin,
      at: this.opts.now ? this.opts.now() : Date.now(),
      positionSec: this.opts.mediaTime(),
      ...extra,
    };
    this.opts.sink.add(event).then(() => this.scheduleRefresh()).catch(console.warn);
    return event;
  }

  // SYNC FIX 1 (listening spans) - a span opens on the media 'playing' event (sound is audible)
  // and closes on 'waiting' (buffering), 'pause', 'ended', a loop cycle or a track change.
  // Example: press play at 0:00, the file buffers for 1 s, sound starts at 0:00 media time:
  // the span opens then, not when the button was pressed, so the silent second is not logged.
  openSpan(atSec: number = this.opts.mediaTime()): void {
    this.spanStart = atSec;
  }

  /** Closes the open span and logs it as a 'listen_span' if it lasted at least 1 s. */
  flushSpan(endedBy = 'user_action'): ListeningEvent | null {
    let logged: ListeningEvent | null = null;
    const ctx = this.opts.context();
    if (this.spanStart !== null && ctx.trackId && ctx.learning) {
      const now = this.opts.mediaTime();
      const fromSec = Math.min(this.spanStart, now), toSec = Math.max(this.spanStart, now);
      const durationSec = Math.round((toSec - fromSec) * 100) / 100;
      if (durationSec >= 1.0) logged = this.emit('listen_span', 'player', { fromSec, toSec, durationSec, endedBy });
      this.spanStart = null;
    }
    return logged;
  }

  dispose(): void {
    this.timers.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }
}
