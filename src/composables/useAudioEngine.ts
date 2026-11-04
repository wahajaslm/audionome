import { markRaw } from 'vue';
import { NativeAudioEngine } from '../core/audioEngine';
import { usePlaybackStore } from '../stores/playback';
import { useListeningStore } from '../stores/listening';
import { useMediaClock } from './useMediaClock';
import { onStudioPlay, pauseStudio } from '../core/studioLink';

let instance: NativeAudioEngine | null = null;

// ONE PLAYER FIX 2 - other app tabs. Each tab has its own engine, so two tabs could play at
// once. Every tab announces when it starts playing; the others pause.
// Example: tab A plays song 1, you press play in tab B -> tab A pauses.
const TAB_CHANNEL = 'music-dna-player';
const tabId = Math.random().toString(36).slice(2);

const TEARDOWN_KEY = '__musicDnaEngineTeardown';
const globalWithEngine = globalThis as typeof globalThis & { [TEARDOWN_KEY]?: () => void };

/**
 * The app's single audio engine. The first call creates it, attaches it to the playback store
 * and wires the media events; later calls return the same instance.
 * Call it once from App.vue's setup (Pinia must be installed).
 */
export function useAudioEngine(): NativeAudioEngine {
  if (instance) return instance;
  // ONE PLAYER FIX 4 - hot reload (dev). When Vite reloads this module (or anything it
  // imports: audioEngine.ts, playback.ts ...), `instance` starts as null again and a second
  // engine with its own <audio> was created. The old <audio> stayed in the page and kept
  // playing, and its timeupdate handler still ran checkRegionEnd, which seeked the NEW engine.
  // That is the "players fighting the loop" bug. The teardown lives on globalThis because
  // module state is reset by the reload, and Vite only runs dispose() on App.vue, not here.
  // Example: edit playback.ts while a loop plays -> before: two songs audible, the loop jumps;
  // now: the old element is paused and removed before the new engine exists.
  globalWithEngine[TEARDOWN_KEY]?.();
  delete globalWithEngine[TEARDOWN_KEY];
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
  const tabs = typeof BroadcastChannel === 'function' ? new BroadcastChannel(TAB_CHANNEL) : null;
  if (tabs) {
    tabs.onmessage = e => {
      if (e.data?.type === 'playing' && e.data.tab !== tabId && engine.isPlaying()) engine.pause();
    };
  }

  engine.on('play', () => {
    playback.playing = true; // button state only; listening time starts on 'playing' (SYNC FIX 1)
    clock.start();
    pauseStudio(); // ONE PLAYER FIX: the studio tab stops when the app plays
    tabs?.postMessage({ type: 'playing', tab: tabId }); // ONE PLAYER FIX 2: other app tabs stop
    // ONE PLAYER FIX 3 - stray media in this page. Any other <audio>/<video> still playing
    // here (left over from an old engine, a preview, a probe) is paused.
    // Example: an orphaned <audio> from before a hot reload is still on 0:40 -> it stops.
    document.querySelectorAll('audio, video').forEach(m => {
      if (m !== (engine.el as unknown) && !(m as HTMLMediaElement).paused) (m as HTMLMediaElement).pause();
    });
  });
  const stopStudioListen = onStudioPlay(() => { if (engine.isPlaying()) engine.pause(); });

  globalWithEngine[TEARDOWN_KEY] = () => {
    clock.stop();
    engine.pause();
    const el = engine.el as HTMLMediaElement;
    el.removeAttribute('src');
    el.load();
    el.remove();
    tabs?.close();
    stopStudioListen();
  };
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
