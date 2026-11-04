<script setup lang="ts">
/**
 * PlaybackBar (design system): time left · five symmetric controls centred · volume right.
 * Props: currentTime, duration (seconds); playing; loop (pressed state); volume (0–1).
 * Emits: save-last (♡ save the last 20 s), prev, toggle-play, next, loop, volume(v 0–1).
 * Grid 1fr auto 1fr keeps play in the exact centre. Below 600px the volume is hidden.
 */
import Icon from './Icon.vue';
import { formatTime } from './format';

defineProps<{ currentTime: number; duration: number; playing: boolean; loop: boolean; volume: number }>();
const emit = defineEmits<{ 'save-last': []; prev: []; 'toggle-play': []; next: []; loop: []; volume: [v: number] }>();
</script>

<template>
  <div class="bar" aria-label="Playback">
    <div class="t"><b>{{ formatTime(currentTime) }}</b> / {{ formatTime(duration) }}</div>
    <div class="tp">
      <button type="button" class="ib s" aria-label="Save the last 20 seconds as a moment" title="Save this moment" @click="emit('save-last')"><Icon name="heart" :size="20" /></button>
      <button type="button" class="ib" aria-label="Back 15 seconds" title="Back 15 s" @click="emit('prev')"><Icon name="prev" :size="20" /></button>
      <button type="button" class="play" :aria-label="playing ? 'Pause' : 'Play'" @click="emit('toggle-play')"><Icon :name="playing ? 'pause' : 'play'" :size="20" /></button>
      <button type="button" class="ib" aria-label="Forward 15 seconds" title="Forward 15 s" @click="emit('next')"><Icon name="next" :size="20" /></button>
      <button type="button" class="ib s" :aria-pressed="loop" aria-label="Loop selection" title="Loop selection" @click="emit('loop')"><Icon name="loop" :size="20" /></button>
    </div>
    <div class="r">
      <Icon name="volume" :size="18" />
      <input
        class="vol"
        type="range"
        min="0"
        max="100"
        aria-label="Volume"
        :value="Math.round(volume * 100)"
        @input="emit('volume', Number(($event.target as HTMLInputElement).value) / 100)"
      />
    </div>
  </div>
</template>

<style scoped>
.bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-3);
  padding: 20px var(--space-5);
  background: var(--bg);
  font-variant-numeric: tabular-nums;
}
.t { font-size: 13px; color: var(--ink-mute); white-space: nowrap; }
.t b { font-weight: 400; color: var(--ink); }
.tp { display: flex; align-items: center; gap: 14px; }
.ib, .play {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: none;
  color: var(--ink);
  cursor: pointer;
}
.ib { width: var(--hit-target); height: var(--hit-target); border: 0; }
.ib.s { color: var(--ink-sub); }
.ib:hover { background: var(--bg-raise); }
.ib[aria-pressed='true'] { color: var(--accent); }
.play { width: 52px; height: 52px; border: 1px solid rgba(220, 220, 224, 0.5); /* ink at half strength */ }
.r { display: flex; justify-content: flex-end; align-items: center; gap: 10px; color: var(--ink-sub); }
.vol { width: 110px; accent-color: var(--ink-sub); }
@media (max-width: 600px) {
  .bar { grid-template-columns: auto 1fr; padding: var(--space-4); }
  .tp { justify-content: flex-end; gap: var(--space-1); }
  .r { display: none; }
}
</style>
