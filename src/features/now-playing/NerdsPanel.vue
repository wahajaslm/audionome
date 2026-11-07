<script setup lang="ts">
/**
 * Nerds: its own view next to Explore (strip button "Nerds"), in sync with the selected
 * passage or loop, else the whole song.
 *   header      Stats for nerds · this passage 1:10 – 1:22   (Follow playhead | Whole passage)
 *   curves      Bitrate (large) · Loudness · time — playhead and loop band; click / drag
 *   curves      + Blocks · Gain · Reservoir (MP3) / Shape (AAC): decoder fields per frame
 *   cards       Now · This passage · File (NerdCards.vue)
 *   Details     the File · Playback · Analysis columns as text (NerdStats.vue), folded
 */
import { computed, ref } from 'vue';
import { formatTime } from '../../ui/format';
import { usePlaybackStore } from '../../stores/playback';
import { useTimelineStore } from '../../stores/timeline';
import BitrateLanes from './BitrateLanes.vue';
import NerdStats from './NerdStats.vue';
import NerdCards from './NerdCards.vue';

const playback = usePlaybackStore();
const timeline = useTimelineStore();
/** Frames = 2 s around the playhead, one bar per frame (FRAME FIX). */
const zoom = ref<'frames' | 'live' | 'all'>('all');

/** The passage, or the whole song (the file's own length when it was read). */
const range = computed(() => playback.sel ?? { a: 0, b: timeline.bitrate?.durationSec || playback.duration || 1 });
const loud = computed(() => timeline.timeline?.mix ?? timeline.spectrum?.loud ?? null);
function loopRange(a: number, b: number): void {
  playback.beginSelection(); playback.updateSelection(a, b); playback.commitSelection();
  if (!playback.loop) playback.toggleLoop();
}
</script>

<template>
  <section class="panel" aria-label="Stats for nerds">
    <header class="head">
      <div>
        <h2 class="heading">Stats for nerds</h2>
        <div class="caption sub">{{ playback.sel ? 'this passage ' + formatTime(range.a) + ' – ' + formatTime(range.b) : 'whole song' }}</div>
      </div>
      <div class="seg" role="group" aria-label="Zoom">
        <button v-if="timeline.bitrate?.frames" type="button" :aria-pressed="zoom === 'frames'" @click="zoom = 'frames'">Frames</button>
        <button type="button" :aria-pressed="zoom === 'live'" @click="zoom = 'live'">Follow playhead</button>
        <button type="button" :aria-pressed="zoom === 'all'" @click="zoom = 'all'">Whole passage</button>
      </div>
    </header>
    <BitrateLanes :bitrate="timeline.bitrate" :loud="loud" :range="range" :sel="playback.sel" :t="playback.t" :zoom="zoom" @seek="s => playback.clickSeek(s)" @loop="loopRange" />
    <!-- At a glance: the frame now, this passage, the file (NerdCards.vue). -->
    <NerdCards :bitrate="timeline.bitrate" :t="playback.t" :range="range" :is-passage="!!playback.sel" />
    <details class="details">
      <summary>Details</summary>
      <NerdStats />
    </details>
  </section>
</template>

<style scoped>
.panel { margin-top: var(--space-3); padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--bg-panel); }
.head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-3); }
.heading { margin: 0; color: var(--ink); }
.sub { color: var(--ink-sub); margin-top: 2px; }
.seg { display: flex; gap: 4px; }
.seg button { height: 28px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: none; color: var(--ink-sub); font: 13px var(--font-sans); cursor: pointer; }
.seg button[aria-pressed='true'] { color: var(--ink); border-color: var(--ink-sub); }
.details { margin-top: var(--space-3); }
.details summary { cursor: pointer; color: var(--ink-sub); font-size: 13px; padding: 4px 0; }
.details summary:hover { color: var(--ink); }
@media (max-width: 600px) { .line { margin-left: 0; } }
</style>
