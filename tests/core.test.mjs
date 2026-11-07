import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeAudioEngine } from '../src/core/audioEngine.ts';
import { ListeningLog, readMediaTime } from '../src/core/listening.ts';
import {
  RegionController, enforceMinimumSelection, rangeAround, defaultLoopRange, previewStart, seekTarget, quickSaveRange,
  beatGrid, beatLength, snapTime, snapRange,
} from '../src/core/playback.ts';
import { measureLoudness, normalizationGainDb, MAX_BOOST_DB } from '../src/core/audioGraph.ts';
import { toDbMoment, withTags, collectionsOf, newMoment, savedRanges } from '../src/core/moments.ts';
import { barAt, beatInBar, blockIndexAt, chordChart, chordSheet, noteName, passageEvidence, passageMoments, rankIn } from '../src/core/timeline.ts';
import { extractEmbeddedPicture, parseKey, artRecipe, artFromAnalysis } from '../src/core/artwork.ts';
import { bandForHz, computeSpectrum, computeView, fft, hzToMel, melFilters, melToHz, SPEC_HOP, SPEC_SR } from '../src/core/spectrum.ts';

/** Minimal HTMLMediaElement stand-in: an EventTarget with the fields the engine reads. */
class FakeMedia extends EventTarget {
  paused = true; ended = false; seeking = false; currentTime = 0; duration = NaN; readyState = 0;
  src = ''; error = null; volume = 1; preload = ''; loads = 0; playResult = null;
  load() { this.loads++; }
  play() { if (this.playResult) return Promise.reject(this.playResult); this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  metadata(duration) { this.duration = duration; this.readyState = 1; this.dispatchEvent(new Event('loadedmetadata')); }
}

/** Timers you advance by hand, so batching can be tested without waiting. */
function manualTimers() {
  let queue = [];
  return {
    setTimeout(fn, ms) { const h = { fn, ms }; queue.push(h); return h; },
    clearTimeout(h) { queue = queue.filter(x => x !== h); },
    flush() { const q = queue; queue = []; q.forEach(h => h.fn()); },
    get pending() { return queue.length; },
  };
}
const tick = () => new Promise(r => setImmediate(r));

test('engine: load() resolves only after metadata and applies the start offset first (SYNC FIX 2)', async () => {
  const el = new FakeMedia();
  const durations = [];
  const engine = new NativeAudioEngine({ onDuration: d => durations.push(d) }, el);
  let resolved = false;
  const p = engine.load('a.mp3', 80).then(() => { resolved = true; });
  await tick();
  assert.equal(resolved, false, 'must wait for metadata');
  assert.equal(engine.hasPendingSeek(), true);
  el.metadata(466.02);
  await p;
  assert.equal(el.currentTime, 80, 'start offset applied before load() resolves');
  assert.equal(engine.getDuration(), 466.02);
  assert.deepEqual(durations, [466.02]);
  assert.equal(engine.hasPendingSeek(), false);
});

test('engine: setTime before metadata is remembered; after metadata it is applied directly', () => {
  const el = new FakeMedia();
  const engine = new NativeAudioEngine({}, el);
  engine.setTime(12);
  assert.equal(engine.hasPendingSeek(), true);
  assert.equal(el.currentTime, 0);
  el.metadata(30);
  assert.equal(el.currentTime, 12);
  engine.setTime(-3);
  assert.equal(el.currentTime, 0, 'clamped at 0');
});

test('engine: "playing" and "waiting" are reported separately from "play" (SYNC FIX 1)', () => {
  const el = new FakeMedia();
  const engine = new NativeAudioEngine({}, el);
  const seen = [];
  for (const ev of ['play', 'playing', 'waiting', 'pause', 'finish']) engine.on(ev, () => seen.push(ev));
  el.dispatchEvent(new Event('play'));
  el.dispatchEvent(new Event('waiting'));
  el.dispatchEvent(new Event('playing'));
  el.dispatchEvent(new Event('ended'));
  assert.deepEqual(seen, ['play', 'waiting', 'playing', 'finish']);
});

test('engine: a failing source switches once to the fallback URL and resumes there', async () => {
  const el = new FakeMedia();
  const engine = new NativeAudioEngine({ resumePosition: () => 42, wantsPlayback: () => false }, el);
  engine.load('blob:x', 0, 'http://svc/audio/1');
  el.metadata(100); // first source got metadata (pendingTime cleared)
  el.error = { code: 4 };
  const warn = console.warn; console.warn = () => { };
  el.dispatchEvent(new Event('error'));
  console.warn = warn;
  assert.equal(el.src, 'http://svc/audio/1');
  assert.equal(engine.hasPendingSeek(), true, 'resume position waits for the fallback metadata');
  el.error = null;
  el.metadata(100);
  assert.equal(el.currentTime, 42);
});

test('engine: AbortError from play() is ignored', async () => {
  const el = new FakeMedia();
  const engine = new NativeAudioEngine({}, el);
  el.playResult = Object.assign(new Error('aborted'), { name: 'AbortError' });
  await engine.play();
});

/** A fake graph that records what each deck's gains were told. */
function fakeGraph(calls) {
  let n = 0;
  return {
    resume: () => calls.push('resume'), close: () => calls.push('close'), setVolume: v => calls.push(['vol', v]), setEffects: () => { }, setPlaying: () => { },
    addDeck: () => { const d = n++; return {
      setNormalization: (db, ramp) => calls.push(['norm', d, db, ramp]), duck: () => calls.push(['duck', d]),
      unduck: () => calls.push(['unduck', d]), fade: (to, sec) => calls.push(['fade', d, to, sec]),
    }; },
  };
}

test('engine: with a graph, volume and loudness go to the graph and the element stays at 1 (WEB AUDIO FIX)', async () => {
  const el = new FakeMedia();
  const calls = [];
  const engine = new NativeAudioEngine({ createGraph: () => fakeGraph(calls) }, el);
  engine.setVolume(0.5);
  engine.setNormalization(-6);
  assert.ok(Math.abs(el.volume - 0.5 * 10 ** (-6 / 20)) < 1e-9, 'before the first play there is no graph: both fold into el.volume');
  await engine.play();
  assert.equal(el.volume, 1, 'graph built on play; the element plays at full level');
  assert.deepEqual(calls.slice(0, 4), [['vol', 0.5], ['norm', 0, -6, 0], 'resume', ['unduck', 0]]);
  engine.setNormalization(-2, 2);
  assert.deepEqual(calls.at(-1), ['norm', 0, -2, 2]);
  assert.equal(engine.canCrossfade(), false, 'one deck: no crossfade');
});

test('engine: crossfade starts the idle deck, swaps, fades both and stops the old one (CROSSFADE FIX)', async () => {
  const a = new FakeMedia(), b = new FakeMedia(), calls = [];
  const engine = new NativeAudioEngine({ createGraph: () => fakeGraph(calls) }, [a, b]);
  const seen = [];
  for (const ev of ['play', 'playing', 'pause', 'swap']) engine.on(ev, () => seen.push(ev));
  a.src = 'song1'; a.metadata(100); await engine.play();
  seen.length = 0;
  assert.equal(engine.canCrossfade(), true);
  const p = engine.crossfade('song2', 40, null, 0.05, -3);
  await tick();
  b.metadata(200);
  assert.equal(await p, true);
  assert.equal(engine.el, b, 'the new deck is the playing one');
  assert.equal(b.currentTime, 40);
  assert.equal(engine.getDuration(), 200);
  assert.ok(calls.some(c => c[0] === 'fade' && c[1] === 1 && c[2] === 1), 'new deck fades in');
  assert.ok(calls.some(c => c[0] === 'fade' && c[1] === 0 && c[2] === 0), 'old deck fades out');
  assert.ok(calls.some(c => c[0] === 'norm' && c[1] === 1 && c[2] === -3), "new song's loudness on its own deck");
  assert.equal(a.paused, false, 'old deck still sounds during the fade');
  await new Promise(r => setTimeout(r, 150));
  assert.equal(a.paused, true, 'old deck stopped after the fade');
  assert.deepEqual(seen, ['swap', 'play', 'playing'], "the old deck's pause is not reported");
});

test('engine: crossfade reports false when paused or when the new source fails', async () => {
  const a = new FakeMedia(), b = new FakeMedia();
  const engine = new NativeAudioEngine({ createGraph: () => fakeGraph([]) }, [a, b]);
  assert.equal(await engine.crossfade('x', 0, null, 1, 0), false, 'paused: nothing to fade from');
  a.src = 'song1'; a.metadata(100); await engine.play();
  const p = engine.crossfade('broken', 0, null, 1, 0);
  await tick();
  b.dispatchEvent(new Event('error'));
  assert.equal(await p, false);
  assert.equal(engine.el, a, 'still on the old deck');
});

test('engine: without a graph a loudness lift cannot raise el.volume above the slider', () => {
  const el = new FakeMedia();
  const engine = new NativeAudioEngine({}, el);
  engine.setVolume(0.8);
  engine.setNormalization(+6);
  assert.equal(el.volume, 0.8);
});

test('engine: speed keeps the pitch and survives a new source (defaultPlaybackRate)', () => {
  const el = new FakeMedia();
  const engine = new NativeAudioEngine({}, el);
  engine.setRate(0.75);
  assert.equal(el.playbackRate, 0.75);
  assert.equal(el.defaultPlaybackRate, 0.75);
  assert.equal(el.preservesPitch, true);
  engine.setRate(9);
  assert.equal(engine.getRate(), 2, 'clamped');
});

test('loudness: a full-scale 1 kHz sine reads about -3 LUFS; silence is -Infinity', () => {
  const sr = 22050, n = sr * 5;
  const sine = new Float32Array(n).map((_, i) => Math.sin(2 * Math.PI * 1000 * i / sr));
  const l = measureLoudness(sine, sr);
  assert.ok(Math.abs(l.lufs - -3.01) < 0.2, 'got ' + l.lufs);
  assert.ok(Math.abs(l.peakDb) < 0.01);
  const half = measureLoudness(sine.map(v => v * 0.5), sr);
  assert.ok(Math.abs((l.lufs - half.lufs) - 6.02) < 0.05, 'half amplitude is 6 dB quieter');
  assert.equal(measureLoudness(new Float32Array(n), sr).lufs, -Infinity);
});

test('loudness: quiet passages are gated out, so a song with a silent intro is not over-lifted', () => {
  const sr = 22050;
  const tone = Array.from({ length: sr * 4 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 1000 * i / sr));
  const withIntro = new Float32Array([...new Array(sr * 8).fill(0), ...tone]);
  const only = measureLoudness(new Float32Array(tone), sr).lufs;
  assert.ok(Math.abs(measureLoudness(withIntro, sr).lufs - only) < 0.3);
});

test('normalization gain: cuts loud masters, caps lifts by MAX_BOOST_DB and the peak ceiling', () => {
  assert.equal(normalizationGainDb({ lufs: -9, peakDb: 0 }), -8);
  assert.equal(normalizationGainDb({ lufs: -40, peakDb: -20 }), MAX_BOOST_DB);
  assert.equal(normalizationGainDb({ lufs: -22, peakDb: -3 }), 2, 'peak -3 dBFS leaves 2 dB to the -1 ceiling');
  assert.equal(normalizationGainDb({ lufs: -Infinity, peakDb: -Infinity }), 0, 'silence: no gain');
  assert.equal(normalizationGainDb(undefined), 0, 'not measured yet: no gain');
});

// 120 bpm: a beat every 0.5 s, a bar (downbeat) every 2 s, a part starting at 9.0 s.
const grid120 = beatGrid({
  beats: Array.from({ length: 80 }, (_, i) => i * 0.5),
  downbeats: Array.from({ length: 20 }, (_, i) => i * 2),
  sections: [{ a: 0 }, { a: 9 }],
});

test('beat snap: edges go to the downbeat when close, else to the nearest beat (BEAT SNAP FIX)', () => {
  assert.equal(beatLength(grid120.beats), 0.5);
  assert.equal(snapTime(10.3, grid120), 10, 'within 3/4 beat of a downbeat');
  assert.equal(snapTime(11.2, grid120), 11, 'nearest beat');
  assert.equal(snapTime(9.2, grid120), 9, 'part start counts as strong');
  assert.deepEqual(snapRange({ a: 10.3, b: 17.8 }, grid120, 40), { a: 10, b: 18 }, 'a clean 4-bar loop');
});

test('beat snap: no beats or a range that would collapse is left unchanged', () => {
  assert.deepEqual(snapRange({ a: 10.3, b: 17.8 }, null, 40), { a: 10.3, b: 17.8 });
  assert.equal(beatGrid({ beats: [1, 2] }), null, 'too few beats');
  assert.deepEqual(snapRange({ a: 10.1, b: 10.3 }, grid120, 40), { a: 10.1, b: 10.3 }, 'both edges would land on 10.0');
});

test('beat snap: Shift+arrow (1 s) still moves an edge that sits on a downbeat', () => {
  assert.deepEqual(snapRange({ a: 10, b: 17 }, grid120, 40), { a: 10, b: 17 }, 'one beat short of the downbeat stays');
});

test('readMediaTime uses the element clock unless a seek is pending (SYNC FIX 7)', () => {
  const engine = { hasSource: () => true, hasPendingSeek: () => false, getCurrentTime: () => 42.731 };
  assert.equal(readMediaTime(engine, 42.715), 42.731);
  assert.equal(readMediaTime({ ...engine, hasPendingSeek: () => true }, 10), 10);
  assert.equal(readMediaTime(null, 7), 7);
});

function makeLog({ learning = true, trackId = 't1' } = {}) {
  const rows = [];
  const timers = manualTimers();
  let now = 0, refreshes = 0;
  const log = new ListeningLog({
    sink: { add: async e => { rows.push(e); } },
    context: () => ({ trackId, learning }),
    mediaTime: () => now,
    refresh: () => { refreshes++; },
    timers, sessionId: 'S', uid: () => 'id' + rows.length, now: () => 1000,
  });
  return { log, rows, timers, setNow: v => { now = v; }, refreshes: () => refreshes };
}

test('listening: events logged while practising carry mode and speed (PRACTICE FIX)', () => {
  const rows = [];
  const log = new ListeningLog({
    sink: { add: async e => { rows.push(e); } },
    context: () => ({ trackId: 't1', learning: true, practice: true, rate: 0.75 }),
    mediaTime: () => 0, refresh: () => { }, timers: manualTimers(), sessionId: 'S', uid: () => 'id', now: () => 1,
  });
  const e = log.emit('seek', 'user', { fromSec: 10, toSec: 5 });
  assert.equal(e.mode, 'practice');
  assert.equal(e.rate, 0.75);
});

test('listening: events are stamped with the media clock; nothing is logged with learning off', async () => {
  const a = makeLog();
  a.setNow(42.731);
  a.log.emit('pause');
  await tick();
  assert.equal(a.rows[0].positionSec, 42.731);
  assert.equal(a.rows[0].sessionId, 'S');
  const b = makeLog({ learning: false });
  assert.equal(b.log.emit('play'), null);
  await tick();
  assert.equal(b.rows.length, 0);
});

test('listening: a span runs from the audible start to the pause position', async () => {
  const { log, rows, setNow } = makeLog();
  setNow(10.2); log.openSpan();
  setNow(25.7); log.flushSpan('pause');
  await tick();
  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0], id: undefined }, {
    id: undefined, trackId: 't1', sessionId: 'S', kind: 'listen_span', origin: 'player', at: 1000,
    positionSec: 25.7, fromSec: 10.2, toSec: 25.7, durationSec: 15.5, endedBy: 'pause',
  });
  assert.equal(log.spanStart, null);
  setNow(30); log.openSpan(); setNow(30.5); log.flushSpan('pause');
  await tick();
  assert.equal(rows.length, 1, 'spans under 1 s are dropped');
});

