<script setup lang="ts">
import { playerState } from '../../stores/player';

const navItems = [
  { id: 'player', label: 'Now playing', icon: 'i-wave' },
  { id: 'stream', label: 'Stream & Web', icon: 'i-globe' },
  { id: 'moments', label: 'My Moments', icon: 'i-heart' },
  { id: 'dna', label: 'My Music DNA', icon: 'i-dna' },
  { id: 'library', label: 'Library', icon: 'i-lib' },
];

function setView(view: any) {
  playerState.activeView = view;
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">MUSIC DNA</div>

    <nav class="nav-menu">
      <button
        v-for="item in navItems"
        :key="item.id"
        class="nav-btn"
        :class="{ active: playerState.activeView === item.id }"
        @click="setView(item.id)"
      >
        <span>{{ item.label }}</span>
        <span v-if="item.id === 'moments' && playerState.moments.length" class="badge">
          {{ playerState.moments.length }}
        </span>
        <span v-if="item.id === 'stream'" class="badge new-badge">NEW</span>
      </button>
    </nav>

    <!-- Mini Now Playing Card in Sidebar -->
    <div class="mini-player" @click="setView('player')">
      <div class="mini-art">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      </div>
      <div class="mini-text">
        <span class="mini-title">{{ playerState.currentTrack?.title || 'First Light' }}</span>
        <span class="mini-artist">{{ playerState.currentTrack?.artist || 'Demo' }}</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 244px;
  flex: none;
  height: 100vh;
  position: sticky;
  top: 0;
  background: var(--side, #0B0B0D);
  border-right: 1px solid var(--line, #1F1F23);
  padding: 28px 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 28px;
  box-sizing: border-box;
}
.brand {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .14em;
  color: var(--sub, #A1A1A6);
  padding: 0 10px;
}
.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-btn {
  height: 42px;
  border: 0;
  background: none;
  border-radius: 10px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--sub, #A1A1A6);
  cursor: pointer;
  text-align: left;
  transition: all .15s ease;
}
.nav-btn:hover {
  background: var(--raise, #1B1B1F);
  color: var(--fg, #DCDCE0);
}
.nav-btn.active {
  background: var(--raise, #1B1B1F);
  color: var(--fg, #DCDCE0);
  font-weight: 500;
}
.badge {
  margin-left: auto;
  font-size: 11px;
  color: var(--mute, #85858B);
}
.new-badge {
  color: #0E0E10;
  background: var(--accent, #8EC5B8);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
  font-size: 9px;
}
.mini-player {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  background: var(--panel, #151518);
  border: 1px solid var(--line, #1F1F23);
  cursor: pointer;
}
.mini-art {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--raise, #1B1B1F);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sub, #A1A1A6);
}
.mini-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.mini-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--fg, #DCDCE0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mini-artist {
  font-size: 11px;
  color: var(--mute, #85858B);
}
</style>

