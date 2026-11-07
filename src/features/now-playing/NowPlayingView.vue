<script setup lang="ts">
/**
 * Now playing (design-system layout): artwork + title → waveform → selection toolbar →
 * ask row / describe strip / explore / nudge slot → your moments in this song and what plays
 * next. With nothing loaded it shows a start card (import, add a link, your songs).
 * The playback bar is app-wide (App.vue), so it looks the same on every screen.
 * Behaviour is ported from index.html's player screen; state lives in the stores.
 */
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { usePlaybackStore } from '../../stores/playback';
import { useMomentFlowStore } from '../../stores/momentFlow';
import { useMomentsStore } from '../../stores/moments';
import { useIntelligenceStore } from '../../stores/intelligence';
import { useLibraryStore } from '../../stores/library';
import { useListeningStore } from '../../stores/listening';
import { useWaveform } from '../../composables/useWaveform';
import { ASK_DEFAULT_CHIPS, FEELINGS, QUALITIES } from '../../core/moments';
import { overlaps } from '../../core/playback';
import Cover from '../../ui/Cover.vue';
import Artwork from '../../ui/Artwork.vue';
import Icon from '../../ui/Icon.vue';
import { useArtwork } from '../../composables/useArtwork';
import type { PlayableTrack } from '../../core/library';
import type { Moment } from '../../data/types';
import Waveform from '../../ui/Waveform.vue';
import SelectionToolbar from '../../ui/SelectionToolbar.vue';
import AskRow from '../../ui/AskRow.vue';
import DescribeStrip from '../../ui/DescribeStrip.vue';
import Button from '../../ui/Button.vue';
import ExplorePanel from './ExplorePanel.vue';
import EffectsDrawer from './EffectsDrawer.vue';
import NerdsPanel from './NerdsPanel.vue';
import { similarPassages } from '../../core/passageDetails';
import { barAt, beatInBar, blockIndexAt } from '../../core/timeline';
import SongStrip from './SongStrip.vue';
import { useTimelineStore } from '../../stores/timeline';
import { passageMoments } from '../../core/timeline';
import { formatTime } from '../../ui/format';

const playback = usePlaybackStore();
const flow = useMomentFlowStore();
const moments = useMomentsStore();
const intelligence = useIntelligenceStore();
const library = useLibraryStore();
const listening = useListeningStore();
const router = useRouter();
const wf = useWaveform();
const timelineStore = useTimelineStore();
const { artworkFor, washFor } = useArtwork();

const { sel, loop, loops, t, duration, playing, currentTrack } = storeToRefs(playback);
const { ask, describe, feel, love, note, nudge, explore } = storeToRefs(flow);


const analyzingStep = computed(() => (currentTrack.value ? library.analyzing[currentTrack.value.id] : undefined));
const analysis = computed(() => intelligence.currentAnalysis);

/** Which panel the slot under the toolbar shows (one at a time, index.html's priority). */
/** The one open view under the strip (ONE VIEW FIX); Save shows its question, strip or nudge. */
const slot = computed(() => {
  const v = flow.view;
  if (v === 'explore') return 'explore';
  if (v === 'nerds') return 'nerds';
  if (v !== 'save') return null;
  return describe.value ? 'describe' : ask.value ? 'ask' : (nudge.value && sel.value) ? 'nudge' : null;
});

/** A saved moment overlapping the selection (offers Remove). */
const matchedSaved = computed(() => sel.value && moments.savedForCurrent.find(r => overlaps(r, sel.value!)));
/** A saved moment with this exact range (within 0.5 s): the loop bar shows "Saved". */
const savedHere = computed(() => sel.value && moments.savedForCurrent.find(r => Math.abs(r.a - sel.value!.a) < 0.5 && Math.abs(r.b - sel.value!.b) < 0.5));

/**
 * ONE STRIP FIX - the live line (chord, next chord, bar · beat, part) was its own row above the
 * strip; it now leads the strip. Example: "D#m → G# · bar 21.1 · part A".
 */
const liveNow = computed(() => {
  const tl = timelineStore.timeline, at = t.value;
  if (!tl?.chords?.length || !tl.beats?.length) return null;
  const i = blockIndexAt(tl.chords, at), c = tl.chords[i], next = tl.chords[i + 1];
  const part = tl.sections?.[blockIndexAt(tl.sections, at)];
  return { chord: c?.c ?? '—', next: next?.c, bar: barAt(tl.downbeats ?? [], at), beat: beatInBar(tl.beats, tl.downbeats ?? [], at), part: part?.label };
});

