<script setup lang="ts">
/**
 * Live lanes: bar ruler, spectrogram, chords, vocal melody, one lane per stem and loudness, on
 * one time axis that follows the playhead (4 s behind, 8 s ahead) or shows the whole passage.
 * Each lane draws as soon as its tier has arrived and says what it is waiting for until then.
 * The stem labels carry S (solo) and M (mute), so the lanes are also the mixer.
 * Click a lane to move the playhead there.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { noteName, quantile, STEM_NAMES, type StemName, type Timeline } from '../../core/timeline';
import { bandForHz, spectrumLabels, spectrumTiles, SPEC_TILE, type Spectrum, type SpectrumView } from '../../core/spectrum';
import { useTimeDrag } from '../../composables/useTimeDrag';

const props = defineProps<{
  timeline: Timeline | null;
  /** Mel view + instant curves (loudness lane). */
  spectrum: Spectrum | null;
  /** The spectrum view to draw (mel, CQT or linear). */
  view: SpectrumView | null;
  range: { a: number; b: number };
  t: number;
  zoom: 'live' | 'all';
  /** 'all', a stem (solo) or 'no_<stem>' (mute): what is playing. */
  activeStem: string;
  waitingText: { quick: string; full: string; spectrum: string };
}>();
const emit = defineEmits<{ seek: [sec: number]; loop: [a: number, b: number]; solo: [stem: StemName]; mute: [stem: StemName] }>();

type Row = { k: 'bar' | 'spec' | 'chord' | 'melody' | 'stem' | 'loud' | 'axis'; h: number; gap?: number; name: string; s?: StemName; y?: number };
const ROWS: Row[] = [
  { k: 'bar', h: 22, name: 'Bar' },
  { k: 'spec', h: 150, name: 'Spectrum', gap: 6 },
  { k: 'chord', h: 34, name: 'Chord', gap: 6 },
  { k: 'melody', h: 54, name: 'Melody', gap: 6 },
  ...STEM_NAMES.map(s => ({ k: 'stem' as const, s, h: 28, name: s.charAt(0).toUpperCase() + s.slice(1), gap: 4 })),
  { k: 'loud', h: 30, name: 'Loudness', gap: 6 },
  { k: 'axis', h: 14, name: '' },
];
let y = 0;
for (const r of ROWS) { r.y = y; y += r.h + (r.gap ?? 0); }
const HEIGHT = y;

const cv = ref<HTMLCanvasElement | null>(null);
const width = ref(0);
let ro: ResizeObserver | null = null;
let tiles: HTMLCanvasElement[] = [];
watch(() => props.view, s => { tiles = s ? spectrumTiles(s) : []; }, { immediate: true });

const soloed = computed(() => (STEM_NAMES as readonly string[]).includes(props.activeStem) ? props.activeStem : null);
const mutedStem = computed(() => props.activeStem.startsWith('no_') ? props.activeStem.slice(3) : null);
const audible = (s: string) => (!soloed.value || soloed.value === s) && mutedStem.value !== s;

/**
 * Visible time span. Follow = 4 s behind and 8 s ahead of the playhead.
 * FOLLOW CLAMP FIX - with the playhead outside the passage (or near 0:00) the view used to
 * show the wrong part of the song, or a blank third of negative time.
 * Example: passage 1:35–2:41, playhead at 0:00 → view 1:35–1:47, not -0:04–0:08.
 */
/** While dragging a new loop the axis is frozen, so it does not move under the pointer. */
const frozen = ref<[number, number] | null>(null);
/** The range being dragged, drawn over the lanes until release. */
const dragRange = ref<[number, number] | null>(null);
const view = computed<[number, number]>(() => {
  if (frozen.value) return frozen.value;
  if (props.zoom === 'all') return [props.range.a, props.range.b];
  const inside = props.t >= props.range.a && props.t <= props.range.b;
  const c = inside ? props.t : props.range.a + 4;
  const a = Math.max(0, c - 4);
  return [a, a + 12];
});

/** Melody scale: the passage's own range, so the line uses the lane's height. */
const melodyRange = computed(() => {
  const m = props.timeline?.melody;
  if (!m) return null;
  const vals = m.midi.slice(Math.floor(props.range.a * m.fps), Math.ceil(props.range.b * m.fps)).filter((v): v is number => v != null);
  return vals.length ? { lo: quantile(vals, 0.02) - 1, hi: quantile(vals, 0.98) + 1 } : null;
});

