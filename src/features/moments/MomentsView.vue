<script setup lang="ts">
/**
 * My Moments (port of index.html's renderMoments() and its 'playall', 'playm', 'open-moment',
 * 'tab', 'coll', 'delmoment' actions), plus editing a moment's tags and note in place.
 * Collections are automatic, from what you said: Chills, Nostalgia ("home"), Melody.
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
const tabs = ['All moments', ...COLLECTIONS];
const list = computed(() => moments.value.filter(m => inTab(m, tab.value)));

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

const isPlaying = (m: Moment) => playback.playing && playback.trackId === m.trackId && playback.t >= m.startSec - 0.5 && playback.t <= m.endSec + 0.5;
</script>

<template>
  <div class="page">
    <div class="head">
      <div>
        <h1 class="page-title">My Moments</h1>
        <p class="lead body">The passages you saved from the player, played back to back.</p>
      </div>
      <Button v-if="moments.length" variant="outline" :disabled="!list.length" @click="momentsStore.playAll(list)">
        <Icon name="play" :size="14" />
        Play {{ list.length }} {{ list.length === 1 ? 'moment' : 'moments' }} · {{ formatTime(totalSeconds(list)) }}
      </Button>
    </div>

    <template v-if="!moments.length">
      <div class="empty">
        <p class="body">No saved moments yet. Drag across the waveform to select a passage you love, then Save.</p>
        <Button variant="primary" @click="router.push('/')">Open the player</Button>
      </div>
    </template>

    <template v-else>
      <Tabs class="tabs" :items="tabs" :selected="tab" label="Collections" @select="selectTab" />

      <!-- MomentRow rule: open list split by `line` hairlines (no cards). -->
      <ol class="list">
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
.page { max-width: var(--content-max); margin: 0 auto; padding: var(--space-6) var(--space-4); font-variant-numeric: tabular-nums; }
.head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-4); }
h1 { margin: 0; color: var(--ink); }
.lead { color: var(--ink-sub); margin: var(--space-2) 0 0; }
.tabs { margin: var(--space-5) 0 var(--space-4); }
.list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.none { padding: var(--space-4) 0; color: var(--ink-sub); border-bottom: 1px solid var(--line); }
.edit { padding: var(--space-3) 0; border-bottom: 1px solid var(--line); }
/* An empty list is still an open list: hairlines, no dashed box. */
.empty { margin-top: var(--space-5); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: var(--space-6) 0; text-align: center; color: var(--ink-sub); }
.empty p { margin: 0 0 var(--space-4); }
.more { margin-top: var(--space-3); padding-left: 0; }
</style>
