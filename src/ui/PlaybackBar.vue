<script setup lang="ts">
/**
 * PlaybackBar: the one bottom player, docked under every screen (same look as the original
 * player's Spotify-style bar).
 * Left: track (opens Now playing) + ♡ save the last 20 s. Centre: prev · play · next · loop over
 * a scrubber with times. Right: mute + volume. Below 820px: compact, above the tab bar.
 * Props: title, artist; currentTime, duration (seconds); playing; loop (pressed); volume (0–1).
 * Emits: open, save-last, prev, toggle-play, next, loop, volume(v 0–1),
 *        scrub-start, scrub(sec), scrub-end(sec), step(±5 s). The consumer logs the seek (SYNC FIX 8).
 */
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import { formatTime } from './format';

const props = defineProps<{
  title: string; artist: string; currentTime: number; duration: number; playing: boolean; loop: boolean; volume: number;
}>();
const emit = defineEmits<{
  open: []; 'save-last': []; prev: []; 'toggle-play': []; next: []; loop: []; volume: [v: number];
  'scrub-start': []; scrub: [sec: number]; 'scrub-end': [sec: number]; step: [delta: number];
}>();

const pct = computed(() => Math.min(100, Math.max(0, (props.currentTime / Math.max(1, props.duration)) * 100)));

