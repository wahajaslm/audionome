<script setup lang="ts">
/**
 * Frame inspector (Nerds): the frame you are hearing, opened up.
 *
 *   FRAME 10,700 of 22,591 · 255.073 s · 24.00 ms · 960 B · byte 10,252,751   ⏮10 ‹ ▶ frame ▶ ±2 › 10⏭
 *   Bytes      |prev frames▒▒▒|hdr|side|────── main data ──────|     ← layout of this frame's bytes
 *              └──── this frame's audio data (503 B borrowed) ────┘  ← where its Huffman data really is
 *   Bits       sync · version · layer · CRC · bitrate · rate · pad · … (each field named, bits shown)
 *   Side info  granule × channel: block, gain, bits, big_values, tables, regions …   (MP3)
 *   Channels   window, shape, max_sfb, groups, M/S, gain; eight-short grouping drawn (AAC)
 *   Hex        the first bytes, coloured by part
 *
 * The frame is the one under the playhead (picking a frame = moving the playhead: ← / → step,
 * Shift for 10). Its bytes are read from the file on demand, only this frame and what it borrows.
 */
import { computed, ref, watch } from 'vue';
import { frameAt, type BitrateInfo } from '../../core/bitrate';
import { aacFields, aacPacket, BLOCK_NAMES, mp3HeaderFields, mp3SideInfo, reservoirSource, type BitField } from '../../core/bitstream';

const props = defineProps<{ bitrate: BitrateInfo | null; t: number; playing: boolean; readBytes: (offset: number, length: number) => Promise<Uint8Array> }>();
const emit = defineEmits<{ step: [sec: number]; audition: [a: number, b: number, back: number] }>();

const f = computed(() => props.bitrate?.frames ?? null);
const index = computed(() => (f.value ? frameAt(f.value, props.t) : -1));
const codec = computed(() => f.value?.dec?.codec ?? (props.bitrate?.codec === 'MP3' ? 'mp3' : props.bitrate?.codec === 'AAC' ? 'aac' : null));
const unit = computed(() => (f.value?.unit === 'sample' ? 'Packet' : f.value?.unit === 'page' ? 'Page' : 'Frame'));
const n = (x: number) => x.toLocaleString('en');

// The frame's bytes (and, for MP3, the reservoir bytes before it), read when the frame changes.
const bytes = ref<Uint8Array | null>(null);
let want = -1, timer: ReturnType<typeof setTimeout> | null = null;
watch([index, () => props.playing], ([i]) => {
  if (timer) clearTimeout(timer);
  // While playing, read at most 4× a second; paused (stepping), at once.
  timer = setTimeout(async () => {
    const fr = f.value;
    if (!fr || i < 0 || !fr.offset[i]) { bytes.value = null; return; }
    want = i;
    const b = await props.readBytes(fr.offset[i], fr.size[i]);
    if (want === i) bytes.value = b;
  }, props.playing ? 250 : 0);
}, { immediate: true });

const frame = computed(() => {
  const fr = f.value, i = index.value;
  if (!fr || i < 0) return null;
  return { i, of: fr.t.length, t: fr.t[i], dur: fr.dur[i], size: fr.size[i], offset: fr.offset[i], hdr: fr.hdr[i] };
});

const side = computed(() => (codec.value === 'mp3' && bytes.value && frame.value?.hdr ? mp3SideInfo(bytes.value, frame.value.hdr) : null));
const aac = computed(() => (codec.value === 'aac' && bytes.value ? aacPacket(bytes.value) : null));
const fields = computed<BitField[]>(() => {
  if (codec.value === 'mp3' && frame.value?.hdr) return mp3HeaderFields(frame.value.hdr);
  if (codec.value === 'aac' && bytes.value) return aacFields(bytes.value);
  return [];
});
const fieldBits = computed(() => fields.value.reduce((s, x) => s + x.bits, 0));
/** The field under the pointer, in the bit strip and the table at once. */
const hot = ref(-1);

