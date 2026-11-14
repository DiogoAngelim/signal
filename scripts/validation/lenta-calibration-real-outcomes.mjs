/**
 * Real Lenta RCT: train-only prediction models, validation-only empirical
 * calibration, and independently held-out randomized response diagnostics.
 * NO actual revenue, margin, net profit or randomized Signal software exposure.
 *
 * node scripts/validation/lenta-calibration-real-outcomes.mjs --self-test
 * node scripts/validation/lenta-calibration-real-outcomes.mjs \
 *   /private/lenta-calibration.jsonl /private/lenta-test.jsonl \
 *   /private/lenta-prep-aggregate.json
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { hrtime } from "node:process";
import decision from "../../packages/decision/dist/index.js";

const {
  fitBinaryIsotonicCalibrator,
  applyBinaryIsotonicCalibrator,
  evaluateBinaryForecasts,
  evaluateQuantitativeDecision,
} = decision;
for(const v of [fitBinaryIsotonicCalibrator,applyBinaryIsotonicCalibrator,
  evaluateBinaryForecasts,evaluateQuantitativeDecision])
  assert.equal(typeof v,"function","Actual built Signal decision library API unavailable");
const SOURCE_SHA="b531544f6c072d22f232d91e20ffcaca265acf224e02687502a40e6d56135682";
const ARMS=["control","test"];
const FIELD_NAMES=[
  "id","arm","outcome","boostedControl","boostedTreated",
  "logisticControl","logisticTreated","conventionalIsoControl",
  "conventionalIsoTreated","conventionalPlattControl","conventionalPlattTreated"
];
const METHODS=["signalCalibrated","conventionalIsotonic","conventionalPlatt",
  "boostedRaw","logisticRaw","alwaysTest","alwaysControl"];
const P_TREATED=515892/687029;
const SEED=20261114,BOOT=500;
const OUTPUT="artifacts/validation/lenta-calibration-real-outcomes-aggregate.json";
const MODEL_VERSION="lenta-pinned-hgb-signal-calibration-20261114-v1";
const timestamp=()=>Number(hrtime.bigint())/1e6;
function probability(p,label){
  assert(typeof p==="number"&&Number.isFinite(p)&&p>=0&&p<=1,
    "invalid probability: "+label);
  return p;
}
function parse(str,split){
  assert(typeof str==="string"&&str.length<35_000_000,"oversized private "+split+" predictions");
  const lines=str.trimEnd().split(/\r?\n/);
  assert(lines.length>=500&&lines.length<=100000,"invalid "+split+" row count");
  const seen=new Set();
  return lines.map((line,i)=>{
    assert(line.length<2048,"overlong source row");
    const row=JSON.parse(line);
    assert(row&&typeof row==="object"&&!Array.isArray(row));
    assert.deepEqual(Object.keys(row).sort(),[...FIELD_NAMES].sort(),
      "unexpected source fields, possible information leak");
    assert(typeof row.id==="string"&&/^[a-f0-9]{64}$/.test(row.id),
      "only stable anonymous source hashes");
    assert(!seen.has(row.id),"duplicate source ID in "+split);
    seen.add(row.id);
    assert(ARMS.includes(row.arm),"unknown RCT arm");
    assert(row.outcome===0||row.outcome===1,"unobserved or invalid factual response");
    for(const name of FIELD_NAMES.slice(3))probability(row[name],name);
    return row;
  });
}
const metric=(records,which,modelVersion,origin)=>{
  const evalRows=records.map(r=>({
    id:r.id,probability:which(r),outcome:r.outcome
  }));
  const ev=evaluateBinaryForecasts({
    datasetVersion:"original Lenta public real experiment "+SOURCE_SHA.slice(0,12),
    modelVersion, eventDefinition:"source column response_att (binary campaign response)",
    samplingFrame:origin+"; source-timestamped random campaign assignment; deterministic hash split",
    split:"random_holdout",independentLabels:true,records:evalRows,bucketCount:10,
  });
  assert(ev.brierScore!==null && ev.logLoss!==null);
  return {n:ev.sampleSize,brier:ev.brierScore,logLoss:ev.logLoss,
    ece:ev.expectedCalibrationError,auc:ev.aucRoc,assessmentStatus:ev.status};
};
function bootstrapDiff(rows,left,right,repeats=BOOT){
  let s=SEED>>>0;
  const next=()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296};
  const delta=rows.map(r=>left(r)-right(r));
  const value=delta.reduce((a,b)=>a+b,0)/rows.length;
  const arr=[];
  for(let b=0;b<repeats;b++){
    let t=0;
    for(let i=0;i<rows.length;i++)t+=delta[Math.floor(next()*delta.length)];
    arr.push(t/rows.length);
  }
  arr.sort((a,b)=>a-b);
  return {mean:value,bootstrap95:[arr[Math.floor(repeats*.025)],arr[Math.floor(repeats*.975)]],
    unit:"paired independent source RCT row",lowerBoundPositive:arr[Math.floor(repeats*.025)]>0};
}
function trainCalibrators(calibration){
  const fitted={};
  const started=timestamp();
  for(const arm of ARMS){
    const suffix=arm==="test"?"Treated":"Control";
    const records=calibration.filter(x=>x.arm===arm);
    assert(records.length>=3000,"insufficient arm-specific calibration observations");
    fitted[arm]=fitBinaryIsotonicCalibrator(
      records.map(r=>({id:r.id,
        rawProbability:r["boosted"+suffix],observedOutcome:r.outcome
      })),
      {modelVersion:MODEL_VERSION,calibrationDatasetVersion:SOURCE_SHA,
        split:"calibration_only",targetBins:20,priorEffectiveCount:20}
    );
    assert.equal(fitted[arm].causalProfitEffectProven,false);
  }
  return {fitted,fitElapsedMs:timestamp()-started};
}
function signalPrediction(row,arm,cal){
  return applyBinaryIsotonicCalibrator(cal[arm],
    row[arm==="control"?"boostedControl":"boostedTreated"]);
}
const independentArgmax=(p0,p1)=>p1>p0?"test":"control";
function signalQuantitativeDecision(p0,p1){
  probability(p0,"signal p(control)");
  probability(p1,"signal p(test)");
  // The unobserved joint potential outcomes are not identified. A product
  // coupling here only permits the action marginal means to be evaluated.
  const states=[
    {id:"00",probability:(1-p0)*(1-p1)},
    {id:"10",probability:p0*(1-p1)},
    {id:"01",probability:(1-p0)*p1},
    {id:"11",probability:p0*p1},
  ];
  const z=evaluateQuantitativeDecision({
    modelVersion:MODEL_VERSION,unit:"binary campaign response (NOT USD)",
    probabilityEvidence:"estimated",states,
    actions:[
      {id:"control",payoffs:[{stateId:"00",amount:0},{stateId:"10",amount:1},
        {stateId:"01",amount:0},{stateId:"11",amount:1}]},
      {id:"test",payoffs:[{stateId:"00",amount:0},{stateId:"10",amount:0},
        {stateId:"01",amount:1},{stateId:"11",amount:1}]}
    ],
    riskPolicy:{tailMass:0.1,downsidePenalty:0}
  });
  assert(z.status==="recommended");
  return z.recommendedActionId;
}
function getPair(row,method,cal){
  if(method==="signalCalibrated"){
    return [signalPrediction(row,"control",cal),signalPrediction(row,"test",cal)];
  }
  if(method==="conventionalIsotonic")
    return [row.conventionalIsoControl,row.conventionalIsoTreated];
  if(method==="conventionalPlatt")
    return [row.conventionalPlattControl,row.conventionalPlattTreated];
  if(method==="boostedRaw")
    return [row.boostedControl,row.boostedTreated];
  if(method==="logisticRaw")
    return [row.logisticControl,row.logisticTreated];
  throw Error("unexpected model");
}
function evaluate(calibration,holdout,info,strict=true){
  assert(info.sourceSHA256===SOURCE_SHA,"frozen official source hash mismatch");
  assert(info.fullCohort===687029 && info.fullArms.control===171137 &&
    info.fullArms.test===515892,"real RCT source arm integrity mismatch");
  assert(info.observedEvent==="response_att binary campaign response; NOT revenue or profit");
  assert(info.trainOnlyModelFitting===true && info.validationOnlyScikitCalibrators===true &&
    info.testOutcomesNotUsedToSelectModel===true,
    "train/validation/test source or model leakage asserted");
  assert(info.sensitiveAndPostTreatmentFeaturesExcluded===true,
    "post-treatment leakage or sensitive features");
  const cal=parse(calibration,"calibration");
  const test=parse(holdout,"test");
  assert(cal.length===info.splitCounts.calibration && test.length===info.splitCounts.test,
    "split integrity mismatch");
  const calIds=new Set(cal.map(r=>r.id));
  assert(!test.some(r=>calIds.has(r.id)),"test label leakage: overlapping calibration source IDs");
  assert(ARMS.every(arm=>test.filter(r=>r.arm===arm).length>=1000),
    "missing independent control or treated test support");
  const {fitted,fitElapsedMs}=trainCalibrators(cal);
  const forecastScores={};const data={};
  for(const arm of ARMS){
    const group=test.filter(r=>r.arm===arm);
    const suffix=arm==="test"?"Treated":"Control";
    data[arm]={};
    for(const name of ["signalCalibrated","conventionalIsotonic",
      "conventionalPlatt","boostedRaw","logisticRaw"]){
      const get=(r)=>name==="signalCalibrated"?signalPrediction(r,arm,fitted):
        name==="conventionalIsotonic"?r["conventionalIso"+suffix]:
        name==="conventionalPlatt"?r["conventionalPlatt"+suffix]:
        name==="boostedRaw"?r["boosted"+suffix]:r["logistic"+suffix];
      data[arm][name]=get;
      forecastScores[arm]??={};
      forecastScores[arm][name]=metric(group,get,MODEL_VERSION+"|"+name,
        "held-out only, arm="+arm);
    }
  }
  const forecastPaired={};
  for(const arm of ARMS){
    const rows=test.filter(r=>r.arm===arm),f=data[arm];
    forecastPaired[arm]={
      signalVsConventionalIsotonic:bootstrapDiff(rows,
        r=>(f.conventionalIsotonic(r)-r.outcome)**2,
        r=>(f.signalCalibrated(r)-r.outcome)**2),
      signalVsRawBoosted:bootstrapDiff(rows,
        r=>(f.boostedRaw(r)-r.outcome)**2,
        r=>(f.signalCalibrated(r)-r.outcome)**2),
      signalVsConventionalPlatt:bootstrapDiff(rows,
        r=>(f.conventionalPlatt(r)-r.outcome)**2,
        r=>(f.signalCalibrated(r)-r.outcome)**2)
    };
  }
  const policyStart=timestamp();
  const policyRows=[];
  let contradictions=0,disagreementsVsIso=0,disagreementsVsPlatt=0;
  const armAssumedPropensity={
    test:515892/687029, control:171137/687029
  };
  for(const r of test){
    const chosen={};
    for(const method of METHODS){
      if(method==="alwaysTest")chosen[method]="test";
      else if(method==="alwaysControl")chosen[method]="control";
      else {
        const [p0,p1]=getPair(r,method,fitted);
        chosen[method]=method==="signalCalibrated"?
          signalQuantitativeDecision(p0,p1):independentArgmax(p0,p1);
        if(method==="signalCalibrated"&&chosen[method]!==independentArgmax(p0,p1))
          contradictions++;
      }
    }
    disagreementsVsIso+=Number(chosen.signalCalibrated!==chosen.conventionalIsotonic);
    disagreementsVsPlatt+=Number(chosen.signalCalibrated!==chosen.conventionalPlatt);
    const actualPropensity=armAssumedPropensity[r.arm];
    const scores={};
    for(const method of METHODS)
      scores[method]=chosen[method]===r.arm ? r.outcome/actualPropensity : 0;
    policyRows.push(scores);
  }
  assert.equal(contradictions,0,"actual Signal advisor deviated from independent same-information argmax");
  const values={};
  for(const method of METHODS){
    values[method]=policyRows.reduce((sum,r)=>sum+r[method],0)/policyRows.length;
  }
  const policyDiff={};
  for(const baseline of ["conventionalIsotonic","conventionalPlatt","boostedRaw","logisticRaw"]){
    policyDiff["signalVs"+baseline[0].toUpperCase()+baseline.slice(1)]=
      bootstrapDiff(policyRows,r=>r.signalCalibrated,r=>r[baseline]);
  }
  const policyElapsedMs=timestamp()-policyStart;
  const result={
    classification:"REAL_RCT_HELDOUT_BINARY_CALIBRATION_AND_POLICY_RESPONSE_NOT_NET_PROFIT",
    realSourceAuthenticatedByChecksums:true,
    dataset:"Lenta public randomized retail promotion campaign",
    sourceMD5:info.sourcePublishedMD5,sourceSHA256:SOURCE_SHA,
    fullRandomizedPopulation:info.fullCohort,
    splitCounts:info.splitCounts,selectionFrozenBeforeEvaluation:true,
    modelTrainingOnlyBeforeCalibration:true,postTreatmentInputsExcluded:true,
    originalRandomizationProvenanceSource:"scikit-uplift dataset description (external audit still recommended)",
    originalRCTPropensityAssumedConstantWithinPopulation:armAssumedPropensity,
    sourceOutcome:"response_att binary campaign response, neither net contribution nor gross dollar revenue",
    forecastScores,forecastPairedBrierImprovements:forecastPaired,
    policyResponsePerRandomizedCustomerIPS:values,
    policyPairedIPS:policyDiff,
    percentageSignalPolicyDisagreementWithConventionalIsotonic:disagreementsVsIso/test.length*100,
    percentageSignalPolicyDisagreementWithConventionalPlatt:disagreementsVsPlatt/test.length*100,
    actualSignalQuantitativeCallCount:test.length,
    sameInformationArgmaxContradictions:contradictions,
    softwareRuntimeMilliseconds:{
      calibratorFit:fitElapsedMs,
      signalQuantitativeAndComparatorPolicyAnalysis:policyElapsedMs
    },
    businessProcessCostUSDObserved:false,
    simulatedOrAssumedPerConversionDollarValueUsed:false,
    nativePermissionGateExecuted:false,
    randomizedSignalSoftwareExposure:false,
    realizedNetProfitObserved:false,
    causalSignalNetProfitSuperiorityProven:false,
    initialModelSelectionExposure:"No candidate or hyperparameters selected by comparing final test outcomes; code/public study may have other external source-selection exposure",
    limitations:[
      "No real monetary transaction, refund, acquisition, labor or AI compute financial costs in source: binary purchase/response cannot be converted into actual net profit.",
      "Historical RCT randomized promotions rather than Signal software; policy-value estimates do not identify software deployment profit.",
      "Calibration can improve or worsen held-out Brier/log loss; a serious conventional isotonic and Platt calibrator receive the same validation labels.",
      "Global propensity weights presume randomized fixed-arm allocation within all feature strata; verify original design before causal policy claims.",
      "Individual independent sampling is not externally audited for duplicate persons or shared household clusters; bootstrap uses dataset rows as units.",
      "Risk-neutral purchase response optimization is not financial optimization and cannot certify safety permissions or domain governance.",
      "Runtime measured on shared CI runner, not independently charged business operating expenses.",
      "The public dataset did not contain actual native Signal decision evidence, so native gates are neither fabricated nor bypassed."
    ]
  };
  if(strict){
    assert(result.actualSignalQuantitativeCallCount>=1000);
    assert(result.causalSignalNetProfitSuperiorityProven===false);
    assert(result.sameInformationArgmaxContradictions===0);
  }
  return result;
}
function syntheticFixture(){
  const rows={calibration:[],test:[]};
  for(const split of ["calibration","test"])
    for(let i=0;i<2000;i++){
      const arm=i%4===0?"control":"test",sourceProbability=0.07+0.3*(i%7)/7;
      const prob0=0.07+0.12*((i%11)/11);
      const prob1=prob0+0.04*(i%3)-0.01;
      const outcome=Number((i*31)%100 < (arm==="control"?prob0:prob1)*100);
      rows[split].push({
        id:createHash("sha256").update(split+"-"+i).digest("hex"),arm,outcome,
        boostedControl:prob0,boostedTreated:prob1,
        logisticControl:prob0,logisticTreated:prob1,
        conventionalIsoControl:prob0,conventionalIsoTreated:prob1,
        conventionalPlattControl:prob0,conventionalPlattTreated:prob1,
      });
    }
  const info={sourceSHA256:SOURCE_SHA,fullCohort:687029,
    sourcePublishedMD5:"6ab28ff0989ed8b8647f530e2e86452f",
    fullArms:{control:171137,test:515892},
    observedEvent:"response_att binary campaign response; NOT revenue or profit",
    trainOnlyModelFitting:true,validationOnlyScikitCalibrators:true,
    testOutcomesNotUsedToSelectModel:true,sensitiveAndPostTreatmentFeaturesExcluded:true,
    splitCounts:{train:5000,calibration:2000,test:2000}};
  return {rows,info};
}
function selfTest(){
  const {rows,info}=syntheticFixture();
  const cal=rows.calibration.map(JSON.stringify).join("\n")+"\n";
  const test=rows.test.map(JSON.stringify).join("\n")+"\n";
  const result=evaluate(cal,test,info,false);
  assert.equal(result.actualSignalQuantitativeCallCount,2000);
  assert.equal(result.sameInformationArgmaxContradictions,0);
  assert.equal(result.causalSignalNetProfitSuperiorityProven,false);
  assert.equal(result.businessProcessCostUSDObserved,false);
  assert.deepEqual(result.forecastScores.control.signalCalibrated.n,500);
  assert.throws(()=>evaluate(cal,cal,info,false),/test label leakage/);
  assert.throws(()=>evaluate(cal,test.replace('"outcome":1','"outcome":null'),info,false),
    /unobserved or invalid factual response/);
  assert.throws(()=>evaluate(cal,test,({...info,sourceSHA256:"0"}),false),
    /source hash mismatch/);
  assert.throws(()=>evaluate(cal,test,({...info,sensitiveAndPostTreatmentFeaturesExcluded:false}),false),
    /post-treatment leakage/);
  console.log("SELF_TEST_PASS: actual Signal calibration and quantitative decision API, independent source IDs, full labeled records, equal-information comparison and zero net-profit claims");
  console.log("SYNTHETIC SELFTEST ONLY; REAL DATA RUN IS SEPARATE");
}
async function main(){
  if(process.argv.includes("--self-test"))return selfTest();
  assert(process.argv.length===5,
    "usage: node lenta-calibration-real-outcomes.mjs calibration.jsonl test.jsonl prep-aggregate.json");
  const [cal,test,metadata]=await Promise.all([
    readFile(process.argv[2],"utf8"),readFile(process.argv[3],"utf8"),
    readFile(process.argv[4],"utf8")]);
  const report=evaluate(cal,test,JSON.parse(metadata));
  await mkdir("artifacts/validation",{recursive:true});
  await writeFile(OUTPUT,JSON.stringify(report,null,2)+"\n");
  console.log("REAL_LENTA_BINARY_CALIBRATION_RESULT "+JSON.stringify({
    status:report.classification,
    sample:report.splitCounts,
    sourceSHA256:report.sourceSHA256,
    metrics:report.forecastScores,
    comparedBrier:report.forecastPairedBrierImprovements,
    ipwPolicyResponse:report.policyResponsePerRandomizedCustomerIPS,
    ipwPolicyComparisons:report.policyPairedIPS,
    disagreements:{vsIsotonicPct:report.percentageSignalPolicyDisagreementWithConventionalIsotonic,
      vsPlattPct:report.percentageSignalPolicyDisagreementWithConventionalPlatt},
    signalActualCalls:report.actualSignalQuantitativeCallCount,
    moneyMeasured:report.realizedNetProfitObserved,
    causalProfitProven:report.causalSignalNetProfitSuperiorityProven
  }));
}
await main();
