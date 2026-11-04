<script setup lang="ts">
/**
 * Song anatomy: how one song is built, from the timeline (musicdna/features/timeline.py).
 *   facts line · song map (parts, spectrum, loudness, stems) · song order · chord chart (each part once, as its repeating bars), grouped
 *   into parts · what has been analysed and how long it took.
 *
 * ANATOMY FIX - this screen was "Feature analysis": 12 s windows as raw numbers (RMS 0.0034,
 * flatness 0.0066, 16 embedding values), internal active-learning scores, and an emotion
 * benchmark scored on four invented listener profiles, shown as if it were about your music.
 * Those research views stay in the research studio (linked); this page shows the song.
 * Example: "D Minor · 79 BPM · 4:39 · 84 bars · 4 kinds of part · part D heard 3×".
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { chordChart, fetchTimeline, hasFull, startTimeline, type Timeline, type TierState } from '../../core/timeline';
import { STUDIO_URL } from '../../core/diagnostics';
import { openStudio } from '../../core/studioLink';
import { useIntelligenceStore } from '../../stores/intelligence';
import { useLibraryStore } from '../../stores/library';
import { usePlaybackStore } from '../../stores/playback';
import { useTimelineStore } from '../../stores/timeline';
import Button from '../../ui/Button.vue';
import Icon from '../../ui/Icon.vue';
import SongMap from './SongMap.vue';
import { formatTime } from '../../ui/format';

const library = useLibraryStore();
const playback = usePlaybackStore();
const intelligence = useIntelligenceStore();
const timelineStore = useTimelineStore();
const route = useRoute();
const router = useRouter();
const { tracks, analyzing } = storeToRefs(library);

/** The song shown: ?track=<id>, else the one in the player, else the first in the library. */
const picked = ref<string | null>(typeof route.query.track === 'string' ? route.query.track : null);
const id = computed(() => picked.value || playback.trackId || tracks.value[0]?.id || null);
const track = computed(() => library.track(id.value));
const isLoaded = computed(() => !!id.value && id.value === playback.trackId);
function pick(tid: string): void {
  picked.value = tid;
  router.replace({ query: { track: tid } });
}

// The loaded song's timeline comes from the store (it also has the browser spectrum); any other
// song is fetched here and polled until its stems are in.
const own = ref<Timeline | null>(null);
const ownOff = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;
async function pollOwn(tid: string): Promise<void> {
  if (timer) clearTimeout(timer);
  if (isLoaded.value || tid !== id.value) return;
  const tl = await fetchTimeline(tid);
  if (tid !== id.value) return;
  ownOff.value = !tl && (await startTimeline(tid)) !== 'ok';
  own.value = tl;
  if (!hasFull(tl) && tl?.status?.full !== 'error') timer = setTimeout(() => pollOwn(tid), ownOff.value ? 10000 : 3000);
}
watch(id, tid => { own.value = null; if (tid) pollOwn(tid); }, { immediate: true });
onBeforeUnmount(() => { if (timer) clearTimeout(timer); });

const tl = computed(() => (isLoaded.value ? timelineStore.timeline : own.value));
const spectrum = computed(() => (isLoaded.value ? timelineStore.spectrum : null));
const duration = computed(() => tl.value?.durationSec || track.value?.durationSec || 0);
const serviceOff = computed(() => (isLoaded.value ? timelineStore.serviceOff : ownOff.value));

const facts = computed(() => {
  const x = tl.value, out: string[] = [];
  if (!x) return out;
  if (x.key) out.push(x.key);
  if (x.tempoBpm) out.push(Math.round(x.tempoBpm) + ' BPM');
  if (duration.value) out.push(formatTime(duration.value));
  if (x.downbeats?.length) out.push(x.downbeats.length + ' bars');
  if (x.sections?.length) {
    const counts = new Map<string, number>();
    for (const p of x.sections) counts.set(p.label, (counts.get(p.label) ?? 0) + 1);
    out.push(counts.size + ' kinds of part');
    const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n > 1) out.push(`part ${top} heard ${n}×`);
  }
  if (x.chords?.length) out.push(x.chords.length + ' chord changes');
  return out;
});

