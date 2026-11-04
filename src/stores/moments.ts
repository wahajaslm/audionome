import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';
import type { Moment, PassageAnalysis } from '../data/types';
import type { PlayableTrack } from '../core/library';
import { analyzePassage } from '../intelligence/client';
import { deleteMoment, loadMoments, loadPassages, putMoment, putPassage } from '../core/repository';
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
  /** Exact passage analyses by moment id (see analyzeExactly). */
  const passages = shallowRef<Record<string, PassageAnalysis>>({});
  const pending = new Set<string>();

  /** Saved ranges of the track that is loaded in the player. */
  const savedForCurrent = computed(() => savedRanges(moments.value, usePlaybackStore().trackId));

  async function load(): Promise<void> {
    moments.value = await loadMoments();
    passages.value = Object.fromEntries((await loadPassages()).map(p => [p.id, p]));
  }

  /** The saved moment of the loaded track with this range (within 0.5 s), if any. */
  function savedMatch(r: Range): Moment | undefined {
    const trackId = usePlaybackStore().trackId;
    return moments.value.find(m => m.trackId === trackId && Math.abs(m.startSec - r.a) < 0.5 && Math.abs(m.endSec - r.b) < 0.5);
  }

  /**
   * PASSAGE FIX - analyses a saved moment's exact range on the service, in the background, and
   * keeps the result on this device. Runs when a moment is saved, and when Explore opens on a
   * saved moment that has none yet. Fails quietly (the estimate from song windows stays).
   */
  async function analyzeExactly(id: string): Promise<void> {
    const m = moments.value.find(x => x.id === id);
    if (!m || passages.value[id] || pending.has(id)) return;
    pending.add(id);
    try {
      const t = useLibraryStore().track(m.trackId) as PlayableTrack | undefined;
      const r = await analyzePassage(m.trackId, m.startSec, m.endSec, t?.originalUrl || '');
      const p: PassageAnalysis = {
        id, trackId: m.trackId, a: m.startSec, b: m.endSec, analyzedAt: Date.now(),
        modelId: r.modelId, segments: r.segments, musicalDimensions: r.musicalDimensions,
      };
      await putPassage(p);
      passages.value = { ...passages.value, [id]: p };
    } catch (err) {
      console.info('Exact passage analysis skipped:', (err as Error).message);
    } finally {
      pending.delete(id);
    }
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
    if (same) return { id: same.id, isNew: false };
    const id = add(r);
    if (id) analyzeExactly(id);
    return { id, isNew: true };
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
    const { [id]: _gone, ...rest } = passages.value;
    passages.value = rest;
    await load();
    await useIntelligenceStore().refresh();
  }

  return {
    ensure, passages, savedMatch, analyzeExactly, moments, savedForCurrent, load, add, addForTrack, applyTags, edit, correctTrait, play, playAll, remove };
});
