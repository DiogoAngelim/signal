/**
 * Independent mathematical falsification of extra expected-NET profit claimed
 * for an identical-information quantitative decision optimizer.
 *
 * THIS IS NOT AN EMPIRICAL CAUSAL VALIDATION. It uses deterministic synthetic
 * decision models and the *actual built @signal/decision engine* to verify:
 * - Signal risk-advisor equals independent conventional same-risk argmax.
 * - If the model is correct, conventional risk-neutral argmax cannot be beaten
 *   on expected net utility by a Signal action under equal feasible actions.
 * - Any additional nonnegative Signal deployment cost cannot improve its
 *   expected net-utility delta without information/execution differences.
 *
 * node scripts/validation/equal-information-net-profit-bound.mjs
 */
import assert from "node:assert/strict";
import decision from "../../packages/decision/dist/index.js";
const {evaluateQuantitativeDecision,evaluateInformationValue}=decision;
assert.equal(typeof evaluateQuantitativeDecision,"function");
assert.equal(typeof evaluateInformationValue,"function");
const MODEL_COUNT=4000;
const EPS=1e-7;
function seeded(seed){
  let s=seed>>>0;
  return ()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};
}
const rnd=seeded(20261114);
function choice(n){return Math.floor(rnd()*n);}
function tail(values,probs,mass){
  let remaining=mass,integral=0;
  const sorted=values.map((value,i)=>({value,p:probs[i]}))
    .sort((a,b)=>a.value-b.value);
  for(const item of sorted){
    const part=Math.min(remaining,item.p);
    integral+=part*item.value;
    remaining-=part;
    if(remaining<=1e-12)break;
  }
  return integral/mass;
}
function independent(model){
  const df=(1+(model.annualDiscountRate??0))**-(model.payoffHorizonYears??0);
  const prob=model.states.map(s=>s.probability);
  const risk=model.riskPolicy??{};
  const penalty=risk.downsidePenalty??0;
  const mass=risk.tailMass??.1;
  const scored=model.actions.map((act,index)=>{
    const values=model.states.map(state=>{
      const p=act.payoffs.find(v=>v.stateId===state.id);
      assert(p,"missing payoff in independent computation");
      return p.amount*df-(act.upfrontCost??0)-(act.opportunityCost??0);
    });
    const mean=values.reduce((sum,v,i)=>sum+prob[i]*v,0);
    const lowerTail=tail(values,prob,mass),worst=Math.min(...values);
    const feasible=!act.prohibited&&
      (risk.minimumWorstCase===undefined||worst>=risk.minimumWorstCase)&&
      (risk.minimumLowerTailMean===undefined||lowerTail>=risk.minimumLowerTailMean);
    const objective=mean-penalty*Math.max(0,mean-lowerTail);
    return {id:act.id,index,mean,objective,feasible,lowerTail};
  });
  const options=scored.filter(x=>x.feasible);
  const best=key=>[...options].sort((a,b)=>
    b[key]-a[key]||a.index-b.index)[0]??null;
  return {scored,risk:best("objective"),neutral:best("mean")};
}
const near=(a,b)=>Math.abs(a-b)<EPS*Math.max(1,Math.abs(a),Math.abs(b));
function generate(i){
  const k=2+choice(6),acts=2+choice(6);
  const weights=Array.from({length:k},()=>.01+rnd());
  const sum=weights.reduce((a,b)=>a+b,0);
  const states=weights.map((w,j)=>({id:"state"+j,probability:w/sum}));
  const actions=Array.from({length:acts},(_,j)=>({
    id:j===0?"wait":"action"+j,
    payoffs:states.map(s=>({stateId:s.id,
      amount:j===0?0:Math.round((rnd()*220-90)*100)/100})),
    upfrontCost:j===0?0:Math.round(rnd()*12*100)/100,
    opportunityCost:j===0?0:Math.round(rnd()*12*100)/100,
    prohibited:j!==0 && rnd()<.11
  }));
  const downsidePenalty=[0,.15,.5,1,2][choice(5)];
  const riskPolicy={tailMass:[.1,.25,.5][choice(3)],downsidePenalty};
  if(i%9===0)riskPolicy.minimumWorstCase=-20;
  return {modelVersion:"research-conditional-bound-v1",unit:"USD net modeled",
    probabilityEvidence:"estimated",
    states,actions,riskPolicy,
    annualDiscountRate:[0,.04,.12][choice(3)],
    payoffHorizonYears:[0,1,2][choice(3)]};
}
let feasible=0,infeasible=0,advisoryDisagreement=0,meanOpportunityLoss=0;
let riskModelParityFailures=0,neutralModelParityFailures=0,maximumPositiveNetDelta=-Infinity;
for(let i=0;i<MODEL_COUNT;i++){
  const model=generate(i);
  const actual=evaluateQuantitativeDecision(model);
  const comp=independent(model);
  assert.equal(actual.actions.length,model.actions.length);
  for(let j=0;j<comp.scored.length;j++){
    const c=comp.scored[j],a=actual.actions[j];
    assert.equal(a.actionId,c.id);
    assert.equal(a.feasible,c.feasible);
    assert(near(a.expectedUtility,c.mean));
    assert(near(a.objectiveValue,c.objective));
    assert(near(a.lowerTailMean,c.lowerTail));
  }
  if(!comp.risk){
    infeasible++;
    assert.equal(actual.status,"no_feasible_action");
    assert.equal(actual.recommendedActionId,null);
    continue;
  }
  feasible++;
  assert.equal(actual.status,"recommended");
  if(actual.recommendedActionId!==comp.risk.id)riskModelParityFailures++;
  assert.equal(actual.recommendedActionId,comp.risk.id);
  assert(comp.neutral);
  const chosen=comp.scored.find(x=>x.id===actual.recommendedActionId);
  assert(chosen);
  const neutral=comp.neutral.mean;
  // Common modeled expected USD-net utility under the SAME state model:
  //  E[profit(Signal)] - E[profit(conventional argmax)] <= 0.
  const delta=chosen.mean-neutral;
  if(delta>EPS)neutralModelParityFailures++;
  assert(delta<=EPS,"unexpected expected utility advantage over exact argmax");
  if(!near(delta,0)){
    advisoryDisagreement++;
    meanOpportunityLoss+=-delta;
  }
  // Worst case for a claimed incremental net gain is already 0 before
  // adding the extra nonnegative Signal-specific operating cost.
  maximumPositiveNetDelta=Math.max(maximumPositiveNetDelta,delta);
}
// Positive sign indicates how much expected USD the risk-aware choice
// sacrifices on these correctly specified synthetic models, not realized losses.
assert.equal(riskModelParityFailures,0);
assert.equal(neutralModelParityFailures,0);
assert(feasible>1000);
assert(advisoryDisagreement>0);
assert(maximumPositiveNetDelta<=EPS);
// Explicit state of the risk trade-off: choosing safety can sacrifice mean
// expected profit without being an "incorrect" risk-adjusted decision.
const stress={
  modelVersion:"risk-tradeoff-v1",unit:"USD expected net",
  probabilityEvidence:"estimated",
  states:[{id:"good",probability:.8},{id:"bad",probability:.2}],
  actions:[
    {id:"wait",payoffs:[{stateId:"good",amount:0},{stateId:"bad",amount:0}]},
    {id:"invest",payoffs:[{stateId:"good",amount:50},{stateId:"bad",amount:-100}]}
  ],riskPolicy:{tailMass:.2,downsidePenalty:1}
};
const stressResult=evaluateQuantitativeDecision(stress);
assert.equal(stressResult.recommendedActionId,"wait");
assert(near(independent(stress).neutral.mean,20));
assert(near(independent(stress).risk.mean,0));
const report={
  classification:"SYNTHETIC_MATHEMATICAL_CONDITIONAL_OPTIMUM_BOUND_NOT_REAL_WORLD_PROFIT",
  source:"actual @signal/decision evaluateQuantitativeDecision and independent argmax",
  seed:20261114,models:MODEL_COUNT,feasibleModels:feasible,
  noFeasibleModels:infeasible,
  riskOptimizerParityFailures:riskModelParityFailures,
  expectedNetOptimumDominanceFailures:neutralModelParityFailures,
  riskAwareCasesWithLowerModeledMean:advisoryDisagreement,
  meanModeledMeanSacrificeConditionalOnDifferenceUSD:
    advisoryDisagreement?meanOpportunityLoss/advisoryDisagreement:0,
  maximumModeledIncrementalNetUSDOverCorrectEqualInformationArgmax:
    Math.max(0,maximumPositiveNetDelta),
  observedRealCashProfit:false,randomizedSignalSoftware:false,
  causalSignalNetProfitSuperiorityProven:false,
  necessarySourcesOfTrueIncrementalValue:[
    "validated improved predictive information rather than identical state probabilities",
    "measured independent calibration or evidence collection improving action choices",
    "lower actual review, execution, delay, compute or other operating costs",
    "documented causal risk/harm reduction net of its economic and social costs"
  ],
  interpretation:"Theorem: with identical feasible actions and correct conditional expected net payoff inputs, the conventional risk-neutral argmax maximizes expected net payoff. Any other rule (including risk-aware Signal) cannot have higher expected net payoff under the same inputs; additional nonnegative software cost can only worsen net value without another benefit. A different downside-risk objective can justify lower mean profit. Synthetic stress tests validate code's agreement with this analytical conclusion; they do not verify model probabilities, true losses, financial accounts or prospective software causality."
};
console.log("SYNTHETIC_CONDITIONAL_OPTIMUM_AUDIT "+JSON.stringify(report));
