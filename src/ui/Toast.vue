<script setup lang="ts">
/**
 * Toast (design system): one sentence saying what just happened, plus at most one action.
 * Props: message; actionLabel (optional, accent text). Emits: action.
 * Placement (bottom centre, above the playback bar / tab bar) is the consumer's job.
 * Example: <Toast message="Saved to My Moments" action-label="View" @action="go('/moments')" />
 */
defineProps<{ message: string; actionLabel?: string }>();
const emit = defineEmits<{ action: [] }>();
</script>

<template>
  <div class="toast" role="status">
    <span>{{ message }}</span>
    <button v-if="actionLabel" type="button" @click="emit('action')">{{ actionLabel }}</button>
  </div>
</template>

<style scoped>
.toast {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 34px;
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  background: var(--bg-raise);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-pop);
  font-size: 14px;
  color: var(--ink);
}
.toast span { padding-right: var(--space-2); }
button {
  height: 34px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--accent);
  font: 14px var(--font-sans);
  cursor: pointer;
}
</style>
