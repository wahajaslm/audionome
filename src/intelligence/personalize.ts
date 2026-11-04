import type {AudioSegment, ListeningEvent, Moment, MomentRating, TrackAnalysis, BehavioralFeatures, AttentionConfidence} from '../data/types';

/** Personal preference model v2: Bayesian logistic regression over similarities to labeled passages.
 * Features are cosine similarities to each liked/disliked example (a kernel model), fitted by
 * Newton/IRLS to the MAP weights with a Gaussian prior; the Laplace posterior gives each score an
 * uncertainty. Unlabeled library windows act as weak negatives so likes alone can still rank.
 * It learns from user-confirmed choices; it is NOT an emotion detector.
 */
export interface PreferenceSuggestion {
  trackId:string; startSec:number; endSec:number; modelId:string;
  /** Posterior probability the listener likes this passage (0-1). */
  score:number; uncertainty:number; baselineScore:number; positiveExamples:number; negativeExamples:number;
  confidence:'experimental'|'developing'; evidence:string[];
  matchingMoment?:{trackId:string;startSec:number;endSec:number};
}
export interface PreferenceSummary {
  modelId:string; positives:number; negatives:number; observedReturns:number;
  status:'untrained'|'early'|'developing';
}
export interface PreferenceEvaluation {modelId:string; comparedPairs:number; testedTracks:number; baselineAccuracy:number; personalAccuracy:number; note:string}
export interface AttentionCandidate {
  trackId:string; startSec:number; endSec:number;
  confidence?: AttentionConfidence;
  behavior?: BehavioralFeatures;
  backwardSeeks:number; loopStarts:number; loopCycles:number;
  sessions:number; lastSeen:number; reason:string[]; dismissed?:boolean;
}

