<script setup lang="ts">
/**
 * Explore this moment: switch between separated stems (all / vocals / drums / bass / other),
 * see what the analysis measured for the selected passage, and save it with musical reasons.
 * Port of index.html's Explore panel. Stems are served by the local analysis service.
 */
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlaybackStore } from '../../stores/playback';
import { useMomentFlowStore } from '../../stores/momentFlow';
import { useIntelligenceStore } from '../../stores/intelligence';
import { STEM_REASONS } from '../../core/moments';
import Chip from '../../ui/Chip.vue';
import Button from '../../ui/Button.vue';
import { formatTime } from '../../ui/format';

const playback = usePlaybackStore();
const flow = useMomentFlowStore();
const intelligence = useIntelligenceStore();
const { sel, activeStem } = storeToRefs(playback);
const { stemReasons } = storeToRefs(flow);

const STEMS = ['all', 'vocals', 'drums', 'bass', 'other'];
const STEM_INFO: Record<string, { title: string; sub: string }> = {
  all: { title: 'Full arrangement & mix', sub: 'Interplay of vocal melody, bassline, drum groove, and accompaniment' },
  vocals: { title: 'Vocals & expression', sub: 'Singing style, pitch movement, breathiness, and vocal intensity' },
  drums: { title: 'Rhythm & groove', sub: 'Drum patterns, tempo, syncopation, fills, and transient beat grid' },
  bass: { title: 'Bassline & harmonic root', sub: 'Low-frequency harmonic foundation, bass rhythm, and groove interaction' },
  other: { title: 'Instrumental accompaniment', sub: 'Explore harmony, instrumental texture, guitar/synths/piano, and transitions' },
};

const analysis = computed(() => intelligence.currentAnalysis);
/** Measured values for the first analysis window that overlaps the selection. */
const facts = computed(() => {
  const s = sel.value, an = analysis.value;
  if (!s) return [];
  const seg = an?.segments?.find(x => Math.max(x.startSec, s.a) < Math.min(x.endSec, s.b));
  const desc = seg?.descriptors;
  const dims = desc?.dimensions ?? an?.musicalDimensions;
  const key = desc?.key ?? dims?.melodyHarmony?.key;
  const chords = desc?.chords?.length ? desc.chords.join(' → ') : dims?.melodyHarmony?.chords?.join(' → ');
  const tempo = desc?.tempoBpm ?? dims?.rhythmGroove?.tempoBpm;
  const inst = desc?.topInstruments?.length ? desc.topInstruments.join(', ') : dims?.instrumentationTimbre?.topInstruments?.join(', ');
  const stems = desc?.activeStems ? desc.activeStems.join(' + ') : 'all stems';
  return [
    key && 'Key · ' + key,
    chords && 'Chords · ' + chords,
    tempo && tempo + ' BPM',
    inst && 'Instruments · ' + inst,
    stems && stems + ' active',
  ].filter(Boolean) as string[];
});
const info = computed(() => STEM_INFO[activeStem.value] ?? { title: 'Full arrangement', sub: 'Explore musical layers' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>

<template>
  <section v-if="sel" class="panel" aria-label="Explore this moment">
    <div class="head">
      <h2 class="heading">Explore this moment</h2>
      <span class="label rng">{{ formatTime(sel.a) }} — {{ formatTime(sel.b) }} · {{ analysis ? 'Musical intelligence' : 'Illustrative analysis' }}</span>
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
    </div>
    <div class="row">
      <span class="lbl caption">Love</span>
      <div class="chips">
        <Chip v-for="r in STEM_REASONS" :key="r" square size="sm" :pressed="stemReasons.includes(r)" @click="flow.toggleStemReason(r)">{{ r }}</Chip>
      </div>
    </div>
    <div class="foot">
      <span class="caption note">Music DNA learns which musical elements matter to you from your feedback.</span>
      <Button size="sm" @click="flow.closeExplore()">Close</Button>
      <Button size="sm" variant="primary" @click="flow.saveExplore()">Save moment</Button>
    </div>
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
.foot { display: flex; align-items: center; gap: var(--space-2); }
.note { flex: 1; color: var(--ink-mute); }
</style>
