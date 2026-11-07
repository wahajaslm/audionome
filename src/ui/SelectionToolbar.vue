<script setup lang="ts">
/**
 * SelectionToolbar: the one strip under the waveform (ONE STRIP FIX).
 *
 * It used to appear only after you selected a passage, so nobody found Loop, Explore or Save.
 * Now it is always there, in the same place: what you are hearing and how it fits your taste on
 * the left (the `info` slot), the controls on the right. With nothing selected the controls act
 * on the whole song; with a passage selected, on that passage.
 *   No selection:  D#m → G# · bar 21.1 · part A │ Whole song · …   Loop · Explore · ♡ · Effects
 *   Selection:     D#m → G# · bar 21.1 · part A │ 1:10 – 1:22 · …   ▶ · Loop · Explore · ♡ · Effects · ✕
 * Effects opens a drawer under the same strip (the `drawer` slot); nothing pops up.
 * Props: range (null = whole song); loop; playing; exploring; saved; effects (drawer open);
 *        effectsOn (an effect is active: the button is tinted); compare / original (the A/B
 *        button: shown when the song has a mix or version; pressed while Original plays).
 * Emits: play, loop, explore, nerds, save, effects, original, clear. Explore, Nerds, Save and
 * Effects are views: one is open at a time (ONE VIEW FIX, stores/momentFlow.ts).
 */
import Icon from './Icon.vue';
import { formatTime } from './format';

defineProps<{
  range: { a: number; b: number } | null; loop: boolean; playing: boolean; exploring: boolean; saved: boolean;
  effects: boolean; effectsOn: boolean;
  /** The song has a mix or a saved version: show the Original A/B button. */
  compare?: boolean;
  /** The untouched song is playing (the Original button is pressed). */
  original?: boolean;
  /** The Nerds view / the Save view is open (their buttons are pressed). */
  nerds?: boolean;
  saving?: boolean;
}>();
const emit = defineEmits<{ play: []; loop: []; explore: []; nerds: []; save: []; effects: []; original: []; clear: [] }>();
</script>

<template>
  <div class="strip">
    <div class="row" role="toolbar" :aria-label="range ? 'Selected passage' : 'This song'">
      <div class="info label">
        <!-- What is sounding now (chord · bar · part); the song or passage info follows. -->
        <span v-if="$slots.live" class="live"><slot name="live" /></span>
        <span class="what">{{ range ? formatTime(range.a) + ' – ' + formatTime(range.b) : 'Whole song' }}</span>
        <slot name="info" />
      </div>
      <div class="ctl">
        <button v-if="range" type="button" class="b ic" :aria-label="playing ? 'Pause' : 'Play this passage'" @click="emit('play')"><Icon :name="playing ? 'pause' : 'play'" :size="16" /></button>
        <button type="button" class="b" :aria-pressed="loop" :title="range ? 'Loop this passage' : 'Loop the bars around the playhead'" @click="emit('loop')"><Icon name="loop" :size="16" /><span class="t">Loop</span></button>
        <button type="button" class="b" :aria-pressed="exploring" :title="range ? 'Explore this passage' : 'Explore the whole song'" @click="emit('explore')"><Icon name="sparkle" :size="16" /><span class="t">Explore</span></button>
        <button type="button" class="b" :aria-pressed="!!nerds" title="Stats for nerds: codec, bitrate curve, playback" @click="emit('nerds')"><Icon name="stats" :size="16" /><span class="t">Nerds</span></button>
        <button type="button" class="b" :class="{ saved }" :aria-pressed="!!saving" :title="range ? 'Save this passage and say why' : 'Save the last 20 seconds'" @click="emit('save')"><Icon name="heart" :size="16" /><span class="t">{{ saved ? 'Saved' : 'Save' }}</span></button>
        <button type="button" class="b" :class="{ on: effectsOn }" :aria-pressed="effects" title="Effects for this song" @click="emit('effects')"><Icon name="fx" :size="16" /><span class="t">Effects</span></button>
        <button v-if="compare" type="button" class="b ab" :aria-pressed="original" title="Hear the song without your effects; press again to go back" @click="emit('original')">Original</button>
        <button v-if="range" type="button" class="x" aria-label="Clear selection" @click="emit('clear')"><Icon name="close" :size="14" /></button>
      </div>
    </div>
    <div class="drawer" :class="{ open: effects }"><div class="drawer-in"><slot name="drawer" /></div></div>
  </div>
</template>

<style scoped>
.strip { margin-top: var(--space-2); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
.row { display: flex; align-items: center; gap: var(--space-3); min-height: 44px; }
/* The info side shrinks first; the controls never move. */
.info { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 6px; color: var(--ink-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.what { color: var(--ink); flex: none; }
.live { flex: none; display: inline-flex; align-items: baseline; gap: 8px; padding-right: 10px; margin-right: 4px; border-right: 1px solid var(--line-strong); color: var(--ink-sub); }
.ctl { flex: none; display: flex; align-items: center; gap: 2px; }
.b {
  height: 34px; padding: 0 10px; border: 0; border-radius: var(--radius-sm); background: none; color: var(--ink);
  display: flex; align-items: center; gap: 7px; font: 14px var(--font-sans); cursor: pointer;
}
.b:hover { background: var(--bg-raise); }
.b.ic { width: 34px; padding: 0; justify-content: center; }
.b.saved, .b.on { color: var(--accent); }
.b.ab { font-size: 13px; border: 1px solid var(--line-strong); height: 28px; margin-left: 2px; }
.b[aria-pressed='true'] { background: var(--bg-raise); color: var(--accent); }
.x { width: 30px; height: 34px; border: 0; background: none; color: var(--ink-mute); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.x:hover { background: var(--bg-raise); color: var(--ink); }
.drawer { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 220ms ease; }
.drawer.open { grid-template-rows: 1fr; }
.drawer-in { overflow: hidden; }
@media (max-width: 700px) { .b .t { display: none; } .b { padding: 0 9px; } }
@media (prefers-reduced-motion: reduce) { .drawer { transition: none; } }
</style>
