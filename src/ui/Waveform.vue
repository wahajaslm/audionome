<script setup lang="ts">
/**
 * Waveform (design-system component), built on wavesurfer.js 8 (https://wavesurfer.xyz).
 *
 * LIBRARY FIX - the waveform used to be hand-drawn on a <canvas> with its own pointer, drag,
 * resize and peak-decoding code. That is what wavesurfer.js and its Regions / Hover plugins
 * already do, tested by many players, so it does that now:
 *   - wavesurfer draws the bars and the cursor and seeks on click,
 *   - Regions: drag on empty waveform = new selection; drag its edges = resize; drag its middle
 *     = move it; saved moments are drawn as fixed, click-through regions,
 *   - Hover: a line and the time under the pointer.
 * wavesurfer is bound to the app's single <audio> element (`media`), so it only draws and
 * listens; loading, playback, loops and logging stay with the playback store.
 * Example: playing in Library, open Now playing -> the waveform appears at the current
 * position and the song does not restart or pause.
 *
 * Props
 *   media        the app's <audio> element (from useAudioEngine)
 *   duration     song length in seconds
 *   currentTime  playhead position in seconds (for the slider's accessible value)
 *   selection    { a, b } in seconds, or null
 *   saved        saved moments of this song: [{ id, a, b }]
 * Emits
 *   seek(sec)            click without drag
 *   select-start         a drag on empty waveform started a new selection
 *   select(a, b)         while dragging
 *   select-end           drag released
 *   resize(a, b)         the selection's edge or body is being dragged
 *   resize-end           that drag was released
 *   step(deltaSec)       ← / → keys: −5 / +5 (Shift+← / → moves the selection's end by 1 s)
 *   select-around        Enter: select ±10 s around the playhead
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { type Region } from 'wavesurfer.js/plugins/regions';
import HoverPlugin from 'wavesurfer.js/plugins/hover';
import { formatTime, token } from './format';

interface Range { a: number; b: number }
interface SavedRange extends Range { id: string }

const props = defineProps<{
  media: HTMLMediaElement | null;
  duration: number;
  currentTime: number;
  selection: Range | null;
  saved: SavedRange[];
  /** Passages you keep coming back to: a faint dotted line under the wave, nothing else. */
  hints?: Range[];
  /** Peaks stored with the song (full mix only); drawn without decoding. */
  storedPeaks?: { peaks: number[][]; duration: number } | null;
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
  /** Peaks were decoded from the audio (not from storedPeaks): worth storing. */
  peaks: [p: { peaks: number[][]; duration: number }];
}>();

/**
 * Peaks per source URL, kept for the session, so coming back to Now playing draws the
 * waveform at once instead of downloading and decoding the song again.
 */
const peakCache = new Map<string, { peaks: number[][]; duration: number }>();

const SEL_ID = 'sel';
const SAVED_PREFIX = 'saved:';
const HINT_PREFIX = 'hint:';

const host = ref<HTMLDivElement | null>(null);
let ws: WaveSurfer | null = null;
let regions: ReturnType<typeof RegionsPlugin.create> | null = null;
let loadedSrc = '';
let colors = { selection: 'rgba(142,197,184,0.18)', saved: 'rgba(142,197,184,0.10)' };

/**
 * The <audio> element switched source (another song, a stem, a fallback URL): draw that one.
 * The URL must be exactly `media.src` (absolute): wavesurfer then sees the same source and
 * leaves the element alone instead of replacing it, so playback is not interrupted.
 * (On creation wavesurfer loads the element's current source by itself; see onMounted.)
 */
function loadWave(): void {
  const el = props.media;
  if (!ws || !el || !el.src || el.src === loadedSrc) return;
  loadedSrc = el.src;
  const cached = known(el.src);
  ws.load(el.src, cached?.peaks, cached?.duration).catch(err => console.warn('Waveform notice:', err));
}

/**
 * Peaks for a source: this session's cache, else the song's stored peaks (STARTUP FIX:
 * a refresh then draws the waveform at once instead of decoding a 20 MB song again).
 */
let fromStore = false;
function known(src: string): { peaks: number[][]; duration: number } | undefined {
  const mem = peakCache.get(src);
  fromStore = !mem && !!props.storedPeaks;
  return mem ?? props.storedPeaks ?? undefined;
}

