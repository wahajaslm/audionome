import { SERVICE_URL } from '../core/service';
import type {TrackAnalysis} from '../data/types';

export interface MapPoint {trackId:string; startSec:number;endSec:number;x:number;y:number; modelId:string}
export async function buildSimilarityMap(analyses:TrackAnalysis[],modelId:string):Promise<MapPoint[]>{
  const aligned=analyses.filter(a=>a.modelId===modelId);
  const segments=aligned.flatMap(a=>a.segments.map(s=>({trackId:a.trackId,startSec:s.startSec,endSec:s.endSec,modelId,embedding:s.embedding})));
  if(segments.length<3)throw new Error('Analyze at least three musical windows first');
  if(segments.length>500)throw new Error('Map is limited to 500 windows in this prototype');
  const response=await fetch(SERVICE_URL + '/api/project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelId,vectors:segments.map(s=>s.embedding)})});
  if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.detail||'Could not project embeddings')}
  const result=await response.json();
  if(!Array.isArray(result.points)||result.modelId!==modelId||result.points.length!==segments.length)throw new Error('Invalid map response');
  return segments.map((s,i)=>({trackId:s.trackId,startSec:s.startSec,endSec:s.endSec,modelId,x:result.points[i][0],y:result.points[i][1]}));
}
