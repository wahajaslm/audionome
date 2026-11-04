import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';
import type { Moment } from '../data/types';
import { deleteMoment, loadMoments, putMoment } from '../core/repository';
import { newMoment, savedRanges, withTags } from '../core/moments';
import type { Range } from '../core/playback';
import { useIntelligenceStore } from './intelligence';
import { useLibraryStore } from './library';
import { useListeningStore } from './listening';
import { usePlaybackStore } from './playback';

/** Saved moments (Dexie `moments`), newest first. */
export const useMomentsStore = defineStore('moments', () => {
  const moments = shallowRef<Moment[]>([]);

  /** Saved ranges of the track that is loaded in the player. */
  const savedForCurrent = computed(() => savedRanges(moments.value, usePlaybackStore().trackId));

  async function load(): Promise<void> {
    moments.value = await loadMoments();
  }

  function persist(m: Moment): void {
    putMoment(m).then(() => useIntelligenceStore().refresh()).catch(console.warn);
  }

  /**
   * Saves a range of the loaded track as a new moment and logs 'select_moment'.
   * Returns the new id, or null when no track is loaded.
   */
  function add(r: Range): string | null {
    const playback = usePlaybackStore();
    const t = useLibraryStore().track(playback.trackId);
    if (!t) return null;
    const m = newMoment(t.id, r);
    moments.value = [m, ...moments.value];
    persist(m);
    useListeningStore().emit('select_moment', 'user', { momentStartSec: r.a, momentEndSec: r.b });
    return m.id;
  }

  /** Saves a moment for any track (e.g. confirming an attention hint). */
  function addForTrack(trackId: string, r: Range, note = ''): string {
    const m = { ...newMoment(trackId, r), note };
    moments.value = [m, ...moments.value];
    persist(m);
    return m.id;
  }

  /** Adds feelings / qualities / a note. Returns the moment's qualities after the merge. */
  function applyTags(id: string, feel: string[], love: string[], note: string): string[] {
    const m = moments.value.find(x => x.id === id);
    if (!m) return [];
    const updated = withTags(m, feel, love, note);
    moments.value = moments.value.map(x => (x.id === id ? updated : x));
    persist(updated);
    return updated.qualities;
  }

  async function remove(id: string): Promise<void> {
    await deleteMoment(id);
    await load();
    await useIntelligenceStore().refresh();
  }

  return { moments, savedForCurrent, load, add, addForTrack, applyTags, remove };
});
