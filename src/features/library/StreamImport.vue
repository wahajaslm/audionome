<script setup lang="ts">
/**
 * "Add from a link" — the stream importer, now a section of Library (it used to be its own
 * Stream & Web page). Streams are added to the same library list as imported files, so one
 * place holds every song. Opening a link needs the local service; without it the toast says so.
 * Voice rule: name things by what listeners recognise, not the system (no "SSE", "proxy").
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useLibraryStore } from '../../stores/library';
import { useUiStore } from '../../stores/ui';
import Button from '../../ui/Button.vue';

const emit = defineEmits<{ close: [] }>();
const library = useLibraryStore();
const ui = useUiStore();
const router = useRouter();
const { isResolvingStream, isStreamingAnalysis, streamProgress } = storeToRefs(library);
const streamUrl = ref('');

async function open() {
  const url = streamUrl.value.trim();
  if (!url) { ui.notify('Paste a YouTube, SoundCloud or audio link first.'); return; }
  try {
    const kind = await library.openLink(url);
    streamUrl.value = '';
    emit('close');
    // One song opens in the player; a playlist stays in Library, where its songs just appeared.
    if (kind === 'song') router.push('/');
  } catch { /* the store already showed the error toast */ }
}
</script>

<template>
  <section class="stream" aria-label="Add from a link">
    <p class="lead label">
      Paste a YouTube, SoundCloud or direct audio link. A song opens in the player with its waveform,
      so you can save moments from it. A playlist adds all its songs to Library at once.
    </p>
    <div class="input-row">
      <input
        v-model="streamUrl"
        type="url"
        class="in body"
        aria-label="Song or playlist link"
        placeholder="Paste a song or playlist link…"
        :disabled="isResolvingStream"
        @keyup.enter="open"
      />
      <!-- Motion rule: nothing pulses on its own, so progress is the button's text. -->
      <Button variant="primary" :disabled="isResolvingStream || !streamUrl.trim()" @click="open">
        {{ isResolvingStream ? 'Opening…' : 'Open' }}
      </Button>
      <Button @click="emit('close')">Cancel</Button>
    </div>
    <p v-if="isStreamingAnalysis" class="prog label" role="status">
      Listening through the stream · part {{ streamProgress.current }} of {{ streamProgress.total }}
    </p>
  </section>
</template>

<style scoped>
.stream { padding: var(--space-4) 0; border-bottom: 1px solid var(--line); }
.lead { color: var(--ink-sub); margin: 0 0 var(--space-3); max-width: 62ch; }
.input-row { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.in {
  flex: 1 1 240px;
  min-width: 0;
  height: 38px;
  box-sizing: border-box;
  padding: 0 var(--space-3);
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--ink);
}
.in::placeholder { color: var(--ink-mute); }
:deep(button:disabled) { opacity: 0.5; cursor: not-allowed; }
.prog { color: var(--ink-sub); margin: var(--space-3) 0 0; }
</style>
