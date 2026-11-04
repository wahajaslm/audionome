<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useMomentsStore } from '../../stores/moments';
import { usePlaybackStore } from '../../stores/playback';
import { useLibraryStore } from '../../stores/library';
import Icon, { type IconName } from '../../ui/Icon.vue';
import NavItem from '../../ui/NavItem.vue';
import ProgressRail from '../../ui/ProgressRail.vue';

// NavItem rule: the five places in README order (Now playing, Library, My Moments, Discover,
// My Music DNA). "Stream & Web" sits in Discover's slot with the compass icon until the
// Discover screen is ported (phase 2). `short` is the tab-bar label (< 820px).
const navItems: { to: string; label: string; short: string; icon: IconName }[] = [
  { to: '/', label: 'Now playing', short: 'Playing', icon: 'wave' },
  { to: '/library', label: 'Library', short: 'Library', icon: 'library' },
  { to: '/moments', label: 'My Moments', short: 'Moments', icon: 'heart' },
  { to: '/stream', label: 'Stream & Web', short: 'Stream', icon: 'compass' },
  { to: '/dna', label: 'My Music DNA', short: 'DNA', icon: 'dna' },
];

const route = useRoute();
const router = useRouter();
const playback = usePlaybackStore();
const library = useLibraryStore();
const { moments } = storeToRefs(useMomentsStore());
const onPlayer = computed(() => route.path === '/');
const badge = (to: string) => (to === '/moments' ? moments.value.length : to === '/library' ? library.tracks.length : undefined);
</script>

<template>
  <aside class="sidebar">
    <div class="brand label">MUSIC DNA</div>

    <nav class="nav-menu" aria-label="Main">
      <NavItem
        v-for="item in navItems"
        :key="item.to"
        :icon="item.icon"
        :label="item.label"
        :short="item.short"
        :current="route.path === item.to"
        :badge="badge(item.to)"
        @click="router.push(item.to)"
      />
    </nav>

    <!-- NavItem rule: the mini player shows only when away from the player and returns to
         Now playing. The rail scrubs the song (SYNC FIX 8: the seek logs where the drag began). -->
    <div v-if="!onPlayer" class="mini">
      <div class="mini-player">
        <button class="mini-open" aria-label="Open Now playing" @click="router.push('/')">
          <span class="mini-art"><Icon name="wave" :size="18" /></span>
          <span class="mini-text">
            <span class="mini-title body">{{ playback.currentTrack?.title || 'No track' }}</span>
            <span class="mini-artist caption">{{ playback.currentTrack?.artist || 'Import audio' }}</span>
          </span>
        </button>
        <button class="mini-play" :aria-label="playback.playing ? 'Pause' : 'Play'" @click="playback.togglePlay()">
          <Icon :name="playback.playing ? 'pause' : 'play'" :size="16" />
        </button>
      </div>
      <ProgressRail
        :current-time="playback.t"
        :duration="playback.duration"
        @scrub-start="playback.beginScrub()"
        @scrub="playback.scrubTo"
        @scrub-end="playback.endScrub"
        @step="playback.stepBy"
      />
    </div>
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
.mini {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.mini-player {
  width: 100%;
  box-sizing: border-box;
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
.mini-open {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.mini-play {
  border: 0;
  background: none;
  cursor: pointer;
  width: var(--space-6);
  height: var(--space-6);
  flex: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink);
}
.mini-play:hover {
  background: var(--bg-raise);
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
  /* Mini player sits above the tabs on phones. */
  .mini {
    margin: 0 0 var(--space-1);
  }
}
</style>
