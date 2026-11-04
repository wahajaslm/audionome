<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useUiStore } from './stores/ui';
import { useAudioEngine } from './composables/useAudioEngine';
import { useAppBootstrap } from './composables/useAppBootstrap';
import { useMediaSession } from './composables/useMediaSession';
import AppSidebar from './features/shell/AppSidebar.vue';
import Toast from './ui/Toast.vue';
import PlaybackBar from './ui/PlaybackBar.vue';
import { usePlaybackStore } from './stores/playback';
import { useMomentFlowStore } from './stores/momentFlow';
import { useLibraryStore } from './stores/library';
import { useFileDrop } from './composables/useFileDrop';

// One audio engine for the whole app, created before any screen renders.
useAudioEngine();
useMediaSession();
useAppBootstrap();

const ui = useUiStore();
const { toast } = storeToRefs(ui);
const router = useRouter();
const playback = usePlaybackStore();
const flow = useMomentFlowStore();
const library = useLibraryStore();

// Drop audio files on any screen: same import as Library's "Import audio" button.
const { dragging } = useFileDrop(async files => {
  try {
    const added = await library.importFiles(files);
    if (added.length) router.push('/');
  } catch (err) {
    console.error(err);
    ui.notify('Import failed.');
  }
});

function onToastAction(): void {
  const to = toast.value?.actionTo;
  ui.dismissToast();
  if (to) router.push(to);
}
</script>

<template>
  <div class="app-layout">
    <AppSidebar />
    <main class="main-content">
      <RouterView />
    </main>
    <!-- One bottom player for every screen (Now playing, Library, Song anatomy, ...). -->
    <PlaybackBar
      :title="playback.currentTrack?.title || 'No track'"
      :artist="playback.currentTrack?.artist || 'Import audio in Library'"
      :current-time="playback.t"
      :duration="playback.duration"
      :playing="playback.playing"
      :loop="playback.loop && !!playback.sel"
      :volume="playback.volume"
      @open="router.push('/')"
      @save-last="flow.quickSave()"
      @prev="playback.seekBy(-15)"
      @toggle-play="playback.togglePlay()"
      @next="playback.seekBy(15)"
      @loop="playback.toggleLoop()"
      @volume="playback.setVolume"
      @scrub-start="playback.beginScrub()"
      @scrub="playback.scrubTo"
      @scrub-end="playback.endScrub"
      @step="playback.stepBy"
    />
    <div v-if="dragging" class="drop" aria-hidden="true">
      <div class="drop-box">
        <div class="heading">Drop to add</div>
        <div class="label">MP3, WAV, FLAC, OGG, M4A, AAC or Opus</div>
      </div>
    </div>
    <div v-if="toast" class="toast-slot">
      <Toast :message="toast.message" :action-label="toast.actionLabel" @action="onToastAction" />
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
  /* Bottom room for the fixed 76px playback bar. */
  padding: var(--space-5) var(--space-5) calc(76px + var(--space-5));
}
/* Drop overlay: covers the window while audio files are dragged over it. */
.drop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(14, 14, 16, 0.8); /* bg at 80% */
  pointer-events: none;
}
.drop-box {
  padding: var(--space-6) var(--space-7);
  border: 1px dashed var(--accent-line);
  border-radius: var(--radius-lg);
  background: var(--accent-fill);
  text-align: center;
  color: var(--ink);
}
.drop-box .label { color: var(--ink-sub); margin-top: var(--space-1); }
/* Toast rule: bottom centre, above the playback bar (desktop) or tab bar (phone). */
.toast-slot {
  position: fixed;
  bottom: calc(76px + var(--space-5));
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
}
/* Layout rule: below breakpoint-tabs (820px) the sidebar becomes a bottom tab bar, so leave
   room for it. Media queries cannot read CSS variables, so the token value is repeated here. */
@media (max-width: 820px) {
  .app-layout {
    flex-direction: column;
  }
  .main-content {
    /* Room for the tab bar (space-8) plus the compact 56px playback bar above it. */
    padding: var(--space-4) var(--space-4) calc(var(--space-8) + 56px + var(--space-5));
  }
}
</style>
