<script setup lang="ts">
/**
 * Fold: one collapsible section (an accordion item) for Explore and Nerds.
 *   ▶ Title  one-line summary when closed                       [actions]
 * Same look as the native Details disclosure: a small triangle and a plain title.
 * The open state is remembered per section (composables/useFolds.ts). Click the header (or
 * Enter / Space on it) to open or close. `level` 2 = a fold inside a fold (smaller header).
 * Props: id ("<view>.<section>"), title, summary (shown when closed), open (default), level.
 */
import { useFold } from '../composables/useFolds';

const props = withDefaults(defineProps<{ id: string; title: string; summary?: string; open?: boolean; level?: 1 | 2 }>(), { open: true, level: 1 });
const isOpen = useFold(props.id, props.open);
</script>

<template>
  <section class="fold" :class="['l' + level, { closed: !isOpen }]" :aria-label="title">
    <header class="fh">
      <button type="button" class="ft" :aria-expanded="isOpen" @click="isOpen = !isOpen">
        <span class="chev" aria-hidden="true">▶</span>
        <span class="name">{{ title }}</span>
        <span v-if="!isOpen && summary" class="sum">{{ summary }}</span>
      </button>
      <div v-if="isOpen && $slots.actions" class="acts"><slot name="actions" /></div>
    </header>
    <div v-if="isOpen" class="fb"><slot /></div>
  </section>
</template>

<style scoped>
.fold.l1 { border-top: 1px solid var(--line); }
.fold.l1:first-of-type { border-top: 0; }
.fh { display: flex; align-items: center; gap: 12px; min-height: 34px; }
.ft { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; padding: 6px 0; border: 0; background: none; color: var(--ink); font: 13px var(--font-sans); cursor: pointer; text-align: left; }
.name { font-size: 13px; color: var(--ink-sub); }
.l2 .name { font-size: 12px; }
.ft:hover .name { color: var(--ink); }
.chev { display: inline-block; width: 10px; font-size: 8px; color: var(--ink-sub); transition: transform 150ms ease; transform: rotate(90deg); }
.closed .chev { transform: rotate(0deg); }
.sum { color: var(--ink-mute); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.acts { flex: none; display: flex; align-items: center; gap: 4px; }
.fb { padding-bottom: 10px; }
.l2 .fh { min-height: 26px; }
.l2 .ft { padding: 3px 0; }
.l2 .fb { padding-bottom: 6px; }
@media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
</style>
