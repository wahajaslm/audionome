<script setup lang="ts">
/**
 * Explore this passage: one caption line of facts, up to three one-line moments you can jump
 * to, the live lanes (spectrum, chords, melody, stems — S / M on the stem labels), "right now
 * vs the whole song" rails, and the measurements and Describe strip folded away.
 *
 * EXPLORE REDESIGN - the panel used to be static: passage averages as bars, 40+ chord chips in
 * three rows (guessed in time), and a Hear row whose "Vocals" was a 300–3400 Hz filter.
 * Everything here now follows the playhead and comes from the timeline tiers
 * (stores/timeline.ts); each lane says what it is waiting for until its tier arrives.
 * Example (1:35–2:41): "1:44 Drums and bass drop out until 1:49."
 */
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlaybackStore } from '../../stores/playback';
import { useMomentFlowStore } from '../../stores/momentFlow';
import { useIntelligenceStore } from '../../stores/intelligence';
import { useMomentsStore } from '../../stores/moments';
import { useTimelineStore } from '../../stores/timeline';
import { exactSummary, passageSummary } from '../../core/diagnostics';
import { barAt, passageMoments, quantile, rankIn, type StemName } from '../../core/timeline';
import { FEELINGS, QUALITIES } from '../../core/moments';
import { grooveDetails, harmonyDetails, similarPassages, teaser, voiceDetails } from '../../core/passageDetails';
import { useLibraryStore } from '../../stores/library';
import DescribeStrip from '../../ui/DescribeStrip.vue';
import AskRow from '../../ui/AskRow.vue';
import SpectrumSwitch from '../../ui/SpectrumSwitch.vue';
import NerdStats from './NerdStats.vue';
import LiveLanes from './LiveLanes.vue';
import { formatTime } from '../../ui/format';

const playback = usePlaybackStore();
const flow = useMomentFlowStore();
const intelligence = useIntelligenceStore();
const momentsStore = useMomentsStore();
const timelineStore = useTimelineStore();
const { sel, activeStem, t, playing } = storeToRefs(playback);
const { feel, love, note, ask } = storeToRefs(flow);
/**
 * ONE STRIP FIX - Explore opens without a selection too: then it is about the whole song
 * (nothing gets highlighted). With a selection it is about that passage, as before.
 */
// WHOLE SONG FIX - the song's length is the analysed audio's (timeline.durationSec) when known:
// the player's length can be wrong (a placeholder, or a misread VBR MP3), and the lanes then
// filled only part of the width. Example: player says 10:00, the analysis decoded 4:31 →
// Explore spans 0:00–4:31. Exception: the service analyses at most ANALYSIS_CAP_SEC, so a
// longer song keeps its real length and says the lanes stop there.
const ANALYSIS_CAP_SEC = 600;
const capped = computed(() => {
  const tl = timeline.value?.durationSec ?? 0;
  return tl >= ANALYSIS_CAP_SEC - 1 && playback.duration > tl + 5;
});
const range = computed(() => {
  if (sel.value) return sel.value;
  const tl = timeline.value?.durationSec ?? 0;
  const d = tl > 0 && !capped.value ? tl : playback.duration;
  return d > 0 ? { a: 0, b: d } : null;
});
/** The question after Save, for this passage (EXPLORE ASK FIX); More… opens Describe below. */
const askHere = computed(() => (ask.value && sel.value && Math.abs(ask.value.a - sel.value.a) < 0.5 && Math.abs(ask.value.b - sel.value.b) < 0.5 ? ask.value : null));
const describeOpen = ref(false);
function askMore(): void { flow.skipAsk(); describeOpen.value = true; }
const { timeline, spectrum, spectrumState, spectrumView, spectrumKind, viewBusy, serviceOff } = storeToRefs(timelineStore);

const zoom = ref<'live' | 'all'>('live');

// Exact analysis of a saved moment (PASSAGE FIX), still used for the key and the measurements.
const saved = computed(() => (sel.value ? momentsStore.savedMatch(sel.value) : undefined));
const exact = computed(() => (saved.value ? momentsStore.passages[saved.value.id] : undefined));
watch(saved, m => { if (m) momentsStore.analyzeExactly(m.id); }, { immediate: true });
const segs = computed(() => intelligence.currentAnalysis?.segments ?? []);
const summary = computed(() => (exact.value ? exactSummary(segs.value, exact.value)
  : range.value && segs.value.length ? passageSummary(segs.value, range.value) : null));

