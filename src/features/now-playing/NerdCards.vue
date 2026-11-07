<script setup lang="ts">
/**
 * Nerds at a glance, as one analysis panel in three columns (Now · This passage · File):
 * aligned label / value rows with tabular numbers, and only the visuals that carry
 * information — the frame's place in the file, the block mix, and the frame-size spread when
 * sizes actually vary (a CBR file says "constant" instead of drawing one bar).
 * Block / window kinds use the Blocks lane's colours: long (grey), start / stop (amber), short.
 */
import { computed } from 'vue';
import { frameAt, framesIn, frameSummary, rangeStats, mp3Header, type BitrateInfo } from '../../core/bitrate';
import { BLOCK_NAMES, blockMix, sizeHistogram, transients } from '../../core/bitstream';
import { bytes } from '../../core/nerdStats';

const props = defineProps<{ bitrate: BitrateInfo | null; t: number; range: { a: number; b: number }; isPassage: boolean;
  /** Timing corrections behind the lanes (output latency, priming, spectrum centring). */
  alignment?: { k: string; v: string }[] }>();

type Row = { k: string; v: string; mark?: string };
const f = computed(() => props.bitrate?.frames ?? null);
const unit = computed(() => (f.value?.unit === 'page' ? 'Page' : f.value?.unit === 'sample' ? 'Packet' : 'Frame'));
const n = (x: number) => x.toLocaleString('en');
const BLOCK_LABEL: Record<string, string> = { long: 'Long', start: 'Start', short: 'Short', stop: 'Stop' };
const WINDOW_LABEL: Record<string, string> = { long: 'Only long', start: 'Long start', short: 'Eight short', stop: 'Long stop' };

const now = computed(() => {
  const fr = f.value;
  if (!fr) return null;
  const i = frameAt(fr, props.t);
  if (i < 0) return null;
  const d = fr.dec, last = fr.t.length - 1, fileEnd = fr.offset[last] + fr.size[last];
  const rows: Row[] = [
    { k: 'Size', v: `${n(fr.size[i])} B` },
    { k: 'Bitrate', v: `${fr.kbps[i] || Math.round(fr.size[i] * 8 / fr.dur[i] / 1000)} kbps` },
    { k: 'Duration', v: `${(fr.dur[i] * 1000).toFixed(2)} ms` },
    { k: 'Starts', v: `${fr.t[i].toFixed(3)} s` },
  ];
  if (fr.offset[i]) rows.push({ k: 'Offset', v: n(Math.round(fr.offset[i])) });
  if (d) {
    const kind = d.block[i] < 4 ? BLOCK_NAMES[d.block[i]] : null;
    if (kind) rows.push({ k: d.codec === 'aac' ? 'Window' : 'Block', v: (d.codec === 'aac' ? WINDOW_LABEL : BLOCK_LABEL)[kind], mark: kind });
    if (d.codec === 'aac' && d.shape[i] < 2) rows.push({ k: 'Shape', v: d.shape[i] ? 'KBD' : 'Sine' });
    if (d.gain[i] !== 255) rows.push({ k: 'Global gain', v: String(d.gain[i]) });
    if (d.codec === 'aac' && d.bits[i]) rows.push({ k: 'max_sfb', v: String(d.bits[i]) });
    if (d.codec === 'mp3') rows.push({ k: 'Reservoir', v: `${d.reservoir[i]} B` });
  }
  const hdr = fr.hdr[i] ? mp3Header(fr.hdr[i]) : null;
  if (hdr) {
    rows.push({ k: 'Stereo', v: String(hdr.mode).replace(/^./, c => c.toUpperCase()) + (hdr.modeExt ? ` · ${hdr.modeExt}` : '') });
    rows.push({ k: 'Padding · CRC', v: `${hdr.padding ? 'yes' : 'no'} · ${hdr.crc ? 'yes' : 'no'}` });
  } else if (d?.codec === 'aac' && d.ms[i] !== 255) {
    rows.push({ k: 'M/S', v: ['Off', 'Per band', 'All bands', '—'][d.ms[i]] });
  }
  return { index: i + 1, of: fr.t.length, pos: fileEnd ? (fr.offset[i] / fileEnd) * 100 : null, rows };
});

