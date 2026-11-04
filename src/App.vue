<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useUiStore } from './stores/ui';
import { useAudioEngine } from './composables/useAudioEngine';
import { useAppBootstrap } from './composables/useAppBootstrap';
import AppSidebar from './features/shell/AppSidebar.vue';
import Toast from './ui/Toast.vue';

// One audio engine for the whole app, created before any screen renders.
useAudioEngine();
useAppBootstrap();

const ui = useUiStore();
const { toast } = storeToRefs(ui);
const router = useRouter();

function onToastAction(): void {
  const to = toast.value?.actionTo;
  ui.dismissToast();
  if (to) router.push(to);
}
</script>

<template>
  <div class="app-layout">
    <AppSidebar />
    <main class="main-content">
      <RouterView />
    </main>
    <div v-if="toast" class="toast-slot">
      <Toast :message="toast.message" :action-label="toast.actionLabel" @action="onToastAction" />
    </div>
  </div>
</template>

<style>
/* Tokens come from src/tokens.css (imported in main.ts). Only app-wide base rules live here. */
:root {
  color-scheme: dark;
}

body {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
}

/* Accessibility rule "Focus ring: 1px ink outline, 2px offset" — e.g. Tab onto a nav item. */
:focus-visible {
  outline: 1px solid var(--ink);
  outline-offset: 2px;
}
</style>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
}
.main-content {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: var(--space-5);
}
/* Toast rule: bottom centre, above the playback bar (desktop) or tab bar (phone). */
.toast-slot {
  position: fixed;
  bottom: calc(var(--space-8) + var(--space-7));
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
}
/* Layout rule: below breakpoint-tabs (820px) the sidebar becomes a bottom tab bar, so leave
   room for it. Media queries cannot read CSS variables, so the token value is repeated here. */
@media (max-width: 820px) {
  .app-layout {
    flex-direction: column;
  }
  .main-content {
    padding: var(--space-4) var(--space-4) calc(var(--space-8) + var(--space-5));
  }
}
</style>
