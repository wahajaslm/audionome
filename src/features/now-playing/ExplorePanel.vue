<script setup lang="ts">
/**
 * Explore this passage: what the analysis measured for the selected passage, a stem switch to
 * hear its layers, and the Feels / Love / Note strip to save it.
 *
 * ONE SUBJECT FIX - everything here describes the selected passage (sel), nothing else.
 * Before, the bars followed the playhead window, the ticks showed the passage average, and a
 * row of window chips sat on top. The numbers moved on their own and could even describe a
 * part outside the loop.
 * Example: loop 1:42–2:49, playhead at 3:10 -> before: header said "now 3:06–3:18" and the bars
 * showed 3:06–3:18; now: every value is the 1:42–2:49 passage and stays still while it plays.
 * The only live mark is the chord that is sounding, and only while the playhead is inside.
 */
import { computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlaybackStore } from '../../stores/playback';
import { useMomentFlowStore } from '../../stores/momentFlow';
import { useIntelligenceStore } from '../../stores/intelligence';
import { useLibraryStore } from '../../stores/library';
import { exactSummary, inSelection, passageSummary } from '../../core/diagnostics';
import { useMomentsStore } from '../../stores/moments';
import { FEELINGS, QUALITIES } from '../../core/moments';
import DescribeStrip from '../../ui/DescribeStrip.vue';
import Chip from '../../ui/Chip.vue';
import Button from '../../ui/Button.vue';
import { formatTime } from '../../ui/format';

const playback = usePlaybackStore();
const flow = useMomentFlowStore();
const intelligence = useIntelligenceStore();
const library = useLibraryStore();
const { sel, activeStem, t, trackId } = storeToRefs(playback);
const { feel, love, note } = storeToRefs(flow);

const STEMS = ['all', 'vocals', 'drums', 'bass', 'other'];

const analysis = computed(() => intelligence.currentAnalysis);
const segs = computed(() => analysis.value?.segments ?? []);
const momentsStore = useMomentsStore();
/** The saved moment for this exact selection, if any. */
const saved = computed(() => (sel.value ? momentsStore.savedMatch(sel.value) : undefined));
/** Its exact analysis (PASSAGE FIX), once the service has made it. */
const exact = computed(() => (saved.value ? momentsStore.passages[saved.value.id] : undefined));
// Explore on a saved moment without an exact analysis yet: ask for one in the background.
watch(saved, m => { if (m) momentsStore.analyzeExactly(m.id); }, { immediate: true });
/**
 * The selected passage: exact when it is a saved moment the service has analysed, otherwise
 * estimated from the song's windows (LOOP SYNC FIX).
 */
const passage = computed(() => (exact.value ? exactSummary(segs.value, exact.value)
  : sel.value ? passageSummary(segs.value, sel.value) : null));
const source = computed(() => (exact.value ? 'Exact analysis'
  : saved.value ? 'Estimate · exact analysis running…' : 'Estimate from the whole-song analysis · save for an exact one'));
const inside = computed(() => !!sel.value && t.value >= sel.value.a && t.value < sel.value.b);
/** The passage's chords in time order; the sounding one is marked only while the playhead is inside. */
const chords = computed(() => (passage.value?.chords ?? []).map(c => ({ ...c, now: inside.value && t.value >= c.from && t.value < c.to })));
const analyzingStep = computed(() => (trackId.value ? library.analyzing[trackId.value] : undefined));

/** Key, tempo, instruments and active stems for the passage (instruments from the windows it covers). */
const facts = computed(() => {
  if (!sel.value) return [];
  const dims = analysis.value?.musicalDimensions;
  const covered = segs.value.filter(s => inSelection(s, sel.value!));
  const union = (pick: (s: typeof covered[number]) => string[] | undefined) =>
    [...new Set(covered.flatMap(s => pick(s) ?? []))];
  const inst = union(s => s.descriptors?.topInstruments);
  const stems = union(s => s.descriptors?.activeStems);
  const key = passage.value?.key ?? dims?.melodyHarmony?.key;
  const tempo = passage.value?.tempoBpm ?? dims?.rhythmGroove?.tempoBpm;
  return [
    { k: 'Key', v: key },
    { k: 'Tempo', v: tempo ? Math.round(Number(tempo)) + ' BPM' : undefined },
    { k: 'Instruments', v: inst.slice(0, 4).join(', ') || undefined },
    { k: 'Active', v: stems.join(', ') || undefined },
  ].filter(f => f.v) as { k: string; v: string }[];
});
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Measure value as text. Example: brightness 2873.4 → "2873 Hz"; vocals 0.57 → "57%". */
function show(key: string, v: number): string {
  if (key === 'brightness_hz') return Math.round(v) + ' Hz';
  if (key === 'vocal_presence') return Math.round(v * 100) + '%';
  return v.toFixed(2);
}
</script>

