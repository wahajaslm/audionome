<script setup lang="ts">
import { playerState } from '../../stores/player';
import Icon from './Icon.vue';

// NavItem rule: the five places in README order (Now playing, Library, My Moments, Discover,
// My Music DNA). "Stream & Web" sits in Discover's slot with the compass icon.
// `short` is the label used when the sidebar becomes the bottom tab bar (< 820px).
const navItems = [
  { id: 'player', label: 'Now playing', short: 'Playing', icon: 'wave' },
  { id: 'library', label: 'Library', short: 'Library', icon: 'library' },
  { id: 'moments', label: 'My Moments', short: 'Moments', icon: 'heart' },
  { id: 'stream', label: 'Stream & Web', short: 'Stream', icon: 'compass' },
  { id: 'dna', label: 'My Music DNA', short: 'DNA', icon: 'dna' },
] as const;

function setView(view: any) {
  playerState.activeView = view;
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand label">MUSIC DNA</div>

    <nav class="nav-menu" aria-label="Main">
      <!-- NavItem rule: current item is marked aria-current="page" (styled by that attribute,
           e.g. <button aria-current="page">Now playing</button>), not by an .active class. -->
      <button
        v-for="item in navItems"
        :key="item.id"
        class="nav-btn body"
        :aria-current="playerState.activeView === item.id ? 'page' : undefined"
        @click="setView(item.id)"
      >
        <Icon :name="item.icon" :size="18" />
        <span class="nav-label">{{ item.label }}</span>
        <span class="nav-short caption">{{ item.short }}</span>
        <!-- NavItem rule: optional count on the right in ink-mute. The old accent "NEW" badge
             was removed: the accent means "a moment you chose" only. -->
        <span v-if="item.id === 'moments' && playerState.moments.length" class="badge caption">
          {{ playerState.moments.length }}
        </span>
      </button>
    </nav>

    <!-- NavItem rule: the mini player shows only when away from the player and returns to
         Now playing. It is a real <button> (accessibility rule), not a clickable <div>. -->
    <button v-if="playerState.activeView !== 'player'" class="mini-player" @click="setView('player')">
      <span class="mini-art"><Icon name="wave" :size="18" /></span>
      <span class="mini-text">
        <span class="mini-title body">{{ playerState.currentTrack?.title || 'First Light' }}</span>
        <span class="mini-artist caption">{{ playerState.currentTrack?.artist || 'Demo' }}</span>
      </span>
    </button>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  flex: none;
  height: 100vh;
  position: sticky;
  top: 0;
  background: var(--bg-side);
  border-right: 1px solid var(--line);
  padding: var(--space-5) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  box-sizing: border-box;
}
.brand {
  /* Letter-spaced brand mark as in the NavItem preview (weight 600 + .14em tracking). */
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--ink-sub);
  padding: 0 var(--space-3);
}
.nav-menu {
  display: flex;
  flex-direction: column;
  gap: calc(var(--space-1) / 2);
}
.nav-btn {
  height: 42px;
  border: 0;
  background: none;
  border-radius: var(--radius-sm);
  padding: 0 var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-sub);
  cursor: pointer;
  text-align: left;
}
.nav-btn:hover,
.nav-btn[aria-current='page'] {
  background: var(--bg-raise);
  color: var(--ink);
}
.nav-short {
  display: none;
}
.badge {
  margin-left: auto;
  color: var(--ink-mute);
  font-variant-numeric: tabular-nums;
}
.mini-player {
  margin-top: auto;
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  border: 1px solid var(--line);
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.mini-art {
  width: var(--space-6);
  height: var(--space-6);
  flex: none;
  border-radius: var(--radius-pill);
  background: var(--bg-raise);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-sub);
}
.mini-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.mini-title {
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mini-artist {
  color: var(--ink-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* NavItem rule: below breakpoint-tabs (820px; media queries cannot read CSS variables) the
   same five items become a bottom tab bar on bg-side, icon above a short label, 52px tall,
   padded by the safe-area inset. */
@media (max-width: 820px) {
  .sidebar {
    position: fixed;
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    width: auto;
    height: auto;
    border-right: 0;
    border-top: 1px solid var(--line);
    padding: var(--space-1) var(--space-2) calc(var(--space-1) + env(safe-area-inset-bottom, 0px));
    gap: 0;
    flex-direction: column-reverse;
  }
  .brand {
    display: none;
  }
  .nav-menu {
    flex-direction: row;
    justify-content: space-around;
  }
  .nav-btn {
    height: 52px;
    flex-direction: column;
    justify-content: center;
    gap: calc(var(--space-1) / 2);
    padding: 0 var(--space-3);
  }
  .nav-btn:hover,
  .nav-btn[aria-current='page'] {
    background: none;
  }
  .nav-label,
  .badge {
    display: none;
  }
  .nav-short {
    display: block;
  }
  /* Mini player sits above the tabs on phones. */
  .mini-player {
    margin: 0 0 var(--space-1);
  }
}
</style>
