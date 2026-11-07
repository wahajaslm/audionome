<script setup lang="ts">
/**
 * Frame table (Nerds), like a packet list: every frame of the passage (or the song), filtered
 * and sorted, the frame you are hearing highlighted and kept in view. Click a row to go there
 * (the inspector above follows). Only the rows on screen are drawn, so 20 000 frames scroll
 * smoothly.
 *   #  time  size  kbps  block/window  gain  bits | max_sfb  reservoir | shape  stereo / M/S
 */
import { computed, nextTick, ref, watch } from 'vue';
import { frameAt, mp3Header, type BitrateInfo } from '../../core/bitrate';
import { BLOCK_NAMES, frameRows, type FrameFilter, type FrameSort } from '../../core/bitstream';

const props = defineProps<{ bitrate: BitrateInfo | null; t: number; range: { a: number; b: number } }>();
const emit = defineEmits<{ go: [sec: number] }>();

const ROW = 22, SHOWN = 12;
const filter = ref<FrameFilter>('all');
const sort = ref<FrameSort>('index');
const f = computed(() => props.bitrate?.frames ?? null);
const aac = computed(() => f.value?.dec?.codec === 'aac');
const unit = computed(() => (f.value?.unit === 'sample' ? 'packets' : f.value?.unit === 'page' ? 'pages' : 'frames'));

const span = computed(() => {
  const fr = f.value;
  if (!fr) return [0, -1] as const;
  let i0 = frameAt(fr, props.range.a);
  if (i0 < 0) i0 = 0;
  let i1 = frameAt(fr, props.range.b);
  if (i1 < 0) i1 = fr.t.length - 1;
  return [i0, i1] as const;
});
const rows = computed(() => (f.value ? frameRows(f.value, span.value[0], span.value[1], filter.value, sort.value) : new Int32Array(0)));
const current = computed(() => (f.value ? frameAt(f.value, props.t) : -1));

// Virtual scrolling: only rows in the window are made.
const scroller = ref<HTMLDivElement | null>(null);
const top = ref(0);
const first = computed(() => Math.max(0, Math.floor(top.value / ROW) - 4));
const visible = computed(() => {
  const fr = f.value, d = fr?.dec, out = [];
  if (!fr) return [];
  for (let r = first.value; r < Math.min(rows.value.length, first.value + SHOWN + 8); r++) {
    const i = rows.value[r], h = fr.hdr[i] ? mp3Header(fr.hdr[i]) : null;
    const block = d && d.block[i] < 4 ? BLOCK_NAMES[d.block[i]] : '';
    out.push({
      r, i, n: (i + 1).toLocaleString('en'), time: fr.t[i].toFixed(3), size: fr.size[i].toLocaleString('en'),
      kbps: fr.kbps[i] || Math.round(fr.size[i] * 8 / fr.dur[i] / 1000), block,
      gain: d && d.gain[i] !== 255 ? d.gain[i] : '', bits: d ? (d.codec === 'mp3' ? d.bits[i].toLocaleString('en') : d.bits[i]) : '',
      res: d?.codec === 'mp3' ? d.reservoir[i] : d && d.shape[i] < 2 ? (d.shape[i] ? 'KBD' : 'sine') : '',
      stereo: h ? (h.modeExt ? String(h.modeExt) : String(h.mode)) : d && d.ms[i] !== 255 ? ['off', 'bands', 'all', '—'][d.ms[i]] : '',
    });
  }
  return out;
});
function onScroll(): void { top.value = scroller.value?.scrollTop ?? 0; }

// Keep the playing frame in view while the table is in frame order (not while you scroll a sort).
let userScrolledAt = 0;
function onWheel(): void { userScrolledAt = Date.now(); }
watch(current, async i => {
  const el = scroller.value;
  if (!el || sort.value !== 'index' || Date.now() - userScrolledAt < 1500) return;
  const r = rows.value.indexOf(i);
  if (r < 0) return;
  const y = r * ROW;
  if (y < el.scrollTop + ROW || y > el.scrollTop + (SHOWN - 2) * ROW) { el.scrollTop = Math.max(0, y - 3 * ROW); onScroll(); }
  await nextTick();
});
watch([filter, sort, span], () => { if (scroller.value) { scroller.value.scrollTop = 0; onScroll(); } });

function go(i: number): void { const fr = f.value; if (fr) emit('go', fr.t[i] + fr.dur[i] * 0.5); }
const FILTERS: { k: FrameFilter; label: string; title: string }[] = [
  { k: 'all', label: 'All', title: 'every frame in the passage' },
  { k: 'short', label: 'Short', title: 'short blocks / eight-short windows: transients' },
  { k: 'switch', label: 'Start / stop', title: 'the encoder switching window length' },
  { k: 'large', label: 'Largest 5 %', title: 'the biggest frames by bytes' },
  { k: 'gainjump', label: 'Gain jumps', title: 'global gain moved by 6 or more from the previous frame' },
];
const cols = computed(() => [
  { k: 'index' as FrameSort, label: '#' }, { k: null, label: 'time s' }, { k: 'size' as FrameSort, label: 'size B' }, { k: null, label: 'kbps' },
  { k: null, label: aac.value ? 'window' : 'block' }, { k: 'gain' as FrameSort, label: 'gain' },
  { k: 'bits' as FrameSort, label: aac.value ? 'max_sfb' : 'bits' }, { k: aac.value ? null : ('reservoir' as FrameSort), label: aac.value ? 'shape' : 'reservoir B' },
  { k: null, label: aac.value ? 'M/S' : 'stereo' },
]);
</script>

