import { onMounted } from 'vue';
import { ensureDemo } from '../core/repository';
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
      await Promise.all([listening.loadSettings(), library.loadSettings(), playback.loadSettings()]);
      await library.load();
      await moments.load();
      await intelligence.refresh();
      scheduleSequentialUploads(() => library.tracks, uploadAudioToCache);
      const first = library.tracks.find(t => t.id !== 'original-demo') || library.tracks[0];
      if (first && !playback.trackId) await playback.selectTrack(first, 0, false);
      if (library.autoAnalyze) library.autoAnalyzeLibrary().catch(console.warn);
    } catch (err) {
      console.error(err);
      ui.notify('Music DNA could not initialize: ' + String((err as Error).message || err));
    }
  });
}
