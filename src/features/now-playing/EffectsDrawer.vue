<script setup lang="ts">
/**
 * Effects drawer under the strip (core/effects.ts): presets in one row for most people, five
 * small controls for the rest. Changes are heard at once and remembered; Off brings the
 * original sound back. Karaoke needs the song's separated stems.
 */
import { computed } from 'vue';
import { PRESETS, type EffectParams, type PresetName } from '../../core/effects';
import { usePlaybackStore } from '../../stores/playback';
import { useTimelineStore } from '../../stores/timeline';

const playback = usePlaybackStore();
const timeline = useTimelineStore();
const p = computed(() => playback.effects);
const presets = Object.entries(PRESETS) as [Exclude<PresetName, 'custom'>, { label: string }][];

type Num = 'pan' | 'room' | 'echo' | 'bass' | 'treble';
const controls: { key: Num; label: string; min: number; max: number; step: number; show: (v: number) => string }[] = [
  { key: 'pan', label: 'Pan', min: -1, max: 1, step: 0.05, show: v => (v === 0 ? 'centre' : v < 0 ? 'L ' + Math.round(-v * 100) : 'R ' + Math.round(v * 100)) },
  { key: 'room', label: 'Room', min: 0, max: 1, step: 0.05, show: v => Math.round(v * 100) + '%' },
  { key: 'echo', label: 'Echo', min: 0, max: 1, step: 0.05, show: v => Math.round(v * 100) + '%' },
  { key: 'bass', label: 'Bass', min: -12, max: 12, step: 1, show: v => (v > 0 ? '+' : '') + v + ' dB' },
  { key: 'treble', label: 'Treble', min: -12, max: 12, step: 1, show: v => (v > 0 ? '+' : '') + v + ' dB' },
];
const set = (key: Num, e: Event) => playback.setControl(key, Number((e.target as HTMLInputElement).value) as EffectParams[Num]);
/** Double-click a control: back to neutral. */
const reset = (key: Num) => playback.setControl(key, 0);
const karaokeWaits = computed(() => p.value.karaoke && !timeline.full);
</script>

<template>
  <div class="fx" role="group" aria-label="Effects">
    <div class="presets">
      <button
        v-for="[name, pr] in presets"
        :key="name"
        type="button"
        class="chip"
        :aria-pressed="p.preset === name"
        @click="playback.applyPreset(name)"
      >{{ pr.label }}</button>
      <span v-if="p.preset === 'custom'" class="custom label">Your mix</span>
      <span v-if="karaokeWaits" class="custom label">Karaoke starts once the vocals are separated</span>
    </div>
    <div class="ctl">
      <label v-for="c in controls" :key="c.key" class="c" :class="{ dim: p.spin && c.key === 'pan' }" @dblclick="reset(c.key)">
        <span class="n label">{{ c.label }}</span>
        <input type="range" :min="c.min" :max="c.max" :step="c.step" :value="p[c.key]" :disabled="p.spin && c.key === 'pan'" :aria-valuetext="c.show(p[c.key])" @input="set(c.key, $event)" />
        <span class="v label">{{ c.key === 'pan' && p.spin ? 'circling' : c.show(p[c.key]) }}</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.fx { padding: var(--space-2) 0 var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); font-variant-numeric: tabular-nums; }
.presets { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.chip { height: 28px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: none; color: var(--ink-sub); font: 13px var(--font-sans); cursor: pointer; }
.chip:hover { color: var(--ink); }
.chip[aria-pressed='true'] { border-color: var(--accent); color: var(--accent); }
.custom { color: var(--ink-mute); margin-left: 4px; }
.ctl { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 4px var(--space-4); }
.c { display: grid; grid-template-columns: 48px 1fr 58px; align-items: center; gap: 8px; }
.c.dim { opacity: 0.5; }
.n { color: var(--ink-sub); }
.v { color: var(--ink-mute); text-align: right; }
input[type='range'] { width: 100%; accent-color: var(--accent); }
</style>
