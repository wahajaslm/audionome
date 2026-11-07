<script setup lang="ts">
/**
 * Nerds: its own view next to Explore (strip button "Nerds"), in sync with the selected
 * passage or loop, else the whole song.
 *   header      Stats for nerds · this passage 1:10 – 1:22   (Follow playhead | Whole passage)
 *   curves      Bitrate (large) · Loudness · time — playhead and loop band; click / drag
 *   curves      + Blocks · Gain · Reservoir (MP3) / Shape (AAC): decoder fields per frame
 *   cards       Now · This passage · File (NerdCards.vue)
 *   Details     the File · Playback · Analysis columns as text (NerdStats.vue), folded
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { panBy, spanLabel, stepZoom, viewOf, zoomAt, type ZoomState } from '../../core/zoom';
import NerdOverview from './NerdOverview.vue';
import { useAudibleTime } from '../../composables/useAudibleTime';
import { formatTime } from '../../ui/format';
import { usePlaybackStore } from '../../stores/playback';
import { useTimelineStore } from '../../stores/timeline';
import BitrateLanes from './BitrateLanes.vue';
import NerdStats from './NerdStats.vue';
import NerdCards from './NerdCards.vue';
import NerdFrameInspector from './NerdFrameInspector.vue';
import NerdFrameTable from './NerdFrameTable.vue';
import Fold from '../../ui/Fold.vue';
import { allOpen, setAllFolds, useFold } from '../../composables/useFolds';
import { frameAt } from '../../core/bitrate';

const playback = usePlaybackStore();
const timeline = useTimelineStore();
/**
 * ZOOM FIX - the three fixed modes (Frames / Follow / Whole) gave no way to step in or back out.
 * Now zoom is continuous (core/zoom.ts): − / + steps, Fit, pinch or ⌘-scroll around the
 * pointer, ⇧-scroll or swipe to pan, Follow to stay on the playhead, keys + − 0 F on the lanes,
 * and an overview with the visible window as a draggable box. Frame bars appear at ≤ 3 s.
 */
const zoom = ref<ZoomState>({ span: null, center: 0, follow: true });
/** The moment you hear (DELAY FIX): lanes, cards and Follow use it, not the decoder clock. */
const { latency, audibleT } = useAudibleTime();

/** The passage, or the whole song (the file's own length when it was read). */
const range = computed(() => playback.sel ?? { a: 0, b: timeline.bitrate?.durationSec || playback.duration || 1 });
const win = computed(() => viewOf(zoom.value, range.value, audibleT.value));
/** The Alignment block in the panel: every timing correction, in numbers. */
const alignment = computed(() => {
  const fr = timeline.bitrate?.frames, sp = timeline.spectrumView;
  const rows: { k: string; v: string }[] = [];
  rows.push({ k: 'Output latency', v: latency.value ? `${(latency.value * 1000).toFixed(0)} ms, compensated` : 'starts with playback' });
  if (fr) rows.push({ k: 'Encoder priming', v: fr.skipSec ? `${(fr.skipSec * 1000).toFixed(1)} ms skipped` : 'none' });
  if (sp) rows.push({ k: 'Spectrum frames', v: `centred · ${(1000 / sp.fps).toFixed(1)} ms step` });
  if (timeline.envelope) rows.push({ k: 'Waveform', v: `${(1000 / timeline.envelope.rate).toFixed(0)} ms resolution` });
  return rows;
});
const spanText = computed(() => spanLabel(win.value[1] - win.value[0]));
const fitted = computed(() => zoom.value.span === null || zoom.value.span >= range.value.b - range.value.a);
const zoomIn = () => { zoom.value = stepZoom(zoom.value, range.value, audibleT.value, -1); };
const zoomOut = () => { zoom.value = stepZoom(zoom.value, range.value, audibleT.value, 1); };
const fit = () => { zoom.value = { ...zoom.value, span: null }; };
const toggleFollow = () => {
  const [v0, v1] = win.value;
  zoom.value = { ...zoom.value, follow: !zoom.value.follow, center: (v0 + v1) / 2 };
};
const onZoom = (factor: number, at: number) => { zoom.value = zoomAt(zoom.value, range.value, audibleT.value, factor, at); };
const onPan = (d: number) => { zoom.value = panBy(zoom.value, range.value, audibleT.value, d); };
const onCenter = (c: number) => { if (!fitted.value) zoom.value = { ...zoom.value, follow: false, center: c }; };
// A new passage starts at Fit.
watch(() => [range.value.a, range.value.b], () => { zoom.value = { ...zoom.value, span: null }; });
const inspector = ref<InstanceType<typeof NerdFrameInspector> | null>(null);
const curvesOpen = useFold('nerds.curves');
const everyOpen = allOpen('nerds');
/** "Frame 10,700 · 960 B · short" for the folded headers. */
const frameSummaryText = computed(() => {
  const f = timeline.bitrate?.frames;
  if (!f) return 'reading the file';
  const i = frameAt(f, audibleT.value);
  if (i < 0) return '—';
  const kind = f.dec && f.dec.block[i] < 4 ? ' · ' + ['long', 'start', 'short', 'stop'][f.dec.block[i]] : '';
  return `${f.unit === 'sample' ? 'Packet' : 'Frame'} ${(i + 1).toLocaleString('en')} · ${f.size[i]} B${kind}`;
});

