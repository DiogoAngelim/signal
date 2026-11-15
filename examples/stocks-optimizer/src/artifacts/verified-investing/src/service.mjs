import { check, id, integer, fingerprint, validateDataset, validateQuote, INTERVAL_MS, SCHEMA, SOURCE_SIGNAL_COMMIT } from './contracts.mjs';
import { indicators, FEATURE_SETS, predictModel } from './model.mjs';
import { discoverStrategy } from './research.mjs';
import { validateProfile } from './portfolio.mjs';
import { executeApprovedPlan } from './evidence.mjs';

export class VerifiedDataClient {
 constructor({url,expectedRelease,token,streaming=false,fetchImpl=globalThis.fetch,now=Date.now}){
  const endpoint=new URL(url);check(endpoint.protocol==='https:'&&!endpoint.username&&!endpoint.password&&!endpoint.hash,'invalid_data_endpoint');
  check(/^[a-f0-9]{40}$/.test(expectedRelease),'pinned_data_release_required');
  this.streaming=streaming;this.endpoint=endpoint;this.expectedRelease=expectedRelease;this.token=token;this.fetch=fetchImpl;this.now=now;this.cache=new Map();this.active=0;
 }
 async request(params){
  check(this.active<2,'data_concurrency_budget');this.active++;
  try{
   const url=new URL(this.endpoint);for(const[k,v]of Object.entries(params))url.searchParams.set(k,String(v));
   const response=await this.fetch(url,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{accept:'application/json',...(this.token?{authorization:`Bearer ${this.token}`}:{})}});
   check(response.ok,`data_unavailable_${response.status}`);check(Number(response.headers.get('content-length')||0)<=2000000,'data_payload_too_large');
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000){await reader.cancel();throw Error('data_payload_too_large');}chunks.push(Buffer.from(value));}}
   finally{reader.releaseLock();}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   return params.kind==='quote'?validateQuote(data,{now:this.now(),symbol:params.symbol,expectedRelease:this.expectedRelease}):validateDataset(data,{now:this.now(),expectedRelease:this.expectedRelease});
  }finally{this.active--;}
 }
 async history(symbol,interval,bars=2500){
  const key=`${symbol}:${interval}:${bars}`,old=this.cache.get(key);if(old&&old.expires>this.now())return structuredClone(old.data);
  const data=await this.request({kind:'history',symbol,interval,bars});
  const expires=Math.min(this.now()+INTERVAL_MS[interval],data.bars.at(-1).closeTime+INTERVAL_MS[interval]+1000);
  if(this.cache.size>=64)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,{expires,data});return data;
 }
 quote(symbol){return this.request({kind:'quote',symbol});}
}

