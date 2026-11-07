<script setup lang="ts">
/**
 * Nerds view curves, on the song's clock: Bitrate (large: kbps per half second, the file's
 * average as a dashed line, min…max scale), Loudness, and time. The playhead and the selected
 * passage (or loop) are drawn on top. Click to jump there, drag to loop that stretch.
 * Frames = 2 s around the playhead, one bar per frame (height = its bytes, the one playing
 * lit); Follow = 20 s around the playhead; Whole passage = the passage (or the whole song).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { frameAt, type BitrateInfo } from '../../core/bitrate';
import type { Envelope } from '../../core/envelope';
import { bandForHz, spectrumLabels, spectrumTiles, SPEC_TILE, type SpectrumView } from '../../core/spectrum';
import { labelStep, quantile, TIME_STEPS } from '../../core/timeline';
import { useTimeDrag } from '../../composables/useTimeDrag';

const props = defineProps<{
  bitrate: BitrateInfo | null;
  /** Fine waveform (core/envelope.ts) and the spectrum view, on the same clock. */
  envelope: Envelope | null;
  view: SpectrumView | null;
  /** Loudness, 10 values per second (service curve or the browser's). */
  loud: ArrayLike<number> | null;
  /** The passage (selection) or the whole song. */
  range: { a: number; b: number };
  sel: { a: number; b: number } | null;
  t: number;
  zoom: 'frames' | 'live' | 'all';
}>();
const emit = defineEmits<{ seek: [sec: number]; loop: [a: number, b: number] }>();

/**
 * DECODER LANES - Blocks (long · start · short · stop per frame: shorts mark transients),
 * Gain (the quantiser's global gain), and Reservoir (MP3 bit reservoir) or Shape (AAC window
 * shape, KBD lit) sit between Bitrate and Loudness.
 */
// ALIGN FIX - Waveform and Spectrum on top, on the same clock as the decoder lanes, so a short
// block or a bitrate jump can be matched to the sound that caused it. At Frames zoom the frame
// edges run down through them as faint lines.
const ROWS = {
  wave: { y: 0, h: 56 }, spec: { y: 62, h: 84 },
  rate: { y: 154, h: 70 }, blocks: { y: 230, h: 14 }, gain: { y: 250, h: 30 }, third: { y: 286, h: 22 }, loud: { y: 316, h: 26 }, axis: { y: 348, h: 14 },
};
const HEIGHT = 362;
let tiles: HTMLCanvasElement[] = [];
watch(() => props.view, v => { tiles = v ? spectrumTiles(v) : []; }, { immediate: true });
/** Block colours by kind: long (quiet), start / stop (amber), short (accent). */
const BLOCK_PRIORITY = [1, 2, 3, 2];
const cv = ref<HTMLCanvasElement | null>(null);
const width = ref(0);
let ro: ResizeObserver | null = null;
const dragRange = ref<[number, number] | null>(null);

