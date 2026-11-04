import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeAudioEngine } from '../src/core/audioEngine.ts';
import { ListeningLog, readMediaTime } from '../src/core/listening.ts';
import {
  RegionController, enforceMinimumSelection, rangeAround, defaultLoopRange, previewStart, seekTarget, quickSaveRange,
} from '../src/core/playback.ts';
import { computePeaks, placeholderPeaks } from '../src/core/waveformPeaks.ts';
import { toDbMoment, withTags, collectionsOf, newMoment, savedRanges } from '../src/core/moments.ts';
import { barAt, beatInBar, blockIndexAt, noteName, passageMoments, rankIn } from '../src/core/timeline.ts';
import { computeSpectrum, fft, hzToMel, melFilters, melToHz, SPEC_SR } from '../src/core/spectrum.ts';

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

// ---------- phase 2: rules behind Library, My Moments, Discover, My Music DNA, Feature analysis ----------
import { computeTraits, traitShare, traitLevel, levelWord, ringLayout, portraitParts, evidenceNote, withoutTrait } from '../src/core/dna.ts';
import { suggestionFamily, whyLine, ratingRow, ratingOf, DISCOVER_TABS } from '../src/core/discover.ts';
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
  assert.match(whyLine('First Light'), /one of your saved passages in First Light/);
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
  assert.match(drop.text, /^Drums and Bass drop out\. The voice carries it alone until 0:2[56]\.$/);
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
