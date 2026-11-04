<script setup lang="ts">
/**
 * Explore this moment: switch between separated stems (all / vocals / drums / bass / other),
 * see what the analysis measured for the selected passage, and save it with musical reasons.
 * Port of index.html's Explore panel. Stems are served by the local analysis service.
 * LIVE EXPLORE FIX: the facts and measures follow the playhead window by window while the
 * passage plays or loops (core/diagnostics.ts liveWindow), instead of freezing on its first window.
 */
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlaybackStore } from '../../stores/playback';
import { useMomentFlowStore } from '../../stores/momentFlow';
import { useIntelligenceStore } from '../../stores/intelligence';
import { useLibraryStore } from '../../stores/library';
import { inSelection, liveWindow, measuresAt, passageSummary } from '../../core/diagnostics';
import { FEELINGS, QUALITIES } from '../../core/moments';
import DescribeStrip from '../../ui/DescribeStrip.vue';
import Chip from '../../ui/Chip.vue';
import Button from '../../ui/Button.vue';
import { formatTime } from '../../ui/format';

const playback = usePlaybackStore();
const flow = useMomentFlowStore();
const intelligence = useIntelligenceStore();
const library = useLibraryStore();
const { sel, activeStem, t, loop, loops, trackId } = storeToRefs(playback);
const { feel, love, note } = storeToRefs(flow);

const STEMS = ['all', 'vocals', 'drums', 'bass', 'other'];
const STEM_INFO: Record<string, { title: string; sub: string }> = {
  all: { title: 'Full arrangement & mix', sub: 'Interplay of vocal melody, bassline, drum groove, and accompaniment' },
  vocals: { title: 'Vocals & expression', sub: 'Singing style, pitch movement, breathiness, and vocal intensity' },
  drums: { title: 'Rhythm & groove', sub: 'Drum patterns, tempo, syncopation, fills, and transient beat grid' },
  bass: { title: 'Bassline & harmonic root', sub: 'Low-frequency harmonic foundation, bass rhythm, and groove interaction' },
  other: { title: 'Instrumental accompaniment', sub: 'Explore harmony, instrumental texture, guitar/synths/piano, and transitions' },
};