test('listening: refreshes are batched (DELAY FIX 3)', async () => {
  const { log, timers, refreshes } = makeLog();
  log.emit('play'); log.emit('seek'); log.emit('seek'); log.emit('loop_enabled');
  await tick();
  assert.equal(timers.pending, 1, 'one pending refresh for four events');
  timers.flush();
  assert.equal(refreshes(), 1);
});

function makeRegion(state, extra = {}) {
  const calls = [];
  const engine = {
    seeking: false,
    isSeeking() { return this.seeking; },
    pause() { calls.push(['pause']); },
    setTime(s) { calls.push(['setTime', s]); },
  };
  const log = {
    flushSpan: e => calls.push(['flush', e]),
    emit: (k, o, x) => calls.push(['emit', k, o, x]),
    openSpan: s => calls.push(['open', s]),
  };
  return { ctl: new RegionController(state, { engine, log, ...extra }), calls, engine };
}

test('loop: jumps back within 20 ms of the end, logs the cycle at the end and restarts the span', () => {
  const state = { t: 0, sel: { a: 10, b: 22 }, loop: true, loops: 0, previewEnd: 22 };
  let cycles = 0;
  const { ctl, calls } = makeRegion(state, { onLoopCycle: n => { cycles = n; } });
  assert.equal(ctl.check(21.97), 'none');
  assert.equal(ctl.check(21.985), 'loop-restart');
  assert.deepEqual(calls, [
    ['flush', 'loop_cycle'],
    ['emit', 'loop_cycle', 'player', { momentStartSec: 10, momentEndSec: 22, positionSec: 22 }],
    ['setTime', 10],
    ['open', 10],
  ]);
  assert.equal(state.t, 10);
  assert.equal(state.loops, 1);
  assert.equal(cycles, 1);
});

test('loop: checks are skipped only while the browser is seeking (SYNC FIX 6) or a track loads', () => {
  const state = { t: 0, sel: { a: 10, b: 13 }, loop: true, loops: 0, previewEnd: null };
  let loading = true;
  const { ctl, engine } = makeRegion(state, { isLoading: () => loading });
  assert.equal(ctl.check(13), 'none');
  loading = false; engine.seeking = true;
  assert.equal(ctl.check(13), 'none');
  engine.seeking = false;
  assert.equal(ctl.check(13), 'loop-restart', 'checked again as soon as the seek has landed');
});

test('preview: pauses at the end and returns to the selection start; a queue can take over', () => {
  const state = { t: 0, sel: { a: 5, b: 9 }, loop: false, loops: 0, previewEnd: 9 };
  const { ctl, calls } = makeRegion(state);
  assert.equal(ctl.check(8.9), 'none');
  assert.equal(ctl.check(9.01), 'preview-end');
  assert.deepEqual(calls, [['pause'], ['setTime', 5]]);
  assert.equal(state.previewEnd, null);
  const queued = { t: 0, sel: null, loop: false, loops: 0, previewEnd: 9 };
  const q = makeRegion(queued, { onPreviewEnd: () => true });
  assert.equal(q.ctl.check(9.5), 'preview-end');
  assert.deepEqual(q.calls, [], 'the queue handled it; no pause');
});

