<script setup lang="ts">
/**
 * Artwork: a song's cover, square with rounded corners. Used on Now playing (hero), in the
 * playback bar and in Library rows.
 * Props: src (the file's own cover picture, a data URL) or art (what to draw it from, see
 * core/artwork.ts); size in px; radius (a token, default radius-sm).
 * Decorative (aria-hidden): the title next to it names the song.
 * The drawn cover: two-hue gradient from the song's key, a contour of its loudness over time,
 * thin rings for its tempo, and a small sun at its loudest moment.
 */
import { computed, useId } from 'vue';
import { artRecipe, type ArtInput } from '../core/artwork';

const props = withDefaults(defineProps<{ src?: string; art: ArtInput; size?: number; radius?: string }>(), {
  src: undefined, size: 96, radius: 'var(--radius-sm)',
});

const id = useId();
const r = computed(() => (props.src ? null : artRecipe(props.art)));
</script>

<template>
  <span class="art" :style="{ width: size + 'px', height: size + 'px', borderRadius: radius }" aria-hidden="true">
    <img v-if="src" :src="src" alt="" draggable="false" />
    <svg v-else-if="r" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs>
        <linearGradient :id="id + 'bg'" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" :stop-color="`hsl(${r.hue} ${r.sat}% ${r.light - 14}%)`" />
          <stop offset="1" :stop-color="`hsl(${r.hue2} ${r.sat}% 7%)`" />
        </linearGradient>
        <radialGradient :id="id + 'glow'" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" :stop-color="`hsl(${r.hue2} ${r.sat + 12}% ${r.light + 6}%)`" stop-opacity="0.55" />
          <stop offset="1" :stop-color="`hsl(${r.hue2} ${r.sat}% ${r.light}%)`" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" :fill="`url(#${id}bg)`" />
      <circle cx="50" cy="50" r="46" :fill="`url(#${id}glow)`" />
      <g fill="none" :stroke="`hsl(${r.hue} 30% 86%)`">
        <circle v-for="(ring, i) in r.rings" :key="i" cx="50" cy="50" :r="ring" stroke-width="0.35" :stroke-opacity="0.16 - i * 0.02" />
      </g>
      <path :d="r.contour" :fill="`hsl(${r.hue2} ${r.sat + 8}% ${r.light + 10}%)`" fill-opacity="0.28"
            :stroke="`hsl(${r.hue} 40% 84%)`" stroke-width="0.7" stroke-opacity="0.9" stroke-linejoin="round" />
      <path :d="r.contour" fill="none" :stroke="`hsl(${r.hue} 40% 84%)`" stroke-width="0.9" stroke-opacity="0.35"
            transform="translate(50 50) scale(0.58) translate(-50 -50)" />
      <circle :cx="r.sun.x" :cy="r.sun.y" r="2.4" :fill="`hsl(${r.hue} 35% 92%)`" />
    </svg>
  </span>
</template>

<style scoped>
.art {
  flex: none;
  display: block;
  overflow: hidden;
  position: relative;
  background: var(--bg-panel);
}
/* Hairline edge over the picture, so a dark cover does not melt into the page. */
.art::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07); }
.art img, .art svg { display: block; width: 100%; height: 100%; object-fit: cover; }
</style>
