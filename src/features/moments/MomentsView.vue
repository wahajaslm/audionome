<script setup lang="ts">
import { playerState, showToast, selectTrack } from '../../stores/player';
import { db } from '../../data/db';
import Icon from '../shell/Icon.vue';

async function deleteMoment(id: string) {
  await db.moments.delete(id);
  playerState.moments = playerState.moments.filter(m => m.id !== id);
  showToast('Removed from My Moments');
}

function playMoment(m: any) {
  const t = playerState.tracks.find(tr => tr.id === m.trackId);
  if (t) {
    selectTrack(t, m.startSec);
    playerState.activeView = 'player';
  } else {
    showToast('This song is no longer in your library.');
  }
}

function trackFor(m: any) {
  return playerState.tracks.find(tr => tr.id === m.trackId);
}

function formatTime(sec: number): string {
  const mm = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  return `${mm}:${ss < 10 ? '0' : ''}${ss}`;
}
</script>

<template>
  <div class="moments-container">
    <!-- Layout rule "Other pages": page title, one lead line, then an open list. -->
    <div class="moments-header">
      <h1 class="moments-title page-title">My Moments</h1>
      <p v-if="playerState.moments.length" class="moments-sub body">
        {{ playerState.moments.length }} {{ playerState.moments.length === 1 ? 'passage' : 'passages' }}
        you saved. Play one to open it in the player.
      </p>
      <p v-else class="moments-sub body">Passages you save from the player show up here.</p>
    </div>

    <div v-if="!playerState.moments.length" class="empty-box">
      <p class="body">No saved moments yet. Drag across the waveform to select a passage you love, then Save.</p>
      <button class="btn-go-player label" @click="playerState.activeView = 'player'">Open the player</button>
    </div>

    <!-- MomentRow rule: round play · song — artist · what it is and your note · tags · range ·
         duration, in an open list split by `line` hairlines (no cards). -->
    <ol v-else class="moments-grid">
      <li v-for="m in playerState.moments" :key="m.id" class="moment-row">
        <button class="btn-play-moment" aria-label="Play moment" @click="playMoment(m)">
          <Icon name="play" :size="12" />
        </button>

        <div class="moment-info">
          <div class="moment-song item">
            {{ trackFor(m)?.title || 'Unknown song' }}
            <span v-if="trackFor(m)?.artist" class="artist">— {{ trackFor(m)?.artist }}</span>
          </div>
          <div v-if="m.qualities?.length || m.note" class="moment-note label">
            <template v-if="m.qualities?.length">{{ m.qualities.join(', ') }}</template>
            <template v-if="m.qualities?.length && m.note"> · </template>
            <template v-if="m.note">“{{ m.note }}”</template>
          </div>
          <div v-if="m.feelings?.length" class="moment-tags">
            <span v-for="f in m.feelings" :key="f" class="chip caption">{{ f }}</span>
          </div>
        </div>

        <span class="moment-range label">{{ formatTime(m.startSec) }} – {{ formatTime(m.endSec) }}</span>
        <span class="duration label">{{ formatTime(m.endSec - m.startSec) }}</span>

        <button class="btn-del" aria-label="Remove moment" title="Remove moment" @click="deleteMoment(m.id)">
          <Icon name="close" :size="14" />
        </button>
      </li>
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
/* Button rule "Primary": ink fill, on-ink text, weight 500, pill (one per view). */
.btn-go-player {
  margin-top: var(--space-4);
  height: 38px;
  padding: 0 var(--space-4);
  background: var(--ink);
  color: var(--on-ink);
  border: none;
  font-weight: 500;
  border-radius: var(--radius-pill);
  cursor: pointer;
}
.moments-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.moment-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--line);
}
/* Button rule "Round play": 40px, line-strong ring. */
.btn-play-moment {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: var(--radius-pill);
  background: none;
  border: 1px solid var(--line-strong);
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.moment-info {
  flex: 1;
  min-width: 0;
}
.moment-song {
  color: var(--ink);
}
.artist {
  color: var(--ink-mute);
}
.moment-note {
  color: var(--ink-sub);
  margin-top: var(--space-1);
}
.moment-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-2);
}
.chip {
  color: var(--ink-sub);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-2);
}
.moment-range {
  color: var(--ink-mute);
  white-space: nowrap;
}
.duration {
  color: var(--ink);
  white-space: nowrap;
}
.btn-del {
  width: var(--hit-target);
  height: var(--hit-target);
  flex: none;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--ink-mute);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.btn-del:hover {
  background: var(--bg-raise);
  color: var(--ink);
}
/* MomentRow rule: below breakpoint-phone (600px) drop the range. */
@media (max-width: 600px) {
  .moment-range {
    display: none;
  }
}
</style>
