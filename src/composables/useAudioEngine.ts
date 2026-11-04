import { markRaw } from 'vue';
import { NativeAudioEngine } from '../core/audioEngine';
import { usePlaybackStore } from '../stores/playback';
import { useListeningStore } from '../stores/listening';
import { useMediaClock } from './useMediaClock';

let instance: NativeAudioEngine | null = null;

/**
 * The app's single audio engine. The first call creates it, attaches it to the playback store
 * and wires the media events; later calls return the same instance.
 * Call it once from App.vue's setup (Pinia must be installed).
 */
export function useAudioEngine(): NativeAudioEngine {
  if (instance) return instance;
  const playback = usePlaybackStore();
  const listening = useListeningStore();

  const engine = markRaw(new NativeAudioEngine({
    onDuration: d => playback.onDuration(d),
    resumePosition: () => playback.t,
    wantsPlayback: () => playback.playing,
  }));
  instance = engine;
  playback.attachEngine(engine);

  const clock = useMediaClock(engine, t => playback.onFrame(t));

  engine.on('timeupdate', t => {
    // Backup for background tabs, where animation frames pause (SYNC FIX 5).
    playback.checkRegionEnd(t ?? 0);
    if (!playback.loading && playback.playing && t !== undefined) playback.t = t;
  });
  engine.on('play', () => {
    playback.playing = true; // button state only; listening time starts on 'playing' (SYNC FIX 1)
    clock.start();
  });
  engine.on('playing', () => {
    // SYNC FIX 1: sound is audible from here, so the listening span starts here.
    listening.openSpan();
    clock.start();
  });
  engine.on('waiting', () => {
    // SYNC FIX 1: playback stalled to buffer. Close the span so silent buffering time is not
    // logged as heard; 'playing' opens a new one when sound resumes.
    listening.flushSpan('buffering');
  });
  engine.on('pause', () => {
    clock.stop();
    listening.flushSpan('pause');
    playback.playing = false;
  });
  engine.on('finish', () => {
    clock.stop();
    listening.flushSpan('ended');
    playback.playing = false;
    if (playback.queue.length) playback.playNext().catch(console.error);
  });
  return engine;
}
