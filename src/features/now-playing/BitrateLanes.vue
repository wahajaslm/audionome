<script setup lang="ts">
/**
 * Nerds view curves, on the song's clock: Bitrate (large: kbps per half second, the file's
 * average as a dashed line, min…max scale), Loudness, and time. The playhead and the selected
 * passage (or loop) are drawn on top. Click to jump there, drag to loop that stretch.
 * Follow = 20 s around the playhead; Whole passage = the passage (or the whole song).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { BitrateInfo } from '../../core/bitrate';
import { labelStep, quantile, TIME_STEPS } from '../../core/timeline';
import { useTimeDrag } from '../../composables/useTimeDrag';

const props = defineProps<{
  bitrate: BitrateInfo | null;
  /** Loudness, 10 values per second (service curve or the browser's). */
  loud: ArrayLike<number> | null;
  /** The passage (selection) or the whole song. */
  range: { a: number; b: number };
  sel: { a: number; b: number } | null;
  t: number;
  zoom: 'live' | 'all';
}>();
const emit = defineEmits<{ seek: [sec: number]; loop: [a: number, b: number] }>();

const ROWS = { rate: { y: 0, h: 96 }, loud: { y: 104, h: 34 }, axis: { y: 144, h: 14 } };
const HEIGHT = 158;
const cv = ref<HTMLCanvasElement | null>(null);
const width = ref(0);
let ro: ResizeObserver | null = null;
const dragRange = ref<[number, number] | null>(null);

const view = computed<[number, number]>(() => {
  if (props.zoom === 'all') return [props.range.a, props.range.b];
  const span = Math.min(20, props.range.b - props.range.a || 20);
  const c = props.t >= props.range.a && props.t <= props.range.b ? props.t : props.range.a + span / 2;
  return [c - span / 2, c + span / 2];
});

function draw(): void {
  const c = cv.value, w = width.value;
  if (!c || !w) return;
  const dpr = devicePixelRatio || 1;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(HEIGHT * dpr); }
  const g = c.getContext('2d')!, css = getComputedStyle(document.documentElement), font = css.getPropertyValue('--font-sans');
  const col = (v: string) => css.getPropertyValue(v).trim();
  const C = { ink: col('--ink'), sub: col('--ink-sub'), mute: col('--ink-mute'), line: col('--line'), accent: col('--accent'), raise: col('--bg-raise') };
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, HEIGHT);
  const [v0, v1] = view.value, X = (s: number) => ((s - v0) / Math.max(1e-6, v1 - v0)) * w;

  // The passage (or loop) as a band; the dragged range while dragging.
  const band = dragRange.value ?? (props.sel ? [props.sel.a, props.sel.b] : null);
  if (band) { g.fillStyle = C.raise; g.fillRect(X(band[0]), 0, X(band[1]) - X(band[0]), HEIGHT - 14); }

  const br = props.bitrate, R = ROWS.rate;
  g.font = '10px ' + font;
  if (!br) { g.fillStyle = C.mute; g.fillText('Reading the file…', 8, R.y + R.h / 2); }
  else {
    const k = br.kbps, i0 = Math.max(0, Math.floor(v0 / br.binSec)), i1 = Math.min(k.length - 1, Math.ceil(v1 / br.binSec));
    const vis = k.slice(i0, i1 + 1).filter(v => v > 0);
    let lo = Math.min(...vis, br.avgKbps), hi = Math.max(...vis, br.avgKbps);
    if (hi - lo < 2) { lo -= 2; hi += 2; } else { const pad = (hi - lo) * 0.12; lo = Math.max(0, lo - pad); hi += pad; }
    const Y = (v: number) => R.y + R.h - ((v - lo) / (hi - lo)) * (R.h - 4) - 2;
    // filled step curve
    g.beginPath(); g.moveTo(X(i0 * br.binSec), R.y + R.h);
    for (let i = i0; i <= i1; i++) { const yy = Y(k[i] || lo); g.lineTo(X(i * br.binSec), yy); g.lineTo(X((i + 1) * br.binSec), yy); }
    g.lineTo(X((i1 + 1) * br.binSec), R.y + R.h); g.closePath();
    g.globalAlpha = 0.18; g.fillStyle = C.accent; g.fill(); g.globalAlpha = 1;
    g.beginPath();
    for (let i = i0; i <= i1; i++) { const yy = Y(k[i] || lo); if (i === i0) g.moveTo(X(i * br.binSec), yy); else g.lineTo(X(i * br.binSec), yy); g.lineTo(X((i + 1) * br.binSec), yy); }
    g.strokeStyle = C.accent; g.lineWidth = 1.5; if (!br.exact) g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]); g.lineWidth = 1;
    // the file's average
    g.setLineDash([3, 4]); g.strokeStyle = C.mute; g.beginPath(); g.moveTo(0, Y(br.avgKbps)); g.lineTo(w, Y(br.avgKbps)); g.stroke(); g.setLineDash([]);
    g.fillStyle = C.mute;
    g.fillText(`${Math.round(hi)} kbps`, 4, R.y + 10);
    g.fillText(`${Math.round(lo)}`, 4, R.y + R.h - 3);
    g.fillText(`avg ${br.avgKbps}`, w - 52, Y(br.avgKbps) - 3);
  }

  const L = ROWS.loud, loud = props.loud;
  if (loud && loud.length > 2) {
    const lo = quantile(loud, 0.05), hi = quantile(loud, 0.995) || 1;
    g.strokeStyle = C.sub; g.lineWidth = 1.25; g.beginPath();
    let first = true;
    for (let i = Math.max(1, Math.floor(v0 * 10)); i <= Math.min(loud.length - 2, v1 * 10); i++) {
      const v = (Number(loud[i - 1]) + Number(loud[i]) + Number(loud[i + 1])) / 3;
      const yy = L.y + L.h - Math.max(0, Math.min(1, (v - lo) / Math.max(1e-6, hi - lo))) * (L.h - 2);
      if (first) { g.moveTo(X(i / 10), yy); first = false; } else g.lineTo(X(i / 10), yy);
    }
    g.stroke(); g.lineWidth = 1;
  }

  const A = ROWS.axis, step = labelStep(w / Math.max(1e-6, v1 - v0), TIME_STEPS, 60);
  g.fillStyle = C.mute; g.font = '10px ' + font;
  for (let s = Math.ceil(v0 / step) * step; s <= v1; s += step) {
    if (s < 0) continue;
    g.fillRect(X(s), A.y, 1, 3);
    g.fillText(Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'), X(s) + 2, A.y + 11);
  }
  if (props.t >= v0 && props.t <= v1) { g.fillStyle = C.accent; g.fillRect(X(props.t) - 0.75, 0, 1.5, HEIGHT - 14); }
}

