import test from 'node:test';
import assert from 'node:assert/strict';
import {backtest} from '../src/research.mjs';
import {afterCosts,costModel} from '../src/contracts.mjs';
test('buy-and-hold benchmark pays a single round trip, not one each day',()=>{
 const model={centers:[0],scales:[1],ridge:[0,0],logistic:[-10,0],roundTripCost:0.001,positiveClassRate:0.5,config:{probabilityThreshold:0.55},calibrator:null};
 const rows=Array.from({length:50},(_,i)=>({time:i*86400000,entryTime:i*86400000+1,exitTime:(i+1)*86400000-1,entry:100,exit:100,grossReturn:0,x:[0]}));
 const result=backtest(rows,model,{costs:costModel(),exposure:0.25});
 assert.ok(Math.abs(result.metrics.benchmarkReturn-0.25*afterCosts(100,100,costModel()))<1e-12);
 assert.equal(result.metrics.totalReturn,0);
});
