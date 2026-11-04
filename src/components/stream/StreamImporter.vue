<script setup lang="ts">
import { ref } from 'vue';
import { playerState, loadOnlineStream, showToast } from '../../stores/player';

const streamUrl = ref('');
const exampleUrls = [
  { label: 'Ambient Stream (Direct)', url: 'https://raw.githubusercontent.com/rafaelreis-hotmart/Audio-Sample-files/master/sample.mp3' },
  { label: 'YouTube Sample', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
];

async function handleLoad() {
  if (!streamUrl.value.trim()) {
    showToast('Please enter a YouTube, SoundCloud, or audio stream URL');
    return;
  }
  try {
    await loadOnlineStream(streamUrl.value.trim());
    streamUrl.value = '';
    playerState.activeView = 'player';
  } catch (err: any) {
    // Handled in store toast
  }
}

function selectExample(url: string) {
  streamUrl.value = url;
}
</script>

<template>
  <div class="stream-importer-panel">
    <div class="stream-card">
      <div class="stream-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
          <path d="M2 12h20"/>
        </svg>
        <h3>Direct Audio & Media Stream Resolver</h3>
      </div>
      <p class="stream-sub">
        Connect directly to YouTube, SoundCloud, or live audio streams. The stream is proxied chunk-by-chunk to bypass CORS, enabling real-time waveform inspection, 15s passage extraction, and MERT neural embeddings.
      </p>

      <div class="input-row">
        <input
          v-model="streamUrl"
          type="url"
          class="stream-input"
          placeholder="Paste YouTube, SoundCloud, or direct audio link…"
          :disabled="playerState.isResolvingStream"
          @keyup.enter="handleLoad"
        />
        <button
          class="btn-load"
          :disabled="playerState.isResolvingStream || !streamUrl.trim()"
          @click="handleLoad"
        >
          <span v-if="playerState.isResolvingStream" class="spinner"></span>
          <span>{{ playerState.isResolvingStream ? 'Resolving Stream…' : 'Load Stream' }}</span>
        </button>
      </div>

      <div class="examples">
        <span class="ex-label">Quick test links:</span>
        <button
          v-for="ex in exampleUrls"
          :key="ex.label"
          class="btn-chip"
          @click="selectExample(ex.url)"
        >
          {{ ex.label }}
        </button>
      </div>

      <div v-if="playerState.isStreamingAnalysis" class="stream-progress-card">
        <div class="prog-title">
          <span class="prog-dot"></span>
          Progressive AI Feature Stream Active
        </div>
        <p class="prog-desc">
          Receiving live 12-second feature windows via Server-Sent Events (SSE):
          Window {{ playerState.streamProgress.current }} / {{ playerState.streamProgress.total }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stream-importer-panel {
  max-width: 800px;
  margin: 32px auto;
  padding: 0 16px;
}
.stream-card {
  background: var(--panel, #151518);
  border: 1px solid var(--line2, #2C2C31);
  border-radius: 16px;
  padding: 28px;
}
.stream-header {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--accent, #8EC5B8);
}
.stream-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  color: var(--fg, #DCDCE0);
}
.stream-sub {
  color: var(--sub, #A1A1A6);
  font-size: 14px;
  line-height: 1.5;
  margin: 12px 0 20px;
}
.input-row {
  display: flex;
  gap: 10px;
}
.stream-input {
  flex: 1;
  background: var(--bg, #0E0E10);
  border: 1px solid var(--line2, #2C2C31);
  border-radius: 10px;
  padding: 12px 16px;
  color: var(--fg, #DCDCE0);
  font-size: 14px;
  outline: none;
  transition: border-color .2s ease;
}
.stream-input:focus {
  border-color: var(--accent, #8EC5B8);
}
.btn-load {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--accent, #8EC5B8);
  color: #0E0E10;
  font-weight: 600;
  font-size: 14px;
  border: none;
  border-radius: 10px;
  padding: 0 20px;
  cursor: pointer;
  transition: opacity .2s ease;
}
.btn-load:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.examples {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  font-size: 12px;
}
.ex-label {
  color: var(--mute, #85858B);
}
.btn-chip {
  background: var(--raise, #1B1B1F);
  border: 1px solid var(--line, #1F1F23);
  color: var(--sub, #A1A1A6);
  font-size: 12px;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
.btn-chip:hover {
  background: var(--line2, #2C2C31);
  color: var(--fg, #DCDCE0);
}
.stream-progress-card {
  margin-top: 20px;
  background: rgba(142, 197, 184, 0.08);
  border: 1px solid rgba(142, 197, 184, 0.25);
  border-radius: 10px;
  padding: 14px;
}
.prog-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent, #8EC5B8);
}
.prog-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent, #8EC5B8);
  animation: pulse 1.5s infinite;
}
.prog-desc {
  font-size: 12px;
  color: var(--sub, #A1A1A6);
  margin: 4px 0 0 16px;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #0E0E10;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