const chart = computed(() => (tl.value ? chordChart(tl.value) : { order: [], parts: [] }));
/** The take under the playhead (lit in the song order) and its bar (lit in "every bar"). */
const nowTake = computed(() => (isLoaded.value ? chart.value.order.findIndex(s => playback.t >= s.a && playback.t < s.b) : -1));
const nowBar = computed(() => {
  if (!isLoaded.value) return -1;
  for (const p of chart.value.parts) for (const b of p.bars) if (playback.t >= b.a && playback.t < b.b) return b.n;
  return -1;
});
const partVar = (label: string) => 'var(--part-' + 'abcd'[(label.charCodeAt(0) - 65) % 4] + ')';

function seek(sec: number): void {
  if (isLoaded.value) playback.clickSeek(sec);
  else if (track.value) playback.selectTrack(track.value, sec, true);
}
function playPart(a: number, b: number): void {
  if (id.value) playback.openRange(a, b, id.value, true);
}

/** What has been analysed for this song, in plain words. */
const tierWord = (s: TierState | undefined, sec?: number) =>
  s === 'done' ? 'Done' + (sec ? ` in ${sec} s` : '') : s === 'running' ? 'Running…' : s === 'waiting' ? 'Waiting in line'
    : s === 'error' ? 'Failed' : s === 'stale' ? 'Stopped (service restarted)' : 'Not started';
const status = computed(() => {
  const st = tl.value?.status as (Record<string, unknown> & { quick?: TierState; full?: TierState }) | undefined;
  const analysis = intelligence.analysisFor(id.value);
  const step = id.value ? analyzing.value[id.value] : undefined;
  return [
    { k: 'Beats, chords, parts', v: serviceOff.value && !tl.value ? 'Needs the analysis service' : tierWord(st?.quick, st?.quickSec as number | undefined), ok: st?.quick === 'done' },
    { k: 'Stems and vocal melody', v: serviceOff.value && !tl.value ? 'Needs the analysis service' : tierWord(st?.full, st?.fullSec as number | undefined) + (tl.value?.stemSource ? ' · ' + tl.value.stemSource : ''), ok: st?.full === 'done' },
    { k: 'Spectrum', v: !isLoaded.value ? 'Made in the browser when the song is in the player' : spectrum.value ? `Done · ${Math.round(spectrum.value.fps)} frames/s, ${spectrum.value.bands} bands` : timelineStore.spectrumState === 'error' ? 'Could not read the audio' : 'Reading audio…', ok: !!spectrum.value },
    { k: 'Similarity windows (Discover, DNA)', v: step ? step : analysis ? 'Done · ' + analysis.method : 'Not analysed', ok: !!analysis },
  ];
});
const error = computed(() => (tl.value?.status?.error ? String(tl.value.status.error) : ''));
const canRerun = computed(() => { const s = tl.value?.status; return !tl.value || s?.quick === 'error' || s?.full === 'error' || s?.quick === 'stale' || s?.full === 'stale'; });
async function rerun(): Promise<void> {
  if (!id.value) return;
  await startTimeline(id.value);
  if (isLoaded.value) timelineStore.load(id.value); else pollOwn(id.value);
}
</script>

