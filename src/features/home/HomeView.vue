<script setup lang="ts">
/**
 * Home: the app's front page. The app opens here (router/index.ts, HOME ON LAUNCH).
 * Top to bottom: continue listening (the loaded song, with its artwork) → import / add a link →
 * your songs as artwork tiles → your latest saved moments.
 * Before, this content only showed on Now playing when no song was loaded, and a song is always
 * loaded at start-up, so nobody ever saw it.
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePlaybackStore } from '../../stores/playback';
import { useLibraryStore } from '../../stores/library';
import { useMomentsStore } from '../../stores/moments';
import { useArtwork } from '../../composables/useArtwork';
import type { PlayableTrack } from '../../core/library';
import type { Moment } from '../../data/types';
import Artwork from '../../ui/Artwork.vue';
import Cover from '../../ui/Cover.vue';
import Button from '../../ui/Button.vue';
import Icon from '../../ui/Icon.vue';
import { formatTime } from '../../ui/format';

const playback = usePlaybackStore();
const library = useLibraryStore();
const momentsStore = useMomentsStore();
const router = useRouter();
const { artworkFor, washFor } = useArtwork();

const current = computed(() => playback.currentTrack);
/** Newest first; the built-in demo only when it is all there is. */
const songs = computed(() => {
  const own = library.tracks.filter(t => t.id !== 'original-demo');
  return (own.length ? own : library.tracks).slice(0, 12);
});
const recentMoments = computed(() => [...momentsStore.moments].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5));
const momentWhat = (m: Moment) => [...(m.feelings || []), ...(m.qualities || [])].slice(0, 3).join(' · ') || m.note || 'Saved moment';

/** A tile plays its song and opens the player. */
async function playSong(t: PlayableTrack): Promise<void> {
  if (playback.currentTrack?.id !== t.id) await playback.changeTrack(t, true);
  router.push('/');
}
async function playMoment(m: Moment): Promise<void> {
  await momentsStore.play(m, false);
  router.push('/');
}

// Same import as Library's "Import audio" button; the first new song opens in the player.
const fileInput = ref<HTMLInputElement | null>(null);
async function onFiles(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const added = await library.importFiles(Array.from(input.files || []));
  input.value = '';
  if (added.length) router.push('/');
}
</script>

<template>
  <div class="page">
    <div class="head">
      <div>
        <h1 class="page-title">Home</h1>
        <p class="lead body">Your songs and the moments you saved. Audio stays on your device.</p>
      </div>
      <div class="actions">
        <Button variant="primary" @click="fileInput?.click()">Import audio</Button>
        <Button variant="outline" @click="router.push('/library')">Add from a link</Button>
      </div>
      <input ref="fileInput" type="file" class="file" accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac,.opus" multiple aria-label="Import audio files" @change="onFiles" />
    </div>

    <!-- Continue listening: the loaded song on a soft wash of its cover's colour. -->
    <section v-if="current" class="cont" :style="{ '--wash': washFor(current) }" aria-label="Continue listening">
      <button type="button" class="cont-art" aria-label="Open Now playing" @click="router.push('/')">
        <Artwork v-bind="artworkFor(current)" :size="120" radius="var(--radius-md)" />
      </button>
      <div class="cont-meta">
        <div class="eyebrow caption">{{ playback.playing ? 'Playing now' : 'Continue listening' }}</div>
        <div class="heading cont-title">{{ current.title }}</div>
        <div class="label cont-artist">{{ current.artist }}</div>
        <div class="cont-btns">
          <Button size="sm" variant="primary" @click="playback.togglePlay()">
            <Icon :name="playback.playing ? 'pause' : 'play'" :size="12" />
            {{ playback.playing ? 'Pause' : 'Play' }}
          </Button>
          <Button size="sm" @click="router.push('/')">Open player →</Button>
        </div>
      </div>
    </section>

    <section v-else class="none">
      <Cover :size="96" />
      <p class="body">Nothing playing yet. Import a song, or pick one below.</p>
    </section>

    <template v-if="songs.length">
      <div class="sh-row">
        <h2 class="heading sh">Your songs</h2>
        <button type="button" class="more label" @click="router.push('/library')">All in Library →</button>
      </div>
      <ul class="tiles">
        <li v-for="s in songs" :key="s.id">
          <button type="button" class="tile" :class="{ on: current?.id === s.id }" @click="playSong(s)">
            <Artwork v-bind="artworkFor(s)" fluid radius="var(--radius-md)" />
            <span class="label tile-title">{{ s.title }}</span>
            <span class="caption tile-artist">{{ s.artist }}</span>
          </button>
        </li>
      </ul>
    </template>

    <div class="sh-row">
      <h2 class="heading sh">Recent moments</h2>
      <button v-if="recentMoments.length" type="button" class="more label" @click="router.push('/moments')">All in My Moments →</button>
    </div>
    <p v-if="!recentMoments.length" class="label empty-line">None yet. In the player, drag across the waveform and press Save.</p>
    <ol v-else class="rows">
      <li v-for="m in recentMoments" :key="m.id">
        <button type="button" class="mrow" @click="playMoment(m)">
          <Artwork v-bind="artworkFor(library.track(m.trackId))" :size="40" radius="6px" />
          <span class="m-text">
            <span class="label m-title">{{ library.track(m.trackId)?.title || 'A song' }}</span>
            <span class="caption m-sub">{{ formatTime(m.startSec) }} – {{ formatTime(m.endSec) }} · {{ momentWhat(m) }}</span>
          </span>
          <span class="cp" aria-hidden="true"><Icon name="play" :size="10" /></span>
        </button>
      </li>
    </ol>
  </div>
