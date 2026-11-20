import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyResearchBatchMember } from '../src/batch-qualification.mjs';
const fixture = (passed = true) => ({ validation:{passed,blockers:passed?[]:['adequate_sample']},finalTest:{excess:Array.from({length:100},()=>0.01)},fixtureOnly:true });
test('family adjustment cannot override a failed original strategy gate',()=>{
 const result=qualifyResearchBatchMember(fixture(false),4);assert.equal(result.historicalResearchQualified,false);assert.equal(result.familyAdjustedExcessPass,true);assert.ok(result.blockers.includes('adequate_sample'));
});
test('even a qualified fixture has no prospective, portfolio-policy or live authorization',()=>{
 const result=qualifyResearchBatchMember(fixture(),4);assert.equal(result.historicalResearchQualified,true);assert.equal(result.interval.confidence,0.9875);
 assert.equal(result.prospectivePassed,false);assert.equal(result.portfolioPolicyPerformanceVerified,false);assert.equal(result.liveTradingApproved,false);
});
test('negative or uncertain comparative returns stay unqualified',()=>{
 const report=fixture();report.finalTest.excess=Array.from({length:100},(_,i)=>i%2?0.01:-0.012);
 const result=qualifyResearchBatchMember(report,4);assert.equal(result.historicalResearchQualified,false);assert.ok(result.blockers.includes('family_adjusted_excess_not_established'));
});
test('invalid family sizes and incomplete evidence are rejected',()=>{
 for(const size of [0,51,NaN,1.5])assert.throws(()=>qualifyResearchBatchMember(fixture(),size));
 assert.throws(()=>qualifyResearchBatchMember({validation:{passed:true,blockers:[]},finalTest:{excess:[]}},4));
});