/** Strip, passage selected. Example: "its part comes back 3× · looping". */
const passageBits = computed(() => {
  const r = sel.value, tl = timelineStore.timeline;
  if (!r) return '';
  const out: string[] = [];
  // The part itself is in the live lead-in; here only how often it comes back.
  const mid = (r.a + r.b) / 2, part = tl?.sections?.find(p => mid >= p.a && mid < p.b);
  const times = part ? tl!.sections!.filter(p => p.label === part.label).length : 0;
  if (times > 1) out.push(`its part comes back ${times}×`);
  if (loop.value) out.push('looping');
  return out.join(' · ');
});
/** Strip, passage selected: the closest passage in another song (tap to jump there). */
const soundsLike = computed(() => {
  const r = sel.value, id = playback.trackId;
  if (!r || !id) return null;
  const s = similarPassages(intelligence.analyses, id, r, 3).find(x => x.trackId !== id && library.track(x.trackId));
  return s ? { ...s, title: library.track(s.trackId)!.title } : null;
});
/** Strip, nothing selected: the song and you. Example: "4 parts · 2 ♡ saved · you come back to 1:10". */
const songBits = computed(() => {
  const tl = timelineStore.timeline, out: string[] = [];
  if (tl?.sections?.length) out.push(new Set(tl.sections.map(p => p.label)).size + ' parts');
  const n = moments.savedForCurrent.length;
  if (n) out.push(n + ' ♡ saved');
  const back = listening.learning ? [...intelligence.interest].filter(r => r.n >= 2).sort((x, y) => y.n - x.n)[0] : undefined;
  if (back) out.push('you come back to ' + formatTime(back.a));
  if (!out.length) out.push('drag across the waveform to pick a passage');
  return out.join(' · ');
});

/** "Add why" shows while the just-saved passage is still selected (QUIET FIX in momentFlow). */
const pendingAskHere = computed(() => {
  const p = flow.pendingAsk, s = sel.value;
  return !!p && !!s && Math.abs(p.a - s.a) < 0.5 && Math.abs(p.b - s.b) < 0.5;
});

/** Moments of the selected passage, as dots under the waveform. */
const stripMoments = computed(() => (timelineStore.timeline && sel.value ? passageMoments(timelineStore.timeline, sel.value) : []));

/** Strip under the waveform: same selection gestures as dragging on the waveform. */
function onStripRange(a: number, b: number, phase: 'start' | 'move' | 'end'): void {
  if (phase === 'start') playback.beginSelection();
  playback.updateSelection(a, b);
  if (phase === 'end') playback.commitSelection();
}

function onLoopButton(): void { playback.toggleLoop(); }

/** Saved moments of this song, in song order. Example: 0:42–1:05 Chills · 2:10–2:31 Melody. */
const songMoments = computed(() => moments.moments.filter(m => m.trackId === currentTrack.value?.id).sort((a, b) => a.startSec - b.startSec));
const isSelected = (m: Moment) => !!sel.value && Math.abs(sel.value.a - m.startSec) < 0.5 && Math.abs(sel.value.b - m.endSec) < 0.5;
const momentWhat = (m: Moment) => [...(m.feelings || []), ...(m.qualities || [])].slice(0, 3).join(' · ') || m.note || 'Saved moment';

/**
 * What plays next. "Play all" in My Moments queues passages: those really play next, so they
 * are listed as "Up next". Otherwise the next songs in Library order are offered; they only
 * start when you pick one, so the heading says "More in your library", not "Up next".
 */
const queued = computed(() => playback.queue.slice(0, 5).flatMap(q => {
  const track = library.track(q.trackId);
  return track ? [{ ...q, track }] : [];
}));
const moreSongs = computed(() => {
  const all = library.tracks, i = all.findIndex(x => x.id === currentTrack.value?.id);
  return Array.from({ length: Math.min(5, all.length - (i >= 0 ? 1 : 0)) }, (_, k) => all[(i + 1 + k) % all.length]!);
});
const playSong = (s: PlayableTrack) => playback.changeTrack(s, true);

// Start card: the same import as Library's "Import audio" button.
const fileInput = ref<HTMLInputElement | null>(null);
async function onFiles(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  await library.importFiles(Array.from(input.files || []));
  input.value = '';
}
</script>

