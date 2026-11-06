import { onMounted } from 'vue';
import { db } from '../data/db';
import { deleteTrackEverywhere, ensureDemo } from '../core/repository';
import { scheduleSequentialUploads } from '../core/library';
import { uploadAudioToCache } from '../intelligence/client';
import { useLibraryStore } from '../stores/library';
import { useListeningStore } from '../stores/listening';
import { useMomentsStore } from '../stores/moments';
import { useIntelligenceStore } from '../stores/intelligence';
import { usePlaybackStore } from '../stores/playback';
import { useUiStore } from '../stores/ui';
import { useTimelineStore } from '../stores/timeline';

/**
 * TEST SONG CLEANUP - while debugging (2026-11-05) a test analysis was sent to the service as
 * 'probe-test'. The start-up sync copied it into Library as a song called "audio" before it was
 * removed from the service, so it had no audio: it could not play and showed up in Discover.
 * It is deleted here, with its analyses, so the sync never brings it back.
 */
const LEAKED_TEST_IDS = ['probe-test'];

/**
 * Start-up, in the same order as index.html's initialize(): demo track, settings, library,
 * moments, attention hints, deferred uploads (DELAY FIX 4), first track, auto-analysis.
 */
export function useAppBootstrap(): void {
  const library = useLibraryStore(), listening = useListeningStore(), moments = useMomentsStore();
  const intelligence = useIntelligenceStore(), playback = usePlaybackStore(), ui = useUiStore();
  // The loaded song's timeline (spectrum, beats, chords, stems) follows the player from here.
  useTimelineStore().bind();

  onMounted(async () => {
    try {
      await ensureDemo();
      for (const id of LEAKED_TEST_IDS) if (await db.tracks.get(id)) await deleteTrackEverywhere(id);
      await Promise.all([listening.loadSettings(), library.loadSettings(), playback.loadSettings(), library.load()]);
      // RESUME FIX - a refresh used to open the first song in the library, not the one you were
      // playing, and at 0:00. Now it opens the last song where you left it, paused (Spotify).
      // The song loads first; moments and listening history follow without holding it up.
      // Example: pause "Naina Moray" at 2:41, refresh → "Naina Moray" at 2:41, ready to play.
      const last = await playback.lastPlayed();
      const first = library.track(last?.trackId) || library.tracks.find(t => t.id !== 'original-demo') || library.tracks[0];
      const at = last && first?.id === last.trackId ? last.t : 0;
      const loading = first && !playback.trackId ? playback.selectTrack(first, at, false) : Promise.resolve();
      await Promise.all([loading, moments.load().then(() => intelligence.refresh())]);
      scheduleSequentialUploads(() => library.tracks, uploadAudioToCache);
      if (library.autoAnalyze) library.autoAnalyzeLibrary().catch(console.warn);
    } catch (err) {
      console.error(err);
      ui.notify('Music DNA could not initialize: ' + String((err as Error).message || err));
    }
  });
}
