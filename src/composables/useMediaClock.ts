import type { NativeAudioEngine } from '../core/audioEngine';

/**
 * The playhead clock: while audio plays, read the <audio> element's time once per animation
 * frame and hand it to `onFrame` (the playback store copies it into the UI and checks loop /
 * preview ends — SYNC FIX 5 in core/playback.ts).
 *
 * The playhead is driven by the media clock, not by a timer: if the audio stalls, the
 * playhead stops with it.
 * Example: at 60 fps the waveform playhead moves every ~16 ms, while 'timeupdate' would move
 * it only every ~250 ms.
 */
export function useMediaClock(engine: NativeAudioEngine, onFrame: (t: number) => void) {
  let raf: number | null = null;

  function tick(): void {
    if (!engine.isPlaying()) { raf = null; return; }
    onFrame(engine.getCurrentTime());
    raf = requestAnimationFrame(tick);
  }

  /** Starts the loop if it is not running ('play' and 'playing' both call this). */
  function start(): void {
    if (raf === null) raf = requestAnimationFrame(tick);
  }

  function stop(): void {
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
  }

  return { start, stop };
}
