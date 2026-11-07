<script setup lang="ts">
/**
 * Overview under the Nerds controls: the whole passage (or song) as a slim waveform, the visible
 * window as a box, and the playhead. Drag the box to pan; click outside it to centre the view
 * there. Hidden at Fit (the lanes already show everything).
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Envelope } from '../../core/envelope';

const props = defineProps<{ envelope: Envelope | null; range: { a: number; b: number }; win: [number, number]; t: number }>();
const emit = defineEmits<{ center: [sec: number] }>();

const H = 28;
const cv = ref<HTMLCanvasElement | null>(null);
const width = ref(0);
let ro: ResizeObserver | null = null;

function draw(): void {
  const c = cv.value, w = width.value;
  if (!c || !w) return;
  const dpr = devicePixelRatio || 1;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext('2d')!, css = getComputedStyle(document.documentElement);
  const col = (v: string) => css.getPropertyValue(v).trim();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, H);
  const { a, b } = props.range, X = (s: number) => ((s - a) / Math.max(1e-6, b - a)) * w;
  const env = props.envelope;
  if (env) {
    g.fillStyle = col('--ink-mute');
    for (let x = 0; x < w; x++) {
      const k0 = Math.floor((a + (x / w) * (b - a)) * env.rate), k1 = Math.ceil((a + ((x + 1) / w) * (b - a)) * env.rate);
      let hi = 0;
      for (let k = Math.max(0, k0); k < Math.min(env.max.length, Math.max(k1, k0 + 1)); k++) hi = Math.max(hi, env.max[k], -env.min[k]);
      g.fillRect(x, H / 2 - hi * (H / 2 - 2), 1, Math.max(1, hi * (H - 4)));
    }
  }
  const [v0, v1] = props.win;
  g.fillStyle = col('--accent'); g.globalAlpha = 0.16; g.fillRect(X(v0), 0, Math.max(2, X(v1) - X(v0)), H); g.globalAlpha = 1;
  g.strokeStyle = col('--accent'); g.lineWidth = 1; g.strokeRect(X(v0) + 0.5, 0.5, Math.max(2, X(v1) - X(v0)) - 1, H - 1);
  if (props.t >= a && props.t <= b) { g.fillStyle = col('--ink'); g.fillRect(X(props.t), 0, 1, H); }
}
watch(() => [props.envelope, props.range.a, props.range.b, props.win[0], props.win[1], props.t], () => requestAnimationFrame(draw));
onMounted(() => {
  ro = new ResizeObserver(([e]) => { width.value = e.contentRect.width; draw(); });
  if (cv.value) ro.observe(cv.value);
});
onBeforeUnmount(() => ro?.disconnect());

// Drag the box (or click anywhere): the view's centre follows the pointer.
let dragging = false, grab = 0;
const secAt = (e: PointerEvent) => {
  const r = cv.value!.getBoundingClientRect();
  return props.range.a + ((e.clientX - r.left) / Math.max(1, r.width)) * (props.range.b - props.range.a);
};
function down(e: PointerEvent): void {
  dragging = true; cv.value?.setPointerCapture(e.pointerId);
  const s = secAt(e), [v0, v1] = props.win;
  grab = s >= v0 && s <= v1 ? s - (v0 + v1) / 2 : 0; // inside the box: keep where it was grabbed
  emit('center', s - grab);
}
function move(e: PointerEvent): void { if (dragging) emit('center', secAt(e) - grab); }
function up(): void { dragging = false; }
</script>

<template>
  <canvas ref="cv" class="ov" :style="{ height: H + 'px' }" aria-label="Overview: drag the box to move the view" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up"></canvas>
</template>

<style scoped>
.ov { display: block; width: 100%; cursor: grab; touch-action: none; border-radius: 2px; background: var(--bg-raise); }
.ov:active { cursor: grabbing; }
</style>
