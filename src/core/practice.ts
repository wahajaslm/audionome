/**
 * Practice vs listening: which listening events are practice, so they do not count as taste.
 *
 * PRACTICE FIX - every loop cycle and rewind used to count as "I love this part". Practising
 * a hard passage 30 times then made it the top "moment you return to", and the taste model
 * learned from drill, not from taste.
 * Example: loop 1:10–1:18 at 0.75× twenty times → before: top attention hint; now: listed
 * under Practising, and Discover and My Music DNA do not change.
 *
 * Two rules, no questions asked:
 *   - speed below 1×: practice (events are tagged `mode: 'practice'` when logged);
 *   - one loop left running for PRACTICE_MIN_CYCLES cycles or more: the whole loop episode is
 *     practice, including its first cycles (they were logged before the count was reached).
 */
import type { ListeningEvent } from '../data/types';

/** A favourite chorus is looped a few times; drill runs longer. */
export const PRACTICE_MIN_CYCLES = 6;

/** Live check while playing (tags events as they are logged). */
export function practicingNow(s: { rate: number; loop: boolean; loops: number }): boolean {
  return s.rate < 1 || (s.loop && s.loops >= PRACTICE_MIN_CYCLES);
}

/** One loop, from switching it on to switching it off (or another loop, or a song change). */
export interface LoopEpisode {
  trackId: string;
  sessionId: string;
  a: number;
  b: number;
  cycles: number;
  /** Slowest speed heard during the loop (1 = normal). */
  slowestRate: number;
  at: number;
  practice: boolean;
  events: ListeningEvent[];
}

const near = (x: number | undefined, y: number) => x !== undefined && Math.abs(x - y) < 0.5;

/**
 * Splits the history into listening and practice, and returns the loop episodes.
 * Events outside loops are practice only when tagged so (slowed playback).
 * A 'dismiss_candidate' is the listener's answer, never practice.
 */
export function splitPractice(events: ListeningEvent[]): { listening: ListeningEvent[]; practice: ListeningEvent[]; episodes: LoopEpisode[] } {
  const open = new Map<string, LoopEpisode>();
  const episodes: LoopEpisode[] = [];
  const inEpisode = new Set<ListeningEvent>();
  const close = (key: string) => { const ep = open.get(key); if (ep) { episodes.push(ep); open.delete(key); } };

  for (const e of [...events].sort((x, y) => x.at - y.at)) {
    const key = e.sessionId + '|' + e.trackId;
    const ep = open.get(key);
    const add = (target: LoopEpisode) => {
      target.events.push(e); inEpisode.add(e);
      if (e.rate !== undefined) target.slowestRate = Math.min(target.slowestRate, e.rate);
    };
    if (e.kind === 'loop_enabled' && e.origin === 'user' && e.momentStartSec !== undefined && e.momentEndSec !== undefined) {
      close(key);
      const next: LoopEpisode = { trackId: e.trackId, sessionId: e.sessionId, a: e.momentStartSec, b: e.momentEndSec,
        cycles: 0, slowestRate: 1, at: e.at, practice: false, events: [] };
      open.set(key, next);
      add(next);
    } else if (!ep) {
      continue;
    } else if (e.kind === 'loop_cycle' && near(e.momentStartSec, ep.a)) {
      ep.cycles++; ep.at = e.at; add(ep);
    } else if (e.kind === 'listen_span' && e.fromSec !== undefined && e.toSec !== undefined
      && e.fromSec >= ep.a - 0.5 && e.toSec <= ep.b + 0.5) {
      add(ep);
    } else if (e.kind === 'loop_disabled' || e.kind === 'track_change') {
      if (e.kind === 'loop_disabled') add(ep);
      close(key);
    }
  }
  for (const key of [...open.keys()]) close(key);

  for (const ep of episodes) {
    ep.practice = ep.cycles >= PRACTICE_MIN_CYCLES || ep.events.some(e => e.mode === 'practice');
  }
  const practiceSet = new Set(episodes.filter(ep => ep.practice).flatMap(ep => ep.events));
  const listening: ListeningEvent[] = [], practice: ListeningEvent[] = [];
  for (const e of events) {
    const isPractice = e.kind !== 'dismiss_candidate' && (practiceSet.has(e) || (!inEpisode.has(e) && e.mode === 'practice'));
    (isPractice ? practice : listening).push(e);
  }
  return { listening, practice, episodes };
}

/** A passage under Practising in My Moments. */
export interface PracticePassage {
  trackId: string;
  a: number;
  b: number;
  /** Loop cycles over every practice session. */
  cycles: number;
  sessions: number;
  slowestRate: number;
  /** Last time it was practised (ms). */
  lastAt: number;
}

/**
 * Practice loops grouped by passage, most recent first. Loops within 0.5 s of each other at
 * both ends are the same passage.
 * Example: 1:10–1:18 practised on Monday (8 cycles) and today (12 cycles, 0.75×)
 * → { cycles: 20, sessions: 2, slowestRate: 0.75 }.
 */
export function practicePassages(events: ListeningEvent[]): PracticePassage[] {
  const out: (PracticePassage & { sessionIds: Set<string> })[] = [];
  for (const ep of splitPractice(events).episodes) {
    if (!ep.practice) continue;
    let p = out.find(x => x.trackId === ep.trackId && near(x.a, ep.a) && near(x.b, ep.b));
    if (!p) { p = { trackId: ep.trackId, a: ep.a, b: ep.b, cycles: 0, sessions: 0, slowestRate: 1, lastAt: 0, sessionIds: new Set() }; out.push(p); }
    p.cycles += ep.cycles;
    p.sessionIds.add(ep.sessionId);
    p.sessions = p.sessionIds.size;
    p.slowestRate = Math.min(p.slowestRate, ep.slowestRate);
    p.lastAt = Math.max(p.lastAt, ep.at);
  }
  return out.sort((x, y) => y.lastAt - x.lastAt).map(({ sessionIds: _, ...p }) => p);
}
