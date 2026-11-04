<script setup lang="ts">
/**
 * Design-system icon set ("Iconography"): line icons on a 24px grid, 1.5px stroke,
 * round caps and joins, `currentColor`. Filled only for transport glyphs (play, pause,
 * previous, next). Paths are copied from reference/music-dna/player/index.html.
 *
 * Example: <Icon name="heart" :size="16" /> draws the Save heart in the text colour.
 */
const ICONS = {
  wave: '<path d="M3 12h1M6.5 8v8M10 5v14M13.5 9v6M17 6v12M20.5 11v2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  library: '<path d="M5 4v16M10 4v16M14.5 4.5l5 15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  compass: '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></g>',
  dna: '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 2c0 5 10 7 10 10s-10 5-10 10"/><path d="M17 2c0 5-10 7-10 10s10 5 10 10"/><path d="M8.6 5h6.8M10.2 8.6h3.6M10.2 15.4h3.6M8.6 19h6.8"/></g>',
  prev: '<path d="M6 5v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M19 5 9 12l10 7z" fill="currentColor"/>',
  next: '<path d="M18 5v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5 5l10 7-10 7z" fill="currentColor"/>',
  play: '<path d="M7.5 5v14l12-7z" fill="currentColor"/>',
  pause: '<rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor"/>',
  loop: '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></g>',
  sparkle: '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15.5l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z"/></g>',
  volume: '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></g>',
  close: '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
} as const;

export type IconName = keyof typeof ICONS;

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 18 });
</script>

<template>
  <!-- Decorative: the button around it carries the text or aria-label. -->
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
    v-html="ICONS[name]"
  ></svg>
</template>

<style scoped>
.icon {
  flex: none;
  display: block;
}
</style>