const passage = computed(() => {
  const fr = f.value, br = props.bitrate;
  if (!fr || !br) return null;
  const x = framesIn(fr, props.range.a, props.range.b);
  if (!x) return null;
  const st = rangeStats(br, props.range.a, props.range.b);
  const hist = x.min === x.max ? null : sizeHistogram(fr.size, x.first, x.last, 32);
  const top = hist ? Math.max(1, ...hist.counts) : 1;
  const mix = fr.dec ? blockMix(fr.dec, x.first, x.last) : null;
  return {
    stats: [
      { k: unit.value + 's', v: n(x.count) },
      { k: 'kbps avg', v: st ? String(st.avg) : '—' },
      { k: 'in the file', v: bytes(x.bytes) },
      ...(fr.dec ? [{ k: 'transients', v: String(transients(fr.dec, x.first, x.last)) }] : []),
    ],
    range: `${n(x.first + 1)}–${n(x.last + 1)}`,
    sizes: x.min === x.max ? `${n(x.min)} B, constant` : `${n(x.min)}–${n(x.max)} B · avg ${n(x.avg)} B`,
    hist: hist ? hist.counts.map(c => c / top) : null,
    mix: mix && mix.known ? BLOCK_NAMES.map(k => ({ k, v: mix[k] })) : null,
    windowWord: fr.dec?.codec === 'aac' ? 'Windows' : 'Blocks',
  };
});

const file = computed<Row[]>(() => {
  const br = props.bitrate, fr = f.value;
  if (!br) return [];
  const hdr = fr?.hdr[0] ? mp3Header(fr.hdr[0]) : null;
  const rows: Row[] = [
    { k: 'Codec', v: br.profile ?? (hdr ? `${br.codec} · ${hdr.version} ${hdr.layer}` : br.codec) },
    { k: 'Container', v: br.container },
    { k: 'Mode', v: br.mode === 'PCM' ? 'Uncompressed' : br.mode },
    { k: 'Bitrate', v: `${br.avgKbps} kbps avg` + (br.declaredMaxKbps ? ` · max ${br.declaredMaxKbps}` : '') },
  ];
  if (br.sampleRate) rows.push({ k: 'Sample rate', v: `${(br.sampleRate / 1000).toFixed(br.sampleRate % 1000 ? 1 : 0)} kHz` });
  if (br.channels) rows.push({ k: 'Channels', v: br.channels === 1 ? 'Mono' : br.channels === 2 ? 'Stereo' : `${br.channels}` });
  if (fr) { const s = frameSummary(fr); rows.push({ k: unit.value + 's', v: `${n(s.count)} × ${s.durMs.toFixed(1)} ms` }); }
  if (fr?.skipSec) rows.push({ k: 'Gapless skip', v: `${(fr.skipSec * 1000).toFixed(1)} ms` });
  rows.push({ k: 'Duration', v: `${Math.floor(br.durationSec / 60)}:${(br.durationSec % 60).toFixed(2).padStart(5, '0')}` });
  return rows;
});
</script>

