import test from 'node:test';
import assert from 'node:assert/strict';
import * as signal from '../dist/signal-adapter.mjs';
import { discoverStrategy } from '../src/research.mjs';
import { sha256 } from '../src/contracts.mjs';
test('latest pinned Signal runtime executes queries and rejects invalid investing inputs',async()=>{
 const runtime=signal.createInvestingRuntime();const result=await runtime.query('investing.plan.v1',{});assert.equal(result.ok,false);assert.ok(result.error);
});
test('actual Signal probability calibration rejects too-small or non-independent split declarations',()=>{
 assert.throws(()=>signal.fitBinaryIsotonicCalibrator([],{modelVersion:'m',calibrationDatasetVersion:'d',split:'calibration_only'}));
 assert.throws(()=>signal.fitBinaryIsotonicCalibrator([],{modelVersion:'m',calibrationDatasetVersion:'d',split:'test'}));
 const rows=Array.from({length:400},(_,i)=>({id:String(i),rawProbability:(i+0.5)/400,observedOutcome:i>200?1:0}));
 const fit=signal.fitBinaryIsotonicCalibrator(rows,{modelVersion:'m',calibrationDatasetVersion:'d',split:'calibration_only'});
 assert.ok(signal.applyBinaryIsotonicCalibrator(fit,0.8)>signal.applyBinaryIsotonicCalibrator(fit,0.2));assert.equal(fit.causalProfitEffectProven,false);
});
test('end-to-end research uses actual pinned Signal calibration and never manufactures prospective success',()=>{
 const now=1800000000000,day=86400000,n=2200,end=Math.floor(now/day)*day;let price=100,seed=4321;
 const bars=Array.from({length:n},(_,i)=>{seed=(1664525*seed+1013904223)>>>0;const open=price;price*=Math.exp(0.008*Math.sin(i/13)+(seed/4294967296-0.5)*0.018);
 return{timestamp:end-(n-i)*day,closeTime:end-(n-i-1)*day-1,open,high:Math.max(open,price)*1.005,low:Math.min(open,price)*0.995,close:price,volume:1000+i%53};});
 const fixture={schemaVersion:'market-data.v1',provider:'binance-public',symbol:'BTCUSDT',interval:'1d',bars,dataHash:sha256(JSON.stringify(bars)),consumption:{displayOnly:false},quality:{real:true,synthetic:false,closedOnly:true,complete:true}};
 // Generated fixture tests mathematical plumbing only, NOT empirical market-performance evidence.
 const result=discoverStrategy([fixture],{now,signal});assert.equal(result.model.calibrator.method,'shrunken_isotonic_pav_v1');
 assert.equal(result.prospective.passed,false);assert.equal(result.deploymentEligible,false);assert.equal(result.selection.candidatesTested,12);
 assert.ok(result.partitions.train.end<result.partitions.selection.start);assert.ok(result.partitions.selection.end<result.partitions.calibration.start);
 assert.ok(result.partitions.calibration.end<result.partitions.test.start);assert.equal(typeof result.validation.passed,'boolean');assert.match(result.reportHash,/^[a-f0-9]{64}$/);
});