test('selection helpers match the classic player', () => {
  assert.deepEqual(enforceMinimumSelection({ a: 40, b: 41 }, 240), { a: 40, b: 43 });
  assert.deepEqual(enforceMinimumSelection({ a: 5, b: 6 }, 20), { a: 5, b: 7 }, '10 % of a 20 s song');
  assert.deepEqual(enforceMinimumSelection({ a: 5, b: 15 }, 240), { a: 5, b: 15 });
  assert.deepEqual(rangeAround(5, 100), { a: 0, b: 15 });
  assert.deepEqual(defaultLoopRange(30, 200), { a: 25, b: 37 });
  assert.deepEqual(quickSaveRange(50), { a: 30, b: 50 });
  assert.equal(previewStart(3, { a: 5, b: 9 }), 5);
  assert.equal(previewStart(8.9, { a: 5, b: 9 }), 5, 'within 0.15 s of the end restarts');
  assert.equal(previewStart(6, { a: 5, b: 9 }), null);
  assert.equal(seekTarget(10, -15, 100), 0);
  assert.equal(seekTarget(95, 15, 100), 100);
});

test('moments: tags merge without losing earlier ones; rows keep index.html\'s fields', () => {
  const m = newMoment('t1', { a: 10, b: 20 }, 'm1', 5);
  const tagged = withTags({ ...m, feelings: ['Calm'], qualities: ['Vocals'] }, ['Chills'], ['Melody', 'Vocals'], 'great guitar riff');
  assert.deepEqual(tagged.feelings, ['Calm', 'Chills']);
  assert.ok(tagged.qualities.includes('Vocals') && tagged.qualities.includes('Melody'));
  assert.equal(new Set(tagged.qualities).size, tagged.qualities.length, 'no duplicates');
  assert.equal(tagged.note, 'great guitar riff');
  assert.deepEqual(collectionsOf(tagged), [0, 2]);
  const row = toDbMoment({ ...tagged, source: 'user_confirmed', extra: 1 }, 99);
  assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'endSec', 'feelings', 'id', 'note', 'qualities', 'startSec', 'trackId', 'updatedAt']);
  assert.equal(row.createdAt, 5);
  assert.equal(row.updatedAt, 99);
  assert.deepEqual(savedRanges([row], 't1'), [{ id: 'm1', a: 10, b: 20 }]);
});

// ---------- phase 2: rules behind Library, My Moments, Discover, My Music DNA, Feature analysis ----------
import { computeTraits, traitShare, traitLevel, levelWord, ringLayout, portraitParts, evidenceNote, withoutTrait } from '../src/core/dna.ts';
import { suggestionFamily, whyLine, suggestionPills, ratingRow, ratingOf, DISCOVER_TABS } from '../src/core/discover.ts';
import { visibleWindows, slopeTag, windowSummary, dmerRows, studioUrl, liveWindow, valueAt, chordIndexAt, measuresAt, passageSummary, exactSummary } from '../src/core/diagnostics.ts';
import { inTab, withEdits, totalSeconds, COLLECTIONS } from '../src/core/moments.ts';

const mo = (id, qualities = [], feelings = [], trackId = 't1', startSec = 10, endSec = 20) =>
  ({ id, trackId, startSec, endSec, qualities, feelings, note: '', createdAt: 1, updatedAt: 1 });

test('dna: traits count only labelled qualities; shares and levels follow the classic rules', () => {
  const traits = computeTraits([mo('a', ['Vocals', 'Melody']), mo('b', ['Lyrics']), mo('c', ['Vocals']), mo('d', [])]);
  assert.deepEqual(traits.map(t => t.n), [3, 1, 0, 0]);
  const total = traits.reduce((n, t) => n + t.n, 0);
  assert.equal(traitShare(traits[0].n, total), 75);
  assert.equal(traitShare(0, 0), 0, 'empty portrait is 0 %, never invented');
  assert.deepEqual([0, 1, 2, 5, 8].map(traitLevel), [0, 1, 2, 3, 4]);
  assert.equal(levelWord(8), 'Strong match');
  assert.equal(levelWord(0), 'Not heard yet');
});

test('dna: ring geometry — 3 ticks per moment (min 2) plus 3-tick gaps; label sits at arc midpoint', () => {
  const traits = computeTraits([mo('a', ['Vocals'])]);
  const { ticks, labels } = ringLayout(traits, 0);
  assert.equal(ticks.length, 3 + 2 + 2 + 2 + 4 * 3);
  assert.equal(ticks.filter(t => t.tone === 'selected').length, 3);
  assert.equal(labels[0].pct, 100);
  assert.equal(ringLayout(traits, -1).ticks.filter(t => t.tone === 'idle').length, 3, 'nothing selected → idle tone');
});

test('dna: portrait repeats what you labelled and asks; correction removes only that trait', () => {
  const traits = computeTraits([mo('a', ['Vocals']), mo('b', ['Vocals']), mo('c', ['Harmony'])]);
  const text = portraitParts(traits).map(p => p.text).join('');
  assert.equal(text, 'In your saved moments, you often mention vocals and harmony. Is that what draws you in?');
  assert.equal(portraitParts(computeTraits([])).length, 1);
  assert.equal(evidenceNote(mo('x', ['Vocals', 'Melody'], ['Chills']), traits[0]), 'You marked vocals · felt: Chills');
  assert.deepEqual(withoutTrait(mo('x', ['Vocals', 'Lyrics', 'Melody']), traits[0]).qualities, ['Melody']);
});

test('discover: family from the anchoring moment, honest why line, rating id replaces earlier answer', () => {
  const moments = [mo('a', ['Melody'], [], 't1', 10, 20)];
  assert.equal(suggestionFamily({ matchingMoment: { trackId: 't1', startSec: 12, endSec: 18 } }, moments), 1);
  assert.equal(suggestionFamily({}, moments), -1);
  assert.equal(DISCOVER_TABS.length, 5);
  assert.equal(whyLine('First Light', 0.8, 102), 'Close to your moment in First Light · 1:42');
  assert.equal(whyLine(undefined, 0.3), 'A little like passages you liked');
  assert.deepEqual(suggestionPills(['shared B Minor key', 'vocals up front', 'similar energy'], { feelings: ['Chills'], qualities: ['Vocals'] }),
    ['Chills', 'Vocals', 'Harmony']);
  assert.deepEqual(suggestionPills(['matching groove (103 BPM)', 'similar brightness']), ['Rhythm', 'Atmosphere']);
  const r = ratingRow({ trackId: 't2', startSec: 12, endSec: 24 }, 'like', 5);
  assert.deepEqual(r, { id: 't2:12', trackId: 't2', startSec: 12, endSec: 24, value: 'like', createdAt: 5 });
  assert.equal(ratingOf({ trackId: 't2', startSec: 12 }, [r]), 'like');
});

test('moments: collections tabs, edits replace tags, total length', () => {
  assert.equal(COLLECTIONS.length, 3);
  assert.ok(inTab(mo('a', [], ['Chills']), 1));
  assert.ok(!inTab(mo('a', [], ['Chills']), 2));
  assert.ok(inTab(mo('a', ['Melody']), 3));
  const e = withEdits(mo('a', ['Vocals', 'Melody'], ['Calm']), [], ['Melody'], '  riff ');
  assert.deepEqual([e.feelings, e.qualities, e.note], [[], ['Melody'], 'riff']);
  assert.equal(totalSeconds([mo('a'), mo('b')]), 20);
});

test('diagnostics: windows follow the selection, slope words, summary values, offline-safe baselines', () => {
  const seg = (i) => ({ startSec: i * 4, endSec: i * 4 + 4, descriptors: { energy: 0.1, brightness_hz: 1500.4, onset_activity: 0.2, noisiness: 0.01, zero_crossing_rate: 0.05, energy_slope: 0.12, vocal_presence: 0.456 }, embedding: [0.1, -0.2] });
  const segs = Array.from({ length: 30 }, (_, i) => seg(i));
  assert.deepEqual(visibleWindows(segs, { a: 10, b: 18 }, false).map(x => x.i), [2, 3, 4]);
  assert.equal(visibleWindows(segs, { a: 500, b: 510 }, false).length, 6, 'no overlap → first six');
  assert.equal(visibleWindows(segs, { a: 0, b: 1 }, true).length, 30);
  assert.equal(slopeTag(0.12), 'Intensifying (+0.12/s)');
  assert.equal(slopeTag(-0.05), 'Decaying (-0.05/s)');
  assert.equal(slopeTag(0.01), 'Steady (0.01/s)');
  const s = windowSummary(segs[0]);
  assert.equal(s.vocalPct, 46);
  assert.equal(s.brightnessHz, 1500);
  assert.equal(s.chroma.length, 12);
  assert.deepEqual(dmerRows(undefined), []);
  assert.match(studioUrl('original-demo'), /\/api\/studio\/demo$/);
});

test('diagnostics: the live window is the one centred on the playhead; measures blend between windows', () => {
  // Overlapping windows like the service makes: 12 s long, one every 6 s.
  const segs = Array.from({ length: 10 }, (_, i) => ({ startSec: i * 6, endSec: i * 6 + 12, descriptors: { energy: 0.1 * (i + 1), chords: ['Am', 'F', 'C', 'G'] } }));
  assert.equal(liveWindow(segs, 13).i, 1, '0:13 → window 6–18 (centre 0:12), not 0–12');
  assert.equal(liveWindow([], 5), null);
  assert.ok(Math.abs(valueAt(segs, 'energy', 9) - 0.15) < 1e-9, 'halfway between centres 0:06 and 0:12');
  assert.equal(valueAt(segs, 'energy', 0), 0.1);
  assert.equal(chordIndexAt(segs[1], 13), 2, 'third quarter of 6–18 → C');
  const m = measuresAt(segs, 6).find(x => x.key === 'energy');
  assert.equal(m.level, 0);
});