<template>
  <div class="page">
    <div class="head">
      <div>
        <h1 class="page-title">Song anatomy</h1>
        <p class="lead body">How the song is built: its parts, chords and instruments, measured from the audio.</p>
      </div>
      <a class="ext label" :href="STUDIO_URL" target="music-dna-studio" @click.prevent="openStudio()">Research studio ↗</a>
    </div>

    <div class="split">
    <!-- Song list on the left (a list, not a row of pills: libraries grow past what pills can hold). -->
    <nav class="songs" aria-label="Songs">
      <button v-for="s in tracks" :key="s.id" type="button" class="song" :aria-current="s.id === id ? 'true' : undefined" @click="pick(s.id)">
        <span class="sname">{{ s.title }}</span>
        <span class="caption smeta">{{ formatTime(s.durationSec || 0) }}<template v-if="s.id === playback.trackId"> · in player</template></span>
      </button>
    </nav>

    <div class="detail">
    <section v-if="track" class="block">
      <div class="title-row">
        <h2 class="heading">{{ track.title }}</h2>
        <span class="caption sub">{{ facts.join(' · ') || (serviceOff ? 'Start the analysis service to see the song’s structure.' : 'Analysing…') }}</span>
      </div>
      <SongMap :timeline="tl" :spectrum="spectrum" :duration="duration" :t="isLoaded ? playback.t : null"
        :spectrum-note="isLoaded ? 'Reading audio…' : 'Open this song in the player to see its spectrum'" @seek="seek" />
    </section>

    <section v-if="chart.parts.length" class="block">
      <h2 class="heading">Song order</h2>
      <div class="order">
        <button v-for="(s, i) in chart.order" :key="i" type="button" class="take" :class="{ now: i === nowTake }"
          :style="{ '--c': partVar(s.label), flexGrow: s.b - s.a }" :aria-label="'Play part ' + s.label + ' from ' + formatTime(s.a)" @click="playPart(s.a, s.b)">
          <span class="tl">{{ s.label }}</span><span class="tt caption">{{ formatTime(s.a) }}</span>
        </button>
      </div>
    </section>

    <section v-if="chart.parts.length" class="block">
      <h2 class="heading">Chord chart</h2>
      <p class="caption sub">Each kind of part once, as the bars it repeats. Click a time to play that take.</p>
      <div v-for="p in chart.parts" :key="p.label" class="part">
        <div class="phead">
          <span class="tag" :style="{ background: partVar(p.label) }">{{ p.label }}</span>
          <span class="caption sub">heard {{ p.times.length }}×</span>
        </div>
        <div class="pbody">
          <div class="pattern">
            <span class="bar-sep">‖</span>
            <template v-for="(bar, k) in p.pattern" :key="k"><span class="pchord">{{ bar.join(' ') }}</span><span class="bar-sep">{{ k === p.pattern.length - 1 ? '‖' : '|' }}</span></template>
            <span v-if="p.repeats > 1" class="rep caption">×{{ p.repeats }}</span>
            <span v-if="p.more" class="rep caption">+{{ p.more }} more bars, no repeating pattern</span>
          </div>
          <div class="times">
            <button v-for="(x, k) in p.times" :key="k" type="button" class="time caption" @click="playPart(x.a, x.b)">{{ formatTime(x.a) }}</button>
          </div>
          <details class="every">
            <summary class="caption">Every bar of the longest take ({{ p.bars.length }})</summary>
            <div class="bars">
              <span v-for="b in p.bars" :key="b.n" class="bar" :class="{ now: b.n === nowBar }"><small>{{ b.n }}</small>{{ b.chords.join(' ') }}</span>
            </div>
          </details>
        </div>
      </div>
    </section>

    <section class="block">
      <h2 class="heading">Analysis</h2>
      <dl class="status">
        <template v-for="s in status" :key="s.k">
          <dt class="caption">{{ s.k }}</dt>
          <dd :class="{ ok: s.ok }">{{ s.v }}</dd>
        </template>
      </dl>
      <p v-if="error" class="caption err">{{ error }}</p>
      <div class="actions">
        <Button v-if="canRerun" size="sm" variant="outline" @click="rerun">Run again</Button>
        <Button v-if="track && !intelligence.analysisFor(id) && !analyzing[track.id]" size="sm" variant="outline" @click="library.analyze(track.id)">Run similarity analysis</Button>
      </div>
    </section>

    </div>
    </div>

    <p v-if="!tracks.length" class="body sub">Import a song in Library to see how it is built.</p>
  </div>
</template>

