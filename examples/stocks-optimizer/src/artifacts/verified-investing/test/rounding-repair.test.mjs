import test from 'node:test';
import assert from 'node:assert/strict';
import { repairRoundedPlan, withFeasibleLots } from '../src/rounding-repair.mjs';
import { planPortfolio } from '../src/portfolio.mjs';
import { fingerprint } from '../src/contracts.mjs';
const now=1800000000000;
function fixture(){return{profile:{riskTolerance:'balanced',quoteCurrency:'USDT',maxAssetWeight:0.4,maxExposure:0.8,annualVolatilityTarget:0.3,maxDrawdown:0.15,horizonDays:1000,cashReserve:'100',cashFlows:[]},
 account:{quoteCurrency:'USDT',syncedAt:now,reconciled:true,openOrders:0,holdings:[],availableCash:'1000',flowAdjustedPeakEquity:1000},
 assets:[{symbol:'BTCUSDT',quoteCurrency:'USDT',quote:{schemaVersion:'market-data.v1',provider:'binance-public',symbol:'BTCUSDT',price:100,bid:100,ask:100,observedAt:now,fetchedAt:now,expiresAt:now+5000,realtime:true,delayed:false,synthetic:false},feeBps:10,expectedReturn:0.02,uncertainty:0.0001,liquidityCapWeight:0.3,eligible:true,lotStep:'0.001',priceTick:'0.01',minQuantity:'0.001',minNotional:'5',periodsPerYear:365,strategyHash:'abc'}],returnMatrix:Array.from({length:100},(_,i)=>[Math.sin(i)*0.01]),now};}
test('one-lot repair makes the post-fee concentration constraint feasible without inflating an order',()=>{
 const input=fixture(),original=planPortfolio(input),fixed=repairRoundedPlan(original,input);
 assert.equal(original.orders[0].quantity,'3');assert.equal(fixed.orders[0].quantity,'2.999');assert.equal(fixed.executionAudit.passed,true);assert.equal(fixed.lotRepair.steps,1);
 const{planHash,...body}=fixed;assert.equal(planHash,fingerprint(body));assert.equal(fixed.portfolioPolicyPerformanceVerified,false);
});
test('repair budget exhaustion remains blocked rather than certifying an unfinished allocation',()=>{
 const input=fixture(),fixed=repairRoundedPlan(planPortfolio(input),input,{maxSteps:0});assert.equal(fixed.status,'blocked');assert.equal(fixed.executionAudit.passed,false);
});
test('the actual runtime wrapper returns a hashed, feasible lot-sized proposal',async()=>{
 const input=fixture(),runtime=withFeasibleLots({query:async()=>({ok:true,result:planPortfolio(input)})});
 const result=await runtime.query('investing.plan.v1',input);assert.equal(result.result.executionAudit.passed,true);assert.equal(result.result.status,'proposed');
});