function selRegion(): Region | undefined {
  return regions?.getRegions().find(r => r.id === SEL_ID);
}

/** Store -> waveform: draw the selection where the store has it. */
function syncSelection(): void {
  if (!regions) return;
  const sel = props.selection, r = selRegion();
  if (!sel) { r?.remove(); return; }
  if (r) {
    if (Math.abs(r.start - sel.a) > 0.01 || Math.abs(r.end - sel.b) > 0.01) r.setOptions({ start: sel.a, end: sel.b });
    return;
  }
  regions.addRegion({ id: SEL_ID, start: sel.a, end: sel.b, color: colors.selection, drag: true, resize: true });
}

/** Store -> waveform: saved moments as fixed regions the pointer passes through. */
function syncSaved(): void {
  if (!regions) return;
  const want = new Map(props.saved.map(s => [SAVED_PREFIX + s.id, s]));
  for (const r of regions.getRegions()) {
    if (r.id.startsWith(SAVED_PREFIX) && !want.has(r.id)) r.remove();
  }
  const have = new Set(regions.getRegions().map(r => r.id));
  for (const [id, s] of want) {
    if (have.has(id)) continue;
    const r = regions.addRegion({ id, start: s.a, end: s.b, color: colors.saved, drag: false, resize: false });
    // Click-through: a click seeks (and the store selects the moment); a drag starts a selection.
    if (r.element) r.element.style.pointerEvents = 'none';
    else r.once('render', () => { if (r.element) r.element.style.pointerEvents = 'none'; });
  }
}

/**
 * QUIET FIX - "You often come back to this part" used to be a text line with Save / Dismiss
 * buttons under the waveform. Now it is only a faint dotted line under that passage; a click
 * on it selects the passage (store: clickSeek), so ♡ saves it. Nothing to dismiss.
 */
function syncHints(): void {
  if (!regions) return;
  const list = props.hints ?? [];
  const want = new Map(list.map(h => [HINT_PREFIX + Math.round(h.a * 10) + ':' + Math.round(h.b * 10), h]));
  for (const r of regions.getRegions()) if (r.id.startsWith(HINT_PREFIX) && !want.has(r.id)) r.remove();
  const have = new Set(regions.getRegions().map(r => r.id));
  for (const [id, h] of want) {
    if (have.has(id)) continue;
    const r = regions.addRegion({ id, start: h.a, end: h.b, color: 'transparent', drag: false, resize: false });
    const style = () => {
      if (!r.element) return;
      r.element.style.pointerEvents = 'none';
      r.element.style.borderBottom = '2px dotted ' + (token('--accent') || '#8ec5b8');
      r.element.style.opacity = '0.55';
    };
    if (r.element) style(); else r.once('render', style);
  }
}

