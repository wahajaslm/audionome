<script setup lang="ts">
/**
 * TraitRing (design system): the ring of fine ticks on My Music DNA. Each arc is one trait; its
 * length is that trait's share of the qualities you labelled.
 * Props: ticks ({ deg, len, tone }) and labels ({ index, label, pct, x, y, right }) — the
 * geometry, computed by core/dna.ts ringLayout(); selected (trait index, -1 = none);
 * center (numeral) / centerName / centerSub (the three centre lines).
 * Emits: select(index) from the outside labels, or from the tabs below 700px.
 * Rules: 300px ring (radius 150), 2px ticks, radius-xs. Selected arc `accent`; others `wave-off`
 * while one is selected, light grey when none is (README's #b4b4b9 has no token → `ink-sub`).
 * Empty traits and gaps use the `line` hairline colour.
 * Example: <TraitRing :ticks="ring.ticks" :labels="ring.labels" :selected="0" center="75%"
 *   center-name="vocals" center-sub="of what you described" @select="pick" />
 */
import Tabs from './Tabs.vue';

export interface RingTickProp { deg: number; len: number; tone: 'selected' | 'other' | 'idle' | 'empty' }
export interface RingLabelProp { index: number; label: string; pct: number; x: number; y: number; right: boolean }

defineProps<{
  ticks: RingTickProp[]; labels: RingLabelProp[]; selected: number;
  center: string; centerName: string; centerSub: string;
}>();
const emit = defineEmits<{ select: [index: number] }>();

const TONE: Record<RingTickProp['tone'], string> = {
  selected: 'var(--accent)', other: 'var(--wave-off)', idle: 'var(--ink-sub)', empty: 'var(--line)',
};
</script>

<template>
  <div class="trait-ring">
    <div class="stage">
      <div class="circle" role="img" aria-label="Your saved musical preferences, grouped by the qualities you selected">
        <div class="center">
          <span class="numeral c-num">{{ center }}</span>
          <span class="body c-name">{{ centerName }}</span>
          <span class="caption c-sub">{{ centerSub }}</span>
        </div>
        <i
          v-for="(tk, i) in ticks"
          :key="i"
          class="tick"
          :style="{ height: tk.len + 'px', background: TONE[tk.tone], transform: 'rotate(' + tk.deg + 'deg)' }"
        ></i>
      </div>
      <!-- Labels are buttons at each arc's midpoint (Accessibility rule: pressed toggles use aria-pressed). -->
      <button
        v-for="lb in labels"
        :key="lb.index"
        type="button"
        class="rlab label"
        :aria-pressed="selected === lb.index"
        :style="{
          left: 'calc(50% + ' + lb.x + 'px)',
          top: 'calc(50% + ' + lb.y + 'px)',
          transform: 'translate(' + (lb.right ? '0' : '-100%') + ', -50%)',
          textAlign: lb.right ? 'left' : 'right',
        }"
        @click="emit('select', lb.index)"
      >
        <b>{{ lb.pct }}%</b>
        <span>{{ lb.label }}</span>
      </button>
    </div>
    <!-- Below 700px the outside labels would overflow: the same items become tabs under the ring. -->
    <Tabs
      class="ring-tabs"
      :items="labels.map(l => l.label + ' ' + l.pct + '%')"
      :selected="selected"
      label="Traits"
      @select="emit('select', $event)"
    />
  </div>
</template>

<style scoped>
.stage { position: relative; height: 400px; }
.circle { position: absolute; left: 50%; top: 50%; width: 300px; height: 300px; margin: -150px 0 0 -150px; }
.center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  text-align: center;
  z-index: 2;
}
.c-num, .c-name { color: var(--ink); }
.c-sub { color: var(--ink-mute); }
.tick {
  position: absolute;
  left: 149px;
  top: 0;
  width: var(--wave-bar);
  border-radius: var(--radius-xs);
  transform-origin: 1px 150px;
}
.rlab {
  position: absolute;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-1) var(--space-2);
  border: 0;
  background: none;
  color: var(--ink-sub);
  white-space: nowrap;
  cursor: pointer;
}
/* Share in 20px ink over a short name; the selected share turns accent. */
.rlab b { font-size: 20px; font-weight: 400; color: var(--ink); }
.rlab[aria-pressed='true'] b { color: var(--accent); }
.ring-tabs { display: none; justify-content: center; }
@media (max-width: 700px) {
  .rlab { display: none; }
  .ring-tabs { display: flex; }
  .stage { height: 340px; }
}
</style>
