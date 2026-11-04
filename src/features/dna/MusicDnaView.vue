<script setup lang="ts">
/**
 * My Music DNA (port of index.html's renderDNA() and its 'trait', 'playev', 'rmev', 'disc',
 * 'learn', 'export' actions). Built from TraitRing + TraitRow (ui/) and core/dna.ts.
 * Every share is computed only from qualities you named on saved moments — nothing inferred.
 */
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import type { Moment } from '../../data/types';
import { computeTraits, evidenceNote, levelWord, portraitParts, ringLayout, traitLevel, traitShare, type Trait } from '../../core/dna';
import { useLibraryStore } from '../../stores/library';
import { useMomentsStore } from '../../stores/moments';
import { useIntelligenceStore } from '../../stores/intelligence';
import { useListeningStore } from '../../stores/listening';
import TraitRing from '../../ui/TraitRing.vue';
import TraitRow from '../../ui/TraitRow.vue';
import Switch from '../../ui/Switch.vue';
import Button from '../../ui/Button.vue';
import { formatTime } from '../../ui/format';
import AttentionList from '../discover/AttentionList.vue';

const library = useLibraryStore();
const momentsStore = useMomentsStore();
const intelligence = useIntelligenceStore();
const listening = useListeningStore();
const router = useRouter();
const { moments } = storeToRefs(momentsStore);
const { learning } = storeToRefs(listening);

/** Selected / open trait; tapping it again closes it (-1). Starts on the first trait, as in classic. */
const selected = ref(0);
const traits = computed(() => computeTraits(moments.value));
const total = computed(() => traits.value.reduce((n, t) => n + t.n, 0));
const ring = computed(() => ringLayout(traits.value, selected.value));
const portrait = computed(() => portraitParts(traits.value, intelligence.insight));
const current = computed(() => traits.value[selected.value]);

const center = computed(() => {
  if (!total.value) return { value: '0', name: 'moments described', sub: 'your portrait starts here' };
  if (!current.value) return { value: String(moments.value.length), name: 'saved moments', sub: 'tap a trait' };
  return { value: traitShare(current.value.n, total.value) + '%', name: current.value.short, sub: 'of what you described' };
});

const select = (i: number) => { selected.value = selected.value === i ? -1 : i; };
const title = (m: Moment) => library.track(m.trackId)?.title || 'Unknown song';
const range = (m: Moment) => formatTime(m.startSec) + '–' + formatTime(m.endSec);

function rowProps(t: Trait, i: number) {
  const top = t.items[0];
  return {
    name: t.name, meaning: t.desc, count: t.n, level: traitLevel(t.n), open: selected.value === i,
    best: top ? { title: title(top), range: range(top), note: evidenceNote(top, t) } : null,
    answer: t.n ? (traitLevel(t.n) === 4 ? levelWord(t.n) : 'Based on ' + t.n + ' saved ' + (t.n === 1 ? 'moment' : 'moments')) : 'Not enough information yet',
    strong: traitLevel(t.n) === 4,
    items: t.items.map(m => ({ key: m.id, title: title(m), artist: library.track(m.trackId)?.artist, range: range(m), note: evidenceNote(m, t) })),
    lead: t.n ? 'These are the passages you personally associated with ' + t.short + '. Listen or correct the labels.'
      : 'No saved moments have been marked with this characteristic yet.',
    footnote: 'Your descriptions, not predicted emotions',
    findLabel: 'Find more like these →',
  };
}

async function play(m: Moment | undefined) { if (m) await momentsStore.play(m); }
</script>

<template>
  <div class="page">
    <div class="head">
      <div>
        <h1 class="page-title">My Music DNA</h1>
        <p class="lead body">What the moments you described seem to have in common so far.</p>
      </div>
      <!-- Privacy control: pausing stops listening events; saving and describing still work. -->
      <Switch :checked="learning" :label="learning ? 'Learning on' : 'Learning paused'" @change="listening.setLearning" />
    </div>

    <TraitRing
      class="ring"
      :ticks="ring.ticks"
      :labels="ring.labels"
      :selected="selected"
      :center="center.value"
      :center-name="center.name"
      :center-sub="center.sub"
      @select="select"
    />

    <!-- Portrait sentence: underlined trait names select the same trait as the ring. -->
    <p class="portrait">
      <template v-for="(p, i) in portrait" :key="i">
        <button v-if="p.trait !== undefined" type="button" class="pt" :aria-pressed="selected === p.trait" @click="select(p.trait!)">{{ p.text }}</button>
        <b v-else-if="p.strong">{{ p.text }}</b>
        <template v-else>{{ p.text }}</template>
      </template>
    </p>
    <p class="pmeta label">
      Based on {{ moments.length }} saved {{ moments.length === 1 ? 'moment' : 'moments' }} · percentages are shares of the qualities you labelled, not scores or inferred emotions.
    </p>

    <h2 class="heading sh">Your traits</h2>
    <p class="label shs">Choose a trait to hear the moments behind it. This view grows as you describe your listening.</p>
    <ol class="tlist">
      <TraitRow
        v-for="(t, i) in traits"
        :key="t.name"
        v-bind="rowProps(t, i)"
        @toggle="select(i)"
        @play-best="play(t.items[0])"
        @play="play(t.items[$event])"
        @correct="momentsStore.correctTrait(t.items[$event].id, t)"
        @find="router.push({ path: '/discover', query: { t: String(i + 1) } })"
      />
    </ol>

    <AttentionList />

    <details class="how">
      <summary class="body">How Music DNA learned this</summary>
      <p class="label shs">The ring reflects qualities you selected for saved moments. Listening events are optional and provide only attention hints, not emotional labels.</p>
      <p class="label shs">Technical audio features, embeddings and model evaluations live in Feature analysis and the research studio.</p>
      <div class="how-btns">
        <Button variant="outline" @click="listening.exportProfile()">Export my profile</Button>
        <Button @click="router.push('/settings')">Settings →</Button>
        <Button @click="router.push('/admin')">Feature analysis →</Button>
      </div>
    </details>
  </div>
</template>

<style scoped>
.page { max-width: var(--content-max); margin: 0 auto; padding: var(--space-6) var(--space-4); font-variant-numeric: tabular-nums; }
.head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-4); }
h1 { margin: 0; color: var(--ink); }
.lead { color: var(--ink-sub); margin: var(--space-2) 0 0; }
.ring { margin: var(--space-4) 0; }
/* Portrait type: weight 300, 26px max, centred. */
.portrait { font-size: clamp(20px, 2.6vw, 26px); font-weight: 300; line-height: 1.5; text-align: center; max-width: 760px; margin: var(--space-4) auto 0; color: var(--ink); text-wrap: balance; }
.portrait b { font-weight: 400; }
.pt { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; text-decoration-color: var(--line-strong); text-underline-offset: 5px; }
.pt[aria-pressed='true'] { text-decoration-color: var(--accent); }
.pmeta { text-align: center; color: var(--ink-mute); margin: var(--space-3) 0 0; }
.sh { color: var(--ink); margin: var(--space-7) 0 var(--space-1); }
.shs { color: var(--ink-sub); margin: 0 0 var(--space-3); }
.tlist { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.how { margin-top: var(--space-7); border-top: 1px solid var(--line); padding-top: var(--space-4); }
.how summary { color: var(--ink); cursor: pointer; min-height: var(--hit-target); display: flex; align-items: center; }
.how .shs { margin-top: var(--space-2); }
.how-btns { display: flex; flex-wrap: wrap; gap: var(--space-2); }
</style>
