import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');

/** Every .vue / .ts file under src/, concatenated: the Vue app's shipped source. */
function walk(dir) {
  return readdirSync(new URL(dir, root)).flatMap(name => {
    const p = dir + name;
    return statSync(new URL(p, root)).isDirectory() ? walk(p + '/') : /\.(vue|ts)$/.test(name) ? [p] : [];
  });
}
const vueFiles = walk('src/');
const app = vueFiles.map(read).join('\n');
const entry = read('index.html');
const legacy = read('legacy/original-player.html');
const original = read('reference/music-dna/player/index.html');
const style = s => s.split('<style>')[1].split('</style>')[0];

// ---------- the Vue app is the player ----------

test('index.html mounts the Vue app; the classic player is not the entry any more', () => {
  assert.match(entry, /<div id="app"><\/div>/);
  assert.match(entry, /src="\/src\/main\.ts"/);
  assert.doesNotMatch(entry, /function renderPlayer\(\)/);
  const vite = read('vite.config.ts');
  assert.match(vite, /main: 'index\.html'/);
  assert.match(vite, /legacy: 'legacy\/original-player\.html'/);
});

test('every screen is a real Vue route, none is a placeholder', () => {
  const router = read('src/router/index.ts');
  for (const [path, file] of [['/', 'now-playing/NowPlayingView'], ['/library', 'library/LibraryView'], ['/moments', 'moments/MomentsView'],
    ['/discover', 'discover/DiscoverView'], ['/dna', 'dna/MusicDnaView'], ['/settings', 'settings/SettingsView'], ['/admin', 'admin/AdminView']]) {
    assert.ok(router.includes(`path: '${path}'`), path);
    assert.ok(router.includes(`features/${file}.vue`), file);
    assert.ok(existsSync(new URL(`src/features/${file}.vue`, root)), file);
  }
  assert.ok(!existsSync(new URL('src/features/classic/ClassicScreen.vue', root)), 'placeholder screen removed');
  assert.ok(!existsSync(new URL('src/App.tsx', root)), 'no React replacement player');
});

test('design-system components exist as separate ui/ components, incl. TraitRing and TraitRow', () => {
  for (const c of ['Waveform', 'SelectionToolbar', 'AskRow', 'DescribeStrip', 'PlaybackBar', 'Chip', 'Button', 'NavItem', 'Toast', 'TraitRing', 'TraitRow', 'MomentRow', 'Cover']) {
    assert.ok(existsSync(new URL(`src/ui/${c}.vue`, root)), c);
  }
  const dna = read('src/features/dna/MusicDnaView.vue');
  assert.match(dna, /<TraitRing/);
  assert.match(dna, /<TraitRow/);
  assert.match(read('src/ui/Switch.vue'), /role="switch"/);
});

test('components never touch Dexie: data goes through stores → core/repository', () => {
  for (const f of vueFiles.filter(f => f.endsWith('.vue'))) {
    const s = read(f);
    assert.doesNotMatch(s, /from ['"][./]*\/data\/db['"]/, f + ' imports data/db');
    assert.doesNotMatch(s, /core\/repository/, f + ' imports core/repository');
    assert.doesNotMatch(s, /\bdb\.(tracks|moments|events|settings|analyses|ratings)\b/, f + ' uses Dexie');
  }
  for (const f of vueFiles.filter(f => f.startsWith('src/stores/'))) {
    assert.doesNotMatch(read(f), /\bdb\.(tracks|moments|events|settings|analyses|ratings)\b/, f + ' uses Dexie directly (use core/repository)');
  }
});

test('real playback, persistence and behaviour are wired in the Vue app', () => {
  for (const part of ['new NativeAudioEngine(', 'readMediaTime(', 'putMoment(', 'importAudioFiles(', 'attentionCandidates(events, 2)',
    'personalRecommendations(', 'putRating(', 'clearListeningEvents(', 'downloadProfile(', 'deleteTrackEverywhere(', 'playQueue(']) {
    assert.ok(app.includes(part), part);
  }
});

test('No fabricated listener traits or demo song data in the Vue app; honest DNA copy', () => {
  assert.doesNotMatch(app, /Ines Moreau|Halflight|Kalbim|Paper Harbour/);
  assert.match(app, /These are the passages you personally associated/);
  assert.match(app, /not predicted emotions/);
  assert.match(app, /percentages are shares of the qualities you labelled/);
  assert.match(app, /Only proceed if you have rights to analyze this recording/);
});

test('every SYNC FIX / DELAY FIX keeps its explanation in the shared core or the Vue app', () => {
  const all = app + read('legacy/original-player.html');
  for (const fix of ['SYNC FIX 1', 'SYNC FIX 2', 'SYNC FIX 5', 'SYNC FIX 6', 'SYNC FIX 7', 'SYNC FIX 8', 'SYNC FIX 9', 'DELAY FIX 3', 'DELAY FIX 4']) {
    assert.ok(all.includes(fix), fix);
  }
  assert.ok(app.includes('SYNC FIX 8'), 'SYNC FIX 8 in the Vue playback store');
});

// ---------- the legacy original player still exists and still works ----------

test('legacy player keeps the exact supplied CSS, shell and its real behaviour', () => {
  assert.equal(style(legacy), style(original));
  for (const part of ['<aside class="side"', 'id="nav"', 'id="main"', 'function renderPlayer()', 'function renderDNA()', 'id="ring"', "music.on('timeupdate'", 'db.moments.put(', 'importFiles(files)']) {
    assert.ok(legacy.includes(part), part);
  }
  // Imports were rewritten for the new folder: ../src/…, never ./src/….
  assert.match(legacy, /from '\.\.\/src\/core\/audioEngine\.ts'/);
  assert.doesNotMatch(legacy, /from '\.\/src\//);
  assert.doesNotMatch(legacy, /Ines Moreau|Halflight|Kalbim/);
});

test('M2 research and safe original sample remain available', () => {
  assert.ok(existsSync(new URL('musicdna/features/dsp.py', root)));
  assert.ok(existsSync(new URL('musicdna/features/embeddings.py', root)));
  const wav = readFileSync(new URL('public/demo.wav', root));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.ok(wav.length > 1000000);
});