type Passage={trackId:string;startSec:number;endSec:number};
type Example=Passage & {value:1|-1;weight:number;vector:number[];segment:AudioSegment};
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(v,b));
const spanOverlap=(a:Passage,b:Passage)=>Math.max(0,Math.min(a.endSec,b.endSec)-Math.max(a.startSec,b.startSec));
export function cosineSimilarity(a:number[],b:number[]):number {
  if(!a.length||a.length!==b.length)return 0;
  let dot=0,aa=0,bb=0;
  for(let i=0;i<a.length;i++) {dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  return aa>0&&bb>0 ? clamp(dot/Math.sqrt(aa*bb),-1,1):0;
}
function vectorFor(analysis:TrackAnalysis,passage:Passage):{vector:number[];segment:AudioSegment}|null {
  const segments=analysis.segments.filter(s=>spanOverlap({...s,trackId:passage.trackId},passage)>0);
  if(!segments.length)return null;
  const dims=segments[0].embedding.length;
  if(!dims)return null;
  const value=Array<number>(dims).fill(0);let weight=0;
  for(const section of segments){
    if(section.embedding.length!==dims)continue;
    const seconds=spanOverlap({...section,trackId:passage.trackId},passage);
    if(seconds<=0)continue;
    weight+=seconds;
    section.embedding.forEach((v,i)=>{value[i]+=v*seconds;});
  }
  if(!weight)return null;
  return {vector:value.map(v=>v/weight),segment:segments[0]};
}
function examplesFor(analyses:TrackAnalysis[], moments:Moment[], ratings:MomentRating[],modelId:string,omitTrack?:string):Example[] {
  const byTrack=new Map(analyses.filter(a=>a.modelId===modelId).map(a=>[a.trackId,a]));
  const entries: (Passage & {value:1|-1;weight:number})[]=[];
  for(const m of moments) if(m.trackId!==omitTrack) entries.push({...m,value:1,weight:2});
  for(const r of ratings) if(r.trackId!==omitTrack) entries.push({...r,value:r.value==='like'?1:-1,weight:1});
  const output:Example[]=[];
  for(const e of entries){
    const analysis=byTrack.get(e.trackId);
    if(!analysis)continue;
    // An explicit dislike near a saved favorite is contradictory; don't train on either.
    if(entries.some(other=>other!==e && other.trackId===e.trackId && other.value!==e.value &&
      spanOverlap(e,other)>0.5*Math.min(e.endSec-e.startSec,other.endSec-other.startSec)))continue;
    const encoded=vectorFor(analysis,e);
    if(encoded)output.push({...e,...encoded});
  }
  return output;
}
const PRIOR_VARIANCE=4;
const BACKGROUND_WEIGHT_RATIO=0.25;
const MAX_BACKGROUND=40;
const sigmoid=(z:number)=>1/(1+Math.exp(-z));
type Anchor={vector:number[];value:1|-1;weight:number};
interface TasteModel {examples:Example[];anchors:Example[];weights:number[];covariance:number[][]}

/** Solves A x = b for a small symmetric positive-definite matrix (Gauss-Jordan with partial pivoting). */
function solve(a:number[][],b:number[][]):number[][] {
  const n=a.length,m=b[0].length;
  const A=a.map((row,i)=>[...row,...b[i]]);
  for(let c=0;c<n;c++){
    let pivot=c;
    for(let r=c+1;r<n;r++)if(Math.abs(A[r][c])>Math.abs(A[pivot][c]))pivot=r;
    [A[c],A[pivot]]=[A[pivot],A[c]];
    const d=A[c][c]||1e-12;
    for(let k=c;k<n+m;k++)A[c][k]/=d;
    for(let r=0;r<n;r++){
      if(r===c||!A[r][c])continue;
      const f=A[r][c];
      for(let k=c;k<n+m;k++)A[r][k]-=f*A[c][k];
    }
  }
  return A.map(row=>row.slice(n));
}
function features(vector:number[],anchors:Example[]):number[] {
  return [1,...anchors.map(a=>cosineSimilarity(vector,a.vector))];
}
/** Fits the MAP weights and Laplace covariance. Background windows are evenly spaced unlabeled segments. */
function fitTasteModel(examples:Example[],background:number[][]):TasteModel {
  const anchors=examples;
  const positiveWeight=examples.filter(e=>e.value===1).reduce((sum,e)=>sum+e.weight,0);
  const step=Math.max(1,Math.ceil(background.length/MAX_BACKGROUND));
  const sampled=background.filter((_,i)=>i%step===0);
  const backgroundWeight=sampled.length?BACKGROUND_WEIGHT_RATIO*positiveWeight/sampled.length:0;
  const rows:Anchor[]=[...examples,...sampled.map(vector=>({vector,value:-1 as const,weight:backgroundWeight}))];
  const X=rows.map(r=>features(r.vector,anchors)),y=rows.map(r=>r.value===1?1:0),c=rows.map(r=>r.weight);
  const d=anchors.length+1;
  let w=Array<number>(d).fill(0);
  let hessian:number[][]=[];
  for(let iter=0;iter<25;iter++){
    const gradient=w.map(v=>v/PRIOR_VARIANCE);
    hessian=Array.from({length:d},(_,i)=>Array.from({length:d},(_,j)=>i===j?1/PRIOR_VARIANCE:0));
    X.forEach((x,n)=>{
      const p=sigmoid(x.reduce((sum,v,i)=>sum+v*w[i],0));
      for(let i=0;i<d;i++){
        gradient[i]+=c[n]*(p-y[n])*x[i];
        for(let j=0;j<d;j++)hessian[i][j]+=c[n]*p*(1-p)*x[i]*x[j];
      }
    });
    const delta=solve(hessian,gradient.map(g=>[g])).map(r=>r[0]);
    w=w.map((v,i)=>v-delta[i]);
    if(Math.max(...delta.map(Math.abs))<1e-6)break;
  }
  const identity=Array.from({length:d},(_,i)=>Array.from({length:d},(_,j)=>i===j?1:0));
  return {examples,anchors,weights:w,covariance:solve(hessian,identity)};
}
/** MacKay probit approximation to the posterior predictive; uncertainty is the logit's posterior std. */
function score(vector:number[],model:TasteModel):{personal:number;uncertainty:number;baseline:number;match:Example|null} {
  const positive=model.examples.filter(e=>e.value===1);
  if(!positive.length)return {personal:0,uncertainty:1,baseline:0,match:null};
  let match=positive[0];let maxPos=-Infinity;
  for(const e of positive){const s=cosineSimilarity(vector,e.vector);if(s>maxPos){maxPos=s;match=e;}}
  const x=features(vector,model.anchors);
  const mean=x.reduce((sum,v,i)=>sum+v*model.weights[i],0);
  const variance=Math.max(0,x.reduce((sum,xi,i)=>sum+xi*x.reduce((inner,xj,j)=>inner+model.covariance[i][j]*xj,0),0));
  return {personal:sigmoid(mean/Math.sqrt(1+Math.PI*variance/8)),uncertainty:Math.sqrt(variance),baseline:maxPos,match};
}
function backgroundFor(analyses:TrackAnalysis[],modelId:string,labeled:Passage[]):number[][] {
  return analyses.filter(a=>a.modelId===modelId).flatMap(a=>a.segments
    .filter(s=>!labeled.some(l=>l.trackId===a.trackId&&spanOverlap(l,{...s,trackId:a.trackId})>0))
    .map(s=>s.embedding));
}
function featureEvidence(segment:AudioSegment,ref:AudioSegment):string[] {
  const checks:[keyof AudioSegment['descriptors'],string][]=[
    ['energy','similar energy'],['brightness_hz','similar brightness'],['onset_activity','similar rhythmic activity'],['noisiness','similar tonal/noise balance']];
  const list = checks.filter(([k])=>{
    const a=segment.descriptors[k],b=ref.descriptors[k];
    return typeof a==='number'&&typeof b==='number'&&Number.isFinite(a)&&Number.isFinite(b)&&
      Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),0.05)<0.3;
  }).slice(0,2).map(([,name])=>name);

  // M3 Musical Structure & Instrument Intelligence evidence
  if (segment.descriptors.key && ref.descriptors.key && segment.descriptors.key === ref.descriptors.key) {
    list.push(`shared ${segment.descriptors.key} tonality`);
  }
  if (segment.descriptors.tempoBpm && ref.descriptors.tempoBpm && Math.abs(segment.descriptors.tempoBpm - ref.descriptors.tempoBpm) < 6) {
    list.push(`matching groove (${Math.round(segment.descriptors.tempoBpm)} BPM)`);
  }
  if (segment.descriptors.topInstruments && ref.descriptors.topInstruments) {
    const common = segment.descriptors.topInstruments.filter(inst => ref.descriptors.topInstruments?.includes(inst));
    if (common.length) {
      list.push(`instrumentation (${common.slice(0, 2).join(', ')})`);
    }
  }
  return list.slice(0, 3);
}
/** Only output real analyzed windows, grouped by compatible embedding model. */
export function personalRecommendations(analyses:TrackAnalysis[], moments:Moment[],ratings:MomentRating[],limit=15):PreferenceSuggestion[] {
  const models=[...new Set(analyses.map(a=>a.modelId))];
  const blocked=[...moments,...ratings];
  const all:PreferenceSuggestion[]=[];
  for(const modelId of models){
    const examples=examplesFor(analyses,moments,ratings,modelId);
    const pos=examples.filter(e=>e.value===1), neg=examples.filter(e=>e.value===-1);
    if(!pos.length)continue;
    const model=fitTasteModel(examples,backgroundFor(analyses,modelId,blocked));
    for(const analysis of analyses.filter(a=>a.modelId===modelId)) for(const segment of analysis.segments){
      const p={trackId:analysis.trackId,startSec:segment.startSec,endSec:segment.endSec};
      // Don't recommend labeled windows or their substantial overlaps again.
      if(blocked.some(b=>b.trackId===p.trackId&&spanOverlap(b,p) >= Math.min(4,(p.endSec-p.startSec)*0.35)))continue;
      const s=score(segment.embedding,model);
      all.push({...p,modelId,score:s.personal,uncertainty:s.uncertainty,baselineScore:s.baseline,positiveExamples:pos.length,
        negativeExamples:neg.length,confidence:pos.length>=5&&neg.length>=2?'developing':'experimental',
        evidence:s.match?featureEvidence(segment,s.match.segment):[],
        matchingMoment:s.match?{trackId:s.match.trackId,startSec:s.match.startSec,endSec:s.match.endSec}:undefined});
    }
  }
  const ratedTrackIds=new Set([...moments,...ratings].map(p=>p.trackId));
  // Prefer as-yet-unrated songs; never pretend these are preference probabilities.
  all.sort((a,b)=>Number(!ratedTrackIds.has(b.trackId))-Number(!ratedTrackIds.has(a.trackId))||b.score-a.score);
  const distinct:PreferenceSuggestion[]=[];
  for(const s of all){
    if(distinct.some(x=>x.trackId===s.trackId&&spanOverlap(x,s)>0))continue;
    distinct.push(s);
    if(distinct.length>=limit)break;
  }
  return distinct;
}
export function preferenceSummaries(analyses:TrackAnalysis[], moments:Moment[],ratings:MomentRating[],events:ListeningEvent[]):PreferenceSummary[]{
  return [...new Set(analyses.map(a=>a.modelId))].map(modelId=>{
    const examples=examplesFor(analyses,moments,ratings,modelId);
    const positives=examples.filter(x=>x.value===1).length,negatives=examples.filter(x=>x.value===-1).length;
    return {modelId,positives,negatives,observedReturns:attentionCandidates(events,1).length,
      status:!positives?'untrained':positives>=5&&negatives>=2?'developing':'early'};
  });
}
/** Candidate detector: captures 8 passive listening behaviors, reconstructing coverage and returns.
 * Output is evidence categories ('possible interest' / 'repeated interest'), never inferred emotions.
 * Automatic loop cycles are never treated as independent votes.
 */
