<script setup lang="ts">
/**
 * Discover (port of index.html's renderDiscover() and its 'dtab', 'preview', 'open-preview',
 * 'like', 'dislike' actions). Suggestions come from the personal ranker, trained only on the
 * moments you saved and the answers you gave here. Each answer is stored in Dexie `ratings`
 * and the list re-ranks straight away.
 */
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import type { PreferenceSuggestion } from '../../intelligence/personalize';
import { DISCOVER_TABS, ratingOf, suggestionFamily, whyLine } from '../../core/discover';
import { useIntelligenceStore } from '../../stores/intelligence';
import { useLibraryStore } from '../../stores/library';
import { useMomentsStore } from '../../stores/moments';
import { usePlaybackStore } from '../../stores/playback';
import Button from '../../ui/Button.vue';
import Icon from '../../ui/Icon.vue';
import Tabs from '../../ui/Tabs.vue';
import { formatTime } from '../../ui/format';
import AttentionList from './AttentionList.vue';

const intelligence = useIntelligenceStore();
const library = useLibraryStore();
const playback = usePlaybackStore();
const route = useRoute();
const router = useRouter();
const { moments } = storeToRefs(useMomentsStore());
const { suggestions, analyses, ratings } = storeToRefs(intelligence);

/** "Find more like these" on My Music DNA opens Discover on that trait's tab (?t=1..4). */
const tab = ref(Number(route.query.t) || 0);
const rows = computed(() => suggestions.value.filter(s => tab.value === 0 || suggestionFamily(s, moments.value) === tab.value - 1));

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
const why = (s: PreferenceSuggestion) => whyLine(s.matchingMoment && library.track(s.matchingMoment.trackId)?.title);
const answer = (s: PreferenceSuggestion) => ratingOf(s, ratings.value);
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
function selectTab(i: number) {
  tab.value = i;
  router.replace({ query: i ? { t: String(i) } : {} });
}
</script>

<template>
  <div class="page">
    <h1 class="page-title">Discover</h1>
    <p class="lead body">Passages you might enjoy, found by comparing your songs with the moments you saved. Tell us what connects so suggestions can improve.</p>

    <Tabs class="tabs" :items="DISCOVER_TABS" :selected="tab" label="Preference type" @select="selectTab" />

    <ol class="list">
      <li v-if="!rows.length" class="none body">{{ emptyText }}</li>
      <li v-for="s in rows" :key="s.trackId + ':' + s.startSec" class="row">
        <button type="button" class="cp" :aria-label="(isPlaying(s) ? 'Pause ' : 'Listen to ') + title(s) + ' ' + formatTime(s.startSec)" @click="preview(s)">
          <Icon :name="isPlaying(s) ? 'pause' : 'play'" :size="12" />
        </button>
        <div class="info" @click="open(s)">
          <div class="item s">
            {{ title(s) }} <span class="mute">— {{ artist(s) }}</span>
            <!-- Voice rule: inferences are hedged and labelled as such. -->
            <span class="tag caption">Suggested</span>
          </div>
          <div class="label w">{{ formatTime(s.startSec) }} – {{ formatTime(s.endSec) }} · {{ why(s) }}</div>
        </div>
        <div class="btns">
          <Button size="sm" :aria-pressed="answer(s) === 'dislike'" :class="{ on: answer(s) === 'dislike' }" @click="intelligence.rate(s, 'dislike')">Not for me</Button>
          <Button size="sm" variant="outline" :aria-pressed="answer(s) === 'like'" :class="{ on: answer(s) === 'like' }" @click="intelligence.rate(s, 'like')">I like it</Button>
        </div>
      </li>
    </ol>

    <AttentionList />
  </div>
</template>

<style scoped>
.page { max-width: var(--content-max); margin: 0 auto; padding: var(--space-6) var(--space-4); font-variant-numeric: tabular-nums; }
h1 { margin: 0; color: var(--ink); }
.lead { color: var(--ink-sub); margin: var(--space-2) 0 0; max-width: 70ch; }
.tabs { margin: var(--space-5) 0 var(--space-4); }
.list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.none { padding: var(--space-4) 0; color: var(--ink-sub); border-bottom: 1px solid var(--line); }
.row { display: flex; align-items: center; gap: var(--space-4); padding: 14px 0; border-bottom: 1px solid var(--line); }
.cp { width: 40px; height: 40px; flex: none; border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: none; color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.info { flex: 1; min-width: 0; cursor: pointer; }
.s { color: var(--ink); }
.mute { color: var(--ink-mute); }
.tag { color: var(--ink-sub); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 1px 6px; margin-left: 6px; }
.w { color: var(--ink-sub); margin-top: 3px; }
.btns { display: flex; gap: var(--space-1); flex: none; }
/* A given answer stays visible as a pressed state (chip-on), not as accent. */
.btns .on { background: var(--chip-on); color: var(--ink); border: 1px solid var(--chip-on-line); }
@media (max-width: 600px) { .row { flex-wrap: wrap; } .btns { width: 100%; justify-content: flex-end; } }
</style>
