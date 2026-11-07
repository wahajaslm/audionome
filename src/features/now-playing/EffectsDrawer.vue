<script setup lang="ts">
/**
 * Effects drawer under the strip (core/effects.ts).
 *   Row 1  presets, one tap: Concert hall · Stadium · Late night · Lo-fi · Slowed + reverb …
 *   Row 2  four groups as tabs (a dot = something in it is on) · Reset
 *   Row 3  the chosen group's controls
 * Changes are heard at once and remembered; Off brings the original sound back.
 * Double-click a control to put it back to neutral.
 */
import { computed } from 'vue';
import { GROUPS, NEUTRAL, PRESETS, STEM_MODES, TOGGLE_LABELS, groupActive, type Control, type PresetName } from '../../core/effects';
import { usePlaybackStore } from '../../stores/playback';
import { useTimelineStore } from '../../stores/timeline';

const playback = usePlaybackStore();
const timeline = useTimelineStore();
const p = computed(() => playback.effects);
const presets = Object.entries(PRESETS) as [Exclude<PresetName, 'custom'>, { label: string }][];

/** The open group, remembered between visits (playback store). */
const tab = computed(() => playback.effectsTab);
const pick = playback.setEffectsTab;
const group = computed(() => GROUPS.find(g => g.id === tab.value)!);

const set = (c: Control, e: Event) => playback.setControl(c.key, Number((e.target as HTMLInputElement).value));
const reset = (c: Control) => playback.setControl(c.key, NEUTRAL[c.key]);
const stemWaits = computed(() => p.value.stem !== 'mix' && !timeline.full);
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
      <span v-if="p.preset === 'custom'" class="note label">Your mix</span>
    </div>

    <div class="tabs" role="tablist" aria-label="Effect groups">
      <button
        v-for="g in GROUPS"
        :key="g.id"
        type="button"
        role="tab"
        class="tab"
        :aria-selected="tab === g.id"
        @click="pick(g.id)"
      >{{ g.label }}<span v-if="groupActive(p, g.id)" class="dot" aria-label="(on)"></span></button>
      <button type="button" class="reset label" @click="playback.applyPreset('off')">Reset all</button>
    </div>

    <div class="ctl" role="tabpanel" :aria-label="group.label">
      <label
        v-for="c in group.controls"
        :key="c.key"
        class="c"
        :class="{ dim: p.spin && c.key === 'pan' }"
        :title="'Double-click to reset ' + c.label.toLowerCase()"
        @dblclick="reset(c)"
      >
        <span class="n label">{{ c.label }}</span>
        <input type="range" :min="c.min" :max="c.max" :step="c.step" :value="p[c.key]" :disabled="p.spin && c.key === 'pan'" :aria-valuetext="c.show(p[c.key])" @input="set(c, $event)" />
        <span class="v label">{{ c.key === 'pan' && p.spin ? 'circling' : c.show(p[c.key]) }}</span>
      </label>
      <button
        v-for="t in group.toggles"
        :key="t"
        type="button"
        class="chip toggle"
        :aria-pressed="p[t]"
        @click="playback.setControl(t, !p[t])"
      >{{ TOGGLE_LABELS[t] }}</button>
      <div v-if="tab === 'tape'" class="stems">
        <span class="n label">Stems</span>
        <button
          v-for="m in STEM_MODES"
          :key="m.id"
          type="button"
          class="chip"
          :aria-pressed="p.stem === m.id"
          @click="playback.setControl('stem', m.id)"
        >{{ m.label }}</button>
        <span v-if="stemWaits" class="note label">starts once this song's stems are separated</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fx { padding: var(--space-2) 0 var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); font-variant-numeric: tabular-nums; }
.stems { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
/* Presets stay on one line (slim); the row scrolls sideways when it is wider than the strip. */
.presets { display: flex; align-items: center; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px;
  mask-image: linear-gradient(to right, transparent, #000 2%, #000 92%, transparent); }
.presets::-webkit-scrollbar { display: none; }
.stems { grid-column: 1 / -1; }
.chip { height: 28px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: none; color: var(--ink-sub); font: 13px var(--font-sans); cursor: pointer; white-space: nowrap; }
.chip:hover { color: var(--ink); }
.chip[aria-pressed='true'] { border-color: var(--accent); color: var(--accent); }
.toggle { justify-self: start; }
.note { color: var(--ink-mute); margin-left: 4px; }
.tabs { display: flex; align-items: center; gap: 2px; border-bottom: 1px solid var(--line); }
.tab { position: relative; height: 32px; padding: 0 12px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--ink-sub); font: 13px var(--font-sans); cursor: pointer; margin-bottom: -1px; }
.tab:hover { color: var(--ink); }
.tab[aria-selected='true'] { color: var(--ink); border-bottom-color: var(--accent); }
.dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); margin-left: 6px; vertical-align: 2px; }
.reset { margin-left: auto; border: 0; background: none; color: var(--ink-mute); cursor: pointer; font: inherit; }
.reset:hover { color: var(--ink); }
.ctl { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 6px var(--space-5); align-items: center; padding-top: 2px; }
.c { display: grid; grid-template-columns: 70px 1fr 76px; align-items: center; gap: 8px; }
.c.dim { opacity: 0.5; }
.n { color: var(--ink-sub); }
.v { color: var(--ink-mute); text-align: right; white-space: nowrap; }
input[type='range'] { width: 100%; accent-color: var(--accent); }
</style>
