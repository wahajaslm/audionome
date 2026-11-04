<script setup lang="ts">
/**
 * MomentRow (design system): a saved passage in a list.
 * Props: song, artist; start / end (seconds); what (e.g. "Vocals · Melody"); note; tags;
 * fresh (shows "New"); playing (play button shows pause); songDuration (for the mini waveform);
 * editable (shows Edit, for My Moments) and editing (Edit's aria-expanded); removable (shows the
 * remove cross, default true). Default slot: extra actions after the duration, e.g. Discover's
 * "Not for me" / "I like it" (they wrap to their own line below 600px).
 * Emits: play, remove, edit, open (the text column: opens the moment in the player).
 * Layout: round play · mini waveform (40 bars, the moment in accent) · song — artist · what and
 * note · tags · range · duration · remove. Below 600px the mini waveform and range are hidden.
 */
import { computed } from 'vue';
import Icon from './Icon.vue';
import { formatTime } from './format';

const props = withDefaults(defineProps<{
  song: string; artist?: string; start: number; end: number; what?: string; note?: string;
  tags?: string[]; fresh?: boolean; playing?: boolean; songDuration?: number; editable?: boolean; editing?: boolean; removable?: boolean;
}>(), { artist: '', what: '', note: '', tags: () => [], fresh: false, playing: false, songDuration: 0, editable: false, editing: false, removable: true });
const emit = defineEmits<{ play: []; remove: []; edit: []; open: [] }>();

/** Seeded bar heights (same formula as the classic list), so a row never flickers. */
const bars = computed(() => {
  const len = props.songDuration > props.end ? props.songDuration : Math.max(props.end + 20, 260);
  let s = 12;
  return Array.from({ length: 40 }, (_, i) => {
    s = (s * 9301 + 49297) % 233280;
    const t = i / 39, ts = t * len;
    return { h: Math.max(2, Math.round(Math.pow(Math.sin(Math.PI * t), 0.5) * (0.3 + 0.7 * s / 233280) * 28)), on: ts >= props.start && ts <= props.end };
  });
});
</script>

<template>
  <li class="row">
    <button type="button" class="cp" :aria-label="(playing ? 'Pause ' : 'Play ') + song + ' moment'" @click="emit('play')">
      <Icon :name="playing ? 'pause' : 'play'" :size="12" />
    </button>
    <div class="mw" aria-hidden="true">
      <i v-for="(b, i) in bars" :key="i" :class="{ on: b.on }" :style="{ height: b.h + 'px' }"></i>
    </div>
    <div class="info" @click="emit('open')">
      <div class="s item">{{ song }} <span v-if="artist">— {{ artist }}</span><b v-if="fresh" class="new">New</b></div>
      <div v-if="what || note" class="w label">{{ what }}<template v-if="what && note"> · </template><template v-if="note">“{{ note }}”</template></div>
      <div v-if="tags.length" class="tags"><span v-for="t in tags" :key="t" class="caption">{{ t }}</span></div>
    </div>
    <span class="r label rng">{{ formatTime(start) }} – {{ formatTime(end) }}</span>
    <span class="r label dur">{{ formatTime(end - start) }}</span>
    <button v-if="editable" type="button" class="ed label" :aria-expanded="editing" :aria-label="'Edit tags and note for ' + song + ' moment'" @click="emit('edit')">Edit</button>
    <div v-if="$slots.default" class="act"><slot /></div>
    <button v-if="removable" type="button" class="rm" aria-label="Remove moment" title="Remove moment" @click="emit('remove')">
      <Icon name="close" :size="14" />
    </button>
  </li>
</template>

<style scoped>
.row { display: flex; align-items: center; gap: 18px; padding: 14px 0; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
.cp { width: 40px; height: 40px; flex: none; border: 1px solid var(--line-strong); border-radius: 50%; background: none; color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.mw { width: 150px; height: 30px; display: flex; align-items: center; justify-content: space-between; flex: none; }
.mw i { display: block; width: var(--wave-bar); border-radius: var(--radius-xs); background: var(--wave-off); }
.mw i.on { background: var(--accent); }
.info { flex: 1; min-width: 0; cursor: pointer; }
.ed { flex: none; min-height: 34px; padding: 0 var(--space-3); border: 0; border-radius: var(--radius-pill); background: none; color: var(--ink-sub); cursor: pointer; }
.ed:hover, .ed[aria-expanded='true'] { color: var(--ink); background: var(--bg-raise); }
.s { color: var(--ink); }
.s span { color: var(--ink-mute); }
.new { color: var(--accent); font-size: 12px; font-weight: 400; margin-left: 6px; }
.w { color: var(--ink-sub); margin-top: 3px; }
.tags { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: 6px; }
.tags span { color: var(--ink-sub); border: 1px solid var(--line-strong); border-radius: 6px; padding: 2px 7px; }
.r { color: var(--ink-mute); white-space: nowrap; }
.dur { color: var(--ink); }
.rm { width: var(--hit-target); height: var(--hit-target); flex: none; background: none; border: 0; border-radius: var(--radius-sm); color: var(--ink-mute); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.rm:hover { background: var(--bg-raise); color: var(--ink); }
.act { display: flex; gap: var(--space-1); flex: none; }
@media (max-width: 600px) { .mw, .rng { display: none; } .row:has(.act) { flex-wrap: wrap; } .act { width: 100%; justify-content: flex-end; } }
</style>
