<script setup lang="ts">
/**
 * Feature analysis (port of index.html's renderAdmin() / renderAdminViewOnly() and its
 * 'admin-track', 'toggle-admin-win', 'toggle-admin-all-wins', 'analyze-all', 'play-window'
 * actions): service health, the analysis windows of one recording with every measured value,
 * the active-learning queue, research baselines and held-out ranking accuracy.
 * The eight synced spectral canvases are not drawn here; they live in the research studio
 * (linked), which renders them from the same service data.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import type { AudioSegment } from '../../data/types';
import { dmerRows, inSelection, STUDIO_URL, visibleWindows, windowSummary } from '../../core/diagnostics';
import { useDiagnosticsStore } from '../../stores/diagnostics';
import { useIntelligenceStore } from '../../stores/intelligence';
import { useLibraryStore } from '../../stores/library';
import { usePlaybackStore } from '../../stores/playback';
import Button from '../../ui/Button.vue';
import Icon from '../../ui/Icon.vue';
import Tabs from '../../ui/Tabs.vue';
import { formatTime } from '../../ui/format';

const diagnostics = useDiagnosticsStore();
const library = useLibraryStore();
const intelligence = useIntelligenceStore();
const playback = usePlaybackStore();
const route = useRoute();
const { health, diag, bundle, loading, checked, analysis, currentId } = storeToRefs(diagnostics);
const { tracks, analyzing } = storeToRefs(library);

const openWin = ref(-1);
const showAll = ref(false);

onMounted(() => {
  const q = route.query.track;
  if (typeof q === 'string' && q) diagnostics.select(q); else diagnostics.load();
});
watch(currentId, () => { openWin.value = -1; });

const selTrack = computed(() => library.track(currentId.value));
const segs = computed<AudioSegment[]>(() => analysis.value?.segments || []);
const dur = computed(() => analysis.value?.durationSec || selTrack.value?.durationSec || 32);
/** The selection in the player when it is this recording, else the first 12 s. */
const sel = computed(() => (playback.trackId === currentId.value && playback.sel) ? playback.sel : { a: 0, b: Math.min(12, dur.value) });
const visible = computed(() => visibleWindows(segs.value, sel.value, showAll.value));
const queries = computed(() => bundle.value?.activeLearning || diag.value?.activeLearning?.queries || []);
const dmer = computed(() => dmerRows(bundle.value?.dmerBenchmark?.baselines || diag.value?.dmer?.baselines));
const jobs = computed(() => Object.entries(analyzing.value).map(([id, step]) => ({ id, step, title: library.track(id)?.title || id })));
const trackIndex = computed(() => tracks.value.findIndex(t => t.id === currentId.value));

/** Service line, e.g. "Local service online · models dsp, multimodal · 3 analyses stored". */
const healthLine = computed(() => {
  if (!checked.value) return 'Checking the local analysis service…';
  if (!health.value) return 'Local analysis service offline. Start it to analyse songs and see diagnostics (see README → Run).';
  const h = health.value;
  return 'Local service ' + (h.status || 'online') + ' · models ' + ((h.models || []).join(', ') || 'none')
    + (h.dbStats ? ' · ' + h.dbStats.analyses + ' analyses stored' : '');
});

async function playWindow(trackId: string, a: number, b: number) {
  playback.queue = [];
  await playback.openRange(a, b, trackId, true);
}
async function analyzeAll() {
  await library.analyzeAll();
  await diagnostics.load(true);
}
</script>

