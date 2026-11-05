import test from 'node:test';
import assert from 'node:assert/strict';
import {attentionCandidates,personalRecommendations,preferenceSummaries,evaluatePreferences,cosineSimilarity,classifyFavReasons,selectActiveLearningQuestions,synthesizeMusicDnaInsight} from '../src/intelligence/personalize.ts';

const sec=(startSec,vec)=>({startSec,endSec:startSec+12,
 descriptors:{energy:0.3,brightness_hz:800,onset_activity:0.25,noisiness:0.1,zero_crossing_rate:0.05},embedding:vec});
const analysis=(id,segments,modelId='dsp-v1')=>({trackId:id,modelId,method:'dsp',durationSec:60,analyzedAt:1,segments});
const moment=(id,startSec=0)=>({id:`m-${id}`,trackId:id,startSec,endSec:startSec+12,feelings:['chills'],qualities:['vocal'],note:'',createdAt:1,updatedAt:1});
const rating=(id,startSec,value)=>({id:`${id}:${startSec}:${startSec+12}`,trackId:id,startSec,endSec:startSec+12,value,createdAt:1});
const ev=(id,kind,values={})=>({id,trackId:'a',sessionId:'S1',kind,at:100+Number(id),positionSec:20,origin:'user',...values});

test('user playback seeks/loop choices become ATTENTION only; automatic cycles and volume do not',()=>{
 const events=[ev('1','seek',{fromSec:55,toSec:20}),ev('2','seek',{fromSec:51,toSec:21}),
  ev('3','volume',{volume:0.9}),ev('4','loop_cycle',{origin:'player',momentStartSec:20,momentEndSec:35}),
  ev('5','loop_enabled',{momentStartSec:20,momentEndSec:35}),
  ev('6','loop_cycle',{origin:'player',momentStartSec:20,momentEndSec:35})];
 const result=attentionCandidates(events);
 assert.equal(result.length,1);
 assert.equal(result[0].startSec,20);
 assert.equal(result[0].backwardSeeks,2);
 assert.equal(result[0].loopStarts,1);
 assert.equal(result[0].loopCycles,1);
 assert.equal(attentionCandidates(events.filter(e=>e.origin==='player')).length,0);
 assert.equal(attentionCandidates([ev('8','volume',{volume:0.9}),ev('9','loop_cycle',{origin:'player'})]).length,0);
 assert.equal(attentionCandidates([ev('10','loop_enabled',{momentStartSec:20,momentEndSec:35}),ev('11','loop_cycle',{origin:'player',momentStartSec:20,momentEndSec:35}),ev('12','loop_cycle',{origin:'player',momentStartSec:20,momentEndSec:35})]).length,1);
});

test('same audio method, explicit likes and dislikes alter personalized ranking; no automatic attention labels',()=>{
 const all=[analysis('a',[sec(0,[1,0]),sec(12,[0,1])]),analysis('b',[sec(0,[0.98,0.2]),sec(12,[0.2,0.98])])];
 const m=[moment('a')];
 const without=personalRecommendations(all,m,[]);
 assert.equal(without.filter(x=>x.trackId==='b').length,2);
 assert.ok(without.every(x=>x.negativeExamples===0));
 const withNegative=personalRecommendations(all,m,[rating('a',12,'dislike')]);
 const liked=withNegative.find(x=>x.trackId==='b'&&x.startSec===0);
 const disliked=withNegative.find(x=>x.trackId==='b'&&x.startSec===12);
 assert.ok(liked && disliked);
 assert.ok(liked.score>disliked.score);
 assert.ok(liked.negativeExamples===1);
 assert.notEqual(liked.score,liked.baselineScore);
 assert.deepEqual(liked.evidence,['similar energy','similar brightness']);
 assert.equal(cosineSimilarity([1,0],[0,1]),0);
});

test('incompatible model families cannot silently share labels or embeddings',()=>{
 const all=[analysis('a',[sec(0,[1,0])]),analysis('unrelated',[sec(0,[1,0])],'clap-weights')];
 const result=personalRecommendations(all,[moment('a')],[]);
 assert.ok(result.every(x=>x.modelId==='dsp-v1'));
 const summaries=preferenceSummaries(all,[moment('a')],[],[]);
 assert.equal(summaries.find(x=>x.modelId==='clap-weights')?.status,'untrained');
});

test('rated windows are removed from suggestions; training labels can be undone without data rewriting',()=>{
 const all=[analysis('a',[sec(0,[1,0])]),analysis('b',[sec(0,[1,0]),sec(12,[0,1])])];
 const m=[moment('a')];
 const initially=personalRecommendations(all,m,[]);
 assert.ok(initially.some(x=>x.trackId==='b'&&x.startSec===0));
 const after=personalRecommendations(all,m,[rating('b',0,'like')]);
 assert.ok(!after.some(x=>x.trackId==='b'&&x.startSec===0));
 assert.equal(personalRecommendations(all,m,[]).length,initially.length);
});

test('leave-one-song-out evaluation requires independent positive and negative labels',()=>{
 const all=[analysis('a',[sec(0,[1,0]),sec(12,[0,1])]),analysis('b',[sec(0,[.9,.1]),sec(12,[.1,.9])])];
 const noTest=evaluatePreferences(all,[moment('a')],[rating('a',12,'dislike')])[0];
 assert.equal(noTest.comparedPairs,0);
 const result=evaluatePreferences(all,[moment('a')],[rating('a',12,'dislike'),rating('b',0,'like'),rating('b',12,'dislike')])[0];
 assert.equal(result.comparedPairs,1);
 assert.equal(result.testedTracks,1);
 assert.ok(result.baselineAccuracy>=0&&result.baselineAccuracy<=1);
 assert.ok(result.personalAccuracy>=0&&result.personalAccuracy<=1);
});

