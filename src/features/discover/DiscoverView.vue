<script setup lang="ts">
/**
 * Discover (port of index.html's renderDiscover() and its 'dtab', 'preview', 'open-preview',
 * 'like', 'dislike' actions). Suggestions come from the personal ranker, trained only on the
 * moments you saved and the answers you gave here. Each answer is stored in Dexie `ratings`
 * and the list re-ranks straight away.
 */
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import type { PreferenceSuggestion } from '../../intelligence/personalize';
import { DISCOVER_TABS, anchorMoment, ratingOf, suggestionFamily, suggestionPills, whyLine } from '../../core/discover';
import { totalSeconds } from '../../core/moments';
import { useIntelligenceStore } from '../../stores/intelligence';
import { useLibraryStore } from '../../stores/library';
import { useMomentsStore } from '../../stores/moments';
import { usePlaybackStore } from '../../stores/playback';
import { useUiStore } from '../../stores/ui';
import Button from '../../ui/Button.vue';
import Icon from '../../ui/Icon.vue';
import MomentRow from '../../ui/MomentRow.vue';
import Tabs from '../../ui/Tabs.vue';
import { formatTime } from '../../ui/format';
import AttentionList from './AttentionList.vue';

const intelligence = useIntelligenceStore();
const library = useLibraryStore();
const playback = usePlaybackStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { moments } = storeToRefs(useMomentsStore());
const { suggestions, analyses, ratings } = storeToRefs(intelligence);

/** "Find more like these" on My Music DNA opens Discover on that trait's tab (?t=1..4). */
const tab = ref(Number(route.query.t) || 0);
const inTab = (s: PreferenceSuggestion) => tab.value === 0 || suggestionFamily(s, moments.value) === tab.value - 1;
const same = (a: PreferenceSuggestion, b: PreferenceSuggestion) => a.trackId === b.trackId && a.startSec === b.startSec;

/**
 * ANSWER STAYS FIX - an answered passage becomes a training example, so the ranker drops it
 * from the suggestions and the row vanished the moment you pressed "I like it". Rows answered
 * on this visit now stay where they were, showing the pressed answer, until you leave the page.
 */
const answered = ref<{ s: PreferenceSuggestion; at: number }[]>([]);

/**
 * NEW SUGGESTIONS - the ranker is deterministic, so the list only changed when your data did.
 * "New suggestions" reloads analyses and ratings, then shows the next 12 ranked passages,
 * wrapping to the top after the last page. Example: 40 suggestions → 1–12, 13–24, 25–36, 37–40, 1–12.
 */
const PAGE = 12;
const page = ref(0);
const pageCount = computed(() => Math.max(1, Math.ceil(suggestions.value.filter(inTab).length / PAGE)));
async function newSuggestions() {
  await intelligence.refresh();
  answered.value = [];
  page.value = (page.value + 1) % pageCount.value;
  ui.notify(pageCount.value === 1 ? 'Updated. These are all the suggestions for now.'
    : page.value === 0 ? 'Back to your top suggestions.' : `Suggestions ${page.value * PAGE + 1}–${Math.min((page.value + 1) * PAGE, suggestions.value.filter(inTab).length)}.`);
}
// The list can shrink (answers, deleted songs): a page past the end falls back to the first.
watch(pageCount, n => { if (page.value >= n) page.value = 0; });
const rows = computed(() => {
  const list = suggestions.value.filter(inTab).slice(page.value * PAGE, (page.value + 1) * PAGE);
  for (const a of answered.value) if (inTab(a.s) && !list.some(x => same(x, a.s))) list.splice(Math.min(a.at, list.length), 0, a.s);
  return list;
});

/**
 * Honest empty state: says which input is missing instead of showing invented examples.
 * Example: two saved moments but nothing analysed → asks for an analysed song.
 */
const emptyText = computed(() => {
  if (suggestions.value.length) return 'No suggestions in this group yet.';
  if (!analyses.value.length) return 'Nothing to suggest yet. Suggestions need at least one analysed song: in Library choose Analyse locally (the local analysis service must be running).';
  if (!moments.value.length) return 'Nothing to suggest yet. Save a passage you love in the player first; suggestions are compared with your own moments.';
  return 'Nothing new to suggest. Analyse more songs, or save more moments, and suggestions will appear here.';
});

const title = (s: PreferenceSuggestion) => library.track(s.trackId)?.title || 'Unavailable';
const artist = (s: PreferenceSuggestion) => library.track(s.trackId)?.artist || '';
const why = (s: PreferenceSuggestion) => whyLine(s.matchingMoment && library.track(s.matchingMoment.trackId)?.title, s.score, s.matchingMoment?.startSec);
const answer = (s: PreferenceSuggestion) => ratingOf(s, ratings.value);
async function rate(s: PreferenceSuggestion, value: 'like' | 'dislike') {
  if (!answered.value.some(a => same(a.s, s))) answered.value.push({ s, at: rows.value.findIndex(x => same(x, s)) });
  await intelligence.rate(s, value);
}

/** Pills in My Moments' words (see suggestionPills). Example: ['Chills', 'Vocals', 'Harmony']. */
const pills = (s: PreferenceSuggestion) => suggestionPills(s.evidence, anchorMoment(s, moments.value));
const isPlaying = (s: PreferenceSuggestion) => playback.playing && playback.trackId === s.trackId && playback.t >= s.startSec - 0.5 && playback.t <= s.endSec + 0.5;