test('library: songs saved with an expiring YouTube proxy URL play from the stream endpoint instead', async () => {
  const { fallbackUrl } = await import('../src/core/library.ts');
  const old = fallbackUrl({ id: 'youtube-abc', streamPlaybackUrl: 'http://127.0.0.1:8765/api/stream/proxy?url=x' });
  assert.match(old, /\/api\/stream\/audio\/youtube-abc\?src=https%3A%2F%2Fwww\.youtube\.com%2Fwatch%3Fv%3Dabc$/);
  const fresh = 'http://127.0.0.1:8765/api/stream/audio/youtube-abc?src=y';
  assert.equal(fallbackUrl({ id: 'youtube-abc', streamPlaybackUrl: fresh }), fresh);
  assert.match(fallbackUrl({ id: 'youtube-abc' }), /\/api\/stream\/audio\/youtube-abc\?src=/, 'synced YouTube song without a link');
  assert.match(fallbackUrl({ id: 'imported-1' }), /\/api\/audio\/imported-1$/);
});

test('diagnostics: a loop that matches no analysis window is summarised exactly over its own range', () => {
  const segs = Array.from({ length: 10 }, (_, i) => ({ startSec: i * 6, endSec: i * 6 + 12,
    descriptors: { energy: i < 5 ? 0.1 : 0.3, key: i < 5 ? 'A Minor' : 'C Major', tempoBpm: 120, chords: ['Am', 'F', 'C', 'G'] } }));
  const p = passageSummary(segs, { a: 13, b: 25 });
  assert.equal(p.key, 'A Minor', 'most of 0:13–0:25 is heard in A minor windows');
  assert.equal(p.tempoBpm, 120);
  assert.equal(p.chords[0].from, 13, 'chords start at the loop start, not at a window start');
  assert.ok(p.chords.at(-1).to <= 25, 'and end at the loop end');
  assert.ok(p.chords.every((c, i) => i === 0 || c.chord !== p.chords[i - 1].chord), 'repeats are merged');
  assert.equal(passageSummary([], { a: 0, b: 5 }), null);
});

test('diagnostics: an exact passage analysis gives its own key, tempo and chords spread over the passage', () => {
  const song = [{ startSec: 0, endSec: 12, descriptors: { energy: 0.1 } }, { startSec: 6, endSec: 18, descriptors: { energy: 0.3 } }];
  const p = exactSummary(song, { a: 5.2, b: 10.9, segments: [{ startSec: 5.2, endSec: 10.9, descriptors: { energy: 0.2 } }],
    musicalDimensions: { melodyHarmony: { key: 'B Minor', chords: ['F7', 'C#7', 'C#7'] }, rhythmGroove: { tempoBpm: 136.2 } } });
  assert.equal(p.key, 'B Minor');
  assert.equal(p.tempoBpm, 136);
  assert.deepEqual(p.chords.map(c => c.chord), ['F7', 'C#7'], 'repeats merged');
  assert.equal(p.chords[0].from, 5.2);
  assert.ok(Math.abs(p.chords[1].to - 10.9) < 1e-9);
  assert.ok(Math.abs(p.measures.find(m => m.key === 'energy').level - 0.5) < 1e-9, 'halfway between the song low and high');
});


test('timeline: bar and beat at the playhead, block lookup, note names', () => {
  const beats = [17.1, 17.87, 18.64, 19.41, 20.22, 20.99, 21.76], downbeats = [17.1, 20.22];
  assert.equal(barAt(downbeats, 10), 1, 'bar 1 before the first downbeat');
  assert.equal(barAt(downbeats, 21), 2);
  assert.equal(beatInBar(beats, downbeats, 21.8), 3);
  const chords = [{ c: 'Dm', a: 0, b: 2 }, { c: 'C', a: 2, b: 5 }, { c: 'F', a: 5, b: 6 }];
  assert.equal(blockIndexAt(chords, 2), 1, 'a block starts at its own start');
  assert.equal(blockIndexAt(chords, 6), -1, 'past the end');
  assert.equal(noteName(69), 'A4');
  assert.equal(noteName(60), 'C4');
  assert.equal(rankIn([1, 2, 3, 4], 3), 0.5);
});

test('timeline: moments name stems that drop out, repeats and the vocal range', () => {
  const n = 600, on = Array(n).fill(0.6), hole = on.map((v, i) => (i >= 200 && i < 260 ? 0 : v));
  const midi = Array(n).fill(null).map((_, i) => (i > 100 && i < 500 ? 55 + (i % 10) : null));
  const tl = { trackId: 'x', version: 1, status: {}, fps: 10, repeats: [{ at: 30, same_as: 5, sim: 0.97 }],
    stems: { vocals: on, drums: hole, bass: hole, other: on }, melody: { fps: 10, midi } };
  const m = passageMoments(tl, { a: 10, b: 50 });
  assert.equal(m.length, 3);
  const drop = m.find(x => /drop out/.test(x.text));
  assert.match(drop.text, /^Drums and bass drop out until 0:2[56]\.$/);
  assert.deepEqual(drop.stems, ['drums', 'bass']);
  const alone = passageMoments({ ...tl, stems: { vocals: on, drums: hole, bass: hole, other: hole } }, { a: 10, b: 50 }).find(x => x.stems);
  assert.match(alone.text, /^Drums, bass and other instruments drop out until 0:2[56]\. The voice carries it alone\.$/);
  const bassOnly = { ...tl, mix: Array(n).fill(0.5), stems: { vocals: on, drums: on, bass: hole, other: on } };
  assert.match(passageMoments(bassOnly, { a: 10, b: 50 }).find(x => x.stems).text, /^Bass drops out/);
  assert.doesNotMatch(passageEvidence(bassOnly, { a: 10, b: 50 }).question, /drop/, 'the bass alone pausing is not a drop');
  assert.ok(Math.abs(drop.at - 20) < 1, 'at the drop');
  assert.deepEqual(m.map(x => x.at), [...m.map(x => x.at)].sort((p, q) => p - q), 'in time order');
  assert.equal(m.find(x => x.ghost != null).text, 'Same chords as 0:05.');
  assert.match(m.find(x => /sung/.test(x.text)).text, /voice spans G3–E4/);
  assert.deepEqual(passageMoments({ trackId: 'x', version: 1, status: {} }, { a: 0, b: 10 }), [], 'nothing before the tiers arrive');
});

test('spectrum: FFT finds a sine, mel scale round-trips, every band has a filter', () => {
  const n = 1024, re = new Float32Array(n), im = new Float32Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin(2 * Math.PI * 64 * i / n);
  fft(re, im);
  const mags = Array.from(re, (v, i) => Math.hypot(v, im[i])).slice(0, n / 2);
  assert.equal(mags.indexOf(Math.max(...mags)), 64);
  for (const f of [30, 440, 1000, 5000, 11025]) assert.ok(Math.abs(melToHz(hzToMel(f)) - f) < 1e-6 * f);
  assert.ok(melFilters().every(b => b.w.some(v => v > 0)), 'no empty rows in the image');
});

test('spectrum: a 1 kHz tone lights the 1 kHz band; loudness rises with the signal', () => {
  const sec = 2, x = new Float32Array(SPEC_SR * sec);
  for (let i = 0; i < x.length; i++) x[i] = (i > x.length / 2 ? 0.5 : 0.05) * Math.sin(2 * Math.PI * 1000 * i / SPEC_SR);
  const s = computeSpectrum(x);
  assert.ok(Math.abs(s.fps - 86.13) < 0.01);
  const mid = Math.floor(s.frames * 0.75) * s.bands, row = Array.from(s.data.slice(mid, mid + s.bands));
  const peak = row.indexOf(Math.max(...row));
  const bandHz = melToHz(hzToMel(30) + (hzToMel(11025) - hzToMel(30)) * (peak + 1) / (s.bands + 1));
  assert.ok(Math.abs(bandHz - 1000) < 60, 'peak band near 1 kHz, got ' + Math.round(bandHz));
  assert.ok(s.loud[15] > s.loud[5], 'louder second half');
  assert.ok(Math.abs(s.bright[15] - 1000) < 80, 'centroid of a pure tone is its frequency');
});

test('timeline: the chord sheet puts chords in bars and bars in parts', () => {
  const tl = { trackId: 'x', version: 1, status: {}, durationSec: 16,
    downbeats: [1, 5, 9, 13],
    chords: [{ c: 'Dm', a: 0, b: 5, conf: 1 }, { c: 'C', a: 5, b: 7, conf: 1 }, { c: 'F', a: 7, b: 9.5, conf: 1 }, { c: 'Dm', a: 9.5, b: 16, conf: 1 }],
    sections: [{ a: 0, b: 9, label: 'A', energy: 0.5 }, { a: 9, b: 16, label: 'B', energy: 0.7 }] };
  const sheet = chordSheet(tl);
  assert.deepEqual(sheet.map(s => s.label), ['A', 'B']);
  assert.deepEqual(sheet[0].bars.map(b => [b.n, b.chords.join(' ')]), [[0, 'Dm'], [1, 'Dm'], [2, 'C F']], 'pickup bar 0, then bars 1, 2');
  assert.deepEqual(sheet[1].bars.map(b => [b.n, b.chords.join(' ')]), [[3, 'Dm'], [4, 'Dm']], 'a chord under a quarter of the bar (F, 0.5 of 4 s) is left out');
  assert.deepEqual(chordSheet({ trackId: 'x', version: 1, status: {} }), []);
});

