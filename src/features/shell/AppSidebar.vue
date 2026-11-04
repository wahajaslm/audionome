<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useMomentsStore } from '../../stores/moments';
import { useLibraryStore } from '../../stores/library';
import { type IconName } from '../../ui/Icon.vue';
import NavItem from '../../ui/NavItem.vue';
import { COLLECTIONS } from '../../core/moments';
import { useListeningStore } from '../../stores/listening';

// NavItem rule: the five places in README order (Now playing, Library, My Moments, Discover,
// My Music DNA), then Collections. `short` is the tab-bar label (< 820px). Settings and Feature
// analysis are secondary links on desktop; on phones they are reached from My Music DNA.
const navItems: { to: string; label: string; short: string; icon: IconName }[] = [
  { to: '/', label: 'Now playing', short: 'Playing', icon: 'wave' },
  { to: '/library', label: 'Library', short: 'Library', icon: 'library' },
  { to: '/moments', label: 'My Moments', short: 'Moments', icon: 'heart' },
  { to: '/discover', label: 'Discover', short: 'Discover', icon: 'compass' },
  { to: '/dna', label: 'My Music DNA', short: 'DNA', icon: 'dna' },
];

const route = useRoute();
const router = useRouter();
const library = useLibraryStore();
const { moments } = storeToRefs(useMomentsStore());
const { learning } = storeToRefs(useListeningStore());
const collectionCurrent = (i: number) => route.path === '/moments' && Number(route.query.c) === i + 1;
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

    <!-- Shell rule: Collections follow the five places (desktop only). -->
    <nav class="secondary" aria-label="Collections">
      <div class="sec-title caption">Collections</div>
      <button
        v-for="(c, i) in COLLECTIONS"
        :key="c"
        type="button"
        class="sec-link label"
        :aria-current="collectionCurrent(i) ? 'page' : undefined"
        @click="router.push({ path: '/moments', query: { c: String(i + 1) } })"
      >{{ c }}</button>
    </nav>
    <nav class="secondary" aria-label="More">
      <button type="button" class="sec-link label" :aria-current="route.path === '/settings' ? 'page' : undefined" @click="router.push('/settings')">
        Settings<span v-if="!learning" class="paused caption">Learning paused</span>
      </button>
      <button type="button" class="sec-link label" :aria-current="route.path === '/admin' ? 'page' : undefined" @click="router.push('/admin')">Feature analysis</button>
    </nav>

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
.secondary { display: flex; flex-direction: column; gap: 2px; }
.sec-title { color: var(--ink-mute); padding: 0 var(--space-3) var(--space-1); }
.sec-link {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-2);
  min-height: 34px; padding: 0 var(--space-3); border: 0; border-radius: var(--radius-sm);
  background: none; color: var(--ink-sub); text-align: left; cursor: pointer;
}
.sec-link:hover, .sec-link[aria-current='page'] { background: var(--bg-raise); color: var(--ink); }
.paused { color: var(--ink-mute); }

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
  .brand, .secondary {
    display: none;
  }
  .nav-menu {
    flex-direction: row;
    justify-content: space-around;
  }
}
</style>