/**
 * CONTEXT STRIP - once the big lanes scroll out of view (you are reading the panel, the
 * inspector or the table), a compact waveform · spectrum · blocks strip pins to the top, on the
 * same zoom and with the same frame outline, so the signal never leaves the screen.
 */
const lanesEl = ref<HTMLElement | null>(null);
const lanesHidden = ref(false);
/** Where the strip sits: pinned to the window, lined up with the lanes (a parent clips overflow, so CSS sticky cannot work). */
const pin = ref({ left: 0, width: 0 });
let io: IntersectionObserver | null = null;
const place = () => { const r = lanesEl.value?.getBoundingClientRect(); if (r) pin.value = { left: r.left, width: r.width }; };
onMounted(() => {
  io = new IntersectionObserver(([e]) => { lanesHidden.value = !e.isIntersecting && e.boundingClientRect.top < 0; place(); }, { threshold: 0 });
  if (lanesEl.value) io.observe(lanesEl.value);
  window.addEventListener('resize', place);
  // The lanes leave and return with their fold: observe the new element each time.
  watch(lanesEl, (el, old) => { if (old) io?.unobserve(old); if (el) io?.observe(el); else lanesHidden.value = false; });
});
onBeforeUnmount(() => { io?.disconnect(); window.removeEventListener('resize', place); });
function onKey(e: KeyboardEvent): void {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // Frame by frame: ← / → one frame (Shift: 10), Enter plays the frame.
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); inspector.value?.step((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1)); return; }
  if (e.key === 'Enter') { e.preventDefault(); inspector.value?.play(0); return; }
  const act: Record<string, () => void> = { '+': zoomIn, '=': zoomIn, '-': zoomOut, _: zoomOut, '0': fit, f: toggleFollow, F: toggleFollow };
  const fn = act[e.key];
  if (fn) { e.preventDefault(); fn(); }
}
const loud = computed(() => timeline.timeline?.mix ?? timeline.spectrum?.loud ?? null);
function loopRange(a: number, b: number): void {
  playback.beginSelection(); playback.updateSelection(a, b); playback.commitSelection();
  if (!playback.loop) playback.toggleLoop();
}
</script>