export function createInvestingService({store,dataClient,signal,runtime,mode='paper',now=Date.now,accountPort,filterPort,permissionPort,brokerPort,researchPort}){
 check(store&&dataClient&&signal&&runtime,'missing_service_port');check(['paper','testnet','live'].includes(mode),'invalid_execution_mode');
 let researchBusy=false;
 async function research(tenant,input){
  id(tenant,'tenant');check(!researchBusy,'research_worker_busy');researchBusy=true;
  try{
   check(/^[A-Z0-9]{5,24}$/.test(input.symbol),'invalid_symbol');
   check(Array.isArray(input.timeframes)&&input.timeframes.length>=1&&input.timeframes.length<=4,'timeframe_limit');
   check(new Set(input.timeframes).size===input.timeframes.length,'duplicate_timeframe');
   for(const interval of input.timeframes)check(Object.hasOwn(INTERVAL_MS,interval),'unsupported_interval');
   const count=integer(input.bars??2500,'bars',1200,5000),datasets=[];
   for(const interval of input.timeframes)datasets.push(await dataClient.history(input.symbol,interval,count));
   const policy={now:now(),expectedRelease:dataClient.expectedRelease,costs:{feeBps:20,spreadBps:4,slippageBps:5},exposure:0.25};
   let report=researchPort?await researchPort(datasets,policy):discoverStrategy(datasets,{...policy,signal});
   const previous=store.list(tenant,'research',10000).filter(r=>r.symbol===input.symbol),identical=previous.find(r=>r.reportHash===report.reportHash);if(identical)return identical;
   if(previous.some(r=>r.partitions.test.end>=report.partitions.test.start)){
    const{reportHash,...body}=report;body.validation={...body.validation,passed:false,gates:{...body.validation.gates,untouched_final_window:false},blockers:[...body.validation.blockers,'final_window_previously_evaluated']};report={...body,reportHash:fingerprint(body)};
   }
   store.transaction(()=>{if(!store.get(tenant,'research',report.reportHash))store.put(tenant,'research',report.reportHash,report);store.append(tenant,'research.completed',{reportHash:report.reportHash,strategyHash:report.strategyHash,passed:report.validation.passed});});
   if(report.validation.passed)store.freeze(tenant,report);return report;
  }finally{researchBusy=false;}
 }
 function saveProfile(tenant,input){const p=validateProfile(input,now()),hash=fingerprint(p);store.transaction(()=>{if(!store.get(tenant,'profile',hash))store.put(tenant,'profile',hash,p);store.append(tenant,'profile.saved',{hash});});return{profile:p,hash};}
 async function signals(tenant,hashes){
  check(Array.isArray(hashes)&&hashes.length>0&&hashes.length<=20,'strategy_limit');check(new Set(hashes).size===hashes.length,'duplicate_strategy');const rows=[];
  for(const hash of hashes){
   const strategy=store.get(tenant,'strategy',hash);check(strategy,'unknown_or_unvalidated_strategy');
   try{
    const data=await dataClient.history(strategy.symbol,strategy.interval,Math.max(250,strategy.model.config.slow+100)),q=await dataClient.quote(strategy.symbol);
    const features=indicators(data.bars,strategy.model.config).at(-1);check(features,'insufficient_live_indicators');
    const x=FEATURE_SETS[strategy.model.config.featureSet].map(i=>features[i]);
    const forecast=predictModel(strategy.model,x,signal.applyBinaryIsotonicCalibrator);let forward=store.forward(tenant,hash);
    const rawAction=forecast.probability>=strategy.model.config.probabilityThreshold&&forecast.expectedGrossReturn>strategy.model.roundTripCost?'BUY':forecast.expectedGrossReturn<0?'SELL':'HOLD';
    const entryWindowOpen=now()-data.bars.at(-1).closeTime<=60000;
    if(rawAction==='BUY'&&entryWindowOpen)store.observe(tenant,hash,q);
    for(const observation of store.list(tenant,'observation',10000))if(observation.strategyHash===hash&&observation.dueAt<=now()&&!store.get(tenant,'outcome',observation.id)){
     try{store.resolve(tenant,observation.id,q);}catch(error){if(error.code!=='missed_outcome_window'&&error.code!=='outcome_not_mature')throw error;}
    }
    forward=store.forward(tenant,hash);rows.push({symbol:strategy.symbol,strategyHash:hash,interval:strategy.interval,forecast,rawAction,
     action:forward.passed&&(rawAction!=='BUY'||entryWindowOpen)?rawAction:'HOLD',quantity:'0',quote:q,forward,entryWindowOpen,
     blockers:forward.passed?[]:forward.blockers,requiresPortfolioSizing:true});
   }catch(error){rows.push({symbol:strategy.symbol,strategyHash:hash,action:'HOLD',quantity:'0',blockers:[error.code||'market_data_unavailable']});}
  }
  const value={schemaVersion:SCHEMA,generatedAt:now(),signals:rows,mode,sourceSignalCommit:SOURCE_SIGNAL_COMMIT};
  store.transaction(()=>store.append(tenant,'signals.evaluated',{symbols:rows.map(r=>r.symbol),actions:rows.map(r=>r.action)}));return value;
 }
 async function plan(tenant,hashes){
  const profile=store.currentProfile(tenant);check(profile,'profile_required');check(accountPort&&filterPort,'reconciled_account_and_exchange_filters_required');
  const live=await signals(tenant,hashes);
  if(live.signals.some(s=>!s.quote||!s.forward?.passed))return{...live,status:'blocked',orders:live.signals.map(s=>({symbol:s.symbol,action:'HOLD',quantity:'0',blockers:s.blockers}))};
  check(new Set(live.signals.map(s=>s.symbol)).size===live.signals.length,'multiple_models_same_asset_not_supported');
  const account=await accountPort.snapshot(tenant,profile),assets=[],daily=[];
  for(const s of live.signals){
   const filters=await filterPort.filters(s.symbol,profile.quoteCurrency),strategy=store.get(tenant,'strategy',s.strategyHash),horizon=INTERVAL_MS[s.interval]*strategy.model.config.horizon;
   check(strategy.finalTest.metrics.maxDrawdown<=profile.maxDrawdown,'strategy_exceeds_personal_drawdown_limit');
   const multiplier=86400000/horizon;
   assets.push({...filters,liquidityCapWeight:Math.min(filters.liquidityCapWeight,strategy.exposure),symbol:s.symbol,strategyHash:s.strategyHash,quote:s.quote,eligible:true,allowIncrease:s.entryWindowOpen,
    expectedReturn:Math.max(-0.5,Math.min(0.5,Math.expm1(Math.log1p(s.forecast.expectedGrossReturn)*multiplier))),
    uncertainty:Math.min(1,s.forecast.predictionStd/Math.sqrt(strategy.model.nTrain)*multiplier),periodsPerYear:365});
   daily.push(await dataClient.history(s.symbol,'1d',253));
  }
  const maps=daily.map(d=>new Map(d.bars.slice(1).map((b,i)=>[b.timestamp,b.close/d.bars[i].close-1])));
  const timestamps=[...maps[0].keys()].filter(t=>maps.every(m=>m.has(t))).sort((a,b)=>a-b),matrix=timestamps.map(t=>maps.map(m=>m.get(t)));
  const result=await runtime.query('investing.plan.v1',{profile,account,assets,returnMatrix:matrix,now:now(),expectedRelease:dataClient.expectedRelease});
  check(result.ok,'runtime_plan_failed');const decision=result.result??result.data;
  store.transaction(()=>{if(!store.get(tenant,'plan',decision.planHash))store.put(tenant,'plan',decision.planHash,decision);store.append(tenant,'plan.created',{planHash:decision.planHash});});return decision;
 }
 async function execute(tenant,planHash){
  const decision=store.get(tenant,'plan',planHash);check(decision,'unknown_plan');const permissions=permissionPort?await permissionPort.permissions(tenant,decision):null;
  return executeApprovedPlan({tenant,plan:decision,strategyHashes:decision.strategyHashes,store,permissions,broker:brokerPort,mode,now:now()});
 }
 return{research,saveProfile,signals,plan,execute,report:(tenant,key)=>store.get(tenant,'research',key),
  capabilities:()=>({schemaVersion:SCHEMA,mode,research:true,calibration:true,portfolioPlanning:Boolean(accountPort&&filterPort),
   executionConfigured:Boolean(accountPort&&filterPort&&permissionPort&&brokerPort),liveExecutionModeRequested:mode==='live',streamingQuotes:dataClient.streaming===true,
   runtimeSource:SOURCE_SIGNAL_COMMIT,dataRelease:dataClient.expectedRelease,durableLedger:store.durable,
   limitations:['Free verified feed currently supports Binance Spot, not unentitled global equities.','Live execution requires separate prospective evidence, reconciled account and explicit permissions.']})};
}

export function startAutonomousWorker({service,tenant,strategyHashes,permissions,intervalMs=60000,onResult=()=>{},onError=()=>{},timers=globalThis}){
 integer(intervalMs,'worker_interval',1000,86400000);check(permissions?.enabled===true,'worker_permission_required');let stopped=false,timer,busy=false;
 const tick=async()=>{if(stopped||busy)return;busy=true;
  try{check(Date.now()<permissions.expiresAt,'worker_permission_expired');const plan=await service.plan(tenant,strategyHashes);
   const result=plan.planHash?await service.execute(tenant,plan.planHash):plan;onResult(result);if(result.status==='unknown')stopped=true;
  }catch(error){onError(error.code||'worker_failed');stopped=true;}
  finally{busy=false;if(!stopped)timer=timers.setTimeout(tick,intervalMs);}};
 timer=timers.setTimeout(tick,0);return{stop(){stopped=true;if(timer)timers.clearTimeout(timer);},get running(){return!stopped;}};
}
