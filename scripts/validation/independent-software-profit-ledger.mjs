/**
 * OFFLINE, independent-source, prospective Signal SOFTWARE exposure + net-profit
 * ledger materializer. It NEVER assigns, enrolls, deploys, contacts, spends,
 * sends advice, or treats self-asserted records as authenticated external facts.
 *
 * Produces PRIVATE finalized CSV compatible with prospective-policy-trial-audit.mjs.
 *
 * Required: --config --manifest --exposures --finances --attestation
 *           --trusted-pubkey --finalized --summary
 * Both output paths must be absolute and OUTSIDE the git checkout.
 *
 * node scripts/validation/independent-software-profit-ledger.mjs --self-test
 */
import assert from "node:assert/strict";
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { isAbsolute, resolve, sep, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MANIFEST=["unit_hash","registered_trial_id","assigned_arm","assigned_at",
  "decision_at","baseline_action","signal_action","baseline_model_version",
  "signal_model_version","decision_input_sha256"];
const EXPOSURE=["unit_hash","registered_trial_id","consent_at","eligible_at",
  "delivery_status","delivered_at","delivered_arm","delivered_action",
  "effective_action","action_at","human_approved_at","exposure_log_sha256"];
const FINANCE=["unit_hash","registered_trial_id","outcome_at","statement_at",
  "currency","receipt_cents","refund_cents","payment_fees_cents",
  "fulfillment_cents","sales_minutes","sales_hourly_loaded_cents",
  "delivery_minutes","delivery_hourly_loaded_cents","review_minutes",
  "review_hourly_loaded_cents","compute_cents","other_software_cents",
  "delay_cents","remediation_cents","harm_event","period_complete",
  "receipts_reconciled","costs_reconciled","zero_receipts_verified",
  "finance_export_sha256"];
const ATTEST=["trial_id","signed_at","config_sha256","manifest_sha256",
  "exposures_sha256","finances_sha256","signature_base64"];
const CONFIG=["trial_id","registered_at","locked_git_commit","allocation_signal",
  "minimum_units_per_arm","minimum_policy_disagreement_rate",
  "minimum_policy_adherence","minimum_point_net_gain_usd",
  "minimum_lower_ci_net_gain_usd","max_harm_rate_increase",
  "bootstrap_repetitions","bootstrap_seed","expected_observation_days",
  "model_version_signal","model_version_baseline","utility_definition",
  "allocation_unit_definition","external_approval_ref"];
const OUTPUT=["unit_hash","assigned_arm","registered_trial_id","assigned_at",
  "decision_at","outcome_at","baseline_action","signal_action","effective_action",
  "eligible","complete","policy_adherent","harm_event","gross_benefit_usd",
  "action_cost_usd","review_cost_usd","delay_cost_usd","harm_cost_usd"];
const HASH=/^[0-9a-f]{64}$/i;
const sha=b=>createHash("sha256").update(b).digest("hex");
const bounded=(x,limit,label)=>{
  assert(typeof x==="string"&&Buffer.byteLength(x,"utf8")<=limit,
    "oversized or invalid "+label);
  return x;
};
function exact(obj,fields,label){
  assert(obj&&typeof obj==="object"&&!Array.isArray(obj),"invalid "+label);
  assert.deepEqual(Object.keys(obj).sort(),[...fields].sort(),
    "missing or unexpected "+label+" fields (source PII prohibited)");
}
function iso(v,label){
  assert(typeof v==="string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v),
    "invalid UTC "+label);
  const n=Date.parse(v);
  assert(Number.isFinite(n)&&n<=Date.now()+60000,
    "future or invalid "+label);
  return n;
}
function digest(v,label){assert(typeof v==="string"&&HASH.test(v),"invalid "+label);return v;}
function token(s,label){
  assert(typeof s==="string"&&/^[a-zA-Z0-9._:-]{2,128}$/.test(s),
    "invalid "+label);
  return s;
}
function nonnegativeInteger(x,label,max=1e13){
  assert(typeof x==="number"&&Number.isSafeInteger(x)&&x>=0&&x<=max,
    "missing/negative/noninteger "+label);
  return x;
}
function csvRows(content){
  // Exact controlled 10-field manifest from existing prospective cohort tool.
  // External manifest must be original and independently timestamped.
  const lines=bounded(content,20_000_000,"manifest").trim().split(/\r?\n/);
  assert(lines[0]===MANIFEST.join(","),"incorrect pre-outcome manifest columns");
  assert(lines.length>1&&lines.length<=200001,"invalid manifest cohort size");
  return lines.slice(1).map(line=>{
    assert(line.length<=2048&&!/["\r\n]/.test(line),"unexpected CSV escape or oversize");
    const fields=line.split(",");
    assert(fields.length===MANIFEST.length,"invalid assignment row width");
    return Object.fromEntries(MANIFEST.map((key,i)=>[key,fields[i]]));
  });
}
function jsonl(content,fields,label){
  const data=bounded(content,30_000_000,label).trim().split(/\r?\n/);
  assert(data.length>=1&&data.length<=200000,"invalid "+label+" row count");
  return data.map((raw,i)=>{
    assert(raw.length<=8192,"oversized "+label+" record line "+(i+1));
    let value;
    try{value=JSON.parse(raw);}catch{throw Error("bad "+label+" JSONL line "+(i+1));}
    exact(value,fields,label+" record");
    return value;
  });
}
function attestPayload(a){
  return [
    "signal-independent-software-trial-custody-v1",a.trial_id,
    a.signed_at,a.config_sha256,a.manifest_sha256,
    a.exposures_sha256,a.finances_sha256,""
  ].join("\n");
}
function studyConfig(cfg){
  exact(cfg,CONFIG,"preregistered study");
  token(cfg.trial_id,"trial ID");
  iso(cfg.registered_at,"registered_at");
  assert(/^[0-9a-f]{40}$/i.test(cfg.locked_git_commit),
    "full frozen Signal source commit required");
  assert(cfg.model_version_baseline!==cfg.model_version_signal,
    "baseline and Signal model versions cannot be identical");
  for(const key of ["model_version_baseline","model_version_signal","external_approval_ref"])
    token(cfg[key],key);
  // A claimed external approval reference is NOT independent evidence of approval.
  assert(typeof cfg.utility_definition==="string"&&
    /^verified_net_usd_per_/.test(cfg.utility_definition),
    "predeclared verified-net-USD utility is mandatory");
  assert(typeof cfg.allocation_unit_definition==="string"&&
    cfg.allocation_unit_definition.length>=8,
    "declare genuinely independent randomization unit");
  assert(cfg.minimum_units_per_arm>=30&&Number.isSafeInteger(cfg.minimum_units_per_arm),
    "minimum units per arm must be >=30");
  assert(Number.isInteger(cfg.expected_observation_days)&&
    cfg.expected_observation_days>=1&&cfg.expected_observation_days<=365,
    "mature predeclared economic period 1..365 days required");
  for(const k of ["allocation_signal","minimum_policy_disagreement_rate",
    "minimum_policy_adherence","max_harm_rate_increase"]){
    assert(typeof cfg[k]==="number"&&Number.isFinite(cfg[k])&&
      cfg[k]>=0&&cfg[k]<=1,"invalid preregistered "+k);
  }
  assert(cfg.allocation_signal>0&&cfg.allocation_signal<1);
  assert(cfg.minimum_policy_disagreement_rate>0);
  for(const k of ["minimum_point_net_gain_usd","minimum_lower_ci_net_gain_usd"]){
    assert(typeof cfg[k]==="number"&&Number.isFinite(cfg[k])&&cfg[k]>0,
      "minimum positive economic gain required: "+k);
  }
  assert(cfg.minimum_point_net_gain_usd>=cfg.minimum_lower_ci_net_gain_usd);
  assert(Number.isInteger(cfg.bootstrap_repetitions)&&
    cfg.bootstrap_repetitions>=2000&&cfg.bootstrap_repetitions<=10000);
  assert(Number.isSafeInteger(cfg.bootstrap_seed)&&cfg.bootstrap_seed>=0);
}
function verifyAttestation(inputs,privateConfig,pubkeyPem){
  const att=JSON.parse(inputs.attestation);
  exact(att,ATTEST,"independent finance-custodian attestation");
  assert(att.trial_id===privateConfig.trial_id,"custodian trial ID mismatch");
  const at=iso(att.signed_at,"custodian signature time");
  for(const [name,key] of Object.entries({
    config_sha256:"config",manifest_sha256:"manifest",
    exposures_sha256:"exposures",finances_sha256:"finances"
  })){
    digest(att[name],name);
    assert(att[name].toLowerCase()===sha(inputs[key]),"custodian source hash mismatch: "+key);
  }
  assert(typeof att.signature_base64==="string"&&
    /^[a-zA-Z0-9+/]+={0,2}$/.test(att.signature_base64),
    "invalid custodian signature encoding");
  const key=createPublicKey(pubkeyPem);
  assert(key.asymmetricKeyType==="ed25519","independent Ed25519 public key required");
  const valid=verify(null,Buffer.from(attestPayload(att)),key,
    Buffer.from(att.signature_base64,"base64"));
  assert(valid,"independent custodian cryptographic signature mismatch");
  return {signedAt:at,attestorPublicKeySHA256:sha(key.export({type:"spki",format:"der"})),
    attestationSHA256:sha(inputs.attestation)};
}
function process(inputs,pubkeyPem){
  const cfg=JSON.parse(inputs.config);
  studyConfig(cfg);
  const custody=verifyAttestation(inputs,cfg,pubkeyPem);
  const manifest=csvRows(inputs.manifest);
  const planned=new Map();
  for(const m of manifest){
    digest(m.unit_hash,"assigned unit hash");
    digest(m.decision_input_sha256,"predecision input digest");
    assert(!planned.has(m.unit_hash),"duplicate randomized company/account unit");
    token(m.registered_trial_id,"manifest trial id");
    assert(m.registered_trial_id===cfg.trial_id,"unregistered trial assignment");
    assert(["baseline","signal"].includes(m.assigned_arm),"invalid randomized software arm");
    assert(m.baseline_model_version===cfg.model_version_baseline&&
      m.signal_model_version===cfg.model_version_signal,
      "policy version drift after randomization");
    token(m.baseline_action,"baseline planned action");
    token(m.signal_action,"Signal planned action");
    const reg=iso(cfg.registered_at,"registration time");
    const assigned=iso(m.assigned_at,"assigned_at");
    const decided=iso(m.decision_at,"decision_at");
    assert(reg<decided && decided<assigned,
      "both policies must be frozen before real software assignment");
    planned.set(m.unit_hash,{...m,assigned,decided,plannedAction:
      m.assigned_arm==="signal"?m.signal_action:m.baseline_action});
  }
  assert(planned.size>=2*cfg.minimum_units_per_arm,
    "cohort too small for preregistered minimum per arm");
  const exposures=jsonl(inputs.exposures,EXPOSURE,"software-exposure");
  const finances=jsonl(inputs.finances,FINANCE,"financial-outcome");
  assert(exposures.length===planned.size&&finances.length===planned.size,
    "intention-to-treat denominator mismatch; missing exposure or financial outcome");
  const exposed=new Map(),counter={shownSignal:0,shownBaseline:0,notShown:0,
    nonadherent:0,documentedHumanActions:0};
  for(const e of exposures){
    digest(e.unit_hash,"exposure unit hash");
    digest(e.exposure_log_sha256,"exposure source event digest");
    const m=planned.get(e.unit_hash);
    assert(m&&!exposed.has(e.unit_hash),"unknown or duplicate exposure record");
    assert(e.registered_trial_id===cfg.trial_id,"exposure trial id mismatch");
    assert(iso(e.consent_at,"consent_at")<m.assigned,
      "post-assignment consent cannot authorize randomization");
    assert(iso(e.eligible_at,"eligible_at")<m.assigned,
      "post-assignment eligibility screening invalid");
    assert(["shown","not_shown"].includes(e.delivery_status),
      "software exposure status invalid");
    token(e.effective_action,"effective_action");
    const shown=e.delivery_status==="shown";
    if(shown){
      assert(e.delivered_arm===m.assigned_arm &&
        e.delivered_action===m.plannedAction,
        "wrong-arm or unfrozen advice shown: contamination");
      const delivered=iso(e.delivered_at,"advice-delivered timestamp");
      assert(delivered>=m.assigned,"advice delivered before randomization");
      counter[m.assigned_arm==="signal"?"shownSignal":"shownBaseline"]++;
    }else{
      assert(e.delivered_at===null && e.delivered_arm===null &&
        e.delivered_action===null,
        "not-shown row must not claim software exposure");
      counter.notShown++;
    }
    if(e.effective_action!=="wait"){
      const approved=iso(e.human_approved_at,"human approval");
      const actionAt=iso(e.action_at,"actual action");
      assert(approved>=m.assigned && actionAt>=approved,
        "actual action lacks valid after-assignment human approval");
      if(shown)assert(actionAt>=iso(e.delivered_at,"delivered_at"),
        "action preceded advice exposure");
      counter.documentedHumanActions++;
    }else {
      assert(e.action_at===null&&e.human_approved_at===null,
        "wait cannot be recorded as a completed action");
    }
    const adherent=shown&&e.effective_action===m.plannedAction;
    if(!adherent)counter.nonadherent++;
    exposed.set(e.unit_hash,{event:e,adherent});
  }
  const financed=new Map();let lastStatement=0;
  const aggregate={assigned:{baseline:0,signal:0},harmEvents:0,
    totalReceiptsCents:0,totalCostsCents:0,
    evidenceNotAuthenticatedExternally:false};
  for(const f of finances){
    digest(f.unit_hash,"finance unit hash");
    digest(f.finance_export_sha256,"finance source digest");
    const m=planned.get(f.unit_hash);
    assert(m&&!financed.has(f.unit_hash),"unknown or duplicate financial record");
    assert(f.registered_trial_id===cfg.trial_id,"financial study ID mismatch");
    assert(f.currency==="USD","unreviewed currency or FX conversion");
    assert(f.period_complete===true&&f.receipts_reconciled===true&&
      f.costs_reconciled===true,
      "cash, expenses and full observation window must be independently reconciled");
    const observed=iso(f.outcome_at,"outcome_at");
    const statement=iso(f.statement_at,"accountant_statement_at");
    assert(observed>=m.assigned+cfg.expected_observation_days*86400000,
      "financial outcome period not matured");
    assert(statement>=observed,
      "financial statement cannot predate observed period end");
    lastStatement=Math.max(lastStatement,statement);
    const amt={};
    for(const field of FINANCE.filter(k=>k.endsWith("_cents")||
      k.endsWith("_minutes"))){
      amt[field]=nonnegativeInteger(f[field],field);
    }
    assert(f.zero_receipts_verified===true || f.zero_receipts_verified===false,
      "explicit verified-zero receipt certification required");
    assert((amt.receipt_cents===0)===f.zero_receipts_verified,
      "missing revenue must not be silently interpreted as zero");
    assert(f.harm_event===0||f.harm_event===1,"missing or invalid harm adjudication");
    const labor=(minutes,rate)=>Math.round(minutes*rate/60);
    const sales=labor(amt.sales_minutes,amt.sales_hourly_loaded_cents);
    const delivery=labor(amt.delivery_minutes,amt.delivery_hourly_loaded_cents);
    const review=labor(amt.review_minutes,amt.review_hourly_loaded_cents);
    const action=amt.refund_cents+amt.payment_fees_cents+
      amt.fulfillment_cents+sales+delivery+
      amt.compute_cents+amt.other_software_cents;
    const delay=amt.delay_cents, harm=amt.remediation_cents;
    const costs=action+review+delay+harm;
    assert(Number.isSafeInteger(costs)&&Number.isSafeInteger(action),
      "financial cost arithmetic overflow");
    const e=exposed.get(f.unit_hash);
    assert(e,"finance row has no genuine exposure ledger");
    const row=[m.unit_hash,m.assigned_arm,cfg.trial_id,m.assigned_at,m.decision_at,
      f.outcome_at,m.baseline_action,m.signal_action,e.event.effective_action,
      1,1,e.adherent?1:0,f.harm_event,
      (amt.receipt_cents/100).toFixed(2),(action/100).toFixed(2),
      (review/100).toFixed(2),(delay/100).toFixed(2),(harm/100).toFixed(2)];
    assert(row.every(x=>!String(x).includes(",")),"unsafe CSV output");
    financed.set(f.unit_hash,row);
    aggregate.assigned[m.assigned_arm]++;
    aggregate.harmEvents+=f.harm_event;
    aggregate.totalReceiptsCents+=amt.receipt_cents;
    aggregate.totalCostsCents+=costs;
  }
  assert(custody.signedAt>=lastStatement,
    "independent custodian signature precedes finalized financial statement");
  const output=[OUTPUT.join(","),...manifest.map(m=>financed.get(m.unit_hash).join(","))].join("\n")+"\n";
  const n=planned.size,signal=aggregate.assigned.signal,baseline=aggregate.assigned.baseline;
  const distinctDisagreements=manifest.filter(m=>m.baseline_action!==m.signal_action).length;
  const summary={
    classification:"SIGNED_OFFLINE_TRIAL_LEDGER_CONSISTENCY_NOT_CAUSAL_CERTIFICATION",
    trialId:cfg.trial_id,
    randomizedUnits:n,assignedArms:{signal,baseline},
    sourceHashes:{
      preregisteredConfig:sha(inputs.config),preOutcomeManifest:sha(inputs.manifest),
      softwareExposure:sha(inputs.exposures),financialOutcome:sha(inputs.finances),
      aggregateFinalizedCSV:sha(output),...custody
    },
    accounting:{
      currency:"USD",sumReceivedUSD:aggregate.totalReceiptsCents/100,
      sumAllCostUSD:aggregate.totalCostsCents/100,
      sumNetUSD:(aggregate.totalReceiptsCents-aggregate.totalCostsCents)/100,
      costCategories:["refunds","payment_fees","fulfillment","sales_labor",
        "delivery_labor","review_labor","compute","other_software",
        "delay","remediation"],
      allUnitsHaveRequiredCostFields:true,
      actualBankAndPayrollReconciliationIndependentlyVerifiedByCLI:false
    },
    exposure:{
      ...counter,actualPolicyDisagreements:distinctDisagreements,
      observedSoftwareExposures:counter.shownSignal+counter.shownBaseline,
      externalExposureSourceAndConsentAuthenticityIndependentlyVerifiedByCLI:false,
      originalManifestIndependentlyTimestampedByCLI:false,
      externalTrustedKeyIdentityVerifiedByCLI:false
    },
    testReadiness:{
      atLeastMinimumUnitsPerArm:signal>=cfg.minimum_units_per_arm&&
        baseline>=cfg.minimum_units_per_arm,
      predeclaredDisagreementRateMet:distinctDisagreements/n>=
        cfg.minimum_policy_disagreement_rate,
      observedAdherenceMet:1-counter.nonadherent/n>=cfg.minimum_policy_adherence,
      fullITTDenominator:true,
      sourceSignatureCryptographicallyValid:true,
      readyForIndependentOutcomeAuditor:true,
      causalSoftwareProfitClaimApproved:false
    },
    reminders:[
      "Cryptographic source signing proves integrity under the supplied public key, not the real-world independence or legitimacy of its holder.",
      "External immutable timestamp for pre-outcome assignment and source lineage is still mandatory.",
      "Only the randomized exposure of actual software advice and independent cash/source ledger makes a genuine software trial possible.",
      "This tool does not run a statistical test or prove causal profitability. Run prospective-policy-trial-audit.mjs and independent economic/safety review on the PRIVATE finalized file."
    ]
  };
  return {csv:output,summary};
}
const H=s=>sha(s),trial="fictional_independent_2024",isoTime=s=>s;
function fixture(n=80){
  const cfg={
    trial_id:trial,registered_at:"2024-01-01T00:00:00Z",
    locked_git_commit:"0123456789abcdef0123456789abcdef01234567",
    allocation_signal:.5,minimum_units_per_arm:30,
    minimum_policy_disagreement_rate:.1,minimum_policy_adherence:.8,
    minimum_point_net_gain_usd:1,minimum_lower_ci_net_gain_usd:.1,
    max_harm_rate_increase:.1,bootstrap_repetitions:2000,bootstrap_seed:77,
    expected_observation_days:14,model_version_signal:"signal-v1",
    model_version_baseline:"conventional-v1",
    utility_definition:"verified_net_usd_per_independent_partner_account",
    allocation_unit_definition:"one independent consenting partner account",
    external_approval_ref:"fictional-approval-2024"
  };
  const manifest=[MANIFEST.join(",")],exposure=[],finances=[];
  for(let i=0;i<n;i++){
    const id=H("synthetic-company-"+i),arm=i%2===0?"signal":"baseline";
    const baselineAction="manual",signalAction=i%3===0?"wait":"manual";
    manifest.push([id,trial,arm,"2024-01-04T00:00:00Z",
      "2024-01-03T23:58:00Z",baselineAction,signalAction,
      cfg.model_version_baseline,cfg.model_version_signal,H("input-"+i)].join(","));
    const planned=arm==="signal"?signalAction:baselineAction;
    exposure.push({
      unit_hash:id,registered_trial_id:trial,consent_at:"2024-01-02T00:00:00Z",
      eligible_at:"2024-01-02T02:00:00Z",delivery_status:"shown",
      delivered_at:"2024-01-04T00:01:00Z",delivered_arm:arm,
      delivered_action:planned,effective_action:planned,
      action_at:planned==="wait"?null:"2024-01-04T00:04:00Z",
      human_approved_at:planned==="wait"?null:"2024-01-04T00:03:00Z",
      exposure_log_sha256:H("synthetic-exposure-"+i)
    });
    finances.push({
      unit_hash:id,registered_trial_id:trial,outcome_at:"2024-01-20T00:00:00Z",
      statement_at:"2024-01-21T00:00:00Z",currency:"USD",
      receipt_cents:arm==="signal"?12000:10000,
      refund_cents:300,payment_fees_cents:100,fulfillment_cents:400,
      sales_minutes:30,sales_hourly_loaded_cents:3000,
      delivery_minutes:20,delivery_hourly_loaded_cents:4500,
      review_minutes:10,review_hourly_loaded_cents:4000,
      compute_cents:arm==="signal"?80:30,other_software_cents:50,
      delay_cents:20,remediation_cents:0,harm_event:0,
      period_complete:true,receipts_reconciled:true,costs_reconciled:true,
      zero_receipts_verified:false,finance_export_sha256:H("synthetic-finance-"+i)
    });
  }
  const inputs={config:JSON.stringify(cfg),manifest:manifest.join("\n")+"\n",
    exposures:exposure.map(JSON.stringify).join("\n")+"\n",
    finances:finances.map(JSON.stringify).join("\n")+"\n"};
  const keypair=generateKeyPairSync("ed25519");
  const attest={trial_id:trial,signed_at:"2024-01-22T00:00:00Z",
    config_sha256:sha(inputs.config),manifest_sha256:sha(inputs.manifest),
    exposures_sha256:sha(inputs.exposures),finances_sha256:sha(inputs.finances),
    signature_base64:""};
  attest.signature_base64=sign(null,Buffer.from(attestPayload(attest)),
    keypair.privateKey).toString("base64");
  inputs.attestation=JSON.stringify(attest);
  const pub=keypair.publicKey.export({type:"spki",format:"pem"});
  return {inputs,pub,exposure,finances,cfg};
}
async function selfTest(){
  const f=fixture();
  const result=process(f.inputs,f.pub);
  assert.equal(result.summary.randomizedUnits,80);
  assert.deepEqual(result.summary.assignedArms,{signal:40,baseline:40});
  assert.equal(result.summary.exposure.nonadherent,0);
  assert.equal(result.summary.testReadiness.fullITTDenominator,true);
  assert.equal(result.summary.testReadiness.causalSoftwareProfitClaimApproved,false);
  assert(result.csv.startsWith(OUTPUT.join(",")+"\n"));
  assert.equal(result.csv.trim().split("\n").length,81);
  assert(!result.csv.includes("synthetic-company"),"source identities must not leak");
  assert.deepEqual(process(f.inputs,f.pub),result);
  const change=(key,fn)=>{
    const copy={...f.inputs},rows=copy[key].trim().split("\n").map(JSON.parse);
    rows[0]=fn({...rows[0]});copy[key]=rows.map(JSON.stringify).join("\n")+"\n";
    return copy;
  };
  assert.throws(()=>process(change("finances",r=>({...r,receipt_cents:9999})),f.pub),
    /custodian source hash mismatch/);
  assert.throws(()=>process({...f.inputs,attestation:f.inputs.attestation.replace(
    /"signature_base64":"[^"]+"/,'"signature_base64":"AAAA"')},f.pub),
    /signature mismatch/);
  // Re-sign only to exercise substantive data-contract failures, not bypass them.
  const resigned=(key,fn)=>{
    const copy=change(key,fn);
    const att={...JSON.parse(f.inputs.attestation),[key+"_sha256"]:sha(copy[key])};
    const kp=generateKeyPairSync("ed25519");
    att.signature_base64=sign(null,Buffer.from(attestPayload(att)),kp.privateKey)
      .toString("base64");
    copy.attestation=JSON.stringify(att);
    return {copy,pub:kp.publicKey.export({type:"spki",format:"pem"})};
  };
  let x=resigned("finances",r=>({...r,currency:"BRL"}));
  assert.throws(()=>process(x.copy,x.pub),/unreviewed currency/);
  x=resigned("finances",r=>({...r,refund_cents:null}));
  assert.throws(()=>process(x.copy,x.pub),/noninteger refund_cents/);
  x=resigned("finances",r=>({...r,period_complete:false}));
  assert.throws(()=>process(x.copy,x.pub),/must be independently reconciled/);
  x=resigned("finances",r=>({...r,statement_at:"2024-01-10T00:00:00Z"}));
  assert.throws(()=>process(x.copy,x.pub),/statement cannot predate/);
  x=resigned("exposures",r=>({...r,delivered_arm:"baseline"}));
  assert.throws(()=>process(x.copy,x.pub),/wrong-arm/);
  x=resigned("exposures",r=>({...r,human_approved_at:null}));
  assert.throws(()=>process(x.copy,x.pub),/invalid UTC human approval/);
  x=resigned("exposures",r=>({...r,consent_at:"2024-01-05T00:00:00Z"}));
  assert.throws(()=>process(x.copy,x.pub),/post-assignment consent/);
  x=resigned("exposures",r=>({...r,effective_action:"wait"}));
  assert.throws(()=>process(x.copy,x.pub),/wait cannot be recorded as a completed action/);
  // The finalized format must ACTUALLY feed the existing prospective
  // intention-to-treat analysis, rather than only matching declared headers.
  // All files remain temporary and contain SYNTHETIC, not participant, data.
  const tmp=await mkdtemp(join(tmpdir(),"signal-independent-itt-fixture-"));
  try {
    const c=join(tmp,"frozen.json"),m=join(tmp,"manifest.csv"),
      d=join(tmp,"finalized.csv");
    await Promise.all([
      writeFile(c,f.inputs.config),writeFile(m,f.inputs.manifest),
      writeFile(d,result.csv)
    ]);
    const analyzer=fileURLToPath(new URL(
      "./prospective-policy-trial-audit.mjs",import.meta.url));
    const run=spawnSync(process.execPath,[
      analyzer,"--config",c,"--manifest",m,"--data",d
    ],{cwd:tmp,encoding:"utf8",timeout:30000,maxBuffer:1024*1024});
    assert.equal(run.status,0,"downstream ITT analyzer failed: "+
      (run.stderr??"")+" "+(run.stdout??""));
    const audit=JSON.parse(await readFile(join(tmp,
      "artifacts/validation/prospective-policy-trial-report.json"),"utf8"));
    assert.equal(audit.randomizedUnitCount,80,
      "downstream ITT unexpectedly excluded synthetic participants");
    assert.equal(audit.evidenceIntegrity.externalAuditVerified,false,
      "automated analysis cannot self-certify external custody");
  } finally { await rm(tmp,{recursive:true,force:true}); }
  console.log("SELF_TEST_PASS: signed independent exposure/finance input custody, ITT denominator, arm masking, prior consent, human approval, matured ledger, cents accounting, complete costs, no unauthorized outcome claim");
  console.log("SYNTHETIC DATA ONLY. NO ACTUAL SOFTWARE RANDOMIZATION OR FINANCIAL OUTCOME OBSERVED.");
}
function outsideRepo(path){
  assert(isAbsolute(path),"private trial outputs require absolute paths");
  const p=resolve(path),root=resolve(process.cwd())+sep;
  assert(!p.startsWith(root),"private outputs cannot be inside repository");
  return p;
}
function arg(args,name){
  const i=args.indexOf(name);
  assert(i!==-1&&args[i+1],"missing CLI option "+name);
  return args[i+1];
}
async function main(){
  const args=process.argv.slice(2);
  if(args.includes("--self-test"))return await selfTest();
  const options=["config","manifest","exposures","finances","attestation",
    "trusted-pubkey"];
  const paths=Object.fromEntries(options.map(x=>[x,arg(args,"--"+x)]));
  const input={};
  for(const name of options.slice(0,-1)){
    input[name]=await readFile(paths[name],"utf8");
  }
  const pub=await readFile(paths["trusted-pubkey"],"utf8");
  const {csv,summary}=process(input,pub);
  const csvFile=outsideRepo(arg(args,"--finalized"));
  const reportFile=outsideRepo(arg(args,"--summary"));
  assert(csvFile!==reportFile,"cannot overwrite private trial source with summary");
  await writeFile(csvFile,csv,{encoding:"utf8",flag:"wx",mode:0o600});
  await writeFile(reportFile,JSON.stringify(summary,null,2)+"\n",
    {encoding:"utf8",flag:"wx",mode:0o600});
  console.log(JSON.stringify({
    classification:summary.classification,
    assigned:summary.randomizedUnits,
    exposed:summary.exposure.observedSoftwareExposures,
    actualProfitClaimApproved:false,
    next:"Run prospective-policy-trial-audit.mjs on private output then obtain an independent review."
  }));
}
await main();