<template>
  <div class="pcol">
    <!-- Start card: nothing loaded yet. One primary action (import), a link, and your songs. -->
    <section v-if="!currentTrack" class="start" aria-labelledby="start-title">
      <Cover :size="120" />
      <h1 id="start-title" class="title track-title">Nothing playing yet</h1>
      <p class="body sub-line">Import a song from your device, or add one from a link. Audio stays on your device.</p>
      <div class="start-actions">
        <Button variant="primary" @click="fileInput?.click()">Import audio</Button>
        <Button variant="outline" @click="router.push('/library')">Add from a link</Button>
      </div>
      <input ref="fileInput" type="file" class="file" accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac,.opus" multiple aria-label="Import audio files" @change="onFiles" />
      <template v-if="library.tracks.length">
        <h2 class="heading sh">Your songs</h2>
        <ul class="tiles">
          <li v-for="s in library.tracks.slice(0, 8)" :key="s.id">
            <button type="button" class="tile" @click="playSong(s)">
              <Artwork v-bind="artworkFor(s)" :size="132" radius="var(--radius-md)" />
              <span class="label tile-title">{{ s.title }}</span>
              <span class="caption tile-artist">{{ s.artist }}</span>
            </button>
          </li>
        </ul>
      </template>
    </section>

    <template v-else>
    <!-- Hero: the song's cover (its own picture, or one drawn from its sound) on a soft wash of its colour. -->
    <header class="track" :style="{ '--wash': washFor(currentTrack) }">
      <Artwork class="hero-art" v-bind="artworkFor(currentTrack)" :size="160" radius="var(--radius-md)" />
      <div class="meta">
        <div class="eyebrow caption">Now playing</div>
        <h1 class="title track-title">{{ currentTrack.title }}</h1>
        <div class="artist body">{{ currentTrack.artist }}</div>
        <!-- One status line for the song's analysis tiers (stores/timeline.ts), instead of a pill
             that only knew about the window analysis. Example: "◐ Separating stems… · beats and chords ready". -->
        <div class="status caption" role="status">
          <span>{{ timelineStore.statusText.busy ? '◐' : '●' }} {{ timelineStore.statusText.text }}</span>
          <span v-if="analyzingStep" class="sub">· window analysis: {{ analyzingStep }}</span>
          <button v-else-if="analysis" type="button" class="link" @click="router.push({ path: '/admin', query: { track: currentTrack.id } })">· Anatomy →</button>
          <button v-else type="button" class="link" @click="library.analyze(currentTrack.id)">· Run window analysis</button>
        </div>
      </div>
    </header>

    <div class="stage">
      <Waveform
        v-bind="wf.props.value"
        @seek="wf.seek"
        @select-start="wf.selectStart"
        @select="wf.select"
        @select-end="wf.selectEnd"
        @resize="wf.resize"
        @resize-end="wf.resizeEnd"
        @step="wf.step"
        @select-around="wf.selectAround"
        @peaks="wf.peaks"
      />
      <SongStrip :timeline="timelineStore.timeline" :duration="duration" :t="t" :moments="stripMoments" @range="onStripRange" @seek="playback.clickSeek" />
      <!-- ONE STRIP FIX: always here; whole song when nothing is selected (ui/SelectionToolbar.vue). -->
      <SelectionToolbar
        :range="sel"
        :loop="loop"
        :playing="playing"
        :exploring="explore"
        :saved="!!savedHere"
        :effects="flow.effects"
        :nerds="flow.nerds"
        :saving="flow.view === 'save'"
        :effects-on="playback.effectsOn"
        :compare="playback.hasVersions"
        :original="playback.fx.listen === 'original'"
        @original="playback.toggleOriginal()"
        @play="playback.playSelection()"
        @loop="onLoopButton"
        @explore="flow.toggleExplore()"
        @save="flow.toggleSave()"
        @effects="flow.effects = !flow.effects"
        @nerds="flow.toggleNerds()"
        @clear="playback.clearSelection()"
      >
        <template v-if="liveNow" #live>
          <span class="chord">{{ liveNow.chord }}<template v-if="liveNow.next"> → {{ liveNow.next }}</template></span>
          <span>bar {{ liveNow.bar }}.{{ liveNow.beat }}</span>
          <span v-if="liveNow.part">part {{ liveNow.part }}</span>
        </template>
        <template #info>
          <template v-if="playback.radio">
            <span>· Moment radio · {{ playback.radioNow?.source === 'moment' ? 'one of your moments' : 'like your moments' }}</span>
            <button type="button" class="link" @click="playback.radioSkip()">Skip ›</button>
            <button type="button" class="link" @click="playback.stopRadio()">Stop</button>
          </template>
          <template v-else-if="pendingAskHere && !slot">
            <span>· Saved.</span>
            <button type="button" class="link" @click="flow.openAsk()">Add why ›</button>
          </template>
          <template v-else-if="sel">
            <span v-if="passageBits">· {{ passageBits }}</span>
            <button v-if="soundsLike" type="button" class="link" @click="playback.openRange(soundsLike.a, soundsLike.b, soundsLike.trackId, true)">· sounds like {{ soundsLike.title }} {{ formatTime(soundsLike.a) }} ›</button>
            <button v-if="matchedSaved" type="button" class="link" @click="flow.removeMoment(matchedSaved.id)">· remove from ♡</button>
          </template>
          <span v-else>· {{ songBits }}</span>
        </template>
        <template #drawer><EffectsDrawer /></template>
      </SelectionToolbar>

      <!-- AskRow rule: the slot opens with a 280 ms grid-rows transition; never a modal. -->
      <div class="slot" :class="{ open: !!slot }">
        <div class="slot-in">
          <ExplorePanel v-if="slot === 'explore'" />
          <NerdsPanel v-else-if="slot === 'nerds'" />
          <DescribeStrip
            v-else-if="slot === 'describe'"
            :feelings="FEELINGS"
            :qualities="QUALITIES"
            :feel="feel"
            :love="love"
            :note="note"
            @toggle-feel="flow.toggleFeel"
            @toggle-love="flow.toggleLove"
            @update:note="v => (note = v)"
            @cancel="flow.closeDescribe()"
            @done="flow.finishDescribe()"
          />
          <AskRow
            v-else-if="slot === 'ask' && ask"
            :question="ask.q"
            :chips="ask.chips?.length ? ask.chips : ASK_DEFAULT_CHIPS"
            @answer="flow.answer"
            @more="flow.more()"
            @skip="flow.skipAsk()"
          />
          <AskRow
            v-else-if="slot === 'nudge' && sel"
            :question="'Enjoying this moment? You have played ' + formatTime(sel.a) + ' – ' + formatTime(sel.b) + ' ' + (loops + 1) + ' times.'"
          >
            <template #actions>
              <Button size="sm" @click="flow.dismissNudge()">Not now</Button>
              <Button size="sm" variant="primary" @click="flow.saveSelection()">Save moment</Button>
            </template>
          </AskRow>
        </div>
      </div>

    </div>

    <div class="below">
      <section class="col" aria-labelledby="mine-h">
        <h2 id="mine-h" class="heading sh">Your moments in this song</h2>
        <p v-if="!songMoments.length" class="label empty-line">None yet. Drag across the waveform, then Save, and the passage is listed here.</p>
        <ol v-else class="rows">
          <li v-for="m in songMoments" :key="m.id">
            <button type="button" class="mrow" :class="{ on: isSelected(m) }" @click="moments.play(m, false)">
              <span class="cp" aria-hidden="true"><Icon :name="isSelected(m) && playing ? 'pause' : 'play'" :size="10" /></span>
              <span class="range label">{{ formatTime(m.startSec) }} – {{ formatTime(m.endSec) }}</span>
              <span class="what label">{{ momentWhat(m) }}</span>
            </button>
          </li>
        </ol>
      </section>

      <section class="col" aria-labelledby="next-h">
        <template v-if="queued.length">
          <h2 id="next-h" class="heading sh">Up next · from My Moments</h2>
          <ol class="rows">
            <li v-for="q in queued" :key="q.trackId + ':' + q.a">
              <div class="srow">
                <Artwork v-bind="artworkFor(q.track)" :size="44" radius="6px" />
                <span class="s-text">
                  <span class="label s-title">{{ q.track.title }}</span>
                  <span class="caption s-sub">{{ formatTime(q.a) }} – {{ formatTime(q.b) }}</span>
                </span>
              </div>
            </li>
          </ol>
        </template>
        <template v-else>
          <h2 id="next-h" class="heading sh">More in your library</h2>
          <p v-if="!moreSongs.length" class="label empty-line">Import more songs in Library and they show up here.</p>
          <ol v-else class="rows">
            <li v-for="s in moreSongs" :key="s.id">
              <button type="button" class="srow" :aria-label="'Play ' + s.title" @click="playSong(s)">
                <Artwork v-bind="artworkFor(s)" :size="44" radius="6px" />
                <span class="s-text">
                  <span class="label s-title">{{ s.title }}</span>
                  <span class="caption s-sub">{{ s.artist }}</span>
                </span>
                <span class="caption s-dur">{{ formatTime(s.durationSec) }}</span>
              </button>
            </li>
          </ol>
        </template>
      </section>
    </div>
    </template>
  </div>
