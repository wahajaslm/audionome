<script setup lang="ts">
/**
 * Waveform (design-system component): navigation, selection and saved moments in one control.
 *
 * Props
 *   peaks        ≈400 amplitudes, 0–1, laid out on the media duration
 *   duration     song length in seconds
 *   currentTime  playhead position in seconds (pass the media clock, updated every frame)
 *   selection    { a, b } in seconds, or null
 *   saved        saved moments of this song: [{ id, a, b }]
 * Emits
 *   seek(sec)            click without drag
 *   select-start         a drag passed the 6 px threshold
 *   select(a, b)         while dragging (unordered; the consumer orders them)
 *   select-end           drag released
 *   resize(a, b)         an edge of the selection is being dragged (ordered)
 *   resize-end           edge drag released
 *   step(deltaSec)       ← / → keys: −5 / +5 (Shift+← / → moves the selection's end by 1 s)
 *   select-around        Enter: select ±10 s around the playhead
 *   saved-click(id)      a saved-moment dot was clicked
 *
 * Bars are drawn on a <canvas> (one draw per frame is cheap; ~200 rectangles). Colour per bar,
 * in priority order: inside the selection → accent; inside a saved moment → accent-saved;
 * before the playhead → wave-played; else wave-off. Inferred interest is not drawn here:
 * the design system keeps those signals in words, under the waveform.
 */
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue';
import { formatTime, token } from './format';

interface Range { a: number; b: number }
interface SavedRange extends Range { id: string }

const props = defineProps<{
  peaks: number[];
  duration: number;
  currentTime: number;
  selection: Range | null;
  saved: SavedRange[];
}>();

const emit = defineEmits<{
  seek: [sec: number];
  'select-start': [];
  select: [a: number, b: number];
  'select-end': [];
  resize: [a: number, b: number];
  'resize-end': [];
  step: [deltaSec: number];
  'select-around': [];
  'saved-click': [id: string];
}>();

const root = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const width = ref(0);
const height = ref(0);
let colors = { accent: '#8ec5b8', saved: 'rgba(142,197,184,0.45)', played: 'rgba(220,220,224,0.78)', off: '#45454b' };
let observer: ResizeObserver | null = null;

const dur = computed(() => (props.duration > 0 ? props.duration : 1));
const x = (sec: number) => (sec / dur.value) * width.value;

const band = computed(() => props.selection && {
  left: x(props.selection.a) - 4 + 'px',
  width: x(props.selection.b) - x(props.selection.a) + 8 + 'px',
});
const playheadLeft = computed(() => Math.min(width.value, x(props.currentTime)) + 'px');

onMounted(() => {
  colors = {
    accent: token('--accent') || colors.accent,
    saved: token('--accent-saved') || colors.saved,
    played: token('--wave-played') || colors.played,
    off: token('--wave-off') || colors.off,
  };
  observer = new ResizeObserver(() => {
    if (!root.value) return;
    width.value = root.value.clientWidth;
    height.value = root.value.clientHeight;
  });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());

// Redraws whenever any input changes (the playhead changes every frame while playing).
watchEffect(() => {
  const c = canvas.value, W = width.value, H = height.value;
  if (!c || W <= 0 || H <= 0) return;
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  }
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // Bars are 2px wide, 5px centre to centre; the count follows the width so bars never stretch.
  const N = Math.max(40, Math.floor((W + 3) / 5));
  const peaks = props.peaks, last = Math.max(0, peaks.length - 1);
  const sel = props.selection, saved = props.saved, t = props.currentTime, d = dur.value;
  for (let i = 0; i < N; i++) {
    const r = (i + 0.5) / N, ts = r * d;
    const amp = peaks.length ? peaks[Math.floor(r * last)] : 0.05;
    ctx.fillStyle = (sel && ts >= sel.a && ts <= sel.b) ? colors.accent
      : saved.some(s => ts >= s.a && ts <= s.b) ? colors.saved
        : ts <= t ? colors.played : colors.off;
    const h = Math.max(2, Math.round(amp * (H - 20)));
    ctx.fillRect(Math.round(r * W) - 1, Math.round((H - h) / 2), 2, h);
  }
});