/** Caption line. Example: "D Minor · 79 BPM · bars 28–49 · part D, heard 3× in the song". */
const facts = computed(() => {
  const tl = timeline.value, r = range.value;
  if (!r) return '';
  const out: string[] = [];
  const key = summary.value?.key ?? tl?.key;
  if (key) out.push(key);
  const bpm = tl?.tempoBpm ?? summary.value?.tempoBpm;
  if (bpm) out.push(Math.round(bpm) + ' BPM');
  if (tl?.downbeats?.length) out.push(`bars ${barAt(tl.downbeats, r.a)}–${barAt(tl.downbeats, r.b)}`);
  const mid = (r.a + r.b) / 2, part = tl?.sections?.find(p => mid >= p.a && mid < p.b);
  if (part) out.push(`part ${part.label}, heard ${tl!.sections!.filter(p => p.label === part.label).length}× in the song`);
  return out.join(' · ');
});

const moments = computed(() => (timeline.value && range.value ? passageMoments(timeline.value, range.value) : []));
/** Placeholders for the moments a later tier will add. */
const waitingMoments = computed(() => {
  if (!range.value || timelineStore.full) return [];
  if (serviceOff.value) return ['Moments need the analysis service. Start it to see them.'];
  return timelineStore.quick ? ['Separating stems… drop-outs and the vocal range come next.'] : ['Finding beats and chords…'];
});
function jump(sec: number): void {
  playback.clickSeek(Math.max(range.value?.a ?? 0, sec - 2));
  if (!playing.value) playback.togglePlay();
}

const waitingText = computed(() => ({
  quick: serviceOff.value ? 'Needs the analysis service' : 'Finding beats and chords…',
  full: serviceOff.value ? 'Needs the analysis service' : 'Separating stems…',
  spectrum: spectrumState.value === 'error' ? 'Could not read the audio' : 'Reading audio…',
}));

// S / M: solo plays one stem, mute plays the song without it ('no_<stem>'). Pressing again goes back to the mix.
/** Lanes drag: the dragged range becomes the passage; loop and Explore stay on (resize path). */
function setLoop(a: number, b: number): void {
  if (!sel.value) { playback.beginSelection(); playback.updateSelection(a, b); playback.commitSelection(); return; }
  playback.resizeSelection(a, b); playback.endResize();
}
function solo(s: StemName): void { playback.switchStem(activeStem.value === s ? 'all' : s); }
function mute(s: StemName): void { playback.switchStem(activeStem.value === 'no_' + s ? 'all' : 'no_' + s); }

/** Rails: where the last second sits among every moment of the song (percentile), and the passage's middle 80%. */
const rails = computed(() => {
  const tl = timeline.value, sp = spectrum.value, r = range.value;
  if (!r) return [];
  const defs: { k: string; curve?: ArrayLike<number>; word: [string, string] }[] = [
    { k: 'Loudness', curve: tl?.mix ?? sp?.loud, word: ['quieter', 'louder'] },
    { k: 'Brightness', curve: tl?.bright ?? sp?.bright, word: ['darker', 'brighter'] },
    { k: 'Vocals', curve: tl?.stems?.vocals, word: ['softer vocals', 'stronger vocals'] },
    { k: 'Drums', curve: tl?.stems?.drums, word: ['lighter drums', 'heavier drums'] },
    { k: 'Bass', curve: tl?.stems?.bass, word: ['less bass', 'more bass'] },
  ];
  return defs.map(d => {
    if (!d.curve?.length) return { ...d, ready: false, sorted: [] as number[], b0: 0, b1: 0 };
    const sorted = Array.from(d.curve, Number).sort((x, y) => x - y);
    const inside = Array.from(d.curve, Number).slice(Math.floor(r.a * 10), Math.ceil(r.b * 10));
    return { ...d, ready: true, sorted, b0: rankIn(sorted, quantile(inside, 0.1)), b1: rankIn(sorted, quantile(inside, 0.9)) };
  });
});
const railNow = computed(() => rails.value.map(r => {
  if (!r.ready || !r.curve) return { left: 0, title: 'Needs stems' };
  const i0 = Math.max(0, Math.round((t.value - 1) * 10)), i1 = Math.min(r.curve.length, Math.round(t.value * 10) + 1);
  let s = 0;
  for (let i = i0; i < i1; i++) s += Number(r.curve[i]);
  const q = rankIn(r.sorted, s / Math.max(1, i1 - i0));
  const word = q >= 0.5 ? r.word[1] : r.word[0];
  return { left: q * 100, title: `${word.charAt(0).toUpperCase() + word.slice(1)} than ${Math.round((q >= 0.5 ? q : 1 - q) * 100)}% of the song` };
}));

