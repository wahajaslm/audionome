import type {ListeningEvent, Moment, MomentRating, TrackAnalysis, AudioSegment} from '../data/types';

export interface SuggestedMoment {
  trackId: string;
  startSec: number;
  endSec: number;
  similarity: number;
  modelId: string;
  basedOn: number;
  evidence: string[];
}
export interface InterestSignal {trackId:string; startSec:number; endSec:number; returns:number; sessions:number}

function cosine(a:number[], b:number[]):number {
  if (!a.length || a.length !== b.length) return 0;
  let dot=0, aa=0, bb=0;
  for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  return aa>0 && bb>0 ? dot/Math.sqrt(aa*bb) : 0;
}
function overlap(a:{startSec:number;endSec:number}, b:{startSec:number;endSec:number}) {
  return Math.max(0,Math.min(a.endSec,b.endSec)-Math.max(a.startSec,b.startSec));
}
/** Average all windows that substantially overlap the user's *actual* selected moment. */
function anchorVector(a:TrackAnalysis, moment:{startSec:number;endSec:number}):number[]|null {
  const sections = a.segments.filter(s=>overlap(s,moment)>0);
  if(!sections.length)return null;
  const dim=sections[0].embedding.length;
  const total=new Array<number>(dim).fill(0); let weight=0;
  for(const section of sections){
    if(section.embedding.length!==dim)continue;
    const w=overlap(section,moment);
    weight+=w;
    for(let i=0;i<dim;i++) total[i]+=section.embedding[i]*w;
  }
  return weight>0?total.map(v=>v/weight):null;
}
type NumericDescriptorKey = 'energy' | 'brightness_hz' | 'onset_activity';
function evidenceOf(segment:AudioSegment, refs:AudioSegment[]):string[] {
  if (!refs.length) return [];
  const avg = (key: NumericDescriptorKey) => refs.reduce((s, r) => s + (r.descriptors?.[key] ?? 0), 0) / refs.length;
  const labels: {key: NumericDescriptorKey; name: string}[] = [
    {key:'energy', name:'similar energy'},
    {key:'brightness_hz', name:'similar spectral brightness'},
    {key:'onset_activity', name:'similar onset activity'}
  ];
  return labels.filter(({key}) => {
    const val = segment.descriptors?.[key] ?? 0;
    const a = avg(key);
    return Math.abs(val - a) / Math.max(Math.abs(a), .05) < .4;
  }).slice(0, 2).map(x => x.name);
}
/** Strict method separation: never compare CLAP and DSP vectors, even if lengths happen to match. */
export function recommendMoments(analyses:TrackAnalysis[], moments:Moment[], ratings:MomentRating[], limit=12):SuggestedMoment[] {
  const result:SuggestedMoment[]=[];
  for(const target of analyses){
    const compatible=analyses.filter(a=>a.modelId===target.modelId && a.method===target.method);
    const positives: {vec:number[];segment:AudioSegment}[]=[];
    const negatives:number[][]=[];
    const blocked:{trackId:string;startSec:number;endSec:number}[]=[];
    for(const m of moments){
      blocked.push(m);
      const source=compatible.find(a=>a.trackId===m.trackId);
      if(source){const vec=anchorVector(source,m);if(vec)positives.push({vec,segment:source.segments.find(s=>overlap(s,m)>0)!});}
    }
    for(const r of ratings){
      blocked.push(r);
      const source=compatible.find(a=>a.trackId===r.trackId);
      if(!source)continue;
      const vec=anchorVector(source,r);
      if(!vec)continue;
      if(r.value==='like')positives.push({vec,segment:source.segments.find(s=>overlap(s,r)>0)!});
      else negatives.push(vec);
    }
    if(!positives.length)continue;
    // Prefer unfamiliar tracks where possible; rank both so single-track experiments still work.
    for(const segment of target.segments){
      if(blocked.some(b=>b.trackId===target.trackId && overlap(b,segment)>Math.min(4,(segment.endSec-segment.startSec)*.35)))continue;
      const sim=Math.max(...positives.map(p=>cosine(p.vec,segment.embedding)));
      const penalty=negatives.length ? .30*Math.max(...negatives.map(v=>cosine(v,segment.embedding))) : 0;
      const score=sim-penalty;
      result.push({trackId:target.trackId,startSec:segment.startSec,endSec:segment.endSec,
        similarity:score,modelId:target.modelId,basedOn:positives.length,
        evidence:evidenceOf(segment,positives.map(p=>p.segment))});
    }
  }
  const savedTrackIds=new Set(moments.map(m=>m.trackId));
  result.sort((a,b)=>Number(!savedTrackIds.has(b.trackId))-Number(!savedTrackIds.has(a.trackId))||b.similarity-a.similarity);
  // Avoid virtually identical overlapping recommendations on the same recording.
  const distinct:SuggestedMoment[]=[];
  for(const candidate of result){
    if(distinct.some(x=>x.trackId===candidate.trackId&&overlap(x,candidate)>0))continue;
    distinct.push(candidate);
    if(distinct.length>=limit)break;
  }
  return distinct;
}

/** Only *user-origin* backwards seeks count. A loop restarting is not user evidence. */
export function findRepeatSignals(events:ListeningEvent[], minReturns=2):InterestSignal[]{
  const bins=new Map<string,{trackId:string;startSec:number;returns:number;sessions:Set<string>}>();
  for(const e of events){
    if(e.origin!=='user' || e.kind!=='seek' || e.fromSec===undefined || e.toSec===undefined) continue;
    if(e.fromSec-e.toSec<4)continue;
    const startSec=Math.floor(e.toSec/5)*5;
    const key=`${e.trackId}:${startSec}`;
    const entry=bins.get(key)??{trackId:e.trackId,startSec,returns:0,sessions:new Set<string>()};
    entry.returns++;
    entry.sessions.add(e.sessionId);
    bins.set(key,entry);
  }
  return [...bins.values()].filter(b=>b.returns>=minReturns).map(b=>({trackId:b.trackId,startSec:b.startSec,
    endSec:b.startSec+15,returns:b.returns,sessions:b.sessions.size})).sort((a,b)=>b.returns-a.returns).slice(0,10);
}
