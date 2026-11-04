<script setup lang="ts">
/**
 * Under the waveform, on the same width: the song's parts (A, B, C… = parts that sound alike),
 * dots for the selected passage's moments, a faint mark where its chords come back, and one
 * live line — sounding chord, the next one, bar · beat, part. Click a part to select it, drag to mark
 * a passage (both set the loop markers, like the waveform). It needs only the quick tier, so
 * it shows while stems are still being separated, and it works without opening Explore.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { barAt, beatInBar, blockIndexAt, type PassageMoment, type Timeline } from '../../core/timeline';
import { formatTime } from '../../ui/format';
import { useTimeDrag } from '../../composables/useTimeDrag';

const props = defineProps<{ timeline: Timeline | null; duration: number; t: number; moments: PassageMoment[] }>();
const emit = defineEmits<{ range: [a: number, b: number, phase: 'start' | 'move' | 'end'] }>();

const cv = ref<HTMLCanvasElement | null>(null);
const width = ref(0);
let ro: ResizeObserver | null = null;
const H = 26;
const PART = ['--part-a', '--part-b', '--part-c', '--part-d'];

function draw(): void {
  const c = cv.value, tl = props.timeline, w = width.value;
  if (!c || !w) return;
  const dpr = devicePixelRatio || 1;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext('2d')!, css = getComputedStyle(document.documentElement);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, H);
  const X = (s: number) => s / Math.max(1, props.duration) * w;
  if (!tl?.sections?.length) { g.fillStyle = css.getPropertyValue('--bg-raise'); g.fillRect(0, 0, w, 12); return; }
  for (const m of props.moments) if (m.ghost != null) {
    g.fillStyle = 'rgba(142,197,184,0.35)';
    g.fillRect(X(m.ghost), 0, Math.max(3, X(m.ghost + 16 * 60 / (tl.tempoBpm || 120)) - X(m.ghost)), 12);
  }
  for (const p of tl.sections) {
    const a = X(p.a), b = X(p.b), i = p.label.charCodeAt(0) - 65;
    g.fillStyle = css.getPropertyValue(PART[i % PART.length]).trim();
    g.globalAlpha = props.t >= p.a && props.t < p.b ? 1 : 0.55;
    g.fillRect(a + 1, 0, Math.max(1, b - a - 2), 12);
    g.globalAlpha = 1;
    if (b - a > 14) { g.fillStyle = '#0e0e10'; g.font = '600 10px ' + css.getPropertyValue('--font-sans'); g.fillText(p.label, a + 4, 10); }
  }
  g.fillStyle = css.getPropertyValue('--accent').trim();
  for (const m of props.moments) { g.beginPath(); g.arc(X(m.at), 20, 3, 0, 7); g.fill(); }
}

watch(() => [props.timeline, props.duration, props.moments, Math.floor(props.t)], () => requestAnimationFrame(draw));
onMounted(() => {
  ro = new ResizeObserver(([e]) => { width.value = e.contentRect.width; draw(); });
  if (cv.value) ro.observe(cv.value);
});
onBeforeUnmount(() => ro?.disconnect());

const now = computed(() => {
  const tl = props.timeline;
  if (!tl?.chords?.length || !tl.beats?.length) return null;
  const i = blockIndexAt(tl.chords, props.t), c = tl.chords[i], next = tl.chords[i + 1];
  const part = tl.sections?.[blockIndexAt(tl.sections, props.t)];
  return {
    chord: c?.c ?? '—',
    next: next ? { c: next.c, in: Math.max(0, next.a - props.t).toFixed(1) } : null,
    bar: barAt(tl.downbeats ?? [], props.t),
    beat: beatInBar(tl.beats, tl.downbeats ?? [], props.t),
    part: part?.label,
  };
});

// LOOP ANYWHERE FIX - click a part to select the whole part; drag to mark any range.
// Example: click the C block at 0:58 → selection 0:58–1:18.
const drag = useTimeDrag(
  x => { const r = cv.value!.getBoundingClientRect(); return Math.max(0, Math.min(props.duration, (x - r.left) / r.width * props.duration)); },
  {
    click: sec => {
      const p = props.timeline?.sections?.find(s => sec >= s.a && sec < s.b);
      if (p) { emit('range', p.a, p.a, 'start'); emit('range', p.a, p.b, 'end'); }
    },
    range: (a, b, phase) => emit('range', a, b, phase),
  },
);
</script>

<template>
  <div class="strip">
    <canvas ref="cv" class="cv" :style="{ height: H + 'px' }" aria-label="Song parts and marked moments. Click a part to select it, drag to mark a passage." @pointerdown="drag.pointerdown" @pointermove="drag.pointermove" @pointerup="drag.pointerup" @pointercancel="drag.pointercancel"></canvas>
    <div v-if="now" class="now" aria-live="off">
      <span class="ch">{{ now.chord }}</span>
      <span v-if="now.next" class="nx">next {{ now.next.c }} in {{ now.next.in }} s</span>
      <span>bar {{ now.bar }} · beat {{ now.beat }}</span>
      <span v-if="now.part">part {{ now.part }}</span>
      <span class="clock">{{ formatTime(t) }} / {{ formatTime(duration) }}</span>
    </div>
  </div>
</template>

<style scoped>
.strip { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.cv { display: block; width: 100%; cursor: pointer; touch-action: pan-y; }
.now { display: flex; gap: 14px; align-items: baseline; flex-wrap: wrap; font-size: 13px; color: var(--ink-sub); font-variant-numeric: tabular-nums; }
.ch { color: var(--ink); font-size: 15px; font-weight: 500; min-width: 2.5em; }
.nx { color: var(--ink-mute); }
.clock { margin-left: auto; color: var(--ink-mute); }
</style>
