import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as signal from '../dist/signal-adapter.mjs';
import { OperationalLedger } from '../src/operational-ledger.mjs';
import { createSafeService } from '../src/runtime-safety.mjs';
import { PaperPortfolio } from '../src/paper.mjs';
import { fingerprint, sha256 } from '../src/contracts.mjs';

// ALL data and elapsed days here are deterministic fixtures, never investment-performance evidence.
const DAY=86400000,END=Math.floor(1800000000000/DAY)*DAY+1000,release='a'.repeat(40);
const profile=()=>({riskTolerance:'balanced',quoteCurrency:'USDT',maxAssetWeight:0.4,maxExposure:0.8,
 annualVolatilityTarget:0.3,maxDrawdown:0.15,horizonDays:1000,cashReserve:'100',cashFlows:[]});
function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'investing-pipeline-'));let now=END-32*DAY;
 const store=new OperationalLedger(path.join(dir,'ledger.db'),{owner:'alice',now:()=>now});store.acquireLease(120000);
 const q=(price=100)=>({schemaVersion:'market-data.v1',provider:'binance-public',symbol:'BTCUSDT',releaseSha:release,price,bid:price,ask:price,
  observedAt:now,fetchedAt:now,expiresAt:now+5000,realtime:true,delayed:false,synthetic:false});
 const model={config:{id:'FIXTURE_NOT_A_REAL_STRATEGY',fast:8,slow:50,featureSet:'mixed',horizon:1,probabilityThreshold:0.55},centers:Array(11).fill(0),scales:Array(11).fill(1),
  ridge:[0.02,...Array(11).fill(0)],logistic:[4,...Array(11).fill(0)],positiveClassRate:0.5,roundTripCost:0.004,residualStd:0.001,nTrain:5000,calibrator:null};
 const body={model,strategyHash:fingerprint(model),createdAt:now,partitions:{test:{end:now-1000}},symbol:'BTCUSDT',interval:'1d',dataRelease:release,costs:{feeBps:20,spreadBps:4,slippageBps:5},
  validation:{passed:true},exposure:0.25,finalTest:{metrics:{maxDrawdown:0.01}},fixtureOnly:true};
 // Lease TTL is wall-clock coordination, so the fixture explicitly releases/reacquires between simulated days.
 store.freeze('alice',{...body,reportHash:fingerprint(body)});
 function move(next){store.releaseLease();now=next;store.acquireLease(120000);}
 move(now+1000);
 for(let i=0;i<30;i++){const observation=store.observe('alice',body.strategyHash,q());move(now+DAY);store.resolve('alice',observation.id,q(102));}
 move(END);
 const dataClient={expectedRelease:release,streaming:true,quote:async()=>q(),history:async(symbol,interval,count)=>{
  const end=Math.floor(now/DAY)*DAY,bars=Array.from({length:count},(_,i)=>({timestamp:end-(count-i)*DAY,closeTime:end-(count-i-1)*DAY-1,open:100,high:101,low:99,close:100,volume:1000}));
  return{schemaVersion:'market-data.v1',provider:'binance-public',symbol,interval,releaseSha:release,bars,dataHash:sha256(JSON.stringify(bars)),quality:{real:true,synthetic:false,closedOnly:true,complete:true},consumption:{displayOnly:false},fixtureOnly:true};}};
 const filters={BTCUSDT:{quoteCurrency:'USDT',lotStep:'0.001',priceTick:'0.01',minQuantity:'0.001',maxQuantity:'100',minNotional:'5',feeBps:10,liquidityCapWeight:0.3}};
 const paper=new PaperPortfolio({store,tenant:'alice',seed:{quoteCurrency:'USDT',availableCash:'1000',holdings:[],flowAdjustedPeakEquity:1000},filters,quotePort:dataClient,now:()=>now});
 const service=createSafeService({store,dataClient,signal,runtime:signal.createInvestingRuntime(),mode:'paper',accountPort:paper,filterPort:paper,brokerPort:paper,now:()=>now});
 service.saveProfile('alice',profile());
 return{store,service,paper,dataClient,hash:body.strategyHash,move,get now(){return now;},async close(){await service.drain();store.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('full paper pipeline uses actual Signal runtime, live-shaped signals, MPT, lot repair and durable settlement',async()=>{
 const t=setup();try{
  const signals=await t.service.signals('alice',[t.hash]);assert.equal(signals.signals[0].action,'BUY');
  const plan=await t.service.plan('alice',[t.hash]);assert.equal(plan.status,'proposed');assert.equal(plan.executionAudit.passed,true);
  assert.ok(Number(plan.orders[0].quantity)>0);assert.equal(plan.executionAuthorized,false);assert.equal(plan.portfolioPolicyPerformanceVerified,false);
  const execution=await t.service.execute('alice',plan.planHash);assert.equal(execution.status,'filled');assert.equal(execution.body.liveOrdersPlaced,0);
  assert.ok(Number(t.paper.raw().availableCash)<1000);assert.ok(t.paper.raw().holdings.length===1);
  t.move(t.now+DAY);assert.equal((await t.service.execute('alice',plan.planHash)).duplicate,true);
 }finally{await t.close();}
});
test('a user risk-profile change invalidates the already sized paper plan',async()=>{
 const t=setup();try{const plan=await t.service.plan('alice',[t.hash]);t.service.saveProfile('alice',{...profile(),cashReserve:'950'});
  await assert.rejects(t.service.execute('alice',plan.planHash),/risk_profile_changed/);assert.equal(t.paper.raw().availableCash,'1000');
 }finally{await t.close();}
});
test('stale provider observations become zero-quantity HOLD with no executable portfolio plan',async()=>{
 const t=setup();try{t.dataClient.quote=async()=>{throw Error('provider_stale');};
  const value=await t.service.plan('alice',[t.hash]);assert.equal(value.status,'blocked');assert.equal(value.orders[0].action,'HOLD');assert.equal(value.orders[0].quantity,'0');
  assert.equal(t.store.unresolved('alice').length,0);
 }finally{await t.close();}
});
