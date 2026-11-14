/**
 * Togo World Bank RCT: license-respecting OFFLINE data integrity gate.
 *
 * It never downloads datasets, commits raw data, performs actions, imputes
 * profits, trains models, claims Signal impact, or conducts a randomized
 * software trial. The researcher must lawfully obtain and preprocess the source.
 *
 * node scripts/validation/independent-rct-profit-source-gate.mjs --self-test
 * node scripts/validation/independent-rct-profit-source-gate.mjs \
 *   --data /private/authorized-togo-canonical.csv \
 *   --attestation /private/independently-reviewed-source-attestation.json
 *
 * This script reports aggregate counts/digests only, never rows/IDs/profit sums.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const FIELDS=["firm_hash","randomized_arm","assignment_probability",
  "baseline_profit_usd_month","endline_profit_usd_month",
  "endline_profit_observed","source_currency_verified"];
const REQUIRED=["study_id","source_catalog","source_file_sha256",
  "source_preprocessing_sha256","source_access_terms_complied",
  "research_use_only","nonredistribution_confirmed",
  "source_currency_conversion_independently_verified",
  "profit_is_operating_net_not_revenue",
  "original_randomization_verified",
  "baseline_features_pre_treatment_verified",
  "independent_source_custody_verified"];
const ARMS=["control","traditional","initiative"];
const COSTS={control:0,traditional:718,initiative:756};
const EXPECTED_N=500,EXPECTED_TOTAL=1500;
const OUT="artifacts/validation/independent-togo-rct-profit-source-gate.json";
const hash=x=>createHash("sha256").update(x).digest("hex");

function keys(record,expected,label){
  assert(record&&typeof record==="object"&&!Array.isArray(record),
    "invalid "+label);
  assert.deepEqual(Object.keys(record).sort(),[...expected].sort(),
    "unexpected/missing "+label+" fields; raw company details prohibited");
}
function sha(s,name){
  assert(typeof s==="string"&&/^[0-9a-f]{64}$/i.test(s),
    "invalid SHA256: "+name);
  return s.toLowerCase();
}
function amount(s,name,nullable=false){
  if(nullable && s==="")return null;
  assert(typeof s==="string"&&
    /^-?(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(s),
    "invalid/missing amount: "+name);
  const n=Number(s);
  assert(Number.isFinite(n)&&Math.abs(n)<=1e9,
    "nonfinite or unreasonable amount: "+name);
  return n;
}
function rowsOf(s){
  assert(typeof s==="string"&&Buffer.byteLength(s,"utf8")<=5_000_000,
    "bounded private sanitized source required");
  const lines=s.replace(/^\uFEFF/,"").trim().split(/\r?\n/);
  assert(lines.length===EXPECTED_TOTAL+1,
    "original randomized cohort must include all 1,500 firm units");
  assert.equal(lines[0],FIELDS.join(","),
    "exact sanitized CSV column contract required");
  const rows=lines.slice(1).map((line,i)=>{
    assert(!/["\r\n]/.test(line)&&line.length<=800,
      "invalid CSV or potential raw data on row "+(i+2));
    const fields=line.split(",");
    assert.equal(fields.length,FIELDS.length,"malformed canonical CSV row");
    const r=Object.fromEntries(FIELDS.map((key,j)=>[key,fields[j]]));
    sha(r.firm_hash,"firm_hash");
    assert(ARMS.includes(r.randomized_arm),"unexpected treatment arm");
    const probability=Number(r.assignment_probability);
    assert(Number.isFinite(probability)&&probability>0&&probability<=1,
      "non-positive original randomized action propensity");
    assert(Math.abs(probability-1/3)<.0000001,
      "original 1:1:1 design expected; verify original stratum propensities before running");
    const observed=r.endline_profit_observed;
    assert(observed==="1"||observed==="0","observed must be binary");
    assert.equal(r.source_currency_verified,"1",
      "source currency conversion must be independently verified; no locale defaults");
    const baseline=amount(r.baseline_profit_usd_month,"baseline_profit_usd_month",true);
    const outcome=amount(r.endline_profit_usd_month,"endline_profit_usd_month",true);
    assert((observed==="1") === (outcome!==null),
      "missing and observed outcome flags disagree");
    return {firm_hash:r.firm_hash,arm:r.randomized_arm,
      observed:observed==="1",baselinePresent:baseline!==null};
  });
  const ids=new Set(rows.map(x=>x.firm_hash));
  assert.equal(ids.size,EXPECTED_TOTAL,"duplicate firm units");
  const count=Object.fromEntries(ARMS.map(a=>[
    a,{randomized:rows.filter(x=>x.arm===a).length,
      outcomeObserved:rows.filter(x=>x.arm===a&&x.observed).length,
      outcomeMissing:rows.filter(x=>x.arm===a&&!x.observed).length,
      baselinePresent:rows.filter(x=>x.arm===a&&x.baselinePresent).length}
  ]));
  for(const arm of ARMS){
    assert.equal(count[arm].randomized,EXPECTED_N,
      "must match official 500-per-arm RCT design");
  }
  return count;
}
function check(att){
  keys(att,REQUIRED,"source attestation");
  assert.equal(att.study_id,"TGO_2013-2021_FSCPIT_v02_M",
    "wrong independent study");
  assert.equal(att.source_catalog,"https://microdata.worldbank.org/catalog/2860",
    "unexpected research dataset catalog");
  sha(att.source_file_sha256,"source_file_sha256");
  sha(att.source_preprocessing_sha256,"source_preprocessing_sha256");
  const booleans=REQUIRED.filter(x=>x!=="study_id"&&x!=="source_catalog"&&
    x!=="source_file_sha256"&&x!=="source_preprocessing_sha256");
  for(const k of booleans)assert.equal(att[k],true,
    "independently verified research-use/source condition is required: "+k);
}
function audit(att,bytes){
  // A supplied attestation CANNOT independently authenticate itself.
  check(att);
  const arms=rowsOf(bytes);
  const complete=ARMS.every(k=>arms[k].outcomeMissing===0);
  return {
    classification:"HISTORICAL_RANDOMIZED_TRAINING_DATA_INTEGRITY_ONLY",
    studyId:att.study_id,
    provenance:{officialCatalog:att.source_catalog,
      originalRCTArms:{control:500,traditional:500,initiative:500},
      sourceFileSHA256Claim:att.source_file_sha256,
      preprocessingSHA256Claim:att.source_preprocessing_sha256,
      sanitizedInputSHA256:hash(bytes),
      independentAttestationValidatedByThisCLI:false,
      costSource:"https://www.leuphana.de/fileadmin/user_upload/Forschungseinrichtungen/rce/News/SOM_Togo_Revision_Aug2017.pdf"},
    randomizedCohort:1500,armCounts:arms,
    documentedProgramDeliveryCostUSDPerInvitedParticipant:COSTS,
    monetaryOutcome:"observed firm monthly operating profit, NOT measured 24-month cumulative net profit",
    status:complete?"SOURCE_DATA_COUNTS_COMPLETE_REQUIRES_SOURCE_REVIEW":
      "MISSING_ENDLINE_PROFITS_REQUIRE_PRESPECIFIED_ATTRITION_SENSITIVITY",
    causalClaim:{
      trainingInterventionRandomized:true,
      signalSoftwareRandomized:false,
      signalQuantitativeAdvisorEvaluated:false,
      nativePermissionTested:false,
      signalVersusConventionalPolicyEvaluated:false,
      realizedNetProfitOfSignalDeploymentObserved:false,
      verifiedSignalCausalNetProfitSuperiority:false
    },
    nonnegotiableNextSteps:[
      "Authenticate raw source license, Stata variable mappings, actual FX conversion and firm/stratum assignment",
      "Do not ignore missing endline profits or impute undetected firm closures as zero",
      "Freeze Signal executable model, independent conventional optimizer and data partition without test-outcome access",
      "Run logged RCT policy-value comparison on real operating profit and published $718/$756 course costs with documented 12/24-month amortization assumptions",
      "A historical intervention RCT cannot prove the effect of deploying Signal software: prospective randomized Signal-vs-optimizer exposure is required"
    ]
  };
}
function sample(){
  const rows=[FIELDS.join(",")];
  for(let i=0;i<1500;i++){
    const arm=ARMS[Math.floor(i/500)];
    const observed=i%13!==0;
    rows.push([hash("synthetic-firm-"+i),arm,String(1/3),
      "120.3",observed?"140.5":"",observed?"1":"0","1"].join(","));
  }
  const a={study_id:"TGO_2013-2021_FSCPIT_v02_M",
    source_catalog:"https://microdata.worldbank.org/catalog/2860",
    source_file_sha256:hash("synthetic-only-not-worldbank-raw"),
    source_preprocessing_sha256:hash("synthetic-only-not-worldbank-conversion"),
    source_access_terms_complied:true,research_use_only:true,
    nonredistribution_confirmed:true,
    source_currency_conversion_independently_verified:true,
    profit_is_operating_net_not_revenue:true,
    original_randomization_verified:true,
    baseline_features_pre_treatment_verified:true,
    independent_source_custody_verified:true};
  return {s:rows.join("\n")+"\n",a};
}
function selfTest(){
  const {s,a}=sample();
  const out=audit(a,s);
  assert.equal(out.randomizedCohort,1500);
  assert.deepEqual(Object.values(out.armCounts).map(x=>x.randomized),[500,500,500]);
  assert.equal(out.status,"MISSING_ENDLINE_PROFITS_REQUIRE_PRESPECIFIED_ATTRITION_SENSITIVITY");
  assert.equal(out.causalClaim.verifiedSignalCausalNetProfitSuperiority,false);
  assert.deepEqual(out,audit(a,s));
  assert.throws(()=>audit({...a,source_access_terms_complied:false},s),
    /required/);
  assert.throws(()=>audit(a,s.replace(",0.3333333333333333,",",0.2,")),
    /original 1:1:1/);
  assert.throws(()=>audit(a,s.replace(",140.5,1,1",",,1,1")),
    /missing and observed/);
  assert.throws(()=>audit(a,s.replace(",120.3",",NaN")),
    /invalid\/missing amount/);
  assert.throws(()=>audit(a,s.replace(",1\n",",0\n")),
    /source currency conversion/);
  assert.throws(()=>audit(a,s.replace(",140.5,1,1",",140.5,1,1,private-company-name")),
    /malformed canonical CSV row/);
  const allPresent=s.split("\n").map(line=>line.includes(",,0,1")?
    line.replace(",,0,1",",140.5,1,1"):line).join("\n");
  const ready=audit(a,allPresent);
  assert.equal(ready.status,"SOURCE_DATA_COUNTS_COMPLETE_REQUIRES_SOURCE_REVIEW");
  assert.equal(ready.causalClaim.signalSoftwareRandomized,false);
  console.log("SELF_TEST_PASS: strict 1500-firm randomized three-arm source, documented costs, 1/3 propensity, nonresponse, source custody/FX/license flags, privacy, and FALSE software attribution");
  console.log("SYNTHETIC FIXTURE ONLY; NO REAL WORLD NET PROFIT OR SIGNAL SOFTWARE IMPROVEMENT");
}
async function main(){
  const argv=process.argv.slice(2);
  if(argv.includes("--self-test"))return selfTest();
  const get=x=>{const i=argv.indexOf(x);assert(i>=0&&argv[i+1],
    "missing CLI argument "+x);return argv[i+1];};
  const s=await readFile(get("--data"),"utf8");
  const att=JSON.parse(await readFile(get("--attestation"),"utf8"));
  const result=audit(att,s);
  await mkdir("artifacts/validation",{recursive:true});
  await writeFile(OUT,JSON.stringify(result,null,2)+"\n","utf8");
  console.log(JSON.stringify({studyId:result.studyId,
    sampled:result.randomizedCohort,armCounts:result.armCounts,
    dataStatus:result.status,
    signalSoftwareProfitEffectProven:false,
    independentSourceAuthenticationPerformed:false},null,2));
}
await main();
