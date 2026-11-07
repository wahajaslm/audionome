<script setup lang="ts">
/**
 * Library (port of index.html's renderLibrary() and its 'import', 'playlib', 'open-track',
 * 'analyze', 'deltrack', 'toggle-stream-input' actions). Imported files and opened streams
 * share one list. Every action goes through the library / playback stores.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import type { PlayableTrack } from '../../core/library';
import { useLibraryStore } from '../../stores/library';
import { useMomentsStore } from '../../stores/moments';
import { useIntelligenceStore } from '../../stores/intelligence';
import { usePlaybackStore } from '../../stores/playback';
import { useUiStore } from '../../stores/ui';
import Button from '../../ui/Button.vue';
import Icon from '../../ui/Icon.vue';
import { formatTime } from '../../ui/format';
import StreamImport from './StreamImport.vue';
import Artwork from '../../ui/Artwork.vue';
import { useArtwork } from '../../composables/useArtwork';

const library = useLibraryStore();
const { artworkFor } = useArtwork();
const momentsStore = useMomentsStore();
const intelligence = useIntelligenceStore();
const playback = usePlaybackStore();
const ui = useUiStore();
const router = useRouter();
const { tracks, analyzing, rightsAsk, autoAnalyze, analysisQueue, waitingForService, analysisFailed, timelineStatus } = storeToRefs(library);

const fileInput = ref<HTMLInputElement | null>(null);
const showStream = ref(false);
/** Track whose "Delete song?" question is open (deleting also removes its saved moments). */
const confirmDelete = ref<string | null>(null);

const uploaded = computed(() => tracks.value.filter(t => t.id !== 'original-demo'));
const sections = computed(() => [
  { key: 'own', title: 'Your songs (' + uploaded.value.length + ')', items: uploaded.value, empty: 'No songs yet. Choose Import audio to add an MP3, WAV, FLAC, M4A or OGG file.' },
]);

const momentCount = (id: string) => momentsStore.moments.filter(m => m.trackId === id).length;
const analysisOf = (id: string) => intelligence.analysisFor(id);
const isCurrent = (t: PlayableTrack) => playback.trackId === t.id;

/**
 * ANALYSED MEANS ALL OF IT - "Analysed" used to mean only the window analysis, while Song
 * anatomy and Explore wait for the stems / beats / chords job, so a song said "Analysed" and its
 * anatomy was empty. Each row now shows a 3-part bar (Sound · Beats & chords · Stems) and says
 * "Analysed" only when all three are done.
 * Example: sound done, beats running, stems 12th in line → "Beats & chords: Finding beats and chords".
 */
type PartState = 'done' | 'running' | 'waiting' | 'error' | 'none';
interface Part { name: string; state: PartState; text: string }
const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const jobState = (v: string | undefined): PartState => v === 'done' ? 'done' : v === 'running' ? 'running' : v === 'waiting' ? 'waiting' : v === 'error' ? 'error' : 'none';
function parts(id: string): Part[] {
  const tl = timelineStatus.value[id];
  const sound: PartState = library.isFullyAnalysed(id) ? 'done' : analyzing.value[id] ? 'running'
    : analysisQueue.value.includes(id) || waitingForService.value.includes(id) ? 'waiting' : analysisFailed.value[id] ? 'error' : 'none';
  const job = (state: PartState) => state === 'running' ? (tl?.stage || 'running')
    : state === 'waiting' ? (tl?.position ? ordinal(tl.position) + ' in line' : 'waiting') : state === 'error' ? 'failed' : state === 'done' ? 'done' : 'not started';
  const beats = jobState(tl?.quick), stems = jobState(tl?.full);
  return [
    { name: 'Sound', state: sound, text: sound === 'running' ? analyzing.value[id] : sound === 'waiting' ? 'queued' : sound === 'error' ? 'failed' : sound === 'done' ? 'done' : 'not started' },
    { name: 'Beats & chords', state: beats, text: job(beats) },
    { name: 'Stems', state: stems, text: job(stems) },
  ];
}
const allDone = (id: string) => parts(id).every(p => p.state === 'done');
/** The first part that is not done, e.g. "Stems: 12th in line". */
function progressText(id: string): string {
  const next = parts(id).find(p => p.state !== 'done');
  return next ? next.name + ': ' + next.text : 'Sound, beats & chords and stems ready';
}
const rowState = (id: string) => {
  const ps = parts(id);
  return ps.some(p => p.state === 'running') ? 'Analysing…' : ps.some(p => p.state === 'waiting') ? 'Queued' : '';
};

let stopStatus: (() => void) | null = null;
onMounted(() => { stopStatus = library.watchTimelineStatus(); });
onUnmounted(() => stopStatus?.());

async function onFiles(e: Event) {
  const input = e.target as HTMLInputElement;
  try {
    const added = await library.importFiles(Array.from(input.files || []));
    if (added.length) router.push('/');
  } catch (err) {
    console.error(err);
    ui.notify('Import failed.');
  } finally {
    input.value = '';
  }
}

