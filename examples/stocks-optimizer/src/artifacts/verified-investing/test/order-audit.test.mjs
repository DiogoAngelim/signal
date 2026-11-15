import test from 'node:test';
import assert from 'node:assert/strict';
import { auditExecutablePlan, withExecutionAudit } from '../src/order-audit.mjs';
import { planPortfolio } from '../src/portfolio.mjs';
import { fingerprint } from '../src/contracts.mjs';
const now = 1800000000000;
function fixture() {
  const profile = { riskTolerance:'balanced',quoteCurrency:'USDT',maxAssetWeight:0.4,maxExposure:0.8,
    annualVolatilityTarget:0.3,maxDrawdown:0.15,horizonDays:1000,cashReserve:'100',cashFlows:[] };
  const account = { quoteCurrency:'USDT',syncedAt:now,reconciled:true,openOrders:0,holdings:[],availableCash:'1000',flowAdjustedPeakEquity:1000 };
  const quote = { schemaVersion:'market-data.v1',provider:'binance-public',symbol:'BTCUSDT',price:100,bid:100,ask:100,
    observedAt:now,fetchedAt:now,expiresAt:now+5000,realtime:true,delayed:false,synthetic:false };
  const assets = [{ symbol:'BTCUSDT',quoteCurrency:'USDT',quote,feeBps:10,expectedReturn:0.01,uncertainty:0.0001,
    liquidityCapWeight:0.3,eligible:true,lotStep:'0.001',priceTick:'0.01',minQuantity:'0.001',minNotional:'5',maxQuantity:'100',periodsPerYear:365,strategyHash:'abc' }];
  return {profile,account,assets,returnMatrix:Array.from({length:100},(_,i)=>[Math.sin(i)*0.01]),now};
}
test('post-fee concentration is not certified just because the continuous optimizer converged', () => {
  const input=fixture(),plan=planPortfolio(input);const audit=auditExecutablePlan(plan,input);
  assert.equal(plan.optimizer.certificate.converged,true);
  assert.equal(audit.passed,false);assert.ok(audit.blockers.includes('BTCUSDT:post_trade_concentration'));
});
test('a feasible rounded proposal is independently checked including its fee and settled cash', () => {
  const input=fixture(),plan=planPortfolio(input);plan.orders[0].quantity='2';plan.orders[0].notional='200';plan.orders[0].estimatedFee='0.2';
  const audit=auditExecutablePlan(plan,input);assert.equal(audit.passed,true);assert.equal(audit.postTradeCash,'799.8');
  assert.equal(audit.discreteGlobalOptimalityProven,false);
});
test('rounding audit rejects overselling, inflated minimums, wrong steps and hidden sale funding', () => {
  for (const patch of [{action:'SELL',quantity:'1'}, {quantity:'0.0001'}, {quantity:'10'}, {action:'HOLD',quantity:'1'}]) {
    const input=fixture(),plan=planPortfolio(input);Object.assign(plan.orders[0],patch);assert.throws(()=>auditExecutablePlan(plan,input));
  }
});
test('an unliquidatable dust position is reported as residual risk, not zero portfolio exposure', () => {
  const input=fixture();input.account.holdings=[{symbol:'BTCUSDT',availableQuantity:'0.001'}];input.account.flowAdjustedPeakEquity=2000;
  const plan=planPortfolio(input);const audit=auditExecutablePlan(plan,input);
  assert.ok(audit.blockers.includes('drawdown_liquidation_residual'));assert.equal(audit.passed,false);
});
test('runtime attaches a separately hashed execution-feasibility certificate', async () => {
  const input=fixture(),plan=planPortfolio(input),runtime=withExecutionAudit({query:async()=>({ok:true,result:plan})});
  const result=await runtime.query('investing.plan.v1',input);const{planHash,...body}=result.result;
  assert.equal(planHash,fingerprint(body));assert.equal(result.result.status,'blocked');assert.equal(result.result.portfolioPolicyPerformanceVerified,false);
});
