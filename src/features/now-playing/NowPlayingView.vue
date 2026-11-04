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
import { useKeyboardShortcuts } from '../../composables/useKeyboardShortcuts';
import { ASK_DEFAULT_CHIPS, FEELINGS, QUALITIES } from '../../core/moments';
import { overlaps } from '../../core/playback';
import Cover from '../../ui/Cover.vue';
import Waveform from '../../ui/Waveform.vue';
import SelectionToolbar from '../../ui/SelectionToolbar.vue';
import AskRow from '../../ui/AskRow.vue';
import DescribeStrip from '../../ui/DescribeStrip.vue';
import Button from '../../ui/Button.vue';
import ExplorePanel from './ExplorePanel.vue';
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

useKeyboardShortcuts({ ' ': () => { playback.togglePlay(); } });

const analyzingStep = computed(() => (currentTrack.value ? library.analyzing[currentTrack.value.id] : undefined));
const analysis = computed(() => intelligence.currentAnalysis);

/** Which panel the slot under the toolbar shows (one at a time, index.html's priority). */
const slot = computed(() => (explore.value && sel.value) ? 'explore' : describe.value ? 'describe'
  : ask.value ? 'ask' : (nudge.value && sel.value) ? 'nudge' : null);

/** A saved moment overlapping the selection (offers Remove). */
const matchedSaved = computed(() => sel.value && moments.savedForCurrent.find(r => overlaps(r, sel.value!)));
/** A saved moment with this exact range (within 0.5 s): the loop bar shows "Saved". */
const savedHere = computed(() => sel.value && moments.savedForCurrent.find(r => Math.abs(r.a - sel.value!.a) < 0.5 && Math.abs(r.b - sel.value!.b) < 0.5));

/** "You often come back to this part": an attention hint under the playhead (words, not marks). */
const activeHint = computed(() => listening.learning
  ? intelligence.interest.find(r => r.n >= 2 && t.value >= r.a && t.value <= r.b) : undefined);

/** Moments of the selected passage, as dots under the waveform. */
const stripMoments = computed(() => (timelineStore.timeline && sel.value ? passageMoments(timelineStore.timeline, sel.value) : []));

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
      />
      <SongStrip :timeline="timelineStore.timeline" :duration="duration" :t="t" :moments="stripMoments" @seek="s => playback.clickSeek(s)" />
      <SelectionToolbar
        v-if="sel"
        :range="sel"
        :duration="duration"
        :loop="loop"
        :playing="playing"
        :exploring="explore"
        :saved="!!savedHere"
        @play="playback.playSelection()"
        @loop="onLoopButton"
        @explore="flow.toggleExplore()"
        @save="flow.saveSelection()"
        @clear="playback.clearSelection()"
      />

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

      <div class="caption-line label">
        <span v-if="loop && sel" class="loopflag">Looping {{ formatTime(sel.a) }} – {{ formatTime(sel.b) }}</span>
        <span v-else-if="activeHint" class="hint">
          <span>You often come back to this part<template v-if="activeHint.reasons[0]"> · {{ activeHint.reasons[0] }}</template></span>
          <Button size="sm" @click="intelligence.confirmCandidate(activeHint.trackId, activeHint.a)">Save</Button>
          <Button size="sm" @click="intelligence.dismissCandidate(activeHint.trackId, activeHint.a)">Dismiss</Button>
        </span>
        <span v-else class="guide">Drag across the waveform to pick a passage. Playback never stops.</span>
        <span v-if="sel && matchedSaved" class="extras">
          <Button size="sm" @click="flow.removeMoment(matchedSaved.id)">Remove saved moment</Button>
        </span>
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
.caption-line {
  min-height: 30px;
  margin-top: var(--space-3);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  color: var(--ink-sub);
}
.guide { color: var(--ink-mute); }
.loopflag { color: var(--accent); font-variant-numeric: tabular-nums; }
.hint { display: inline-flex; align-items: center; gap: var(--space-1); }
.extras { margin-left: auto; display: inline-flex; gap: var(--space-1); }
@media (prefers-reduced-motion: reduce) { .slot { transition: none; } }
@media (max-width: 820px) {
  .pcol { padding-top: var(--space-4); }
}
@media (max-width: 600px) {
  .track { gap: var(--space-4); }
  .stage { margin-top: var(--space-5); }
}
</style>
