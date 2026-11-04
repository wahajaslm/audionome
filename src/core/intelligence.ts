/**
 * Attention hints for the player and the local analysis job.
 */
import type { ListeningEvent, Moment, Track, TrackAnalysis } from '../data/types';
import { attentionCandidates, type AttentionCandidate } from '../intelligence/personalize';
import { analyzeLocalTrack, intelligenceHealth, saveAnalysisToSQLite } from '../intelligence/client';

/** A passage the listener keeps returning to, on the current track. `n` = returns + loop starts. */
export interface InterestRange { a: number; b: number; n: number; confidence: string; reasons: string[]; trackId: string }

/** Attention candidates (≥2 signals) that are not already saved as moments. */
export function unsavedCandidates(events: ListeningEvent[], moments: Moment[]): AttentionCandidate[] {
  return attentionCandidates(events, 2).filter(c =>
    !moments.some(m => m.trackId === c.trackId && Math.max(m.startSec, c.startSec) < Math.min(m.endSec, c.endSec)));
}

export function interestForTrack(candidates: AttentionCandidate[], trackId: string | null, durationSec: number): InterestRange[] {
  return candidates.filter(x => x.trackId === trackId).map(x => ({
    a: x.startSec, b: Math.min(durationSec, x.endSec), n: x.backwardSeeks + x.loopStarts,
    confidence: x.confidence || 'possible interest', reasons: x.reason || [], trackId: x.trackId,
  }));
}

/**
 * A backward click counts as a return to that spot straight away, before the next batched
 * refresh recomputes candidates (index.html's noteRewind).
 * Example: clicking back to 1:05 twice marks 1:05–1:20 as "you often come back to this part".
 */
export function noteRewind(interest: InterestRange[], to: number, durationSec: number, trackId: string): void {
  const r = interest.find(x => Math.abs(x.a - to) < 10);
  if (r) r.n++; else interest.push({ a: to, b: Math.min(durationSec, to + 15), n: 1, confidence: 'possible interest', reasons: [], trackId });
}

export const ANALYSIS_STEPS = [
  'Step 1/3 · Extracting librosa DSP & 512-D CLAP embeddings…',
  'Step 2/3 · Saving multimodal vectors to SQLite & IndexedDB…',
  'Step 3/3 · Computing active-learning & preference rankings…',
];

/** Runs the local Python analysis for one track and stores the result(s). */
export async function runLocalAnalysis(t: Track, onStep: (step: string) => void,
  store: (a: TrackAnalysis) => Promise<unknown>): Promise<void> {
  onStep(ANALYSIS_STEPS[0]);
  const health = await intelligenceHealth();
  const method = (health.models && health.models.includes('multimodal')) ? 'both' : 'dsp';
  const result = await analyzeLocalTrack({ ...t, analysisRight: 'cleared' }, method);
  onStep(ANALYSIS_STEPS[1]);
  for (const item of Array.isArray(result) ? result : [result]) {
    await store(item);
    await saveAnalysisToSQLite(t.id, item, t.title, t.artist);
  }
  onStep(ANALYSIS_STEPS[2]);
}
