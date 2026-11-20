import fs from 'node:fs';
import { discoverStrategy } from '../src/research.mjs';
import { qualifyResearchBatchMember } from '../src/batch-qualification.mjs';
import { sha256, check } from '../src/contracts.mjs';
import * as signal from '../dist/signal-adapter.mjs';

// Bounded public historical research only. No exchange/account keys, orders, private source or dynamic universe.
const source = fs.readFileSync(new URL('../evidence/fixed-market-batch.protocol.json',import.meta.url),'utf8');
const protocol = JSON.parse(source), protocolHash = sha256(source), now = Date.now(), cutoff = Date.parse(protocol.closedBefore);
check(cutoff <= now && now-cutoff < 7*86400000,'registered_research_window_expired');
check(JSON.stringify(protocol.symbols) === JSON.stringify(['ETHUSDT','BNBUSDT','XRPUSDT','ADAUSDT']), 'registered_universe_changed');
const registration = { protocolHash, protocol, sourceRevision:process.env.GITHUB_SHA||null, registeredAt:new Date(now).toISOString(),
  existingBTCOutcomeUsedForRetuning:false, independentProspectiveExperiment:false };
fs.writeFileSync('fixed-market-registration.json',JSON.stringify(registration,null,2),{flag:'wx'});
console.log('FROZEN_PROTOCOL '+JSON.stringify(registration));
let calls=0, halted=false;
async function boundedResponse(response) {
  check(Number(response.headers.get('content-length')||0)<=2000000,'provider_response_too_large');
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  try{while(true){const{done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2000000){await reader.cancel();throw Error('provider_response_too_large');}chunks.push(Buffer.from(value));}}
  finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function datasetFor(symbol){
  const rows=new Map();let endTime=cutoff-1;
  for(let page=0;page<3&&rows.size<protocol.barsPerAsset;page++){
    check(!halted&&calls<protocol.maximumRequests,'research_consumption_budget');
    const url=new URL('https://data-api.binance.vision/api/v3/klines');
    for(const[k,v]of Object.entries({symbol,interval:protocol.interval,limit:1000,endTime}))url.searchParams.set(k,String(v));
    calls++;
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(8000),headers:{accept:'application/json'}});
    if([401,403,418,429,451].includes(response.status)){halted=true;throw Error(`provider_access_or_rate_restriction_${response.status}`);}
    check(response.ok,`provider_http_${response.status}`);const data=await boundedResponse(response);
    check(Array.isArray(data)&&data.length>0&&data.length<=1000,'invalid_history_page');
    let earliest=Infinity;
    for(const row of data){
      check(Array.isArray(row)&&row.length>=7&&Number.isSafeInteger(row[0])&&Number.isSafeInteger(row[6]),'invalid_history_candle');
      earliest=Math.min(earliest,row[0]);if(row[6]>=cutoff)continue;
      const bar={timestamp:row[0],closeTime:row[6],open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4]),volume:Number(row[5])};
      check(!rows.has(row[0])||JSON.stringify(rows.get(row[0]))===JSON.stringify(bar),'conflicting_history_duplicate');rows.set(row[0],bar);
    }
    check(earliest-1<endTime,'history_pagination_stalled');endTime=earliest-1;
    if(data.length<1000)break;
  }
  const bars=[...rows.values()].sort((a,b)=>a.timestamp-b.timestamp).slice(-protocol.barsPerAsset);
  return {schemaVersion:'market-data.v1',provider:'binance-public',symbol,interval:protocol.interval,bars,
    dataHash:sha256(JSON.stringify(bars)),consumption:{displayOnly:false},quality:{real:true,synthetic:false,closedOnly:true,complete:bars.length===protocol.barsPerAsset}};
}
const results=[];
for(const symbol of protocol.symbols){
  if(halted){results.push({symbol,status:'not_attempted_after_provider_restriction',liveTradingApproved:false});continue;}
  const before=calls;
  try{
    const data=await datasetFor(symbol);
    const report=discoverStrategy([data],{now,signal,costs:protocol.costs,exposure:protocol.exposure});
    const qualification=qualifyResearchBatchMember(report,protocol.symbols.length);
    const result={symbol,status:'historical_evaluation_completed',bars:data.bars.length,calls:calls-before,dataHash:data.dataHash,
      strategyHash:report.strategyHash,config:report.model.config,candidatesTested:report.selection.candidatesTested,partitions:report.partitions,
      finalTest:report.finalTest.metrics,originalValidation:report.validation,costStress:report.costStress,qualification};
    results.push(result);console.log('ASSET_RESULT '+JSON.stringify(result));
  }catch(error){const result={symbol,status:'evaluation_unavailable',reason:error.code||error.message,calls:calls-before,liveTradingApproved:false};results.push(result);console.log('ASSET_RESULT '+JSON.stringify(result));}
}
const outcome={...registration,completedAt:new Date().toISOString(),requests:calls,requestWeight:calls*2,results,
  qualifiedHistoricalAssets:results.filter(r=>r.qualification?.historicalResearchQualified).map(r=>r.symbol),
  prospectivePassed:false,portfolioPolicyPerformanceVerified:false,liveTradingApproved:false,
  status:results.every(r=>r.status==='historical_evaluation_completed')?'completed':'incomplete',
  interpretation:'All four preregistered asset outcomes are retained; no runner-up final-test shopping, strategy deployment or live-order authorization.'};
fs.writeFileSync('fixed-market-batch-evidence.json',JSON.stringify(outcome,null,2),{flag:'wx'});
console.log('BATCH_RESULT '+JSON.stringify({status:outcome.status,requests:calls,qualifiedHistoricalAssets:outcome.qualifiedHistoricalAssets,prospectivePassed:false,liveTradingApproved:false}));
if(outcome.status!=='completed')process.exitCode=2;