// Pointer: a press that moves more than 6 px is a drag (selection); otherwise a click (seek).
// RESIZE FIX - a press on either edge of the selection drags that edge instead, so a loop can
// be extended or shortened without redrawing it.
// Example: loop 1:10–1:25, drag the right edge to 1:32 → loop 1:10–1:32, still looping.
let x0: number | null = null;
let px0 = 0;
let dragging = false;
/** Which edge is being dragged; `fixed` is the other edge's time. */
let edge: { fixed: number } | null = null;
const nearEdge = ref(false);
/** The selection edge within reach of the pointer (wider for touch), or null. */
function edgeAt(e: PointerEvent): 'a' | 'b' | null {
  const sel = props.selection;
  if (!sel || !root.value) return null;
  const px = e.clientX - root.value.getBoundingClientRect().left, reach = e.pointerType === 'touch' ? 16 : 8;
  const da = Math.abs(px - x(sel.a)), db = Math.abs(px - x(sel.b));
  return Math.min(da, db) > reach ? null : da < db ? 'a' : 'b';
}
function timeAt(e: PointerEvent): number {
  const r = root.value!.getBoundingClientRect();
  return Math.max(0, Math.min(dur.value, ((e.clientX - r.left) / Math.max(1, r.width)) * dur.value));
}
function onDown(e: PointerEvent): void {
  if (e.button !== 0) return;
  const which = edgeAt(e);
  edge = which && props.selection ? { fixed: which === 'a' ? props.selection.b : props.selection.a } : null;
  x0 = timeAt(e); px0 = e.clientX; dragging = false;
  root.value?.setPointerCapture(e.pointerId);
}
function onMove(e: PointerEvent): void {
  if (x0 === null) { nearEdge.value = !!edgeAt(e); return; }
  if (edge) {
    const t = timeAt(e);
    emit('resize', Math.min(t, edge.fixed), Math.max(t, edge.fixed));
    return;
  }
  const t = timeAt(e);
  if (!dragging && Math.abs(e.clientX - px0) > 6) { dragging = true; emit('select-start'); }
  if (dragging) emit('select', x0, t);
}
function onUp(e: PointerEvent): void {
  if (x0 === null) return;
  const t = timeAt(e);
  if (edge) emit('resize-end'); else if (dragging) emit('select-end'); else emit('seek', t);
  x0 = null; dragging = false; edge = null;
}
function onCancel(): void {
  if (x0 !== null && edge) emit('resize-end');
  else if (x0 !== null && dragging) emit('select-end');
  x0 = null; dragging = false; edge = null;
}
function onKey(e: KeyboardEvent): void {
  const sel = props.selection;
  if (e.shiftKey && sel && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const b = Math.max(sel.a, Math.min(dur.value, sel.b + (e.key === 'ArrowRight' ? 1 : -1)));
    emit('resize', sel.a, b); emit('resize-end'); e.preventDefault();
  } else if (e.key === 'ArrowRight') { emit('step', 5); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { emit('step', -5); e.preventDefault(); }
  else if (e.key === 'Enter') { emit('select-around'); e.preventDefault(); }
}
</script>

<template>
  <div class="waveform">
    <div
      ref="root"
      class="wf"
      :class="{ 'near-edge': nearEdge }"
      role="slider"
      tabindex="0"
      aria-label="Song position. Drag to select a moment"
      aria-valuemin="0"
      :aria-valuemax="Math.round(duration)"
      :aria-valuenow="Math.round(currentTime)"
      :aria-valuetext="formatTime(currentTime) + ' of ' + formatTime(duration)"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onCancel"
      @pointerleave="nearEdge = false"
      @keydown="onKey"
    >
      <div v-if="band" class="band" :style="band"></div>
      <template v-if="selection">
        <div class="grip" :style="{ left: x(selection.a) + 'px' }"></div>
        <div class="grip" :style="{ left: x(selection.b) + 'px' }"></div>
      </template>
      <canvas ref="canvas" class="bars"></canvas>
      <div class="playhead" :style="{ left: playheadLeft }"></div>
    </div>
    <div class="dots">
      <button
        v-for="s in saved"
        :key="s.id"
        type="button"
        class="dot"
        :style="{ left: x((s.a + s.b) / 2) + 'px' }"
        :title="'Saved ' + formatTime(s.a) + ' – ' + formatTime(s.b)"
        :aria-label="'Saved moment ' + formatTime(s.a) + ' to ' + formatTime(s.b)"
        @click="emit('saved-click', s.id)"
      ></button>
    </div>
  </div>
</template>

<style scoped>
.wf {
  position: relative;
  height: 160px;
  cursor: pointer;
  touch-action: none;
  user-select: none;
}
.wf.near-edge { cursor: ew-resize; }
/* Edge grips: show where to grab to extend or shorten the selection. */
.grip {
  position: absolute;
  top: 50%;
  width: 4px;
  height: 32px;
  margin-left: -2px;
  transform: translateY(-50%);
  border-radius: var(--radius-pill);
  background: var(--accent);
  pointer-events: none;
  z-index: 2;
}
.bars {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
/* Selection band: accent-fill, accent-line border, radius-sm, 4px wider each side. */
.band {
  position: absolute;
  top: 6px;
  bottom: 6px;
  border-radius: var(--radius-sm);
  background: var(--accent-fill);
  border: 1px solid var(--accent-line);
  box-sizing: border-box;
  pointer-events: none;
}
/* Playhead: 1px, 6px taller than the waveform at top and bottom. */
.playhead {
  position: absolute;
  top: -6px;
  bottom: -6px;
  width: 1px;
  background: var(--playhead);
  pointer-events: none;
}
.dots {
  position: relative;
  height: 12px;
}
/* Saved moment: 5px accent dot centred under it; the button around it is the hit area. */
.dot {
  position: absolute;
  top: -2px;
  width: 16px;
  height: 16px;
  margin-left: -8px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.dot::after {
  content: '';
  position: absolute;
  left: 5.5px;
  top: 5.5px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}
@media (max-width: 600px) {
  .wf { height: 120px; }
}
</style>
