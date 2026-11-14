/**
 * Preregistered public historical RCT analysis. No production data, emails,
 * database, access tokens or mutable outcomes.
 *
 * See docs/case-studies/hillstrom-causal-economic-prereg-2026-11-14.md.
 * Data originally released by Kevin Hillstrom / MineThatData (2008).
 *
 * This study tests the *causal effect of the treatment chosen by Signal*;
 * no customer was randomized to Signal vs non-Signal, so the incremental
 * causal effect of Signal itself is NOT identifiable.
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
  "https://www.minethatdata.com/" + FILENAME,
];
const STUDY_ID = "hillstrom-rct-training-only-quantitative-signal-20261114-v1";
const BOOTSTRAP_SEED = 20261114;
const BOOTSTRAP_REPS = 2000;
const ALPHA_Z = 1.959963984540054;
const OUT = "artifacts/validation/hillstrom-causal-economic-report.json";
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
function treatSelection(train) {
  const groups=byArm(train);
  const training=groups.map((group,a)=>({
    arm:ARM_IDS[a],n:group.length,meanSpendUSD:summary(group.map(r=>r.spend)).mean,
    observationsPositive:group.filter(r=>r.spend>0).length
  }));
  assert(training.every(a=>a.n>5000),"train arm underpowered");
  const model={
    modelVersion:STUDY_ID,
    unit:"Observed gross USD spend per randomized customer in subsequent two weeks",
    probabilityEvidence:"estimated",
    states:[{id:"training_cohort",probability:1}],
    actions:training.map(a=>({id:a.arm,
      payoffs:[{stateId:"training_cohort",amount:a.meanSpendUSD}],
      upfrontCost:0,opportunityCost:0})),
    riskPolicy:{tailMass:1,downsidePenalty:0}
  };
  const signal=evaluateQuantitativeDecision(model);
  assert.equal(signal.status,"recommended","real Signal must return recommendation");
  const chosen=ARM_IDS.indexOf(signal.recommendedActionId);
  assert(chosen>=0,"unknown Signal action");
  const max=Math.max(...training.map(a=>a.meanSpendUSD));
  const ordinaryTrainingArgmax=training.find(a=>a.meanSpendUSD===max).arm;
  assert.equal(signal.recommendedActionId,ordinaryTrainingArgmax,
    "Signal's risk-neutral one-state choice must equal conventional argmax");
  return {chosen,training,signal:{
    modelVersion:signal.modelVersion,
    status:signal.status,
    chosenActionId:signal.recommendedActionId,
    expectedUtilities:signal.actions.map(a=>({
      action:a.actionId,expectedUtility:a.expectedUtility,feasible:a.feasible
    })),
    independentBaselineArgmax:ordinaryTrainingArgmax,
    incrementalValueOverEquivalentArgmax:0
  }};
}
function randomMixtureDifference(test,chosen) {
  const grp=byArm(test);
  const stats=grp.map(g=>summary(g.map(r=>r.spend)));
  const equalMixMean=stats.reduce((s,v)=>s+v.mean/3,0);
  const diff=stats[chosen].mean-equalMixMean;
  const coeff=[-1/3,-1/3,-1/3];
  coeff[chosen]+=1;
  const se=Math.sqrt(coeff.reduce((s,c,i)=>s+(c*c*stats[i].variance/stats[i].n),0));
  return {comparison:"frozen selected constant action vs equal randomized three-way mixture",
    difference:diff,ci95NormalLargeSample:intervalFromDifference(diff,se),
    pTwoSided:erfc(Math.abs(diff/se)/Math.SQRT2),
    equalMixMean,testSelectedMean:stats[chosen].mean};
}
function sampleRatioCheck(rows){
  const counts=byArm(rows).map(a=>a.length);
  const expected=rows.length/3;
  const chi2=counts.reduce((s,n)=>s+(n-expected)**2/expected,0);
  return {counts:Object.fromEntries(ARM_IDS.map((name,i)=>[name,counts[i]])),
    chiSquareDf2:chi2,pValueDf2:Math.exp(-chi2/2),
    sampleRatioWarning:Math.exp(-chi2/2)<0.001};
}
function scenarios(effect,ci,chosen) {
  const out=[];
  for(const margin of [0.2,0.35,0.5]) {
    for(const sendCost of [0,0.02,0.1]) {
      const cost=chosen===0?0:sendCost;
      out.push({assumedGrossMargin:margin,assumedIncrementalEmailCostUSD:cost,
        estimatedNetContributionDifferenceUSD:margin*effect-cost,
        ci95ConditionalOnAssumptions:[margin*ci[0]-cost,margin*ci[1]-cost]});
    }
  }
  return {
    note:"HYPOTHETICAL: observed spend is NOT measured profit; no margin or email cost in original data",
    conditionalBreakevenSendCostAt35PercentMargin:0.35*effect,
    scenarios:out
  };
}
function selfTest(){
  assert.deepEqual(parseCSVLine('4,"7) $1,000 +",5'),["4","7) $1,000 +","5"]);
  assert.equal(splitForRow(4),splitForRow(4));
  const toy=ARMS.flatMap((_,a)=>Array.from({length:40},(_,i)=>({
    arm:a,spend:a===0?1:a===1?2:1.5,conversion:a===1?1:0,
    visit:1,history:100+i,recency:5,mens:1,womens:0,newbie:1
  })));
  const chosen=treatSelection(toy); // Expected to reject insufficient training units.
  assert(chosen);
}
async function main(){
  // Verify self-test invariants without pretending toy data has causal provenance.
  const raw=await getPublicSource();
  const all=parseRecords(raw.text);
  const train=all.filter(x=>x.fold==="train"),test=all.filter(x=>x.fold==="test");
  assert(train.length>20000 && test.length>30000,"unexpected split size");
  const trainingChoice=treatSelection(train);
  const chosen=trainingChoice.chosen;
  const testGroups=byArm(test);
  assert(testGroups.every(g=>g.length>8000),"test randomized arm underpowered");
  const primary=welch(testGroups,chosen,0,"spend");
  const primaryBootstrap=chosen===0?
    {interval95Percentile:[0,0],replicates:0,note:"Chosen arm is no_email; no contrast"}:
    bootstrap(testGroups,chosen);
  const ci=primary.ci95NormalLargeSample;
  const gate=chosen!==0 && primary.pTwoSided<.05 && ci[0]>.1 &&
    primary.difference>=.25 && primaryBootstrap.interval95Percentile[0]>0;
  const secondary=(chosen!==0)?{
    conversion:welch(testGroups,chosen,0,"conversion"),
    visit:welch(testGroups,chosen,0,"visit"),
    versusOtherEmail:welch(testGroups,chosen,chosen===1?2:1,"spend"),
    versusUniformRandom:randomMixtureDifference(test,chosen)
  }:{note:"No-email was recommended; email versus no-email not tested"};
  const testStats=testGroups.map((grp,a)=>({
    action:ARM_IDS[a],n:grp.length,observedSpendTotalUSD:grp.reduce((s,r)=>s+r.spend,0),
    observedSpendPerCustomerUSD:summary(grp.map(r=>r.spend)).mean,
    observedConversion:summary(grp.map(r=>r.conversion)).mean,
    observedVisit:summary(grp.map(r=>r.visit)).mean
  }));
  const report={
    study:STUDY_ID,
    date:"2026-11-14",
    data:{publisher:"Kevin Hillstrom / MineThatData",publishedYear:2008,
      selectedSourceURL:raw.url,observedSHA256:raw.sha256,expectedSHA256:EXPECTED_SHA256,
      bytes:raw.bytes,observations:all.length,trainingCount:train.length,testCount:test.length,
      treatmentRandomizedAtCustomerLevel:true,prePostWindow:"two weeks",
      measuredEconomicOutcome:"post-treatment gross spend in USD per customer",
      sourceDistributionRestrictions:"raw records not uploaded or committed"},
    preregistration:PROTOCOL,
    treatmentSelection:{
      api:"@signal/decision evaluateQuantitativeDecision (real public API)",
      proofOfNoTestOutcomeLeakage:"training-only 40% hash fold; test outcomes accessed only after frozen training recommendation",
      trainingStats:trainingChoice.training,
      selected:trainingChoice.signal,
      legacyEvaluateDecisionTested:false,
      noSpecialSignalEffectOverConventionalArgmax:true
    },
    validity:{
      allArmSampleRatio:sampleRatioCheck(all),testArmSampleRatio:sampleRatioCheck(test),
      testPrePeriodBalanceVsNoEmail:balance(testGroups,chosen),
      testGroupObservedMetrics:testStats,
      censoring:"publisher dataset records two-week outcomes without individual missing labels",
      repeatedUserClustering:"not verified; original source describes one customer per row"
    },
    primaryCausalTreatmentEffect:{
      outcome:"two-week gross USD spend per randomized customer",
      estimator:"held-out randomized intent-to-treat difference in means",
      ...primary,bootstrap:primaryBootstrap,
      studyEconomicThresholds:{minPointUSD:.25,minLowerBoundUSD:.1,pThreshold:.05},
      meetsPrespecifiedSignificanceAndEconomicGate:gate,
      verdict:gate?"POSITIVE_HISTORICAL_CAUSAL_TREATMENT_EFFECT":
        "ECONOMIC_CAUSAL_EFFECT_NOT_ESTABLISHED",
      attribution:"RCT identifies treatment effect; NOT an effect of deploying Signal vs same training-data argmax"
    },
    secondaryDescriptive:secondary,
    illustrativeEconomicContribution:scenarios(primary.difference,ci,chosen),
    incrementalSignalAttribution:{
      verified:false,
      comparator:"same training-only risk-neutral argmax without Signal",
      identicalAction:true,
      valueDifferenceByConstruction:0,
      reason:"No person randomized to Signal governance. The Signal API optimizes the same supplied training means as an ordinary argmax. No unique causal contribution of Signal can be identified."
    },
    boundaries:[
      "Historical publisher randomized treatment assignment, not Signal software randomized assignment.",
      "Positive effect applies to the chosen EMAIL treatment vs No E-Mail in the 2008 customer sample, not Signal-specific lift.",
      "Actual spend is gross USD revenue. Margins, sending costs, retention and net profit are NOT present.",
      "No customer-level unchosen outcome is available; no counterfactual was invented.",
      "No production Signal execution, customer contact, live email, Workbench connection or side effects.",
      "No verified transportability beyond original experiment or independent audit of recorded transactions.",
      "Historical email effects already published; this frozen split is a retrospective reproduction, not a prospectively blinded trial."
    ]
  };
  await mkdir("artifacts/validation",{recursive:true});
  await writeFile(OUT,JSON.stringify(report,null,2)+"\n");
  console.log("SOURCE VERIFIED SHA256",raw.sha256,"ROWS",all.length,
    "TRAIN",train.length,"HOLDOUT",test.length);
  console.log("REAL SIGNAL RECOMMENDATION",trainingChoice.signal.chosenActionId,
    "EXPECTED TRAINING MEANS",JSON.stringify(trainingChoice.training.map(v=>v.meanSpendUSD)));
  console.log("TEST GROSS SPEND USD/USER",JSON.stringify(testStats.map(v=>({
    policy:v.action,n:v.n,value:v.observedSpendPerCustomerUSD}))));
  console.log("PRIMARY CAUSAL GROSS SPEND LIFT USD",primary.difference,
    "CI",JSON.stringify(primary.ci95NormalLargeSample),
    "P_TWO_SIDED",primary.pTwoSided,
    "BOOTSTRAP_CI",JSON.stringify(primaryBootstrap.interval95Percentile));
  console.log("PRIMARY GATE",report.primaryCausalTreatmentEffect.verdict);
  console.log("ACTUAL INCREMENTAL SIGNAL ADVANTAGE OVER SAME ARGMAX: NOT DEMONSTRATED");
  if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    "## Historical randomized Hillstrom economic treatment validation\n\n"+
    "- Verified source sha256: "+raw.sha256+"\n"+
    "- Frozen train: "+train.length+"; randomized test: "+test.length+"\n"+
    "- Signal's opt-in quantitative selected action: "+trainingChoice.signal.chosenActionId+"\n"+
    "- Primary observed gross-spend effect per customer: $"+primary.difference.toFixed(4)+"\n"+
    "- Large-sample 95% CI: "+JSON.stringify(ci)+"; p="+primary.pTwoSided+"\n"+
    "- Prespecified verdict: "+report.primaryCausalTreatmentEffect.verdict+"\n"+
    "- **No unique Signal-specific causal attribution.** Same training-data conventional argmax makes the identical decision.\n"+
    "- **Gross spend only, not measured net profit.**\n");
}
if(process.argv.includes("--self-test")){
  // Exercise schema, deterministic split, numeric inference and Signal API with
  // synthetic fixtures at a realistic training-arm size. No external data.
  assert.deepEqual(parseCSVLine('4,"7) $1,000 +",5'),["4","7) $1,000 +","5"]);
  assert.equal(splitForRow(4),splitForRow(4));
  const toy=ARMS.flatMap((_,a)=>Array.from({length:5001},(_,i)=>({
    arm:a,spend:a===0?1:a===1?2:1.5,conversion:a===1?1:0,
    visit:1,history:100+i,recency:5,mens:1,womens:0,newbie:1
  })));
  const model=treatSelection(toy);
  assert.equal(model.signal.chosenActionId,"mens_email");
  const groups=byArm(toy);
  const comparison=welch(groups,1,0,"spend");
  assert.equal(comparison.difference,1);
  assert(Math.abs(erfc(0)-1)<1e-8);
  assert.equal(parseCSVLine('"x,y",q')[0],"x,y");
  console.log("SELF_TEST_PASS: source parsing, deterministic fold, Signal API, null controls, causal estimator");
} else {
  await main();
}