function color(name: string): string { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function draw(): void {
  const c = cv.value;
  if (!c || !width.value) return;
  const dpr = devicePixelRatio || 1, w = width.value;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(HEIGHT * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(HEIGHT * dpr); }
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, HEIGHT);
  const C = { ink: color('--ink'), sub: color('--ink-sub'), mute: color('--ink-mute'), strong: color('--line-strong'), accent: color('--accent'), raise: color('--bg-raise'), bg: color('--bg-panel') };
  const font = color('--font-sans');
  const tl = props.timeline, [v0, v1] = view.value, X = (s: number) => (s - v0) / (v1 - v0) * w, t = props.t;
  const pend = (r: Row, text: string) => {
    g.fillStyle = C.raise; g.fillRect(0, r.y! + 2, w, r.h - 4);
    if (text) { g.fillStyle = C.mute; g.font = '11px ' + font; g.fillText(text, 8, r.y! + r.h / 2 + 4); }
  };
  // the passage, faintly, when the view reaches outside it
  g.fillStyle = 'rgba(142,197,184,0.04)';
  g.fillRect(Math.max(0, X(props.range.a)), 0, Math.min(w, X(props.range.b)) - Math.max(0, X(props.range.a)), HEIGHT - 14);

  for (const r of ROWS) {
    const ry = r.y!;
    if (r.k === 'bar') {
      if (!tl?.beats?.length) { pend(r, props.waitingText.quick); continue; }
      g.font = '11px ' + font;
      for (const b of tl.beats) if (b >= v0 && b <= v1) { g.fillStyle = C.strong; g.fillRect(X(b), ry + 14, 1, 8); }
      (tl.downbeats ?? []).forEach((d, i) => {
        if (d < v0 || d > v1) return;
        g.fillStyle = C.mute; g.fillRect(X(d), ry + 8, 1, 14);
        if (props.zoom === 'live' || i % 4 === 0) { g.fillStyle = C.sub; g.fillText(String(i + 1), X(d) + 3, ry + 10); }
      });
    } else if (r.k === 'spec') {
      const sp = props.view;
      if (!sp || !tiles.length) { pend(r, props.waitingText.spectrum); continue; }
      // Slice [v0, v1] out of the tiles; a view can cross a tile edge, so draw per tile.
      const f0 = Math.max(0, v0 * sp.fps), f1 = Math.min(sp.frames, v1 * sp.fps);
      g.imageSmoothingEnabled = true;
      for (let ti = Math.floor(f0 / SPEC_TILE); ti <= Math.floor((f1 - 1) / SPEC_TILE) && ti < tiles.length; ti++) {
        const t0 = ti * SPEC_TILE, a = Math.max(f0, t0), b = Math.min(f1, t0 + tiles[ti].width);
        if (b <= a) continue;
        g.drawImage(tiles[ti], a - t0, 0, b - a, sp.bands, X(a / sp.fps), ry, X(b / sp.fps) - X(a / sp.fps), r.h);
      }
      // Axis labels follow the view: Hz for mel and linear, note names for CQT.
      const bandY = (f: number) => ry + r.h - (bandForHz(sp, f) + 0.5) / sp.bands * r.h;
      g.font = '600 10px ' + font;
      for (const [f, label] of spectrumLabels(sp.kind)) {
        const yy = bandY(f);
        g.fillStyle = 'rgba(14,14,16,0.72)'; g.fillRect(2, yy - 7, 40, 13);
        g.fillStyle = C.ink; g.fillText(label, 5, yy + 3);
      }
    } else if (r.k === 'chord') {
      if (!tl?.chords?.length) { pend(r, props.waitingText.quick); continue; }
      for (const ch of tl.chords) {
        if (ch.b < v0 || ch.a > v1) continue;
        const a = Math.max(0, X(ch.a)), b = Math.min(w, X(ch.b)), now = t >= ch.a && t < ch.b;
        const conf = Math.max(0.25, Math.min(1, (ch.conf - 0.55) / 0.35));   // brighter = surer match
        g.fillStyle = now ? 'rgba(142,197,184,0.22)' : `rgba(220,220,224,${0.04 + conf * 0.08})`;
        g.strokeStyle = now ? C.accent : C.strong;
        g.beginPath(); g.roundRect(a + 1, ry + 2, Math.max(1, b - a - 2), r.h - 4, 6); g.fill(); g.stroke();
        if (b - a > 22) { g.fillStyle = now ? C.accent : `rgba(220,220,224,${0.45 + conf * 0.55})`; g.font = (now ? '600 ' : '') + '13px ' + font; g.fillText(ch.c, a + 7, ry + 22); }
      }
    } else if (r.k === 'melody') {
      const m = tl?.melody, mr = melodyRange.value;
      if (!m || !mr) { pend(r, m ? 'No singing in this passage' : props.waitingText.full); continue; }
      const Y = (v: number) => ry + r.h - 2 - (v - mr.lo) / (mr.hi - mr.lo) * (r.h - 4);
      g.strokeStyle = color('--stem-vocals'); g.globalAlpha = audible('vocals') ? 1 : 0.25; g.lineWidth = 2; g.beginPath();
      let pen = false;
      for (let i = Math.max(0, Math.floor(v0 * m.fps)); i <= Math.min(m.midi.length - 1, v1 * m.fps); i++) {
        const v = m.midi[i];
        if (v == null) { pen = false; continue; }
        if (pen) g.lineTo(X(i / m.fps), Y(v)); else g.moveTo(X(i / m.fps), Y(v));
        pen = true;
      }
      g.stroke(); g.lineWidth = 1; g.globalAlpha = 1;
      const now = m.midi[Math.round(t * m.fps)];
      if (now != null && t >= v0 && t <= v1) {
        g.fillStyle = C.ink; g.beginPath(); g.arc(X(t), Y(now), 4, 0, 7); g.fill();
        g.font = '600 11px ' + font; g.fillText(noteName(now), X(t) + 7, Y(now) - 5);
      }
    } else if (r.k === 'stem') {
      const curve = tl?.stems?.[r.s!];
      if (!curve) { pend(r, r.s === 'vocals' ? props.waitingText.full : ''); continue; }
      const fps = tl!.fps ?? 10, step = Math.max(1, Math.floor((v1 - v0) * fps / w));
      g.fillStyle = color('--stem-' + r.s); g.globalAlpha = audible(r.s!) ? 0.85 : 0.15;
      g.beginPath(); g.moveTo(X(v0), ry + r.h);
      for (let i = Math.max(0, Math.floor(v0 * fps)); i <= Math.min(curve.length - 1, v1 * fps); i += step) g.lineTo(X(i / fps), ry + r.h - curve[i] * (r.h - 2));
      g.lineTo(Math.min(w, X(curve.length / fps)), ry + r.h); g.closePath(); g.fill(); g.globalAlpha = 1;
    } else if (r.k === 'loud') {
      // service curve when there, else the browser's (instant tier); both on a 0..1 song scale
      const curve: ArrayLike<number> | undefined = tl?.mix ?? props.spectrum?.loud;
      if (!curve) { pend(r, props.waitingText.spectrum); continue; }
      const lo = quantile(curve, 0.05), hi = quantile(curve, 0.995) || 1;
      g.strokeStyle = C.ink; g.lineWidth = 1.5; g.beginPath();
      let first = true;
      for (let i = Math.max(1, Math.floor(v0 * 10)); i <= Math.min(curve.length - 2, v1 * 10); i++) {
        const v = (Number(curve[i - 1]) + Number(curve[i]) + Number(curve[i + 1])) / 3;
        const yy = ry + r.h - Math.max(0, Math.min(1, (v - lo) / Math.max(1e-6, hi - lo))) * (r.h - 2);
        if (first) { g.moveTo(X(i / 10), yy); first = false; } else g.lineTo(X(i / 10), yy);
      }
      g.stroke(); g.lineWidth = 1;
    } else if (r.k === 'axis') {
      g.fillStyle = C.mute; g.font = '10px ' + font;
      const tick = v1 - v0 > 30 ? 10 : 2;
      for (let s = Math.ceil(v0 / tick) * tick; s <= v1; s += tick) {
        if (s < 0) continue;
        g.fillText(Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'), X(s) + 2, ry + 11);
      }
    }
  }
  if (t >= v0 && t <= v1) { g.fillStyle = C.accent; g.fillRect(X(t) - 0.75, 0, 1.5, HEIGHT - 14); }
  if (dragRange.value) {
    const [a, b] = dragRange.value;
    g.fillStyle = 'rgba(142,197,184,0.16)'; g.fillRect(X(a), 0, X(b) - X(a), HEIGHT - 14);
    g.fillStyle = C.accent; g.fillRect(X(a) - 1, 0, 2, HEIGHT - 14); g.fillRect(X(b) - 1, 0, 2, HEIGHT - 14);
  }
}

watch(() => [props.t, props.zoom, props.timeline, props.spectrum, props.view, props.activeStem, props.range.a, props.range.b, dragRange.value], () => requestAnimationFrame(draw));
onMounted(() => {
  ro = new ResizeObserver(([e]) => { width.value = e.contentRect.width; draw(); });
  if (cv.value) ro.observe(cv.value);
});
onBeforeUnmount(() => ro?.disconnect());

// Click a lane: seek there. Drag across the lanes: that range becomes the loop (LOOP ANYWHERE FIX).
const drag = useTimeDrag(
  x => { const r = cv.value!.getBoundingClientRect(), [v0, v1] = view.value; return Math.max(0, v0 + (x - r.left) / r.width * (v1 - v0)); },
  {
    click: sec => emit('seek', sec),
    range: (a, b, phase) => {
      if (phase === 'start') frozen.value = view.value;
      dragRange.value = phase === 'end' ? null : [a, b];
      if (phase === 'end') { frozen.value = null; emit('loop', a, b); }
    },
  },
);
const stemsReady = computed(() => !!props.timeline?.stems);
</script>

<template>
  <div class="lanes">
    <div class="lbl" :style="{ height: HEIGHT + 'px' }">
      <div v-for="r in ROWS.filter(x => x.name)" :key="r.name" class="l" :style="{ top: r.y + 'px', height: r.h + 'px' }">
        <span v-if="r.s" class="sw" :style="{ background: 'var(--stem-' + r.s + ')' }"></span>
        <span>{{ r.name }}<small v-if="r.k === 'spec' && $props.view" class="kindl">{{ $props.view.kind === 'cqt' ? 'CQT' : $props.view.kind === 'linear' ? 'Linear' : 'Mel' }}</small></span>
        <template v-if="r.s">
          <button type="button" class="sm" :aria-pressed="soloed === r.s" :disabled="!stemsReady" :aria-label="'Solo ' + r.s" @click="emit('solo', r.s)">S</button>
          <button type="button" class="sm" :aria-pressed="mutedStem === r.s" :disabled="!stemsReady" :aria-label="'Mute ' + r.s" @click="emit('mute', r.s)">M</button>
        </template>
      </div>
    </div>
    <canvas ref="cv" class="cv" :style="{ height: HEIGHT + 'px' }" aria-label="Bars, spectrum, chords, vocal melody, stem loudness and loudness around the playhead" @pointerdown="drag.pointerdown" @pointermove="drag.pointermove" @pointerup="drag.pointerup" @pointercancel="drag.pointercancel"></canvas>
  </div>
</template>

<style scoped>
.lanes { display: grid; grid-template-columns: 112px minmax(0, 1fr); }
.lbl { position: relative; }
.l { position: absolute; left: 0; right: 6px; display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--ink-mute); }
.sw { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.kindl { display: block; font-size: 10px; color: var(--ink-mute); opacity: .8; }
.sm {
  padding: 0 5px; font-size: 10px; line-height: 15px; border-radius: 4px; margin-left: auto;
  border: 1px solid var(--line-strong); background: none; color: var(--ink-sub); cursor: pointer; font-family: var(--font-sans);
}
.sm + .sm { margin-left: 0; }
.sm:hover:not(:disabled) { border-color: var(--chip-on-line); color: var(--ink); }
.sm[aria-pressed='true'] { background: var(--chip-on); border-color: var(--chip-on-line); color: var(--ink); }
.sm:disabled { opacity: .35; cursor: default; }
.sm:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.cv { display: block; width: 100%; cursor: crosshair; touch-action: pan-y; }
@media (max-width: 600px) {
  .lanes { grid-template-columns: 72px minmax(0, 1fr); }
  .sm { display: none; }
}
</style>
