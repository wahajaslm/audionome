<script setup lang="ts">
/**
 * Coded spectrum of one AAC channel (frame inspector): what the encoder kept, against the
 * signal at that moment.
 *   bars     |quantised value| per spectral line, log scale (0 = nothing coded there)
 *   bands    scalefactor bands as columns, shaded by codebook; bands coded as zero are hatched
 *            (the encoder dropped them), bands above max_sfb are not coded at all
 *   line     the spectrogram column at the frame's time (the signal), on the same frequency axis
 * So a loud partial in the signal line with a hatched band under it = removed by the encoder.
 * Example: a 128 kbps AAC packet → lines coded up to ~16 kHz, bands above hatched or uncoded.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Channel } from '../../core/aacDecode';
import type { SpectrumView } from '../../core/spectrum';

const props = defineProps<{ ch: Channel; sampleRate: number; view: SpectrumView | null; t: number; window: number }>();
const H = 150;
const cv = ref<HTMLCanvasElement | null>(null);
const width = ref(0);
let ro: ResizeObserver | null = null;

/** Book colours: low books (small values) cool, high books (large values) warm, escape amber. */
const bookColour = (cb: number) => (cb === 11 ? '#c9a25a' : cb >= 9 ? '#a38c6b' : cb >= 5 ? '#7f9aa8' : '#6f8f88');

function draw(): void {
  const c = cv.value, w = width.value, ch = props.ch;
  if (!c || !w) return;
  const dpr = devicePixelRatio || 1;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext('2d')!, css = getComputedStyle(document.documentElement), col = (v: string) => css.getPropertyValue(v).trim();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, H);
  const short = ch.info.windowSequence === 2, lines = short ? 128 : 1024, nyq = props.sampleRate / 2;
  // Short windows: show the chosen window (0..7) of the eight.
  const groupOf = (win: number) => { let s = 0; for (let k = 0; k < ch.info.groupLengths.length; k++) { if (win < s + ch.info.groupLengths[k]) return { g: k, first: s }; s += ch.info.groupLengths[k]; } return { g: 0, first: 0 }; };
  const { g: grp, first } = short ? groupOf(props.window) : { g: 0, first: 0 };
  const glen = ch.info.groupLengths[grp], inGroup = short ? props.window - first : 0;
  let groupStart = 0;
  for (let k = 0; k < grp; k++) groupStart += ch.info.groupLengths[k] * 128;
  const X = (line: number) => (line / lines) * w, top = 8, base = H - 16;
  // value of line j of the chosen window
  const valueAt = (j: number) => {
    if (!short) return ch.spectrum[j];
    let band = 0;
    while (band < ch.swb.length - 1 && ch.swb[band + 1] <= j) band++;
    if (band >= ch.info.maxSfb) return 0;
    let at = groupStart;
    for (let b = 0; b < band; b++) at += (ch.swb[b + 1] - ch.swb[b]) * glen;
    const bw = ch.swb[band + 1] - ch.swb[band];
    return ch.spectrum[at + inGroup * bw + (j - ch.swb[band])];
  };
  let maxQ = 1;
  for (let j = 0; j < lines; j++) maxQ = Math.max(maxQ, Math.abs(valueAt(j)));
  const Y = (q: number) => base - (Math.log1p(Math.abs(q)) / Math.log1p(maxQ)) * (base - top);
  // bands
  for (let b = 0; b < ch.swb.length - 1; b++) {
    const x0 = X(ch.swb[b]), x1 = X(ch.swb[b + 1]);
    if (b >= ch.info.maxSfb) { g.fillStyle = col('--bg-raise'); g.globalAlpha = 0.5; g.fillRect(x0, top, x1 - x0, base - top); g.globalAlpha = 1; continue; }
    const cb = ch.sectionCb[grp][b];
    if (cb === 0) {
      g.save(); g.beginPath(); g.rect(x0, top, x1 - x0, base - top); g.clip();
      g.strokeStyle = col('--line-strong'); g.lineWidth = 1;
      for (let x = x0 - H; x < x1; x += 5) { g.beginPath(); g.moveTo(x, base); g.lineTo(x + (base - top), top); g.stroke(); }
      g.restore();
    } else { g.fillStyle = bookColour(cb); g.globalAlpha = 0.12; g.fillRect(x0, top, x1 - x0, base - top); g.globalAlpha = 1; }
    g.fillStyle = col('--line'); g.fillRect(Math.round(x0), top, 1, base - top);
  }
  // quantised values
  g.fillStyle = col('--ink');
  const step = Math.max(1, lines / w);
  for (let x = 0; x < w; x++) {
    let q = 0;
    for (let j = Math.floor(x * step); j < Math.min(lines, Math.floor((x + 1) * step) + (step < 1 ? 1 : 0)); j++) q = Math.max(q, Math.abs(valueAt(j)));
    if (step < 1) q = Math.abs(valueAt(Math.floor((x / w) * lines)));
    if (q) g.fillRect(x, Y(q), 1, base - Y(q));
  }
  // the signal: the spectrogram column at the frame's time, on the same Hz axis
  const sp = props.view;
  if (sp) {
    const f = Math.min(sp.frames - 1, Math.max(0, Math.round(props.t * sp.fps)));
    g.strokeStyle = col('--accent'); g.lineWidth = 1.25; g.beginPath();
    let started = false;
    for (let b = 0; b < sp.bands; b++) {
      const hz = sp.freqs[b];
      if (hz > nyq) break;
      const x = (hz / nyq) * w, y = base - (sp.data[f * sp.bands + b] / 255) * (base - top);
      if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
    }
    g.stroke(); g.lineWidth = 1;
  }
  // axis
  g.fillStyle = col('--ink-mute'); g.font = '10px ' + css.getPropertyValue('--font-sans');
  for (const khz of [1, 2, 5, 10, 15, 20]) {
    if (khz * 1000 > nyq) continue;
    const x = (khz * 1000 / nyq) * w;
    g.fillRect(x, base, 1, 3); g.fillText(khz + ' kHz', x + 2, H - 4);
  }
  g.fillText(`max |q| ${maxQ}`, 4, 9);
}
watch(() => [props.ch, props.view, props.t, props.window], () => requestAnimationFrame(draw));
onMounted(() => {
  ro = new ResizeObserver(([e]) => { width.value = e.contentRect.width; draw(); });
  if (cv.value) ro.observe(cv.value);
});
onBeforeUnmount(() => ro?.disconnect());
</script>

<template>
  <canvas ref="cv" class="cs" :style="{ height: H + 'px' }" aria-label="Coded spectrum of this channel against the signal"></canvas>
</template>

<style scoped>
.cs { display: block; width: 100%; }
</style>