/** Byte map, as % of one scale that runs from the first borrowed byte to the frame's end. */
const map = computed(() => {
  const fr = frame.value;
  if (!fr) return null;
  if (side.value) {
    const back = side.value.mainDataBegin, total = back + fr.size;
    const P = (x: number) => (x / total) * 100;
    const head = side.value.headerBytes + side.value.crcBytes, sideB = side.value.sideBytes;
    const dataBytes = Math.ceil(side.value.granules.flat().reduce((s, g) => s + g.part23, 0) / 8);
    const src = f.value ? reservoirSource(f.value, fr.i, back) : null;
    return {
      parts: [
        ...(back ? [{ cls: 'prev', w: P(back), label: `${n(back)} B in ${src && src.from !== src.to ? `frames ${n(src.from + 1)}–${n(src.to + 1)}` : `frame ${n(fr.i)}`}` }] : []),
        { cls: 'hdr', w: P(head), label: `header ${head} B` },
        { cls: 'side', w: P(sideB), label: `side info ${sideB} B` },
        { cls: 'main', w: P(fr.size - head - sideB), label: `main data ${n(fr.size - head - sideB)} B` },
      ],
      // This frame's Huffman data starts `back` bytes before its main data begins.
      data: { left: 0, width: Math.min(100, P(dataBytes)), label: `this frame's audio data: ${n(dataBytes)} B${back ? `, starts ${n(back)} B back (bit reservoir)` : ''}` },
    };
  }
  if (aac.value) {
    const head = Math.ceil(fieldBits.value / 8), P = (x: number) => (x / fr.size) * 100;
    return {
      parts: [
        { cls: 'hdr', w: P(head), label: `element + window ${fieldBits.value} bits` },
        { cls: 'main', w: 100 - P(head), label: `section · scalefactors · spectral data ${n(fr.size - head)} B` },
      ],
      data: null,
    };
  }
  return null;
});

const BLOCK = ['long', 'start', 'short', 'stop'];
const granuleRows = computed(() => side.value?.granules.flatMap((chans, gr) => chans.map((g, ch) => ({
  key: `${gr}-${ch}`, where: `gr ${gr} · ${chans.length === 1 ? 'mono' : ch ? 'R' : 'L'}`,
  block: g.windowSwitching ? BLOCK[g.blockType] + (g.mixed ? ' (mixed)' : '') : 'long', kind: g.windowSwitching ? BLOCK[g.blockType] : 'long',
  gain: g.globalGain, bits: g.part23, big: g.bigValues, sfc: g.scalefacCompress, tables: g.tableSelect.join(' / '),
  regions: g.windowSwitching ? `${g.region0} / rest` : `${g.region0} / ${g.region1}`,
  sub: g.subblockGain.length ? g.subblockGain.join(' / ') : '—', flags: `${g.preflag ?? '–'} · ${g.scalefacScale} · ${g.count1table}`,
}))) ?? []);

const WIN = ['Only long', 'Long start', 'Eight short', 'Long stop'];
const aacRows = computed(() => aac.value?.channels.map((c, k) => ({
  key: k, ch: aac.value!.channels.length > 1 ? (k ? 'ch 2' : 'ch 1') : 'ch 1', win: WIN[c.windowSequence], kind: BLOCK_NAMES[c.windowSequence],
  shape: c.windowShape ? 'KBD' : 'Sine', sfb: c.maxSfb, groups: c.groups, gain: c.globalGain ?? (k ? 'after ch 1 data' : '—'),
})) ?? []);
/** Eight-short windows and their groups: a 0 in the grouping starts a new group. */
const shortGroups = computed(() => {
  const g = aac.value?.channels[0]?.grouping;
  if (g === null || g === undefined) return null;
  const out: number[] = [0];
  for (let k = 6; k >= 0; k--) out.push(out[out.length - 1] + ((g >> k) & 1 ? 0 : 1));
  return out;
});

