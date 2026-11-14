/**
 * Offline, fail-closed analyzer for a prospectively randomized *Signal software*
 * versus equally informed baseline policy trial. No trial is launched here.
 *
 * This code is NOT a trial, and --self-test is NOT scientific evidence.
 * Preregistered protocol:
 *   docs/validation/prospective-signal-policy-causal-proof.md
 *
 * Usage:
 *   node scripts/validation/prospective-policy-trial-audit.mjs --self-test
 *   node scripts/validation/prospective-policy-trial-audit.mjs --config path.json --data finalized.csv
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const EXPECTED_COLUMNS = [
  "unit_hash","assigned_arm","registered_trial_id","assigned_at","decision_at",
  "outcome_at","baseline_action","signal_action","effective_action","eligible",
  "complete","policy_adherent","harm_event","gross_benefit_usd",
  "action_cost_usd","review_cost_usd","delay_cost_usd","harm_cost_usd"
];
const OUT = "artifacts/validation/prospective-policy-trial-report.json";
const Z95 = 1.959963984540054;
const Z9775 = 2.241402727604947;
const REQUIRED_CONFIG = [
  "trial_id","registered_at","locked_git_commit","allocation_signal",
  "minimum_units_per_arm","minimum_policy_disagreement_rate",
  "minimum_policy_adherence","minimum_point_net_gain_usd",
  "minimum_lower_ci_net_gain_usd","max_harm_rate_increase",
  "bootstrap_repetitions","bootstrap_seed","expected_observation_days",
  "model_version_signal","model_version_baseline","utility_definition",
  "allocation_unit_definition","external_approval_ref"
];
function sha256(x) { return createHash("sha256").update(x).digest("hex"); }
function erfc(x) {
  // Numerical Recipes approximation for normal two-sided tail p-values.
  const z=Math.abs(x),t=1/(1+0.5*z);
  const u=t*Math.exp(-z*z-1.26551223+t*(1.00002368+t*(0.37409196+
    t*(0.09678418+t*(-0.18628806+t*(0.27886807+t*(-1.13520398+
    t*(1.48851587+t*(-0.82215223+t*0.17087277)))))))));
  return x>=0?u:2-u;
}
function asFinite(v,label,minimum=-Infinity,maximum=Infinity) {
  assert(v!==null&&v!==undefined&&String(v).trim()!=="", "missing "+label);
  const n=Number(v);
  assert(Number.isFinite(n)&&n>=minimum&&n<=maximum,"invalid "+label);
  return n;
}
function integer(v,label,min,max) {
  const n=asFinite(v,label,min,max);
  assert(Number.isSafeInteger(n),"integer required for "+label);
  return n;
}
function requiredString(v,label) {
  assert(typeof v==="string" && v.trim().length>0,
    "missing string: "+label);
  return v;
}
function strictUTC(v,label) {
  assert(typeof v==="string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v),
    "timestamp must be UTC ISO Z: "+label);
  const millis=Date.parse(v);
  assert(Number.isFinite(millis),"invalid UTC timestamp: "+label);
  return millis;
}
function configGate(config) {
  assert(config && typeof config==="object" && !Array.isArray(config));
  for(const field of REQUIRED_CONFIG) {
    assert(Object.hasOwn(config,field),"missing precommitted config field "+field);
  }
  for(const key of ["trial_id","model_version_signal","model_version_baseline",
    "utility_definition","allocation_unit_definition","external_approval_ref"]) {
    requiredString(config[key],key);
  }
  assert(/^[a-f0-9]{40}$/i.test(config.locked_git_commit),
    "locked_git_commit must be a full 40-hex commit SHA");
  strictUTC(config.registered_at,"registered_at");
  assert(config.model_version_signal!==config.model_version_baseline,
    "software policy identifiers must be distinguishable");
  const p=asFinite(config.allocation_signal,"allocation_signal",0.1,0.9);
  for(const name of ["minimum_policy_disagreement_rate",
    "minimum_policy_adherence","max_harm_rate_increase"]) {
    asFinite(config[name],name,0,1);
  }
  const minPoint=asFinite(config.minimum_point_net_gain_usd,"minimum_point_net_gain_usd");
  const minLower=asFinite(config.minimum_lower_ci_net_gain_usd,"minimum_lower_ci_net_gain_usd");
  assert(minPoint>0 && minLower>0 && minPoint>=minLower,
    "precommitted net gain must be strictly economically positive");
  assert(config.minimum_policy_disagreement_rate>0,
    "policies must have nonzero expected disagreement");
  assert(config.minimum_policy_adherence>0,
    "policy adherence requirement cannot be zero");
  integer(config.minimum_units_per_arm,"minimum_units_per_arm",30,1000000);
  integer(config.bootstrap_repetitions,"bootstrap_repetitions",2000,10000);
  integer(config.bootstrap_seed,"bootstrap_seed",0,0xffffffff);
  integer(config.expected_observation_days,"expected_observation_days",1,3650);
  return p;
}
function parseCSV(src) {
  // A complete small RFC-4180 parser: quoted commas, doubled quotes and newline.
  // Source is read only in memory and never included in aggregate artifacts.
  const out=[];let cells=[],token="",quoted=false;
  const s=src.replace(/^\uFEFF/,"");
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(ch==='"'){
      if(quoted && s[i+1]==='"'){token+='"';i++;}
      else if(!quoted && token==="")quoted=true;
      else if(quoted)quoted=false;
      else throw Error("unexpected quotation in CSV field");
    }else if(ch===","&&!quoted){
      cells.push(token);token="";
    }else if((ch==="\n"||ch==="\r")&&!quoted){
      if(ch==="\r"&&s[i+1]==="\n")i++;
      cells.push(token);token="";
      if(cells.some(x=>x.length>0))out.push(cells);
      cells=[];
    }else token+=ch;
  }
  assert(!quoted,"unterminated CSV quoted field");
  if(cells.length||token.length){
    cells.push(token);
    if(cells.some(x=>x.length>0))out.push(cells);
  }
  return out;
}
function readRows(csv,config) {
  const data=parseCSV(csv);
  assert(data.length>1,"empty trial data");
  assert.deepEqual(data[0],EXPECTED_COLUMNS,
    "source must match finalized preregistered CSV schema exactly");
  const seen=new Set(),result=[];
  const registered=strictUTC(config.registered_at,"registered_at");
  for(let i=1;i<data.length;i++){
    const v=data[i];
    assert.equal(v.length,EXPECTED_COLUMNS.length,"malformed or incomplete source CSV row");
    const raw=Object.fromEntries(EXPECTED_COLUMNS.map((k,j)=>[k,v[j]]));
    assert(/^[a-fA-F0-9]{32,128}$/.test(raw.unit_hash),
      "unit_hash must be pseudonymized hex (cannot certify anonymization)");
    assert(!seen.has(raw.unit_hash),"duplicate randomized experimental unit");
    seen.add(raw.unit_hash);
    assert(["baseline","signal"].includes(raw.assigned_arm),"unknown trial arm");
    assert.equal(raw.registered_trial_id,config.trial_id,"unregistered trial identifier");
    const assignAt=strictUTC(raw.assigned_at,"assigned_at");
    const decisionAt=strictUTC(raw.decision_at,"decision_at");
    const outcomeAt=strictUTC(raw.outcome_at,"outcome_at");
    assert(assignAt>registered,"registration timestamp must precede assignment");
    assert(decisionAt<=assignAt,"both candidate decisions must be frozen before random assignment");
    assert(outcomeAt>=assignAt+config.expected_observation_days*86400000,
      "outcome must have a fully matured predefined observation window");
    assert(outcomeAt<=Date.now(),"future unobserved outcomes are prohibited");
    const binary=(name)=>{
      assert(raw[name]==="0"||raw[name]==="1","binary required: "+name);
      return Number(raw[name]);
    };
    const eligible=binary("eligible"),complete=binary("complete");
    const adherent=binary("policy_adherent"),harm=binary("harm_event");
    assert(eligible===1,"an eligibility or exclusion issue must be resolved before analysis");
    assert(complete===1,"incomplete outcomes cannot be silently excluded");
    const baseline=requiredString(raw.baseline_action,"baseline_action");
    const signal=requiredString(raw.signal_action,"signal_action");
    const effective=requiredString(raw.effective_action,"effective_action");
    const planned=raw.assigned_arm==="signal"?signal:baseline;
    if(adherent===1)assert(effective===planned,
      "policy_adherent=1 inconsistent with executed action");
    const gain=asFinite(raw.gross_benefit_usd,"gross_benefit_usd");
    const costFields=["action_cost_usd","review_cost_usd",
      "delay_cost_usd","harm_cost_usd"];
    const costs=costFields.map(k=>asFinite(raw[k],k,0));
    const cost=costs.reduce((a,b)=>a+b,0);
    const utility=gain-cost;
    assert(Number.isFinite(utility),"non-finite net outcome");
    result.push({arm:raw.assigned_arm,utility,harm,adherent,
      disagree:Number(baseline!==signal)});
  }
  assert(result.length<=200000,
    "more than 200k units: use independently reviewed scalable clustered analysis");
  return result;
}
function stats(v){
  assert(v.length>=2);
  const n=v.length,sum=v.reduce((a,b)=>a+b,0),mean=sum/n;
  const variance=v.reduce((a,b)=>a+(b-mean)**2,0)/(n-1);
  return {n,mean,variance,sd:Math.sqrt(variance)};
}
function q(array,prob){
  const a=[...array].sort((x,y)=>x-y);
  const p=(a.length-1)*prob,l=Math.floor(p),r=Math.ceil(p);
  return a[l]+(a[r]-a[l])*(p-l);
}
function rng(seed){
  let s=seed>>>0;
  return ()=>((s=(Math.imul(1664525,s)+1013904223)>>>0)/4294967296);
}
function bootstrap(a,b,iterations,seed){
  const next=rng(seed),draws=[];
  for(let i=0;i<iterations;i++){
    let aa=0,bb=0;
    for(let j=0;j<a.length;j++)aa+=a[Math.floor(next()*a.length)];
    for(let j=0;j<b.length;j++)bb+=b[Math.floor(next()*b.length)];
    draws.push(aa/a.length-bb/b.length);
  }
  return {ci95:[q(draws,.025),q(draws,.975)],
    repetitions:iterations,seed,
    resampling:"independent experimental units, stratified by assigned arm"};
}
function wilson(count,n,z) {
  const p=count/n,z2=z*z,denom=1+z2/n;
  const center=(p+z2/(2*n))/denom;
  const half=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/denom;
  return {lower:Math.max(0,center-half),upper:Math.min(1,center+half)};
}
function evaluate(config,rows){
  const signalRows=rows.filter(r=>r.arm==="signal");
  const controlRows=rows.filter(r=>r.arm==="baseline");
  const sig=stats(signalRows.map(r=>r.utility)),base=stats(controlRows.map(r=>r.utility));
  const allN=sig.n+base.n,signalFraction=sig.n/allN,p=config.allocation_signal;
  const diff=sig.mean-base.mean;
  const standardError=Math.sqrt(sig.variance/sig.n+base.variance/base.n);
  const primaryCI=[diff-Z95*standardError,diff+Z95*standardError];
  const primaryP=standardError>0?
    erfc(Math.abs(diff/standardError)/Math.SQRT2):1;
  const boot=bootstrap(signalRows.map(r=>r.utility),
    controlRows.map(r=>r.utility),config.bootstrap_repetitions,
    config.bootstrap_seed);
  const srmZ=(sig.n-allN*p)/Math.sqrt(allN*p*(1-p));
  const srmP=erfc(Math.abs(srmZ)/Math.SQRT2);
  const harmSig=signalRows.reduce((n,r)=>n+r.harm,0);
  const harmBase=controlRows.reduce((n,r)=>n+r.harm,0);
  const harmCI_S=wilson(harmSig,sig.n,Z9775);
  const harmCI_B=wilson(harmBase,base.n,Z9775);
  // Conservative simultaneous one-sided bound for excess harm.
  const upperHarmDiff=harmCI_S.upper-harmCI_B.lower;
  const disagree=rows.reduce((n,r)=>n+r.disagree,0)/allN;
  const adherent=rows.reduce((n,r)=>n+r.adherent,0)/allN;
  const checks={
    minimumSamplePerArm:sig.n>=config.minimum_units_per_arm&&
      base.n>=config.minimum_units_per_arm,
    sampleRatioMatched:srmP>=.001,
    meaningfulPolicyDisagreement:disagree>=config.minimum_policy_disagreement_rate,
    minimumPolicyAdherence:adherent>=config.minimum_policy_adherence,
    meaningfulPointNetGain:diff>=config.minimum_point_net_gain_usd,
    credibleLowerNetGain:primaryCI[0]>config.minimum_lower_ci_net_gain_usd,
    twoSidedStatisticalEvidence:standardError>0&&primaryP<.05,
    bootstrapSupport:boot.ci95[0]>0,
    safetyNoninferiority:upperHarmDiff<=config.max_harm_rate_increase
  };
  const passed=Object.values(checks).every(Boolean);
  return {
    trialId:config.trial_id,
    classification:"OFFLINE_PROSPECTIVE_RCT_AGGREGATE_SCREEN_NOT_SCIENTIFIC_CERTIFICATION",
    randomizedUnitCount:allN,
    design:{control:"existing baseline",intervention:"same baseline plus Signal governance",
      analysis:"intention to treat, including abstentions and nonadherence"},
    sourceMetrics:{
      assignedCount:{signal:sig.n,baseline:base.n},
      realizedSignalAllocation:signalFraction,
      sampleRatioPValue:srmP,
      policyDisagreementFraction:disagree,
      policyAdherenceFraction:adherent
    },
    netEconomicResult:{
      unit:"measured USD net utility per randomized unit",
      signalMean:sig.mean,baselineMean:base.mean,
      signalSD:sig.sd,baselineSD:base.sd,
      difference:diff,welchSE:standardError,
      ci95:primaryCI,twoSidedP:primaryP,
      bootstrap:boot
    },
    safety:{
      signalHarmEvents:harmSig,controlHarmEvents:harmBase,
      signalHarmRate:harmSig/sig.n,controlHarmRate:harmBase/base.n,
      harmRateDifferencePoint:harmSig/sig.n-harmBase/base.n,
      conservativeSimultaneousWilsonBound:{
        signal:harmCI_S,control:harmCI_B,
        upperHarmRateDifference:upperHarmDiff,
        maxAllowedIncrease:config.max_harm_rate_increase
      }
    },
    gates:checks,
    verdict:passed?"MEETS_PRECOMMITTED_SCREEN_REQUIRES_INDEPENDENT_CAUSAL_ECONOMIC_AND_SAFETY_AUDIT":
      "INCREMENTAL_SIGNAL_SUPERIORITY_NOT_PROVEN",
    limitations:[
      "Assignment authenticity, consent, pre-allocation registration and external approval require independent source/log verification.",
      "The data cannot prove that all randomized eligible units and outcomes were supplied or that benefits and costs were externally audited.",
      "Unit hash format does not guarantee de-identification; privacy/security review is still required.",
      "Time order and cross-arm contamination checks require source system corroboration.",
      "This analyzer assumes independent randomized units; correlated events require cluster randomization and cluster-aware analysis.",
      "Observed policy adherence is self-reported in input; implementation audit of actual Signal code and effective permissions is required.",
      "Passing these automated statistical thresholds cannot certify causal or monetary improvement without independent review."
    ]
  };
}
function fixtureConfig(){
  return {
    trial_id:"synthetic-self-test-only",registered_at:"2023-12-01T00:00:00Z",
    locked_git_commit:"0123456789abcdef0123456789abcdef01234567",
    allocation_signal:.5,minimum_units_per_arm:30,
    minimum_policy_disagreement_rate:.10,minimum_policy_adherence:.95,
    minimum_point_net_gain_usd:.5,minimum_lower_ci_net_gain_usd:.1,
    max_harm_rate_increase:.3,bootstrap_repetitions:2000,bootstrap_seed:20261114,
    expected_observation_days:7,model_version_signal:"test-signal-v1",
    model_version_baseline:"test-baseline-v1",utility_definition:"synthetic USD net",
    allocation_unit_definition:"one fictional account",
    external_approval_ref:"test-fixture-do-not-use"
  };
}
function fixtureRows(n=80) {
  const out=[EXPECTED_COLUMNS.join(",")];
  for(let i=0;i<n*2;i++){
    const signal=i%2===0;
    const u=signal?10+(i%7)*.2:8+(i%7)*.2;
    out.push([
      sha256("fictional-"+i),signal?"signal":"baseline","synthetic-self-test-only",
      "2024-01-02T00:00:00Z","2024-01-01T23:59:00Z",
      "2024-01-10T00:00:00Z","action-A",i%5===0?"action-A":"action-B",
      signal?(i%5===0?"action-A":"action-B"):"action-A",
      1,1,1,i%30===0?1:0,u,1,.5,.25,.25
    ].join(","));
  }
  return out.join("\n");
}
function selfTest() {
  const conf=fixtureConfig(),csv=fixtureRows();
  assert.equal(configGate(conf),.5);
  const rows=readRows(csv,conf),calc=evaluate(conf,rows);
  assert(calc.randomizedUnitCount===160);
  assert(calc.sourceMetrics.policyDisagreementFraction>.10);
  assert(calc.netEconomicResult.difference>0);
  assert(calc.gates.sampleRatioMatched);
  assert.deepEqual(parseCSV('a,"b,c"\n1,"two"'),[["a","b,c"],["1","two"]]);
  assert.throws(()=>readRows(csv.replace(/,/,";"),conf),
    /schema exactly/);
  assert.throws(()=>readRows(csv.replace(
    "2024-01-10T00:00:00Z","2024-01-01T00:00:00Z"),conf),
    /observation window/);
  assert.throws(()=>readRows(csv.replace("1,1,1,","1,0,1,"),conf),
    /incomplete outcomes/);
  assert.throws(()=>readRows(csv.replace("action-A,action-B","action-A,"),conf));
  const duplicate=csv+"\n"+csv.split("\n")[1];
  assert.throws(()=>readRows(duplicate,conf),/duplicate randomized/);
  const same=csv.replaceAll("action-B","action-A");
  assert(!evaluate(conf,readRows(same,conf)).gates.meaningfulPolicyDisagreement);
  const missCost=csv.replace(",1,0.5,0.25,0.25",",1,,0.25,0.25");
  assert.throws(()=>readRows(missCost,conf),/missing review_cost_usd/);
  assert.throws(()=>configGate({...conf,minimum_point_net_gain_usd:0}),
    /economically positive/);
  console.log("SELF_TEST_PASS: registered plan, exact schema, timeline, source completeness, accounting, ITT, bootstrap, harm guardrail and fail-closed controls");
  console.log("SYNTHETIC FIXTURE ONLY: no real-world causal evidence or enrollment");
}
async function main(){
  const args=process.argv.slice(2);
  if(args.includes("--self-test")){selfTest();return;}
  const cfg=args.indexOf("--config"),dat=args.indexOf("--data");
  assert(cfg>=0 && dat>=0 && args[cfg+1] && args[dat+1],
    "usage: node prospective-policy-trial-audit.mjs --config trial.json --data finalized.csv");
  const configBytes=await readFile(args[cfg+1]);
  const csvBytes=await readFile(args[dat+1]);
  const config=JSON.parse(configBytes.toString("utf8"));
  configGate(config);
  const rows=readRows(csvBytes.toString("utf8"),config);
  assert(rows.length>=2*config.minimum_units_per_arm,
    "insufficient randomized experiment units");
  const report={
    ...evaluate(config,rows),
    evidenceIntegrity:{
      configSHA256:sha256(configBytes),finalizedCSV_SHA256:sha256(csvBytes),
      configGitCommitClaim:config.locked_git_commit,
      registrationTimestampClaim:config.registered_at,
      externalApprovalReferenceClaim:config.external_approval_ref,
      externalAuditVerified:false
    },
    generatedAtUTC:new Date().toISOString()
  };
  await mkdir("artifacts/validation",{recursive:true});
  await writeFile(OUT,JSON.stringify(report,null,2)+"\n");
  console.log("FINALIZED DATA CHECKED",rows.length,"RANDOMIZED UNITS");
  console.log("OBSERVED NET ITT DIFFERENCE",report.netEconomicResult.difference,
    "95% CI",JSON.stringify(report.netEconomicResult.ci95));
  console.log("INTEGRITY AND SCIENTIFIC SCREEN",JSON.stringify(report.gates));
  console.log("VERDICT",report.verdict);
  console.log("Independent causal, cost, randomization, privacy and safety audit is ALWAYS required.");
}
await main();
