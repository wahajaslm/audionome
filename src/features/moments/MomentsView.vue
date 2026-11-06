<script setup lang="ts">
/**
 * My Moments (port of index.html's renderMoments() and its 'playall', 'playm', 'open-moment',
 * 'tab', 'coll', 'delmoment' actions), plus editing a moment's tags and note in place.
 * Collections are automatic, from what you said: Chills, Nostalgia ("home"), Melody.
 * The last tab, Practising, is not saved moments: it lists passages you drilled (slowed down
 * or looped many times), which are kept out of your taste profile (core/practice.ts).
 */
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import type { Moment } from '../../data/types';
import { COLLECTIONS, FEELINGS, QUALITIES, describeMoment, inTab, totalSeconds } from '../../core/moments';
import { useLibraryStore } from '../../stores/library';
import { useMomentsStore } from '../../stores/moments';
import { usePlaybackStore } from '../../stores/playback';
import { useUiStore } from '../../stores/ui';
import { useIntelligenceStore } from '../../stores/intelligence';
import { PRACTICE_MIN_CYCLES, type PracticePassage } from '../../core/practice';
import MomentRow from '../../ui/MomentRow.vue';
import DescribeStrip from '../../ui/DescribeStrip.vue';
import Button from '../../ui/Button.vue';
import Tabs from '../../ui/Tabs.vue';
import Icon from '../../ui/Icon.vue';
import { formatTime } from '../../ui/format';

const library = useLibraryStore();
const momentsStore = useMomentsStore();
const playback = usePlaybackStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { moments } = storeToRefs(momentsStore);

/** Tab 0 = all; 1–3 = collections. The sidebar's collection links set ?c=1..3. */
const tab = ref(Number(route.query.c) || 0);
watch(() => route.query.c, c => { tab.value = Number(c) || 0; });
const PRACTICE_TAB = COLLECTIONS.length + 1;
const tabs = ['All moments', ...COLLECTIONS, 'Practising'];
const list = computed(() => tab.value === PRACTICE_TAB ? [] : moments.value.filter(m => inTab(m, tab.value)));
const practice = computed(() => useIntelligenceStore().practice);

/** Example: 20 cycles, 2 sessions, 0.75× → "Looped 20× · 2 sessions · down to 0.75×". */
const practiceWhy = (p: PracticePassage) => ['Looped ' + p.cycles + '×',
  p.sessions > 1 ? p.sessions + ' sessions' : '', p.slowestRate < 1 ? 'down to ' + p.slowestRate + '×' : ''].filter(Boolean).join(' · ');

/** Picks up where you left off: the passage, looping, at the slowest speed you used. */
async function practise(p: PracticePassage) {
  if (isHereP(p) && playback.playing) { await playback.togglePlay(); return; }
  playback.queue = [];
  await playback.openRange(p.a, p.b, p.trackId, false);
  // Speed first, so the loop start is already logged as practice.
  playback.setRate(p.slowestRate);
  if (!playback.loop) playback.toggleLoop();
}
const isHereP = (p: PracticePassage) => playback.trackId === p.trackId && playback.t >= p.a - 0.5 && playback.t <= p.b + 0.5;

/** The moment being edited, with a working copy of its tags (saved only on Done). */
const editing = ref<{ id: string; feel: string[]; love: string[]; note: string } | null>(null);

function startEdit(m: Moment) {
  editing.value = editing.value?.id === m.id ? null
    : { id: m.id, feel: [...(m.feelings || [])], love: [...(m.qualities || [])], note: m.note || '' };
}
const toggle = (arr: string[], v: string) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
function saveEdit() {
  const e = editing.value;
  if (!e) return;
  momentsStore.edit(e.id, e.feel, e.love, e.note);
  editing.value = null;
}

async function remove(id: string) {
  if (editing.value?.id === id) editing.value = null;
  await momentsStore.remove(id);
  ui.notify('Removed saved moment.');
}

/** MomentRow rule: playing a moment opens it in the player with the passage selected. */
async function open(m: Moment) {
  await momentsStore.play(m, false);
  router.push('/');
}

function selectTab(i: number) {
  tab.value = i;
  router.replace({ query: i ? { c: String(i) } : {} });
}

/**
 * ONE ACTIVE ROW FIX - every moment containing the playhead used to light up, so two
 * overlapping moments of one song both showed ⏸ at once.
 * Now only one row is active: the moment whose range is the player's selection (the one you
 * pressed), else the first moment in the list that contains the playhead.
 * Example: moments 1:40–2:10 and 1:50–2:20, you play the second at 1:55 → only it shows ⏸.
 */
const activeId = computed(() => {
  const here = (m: Moment) => playback.trackId === m.trackId && playback.t >= m.startSec - 0.5 && playback.t <= m.endSec + 0.5;
  const sel = playback.sel;
  const picked = sel && list.value.find(m => here(m) && Math.abs(m.startSec - sel.a) < 0.5 && Math.abs(m.endSec - sel.b) < 0.5);
  return (picked || list.value.find(here))?.id ?? null;
});
const isHere = (m: Moment) => activeId.value === m.id;
const isPlaying = (m: Moment) => playback.playing && isHere(m);
</script>

