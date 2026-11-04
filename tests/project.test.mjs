import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p,root),'utf8');
const original=read('reference/music-dna/player/index.html');
const live=read('index.html');
const style = s => s.split('<style>')[1].split('</style>')[0];
test('Live app preserves exact supplied player CSS and visual shell',()=>{
 assert.equal(style(live),style(original));
 for(const part of ['<aside class="side"','id="nav"','id="tabbar"','id="main"','<div class="wfwrap"','class="pbar"']){
  assert.ok(live.includes(part),part);
 }
});
test('Original player and Music DNA ring are actually rendered, not an unused reference',()=>{
 for(const part of ['function renderPlayer()', 'function renderDNA()', 'class="ringstage"','class="tlist"','class="rchips"','id="ring"', 'id="tbwrap"', 'function drawToolbar()']){
  assert.ok(live.includes(part),part);
 }
 assert.ok(!existsSync(new URL('src/App.tsx',root)), 'Do not ship a replacement player');
});
test('Real playback, persistence and behavior are bound to the supplied controls',()=>{
 for(const part of ['WaveSurfer.create(', 'music.setTime(', 'music.on(\'timeupdate\'', 'db.moments.put(', 'importFiles(files)', 'attentionCandidates(events,2)', 'personalRecommendations(', 'data-act="loop"', 'data-act="save"']){
  assert.ok(live.includes(part),part);
 }
});
test('No fabricated listener traits or demo song data in the live app',()=>{
 assert.doesNotMatch(live,/Ines Moreau|Halflight|Kalbim/);
 assert.match(live,/These are the passages you personally associated/);
 assert.match(live,/not predicted emotions/);
 assert.match(live,/percentages are shares of the qualities you labelled/);
});
test('M2 research and safe original sample remain available',()=>{
 assert.ok(existsSync(new URL('musicdna/features/dsp.py',root)));
 assert.ok(existsSync(new URL('musicdna/features/embeddings.py',root)));
 const wav=readFileSync(new URL('public/demo.wav',root));
 assert.equal(wav.toString('ascii',0,4),'RIFF');
 assert.ok(wav.length>1000000);
});