/** Round play: toggles the loaded song; another song loads and plays here, without leaving Library. */
async function playRow(t: PlayableTrack) {
  if (isCurrent(t) && !playback.loading) { await playback.togglePlay(); return; }
  await playback.changeTrack(t, true);
}

/** The song title opens Now playing with that song. */
async function openRow(t: PlayableTrack) {
  if (!isCurrent(t)) await playback.changeTrack(t, true);
  router.push('/');
}

async function remove(id: string) {
  confirmDelete.value = null;
  await library.deleteTrack(id);
}
</script>

<template>
  <div class="page">
    <!-- Layout rule "Other pages": page title, one lead line, then open lists. -->
    <div class="head">
      <div>
        <h1 class="page-title">Library</h1>
        <p class="lead body">Your songs and whether they have been analysed on this device.</p>
      </div>
      <div class="actions">
        <!-- Button rule: at most one primary per view. -->
        <Button variant="primary" @click="fileInput?.click()">Import audio</Button>
        <Button variant="outline" :aria-expanded="showStream" @click="showStream = !showStream">Add from a link</Button>
        <Button @click="router.push('/admin')">Song anatomy →</Button>
      </div>
      <input
        ref="fileInput"
        type="file"
        class="file"
        accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac,.opus"
        multiple
        aria-label="Import audio files"
        @change="onFiles"
      />
    </div>

    <StreamImport v-if="showStream" @close="showStream = false" />

    <p class="local label">
      <Icon name="lock" :size="14" />
      Audio stays on your device.
      {{ autoAnalyze ? 'New songs are analysed automatically by your local service (turn this off in Settings).' : 'Analysis runs only when you ask for it.' }}
    </p>

    <p v-if="waitingForService.length" class="local label" role="status">
      Analysis paused for {{ waitingForService.length }} {{ waitingForService.length === 1 ? 'song' : 'songs' }}: waiting for the local service. It resumes by itself.
    </p>

    <template v-for="sec in sections" :key="sec.key">
    <h2 v-if="sec.items.length || sec.empty" class="sh heading">{{ sec.title }}</h2>
    <ol v-if="sec.items.length || sec.empty" class="list">
      <li v-if="!sec.items.length" class="lrow note body">{{ sec.empty }}</li>
        <li v-for="t in sec.items" :key="t.id" class="lrow" :aria-current="isCurrent(t) ? 'true' : undefined">
          <button type="button" class="cp" :class="{ on: isCurrent(t) && playback.playing, cur: isCurrent(t) && !playback.playing }" :aria-label="(isCurrent(t) && playback.playing ? 'Pause ' : 'Play ') + t.title" @click="playRow(t)">
            <Icon :name="isCurrent(t) && playback.playing ? 'pause' : 'play'" :size="12" />
          </button>
          <button type="button" class="thumb" tabindex="-1" aria-hidden="true" @click="openRow(t)"><Artwork v-bind="artworkFor(t)" :size="44" radius="6px" /></button>
          <div class="info">
            <button type="button" class="s item title" @click="openRow(t)">
              {{ t.title }} <span class="mute">— {{ t.artist }}</span>
              <span v-if="isCurrent(t)" class="now caption">{{ playback.playing ? 'Playing' : 'Loaded' }}</span>
            </button>
            <div class="meta label">
              {{ formatTime(t.durationSec) }}
              <template v-if="momentCount(t.id)"> · {{ momentCount(t.id) }} saved {{ momentCount(t.id) === 1 ? 'moment' : 'moments' }}</template>
              <template v-if="analyzing[t.id]"> · {{ analyzing[t.id] }}</template>
              <template v-else-if="analysisOf(t.id)"> · {{ analysisOf(t.id)!.segments.length }} windows analysed ({{ analysisOf(t.id)!.method }})</template>
              <template v-else> · Not analysed yet</template>
              <template v-if="analysisFailed[t.id] && !analyzing[t.id] && !library.isFullyAnalysed(t.id)"> · <span class="fail">Analysis failed: {{ analysisFailed[t.id] }}</span></template>
            </div>
            <div v-if="t.id !== 'original-demo' && !allDone(t.id) && (library.isFullyAnalysed(t.id) || rowState(t.id))" class="prog">
              <span class="bar" role="img" :aria-label="parts(t.id).map(p => p.name + ' ' + p.text).join(', ')">
                <i v-for="p in parts(t.id)" :key="p.name" :class="p.state" :title="p.name + ': ' + p.text"></i>
              </span>
              <span class="label prog-text">{{ progressText(t.id) }}</span>
            </div>

            <!-- Rights rule (classic confirm, now in place): asked only when automatic analysis is off. -->
            <div v-if="rightsAsk === t.id" class="ask" role="group" aria-label="Analysis rights">
              <p class="label">
                Only proceed if you have rights to analyze this recording. File ownership or playback alone may not be enough.
              </p>
              <div class="ask-btns">
                <Button size="sm" variant="primary" @click="library.analyze(t.id, false, true)">I have the rights · analyse</Button>
                <Button size="sm" @click="rightsAsk = null">Cancel</Button>
              </div>
            </div>
            <div v-if="confirmDelete === t.id" class="ask" role="group" aria-label="Delete song">
              <p class="label">
                Delete this song{{ momentCount(t.id) ? ' and its ' + momentCount(t.id) + ' saved ' + (momentCount(t.id) === 1 ? 'moment' : 'moments') : '' }}? This cannot be undone.
              </p>
              <div class="ask-btns">
                <Button size="sm" variant="primary" @click="remove(t.id)">Delete</Button>
                <Button size="sm" @click="confirmDelete = null">Keep</Button>
              </div>
            </div>
          </div>
          <span v-if="rowState(t.id)" class="state label">{{ rowState(t.id) }}</span>
          <!-- "Analysed" only when sound, beats & chords and stems are all done (ANALYSED MEANS ALL OF IT). -->
          <template v-else-if="library.isFullyAnalysed(t.id)">
            <span class="state label">{{ allDone(t.id) || t.id === 'original-demo' ? 'Analysed' : 'Partly analysed' }}</span>
            <Button size="sm" class="hide-phone" @click="router.push({ path: '/admin', query: { track: t.id } })">Anatomy →</Button>
          </template>
          <Button v-else size="sm" variant="outline" @click="library.analyze(t.id)">Analyse locally</Button>
          <button
            v-if="t.id !== 'original-demo'"
            type="button"
            class="rm"
            :aria-label="'Delete ' + t.title"
            title="Delete song from library"
            @click="confirmDelete = t.id"
          >
            <Icon name="trash" :size="14" />
          </button>
        </li>
    </ol>
    </template>
  </div>
