/**
 * RESEARCH-ONLY, NO ACTIONS, NO OUTCOMES:
 * actual Signal quantitative advice + actual unmodified native decision gate.
 * See docs/validation/economic-shadow-authorization.md.
 *
 * Never interpret a quantitative recommendation as authorization;
 * never promote a 0.45-scale permission to a full-size action.
 *
 * node scripts/validation/economic-shadow-authorization.mjs --self-test
 * node scripts/validation/economic-shadow-authorization.mjs --config config.json --data proposals.jsonl
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import signalDecision from "../../packages/decision/dist/index.js";

const { evaluateDecision,evaluateQuantitativeDecision }=signalDecision;
assert.equal(typeof evaluateDecision,"function");
assert.equal(typeof evaluateQuantitativeDecision,"function");

const MODULES=["discovery","judgment","purpose","need","trust","reflection",
  "recovery","memory","learning","calibration","identity","awareness","agency"];
const REPORT_PATH="artifacts/validation/economic-shadow-authorization.json";
const CURRENCY="USD net utility per independent opportunity";
const RECORD_FIELDS=["unit_hash","decision_at","evidence_cutoff_at",
  "evidence_sha256","native_policy_version","economic_model","native_gate_model"];
const NATIVE_FIELDS=["modules","prediction","wisdom","assessment"];
const MAX_SOURCE_BYTES=12*1024*1024,MAX_LINES=5000,MAX_LINE_BYTES=120000;
const h=x=>createHash("sha256").update(x).digest("hex");
function str(v,name){assert(typeof v==="string"&&v.trim()!=="","missing "+name);return v;}
function finite(v,name,min=-Infinity,max=Infinity){
  assert(typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max,"invalid "+name);
  return v;
}
function integer(v,name,min,max){
  finite(v,name,min,max);
  assert(Number.isSafeInteger(v),"integer required "+name);
  return v;
}
function exactKeys(obj,keys,what){
  assert(obj&&typeof obj==="object"&&!Array.isArray(obj),"invalid "+what);
  const actual=Object.keys(obj).sort(), expected=[...keys].sort();
  assert.deepEqual(actual,expected,what+" must use exact frozen fields");
}
function utc(v,label){
  assert(typeof v==="string"&&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v),
    "invalid UTC timestamp "+label);
  const ms=Date.parse(v);
  assert(Number.isFinite(ms)&&ms<=Date.now(),"future or invalid "+label);
  return ms;
}
function configGate(c){
  exactKeys(c,["candidate_id","frozen_signal_model_version",
    "baseline_model_version","frozen_native_gate_policy_version",
    "locked_commit_sha","wait_action_id","currency_unit",
    "minimum_shadow_units","minimum_effective_disagreement_fraction",
    "minimum_actual_evidence_sources","max_evidence_age_hours",
    "risk_tail_mass","risk_downside_penalty",
    "requires_independent_attestation","native_scale_for_full_action"],
    "config");
  for(const k of ["candidate_id","frozen_signal_model_version",
    "baseline_model_version","frozen_native_gate_policy_version"])str(c[k],k);
  assert(c.baseline_model_version!==c.frozen_signal_model_version,
    "policies must have distinct frozen identifiers");
  assert(/^[a-f0-9]{40}$/i.test(c.locked_commit_sha),
    "config locked_commit_sha must be full 40-hex commit");
  assert.equal(c.wait_action_id,"wait","wait must be a genuine named action");
  assert.equal(c.currency_unit,CURRENCY,"common actual net utility unit required");
  integer(c.minimum_shadow_units,"minimum_shadow_units",30,MAX_LINES);
  finite(c.minimum_effective_disagreement_fraction,
    "minimum_effective_disagreement_fraction",0,1);
  assert(c.minimum_effective_disagreement_fraction>0,
    "preflight must require actual different actions");
  integer(c.minimum_actual_evidence_sources,"minimum_actual_evidence_sources",1,12);
  finite(c.max_evidence_age_hours,"max_evidence_age_hours",0.001,8760);
  finite(c.risk_tail_mass,"risk_tail_mass",0.001,1);
  finite(c.risk_downside_penalty,"risk_downside_penalty",0.001,2);
  assert.equal(c.requires_independent_attestation,true,
    "the requirement for external attestation must not be disabled");
  assert.equal(c.native_scale_for_full_action,1,
    "partial Signal action scale must not be promoted to full");
  return c;
}
function sourceRecords(s){
  assert(Buffer.byteLength(s,"utf8")<=MAX_SOURCE_BYTES,"shadow source exceeds maximum size");
  const lines=s.trim().split(/\r?\n/).filter(line=>line.trim()!=="");
  assert(lines.length>0&&lines.length<=MAX_LINES,"unexpected pre-outcome unit count");
  return lines.map((line,i)=>{
    assert(Buffer.byteLength(line,"utf8")<=MAX_LINE_BYTES,"oversized shadow row");
    let row;
    try{row=JSON.parse(line)}catch{throw Error("invalid JSONL record at line "+(i+1))}
    exactKeys(row,RECORD_FIELDS,"shadow input record");
    return row;
  });
}
function validateEconomicModel(model,c){
  assert(model&&typeof model==="object","missing economic model");
  assert.equal(model.modelVersion,c.frozen_signal_model_version,"monetary model version drift");
  assert.equal(model.unit,CURRENCY,"economic monetary unit inconsistent");
  assert(["estimated","externally_validated"].includes(model.probabilityEvidence),
    "probability must be declared estimated/externally_validated, not subjective");
  assert(Array.isArray(model.states)&&model.states.length>=2&&model.states.length<=12,
    "expected 2-12 explicitly modeled states");
  assert(Array.isArray(model.actions)&&model.actions.length>=2&&model.actions.length<=12,
    "expected 2-12 explicitly modeled actions");
  exactKeys(model.riskPolicy,["tailMass","downsidePenalty"],"frozen risk policy");
  assert.equal(model.riskPolicy.tailMass,c.risk_tail_mass,"tail mass drift");
  assert.equal(model.riskPolicy.downsidePenalty,c.risk_downside_penalty,"downside penalty drift");
  const ids=new Set();
  for(const action of model.actions){
    const id=str(action.id,"action id");
    assert(/^[a-z][a-z0-9_-]{0,31}$/.test(id),"actions must have short non-sensitive codes");
    assert(!ids.has(id),"duplicate action id");ids.add(id);
    finite(action.upfrontCost,"explicit upfront cost",0,1e12);
    finite(action.opportunityCost,"explicit opportunity cost",0,1e12);
  }
  const wait=model.actions.find(a=>a.id==="wait");
  assert(wait,"explicit wait option missing");
  assert(!wait.prohibited,"wait must remain feasible");
  assert(wait.upfrontCost===0&&wait.opportunityCost===0,"wait financial assumptions must be zero");
  assert(wait.payoffs?.length===model.states.length &&
    wait.payoffs.every(p=>p.amount===0),"wait must have explicit zero payoff in every state");
  // Actual true opportunity cost of delay must be measured in the future trial.
}
function baselineMeanRanking(model,signalResult){
  const factor=(1+(model.annualDiscountRate??0))**-(model.payoffHorizonYears??0);
  const states=model.states;
  const candidates=[];
  for(const [i,action] of model.actions.entries()){
    const result=signalResult.actions[i];
    assert.equal(result.actionId,action.id,"native action order mismatch");
    const mean=states.reduce((sum,state)=>{
      const payoff=action.payoffs.find(x=>x.stateId===state.id);
      assert(payoff,"missing state contingent payoff");
      return sum+state.probability*(payoff.amount*factor -
        action.upfrontCost-action.opportunityCost);
    },0);
    assert(Math.abs(mean-result.expectedUtility)<1e-7*Math.max(1,Math.abs(mean)),
      "native vs independent expected-utility calculation drift");
    if(result.feasible)candidates.push({id:action.id,mean,index:i});
  }
  assert(candidates.length>0,"no feasible economic actions including wait");
  candidates.sort((a,b)=>b.mean-a.mean||a.index-b.index);
  return candidates[0];
}
function validateNativeInput(native,decisionAt,cutoff,c){
  exactKeys(native,NATIVE_FIELDS,"native gate context");
  exactKeys(native.modules,MODULES,"13 native decision modules");
  for(const name of MODULES){
    const v=native.modules[name];
    assert(typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=100,
      "native module must be honest ordinal [0,100] "+name);
  }
  assert(native.prediction&&typeof native.prediction==="object" &&
    !Array.isArray(native.prediction),"native prediction required");
  assert(native.wisdom&&typeof native.wisdom==="object" &&
    !Array.isArray(native.wisdom),"native wisdom required");
  const assessment=native.assessment;
  assert(assessment&&typeof assessment==="object" &&
    !Array.isArray(assessment),"native evidence assessment required");
  assert(Array.isArray(assessment.evidence),"evidence sources required");
  const sourceRefs=new Set();
  for(const e of assessment.evidence){
    const sourceId=e?.sourceRef?.sourceId;
    assert(typeof sourceId==="string"&&/^[a-zA-Z0-9._:-]{2,90}$/.test(sourceId),
      "independently named evidence source ID missing");
    sourceRefs.add(sourceId);
    // Date checks prevent use of information learned after the proposal.
    for(const k of ["eventAt","observedAt","recordedAt"]){
      const t=utc(e[k],"evidence."+k);
      assert(t<=cutoff,"evidence snapshot contains source date after cutoff");
    }
  }
  assert(sourceRefs.size>=c.minimum_actual_evidence_sources,
    "insufficient distinctly named source references (not verified independent)");
  return sourceRefs.size;
}
function evaluateShadowRecord(r,c){
  assert(/^[a-f0-9]{64}$/i.test(r.unit_hash),"expected pseudonymous 64-hex unit ID");
  assert(/^[a-f0-9]{64}$/i.test(r.evidence_sha256),"evidence snapshot digest missing");
  assert.equal(r.native_policy_version,c.frozen_native_gate_policy_version,
    "native gate version drift");
  const d=utc(r.decision_at,"decision_at");
  const cutoff=utc(r.evidence_cutoff_at,"evidence_cutoff_at");
  assert(cutoff<=d,"information cutoff after decision");
  assert((d-cutoff)<=c.max_evidence_age_hours*3600000,"pre-outcome evidence too stale");
  validateEconomicModel(r.economic_model,c);
  const sourceCount=validateNativeInput(r.native_gate_model,d,cutoff,c);
  const advisor=evaluateQuantitativeDecision(r.economic_model);
  assert.equal(advisor.status,"recommended","economic advisor has no feasible action");
  const ordinary=baselineMeanRanking(r.economic_model,advisor);
  const riskZero=evaluateQuantitativeDecision({
    ...r.economic_model,
    modelVersion:r.economic_model.modelVersion+":risk-zero-control",
    riskPolicy:{...r.economic_model.riskPolicy,downsidePenalty:0}
  });
  assert.equal(riskZero.recommendedActionId,ordinary.id,
    "zero-penalty actual Signal must agree with independent risk-neutral baseline");
  const originalAdvisorAction=advisor.recommendedActionId;
  const nativeInput={
    decisionId:"shadow:"+r.unit_hash,
    source:"economic-shadow-no-execution",
    createdAt:r.decision_at,
    observation:{
      evidenceDigest:r.evidence_sha256,
      monetaryModelVersion:r.economic_model.modelVersion,
      nativePolicyVersion:c.frozen_native_gate_policy_version,
      proposedActionCode:originalAdvisorAction
    },
    modules:r.native_gate_model.modules,
    prediction:r.native_gate_model.prediction,
    wisdom:r.native_gate_model.wisdom,
    assessment:r.native_gate_model.assessment,
    action:{proposedActionCode:originalAdvisorAction,operation:"shadow-evaluation-only"}
  };
  const native=evaluateDecision(nativeInput);
  assert(Number.isFinite(native.actionScale)&&native.actionScale>=0&&native.actionScale<=1,
    "invalid native scale");
  if(native.actionAllowed) assert(native.actionScale>0,"native permission with zero scale");
  else assert(native.actionScale===0,"denied native action retained positive scale");
  const fullScalePermission=native.actionAllowed&&native.actionScale===c.native_scale_for_full_action;
  const effective=originalAdvisorAction==="wait"||!fullScalePermission?
    "wait":originalAdvisorAction;
  // Never claim a partial-scale decision authorizes full-size application action.
  const reducedUnmapped=native.actionAllowed&&native.actionScale>0 &&
    !fullScalePermission&&originalAdvisorAction!=="wait";
  return {
    ordinaryAction:ordinary.id,advisorAction:originalAdvisorAction,
    effectiveShadowAction:effective,
    nativeAllowed:native.actionAllowed,
    nativeScale:native.actionScale,
    nativeSimulation:native.simulationRecommendation,
    nativeWisdom:native.wisdomDecision,
    nativeEvidenceStewardship:native.record?.assessment?.stewardship?.recommendation??"none",
    nativeExplicitBlockers:native.record?.assessment?.governance?.blockers?.length??0,
    advisorDisagrees:Number(ordinary.id!==originalAdvisorAction),
    effectiveDisagrees:Number(ordinary.id!==effective),
    nativeApprovedFullScale:Number(fullScalePermission),
    reducedUnmapped:Number(reducedUnmapped),
    advisorWait:Number(originalAdvisorAction==="wait"),
    nativeDenied:Number(!native.actionAllowed),
    vetoChangedBaseline:Number(effective==="wait"&&ordinary.id!=="wait"&&
      originalAdvisorAction!=="wait"&&!fullScalePermission),
    sourceCount
  };
}
function summarize(c,records){
  configGate(c);
  const seen=new Set(),totals={
    n:0,advisorDisagrees:0,effectiveDisagrees:0,
    nativeApprovedFullScale:0,reducedUnmapped:0,advisorWait:0,
    nativeDenied:0,vetoChangedBaseline:0
  };
  const gateReasons={simulation:{},wisdom:{},stewardship:{},explicitBlockerUnits:0};
  const count=(counter,key)=>{counter[key]=(counter[key]||0)+1};
  let totalNamedSourceClaims=0;
  for(const item of records){
    assert(!seen.has(item.unit_hash),"duplicate shadow unit");
    seen.add(item.unit_hash);
    const result=evaluateShadowRecord(item,c);
    totals.n++;
    for(const k of ["advisorDisagrees","effectiveDisagrees","nativeApprovedFullScale",
      "reducedUnmapped","advisorWait","nativeDenied","vetoChangedBaseline"]){
      totals[k]+=result[k];
    }
    totalNamedSourceClaims+=result.sourceCount;
    count(gateReasons.simulation,result.nativeSimulation);
    count(gateReasons.wisdom,result.nativeWisdom);
    count(gateReasons.stewardship,result.nativeEvidenceStewardship);
    if(result.nativeExplicitBlockers>0)gateReasons.explicitBlockerUnits++;
  }
  assert(totals.n>0,"empty trial shadow data");
  const actualDisagreement=totals.effectiveDisagrees/totals.n;
  const requirements={
    enoughUnits:totals.n>=c.minimum_shadow_units,
    effectivePolicyDifference:actualDisagreement>=c.minimum_effective_disagreement_fraction
  };
  const feasible=Object.values(requirements).every(Boolean);
  const vetoOnly=totals.nativeApprovedFullScale===0;
  return {
    classification:"SHADOW_REPLAY_TWO_REAL_SIGNAL_APIS_NO_CAUSAL_OR_PRODUCTION_VALIDATION",
    candidateId:c.candidate_id,
    evidenceAudit:{
      engine:"@signal/decision actual evaluateQuantitativeDecision + evaluateDecision",
      versions:{signalModel:c.frozen_signal_model_version,
        baseline:c.baseline_model_version,nativeGate:c.frozen_native_gate_policy_version},
      lockedGitCommitCLAIM:c.locked_commit_sha,
      independentSourceAttestationVerified:false,
      sourceFinancialCalibrationVerified:false,
      authenticatedLiveEventsVerified:false,
      totalUniquelyNamedEvidenceSourceClaims:totalNamedSourceClaims,
      noOutcomeFieldsAccepted:true,
      noSideEffectsOrActionsExecuted:true
    },
    aggregateDecisions:{
      ...totals,
      advisorDisagreementFraction:totals.advisorDisagrees/totals.n,
      effectivePolicyDisagreementFraction:actualDisagreement,
      fullScaleNativeAllowedFraction:totals.nativeApprovedFullScale/totals.n,
      vetoChangedBaselineFraction:totals.vetoChangedBaseline/totals.n,
      reducedScaleUnmappedFraction:totals.reducedUnmapped/totals.n,
      gateReasons
    },
    screening:requirements,
    screeningVerdict:feasible?(vetoOnly?
      "POTENTIAL_DIFFERENT_PROTECTIVE_VETO_POLICY_REQUIRES_REAL_OUTCOME_TEST":
      "POTENTIAL_DISTINCT_ACTION_POLICY_REQUIRES_REAL_OUTCOME_TEST"):
      "SHADOW_POLICY_DIFFERENCE_NOT_ESTABLISHED",
    scientificBoundaries:[
      "Policy inputs and independent evidence quality were caller-supplied; no external provenance or calibration was verified.",
      "Model rewards are assumed counterfactual USD outcomes, NOT realized benefits, audited costs, or known potential outcomes.",
      "A veto can be an economically meaningful policy intervention, but its effect is unknown until genuine randomized observed NET outcomes exist.",
      "Native full-scale permission is NOT tenant/domain authorization, consent or permission to execute.",
      "A native reduced action scale never permits a full-size domain action; it is classified as unmapped abstention.",
      "No live software-level randomization, economic improvement, realized cost, causal proof or deployment is implied."
    ]
  };
}
function fixtureConfig(){
  return {
    candidate_id:"synthetic-economic-shadow-test",
    frozen_signal_model_version:"utility-shadow-v1",
    baseline_model_version:"ordinary-eu-v1",
    frozen_native_gate_policy_version:"native-evidence-v1",
    locked_commit_sha:"0123456789abcdef0123456789abcdef01234567",
    wait_action_id:"wait",currency_unit:CURRENCY,
    minimum_shadow_units:30,minimum_effective_disagreement_fraction:.10,
    minimum_actual_evidence_sources:1,max_evidence_age_hours:24,
    risk_tail_mass:.25,risk_downside_penalty:.5,
    requires_independent_attestation:true,native_scale_for_full_action:1
  };
}
function fixture(i=0){
  const time="2024-05-02T12:00:00Z",seen="2024-05-02T11:50:00Z";
  const utility={
    modelVersion:"utility-shadow-v1",unit:CURRENCY,
    probabilityEvidence:"estimated",
    states:[{id:"good",probability:.5},{id:"bad",probability:.5}],
    actions:[
      {id:"invest",upfrontCost:1,opportunityCost:0,
        payoffs:[{stateId:"good",amount:200},{stateId:"bad",amount:-80}]},
      {id:"wait",upfrontCost:0,opportunityCost:0,
        payoffs:[{stateId:"good",amount:0},{stateId:"bad",amount:0}]}
    ],
    riskPolicy:{tailMass:.25,downsidePenalty:.5}
  };
  const moduleScores=Object.fromEntries(MODULES.map(n=>[n,90]));
  const evidence=[{
    evidenceId:"toy-metrics",label:"synthetic-only-evidence-not-real",
    direction:"supporting",
    sourceRef:{sourceId:"synthetic-independent-claim",sourceType:"database"},
    eventAt:seen,observedAt:seen,recordedAt:seen,
    quality:70,reliability:70,independence:40,replication:30,
    calibration:40,traceability:60
  }];
  return {
    unit_hash:h("synthetic-shadow-"+i),decision_at:time,evidence_cutoff_at:seen,
    evidence_sha256:h("synthetic-frozen-evidence-"+i),
    native_policy_version:"native-evidence-v1",
    economic_model:utility,
    native_gate_model:{
      modules:moduleScores,
      prediction:{currentScore:90,expectedReward:90,expectedRisk:10,
        uncertainty:10,purposeAlignment:90,needAlignment:90,confidence:90},
      wisdom:{expectedReward:90,downsideRisk:10,irreversibleRisk:10,
        survivalPriority:80,longTermAlignment:90,shortTermTemptation:90,
        uncertainty:10,confidence:90},
      assessment:{known:["Synthetic decision criteria were supplied"],
        unknowns:["No actual independent economic validation"],
        desiredConfidence:80,evidence}
    }
  };
}
function selfTest(){
  const c=fixtureConfig(),r=fixture();
  const result=evaluateShadowRecord(r,c);
  assert.equal(result.ordinaryAction,"invest");
  assert.equal(result.advisorAction,"wait");
  assert.equal(result.effectiveShadowAction,"wait");
  assert.equal(result.advisorDisagrees,1);
  const many=Array.from({length:35},(_,i)=>fixture(i));
  const summary=summarize(c,many);
  assert.equal(summary.aggregateDecisions.n,35);
  assert.equal(summary.aggregateDecisions.advisorDisagrees,35);
  assert.equal(summary.screening.effectivePolicyDifference,true);
  assert(summary.scientificBoundaries.some(x=>x.includes("randomized observed NET")));
  assert.throws(()=>summarize(c,[r,r]),/duplicate shadow unit/);
  assert.throws(()=>evaluateShadowRecord({...r,evidence_cutoff_at:"2024-05-04T00:00:00Z"},c),
    /information cutoff after decision/);
  assert.throws(()=>evaluateShadowRecord({...r,evidence_cutoff_at:"2024-01-01T00:00:00Z"},c),
    /too stale/);
  assert.throws(()=>evaluateShadowRecord({...r,economic_model:{
    ...r.economic_model,actions:r.economic_model.actions.map(a=>a.id==="wait"?
      {...a,upfrontCost:1}:a)
  }},c),/wait financial assumptions/);
  assert.throws(()=>evaluateShadowRecord({...r,economic_model:{
    ...r.economic_model,riskPolicy:{tailMass:.25,downsidePenalty:0}
  }},c),/downside penalty drift/);
  assert.throws(()=>evaluateShadowRecord({...r,native_gate_model:{
    ...r.native_gate_model,assessment:{...r.native_gate_model.assessment,evidence:[]}
  }},c),/insufficient distinctly named source/);
  assert.throws(()=>evaluateShadowRecord({...r,native_gate_model:{
    ...r.native_gate_model,modules:{discovery:90}
  }},c),/13 native decision modules/);
  assert.throws(()=>configGate({...c,native_scale_for_full_action:.45}),
    /partial Signal action scale/);
  assert.throws(()=>sourceRecords(JSON.stringify({...r,outcome:9999})),
    /shadow input record must use exact frozen fields/);
  const out=sourceRecords(many.map(x=>JSON.stringify(x)).join("\n"));
  assert.equal(out.length,many.length);
  console.log("SELF_TEST_PASS: genuine native Signal gate, actual quantitative utility advisor, independent expected-utility baseline, evidence chronology, wait, zero-scale, reduced-scale mapping and fail-closed integrity");
  console.log("SYNTHETIC INPUTS ONLY: no real evidence source, financial costs or observed causal gains");
}
async function main(){
  const argv=process.argv.slice(2);
  if(argv.includes("--self-test"))return selfTest();
  const cf=argv.indexOf("--config"),df=argv.indexOf("--data");
  assert(cf>=0&&df>=0&&argv[cf+1]&&argv[df+1],
    "usage: node economic-shadow-authorization.mjs --config candidate.json --data pre-outcome.jsonl");
  const configBytes=await readFile(argv[cf+1]);
  const sourceBytes=await readFile(argv[df+1]);
  const c=configGate(JSON.parse(configBytes.toString("utf8")));
  const report=summarize(c,sourceRecords(sourceBytes.toString("utf8")));
  report.evidenceAudit.configSha256=h(configBytes);
  report.evidenceAudit.shadowInputSha256=h(sourceBytes);
  report.evidenceAudit.actualCurrentGitCommit=process.env.GITHUB_SHA??null;
  await mkdir("artifacts/validation",{recursive:true});
  await writeFile(REPORT_PATH,JSON.stringify(report,null,2)+"\n");
  console.log("SHADOW ACTUAL SIGNAL ENGINES",report.aggregateDecisions.n,
    "ADVISOR DISAGREEMENT",report.aggregateDecisions.advisorDisagreementFraction,
    "NATIVE-ENFORCED EFFECTIVE DISAGREEMENT",
    report.aggregateDecisions.effectivePolicyDisagreementFraction);
  console.log("NATIVE FULL-SCALE PERMISSIONS",
    report.aggregateDecisions.nativeApprovedFullScale,
    "VETOED BASELINE ACTIONS",report.aggregateDecisions.vetoChangedBaseline);
  console.log("PRE-OUTCOME SCREEN",report.screeningVerdict);
  console.log("NO AUTHENTICATED PROVENANCE, BUSINESS LIFT OR DEPLOYMENT");
}
await main();