watch(() => [props.t, props.zoom, props.bitrate, props.loud, props.range.a, props.range.b, props.sel?.a, props.sel?.b, dragRange.value], () => requestAnimationFrame(draw));
onMounted(() => {
  ro = new ResizeObserver(([e]) => { width.value = e.contentRect.width; draw(); });
  if (cv.value) ro.observe(cv.value);
});
onBeforeUnmount(() => ro?.disconnect());

const frozen = ref<[number, number] | null>(null);
const drag = useTimeDrag(
  x => { const r = cv.value!.getBoundingClientRect(), [v0, v1] = frozen.value ?? view.value; return Math.max(0, v0 + (x - r.left) / Math.max(1, r.width) * (v1 - v0)); },
  {
    click: sec => emit('seek', sec),
    range: (a, b, phase) => {
      if (phase === 'start') frozen.value = view.value; // the view holds still while you drag
      dragRange.value = phase === 'end' ? null : [a, b];
      if (phase === 'end') { frozen.value = null; emit('loop', a, b); }
    },
  },
);
</script>

<template>
  <div class="lanes">
    <div class="lbl" :style="{ height: HEIGHT + 'px' }">
      <div class="l" :style="{ top: ROWS.rate.y + 'px', height: ROWS.rate.h + 'px' }">
        <span>Bitrate<small v-if="bitrate">{{ bitrate.codec }} {{ bitrate.mode }}{{ bitrate.exact ? '' : ' · average' }}</small></span>
      </div>
      <div class="l" :style="{ top: ROWS.loud.y + 'px', height: ROWS.loud.h + 'px' }"><span>Loudness</span></div>
    </div>
    <canvas ref="cv" class="cv" :style="{ height: HEIGHT + 'px' }" aria-label="Bitrate and loudness over time. Click to jump, drag to loop." @pointerdown="drag.pointerdown" @pointermove="drag.pointermove" @pointerup="drag.pointerup" @pointercancel="drag.pointercancel"></canvas>
  </div>
</template>

<style scoped>
.lanes { display: grid; grid-template-columns: 96px 1fr; gap: 10px; }
.lbl { position: relative; }
.l { position: absolute; left: 0; right: 0; display: flex; align-items: center; font-size: 13px; color: var(--ink-sub); }
.l small { display: block; font-size: 10px; color: var(--ink-mute); }
.cv { display: block; width: 100%; cursor: crosshair; touch-action: pan-y; }
</style>