</template>

<style scoped>
.page { max-width: var(--content-max); margin: 0 auto; padding: var(--space-6) var(--space-4); font-variant-numeric: tabular-nums; }
.head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-4); }
h1 { margin: 0; color: var(--ink); }
.lead { color: var(--ink-sub); margin: var(--space-2) 0 0; }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.file { display: none; }
.local { display: flex; align-items: center; gap: var(--space-2); color: var(--ink-mute); margin: var(--space-4) 0 0; }
.sh { color: var(--ink); margin: var(--space-6) 0 var(--space-2); }
.list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.lrow { display: flex; align-items: center; gap: var(--space-4); padding: 14px 0; border-bottom: 1px solid var(--line); }
.note { color: var(--ink-sub); }
.cp {
  width: 40px; height: 40px; flex: none;
  border: 1px solid var(--line-strong); border-radius: var(--radius-pill);
  background: none; color: var(--ink);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
/* Same rule as MomentRow: accent while playing, accent outline while loaded and paused. */
.cp.on { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.cp.cur { border-color: var(--accent); color: var(--accent); }
.thumb { flex: none; padding: 0; border: 0; background: none; cursor: pointer; }
.info { flex: 1; min-width: 0; }
.title { display: block; max-width: 100%; padding: 0; border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mute { color: var(--ink-mute); }
/* The loaded song is a moment-free state, so it is labelled in ink-sub, not accent. */
.now { color: var(--ink-sub); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 1px 6px; margin-left: 6px; }
.meta { color: var(--ink-mute); margin-top: 3px; }
.state { color: var(--ink-sub); white-space: nowrap; }
.fail { color: var(--ink); }
/* Progress: three short segments, no animation (Motion rule: nothing pulses on its own). */
.prog { display: flex; align-items: center; gap: var(--space-2); margin-top: 6px; min-width: 0; }
.bar { display: flex; gap: 3px; flex: none; }
.bar i { display: block; width: 28px; height: 4px; border-radius: 2px; background: var(--wave-off); opacity: 0.45; }
.bar i.done { background: var(--ink-mute); opacity: 1; }
.bar i.running { background: var(--accent); opacity: 1; }
.bar i.waiting { background: none; box-shadow: inset 0 0 0 1px var(--wave-off); opacity: 1; }
.bar i.error { background: var(--ink); opacity: 1; }
.prog-text { color: var(--ink-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ask { margin-top: var(--space-3); padding: var(--space-3); border: 1px solid var(--line-strong); border-radius: var(--radius-md); background: var(--bg-panel); }
.ask p { color: var(--ink-sub); margin: 0 0 var(--space-2); }
.ask-btns { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.rm {
  width: var(--hit-target); height: var(--hit-target); flex: none;
  border: 0; border-radius: var(--radius-sm); background: none; color: var(--ink-mute);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.rm:hover { background: var(--bg-raise); color: var(--ink); }
@media (max-width: 600px) {
  .lrow { flex-wrap: wrap; gap: var(--space-3); }
  .info { flex-basis: calc(100% - 116px); }
  .hide-phone { display: none; }
}
</style>