test('timeline: the chord chart shows each part once, as its repeating bar pattern', () => {
  const downbeats = Array.from({ length: 16 }, (_, i) => i * 2);
  const chords = downbeats.map((d, i) => ({ c: i % 2 ? 'D#m' : 'C#', a: d, b: d + 2, conf: 1 }));
  chords[11] = { c: 'B', a: 22, b: 24, conf: 1 };   // one odd bar does not break the pattern
  const tl = { trackId: 'x', version: 2, status: {}, durationSec: 32, downbeats, chords,
    sections: [{ a: 0, b: 16, label: 'A', energy: 0.5 }, { a: 16, b: 24, label: 'B', energy: 0.5 }, { a: 24, b: 32, label: 'A', energy: 0.5 }] };
  const { order, parts } = chordChart(tl);
  assert.deepEqual(order.map(s => s.label), ['A', 'B', 'A']);
  const a = parts.find(p => p.label === 'A');
  assert.deepEqual(a.pattern, [['C#'], ['D#m']]);
  assert.equal(a.repeats, 4);
  assert.equal(a.times.length, 2, 'heard twice');
  assert.deepEqual(parts.find(p => p.label === 'B').pattern, [['C#'], ['D#m']], '3 of 4 bars match a 2-bar loop');
});

test('timeline: the save question asks about the strongest measured event in the passage', () => {
  const n = 600, on = Array(n).fill(0.6), hole = on.map((v, i) => (i >= 200 && i < 260 ? 0 : v));
  const tl = { trackId: 'x', version: 2, status: {}, fps: 10, mix: Array(n).fill(0.5), stems: { vocals: on, drums: hole, bass: hole, other: on } };
  const e = passageEvidence(tl, { a: 10, b: 50 });
  assert.equal(e.question, 'Saved. Was it the drop at 0:20, when the drums and bass cut out?');
  assert.ok(e.salience.Drop > 0.9);
  const rising = { trackId: 'x', version: 2, status: {}, fps: 10, mix: Array.from({ length: n }, (_, i) => i / n) };
  assert.match(passageEvidence(rising, { a: 0, b: 60 }).question, /build-up/);
  assert.equal(passageEvidence({ trackId: 'x', version: 2, status: {} }, { a: 0, b: 10 }), null, 'no timeline yet: the window rule is used');
});

test('spectrum views: an A4 tone is the A4 row in CQT; a 1 kHz tone the 1 kHz row in linear', () => {
  const tone = (hz) => Float32Array.from({ length: SPEC_SR }, (_, i) => 0.5 * Math.sin(2 * Math.PI * hz * i / SPEC_SR));
  const peakRow = (v) => { const mid = Math.floor(v.frames / 2) * v.bands, row = Array.from(v.data.slice(mid, mid + v.bands)); return row.indexOf(Math.max(...row)); };
  const cqt = computeView(tone(440), 'cqt');
  assert.equal(cqt.bands, 168);
  assert.ok(Math.abs(cqt.freqs[peakRow(cqt)] - 440) < 440 * 0.03, 'within a quarter tone of A4, got ' + cqt.freqs[peakRow(cqt)].toFixed(1));
  assert.equal(bandForHz(cqt, 440), 24 * 2 + 18, 'A4 = 2 octaves + 9 semitones above C2');
  const lin = computeView(tone(1000), 'linear');
  assert.ok(Math.abs(lin.freqs[peakRow(lin)] - 1000) < 60);
  assert.equal(computeSpectrum(tone(1000)).kind, 'mel');
});

test('details: voice, groove, harmony and similar passages read the measurements in plain words', async () => {
  const { voiceDetails, grooveDetails, harmonyDetails, similarPassages, teaser } = await import('../src/core/passageDetails.ts');
  const midi = Array(200).fill(null).map((_, i) => (i >= 20 && i < 60 ? 62 : i >= 60 && i < 180 ? 57 + (i % 12) : null));
  const beats = Array.from({ length: 40 }, (_, i) => i * 0.5), downbeats = beats.filter((_, i) => i % 4 === 0);
  const tl = { trackId: 't', version: 2, status: {}, fps: 10, melody: { fps: 10, midi }, beats, downbeats,
    chords: [{ c: 'Dm', a: 0, b: 12, conf: 1 }, { c: 'C', a: 12, b: 20, conf: 1 }] };
  const voice = voiceDetails(tl, { a: 0, b: 20 });
  assert.equal(voice.find(r => r.k === 'Longest note').v, '4.0 s on D4');
  assert.match(teaser(voice, ['Range', 'Longest note']), /^.+–.+ · 4\.0 s on D4$/);
  const groove = grooveDetails(tl, [], { a: 0, b: 20 });
  assert.equal(groove.find(r => r.k === 'Tempo').v, '120 BPM');
  assert.equal(groove.find(r => r.k === 'Steadiness').v, 'Steady (±0 ms)');
  assert.equal(groove.find(r => r.k === 'Metre').v, '4 beats per bar');
  assert.equal(harmonyDetails(tl, [], { a: 0, b: 20 }).find(r => r.k === 'Chords').v, 'Dm 60% · C 40%');
  const seg = (a, e) => ({ startSec: a, endSec: a + 12, descriptors: {}, embedding: e });
  const analyses = [
    { trackId: 't', method: 'multimodal', segments: [seg(0, [1, 0]), seg(60, [0.9, 0.1])] },
    { trackId: 'u', method: 'multimodal', segments: [seg(0, [0, 1]), seg(30, [1, 0.05])] },
  ];
  const sim = similarPassages(analyses, 't', { a: 0, b: 12 });
  assert.deepEqual(sim.map(h => [h.trackId, h.a]), [['u', 30], ['t', 60], ['u', 0]], 'most alike first, own windows left out');
});

test('titles: placeholder names come from the corpus; names you typed stay (TITLE FIX)', async () => {
  const { namedFromCorpus } = await import('../src/core/library.ts');
  const titles = { 'FnDmg-cBVsA': { title: 'Aamay Bhashaili Rey', artist: 'Alamgir, Fariha Pervez' } };
  assert.deepEqual(namedFromCorpus({ id: 'FnDmg-cBVsA', title: 'FnDmg-cBVsA', artist: 'Your library' }, titles),
    { title: 'Aamay Bhashaili Rey', artist: 'Alamgir, Fariha Pervez' });
  assert.deepEqual(namedFromCorpus({ id: 'a1b2', title: 'FnDmg-cBVsA', artist: '' }, titles),
    { title: 'Aamay Bhashaili Rey', artist: 'Alamgir, Fariha Pervez' }, "imported as 'FnDmg-cBVsA.m4a'");
  assert.deepEqual(namedFromCorpus({ id: 'youtube-FnDmg-cBVsA', title: 'FnDmg-cBVsA', artist: 'Ali' }, titles),
    { title: 'Aamay Bhashaili Rey', artist: 'Ali' }, 'a real artist is kept');
  assert.equal(namedFromCorpus({ id: 'FnDmg-cBVsA', title: 'My edit', artist: 'Your library' }, titles), null, 'a typed title is kept');
  assert.equal(namedFromCorpus({ id: 'zzz', title: 'zzz', artist: '' }, titles), null);
});

/* ---------- Artwork (core/artwork.ts) ---------- */

/** A fake JPEG: the magic bytes, then filler, long enough to count as a picture. */
const fakeJpeg = () => Uint8Array.from({ length: 120 }, (_, i) => (i === 0 ? 0xff : i === 1 ? 0xd8 : i % 251));
const be32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = s => [...s].map(c => c.charCodeAt(0));

