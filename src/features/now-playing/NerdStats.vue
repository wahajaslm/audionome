<script setup lang="ts">
/**
 * Stats for nerds columns (core/nerdStats.ts), shown in the Nerds view (NerdsPanel.vue).
 * Mounting it reads MediaInfo from the song file (in the browser) and asks the local service for
 * ffprobe's facts; playback numbers refresh twice a second while it is open. Each value says
 * which source it came from (frames · MediaInfo · ffprobe).
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { analysisRows, fetchProbe, fileRows, playbackRows, readMediaInfo, type MediaInfoFacts, type ProbeInfo } from '../../core/nerdStats';
import { fallbackUrl } from '../../core/library';
import { SERVICE_URL } from '../../core/service';
import { PRESETS } from '../../core/effects';
import { usePlaybackStore } from '../../stores/playback';
import { useTimelineStore } from '../../stores/timeline';

const playback = usePlaybackStore();
const timeline = useTimelineStore();
const open = ref(true); // the Nerds view is the toggle; mounted = open
const mi = ref<MediaInfoFacts | null>(null);
const probe = ref<ProbeInfo | null>(null);
const state = ref<'idle' | 'loading' | 'done'>('idle');
let loadedFor: string | null = null;

async function load(): Promise<void> {
  const t = playback.currentTrack;
  if (!t || loadedFor === t.id) return;
  loadedFor = t.id; state.value = 'loading'; mi.value = null; probe.value = null;
  const id = t.id;
  const blobP = t.audioBlob instanceof Blob && t.audioBlob.size > 0 ? Promise.resolve(t.audioBlob)
    : fetch(fallbackUrl(t)).then(r => (r.ok ? r.blob() : null)).catch(() => null);
  const [m, p] = await Promise.all([
    blobP.then(b => (b ? readMediaInfo(b) : null)).catch(err => { console.warn('MediaInfo notice:', err); return null; }),
    fetchProbe(SERVICE_URL, id),
  ]);
  if (loadedFor !== id) return;
  mi.value = m; probe.value = p; state.value = 'done';
}
watch(open, o => { if (o) load(); }, { immediate: true });
watch(() => playback.trackId, () => { loadedFor = null; if (open.value) load(); });

// Live numbers: re-read twice a second while open (not every frame).
const tick = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
watch(open, o => {
  if (timer) { clearInterval(timer); timer = null; }
  if (o) timer = setInterval(() => { tick.value++; }, 500);
}, { immediate: true });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

const nowKbps = computed(() => {
  void tick.value;
  const br = timeline.bitrate;
  return br ? br.kbps[Math.min(br.kbps.length - 1, Math.max(0, Math.floor(playback.t / br.binSec)))] ?? null : null;
});
const groups = computed(() => {
  void tick.value;
  const e = playback.engine(), t = playback.currentTrack;
  const fx = playback.fx, listen = fx.listen === 'original' ? 'Original' : fx.listen === 'mix' ? 'My mix' : fx.versions.find(v => v.id === fx.listen)?.name ?? '';
  const preset = playback.effects.preset;
  const effects = !playback.effectsOn ? 'none' : listen + (preset !== 'custom' && preset !== 'off' ? ' · ' + PRESETS[preset].label : '');
  const src = e?.el.src ?? '';
  const source = src.startsWith('blob:') ? 'this device' : src.includes('/api/stream') ? 'stream via service' : src.includes('/api/audio') ? 'local service copy' : src ? 'bundled file' : '—';
  return [
    { title: 'File', rows: fileRows(timeline.bitrate, mi.value, probe.value, nowKbps.value) },
    { title: 'Playback', rows: e ? playbackRows(e.stats(), { source, stem: playback.activeStem, practiceRate: playback.rate, effects, lufs: t?.loudnessLufs, peakDb: t?.peakDb }) : [] },
    { title: 'Analysis', rows: analysisRows(timeline.timeline) },
  ];
});
const sourcesNote = computed(() => state.value === 'loading' ? 'Reading MediaInfo and ffprobe…'
  : state.value === 'done' ? [mi.value ? 'MediaInfo ✓' : 'MediaInfo —', probe.value ? 'ffprobe ✓' : 'ffprobe — (service off or file not cached)'].join(' · ') : '');
</script>

<template>
  <section class="nerd">
    <div v-if="sourcesNote" class="src">{{ sourcesNote }}</div>
    <div class="grid">
      <div v-for="g in groups" :key="g.title" class="col">
        <h3 class="gt">{{ g.title }}</h3>
        <dl>
          <template v-for="r in g.rows" :key="r[0]">
            <dt>{{ r[0] }}</dt>
            <!-- The source (frames · MediaInfo · ffprobe) is only a tooltip: values read clean. -->
            <dd :title="r[2] ? 'from ' + r[2] : undefined">{{ r[1] }}</dd>
          </template>
        </dl>
      </div>
    </div>
  </section>
</template>

<style scoped>
.nerd { margin-top: var(--space-3); border-top: 1px solid var(--line); padding-top: var(--space-2); }
.toggle { display: flex; align-items: baseline; gap: 8px; border: 0; background: none; padding: 6px 0; color: var(--ink-sub); font: 13px var(--font-sans); cursor: pointer; width: 100%; text-align: left; }
.toggle:hover { color: var(--ink); }
.caret { display: inline-block; transition: transform 150ms ease; }
.caret.open { transform: rotate(90deg); }
.src { text-align: right; color: var(--ink-mute); font-size: 12px; }
.grid { display: grid; grid-template-columns: 1.2fr 1fr 0.8fr; gap: var(--space-6); padding: var(--space-2) 0 var(--space-3); }
.gt { margin: 0 0 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-sub); }
dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
dt { color: var(--ink-mute); }
dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; gap: var(--space-4); } }
</style>
