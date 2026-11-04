<script setup lang="ts">
/**
 * "Moments you return to": passages you replayed or looped at least twice that are not saved
 * yet (attention candidates). Principle 6 "Signals, not conclusions": each is a hint you can
 * Listen to, Save, or Dismiss (dismissing is logged without penalty). Hidden while Learning is
 * paused. Port of the classic DNA list ('candidate', 'savecand', 'dismisscand').
 */
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useIntelligenceStore } from '../../stores/intelligence';
import { useLibraryStore } from '../../stores/library';
import { useListeningStore } from '../../stores/listening';
import { usePlaybackStore } from '../../stores/playback';
import Button from '../../ui/Button.vue';
import Icon from '../../ui/Icon.vue';
import { formatTime } from '../../ui/format';

const props = withDefaults(defineProps<{ limit?: number }>(), { limit: 4 });
const intelligence = useIntelligenceStore();
const library = useLibraryStore();
const playback = usePlaybackStore();
const { learning } = storeToRefs(useListeningStore());
const list = computed(() => (learning.value ? intelligence.candidates.slice(0, props.limit) : []));

/** Example: confidence 'repeated interest', reasons ['returned 3 times'] → "Repeated interest · returned 3 times". */
const why = (c: (typeof list.value)[number]) =>
  (c.confidence === 'repeated interest' ? 'Repeated interest' : 'Possible interest') + ' · ' + (c.reason?.length ? c.reason.join(', ') : 'you returned here');

async function listen(c: (typeof list.value)[number]) {
  playback.queue = [];
  await playback.openRange(c.startSec, c.endSec, c.trackId, true);
}
</script>

<template>
  <section v-if="list.length" class="att">
    <h2 class="heading sh">Moments you return to</h2>
    <p class="label shs">Your listening suggests these. It is attention, not an emotional label. Save the ones you love.</p>
    <ol class="list">
      <li v-for="c in list" :key="c.trackId + ':' + c.startSec" class="row">
        <button type="button" class="cp" :aria-label="'Listen to ' + (library.track(c.trackId)?.title || 'passage') + ' ' + formatTime(c.startSec)" @click="listen(c)">
          <Icon name="play" :size="12" />
        </button>
        <div class="info">
          <div class="item s">{{ library.track(c.trackId)?.title || 'A song' }} · {{ formatTime(c.startSec) }}–{{ formatTime(c.endSec) }}</div>
          <div class="label w">{{ why(c) }}</div>
        </div>
        <div class="btns">
          <Button size="sm" @click="intelligence.dismissCandidate(c.trackId, c.startSec)">Dismiss</Button>
          <Button size="sm" variant="outline" @click="intelligence.confirmCandidate(c.trackId, c.startSec)">Save</Button>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.sh { color: var(--ink); margin: var(--space-7) 0 var(--space-1); }
.shs { color: var(--ink-sub); margin: 0 0 var(--space-3); }
.list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.row { display: flex; align-items: center; gap: var(--space-4); padding: 14px 0; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
.cp { width: 40px; height: 40px; flex: none; border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: none; color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.info { flex: 1; min-width: 0; }
.s { color: var(--ink); }
.w { color: var(--ink-sub); margin-top: 3px; }
.btns { display: flex; gap: var(--space-1); flex: none; }
@media (max-width: 600px) { .row { flex-wrap: wrap; } .btns { width: 100%; justify-content: flex-end; } }
</style>