<template>
  <section class="panel" aria-label="Stats for nerds">
    <header class="head">
      <div>
        <h2 class="heading">Stats for nerds</h2>
        <div class="caption sub">{{ playback.sel ? 'this passage ' + formatTime(range.a) + ' – ' + formatTime(range.b) : 'whole song' }}</div>
      </div>
      <div class="zoom" role="group" aria-label="Zoom">
        <button type="button" class="zb" aria-label="Zoom out" title="Zoom out (−)" :disabled="fitted" @click="zoomOut">−</button>
        <span class="span" aria-live="polite">{{ fitted ? 'Fit' : spanText }}</span>
        <button type="button" class="zb" aria-label="Zoom in" title="Zoom in (+)" @click="zoomIn">+</button>
        <button type="button" class="zt" :aria-pressed="fitted" title="See the whole passage (0)" @click="fit">Fit</button>
        <button type="button" class="zt" :aria-pressed="zoom.follow" title="Keep the playhead in the middle (F)" @click="toggleFollow">Follow</button>
        <button type="button" class="zt all" @click="setAllFolds('nerds', !everyOpen)">{{ everyOpen ? 'Collapse all' : 'Expand all' }}</button>
      </div>
    </header>
    <!-- FOLDS - every part can be opened or closed (ui/Fold.vue); the choice is remembered. -->
    <Fold id="nerds.curves" title="Curves" :summary="(fitted ? 'Fit' : spanText) + ' · waveform · spectrum · bitrate · blocks · gain'">
      <NerdOverview v-if="!fitted" class="over" :envelope="timeline.envelope" :range="range" :win="win" :t="audibleT" @center="onCenter" />
      <div ref="lanesEl" class="lanes-wrap" tabindex="0" aria-label="Lanes. + and − zoom, 0 fits, F follows the playhead, ← → step frames, Enter plays the frame" @keydown="onKey">
        <BitrateLanes :bitrate="timeline.bitrate" :envelope="timeline.envelope" :view="timeline.spectrumView" :win="win" :spectrum-kind="timeline.spectrumKind" :ready-kinds="timeline.readyKinds" @kind="k => timeline.setSpectrumKind(k)" :loud="loud" :range="range" :sel="playback.sel" :t="audibleT" @seek="s => playback.clickSeek(s)" @loop="loopRange" @zoom="onZoom" @pan="onPan" />
      </div>
      <p class="hint">Pinch or ⌘-scroll to zoom · ⇧-scroll or swipe to pan · drag to loop · ← → step frames · Enter plays the frame</p>
    </Fold>
    <!-- Curves folded away: the compact signal strip takes their place, so the context stays. -->
    <div v-if="!curvesOpen" class="ctx-inline" tabindex="0" @keydown="onKey">
      <BitrateLanes compact :bitrate="timeline.bitrate" :envelope="timeline.envelope" :view="timeline.spectrumView" :win="win" :spectrum-kind="timeline.spectrumKind" :ready-kinds="timeline.readyKinds"
        :loud="null" :range="range" :sel="playback.sel" :t="audibleT" @seek="s => playback.clickSeek(s)" @loop="loopRange" @zoom="onZoom" @pan="onPan" />
    </div>
    <!-- Sticky context strip (no height of its own, so nothing below moves when it appears). -->
    <div class="ctx-pin">
      <div v-if="curvesOpen && lanesHidden" class="ctx" aria-label="Signal context" :style="{ left: pin.left + 'px', width: pin.width + 'px' }">
        <BitrateLanes compact :bitrate="timeline.bitrate" :envelope="timeline.envelope" :view="timeline.spectrumView" :win="win" :spectrum-kind="timeline.spectrumKind" :ready-kinds="timeline.readyKinds"
          :loud="null" :range="range" :sel="playback.sel" :t="audibleT" @seek="s => playback.clickSeek(s)" @loop="loopRange" @zoom="onZoom" @pan="onPan" />
      </div>
    </div>
    <Fold id="nerds.glance" title="At a glance" :summary="frameSummaryText + ' · this passage · file · alignment'">
      <NerdCards :bitrate="timeline.bitrate" :t="audibleT" :alignment="alignment" :range="range" :is-passage="!!playback.sel" />
    </Fold>
    <Fold id="nerds.inspector" title="Frame inspector" :summary="frameSummaryText + ' · bytes · bits · fields · coded spectrum · hex'">
      <NerdFrameInspector
        ref="inspector"
        :bitrate="timeline.bitrate"
        :t="audibleT"
        :playing="playback.playing"
        :read-bytes="timeline.readBytes"
        :view="timeline.spectrumView"
        @step="s => playback.stepTo(s)"
        @audition="(a, b, back) => playback.audition(a, b, back)"
      />
    </Fold>
    <Fold id="nerds.table" title="Frames" summary="every frame of the passage · filter · sort">
      <NerdFrameTable :bitrate="timeline.bitrate" :t="audibleT" :range="range" @go="s => playback.stepTo(s)" />
    </Fold>
    <Fold id="nerds.details" title="Details" summary="MediaInfo · ffprobe · playback · analysis" :open="false">
      <NerdStats />
    </Fold>
  </section>
</template>

<style scoped>
.panel { margin-top: var(--space-3); padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--bg-panel); }
.head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-3); }
.heading { margin: 0; color: var(--ink); }
.sub { color: var(--ink-sub); margin-top: 2px; }
.zoom { display: flex; align-items: center; gap: 2px; font-variant-numeric: tabular-nums; }
.zb { width: 28px; height: 28px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: none; color: var(--ink); font: 16px/1 var(--font-sans); cursor: pointer; }
.zb:disabled { color: var(--ink-mute); cursor: default; }
.zb:hover:not(:disabled) { background: var(--bg-raise); }
.span { min-width: 56px; text-align: center; font-size: 13px; color: var(--ink); }
.zt { height: 28px; padding: 0 10px; margin-left: 6px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: none; color: var(--ink-sub); font: 13px var(--font-sans); cursor: pointer; }
.zt + .zt { margin-left: 2px; }
.zt[aria-pressed='true'] { color: var(--ink); border-color: var(--ink-sub); background: var(--bg-raise); }
.over { margin: 0 0 8px 106px; width: calc(100% - 106px); }
.lanes-wrap { outline: none; }
.ctx-pin { height: 0; }
.ctx { position: fixed; top: 0; z-index: 40; padding: 8px 0 6px; background: var(--bg-panel); border-bottom: 1px solid var(--line); box-shadow: 0 6px 12px -8px rgba(0, 0, 0, 0.6); }
.lanes-wrap:focus-visible { box-shadow: 0 0 0 1px var(--accent); border-radius: 2px; }
.hint { margin: 6px 0 0 106px; font-size: 11px; color: var(--ink-mute); }
.ctx-inline { outline: none; padding: 4px 0 8px; border-top: 1px solid var(--line); }
.zt.all { margin-left: 10px; }
@media (max-width: 600px) { .line { margin-left: 0; } }
</style>