export function attentionCandidates(events:ListeningEvent[], minSignals=2):AttentionCandidate[] {
  type Bin = {
    trackId: string;
    startSec: number;
    backwardSeeks: number;
    manualLoopStarts: number;
    loopCycles: number;
    seekArrivals: number;
    skipDepartures: number;
    volumeIncreases: number;
    listenedPasses: number;
    sessions: Set<string>;
    enabledSessions: Set<string>;
    dismissed: boolean;
    lastSeen: number;
  };

  const dismissedKeys = new Set<string>();
  for (const e of events) {
    if (e.kind === 'dismiss_candidate' && e.trackId && e.positionSec !== undefined) {
      dismissedKeys.add(`${e.trackId}:${Math.floor(e.positionSec / 5) * 5}`);
    }
  }

  const map = new Map<string, Bin>();
  const getBin = (trackId: string, startSec: number): Bin => {
    const key = `${trackId}:${startSec}`;
    let item = map.get(key);
    if (!item) {
      item = {
        trackId,
        startSec,
        backwardSeeks: 0,
        manualLoopStarts: 0,
        loopCycles: 0,
        seekArrivals: 0,
        skipDepartures: 0,
        volumeIncreases: 0,
        listenedPasses: 0,
        sessions: new Set<string>(),
        enabledSessions: new Set<string>(),
        dismissed: dismissedKeys.has(key),
        lastSeen: 0
      };
      map.set(key, item);
    }
    return item;
  };

  for (const e of [...events].sort((a,b)=>a.at-b.at)) {
    if (e.kind === 'seek' && e.origin === 'user' && e.fromSec !== undefined && e.toSec !== undefined) {
      if (e.fromSec - e.toSec >= 4) {
        // Rewind to passage
        const bin = getBin(e.trackId, Math.floor(e.toSec / 5) * 5);
        bin.backwardSeeks++;
        bin.sessions.add(e.sessionId);
        bin.lastSeen = Math.max(e.at, bin.lastSeen);
      } else if (e.toSec - e.fromSec >= 5) {
        // Direct seek arrival
        const bin = getBin(e.trackId, Math.floor(e.toSec / 5) * 5);
        bin.seekArrivals++;
        bin.sessions.add(e.sessionId);
        bin.lastSeen = Math.max(e.at, bin.lastSeen);
      }
    } else if (e.kind === 'skip' && e.origin === 'user' && e.positionSec !== undefined) {
      const bin = getBin(e.trackId, Math.floor(e.positionSec / 5) * 5);
      bin.skipDepartures++;
    } else if (e.kind === 'volume' && e.origin === 'user' && e.positionSec !== undefined) {
      const bin = getBin(e.trackId, Math.floor(e.positionSec / 5) * 5);
      bin.volumeIncreases++;
    } else if (e.kind === 'loop_enabled' && e.origin === 'user' && e.momentStartSec !== undefined && e.momentEndSec !== undefined && e.momentEndSec - e.momentStartSec >= 2) {
      const bin = getBin(e.trackId, Math.floor(e.momentStartSec / 5) * 5);
      bin.manualLoopStarts++;
      bin.enabledSessions.add(e.sessionId);
      bin.sessions.add(e.sessionId);
      bin.lastSeen = Math.max(e.at, bin.lastSeen);
    } else if (e.kind === 'loop_cycle' && e.origin === 'player' && e.momentStartSec !== undefined && e.momentEndSec !== undefined && e.momentEndSec - e.momentStartSec >= 2) {
      const bin = getBin(e.trackId, Math.floor(e.momentStartSec / 5) * 5);
      if (bin.enabledSessions.has(e.sessionId)) {
        bin.loopCycles++;
        bin.sessions.add(e.sessionId);
        bin.lastSeen = Math.max(e.at, bin.lastSeen);
      }
    } else if (e.kind === 'listen_span' && e.fromSec !== undefined && e.toSec !== undefined && e.durationSec && e.durationSec > 0) {
      const startBin = Math.floor(e.fromSec / 5) * 5;
      const endBin = Math.floor(e.toSec / 5) * 5;
      for (let s = startBin; s <= endBin; s += 5) {
        const bin = getBin(e.trackId, s);
        bin.listenedPasses++;
        bin.sessions.add(e.sessionId);
        bin.lastSeen = Math.max(e.at, bin.lastSeen);
      }
    }
  }

  return [...map.values()]
    .filter(x => !x.dismissed && (x.backwardSeeks + x.manualLoopStarts >= minSignals || (x.manualLoopStarts > 0 && x.loopCycles >= 2)))
    .map(x => {
      const isRepeated = x.sessions.size > 1 || (x.backwardSeeks + x.manualLoopStarts >= 3);
      const confidence: 'repeated interest' | 'possible interest' = isRepeated ? 'repeated interest' : 'possible interest';
      const reasons: string[] = [
        x.backwardSeeks ? `${x.backwardSeeks} backward seeks` : '',
        x.manualLoopStarts ? `${x.manualLoopStarts} user-started loops` : '',
        x.loopCycles ? `${x.loopCycles} loop completions` : '',
        x.sessions.size > 1 ? `${x.sessions.size} sessions` : '',
        x.seekArrivals ? `${x.seekArrivals} seek arrivals` : '',
        x.volumeIncreases ? 'volume increased during passage' : ''
      ].filter(Boolean);

      return {
        trackId: x.trackId,
        startSec: x.startSec,
        endSec: x.startSec + 15,
        confidence,
        backwardSeeks: x.backwardSeeks,
        loopStarts: x.manualLoopStarts,
        loopCycles: x.loopCycles,
        sessions: x.sessions.size,
        lastSeen: x.lastSeen,
        reason: reasons,
        behavior: {
          manualRewinds: x.backwardSeeks,
          manualLoopStarts: x.manualLoopStarts,
          listenedPasses: x.listenedPasses,
          distinctSessions: x.sessions.size,
          seekArrivals: x.seekArrivals,
          skipDepartures: x.skipDepartures,
          relativeVolumeChanges: x.volumeIncreases
        }
      };
    })
    .sort((a,b)=>b.backwardSeeks*2+b.loopStarts+b.loopCycles*.2-(a.backwardSeeks*2+a.loopStarts+a.loopCycles*.2)||b.lastSeen-a.lastSeen);
}
/** Research-only: leave-one-TRACK-out pairwise accuracy on labels supplied by the user.
 * Requires both positive and negative labels on held-out tracks plus labeled other tracks.
 * No quality claims if there are too few independent comparisons.
 */
