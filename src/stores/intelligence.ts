import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import type { ListeningEvent, MomentRating, TrackAnalysis } from '../data/types';
import type { AttentionCandidate } from '../intelligence/personalize';
import { selectActiveLearningQuestions, type ActiveQuestionPrompt } from '../intelligence/personalize';
import { interestForTrack, noteRewind, unsavedCandidates, type InterestRange } from '../core/intelligence';
import { loadIntelligenceInputs } from '../core/repository';
import { useMomentsStore } from './moments';
import { usePlaybackStore } from './playback';
import { useListeningStore } from './listening';
import { useUiStore } from './ui';

/** Analyses, ratings, the event history and the attention hints computed from them. */
export const useIntelligenceStore = defineStore('intelligence', () => {
  const analyses = shallowRef<TrackAnalysis[]>([]);
  const ratings = shallowRef<MomentRating[]>([]);
  const events = shallowRef<ListeningEvent[]>([]);
  const candidates = shallowRef<AttentionCandidate[]>([]);
  /** Interest on the loaded track. Rewinds add to it straight away (noteRewind). */
  const interest = ref<InterestRange[]>([]);

  const analysisFor = (trackId: string | null) => analyses.value.find(a => a.trackId === trackId);
  const currentAnalysis = computed(() => analysisFor(usePlaybackStore().trackId));

  /** Reloads inputs and recomputes the attention hints. Batched by the listening log (DELAY FIX 3). */
  async function refresh(): Promise<void> {
    const inputs = await loadIntelligenceInputs();
    analyses.value = inputs.analyses;
    ratings.value = inputs.ratings;
    events.value = inputs.events;
    candidates.value = unsavedCandidates(inputs.events, useMomentsStore().moments);
    recomputeInterest();
  }

  function recomputeInterest(): void {
    const playback = usePlaybackStore();
    interest.value = interestForTrack(candidates.value, playback.trackId, playback.duration);
  }

  function rewoundTo(sec: number): void {
    const playback = usePlaybackStore();
    if (!useListeningStore().learning || !playback.trackId) return;
    noteRewind(interest.value, sec, playback.duration, playback.trackId);
  }

  /** The "What stood out?" question for a newly saved passage. */
  function questionFor(trackId: string, a: number, b: number): ActiveQuestionPrompt {
    return selectActiveLearningQuestions(analyses.value, useMomentsStore().moments, trackId, a, b, 5);
  }

  /** "Not this one": logged as a dismissal, without penalty. */
  async function dismissCandidate(trackId: string, startSec: number): Promise<void> {
    useListeningStore().emit('dismiss_candidate', 'user', { trackId, positionSec: startSec });
    await refresh();
    useUiStore().notify('Suggestion dismissed without penalty.');
  }

  /** "Save": the hinted passage becomes a saved moment. */
  async function confirmCandidate(trackId: string, startSec: number): Promise<void> {
    const c = candidates.value.find(x => x.trackId === trackId && x.startSec === startSec);
    if (!c) return;
    useMomentsStore().addForTrack(c.trackId, { a: c.startSec, b: c.endSec }, 'Confirmed favorite from listening attention');
    await refresh();
    useUiStore().notify('Confirmed as a favorite moment.', 'View in Moments', '/moments');
  }

  return {
    analyses, ratings, events, candidates, interest, currentAnalysis, analysisFor,
    refresh, recomputeInterest, rewoundTo, questionFor, dismissCandidate, confirmCandidate,
  };
});
