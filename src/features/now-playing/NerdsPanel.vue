<script setup lang="ts">
/**
 * Nerds: its own view next to Explore (strip button "Nerds"), in sync with the selected
 * passage or loop, else the whole song.
 *   header      Stats for nerds · this passage 1:10 – 1:22   (Follow playhead | Whole passage)
 *   curves      Bitrate (large) · Loudness · time — playhead and loop band; click / drag
 *   this line   12.0 s · 118–139 kbps · avg 128 · 187 kB · now 131 kbps · looped 3×
 *   columns     File · Playback · Analysis (NerdStats.vue)
 */
import { computed, ref } from 'vue';
import { frameAt, frameLine, rangeStats } from '../../core/bitrate';
import { bytes } from '../../core/nerdStats';
import { formatTime } from '../../ui/format';
import { usePlaybackStore } from '../../stores/playback';
import { useTimelineStore } from '../../stores/timeline';
import BitrateLanes from './BitrateLanes.vue';
import NerdStats from './NerdStats.vue';

const playback = usePlaybackStore();
const timeline = useTimelineStore();
/** Frames = 2 s around the playhead, one bar per frame (FRAME FIX). */
const zoom = ref<'frames' | 'live' | 'all'>('all');

/** The passage, or the whole song (the file's own length when it was read). */
const range = computed(() => playback.sel ?? { a: 0, b: timeline.bitrate?.durationSec || playback.duration || 1 });
const loud = computed(() => timeline.timeline?.mix ?? timeline.spectrum?.loud ?? null);
const nowKbps = computed(() => {
  const br = timeline.bitrate;
  return br ? br.kbps[Math.min(br.kbps.length - 1, Math.max(0, Math.floor(playback.t / br.binSec)))] : null;
});
/** The line under the curves, for the passage (or the whole song). */
const line = computed(() => {
  const br = timeline.bitrate, r = range.value, out: string[] = [];
  out.push((r.b - r.a).toFixed(1) + ' s');
  const st = br ? rangeStats(br, r.a, r.b) : null;
  if (st) {
    out.push(st.min === st.max ? `${st.avg} kbps` : `${st.min}–${st.max} kbps · avg ${st.avg}`);
    out.push(bytes(st.bytes) + ' in the file');
  }
  if (nowKbps.value != null && br?.exact) out.push(`now ${nowKbps.value} kbps`);
  if (playback.loop && playback.sel) out.push(`looped ${playback.loops}×`);
  return out.join(' · ');
});
/** The frame under the playhead, live. */
const frameNow = computed(() => {
  const f = timeline.bitrate?.frames;
  return f ? frameLine(f, frameAt(f, playback.t)) : '';
});
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
    <p class="line label">{{ line }}</p>
    <p v-if="frameNow" class="line frame label">{{ frameNow }}</p>
    <NerdStats />
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
.line { margin: var(--space-2) 0 0 106px; color: var(--ink-sub); font-variant-numeric: tabular-nums; }
.line.frame { margin-top: 2px; color: var(--ink-mute); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
@media (max-width: 600px) { .line { margin-left: 0; } }
</style>
