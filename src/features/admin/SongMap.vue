<script setup lang="ts">
/**
 * The whole song on one width: parts (A, B, C… = parts that sound alike), the spectrum,
 * loudness, and when each stem plays. Click anywhere to play from there; drag to loop a range.
 * Lanes whose tier has not arrived say what they are waiting for.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { STEM_NAMES, type Timeline } from '../../core/timeline';
import { spectrumTiles, type Spectrum, type SpectrumKind, type SpectrumView } from '../../core/spectrum';
import SpectrumSwitch from '../../ui/SpectrumSwitch.vue';
import { useTimeDrag } from '../../composables/useTimeDrag';

const props = defineProps<{ timeline: Timeline | null; spectrum: Spectrum | null; view: SpectrumView | null; kind: SpectrumKind; viewBusy: boolean; duration: number; t: number | null; spectrumNote: string }>();
const emit = defineEmits<{ seek: [sec: number]; range: [a: number, b: number]; kind: [kind: SpectrumKind] }>();
const dragRange = ref<[number, number] | null>(null);

const ROWS = [
  { k: 'parts', h: 18, name: 'Parts' },
  { k: 'spec', h: 84, name: 'Spectrum' },
  { k: 'loud', h: 30, name: 'Loudness' },
  ...STEM_NAMES.map(s => ({ k: 'stem', s, h: 14, name: s.charAt(0).toUpperCase() + s.slice(1) })),
  { k: 'axis', h: 14, name: '' },
] as { k: string; h: number; name: string; s?: typeof STEM_NAMES[number]; y?: number }[];
let yy = 0;
for (const r of ROWS) { r.y = yy; yy += r.h + 4; }
const HEIGHT = yy;
const PART = ['--part-a', '--part-b', '--part-c', '--part-d'];

const cv = ref<HTMLCanvasElement | null>(null);
const width = ref(0);
let ro: ResizeObserver | null = null;
let tiles: HTMLCanvasElement[] = [];
watch(() => props.view, s => { tiles = s ? spectrumTiles(s) : []; }, { immediate: true });

function draw(): void {
  const c = cv.value, w = width.value;
  if (!c || !w) return;
  const dpr = devicePixelRatio || 1;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(HEIGHT * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(HEIGHT * dpr); }
  const g = c.getContext('2d')!, css = getComputedStyle(document.documentElement), tok = (n: string) => css.getPropertyValue(n).trim();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, HEIGHT);
  const tl = props.timeline, dur = Math.max(1, props.duration), X = (s: number) => s / dur * w, font = tok('--font-sans');
  const pend = (y: number, h: number, text: string) => {
    g.fillStyle = tok('--bg-raise'); g.fillRect(0, y, w, h);
    if (text) { g.fillStyle = tok('--ink-mute'); g.font = '11px ' + font; g.fillText(text, 8, y + h / 2 + 4); }
  };
  for (const r of ROWS) {
    const y = r.y!;
    if (r.k === 'parts') {
      if (!tl?.sections?.length) { pend(y, r.h, 'Parts arrive with beats and chords'); continue; }
      for (const p of tl.sections) {
        const a = X(p.a), b = X(p.b), i = p.label.charCodeAt(0) - 65;
        g.fillStyle = tok(PART[i % PART.length]); g.fillRect(a + 1, y, Math.max(1, b - a - 2), r.h);
        if (b - a > 14) { g.fillStyle = '#0e0e10'; g.font = '600 11px ' + font; g.fillText(p.label, a + 5, y + 13); }
      }
    } else if (r.k === 'spec') {
      const sp = props.view;
      if (!sp || !tiles.length) { pend(y, r.h, props.spectrumNote); continue; }
      g.imageSmoothingEnabled = true;
      let f0 = 0;
      for (const tile of tiles) {
        g.drawImage(tile, 0, 0, tile.width, sp.bands, X(f0 / sp.fps), y, X(tile.width / sp.fps), r.h);
        f0 += tile.width;
      }
    } else if (r.k === 'loud') {
      const curve = tl?.mix ?? props.spectrum?.loud;
      if (!curve?.length) { pend(y, r.h, ''); continue; }
      // one column per pixel: the loudest frame in it, so short peaks still show
      g.fillStyle = tok('--ink-sub');
      for (let px = 0; px < w; px++) {
        const i0 = Math.floor(px / w * dur * 10), i1 = Math.max(i0 + 1, Math.floor((px + 1) / w * dur * 10));
        let m = 0;
        for (let i = i0; i < Math.min(curve.length, i1); i++) m = Math.max(m, Number(curve[i]));
        const h = Math.max(1, m * r.h);
        g.fillRect(px, y + r.h - h, 1, h);
      }
    } else if (r.k === 'stem') {
      const curve = tl?.stems?.[r.s!];
      if (!curve) { pend(y, r.h, r.s === 'vocals' ? 'Stems arrive after separation' : ''); continue; }
      g.fillStyle = tok('--stem-' + r.s);
      for (let px = 0; px < w; px++) {
        const i0 = Math.floor(px / w * dur * 10), i1 = Math.max(i0 + 1, Math.floor((px + 1) / w * dur * 10));
        let m = 0;
        for (let i = i0; i < Math.min(curve.length, i1); i++) m += Number(curve[i]);
        g.globalAlpha = Math.min(1, Math.max(0, (m / (i1 - i0) - 0.15) / 0.6));   // opacity = how loud the stem is
        g.fillRect(px, y, 1, r.h);
      }
      g.globalAlpha = 1;
    } else if (r.k === 'axis') {
      g.fillStyle = tok('--ink-mute'); g.font = '10px ' + font;
      const step = dur > 300 ? 60 : 30;
      for (let s = 0; s <= dur; s += step) g.fillText(Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'), X(s) + 2, y + 11);
    }
  }
  if (props.t != null) { g.fillStyle = tok('--accent'); g.fillRect(X(props.t) - 0.75, 0, 1.5, HEIGHT - 18); }
  if (dragRange.value) {
    const [a, b] = dragRange.value;
    g.fillStyle = 'rgba(142,197,184,0.18)'; g.fillRect(X(a), 0, X(b) - X(a), HEIGHT - 18);
    g.fillStyle = tok('--accent'); g.fillRect(X(a) - 1, 0, 2, HEIGHT - 18); g.fillRect(X(b) - 1, 0, 2, HEIGHT - 18);
  }
}

watch(() => [props.timeline, props.spectrum, props.view, props.duration, props.t == null ? -1 : Math.round(props.t * 4), dragRange.value], () => requestAnimationFrame(draw));
onMounted(() => {
  ro = new ResizeObserver(([e]) => { width.value = e.contentRect.width; draw(); });
  if (cv.value) ro.observe(cv.value);
});
onBeforeUnmount(() => ro?.disconnect());

// Click: play from there. Drag: loop that range (LOOP ANYWHERE FIX).
const drag = useTimeDrag(
  x => { const r = cv.value!.getBoundingClientRect(); return Math.max(0, Math.min(props.duration, (x - r.left) / r.width * props.duration)); },
  {
    click: sec => emit('seek', sec),
    range: (a, b, phase) => {
      dragRange.value = phase === 'end' ? null : [a, b];
      if (phase === 'end') emit('range', a, b);
    },
  },
);
</script>

<template>
  <div class="map">
    <div class="lbl" :style="{ height: HEIGHT + 'px' }">
      <span v-for="r in ROWS.filter(x => x.name)" :key="r.name" class="l" :style="{ top: r.y + 'px', height: r.h + 'px' }">
        <i v-if="r.s" class="sw" :style="{ background: 'var(--stem-' + r.s + ')' }"></i>
        <span v-if="r.k === 'spec'" class="specl">{{ r.name }}<SpectrumSwitch :kind="kind" :busy="viewBusy" @select="k => emit('kind', k)" /></span>
        <template v-else>{{ r.name }}</template>
      </span>
    </div>
    <canvas ref="cv" class="cv" :style="{ height: HEIGHT + 'px' }" aria-label="The whole song: parts, spectrum, loudness and stems. Click to play from there, drag to loop a range." @pointerdown="drag.pointerdown" @pointermove="drag.pointermove" @pointerup="drag.pointerup" @pointercancel="drag.pointercancel"></canvas>
  </div>
</template>

<style scoped>
.map { display: grid; grid-template-columns: 112px minmax(0, 1fr); }
.specl { display: flex; flex-direction: column; gap: 4px; width: 100%; }
.lbl { position: relative; }
.l { position: absolute; left: 0; display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--ink-mute); }
.sw { width: 7px; height: 7px; border-radius: 50%; }
.cv { display: block; width: 100%; cursor: crosshair; touch-action: pan-y; }
@media (max-width: 600px) { .map { grid-template-columns: 64px minmax(0, 1fr); } }
</style>
