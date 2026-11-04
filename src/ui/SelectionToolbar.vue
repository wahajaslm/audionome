<script setup lang="ts">
/**
 * SelectionToolbar: the loop bar under a selected passage. Every control for the passage
 * lives here (ONE PLACE FIX: Explore used to sit apart, at the far right of the caption line).
 * ▶/⏸ play · Loop (toggle) · Explore (toggle) · ♡ Save (shows "Saved" once saved) · ✕ clear.
 * Props: range { a, b } (seconds); duration (seconds, to centre it on the selection); loop;
 *        playing; exploring; saved.
 * Emits: play, loop, explore, save, clear.
 * It is centred on the selection and clamped to the waveform's edges (the parent's width).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { formatTime } from './format';

const props = defineProps<{
  range: { a: number; b: number }; duration: number; loop: boolean; playing: boolean; exploring: boolean; saved: boolean;
}>();
const emit = defineEmits<{ play: []; loop: []; explore: []; save: []; clear: [] }>();

const wrap = ref<HTMLDivElement | null>(null);
const bar = ref<HTMLDivElement | null>(null);
const left = ref(0);
let observer: ResizeObserver | null = null;

function place(): void {
  if (!wrap.value || !bar.value) return;
  const W = wrap.value.clientWidth, w = bar.value.offsetWidth;
  const centre = ((props.range.a + props.range.b) / 2 / Math.max(1, props.duration)) * W;
  left.value = Math.max(0, Math.min(W - w, centre - w / 2));
}
watch(() => [props.range.a, props.range.b, props.duration, props.loop, props.saved], () => nextTick(place));
onMounted(() => {
  place();
  observer = new ResizeObserver(place);
  if (wrap.value) observer.observe(wrap.value);
});
onBeforeUnmount(() => observer?.disconnect());
const label = computed(() => formatTime(props.range.a) + ' – ' + formatTime(props.range.b));
</script>

<template>
  <div ref="wrap" class="wrap">
    <div ref="bar" class="tb" role="toolbar" aria-label="Selected moment" :style="{ left: left + 'px' }">
      <span class="rng">{{ label }}</span>
      <button type="button" class="b ic" :aria-label="playing ? 'Pause' : 'Play this passage'" @click="emit('play')"><Icon :name="playing ? 'pause' : 'play'" :size="16" /></button>
      <button type="button" class="b" :aria-pressed="loop" @click="emit('loop')"><Icon name="loop" :size="16" />Loop</button>
      <button type="button" class="b" :aria-pressed="exploring" @click="emit('explore')"><Icon name="sparkle" :size="16" />Explore</button>
      <button type="button" class="b" :class="{ saved }" @click="emit('save')"><Icon name="heart" :size="16" />{{ saved ? 'Saved' : 'Save' }}</button>
      <button type="button" class="x" aria-label="Clear selection" @click="emit('clear')"><Icon name="close" :size="14" /></button>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  position: relative;
  height: 58px;
  animation: open 200ms ease;
}
@keyframes open { from { height: 0; opacity: 0; } to { height: 58px; opacity: 1; } }
.tb {
  position: absolute;
  top: var(--space-2);
  height: 44px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 var(--space-1) 0 14px;
  background: var(--bg-panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-pop);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.rng {
  font-size: 13px;
  color: var(--ink-sub);
  padding-right: 10px;
  margin-right: 2px;
  border-right: 1px solid var(--line-strong);
}
.b {
  height: 36px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 7px;
  font: 14px var(--font-sans);
  cursor: pointer;
}
.b:hover { background: var(--bg-raise); }
.b.ic { width: 36px; padding: 0; justify-content: center; }
.b.saved { color: var(--accent); }
.b[aria-pressed='true'] { background: var(--bg-raise); color: var(--accent); }
.x {
  width: 32px;
  height: 36px;
  border: 0;
  background: none;
  color: var(--ink-mute);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.x:hover { background: var(--bg-raise); color: var(--ink); }
@media (max-width: 600px) { .rng { display: none; } .b { padding: 0 8px; gap: 5px; } }
@media (prefers-reduced-motion: reduce) { .wrap { animation: none; } }
</style>
