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

// PRACTICE FIX (core/practice.ts): drill is listed under Practising and is not taste.
import {splitPractice,practicePassages,practicingNow,PRACTICE_MIN_CYCLES} from '../src/core/practice.ts';
const loopEpisode=(base,cycles,extra={},session='S1')=>[
 {id:`${base}e`,trackId:'a',sessionId:session,kind:'loop_enabled',at:base,positionSec:70,origin:'user',momentStartSec:70,momentEndSec:78,...extra},
 ...Array.from({length:cycles},(_,i)=>({id:`${base}c${i}`,trackId:'a',sessionId:session,kind:'loop_cycle',at:base+1+i,positionSec:78,origin:'player',momentStartSec:70,momentEndSec:78,...extra})),
 {id:`${base}d`,trackId:'a',sessionId:session,kind:'loop_disabled',at:base+cycles+1,positionSec:75,origin:'user',momentStartSec:70,momentEndSec:78},
];

test('practice: a few loops are listening; a long loop is practice from its first cycle',()=>{
 const short=loopEpisode(100,3), long=loopEpisode(200,PRACTICE_MIN_CYCLES);
 const {listening,practice}=splitPractice([...short,...long]);
 assert.equal(practice.length,long.length,'the whole long episode, including loop_enabled');
 assert.equal(listening.length,short.length);
 assert.ok(attentionCandidates(short).length>0,'3 cycles of a favourite still count as interest');
 assert.equal(attentionCandidates(long).length,0,'20× drill no longer becomes "a moment you return to"');
});

test('practice: one slowed cycle makes the loop practice; slowed seeks outside loops too; dismissals never',()=>{
 const slowed=loopEpisode(100,2);
 slowed[2]={...slowed[2],mode:'practice',rate:0.75};
 assert.equal(splitPractice(slowed).listening.length,0);
 const seek={id:'s',trackId:'a',sessionId:'S1',kind:'seek',at:500,positionSec:90,origin:'user',fromSec:90,toSec:70,mode:'practice',rate:0.5};
 const dismiss={id:'x',trackId:'a',sessionId:'S1',kind:'dismiss_candidate',at:501,positionSec:70,origin:'user',mode:'practice'};
 const r=splitPractice([seek,dismiss]);
 assert.deepEqual(r.practice.map(e=>e.id),['s']);
 assert.deepEqual(r.listening.map(e=>e.id),['x']);
});

test('practice: passages group sessions, add cycles and keep the slowest speed',()=>{
 const monday=loopEpisode(100,8,{},'S1');
 const today=loopEpisode(300,12,{mode:'practice',rate:0.75},'S2');
 const [p,...rest]=practicePassages([...monday,...today]);
 assert.equal(rest.length,0);
 assert.deepEqual({cycles:p.cycles,sessions:p.sessions,slowestRate:p.slowestRate,a:p.a,b:p.b},{cycles:20,sessions:2,slowestRate:0.75,a:70,b:78});
});

test('practice: live rule is speed below 1x or a loop past the cycle threshold',()=>{
 assert.equal(practicingNow({rate:0.9,loop:false,loops:0}),true);
 assert.equal(practicingNow({rate:1,loop:true,loops:PRACTICE_MIN_CYCLES-1}),false);
 assert.equal(practicingNow({rate:1,loop:true,loops:PRACTICE_MIN_CYCLES}),true);
});

// Moment radio (core/radio.ts)
import {radioQueue,radioKey,MOMENT_EVERY} from '../src/core/radio.ts';
const sg=(t,a)=>({trackId:t,startSec:a,endSec:a+12});

test('radio: mostly suggestions, a saved moment every 4th, no repeats, no dislikes',()=>{
 const sugg=[sg('a',0),sg('b',0),sg('a',30),sg('c',0),sg('b',30),sg('d',0),sg('d',30),sg('e',0)];
 const moms=[sg('m',10),sg('n',10)];
 const q=radioQueue(sugg,moms,[{trackId:'c',startSec:0,endSec:12,value:'dislike'}],new Set(),8);
 assert.deepEqual(q.map(x=>x.source),['suggestion','suggestion','suggestion','moment','suggestion','suggestion','suggestion','moment']);
 assert.equal(MOMENT_EVERY,4);
 assert.ok(!q.some(x=>x.trackId==='c'),'disliked passage left out');
 assert.equal(new Set(q.map(radioKey)).size,q.length,'no passage twice');
 for(let i=1;i<q.length;i++) if(q[i].trackId===q[i-1].trackId) assert.fail('same song twice in a row at '+i);
});

test('radio: what was played is skipped; a suggestion inside a saved moment is not played twice',()=>{
 const q=radioQueue([sg('a',0),sg('m',12)],[sg('m',10)],[],new Set(['a:0']),5);
 assert.deepEqual(q.map(x=>[x.trackId,x.a,x.source]),[['m',10,'moment']]);
});