<template>
  <div class="page">
    <div class="head">
      <div>
        <h1 class="page-title">Feature analysis</h1>
        <p class="lead body">What the local service measured in each analysed recording. Measurements, not conclusions about you.</p>
      </div>
      <div class="actions">
        <Button variant="outline" @click="analyzeAll">Analyse all songs</Button>
        <a class="ext label" :href="STUDIO_URL" target="_blank" rel="noopener">Research studio ↗</a>
      </div>
    </div>

    <p class="status label" role="status">
      <span class="dot" :class="{ on: !!health }" aria-hidden="true"></span>{{ healthLine }}
      <button v-if="checked && !loading" type="button" class="retry label" @click="diagnostics.load(true)">Check again</button>
    </p>

    <template v-if="jobs.length">
      <h2 class="heading sh">Analysis in progress</h2>
      <ol class="list">
        <li v-for="j in jobs" :key="j.id" class="row"><div class="info"><div class="item">Analysing {{ j.title }}…</div><div class="label meta">{{ j.step }}</div></div></li>
      </ol>
    </template>

    <h2 class="heading sh">Recording</h2>
    <Tabs :items="tracks.map(t => t.title)" :selected="trackIndex" label="Recording to inspect" @select="diagnostics.select(tracks[$event].id)" />

    <div class="wins-head">
      <div>
        <h2 class="heading sh">Windows in the selected passage ({{ visible.length }} of {{ segs.length }})</h2>
        <p class="label shs">
          Filtered to {{ formatTime(sel.a) }}–{{ formatTime(sel.b) }} (select a passage in the player to change it).
          Open a window for every measured value.
        </p>
      </div>
      <Button v-if="segs.length > 6" size="sm" @click="showAll = !showAll">{{ showAll ? 'Selected passage only' : 'Show all ' + segs.length + ' windows' }}</Button>
    </div>
    <ol class="list">
      <li v-if="!segs.length" class="row none body">
        This recording has not been analysed yet. Choose Analyse all songs, or Analyse locally in Library.
      </li>
      <li v-for="{ s, i } in visible" :key="i" class="win" :class="{ on: inSelection(s, sel) }">
        <div class="win-top">
          <button type="button" class="wname item" :aria-expanded="openWin === i" @click="openWin = openWin === i ? -1 : i">
            Window {{ i + 1 }} · {{ formatTime(s.startSec) }} – {{ formatTime(s.endSec) }}
            <small class="label">Vocal {{ windowSummary(s).vocalPct }}% · {{ windowSummary(s).slopeTag }} · {{ windowSummary(s).brightnessHz }} Hz · Flatness {{ windowSummary(s).flatness.toFixed(4) }}</small>
          </button>
          <div class="hear">
            <button type="button" class="cp" :aria-label="'Listen to window ' + (i + 1)" @click="playWindow(currentId, s.startSec, s.endSec)"><Icon name="play" :size="11" /></button>
            <span class="label">RMS {{ windowSummary(s).rms.toFixed(4) }}<small class="caption">Flux {{ windowSummary(s).flux.toFixed(3) }} · Onset {{ windowSummary(s).onset.toFixed(2) }}</small></span>
          </div>
          <div class="bars" aria-hidden="true">
            <i v-for="(b, k) in windowSummary(s).bars" :key="k" :class="{ pos: b.pos }" :style="{ height: b.h + 'px' }"></i>
          </div>
        </div>
        <dl v-if="openWin === i" class="detail label">
          <dt>Acoustic descriptors</dt>
          <dd>RMS {{ windowSummary(s).rms.toFixed(5) }} · Slope {{ windowSummary(s).slope >= 0 ? '+' : '' }}{{ windowSummary(s).slope.toFixed(4) }}/s · Vocal {{ windowSummary(s).vocalPct }}% · Brightness {{ windowSummary(s).brightnessHz }} Hz · Flux {{ windowSummary(s).flux.toFixed(4) }} · Onset {{ windowSummary(s).onset.toFixed(4) }} · Flatness {{ windowSummary(s).flatness.toFixed(4) }} · ZCR {{ windowSummary(s).zcr.toFixed(4) }}</dd>
          <dt>12 pitch classes</dt>
          <dd>{{ windowSummary(s).chroma.map(c => c.note + ': ' + c.value.toFixed(2)).join(' · ') }}</dd>
          <dt>8 MFCC timbre coefficients</dt>
          <dd>{{ windowSummary(s).mfccs.length ? windowSummary(s).mfccs.map((m, k) => 'c' + (k + 1) + ': ' + m.toFixed(3)).join(' · ') : 'Not in this analysis' }}</dd>
          <dt>Embedding ({{ windowSummary(s).embeddingDims }}-D), first 16 values</dt>
          <dd>[{{ windowSummary(s).deepHead.map(v => v.toFixed(3)).join(', ') }}…]</dd>
        </dl>
      </li>
    </ol>

    <h2 class="heading sh">Active-learning queue</h2>
    <p class="label shs">Passages the model is least sure about, so asking about them teaches it the most.</p>
    <ol class="list">
      <li v-if="!queries.length" class="row none body">Needs the local service and an analysed recording.</li>
      <li v-for="(q, k) in queries" :key="k" class="row">
        <button type="button" class="cp" :aria-label="'Listen to ' + formatTime(q.startSec)" @click="playWindow(q.trackId || currentId, q.startSec, q.endSec)"><Icon name="play" :size="12" /></button>
        <div class="info">
          <div class="item">{{ library.track(q.trackId || currentId)?.title || 'Recording' }} <span class="mute">— {{ formatTime(q.startSec) }} to {{ formatTime(q.endSec) }}</span></div>
          <div class="label meta">“{{ q.question }}” · acquisition {{ q.acquisitionScore }} · uncertainty {{ q.uncertainty }} · modal disagreement {{ q.modalDisagreement }}</div>
        </div>
      </li>
    </ol>

    <h2 class="heading sh">Emotion research baseline (Personalized-DMER)</h2>
    <p class="label shs">A supporting research benchmark (concordance correlation, CCC). It is not used to label your moments.</p>
    <ol class="list">
      <li v-if="!dmer.length" class="row none body">Needs the local service and at least one analysed recording.</li>
      <li v-for="d in dmer" :key="d.name" class="row">
        <div class="info"><div class="item">{{ d.name }}</div><div class="label meta">{{ d.desc }}</div></div>
        <span class="label num">CCC {{ Number(d.ccc).toFixed(4) }} · RMSE {{ Number(d.rmse).toFixed(4) }}</span>
      </li>
    </ol>

    <template v-if="intelligence.evaluations.length">
      <h2 class="heading sh">Held-out preference ranking</h2>
      <ol class="list">
        <li v-for="ev in intelligence.evaluations" :key="ev.modelId" class="row">
          <div class="info">
            <div class="item">Model <span class="mute">— {{ ev.modelId }}</span></div>
            <div class="label meta">Tested songs {{ ev.testedTracks }} · compared pairs {{ ev.comparedPairs }} · personal accuracy {{ Math.round(ev.personalAccuracy * 100) }}% vs baseline {{ Math.round(ev.baselineAccuracy * 100) }}%</div>
          </div>
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
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.ext { display: inline-flex; align-items: center; height: 38px; padding: 0 var(--space-4); border: 1px solid var(--line-strong); border-radius: var(--radius-pill); color: var(--ink); text-decoration: none; white-space: nowrap; }
.status { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); color: var(--ink-sub); margin: var(--space-4) 0 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--wave-off); }
.dot.on { background: var(--ink); }
.retry { border: 0; background: none; color: var(--ink); text-decoration: underline; cursor: pointer; padding: 0; }
.sh { color: var(--ink); margin: var(--space-6) 0 var(--space-2); }
.shs { color: var(--ink-sub); margin: 0 0 var(--space-3); }
.wins-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-3); }
.list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.row { display: flex; align-items: center; gap: var(--space-4); padding: 14px 0; border-bottom: 1px solid var(--line); }
.none { color: var(--ink-sub); }
.info { flex: 1; min-width: 0; }
.meta, .mute { color: var(--ink-mute); }
.meta { margin-top: 3px; }
.num { color: var(--ink); white-space: nowrap; }
.cp { width: 34px; height: 34px; flex: none; border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: none; color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.win { border-bottom: 1px solid var(--line); padding: 14px 0; }
.win-top { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 220px) 120px; align-items: center; gap: var(--space-2) var(--space-5); }
.wname { padding: 0; border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; }
.wname small { display: block; color: var(--ink-mute); margin-top: 3px; }
/* Windows inside the selected passage: the selection is the listener's choice, so its name is accent. */
.win.on .wname { color: var(--accent); }
.hear { display: flex; align-items: center; gap: var(--space-3); color: var(--ink); }
.hear small { display: block; color: var(--ink-mute); }
.bars { display: flex; align-items: center; justify-content: space-between; height: 30px; }
.bars i { width: var(--wave-bar); border-radius: var(--radius-xs); background: var(--wave-off); }
.bars i.pos { background: var(--wave-played); }
.detail { margin: var(--space-3) 0 0 var(--space-6); color: var(--ink-sub); }
.detail dt { color: var(--ink); margin-top: var(--space-2); }
.detail dd { margin: 2px 0 0; overflow-wrap: anywhere; }
@media (max-width: 600px) {
  .win-top { grid-template-columns: minmax(0, 1fr); }
  .bars { display: none; }
  .detail { margin-left: 0; }
}
</style>
