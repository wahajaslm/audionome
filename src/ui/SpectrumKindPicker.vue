<script setup lang="ts">
/**
 * Spectrum view picker for a lane's label column (Explore and Nerds share it):
 *   Spectrum
 *   ● Mel
 *   ○ CQT     (a view still being made shows "…" and opens when ready)
 *   ○ Linear
 */
import type { SpectrumKind } from '../core/spectrum';

defineProps<{ kind: SpectrumKind; ready: SpectrumKind[] }>();
const emit = defineEmits<{ select: [kind: SpectrumKind] }>();
const KINDS: { k: SpectrumKind; label: string; hint: string }[] = [
  { k: 'mel', label: 'Mel', hint: 'Mel scale: like hearing' },
  { k: 'cqt', label: 'CQT', hint: 'Constant-Q: one row per quarter tone' },
  { k: 'linear', label: 'Linear', hint: 'Linear Hz: harmonics evenly spaced' },
];
</script>

<template>
  <div class="pick" role="radiogroup" aria-label="Spectrum view">
    <button
      v-for="o in KINDS"
      :key="o.k"
      type="button"
      role="radio"
      class="opt"
      :aria-checked="kind === o.k"
      :title="o.hint + (ready.includes(o.k) ? '' : ' (being made…)')"
      @click="emit('select', o.k)"
    ><i class="dot"></i>{{ o.label }}<span v-if="!ready.includes(o.k)" class="wait">…</span></button>
  </div>
</template>

<style scoped>
.pick { display: flex; flex-direction: column; gap: 1px; margin-top: 4px; }
.opt { display: flex; align-items: center; gap: 6px; height: 17px; padding: 0; border: 0; background: none; color: var(--ink-mute); font: 11px var(--font-sans); cursor: pointer; text-align: left; }
.opt:hover { color: var(--ink); }
.dot { width: 7px; height: 7px; border-radius: 50%; border: 1px solid var(--ink-mute); flex: none; box-sizing: border-box; }
.opt[aria-checked='true'] { color: var(--ink); }
.opt[aria-checked='true'] .dot { border-color: var(--accent); background: var(--accent); }
.wait { color: var(--ink-mute); margin-left: -3px; }
</style>