export function evaluatePreferences(analyses:TrackAnalysis[],moments:Moment[],ratings:MomentRating[]):PreferenceEvaluation[] {
  return [...new Set(analyses.map(a=>a.modelId))].map(modelId=>{
    let personalWins=0,baselineWins=0,pairs=0,testedTracks=0;
    for(const target of analyses.filter(a=>a.modelId===modelId)){
      const held=ratings.filter(r=>r.trackId===target.trackId);
      const positives=held.filter(r=>r.value==='like'),negatives=held.filter(r=>r.value==='dislike');
      if(!positives.length||!negatives.length)continue;
      const training=examplesFor(analyses,moments,ratings,modelId,target.trackId);
      if(!training.some(e=>e.value===1)||!training.some(e=>e.value===-1))continue;
      const model=fitTasteModel(training,backgroundFor(analyses.filter(a=>a.trackId!==target.trackId),modelId,[...moments,...ratings]));
      testedTracks++;
      for(const p of positives)for(const n of negatives){
        const a=vectorFor(target,p),b=vectorFor(target,n);
        if(!a||!b)continue;
        const ps=score(a.vector,model),ns=score(b.vector,model);
        pairs++;
        personalWins+=ps.personal>ns.personal?1:ps.personal===ns.personal?.5:0;
        baselineWins+=ps.baseline>ns.baseline?1:ps.baseline===ns.baseline?.5:0;
      }
    }
    return {modelId,comparedPairs:pairs,testedTracks,baselineAccuracy:pairs?baselineWins/pairs:0,
      personalAccuracy:pairs?personalWins/pairs:0,
      note:pairs?'Exploratory pairwise ranking on held-out songs; not a population-level validation.':'Need positive and negative ratings on a held-out track, plus both kinds of examples on other analyzed tracks.'};
  });
}

