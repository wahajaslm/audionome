<script setup lang="ts">
/**
 * Settings (port of index.html's renderSettings() and its 'toggle-tracking',
 * 'toggle-auto-analyze', 'clearevents', 'export' actions) plus the volume that the classic
 * player kept in the playback bar. Every switch is stored in Dexie `settings` through the
 * stores, so it is the same after a reload — and the same in the legacy player.
 */
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { STUDIO_URL } from '../../core/diagnostics';
import { deleteAllUserData } from '../../core/repository';
import { openStudio } from '../../core/studioLink';
import { useIntelligenceStore } from '../../stores/intelligence';
import { useLibraryStore } from '../../stores/library';
import { useListeningStore } from '../../stores/listening';
import { usePlaybackStore } from '../../stores/playback';
import Button from '../../ui/Button.vue';
import Icon from '../../ui/Icon.vue';
import Switch from '../../ui/Switch.vue';

const listening = useListeningStore();
const library = useLibraryStore();
const playback = usePlaybackStore();
const router = useRouter();
const { learning } = storeToRefs(listening);
const { autoAnalyze } = storeToRefs(library);
const { events } = storeToRefs(useIntelligenceStore());
const eventsCount = computed(() => events.value.length);
/** Clearing history asks once, in place (no browser dialog). */
const confirmClear = ref(false);
const volumePct = computed(() => Math.round(playback.volume * 100));

async function clear() {
  confirmClear.value = false;
  await listening.clearHistory();
}

/** Full reset asks once, in place, like clearing history. */
const confirmReset = ref(false);
async function resetAll() {
  confirmReset.value = false;
  await deleteAllUserData();
  // Reload so every store starts from the empty database instead of patching each one.
  window.location.reload();
}
</script>