<template>
  <section class="ftable" aria-label="Frame table">
    <header class="h">
      <span class="t">Frames</span>
      <span class="count">{{ rows.length.toLocaleString('en') }} of {{ (span[1] - span[0] + 1).toLocaleString('en') }} {{ unit }}</span>
      <div class="filters" role="radiogroup" aria-label="Filter">
        <button v-for="x in FILTERS" :key="x.k" type="button" role="radio" :aria-checked="filter === x.k" :title="x.title" @click="filter = x.k">{{ x.label }}</button>
      </div>
    </header>
    <div class="grid head" role="row">
      <button v-for="c in cols" :key="c.label" type="button" class="th" :class="{ sortable: !!c.k, on: c.k && sort === c.k }" :disabled="!c.k" :title="c.k ? 'Sort by ' + c.label : undefined" @click="c.k && (sort = c.k)">{{ c.label }}<span v-if="c.k && sort === c.k" class="arrow">{{ c.k === 'index' ? '↑' : '↓' }}</span></button>
    </div>
    <div ref="scroller" class="body" :style="{ height: SHOWN * ROW + 'px' }" @scroll="onScroll" @wheel.passive="onWheel">
      <div :style="{ height: rows.length * ROW + 'px', position: 'relative' }">
        <div
          v-for="v in visible"
          :key="v.i"
          class="grid row"
          :class="{ cur: v.i === current }"
          :style="{ top: v.r * ROW + 'px' }"
          role="row"
          @click="go(v.i)"
        >
          <span>{{ v.n }}</span><span>{{ v.time }}</span><span>{{ v.size }}</span><span>{{ v.kbps }}</span>
          <span class="l"><i v-if="v.block" class="sq" :class="'b-' + v.block"></i>{{ v.block }}</span>
          <span>{{ v.gain }}</span><span>{{ v.bits }}</span><span>{{ v.res }}</span><span class="l">{{ v.stereo }}</span>
        </div>
      </div>
      <p v-if="!rows.length" class="empty">{{ filter === 'large' ? `Every ${unit.slice(0, -1)} is the same size here (constant bitrate).` : `No ${unit} match this filter here.` }}</p>
    </div>
  </section>
</template>

<style scoped>
.ftable { margin-top: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px 16px 10px; font-variant-numeric: tabular-nums; }
.h { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
.t { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-sub); }
.count { font-size: 12px; color: var(--ink-mute); }
.filters { margin-left: auto; display: flex; gap: 2px; }
.filters button { height: 24px; padding: 0 9px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: none; color: var(--ink-sub); font: 12px var(--font-sans); cursor: pointer; }
.filters button[aria-checked='true'] { color: var(--ink); border-color: var(--ink-sub); background: var(--bg-raise); }
.grid { display: grid; grid-template-columns: 70px 80px 70px 56px 90px 52px 70px 86px 1fr; column-gap: 8px; align-items: center; font-size: 12px; }
.grid > * { text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.grid > .l { text-align: left; }
.grid > :nth-child(5), .grid > :nth-child(9) { text-align: left; }
.head { border-bottom: 1px solid var(--line); padding-bottom: 4px; }
.th { border: 0; background: none; padding: 0; color: var(--ink-mute); font: 500 11px var(--font-sans); text-align: right; cursor: default; }
.th.sortable { cursor: pointer; }
.th.sortable:hover { color: var(--ink); }
.th.on { color: var(--ink); }
.arrow { margin-left: 3px; color: var(--accent); }
.body { overflow-y: auto; position: relative; scrollbar-width: thin; }
.row { position: absolute; left: 0; right: 0; height: 22px; cursor: pointer; color: var(--ink); border-bottom: 1px solid var(--line); }
.row:hover { background: var(--bg-raise); }
.row.cur { background: color-mix(in srgb, var(--accent) 16%, transparent); }
.row.cur > :first-child { color: var(--accent); }
.sq { display: inline-block; width: 7px; height: 7px; border-radius: 1px; margin-right: 6px; }
.b-long { background: var(--line-strong); }
.b-start, .b-stop { background: #c9a25a; }
.b-short { background: var(--accent); }
.empty { margin: 16px 0; font-size: 12px; color: var(--ink-mute); text-align: center; }
@media (max-width: 900px) { .grid { grid-template-columns: 60px 70px 60px 48px 80px 44px 60px 70px 1fr; font-size: 11px; } .filters { margin-left: 0; } }
</style>
