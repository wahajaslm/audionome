<script setup lang="ts">
/**
 * Chip (design system): a small toggle for feelings, musical qualities and quick answers.
 * Props: pressed (aria-pressed; omit for one-tap answers), square (radius-sm: qualities and
 * answers; round otherwise: feelings), size 'sm' (28px, strips and ask row) | 'md' (32px).
 * Slot: the label. Emits native click.
 * Rule: pressed = chip-on fill + chip-on-line border; never solid white or accent.
 * Example: <Chip square size="sm" :pressed="love.includes('Vocals')">Vocals</Chip>
 */
withDefaults(defineProps<{ pressed?: boolean; square?: boolean; size?: 'sm' | 'md' }>(),
  { pressed: undefined, square: false, size: 'md' });
</script>

<template>
  <button type="button" class="chip" :class="[size, { sq: square }]" :aria-pressed="pressed"><slot /></button>
</template>

<style scoped>
.chip {
  flex: none;
  border-radius: var(--radius-pill);
  border: 1px solid var(--line-strong);
  background: none;
  color: #b4b4b9; /* design-system chip text (between ink-sub and ink) */
  font-family: var(--font-sans);
  cursor: pointer;
  transition: background 150ms, border-color 150ms, color 150ms;
}
.md { height: 32px; padding: 0 var(--space-3); font-size: 13px; }
.sm { height: 28px; padding: 0 10px; font-size: 12px; }
.sq { border-radius: var(--radius-sm); }
.chip:hover { border-color: var(--chip-on-line); color: var(--ink); }
.chip[aria-pressed='true'] { background: var(--chip-on); border-color: var(--chip-on-line); color: var(--ink); }
@media (prefers-reduced-motion: reduce) { .chip { transition: none; } }
</style>
