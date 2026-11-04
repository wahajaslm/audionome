import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeAudioEngine } from '../src/core/audioEngine.ts';
import { ListeningLog, readMediaTime } from '../src/core/listening.ts';
import {
  RegionController, enforceMinimumSelection, rangeAround, defaultLoopRange, previewStart, seekTarget, quickSaveRange,
} from '../src/core/playback.ts';
import { computePeaks, placeholderPeaks } from '../src/core/waveformPeaks.ts';
import { toDbMoment, withTags, collectionsOf, newMoment, savedRanges } from '../src/core/moments.ts';

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

test('peaks are laid out on the media duration, not the decoded length (SYNC FIX 9)', () => {
  const rate = 100, decoded = 10.05, media = 10;
  const ch = new Float32Array(Math.round(decoded * rate));
  ch[999] = 1;   // 9.99 s: inside the media, must land in the last bar
  ch[1004] = 1;  // 10.04 s: encoder padding past the media end, must be ignored
  const peaks = computePeaks(ch, rate, media, decoded, 400);
  assert.equal(peaks.length, 400);
  assert.ok(peaks[399] > 0.99, 'last bar holds the 9.99 s peak');
  assert.ok(peaks.slice(0, 399).every(v => v < 0.1));
  assert.equal(placeholderPeaks().length, 400);
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
