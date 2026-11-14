/**
 * Monetary outcomes, genuinely randomized *historical job training*, NOT
 * Signal software or net firm profit. Executes real Signal quantitative API
 * with train-only uncertainty-bound evidence and strictly equal-information
 * strong conventional policies. Outcome labels are never substituted for
 * unobserved potential outcomes.
 *
 * Built package required:
 * node scripts/validation/nsw-earnings-evidence-policy.mjs --self-test
 * node scripts/validation/nsw-earnings-evidence-policy.mjs \
 *   /private/heldout.jsonl /private/pinned-source-summary.json
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import decision from "../../packages/decision/dist/index.js";
const { evaluateQuantitativeDecision }=decision;
assert.equal(typeof evaluateQuantitativeDecision,"function",
  "Actual published Signal quantitative decision engine required");
const SOURCE_COMMIT="1dcc2bf5f955cc1224a3e1307256e1fe86b68dae";
const METHODS=[
  "signalUncertaintyGuard",
  "conventionalIdenticalGuard",
  "conventionalRichRidgeMean",
  "conventionalRichRandomForest",
  "conventionalLimitedHistoryRidge",
  "alwaysTrain",
  "neverTrain"
];
const N=445,ARM_N={0:260,1:185},PROP={0:260/N,1:185/N};
const OUTPUT="artifacts/validation/nsw-real-earnings-evidence-value.json";
const REPORT="REAL_RCT_MONETARY_EARNINGS_NOT_NET_PROFIT_OR_SIGNAL_SOFTWARE_CAUSAL";
const FEATURE_FIELDS=["unit_hash","assigned_arm","realized_earnings",
  "richRidgeControl","richRidgeTreatment",
  "richForestControl","richForestTreatment",
  "limitedRidgeControl","limitedRidgeTreatment","lowerConfidenceDifference"];
const sha=s=>createHash("sha256").update(s).digest("hex");
const numeric=(n,key)=>{
  assert(typeof n==="number"&&Number.isFinite(n)&&Math.abs(n)<=1e8,
    "nonfinite or unreasonable real modeled "+key);
  return n;
};
const quantile=(ordered,q)=>{
  const k=(ordered.length-1)*q;
  const low=Math.floor(k),high=Math.ceil(k);
  return ordered[low]+(ordered[high]-ordered[low])*(k-low);
};
function bootstrap(values,repetitions=3000){
  let state=20261114>>>0;
  const random=()=>{
    state=(Math.imul(1664525,state)+1013904223)>>>0;
    return state/4294967296;
  };
  const point=values.reduce((s,x)=>s+x,0)/values.length;
  const draws=new Array(repetitions);
  for(let b=0;b<repetitions;b++){
    let t=0;
    for(let i=0;i<values.length;i++)
      t+=values[Math.floor(random()*values.length)];
    draws[b]=t/values.length;
  }
  draws.sort((a,b)=>a-b);
  return {point,bootstrap95:[quantile(draws,.025),quantile(draws,.975)],
    intervalExcludesZero:draws[Math.floor(repetitions*.025)]>0||
      draws[Math.floor(repetitions*.975)]<0,
    independentSamplingUnitsUnverified:true};
}
function parse(file){
  assert(typeof file==="string"&&Buffer.byteLength(file)<200000,
    "oversized held-out individual research source");
  const lines=file.trimEnd().split(/\r?\n/);
  assert(lines.length>=100&&lines.length<=N,"invalid held-out record count");
  const seen=new Set();
  return lines.map(line=>{
    assert(line.length<=1024,"source row too long");
    const r=JSON.parse(line);
    assert(r&&typeof r==="object"&&!Array.isArray(r));
    assert.deepEqual(Object.keys(r).sort(),[...FEATURE_FIELDS].sort(),
      "unexpected source field, risk of post-outcome leakage");
    assert(typeof r.unit_hash==="string"&&/^[a-f0-9]{64}$/.test(r.unit_hash),
      "pseudonymous unit digest required");
    assert(!seen.has(r.unit_hash),"duplicate experimental unit");
    seen.add(r.unit_hash);
    assert(r.assigned_arm===0||r.assigned_arm===1,"invalid randomized arm");
    numeric(r.realized_earnings,"source earnings");
    assert(r.realized_earnings>=0,"negative observed earning requires adjudication");
    for(const field of FEATURE_FIELDS.slice(3))numeric(r[field],field);
    return r;
  });
}
function chooseSignal(r){
  const conf=r.lowerConfidenceDifference;
  const data=evaluateQuantitativeDecision({
    modelVersion:"nsw-uncertainty-research-only-20261114-v1",
    unit:"1978 annual earnings dollars (NOT firm profit)",
    probabilityEvidence:"estimated",
    states:[{id:"estimated_mean",probability:1}],
    actions:[
      {id:"no_training",payoffs:[{stateId:"estimated_mean",amount:r.richRidgeControl}]},
      {id:"training",
        prohibited:conf<=0, // model uncertainty: experimental research only.
        payoffs:[{stateId:"estimated_mean",amount:r.richRidgeTreatment}]}
    ]
  });
  assert.equal(data.status,"recommended");
  return data.recommendedActionId==="training"?1:0;
}
function policies(r){
  const inferred=chooseSignal(r);
  const guards=Number(r.richRidgeTreatment>r.richRidgeControl &&
    r.lowerConfidenceDifference>0);
  assert.equal(inferred,guards,"actual Signal conditional optimization must match fair conventional uncertainty guard");
  const mean=Number(r.richRidgeTreatment>r.richRidgeControl);
  const forest=Number(r.richForestTreatment>r.richForestControl);
  const limited=Number(r.limitedRidgeTreatment>r.limitedRidgeControl);
  return {
    signalUncertaintyGuard:inferred,conventionalIdenticalGuard:guards,
    conventionalRichRidgeMean:mean,
    conventionalRichRandomForest:forest,
    conventionalLimitedHistoryRidge:limited,
    alwaysTrain:1,neverTrain:0,
  };
}
function evaluate(raw,summary,strict=true){
  assert(summary.sourceCommit===SOURCE_COMMIT,"mutable source commit rejected");
  assert(summary.sourceRepo==="vincentarelbundock/Rdatasets");
  assert(summary.sourceRowCount===N);
  assert(Number(summary.sourceArmCounts["0"])===ARM_N[0] &&
    Number(summary.sourceArmCounts["1"])===ARM_N[1],
    "historical randomized population changed");
  assert(summary.observedOutcome.includes("1978") &&
    summary.observedOutcome.includes("earnings"));
  assert(summary.observedProgramCosts===false &&
    summary.randomizedSignalSoftware===false);
  assert(summary.splitDesign.includes("70/30"));
  const rows=parse(raw);
  assert(rows.length===summary.heldoutCount,"mismatched source holdout");
  const counts={
    control:rows.filter(x=>x.assigned_arm===0).length,
    treated:rows.filter(x=>x.assigned_arm===1).length
  };
  assert(counts.control>=40&&counts.treated>=40,
    "missing real arm support");
  const actions={},dr={},ips={};
  for(const method of METHODS){actions[method]=0;dr[method]=[];ips[method]=[];}
  const differences=[];
  for(const r of rows){
    const decisions=policies(r);
    const mu={0:r.richRidgeControl,1:r.richRidgeTreatment};
    const assigned=r.assigned_arm;
    for(const method of METHODS){
      const policy=decisions[method];
      actions[method]+=policy;
      const match=Number(policy===assigned);
      // Doubly robust off-policy score with genuine observed outcome ONLY
      // for historically randomized assigned arm. Nuisance predictions
      // trained on disjoint source rows; no counterfactual wages invented.
      const score=mu[policy]+match/PROP[assigned]*
        (r.realized_earnings-mu[assigned]);
      const ordinaryIPS=match*r.realized_earnings/PROP[assigned];
      numeric(score,"doubly-robust realized earnings");
      numeric(ordinaryIPS,"IPS realized earnings");
      dr[method].push(score);
      ips[method].push(ordinaryIPS);
    }
    differences.push(Number(decisions.signalUncertaintyGuard!==
      decisions.conventionalRichRidgeMean));
  }
  const avg=x=>x.reduce((s,y)=>s+y,0)/x.length;
  const comparisons={};
  for(const method of METHODS.filter(x=>x!=="signalUncertaintyGuard")){
    const d=dr.signalUncertaintyGuard.map((x,i)=>x-dr[method][i]);
    const di=ips.signalUncertaintyGuard.map((x,i)=>x-ips[method][i]);
    comparisons[method]={
      pairedDoublyRobustUsdPerPerson:bootstrap(d),
      pairedIPSUsdPerPerson:bootstrap(di),
      identicalDecisions:method==="conventionalIdenticalGuard"?
        actions.signalUncertaintyGuard===actions[method]&&d.every(x=>x===0):null,
    };
  }
  assert(comparisons.conventionalIdenticalGuard.identicalDecisions);
  assert.deepEqual(comparisons.conventionalIdenticalGuard.pairedDoublyRobustUsdPerPerson.bootstrap95,[0,0]);
  const result={
    classification:REPORT,
    sourceDescription:summary.sourceDataset,
    sourceURL:"https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/"+SOURCE_COMMIT+"/csv/causaldata/nsw_mixtape.csv",
    originalSourceSHA256:summary.sourceSHA256,
    originalRCTN:summary.sourceRowCount,originalArms:summary.sourceArmCounts,
    heldoutN:rows.length,heldoutArms:counts,trainingN:summary.trainCount,
    priorCalibrationOrTestReuse:false,
    outcome:"1978 individual real earnings; historical source dollar units",
    realObservedMonetaryOutcomes:true,
    sourceEarningsNotBusinessNetProfit:true,
    trainingProgramDirectCostUSD:null,
    actualSignalSoftwareRunningCostUSD:null,
    nativeSignalEvidencePermissionGateEvaluated:false,
    researchOnlyCallerProhibitedActionBasedOnModeledUncertainty:true,
    sourceCommit:SOURCE_COMMIT,sourceSHA256:summary.sourceSHA256,
    preTreatmentFeaturesOnly:true,
    protectedCharacteristicsExcluded:true,
    fixedModelsFromTrainingOnly:true,
    uncertaintyBound:"10th percentile of independent train-only ridge bootstrap",
    fullRCTTreatmentPropensities:PROP,
    chosenTrainingCount:actions,
    policyActionDisagreementVsRidgeMean:
      differences.reduce((s,x)=>s+x,0)/rows.length,
    meanRealEarningsPolicyDR:Object.fromEntries(METHODS.map(k=>[k,avg(dr[k])])),
    meanRealEarningsPolicyIPS:Object.fromEntries(METHODS.map(k=>[k,avg(ips[k])])),
    signalVsAlternatives:comparisons,
    causalSignalSoftwareNetProfitVerified:false,
    interpretations:[
      "Historical randomized assignment of job training identifies action-policy value with known valid propensities under consistency/support; it does not identify causal Signal software adoption.",
      "Individual source earnings are monetary but omit program financing, placement costs, payroll, welfare and actual software expenses; no net business profit calculated.",
      "Signal research uncertainty gate uses the action prohibited input on modeled estimates, NOT the native evidence governance engine; native decision permissions remain untested.",
      "The strong conventional uncertainty-aware optimizer receives identical uncertainty estimates and makes exactly the same choices.",
      "Signal's rule may give up positive realized earnings for more conservative uncertainty; bootstrap estimates can be noisy with just 445 total randomized historical units.",
      "DR requires correct randomized treatment propensity and noninterference; fixed-treatment original design and clustering should receive external verification before treating these as definitive causal policy-value intervals.",
      "Any favorable secondary comparator result may be post-publication exploratory; it is not software-incremental net profit or evidence of actual deployment benefit."
    ]
  };
  assert(result.originalRCTN===445&&result.causalSignalSoftwareNetProfitVerified===false);
  if(strict)assert(rows.length>=100);
  return result;
}
function selfTest(){
  const rows=Array.from({length:150},(_,i)=>{
    const assignment=i%3===0?1:0;
    const c=5000+i*3,tx=c+((i%7)-3)*100;
    return {unit_hash:sha("synthetic-NSW-fixture|"+i),
      assigned_arm:assignment,realized_earnings:c+assignment*(tx-c)+(i%5)*25,
      richRidgeControl:c,richRidgeTreatment:tx,
      richForestControl:c*0.98,richForestTreatment:tx*1.02,
      limitedRidgeControl:c*1.01,limitedRidgeTreatment:tx*1.01,
      lowerConfidenceDifference:tx-c-50};
  });
  const s=rows.map(JSON.stringify).join("\n")+"\n";
  const meta={sourceCommit:SOURCE_COMMIT,sourceRepo:"vincentarelbundock/Rdatasets",
    sourceRowCount:445,sourceArmCounts:{0:260,1:185},
    observedOutcome:"1978 individual annual real earnings",
    observedProgramCosts:false,randomizedSignalSoftware:false,
    splitDesign:"SHA256 70/30",heldoutCount:150,trainCount:295,
    sourceSHA256:"synthetic-only"};
  const result=evaluate(s,meta,false);
  assert.equal(result.heldoutN,150);
  assert.equal(result.causalSignalSoftwareNetProfitVerified,false);
  assert.equal(result.realObservedMonetaryOutcomes,true);
  assert.deepEqual(result.signalVsAlternatives.conventionalIdenticalGuard
    .pairedDoublyRobustUsdPerPerson.bootstrap95,[0,0]);
  assert.throws(()=>evaluate(s,({...meta,sourceCommit:"mutable"}),false),
    /mutable source commit/);
  assert.throws(()=>evaluate(s.replace('"realized_earnings":', '"unobserved_counterfactual":'),
    meta,false),/unexpected source field/);
  assert.throws(()=>evaluate(s.replace('"assigned_arm":1','"assigned_arm":-1'),
    meta,false),/invalid randomized arm/);
  console.log("SELF_TEST_PASS: actual Signal decision engine, historical assignments, disjoint model sources, strong identical-information comparator, paired doubly robust and IPS statistical checks");
  console.log("SYNTHETIC SELF-TEST ONLY. NO ACTUAL SIGNAL SOFTWARE RANDOMIZATION OR NET FIRM PROFIT.");
}
async function main(){
  if(process.argv.includes("--self-test"))return selfTest();
  assert(process.argv.length===4,
    "usage: nsw-earnings-evidence-policy.mjs heldout.jsonl original-source-summary.json");
  const [data,meta]=await Promise.all([readFile(process.argv[2],"utf8"),
    readFile(process.argv[3],"utf8")]);
  const result=evaluate(data,JSON.parse(meta));
  await mkdir("artifacts/validation",{recursive:true});
  await writeFile(OUTPUT,JSON.stringify(result,null,2)+"\n");
  console.log("REAL_NSW_MONETARY_RCT_REPORT "+JSON.stringify({
    study:result.classification,
    sample:result.heldoutN,
    heldoutArms:result.heldoutArms,
    sourceSHA256:result.sourceSHA256,
    actionCounts:result.chosenTrainingCount,
    decisionsDifferVsExpectedMean:result.policyActionDisagreementVsRidgeMean,
    heldoutDRMeanEarnings:result.meanRealEarningsPolicyDR,
    signalVersusComparators:result.signalVsAlternatives,
    historicalMonetaryEarningsObserved:result.realObservedMonetaryOutcomes,
    bankVerifiedRealCashReceiptsObserved:false,
    netFirmProfitObserved:!result.sourceEarningsNotBusinessNetProfit,
    actualSoftwareRandomized:false,
    softwareCausalProfitProven:result.causalSignalSoftwareNetProfitVerified
  }));
}
await main();