// Scrubber: press, drag, release (pointer capture keeps the drag when the pointer leaves the rail).
const rail = ref<HTMLDivElement | null>(null);
const dragging = ref(false);
function at(e: PointerEvent): number {
  const r = rail.value!.getBoundingClientRect();
  return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))) * props.duration;
}
function down(e: PointerEvent) { dragging.value = true; rail.value?.setPointerCapture(e.pointerId); emit('scrub-start'); emit('scrub', at(e)); }
function move(e: PointerEvent) { if (dragging.value) emit('scrub', at(e)); }
function up(e: PointerEvent) { if (!dragging.value) return; dragging.value = false; emit('scrub-end', at(e)); }
function key(e: KeyboardEvent) {
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { emit('step', 5); e.preventDefault(); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { emit('step', -5); e.preventDefault(); }
}

// Mute remembers the last volume. Example: volume 0.8 → mute → 0 → unmute → 0.8.
let beforeMute = 0.8;
function toggleMute() {
  if (props.volume > 0) { beforeMute = props.volume; emit('volume', 0); } else emit('volume', beforeMute || 0.8);
}
</script>

<template>
  <footer class="bar" role="region" aria-label="Playback">
    <div class="left">
      <button type="button" class="art" aria-label="Open Now playing" @click="emit('open')"><Icon name="wave" :size="22" /></button>
      <div class="info">
        <button type="button" class="title" :title="title" @click="emit('open')">{{ title }}</button>
        <span class="artist" :title="artist">{{ artist }}</span>
      </div>
      <button type="button" class="ib" aria-label="Save the last 20 seconds as a moment" title="Save this moment" @click="emit('save-last')"><Icon name="heart" :size="18" /></button>
    </div>

    <div class="center">
      <div class="controls">
        <button type="button" class="ib" aria-label="Back 15 seconds" title="Back 15 s" @click="emit('prev')"><Icon name="prev" :size="18" /></button>
        <button type="button" class="play" :aria-label="playing ? 'Pause' : 'Play'" @click="emit('toggle-play')"><Icon :name="playing ? 'pause' : 'play'" :size="18" /></button>
        <button type="button" class="ib" aria-label="Forward 15 seconds" title="Forward 15 s" @click="emit('next')"><Icon name="next" :size="18" /></button>
        <button type="button" class="ib" :aria-pressed="loop" aria-label="Loop selection" title="Loop selection" @click="emit('loop')"><Icon name="loop" :size="18" /></button>
      </div>
      <div class="timeline">
        <span class="time">{{ formatTime(currentTime) }}</span>
        <div
          ref="rail"
          class="rail"
          :class="{ dragging }"
          role="slider"
          tabindex="0"
          aria-label="Song position"
          aria-valuemin="0"
          :aria-valuemax="Math.round(duration)"
          :aria-valuenow="Math.round(currentTime)"
          :aria-valuetext="formatTime(currentTime)"
          @pointerdown="down"
          @pointermove="move"
          @pointerup="up"
          @pointercancel="dragging = false"
          @keydown="key"
        >
          <div class="track">
            <div class="fill" :style="{ width: pct + '%' }"></div>
            <div class="handle" :style="{ left: pct + '%' }"></div>
          </div>
        </div>
        <span class="time">{{ formatTime(duration) }}</span>
      </div>
    </div>

    <div class="right">
      <button type="button" class="ib" :aria-label="volume > 0 ? 'Mute' : 'Unmute'" title="Volume" @click="toggleMute"><Icon name="volume" :size="18" /></button>
      <input
        class="vol"
        type="range"
        min="0"
        max="100"
        aria-label="Volume"
        :value="Math.round(volume * 100)"
        @input="emit('volume', Number(($event.target as HTMLInputElement).value) / 100)"
      />
    </div>
  </footer>
</template>

<style scoped>
/* Values copied from the original player's bar (#spotify-player-bar). */
.bar {
  position: fixed;
  bottom: 0;
  left: var(--sidebar-width);
  right: 0;
  height: 76px;
  z-index: 50;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--bg);
  font-family: var(--font-sans);
  user-select: none;
}
.left { display: flex; align-items: center; gap: 12px; width: 220px; min-width: 0; flex: none; z-index: 2; }
.art {
  width: 48px; height: 48px; flex: none; padding: 0;
  display: flex; align-items: center; justify-content: center;
  background: #141416; border: 1px solid var(--line); border-radius: 4px;
  color: #b3b3b3; cursor: pointer; transition: transform .12s ease, border-color .12s ease;
}
.art:hover { border-color: #555; transform: scale(1.02); }
.info { display: flex; flex-direction: column; gap: 2px; min-width: 0; max-width: 124px; flex: 1; }
.title {
  display: block; max-width: 100%; padding: 0; border: 0; background: none; text-align: left;
  font: 500 13px var(--font-sans); color: #fff; cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.title:hover { text-decoration: underline; }
.artist { font-size: 11px; color: #b3b3b3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.center {
  position: absolute; left: 50%; transform: translateX(-50%);
  width: 46%; max-width: 640px; min-width: 320px;
  display: flex; flex-direction: column; align-items: center; gap: 6px; z-index: 1;
}
.controls { display: flex; align-items: center; gap: 18px; }
.ib {
  position: relative; width: 32px; height: 32px; flex: none; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 50%; background: none; color: #b3b3b3; cursor: pointer;
  transition: color .15s ease;
}
.ib:hover { color: #fff; }
.ib[aria-pressed='true'] { color: #1db954; }
.ib[aria-pressed='true']::after {
  content: ''; position: absolute; bottom: 2px; width: 4px; height: 4px; border-radius: 50%; background: #1db954;
}
.play {
  width: 32px; height: 32px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 50%; background: #fff; color: #000; cursor: pointer;
  transition: transform .1s ease;
}
.play:hover { transform: scale(1.06); }
.play:active { transform: scale(.96); }

.timeline { display: flex; align-items: center; gap: 8px; width: 100%; }
.time { min-width: 34px; text-align: center; font-size: 11px; color: #a7a7a7; font-variant-numeric: tabular-nums; }
.rail { flex: 1; height: 14px; display: flex; align-items: center; cursor: pointer; touch-action: none; }
.track { position: relative; width: 100%; height: 4px; border-radius: 2px; background: #4d4d4d; }
.fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 2px; background: #fff; pointer-events: none; transition: background-color .15s ease; }
.handle {
  display: none; position: absolute; top: 50%; transform: translate(-50%, -50%);
  width: 12px; height: 12px; border-radius: 50%; background: #fff; box-shadow: 0 2px 4px rgba(0, 0, 0, .5); pointer-events: none;
}
.rail:hover .fill, .rail.dragging .fill { background: #1db954; }
.rail:hover .handle, .rail.dragging .handle { display: block; }

.right { display: flex; align-items: center; justify-content: flex-end; gap: 6px; width: 240px; min-width: 0; flex: none; z-index: 2; }
.vol { width: 93px; height: 4px; cursor: pointer; accent-color: #fff; }
.right:hover .vol { accent-color: #1db954; }

/* Phone / tablet: a compact floating bar above the tab bar (space-8 tall), no timeline or volume. */
@media (max-width: 820px) {
  .bar {
    left: 8px; right: 8px; height: 56px; padding: 0 12px;
    bottom: calc(var(--space-8) + env(safe-area-inset-bottom, 0px));
    border-radius: 8px; background: #181818;
  }
  .right, .timeline { display: none; }
  .center { position: static; transform: none; width: auto; min-width: 0; }
  .left { width: auto; max-width: 200px; }
}
</style>
