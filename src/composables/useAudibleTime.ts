import { computed } from 'vue';
import { usePlaybackStore } from '../stores/playback';

/**
 * DELAY FIX - the time you are hearing, for the analysis lanes (Explore and Nerds).
 * The audio clock (playback.t) says which sample the decoder hands over; it reaches your ears
 * later by the device's latency (Web Audio baseLatency + outputLatency). The lanes now mark the
 * audible moment: t − latency × speed while playing; paused, nothing is in flight, so t.
 * Example: 21 ms + 48 ms on built-in speakers → the playhead sits 69 ms behind the decoder,
 * so a drum hit lines up with its spectrum column when you hear it. Bluetooth: often 150–250 ms.
 */
export function useAudibleTime() {
  const playback = usePlaybackStore();
  /** Seconds of audio between the decoder and your ears (0 before Web Audio starts). */
  const latency = computed(() => {
    void playback.t; // re-read as the clock moves (the device can change mid-song)
    const d = playback.engine()?.stats().device;
    return d ? d.baseLatency + d.outputLatency : 0;
  });
  const audibleT = computed(() => (playback.playing ? Math.max(0, playback.t - latency.value * playback.engine()!.stats().rate) : playback.t));
  return { latency, audibleT };
}
