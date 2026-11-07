<script setup lang="ts">
/**
 * Nerds at a glance: three cards instead of lines of text, all following the selection.
 *   Now           the frame under the playhead: its size against the file's largest, block /
 *                 window, shape, M/S, gain, and where it sits in the file
 *   This passage  frames, average kbps, bytes; a histogram of frame sizes; the block mix as one
 *                 bar; transients (runs of short blocks)
 *   File          codec, profile, CBR / VBR, rate, channels, gapless skip, declared bitrate
 */
import { computed } from 'vue';
import { frameAt, framesIn, frameSummary, rangeStats, mp3Header, type BitrateInfo } from '../../core/bitrate';
import { BLOCK_NAMES, blockMix, sizeHistogram, transients } from '../../core/bitstream';
import { bytes } from '../../core/nerdStats';

const props = defineProps<{ bitrate: BitrateInfo | null; t: number; range: { a: number; b: number }; isPassage: boolean }>();

const f = computed(() => props.bitrate?.frames ?? null);
const fileMax = computed(() => (f.value ? frameSummary(f.value).maxBytes : 1));
const unit = computed(() => (f.value?.unit === 'page' ? 'page' : f.value?.unit === 'sample' ? 'packet' : 'frame'));

const now = computed(() => {
  const fr = f.value;
  if (!fr) return null;
  const i = frameAt(fr, props.t);
  if (i < 0) return null;
  const d = fr.dec, last = fr.t.length - 1;
  const fileEnd = fr.offset[last] + fr.size[last];
  const block = d && d.block[i] < 4 ? BLOCK_NAMES[d.block[i]] : null;
  const hdr = fr.hdr[i] ? mp3Header(fr.hdr[i]) : null;
  const ms = d ? (d.codec === 'mp3' ? (d.ms[i] === 1 ? 'M/S' : hdr?.mode === 'joint stereo' ? 'L/R' : null) : d.ms[i] === 2 ? 'M/S all' : d.ms[i] === 1 ? 'M/S bands' : d.ms[i] === 0 ? 'L/R' : null) : null;
  return {
    n: i + 1, of: fr.t.length, size: fr.size[i], pct: (fr.size[i] / fileMax.value) * 100,
    ms: (fr.dur[i] * 1000).toFixed(2), kbps: fr.kbps[i] || Math.round(fr.size[i] * 8 / fr.dur[i] / 1000),
    pos: fr.offset[i] && fileEnd ? (fr.offset[i] / fileEnd) * 100 : null, offset: fr.offset[i],
    block, shape: d?.codec === 'aac' && d.shape[i] < 2 ? (d.shape[i] ? 'KBD' : 'sine') : null, stereo: ms,
    gain: d && d.gain[i] !== 255 ? d.gain[i] : null, crc: hdr ? hdr.crc : null, padded: hdr?.padding ?? null,
  };
});

const passage = computed(() => {
  const fr = f.value, br = props.bitrate;
  if (!fr || !br) return null;
  const x = framesIn(fr, props.range.a, props.range.b);
  if (!x) return null;
  const st = rangeStats(br, props.range.a, props.range.b);
  const hist = sizeHistogram(fr.size, x.first, x.last);
  const top = Math.max(1, ...hist.counts);
  const mix = fr.dec ? blockMix(fr.dec, x.first, x.last) : null;
  return {
    count: x.count, first: x.first + 1, last: x.last + 1, kbps: st?.avg ?? null, bytes: bytes(x.bytes),
    hist: hist.counts.map(c => c / top), lo: hist.lo, hi: hist.hi,
    mix: mix && mix.known ? BLOCK_NAMES.map(k => ({ k, v: mix[k] })) : null,
    hits: fr.dec ? transients(fr.dec, x.first, x.last) : null,
  };
});

const file = computed(() => {
  const br = props.bitrate;
  if (!br) return [];
  const chips = [br.codec, br.profile, br.mode === 'PCM' ? 'uncompressed' : br.mode,
    br.sampleRate ? (br.sampleRate / 1000).toFixed(br.sampleRate % 1000 ? 1 : 0) + ' kHz' : '',
    br.channels === 1 ? 'mono' : br.channels === 2 ? 'stereo' : br.channels ? br.channels + ' ch' : '',
    'avg ' + br.avgKbps + ' kbps',
    br.declaredMaxKbps ? `declared ${br.declaredAvgKbps ?? '?'} / max ${br.declaredMaxKbps} kbps` : '',
    f.value?.skipSec ? `gapless skip ${(f.value.skipSec * 1000).toFixed(1)} ms` : '',
    f.value ? `${frameSummary(f.value).count.toLocaleString('en')} ${unit.value}s × ${frameSummary(f.value).durMs.toFixed(1)} ms` : ''];
  return chips.filter(Boolean) as string[];
});
</script>