</template>

<style scoped>
/* Layout rule "Other pages": page title, one lead line, then open lists. */
.page { max-width: var(--content-max); margin: 0 auto; padding: var(--space-6) var(--space-4) var(--space-7); box-sizing: border-box; position: relative; isolation: isolate; }
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--space-4); flex-wrap: wrap; }
.page-title { margin: 0; color: var(--ink); }
.lead { margin: var(--space-2) 0 0; color: var(--ink-sub); }
.actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.file { display: none; }

.cont { position: relative; display: flex; align-items: center; gap: var(--space-5); margin-top: var(--space-6); padding: var(--space-5); border-radius: var(--radius-lg); overflow: hidden; background: var(--bg-panel); }
/* The wash sits inside the card, so the rest of the page keeps its own colour. */
.cont::before { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(100deg, color-mix(in srgb, var(--wash) 32%, transparent), transparent 70%); }
.cont { z-index: 0; }
.cont-art { padding: 0; border: 0; background: none; cursor: pointer; flex: none; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); border-radius: var(--radius-md); }
.cont-meta { min-width: 0; }
.eyebrow { color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.08em; }
.cont-title { color: var(--ink); margin-top: var(--space-1); overflow-wrap: anywhere; }
.cont-artist { color: var(--ink-sub); margin-top: 2px; }
.cont-btns { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-4); }

.none { display: flex; align-items: center; gap: var(--space-4); margin-top: var(--space-6); color: var(--ink-sub); }
.none p { margin: 0; }

.sh-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-7); margin-bottom: var(--space-4); }
.sh { margin: 0; color: var(--ink); }
.more { background: none; border: 0; padding: 0; color: var(--ink-mute); cursor: pointer; }
.more:hover { color: var(--ink); }

.tiles {
  list-style: none; margin: 0; padding: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--space-5) var(--space-4);
}
/* LAYOUT FIX - long titles ("Chaap-Tilak-Sab-Cheeni-Abida-Parveen-Rahat-Fateh-Ali") ran into the
   next tile, and their width pushed the grid past the right edge. Now each cell may shrink to its
   column (min-width: 0), the cover fills the column, and title/artist are blocks cut with "…". */
.tiles li { min-width: 0; }
.tile { display: block; width: 100%; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.tile .art { margin-bottom: var(--space-2); transition: transform .15s ease; }
.tile:hover .art { transform: translateY(-2px); }
.tile.on .art { outline: 2px solid var(--accent); outline-offset: 2px; }
.tile-title, .tile-artist { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tile-title { color: var(--ink); }
.tile-artist { color: var(--ink-mute); margin-top: 2px; }

.empty-line { color: var(--ink-mute); margin: 0; }
.rows { list-style: none; margin: 0; padding: 0; }
.rows li { border-bottom: 1px solid var(--line); }
.mrow { width: 100%; display: flex; align-items: center; gap: var(--space-3); padding: 10px 0; background: none; border: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.m-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.m-title { color: var(--ink-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mrow:hover .m-title { color: var(--ink); }
.m-sub { color: var(--ink-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cp { width: 28px; height: 28px; flex: none; border-radius: 50%; border: 1px solid var(--line-strong); display: inline-flex; align-items: center; justify-content: center; color: var(--ink-sub); }

@media (prefers-reduced-motion: reduce) { .tile .art { transition: none; } }
@media (max-width: 600px) {
  .page { padding-top: var(--space-4); }
  .cont { gap: var(--space-4); padding: var(--space-4); }
  .cont-art :deep(.art) { width: 88px !important; height: 88px !important; }
  .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
