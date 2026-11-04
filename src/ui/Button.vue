<script setup lang="ts">
/**
 * Button (design system): pill buttons in three weights.
 * Props: variant 'primary' | 'outline' | 'ghost' (default 'ghost'); size 'md' (38px) | 'sm' (30px,
 * inside strips and rows); type (default 'button'). Slot: the label. Emits native click.
 * Rule: at most one primary per view or row.
 * Example: <Button variant="primary" size="sm" @click="done">Done</Button>
 */
withDefaults(defineProps<{ variant?: 'primary' | 'outline' | 'ghost'; size?: 'md' | 'sm'; type?: 'button' | 'submit' }>(),
  { variant: 'ghost', size: 'md', type: 'button' });
</script>

<template>
  <button :type="type" class="btn" :class="[variant, size]"><slot /></button>
</template>

<style scoped>
.btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border: 0;
  border-radius: var(--radius-pill);
  background: none;
  font-family: var(--font-sans);
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}
.md { height: 38px; padding: 0 var(--space-4); }
.sm { height: 30px; padding: 0 var(--space-3); font-size: 13px; }
.primary { background: var(--ink); color: var(--on-ink); font-weight: 500; }
.outline { border: 1px solid var(--line-strong); color: var(--ink); }
.ghost { color: var(--ink-sub); }
.ghost:hover { color: var(--ink); }
</style>