<template>
  <div class="page">
    <h1 class="page-title">Settings</h1>
    <p class="lead body">Listening insights, analysis and your data. Everything here is stored only on this device.</p>
    <p class="local label"><Icon name="lock" :size="14" />Audio stays local. Settings and history never leave this browser unless you export them.</p>

    <ol class="list">
      <li class="row">
        <div class="info">
          <div class="item s" id="set-learning">Private listening insights</div>
          <div class="label meta">Record seeks, loops, volume changes and playback on this device to suggest moments you return to. No microphone, no external tracking, no upload. Saving and describing moments work either way.</div>
        </div>
        <Switch :checked="learning" :label="learning ? 'On' : 'Off'" aria-describedby="set-learning" @change="listening.setLearning" />
      </li>
      <li class="row">
        <div class="info">
          <div class="item s" id="set-auto">Automatic local audio analysis</div>
          <div class="label meta">Newly imported songs (and unanalysed songs in your library) are analysed by your local service without asking each time. Only turn this on if you have the rights to analyse your imported recordings.</div>
        </div>
        <Switch :checked="autoAnalyze" :label="autoAnalyze ? 'On' : 'Off'" aria-describedby="set-auto" @change="library.setAutoAnalyze" />
      </li>
      <li class="row">
        <div class="info">
          <div class="item s"><label for="set-volume">Volume</label></div>
          <div class="label meta">Remembered between visits.</div>
        </div>
        <div class="vol">
          <Icon name="volume" :size="16" />
          <input
            id="set-volume"
            type="range"
            min="0"
            max="100"
            :value="volumePct"
            :aria-valuetext="volumePct + '%'"
            @change="playback.setVolume(Number(($event.target as HTMLInputElement).value) / 100)"
          />
          <span class="label pct">{{ volumePct }}%</span>
        </div>
      </li>
      <li class="row">
        <div class="info">
          <div class="item s">Listening history</div>
          <div class="label meta">{{ eventsCount }} private {{ eventsCount === 1 ? 'event' : 'events' }} stored on this device. Erasing them keeps your saved moments and ratings.</div>
          <div v-if="confirmClear" class="ask" role="group" aria-label="Clear listening history">
            <p class="label">Erase {{ eventsCount }} listening {{ eventsCount === 1 ? 'event' : 'events' }}? Attention hints built from them disappear too.</p>
            <div class="btns">
              <Button size="sm" variant="primary" @click="clear">Erase history</Button>
              <Button size="sm" @click="confirmClear = false">Keep</Button>
            </div>
          </div>
        </div>
        <Button variant="outline" :disabled="!eventsCount" @click="confirmClear = true"><Icon name="trash" :size="14" />Clear history</Button>
      </li>
      <li class="row">
        <div class="info">
          <div class="item s">Delete all my data</div>
          <div class="label meta">Removes imported songs, saved moments, ratings, listening history, analyses and settings from this device, and the local service's copies of those songs. The demo recording stays. Export first if you want a copy.</div>
          <div v-if="confirmReset" class="ask" role="group" aria-label="Delete all my data">
            <p class="label">Delete everything Music DNA stored on this device? This cannot be undone.</p>
            <div class="btns">
              <Button size="sm" variant="primary" @click="resetAll">Delete everything</Button>
              <Button size="sm" @click="confirmReset = false">Keep my data</Button>
            </div>
          </div>
        </div>
        <Button variant="outline" @click="confirmReset = true"><Icon name="trash" :size="14" />Delete all</Button>
      </li>
      <li class="row">
        <div class="info">
          <div class="item s">Export your profile</div>
          <div class="label meta">Download your song details, saved moments, ratings and listening history as JSON. Audio files are not included.</div>
        </div>
        <Button variant="outline" @click="listening.exportProfile()">Export</Button>
      </li>
      <li class="row">
        <div class="info">
          <div class="item s">Feature analysis and research studio</div>
          <div class="label meta">Measured audio features, analysis windows and research baselines for each analysed song. The studio needs the local service.</div>
        </div>
        <div class="btns">
          <Button variant="outline" @click="router.push('/admin')">Feature analysis</Button>
          <a class="ext label" :href="STUDIO_URL" target="music-dna-studio" @click.prevent="openStudio()">Research studio ↗</a>
        </div>
      </li>
      <li class="row">
        <div class="info">
          <div class="item s">Original player</div>
          <div class="label meta">The earlier single-page player. It reads the same library and moments.</div>
        </div>
        <a class="ext label" href="/legacy/original-player.html">Open ↗</a>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.page { max-width: var(--content-max); margin: 0 auto; padding: var(--space-6) var(--space-4); font-variant-numeric: tabular-nums; }
h1 { margin: 0; color: var(--ink); }
.lead { color: var(--ink-sub); margin: var(--space-2) 0 0; }
.local { display: flex; align-items: center; gap: var(--space-2); color: var(--ink-mute); margin: var(--space-4) 0 var(--space-4); }
.list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.row { display: flex; align-items: center; gap: var(--space-5); padding: var(--space-4) 0; border-bottom: 1px solid var(--line); }
.info { flex: 1; min-width: 0; }
.s { color: var(--ink); }
.meta { color: var(--ink-mute); margin-top: 3px; max-width: 62ch; line-height: 1.5; }
.btns { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.ask { margin-top: var(--space-3); padding: var(--space-3); border: 1px solid var(--line-strong); border-radius: var(--radius-md); background: var(--bg-panel); }
.ask p { color: var(--ink-sub); margin: 0 0 var(--space-2); }
.vol { display: flex; align-items: center; gap: var(--space-2); color: var(--ink-sub); }
.vol input { width: 140px; accent-color: var(--ink); }
.pct { width: 3em; text-align: right; color: var(--ink-sub); }
.ext {
  display: inline-flex; align-items: center; height: 38px; padding: 0 var(--space-4);
  border: 1px solid var(--line-strong); border-radius: var(--radius-pill); color: var(--ink); text-decoration: none; white-space: nowrap;
}
:deep(button:disabled) { opacity: 0.5; cursor: not-allowed; }
@media (max-width: 600px) { .row { flex-wrap: wrap; gap: var(--space-3); } }
</style>
