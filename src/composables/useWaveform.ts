import { computed } from 'vue';
import { usePlaybackStore } from '../stores/playback';
import { useMomentsStore } from '../stores/moments';

/**
 * Binds the design-system Waveform to the stores: what to draw (peaks on the media timeline,
 * media-clock playhead, selection, saved moments) and what each gesture does.
 * Usage: const wf = useWaveform(); <Waveform v-bind="wf.props.value" @seek="wf.seek" … />
 */
export function useWaveform() {
  const playback = usePlaybackStore();
  const moments = useMomentsStore();

  const props = computed(() => ({
    peaks: playback.peaks,
    duration: playback.duration,
    currentTime: playback.t,
    selection: playback.sel,
    saved: moments.savedForCurrent,
  }));

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
    /** A saved-moment dot: select that moment (same as clicking inside it). */
    savedClick: (id: string) => {
      const r = moments.savedForCurrent.find(x => x.id === id);
      if (r) playback.clickSeek((r.a + r.b) / 2);
    },
  };
}
