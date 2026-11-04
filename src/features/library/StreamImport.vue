<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useLibraryStore } from '../../stores/library';
import { useUiStore } from '../../stores/ui';

const library = useLibraryStore();
const ui = useUiStore();
const router = useRouter();
const { isResolvingStream, isStreamingAnalysis, streamProgress } = storeToRefs(library);

const streamUrl = ref('');
const exampleUrls = [
  { label: 'Ambient Stream (Direct)', url: 'https://raw.githubusercontent.com/rafaelreis-hotmart/Audio-Sample-files/master/sample.mp3' },
  { label: 'YouTube Sample', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
];

async function handleLoad() {
  if (!streamUrl.value.trim()) {
    ui.notify('Paste a YouTube, SoundCloud or audio link first.');
    return;
  }
  try {
    await library.openStream(streamUrl.value.trim());
    streamUrl.value = '';
    router.push('/');
  } catch {
    // Handled in store toast
  }
}

function selectExample(url: string) {
  streamUrl.value = url;
}
</script>

<template>
  <!-- Principle 3 "Seamless, not boxed": an open page (title, lead line, rows), not a card.
       Voice rule: name things by what listeners recognise, not the system (no "SSE", "MERT"). -->
  <div class="stream-importer-panel">
    <h1 class="stream-title page-title">Stream &amp; Web</h1>
    <p class="stream-sub body">
      Paste a YouTube, SoundCloud or direct audio link. It opens in the player with its waveform,
      so you can select and save moments from it.
    </p>

    <div class="input-row">
      <input
        v-model="streamUrl"
        type="url"
        class="stream-input body"
        aria-label="Audio or video link"
        placeholder="Paste a YouTube, SoundCloud or audio link…"
        :disabled="isResolvingStream"
        @keyup.enter="handleLoad"
      />
      <!-- Button rule "Primary": ink fill + on-ink text (never the accent). Motion rule: nothing
           loops or pulses on its own, so the spinner was replaced by the button's text. -->
      <button
        class="btn-load body"
        :disabled="isResolvingStream || !streamUrl.trim()"
        @click="handleLoad"
      >
        {{ isResolvingStream ? 'Opening…' : 'Open' }}
      </button>
    </div>

    <div class="examples">
      <span class="ex-label caption">Try</span>
      <!-- Chip rule: square chips (radius-sm) for quick answers, 28px, 12px text. -->
      <button
        v-for="ex in exampleUrls"
        :key="ex.label"
        class="btn-chip caption"
        @click="selectExample(ex.url)"
      >
        {{ ex.label }}
      </button>
    </div>

    <!-- role="status" so progress is announced; plain ink-sub text, no accent and no pulsing dot. -->
    <div v-if="isStreamingAnalysis" class="stream-progress-card" role="status">
      <div class="prog-title body">Listening through the stream</div>
      <p class="prog-desc label">
        Part {{ streamProgress.current }} of {{ streamProgress.total }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.stream-importer-panel {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
}
.stream-title {
  margin: 0;
  color: var(--ink);
}
.stream-sub {
  color: var(--ink-sub);
  max-width: 60ch;
  margin: var(--space-2) 0 var(--space-5);
}
.input-row {
  display: flex;
  gap: var(--space-2);
}
.stream-input {
  flex: 1;
  min-width: 0;
  height: 38px;
  box-sizing: border-box;
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-3);
  color: var(--ink);
}
.stream-input::placeholder {
  color: var(--ink-mute);
}
/* Button rule "Primary": ink fill, on-ink text, weight 500, 38px, pill. */
.btn-load {
  flex: none;
  height: 38px;
  background: var(--ink);
  color: var(--on-ink);
  font-weight: 500;
  border: none;
  border-radius: var(--radius-pill);
  padding: 0 var(--space-4);
  cursor: pointer;
}
.btn-load:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.examples {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
.ex-label {
  color: var(--ink-mute);
}
.btn-chip {
  height: 28px;
  background: none;
  border: 1px solid var(--line-strong);
  color: var(--ink-sub);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-3);
  cursor: pointer;
  transition: border-color 150ms, color 150ms;
}
.btn-chip:hover {
  border-color: var(--chip-on-line);
  color: var(--ink);
}
.stream-progress-card {
  margin-top: var(--space-5);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  padding: var(--space-4) 0;
}
.prog-title {
  color: var(--ink);
}
.prog-desc {
  color: var(--ink-sub);
  margin: var(--space-1) 0 0;
}
</style>