const view = computed<[number, number]>(() => {
  if (props.zoom === 'all') return [props.range.a, props.range.b];
  if (props.zoom === 'frames') return [props.t - 1, props.t + 1];
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

  // Waveform: min/max per screen pixel from the fine envelope.
  const env = props.envelope, W = ROWS.wave;
  if (env) {
    const mid = W.y + W.h / 2;
    g.fillStyle = C.sub;
    for (let x = 0; x < w; x++) {
      const k0 = Math.max(0, Math.floor((v0 + (x / w) * (v1 - v0)) * env.rate)), k1 = Math.min(env.max.length, Math.ceil((v0 + ((x + 1) / w) * (v1 - v0)) * env.rate));
      let lo = 0, hi = 0;
      for (let k = k0; k < Math.max(k1, k0 + 1) && k < env.max.length; k++) { if (env.min[k] < lo) lo = env.min[k]; if (env.max[k] > hi) hi = env.max[k]; }
      g.fillRect(x, mid - hi * (W.h / 2), 1, Math.max(1, (hi - lo) * (W.h / 2)));
    }
  } else { g.fillStyle = C.mute; g.fillText('Reading audio…', 8, W.y + W.h / 2); }

  // Spectrum: the same tiles as Explore, sliced to the view.
  const sp = props.view, P = ROWS.spec;
  if (sp && tiles.length) {
    const f0 = Math.max(0, v0 * sp.fps), f1 = Math.min(sp.frames, v1 * sp.fps);
    g.imageSmoothingEnabled = props.zoom !== 'frames'; // at frame zoom, crisp columns line up with frames
    for (let ti = Math.floor(f0 / SPEC_TILE); ti <= Math.floor((f1 - 1) / SPEC_TILE) && ti < tiles.length; ti++) {
      const t0 = ti * SPEC_TILE, a = Math.max(f0, t0), b = Math.min(f1, t0 + tiles[ti].width);
      if (b <= a) continue;
      g.drawImage(tiles[ti], a - t0, 0, b - a, sp.bands, X(a / sp.fps), P.y, X(b / sp.fps) - X(a / sp.fps), P.h);
    }
    g.imageSmoothingEnabled = true;
    g.font = '600 10px ' + font;
    for (const [hz, label] of spectrumLabels(sp.kind)) {
      const yy = P.y + P.h - (bandForHz(sp, hz) + 0.5) / sp.bands * P.h;
      g.fillStyle = 'rgba(14,14,16,0.72)'; g.fillRect(2, yy - 7, 40, 13);
      g.fillStyle = C.ink; g.fillText(label, 5, yy + 3);
    }
    g.font = '10px ' + font;
  } else { g.fillStyle = C.mute; g.fillText('Reading audio…', 8, P.y + P.h / 2); }

  // Frame edges through waveform and spectrum (Frames zoom only).
  const fe = props.bitrate?.frames;
  if (props.zoom === 'frames' && fe) {
    let i0 = Math.max(0, frameAt(fe, v0)), i1 = frameAt(fe, v1);
    if (i1 < 0) i1 = fe.t.length - 1;
    g.fillStyle = 'rgba(255,255,255,0.10)';
    for (let i = i0; i <= i1; i++) g.fillRect(Math.round(X(fe.t[i])), W.y, 1, P.y + P.h - W.y);
    // Short blocks / windows tint their frame across the waveform and spectrum.
    const d = fe.dec;
    if (d) for (let i = i0; i <= i1; i++) if (d.block[i] === 2) {
      g.fillStyle = C.accent; g.globalAlpha = 0.12;
      g.fillRect(X(fe.t[i]), W.y, X(fe.t[i] + fe.dur[i]) - X(fe.t[i]), P.y + P.h - W.y);
      g.globalAlpha = 1;
    }
  }

  const br = props.bitrate, R = ROWS.rate;
  g.font = '10px ' + font;
  if (!br) { g.fillStyle = C.mute; g.fillText('Reading the file…', 8, R.y + R.h / 2); }
  else if (props.zoom === 'frames' && br.frames) {
    // FRAME FIX - one bar per frame / packet / page; height = its bytes on this window's scale.
    const f = br.frames, now = frameAt(f, props.t);
    let i0 = Math.max(0, frameAt(f, v0)), i1 = frameAt(f, v1);
    if (i1 < 0) i1 = f.t.length - 1;
    let maxB = 1;
    for (let i = i0; i <= i1; i++) maxB = Math.max(maxB, f.size[i]);
    for (let i = i0; i <= i1; i++) {
      const x0 = X(f.t[i]), x1 = X(f.t[i] + f.dur[i]), hgt = (f.size[i] / maxB) * (R.h - 14);
      g.fillStyle = i === now ? C.accent : C.sub;
      g.globalAlpha = i === now ? 1 : 0.55;
      g.fillRect(x0 + 0.5, R.y + R.h - hgt, Math.max(1, x1 - x0 - 1), hgt);
    }
    g.globalAlpha = 1; g.fillStyle = C.mute;
    g.fillText(`${maxB} B`, 4, R.y + 10);
    g.fillText(`${i1 - i0 + 1} ${f.unit === 'page' ? 'pages' : f.unit === 'sample' ? 'packets' : 'frames'} in 2 s`, w - 110, R.y + 10);
  } else {
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

  // Decoder lanes: one value per screen pixel (the strongest block, the mean gain …).
  const fr = br?.frames, dec = fr?.dec;
  if (fr && dec) {
    let i0 = Math.max(0, frameAt(fr, v0)), i1 = frameAt(fr, v1);
    if (i1 < 0) i1 = fr.t.length - 1;
    const cols = Math.ceil(w), blk = new Uint8Array(cols), gSum = new Float32Array(cols), gN = new Uint16Array(cols);
    const tSum = new Float32Array(cols), tN = new Uint16Array(cols);
    for (let i = i0; i <= i1; i++) {
      const xa = Math.max(0, Math.floor(X(fr.t[i]))), xb = Math.min(cols - 1, Math.max(xa, Math.ceil(X(fr.t[i] + fr.dur[i])) - 1));
      for (let x = xa; x <= xb; x++) {
        if (dec.block[i] < 4) blk[x] = Math.max(blk[x], BLOCK_PRIORITY[dec.block[i]]);
        if (dec.gain[i] !== 255) { gSum[x] += dec.gain[i]; gN[x]++; }
        const third = dec.codec === 'mp3' ? dec.reservoir[i] : dec.shape[i] === 255 ? -1 : dec.shape[i];
        if (third >= 0) { tSum[x] += third; tN[x]++; }
      }
    }
    const B = ROWS.blocks;
    for (let x = 0; x < cols; x++) {
      if (!blk[x]) continue;
      g.fillStyle = blk[x] === 3 ? C.accent : blk[x] === 2 ? '#c9a25a' : C.line;
      g.fillRect(x, B.y + (blk[x] === 1 ? 5 : 0), 1, blk[x] === 1 ? 4 : B.h);
    }
    const curve = (row: { y: number; h: number }, sum: Float32Array, cnt: Uint16Array, color: string) => {
      let lo = Infinity, hi = -Infinity;
      for (let x = 0; x < cols; x++) if (cnt[x]) { const v = sum[x] / cnt[x]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (!(hi > lo)) { hi = lo + 1; }
      g.strokeStyle = color; g.lineWidth = 1.25; g.beginPath();
      let started = false;
      for (let x = 0; x < cols; x++) {
        if (!cnt[x]) continue;
        const yy = row.y + row.h - ((sum[x] / cnt[x] - lo) / (hi - lo)) * (row.h - 2) - 1;
        if (!started) { g.moveTo(x, yy); started = true; } else g.lineTo(x, yy);
      }
      g.stroke(); g.lineWidth = 1;
      return [lo, hi];
    };
    const [glo, ghi] = curve(ROWS.gain, gSum, gN, C.ink);
    g.fillStyle = C.mute; g.fillText(`${Math.round(ghi)}`, 4, ROWS.gain.y + 9); g.fillText(`${Math.round(glo)}`, 4, ROWS.gain.y + ROWS.gain.h - 2);
    const T = ROWS.third;
    if (dec.codec === 'mp3') {
      const [, rhi] = curve(T, tSum, tN, C.sub);
      g.fillStyle = C.mute; g.fillText(`${Math.round(rhi)} B`, 4, T.y + 9);
    } else {
      // Window shape: KBD lit, sine dim (the share of KBD frames under each pixel).
      for (let x = 0; x < cols; x++) {
        if (!tN[x]) continue;
        const kbd = tSum[x] / tN[x];
        g.fillStyle = kbd > 0.5 ? C.accent : C.line; g.globalAlpha = kbd > 0.5 ? 0.35 + 0.65 * kbd : 1;
        g.fillRect(x, T.y + 6, 1, T.h - 12);
      }
      g.globalAlpha = 1;
    }
  } else if (br) {
    g.fillStyle = C.mute;
    g.fillText(br.codec === 'MP3' || br.codec === 'AAC' ? 'Reading the bitstream…' : 'No decoder fields for ' + br.codec, 8, ROWS.gain.y + 18);
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

watch(() => [props.t, props.zoom, props.bitrate, props.loud, props.envelope, props.view, props.range.a, props.range.b, props.sel?.a, props.sel?.b, dragRange.value], () => requestAnimationFrame(draw));
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
      <div class="l" :style="{ top: ROWS.wave.y + 'px', height: ROWS.wave.h + 'px' }"><span>Waveform</span></div>
      <div class="l" :style="{ top: ROWS.spec.y + 'px', height: ROWS.spec.h + 'px' }"><span>Spectrum<small v-if="$props.view">{{ $props.view.kind === 'cqt' ? 'CQT' : $props.view.kind === 'linear' ? 'Linear' : 'Mel' }}</small></span></div>
      <div class="l" :style="{ top: ROWS.rate.y + 'px', height: ROWS.rate.h + 'px' }">
        <span>Bitrate<small v-if="bitrate">{{ bitrate.codec }} {{ bitrate.mode }}{{ bitrate.exact ? '' : ' · average' }}</small></span>
      </div>
      <div class="l" :style="{ top: ROWS.blocks.y + 'px', height: ROWS.blocks.h + 'px' }"><span>Blocks</span></div>
      <div class="l" :style="{ top: ROWS.gain.y + 'px', height: ROWS.gain.h + 'px' }"><span>Gain<small>global gain</small></span></div>
      <div class="l" :style="{ top: ROWS.third.y + 'px', height: ROWS.third.h + 'px' }"><span>{{ bitrate?.frames?.dec?.codec === 'aac' ? 'Shape' : 'Reservoir' }}<small>{{ bitrate?.frames?.dec?.codec === 'aac' ? 'KBD lit · sine dim' : 'main_data_begin' }}</small></span></div>
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