<template>
  <section v-if="sel" class="panel" aria-label="Explore this passage">
    <header class="head">
      <h2 class="heading">Explore this passage</h2>
      <div class="meta caption">
        <span class="rng">{{ formatTime(sel.a) }} – {{ formatTime(sel.b) }}</span>
        <span class="dot">·</span>
        <span :class="{ ok: !!exact }">{{ source }}</span>
      </div>
    </header>

    <div v-if="passage" class="grid">
      <template v-for="f in facts" :key="f.k">
        <span class="k caption">{{ f.k }}</span>
        <span class="v">{{ f.v }}</span>
      </template>

      <template v-if="chords.length">
        <span class="k caption">Chords</span>
        <div class="chords" aria-label="Chords in this passage, in order">
          <span
            v-for="(ch, i) in chords"
            :key="i"
            class="chord"
            :class="{ now: ch.now }"
          >{{ ch.chord }}</span>
        </div>
      </template>
    </div>

    <div v-if="passage?.measures.length" class="measures">
      <span class="mhead caption">Passage average. Bar: from the song's lowest (empty) to its highest (full).</span>
      <div v-for="m in passage.measures" :key="m.key" class="m">
        <span class="k caption">{{ m.label }}</span>
        <span class="mbar"><span class="mfill" :style="{ width: Math.round(m.level * 100) + '%' }"></span></span>
        <span class="mval caption">{{ show(m.key, m.value) }}</span>
      </div>
    </div>
    <div v-else-if="!analysis" class="none">
      <span class="caption sub">{{ analyzingStep ? 'Analysing · ' + analyzingStep : 'This song is not analysed yet.' }}</span>
      <Button v-if="!analyzingStep && trackId" size="sm" @click="library.analyze(trackId)">Analyze</Button>
    </div>

    <div class="listen">
      <span class="k caption">Hear</span>
      <div class="chips">
        <Chip v-for="s in STEMS" :key="s" size="sm" :pressed="activeStem === s" @click="playback.switchStem(s)">{{ cap(s) }}</Chip>
      </div>
    </div>

    <!-- ONE SAVE PATH: the same Feels / Love / Note strip and the same save as after ♡ Save. -->
    <DescribeStrip
      flat
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
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}
.head { display: flex; flex-direction: column; gap: 2px; }
.head h2 { margin: 0; color: var(--ink); }
.meta { display: flex; flex-wrap: wrap; gap: 6px; color: var(--ink-mute); }
.rng { color: var(--ink); font-variant-numeric: tabular-nums; }
.ok { color: var(--accent); }

/* One label column for every row, so values and chords line up. */
.grid { display: grid; grid-template-columns: 96px minmax(0, 1fr); column-gap: var(--space-3); row-gap: 8px; align-items: baseline; }
.k { color: var(--ink-mute); }
.v { color: var(--ink); font-size: 14px; }
.chords { display: flex; flex-wrap: wrap; gap: 4px; }
.chord {
  min-width: 36px; padding: 2px 6px; text-align: center; font-size: 13px;
  color: var(--ink-sub); border: 1px solid var(--line); border-radius: var(--radius-sm);
}
.chord.now { color: var(--accent); border-color: var(--accent-line); background: var(--accent-fill); }

.measures { display: grid; gap: 8px; border-top: 1px solid var(--line); padding-top: var(--space-3); }
.mhead { color: var(--ink-mute); }
.m { display: grid; grid-template-columns: 96px minmax(0, 1fr) 72px; column-gap: var(--space-3); align-items: center; }
.mbar { height: 6px; border-radius: 3px; background: var(--line-strong); overflow: hidden; }
.mfill { display: block; height: 100%; background: var(--accent); }
.mval { color: var(--ink-sub); text-align: right; font-variant-numeric: tabular-nums; }

.listen { display: grid; grid-template-columns: 96px minmax(0, 1fr); column-gap: var(--space-3); align-items: center; border-top: 1px solid var(--line); padding-top: var(--space-3); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.none { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.sub { color: var(--ink-sub); }

@media (max-width: 520px) {
  .grid, .listen { grid-template-columns: 72px minmax(0, 1fr); }
  .m { grid-template-columns: 72px minmax(0, 1fr) 60px; }
}
</style>
