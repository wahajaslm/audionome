<script setup lang="ts">
/**
 * ProgressRail: a thin scrubber for compact players (the mini player away from Now playing).
 * Not in the reference set; built from its tokens (line-strong track, ink-sub fill).
 * Props: currentTime, duration (seconds).
 * Emits: scrub-start, scrub(sec) while dragging, scrub-end(sec) on release, step(±5 s) for ←/→.
 * The consumer logs the seek with the position where the drag started (SYNC FIX 8).
 */
import { computed, ref } from 'vue';
import { formatTime } from './format';

const props = defineProps<{ currentTime: number; duration: number }>();
const emit = defineEmits<{ 'scrub-start': []; scrub: [sec: number]; 'scrub-end': [sec: number]; step: [delta: number] }>();
const rail = ref<HTMLDivElement | null>(null);
let dragging = false;
const pct = computed(() => Math.min(100, Math.max(0, (props.currentTime / Math.max(1, props.duration)) * 100)));

function at(e: PointerEvent): number {
  const r = rail.value!.getBoundingClientRect();
  return (Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)))) * props.duration;
}
function down(e: PointerEvent) { dragging = true; rail.value?.setPointerCapture(e.pointerId); emit('scrub-start'); emit('scrub', at(e)); }
function move(e: PointerEvent) { if (dragging) emit('scrub', at(e)); }
function up(e: PointerEvent) { if (!dragging) return; dragging = false; emit('scrub-end', at(e)); }
function cancel() { dragging = false; }
function key(e: KeyboardEvent) {
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { emit('step', 5); e.preventDefault(); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { emit('step', -5); e.preventDefault(); }
}
</script>

<template>
  <div
    ref="rail"
    class="rail"
    role="slider"
    tabindex="0"
    aria-label="Song position"
    aria-valuemin="0"
    :aria-valuemax="Math.round(duration)"
    :aria-valuenow="Math.round(currentTime)"
    :aria-valuetext="formatTime(currentTime)"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="cancel"
    @keydown="key"
  >
    <div class="track"><div class="fill" :style="{ width: pct + '%' }"></div></div>
  </div>
</template>

<style scoped>
.rail { height: 14px; display: flex; align-items: center; cursor: pointer; touch-action: none; }
.track { position: relative; flex: 1; height: 2px; border-radius: var(--radius-xs); background: var(--line-strong); }
.fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink-sub); border-radius: var(--radius-xs); }
</style>
