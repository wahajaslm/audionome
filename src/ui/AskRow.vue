<script setup lang="ts">
/**
 * AskRow (design system): one question under the waveform, answered with one tap.
 * Props: question; chips (one-tap answers; omit to use the `actions` slot instead, e.g. the
 * replay nudge's "Not now / Save moment"); showMore (default true when chips are given).
 * Emits: answer(chip), more, skip.
 * Never a modal, never pauses playback; scrolls sideways on narrow screens.
 * Example: <AskRow question="What stood out?" :chips="['Vocals','Melody']" @answer="tag" />
 */
import Chip from './Chip.vue';
import Icon from './Icon.vue';

withDefaults(defineProps<{ question: string; chips?: string[]; showMore?: boolean }>(), { chips: () => [], showMore: true });
const emit = defineEmits<{ answer: [chip: string]; more: []; skip: [] }>();
</script>

<template>
  <section class="ask" aria-label="Quick question">
    <span class="q"><Icon name="sparkle" :size="16" />{{ question }}</span>
    <template v-if="chips.length">
      <Chip v-for="c in chips" :key="c" square size="sm" @click="emit('answer', c)">{{ c }}</Chip>
      <Chip v-if="showMore" square size="sm" @click="emit('more')">More…</Chip>
      <button type="button" class="skip" @click="emit('skip')">Skip</button>
    </template>
    <div v-else class="actions"><slot name="actions" /></div>
  </section>
</template>

<style scoped>
.ask {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: var(--space-1) 10px;
  border: 1px solid var(--line-strong);
  background: var(--bg-panel);
  border-radius: var(--radius-md);
  overflow-x: auto;
  scrollbar-width: none;
}
.q {
  flex: none;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-right: var(--space-1);
  color: var(--ink);
}
.skip, .actions { flex: none; margin-left: auto; }
.actions { display: flex; gap: var(--space-2); }
.skip {
  height: 28px;
  padding: 0 10px;
  border: 0;
  background: none;
  color: var(--ink-sub);
  font: 13px var(--font-sans);
  cursor: pointer;
}
</style>