test('artwork: ID3v2.3 APIC front cover is found', () => {
  const img = [...fakeJpeg()];
  const body = [0, ...ascii('image/jpeg'), 0, 3, ...ascii('cover'), 0, ...img];
  const frame = [...ascii('APIC'), ...be32(body.length), 0, 0, ...body];
  const n = frame.length, size = [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
  const file = Uint8Array.from([...ascii('ID3'), 3, 0, 0, ...size, ...frame, 0xff, 0xfb]);
  const pic = extractEmbeddedPicture(file);
  assert.equal(pic?.mime, 'image/jpeg');
  assert.deepEqual([...pic.bytes], img);
});

test('artwork: FLAC PICTURE block is found; plain audio has none', () => {
  const img = [...fakeJpeg()], mime = ascii('image/jpeg');
  const block = [...be32(3), ...be32(mime.length), ...mime, ...be32(0), ...be32(1), ...be32(1), ...be32(24), ...be32(0), ...be32(img.length), ...img];
  const file = Uint8Array.from([...ascii('fLaC'), 0x80 | 6, (block.length >> 16) & 255, (block.length >> 8) & 255, block.length & 255, ...block]);
  assert.deepEqual([...extractEmbeddedPicture(file).bytes], img);
  assert.equal(extractEmbeddedPicture(new Uint8Array(400)), null);
});

test('artwork: key names parse to circle-of-fifths position and mode', () => {
  assert.deepEqual(parseKey('A Minor'), { fifths: 3, minor: true });
  assert.deepEqual(parseKey('Bb major'), { fifths: 10, minor: false });
  assert.deepEqual(parseKey('F#m'), { fifths: 6, minor: true });
  assert.equal(parseKey('unknown'), null);
});

test('artwork: drawn cover is stable per song and follows its key and tempo', () => {
  const a = artRecipe({ seed: 'song-1' }), b = artRecipe({ seed: 'song-1' });
  assert.deepEqual(a, b);
  assert.notEqual(artRecipe({ seed: 'song-2' }).contour, a.contour);
  const slow = artRecipe({ seed: 's', key: 'C Major', tempoBpm: 60 }), fast = artRecipe({ seed: 's', key: 'C Major', tempoBpm: 160 });
  assert.equal(slow.hue, fast.hue);
  assert.ok(fast.rings.length > slow.rings.length);
  const seg = (t, key) => ({ startSec: t, descriptors: { energy: t, brightness_hz: 2000, key, tempoBpm: 96 } });
  assert.deepEqual(artFromAnalysis([seg(3, 'D Minor'), seg(0, 'D Minor'), seg(1, 'A Minor'), seg(2, 'D Minor')]),
    { key: 'D Minor', tempoBpm: 96, energy: [0, 1, 2, 3], brightnessHz: 2000 });
});

test('effects: presets are in range, Off is neutral, old saves still load', async () => {
  const fx = await import('../src/core/effects.ts');
  for (const [name, { params }] of Object.entries(fx.PRESETS)) {
    assert.deepEqual(fx.cleanEffects(params), params, name + ' survives a save and reload');
    assert.equal(fx.effectsActive(params), name !== 'off', name);
  }
  const old = fx.cleanEffects({ preset: 'karaoke', karaoke: true, room: 0.15, lofi: true });
  assert.equal(old.stem, 'no_vocals', 'the earlier Karaoke switch becomes the stem mode');
  assert.equal(old.width, 1, 'missing values are neutral, not 0');
  assert.equal(fx.cleanEffects({ room: 9, tape: 0.1 }).room, 1);
  assert.equal(fx.cleanEffects({ room: 9, tape: 0.1 }).tape, 0.75);
  assert.equal(fx.cleanEffects('nonsense').preset, 'off');
});

test('effects: DJ filter, width matrix, echo timing and tab dots', async () => {
  const fx = await import('../src/core/effects.ts');
  assert.deepEqual(fx.filterCutoffs(0), { lowpass: 20000, highpass: 10 }, 'centre: fully open');
  assert.ok(Math.abs(fx.filterCutoffs(-1).lowpass - 300) < 1e-6);
  assert.ok(Math.abs(fx.filterCutoffs(1).highpass - 2500) < 1e-6);
  assert.ok(Math.abs(fx.filterCutoffs(-0.5).lowpass - 2449) < 1);
  assert.deepEqual(fx.widthGains(1), { a: 1, b: 0 }, 'as recorded');
  assert.deepEqual(fx.widthGains(0), { a: 0.5, b: 0.5 }, 'mono');
  assert.equal(fx.echoDelaySec(120), 0.375);
  assert.equal(fx.echoDelaySec(null), 0.375, 'unknown tempo: 120 BPM');
  const p = fx.withControl(fx.NEUTRAL, 'chorus', 0.4);
  assert.equal(p.preset, 'custom');
  assert.equal(fx.groupActive(p, 'motion'), true);
  assert.equal(fx.groupActive(p, 'space'), false);
  assert.equal(fx.groupActive(fx.withControl(fx.NEUTRAL, 'stem', 'vocals'), 'tape'), true);
  assert.equal(fx.withControl(p, 'chorus', 0).preset, 'off', 'back to neutral: Off');
});

test('transpose: pitch moves, tempo and level stay; 0 passes straight through (TRANSPOSE)', async () => {
  const { PitchShifter, pitchRatio, PITCH_LATENCY } = await import('../src/core/pitchShift.ts');
  const { fft } = await import('../src/core/spectrum.ts');
  assert.ok(Math.abs(pitchRatio(-2) - 0.8909) < 1e-4);
  assert.ok(Math.abs(pitchRatio(0, 30) - 1.0175) < 1e-4);
  const sr = 44100, n = sr * 2, N = 32768;
  const sine = new Float32Array(n);
  for (let i = 0; i < n; i++) sine[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / sr);
  const run = ratio => {
    const y = new Float32Array(n), ps = new PitchShifter();
    for (let o = 0; o < n; o += 128) ps.process(sine.subarray(o, o + 128), y.subarray(o, o + 128), ratio);
    return y;
  };
  const peakHz = y => {
    const re = Float32Array.from(y.subarray(n - N)), im = new Float32Array(N);
    for (let i = 0; i < N; i++) re[i] *= 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    fft(re, im);
    let bk = 0, best = 0;
    for (let k = 1; k < N / 2; k++) { const m = Math.hypot(re[k], im[k]); if (m > best) { best = m; bk = k; } }
    return bk * sr / N;
  };
  const rms = y => Math.sqrt(y.subarray(n - N).reduce((s, v) => s + v * v, 0) / N);
  for (const st of [-12, -2, 7]) {
    const y = run(pitchRatio(st)), want = 440 * pitchRatio(st);
    assert.ok(Math.abs(peakHz(y) - want) < 2, `${st} semitones: ${peakHz(y).toFixed(1)} Hz, want ${want.toFixed(1)}`);
    assert.ok(Math.abs(20 * Math.log10(rms(y) / rms(sine))) < 1, `${st} semitones: level within 1 dB`);
  }
  assert.deepEqual(run(1), sine, 'ratio 1: untouched, no delay');
  assert.ok(PITCH_LATENCY / sr < 0.04, 'shifting delays the sound by under 40 ms');
  const fx = await import('../src/core/effects.ts');
  assert.equal(fx.cleanEffects({ room: 0.2 }).transpose, 0, 'older saves load in the original key');
  assert.equal(fx.cleanEffects({ transpose: 40, tune: -2.6 }).transpose, 12);
  assert.equal(fx.cleanEffects({ transpose: 40, tune: -2.6 }).tune, -3, 'whole cents');
  assert.equal(fx.groupActive(fx.withControl(fx.NEUTRAL, 'transpose', -2), 'tape'), true);
  const tr = fx.GROUPS.find(g => g.id === 'tape').controls.find(c => c.key === 'transpose');
  assert.equal(tr.show(-2), '−2 semitones');
  assert.equal(tr.show(0), 'original key');
});

test('lanes: label spacing grows with the zoom so labels never collide (LABEL FIX)', async () => {
  const { labelStep, BAR_STEPS, TIME_STEPS } = await import('../src/core/timeline.ts');
  assert.equal(labelStep(40, BAR_STEPS, 34), 1, 'a short passage: every bar');
  assert.equal(labelStep(6, BAR_STEPS, 34), 8, '137 bars on 820 px: every 8th');
  assert.equal(labelStep(1640 / 271, TIME_STEPS, 60), 10, '4:31 on 1640 px: every 10 s');
  assert.equal(labelStep(1640 / 793, TIME_STEPS, 60), 30, '13 min on 1640 px: every 30 s');
});

test('effects per song: Original A/B keeps the mix; versions; cleaning (PER-SONG FIX)', async () => {
  const fx = await import('../src/core/effects.ts');
  const s = fx.emptyFx();
  assert.equal(s.listen, 'original');
  assert.deepEqual(fx.effectiveParams(s), fx.NEUTRAL, 'a new song plays as recorded');
  const mix = { ...fx.PRESETS.slowed.params };
  const withMix = { ...s, mix, listen: 'mix' };
  assert.equal(fx.effectiveParams(withMix).tape, 0.85);
  assert.equal(fx.effectiveParams({ ...withMix, listen: 'original' }).tape, 1, 'Original: nothing applied…');
  assert.equal({ ...withMix, listen: 'original' }.mix.tape, 0.85, '…and the mix is kept');
  const v = { id: 'v1', name: 'Late drive', params: fx.PRESETS.hall.params, at: 1 };
  const withV = { ...withMix, versions: [v], listen: 'v1' };
  assert.equal(fx.effectiveParams(withV).room, 0.5);
  assert.equal(fx.cleanFxState(JSON.parse(JSON.stringify(withV))).listen, 'v1', 'survives a save and reload');
  assert.equal(fx.cleanFxState({ ...withV, listen: 'gone' }).listen, 'original', 'a deleted version falls back to Original');
  assert.equal(fx.nextVersionName([]), 'My version');
  assert.equal(fx.nextVersionName([{ name: 'My version' }, { name: 'My version 2' }]), 'My version 3');
  const g = fx.resetGroup({ ...fx.NEUTRAL, room: 0.5, bass: 4, preset: 'custom' }, 'space');
  assert.equal(g.room, 0); assert.equal(g.bass, 4, 'other groups untouched');
  const bass = fx.GROUPS.find(x => x.id === 'tone').controls.find(c => c.key === 'bass');
  assert.deepEqual(fx.sliderFill(bass, 6), [0.5, 0.75], 'bipolar: fills from the middle');
});

test('download: WAV header and peak fitting', async () => {
  const { wavFromBuffer, fitPeak } = await import('../src/core/effectsRender.ts');
  const ch = [new Float32Array([0, 0.5, -0.5, 1]), new Float32Array([0, 0.25, -0.25, -1])];
  const wav = wavFromBuffer({ numberOfChannels: 2, sampleRate: 44100, length: 4, getChannelData: c => ch[c] });
  const b = new DataView(await wav.arrayBuffer());
  assert.equal(wav.size, 44 + 4 * 2 * 2);
  assert.equal(String.fromCharCode(b.getUint8(0), b.getUint8(1), b.getUint8(2), b.getUint8(3)), 'RIFF');
  assert.equal(b.getUint32(24, true), 44100);
  assert.equal(b.getInt16(44 + 2 * 2, true), Math.trunc(0.5 * 0x7fff), 'left sample 1');
  const loud = [new Float32Array([0, 2, -1])];
  const g = fitPeak(loud);
  assert.ok(Math.abs(Math.max(...loud[0].map(Math.abs)) - 10 ** (-1 / 20)) < 1e-6, 'peak brought to -1 dBFS');
  assert.ok(g < 1);
  assert.equal(fitPeak([new Float32Array([0.1])]), 1, 'quiet renders untouched');
});

test('bitrate: real MP3 and WAV match their known codec, rate and length', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseBitrate, bitrateSummary } = await import('../src/core/bitrate.ts');
  const mp3 = parseBitrate(readFileSync(new URL('../public/Naina-Moray-Coke-Studio-129-205.mp3', import.meta.url)));
  assert.equal(mp3.codec, 'MP3'); assert.equal(mp3.mode, 'CBR'); assert.equal(mp3.avgKbps, 192); assert.equal(mp3.sampleRate, 44100);
  assert.ok(Math.abs(mp3.durationSec - 76.07) < 0.2, 'ffprobe says 76.07 s, got ' + mp3.durationSec);
  const wav = parseBitrate(readFileSync(new URL('../public/demo.wav', import.meta.url)));
  assert.equal(wav.mode, 'PCM'); assert.ok(Math.abs(wav.durationSec - 32) < 0.1);
  assert.match(bitrateSummary(mp3), /^MP3 · CBR · avg 192 kbps · 44\.1 kHz · stereo$/);
});

