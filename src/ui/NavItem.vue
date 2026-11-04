<script setup lang="ts">
/**
 * NavItem (design system): one sidebar destination; becomes a tab below 820px.
 * Props: icon; label; short (tab-bar label); current (sets aria-current="page"); badge (count).
 * Emits native click. Current and hover use bg-raise; never an accent.
 */
import Icon, { type IconName } from './Icon.vue';

defineProps<{ icon: IconName; label: string; short: string; current?: boolean; badge?: number }>();
</script>

<template>
  <button type="button" class="nv body" :aria-current="current ? 'page' : undefined">
    <Icon :name="icon" :size="18" />
    <span class="nav-label">{{ label }}</span>
    <span class="nav-short caption">{{ short }}</span>
    <span v-if="badge" class="badge caption">{{ badge }}</span>
  </button>
</template>

<style scoped>
.nv {
  height: 42px;
  border: 0;
  background: none;
  border-radius: 10px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-sub);
  text-align: left;
  cursor: pointer;
  width: 100%;
}
.nv[aria-current='page'], .nv:hover { background: var(--bg-raise); color: var(--ink); }
.badge { margin-left: auto; color: var(--ink-mute); }
.nav-short { display: none; }
@media (max-width: 820px) {
  .nv { flex-direction: column; justify-content: center; height: 56px; gap: 2px; padding: 0 var(--space-1); }
  .nav-label, .badge { display: none; }
  .nav-short { display: block; }
  .nv[aria-current='page'] { background: none; }
}
</style>