onMounted(() => {
  if (!host.value) return;
  colors = {
    selection: token('--accent-fill') || colors.selection,
    saved: colors.saved,
  };
  regions = RegionsPlugin.create();
  loadedSrc = props.media?.src ?? '';
  const cached = known(loadedSrc);
  ws = WaveSurfer.create({
    container: host.value,
    media: props.media ?? undefined,
    // Cached peaks: drawn at once, no second download and decode of the song.
    peaks: cached?.peaks,
    duration: cached?.duration,
    height: 'auto',
    waveColor: token('--wave-off') || '#45454b',
    progressColor: token('--wave-played') || 'rgba(220,220,224,0.78)',
    cursorColor: token('--playhead') || '#fff',
    cursorWidth: 1,
    barWidth: 2,
    barGap: 3,
    barRadius: 1,
    normalize: true,
    // DOUBLE SEEK FIX - with interact on, wavesurfer moved the <audio> itself on every click,
    // and then the store moved it again (to a saved moment's start, or the same spot): two
    // seeks per click, heard as a stutter. Clicks are now handled once, in onClick below.
    // Example: click inside a saved moment at 1:50 → before: jump to 1:50, then to 1:42;
    // now: one jump to 1:42.
    interact: false,
    plugins: [
      regions,
      HoverPlugin.create({
        lineColor: token('--ink-mute') || '#888',
        lineWidth: 1,
        labelBackground: token('--bg-panel') || '#1b1b1f',
        labelColor: token('--ink') || '#eee',
        labelSize: 11,
        formatTimeCallback: formatTime,
      }),
    ],
  });

  ws.on('decode', d => {
    if (!loadedSrc || !ws || peakCache.has(loadedSrc)) return;
    const p = { peaks: ws.exportPeaks({ maxLength: 4000, precision: 1000 }), duration: d };
    peakCache.set(loadedSrc, p);
    if (!fromStore) emit('peaks', p);
  });

  // A drag on empty waveform: Regions makes a new region with its own id.
  regions.on('region-initialized', r => {
    if (r.id === SEL_ID || r.id.startsWith(SAVED_PREFIX) || r.id.startsWith(HINT_PREFIX)) return;
    emit('select-start');
    r.on('update', () => emit('select', r.start, r.end));
  });
  regions.on('region-created', r => {
    if (r.id === SEL_ID || r.id.startsWith(SAVED_PREFIX) || r.id.startsWith(HINT_PREFIX)) return;
    // The drag is done: drop the plugin's region; the store's selection is drawn as 'sel'.
    selRegion()?.remove();
    emit('select', r.start, r.end);
    r.remove();
    emit('select-end');
    syncSelection();
  });
  regions.on('region-update', r => { if (r.id === SEL_ID) emit('resize', r.start, r.end); });
  regions.on('region-updated', r => { if (r.id === SEL_ID) { emit('resize-end'); syncSelection(); } });
  regions.enableDragSelection({ color: colors.selection }, 6);

  props.media?.addEventListener('loadedmetadata', loadWave);
  syncSaved();
  syncHints();
  syncSelection();
});

onBeforeUnmount(() => {
  props.media?.removeEventListener('loadedmetadata', loadWave);
  // The <audio> element is the app's, not wavesurfer's: destroy() leaves it playing.
  ws?.destroy();
  ws = null; regions = null; loadedSrc = '';
});

watch(() => props.selection, syncSelection, { deep: true });
watch(() => props.saved, syncSaved, { deep: true });
watch(() => props.hints, syncHints, { deep: true });

// A click is a press and release in nearly the same place; a drag (selection) is not.
let downX: number | null = null;
function onPointerDown(e: PointerEvent): void { downX = e.clientX; }
function onClick(e: MouseEvent): void {
  if (downX === null || Math.abs(e.clientX - downX) > 5 || !host.value || !(props.duration > 0)) return;
  downX = null;
  const r = host.value.getBoundingClientRect();
  emit('seek', Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))) * props.duration);
}

function onKey(e: KeyboardEvent): void {
  const sel = props.selection, dur = props.duration > 0 ? props.duration : 1;
  if (e.shiftKey && sel && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const b = Math.max(sel.a, Math.min(dur, sel.b + (e.key === 'ArrowRight' ? 1 : -1)));
    emit('resize', sel.a, b); emit('resize-end'); e.preventDefault();
  } else if (e.key === 'ArrowRight') { emit('step', 5); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { emit('step', -5); e.preventDefault(); }
  else if (e.key === 'Enter') { emit('select-around'); e.preventDefault(); }
}
</script>

<template>
  <div
    ref="host"
    class="waveform mdna-wave"
    role="slider"
    tabindex="0"
    aria-label="Song position. Drag to select a moment"
    aria-valuemin="0"
    :aria-valuemax="Math.round(duration)"
    :aria-valuenow="Math.round(currentTime)"
    :aria-valuetext="formatTime(currentTime) + ' of ' + formatTime(duration)"
    @keydown="onKey"
    @pointerdown="onPointerDown"
    @click="onClick"
  ></div>
</template>

<style scoped>
.waveform {
  height: 160px;
  cursor: pointer;
  touch-action: none;
  user-select: none;
}
@media (max-width: 600px) {
  .waveform { height: 120px; }
}
</style>

<style>
/* wavesurfer renders in a shadow root; its parts are styled from outside with ::part(). */
.mdna-wave ::part(region) { border-radius: var(--radius-sm); }
.mdna-wave ::part(region-handle-left),
.mdna-wave ::part(region-handle-right) {
  border-color: var(--accent) !important;
  border-width: 3px !important;
}
.mdna-wave ::part(hover-label) { font-family: var(--font-sans); border-radius: var(--radius-sm); }
</style>
