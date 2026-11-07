<script setup lang="ts">
/**
 * Effects drawer under the strip (core/effects.ts). Effects belong to the loaded song.
 *
 *   Listen to   (Original) (My mix) (Late drive ✕) …        + Save version   ⤓ Download
 *   Start from  Concert hall · Stadium · Late night · Lo-fi · Slowed + reverb …
 *   SPACE ↺        TONE ↺         MOTION ↺        TAPE & STEMS ↺
 *   Pan ━━●━━      Bass ━━●━━     Chorus ●━━━     Tape speed ━━●━━
 *   …              …              …               Vinyl …  [Full mix | Karaoke | …]
 *
 * Original is an A/B switch (the mix is kept). Presets and controls change "My mix"; Save
 * version keeps it under a name; Download renders what plays as a WAV. Double-click a slider
 * to reset it; ↺ resets its group.
 */
import { computed, nextTick, ref } from 'vue';
import { GROUPS, NEUTRAL, PRESETS, STEM_MODES, TOGGLE_LABELS, effectsActive, groupActive, sliderFill, type Control, type PresetName } from '../../core/effects';
import { usePlaybackStore } from '../../stores/playback';
import { useTimelineStore } from '../../stores/timeline';

const playback = usePlaybackStore();
const timeline = useTimelineStore();
const p = computed(() => playback.effects);
const fx = computed(() => playback.fx);
const presets = (Object.entries(PRESETS) as [Exclude<PresetName, 'custom'>, { label: string }][]).filter(([n]) => n !== 'off');
const hasMix = computed(() => effectsActive(fx.value.mix));

const set = (c: Control, e: Event) => playback.setControl(c.key, Number((e.target as HTMLInputElement).value));
const reset = (c: Control) => playback.setControl(c.key, NEUTRAL[c.key]);
/** The slider track: accent from the neutral point to the value (bipolar controls fill from the middle). */
function fill(c: Control): string {
  const [a, b] = sliderFill(c, p.value[c.key]).map(x => (x * 100).toFixed(1) + '%');
  return `linear-gradient(to right, var(--line-strong) ${a}, var(--accent) ${a}, var(--accent) ${b}, var(--line-strong) ${b})`;
}
const stemWaits = computed(() => p.value.stem !== 'mix' && !timeline.full);

// Rename in place: double-click a version's name.
const renaming = ref<string | null>(null);
const nameInput = ref<HTMLInputElement[] | null>(null);
async function startRename(id: string): Promise<void> {
  renaming.value = id;
  await nextTick();
  nameInput.value?.[0]?.select();
}
function finishRename(id: string, e: Event): void {
  if (renaming.value !== id) return;
  playback.renameVersion(id, (e.target as HTMLInputElement).value);
  renaming.value = null;
}
</script>

<template>
  <div class="fx" role="group" aria-label="Effects for this song">
    <div class="line">
      <span class="lead label">Listen to</span>
      <div class="chips" role="radiogroup" aria-label="Version">
        <button type="button" class="chip" role="radio" :aria-checked="fx.listen === 'original'" @click="playback.listenTo('original')">Original</button>
        <button v-if="hasMix" type="button" class="chip" role="radio" :aria-checked="fx.listen === 'mix'" @click="playback.listenTo('mix')">My mix</button>
        <span v-for="v in fx.versions" :key="v.id" class="chip ver" :class="{ on: fx.listen === v.id }">
          <input
            v-if="renaming === v.id"
            ref="nameInput"
            class="rename"
            :value="v.name"
            maxlength="40"
            aria-label="Version name"
            @keydown.enter="finishRename(v.id, $event)"
            @keydown.esc="renaming = null"
            @blur="finishRename(v.id, $event)"
          />
          <button v-else type="button" role="radio" :aria-checked="fx.listen === v.id" title="Double-click to rename" @click="playback.listenTo(v.id)" @dblclick="startRename(v.id)">{{ v.name }}</button>
          <button type="button" class="del" :aria-label="'Delete ' + v.name" @click="playback.deleteVersion(v.id)">×</button>
        </span>
      </div>
      <div class="acts">
        <button type="button" class="act" :disabled="fx.listen === 'original'" title="Keep what plays now as a version of this song" @click="playback.saveVersion()">+ Save version</button>
        <button type="button" class="act" :disabled="playback.rendering" title="Download what plays now as a WAV file" @click="playback.downloadVersion()">{{ playback.rendering ? 'Rendering…' : '⤓ Download' }}</button>
      </div>
    </div>

    <div class="line">
      <span class="lead label">Start from</span>
      <div class="chips scroll">
        <button
          v-for="[name, pr] in presets"
          :key="name"
          type="button"
          class="chip"
          :aria-pressed="fx.listen === 'mix' && p.preset === name"
          @click="playback.applyPreset(name)"
        >{{ pr.label }}</button>
      </div>
    </div>

    <div class="groups" :class="{ quiet: fx.listen === 'original' }">
      <section v-for="g in GROUPS" :key="g.id" class="group" :aria-label="g.label">
        <header class="gh">
          <span class="gt">{{ g.label }}<span v-if="groupActive(p, g.id)" class="dot" aria-label="(on)"></span></span>
          <button v-if="groupActive(p, g.id)" type="button" class="greset" :aria-label="'Reset ' + g.label" title="Reset this group" @click="playback.resetFxGroup(g.id)">↺</button>
        </header>
        <label v-for="c in g.controls" :key="c.key" class="c" :class="{ dim: p.spin && c.key === 'pan' }" :title="'Double-click to reset ' + c.label.toLowerCase()" @dblclick="reset(c)">
          <span class="cl"><span class="n">{{ c.label }}</span><span class="v">{{ c.key === 'pan' && p.spin ? 'circling' : c.show(p[c.key]) }}</span></span>
          <input
            type="range"
            :min="c.min"
            :max="c.max"
            :step="c.step"
            :value="p[c.key]"
            :disabled="p.spin && c.key === 'pan'"
            :aria-valuetext="c.show(p[c.key])"
            :style="{ background: fill(c) }"
            @input="set(c, $event)"
          />
        </label>
        <button
          v-for="t in g.toggles"
          :key="t"
          type="button"
          class="chip small"
          :aria-pressed="p[t]"
          @click="playback.setControl(t, !p[t])"
        >{{ TOGGLE_LABELS[t] }}</button>
        <div v-if="g.id === 'tape'" class="stems">
          <span class="n">Stems</span>
          <div class="seg" role="radiogroup" aria-label="Stems">
            <button
              v-for="m in STEM_MODES"
              :key="m.id"
              type="button"
              role="radio"
              :aria-checked="p.stem === m.id"
              @click="playback.setControl('stem', m.id)"
            >{{ m.label }}</button>
          </div>
          <span v-if="stemWaits" class="note">Starts once this song's stems are separated.</span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.fx { padding: var(--space-3) 0 var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); font-variant-numeric: tabular-nums; }
