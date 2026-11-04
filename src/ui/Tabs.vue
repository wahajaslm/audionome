<script setup lang="ts">
/**
 * Tabs: one row of round tabs (radius-pill) for filtering a list — My Moments collections,
 * Discover groups, the TraitRing below 700px.
 * Props: items (labels); selected (index); label (aria-label of the tablist).
 * Emits: select(index). Selected tab = chip-on fill + chip-on-line border (never accent).
 * Example: <Tabs :items="['All moments', 'Chills']" :selected="tab" label="Collections" @select="tab = $event" />
 */
defineProps<{ items: string[]; selected: number; label: string }>();
const emit = defineEmits<{ select: [index: number] }>();
</script>

<template>
  <div class="tabs" role="tablist" :aria-label="label">
    <button
      v-for="(t, i) in items"
      :key="i"
      type="button"
      class="tab"
      role="tab"
      :aria-selected="selected === i"
      @click="emit('select', i)"
    >{{ t }}</button>
  </div>
</template>

<style scoped>
.tabs { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.tab {
  height: 36px;
  max-width: 100%;
  padding: 0 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--line-strong);
  background: none;
  color: var(--ink-sub);
  font: 14px var(--font-sans);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background-color 150ms, border-color 150ms, color 150ms;
}
.tab:hover { color: var(--ink); }
.tab[aria-selected='true'] { background: var(--chip-on); border-color: var(--chip-on-line); color: var(--ink); }
@media (prefers-reduced-motion: reduce) { .tab { transition: none; } }
</style>
