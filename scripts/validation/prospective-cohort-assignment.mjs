/**
 * Secure, OFFLINE, non-deploying trial assignment preparation.
 *
 * This tool NEVER enrolls a customer, changes a product experience or sends
 * communications. It generates a local candidate manifest compatible with
 * prospective-policy-trial-audit.mjs ONLY after an externally approved,
 * immutable pre-outcome cohort is provided. It cannot verify its own source
 * provenance, genuine human consent, financial power estimate or timestamp.
 *
 * Required outside of self-test:
 *  SIGNAL_TRIAL_ASSIGNMENT_KEY_HEX=<independent secret with >=256 bits>
 *  node scripts/validation/prospective-cohort-assignment.mjs \
 *   --config study.json --cohort predecision.csv --assigned-at YYYY-...Z \
 *   --manifest /absolute/path/outside/repo/manifest.csv \
 *   --report /absolute/path/outside/repo/manifest-summary.json
 */
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";

const MANIFEST = ["unit_hash","registered_trial_id","assigned_arm",
  "assigned_at","decision_at","baseline_action","signal_action",
  "baseline_model_version","signal_model_version","decision_input_sha256"];
const COHORT = ["unit_hash","decision_at","baseline_action","signal_action",
  "decision_input_sha256","evidence_sha256","native_action_allowed",
  "native_action_scale","eligible_preassigned","consent_attested",
  "hard_stops_preserved"];
const CONFIG = ["trial_id","registered_at","locked_git_commit",
  "allocation_signal","minimum_units_per_arm","minimum_policy_disagreement_rate",
  "minimum_policy_adherence","minimum_point_net_gain_usd",
  "minimum_lower_ci_net_gain_usd","max_harm_rate_increase",
  "bootstrap_repetitions","bootstrap_seed","expected_observation_days",
  "model_version_signal","model_version_baseline","utility_definition",
  "allocation_unit_definition","external_approval_ref"];