const hex = computed(() => {
  const b = bytes.value, fr = frame.value;
  if (!b || !fr) return [];
  const head = side.value ? side.value.headerBytes + side.value.crcBytes : 0, sideEnd = side.value ? head + side.value.sideBytes : Math.ceil(fieldBits.value / 8);
  const cls = (k: number) => (side.value ? (k < 4 ? 'hdr' : k < head ? 'crc' : k < sideEnd ? 'side' : 'main') : k < sideEnd ? 'hdr' : 'main');
  const rows: { off: string; cells: { v: string; c: string }[] }[] = [];
  for (let r = 0; r < Math.min(4, Math.ceil(b.length / 16)); r++) {
    const cells = [];
    for (let k = r * 16; k < Math.min(b.length, r * 16 + 16); k++) cells.push({ v: b[k].toString(16).padStart(2, '0').toUpperCase(), c: cls(k) });
    rows.push({ off: (Math.round(fr.offset) + r * 16).toString(16).toUpperCase().padStart(8, '0'), cells });
  }
  return rows;
});

function step(d: number): void {
  const fr = f.value, i = index.value;
  if (!fr || i < 0) return;
  const k = Math.max(0, Math.min(fr.t.length - 1, i + d));
  emit('step', fr.t[k] + fr.dur[k] * 0.5); // the frame's middle: safely inside it
}
function play(context: number): void {
  const fr = f.value, i = index.value;
  if (!fr || i < 0) return;
  const a = Math.max(0, i - context), b = Math.min(fr.t.length - 1, i + context);
  emit('audition', Math.max(0, fr.t[a]), fr.t[b] + fr.dur[b], fr.t[i] + fr.dur[i] * 0.5);
}
defineExpose({ step, play });
</script>

