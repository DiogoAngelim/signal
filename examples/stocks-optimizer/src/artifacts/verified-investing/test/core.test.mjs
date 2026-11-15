import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprint, sha256, validateDataset, validateQuote, units, decimal, floorToStep, costModel } from '../src/contracts.mjs';
import { indicators, samplesFor, chronologicalSplit, fitModel, predictModel, candidateConfigs } from '../src/model.mjs';
import { backtest, blockMeanInterval, validationGates } from '../src/research.mjs';
import { shrinkageCovariance, optimizeMpt, planPortfolio } from '../src/portfolio.mjs';
import { EvidenceStore, executeApprovedPlan } from '../src/evidence.mjs';
const NOW=1800000000000, DAY=86400000;
function bars(n=1600) {
 let price=100,seed=42;const end=Math.floor(NOW/DAY)*DAY;
 return Array.from({length:n},(_,i)=>{seed=(1664525*seed+1013904223)>>>0;
 const open=price,close=open*Math.exp(0.015*Math.sin(i/11)+(seed/4294967296-0.5)*0.012);price=close;
 return{timestamp:end-(n-i)*DAY,closeTime:end-(n-i-1)*DAY-1,open,high:Math.max(open,close)*1.002,low:Math.min(open,close)*0.998,close,volume:1000+i%17};});
}
const dataset=()=>{const b=bars();return{schemaVersion:'market-data.v1',provider:'binance-public',symbol:'BTCUSDT',interval:'1d',releaseSha:'test',bars:b,dataHash:sha256(JSON.stringify(b)),consumption:{displayOnly:false},quality:{real:true,synthetic:false,closedOnly:true,complete:true}};};
const quote=(symbol='BTCUSDT',price=100,now=NOW)=>({schemaVersion:'market-data.v1',provider:'binance-public',symbol,price,bid:price,ask:price,observedAt:now-100,fetchedAt:now,expiresAt:now+5000,realtime:true,delayed:false,synthetic:false});
test('data validator independently checks freshness, hash, intervals, OHLC and entitlement',()=>{
 assert.equal(validateDataset(dataset(),{now:NOW}).bars.length,1600);
 for(const mutate of[d=>d.dataHash='bad',d=>d.quality.synthetic=true,d=>d.consumption.displayOnly=true,d=>d.quality.complete=false,d=>d.bars[8].close=0]){const d=dataset();mutate(d);assert.throws(()=>validateDataset(d,{now:NOW}));}
 assert.throws(()=>validateDataset(dataset(),{now:NOW+3*DAY}),/stale_history/);
 assert.throws(()=>validateDataset(dataset(),{now:NOW,expectedRelease:'different'}),/release_mismatch/);
});
test('quotes cannot launder stale or synthetic observations into current prices',()=>{
 assert.equal(validateQuote(quote(),{now:NOW}).price,100);
 for(const patch of[{observedAt:NOW-20000},{observedAt:NaN},{bid:102,ask:100},{synthetic:true},{expiresAt:NOW-1}])assert.throws(()=>validateQuote({...quote(),...patch},{now:NOW}));
});
test('decimal lot arithmetic never silently rounds an input up',()=>{
 assert.equal(decimal(units('0.12345678')),'0.12345678');assert.equal(floorToStep('0.01009999','0.0001'),'0.01');
 for(const x of[-1,NaN,Infinity,'1e3','0.000000001',0.000000001])assert.throws(()=>units(x));
});
test('all indicator outputs are causal under future-price perturbation',()=>{
 const a=bars(350),b=structuredClone(a);for(let i=200;i<b.length;i++){b[i].close*=3;b[i].high*=3;}
 assert.deepEqual(indicators(a).slice(0,200),indicators(b).slice(0,200));assert.equal(indicators(a)[100].length,11);
});
test('training, selection, calibration and test labels do not overlap after purge/embargo',()=>{
 const b=bars(),s=samplesFor(b,indicators(b),{horizon:5}),split=chronologicalSplit(s,{embargoMs:5*DAY});
 for(const[left,right]of[['train','selection'],['selection','calibration'],['calibration','test']])assert.ok(split[left].at(-1).exitTime+5*DAY<split[right][0].time);
});
test('ridge/logistic estimation is deterministic and uses only training observations',()=>{
 const b=bars(),s=samplesFor(b,indicators(b)),split=chronologicalSplit(s),options={config:candidateConfigs()[0],roundTripCost:0.002};
 const model=fitModel(split.train,options),repeat=fitModel(split.train,options);assert.deepEqual(model,repeat);
 const p=predictModel(model,split.test[0].x);assert.ok(p.probability>=0&&p.probability<=1);assert.ok(Number.isFinite(p.expectedGrossReturn));
 assert.throws(()=>fitModel(split.train.map(x=>({...x,grossReturn:0.1})),options),/class_imbalance/);
});
test('entry uses next-bar open and adverse costs reduce actual equity',()=>{
 const model={centers:[0],scales:[1],ridge:[0.1,0],logistic:[4,0],positiveClassRate:0.5,roundTripCost:0.001,config:{probabilityThreshold:0.55},calibrator:null};
 const samples=Array.from({length:50},(_,i)=>({time:i*DAY,entryTime:i*DAY+1,exitTime:(i+1)*DAY-1,entry:100,exit:101,grossReturn:0.01,x:[0]}));
 const free=backtest(samples,model,{costs:{feeBps:0,spreadBps:0,slippageBps:0}}),cost=backtest(samples,model,{costs:{feeBps:20}});
 assert.ok(cost.metrics.totalReturn<free.metrics.totalReturn);assert.ok(cost.trades.every(t=>t.entryAt>t.signalAt));
 assert.equal(backtest(samples.map(x=>({...x,exit:100})),model,{costs:costModel()}).metrics.totalReturn<0,true);
 assert.throws(()=>backtest([{...samples[0],entryTime:0}],model),/noncausal/);
});
test('confidence interval is deterministic and does not pretend all records are independent',()=>{
 const v=Array.from({length:100},(_,i)=>i%2?0.01:-0.02),a=blockMeanInterval(v);assert.deepEqual(a,blockMeanInterval(v));assert.equal(a.independentBlockEstimate,20);assert.ok(a.upper<0);
});
test('failed validation stays failed despite superficially positive returns',()=>{
 const r={excess:Array(100).fill(-0.001),metrics:{tradeCount:2,durationDays:10,totalReturn:0.3,excessReturn:-0.1,maxDrawdown:0.6,brier:0.4,constantBrier:0.25}};
 const g=validationGates(r,r);assert.equal(g.passed,false);assert.ok(g.blockers.includes('beats_exposure_matched_benchmark'));assert.ok(g.blockers.includes('drawdown_within_limit'));
});
test('MPT matches an analytic one-asset optimum with an auditable convex gap',()=>{
 const result=optimizeMpt({expectedReturns:[0.04],covariance:[[0.1]],currentWeights:[0],costs:[0],caps:[0.5],totalExposure:0.8,riskAversion:2});
 assert.ok(Math.abs(result.weights[0]-0.2)<1e-7);assert.equal(result.certificate.converged,true);assert.ok(result.certificate.objectiveGapUpperBound<=1e-8);
});
test('cost-aware MPT prefers no trade when the edge does not cover turnover',()=>{
 const r=optimizeMpt({expectedReturns:[0.001],covariance:[[0.01]],currentWeights:[0],costs:[0.01],caps:[0.4]});assert.equal(r.weights[0],0);
});
test('MPT rejects indefinite/non-finite covariance and reports unfinished convergence',()=>{
 assert.throws(()=>optimizeMpt({expectedReturns:[1,1],covariance:[[1,2],[2,1]],currentWeights:[0,0],costs:[0,0],caps:[0.5,0.5]}),/non_positive/);
 const r=optimizeMpt({expectedReturns:[0.1,0.04],covariance:[[1,0.9],[0.9,1]],currentWeights:[0,0],costs:[0,0],caps:[0.5,0.5],maxIterations:1});assert.equal(r.certificate.converged,false);
});
test('100 deterministic portfolio trials preserve exposure caps and convex optimality bounds',()=>{
 for(let k=1;k<=100;k++){const n=3,R=Array.from({length:80},(_,t)=>Array.from({length:n},(_,j)=>Math.sin(t*(j+1)+k)*0.02)),C=shrinkageCovariance(R);
 const r=optimizeMpt({expectedReturns:[0.01,-0.003,0.006],covariance:C,currentWeights:[0.1,0.2,0.1],costs:[0.002,0.002,0.002],caps:[0.2,0.2,0.2],totalExposure:0.4});
 assert.ok(r.weights.every(w=>w>=0&&w<=0.2+1e-12));assert.ok(r.weights.reduce((a,b)=>a+b,0)<=0.4+1e-10);assert.ok(r.certificate.converged);}
});
const profile=()=>({riskTolerance:'balanced',quoteCurrency:'USDT',maxAssetWeight:0.4,maxExposure:0.8,annualVolatilityTarget:0.3,maxDrawdown:0.15,horizonDays:1000,cashReserve:'100',cashFlows:[]});
const account=()=>({quoteCurrency:'USDT',syncedAt:NOW,reconciled:true,openOrders:0,holdings:[],availableCash:'1000',flowAdjustedPeakEquity:1000});
const asset=()=>({symbol:'BTCUSDT',quoteCurrency:'USDT',quote:quote(),feeBps:10,expectedReturn:0.02,uncertainty:0.0001,liquidityCapWeight:0.5,eligible:true,lotStep:'0.001',priceTick:'0.01',minQuantity:'0.001',minNotional:'5',periodsPerYear:365,strategyHash:'abc'});
const returns=()=>Array.from({length:100},(_,i)=>[Math.sin(i)*0.01]);
function plan(p=profile(),a=account()){return planPortfolio({profile:p,account:a,assets:[asset()],returnMatrix:returns(),now:NOW});}
test('upcoming contributions are excluded and withdrawals reserve settled cash',()=>{
 const base=plan(),p=profile();p.cashFlows.push({type:'contribution',amount:'10000',dueAt:NOW+DAY,settled:false});
 const result=plan(p);assert.deepEqual(result.orders,base.orders);assert.equal(result.equity,1000);
 p.cashFlows.push({type:'withdrawal',amount:'850',dueAt:NOW+DAY,settled:false});const constrained=plan(p);assert.ok(Number(constrained.orders[0].notional)<=50);assert.equal(constrained.reservedCash,'950');
});
test('drawdown breach targets cash rather than taking more risk',()=>{
 const a=account();a.availableCash='600';a.holdings=[{symbol:'BTCUSDT',availableQuantity:'4'}];a.flowAdjustedPeakEquity=1400;
 const r=plan(profile(),a);assert.equal(r.orders[0].action,'SELL');assert.equal(r.orders[0].quantity,'4');assert.equal(r.optimizer.weights[0],0);
});
test('stale/unreconciled accounts or unvalued holdings fail closed',()=>{
 for(const patch of[{syncedAt:NOW-60000},{reconciled:false},{openOrders:1},{holdings:[{symbol:'ETHUSDT',availableQuantity:'1'}]}])assert.throws(()=>plan(profile(),{...account(),...patch}));
});
test('no execution can be authorized by a profitable research report alone',async()=>{
 const store=new EvidenceStore(':memory:',{allowMemory:true,now:()=>NOW});await assert.rejects(executeApprovedPlan({tenant:'alice',plan:plan(),strategyHashes:['abc'],store,mode:'live',now:NOW}),/durable/);store.close();
});
test('paper actions are idempotent and never call a broker',async()=>{
 const store=new EvidenceStore(':memory:',{allowMemory:true,now:()=>NOW}),p=plan();let calls=0;const input={tenant:'alice',plan:p,store,broker:{submitLimit:async()=>{calls++;}},now:NOW};
 assert.equal((await executeApprovedPlan(input)).status,'filled');assert.equal((await executeApprovedPlan(input)).duplicate,true);assert.equal(calls,0);store.close();
});
function fixtureReport(){const model={config:{horizon:1}};const body={model,strategyHash:fingerprint(model),createdAt:NOW-100,partitions:{test:{end:NOW-1000}},symbol:'BTCUSDT',interval:'1d',dataRelease:null,costs:costModel(),validation:{passed:true}};return{...body,reportHash:fingerprint(body)};}
test('prospective store rejects history masquerading as live evidence and immature outcomes',()=>{
 let now=NOW;const store=new EvidenceStore(':memory:',{allowMemory:true,now:()=>now});const report=fixtureReport();store.freeze('alice',report);
 assert.throws(()=>store.observe('alice',report.strategyHash,quote()),/not_prospective/);now+=200;
 const observation=store.observe('alice',report.strategyHash,quote('BTCUSDT',100,now));assert.equal(store.observe('alice',report.strategyHash,quote('BTCUSDT',100,now)).id,observation.id);
 assert.throws(()=>store.resolve('alice',observation.id,quote('BTCUSDT',120,now)),/not_mature/);assert.equal(store.forward('alice',report.strategyHash).passed,false);
 assert.throws(()=>store.observe('bob',report.strategyHash,quote()),/unknown_strategy/);store.close();
});
test('SQLite evidence persists through restart and unknown executions stay reserved',()=>{
 const dir=mkdtempSync(join(tmpdir(),'verified-ledger-')),file=join(dir,'ledger.db');
 try{let store=new EvidenceStore(file,{now:()=>NOW});const report=fixtureReport();store.freeze('alice',report);const p=plan();store.reserveExecution('alice','first',p);store.finishExecution('alice','first','unknown',{reconciliationRequired:true});store.close();
 store=new EvidenceStore(file,{now:()=>NOW});assert.equal(store.get('alice','strategy',report.strategyHash).strategyHash,report.strategyHash);assert.throws(()=>store.reserveExecution('alice','second',p),/unresolved_execution/);store.close();}
 finally{rmSync(dir,{recursive:true,force:true});}
});