.line { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.lead { flex: none; width: 76px; color: var(--ink-mute); }
.chips { display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap; }
/* Presets stay on one line; the row scrolls sideways, its edges fade. */
.chips.scroll { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; mask-image: linear-gradient(to right, transparent, #000 2%, #000 94%, transparent); }
.chips.scroll::-webkit-scrollbar { display: none; }
.acts { margin-left: auto; display: flex; gap: 4px; flex: none; }
.chip { height: 28px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: none; color: var(--ink-sub); font: 13px var(--font-sans); cursor: pointer; white-space: nowrap; flex: none; }
.chip:hover { color: var(--ink); }
.chip[aria-pressed='true'], .chip[aria-checked='true'], .chip.ver.on { border-color: var(--accent); color: var(--accent); }
.chip.small { height: 26px; font-size: 12px; align-self: flex-start; margin-top: 2px; }
.chip.ver { display: inline-flex; align-items: center; gap: 2px; padding: 0 4px 0 12px; }
.chip.ver button { border: 0; background: none; color: inherit; font: inherit; cursor: pointer; padding: 0; }
.chip.ver .del { width: 20px; height: 20px; border-radius: 50%; color: var(--ink-mute); }
.chip.ver .del:hover { background: var(--bg-raise); color: var(--ink); }
.rename { width: 110px; border: 0; background: none; color: var(--ink); font: 13px var(--font-sans); outline: none; }
.act { height: 30px; padding: 0 12px; border: 0; border-radius: var(--radius-sm); background: none; color: var(--ink); font: 13px var(--font-sans); cursor: pointer; }
.act:hover:not(:disabled) { background: var(--bg-raise); }
.act:disabled { color: var(--ink-mute); cursor: default; }

/* Four groups side by side, like a small mixer; two columns on narrow screens. */
.groups { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-5); padding-top: var(--space-3); border-top: 1px solid var(--line); transition: opacity 150ms ease; }
.groups.quiet { opacity: 0.55; }
.group { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.gh { display: flex; align-items: center; justify-content: space-between; height: 22px; }
.gt { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-sub); }
.dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); margin-left: 6px; vertical-align: 2px; }
.greset { border: 0; background: none; color: var(--ink-mute); cursor: pointer; font-size: 14px; width: 22px; height: 22px; border-radius: 50%; }
.greset:hover { background: var(--bg-raise); color: var(--ink); }
.c { display: flex; flex-direction: column; gap: 5px; }
.c.dim { opacity: 0.45; }
.cl { display: flex; justify-content: space-between; font-size: 12px; }
.n { color: var(--ink-sub); font-size: 12px; }
.v { color: var(--ink-mute); white-space: nowrap; }
.note { color: var(--ink-mute); font-size: 12px; }
.stems { display: flex; flex-direction: column; gap: 6px; }
.seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.seg button { height: 26px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: none; color: var(--ink-sub); font: 12px var(--font-sans); cursor: pointer; }
.seg button[aria-checked='true'] { border-color: var(--accent); color: var(--accent); }

/* Slim slider: a 4 px track filled from neutral to the value, a 14 px thumb. */
input[type='range'] { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 2px; margin: 4px 0; cursor: pointer; outline-offset: 6px; }
input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--ink); border: 2px solid var(--bg); box-shadow: 0 0 0 1px var(--line-strong); }
input[type='range']::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: var(--ink); border: 2px solid var(--bg); }
input[type='range']:disabled { cursor: default; }
@media (max-width: 900px) { .groups { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .lead { display: none; } .line { flex-wrap: wrap; } .acts { margin-left: 0; } }
</style>
