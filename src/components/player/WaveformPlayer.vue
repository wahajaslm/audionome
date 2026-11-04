<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import { playerState, showToast, selectTrack } from '../../stores/player';
import { db } from '../../data/db';
import Icon from '../shell/Icon.vue';

const containerRef = ref<HTMLDivElement | null>(null);
const timelineRef = ref<HTMLDivElement | null>(null);
const toolbarSlotRef = ref<HTMLDivElement | null>(null);
const toolbarRef = ref<HTMLDivElement | null>(null);
const toolbarLeft = ref(0);

/**
 * Reads a design token from tokens.css. WaveSurfer paints on a <canvas>, which cannot resolve
 * `var(--x)`, so the waveform colours are looked up here instead of being hard-coded.
 * Example: token('--wave-off') returns the wave-off colour string from tokens.css.
 */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let ws: WaveSurfer | null = null;
let wsRegions: RegionsPlugin | null = null;
let activeRegion: any = null;

const feelTags = ['♡ Love', 'Chills', 'Excitement', 'Nostalgia', 'Calm', 'Sadness'];
// DescribeStrip "Love" row: same options as the design-system preview (adds Lyrics and
// Instruments, which My Music DNA already groups into traits).
const qualityTags = ['Vocals', 'Melody', 'Harmony', 'Rhythm', 'Lyrics', 'Instruments', 'Build-up', 'Drop', 'Atmosphere'];
const activeFeelings = ref<string[]>([]);
const activeQualities = ref<string[]>([]);
const momentNote = ref('');
const isSaving = ref(false);

function getTrackAudioUrl(): string {
  const track = playerState.currentTrack;
  if (!track) return '/demo.wav';
  if ((track as any).streamPlaybackUrl) {
    return (track as any).streamPlaybackUrl;
  }
  if (track.audioBlob) {
    return URL.createObjectURL(track.audioBlob);
  }
  if (track.id === 'original-demo') {
    return '/demo.wav';
  }
  return `http://127.0.0.1:8765/api/audio/${encodeURIComponent(track.id)}`;
}

function initWaveSurfer() {
  if (!containerRef.value) return;

  if (ws) {
    ws.destroy();
    ws = null;
  }

  wsRegions = RegionsPlugin.create();

  // Waveform rule: bars `wave-bar` (2px) wide, `radius-xs`, 5px centre to centre; played bars
  // `wave-played`, unplayed `wave-off`; a 1px `playhead`; 160px tall (120px on phones).
  const barWidth = parseFloat(token('--wave-bar'));
  const isPhone = window.matchMedia(`(max-width: ${token('--breakpoint-phone')})`).matches;
  ws = WaveSurfer.create({
    container: containerRef.value,
    waveColor: token('--wave-off'),
    progressColor: token('--wave-played'),
    cursorColor: token('--playhead'),
    cursorWidth: 1,
    height: isPhone ? 120 : 160,
    barWidth,
    barGap: 5 - barWidth,
    barRadius: parseFloat(token('--radius-xs')),
    normalize: true,
    plugins: [
      wsRegions,
      // height 24 makes WaveSurfer draw 12px labels (it uses height / 2): the `caption` size,
      // since nothing may be smaller than 12px.
      ...(timelineRef.value ? [TimelinePlugin.create({
        container: timelineRef.value,
        primaryLabelInterval: 5,
        height: 24,
        formatTimeCallback: formatTime,
        style: { color: 'var(--ink-mute)', fontVariantNumeric: 'tabular-nums' },
      })] : [])
    ]
  });
  ws.setVolume(playerState.volume);

  ws.on('timeupdate', (currentTime) => {
    playerState.currentTime = currentTime;
    if (playerState.isLooping && activeRegion) {
      if (currentTime >= activeRegion.end || currentTime < activeRegion.start) {
        ws?.setTime(activeRegion.start);
      }
    }
  });

  ws.on('play', () => { playerState.isPlaying = true; });
  ws.on('pause', () => { playerState.isPlaying = false; });
  ws.on('ready', () => {
    playerState.duration = ws?.getDuration() || 32;
  });

  // Enable native drag-selection for moments
  // The region element lives in WaveSurfer's DOM and inherits our CSS variables, so the
  // selection band can use tokens directly (unlike the canvas colours above).
  wsRegions.enableDragSelection({
    color: 'var(--accent-fill)',
  });

  wsRegions.on('region-created', (region) => {
    styleSelectionBand(region);
    // Only keep one active selection at a time
    wsRegions?.getRegions().forEach(r => {
      if (r !== region) r.remove();
    });
    activeRegion = region;
    playerState.selectedRange = {
      start: Math.round(region.start * 10) / 10,
      end: Math.round(region.end * 10) / 10
    };
  });

  wsRegions.on('region-updated', (region) => {
    activeRegion = region;
    playerState.selectedRange = {
      start: Math.round(region.start * 10) / 10,
      end: Math.round(region.end * 10) / 10
    };
  });

  const url = getTrackAudioUrl();
  ws.load(url);
}