<template>
  <section class="insp" aria-label="Frame inspector">
    <header class="top">
      <div v-if="frame" class="id">
        <span class="t">{{ unit }}</span> <b>{{ n(frame.i + 1) }}</b> <span class="mute">of {{ n(frame.of) }}</span>
        <span class="sep">·</span>{{ frame.t.toFixed(3) }} s<span class="sep">·</span>{{ (frame.dur * 1000).toFixed(2) }} ms
        <span class="sep">·</span>{{ n(frame.size) }} B<span v-if="frame.offset" class="mute"><span class="sep">·</span>byte {{ n(Math.round(frame.offset)) }}</span>
      </div>
      <div v-else class="id mute">No frames read for this file.</div>
      <div class="ctl" role="group" aria-label="Step and listen">
        <button type="button" title="Back 10 (Shift ←)" @click="step(-10)">−10</button>
        <button type="button" title="Previous (←)" @click="step(-1)">‹</button>
        <button type="button" class="play" title="Play this frame (Enter)" @click="play(0)">▶ frame</button>
        <button type="button" class="play" title="Play with 2 frames either side" @click="play(2)">▶ ±2</button>
        <button type="button" title="Next (→)" @click="step(1)">›</button>
        <button type="button" title="Forward 10 (Shift →)" @click="step(10)">+10</button>
      </div>
    </header>

    <div v-if="map" class="block">
      <div class="lbl">Bytes</div>
      <div class="bytes">
        <div class="bar"><i v-for="(p, k) in map.parts" :key="k" :class="p.cls" :style="{ width: p.w + '%' }" :title="p.label"></i></div>
        <div class="legend"><span v-for="(p, k) in map.parts" :key="k"><i :class="p.cls"></i>{{ p.label }}</span></div>
        <div v-if="map.data" class="span" :style="{ marginLeft: map.data.left + '%', width: map.data.width + '%' }"><span>{{ map.data.label }}</span></div>
      </div>
    </div>

    <div v-if="fields.length" class="block">
      <div class="lbl">Bits<small>{{ codec === 'aac' ? 'first ' + fieldBits + ' bits' : '32-bit header' }}</small></div>
      <div>
        <!-- The bits themselves, grouped by field (hover a field to find it in the table). -->
        <div class="strip" role="img" :aria-label="fieldBits + ' bits'">
          <span v-for="(x, k) in fields" :key="k" class="grp" :class="{ alt: k % 2, on: hot === k }" @mouseenter="hot = k" @mouseleave="hot = -1">
            <sup>{{ k + 1 }}</sup>
            <template v-if="x.bits <= 16"><i v-for="(c, j) in x.value.toString(2).padStart(x.bits, '0')" :key="j">{{ c }}</i></template>
            <i v-else class="many">{{ x.bits }} bits</i>
          </span>
        </div>
        <table class="ftbl">
          <tbody>
            <tr v-for="(x, k) in fields" :key="k" :class="{ on: hot === k }" @mouseenter="hot = k" @mouseleave="hot = -1">
              <td class="mute">{{ k + 1 }}</td><td>{{ x.name }}</td><td class="mute">{{ x.bits }} bit{{ x.bits === 1 ? '' : 's' }}</td><td>{{ x.value }}</td><td class="mean">{{ x.text }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="granuleRows.length" class="block">
      <div class="lbl">Side info<small>main_data_begin {{ side?.mainDataBegin }} B</small></div>
      <table class="tbl">
        <thead><tr><th></th><th>block</th><th>gain</th><th>bits</th><th>big_values</th><th>sf_compress</th><th>tables</th><th>regions</th><th>subblock gain</th><th>pre · scale · c1</th></tr></thead>
        <tbody>
          <tr v-for="g in granuleRows" :key="g.key">
            <td class="mute">{{ g.where }}</td><td><i class="sq" :class="'b-' + g.kind"></i>{{ g.block }}</td><td>{{ g.gain }}</td><td>{{ n(g.bits) }}</td>
            <td>{{ g.big }}</td><td>{{ g.sfc }}</td><td>{{ g.tables }}</td><td>{{ g.regions }}</td><td>{{ g.sub }}</td><td>{{ g.flags }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="aacRows.length" class="block">
      <div class="lbl">Channels<small>{{ aac?.element }}{{ aac?.commonWindow ? ' · common window' : '' }}{{ aac?.msMaskPresent !== null ? ' · M/S ' + ['off', 'per band', 'all bands', '—'][aac!.msMaskPresent!] : '' }}</small></div>
      <div>
        <table class="tbl">
          <thead><tr><th></th><th>window sequence</th><th>shape</th><th>max_sfb</th><th>groups</th><th>global gain</th></tr></thead>
          <tbody>
            <tr v-for="c in aacRows" :key="c.key">
              <td class="mute">{{ c.ch }}</td><td><i class="sq" :class="'b-' + c.kind"></i>{{ c.win }}</td><td>{{ c.shape }}</td><td>{{ c.sfb }}</td><td>{{ c.groups }}</td><td>{{ c.gain }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="shortGroups" class="groups" aria-label="eight short windows and their groups">
          <span v-for="(g, k) in shortGroups" :key="k" class="w" :class="'g' + (g % 4)">{{ k + 1 }}</span>
          <span class="cap">8 short windows · {{ new Set(shortGroups).size }} groups</span>
        </div>
      </div>
    </div>

    <div v-if="hex.length" class="block">
      <div class="lbl">Hex<small>first {{ Math.min(64, bytes?.length ?? 0) }} B</small></div>
      <div class="hex">
        <div v-for="r in hex" :key="r.off" class="hr"><span class="off">{{ r.off }}</span><span v-for="(c, k) in r.cells" :key="k" :class="c.c">{{ c.v }}</span></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.insp { margin-top: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px 16px 14px; display: flex; flex-direction: column; gap: 12px; font-variant-numeric: tabular-nums; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.id { font-size: 13px; color: var(--ink-sub); }
.id b { font-size: 15px; color: var(--ink); font-weight: 600; }
.t { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-sub); }
.sep { margin: 0 6px; color: var(--ink-mute); }
.mute { color: var(--ink-mute); }
.ctl { display: flex; gap: 2px; }
.ctl button { height: 26px; min-width: 30px; padding: 0 8px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: none; color: var(--ink); font: 12px var(--font-sans); cursor: pointer; }
.ctl button:hover { background: var(--bg-raise); }
.ctl .play { color: var(--accent); }
.block { display: grid; grid-template-columns: 96px 1fr; gap: 10px; align-items: start; }
.lbl { font-size: 13px; color: var(--ink-sub); }
.lbl small { display: block; font-size: 10px; color: var(--ink-mute); margin-top: 2px; }
.bar { display: flex; height: 14px; border-radius: 2px; overflow: hidden; background: var(--line); }
.bar i { display: block; height: 100%; }
.bar i + i { border-left: 1px solid var(--bg-panel); }
.prev { background: repeating-linear-gradient(135deg, var(--line-strong) 0 3px, transparent 3px 6px); }
.hdr { background: var(--accent); }
.crc { background: #8aa3c4; }
.side { background: #c9a25a; }
.main { background: var(--ink-mute); }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 5px; font-size: 11px; color: var(--ink-sub); }
.legend i { display: inline-block; width: 8px; height: 8px; border-radius: 1px; margin-right: 5px; vertical-align: 0; }
.span { margin-top: 6px; border: 1px solid var(--accent); border-top: 0; height: 8px; border-radius: 0 0 3px 3px; position: relative; }
.span span { position: absolute; top: 9px; left: 0; font-size: 11px; color: var(--accent); white-space: nowrap; }
.bytes { padding-bottom: 16px; }
/* Bit strip: one cell per bit, fields shaded in turn, numbered to match the table below. */
.strip { display: flex; flex-wrap: wrap; gap: 6px 4px; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.grp { position: relative; display: inline-flex; padding-top: 11px; cursor: default; }
.grp sup { position: absolute; top: 0; left: 0; font-size: 9px; color: var(--ink-mute); }
.grp i { font-style: normal; width: 11px; height: 18px; display: inline-flex; align-items: center; justify-content: center; background: var(--bg-raise); color: var(--ink); }
.grp.alt i { background: var(--line); }
.grp i.many { width: auto; padding: 0 6px; color: var(--ink-sub); }
.grp.on i { background: var(--accent); color: var(--bg); }
.ftbl { margin-top: 8px; border-collapse: collapse; font-size: 12px; width: 100%; columns: 2; }
.ftbl td { padding: 2px 10px 2px 0; white-space: nowrap; border-bottom: 1px solid var(--line); }
.ftbl td.mean { color: var(--ink-sub); width: 100%; }
.ftbl tr.on td { color: var(--accent); }
.tbl { border-collapse: collapse; font-size: 12px; width: 100%; }
.tbl th { text-align: right; font-weight: 500; color: var(--ink-mute); padding: 0 8px 4px; white-space: nowrap; border-bottom: 1px solid var(--line); }
.tbl td { text-align: right; padding: 4px 8px; color: var(--ink); white-space: nowrap; border-bottom: 1px solid var(--line); }
.tbl th:first-child, .tbl td:first-child { text-align: left; padding-left: 0; }
.tbl td:nth-child(2), .tbl th:nth-child(2) { text-align: left; }
.sq { display: inline-block; width: 7px; height: 7px; border-radius: 1px; margin-right: 6px; }
.b-long { background: var(--line-strong); }
.b-start, .b-stop { background: #c9a25a; }
.b-short { background: var(--accent); }
.groups { display: flex; align-items: center; gap: 2px; margin-top: 8px; }
.w { width: 22px; height: 18px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; color: var(--bg); border-radius: 2px; }
.g0 { background: var(--accent); } .g1 { background: #c9a25a; } .g2 { background: #8aa3c4; } .g3 { background: var(--ink-sub); }
.groups .cap { margin-left: 10px; font-size: 11px; color: var(--ink-mute); }
.hex { font: 11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
.hr { display: flex; gap: 6px; }
.off { color: var(--ink-mute); margin-right: 8px; }
.hex .hdr, .hex .crc, .hex .side, .hex .main { background: none; }
.hex .hdr { color: var(--accent); } .hex .crc { color: #8aa3c4; } .hex .side { color: #c9a25a; } .hex .main { color: var(--ink-sub); }
@media (max-width: 900px) { .block { grid-template-columns: 1fr; } .tbl { display: block; overflow-x: auto; } }
</style>