/** Folded detail sections (DETAIL SECTIONS): Voice, Groove, Harmony, each with a one-line teaser. */
const details = computed(() => {
  const r = range.value, tl = timeline.value;
  if (!r) return [];
  const voice = voiceDetails(tl, r), groove = grooveDetails(tl, segs.value, r), harmony = harmonyDetails(tl, segs.value, r);
  return [
    { k: 'voice', title: 'Voice', rows: voice, teaser: teaser(voice, ['Range', 'Longest note']), wait: tl?.melody ? '' : 'Arrives with the stems (vocal melody).' },
    { k: 'groove', title: 'Groove', rows: groove, teaser: teaser(groove, ['Tempo', 'Steadiness', 'Beat']), wait: tl?.beats ? '' : 'Arrives with the beats.' },
    { k: 'harmony', title: 'Harmony', rows: harmony, teaser: teaser(harmony, ['Chords', 'Tension']), wait: tl?.chords ? '' : 'Arrives with the chords.' },
  ];
});
const library = useLibraryStore();
/** Passages that sound most like this one (CLAP + DSP embeddings), in this song or others. */
const similar = computed(() => (range.value && playback.trackId ? similarPassages(intelligence.analyses, playback.trackId, range.value) : []));
function playSimilar(trackId: string, a: number, b: number): void { playback.openRange(a, b, trackId, true); }

/** Measurements, with units, what they mean, and where they come from (plain words, no badges). */
const measurements = computed(() => {
  const tl = timeline.value, r = range.value, rows: [string, string, string, string][] = [];
  if (!r) return rows;
  const m = Object.fromEntries((summary.value?.measures ?? []).map(x => [x.key, x.value]));
  if (summary.value?.key) rows.push(['Key', summary.value.key, 'Most common key across the passage', 'Window analysis']);
  if (tl?.tempoBpm) rows.push(['Tempo', Math.round(tl.tempoBpm) + ' BPM', 'Median gap between beats', 'Beat This']);
  if (tl?.beats) rows.push(['Beats', String(tl.beats.filter(b => b >= r.a && b < r.b).length), 'Beats inside the passage', 'Beat This']);
  if (tl?.chords) rows.push(['Chord changes', String(tl.chords.filter(c => c.b > r.a && c.a < r.b).length), 'One chord per beat, smoothed', tl.chordSource === 'bass+other' ? 'Bass + other stems' : 'Mix']);
  if (m.energy != null) rows.push(['RMS energy', m.energy.toFixed(3), 'Average signal loudness', 'Window analysis']);
  if (m.brightness_hz != null) rows.push(['Spectral centroid', Math.round(m.brightness_hz) + ' Hz', 'Higher sounds brighter', 'Window analysis']);
  if (m.onset_activity != null) rows.push(['Onset rate', m.onset_activity.toFixed(2), 'How often new notes or hits start', 'Window analysis']);
  if (m.spectral_flux != null) rows.push(['Spectral flux', m.spectral_flux.toFixed(2), 'How fast the sound changes', 'Window analysis']);
  if (tl?.stems) rows.push(['Stems', '4', 'Vocals, drums, bass, other', tl.stemSource || 'Demucs']);
  if (spectrum.value) rows.push(['Spectrum', Math.round(spectrum.value.fps) + ' frames/s', spectrum.value.bands + ' mel bands, 30 Hz–11 kHz', 'This browser']);
  return rows;
});
</script>

