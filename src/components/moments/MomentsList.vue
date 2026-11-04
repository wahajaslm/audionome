<script setup lang="ts">
import { playerState, showToast, selectTrack } from '../../stores/player';
import { db } from '../../data/db';

async function deleteMoment(id: string) {
  await db.moments.delete(id);
  playerState.moments = playerState.moments.filter(m => m.id !== id);
  showToast('Moment removed');
}

function playMoment(m: any) {
  const t = playerState.tracks.find(tr => tr.id === m.trackId);
  if (t) {
    selectTrack(t, m.startSec);
    playerState.activeView = 'player';
  } else {
    showToast('Associated track is not in library');
  }
}
</script>

<template>
  <div class="moments-container">
    <div class="moments-header">
      <div>
        <h1 class="moments-title">My Saved Moments</h1>
        <p class="moments-sub">Your personal collection of musical passages and emotional memories.</p>
      </div>
      <span class="count-pill">{{ playerState.moments.length }} Moments</span>
    </div>

    <div v-if="!playerState.moments.length" class="empty-box">
      <p>No saved moments yet. Drag across the player waveform to capture a 15-second passage you love.</p>
      <button class="btn-go-player" @click="playerState.activeView = 'player'">Go to Player</button>
    </div>

    <div v-else class="moments-grid">
      <div v-for="m in playerState.moments" :key="m.id" class="moment-row">
        <button class="btn-play-moment" @click="playMoment(m)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </button>

        <div class="moment-info">
          <div class="moment-passage">
            Passage: {{ m.startSec }}s – {{ m.endSec }}s 
            <span class="duration">({{ Math.round((m.endSec - m.startSec) * 10) / 10 }}s)</span>
          </div>
          <div v-if="m.feelings?.length || m.qualities?.length" class="moment-tags">
            <span v-for="f in m.feelings" :key="f" class="chip feel">{{ f }}</span>
            <span v-for="q in m.qualities" :key="q" class="chip qual">{{ q }}</span>
          </div>
          <div v-if="m.note" class="moment-note">"{{ m.note }}"</div>
        </div>

        <button class="btn-del" title="Delete moment" @click="deleteMoment(m.id)">✕</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.moments-container {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 16px;
}
.moments-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}
.moments-title {
  font-size: 24px;
  font-weight: 500;
  margin: 0;
  color: var(--fg, #DCDCE0);
}
.moments-sub {
  font-size: 13px;
  color: var(--sub, #A1A1A6);
  margin: 4px 0 0;
}
.count-pill {
  font-size: 12px;
  color: var(--sub, #A1A1A6);
  background: var(--raise, #1B1B1F);
  border: 1px solid var(--line, #1F1F23);
  padding: 4px 12px;
  border-radius: 12px;
}
.empty-box {
  background: var(--panel, #151518);
  border: 1px dashed var(--line2, #2C2C31);
  border-radius: 14px;
  padding: 48px 24px;
  text-align: center;
  color: var(--mute, #85858B);
}
.btn-go-player {
  margin-top: 16px;
  background: var(--accent, #8EC5B8);
  color: #0E0E10;
  border: none;
  font-weight: 600;
  font-size: 13px;
  border-radius: 8px;
  padding: 8px 18px;
  cursor: pointer;
}
.moments-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.moment-row {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--panel, #151518);
  border: 1px solid var(--line, #1F1F23);
  border-radius: 12px;
  padding: 14px 18px;
}
.btn-play-moment {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--raise, #1B1B1F);
  border: 1px solid var(--line2, #2C2C31);
  color: var(--accent, #8EC5B8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.moment-info {
  flex: 1;
}
.moment-passage {
  font-size: 14px;
  font-weight: 500;
  color: var(--fg, #DCDCE0);
  font-variant-numeric: tabular-nums;
}
.duration {
  font-size: 12px;
  color: var(--mute, #85858B);
}
.moment-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}
.chip.feel {
  background: rgba(142, 197, 184, 0.12);
  color: var(--accent, #8EC5B8);
}
.chip.qual {
  background: var(--raise, #1B1B1F);
  color: var(--sub, #A1A1A6);
}
.moment-note {
  font-size: 12px;
  color: var(--sub, #A1A1A6);
  font-style: italic;
  margin-top: 4px;
}
.btn-del {
  background: none;
  border: none;
  color: var(--mute, #85858B);
  cursor: pointer;
  padding: 4px 8px;
  font-size: 14px;
}
.btn-del:hover {
  color: #ff6b6b;
}
</style>

