<script setup lang="ts">
/**
 * TraitRow (design system): one trait as an open list row — strength meter + name + meaning
 * and count · round play + best moment · how strong it is. Tapping the name opens the moments
 * behind it, indented under the row, each with play / range / Correct.
 * Props: name, meaning, count, level (0–4: Emerging 1, Growing 2–3, Strong 4), open,
 * best ({ title, range, note }) or none, answer (right column text), strong (answer in accent),
 * items ({ key, title, artist, range, note }) for the open list, lead (sentence above it),
 * footnote (sentence under it), findLabel (link text; omit to hide).
 * Emits: toggle, play-best, play(i), correct(i), find.
 * Rules: rows split by `line` hairlines only; the open row's name turns `accent`.
 * Example: <TraitRow name="Harmony" meaning="Chord movement you said you enjoyed" :count="1"
 *   :level="1" :open="false" answer="Based on 1 saved moment" :items="[]" @toggle="…" />
 */
import Icon from './Icon.vue';

export interface TraitRowItem { key: string; title: string; artist?: string; range: string; note?: string }

withDefaults(defineProps<{
  name: string; meaning: string; count: number; level: number; open: boolean;
  best?: { title: string; range: string; note?: string } | null;
  answer: string; strong?: boolean; items: TraitRowItem[];
  lead?: string; footnote?: string; findLabel?: string;
}>(), { best: null, strong: false, lead: '', footnote: '', findLabel: '' });
const emit = defineEmits<{ toggle: []; 'play-best': []; play: [i: number]; correct: [i: number]; find: [] }>();
</script>

<template>
  <li class="trow" :class="{ on: open }">
    <div class="top">
      <div class="main">
        <span class="meter" role="img" :aria-label="'Strength ' + level + ' of 4'">
          <i v-for="k in 4" :key="k" :class="{ f: k <= level }"></i>
        </span>
        <div class="nm-col">
          <button type="button" class="nm item" :aria-expanded="open" @click="emit('toggle')">{{ name }}</button>
          <div class="desc label">{{ meaning }} · {{ count }} {{ count === 1 ? 'moment' : 'moments' }}</div>
        </div>
      </div>
      <div class="hear">
        <template v-if="best">
          <button type="button" class="cp" :aria-label="'Play ' + best.title" @click="emit('play-best')"><Icon name="play" :size="11" /></button>
          <span class="body">{{ best.title }} {{ best.range }}<small v-if="best.note" class="caption">{{ best.note }}</small></span>
        </template>
      </div>
      <div class="ans label" :class="{ ok: strong }">{{ answer }}</div>
    </div>

    <div v-if="open" class="detail">
      <p v-if="lead" class="lead label">{{ lead }}</p>
      <ul class="ev">
        <li v-for="(it, i) in items" :key="it.key" class="evr">
          <button type="button" class="cp" :aria-label="'Listen to ' + it.title + ' ' + it.range" @click="emit('play', i)"><Icon name="play" :size="11" /></button>
          <span class="x body">
            <span class="you caption">You confirmed</span>
            {{ it.title }}<span v-if="it.artist" class="mute"> — {{ it.artist }}</span>
            <small v-if="it.note" class="caption">{{ it.note }}</small>
          </span>
          <span class="rng label">{{ it.range }}</span>
          <button type="button" class="fix label" :aria-label="'Correct: remove this trait from ' + it.title + ' ' + it.range" @click="emit('correct', i)">Correct</button>
        </li>
      </ul>
      <div class="foot">
        <span v-if="footnote" class="caption mute">{{ footnote }}</span>
        <button v-if="findLabel" type="button" class="find label" @click="emit('find')">{{ findLabel }}</button>
      </div>
    </div>
  </li>
</template>

<style scoped>
.trow { border-bottom: 1px solid var(--line); padding: 14px 0; font-variant-numeric: tabular-nums; }
.top { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 260px) 230px; align-items: center; gap: var(--space-2) var(--space-5); }
.main { display: flex; align-items: center; gap: 14px; min-width: 0; }
.meter { display: flex; gap: 3px; align-items: flex-end; flex: none; }
.meter i { width: var(--space-1); height: 14px; border-radius: var(--radius-xs); background: var(--line-strong); }
.meter i:nth-child(1) { height: 6px; }
.meter i:nth-child(2) { height: 9px; }
.meter i:nth-child(3) { height: 12px; }
.meter i.f { background: var(--accent); }
.nm-col { min-width: 0; }
.nm { padding: 0; border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; min-height: 24px; }
.on .nm { color: var(--accent); }
.desc { color: var(--ink-mute); margin-top: 3px; }
.hear { display: flex; align-items: center; gap: var(--space-3); color: var(--ink); min-width: 0; }
.hear small, .x small { display: block; color: var(--ink-mute); }
.cp {
  width: 34px; height: 34px; flex: none;
  border: 1px solid var(--line-strong); border-radius: var(--radius-pill);
  background: none; color: var(--ink);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.ans { display: flex; justify-content: flex-end; color: var(--ink-sub); }
.ans.ok { color: var(--accent); }
/* The moments behind the trait, indented 32px under the row. */
.detail { padding: var(--space-3) 0 var(--space-1) var(--space-6); }
.lead { color: var(--ink-sub); margin: 0 0 var(--space-2); }
.ev { list-style: none; margin: 0; padding: 0; }
.evr { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-top: 1px solid var(--line); }
.x { flex: 1; min-width: 0; color: var(--ink); }
.you { color: var(--accent); margin-right: 6px; }
.mute { color: var(--ink-mute); }
.rng { color: var(--ink-sub); white-space: nowrap; }
.fix, .find {
  min-height: 34px; padding: 0 var(--space-3); border: 0; border-radius: var(--radius-pill);
  background: none; color: var(--ink-sub); cursor: pointer;
}
.fix:hover, .find:hover { color: var(--ink); background: var(--bg-raise); }
.foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); margin-top: var(--space-2); }
/* One column on phones (breakpoint-phone, 600px). */
@media (max-width: 600px) {
  .top { grid-template-columns: minmax(0, 1fr); }
  .ans { justify-content: flex-start; }
  .detail { padding-left: var(--space-3); }
  .evr { flex-wrap: wrap; }
}
</style>
