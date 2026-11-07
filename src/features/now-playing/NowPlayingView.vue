<script setup lang="ts">
/**
 * Now playing (design-system layout): cover + title → waveform → selection toolbar →
 * ask row / describe strip / explore / nudge slot → caption line.
 * The playback bar is app-wide (App.vue), so it looks the same on every screen.
 * Behaviour is ported from index.html's player screen; state lives in the stores.
 */
import { computed } from 'vue';
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
import Waveform from '../../ui/Waveform.vue';
import SelectionToolbar from '../../ui/SelectionToolbar.vue';
import AskRow from '../../ui/AskRow.vue';
import DescribeStrip from '../../ui/DescribeStrip.vue';
import Button from '../../ui/Button.vue';
import ExplorePanel from './ExplorePanel.vue';
import EffectsDrawer from './EffectsDrawer.vue';
import { similarPassages } from '../../core/passageDetails';
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

const { sel, loop, loops, t, duration, playing, currentTrack } = storeToRefs(playback);
const { ask, describe, feel, love, note, nudge, explore } = storeToRefs(flow);


const analyzingStep = computed(() => (currentTrack.value ? library.analyzing[currentTrack.value.id] : undefined));
const analysis = computed(() => intelligence.currentAnalysis);

/** Which panel the slot under the toolbar shows (one at a time, index.html's priority). */
const slot = computed(() => explore.value ? 'explore' : describe.value ? 'describe'
  : ask.value ? 'ask' : (nudge.value && sel.value) ? 'nudge' : null);

/** A saved moment overlapping the selection (offers Remove). */
const matchedSaved = computed(() => sel.value && moments.savedForCurrent.find(r => overlaps(r, sel.value!)));
/** A saved moment with this exact range (within 0.5 s): the loop bar shows "Saved". */
const savedHere = computed(() => sel.value && moments.savedForCurrent.find(r => Math.abs(r.a - sel.value!.a) < 0.5 && Math.abs(r.b - sel.value!.b) < 0.5));

/** Strip, passage selected: its part and loop state. Example: "part B, heard 3× · looping". */
const passageBits = computed(() => {
  const r = sel.value, tl = timelineStore.timeline;
  if (!r) return '';
  const out: string[] = [];
  const mid = (r.a + r.b) / 2, part = tl?.sections?.find(p => mid >= p.a && mid < p.b);
  if (part) out.push(`part ${part.label}, heard ${tl!.sections!.filter(p => p.label === part.label).length}×`);
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
</script>

<template>
  <div class="pcol">
    <header class="track">
      <Cover :size="96" />
      <div class="meta">
        <h1 class="title track-title">{{ currentTrack?.title || 'No track' }}</h1>
        <div class="artist body">{{ currentTrack?.artist || 'Import audio in Library' }}</div>
        <!-- One status line for the song's analysis tiers (stores/timeline.ts), instead of a pill
             that only knew about the window analysis. Example: "◐ Separating stems… · beats and chords ready". -->
        <div v-if="currentTrack" class="status caption" role="status">
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
        :effects="playback.effectsOpen"
        :effects-on="playback.effectsOn"
        @play="playback.playSelection()"
        @loop="onLoopButton"
        @explore="flow.toggleExplore()"
        @save="sel ? flow.saveSelection() : flow.quickSave()"
        @effects="playback.effectsOpen = !playback.effectsOpen"
        @clear="playback.clearSelection()"
      >
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

  </div>
</template>

<style scoped>
/* Layout rule "Now playing": centred column. */
.pcol {
  max-width: var(--content-max);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: var(--space-6) var(--space-4) 0;
  box-sizing: border-box;
}
.track { display: flex; align-items: center; gap: var(--space-5); }
.meta { min-width: 0; }
.title { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
.artist { color: var(--ink-sub); margin-top: var(--space-1); }
.status { margin-top: var(--space-3); display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; color: var(--ink-sub); }
.status .sub { color: var(--ink-mute); }
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
@media (prefers-reduced-motion: reduce) { .slot { transition: none; } }
@media (max-width: 820px) {
  .pcol { padding-top: var(--space-4); }
}
@media (max-width: 600px) {
  .track { gap: var(--space-4); }
  .stage { margin-top: var(--space-5); }
}
</style>
