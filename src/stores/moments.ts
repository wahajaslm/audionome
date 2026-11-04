import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';
import type { Moment } from '../data/types';
import { deleteMoment, loadMoments, putMoment } from '../core/repository';
import { newMoment, savedRanges, withEdits, withTags } from '../core/moments';
import { withoutTrait, type TraitDefinition } from '../core/dna';
import { useUiStore } from './ui';
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

  /**
   * NO DUPLICATES FIX - Save (and Save in Explore) used to add a new moment on every press, so
   * saving one loop twice gave two moments. This returns the saved moment with the same range
   * (within 0.5 s), or adds one. Example: save 0:44–1:09, press Save again → same id.
   */
  function ensure(r: Range): { id: string | null; isNew: boolean } {
    const trackId = usePlaybackStore().trackId;
    const same = moments.value.find(m => m.trackId === trackId && Math.abs(m.startSec - r.a) < 0.5 && Math.abs(m.endSec - r.b) < 0.5);
    return same ? { id: same.id, isNew: false } : { id: add(r), isNew: true };
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

  /** My Moments "Edit": replaces feelings, qualities and note with what was left pressed. */
  function edit(id: string, feelings: string[], qualities: string[], note: string): void {
    const m = moments.value.find(x => x.id === id);
    if (!m) return;
    const updated = withEdits(m, feelings, qualities, note);
    moments.value = moments.value.map(x => (x.id === id ? updated : x));
    persist(updated);
    useUiStore().notify('Moment updated' + (updated.qualities.length ? ' · ' + updated.qualities.join(', ') : ''));
  }

  /**
   * My Music DNA "Correct": this moment no longer counts for that trait. Only the trait's
   * labels are removed; the moment, its feelings and its other qualities stay.
   */
  function correctTrait(id: string, trait: Pick<TraitDefinition, 'keys' | 'short'>): void {
    const m = moments.value.find(x => x.id === id);
    if (!m) return;
    const updated = withoutTrait(m, trait);
    moments.value = moments.value.map(x => (x.id === id ? updated : x));
    persist(updated);
    useUiStore().notify('Removed ' + trait.short + ' from this moment.');
  }

  /** Plays one moment: opens it in the player with the passage selected and plays it once. */
  async function play(m: Moment, toggle = true): Promise<void> {
    const playback = usePlaybackStore();
    if (!useLibraryStore().track(m.trackId)) { useUiStore().notify('This song is no longer in your library.'); return; }
    playback.queue = [];
    await playback.openRange(m.startSec, m.endSec, m.trackId, toggle);
  }

  /** "Play N moments": the passages play back to back (the preview end of each starts the next). */
  async function playAll(list: Moment[]): Promise<void> {
    const playable = list.filter(m => useLibraryStore().track(m.trackId));
    if (!playable.length) { useUiStore().notify('Save a moment first.'); return; }
    await usePlaybackStore().playQueue(playable.map(m => ({ a: m.startSec, b: m.endSec, trackId: m.trackId })));
  }

  async function remove(id: string): Promise<void> {
    await deleteMoment(id);
    await load();
    await useIntelligenceStore().refresh();
  }

  return {
    ensure, moments, savedForCurrent, load, add, addForTrack, applyTags, edit, correctTrait, play, playAll, remove };
});
