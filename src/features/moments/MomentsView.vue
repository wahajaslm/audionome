<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import type { Moment } from '../../data/types';
import { describeMoment } from '../../core/moments';
import { useLibraryStore } from '../../stores/library';
import { useMomentsStore } from '../../stores/moments';
import { usePlaybackStore } from '../../stores/playback';
import { useUiStore } from '../../stores/ui';
import MomentRow from '../../ui/MomentRow.vue';
import Button from '../../ui/Button.vue';

const library = useLibraryStore();
const momentsStore = useMomentsStore();
const playback = usePlaybackStore();
const ui = useUiStore();
const router = useRouter();
const { moments } = storeToRefs(momentsStore);

async function remove(id: string) {
  await momentsStore.remove(id);
  ui.notify('Removed from My Moments');
}

/** MomentRow rule: playing a moment opens it in the player with the passage selected. */
async function play(m: Moment) {
  if (!library.track(m.trackId)) { ui.notify('This song is no longer in your library.'); return; }
  router.push('/');
  await playback.openRange(m.startSec, m.endSec, m.trackId, false);
}

const isPlaying = (m: Moment) => playback.playing && playback.trackId === m.trackId && playback.t >= m.startSec - 0.5 && playback.t <= m.endSec + 0.5;
</script>

<template>
  <div class="moments-container">
    <!-- Layout rule "Other pages": page title, one lead line, then an open list. -->
    <div class="moments-header">
      <h1 class="moments-title page-title">My Moments</h1>
      <p v-if="moments.length" class="moments-sub body">
        {{ moments.length }} {{ moments.length === 1 ? 'passage' : 'passages' }}
        you saved. Play one to open it in the player.
      </p>
      <p v-else class="moments-sub body">Passages you save from the player show up here.</p>
    </div>

    <div v-if="!moments.length" class="empty-box">
      <p class="body">No saved moments yet. Drag across the waveform to select a passage you love, then Save.</p>
      <Button variant="primary" class="go" @click="router.push('/')">Open the player</Button>
    </div>

    <!-- MomentRow rule: round play · song — artist · what it is and your note · tags · range ·
         duration, in an open list split by `line` hairlines (no cards). -->
    <ol v-else class="moments-grid">
      <MomentRow
        v-for="m in moments"
        :key="m.id"
        :song="library.track(m.trackId)?.title || 'Unknown song'"
        :artist="library.track(m.trackId)?.artist"
        :start="m.startSec"
        :end="m.endSec"
        :what="describeMoment(m)"
        :note="m.note"
        :tags="[...(m.feelings || []), ...(m.qualities || [])]"
        :playing="isPlaying(m)"
        :song-duration="library.track(m.trackId)?.durationSec"
        @play="play(m)"
        @remove="remove(m.id)"
      />
    </ol>
  </div>
</template>

<style scoped>
.moments-container {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
  font-variant-numeric: tabular-nums;
}
.moments-header {
  margin-bottom: var(--space-5);
}
.moments-title {
  margin: 0;
  color: var(--ink);
}
.moments-sub {
  color: var(--ink-sub);
  margin: var(--space-2) 0 0;
}
/* An empty list is still an open list: a hairline row, no dashed box. */
.empty-box {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  padding: var(--space-6) 0;
  text-align: center;
  color: var(--ink-sub);
}
.empty-box p {
  margin: 0;
}
.go {
  margin-top: var(--space-4);
}
.moments-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
</style>