test('M4 FAV reason parsing, TROMPA active question selection, and Section 5 illustrative insight',()=>{
 const reasons=classifyFavReasons('Expressive vocals over a gradually intensifying instrumental arrangement',['Vocals']);
 assert.ok(reasons.includes('Vocals'));
 assert.ok(reasons.includes('Build-up'));
 assert.ok(reasons.includes('Instruments'));

 const segSlope={startSec:0,endSec:12,descriptors:{energy:0.35,brightness_hz:1400,onset_activity:0.4,noisiness:0.08,zero_crossing_rate:0.05,energy_slope:0.12,vocal_presence:0.55,spectral_flux:0.2},embedding:[0.8,0.6]};
 const all=[analysis('t1',[segSlope]),analysis('t2',[segSlope]),analysis('t3',[segSlope]),analysis('t4',[segSlope])];
 const m=[
  {...moment('t1',0),qualities:['Vocals','Build-up'],note:'Expressive vocals as music builds'},
  {...moment('t2',0),qualities:['Vocals','Build-up'],note:'Gradually intensifying arrangement'},
  {...moment('t3',0),qualities:['Vocals','Build-up'],note:'Vocal crescendo'},
  {...moment('t1',12),qualities:['Melody'],note:''},
  {...moment('t2',12),qualities:['Atmosphere'],note:''}
 ];
 const aq=selectActiveLearningQuestions(all,m,'t4',0,12,5);
 assert.equal(aq.chips.length,5);
 assert.match(aq.question,/vocals|intensity|stood out/i);

 const events=[
  ev('1','seek',{trackId:'t1',fromSec:25,toSec:2,sessionId:'s1'}),
  ev('2','seek',{trackId:'t1',fromSec:22,toSec:3,sessionId:'s2'}),
  ev('3','seek',{trackId:'t2',fromSec:24,toSec:1,sessionId:'s1'}),
  ev('4','seek',{trackId:'t2',fromSec:20,toSec:2,sessionId:'s2'})
 ];
 const insight=synthesizeMusicDnaInsight(all,m,[],events);
 assert.equal(insight.status,'verified');
 assert.equal(insight.headline,'You seem to enjoy vocal passages that become more intense as the music builds.');
 assert.ok(insight.evidence.includes('You confirmed liking three such passages.'));
 assert.ok(insight.evidence.includes('You repeatedly returned to two of them.'));
 assert.ok(insight.evidence.includes('DSP and deep audio analysis identified candidate similarities.'));
 assert.equal(insight.tryThisMoment,'Try this moment: A passage in an unfamiliar song with related musical characteristics.');
 assert.equal(insight.recommendedPassage?.trackId,'t4');
});
test('Bayesian taste model returns probabilities whose uncertainty shrinks with more labels',()=>{
 const tracks=['a','b','c','d'].map(id=>analysis(id,[sec(0,[1,0.05]),sec(12,[0.05,1])]));
 const target=analysis('new',[sec(0,[0.97,0.1]),sec(12,[0.1,0.97])]);
 const few=personalRecommendations([...tracks,target],[moment('a')],[rating('a',12,'dislike')]);
 const many=personalRecommendations([...tracks,target],['a','b','c'].map(id=>moment(id)),
  ['a','b','c'].map(id=>rating(id,12,'dislike')));
 const pick=(list,startSec)=>list.find(x=>x.trackId==='new'&&x.startSec===startSec);
 for(const x of [...few,...many]){assert.ok(x.score>=0&&x.score<=1);assert.ok(x.uncertainty>=0);}
 assert.ok(pick(many,0).score>pick(many,12).score);
 assert.ok(pick(many,0).uncertainty<pick(few,0).uncertainty);
});

test('taste model learns per listener how much DSP vs CLAP similarity counts',()=>{
 // Liked windows share one DSP pattern but have unrelated CLAP vectors; disliked ones the reverse.
 let seed=7;const rand=()=>((seed=(seed*16807)%2147483647)/2147483647)-0.5;
 const clap=()=>Array.from({length:8},rand), unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
 const likedDsp=unit([1,0.8,0,0]), otherDsp=()=>unit([rand(),rand(),1,1]);
 const fused=(deep,dsp)=>({...sec(0,[...deep,...dsp]),deepEmbedding:unit(deep),dspEmbedding:dsp});
 const tracks=Array.from({length:6},(_,i)=>analysis(`t${i}`,[
   {...fused(clap(),likedDsp),startSec:0,endSec:12},{...fused(clap(),otherDsp()),startSec:12,endSec:24}],'multimodal-v1'));
 const m=tracks.map(t=>moment(t.trackId,0)), r=tracks.map(t=>rating(t.trackId,12,'dislike'));
 const [summary]=preferenceSummaries(tracks,m,r,[]);
 assert.ok(summary.familyShare, 'multimodal analyses report a learned family share');
 assert.ok(summary.familyShare.dsp>summary.familyShare.clap, JSON.stringify(summary.familyShare));
});
