import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Range } from '../core/playback';
import { useMomentsStore } from './moments';
import { usePlaybackStore } from './playback';
import { useUiStore } from './ui';
import { useIntelligenceStore } from './intelligence';
import { getSetting, putSetting } from '../core/repository';

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
  /**
   * QUIET FIX - the "What stood out?" question used to open by itself after every save.
   * Now it waits here; a small "Add why" link under the waveform opens it.
   */
  const pendingAsk = ref<AskState | null>(null);
  /** Songs where "Not now" was pressed on the save nudge: it never comes back for them. */
  let nudgeOff: string[] = [];
  getSetting<string>('nudgeOff').then(v => { try { nudgeOff = JSON.parse(v || '[]'); } catch { /* keep empty */ } }).catch(() => { });

  /** 1 listen · 2 selected · 3 describing · 4 saved. */
  const step = computed(() => (describe.value || ask.value) ? 3 : usePlaybackStore().sel ? 2 : justSaved.value ? 4 : 1);

  function resetForTrack(): void {
    describe.value = null; ask.value = null; explore.value = false;
    justSaved.value = false; pendingAsk.value = null;
  }

  /**
   * Save (the loop bar's ♡): stores the selection once and asks one question about it.
   * KEEP LOOPING FIX - saving used to clear the selection and stop the loop you were
   * listening to. Now the passage stays selected and keeps looping.
   * With Explore open the question shows inside Explore (EXPLORE ASK FIX: it used to be
   * skipped there, so saving from Explore asked nothing once Describe was folded away).
   */
  function saveSelection(): void {
    const playback = usePlaybackStore();
    const r = playback.sel;
    if (!r) return;
    const { id, isNew } = useMomentsStore().ensure(r);
    if (!id) return;
    nudge.value = false; justSaved.value = true;
    useUiStore().notify(isNew ? 'Saved to My Moments' : 'Already in My Moments', 'View', '/moments');
    const aq = useIntelligenceStore().questionFor(playback.trackId || '', r.a, r.b);
    describe.value = null; ask.value = null;
    pendingAsk.value = { q: aq.question, chips: aq.chips, a: r.a, b: r.b, mid: id };
  }

  /** "Add why": opens the question saved by saveSelection. */
  function openAsk(): void {
    if (!pendingAsk.value) return;
    ask.value = pendingAsk.value; pendingAsk.value = null;
  }

  /** Heart in the playback bar: saves the last 20 s. */
  function quickSave(): void {
    const playback = usePlaybackStore();
    // On Moment radio ♡ saves the passage playing, not the last 20 s.
    if (playback.radio && playback.sel) { saveSelection(); return; }
    if (playback.selectLast20s()) saveSelection();
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

  /**
   * Done in the describe strip or in Explore (ONE SAVE PATH): merges feelings, qualities and
   * the note into the moment for that passage, saving it first if needed. Both places use the
   * same chips and this same function, so a moment means the same thing wherever it was made.
   */
  function finishDescribe(): void {
    const D = describe.value ?? usePlaybackStore().sel;
    if (!D) return;
    const moments = useMomentsStore();
    const id = describe.value?.mid || moments.ensure(D).id;
    if (!id) return;
    const q = moments.applyTags(id, feel.value, love.value, note.value);
    describe.value = null; explore.value = false; justSaved.value = true; feel.value = []; love.value = []; note.value = '';
    useUiStore().notify('Saved your moment' + (q.length ? ' · ' + q.join(', ') : ''), 'View', '/moments');
  }

  /**
   * Loop cycle hook: offer to save, at most once per song load.
   * QUIET FIX - it used to ask after 2 loops of anything. Now it asks only when this passage
   * is one you already came back to before (an attention hint from earlier listening), never
   * while practising, never for a saved passage, and never again on a song where you said
   * "Not now".
   * Example: first time you loop the chorus → nothing. Next day, loop it twice again → one line.
   */
  function onLoopCycle(loops: number): void {
    const playback = usePlaybackStore(), sel = playback.sel;
    if (loops < 2 || nudged.value || describe.value || playback.practicing || !sel || !playback.trackId) return;
    if (nudgeOff.includes(playback.trackId)) return;
    const overlaps = (r: Range) => Math.max(r.a, sel.a) < Math.min(r.b, sel.b);
    if (useMomentsStore().savedForCurrent.some(overlaps)) return;
    if (!useIntelligenceStore().interest.some(r => r.n >= 2 && overlaps(r))) return;
    nudge.value = true; nudged.value = true;
  }

  function dismissNudge(): void {
    nudge.value = false; nudged.value = true;
    const id = usePlaybackStore().trackId;
    if (id && !nudgeOff.includes(id)) { nudgeOff = [...nudgeOff, id]; putSetting('nudgeOff', JSON.stringify(nudgeOff)).catch(() => { }); }
  }

  /** Explore: about the selected passage, or the whole song when nothing is selected. */
  function toggleExplore(): void {
    explore.value = !explore.value;
    describe.value = null; ask.value = null; nudge.value = false;
    if (explore.value) { feel.value = []; love.value = []; note.value = ''; }
  }

  function closeExplore(): void {
    explore.value = false;
    usePlaybackStore().restoreFullMix();
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
    pendingAsk, openAsk,
    ask, describe, feel, love, note, nudge, nudged, justSaved, explore, step,
    resetForTrack, saveSelection, quickSave, answer, skipAsk, more, toggleFeel, toggleLove, closeDescribe,
    finishDescribe, onLoopCycle, dismissNudge, toggleExplore, closeExplore, removeMoment,
  };
});
