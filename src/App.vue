<script setup lang="ts">
import { onMounted } from 'vue';
import { playerState, loadLibrary } from './stores/player';
import AppSidebar from './components/shell/AppSidebar.vue';
import WaveformPlayer from './components/player/WaveformPlayer.vue';
import StreamImporter from './components/stream/StreamImporter.vue';
import MusicDNARing from './components/dna/MusicDNARing.vue';
import MomentsList from './components/moments/MomentsList.vue';

onMounted(() => {
  loadLibrary();
});
</script>

<template>
  <div class="app-layout">
    <AppSidebar />

    <main class="main-content">
      <WaveformPlayer v-if="playerState.activeView === 'player'" />
      <StreamImporter v-else-if="playerState.activeView === 'stream'" />
      <MusicDNARing v-else-if="playerState.activeView === 'dna'" />
      <MomentsList v-else-if="playerState.activeView === 'moments'" />
      <div v-else-if="playerState.activeView === 'library'" class="library-view">
        <h1 class="view-title">Library</h1>
        <p class="view-sub">Imported audio tracks and streaming references.</p>
        <div class="track-list">
          <div
            v-for="t in playerState.tracks"
            :key="t.id"
            class="track-row"
            :class="{ active: playerState.currentTrack?.id === t.id }"
            @click="playerState.currentTrack = t; playerState.activeView = 'player'"
          >
            <div class="track-title-col">
              <span class="t-name">{{ t.title }}</span>
              <span class="t-artist">{{ t.artist }}</span>
            </div>
            <span class="t-source">{{ t.source }}</span>
            <span class="t-dur">{{ Math.round(t.durationSec || 32) }}s</span>
          </div>
        </div>
      </div>
    </main>

    <!-- Global Toast Notification -->
    <div v-if="playerState.toastMessage" class="toast-box">
      {{ playerState.toastMessage }}
    </div>
  </div>
</template>

<style>
:root {
  --bg: #0E0E10;
  --side: #0B0B0D;
  --panel: #151518;
  --raise: #1B1B1F;
  --line: #1F1F23;
  --line2: #2C2C31;
  --fg: #DCDCE0;
  --sub: #A1A1A6;
  --mute: #85858B;
  --off: #45454B;
  --accent: #8EC5B8;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color-scheme: dark;
}

body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--sans);
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
}
</style>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
}
.main-content {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: 24px;
}
.library-view {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 16px;
}
.view-title {
  font-size: 24px;
  font-weight: 500;
  margin: 0;
  color: var(--fg);
}
.view-sub {
  font-size: 13px;
  color: var(--sub);
  margin: 4px 0 24px;
}
.track-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.track-row {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all .15s ease;
}
.track-row:hover {
  background: var(--raise);
}
.track-row.active {
  border-color: var(--accent);
}
.track-title-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.t-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--fg);
}
.t-artist {
  font-size: 12px;
  color: var(--mute);
}
.t-source {
  font-size: 11px;
  color: var(--sub);
  background: var(--raise);
  padding: 2px 8px;
  border-radius: 6px;
  text-transform: uppercase;
}
.t-dur {
  font-size: 13px;
  color: var(--mute);
  font-variant-numeric: tabular-nums;
}
.toast-box {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--raise);
  color: var(--fg);
  border: 1px solid var(--line2);
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 13px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 1000;
}
</style>