/** M4.1 — FAV Corpus canonical musical-reason taxonomy & free-text explanation mapper. */
const FAV_KEYWORDS: Record<string, string[]> = {
  Vocals: ['vocal', 'voice', 'sing', 'singer', 'choir', 'falsetto', 'belt', 'vibrato'],
  'Build-up': ['build', 'intensif', 'crescendo', 'rising', 'grow', 'swell', 'escalat'],
  Drop: ['drop', 'climax', 'hit', 'release', 'impact'],
  Melody: ['melod', 'hook', 'tune', 'motif', 'riff', 'catchy'],
  Rhythm: ['rhythm', 'groove', 'beat', 'drum', 'percussion', 'syncopat', 'pulse'],
  Harmony: ['harmon', 'chord', 'modulation', 'key change', 'progression', 'resolve'],
  Instruments: ['instrument', 'guitar', 'piano', 'synth', 'bass', 'strings', 'arrangement', 'solo'],
  Atmosphere: ['atmosphere', 'texture', 'ambient', 'space', 'reverb', 'warm', 'pad'],
  Lyrics: ['lyric', 'word', 'line', 'story', 'meaning', 'phrase']
};

export function classifyFavReasons(note = '', qualities: string[] = []): string[] {
  const matched = new Set<string>();
  for (const q of qualities) {
    for (const canonical of Object.keys(FAV_KEYWORDS)) {
      if (q.toLowerCase() === canonical.toLowerCase()) matched.add(canonical);
    }
  }
  const lower = (note || '').toLowerCase();
  if (lower) {
    for (const [canonical, kws] of Object.entries(FAV_KEYWORDS)) {
      if (kws.some(kw => lower.includes(kw))) matched.add(canonical);
    }
  }
  return [...matched];
}

