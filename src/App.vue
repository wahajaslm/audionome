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

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
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
        <!-- Layout rule "Other pages": page title, one lead line, then open lists. -->
        <h1 class="view-title page-title">Library</h1>
        <p class="view-sub body">Songs you imported and streams you opened.</p>
        <!-- Principle 3 "Seamless, not boxed": rows split by `line` hairlines, no cards.
             Accessibility rule: every control is a real <button> (was a clickable <div>). -->
        <ol class="track-list">
          <li v-for="t in playerState.tracks" :key="t.id">
            <button
              class="track-row"
              :aria-current="playerState.currentTrack?.id === t.id ? 'true' : undefined"
              @click="playerState.currentTrack = t; playerState.activeView = 'player'"
            >
              <span class="track-title-col">
                <span class="t-name item">{{ t.title }}</span>
                <span class="t-artist label">{{ t.artist }}</span>
              </span>
              <span class="t-source caption">{{ t.source }}</span>
              <span class="t-dur label">{{ formatTime(t.durationSec || 32) }}</span>
            </button>
          </li>
        </ol>
      </div>
    </main>

    <!-- Toast rule: role="status" so screen readers announce it; one sentence, bottom centre. -->
    <div v-if="playerState.toastMessage" class="toast-box body" role="status">
      {{ playerState.toastMessage }}
    </div>
  </div>
</template>

<style>
/* Tokens come from src/tokens.css (imported in main.ts). Only app-wide base rules live here. */
:root {
  color-scheme: dark;
}

body {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
}

/* Accessibility rule "Focus ring: 1px ink outline, 2px offset" — e.g. Tab onto a nav item. */
:focus-visible {
  outline: 1px solid var(--ink);
  outline-offset: 2px;
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
  padding: var(--space-5);
}
.library-view {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
}
.view-title {
  margin: 0;
  color: var(--ink);
}
.view-sub {
  color: var(--ink-sub);
  margin: var(--space-2) 0 var(--space-5);
}
.track-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.track-list li {
  border-bottom: 1px solid var(--line);
}
.track-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  background: none;
  border: 0;
  border-radius: var(--radius-sm);
  padding: var(--space-4) var(--space-3);
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.track-row:hover,
.track-row[aria-current='true'] {
  background: var(--bg-raise);
}
.track-title-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.t-name {
  color: var(--ink);
}
.t-artist {
  color: var(--ink-mute);
}
.t-source {
  color: var(--ink-sub);
  border: 1px solid var(--line-strong);
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
}
.t-dur {
  color: var(--ink-mute);
}
.toast-box {
  position: fixed;
  /* Toast rule: above the playback bar, never over the waveform. */
  bottom: calc(var(--space-8) + var(--space-7));
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-raise);
  color: var(--ink);
  border: 1px solid var(--line-strong);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-pop);
  z-index: 1000;
}
/* Layout rule: below breakpoint-tabs (820px) the sidebar becomes a bottom tab bar, so leave
   room for it. Media queries cannot read CSS variables, so the token value is repeated here. */
@media (max-width: 820px) {
  .app-layout {
    flex-direction: column;
  }
  .main-content {
    padding: var(--space-4) var(--space-4) calc(var(--space-8) + var(--space-5));
  }
}
</style>
