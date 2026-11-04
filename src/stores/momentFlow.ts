import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Range } from '../core/playback';
import { useMomentsStore } from './moments';
import { usePlaybackStore } from './playback';
import { useUiStore } from './ui';
import { useIntelligenceStore } from './intelligence';

/** The moment that the ask row / describe strip is about. `mid` = saved moment id. */
export interface FlowTarget extends Range { mid?: string | null }
export interface AskState extends FlowTarget { q: string; chips: string[] }

/**
 * The capture flow under the waveform (design-system "moment flow"):
 * select → Save → ask row ("What stood out?") → More… → describe strip → saved.
 * Also the replay nudge and the Explore (stems) panel. Kept apart from playback so the
 * playback store holds only playback state.
 */
export const useMomentFlowStore = defineStore('momentFlow', () => {
  const ask = ref<AskState | null>(null);
  const describe = ref<FlowTarget | null>(null);
  const feel = ref<string[]>([]);
  const love = ref<string[]>([]);
  const note = ref('');
  /** "Enjoying this moment?" after repeated loop cycles; shown at most once per track load. */
  const nudge = ref(false);
  const nudged = ref(false);
  const justSaved = ref(false);
  const explore = ref(false);
  const stemReasons = ref<string[]>([]);

  /** 1 listen · 2 selected · 3 describing · 4 saved. */
  const step = computed(() => (describe.value || ask.value) ? 3 : usePlaybackStore().sel ? 2 : justSaved.value ? 4 : 1);

  function resetForTrack(): void {
    describe.value = null; ask.value = null; explore.value = false; stemReasons.value = [];
    justSaved.value = false;
  }

  /** Save: stores the selection and asks one question about it. */
  function saveSelection(): void {
    const playback = usePlaybackStore();
    const r = playback.sel;
    if (!r) return;
    const id = useMomentsStore().add(r);
    if (!id) return;
    const aq = useIntelligenceStore().questionFor(playback.trackId || '', r.a, r.b);
    playback.sel = null; playback.loop = false; playback.loops = 0;
    describe.value = null; nudge.value = false; justSaved.value = true;
    ask.value = { q: aq.question, chips: aq.chips, a: r.a, b: r.b, mid: id };
    useUiStore().notify('Saved to My Moments', 'View', '/moments');
  }

  /** Heart in the playback bar: saves the last 20 s. */
  function quickSave(): void {
    if (usePlaybackStore().selectLast20s()) saveSelection();
  }

  /** One-tap answer in the ask row. */
  function answer(chip: string): void {
    const A = ask.value;
    ask.value = null;
    if (!A) return;
    const moments = useMomentsStore();
    const mid = A.mid || moments.add(A);
    if (!mid) return;
    const q = moments.applyTags(mid, [], [chip], '');
    useUiStore().notify('Thanks. Added to ' + q.join(', ') + '.', 'See Music DNA', '/dna');
  }

  function skipAsk(): void { ask.value = null; }

  /** More…: replaces the ask row with the describe strip for the same moment. */
  function more(): void {
    const M = ask.value;
    if (!M) return;
    ask.value = null;
    describe.value = { a: M.a, b: M.b, mid: M.mid };
    feel.value = []; love.value = []; note.value = '';
  }

  function toggle(list: string[], v: string): string[] {
    return list.includes(v) ? list.filter(x => x !== v) : [...list, v];
  }
  const toggleFeel = (v: string) => { feel.value = toggle(feel.value, v); };
  const toggleLove = (v: string) => { love.value = toggle(love.value, v); };

  function closeDescribe(): void { describe.value = null; }

  /** Done in the describe strip: merges feelings, qualities and the note into the moment. */
  function finishDescribe(): void {
    const D = describe.value;
    if (!D) return;
    const moments = useMomentsStore();
    const id = D.mid || moments.add(D);
    if (!id) return;
    const q = moments.applyTags(id, feel.value, love.value, note.value);
    describe.value = null; justSaved.value = true; feel.value = []; love.value = []; note.value = '';
    useUiStore().notify('Saved your moment' + (q.length ? ' · ' + q.join(', ') : ''), 'View', '/moments');
  }

  /** Loop cycle hook: after two cycles, offer to save (once). */
  function onLoopCycle(loops: number): void {
    if (loops >= 2 && !nudged.value && !describe.value) {
      nudge.value = true; nudged.value = true;
    }
  }

  function dismissNudge(): void { nudge.value = false; nudged.value = true; }

  function toggleExplore(): void {
    if (!usePlaybackStore().sel) return;
    explore.value = !explore.value;
    describe.value = null; nudge.value = false;
  }

  function closeExplore(): void {
    explore.value = false;
    usePlaybackStore().restoreFullMix();
  }

  const toggleStemReason = (v: string) => { stemReasons.value = toggle(stemReasons.value, v); };

  /** Save from the Explore panel, tagging the chosen musical reasons. */
  function saveExplore(): void {
    const playback = usePlaybackStore();
    const r = playback.sel;
    if (!r) return;
    const moments = useMomentsStore();
    const mid = moments.add(r);
    if (mid && stemReasons.value.length) moments.applyTags(mid, [], stemReasons.value, 'Musical structure & instrument exploration');
    explore.value = false; justSaved.value = true;
    useUiStore().notify('Saved moment with musical layers: ' + (stemReasons.value.join(', ') || 'Explored moment'));
  }

  /** Remove a saved moment from the player. */
  async function removeMoment(id: string): Promise<void> {
    await useMomentsStore().remove(id);
    const playback = usePlaybackStore();
    playback.sel = null; playback.previewEnd = null; playback.loop = false;
    describe.value = null; ask.value = null;
    useUiStore().notify('Removed saved moment.');
  }

  return {
    ask, describe, feel, love, note, nudge, nudged, justSaved, explore, stemReasons, step,
    resetForTrack, saveSelection, quickSave, answer, skipAsk, more, toggleFeel, toggleLove, closeDescribe,
    finishDescribe, onLoopCycle, dismissNudge, toggleExplore, closeExplore, toggleStemReason, saveExplore, removeMoment,
  };
});