<template>
  <div class="cards">
    <section class="card" aria-label="Frame under the playhead">
      <h3 class="ct">Now</h3>
      <template v-if="now">
        <div class="big">{{ unit }} <b>{{ now.n.toLocaleString('en') }}</b><span class="of"> / {{ now.of.toLocaleString('en') }}</span></div>
        <div class="meter" :title="now.size + ' B of the largest ' + fileMax + ' B'"><i :style="{ width: now.pct + '%' }"></i></div>
        <div class="row2"><span>{{ now.size }} B</span><span>{{ now.kbps }} kbps</span><span>{{ now.ms }} ms</span></div>
        <div class="chips">
          <span v-if="now.block" class="chip" :class="'b-' + now.block">{{ now.block }}</span>
          <span v-if="now.shape" class="chip">{{ now.shape }}</span>
          <span v-if="now.stereo" class="chip">{{ now.stereo }}</span>
          <span v-if="now.gain !== null" class="chip">gain {{ now.gain }}</span>
          <span v-if="now.padded" class="chip dim">padded</span>
          <span v-if="now.crc !== null" class="chip dim">{{ now.crc ? 'CRC' : 'no CRC' }}</span>
        </div>
        <div v-if="now.pos !== null" class="filepos" :title="'byte ' + Math.round(now.offset).toLocaleString('en')"><i :style="{ left: now.pos + '%' }"></i></div>
        <div v-if="now.pos !== null" class="cap">in the file · byte {{ Math.round(now.offset).toLocaleString('en') }}</div>
      </template>
      <p v-else class="cap">Press play to inspect frames.</p>
    </section>

    <section class="card" :aria-label="isPassage ? 'This passage' : 'Whole song'">
      <h3 class="ct">{{ isPassage ? 'This passage' : 'Whole song' }}</h3>
      <template v-if="passage">
        <div class="tiles">
          <div><b>{{ passage.count.toLocaleString('en') }}</b><span>{{ unit }}s</span></div>
          <div v-if="passage.kbps"><b>{{ passage.kbps }}</b><span>kbps avg</span></div>
          <div><b>{{ passage.bytes }}</b><span>in the file</span></div>
          <div v-if="passage.hits !== null"><b>{{ passage.hits }}</b><span>transients</span></div>
        </div>
        <div class="hist" :title="'frame sizes ' + passage.lo + '–' + passage.hi + ' B'">
          <i v-for="(h, k) in passage.hist" :key="k" :style="{ height: Math.max(2, h * 100) + '%' }"></i>
        </div>
        <div class="cap between"><span>{{ passage.lo }} B</span><span>frame sizes</span><span>{{ passage.hi }} B</span></div>
        <template v-if="passage.mix">
          <div class="mix"><i v-for="m in passage.mix" :key="m.k" :class="'b-' + m.k" :style="{ width: m.v * 100 + '%' }"></i></div>
          <div class="legend">
            <span v-for="m in passage.mix" :key="m.k"><i :class="'b-' + m.k"></i>{{ m.k }} {{ (m.v * 100).toFixed(m.v < 0.1 ? 1 : 0) }}%</span>
          </div>
        </template>
      </template>
      <p v-else class="cap">Reading the file…</p>
    </section>

    <section class="card" aria-label="File">
      <h3 class="ct">File</h3>
      <div class="chips"><span v-for="c in file" :key="c" class="chip">{{ c }}</span></div>
    </section>
  </div>
</template>

<style scoped>
.cards { display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: var(--space-3); margin-top: var(--space-3); font-variant-numeric: tabular-nums; }
.card { border: 1px solid var(--line); border-radius: var(--radius-md); padding: var(--space-3); display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ct { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-sub); }
.big { font-size: 13px; color: var(--ink-sub); }
.big b { font-size: 22px; font-weight: 600; color: var(--ink); }
.of { color: var(--ink-mute); }
.meter { height: 6px; border-radius: 3px; background: var(--bg-raise); overflow: hidden; }
.meter i { display: block; height: 100%; background: var(--accent); }
.row2 { display: flex; gap: 12px; font-size: 12px; color: var(--ink-sub); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { height: 22px; padding: 0 9px; border: 1px solid var(--line-strong); border-radius: var(--radius-pill); font-size: 12px; line-height: 20px; color: var(--ink-sub); white-space: nowrap; }
.chip.dim { color: var(--ink-mute); border-color: var(--line); }
.chip.b-short { color: var(--accent); border-color: var(--accent); }
.chip.b-start, .chip.b-stop { color: #c9a25a; border-color: #c9a25a; }
.filepos { position: relative; height: 4px; border-radius: 2px; background: var(--bg-raise); }
.filepos i { position: absolute; top: -3px; width: 2px; height: 10px; background: var(--ink); }
.cap { margin: 0; font-size: 11px; color: var(--ink-mute); }
.between { display: flex; justify-content: space-between; }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.tiles div { display: flex; flex-direction: column; }
.tiles b { font-size: 17px; font-weight: 600; color: var(--ink); }
.tiles span { font-size: 11px; color: var(--ink-mute); }
.hist { display: flex; align-items: flex-end; gap: 2px; height: 42px; }
.hist i { flex: 1; background: var(--ink-sub); opacity: 0.6; border-radius: 1px 1px 0 0; }
.mix { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--bg-raise); }
.mix i { display: block; height: 100%; }
.b-long { background: var(--line-strong); }
.b-start, .b-stop { background: #c9a25a; }
.b-short { background: var(--accent); }
.legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: var(--ink-sub); }
.legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; vertical-align: 0; }
.chip.b-short, .chip.b-start, .chip.b-stop { background: none; }
@media (max-width: 900px) { .cards { grid-template-columns: 1fr; } }
</style>
