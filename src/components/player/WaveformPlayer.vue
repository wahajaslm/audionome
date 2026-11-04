<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import { playerState, showToast } from '../../stores/player';
import { db } from '../../data/db';

const containerRef = ref<HTMLDivElement | null>(null);
const timelineRef = ref<HTMLDivElement | null>(null);

let ws: WaveSurfer | null = null;
let wsRegions: RegionsPlugin | null = null;
let activeRegion: any = null;

const feelTags = ['♡ Love', 'Chills', 'Excitement', 'Nostalgia', 'Calm', 'Sadness'];
const qualityTags = ['Vocals', 'Melody', 'Harmony', 'Rhythm', 'Build-up', 'Atmosphere', 'Drop'];
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

  ws = WaveSurfer.create({
    container: containerRef.value,
    waveColor: '#45454B',
    progressColor: '#8EC5B8',
    cursorColor: '#DCDCE0',
    cursorWidth: 1,
    height: 140,
    barWidth: 2,
    barGap: 3,
    barRadius: 2,
    normalize: true,
    plugins: [
      wsRegions,
      ...(timelineRef.value ? [TimelinePlugin.create({ container: timelineRef.value, primaryLabelInterval: 5 })] : [])
    ]
  });

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
  wsRegions.enableDragSelection({
    color: 'rgba(142, 197, 184, 0.18)',
  });

  wsRegions.on('region-created', (region) => {
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

function togglePlay() {
  if (!ws) return;
  ws.playPause();
}

function toggleLoop() {
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
  showToast('Moment saved to My Moments');
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

  showToast(`Switching audio stem to: ${stem}`);
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
    <div class="track-header">
      <div class="track-art">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      </div>
      <div class="track-meta">
        <h2 class="song-title">{{ playerState.currentTrack?.title || 'First Light' }}</h2>
        <p class="song-artist">{{ playerState.currentTrack?.artist || 'Original demo' }}</p>
      </div>
      <div class="stem-selector">
        <span class="stem-label">Stem:</span>
        <button
          v-for="st in ['all', 'vocals', 'drums', 'bass', 'other']"
          :key="st"
          class="stem-btn"
          :class="{ active: playerState.activeStem === st }"
          @click="switchStem(st)"
        >
          {{ st }}
        </button>
      </div>
    </div>

    <!-- Waveform & Regions Container -->
    <div class="waveform-box">
      <div ref="containerRef" class="waveform-stage"></div>
      <div ref="timelineRef" class="timeline-stage"></div>
    </div>

    <!-- Moment Selection Action Bar -->
    <div v-if="playerState.selectedRange" class="selection-toolbar">
      <span class="range-display">
        Selection: {{ playerState.selectedRange.start }}s – {{ playerState.selectedRange.end }}s 
        ({{ Math.round((playerState.selectedRange.end - playerState.selectedRange.start) * 10) / 10 }}s)
      </span>
      <button class="btn-tool" :class="{ on: playerState.isLooping }" @click="toggleLoop">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m17 2 4 4-4 4"/>
          <path d="M3 11v-1a4 4 0 0 1 4-4h14"/>
          <path d="m7 22-4-4 4-4"/>
          <path d="M21 13v1a4 4 0 0 1-4 4H3"/>
        </svg>
        Loop
      </button>
      <button class="btn-tool" @click="isSaving = !isSaving">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Save Moment
      </button>
      <button class="btn-tool close" @click="clearSelection">✕</button>
    </div>

    <!-- Moment Annotation Drawer -->
    <div v-if="isSaving && playerState.selectedRange" class="save-drawer">
      <div class="drawer-sec">
        <span class="sec-label">Feelings:</span>
        <div class="tag-row">
          <button
            v-for="f in feelTags"
            :key="f"
            class="tag-pill"
            :class="{ sel: activeFeelings.includes(f) }"
            @click="toggleTag(activeFeelings, f)"
          >
            {{ f }}
          </button>
        </div>
      </div>

      <div class="drawer-sec">
        <span class="sec-label">Musical Reasons:</span>
        <div class="tag-row">
          <button
            v-for="q in qualityTags"
            :key="q"
            class="tag-pill"
            :class="{ sel: activeQualities.includes(q) }"
            @click="toggleTag(activeQualities, q)"
          >
            {{ q }}
          </button>
        </div>
      </div>

      <div class="drawer-sec">
        <input
          v-model="momentNote"
          type="text"
          class="note-input"
          placeholder="Optional note: what stood out in this passage?"
        />
        <button class="btn-commit-save" @click="saveCurrentMoment">Confirm & Save</button>
      </div>
    </div>

    <!-- Playback Controls Bar -->
    <div class="playback-bar">
      <div class="time-readout">
        {{ formatTime(playerState.currentTime) }} / {{ formatTime(playerState.duration) }}
      </div>

      <div class="center-controls">
        <button class="play-btn" @click="togglePlay">
          <svg v-if="!playerState.isPlaying" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16"/>
            <rect x="14" y="4" width="4" height="16"/>
          </svg>
        </button>
      </div>

      <div class="right-controls">
        <span v-if="playerState.isLooping" class="loop-badge">LOOPING</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-wrapper {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 16px;
}
.track-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
.track-art {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  background: var(--raise, #1B1B1F);
  border: 1px solid var(--line, #1F1F23);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sub, #A1A1A6);
}
.track-meta {
  flex: 1;
}
.song-title {
  margin: 0;
  font-size: 22px;
  font-weight: 500;
  color: var(--fg, #DCDCE0);
}
.song-artist {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--sub, #A1A1A6);
}
.stem-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}
.stem-label {
  font-size: 12px;
  color: var(--mute, #85858B);
}
.stem-btn {
  background: var(--raise, #1B1B1F);
  border: 1px solid var(--line, #1F1F23);
  color: var(--sub, #A1A1A6);
  font-size: 11px;
  border-radius: 6px;
  padding: 4px 8px;
  text-transform: capitalize;
  cursor: pointer;
}
.stem-btn.active {
  background: var(--accent, #8EC5B8);
  color: #0E0E10;
  font-weight: 600;
}
.waveform-box {
  background: var(--panel, #151518);
  border: 1px solid var(--line, #1F1F23);
  border-radius: 14px;
  padding: 16px;
  position: relative;
}
.waveform-stage {
  cursor: crosshair;
}
.timeline-stage {
  margin-top: 8px;
}
.selection-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--raise, #1B1B1F);
  border: 1px solid var(--line2, #2C2C31);
  border-radius: 10px;
  padding: 8px 14px;
  margin-top: 14px;
}
.range-display {
  font-size: 13px;
  color: var(--fg, #DCDCE0);
  font-variant-numeric: tabular-nums;
  margin-right: auto;
}
.btn-tool {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid var(--line2, #2C2C31);
  border-radius: 6px;
  color: var(--sub, #A1A1A6);
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}
.btn-tool.on {
  background: var(--accent, #8EC5B8);
  color: #0E0E10;
  font-weight: 600;
}
.btn-tool.close {
  padding: 6px 10px;
}
.save-drawer {
  background: var(--panel, #151518);
  border: 1px solid var(--line2, #2C2C31);
  border-radius: 12px;
  padding: 16px;
  margin-top: 12px;
}
.drawer-sec {
  margin-bottom: 12px;
}
.drawer-sec:last-child {
  display: flex;
  gap: 10px;
  margin-bottom: 0;
}
.sec-label {
  font-size: 12px;
  color: var(--mute, #85858B);
  display: block;
  margin-bottom: 6px;
}
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tag-pill {
  background: var(--raise, #1B1B1F);
  border: 1px solid var(--line, #1F1F23);
  border-radius: 14px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--sub, #A1A1A6);
  cursor: pointer;
}
.tag-pill.sel {
  border-color: var(--accent, #8EC5B8);
  color: var(--accent, #8EC5B8);
  background: rgba(142, 197, 184, 0.1);
}
.note-input {
  flex: 1;
  background: var(--bg, #0E0E10);
  border: 1px solid var(--line, #1F1F23);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--fg, #DCDCE0);
  font-size: 13px;
}
.btn-commit-save {
  background: var(--accent, #8EC5B8);
  color: #0E0E10;
  font-weight: 600;
  font-size: 13px;
  border: none;
  border-radius: 8px;
  padding: 0 16px;
  cursor: pointer;
}
.playback-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 24px;
  padding: 0 12px;
}
.time-readout {
  font-size: 13px;
  color: var(--sub, #A1A1A6);
  font-variant-numeric: tabular-nums;
  width: 120px;
}
.play-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 1px solid rgba(220, 220, 224, 0.4);
  background: var(--panel, #151518);
  color: var(--fg, #DCDCE0);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform .1s ease;
}
.play-btn:active {
  transform: scale(0.96);
}
.right-controls {
  width: 120px;
  display: flex;
  justify-content: flex-end;
}
.loop-badge {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent, #8EC5B8);
  background: rgba(142, 197, 184, 0.12);
  padding: 3px 8px;
  border-radius: 4px;
}
</style>