async function preview(s: PreferenceSuggestion) {
  playback.queue = [];
  await playback.openRange(s.startSec, s.endSec, s.trackId, true);
}
async function open(s: PreferenceSuggestion) {
  playback.queue = [];
  await playback.openRange(s.startSec, s.endSec, s.trackId, false);
  router.push('/');
}
/** Same as My Moments' Play all: the shown suggestions back to back, in list order. */
async function playAll() {
  await playback.playQueue(rows.value.map(s => ({ a: s.startSec, b: s.endSec, trackId: s.trackId })));
}
/** Empty state button: points at the missing input. Example: nothing analysed → Library. */
const emptyAction = computed(() => (!analyses.value.length ? { text: 'Open Library', to: '/library' } : { text: 'Open the player', to: '/' }));
function selectTab(i: number) {
  tab.value = i;
  page.value = 0;
  router.replace({ query: i ? { t: String(i) } : {} });
}
</script>

<template>
  <!-- Same page layout as My Moments: head with Play all, tabs, MomentRow list. -->
  <div class="page">
    <div class="head">
      <div>
        <h1 class="page-title">Discover</h1>
        <p class="lead body">Passages you might enjoy, found by comparing your songs with the moments you saved. Tell us what connects so suggestions can improve.</p>
      </div>
      <div v-if="suggestions.length" class="actions">
        <Button @click="newSuggestions">New suggestions</Button>
        <Button variant="outline" :disabled="!rows.length" @click="playAll">
          <Icon name="play" :size="14" />
          Play {{ rows.length }} {{ rows.length === 1 ? 'suggestion' : 'suggestions' }} · {{ formatTime(totalSeconds(rows)) }}
        </Button>
      </div>
    </div>

    <div v-if="!suggestions.length" class="empty">
      <p class="body">{{ emptyText }}</p>
      <Button variant="primary" @click="router.push(emptyAction.to)">{{ emptyAction.text }}</Button>
    </div>

    <template v-else>
      <Tabs class="tabs" :items="DISCOVER_TABS" :selected="tab" label="Preference type" @select="selectTab" />

      <ol class="list">
        <li v-if="!rows.length" class="none body">{{ emptyText }}</li>
        <!-- Voice rule: inferences are hedged; the line under the title says it is a resemblance. -->
        <MomentRow
          v-for="s in rows"
          :key="s.trackId + ':' + s.startSec"
          :song="title(s)"
          :artist="artist(s)"
          :start="s.startSec"
          :end="s.endSec"
          :what="why(s)"
          :tags="pills(s)"
          :playing="isPlaying(s)"
          :song-duration="library.track(s.trackId)?.durationSec"
          :removable="false"
          @play="preview(s)"
          @open="open(s)"
        >
          <Button size="sm" class="ans" :aria-pressed="answer(s) === 'dislike'" :class="{ on: answer(s) === 'dislike' }" @click="rate(s, 'dislike')">Not for me</Button>
          <Button size="sm" variant="outline" class="ans" :aria-pressed="answer(s) === 'like'" :class="{ on: answer(s) === 'like' }" @click="rate(s, 'like')">I like it</Button>
        </MomentRow>
      </ol>
    </template>

    <AttentionList class="att-slot" />
  </div>
</template>

<style scoped>
.page { width: 100%; max-width: var(--content-max); margin: 0 auto; padding: var(--space-6) var(--space-4); font-variant-numeric: tabular-nums; box-sizing: border-box;
  /* One screen tall: header and tabs stay put, only .list scrolls (see SCROLL FIX in App.vue). */
  height: 100%; display: flex; flex-direction: column; }
.head, .tabs, .empty, .att-slot { flex: none; }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-4); }
h1 { margin: 0; color: var(--ink); }
.lead { color: var(--ink-sub); margin: var(--space-2) 0 0; max-width: 70ch; }
.tabs { margin: var(--space-5) 0 var(--space-4); }
.list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line);
  /* Shrinks to fit and scrolls inside; the gutter is kept so rows do not shift when it appears.
     Example: 30 saved moments → the list scrolls, the Play all button stays on screen. */
  flex: 0 1 auto; min-height: 0; overflow-y: auto; scrollbar-gutter: stable;
  /* SCROLLBAR FIX - macOS draws its scrollbar on top of the content, so it covered the rows'
     right edge (remove ✕, answer buttons). The list now reaches 12px into the page's side
     padding, and that strip holds the scrollbar; rows stay aligned with the header. */
  margin-right: calc(-1 * var(--space-3)); padding-right: var(--space-3); }
.none { padding: var(--space-4) 0; color: var(--ink-sub); border-bottom: 1px solid var(--line); }
.empty { margin-top: var(--space-5); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: var(--space-6) 0; text-align: center; color: var(--ink-sub); }
.empty p { margin: 0 0 var(--space-4); }
/* A given answer stays visible as a pressed state (chip-on), not as accent. Scoped to .ans so it
   does not hit MomentRow's waveform bars, which also use .on. */
.ans.on { background: var(--chip-on); color: var(--ink); border: 1px solid var(--chip-on-line); }
</style>