<template>
  <section v-if="range" class="panel" aria-label="Explore this passage">
    <header class="head">
      <div>
        <h2 class="heading">{{ sel ? 'Explore this passage' : 'Explore this song' }}</h2>
        <div class="caption sub">{{ formatTime(range.a) }} – {{ formatTime(range.b) }}<template v-if="facts"> · {{ facts }}</template></div>
        <div v-if="!sel && capped" class="caption sub">Analysis covers the first {{ ANALYSIS_CAP_SEC / 60 }} minutes of this song.</div>
      </div>
      <div class="tools">
        <SpectrumSwitch :kind="spectrumKind" :busy="viewBusy" @select="k => timelineStore.setSpectrumKind(k)" />
        <div class="seg" role="group" aria-label="Lane zoom">
          <button type="button" :aria-pressed="zoom === 'live'" @click="zoom = 'live'">Follow playhead</button>
          <button type="button" :aria-pressed="zoom === 'all'" @click="zoom = 'all'">Whole passage</button>
        </div>
      </div>
    </header>

    <AskRow v-if="askHere" :question="askHere.q" :chips="askHere.chips" @answer="flow.answer" @more="askMore" @skip="flow.skipAsk()" />

    <div class="moments">
      <button v-for="m in moments" :key="m.at + m.text" type="button" class="mo" @click="jump(m.at)">
        <span class="mt">{{ formatTime(m.at) }}</span><span>{{ m.text }}</span>
      </button>
      <div v-for="w in waitingMoments" :key="w" class="mo wait"><span class="mt">…</span><span>{{ w }}</span></div>
    </div>

    <LiveLanes
      :timeline="timeline"
      :spectrum="spectrum"
      :bitrate="timelineStore.bitrate"
      :view="spectrumView"
      :range="range"
      :t="t"
      :zoom="zoom"
      :active-stem="activeStem"
      :waiting-text="waitingText"
      @seek="s => playback.clickSeek(s)"
      @loop="setLoop"
      @solo="solo"
      @mute="mute"
    />
    <div class="hint caption">S plays one stem alone, M plays the song without it. Click a lane to jump there, drag across it to loop that part.</div>

    <div class="rails">
      <div class="rhead caption"><span>Right now, compared with the whole song</span><span>dot = last second · band = this passage</span></div>
      <template v-for="(r, i) in rails" :key="r.k">
        <span class="rk caption">{{ r.k }}</span>
        <div class="track" :class="{ off: !r.ready }" :title="railNow[i]?.title">
          <span class="rail"></span>
          <span v-if="r.ready" class="band" :style="{ left: r.b0 * 100 + '%', width: (r.b1 - r.b0) * 100 + '%' }"></span>
          <span v-if="r.ready" class="dot" :style="{ left: railNow[i]?.left + '%' }"></span>
        </div>
      </template>
    </div>

    <details v-for="d in details" :key="d.k" class="fold">
      <summary>{{ d.title }}<span v-if="d.teaser" class="teaser"> · {{ d.teaser }}</span></summary>
      <p v-if="d.wait && !d.rows.length" class="caption sub">{{ d.wait }}</p>
      <dl class="drows">
        <template v-for="row in d.rows" :key="row.k"><dt class="caption" :title="row.hint">{{ row.k }}</dt><dd :title="row.hint">{{ row.v }}</dd></template>
      </dl>
    </details>
    <details class="fold">
      <summary>Similar passages<span v-if="similar.length" class="teaser"> · {{ similar.length }} found</span></summary>
      <p v-if="!similar.length" class="caption sub">Needs the similarity analysis (Song anatomy → Run similarity analysis) on this and other songs.</p>
      <div class="sims">
        <button v-for="h in similar" :key="h.trackId + h.a" type="button" class="sim" @click="playSimilar(h.trackId, h.a, h.b)">
          <span class="st">{{ h.trackId === playback.trackId ? 'Elsewhere in this song' : library.track(h.trackId)?.title || h.trackId }}</span>
          <span class="caption sub">{{ formatTime(h.a) }} – {{ formatTime(h.b) }}</span>
          <span class="caption pct">{{ Math.round(h.sim * 100) }}% alike</span>
        </button>
      </div>
    </details>
    <details class="fold">
      <summary>Measurements</summary>
      <div class="tbl">
        <table>
          <tr><th>Measure</th><th>Value</th><th>Meaning</th><th>Source</th></tr>
          <tr v-for="row in measurements" :key="row[0]"><td>{{ row[0] }}</td><td class="v">{{ row[1] }}</td><td class="d">{{ row[2] }}</td><td class="d">{{ row[3] }}</td></tr>
        </table>
      </div>
    </details>
    <details class="fold" :open="describeOpen" @toggle="describeOpen = ($event.target as HTMLDetailsElement).open">
      <summary>Describe this moment</summary>
      <!-- ONE SAVE PATH: the same Feels / Love / Note strip and the same save as after ♡ Save. -->
      <DescribeStrip
        flat
        :feelings="FEELINGS"
        :qualities="QUALITIES"
        :feel="feel"
        :love="love"
        :note="note"
        @toggle-feel="flow.toggleFeel"
        @toggle-love="flow.toggleLove"
        @update:note="v => (note = v)"
        @cancel="flow.closeExplore()"
        @done="flow.finishDescribe()"
      />
    </details>
    <!-- Stats for nerds: codec, encoder, bitrate, device, analysis (closed by default). -->
    <NerdStats />
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--line-strong);
  background: var(--bg-panel);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