<template>
  <div class="panel" role="group" aria-label="Frame, passage and file">
    <section class="col" aria-label="Frame under the playhead">
      <header class="h"><span class="t">Now</span><span v-if="now" class="id">{{ unit }} {{ n(now.index) }} <span class="mute">of {{ n(now.of) }}</span></span></header>
      <template v-if="now">
        <div v-if="now.pos !== null" class="track" :title="'position in the file'"><i :style="{ left: now.pos + '%' }"></i></div>
        <dl>
          <template v-for="r in now.rows" :key="r.k">
            <dt>{{ r.k }}</dt>
            <dd><i v-if="r.mark" class="sq" :class="'b-' + r.mark"></i>{{ r.v }}</dd>
          </template>
        </dl>
      </template>
      <p v-else class="empty">Play the song to inspect the frame under the playhead.</p>
    </section>

    <section class="col" :aria-label="isPassage ? 'This passage' : 'Whole song'">
      <header class="h"><span class="t">{{ isPassage ? 'This passage' : 'Whole song' }}</span><span v-if="passage" class="id mute">{{ unit.toLowerCase() }}s {{ passage.range }}</span></header>
      <template v-if="passage">
        <div class="stats">
          <div v-for="s in passage.stats" :key="s.k"><span class="num">{{ s.v }}</span><span class="unit">{{ s.k }}</span></div>
        </div>
        <dl>
          <dt>Sizes</dt><dd>{{ passage.sizes }}</dd>
        </dl>
        <div v-if="passage.hist" class="hist" aria-label="frame size distribution"><i v-for="(h, k) in passage.hist" :key="k" :style="{ height: Math.max(1, h * 100) + '%' }"></i></div>
        <template v-if="passage.mix">
          <div class="mixh"><span>{{ passage.windowWord }}</span></div>
          <div class="mix"><i v-for="m in passage.mix" :key="m.k" :class="'b-' + m.k" :style="{ width: m.v * 100 + '%' }"></i></div>
          <dl class="mixrows">
            <template v-for="m in passage.mix" :key="m.k">
              <dt><i class="sq" :class="'b-' + m.k"></i>{{ BLOCK_LABEL[m.k] }}</dt>
              <dd>{{ (m.v * 100).toFixed(1) }} %</dd>
            </template>
          </dl>
        </template>
      </template>
      <p v-else class="empty">Reading the file…</p>
    </section>

    <section class="col" aria-label="File">
      <header class="h"><span class="t">File</span></header>
      <dl>
        <template v-for="r in file" :key="r.k"><dt>{{ r.k }}</dt><dd>{{ r.v }}</dd></template>
      </dl>
      <template v-if="alignment?.length">
        <header class="h sub"><span class="t">Alignment</span></header>
        <dl>
          <template v-for="r in alignment" :key="r.k"><dt>{{ r.k }}</dt><dd>{{ r.v }}</dd></template>
        </dl>
      </template>
    </section>
  </div>
</template>

<style scoped>
.panel {
  display: grid; grid-template-columns: 1fr 1.15fr 1fr; margin-top: var(--space-3);
  border: 1px solid var(--line); border-radius: var(--radius-sm); font-variant-numeric: tabular-nums;
}
.col { padding: 12px 16px 14px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.col + .col { border-left: 1px solid var(--line); }
.h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; height: 18px; }
.t { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-sub); }
.id { font-size: 12px; color: var(--ink); white-space: nowrap; }
.mute { color: var(--ink-mute); }
.h.sub { margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--line); height: auto; }
dl { margin: 0; display: grid; grid-template-columns: auto 1fr; column-gap: 16px; row-gap: 5px; font-size: 12px; line-height: 1.35; }
dt { color: var(--ink-mute); white-space: nowrap; display: flex; align-items: center; }
dd { margin: 0; color: var(--ink); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sq { display: inline-block; width: 7px; height: 7px; border-radius: 1px; margin-right: 6px; vertical-align: 0; flex: none; }
.track { position: relative; height: 3px; background: var(--line); border-radius: 2px; }
.track i { position: absolute; top: -3px; width: 1px; height: 9px; background: var(--ink); }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding-bottom: 2px; border-bottom: 1px solid var(--line); }
.stats div { display: flex; flex-direction: column; padding-bottom: 8px; }
.num { font-size: 18px; font-weight: 500; color: var(--ink); line-height: 1.2; }
.unit { font-size: 11px; color: var(--ink-mute); }
.hist { display: flex; align-items: flex-end; gap: 1px; height: 28px; }
.hist i { flex: 1; background: var(--ink-mute); }
.mixh { font-size: 12px; color: var(--ink-mute); margin-bottom: -4px; }
.mix { display: flex; height: 4px; background: var(--line); overflow: hidden; }
.mix i { display: block; height: 100%; }
.mixrows { grid-template-columns: auto 1fr auto 1fr; }
.b-long { background: var(--line-strong); }
.b-start, .b-stop { background: #c9a25a; }
.b-short { background: var(--accent); }
.empty { margin: 0; font-size: 12px; color: var(--ink-mute); }
@media (max-width: 900px) { .panel { grid-template-columns: 1fr; } .col + .col { border-left: 0; border-top: 1px solid var(--line); } }
</style>
