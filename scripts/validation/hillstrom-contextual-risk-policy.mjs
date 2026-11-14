/** EXPERIMENTAL historical randomized policy comparison.
 * Risk-aware Signal decision vs an equally-informed conventional contextual
 * maximum expected-value rule. This is a reused dataset: EXPLORATORY only.
 * No Signal-specific implementation causality, no measured net profit.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import signalDecision from "../../packages/decision/dist/index.js";

const { evaluateQuantitativeDecision } = signalDecision;
assert.equal(typeof evaluateQuantitativeDecision, "function",
  "real Signal quantitative decision API must be present");
const EXPECTED_SHA256 =
  "0e5893329d8b93cefecc571777672028290ab69865718020c78c7284f291aece";
const FILENAME =
  "Kevin_Hillstrom_MineThatData_E-MailAnalytics_DataMiningChallenge_2008.03.20.csv";
const URLS = [
  "https://raw.githubusercontent.com/W-Tran/uplift-modelling/0b9b1787a33a0f67bd66dda6910b08fa67c1564d/data/hillstrom/" + FILENAME,
  "http://www.minethatdata.com/" + FILENAME,
  "https://www.minethatdata.com/" + FILENAME,
];
const STUDY_ID = "hillstrom-contextual-risk-signal-incremental-exploratory-20261114-v1";
const BOOTSTRAP_SEED = 20261114;
const BOOTSTRAP_REPS = 2000;
const ALPHA_Z = 1.959963984540054;
const OUT = "artifacts/validation/hillstrom-contextual-risk-policy-report.json";
const ARMS = ["No E-Mail", "Mens E-Mail", "Womens E-Mail"];
const ARM_IDS = ["no_email", "mens_email", "womens_email"];
const PROTOCOL =
  "docs/case-studies/hillstrom-causal-economic-prereg-2026-11-14.md";

function random(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296);
}
function erfc(x) {
  // Numerical Recipes approximation, accurate to ~1e-7.
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const a = t * Math.exp(-z*z - 1.26551223 +
    t * (1.00002368 + t * (0.37409196 + t *
    (0.09678418 + t * (-0.18628806 + t *
    (0.27886807 + t * (-1.13520398 + t *
    (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? a : 2-a;
}
function intervalFromDifference(effect, se) {
  return [effect - ALPHA_Z * se, effect + ALPHA_Z * se];
}
function quantile(sorted, fraction) {
  const pos = (sorted.length - 1) * fraction;
  const a = Math.floor(pos), b = Math.ceil(pos);
  return sorted[a] + (sorted[b]-sorted[a]) * (pos-a);
}
function percentileInterval(values) {
  const ordered = values.slice().sort((a,b) => a-b);
  return [quantile(ordered,.025),quantile(ordered,.975)];
}
function splitForRow(index) {
  const key = createHash("sha256")
    .update("signal-hillstrom-20261114-v1:" + index).digest("hex");
  return parseInt(key.slice(0,8),16) / 0x100000000 < 0.4 ? "train" : "test";
}
function parseCSVLine(line) {
  const fields = [];
  let token = "", quoted = false;
  for(let i=0;i<line.length;i++) {
    const ch = line[i];
    if(ch === '"') {
      if(quoted && line[i+1] === '"') { token += '"'; i++; }
      else quoted = !quoted;
    } else if(ch === "," && !quoted) {
      fields.push(token); token = "";
    } else token += ch;
  }
  assert(!quoted,"unterminated CSV quotation");
  fields.push(token);
  return fields;
}
async function getPublicSource() {
  const failed = [];
  for(const url of URLS) {
    try {
      const response = await fetch(url,{
        headers: { "Accept": "text/csv" }, signal: AbortSignal.timeout(60000)
      });
      if(!response.ok) throw new Error("HTTP " + response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert(bytes.length >= 2500000 && bytes.length <= 10000000,
        "unexpected CSV source length");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if(sha256 !== EXPECTED_SHA256) throw new Error("source SHA256 mismatch: " + sha256);
      const text = bytes.toString("utf8");
      return {url,sha256,bytes:bytes.length,text};
    } catch(error) {
      failed.push(new URL(url).hostname + ": " + error.message);
    }
  }
  throw new Error("No verified source could be obtained; no data or conclusions used. " +
    failed.join("; "));
}
function numeric(x,name,low=0,high=1e10) {
  assert(x !== "" && x !== undefined, "missing " + name);
  const n=Number(x);
  assert(Number.isFinite(n) && n>=low && n<=high,"invalid " + name);
  return n;
}
function parseRecords(text) {
  const lines = text.replace(/^\uFEFF/,"").trimEnd().split(/\r?\n/);
  const header = parseCSVLine(lines[0]).map(x=>x.trim().toLowerCase());
  const wanted = ["recency","history_segment","history","mens","womens","zip_code",
    "newbie","channel","segment","visit","conversion","spend"];
  assert.deepEqual([...header].sort(),[...wanted].sort(),"unexpected source schema");
  assert.equal(lines.length - 1,64000,"expected exactly 64,000 customers");
  const indices=new Map(header.map((v,i)=>[v,i]));
  const records=[];
  for(let i=1;i<lines.length;i++) {
    const v=parseCSVLine(lines[i]);
    assert.equal(v.length,header.length,"malformed CSV at row index "+(i-1));
    const get=name=>v[indices.get(name)];
    const arm=ARMS.indexOf(get("segment"));
    assert(arm>=0,"unexpected treatment");
    const rec={
      index:i-1,
      fold:splitForRow(i-1),
      arm,
      spend:numeric(get("spend"),"spend",0,10000),
      conversion:numeric(get("conversion"),"conversion",0,1),
      visit:numeric(get("visit"),"visit",0,1),
      history:numeric(get("history"),"history",0,1e10),
      recency:numeric(get("recency"),"recency",0,120),
      mens:numeric(get("mens"),"mens",0,1),
      womens:numeric(get("womens"),"womens",0,1),
      newbie:numeric(get("newbie"),"newbie",0,1)
    };
    for(const key of ["conversion","visit","mens","womens","newbie"]) {
      assert(Number.isInteger(rec[key]),"expected binary column "+key);
    }
    assert(get("zip_code") && get("channel") && get("history_segment"),
      "missing pre-assignment category");
    records.push(rec);
  }
  return records;
}
function summary(values) {
  assert(values.length>1,"insufficient observations");
  const n=values.length;
  const mean=values.reduce((a,b)=>a+b,0)/n;
  let sq=0;
  for(const v of values) sq+=(v-mean)**2;
  const variance=sq/(n-1);
  return {n,mean,variance,sd:Math.sqrt(variance),
    total:values.reduce((a,b)=>a+b,0)};
}
function byArm(rows) {
  return ARMS.map((_,a)=>rows.filter(x=>x.arm===a));
}
function welch(groups,selected,reference=0,key="spend") {
  const x=summary(groups[selected].map(r=>r[key]));
  const y=summary(groups[reference].map(r=>r[key]));
  const effect=x.mean-y.mean;
  const se=Math.sqrt(x.variance/x.n + y.variance/y.n);
  const z=se>0?effect/se:0;
  return {primaryOutcome:key,selected:ARM_IDS[selected],reference:ARM_IDS[reference],
    selectedN:x.n,referenceN:y.n,selectedMean:x.mean,referenceMean:y.mean,
    selectedSD:x.sd,referenceSD:y.sd,difference:effect,
    standardError:se,zStatistic:z,pTwoSided:erfc(Math.abs(z)/Math.SQRT2),
    ci95NormalLargeSample:intervalFromDifference(effect,se),
    method:"randomized-arm difference in means / Welch heteroskedastic SE; normal asymptotics"};
}
function bootstrap(groups,chosen,reference=0) {
  const rng=random(BOOTSTRAP_SEED);
  const x=groups[chosen].map(r=>r.spend),y=groups[reference].map(r=>r.spend);
  const arr=[];
  for(let rep=0;rep<BOOTSTRAP_REPS;rep++){
    let xs=0,ys=0;
    for(let i=0;i<x.length;i++) xs+=x[Math.floor(rng()*x.length)];
    for(let i=0;i<y.length;i++) ys+=y[Math.floor(rng()*y.length)];
    arr.push(xs/x.length - ys/y.length);
  }
  return {replicates:BOOTSTRAP_REPS,seed:BOOTSTRAP_SEED,
    interval95Percentile:percentileInterval(arr),
    sampling:"stratified resampling within randomized arms, per customer"};
}
function balance(groups,chosen,control=0) {
  const fields=["history","recency","mens","womens","newbie"];
  return Object.fromEntries(fields.map(f=>{
    const x=summary(groups[chosen].map(r=>r[f]));
    const y=summary(groups[control].map(r=>r[f]));
    const denom=Math.sqrt((x.variance+y.variance)/2);
    return [f,{standardizedMeanDifference:denom?
      (x.mean-y.mean)/denom:0,meanChosen:x.mean,meanControl:y.mean}];
  }));
}

const CELL_KEYS = Array.from({length:8}, (_,i) =>
  [i>>2 & 1,i>>1 & 1,i & 1].join("|"));
const PRIOR_N = 300;
const UNCERTAINTY_Z = 1.96;
const SIGNAL_DOWNSIDE_PENALTY = 0.5;
const SIGNAL_TAIL_MASS = 0.25;
const GROUP_STATE_PROBS = [0.25,0.5,0.25];
const MIN_CELL_COUNT = 30;
function groupKey(record) { return [record.mens,record.womens,record.newbie].join("|"); }
function groupByArm(rows) {
  const cells = new Map(CELL_KEYS.map(k =>
    [k, { n:0, arms: [[],[],[]] }]));
  for (const r of rows) {
    const key=groupKey(r);
    const cell = cells.get(key);
    assert(cell, "unregistered feature segment");
    cell.arms[r.arm].push(r.spend);
    cell.n++;
  }
  return cells;
}
function fitFrozenPolicies(training, test) {
  const globalByArm=byArm(training).map(g => summary(g.map(r=>r.spend)));
  assert(globalByArm.every(s=>s.n>5000),"insufficient global training size");
  const bestGlobal=Math.max(...globalByArm.map(x=>x.mean));
  const globalArgmax=globalByArm.findIndex(x=>x.mean===bestGlobal);
  const trainGroups=groupByArm(training);
  const testGroups=groupByArm(test);
  const rows=[];
  let disagreeTestN=0, totalTestN=0;
  for (const key of CELL_KEYS) {
    const g=trainGroups.get(key);
    const h=testGroups.get(key);
    assert(h.n>0,"empty test segment "+key);
    assert(g.arms.every(x=>x.length>=MIN_CELL_COUNT),
      "insufficient training group/arm count for "+key);
    assert(h.arms.every(x=>x.length>=MIN_CELL_COUNT),
      "insufficient test group/arm count for "+key);
    const modelInputs=g.arms.map((values,a)=>{
      const local=summary(values), glob=globalByArm[a];
      const denom=local.n+PRIOR_N;
      const lambda=local.n/denom;
      const m=lambda*local.mean+(1-lambda)*glob.mean;
      const variance=Math.pow(lambda,2)*local.variance/local.n +
        Math.pow(1-lambda,2)*glob.variance/glob.n;
      const heuristicSE=Math.sqrt(Math.max(0,variance));
      return { action:ARM_IDS[a],n:local.n,observedTrainingMean:local.mean,
        shrinkageMean:m,heuristicSE };
    });
    const states=["low","center","high"].map((id,j)=>
      ({id,probability:GROUP_STATE_PROBS[j]}));
    const actions=modelInputs.map((m,a)=>({
      id:ARM_IDS[a],
      payoffs:[
        {stateId:"low",amount:m.shrinkageMean - UNCERTAINTY_Z*m.heuristicSE},
        {stateId:"center",amount:m.shrinkageMean},
        {stateId:"high",amount:m.shrinkageMean + UNCERTAINTY_Z*m.heuristicSE}
      ],
      upfrontCost:0,
      opportunityCost:0
    }));
    const model={
      modelVersion:STUDY_ID+":"+key,
      unit:"two-week observed gross USD spend per randomized customer",
      probabilityEvidence:"estimated",states,actions,
      riskPolicy:{
        tailMass:SIGNAL_TAIL_MASS,
        downsidePenalty:SIGNAL_DOWNSIDE_PENALTY
      }
    };
    const signal=evaluateQuantitativeDecision(model);
    const zeroRisk=evaluateQuantitativeDecision({
      ...model,modelVersion:model.modelVersion+":zero-risk-control",
      riskPolicy:{...model.riskPolicy,downsidePenalty:0}
    });
    assert.equal(signal.status,"recommended");
    assert.equal(zeroRisk.status,"recommended");
    const max=Math.max(...modelInputs.map(x=>x.shrinkageMean));
    const contextualArgmax=modelInputs.findIndex(x=>x.shrinkageMean===max);
    assert.equal(zeroRisk.recommendedActionId, ARM_IDS[contextualArgmax],
      "ZERO risk penalty must exactly replicate conventional contextual argmax");
    const signalIndex=ARM_IDS.indexOf(signal.recommendedActionId);
    assert(signalIndex>=0,"unknown native Signal recommendation");
    for(let a=0;a<3;a++){
      const theoretical = modelInputs[a].shrinkageMean -
        SIGNAL_DOWNSIDE_PENALTY*UNCERTAINTY_Z*modelInputs[a].heuristicSE;
      assert(Math.abs(theoretical-signal.actions[a].objectiveValue)<1e-10,
        "unexpected native Signal risk objective");
    }
    if (signalIndex!==contextualArgmax) disagreeTestN+=h.n;
    totalTestN+=h.n;
    rows.push({
      segment:key,trainN:g.n,testN:h.n,
      trainingArmCounts:modelInputs.map(m=>m.n),
      nativeSignalDecision:signal.recommendedActionId,
      contextualArgmax:ARM_IDS[contextualArgmax],
      globalArgmax:ARM_IDS[globalArgmax],
      inputMeans:modelInputs.map(x=>x.shrinkageMean),
      inputHeuristicSE:modelInputs.map(x=>x.heuristicSE),
      nativeSignalObjective:signal.actions.map(x=>x.objectiveValue),
      signalIndex,contextualArgmaxIndex:contextualArgmax,globalArgmaxIndex:globalArgmax
    });
  }
  assert(totalTestN===test.length,"segment coverage mismatch");
  return {rows,globalByArm:globalByArm.map(x=>({n:x.n,mean:x.mean,sd:x.sd})),
    globalArgmax:ARM_IDS[globalArgmax],
    disagreementTestN:disagreeTestN,
    disagreementRate:disagreeTestN/test.length,
    testGroups};
}
function policyAction(row,variant){
  if (variant==="signal") return row.signalIndex;
  if (variant==="contextual")return row.contextualArgmaxIndex;
  if (variant==="global")return row.globalArgmaxIndex;
  throw new Error("unknown policy");
}
function estimatePolicyValue(model,variant){
  let estimate=0,variance=0;
  const details=[];
  const n=Array.from(model.testGroups.values()).reduce((sum,c)=>sum+c.n,0);
  for (const row of model.rows){
    const cell=model.testGroups.get(row.segment);
    const action=policyAction(row,variant);
    const stats=summary(cell.arms[action]);
    const weight=cell.n/n;
    estimate+=weight*stats.mean;
    variance+=weight*weight*stats.variance/stats.n;
    details.push({segment:row.segment, action:ARM_IDS[action],
      estimatedGrossSpendUSD:stats.mean, testStratumN:cell.n,
      observedInSelectedTreatment:stats.n});
  }
  return {variant,estimatedGrossSpendPerCustomerUSD:estimate,
    largeSampleStandardError:Math.sqrt(variance),
    details};
}
function comparePolicies(model,first,second){
  const n=Array.from(model.testGroups.values()).reduce((sum,c)=>sum+c.n,0);
  let difference=0,variance=0,affectedN=0;
  for(const row of model.rows){
    const cell=model.testGroups.get(row.segment);
    const a=policyAction(row,first),b=policyAction(row,second);
    if(a===b)continue;
    affectedN+=cell.n;
    const sA=summary(cell.arms[a]),sB=summary(cell.arms[b]);
    const w=cell.n/n;
    difference+=w*(sA.mean-sB.mean);
    variance+=w*w*(sA.variance/sA.n+sB.variance/sB.n);
  }
  const se=Math.sqrt(variance);
  return {comparison:first+" minus "+second,
    estimatedGrossSpendDifferenceUSD: difference,
    se,ci95NormalLargeSample:intervalFromDifference(difference,se),
    pTwoSided:se>0?erfc(Math.abs(difference/se)/Math.SQRT2):1,
    policiesDifferForTestCustomers:affectedN,
    policyDisagreementFraction:affectedN/n,
    method:"paired difference in stratified randomized-arm means, zero variance when identical"};
}
function bootstrapPair(model,first,second){
  const randomize=random(BOOTSTRAP_SEED),resamples=[];
  const n=Array.from(model.testGroups.values()).reduce((sum,c)=>sum+c.n,0);
  const needed=model.rows.filter(r=>policyAction(r,first)!==policyAction(r,second))
    .map(r=>{
      const cell=model.testGroups.get(r.segment);
      return {count:cell.n, a:cell.arms[policyAction(r,first)],
        b:cell.arms[policyAction(r,second)]};
    });
  if(needed.length===0) {
    return {seed:BOOTSTRAP_SEED,repeats:BOOTSTRAP_REPS,
      interval95Percentile:[0,0],identicalPolicies:true};
  }
  for(let rep=0;rep<BOOTSTRAP_REPS;rep++) {
    let total=0;
    for(const cell of needed){
      let sumA=0,sumB=0;
      for(let i=0;i<cell.a.length;i++) sumA+=cell.a[Math.floor(randomize()*cell.a.length)];
      for(let i=0;i<cell.b.length;i++) sumB+=cell.b[Math.floor(randomize()*cell.b.length)];
      total+=cell.count/n*(sumA/cell.a.length - sumB/cell.b.length);
    }
    resamples.push(total);
  }
  return {seed:BOOTSTRAP_SEED,repeats:BOOTSTRAP_REPS,
    method:"paired test-stratum customer bootstrap within randomized arm, fixed policy and group counts",
    interval95Percentile:percentileInterval(resamples),identicalPolicies:false};
}
function sampleRatioGroups(testGroups){
  const out=[];
  for(const key of CELL_KEYS){
    const c=testGroups.get(key);
    const counts=c.arms.map(a=>a.length);
    const expected=c.n/3;
    const chi2=counts.reduce((s,n)=>s+(n-expected)**2/expected,0);
    out.push({segment:key,n:c.n,treatmentCounts:counts,
      sampleRatioChi2:chi2,sampleRatioPvalue:Math.exp(-chi2/2)});
  }
  return out;
}
function ipsPolicy(test,model,variant){
  const index=new Map(model.rows.map((r)=>[r.segment,r]));
  let numerator=0,second=0,weights=0;
  for(const record of test){
    const target=policyAction(index.get(groupKey(record)),variant);
    const weight=record.arm===target?3:0;
    numerator+=weight*record.spend;
    second+=weight*weight;
    weights+=weight;
  }
  return {method:"Horvitz-Thompson / IPS, nominal randomized assignment propensity 1/3",
    value:numerator/test.length,
    meanWeight:weights/test.length,
    effectiveSampleSize:weights*weights/second};
}
function selfTest(){
  // No factual proof on toy fixtures: this is solely a code/invariance check.
  assert(splitForRow(99)===splitForRow(99));
  assert.deepEqual(parseCSVLine('one,"comma,quoted",two'),["one","comma,quoted","two"]);
  const train=[],test=[];
  for(const key of CELL_KEYS) {
    const [mens,womens,newbie]=key.split("|").map(Number);
    for(let arm=0;arm<3;arm++){
      for(let i=0;i<90;i++)train.push({mens,womens,newbie,
        arm,spend:(arm+1)+i%3});
      for(let i=0;i<60;i++)test.push({mens,womens,newbie,
        arm,spend:(arm+1)+i%3});
    }
  }
  const policy=fitFrozenPolicies(train,test);
  assert.equal(policy.rows.length,8);
  const comp=comparePolicies(policy,"signal","contextual");
  assert(comp.estimatedGrossSpendDifferenceUSD===0 ||
    Number.isFinite(comp.estimatedGrossSpendDifferenceUSD));
  const identical=comparePolicies(policy,"signal","signal");
  assert.deepEqual(identical.ci95NormalLargeSample,[0,0]);
  assert.deepEqual(bootstrapPair(policy,"signal","signal").interval95Percentile,[0,0]);
  console.log("SELF_TEST_PASS: genuine Signal API, objective, zero-risk argmax, exact policy identity and bootstrap");
}
async function main(){
  const source=await getPublicSource();
  const all=parseRecords(source.text);
  const training=all.filter(r=>r.fold==="train");
  const test=all.filter(r=>r.fold==="test");
  assert.equal(all.length,64000);
  assert.equal(training.length,25760);
  assert.equal(test.length,38240);
  const fitted=fitFrozenPolicies(training,test);
  const primary=comparePolicies(fitted,"signal","contextual");
  const boot=bootstrapPair(fitted,"signal","contextual");
  const primaryGate=
    fitted.disagreementTestN>0 &&
    primary.estimatedGrossSpendDifferenceUSD>0.25 &&
    primary.ci95NormalLargeSample[0]>0.10 &&
    primary.pTwoSided<0.05 &&
    boot.interval95Percentile[0]>0;
  const values=Object.fromEntries(["signal","contextual","global"]
    .map(v=>[v,estimatePolicyValue(fitted,v)]));
  const ips=Object.fromEntries(["signal","contextual","global"]
    .map(v=>[v,ipsPolicy(test,fitted,v)]));
  const report={
    study:STUDY_ID,
    classification:"EXPLORATORY_REUSED_HISTORICAL_RANDOMIZED_DATA",
    preregistration:PROTOCOL,
    source:{publisher:"Kevin Hillstrom / MineThatData",
      yearsAgo:18,expectedSha256:EXPECTED_SHA256,
      actualSha256:source.sha256,bytes:source.bytes,verified:true,
      total:all.length,train:training.length,test:test.length},
    realSignalEntrypoint:"@signal/decision.evaluateQuantitativeDecision",
    signalParameters:{
      actionStates:["low","center","high"],
      stateProbabilities:GROUP_STATE_PROBS,
      payoffVariationZ:UNCERTAINTY_Z,
      tailMass:SIGNAL_TAIL_MASS,
      downsidePenalty:SIGNAL_DOWNSIDE_PENALTY,
      priorSampleWeight:PRIOR_N,
      costs:"Zero (actual email costs/margins unobserved)"
    },
    fittedTrainingGlobalArmMeans:fitted.globalByArm,
    fixedContextGroups:fitted.rows.map(({signalIndex,contextualArgmaxIndex,
      globalArgmaxIndex,...r})=>r),
    actionDisagreement:{
      compared:"native Signal risk-constrained contextual policy vs equally informed contextual maximum-expected-spend baseline",
      testCustomers:fitted.disagreementTestN,
      fraction:fitted.disagreementRate,
      nontrivial:fitted.disagreementTestN>0
    },
    test:{groups:sampleRatioGroups(fitted.testGroups),
      estimatedGrossSpendPolicyValues:values,ipsSensitivity:ips,
      primaryComparison:{...primary,bootstrap:boot,
        exploratoryPracticalThresholds:{pointGT:0.25,ciLowerGT:0.10,twoSidedPbelow:0.05,bootstrapLowerGT:0},
        passesExploratoryGate:primaryGate,
        verdict:primaryGate?
          "EXPLORATORY_POSITIVE_SPECIFIED_POLICY_COMPARISON_NOT_INDEPENDENTLY_CONFIRMED":
          "NO_CONFIRMED_INCREMENTAL_POLICY_SUPERIORITY"
      },
      secondarySignalVsGlobal:comparePolicies(fitted,"signal","global"),
      secondaryContextVsGlobal:comparePolicies(fitted,"contextual","global")
    },
    attribution:{
      SignalImplementationCausedIncrementalGain:null,
      experimentallyAssignedToSignal:false,
      mathematicalUniqueness:false,
      conventionalComparableRiskAwareRuleCouldImplementSameLogic:true,
      explanation:"Random assignment was to email treatments, not to Signal software. This comparison estimates the effect of two frozen policy rules under randomized logged outcomes. Data were previously inspected; result exploratory."
    },
    boundaries:[
      "This same 2008 Hillstrom dataset has previously been analyzed on a different policy, so this is not an independent new holdout.",
      "Outcomes are actual gross retail spending, not profit, net contribution, margin, or measured implementation cost.",
      "One customer per original experimental row and nominal three-arm assignment assumed.",
      "No counterfactual outcomes assigned to individual customers, only observed randomized treatment means.",
      "The source cannot identify unique mathematical innovation or implementation-level causal advantage of Signal.",
      "The prior legacy evaluateDecision pipeline remains unvalidated for useful recommendations.",
      "No production deployment or transactional execution."
    ]
  };
  await mkdir("artifacts/validation",{recursive:true});
  await writeFile(OUT,JSON.stringify(report,null,2)+"\n");
  console.log("SOURCE VERIFIED",source.sha256,"N",all.length,"TRAIN",training.length,"TEST",test.length);
  console.log("POLICY DIFFERS ON",fitted.disagreementTestN,"OF",test.length);
  console.log("CONTEXTS",JSON.stringify(report.fixedContextGroups.map(g=>({
    context:g.segment,testN:g.testN,signal:g.nativeSignalDecision,
    contextBaseline:g.contextualArgmax}))));
  console.log("VALUES",JSON.stringify(Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v.estimatedGrossSpendPerCustomerUSD]))));
  console.log("PRIMARY",JSON.stringify(report.test.primaryComparison));
  console.log("VERDICT",report.test.primaryComparison.verdict);
  console.log("NO UNIQUE SIGNAL CAUSAL ATTRIBUTION OR MEASURED NET PROFIT");
  if(process.env.GITHUB_STEP_SUMMARY){
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      "## Exploratory incremental risk-aware Signal policy on a previously inspected historical randomized dataset\n"+
      "- Policy disagreement: "+fitted.disagreementTestN+"/"+test.length+" customers\n"+
      "- Primary held-out gross USD spend difference per customer: "+
        primary.estimatedGrossSpendDifferenceUSD+"\n"+
      "- 95% normal CI: "+JSON.stringify(primary.ci95NormalLargeSample)+
        "; bootstrap CI: "+JSON.stringify(boot.interval95Percentile)+"\n"+
      "- Verdict: "+report.test.primaryComparison.verdict+"\n"+
      "- **No unique Signal-specific causal attribution or confirmatory proof.**\n");
  }
}
if(process.argv.includes("--self-test"))selfTest();
else await main();
