/** Read-only empirical probe. No account endpoints, credentials, paid feeds or host fallback. */
import {writeFileSync} from 'node:fs';
import {discoverStrategy} from '../src/research.mjs';
import {sha256} from '../src/contracts.mjs';
import * as signal from '../dist/signal-adapter.mjs';
const now=Date.now(),count=2500,rows=new Map();let endTime=now-1,calls=0;
try{
 for(let page=0;page<4&&rows.size<count;page++){
  const url=new URL('https://data-api.binance.vision/api/v3/klines');
  for(const[k,v]of Object.entries({symbol:'BTCUSDT',interval:'1d',limit:1000,endTime}))url.searchParams.set(k,String(v));
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(8000)});calls++;
  if(!response.ok)throw Error(`provider_http_${response.status}`);
  const data=await response.json();if(!Array.isArray(data)||!data.length)throw Error('empty_history');
  for(const r of data){if(r[6]>=now)continue;rows.set(r[0],{timestamp:r[0],closeTime:r[6],open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5])});}
  const next=Math.min(...data.map(r=>r[0]))-1;if(next>=endTime)throw Error('pagination_stalled');endTime=next;
 }
 const bars=[...rows.values()].sort((a,b)=>a.timestamp-b.timestamp).slice(-count);
 const dataset={schemaVersion:'market-data.v1',provider:'binance-public',symbol:'BTCUSDT',interval:'1d',bars,
  dataHash:sha256(JSON.stringify(bars)),consumption:{displayOnly:false},quality:{real:true,synthetic:false,closedOnly:true,complete:bars.length===count}};
 const result=discoverStrategy([dataset],{now,signal,costs:{feeBps:20,spreadBps:4,slippageBps:5},exposure:0.25});
 const evidence={status:'empirical_research_completed',observedAt:new Date(now).toISOString(),provider:'binance-public',symbol:'BTCUSDT',interval:'1d',bars:bars.length,
  calls,dataHash:dataset.dataHash,strategyHash:result.strategyHash,selectedConfig:result.model.config,candidatesTested:result.selection.candidatesTested,
  partitions:result.partitions,validation:result.validation,finalTest:result.finalTest.metrics,prospectivePassed:false,liveTradingApproved:false,
  scope:'Read-only public-data research probe, not a deployed cross-service or live-execution certification.'};
 writeFileSync('live-research-evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}catch(error){
 const evidence={status:'empirical_verification_unavailable',reason:error.code||error.message,calls,prospectivePassed:false,liveTradingApproved:false};
 writeFileSync('live-research-evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}
