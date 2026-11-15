import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvestingRuntime} from '../dist/signal-adapter.mjs';
import {planPortfolio} from '../src/portfolio.mjs';
const now=1800000000000;
function input(){return{now,profile:{riskTolerance:'balanced',quoteCurrency:'USDT',maxAssetWeight:0.25,maxExposure:0.5,annualVolatilityTarget:0.3,maxDrawdown:0.15,horizonDays:1000,cashReserve:'100',cashFlows:[]},
 account:{quoteCurrency:'USDT',availableCash:'1000',holdings:[],syncedAt:now,reconciled:true,openOrders:0,flowAdjustedPeakEquity:1000},
 assets:[{symbol:'BTCUSDT',quoteCurrency:'USDT',strategyHash:'fixture',eligible:true,feeBps:10,expectedReturn:0.02,uncertainty:0.0001,liquidityCapWeight:0.25,lotStep:'0.001',priceTick:'0.01',minQuantity:'0.001',minNotional:'5',periodsPerYear:365,
 quote:{schemaVersion:'market-data.v1',provider:'binance-public',symbol:'BTCUSDT',price:100,bid:100,ask:100,observedAt:now-100,fetchedAt:now,expiresAt:now+5000,realtime:true,delayed:false,synthetic:false}}],
 returnMatrix:Array.from({length:100},(_,i)=>[Math.sin(i)*0.01])};}
test('real pinned runtime executes a valid portfolio query end-to-end',async()=>{
 const expected=planPortfolio(input()),result=await createInvestingRuntime().query('investing.plan.v1',input());
 assert.equal(result.ok,true);assert.equal(result.result.planHash,expected.planHash);assert.equal(result.result.executionAuthorized,false);
});
test('outside validated entry windows the allocator cannot increase exposure',()=>{
 const data=input();data.assets[0].allowIncrease=false;const plan=planPortfolio(data);
 assert.equal(plan.orders[0].action,'HOLD');assert.equal(plan.orders[0].quantity,'0');assert.equal(plan.optimizer.weights[0],0);
});