const analysis = computed(() => intelligence.currentAnalysis);
const segs = computed(() => analysis.value?.segments ?? []);
/** The analysis window centred nearest the playhead (LIVE SYNC FIX). */
const live = computed(() => liveWindow(segs.value, t.value));
/** Every window the selection touches, for the strip under the header. */
const windows = computed(() => (sel.value ? segs.value.map((s, i) => ({ s, i })).filter(({ s }) => inSelection(s, sel.value!)) : []));
/** Measures blended to the playhead: recomputed every frame while playing. */
const measures = computed(() => (segs.value.length ? measuresAt(segs.value, t.value) : []));
/** Exactly the selected passage (LOOP SYNC FIX): averages, key, tempo and its chords in order. */
const passage = computed(() => (sel.value ? passageSummary(segs.value, sel.value) : null));
/** The passage's chords, with the one sounding now marked. */
const chords = computed(() => (passage.value?.chords ?? []).map(c => ({ ...c, now: t.value >= c.from && t.value < c.to })));
/** Passage average per measure, drawn as a tick on the live bar. */
const avgLevel = (key: string) => passage.value?.measures.find(m => m.key === key)?.level;
const analyzingStep = computed(() => (trackId.value ? library.analyzing[trackId.value] : undefined));
/** Measured values for the live window. */
const facts = computed(() => {
  const an = analysis.value;
  if (!sel.value) return [];
  const desc = live.value?.s.descriptors;
  const dims = desc?.dimensions ?? an?.musicalDimensions;
  const key = passage.value?.key ?? desc?.key ?? dims?.melodyHarmony?.key;
  // The passage's chords are shown in time order below; the song-level progression only when there are none.
  const chordsText = passage.value?.chords.length ? '' : dims?.melodyHarmony?.chords?.join(' → ');
  const tempo = passage.value?.tempoBpm ?? desc?.tempoBpm ?? dims?.rhythmGroove?.tempoBpm;
  const inst = desc?.topInstruments?.length ? desc.topInstruments.join(', ') : dims?.instrumentationTimbre?.topInstruments?.join(', ');
  const stems = desc?.activeStems ? desc.activeStems.join(' + ') : 'all stems';
  return [
    key && 'Key · ' + key,
    chordsText && 'Chords · ' + chordsText,
    tempo && tempo + ' BPM',
    inst && 'Instruments · ' + inst,
    stems && stems + ' active',
  ].filter(Boolean) as string[];
});
const info = computed(() => STEM_INFO[activeStem.value] ?? { title: 'Full arrangement', sub: 'Explore musical layers' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Measure value as text. Example: brightness 2873.4 → "2873 Hz"; vocals 0.57 → "57%". */
function show(key: string, v: number): string {
  if (key === 'brightness_hz') return Math.round(v) + ' Hz';
  if (key === 'vocal_presence') return Math.round(v * 100) + '%';
  return v.toFixed(2);
}
/** Clicking a window jumps there (kept inside the selection, so the loop keeps going). */
function jump(start: number) { if (sel.value) playback.clickSeek(Math.max(start, sel.value.a)); }
</script>

<template>
  <section v-if="sel" class="panel" aria-label="Explore this moment">
    <div class="head">
      <h2 class="heading">Explore this moment</h2>
      <span class="label rng">
        {{ formatTime(sel.a) }} — {{ formatTime(sel.b) }}
        <template v-if="live"> · <span class="now">now {{ formatTime(live.s.startSec) }}–{{ formatTime(live.s.endSec) }}</span></template>
        <template v-if="loop"> · loop {{ loops + 1 }}</template>
      </span>
    </div>
    <div v-if="windows.length > 1" class="strip" aria-label="Analysis windows in this passage">
      <button
        v-for="w in windows"
        :key="w.i"
        type="button"
        class="win caption"
        :aria-current="live?.i === w.i ? 'true' : undefined"
        @click="jump(w.s.startSec)"
      >{{ formatTime(w.s.startSec) }}</button>
    </div>
    <div class="row">
      <span class="lbl caption">Layers</span>
      <div class="chips">
        <Chip v-for="s in STEMS" :key="s" size="sm" :pressed="activeStem === s" @click="playback.switchStem(s)">{{ cap(s) }}</Chip>
      </div>
    </div>
    <div class="about">
      <div class="item">{{ info.title }}</div>
      <div class="label sub">{{ info.sub }}</div>
      <div v-if="facts.length" class="facts">
        <span v-for="f in facts" :key="f" class="fact caption">{{ f }}</span>
      </div>
      <div v-if="chords.length" class="chords" aria-label="Chords in this passage; the highlighted one is playing">
        <span class="caption mlbl">Chords</span>
        <span v-for="(ch, i) in chords" :key="i" class="chord caption" :class="{ now: ch.now }" :title="formatTime(ch.from) + '–' + formatTime(ch.to)">{{ ch.chord }}</span>
      </div>
      <div v-if="measures.length" class="measures">
        <div v-for="m in measures" :key="m.key" class="m">
          <span class="caption mlbl">{{ m.label }}</span>
          <span class="mbar">
            <span class="mfill" :style="{ width: Math.round(m.level * 100) + '%' }"></span>
            <span v-if="avgLevel(m.key) !== undefined" class="mavg" :style="{ left: Math.round(avgLevel(m.key)! * 100) + '%' }"></span>
          </span>
          <span class="caption mval">{{ show(m.key, m.value) }}</span>
        </div>
        <span class="caption note">Bar: now. Tick: this passage on average. Both compared with the rest of the song.</span>
      </div>
      <div v-else-if="!analysis" class="none">
        <span class="label sub">{{ analyzingStep ? 'Analysing · ' + analyzingStep : 'This song is not analysed yet, so there is nothing measured to show.' }}</span>
        <Button v-if="!analyzingStep && trackId" size="sm" @click="library.analyze(trackId)">Analyze</Button>
      </div>
    </div>
    <!-- ONE SAVE PATH: the same Feels / Love / Note strip and the same save as after ♡ Save. -->
    <DescribeStrip
      :feelings="FEELINGS"
      :qualities="QUALITIES"
      :feel="feel"
      :love="love"
      :note="note"
      @toggle-feel="flow.toggleFeel"
      @toggle-love="flow.toggleLove"
      @update:note="v => (note = v)"
      @cancel="flow.closeExplore()"
      @done="flow.finishDescribe()"
    />
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--line-strong);
  background: var(--bg-panel);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.head h2 { margin: 0; color: var(--ink); }
.rng { color: var(--ink-sub); font-variant-numeric: tabular-nums; }
.row { display: flex; align-items: center; gap: var(--space-2); min-height: 40px; }
.lbl { flex: none; width: 44px; color: var(--ink-mute); }
.chips { display: flex; gap: 5px; overflow-x: auto; scrollbar-width: none; min-width: 0; }
.about { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: var(--space-3) 0; display: flex; flex-direction: column; gap: var(--space-1); }
.about .item { color: var(--ink); }
.sub { color: var(--ink-sub); }
.facts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: var(--space-1); }
.fact { color: var(--ink-sub); border: 1px solid var(--line-strong); border-radius: var(--radius-pill); padding: 2px var(--space-2); }
.now { color: var(--accent); }
.strip { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }
.win {
  flex: 1 0 44px; height: 24px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
  background: none; color: var(--ink-mute); cursor: pointer; font-variant-numeric: tabular-nums;
}
.win:hover { color: var(--ink); }
.win[aria-current='true'] { border-color: var(--accent-line); background: var(--accent-fill); color: var(--accent); }
.measures { display: grid; gap: 6px; margin-top: var(--space-2); }
.m { display: grid; grid-template-columns: 110px 1fr 70px; align-items: center; gap: var(--space-2); }
.mlbl { color: var(--ink-sub); }
.mbar { position: relative; height: 4px; border-radius: 2px; background: var(--line-strong); }
.mavg { position: absolute; top: -3px; width: 2px; height: 10px; margin-left: -1px; background: var(--ink); border-radius: 1px; }
.mfill { display: block; height: 100%; border-radius: 2px; background: var(--accent); transition: width 80ms linear; }
.chords { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: var(--space-1); }
.chords .mlbl { width: 110px; flex: none; }
.chord { min-width: 34px; text-align: center; padding: 2px 6px; border-radius: var(--radius-sm); color: var(--ink-mute); border: 1px solid transparent; }
.chord.now { color: var(--accent); border-color: var(--accent-line); background: var(--accent-fill); }
.mval { color: var(--ink-sub); text-align: right; font-variant-numeric: tabular-nums; }
.none { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-1); }
@media (prefers-reduced-motion: reduce) { .mfill { transition: none; } }
.foot { display: flex; align-items: center; gap: var(--space-2); }
.note { flex: 1; color: var(--ink-mute); }
</style>