<style scoped>
.page { max-width: var(--content-wide); margin: 0 auto; padding: var(--space-6) var(--space-6) var(--space-8); display: flex; flex-direction: column; gap: var(--space-5); box-sizing: border-box; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-4); flex-wrap: wrap; }
.page-title { margin: 0; color: var(--ink); }
.lead { margin: var(--space-1) 0 0; color: var(--ink-sub); }
.ext { color: var(--ink-sub); text-decoration: none; }
.ext:hover { color: var(--ink); }
.split { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: var(--space-5); align-items: start; }
.songs { display: flex; flex-direction: column; gap: 2px; position: sticky; top: var(--space-4); max-height: calc(100vh - 160px); overflow-y: auto; }
.song { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 8px 10px; border: none; border-radius: var(--radius-sm); background: none; cursor: pointer; font-family: var(--font-sans); min-width: 0; }
.song:hover { background: var(--bg-raise); }
.song[aria-current='true'] { background: var(--chip-on); }
.song:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.sname { color: var(--ink); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.smeta { color: var(--ink-mute); font-variant-numeric: tabular-nums; }
.detail { display: flex; flex-direction: column; gap: var(--space-5); min-width: 0; }
.block { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.title-row { display: flex; flex-direction: column; gap: 2px; }
.title-row h2, .block > h2 { margin: 0; color: var(--ink); }
.sub { color: var(--ink-mute); }

.order { display: flex; gap: 3px; min-width: 0; }
.take { flex-basis: 0; min-width: 26px; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 6px 6px 5px;
  border: none; border-top: 4px solid var(--c); border-radius: 4px; background: var(--bg-raise); cursor: pointer; color: var(--ink); font-family: var(--font-sans); overflow: hidden; }
.take:hover { background: var(--chip-on); }
.take.now { background: var(--accent-fill); outline: 1px solid var(--accent-line); }
.take:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.tl { font-weight: 600; font-size: 13px; }
.tt { color: var(--ink-mute); font-variant-numeric: tabular-nums; white-space: nowrap; }
.part { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: var(--space-3); padding: var(--space-3) 0; border-top: 1px solid var(--line); align-items: start; }
.phead { display: flex; align-items: center; gap: 8px; }
.tag { width: 24px; height: 24px; border-radius: 6px; display: grid; place-items: center; color: #0e0e10; font: 600 12px var(--font-sans); flex: none; }
.pbody { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.pattern { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; font-size: 20px; color: var(--ink); }
.bar-sep { color: var(--ink-mute); }
.pchord { font-weight: 500; }
.rep { color: var(--ink-sub); font-size: 13px; }
.times { display: flex; gap: 4px; flex-wrap: wrap; }
.time { border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: none; color: var(--ink-sub); padding: 1px 9px; cursor: pointer; font-variant-numeric: tabular-nums; }
.time:hover { color: var(--ink); border-color: var(--chip-on-line); }
.every summary { cursor: pointer; color: var(--ink-mute); }
.every[open] summary { margin-bottom: 6px; }
.num { font-variant-numeric: tabular-nums; }
.bars { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 4px; }
.bar { position: relative; padding: 14px 8px 6px; border: 1px solid var(--line); border-radius: var(--radius-sm); font-size: 13px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar small { position: absolute; top: 2px; left: 6px; font-size: 9px; color: var(--ink-mute); font-variant-numeric: tabular-nums; }
.bar.now { border-color: var(--accent-line); background: var(--accent-fill); color: var(--accent); }

.status { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 6px var(--space-3); margin: 0; }
.status dt { color: var(--ink-mute); }
.status dd { margin: 0; color: var(--ink-sub); font-size: 13px; }
.status dd.ok { color: var(--ink); }
.err { color: var(--ink-sub); }
.actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
@media (max-width: 820px) {
  .page { padding-left: var(--space-4); padding-right: var(--space-4); }
  .split { grid-template-columns: minmax(0, 1fr); }
  .songs { position: static; max-height: 220px; border-bottom: 1px solid var(--line); padding-bottom: var(--space-2); }
}
@media (max-width: 600px) {
  .part { grid-template-columns: minmax(0, 1fr); }
  .tt { display: none; }
  .status { grid-template-columns: minmax(0, 1fr); }
  .status dd { margin-bottom: 6px; }
}
</style>
