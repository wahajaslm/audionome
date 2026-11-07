import { computed } from 'vue';
import { usePlaybackStore } from '../stores/playback';
import { useMomentsStore } from '../stores/moments';
import { useLibraryStore } from '../stores/library';
import { useIntelligenceStore } from '../stores/intelligence';
import { useListeningStore } from '../stores/listening';

/**
 * Binds the design-system Waveform (wavesurfer.js) to the stores: the app's <audio> element,
 * the playhead, the selection, saved moments, and what each gesture does.
 * Usage: const wf = useWaveform(); <Waveform v-bind="wf.props.value" @seek="wf.seek" … />
 */
export function useWaveform() {
  const playback = usePlaybackStore();
  const moments = useMomentsStore();

  const props = computed(() => ({
    // `deck` is read so this recomputes when a crossfade swaps the playing element.
    media: (playback.deck, (playback.engine()?.el as HTMLMediaElement | undefined) ?? null),
    duration: playback.duration,
    currentTime: playback.t,
    selection: playback.sel,
    saved: moments.savedForCurrent,
    // Passages you return to (2+ returns), not saved yet; hidden while Learning is off.
    hints: useListeningStore().learning ? useIntelligenceStore().interest
      .filter(r => r.n >= 2 && !moments.savedForCurrent.some(s => Math.max(s.a, r.a) < Math.min(s.b, r.b)))
      .map(r => ({ a: r.a, b: r.b })) : [],
    // Stored peaks are the full mix; a stem has its own waveform.
    storedPeaks: playback.activeStem === 'all' ? playback.currentTrack?.peaks ?? null : null,
  }));
  const library = useLibraryStore();

  return {
    props,
    /** Click: seek, or select the saved moment / keep the selection under the pointer. */
    seek: (sec: number) => playback.clickSeek(sec),
    selectStart: () => playback.beginSelection(),
    select: (a: number, b: number) => playback.updateSelection(a, b),
    /** Release: widen to the minimum length (no seek, no play). */
    selectEnd: () => playback.commitSelection(),
    /** Edge drag: the loop keeps running on the new range. */
    resize: (a: number, b: number) => playback.resizeSelection(a, b),
    resizeEnd: () => playback.endResize(),
    step: (delta: number) => playback.stepBy(delta),
    selectAround: () => playback.selectAroundPlayhead(),
    /** Decoded peaks of the full mix are stored with the song (STARTUP FIX). */
    peaks: (p: { peaks: number[][]; duration: number }) => {
      if (playback.activeStem === 'all' && playback.trackId) library.setPeaks(playback.trackId, p);
    },
  };
}
