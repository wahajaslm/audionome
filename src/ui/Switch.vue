<script setup lang="ts">
/**
 * Switch: the on/off control for Learning and automatic analysis (README Accessibility:
 * "the learning switch is role=switch"). Same geometry as the classic player's .switch.
 * Props: checked; label (visible text next to the knob, e.g. "Learning on").
 * Emits: change(next) — the store decides and the prop follows, so it never drifts.
 * Example: <Switch :checked="learning" :label="learning ? 'On' : 'Off'" @change="setLearning" />
 */
const props = defineProps<{ checked: boolean; label: string }>();
const emit = defineEmits<{ change: [on: boolean] }>();
</script>

<template>
  <button type="button" class="switch label" role="switch" :aria-checked="checked" @click="emit('change', !props.checked)">
    <span class="k" aria-hidden="true"></span>{{ label }}
  </button>
</template>

<style scoped>
.switch {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: var(--hit-target);
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink-sub);
  font-family: var(--font-sans);
  font-size: 14px;
  cursor: pointer;
}
.k { position: relative; width: 34px; height: 20px; border-radius: var(--radius-pill); background: var(--line-strong); }
.k::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--ink-sub);
  transition: left 150ms;
}
/* On: the track uses accent-line, the knob ink. The accent stays soft: a switch is not a moment. */
.switch[aria-checked='true'] .k { background: var(--accent-line); }
.switch[aria-checked='true'] .k::after { left: 16px; background: var(--ink); }
@media (prefers-reduced-motion: reduce) { .k::after { transition: none; } }
</style>
