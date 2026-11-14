/**
 * NON-ACTIONING offline shadow policy feasibility and power calculation.
 * No outcomes, assignments, user identities, deployments or external side effects.
 * Study protocol: docs/validation/shadow-policy-readiness.md
 *
 * node scripts/validation/shadow-policy-readiness.mjs --self-test
 * node scripts/validation/shadow-policy-readiness.mjs --config candidate.json --data proposals.csv
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const OUT="artifacts/validation/shadow-policy-readiness-report.json";
const COLUMNS=[
  "unit_hash","proposal_at","evidence_sha256",
  "model_version_baseline","model_version_signal","baseline_action",
  "signal_effective_action","signal_action_allowed","signal_action_scale",
  "simulation_recommendation","wisdom_decision","stewardship_recommendation"
];
const CONFIG_FIELDS=[
  "candidate_id","model_version_baseline","model_version_signal",
  "minimum_shadow_units","minimum_policy_disagreement_rate",
  "minimum_signal_allowed_rate","baseline_net_utility_sd_usd",
  "minimum_detectable_net_gain_usd","allocation_signal",
  "design_effect","expected_independent_units_per_day","observation_days"
];
const ENUMS={
  simulation_recommendation:["wait","block","reduce","proceed"],
  wisdom_decision:["proceed","proceed-small","wait","avoid"],
  stewardship_recommendation:[
    "wait","avoid","reduce","proceed","proceed-reversibly","not_applicable"
  ]
};
const sha256=text=>createHash("sha256").update(text).digest("hex");
function parseCSV(csv){
  // Strict RFC-style double-quote / comma / CRLF subset, including line feeds in quotes.
  let fields=[],value="",quoted=false,completed=[];
  for(let i=0;i<csv.length;i++){
    const char=csv[i];
    if(char==='"'){
      if(quoted&&csv[i+1]==='"'){value+='"';i++;}
      else if(quoted)quoted=false;
      else if(value==="")quoted=true;
      else throw Error("invalid CSV quotation");
    }else if(char===","&&!quoted){
      fields.push(value);value="";
    }else if((char==="\r"||char==="\n")&&!quoted){
      if(char==="\r"&&csv[i+1]==="\n")i++;
      fields.push(value);value="";
      if(fields.some(s=>s.length))completed.push(fields);
      fields=[];
    }else value+=char;
  }
  assert(!quoted,"unterminated quoted CSV data");
  if(fields.length||value.length){
    fields.push(value);
    if(fields.some(s=>s.length))completed.push(fields);
  }
  return completed;
}
function finite(v,name,lo=-Infinity,hi=Infinity){
  assert(v!==null&&v!==undefined&&String(v).trim()!=="","missing "+name);
  const x=Number(v);
  assert(Number.isFinite(x)&&x>=lo&&x<=hi,"invalid "+name);
  return x;
}
function nonempty(v,name){
  assert(typeof v==="string"&&v.trim().length>0,"missing "+name);
  return v;
}
function uint(v,name,min,max){
  const n=finite(v,name,min,max);
  assert(Number.isSafeInteger(n),"integer required "+name);
  return n;
}
function utc(v,name){
  assert(typeof v==="string"&&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v),
    "invalid ISO UTC "+name);
  const n=Date.parse(v);
  assert(Number.isFinite(n)&&n<=Date.now(),"invalid or future proposal timestamp");
  return n;
}
function checkConfig(x){
  assert(x&&typeof x==="object"&&!Array.isArray(x),"config object expected");
  for(const key of CONFIG_FIELDS)assert(Object.hasOwn(x,key),"missing config "+key);
  for(const key of ["candidate_id","model_version_baseline","model_version_signal"])
    nonempty(x[key],key);
  assert(x.model_version_signal!==x.model_version_baseline,"policy versions must differ");
  uint(x.minimum_shadow_units,"minimum_shadow_units",30,200000);
  finite(x.minimum_policy_disagreement_rate,"minimum_policy_disagreement_rate",0,1);
  finite(x.minimum_signal_allowed_rate,"minimum_signal_allowed_rate",0,1);
  assert(x.minimum_policy_disagreement_rate>0&&x.minimum_signal_allowed_rate>0,
    "readiness thresholds must require actual candidate differences and permissions");
  finite(x.baseline_net_utility_sd_usd,"baseline_net_utility_sd_usd",1e-9,1e9);
  finite(x.minimum_detectable_net_gain_usd,"minimum_detectable_net_gain_usd",1e-9,1e9);
  finite(x.allocation_signal,"allocation_signal",0.1,0.9);
  finite(x.design_effect,"design_effect",1,100);
  finite(x.expected_independent_units_per_day,"expected_independent_units_per_day",1e-9,1e9);
  uint(x.observation_days,"observation_days",1,3650);
  return x;
}
function summarize(config,source){
  checkConfig(config);
  const rows=parseCSV(source);
  assert(rows.length>1,"empty sanitized pre-outcome shadow proposal source");
  assert.deepEqual(rows[0],COLUMNS,"incorrect or outcome-containing shadow CSV schema");
  const seen=new Set(),allowed={},reasons={simulation:{},wisdom:{},stewardship:{}};
  const observedTimes=[];
  const counters={n:0,allowed:0,denied:0,disagree:0,
    disagreeWhenAllowed:0,disagreeWhenDenied:0,
    positiveActionScales:0,zeroScales:0};
  const inc=(o,key)=>{o[key]=(o[key]||0)+1;};
  for(let i=1;i<rows.length;i++){
    const a=rows[i];
    assert.equal(a.length,COLUMNS.length,"malformed pre-outcome shadow record");
    const r=Object.fromEntries(COLUMNS.map((k,j)=>[k,a[j]]));
    assert(/^[a-f0-9]{64}$/i.test(r.unit_hash),"non-pseudonymous or malformed unit digest");
    assert(!seen.has(r.unit_hash),"duplicate independent shadow decision unit");
    seen.add(r.unit_hash);
    assert(/^[a-f0-9]{64}$/i.test(r.evidence_sha256),"invalid pre-outcome evidence digest");
    assert.equal(r.model_version_signal,config.model_version_signal,"shadow Signal version drift");
    assert.equal(r.model_version_baseline,config.model_version_baseline,"shadow baseline version drift");
    const time=utc(r.proposal_at,"proposal_at");observedTimes.push(time);
    const baseline=nonempty(r.baseline_action,"baseline_action");
    const signal=nonempty(r.signal_effective_action,"signal_effective_action");
    assert(r.signal_action_allowed==="0"||r.signal_action_allowed==="1",
      "invalid native Signal permission");
    const isAllowed=r.signal_action_allowed==="1";
    const scale=finite(r.signal_action_scale,"signal_action_scale",0,1);
    if(isAllowed){
      assert(scale>0&&signal!=="wait","permitted Signal decision must have nonzero scale and action");
      counters.allowed++;counters.positiveActionScales++;
    }else{
      assert(scale===0&&signal==="wait",
        "denied Signal candidate must remain wait with scale zero");
      counters.denied++;counters.zeroScales++;
    }
    for(const [name,allowedValues] of Object.entries(ENUMS)){
      assert(allowedValues.includes(r[name]),"unrecognized native decision field "+name);
    }
    inc(reasons.simulation,r.simulation_recommendation);
    inc(reasons.wisdom,r.wisdom_decision);
    inc(reasons.stewardship,r.stewardship_recommendation);
    inc(allowed,signal);
    if(signal!==baseline){
      counters.disagree++;
      if(isAllowed)counters.disagreeWhenAllowed++;
      else counters.disagreeWhenDenied++;
    }
    counters.n++;
  }
  assert(counters.n<=200000,"source too large for this offline independent-unit analyzer");
  const disagreementRate=counters.disagree/counters.n;
  const allowedRate=counters.allowed/counters.n;
  const p=config.allocation_signal,sd=config.baseline_net_utility_sd_usd,
    mde=config.minimum_detectable_net_gain_usd;
  // Two-sided alpha=.05, 80% normal approximation, p/(1-p) allocation.
  const zalpha=1.959963984540054,zpower=0.8416212335729143;
  const total=Math.ceil((zalpha+zpower)**2*sd**2/
    (mde**2*p*(1-p))*config.design_effect);
  const requirements={
    enoughIndependentShadowUnits:counters.n>=config.minimum_shadow_units,
    meaningfulPolicyDisagreement:disagreementRate>=config.minimum_policy_disagreement_rate,
    nontrivialNativeActionPermission:allowedRate>=config.minimum_signal_allowed_rate,
    distinctAllowedActions:counters.disagreeWhenAllowed>0
  };
  const feasible=Object.values(requirements).every(Boolean);
  observedTimes.sort((a,b)=>a-b);
  return {
    classification:"OFFLINE_PRE_OUTCOME_SHADOW_FEASIBILITY_NOT_CAUSAL_PROOF",
    candidateId:config.candidate_id,
    source:{
      nIndependentUnitClaims:counters.n,
      timeRangeUTC:[new Date(observedTimes[0]).toISOString(),
        new Date(observedTimes[observedTimes.length-1]).toISOString()],
      uniqueUnitDigests:seen.size,
      sourceAuthorshipVerified:false,
      outcomeLabelsExamined:false,
      assignmentOrTreatmentExecuted:false
    },
    observedShadow:{
      baselineVersion:config.model_version_baseline,
      signalVersion:config.model_version_signal,
      ...counters,
      disagreementRate,
      signalAllowedFraction:allowedRate,
      nativeSimulationBreakdown:reasons.simulation,
      nativeWisdomBreakdown:reasons.wisdom,
      nativeStewardshipBreakdown:reasons.stewardship,
      signalEffectiveActionCounts:allowed
    },
    hypotheticalPowerPlanning:{
      alphaTwoSided:.05,power:.80,allocationSignal:p,designEffect:config.design_effect,
      baselineNetUtilitySD_USD:sd,minimumDetectableITTNetGainUSD:mde,
      neededTotalIndependentUnits:total,
      approximateSignalUnits:Math.ceil(total*p),
      approximateBaselineUnits:Math.ceil(total*(1-p)),
      assumedIndependentUnitArrivalPerDay:config.expected_independent_units_per_day,
      estimatedEnrollmentDaysUnderAssumptions:Math.ceil(total/config.expected_independent_units_per_day),
      observationDaysAfterEnrollment:config.observation_days,
      limitations:[
        "Power is conditional on user-supplied external baseline-only USD variance and MDE; neither is validated by shadow proposals.",
        "The target effect is unconditional randomized ITT net gain, not a conditional effect among disagreeing units.",
        "Heavy tails, harm noninferiority, correlation and attrition can increase required sample sizes; independent study design review is necessary.",
        "Estimated enrollment days are a planning expression, not an execution timeline or a promise of future work."
      ]
    },
    preflightGates:requirements,
    preflightVerdict:feasible?"PREFLIGHT_POTENTIALLY_INFORMATIVE_ONLY":
      "PREFLIGHT_NOT_FEASIBLE",
    scientificLimitations:[
      "The CSV asserts, but cannot authenticate, actual Signal or baseline application runtime outputs and independent randomization units.",
      "No policy assignment, action execution, observed net benefit, cost accounting or safety outcome is measured.",
      "Candidate action differences and native allowed-scale rates are NECESSARY not SUFFICIENT conditions for incremental causal improvement.",
      "A registered trial needs ethical/operational approval, policy freeze, external assignment ledger and finalized outcomes with authenticated net utility.",
      "Preflight cannot justify bypassing a zero-scale Signal veto or promoting an unvalidated mapping."
    ]
  };
}
function testConfig(){
  return {
    candidate_id:"shadow-fixture-only",model_version_baseline:"baseline-test-v1",
    model_version_signal:"signal-test-v1",
    minimum_shadow_units:60,minimum_policy_disagreement_rate:.1,
    minimum_signal_allowed_rate:.3,
    baseline_net_utility_sd_usd:12,minimum_detectable_net_gain_usd:2,
    allocation_signal:.5,design_effect:1.2,
    expected_independent_units_per_day:25,observation_days:14
  };
}
function testData({identical=false,invalidZeroPermission=false}={}){
  const rows=[COLUMNS.join(",")];
  for(let i=0;i<100;i++){
    const baseline="action-a";
    const permitted=identical?true:i%5!==0;
    const signal=identical?baseline:permitted?(i%7===0?"action-b":baseline):"wait";
    const allowed=invalidZeroPermission&&i===1?1:Number(permitted);
    const scale=invalidZeroPermission&&i===1?0:Number(permitted)*.45;
    rows.push([
      sha256("fictional-unit-"+i),"2024-01-02T12:00:00Z",
      sha256("fictional-evidence-"+i),"baseline-test-v1","signal-test-v1",
      baseline,signal,allowed,scale,
      permitted?"reduce":"wait",
      permitted?"proceed-small":"wait",
      "not_applicable"
    ].join(","));
  }
  return rows.join("\n");
}
function selfTest(){
  const c=testConfig(),data=testData();
  const output=summarize(c,data);
  assert.equal(output.source.nIndependentUnitClaims,100);
  assert.equal(output.observedShadow.allowed,80);
  assert(output.observedShadow.disagree>20);
  assert(output.hypotheticalPowerPlanning.neededTotalIndependentUnits>1000);
  assert.equal(output.preflightVerdict,"PREFLIGHT_POTENTIALLY_INFORMATIVE_ONLY");
  assert.equal(summarize(c,testData({identical:true})).preflightVerdict,
    "PREFLIGHT_NOT_FEASIBLE");
  assert.throws(()=>summarize(c,testData({invalidZeroPermission:true})),
    /nonzero scale/);
  assert.throws(()=>summarize(c,data.replace("signal-test-v1","wrong-version")),
    /shadow Signal version drift/);
  assert.throws(()=>summarize(c,data+"\n"+data.split("\n")[1]),
    /duplicate independent shadow/);
  assert.throws(()=>summarize(c,data.replace(",0,0,wait",",0,0.3,wait")),
    /wait with scale zero/);
  assert.throws(()=>summarize(c,data.replace("2024-01-02T12:00:00Z","2090-01-02T12:00:00Z")),
    /future proposal timestamp/);
  assert.throws(()=>checkConfig({...c,baseline_net_utility_sd_usd:null}),
    /missing baseline_net_utility_sd_usd/);
  console.log("SELF_TEST_PASS: pre-outcome-only schema, native safety veto, version lock, duplicate rejection, disagreement and conditional power");
  console.log("SYNTHETIC FIXTURES ONLY: no Signal business gain or causal result");
}
async function main(){
  const args=process.argv.slice(2);
  if(args.includes("--self-test"))return selfTest();
  const conf=args.indexOf("--config"),dat=args.indexOf("--data");
  assert(conf>=0&&dat>=0&&args[conf+1]&&args[dat+1],
    "usage: node shadow-policy-readiness.mjs --config pilot-design.json --data shadow-proposals.csv");
  const configBytes=await readFile(args[conf+1]);
  const dataBytes=await readFile(args[dat+1]);
  const report=summarize(JSON.parse(configBytes.toString("utf8")),
    dataBytes.toString("utf8"));
  report.source.configSHA256=sha256(configBytes);
  report.source.shadowDatasetSHA256=sha256(dataBytes);
  await mkdir("artifacts/validation",{recursive:true});
  await writeFile(OUT,JSON.stringify(report,null,2)+"\n");
  console.log("SHADOW ONLY",report.source.nIndependentUnitClaims,
    "CLAIMED UNITS; DISAGREEMENT",report.observedShadow.disagreementRate,
    "PERMITTED",report.observedShadow.signalAllowedFraction);
  console.log("CONDITIONAL REQUIRED RANDOMIZED UNITS",
    report.hypotheticalPowerPlanning.neededTotalIndependentUnits,
    "BASED ON UNVERIFIED EXTERNAL PLANNING ASSUMPTIONS");
  console.log("PRE-FLIGHT",report.preflightVerdict);
  console.log("NO PROSPECTIVE OR REAL-WORLD CAUSAL LIFT HAS BEEN MEASURED");
}
await main();