/** M4.4 — TROMPA-MER inspired intelligent question-selection strategy.
 * Selects the top musical-reason chips and question prompt for a saved passage
 * using acoustic salience + Shannon information gain over user traits.
 */
export interface ActiveQuestionPrompt {
  question: string;
  chips: string[];
}

export function selectActiveLearningQuestions(
  analyses: TrackAnalysis[],
  moments: Moment[],
  trackId: string,
  startSec: number,
  endSec: number,
  topK = 5,
  /** Timeline evidence for the passage (core/timeline.ts passageEvidence); replaces the window rule. */
  evidence?: { salience: Record<string, number>; question: string } | null
): ActiveQuestionPrompt {
  const candidates = ['Vocals', 'Melody', 'Instruments', 'Rhythm', 'Build-up', 'Harmony', 'Atmosphere', 'Drop'];
  const counts: Record<string, number> = Object.fromEntries(candidates.map(c => [c, 0]));
  for (const m of moments) {
    for (const q of classifyFavReasons(m.note, m.qualities)) {
      if (q in counts) counts[q]++;
    }
  }
  const totalObs = Object.values(counts).reduce((a, b) => a + b, 0) + candidates.length;

  const trackAnalyses = analyses.filter(a => a.trackId === trackId);
  const preferred = trackAnalyses.find(a => a.method === 'multimodal') || trackAnalyses[0];
  const seg = preferred?.segments.find(s => spanOverlap({ ...s, trackId }, { trackId, startSec, endSec }) > 0);
  const desc = seg?.descriptors;

  const vocalP = desc?.vocal_presence ?? 0.4;
  const slope = desc?.energy_slope ?? 0.0;
  const flux = desc?.spectral_flux ?? 0.0;
  const onset = desc?.onset_activity ?? 0.2;
  const energy = desc?.energy ?? 0.1;
  const noise = desc?.noisiness ?? 0.05;

  const salience: Record<string, number> = {
    Vocals: Math.min(1, vocalP * 1.6),
    'Build-up': Math.min(1, Math.max(0, slope * 6) + flux * 2.5),
    Rhythm: Math.min(1, onset * 1.2),
    Drop: Math.min(1, energy * 4 + onset * 0.5),
    Melody: Math.min(1, vocalP * 1.2 + 0.2),
    Instruments: Math.min(1, (1 - vocalP) * 1.1 + flux * 1.5),
    Harmony: 0.55,
    Atmosphere: Math.min(1, (1 - onset * 0.3) + noise * 2)
  };

  const source = evidence?.salience ?? (seg ? salience : null);
  const scored = candidates.map(chip => {
    const freq = (counts[chip] + 1) / totalObs;
    const infoGain = -Math.log2(freq) / Math.log2(candidates.length);
    const s = source ? 0.65 * (source[chip] ?? 0.5) + 0.35 * infoGain : infoGain;
    return { chip, score: s };
  });
  scored.sort((a, b) => b.score - a.score);

  let question = evidence?.question ?? 'Saved. What stood out?';
  if (seg && !evidence) {
    if (slope > 0.04 && vocalP > 0.42) question = 'Saved. Did the vocals or the building intensity stand out?';
    else if (slope > 0.04) question = 'Saved. Was it the build-up or rhythmic intensity that stood out?';
    else if (vocalP > 0.48) question = 'Saved. Did the vocal delivery or melody draw you in?';
  }
  return {
    question,
    chips: scored.slice(0, topK).map(x => x.chip)
  };
}