.head h2 { margin: 0; color: var(--ink); }
.sub { color: var(--ink-mute); font-variant-numeric: tabular-nums; }
.tools { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.seg { display: flex; gap: 4px; }
.seg button {
  height: 26px; padding: 0 10px; font-size: 12px; border-radius: var(--radius-pill);
  border: 1px solid var(--line-strong); background: none; color: var(--ink-sub); cursor: pointer; font-family: var(--font-sans);
}
.seg button[aria-pressed='true'] { background: var(--chip-on); border-color: var(--chip-on-line); color: var(--ink); }
.seg button:focus-visible, .mo:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.moments { display: flex; flex-direction: column; border-top: 1px solid var(--line); }
.mo {
  display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 10px; text-align: left;
  border: none; border-bottom: 1px solid var(--line); background: none; padding: 7px 2px;
  font: 13px/1.4 var(--font-sans); color: var(--ink-sub); cursor: pointer;
}
.mo:hover { background: var(--bg-raise); }
.mt { color: var(--accent); font-variant-numeric: tabular-nums; }
.mo.wait { cursor: default; color: var(--ink-mute); }
.mo.wait:hover { background: none; }
.mo.wait .mt { color: var(--ink-mute); }
.hint { color: var(--ink-mute); margin-top: -6px; }

.rails { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 4px 0; align-items: center; }
.rhead { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; color: var(--ink-mute); margin-bottom: 2px; }
.rk { color: var(--ink-mute); }
.track { position: relative; height: 14px; }
.track.off { opacity: .2; }
.rail { position: absolute; left: 0; right: 0; top: 6px; height: 2px; background: var(--line-strong); border-radius: 1px; }
.band { position: absolute; top: 3px; height: 8px; border-radius: 4px; background: var(--accent-fill); border: 1px solid var(--accent-line); }
.dot { position: absolute; top: 2px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; background: var(--ink); transition: left .12s linear; }

.fold { border-top: 1px solid var(--line); padding-top: 10px; }
.fold summary { cursor: pointer; color: var(--ink-sub); font-size: 13px; }
.fold[open] summary { margin-bottom: 8px; }
.teaser { color: var(--ink-mute); }
.drows { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 6px var(--space-3); margin: 0; }
.drows dt { color: var(--ink-mute); cursor: help; }
.drows dd { margin: 0; color: var(--ink); font-size: 13px; }
.sims { display: flex; flex-direction: column; }
.sim { display: grid; grid-template-columns: minmax(0, 1fr) 110px 80px; gap: 10px; align-items: baseline; text-align: left; border: none; border-bottom: 1px solid var(--line); background: none; padding: 7px 2px; cursor: pointer; font-family: var(--font-sans); color: var(--ink); }
.sim:hover { background: var(--bg-raise); }
.st { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pct { color: var(--accent); text-align: right; font-variant-numeric: tabular-nums; }
.tbl { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--ink-mute); font-weight: 500; }
td { color: var(--ink); }
td.v { font-variant-numeric: tabular-nums; white-space: nowrap; }
td.d { color: var(--ink-sub); }
@media (max-width: 600px) {
  .rails { grid-template-columns: 72px minmax(0, 1fr); }
  .mo { grid-template-columns: 64px minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) { .dot { transition: none; } }
</style>