</template>

<style scoped>
/* Layout rule "Now playing": centred column. */
.pcol {
  position: relative;
  isolation: isolate;
  max-width: var(--content-max);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: var(--space-6) var(--space-4) 0;
  box-sizing: border-box;
}
.track { position: relative; display: flex; align-items: flex-end; gap: var(--space-6); }
/* Wash: the cover's colour, faded out before the waveform, so text stays on the page colour. */
.track::before {
  content: ''; position: absolute; z-index: -1; pointer-events: none;
  inset: calc(-1 * var(--space-8)) -50vw calc(-1 * var(--space-7));
  background: radial-gradient(ellipse 60% 100% at 30% 0%, color-mix(in srgb, var(--wash) 34%, transparent), transparent 75%);
}
.hero-art { box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45); }
.meta { min-width: 0; padding-bottom: var(--space-1); }
.eyebrow { color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: var(--space-2); }
.title { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
.artist { color: var(--ink-sub); margin-top: var(--space-1); }
.status { margin-top: var(--space-3); display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; color: var(--ink-sub); }
.status .sub { color: var(--ink-mute); }
.chord { color: var(--ink); font-weight: 500; }
.link { background: none; border: none; padding: 0; color: var(--ink-mute); font: inherit; cursor: pointer; }
.link:hover { color: var(--ink); }
.stage { margin-top: var(--space-7); }
.slot {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 280ms ease;
}
.slot.open { grid-template-rows: 1fr; }
.slot-in { min-height: 0; overflow: hidden; }
.slot.open .slot-in { padding-top: var(--space-2); }
.hint { display: inline-flex; align-items: center; gap: var(--space-1); }
/* Below the player: your moments in this song · what plays next. Open lists, no cards. */
.below { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-7); margin-top: var(--space-7); padding-bottom: var(--space-7); }
.col { min-width: 0; }
.sh { margin: 0 0 var(--space-3); color: var(--ink); }
.empty-line { color: var(--ink-mute); margin: 0; }
.rows { list-style: none; margin: 0; padding: 0; }
.rows li { border-bottom: 1px solid var(--line); }
.mrow, .srow {
  width: 100%; display: flex; align-items: center; gap: var(--space-3); padding: 10px 0;
  background: none; border: 0; color: var(--ink); font: inherit; text-align: left;
}
button.mrow, button.srow { cursor: pointer; }
button.mrow:hover .what, button.srow:hover .s-title { color: var(--ink); }
.cp {
  width: 28px; height: 28px; flex: none; border-radius: 50%; border: 1px solid var(--line-strong);
  display: inline-flex; align-items: center; justify-content: center; color: var(--ink-sub);
}
.mrow.on .cp { border-color: var(--accent); color: var(--accent); }
.range { color: var(--ink-sub); font-variant-numeric: tabular-nums; flex: none; min-width: 92px; }
.mrow.on .range { color: var(--accent); }
.what { color: var(--ink-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.s-title { color: var(--ink-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s-sub, .s-dur { color: var(--ink-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s-dur { flex: none; font-variant-numeric: tabular-nums; }

/* Start card (nothing loaded). */
.start { display: flex; flex-direction: column; align-items: flex-start; padding-top: var(--space-6); }
.start .title { margin-top: var(--space-5); }
.sub-line { color: var(--ink-sub); margin: var(--space-2) 0 0; max-width: 46ch; }
.start-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-5); }
.file { display: none; }
.start .sh { margin-top: var(--space-7); }
.tiles { list-style: none; margin: 0; padding: 0 0 var(--space-7); display: grid; grid-template-columns: repeat(auto-fill, 132px); gap: var(--space-5) var(--space-4); width: 100%; }
.tile { display: flex; flex-direction: column; gap: 2px; width: 132px; padding: 0; border: 0; background: none; color: inherit; text-align: left; cursor: pointer; }
.tile .art { margin-bottom: var(--space-2); transition: transform .15s ease; }
.tile:hover .art { transform: translateY(-2px); }
.tile-title { color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tile-artist { color: var(--ink-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (prefers-reduced-motion: reduce) { .slot, .tile .art { transition: none; } }
@media (max-width: 820px) {
  .pcol { padding-top: var(--space-4); }
  .below { grid-template-columns: 1fr; gap: var(--space-6); }
}
@media (max-width: 600px) {
  .track { gap: var(--space-4); align-items: center; }
  .hero-art { width: 96px !important; height: 96px !important; }
  .stage { margin-top: var(--space-5); }
}
</style>
