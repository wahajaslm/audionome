import { watch } from 'vue';
import { usePlaybackStore } from '../stores/playback';

/**
 * Media Session API (https://developer.mozilla.org/docs/Web/API/Media_Session_API): the
 * browser's standard hook for keyboard media keys, headphone buttons and lock-screen / OS
 * controls, the same one Spotify's and YouTube's web players use.
 * Example: press the ⏯ key on the keyboard while another app has focus -> the song pauses;
 * the macOS Now Playing widget shows the song title and a working scrubber.
 * Call once from App.vue after useAudioEngine().
 */
export function useMediaSession(): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const playback = usePlaybackStore();

  const set = (action: MediaSessionAction, fn: MediaSessionActionHandler) => {
    try { ms.setActionHandler(action, fn); } catch { /* action not supported by this browser */ }
  };
  set('play', () => { if (!playback.playing) playback.togglePlay(); });
  set('pause', () => { if (playback.playing) playback.togglePlay(); });
  set('seekbackward', d => playback.seekBy(-(d.seekOffset ?? 15)));
  set('seekforward', d => playback.seekBy(d.seekOffset ?? 15));
  // Headphone / keyboard ⏭ skips on Moment radio (no next song otherwise).
  set('nexttrack', () => { if (playback.radio) playback.radioSkip(); else playback.seekBy(15); });
  set('seekto', d => { if (d.seekTime !== undefined) playback.endScrub(d.seekTime); });

  watch(() => playback.currentTrack, t => {
    ms.metadata = t ? new MediaMetadata({ title: t.title, artist: t.artist ?? '', album: 'Music DNA' }) : null;
  }, { immediate: true });
  watch(() => playback.playing, p => { ms.playbackState = p ? 'playing' : 'paused'; }, { immediate: true });
  // The OS scrubber: updated on every second boundary, not every frame.
  watch(() => [Math.floor(playback.t), playback.duration, playback.rate] as const, ([pos, dur, rate]) => {
    if (!(dur > 0)) return;
    try { ms.setPositionState({ duration: dur, position: Math.min(pos, dur), playbackRate: rate }); } catch { /* invalid state */ }
  });
}
