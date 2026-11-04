<script setup lang="ts">
/**
 * Mel · CQT · Linear: which spectrum view is drawn (core/spectrum.ts, SPECTRUM VIEWS).
 * Props: kind (selected), busy (the selected view is still being made). Emits: select(kind).
 * Example: <SpectrumSwitch :kind="'cqt'" :busy="true" @select="k => store.setSpectrumKind(k)" />
 */
import { SPECTRUM_KINDS, type SpectrumKind } from '../core/spectrum';

defineProps<{ kind: SpectrumKind; busy?: boolean }>();
const emit = defineEmits<{ select: [kind: SpectrumKind] }>();
const TITLES: Record<SpectrumKind, string> = {
  mel: 'Mel: bands spaced as the ear hears pitch',
  cqt: 'CQT: one row per quarter tone, notes line up',
  linear: 'Linear: plain frequency in Hz',
};
</script>

<template>
  <div class="sw" role="group" aria-label="Spectrum view">
    <button v-for="k in SPECTRUM_KINDS" :key="k.kind" type="button" :aria-pressed="kind === k.kind" :title="TITLES[k.kind]" @click="emit('select', k.kind)">
      {{ k.label }}<span v-if="busy && kind === k.kind" class="dot" aria-label="computing">…</span>
    </button>
  </div>
</template>

<style scoped>
.sw { display: flex; flex-wrap: nowrap; gap: 2px; }
button {
  padding: 0 5px; font: 10px/16px var(--font-sans); border-radius: 4px; cursor: pointer;
  border: 1px solid var(--line-strong); background: none; color: var(--ink-mute);
}
button:hover { color: var(--ink); border-color: var(--chip-on-line); }
button[aria-pressed='true'] { background: var(--chip-on); border-color: var(--chip-on-line); color: var(--ink); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.dot { margin-left: 1px; }
</style>