/** Waveform rule: selection band = `accent-fill` fill, `accent-line` border, `radius-sm`. */
function styleSelectionBand(region: any) {
  const el = region.element as HTMLElement | null;
  if (!el) return;
  el.style.border = '1px solid var(--accent-line)';
  el.style.borderRadius = 'var(--radius-sm)';
}

function togglePlay() {
  if (!ws) return;
  ws.playPause();
}

function toggleLoop() {
  // PlaybackBar rule: loop with no selection explains how to make one.
  if (!playerState.selectedRange) {
    showToast('Select a passage on the waveform to loop it.');
    return;
  }
  playerState.isLooping = !playerState.isLooping;
  if (playerState.isLooping && activeRegion) {
    ws?.setTime(activeRegion.start);
    ws?.play();
  }
}

function clearSelection() {
  if (wsRegions) {
    wsRegions.clearRegions();
  }
  activeRegion = null;
  playerState.selectedRange = null;
  playerState.isLooping = false;
  isSaving.value = false;
}

function toggleTag(list: string[], item: string) {
  const idx = list.indexOf(item);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(item);
}

async function saveCurrentMoment() {
  if (!playerState.currentTrack || !playerState.selectedRange) return;
  const m = {
    id: crypto.randomUUID(),
    trackId: playerState.currentTrack.id,
    startSec: playerState.selectedRange.start,
    endSec: playerState.selectedRange.end,
    feelings: [...activeFeelings.value],
    qualities: [...activeQualities.value],
    note: momentNote.value.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db.moments.put(m);
  playerState.moments.push(m);
  showToast('Saved to My Moments');
  clearSelection();
  activeFeelings.value = [];
  activeQualities.value = [];
  momentNote.value = '';
}

async function switchStem(stem: string) {
  playerState.activeStem = stem;
  if (!playerState.currentTrack) return;

  const curT = playerState.currentTime;
  const wasPlaying = playerState.isPlaying;

  const stemUrl = stem === 'all'
    ? getTrackAudioUrl()
    : `http://127.0.0.1:8765/api/audio/stem/${encodeURIComponent(playerState.currentTrack.id)}/${encodeURIComponent(stem)}`;

  showToast(stem === 'all' ? 'Playing the full mix' : `Playing the ${stem} stem`);
  if (ws) {
    await ws.load(stemUrl);
    ws.setTime(curT);
    if (wasPlaying) ws.play();
  }
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** Selects a passage around the playhead, as a drag would (used by keyboard and ♡ in the bar). */
function selectAround(start: number, end: number) {
  if (!wsRegions) return;
  const d = playerState.duration;
  wsRegions.addRegion({ start: Math.max(0, start), end: Math.min(d, end), color: 'var(--accent-fill)' });
}

// Waveform accessibility rule: role="slider"; ←/→ seek ±5 s, Enter selects ±10 s around the
// playhead. Example: focus the waveform, press → twice to jump 10 s ahead.
function onWaveKey(e: KeyboardEvent) {
  if (!ws) return;
  const t = playerState.currentTime;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const next = Math.min(playerState.duration, Math.max(0, t + (e.key === 'ArrowRight' ? 5 : -5)));
    ws.setTime(next);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    selectAround(t - 10, t + 10);
  }
}

// PlaybackBar rule: ♡ saves the last 20 s. It selects that passage and opens the describe strip.
function saveLast20() {
  const t = playerState.currentTime;
  if (t < 3) {
    showToast('Play a little first, then save the last 20 seconds.');
    return;
  }
  selectAround(t - 20, t);
  isSaving.value = true;
}

// PlaybackBar rule: previous / next sit either side of play.
function stepTrack(dir: -1 | 1) {
  const list = playerState.tracks;
  if (!list.length) return;
  const i = list.findIndex(t => t.id === playerState.currentTrack?.id);
  const next = list[(i + dir + list.length) % list.length];
  if (next) selectTrack(next);
}

function onVolume(e: Event) {
  playerState.volume = Number((e.target as HTMLInputElement).value);
  ws?.setVolume(playerState.volume);
}

// Waveform rule: saved moments get a 5px `accent` dot centred under them.
const savedDots = computed(() => {
  const id = playerState.currentTrack?.id;
  const d = playerState.duration || 1;
  return playerState.moments
    .filter(m => m.trackId === id)
    .map(m => ({ id: m.id, left: `${(((m.startSec + m.endSec) / 2) / d) * 100}%` }));
});

// SelectionToolbar rule: centred under the selection, clamped to the waveform's edges.
watch(() => playerState.selectedRange, async (r) => {
  if (!r) return;
  await nextTick();
  const slot = toolbarSlotRef.value;
  const bar = toolbarRef.value;
  if (!slot || !bar) return;
  const w = slot.clientWidth;
  const centre = ((r.start + r.end) / 2 / (playerState.duration || 1)) * w;
  toolbarLeft.value = Math.min(Math.max(0, centre - bar.offsetWidth / 2), Math.max(0, w - bar.offsetWidth));
}, { deep: true });

watch(() => playerState.currentTrack, () => {
  initWaveSurfer();
});

onMounted(() => {
  initWaveSurfer();
});

onBeforeUnmount(() => {
  if (ws) {
    ws.destroy();
    ws = null;
  }
});
</script>

<template>
  <div class="player-wrapper">
    <!-- Layout rule "Now playing": cover (96px disc) + title + artist, centred. -->
    <div class="track-header">
      <div class="track-art"><Icon name="wave" :size="32" /></div>
      <div class="track-meta">
        <h2 class="song-title track-title">{{ playerState.currentTrack?.title || 'First Light' }}</h2>
        <p class="song-artist body">{{ playerState.currentTrack?.artist || 'Original demo' }}</p>
      </div>
      <!-- Chip rule: round chips for tabs, 28px with 12px text, pressed state via aria-pressed
           (e.g. <button aria-pressed="true">vocals</button>), never an accent fill. -->
      <div class="stem-selector" role="group" aria-label="Stem">
        <span class="stem-label caption">Stem</span>
        <button
          v-for="st in ['all', 'vocals', 'drums', 'bass', 'other']"
          :key="st"
          class="stem-btn caption"
          :aria-pressed="playerState.activeStem === st"
          @click="switchStem(st)"
        >
          {{ st }}
        </button>
      </div>
    </div>

    <!-- Waveform: seamless (no panel). Accessibility rule: role="slider" with arrow keys. -->
    <div
      class="waveform-box"
      role="slider"
      tabindex="0"
      aria-label="Song position"
      :aria-valuemin="0"
      :aria-valuemax="Math.round(playerState.duration)"
      :aria-valuenow="Math.round(playerState.currentTime)"
      :aria-valuetext="formatTime(playerState.currentTime)"
      @keydown="onWaveKey"
    >
      <div ref="containerRef" class="waveform-stage"></div>
      <div class="saved-dots" aria-hidden="true">
        <i v-for="d in savedDots" :key="d.id" :style="{ left: d.left }"></i>
      </div>
      <div ref="timelineRef" class="timeline-stage"></div>
    </div>

    <!-- SelectionToolbar rule: in the flow under the waveform (slot grows 0 -> 58px in 200 ms),
         centred on the selection; contents in order: range · Save · Loop · ✕. -->
    <div ref="toolbarSlotRef" class="toolbar-slot" :class="{ open: !!playerState.selectedRange }">
      <div
        v-if="playerState.selectedRange"
        ref="toolbarRef"
        class="selection-toolbar"
        role="toolbar"
        aria-label="Selected moment"
        :style="{ left: toolbarLeft + 'px' }"
      >
        <span class="range-display label">
          {{ formatTime(playerState.selectedRange.start) }} – {{ formatTime(playerState.selectedRange.end) }}
        </span>
        <button class="btn-tool body" :aria-expanded="isSaving" @click="isSaving = !isSaving">
          <Icon name="heart" :size="16" />
          Save
        </button>
        <button class="btn-tool body" :aria-pressed="playerState.isLooping" @click="toggleLoop">
          <Icon name="loop" :size="16" />
          Loop
        </button>
        <button class="btn-tool close" aria-label="Clear selection" @click="clearSelection">
          <Icon name="close" :size="14" />
        </button>
      </div>
    </div>

    <!-- DescribeStrip rule: three one-line rows (Feels · Love · Note) with Not now / Done,
         opening in the slot under the toolbar with a 280 ms grid-rows transition. -->
    <div class="ask-slot" :class="{ open: isSaving && !!playerState.selectedRange }">
      <div class="ask-slot-inner">
        <section v-if="playerState.selectedRange" class="save-drawer" aria-label="Describe this moment">
          <div class="drawer-sec">
            <span class="sec-label caption">Feels</span>
            <div class="tag-row">
              <button
                v-for="f in feelTags"
                :key="f"
                class="tag-pill caption"
                :aria-pressed="activeFeelings.includes(f)"
                @click="toggleTag(activeFeelings, f)"
              >
                {{ f }}
              </button>
            </div>
          </div>

          <div class="drawer-sec">
            <span class="sec-label caption">Love</span>
            <div class="tag-row">
              <button
                v-for="q in qualityTags"
                :key="q"
                class="tag-pill square caption"
                :aria-pressed="activeQualities.includes(q)"
                @click="toggleTag(activeQualities, q)"
              >
                {{ q }}
              </button>
            </div>
          </div>

          <div class="drawer-sec">
            <span class="sec-label caption">Note</span>
            <input
              v-model="momentNote"
              type="text"
              class="note-input body"
              aria-label="Optional note"
              placeholder="Optional — what did you notice?"
            />
            <button class="btn-ghost label" @click="isSaving = false">Not now</button>
            <button class="btn-commit-save label" @click="saveCurrentMoment">Done</button>
          </div>
        </section>
      </div>
    </div>

    <!-- PlaybackBar rule: grid 1fr auto 1fr; time left · ♡ prev play next loop · volume right.
         Seamless, sticky to the bottom; icon buttons carry aria-labels. -->
    <div class="playback-bar" aria-label="Playback">
      <div class="time-readout label">
        <b>{{ formatTime(playerState.currentTime) }}</b> / {{ formatTime(playerState.duration) }}
      </div>

      <div class="center-controls">
        <button class="icon-btn subtle" aria-label="Save the last 20 seconds" @click="saveLast20">
          <Icon name="heart" :size="20" />
        </button>
        <button class="icon-btn" aria-label="Previous" @click="stepTrack(-1)">
          <Icon name="prev" :size="20" />
        </button>
        <button class="play-btn" :aria-label="playerState.isPlaying ? 'Pause' : 'Play'" @click="togglePlay">
          <Icon :name="playerState.isPlaying ? 'pause' : 'play'" :size="20" />
        </button>
        <button class="icon-btn" aria-label="Next" @click="stepTrack(1)">
          <Icon name="next" :size="20" />
        </button>
        <button
          class="icon-btn subtle"
          aria-label="Loop selection"
          :aria-pressed="playerState.isLooping"
          @click="toggleLoop"
        >
          <Icon name="loop" :size="20" />
        </button>
      </div>

      <div class="right-controls">
        <Icon name="volume" :size="18" />
        <input
          type="range"
          class="volume"
          aria-label="Volume"
          min="0"
          max="1"
          step="0.01"
          :value="playerState.volume"
          @input="onVolume"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-wrapper {
  max-width: var(--content-max);
  margin: 0 auto;
  /* PlaybackBar rule: the column fills the viewport so the bar sits in its lower part. */
  min-height: calc(100vh - 2 * var(--space-5));
  display: flex;
  flex-direction: column;
  font-variant-numeric: tabular-nums;
}
.track-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-4);
  margin-top: var(--space-6);
}
.track-art {
  width: 96px;
  height: 96px;
  border-radius: var(--radius-pill);
  background: var(--bg-panel);
  border: 1px solid var(--line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-mute);
}
.song-title {
  margin: 0;
  color: var(--ink);
}
.song-artist {
  margin: var(--space-1) 0 0;
  color: var(--ink-sub);
}
.stem-selector {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-1);
}
.stem-label {
  color: var(--ink-mute);
  margin-right: var(--space-1);
}
.stem-btn {
  height: 28px;
  padding: 0 var(--space-3);
  background: none;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  color: var(--ink-sub);
  text-transform: capitalize;
  cursor: pointer;
  transition: background-color 150ms, border-color 150ms, color 150ms;
}
.stem-btn[aria-pressed='true'] {
  background: var(--chip-on);
  border-color: var(--chip-on-line);
  color: var(--ink);
}
.waveform-box {
  position: relative;
  margin-top: var(--space-7);
  border-radius: var(--radius-sm);
}
.waveform-stage {
  cursor: crosshair;
}
.saved-dots {
  position: relative;
  height: var(--space-3);
}
.saved-dots i {
  position: absolute;
  top: 3px;
  width: 5px;
  height: 5px;
  margin-left: -2.5px;
  border-radius: var(--radius-pill);
  background: var(--accent);
}
.timeline-stage {
  margin-top: var(--space-1);
}
.toolbar-slot {
  position: relative;
  height: 0;
  transition: height 200ms ease;
}
.toolbar-slot.open {
  height: 58px;
}
.selection-toolbar {
  position: absolute;
  top: var(--space-2);
  height: var(--hit-target);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: calc(var(--space-1) / 2);
  padding: 0 var(--space-1) 0 var(--space-3);
  background: var(--bg-panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-pop);
  white-space: nowrap;
}
.range-display {
  color: var(--ink-sub);
  padding-right: var(--space-3);
  margin-right: calc(var(--space-1) / 2);
  border-right: 1px solid var(--line-strong);
}
.btn-tool {
  height: 36px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: none;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--ink);
  padding: 0 var(--space-3);
  cursor: pointer;
}
.btn-tool:hover,
.btn-tool[aria-pressed='true'] {
  background: var(--bg-raise);
}
.btn-tool[aria-pressed='true'] {
  color: var(--accent);
}
.btn-tool.close {
  width: var(--space-6);
  padding: 0;
  justify-content: center;
  color: var(--ink-mute);
}
.ask-slot {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 280ms ease;
}
.ask-slot.open {
  grid-template-rows: 1fr;
}
.ask-slot-inner {
  overflow: hidden;
  min-height: 0;
}
.save-drawer {
  background: var(--bg-panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  padding: calc(var(--space-1) / 2) var(--space-3);
  margin-top: var(--space-2);
}
.drawer-sec {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 40px;
}
.drawer-sec + .drawer-sec {
  border-top: 1px solid var(--line);
}
.sec-label {
  flex: none;
  width: 40px;
  color: var(--ink-mute);
}
.tag-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1;
  min-width: 0;
}
.tag-pill {
  flex: none;
  height: 28px;
  padding: 0 var(--space-3);
  background: none;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  color: var(--ink-sub);
  cursor: pointer;
  transition: background-color 150ms, border-color 150ms, color 150ms;
}
.tag-pill.square {
  border-radius: var(--radius-sm);
}
.tag-pill[aria-pressed='true'] {
  background: var(--chip-on);
  border-color: var(--chip-on-line);
  color: var(--ink);
}
.note-input {
  flex: 1;
  min-width: 0;
  height: 30px;
  box-sizing: border-box;
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-3);
  color: var(--ink);
}
.note-input::placeholder {
  color: var(--ink-mute);
}
.btn-ghost {
  flex: none;
  height: 30px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-pill);
  background: none;
  color: var(--ink-sub);
  cursor: pointer;
}
/* Button rule "Primary": ink fill, on-ink text, weight 500, pill. */
.btn-commit-save {
  flex: none;
  height: 30px;
  padding: 0 var(--space-4);
  background: var(--ink);
  color: var(--on-ink);
  font-weight: 500;
  border: none;
  border-radius: var(--radius-pill);
  cursor: pointer;
}
.playback-bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-3);
  margin-top: auto;
  padding: var(--space-5) var(--space-5);
  position: sticky;
  bottom: 0;
  background: var(--bg);
}
.time-readout {
  color: var(--ink-mute);
  white-space: nowrap;
}
.time-readout b {
  font-weight: 400;
  color: var(--ink);
}
.center-controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.icon-btn {
  width: var(--hit-target);
  height: var(--hit-target);
  border: 0;
  border-radius: var(--radius-pill);
  background: none;
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.icon-btn.subtle {
  color: var(--ink-sub);
}
.icon-btn:hover {
  background: var(--bg-raise);
}
.icon-btn[aria-pressed='true'] {
  color: var(--accent);
}
/* PlaybackBar rule: play is 52px with a 1px ring at half `ink` (the `playhead` token). */
.play-btn {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--playhead);
  background: none;
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.right-controls {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-sub);
}
.volume {
  width: 110px;
  accent-color: var(--ink-sub);
}

/* Motion rule: respect reduced motion by removing the slot transitions. */
@media (prefers-reduced-motion: reduce) {
  .toolbar-slot,
  .ask-slot {
    transition: none;
  }
}
/* breakpoint-phone (600px): hide volume and the toolbar range; time left, controls right. */
@media (max-width: 600px) {
  .right-controls,
  .range-display {
    display: none;
  }
  .playback-bar {
    grid-template-columns: auto 1fr;
    padding: var(--space-4) 0;
    bottom: calc(var(--space-8) + var(--space-1));
  }
  .center-controls {
    justify-content: flex-end;
    gap: var(--space-1);
  }
}
</style>
