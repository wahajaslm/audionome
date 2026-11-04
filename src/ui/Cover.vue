<script setup lang="ts">
/**
 * Cover: the disc artwork beside the track title on Now playing (96px by default).
 * Props: size in px. Decorative (aria-hidden); the title next to it names the song.
 * Colours are the design tokens bg-panel / line-strong / ink.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 96 });
</script>

<template>
  <svg class="cover" :width="size" :height="size" viewBox="0 0 88 88" aria-hidden="true" focusable="false">
    <circle class="disc" cx="44" cy="44" r="43.5" />
    <g class="lines" fill="none" stroke-width="0.9">
      <path d="M12 50c10-14 20 6 32-8s20 6 32-8" stroke-opacity="0.55" />
      <path d="M12 57c10-14 20 6 32-8s20 6 32-8" stroke-opacity="0.25" />
      <path d="M12 43c10-14 20 6 32-8s20 6 32-8" stroke-opacity="0.25" />
    </g>
    <circle class="sun" cx="59" cy="28" r="5.5" fill-opacity="0.8" />
  </svg>
</template>

<style scoped>
.cover { flex: none; display: block; }
.disc { fill: var(--bg-panel); stroke: var(--line-strong); }
.lines { stroke: var(--ink); }
.sun { fill: var(--ink); }
</style>