/** M4.5 / Section 5 — Evidence-backed personal Music DNA insight synthesis. */
export interface MusicDnaInsight {
  status: 'insufficient' | 'developing' | 'verified';
  headline: string;
  evidence: string[];
  tryThisMoment?: string;
  recommendedPassage?: PreferenceSuggestion;
  disclaimer: string;
}

export function synthesizeMusicDnaInsight(
  analyses: TrackAnalysis[],
  moments: Moment[],
  ratings: MomentRating[],
  events: ListeningEvent[]
): MusicDnaInsight {
  const disclaimer = 'Actual claims require sufficient supporting observations and verified model outputs.';
  if (!moments.length) {
    return {
      status: 'insufficient',
      headline: 'Save and describe favorite moments to unlock evidence-backed insights.',
      evidence: [],
      disclaimer
    };
  }

  const cands = attentionCandidates(events, 1);
  const numWords: Record<number, string> = { 0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
  const word = (n: number) => numWords[n] ?? String(n);

  const vocalBuildup = moments.filter(m => {
    const reasons = classifyFavReasons(m.note, m.qualities);
    const ta = analyses.find(a => a.trackId === m.trackId);
    const seg = ta?.segments.find(s => spanOverlap({ ...s, trackId: m.trackId }, m) >= 4);
    const slope = seg?.descriptors?.energy_slope ?? 0;
    return reasons.includes('Vocals') && (reasons.includes('Build-up') || slope > 0.02);
  });

  const countReturned = (list: Moment[]) => list.filter(m =>
    cands.some(c => c.trackId === m.trackId && spanOverlap(c, m) > 0 && (c.backwardSeeks + c.loopStarts >= 1 || c.sessions >= 2))
  ).length;

  const recs = personalRecommendations(analyses, moments, ratings, 5);
  const savedTracks = new Set(moments.map(m => m.trackId));
  const unfamiliarRec = recs.find(r => !savedTracks.has(r.trackId)) || recs[0];

  if (vocalBuildup.length >= 2) {
    const retCount = countReturned(vocalBuildup);
    const ev = [
      `You confirmed liking ${word(vocalBuildup.length)} such ${vocalBuildup.length === 1 ? 'passage' : 'passages'}.`,
      ...(retCount > 0 ? [`You repeatedly returned to ${word(retCount)} of them.`] : []),
      ...(analyses.length > 0 ? ['DSP and deep audio analysis identified candidate similarities.'] : [])
    ];
    return {
      status: vocalBuildup.length >= 3 && analyses.length > 0 ? 'verified' : 'developing',
      headline: 'You seem to enjoy vocal passages that become more intense as the music builds.',
      evidence: ev,
      tryThisMoment: unfamiliarRec ? 'Try this moment: A passage in an unfamiliar song with related musical characteristics.' : undefined,
      recommendedPassage: unfamiliarRec,
      disclaimer
    };
  }

  const retAll = countReturned(moments);
  const reasonFreq: Record<string, number> = {};
  for (const m of moments) {
    for (const r of classifyFavReasons(m.note, m.qualities)) {
      reasonFreq[r] = (reasonFreq[r] || 0) + 1;
    }
  }
  const topReasons = Object.entries(reasonFreq).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k.toLowerCase());
  const descText = topReasons.length ? topReasons.join(' and ') : 'distinctive musical moments';

  return {
    status: moments.length >= 3 && analyses.length > 0 ? 'verified' : 'developing',
    headline: `You seem to enjoy passages featuring ${descText}.`,
    evidence: [
      `You confirmed liking ${word(moments.length)} saved ${moments.length === 1 ? 'passage' : 'passages'}.`,
      ...(retAll > 0 ? [`You repeatedly returned to ${word(retAll)} of them.`] : []),
      ...(analyses.length > 0 ? ['DSP and deep audio analysis identified candidate similarities.'] : [])
    ],
    tryThisMoment: unfamiliarRec ? 'Try this moment: A passage in an unfamiliar song with related musical characteristics.' : undefined,
    recommendedPassage: unfamiliarRec,
    disclaimer
  };
}