const sha=x=>createHash("sha256").update(x).digest("hex");
function exact(obj, keys, label) {
  assert(obj&&typeof obj==="object"&&!Array.isArray(obj),"invalid "+label);
  assert.deepEqual(Object.keys(obj).sort(),[...keys].sort(),
    label+" must contain exactly the expected keys");
}
function number(x,label,min=-Infinity,max=Infinity) {
  assert(typeof x==="number"&&Number.isFinite(x)&&x>=min&&x<=max,
    "invalid "+label);
  return x;
}
function utc(s,label) {
  assert(typeof s==="string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(s),
    "invalid UTC "+label);
  const n=Date.parse(s);
  assert(Number.isFinite(n)&&new Date(n).toISOString() ===
    new Date(Date.parse(s)).toISOString(),"unparseable UTC "+label);
  return n;
}
function hash(s,label) {
  assert(typeof s==="string"&&/^[0-9a-f]{64}$/i.test(s),
    label+" requires 64-hex pseudonymous digest");
}
function token(s,label) {
  assert(typeof s==="string"&&/^[a-zA-Z0-9._:-]{2,128}$/.test(s),
    "invalid "+label);
  return s;
}
function csvRows(s,expected,label) {
  // Strict nonquoted CSV is sufficient: every accepted cell is a bounded token,
  // digest, numeric flag or ISO date. Reject cells that contain CSV metacharacters.
  const lines=s.replace(/^\uFEFF/,"").trim().split(/\r?\n/);
  assert(lines.length>1&&lines.length<=200001,"empty or oversized "+label);
  assert.equal(lines[0],expected.join(","),"wrong "+label+" header");
  return lines.slice(1).map((line,i)=>{
    assert(!line.includes('"')&&!line.includes("\r")&&
      !line.includes("\n")&&line.length<=4096,"malformed CSV "+label);
    const cells=line.split(",");
    assert.equal(cells.length,expected.length,"wrong "+label+" columns line "+(i+2));
    return Object.fromEntries(expected.map((key,j)=>[key,cells[j]]));
  });
}
function configuration(c) {
  exact(c,CONFIG,"trial registration");
  token(c.trial_id,"trial ID");
  token(c.model_version_signal,"Signal model version");
  token(c.model_version_baseline,"baseline model version");
  assert(c.model_version_signal!==c.model_version_baseline,
    "both policies must be distinguishable");
  assert(/^[0-9a-f]{40}$/i.test(c.locked_git_commit),"frozen Git commit missing");
  assert(utc(c.registered_at,"registered_at")<=Date.now(),
    "trial must be registered before execution");
  number(c.allocation_signal,"allocation_signal",.1,.9);
  assert(Number.isInteger(c.minimum_units_per_arm)&&
    c.minimum_units_per_arm>=30&&c.minimum_units_per_arm<=100000,
    "minimum sample per arm must be >=30");
  number(c.minimum_policy_disagreement_rate,
    "minimum_policy_disagreement_rate",0.000001,1);
  number(c.minimum_policy_adherence,"minimum_policy_adherence",.000001,1);
  assert(number(c.minimum_point_net_gain_usd,"point gain")>0 &&
    number(c.minimum_lower_ci_net_gain_usd,"lower CI gain")>0 &&
    c.minimum_point_net_gain_usd>=c.minimum_lower_ci_net_gain_usd,
    "economic threshold must be materially positive");
  number(c.max_harm_rate_increase,"maximum harm rate increase",0,1);
  assert(Number.isInteger(c.bootstrap_repetitions)&&
    c.bootstrap_repetitions>=2000&&c.bootstrap_repetitions<=10000,
    "bootstrap repetition count incompatible with final audit");
  assert(Number.isSafeInteger(c.bootstrap_seed)&&c.bootstrap_seed>=0&&
    c.bootstrap_seed<=0xffffffff,"invalid deterministic bootstrap seed");
  assert(Number.isInteger(c.expected_observation_days)&&
    c.expected_observation_days>=1&&c.expected_observation_days<=3650,
    "observation window invalid");
  assert(c.utility_definition==="verified_net_usd_per_canonical_company_relationship",
    "this study must use verified net USD at the canonical relationship level");
  assert(c.allocation_unit_definition==="one_canonical_company_relationship",
    "randomization must be at the stable company relationship");
  assert(typeof c.external_approval_ref==="string" &&
    /^(?!synthetic|test|pending|placeholder)[a-zA-Z0-9._:/-]{8,200}$/i.test(c.external_approval_ref),
    "independent approval reference required, not a placeholder");
  return c;
}
function secret(value) {
  assert(typeof value==="string"&&/^[0-9a-f]{64,}$/i.test(value) &&
    value.length%2===0&&value.length<=128,
    "secret must be 32..64 bytes of independently generated hexadecimal entropy");
  return Buffer.from(value,"hex");
}
function keyCommitment(key) {
  // The digest, not the key, can be independently notarized BEFORE receiving a
  // real cohort. Revealing it does not reveal a uniformly random 256-bit key.
  return sha(Buffer.concat([Buffer.from("signal-trial-key-commit-v1\\0"),key]));
}
function assignArm(key,trialId,unitHash,p) {
  const bytes=createHmac("sha256",key)
    .update("signal-software-trial-arm-v1\0"+trialId+"\0"+unitHash)
    .digest();
  return bytes.readUInt32BE(0)/4294967296<p?"signal":"baseline";
}
function build(c,source,key,assignedAt,now=Date.now()) {
  configuration(c);
  assert(utc(assignedAt,"assigned_at")>utc(c.registered_at,"registered_at"),
    "assignment must follow registration");
  assert(utc(assignedAt,"assigned_at")<=now+300000,
    "assignment time in future; cannot anchor pre-outcome assignment");
  assert(utc(assignedAt,"assigned_at")>=now-300000,
    "assignment clock must be live (not a backdated reconstruction)");
  assert(typeof source==="string"&&Buffer.byteLength(source)<32*1024*1024,
    "cohort exceeds 32MB bounded private source");
  const rows=csvRows(source,COHORT,"preassignment cohort");
  assert(rows.length>=2*c.minimum_units_per_arm,
    "insufficient eligible cohort for even minimum per-arm sample");
  const seen=new Set(),locked=[],counter={disagrees:0,denied:0,partial:0,full:0};
  for(const r of rows) {
    hash(r.unit_hash,"company relationship unit");
    hash(r.decision_input_sha256,"decision input digest");
    hash(r.evidence_sha256,"evidence digest");
    assert(!seen.has(r.unit_hash),"duplicate canonical company relationship");
    seen.add(r.unit_hash);
    const decisionAt=utc(r.decision_at,"decision_at");
    assert(decisionAt>=utc(c.registered_at,"registered_at") &&
      decisionAt<utc(assignedAt,"assigned_at"),
      "policy proposals must be made after registration but before assignment");
    token(r.baseline_action,"baseline action");
    token(r.signal_action,"native-effective Signal action");
    for(const flag of ["eligible_preassigned","consent_attested","hard_stops_preserved"]) {
      assert(r[flag]==="1",
        "all units must be eligible, consent-attested and preserve hard stops before randomization; do not post-hoc remove units");
    }
    assert(r.native_action_allowed==="0"||r.native_action_allowed==="1",
      "native permission flag invalid");
    const allowed=r.native_action_allowed==="1";
    const scale=Number(r.native_action_scale);
    assert(Number.isFinite(scale)&&scale>=0&&scale<=1,
      "native action scale invalid");
    if(!allowed){
      assert(scale===0&&r.signal_action==="wait",
        "native denial must remain wait with zero scale");
      counter.denied++;
    }else if(scale<1){
      assert(scale>0&&r.signal_action==="wait",
        "partial native scale cannot become a full domain action");
      counter.partial++;
    }else{
      counter.full++;
    }
    counter.disagrees+=Number(r.baseline_action!==r.signal_action);
    locked.push(r);
  }
  const disagreement=counter.disagrees/rows.length;
  assert(disagreement>=c.minimum_policy_disagreement_rate,
    "policy disagreement too small; shadow feasibility failed, do not enroll or retune");
  const manifestRows=[MANIFEST.join(",")];
  const armCounts={signal:0,baseline:0};
  for(const r of locked){
    const arm=assignArm(key,c.trial_id,r.unit_hash,c.allocation_signal);
    armCounts[arm]++;
    manifestRows.push([
      r.unit_hash,c.trial_id,arm,assignedAt,r.decision_at,
      r.baseline_action,r.signal_action,c.model_version_baseline,
      c.model_version_signal,r.decision_input_sha256
    ].join(","));
  }
  // A real random allocation can be unbalanced: never reroll a key to
  // manufacture a desired allocation. Mark statistical readiness honestly.
  const assignmentsCSV=manifestRows.join("\n")+"\n";
  const sufficientCounts=armCounts.signal>=c.minimum_units_per_arm &&
    armCounts.baseline>=c.minimum_units_per_arm;
  const n=rows.length,p=c.allocation_signal;
  const srmZ=(armCounts.signal-n*p)/Math.sqrt(n*p*(1-p));
  const report={
    classification:"LOCAL_CANDIDATE_MANIFEST_NOT_AUTHENTICATED_NOT_ENROLLED",
    trialId:c.trial_id,
    preoutcomeCohortSHA256:sha(source),
    manifestSHA256:sha(assignmentsCSV),
    trialRegistrationSHA256:sha(JSON.stringify(c)),
    sourceAudit:{unitCount:n,distinctCanonicalUnitHashClaims:seen.size,
      policyDisagreementCount:counter.disagrees,
      policyDisagreementFraction:disagreement,
      nativePermissionBreakdown:counter,
      allEligibilityAndConsentFlagsAsserted:true,
      originalConsentAndIdentityIndependentlyVerified:false,
      financialSDAndCostVarianceIndependentlyVerified:false},
    randomization:{method:"independent secret HMAC-SHA256 per frozen relationship unit",
      fixedAllocationSignal:p,armCounts,standardizedSampleRatioDeviation:srmZ,
      reRandomizedOrRebalanced:false,secretPublished:false,
      assignmentKeyCommitmentSHA256:keyCommitment(key),
      keyCustodyIndependentlyVerified:false},
    readiness:{
      minimumArmCountsSatisfied:sufficientCounts,
      sampleRatioWarning:Math.abs(srmZ)>3.29,
      actualOutcomeTrackingStarted:false,
      readyForEnrollment:false
    },
    mandatoryExternalGates:[
      "Independently notarize/anchor manifest SHA256 and registration before any outcome or exposure",
      "Independently verify actual source systems, consent, immutable full denominator, pre-outcome proposal versions and risk gates",
      "Obtain measured baseline net USD variance and power analysis at the canonical relationship unit",
      "Obtain safety/privacy and ethical approval, zero leakage across repeated relationships, and implementation review",
      "Only an independent approved application can expose arm-specific advice; this offline file never enrolls or dispatches",
      "Reconcile outcome benefit and all actual costs over the frozen observation window, including abstentions, and independent audit"
    ]
  };
  return {manifest:assignmentsCSV,report};
}
function makeTest(){
  const c={trial_id:"synthetic_trial_test_v1",registered_at:"2024-01-01T00:00:00Z",
    locked_git_commit:"0123456789abcdef0123456789abcdef01234567",
    allocation_signal:.5,minimum_units_per_arm:30,
    minimum_policy_disagreement_rate:.1,minimum_policy_adherence:.95,
    minimum_point_net_gain_usd:10,minimum_lower_ci_net_gain_usd:5,
    max_harm_rate_increase:.05,bootstrap_repetitions:2000,
    bootstrap_seed:1234,expected_observation_days:90,
    model_version_signal:"signal-research-v1",
    model_version_baseline:"baseline-research-v1",
    utility_definition:"verified_net_usd_per_canonical_company_relationship",
    allocation_unit_definition:"one_canonical_company_relationship",
    external_approval_ref:"research-reference-not-actual-approval"};
  const lines=[COHORT.join(",")];
  for(let i=0;i<160;i++) {
    const hashUnit=sha("fictional-company-"+i);
    lines.push([hashUnit,"2024-01-02T11:59:00Z","monitor",
      i%3===0?"wait":"monitor",sha("input-"+i),sha("evidence-"+i),
      i%3===0?"0":"1",i%3===0?"0":"1","1","1","1"].join(","));
  }
  return {c,source:lines.join("\n")+"\n",key:secret("ab".repeat(32)),
    assignedAt:"2024-01-02T12:00:00Z",now:Date.parse("2024-01-02T12:00:10Z")};
}
function selfTest(){
  const f=makeTest();
  const first=build(f.c,f.source,f.key,f.assignedAt,f.now);
  const again=build(f.c,f.source,f.key,f.assignedAt,f.now);
  assert.deepEqual(first,again,"deterministic replay of exactly one randomization");
  assert.equal(first.report.sourceAudit.unitCount,160);
  assert.equal(first.report.sourceAudit.policyDisagreementCount,54);
  assert.equal(first.report.readiness.actualOutcomeTrackingStarted,false);
  assert.equal(first.report.readiness.readyForEnrollment,false);
  assert.equal(first.report.randomization.assignmentKeyCommitmentSHA256,
    keyCommitment(f.key));
  assert.notEqual(first.report.randomization.assignmentKeyCommitmentSHA256,
    keyCommitment(secret("cd".repeat(32))));
  assert(!JSON.stringify(first.report).includes(f.key.toString("hex")),
    "must never expose randomization secret");
  const rows=csvRows(first.manifest,MANIFEST,"assignment manifest");
  assert.equal(rows.length,160);
  assert(rows.every(r=>r.registered_trial_id===f.c.trial_id));
  const other=build(f.c,f.source,secret("cd".repeat(32)),f.assignedAt,f.now);
  assert.notEqual(first.manifest,other.manifest,
    "independent secret ought to yield distinct allocation");
  assert.throws(()=>build(f.c,f.source.replace(",0,0,1,1,1",",1,0,1,1,1"),
    f.key,f.assignedAt,f.now),/partial native scale/);
  assert.throws(()=>build(f.c,f.source.replace(",0,0,1,1,1",",0,0,1,0,1"),
    f.key,f.assignedAt,f.now),/consent-attested/);
  assert.throws(()=>build(f.c,f.source,f.key,
    "2024-01-03T12:00:00Z",f.now),/assignment time in future/);
  assert.throws(()=>build(f.c,f.source,f.key,
    "2023-12-02T12:00:00Z",f.now),/assignment must follow registration/);
  assert.throws(()=>build(f.c,f.source.replace(/,wait,0,0,1,1,1/g,
    ",monitor,0,0,1,1,1"),f.key,f.assignedAt,f.now),/denial must remain wait/);
  assert.throws(()=>build({...f.c,minimum_policy_disagreement_rate:.5},
    f.source,f.key,f.assignedAt,f.now),/disagreement too small/);
  assert.throws(()=>build(f.c,f.source,f.key,f.assignedAt,
    Date.parse("2024-04-01T00:00:00Z")),/backdated reconstruction/);
  console.log("SELF_TEST_PASS: HMAC stable company assignment, compatible manifest, policy disagreement, consent/hard-stop flags, native zero-scale, timing and independent custody disclaimers");
  console.log("SYNTHETIC ONLY; NO REAL TRIAL ASSIGNMENTS OR CAUSAL PROFIT CLAIMS");
}
function flag(argv,name) {
  const i=argv.indexOf(name);
  assert(i>=0&&argv[i+1],"missing "+name);
  return argv[i+1];
}
function outsideRepo(path) {
  assert(isAbsolute(path),"output path must be absolute");
  const root=resolve(process.cwd())+sep, target=resolve(path);
  assert(!target.startsWith(root),"private cohort and manifest must remain outside repo checkout");
  return target;
}
async function main(){
  const argv=process.argv.slice(2);
  if(argv.includes("--self-test")) return selfTest();
  if(argv.includes("--key-commitment")){
    const key=secret(process.env.SIGNAL_TRIAL_ASSIGNMENT_KEY_HEX);
    console.log(JSON.stringify({assignmentKeyCommitmentSHA256:keyCommitment(key),
      independentExternalTimestampVerified:false,
      instructions:"Anchor this commitment externally BEFORE seeing the cohort or labels."}));
    return;
  }
  const key=secret(process.env.SIGNAL_TRIAL_ASSIGNMENT_KEY_HEX);
  const configSource=await readFile(flag(argv,"--config"),"utf8");
  const cohortSource=await readFile(flag(argv,"--cohort"),"utf8");
  const assignedAt=flag(argv,"--assigned-at");
  const manifestFile=outsideRepo(flag(argv,"--manifest"));
  const reportFile=outsideRepo(flag(argv,"--report"));
  assert(manifestFile!==reportFile,"report and manifest paths must differ");
  const {manifest,report}=build(JSON.parse(configSource),
    cohortSource,key,assignedAt);
  // No overwrites. The caller must externally anchor the manifest hash,
  // independently approve enrollment and keep originals in secure custody.
  await writeFile(manifestFile,manifest,{encoding:"utf8",flag:"wx",mode:0o600});
  await writeFile(reportFile,JSON.stringify(report,null,2)+"\n",
    {encoding:"utf8",flag:"wx",mode:0o600});
  console.log(JSON.stringify({trialId:report.trialId,sourceSHA256:report.preoutcomeCohortSHA256,
    manifestSHA256:report.manifestSHA256,assignmentKeyCommitmentSHA256:report.randomization.assignmentKeyCommitmentSHA256,armCounts:report.randomization.armCounts,
    policyDisagreementFraction:report.sourceAudit.policyDisagreementFraction,
    readyForEnrollment:false,independentlyAuthenticated:false},null,2));
}
await main();
