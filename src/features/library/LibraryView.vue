<script setup lang="ts">
/**
 * Library (phase 1: list and play). Import, analysis controls and deletion are still in the
 * classic player and move here in phase 2.
 */
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import type { PlayableTrack } from '../../core/library';
import { useLibraryStore } from '../../stores/library';
import { usePlaybackStore } from '../../stores/playback';
import { formatTime } from '../../ui/format';

const library = useLibraryStore();
const playback = usePlaybackStore();
const router = useRouter();
const { tracks } = storeToRefs(library);

async function open(t: PlayableTrack) {
  router.push('/');
  if (playback.trackId !== t.id) await playback.changeTrack(t, true);
}
</script>

<template>
  <div class="library-view">
    <!-- Layout rule "Other pages": page title, one lead line, then open lists. -->
    <h1 class="view-title page-title">Library</h1>
    <p class="view-sub body">Songs you imported and streams you opened.</p>
    <!-- Principle 3 "Seamless, not boxed": rows split by `line` hairlines, no cards. -->
    <ol class="track-list">
      <li v-for="t in tracks" :key="t.id">
        <button
          class="track-row"
          :aria-current="playback.trackId === t.id ? 'true' : undefined"
          @click="open(t)"
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
</template>

<style scoped>
.library-view { max-width: var(--content-max); margin: 0 auto; padding: var(--space-6) var(--space-4); }
.view-title { margin: 0; color: var(--ink); }
.view-sub { color: var(--ink-sub); margin: var(--space-2) 0 var(--space-5); }
.track-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.track-list li { border-bottom: 1px solid var(--line); }
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
.track-row:hover, .track-row[aria-current='true'] { background: var(--bg-raise); }
.track-title-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.t-name { color: var(--ink); }
.t-artist { color: var(--ink-mute); }
.t-source { color: var(--ink-sub); border: 1px solid var(--line-strong); padding: 0 var(--space-2); border-radius: var(--radius-sm); }
.t-dur { color: var(--ink-mute); }
</style>