test('bitrate: a VBR MP3 is seen as VBR with its curve; an OGG/Opus page stream is read', async () => {
  const { parseBitrate, mp3Frame } = await import('../src/core/bitrate.ts');
  // MPEG-1 Layer III, 44.1 kHz: header FF FB <bitrate idx << 4 | 0x00> C0. 128 kbps → 417 B, 320 kbps → 1044 B.
  const frame = idx => { const f = mp3Frame(new Uint8Array([0xff, 0xfb, idx << 4, 0xc0]), 0); const b = new Uint8Array(f.len); b.set([0xff, 0xfb, idx << 4, 0xc0]); return b; };
  const parts = [...Array(40).fill(9), ...Array(40).fill(14)].map(frame); // 40 × 128 kbps, then 40 × 320 kbps
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  const v = parseBitrate(all);
  assert.equal(v.mode, 'VBR');
  assert.ok(Math.abs(v.kbps[0] - 128) <= 1 && Math.abs(v.kbps.at(-1) - 320) <= 2, JSON.stringify(v.kbps));
  // Ogg: an OpusHead page, then two pages of 1000 bytes each 0.5 s apart (granule at 48 kHz).
  const page = (gran, payload) => { const p = new Uint8Array(27 + 1 + payload.length); p.set([79, 103, 103, 83]); new DataView(p.buffer).setBigInt64(6, BigInt(gran), true); p[26] = 1; p[27] = payload.length; p.set(payload, 28); return p; };
  const head = new Uint8Array(19); head.set([...'OpusHead'].map(c => c.charCodeAt(0))); head[9] = 2;
  const ogg = [page(0, head), page(24000, new Uint8Array(200)), page(48000, new Uint8Array(200))];
  const buf = new Uint8Array(ogg.reduce((n, p) => n + p.length, 0)); o = 0; for (const p of ogg) { buf.set(p, o); o += p.length; }
  const op = parseBitrate(buf);
  assert.equal(op.codec, 'Opus'); assert.equal(op.channels, 2); assert.ok(Math.abs(op.durationSec - 1) < 1e-6);
  assert.equal(op.kbps[0], Math.round(228 * 8 / 0.5 / 1000), '228-byte page per ½ s');
  assert.equal(parseBitrate(new Uint8Array([1, 2, 3])), null, 'unknown bytes: null');
});

test('stats for nerds: each row takes the first source that knows it', async () => {
  const { fileRows, playbackRows, analysisRows } = await import('../src/core/nerdStats.ts');
  const br = { codec: 'AAC', container: 'M4A', mode: 'VBR', sampleRate: 44100, channels: 2, avgKbps: 128, kbps: [120, 139], binSec: 0.5, durationSec: 1, exact: true };
  const rows = Object.fromEntries(fileRows(br, null, { profile: 'LC', codec: 'AAC (Advanced Audio Coding)', encoder: 'Lavf61.7.100', sampleFormat: 'fltp' }, 139).map(r => [r[0], r.slice(1)]));
  assert.deepEqual(rows['Codec'], ['AAC (Advanced Audio Coding) · LC', 'ffprobe']);
  assert.deepEqual(rows['Bitrate'], ['avg 128 kbps · now 139 kbps', 'frames']);
  assert.deepEqual(rows['Encoder'], ['Lavf61.7.100', 'ffprobe']);
  const mi = { general: { Format: 'MPEG Audio' }, audio: { Format: 'MPEG Audio', Format_Version: '1', Format_Profile: 'Layer 3', Encoded_Library_Settings: '-m j -V 0' } };
  const r2 = Object.fromEntries(fileRows(br, mi, null, null).map(r => [r[0], r.slice(1)]));
  assert.deepEqual(r2['Codec'], ['MPEG Audio 1 Layer 3', 'MediaInfo'], 'MediaInfo wins when present');
  assert.deepEqual(r2['Encoder settings'], ['-m j -V 0', 'MediaInfo']);
  const pb = Object.fromEntries(playbackRows({ deck: 'B', bufferedAhead: 41.24, readyState: 4, networkState: 1, rate: 0.85, pitchKept: false, crossfading: true, loudnessDb: -3, webAudio: true,
    device: { sampleRate: 48000, baseLatency: 0.01, outputLatency: 0.02, state: 'running' } }, { source: 'this device', stem: 'all', practiceRate: 1, effects: 'My mix', lufs: -14.2, peakDb: -0.5 }));
  assert.equal(pb['Deck'], 'B · crossfading');
  assert.equal(pb['Speed'], '0.85× · pitch moves (tape)');
  assert.equal(pb['Audio device'], '48 kHz · running · latency 10 ms + output 20 ms');
  assert.match(analysisRows(null)[0][1], /not available/);
});

test('bitrate: a passage gets its own min / avg / max and bytes (Nerds view)', async () => {
  const { rangeStats } = await import('../src/core/bitrate.ts');
  const info = { codec: 'AAC', container: 'M4A', mode: 'VBR', avgKbps: 0, kbps: [100, 120, 140, 160], binSec: 0.5, durationSec: 2, exact: true };
  assert.deepEqual(rangeStats(info, 0.5, 1.5), { min: 120, avg: 130, max: 140, bytes: 16250, sec: 1 });
  assert.equal(rangeStats(info, 0.75, 1.25).avg, 130, 'half bins weigh by time');
  assert.equal(rangeStats(info, 3, 4), null, 'outside the file');
});

test('frames: every MP3 frame is kept, found by time, and described (FRAME FIX)', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseBitrate, frameAt, frameLine, frameSummary } = await import('../src/core/bitrate.ts');
  const i = parseBitrate(readFileSync(new URL('../public/Naina-Moray-Coke-Studio-129-205.mp3', import.meta.url)));
  const f = i.frames;
  assert.equal(f.unit, 'frame');
  assert.ok(Math.abs(f.t.length - Math.round(76.07 * 44100 / 1152)) <= 2, 'about one frame per 26.1 ms: ' + f.t.length);
  const k = frameAt(f, 10);
  assert.ok(f.t[k] <= 10 && f.t[k] + f.dur[k] > 10, 'the frame playing at 0:10');
  assert.equal(frameAt(f, -1), -1);
  const s = frameSummary(f);
  assert.ok(Math.abs(s.durMs - 26.12) < 0.01 && s.minBytes >= 626 && s.maxBytes <= 627, JSON.stringify(s));
  assert.match(frameLine(f, k), /^frame [\d,]+ of [\d,]+ · starts [\d.]+ s · 62[67] B · 192 kbps in its header · 26\.12 ms · byte [\d,]+ · joint stereo \([^)]+\)( · padded)? · no CRC$/);
});

test('frames: timing and bytes match ffprobe; LAME priming skipped; loop frames (TIMING FIX)', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseBitrate, frameAt, framesIn, mp3Header, lameGapless } = await import('../src/core/bitrate.ts');
  const f = parseBitrate(readFileSync(new URL('../public/Naina-Moray-Coke-Studio-129-205.mp3', import.meta.url))).frames;
  // ffprobe: first packet pos 670 size 626; packet at pts 76.042449 → pos 1825688 (container clock).
  assert.equal(f.offset[0], 670); assert.equal(f.size[0], 626);
  assert.ok(Math.abs(f.skipSec * 44100 - (576 + 529)) < 1, 'LAME delay 576 + 529 decoder samples');
  const k = frameAt(f, 76.042449 - f.skipSec + 0.001);
  assert.equal(f.offset[k], 1825688, 'same frame as ffprobe, on the player clock');
  const h = mp3Header(f.hdr[k]);
  assert.equal(h.version, 'MPEG-1'); assert.equal(h.layer, 'Layer III'); assert.equal(h.kbps, 192); assert.equal(h.sampleRate, 44100);
  const loop = framesIn(f, 10, 12);
  assert.ok(Math.abs(loop.count - Math.round(2 / 0.026122)) <= 1, 'about 77 frames in 2 s: ' + loop.count);
  assert.ok(loop.min >= 626 && loop.max <= 627);
  assert.equal(lameGapless(new Uint8Array(200), 0), null, 'no LAME tag: null');
});

test('decoder fields: MP3 side info on a real file follows the block grammar', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseBitrate } = await import('../src/core/bitrate.ts');
  const { blockMix } = await import('../src/core/bitstream.ts');
  const f = parseBitrate(readFileSync(new URL('../public/Naina-Moray-Coke-Studio-129-205.mp3', import.meta.url))).frames;
  const d = f.dec;
  assert.equal(d.codec, 'mp3');
  const mix = blockMix(d, 0, d.block.length - 1);
  assert.equal(mix.known, f.t.length, 'every frame read');
  assert.ok(mix.long > 0.8 && mix.short > 0, 'mostly long blocks, some short ones');
  // The reservoir is 9 bits (≤ 511 bytes) and a global gain is 8 bits.
  assert.ok(Math.max(...d.reservoir) <= 511);
  assert.ok([...d.gain].every(g => g <= 255));
});

