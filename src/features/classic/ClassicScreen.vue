<script setup lang="ts">
/**
 * Placeholder for screens not yet ported to the Vue app (Discover, Settings, Admin).
 * They work today in the classic player (index.html); phases 2–3 move them here.
 * Props: title (page title); view (the classic player's hash, e.g. 'discover').
 */
import Button from '../../ui/Button.vue';

defineProps<{ title: string; view: string }>();
</script>

<template>
  <div class="classic">
    <h1 class="page-title">{{ title }}</h1>
    <p class="body lead">This screen is still in the classic player while the new player is being built.</p>
    <a :href="'/#' + view"><Button variant="outline">Open {{ title }} in the classic player</Button></a>
  </div>
</template>

<style scoped>
.classic { max-width: var(--content-max); margin: 0 auto; padding: var(--space-6) var(--space-4); }
h1 { margin: 0; color: var(--ink); }
.lead { color: var(--ink-sub); margin: var(--space-2) 0 var(--space-5); }
a { text-decoration: none; }
</style>