<template>
  <div class="page">
    <div class="head">
      <div>
        <h1 class="page-title">My Moments</h1>
        <p class="lead body">The passages you saved from the player, played back to back.</p>
      </div>
      <Button v-if="moments.length && tab !== PRACTICE_TAB" variant="outline" :disabled="!list.length" @click="momentsStore.playAll(list)">
        <Icon name="play" :size="14" />
        Play {{ list.length }} {{ list.length === 1 ? 'moment' : 'moments' }} · {{ formatTime(totalSeconds(list)) }}
      </Button>
    </div>

    <template v-if="!moments.length && !practice.length">
      <div class="empty">
        <p class="body">No saved moments yet. Drag across the waveform to select a passage you love, then Save.</p>
        <Button variant="primary" @click="router.push('/')">Open the player</Button>
      </div>
    </template>

    <template v-else>
      <Tabs class="tabs" :items="tabs" :selected="tab" label="Collections" @select="selectTab" />

      <!-- MomentRow rule: open list split by `line` hairlines (no cards). -->
      <ol v-if="tab === PRACTICE_TAB" class="list">
        <li v-if="!practice.length" class="none body">
          Nothing here yet. Slow a passage down, or loop it {{ PRACTICE_MIN_CYCLES }} times or more, and it is listed here instead of counting toward your taste.
        </li>
        <li v-for="p in practice" :key="p.trackId + ':' + p.a + ':' + p.b" class="prow">
          <button
            type="button"
            class="cp"
            :class="{ on: isHereP(p) && playback.playing, cur: isHereP(p) && !playback.playing }"
            :aria-label="'Practise ' + (library.track(p.trackId)?.title || 'passage') + ' ' + formatTime(p.a)"
            @click="practise(p)"
          ><Icon :name="isHereP(p) && playback.playing ? 'pause' : 'play'" :size="12" /></button>
          <div class="pinfo">
            <div class="item s">{{ library.track(p.trackId)?.title || 'A song' }} · {{ formatTime(p.a) }}–{{ formatTime(p.b) }}</div>
            <div class="label w">{{ practiceWhy(p) }}</div>
          </div>
        </li>
      </ol>
      <ol v-else class="list">
        <li v-if="!list.length" class="none body">
          No moments here yet. Save a moment, choose More… and pick Chills or Nostalgia (or tap Melody), and it lands here.
        </li>
        <template v-for="m in list" :key="m.id">
          <MomentRow
            :song="library.track(m.trackId)?.title || 'Unknown song'"
            :artist="library.track(m.trackId)?.artist"
            :start="m.startSec"
            :end="m.endSec"
            :what="describeMoment(m)"
            :note="m.note"
            :tags="[...(m.feelings || []), ...(m.qualities || [])]"
            :playing="isPlaying(m)"
            :current="isHere(m)"
            :song-duration="library.track(m.trackId)?.durationSec"
            editable
            :editing="editing?.id === m.id"
            @play="momentsStore.play(m)"
            @open="open(m)"
            @edit="startEdit(m)"
            @remove="remove(m.id)"
          />
          <!-- Editing reuses the DescribeStrip (the one way to describe a moment), in place under the row. -->
          <li v-if="editing && editing.id === m.id" class="edit">
            <DescribeStrip
              :feelings="FEELINGS"
              :qualities="QUALITIES"
              :feel="editing.feel"
              :love="editing.love"
              v-model:note="editing.note"
              @toggle-feel="toggle(editing!.feel, $event)"
              @toggle-love="toggle(editing!.love, $event)"
              @cancel="editing = null"
              @done="saveEdit"
            />
          </li>
        </template>
      </ol>
      <Button class="more" @click="router.push('/discover')">Find unfamiliar moments like these in Discover →</Button>
    </template>
  </div>
</template>

<style scoped>
.page { width: 100%; max-width: var(--content-max); margin: 0 auto; padding: var(--space-6) var(--space-4); font-variant-numeric: tabular-nums; box-sizing: border-box;
  /* One screen tall: header and tabs stay put, only .list scrolls (see SCROLL FIX in App.vue). */
  height: 100%; display: flex; flex-direction: column; }
.head, .tabs, .empty, .more { flex: none; }
.head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-4); }
h1 { margin: 0; color: var(--ink); }
.lead { color: var(--ink-sub); margin: var(--space-2) 0 0; }
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
.prow { display: flex; align-items: center; gap: var(--space-4); padding: 14px 0; border-bottom: 1px solid var(--line); }
.cp { width: 40px; height: 40px; flex: none; border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: none; color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.cp.on { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.cp.cur { border-color: var(--accent); color: var(--accent); }
.pinfo { flex: 1; min-width: 0; }
.pinfo .s { color: var(--ink); }
.pinfo .w { color: var(--ink-sub); margin-top: 3px; }
.edit { padding: var(--space-3) 0; border-bottom: 1px solid var(--line); }
/* An empty list is still an open list: hairlines, no dashed box. */
.empty { margin-top: var(--space-5); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: var(--space-6) 0; text-align: center; color: var(--ink-sub); }
.empty p { margin: 0 0 var(--space-4); }
.more { margin-top: var(--space-3); padding-left: 0; }
</style>