test('decoder fields: an AAC CPE packet gives window sequence, shape, M/S and gain', async () => {
  const { decodeAac, transients, sizeHistogram } = await import('../src/core/bitstream.ts');
  // bits: id CPE(001) tag(0000) common(1) | ics: reserved(0) seq EIGHT_SHORT(10) shape KBD(1) max_sfb(1110) grouping(1111111)
  //       | ms_mask_present all(10) | global_gain 150(10010110)
  const bits = '001' + '0000' + '1' + '0' + '10' + '1' + '1110' + '1111111' + '10' + '10010110';
  const bytes = new Uint8Array(Math.ceil(bits.length / 8) + 4);
  for (let i = 0; i < bits.length; i++) if (bits[i] === '1') bytes[i >> 3] |= 0x80 >> (i & 7);
  const buf = new Uint8Array(100); buf.set(bytes, 10);
  const table = { unit: 'sample', t: new Float64Array([0]), dur: new Float32Array([0.023]), size: new Uint32Array([bytes.length]), offset: new Float64Array([10]), kbps: new Uint16Array(1), hdr: new Uint32Array(1), skipSec: 0 };
  const d = decodeAac(buf, table);
  assert.equal(d.element[0], 1, 'CPE');
  assert.equal(d.block[0], 2, 'eight short');
  assert.equal(d.shape[0], 1, 'KBD');
  assert.equal(d.ms[0], 2, 'M/S on all bands');
  assert.equal(d.gain[0], 150);
  assert.equal(d.bits[0], 14, 'max_sfb');
  assert.equal(transients({ block: Uint8Array.from([0, 1, 2, 2, 3, 0, 2, 0]) }, 0, 7), 2);
  assert.deepEqual(sizeHistogram([10, 20, 20, 30], 0, 3, 2).counts, [1, 3]);
});

test('decoder fields: in a real AAC file every window overlaps its neighbour correctly', async () => {
  const { existsSync, readFileSync } = await import('node:fs');
  const p = new URL('../musicdna/service/audio_cache/06f0b181-a56f-4f88-acbd-9b186fb4c93d.m4a', import.meta.url);
  if (!existsSync(p)) return; // the local service cache is not in every checkout
  const { parseBitrate } = await import('../src/core/bitrate.ts');
  const i = parseBitrate(readFileSync(p));
  assert.equal(i.profile, 'AAC-LC');
  const b = i.frames.dec.block;
  let bad = 0;
  // ISO 14496-3 overlap rule: a window ending in a short slope (START, SHORT) must be followed by
  // one starting with a short slope (SHORT, STOP); a long ending (LONG, STOP) by LONG or START.
  // (START → STOP directly is legal; encoders use it.)
  for (let k = 1; k < b.length; k++) {
    const shortEnd = b[k - 1] === 1 || b[k - 1] === 2, shortStart = b[k] === 2 || b[k] === 3;
    if (shortEnd !== shortStart) bad++;
  }
  assert.equal(bad, 0, 'every packet overlaps its neighbour with matching slopes');
});

test('envelope: min/max per step, silence is flat (ALIGN FIX)', async () => {
  const { makeEnvelope } = await import('../src/core/envelope.ts');
  const sr = 1000, mono = new Float32Array(sr).map((_, i) => (i < 500 ? Math.sin(i / 3) * 0.5 : 0));
  const e = makeEnvelope(mono, sr, 10);
  assert.equal(e.max.length, 10);
  assert.ok(e.max[0] > 0.45 && e.min[0] < -0.45, 'the tone fills its steps');
  assert.equal(e.max[9], 0); assert.equal(e.min[9], 0);
});

test('nerds zoom: steps, Fit, pointer-anchored zoom and pan (ZOOM FIX)', async () => {
  const z = await import('../src/core/zoom.ts');
  const r = { a: 10, b: 22 }, fit = { span: null, center: 16, follow: false };
  assert.deepEqual(z.viewOf(fit, r, 15), [10, 22]);
  const in1 = z.stepZoom(fit, r, 15, -1);
  assert.equal(in1.span, 10); assert.equal(in1.center, 15, 'from Fit: centred on the playhead');
  const in2 = z.stepZoom(z.stepZoom(in1, r, 15, -1), r, 15, -1);
  assert.equal(in2.span, 2);
  assert.deepEqual(z.viewOf(in2, r, 15), [14, 16]);
  assert.equal(z.stepZoom(z.stepZoom(z.stepZoom(in2, r, 15, 1), r, 15, 1), r, 15, 1).span, null, 'out past the passage: Fit');
  const at = z.zoomAt({ span: 10, center: 15, follow: true }, r, 15, 0.5, 12);
  assert.equal(at.follow, false); assert.equal(at.span, 5);
  const [a0, a1] = z.viewOf(at, r, 15);
  assert.ok(Math.abs((12 - a0) / (a1 - a0) - (12 - 10) / 10) < 1e-9, 'the time under the pointer stays put');
  assert.deepEqual(z.viewOf(z.panBy({ span: 2, center: 15, follow: false }, r, 0, 100), r, 0), [20, 22], 'pan stops at the end');
  assert.equal(z.panBy(fit, r, 0, 3), fit, 'nothing to pan at Fit');
  assert.equal(z.spanLabel(0.5), '500 ms'); assert.equal(z.spanLabel(2), '2 s'); assert.equal(z.spanLabel(90), '1:30');
});

test('spectrum: two frames per FFT and the shared pass give the same pictures (SPEED FIX)', () => {
  const sr = SPEC_SR, x = new Float32Array(sr * 3).map((_, i) => 0.4 * Math.sin(2 * Math.PI * 440 * i / sr) + 0.2 * Math.sin(2 * Math.PI * 3100 * i / sr) * (i % 9000 < 4500 ? 1 : 0));
  const mel = computeSpectrum(x), lin = computeView(x, 'linear');
  assert.equal(mel.linear.frames, lin.frames);
  let maxDiff = 0;
  for (let i = 0; i < lin.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs(mel.linear.data[i] - lin.data[i]));
  assert.ok(maxDiff <= 1, 'linear from the mel pass = linear on its own (rounding only): ' + maxDiff);
  // An odd frame count still fills the last frame (its partner in the FFT is silence).
  const odd = computeView(new Float32Array(SPEC_HOP * 4 + 1).fill(0.1), 'linear');
  assert.equal(odd.frames, 5);
});

test('frame inspector: MP3 side info obeys the bit reservoir in every frame of a real file', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseBitrate } = await import('../src/core/bitrate.ts');
  const { mp3SideInfo, mp3HeaderFields, reservoirSource } = await import('../src/core/bitstream.ts');
  const file = new Uint8Array(readFileSync(new URL('../public/Naina-Moray-Coke-Studio-129-205.mp3', import.meta.url)));
  const f = parseBitrate(file).frames;
  let over = 0, checked = 0;
  for (let i = 0; i + 1 < f.t.length; i++) {
    const a = mp3SideInfo(file.subarray(f.offset[i], f.offset[i] + f.size[i]), f.hdr[i]);
    const b = mp3SideInfo(file.subarray(f.offset[i + 1], f.offset[i + 1] + f.size[i + 1]), f.hdr[i + 1]);
    const mainBytes = f.size[i] - 4 - a.crcBytes - a.sideBytes;
    const used = a.granules.flat().reduce((s, g) => s + g.part23, 0) / 8;
    // bytes this frame can use = what it inherits + its own main data − what it leaves for the next
    if (used > a.mainDataBegin + mainBytes - b.mainDataBegin + 1) over++;
    checked++;
  }
  assert.equal(over, 0, `audio data fits the reservoir in all ${checked} frames`);
  const k = 100, fields = mp3HeaderFields(f.hdr[k]);
  assert.deepEqual(fields.map(x => x.bits).reduce((s, x) => s + x, 0), 32);
  assert.equal(fields[0].text, 'frame sync');
  assert.equal(fields.find(x => x.name === 'bitrate').text, '192 kbps');
  const src = reservoirSource(f, k, mp3SideInfo(file.subarray(f.offset[k], f.offset[k] + f.size[k]), f.hdr[k]).mainDataBegin);
  if (src) assert.ok(src.from <= src.to && src.to === k - 1);
});

test('frame inspector: AAC fields of a hand-made CPE packet, in order', async () => {
  const { aacFields, aacPacket } = await import('../src/core/bitstream.ts');
  const bits = '001' + '0000' + '1' + '0' + '10' + '1' + '1110' + '1011111' + '10' + '10010110';
  const b = new Uint8Array(Math.ceil(bits.length / 8) + 2);
  for (let i = 0; i < bits.length; i++) if (bits[i] === '1') b[i >> 3] |= 0x80 >> (i & 7);
  const fields = aacFields(b);
  assert.deepEqual(fields.map(x => x.name), ['id_syn_ele', 'element_tag', 'common_window', 'ics_reserved', 'window_sequence', 'window_shape', 'max_sfb', 'sf_grouping', 'ms_mask_present', 'global_gain']);
  assert.equal(fields.find(x => x.name === 'global_gain').value, 150);
  const p = aacPacket(b);
  assert.equal(p.element, 'CPE'); assert.equal(p.channels[0].groups, 2, 'grouping 1011111: one 0 → two groups');
});
