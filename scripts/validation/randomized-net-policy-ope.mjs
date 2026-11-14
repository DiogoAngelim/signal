/**
 * OFFLINE RESEARCH ONLY: real Signal economic advisor + unchanged native veto
 * against independently recomputed conventional mean/risk optimizers.
 *
 * Two physically separate sources: pre-outcome proposals and subsequent logged
 * randomized actions with complete realized USD cost ledgers. No live actions.
 * Historical randomized action logs cannot establish causal deployment effects
 * of Signal software. This runner does NOT authenticate when sources were frozen.
 *
 * Run:
 * node scripts/validation/randomized-net-policy-ope.mjs --self-test
 * node scripts/validation/randomized-net-policy-ope.mjs --config config.json \
 *   --proposals preoutcome.jsonl --outcomes finalized.jsonl
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import decision from "../../packages/decision/dist/index.js";

const { evaluateDecision, evaluateQuantitativeDecision,
  diagnoseNativeDecisionPermission } = decision;
for (const f of [evaluateDecision, evaluateQuantitativeDecision,
  diagnoseNativeDecisionPermission]) assert.equal(typeof f, "function");
const REPORT = "artifacts/validation/randomized-net-policy-ope-report.json";
const UNIT = "USD net per randomized opportunity";
const MODULES = ["discovery","judgment","purpose","need","trust","reflection",
  "recovery","memory","learning","calibration","identity","awareness","agency"];
const CONFIG = ["study_id","source_class","baseline_version","signal_version",
  "native_gate_version","commit_sha","unit","action_codes",
  "tail_mass","downside_penalty","exposure_fraction",
  "bootstrap_replicates","bootstrap_seed","minimum_effective_sample_size",
  "minimum_material_gain_usd","external_source_attestation_required"];
const PRE = ["unit_hash","cluster_hash","proposal_at","evidence_cutoff_at",
  "evidence_sha256","economic_model","native_gate_model"];
const OUT = ["unit_hash","cluster_hash","assignment_at","outcome_at","logged_action",
  "behavior_probabilities","collected_usd","refunds_usd","delivery_cost_usd",
  "sales_time_cost_usd","delivery_time_cost_usd","compute_cost_usd",
  "review_cost_usd","delay_cost_usd","remediation_cost_usd"];
const COSTS = ["refunds_usd","delivery_cost_usd","sales_time_cost_usd",
  "delivery_time_cost_usd","compute_cost_usd","review_cost_usd",
  "delay_cost_usd","remediation_cost_usd"];
const digest = (x) => createHash("sha256").update(x).digest("hex");
function exact(obj, fields, name) {
  assert(obj && typeof obj === "object" && !Array.isArray(obj),
    "invalid " + name);
  assert.deepEqual(Object.keys(obj).sort(), [...fields].sort(),
    name + " has missing/extra fields");
}
function finite(v, name, min=-Infinity, max=Infinity) {
  assert(typeof v === "number" && Number.isFinite(v) && v >= min && v <= max,
    name + " must be a finite number in expected range");
  return v;
}
function text(v, name) {
  assert(typeof v === "string" && v.trim(), "missing " + name);
  return v;
}
function id(v, name) {
  assert(typeof v === "string" && /^[a-f0-9]{64}$/i.test(v),
    name + " must be a pseudonymous SHA-256 identifier");
  return v;
}
function time(v, name) {
  assert(typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v),
    "invalid UTC " + name);
  const ms = Date.parse(v);
  assert(Number.isFinite(ms) && ms <= Date.now(), "invalid or future " + name);
  return ms;
}
function validateConfig(c) {
  exact(c, CONFIG, "config");
  for (const name of ["study_id","baseline_version","signal_version",
    "native_gate_version"]) text(c[name], name);
  assert(c.signal_version !== c.baseline_version,
    "baseline and signal versions must be distinguishable");
  assert(["synthetic_fixture","historical_randomized_actions"].includes(c.source_class),
    "only synthetic or historical randomized logged actions supported");
  assert(/^[a-f0-9]{40}$/i.test(c.commit_sha), "frozen 40-hex commit required");
  assert.equal(c.unit, UNIT, "explicit USD net-unit contract required");
  assert(Array.isArray(c.action_codes) && c.action_codes.length >= 2 &&
    c.action_codes.length <= 12 && c.action_codes[0] === "wait" &&
    c.action_codes.every(x => typeof x === "string" &&
      /^[a-z][a-z0-9_-]{0,31}$/.test(x)) &&
    new Set(c.action_codes).size === c.action_codes.length,
    "frozen distinct safe action codes with first action wait required");
  finite(c.tail_mass, "tail_mass", 0.00001, 1);
  finite(c.downside_penalty, "downside_penalty", 0, 5);
  finite(c.exposure_fraction, "exposure_fraction", .01, .99);
  finite(c.minimum_material_gain_usd, "minimum_material_gain_usd", 0.001, 1e9);
  assert(Number.isInteger(c.bootstrap_replicates) &&
    c.bootstrap_replicates >= 300 && c.bootstrap_replicates <= 5000,
    "bootstrap_replicates must be 300..5000");
  assert(Number.isSafeInteger(c.bootstrap_seed) && c.bootstrap_seed >= 0 &&
    c.bootstrap_seed <= 0xffffffff, "bootstrap seed invalid");
  assert(Number.isInteger(c.minimum_effective_sample_size) &&
    c.minimum_effective_sample_size >= 30,
    "minimum ESS must be at least 30");
  assert.equal(c.external_source_attestation_required, true,
    "external source attestation requirement cannot be disabled");
  return c;
}
function jsonl(bytes, shape, name) {
  assert(Buffer.byteLength(bytes, "utf8") < 50 * 1024 * 1024,
    name + " exceeds 50 MB");
  const lines = bytes.trim().split(/\r?\n/).filter(x=>x.trim());
  assert(lines.length >= 30 && lines.length <= 200000,
    name + " requires 30..200000 records");
  return lines.map((line, i) => {
    assert(Buffer.byteLength(line) < 150000,
      "oversized row in " + name);
    let record;
    try { record = JSON.parse(line); }
    catch { throw Error("malformed " + name + " JSONL line " + (i+1)); }
    exact(record, shape, name + " record");
    return record;
  });
}
function checkModel(model, c) {
  assert(model && typeof model === "object", "missing economic model");
  assert.equal(model.modelVersion, c.signal_version, "Signal model version drift");
  assert.equal(model.unit, UNIT, "monetary model unit drift");
  assert(["estimated","externally_validated"].includes(model.probabilityEvidence),
    "unverifiable subjective model prohibited for this benchmark");
  assert(Array.isArray(model.states) && model.states.length >= 2 &&
    model.states.length <= 12, "2..12 explicit states required");
  assert(Array.isArray(model.actions) &&
    model.actions.length === c.action_codes.length &&
    model.actions.every((a, i) => a.id === c.action_codes[i]),
    "same frozen feasible action vocabulary required");
  assert(model.riskPolicy &&
    model.riskPolicy.tailMass === c.tail_mass &&
    model.riskPolicy.downsidePenalty === c.downside_penalty,
    "risk policy must match immutable benchmark config");
  for (const a of model.actions) {
    finite(a.upfrontCost, "explicit upfrontCost", 0);
    finite(a.opportunityCost, "explicit opportunityCost", 0);
  }
  const wait = model.actions[0];
  assert(!wait.prohibited && wait.upfrontCost === 0 &&
    wait.opportunityCost === 0 && wait.payoffs.length === model.states.length &&
    wait.payoffs.every(p => p.amount === 0),
    "wait must be feasible with explicit zero net utility");
}
function independentRanking(model, native) {
  const rate=(1+(model.annualDiscountRate??0)) ** -(model.payoffHorizonYears??0);
  const mass=model.riskPolicy.tailMass;
  const penalty=model.riskPolicy.downsidePenalty;
  const p=model.states.map(s=>s.probability);
  const feasible=[];
  for (let index=0; index<model.actions.length; index++) {
    const a=model.actions[index], result=native.actions[index];
    assert.equal(result.actionId, a.id, "native action mismatch");
    const u=model.states.map(s=>{
      const v=a.payoffs.find(x=>x.stateId===s.id);
      assert(v, "missing state payoff");
      return v.amount*rate-a.upfrontCost-a.opportunityCost;
    });
    const mean=u.reduce((sum,v,i)=>sum+p[i]*v,0);
    const sorted=u.map((v,i)=>({u:v,p:p[i]})).sort((x,y)=>x.u-y.u);
    let left=mass, tail=0;
    for(const item of sorted){
      const take=Math.min(left,item.p); tail+=take*item.u; left-=take;
      if(left<=1e-10) break;
    }
    tail/=mass;
    const worst=Math.min(...u);
    const risk=model.riskPolicy;
    const allowed=!a.prohibited &&
      (risk.minimumWorstCase===undefined||worst>=risk.minimumWorstCase) &&
      (risk.minimumLowerTailMean===undefined||tail>=risk.minimumLowerTailMean);
    const obj=mean-penalty*Math.max(0,mean-tail);
    const tol=(x,y)=>Math.abs(x-y)<1e-7*Math.max(1,Math.abs(x),Math.abs(y));
    assert(tol(mean,result.expectedUtility) && tol(tail,result.lowerTailMean) &&
      tol(obj,result.objectiveValue) && result.feasible===allowed,
      "independent conventional net model disagrees with Signal mathematics");
    if(allowed)feasible.push({id:a.id,mean,obj,index});
  }
  assert(feasible.length>0,"no feasible action, including wait");
  const argmax=(key)=>[...feasible].sort((a,b)=>b[key]-a[key]||a.index-b.index)[0].id;
  assert.equal(native.recommendedActionId,argmax("obj"),
    "native risk advisor and equivalent independent optimizer differ");
  return { ordinary:argmax("mean"), equallyInformedRisk:argmax("obj") };
}
function validatePre(r,c) {
  id(r.unit_hash,"unit_hash"); id(r.cluster_hash,"cluster_hash");
  const proposalAt=time(r.proposal_at,"proposal_at");
  const cutoff=time(r.evidence_cutoff_at,"evidence_cutoff_at");
  assert(cutoff<=proposalAt,"evidence provided after proposal");
  id(r.evidence_sha256,"evidence_sha256");
  checkModel(r.economic_model,c);
  const native=r.native_gate_model;
  exact(native,["modules","prediction","wisdom","assessment"],"native gate");
  exact(native.modules,MODULES,"native gate ordinal modules");
  for(const k of MODULES)finite(native.modules[k],k,0,100);
  assert(native.prediction && typeof native.prediction==="object" &&
    native.wisdom && typeof native.wisdom==="object" &&
    native.assessment && Array.isArray(native.assessment.evidence) &&
    native.assessment.evidence.length>=1,
    "actual native evidence/prediction/wisdom required");
  const sources=new Set();
  for(const ev of native.assessment.evidence){
    const sid=ev?.sourceRef?.sourceId;
    text(sid,"evidence source ID");
    sources.add(sid);
    for(const k of ["eventAt","observedAt","recordedAt"])
      assert(time(ev[k],"source "+k)<=cutoff,"postcutoff evidence leakage");
  }
  assert(sources.size>0,"no distinct source reference");
  const signal=evaluateQuantitativeDecision(r.economic_model);
  assert.equal(signal.status,"recommended");
  const ordinary=independentRanking(r.economic_model,signal);
  const gate=evaluateDecision({
    decisionId:"offline-ope:"+r.unit_hash,source:"never-execute-shadow",
    createdAt:r.proposal_at,
    observation:{evidenceDigest:r.evidence_sha256,modelVersion:c.signal_version},
    modules:native.modules,prediction:native.prediction,
    wisdom:native.wisdom,assessment:native.assessment,
    action:{operation:"offline-evaluation-only",actionCode:signal.recommendedActionId}
  });
  const diagnosis=diagnoseNativeDecisionPermission(gate);
  const effective=diagnosis.permissionClass==="full"?
    signal.recommendedActionId:"wait";
  return {unitHash:r.unit_hash,clusterHash:r.cluster_hash,proposalAt,
    meanAction:ordinary.ordinary,riskAction:ordinary.equallyInformedRisk,
    signalAdvisedAction:signal.recommendedActionId,
    effectiveAction:effective,diagnosis};
}
function validateOutcome(r, c, plan) {
  id(r.unit_hash,"observed unit_hash");
  id(r.cluster_hash,"observed cluster_hash");
  assert.equal(r.cluster_hash,plan.clusterHash,"cluster identity changed");
  const assigned=time(r.assignment_at,"assignment_at");
  const observed=time(r.outcome_at,"outcome_at");
  assert(assigned>=plan.proposalAt && observed>assigned,
    "assignment/outcome chronology or pre-outcome policy violation");
  assert(c.action_codes.includes(r.logged_action),"action outside frozen policy vocabulary");
  exact(r.behavior_probabilities,c.action_codes,"logging behavior probabilities");
  let total=0;
  for(const a of c.action_codes){
    const p=finite(r.behavior_probabilities[a],"logged action propensity "+a,0,1);
    assert(p>0,"logging policy must have full support including wait");
    total+=p;
  }
  assert(Math.abs(total-1)<1e-9,"behavior propensity vector must sum to one");
  finite(r.collected_usd,"collected_usd",0);
  let costs=0;
  for(const k of COSTS) costs+=finite(r[k],k,0);
  const net=r.collected_usd-costs;
  assert(Number.isFinite(net),"observed net utility not finite");
  return {net,loggedAction:r.logged_action,
    loggedPropensity:r.behavior_probabilities[r.logged_action]};
}
function policyProbability(action, chosen, c) {
  return (action==="wait"?1-c.exposure_fraction:0) +
    (action===chosen?c.exposure_fraction:0);
}
function metric(rows,name) {
  const sw=rows.reduce((s,r)=>s+r.weights[name],0);
  const sq=rows.reduce((s,r)=>s+r.weights[name]**2,0);
  const n=rows.length;
  return {
    ipsNetUSDPerUnit:rows.reduce((s,r)=>s+r.net*r.weights[name],0)/n,
    snipsNetUSDPerUnit:rows.reduce((s,r)=>s+r.net*r.weights[name],0)/sw,
    effectiveSampleSize:sw**2/sq,
    maxImportanceWeight:Math.max(...rows.map(r=>r.weights[name])),
    meanWeight:sw/n
  };
}
function bootstrap(rows, c, comparison) {
  const grouped=new Map();
  for(const row of rows){
    const group=grouped.get(row.clusterHash)||{n:0,sum:0};
    group.n++;
    group.sum+=row.net*(row.weights.signal-row.weights[comparison]);
    grouped.set(row.clusterHash,group);
  }
  const clusters=[...grouped.values()];
  let state=c.bootstrap_seed>>>0;
  const rng=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296};
  const samples=[];
  for(let b=0;b<c.bootstrap_replicates;b++){
    let n=0,total=0;
    for(let j=0;j<clusters.length;j++){
      const r=clusters[Math.floor(rng()*clusters.length)];
      n+=r.n;total+=r.sum;
    }
    samples.push(total/n);
  }
  samples.sort((a,b)=>a-b);
  const quantile=p=>{
    const i=(samples.length-1)*p,low=Math.floor(i),high=Math.ceil(i);
    return samples[low]+(samples[high]-samples[low])*(i-low);
  };
  return [quantile(.025),quantile(.975)];
}
function evaluate(c,proposalSource,outcomeSource) {
  validateConfig(c);
  // Critical order: derive and freeze ALL native and conventional recommendations
  // before parsing a single outcome. Source custody must still be verified elsewhere.
  const pre=jsonl(proposalSource,PRE,"pre-outcome proposal");
  const plans=new Map();
  const reasons={},counter={nativeDenied:0,nativeFull:0,
    nativePartial:0,signalAdvisorDisagreements:0,effectiveDisagreements:0};
  for(const r of pre){
    assert(!plans.has(r.unit_hash),"duplicate pre-outcome unit");
    const plan=validatePre(r,c);
    plans.set(r.unit_hash,plan);
    counter.nativeDenied+=Number(plan.diagnosis.permissionClass==="denied");
    counter.nativeFull+=Number(plan.diagnosis.permissionClass==="full");
    counter.nativePartial+=Number(plan.diagnosis.permissionClass==="partial");
    counter.signalAdvisorDisagreements+=
      Number(plan.signalAdvisedAction!==plan.riskAction);
    counter.effectiveDisagreements+=Number(plan.effectiveAction!==plan.riskAction);
    for(const reason of plan.diagnosis.vetoReasons)
      reasons[reason]=(reasons[reason]??0)+1;
  }
  const frozenPolicyDigest=digest(JSON.stringify([...plans.values()].map(x=>[
    x.unitHash,x.clusterHash,x.meanAction,x.riskAction,x.effectiveAction
  ])));
  const logged=jsonl(outcomeSource,OUT,"post-outcome randomized log");
  assert(logged.length===plans.size,"mismatched randomized denominator");
  const seen=new Set(),rows=[];
  for(const outcome of logged){
    assert(!seen.has(outcome.unit_hash),"duplicate logged randomized unit");
    seen.add(outcome.unit_hash);
    const plan=plans.get(outcome.unit_hash);
    assert(plan,"post-outcome unit missing from frozen pre-outcome cohort");
    const observed=validateOutcome(outcome,c,plan);
    const weights={};
    for(const [name,choice] of Object.entries({
      signal:plan.effectiveAction,conventionalRisk:plan.riskAction,
      conventionalMean:plan.meanAction
    })){
      const numerator=policyProbability(observed.loggedAction,choice,c);
      weights[name]=numerator/observed.loggedPropensity;
      assert(Number.isFinite(weights[name])&&weights[name]>=0,"invalid IPS weight");
    }
    rows.push({clusterHash:plan.clusterHash,net:observed.net,weights});
  }
  const clusters=new Set(rows.map(x=>x.clusterHash)).size;
  const results={};
  for(const name of ["signal","conventionalRisk","conventionalMean"])
    results[name]=metric(rows,name);
  const primary=results.signal.ipsNetUSDPerUnit-results.conventionalRisk.ipsNetUSDPerUnit;
  const secondary=results.signal.ipsNetUSDPerUnit-results.conventionalMean.ipsNetUSDPerUnit;
  const primaryCI=bootstrap(rows,c,"conventionalRisk");
  const secondaryCI=bootstrap(rows,c,"conventionalMean");
  const diagnostics={
    sufficientClusterCount:clusters>=30,
    sufficientEffectiveSampleSize:
      results.signal.effectiveSampleSize>=c.minimum_effective_sample_size &&
      results.conventionalRisk.effectiveSampleSize>=c.minimum_effective_sample_size,
    positivePrimaryInterval:primaryCI[0]>0,
    economicallyMaterialPrimaryLowerBound:primaryCI[0]>c.minimum_material_gain_usd,
    distinguishableEffectivePolicies:counter.effectiveDisagreements>0
  };
  return {
    classification:"OFFLINE_RANDOMIZED_LOGGED_POLICY_VALUE_NOT_SIGNAL_SOFTWARE_CAUSAL_PROOF",
    studyId:c.study_id,
    sourceClass:c.source_class,
    dataSourceAuthenticationPerformed:false,
    assignmentRandomizationIndependentlyVerified:false,
    softwarePolicyRandomized:false,
    recordedNetUtilityIncludesFullClaimedComponents:true,
    unit:c.unit,
    cohort:{units:rows.length,clusters,proposalSHA256:digest(proposalSource),
      outcomeSHA256:digest(outcomeSource),preOutcomePolicyDigest:frozenPolicyDigest,
      sourceVersions:{baseline:c.baseline_version,signal:c.signal_version,
        native:c.native_gate_version,claimedCommit:c.commit_sha}},
    implementation:{realPublishedSignalAPIs:true,
      nativeGateUnmodified:true,partialActionNeverPromoted:true,
      targetPolicy:"Each policy selects wait with probability (1-exposure) and its chosen action with exposure; a denied Signal proposal therefore always waits.",
      explorationExposure:c.exposure_fraction},
    diagnostics:{...counter,reasonCounts:reasons},
    estimates:results,
    primarySignalVsEquallyInformedConventionalRisk:{
      ipsDifferenceNetUSDPerUnit:primary,clusterBootstrapCI95:primaryCI,
      iidRowsAssumed:false,bootstrapClusters:clusters,
      bootstrapReplicates:c.bootstrap_replicates},
    secondarySignalVsConventionalMean:{
      ipsDifferenceNetUSDPerUnit:secondary,clusterBootstrapCI95:secondaryCI,
      exploratoryOnly:true},
    researchGates:diagnostics,
    statisticalVerdict:Object.values(diagnostics).every(Boolean)?
      "EXPLORATORY_POSITIVE_POLICY_VALUE_NOT_CAUSAL_SOFTWARE_PROOF":
      "INSUFFICIENT_OR_INCONCLUSIVE_POLICY_VALUE",
    limitations:[
      "A historical randomized ACTION logging policy did not randomize actual use of Signal software. The evidence cannot establish a Signal software deployment effect.",
      "No independently authenticated source custody, pre-outcome policy freeze, randomization, full accounting or allocation to Signal was verified by this CLI.",
      "Policy values are per original logged opportunity under single-action consistency, full action support and standard off-policy exchangeability; joint effects and interference are not modeled.",
      "Cost completeness is an input schema requirement, not independent transaction reconciliation or a guarantee that the proposed Signal policy has no further deployment costs.",
      "Cluster bootstrap treats cluster IDs as independent and cannot validate that clusters contain all related units; heavy tails and rare actions can invalidate intervals.",
      "Policies have a frozen wait/exposure mix; estimates do not apply to a different exploration rate or automatic execution.",
      "Even a favorable historical policy comparison is exploratory, not preregistered prospective randomized observed net-profit improvement."
    ]
  };
}
function syntheticFixture(n=120) {
  const c={study_id:"synthetic-sanity",source_class:"synthetic_fixture",
    baseline_version:"conventional-mean-v1",signal_version:"risk-native-v1",
    native_gate_version:"native-evidence-v1",
    commit_sha:"0123456789abcdef0123456789abcdef01234567",
    unit:UNIT,action_codes:["wait","invest"],tail_mass:.25,
    downside_penalty:.5,exposure_fraction:.2,bootstrap_replicates:300,
    bootstrap_seed:20261114,minimum_effective_sample_size:30,
    minimum_material_gain_usd:1,external_source_attestation_required:true};
  const t="2024-05-02T12:00:00Z",earlier="2024-05-02T11:50:00Z";
  const pre=[],out=[];
  for(let i=0;i<n;i++){
    const uid=digest("synthetic-unit-"+i),cluster=digest("synthetic-cluster-"+Math.floor(i/2));
    const model={modelVersion:c.signal_version,unit:UNIT,
      probabilityEvidence:"estimated",states:[{id:"good",probability:.5},
        {id:"bad",probability:.5}],actions:[
        {id:"wait",upfrontCost:0,opportunityCost:0,
          payoffs:[{stateId:"good",amount:0},{stateId:"bad",amount:0}]},
        {id:"invest",upfrontCost:1,opportunityCost:0,
          payoffs:[{stateId:"good",amount:200},{stateId:"bad",amount:0}]}
      ],riskPolicy:{tailMass:c.tail_mass,downsidePenalty:c.downside_penalty}};
    const evidence=[{evidenceId:"synthetic-test",label:"never a real source",
      direction:"supporting",sourceRef:{sourceId:"synthetic-only",sourceType:"database"},
      eventAt:earlier,observedAt:earlier,recordedAt:earlier,
      quality:70,reliability:70,independence:40,replication:30,
      calibration:40,traceability:60}];
    pre.push({unit_hash:uid,cluster_hash:cluster,proposal_at:t,
      evidence_cutoff_at:earlier,evidence_sha256:digest("synthetic-evidence-"+i),
      economic_model:model,native_gate_model:{
        modules:Object.fromEntries(MODULES.map(k=>[k,90])),
        prediction:{currentScore:90,expectedReward:90,expectedRisk:10,
          uncertainty:10,purposeAlignment:90,needAlignment:90,confidence:90},
        wisdom:{expectedReward:90,downsideRisk:10,irreversibleRisk:10,
          survivalPriority:80,longTermAlignment:90,shortTermTemptation:90,
          uncertainty:10,confidence:90},
        assessment:{known:["synthetic case"],unknowns:["actual external verification"],
          desiredConfidence:80,evidence}
      }});
    const action=i%2===0?"invest":"wait";
    out.push({unit_hash:uid,cluster_hash:cluster,
      assignment_at:"2024-05-02T12:01:00Z",
      outcome_at:"2024-06-02T12:01:00Z",logged_action:action,
      behavior_probabilities:{wait:.5,invest:.5},
      collected_usd:action==="wait"?0:0,
      refunds_usd:0,delivery_cost_usd:action==="invest"?5:0,
      sales_time_cost_usd:0,delivery_time_cost_usd:0,
      compute_cost_usd:0,review_cost_usd:0,delay_cost_usd:0,
      remediation_cost_usd:0});
  }
  return {c,pre,out};
}
function lines(x){return x.map(y=>JSON.stringify(y)).join("\n");}
function selfTest(){
  const {c,pre,out}=syntheticFixture();
  const p=lines(pre),o=lines(out);
  const report=evaluate(c,p,o);
  assert.equal(report.cohort.units,120);
  assert.equal(report.cohort.clusters,60);
  assert.equal(report.diagnostics.signalAdvisorDisagreements,0);
  assert.equal(report.dataSourceAuthenticationPerformed,false);
  assert.equal(report.softwarePolicyRandomized,false);
  assert(report.estimates.signal.effectiveSampleSize>0);
  assert.deepEqual(evaluate(c,p,o),report,"seeded estimate should be deterministic");
  const reversed=out.map((r,i)=>i===0?{...r,collected_usd:100}:r);
  const flipped=evaluate(c,p,lines(reversed));
  assert.equal(flipped.cohort.preOutcomePolicyDigest,report.cohort.preOutcomePolicyDigest,
    "outcome labels cannot alter the pre-outcome policy");
  assert.throws(()=>evaluate(c,lines([{...pre[0],outcome:1},...pre.slice(1)]),o),
    /missing\/extra fields/);
  assert.throws(()=>evaluate(c,p,lines([out[0],...out.slice(0,-1)])),
    /duplicate logged randomized unit/);
  assert.throws(()=>evaluate(c,p,lines(out.map((r,i)=>i===0?
    {...r,behavior_probabilities:{wait:.6,invest:.5}}:r))),
    /must sum to one/);
  assert.throws(()=>evaluate(c,p,lines(out.map((r,i)=>i===0?
    {...r,delivery_cost_usd:undefined}:r))),
    /missing\/extra fields/);
  assert.throws(()=>evaluate(c,p,lines(out.map((r,i)=>i===0?
    {...r,assignment_at:"2024-04-02T12:01:00Z"}:r))),
    /chronology/);
  assert.throws(()=>evaluate({...c,exposure_fraction:1.2},p,o),
    /exposure_fraction/);
  assert.throws(()=>evaluate({...c,external_source_attestation_required:false},p,o),
    /cannot be disabled/);
  console.log("SELF_TEST_PASS: actual Signal quantitative API, native veto, independent mean+equal-risk optimizer, frozen pre-outcome actions, full realized-cost schema, normalized logging propensities, clustered IPS/SNIPS/ESS and deterministic paired CI");
  console.log("SYNTHETIC DATA ONLY; NO REAL-WORLD NET-PROFIT OR SIGNAL SOFTWARE EFFECT ESTABLISHED");
}
async function main(){
  const argv=process.argv.slice(2);
  if(argv.includes("--self-test")) return selfTest();
  const at=(name)=>{const i=argv.indexOf(name);assert(i>=0&&argv[i+1],
    "missing argument "+name);return argv[i+1];};
  const configSource=await readFile(at("--config"),"utf8");
  const proposals=await readFile(at("--proposals"),"utf8");
  // The proposal policies are evaluated and frozen by evaluate() BEFORE the
  // separate outcome records are parsed. CLI cannot attest external timing.
  const outcomes=await readFile(at("--outcomes"),"utf8");
  const r=evaluate(JSON.parse(configSource),proposals,outcomes);
  r.cohort.configSHA256=digest(configSource);
  r.cohort.githubCommitAtExecution=process.env.GITHUB_SHA??null;
  await mkdir("artifacts/validation",{recursive:true});
  await writeFile(REPORT,JSON.stringify(r,null,2)+"\n");
  console.log("ACTUAL SIGNAL NATIVE, RANDOMIZED LOG NET POLICY EVALUATION");
  console.log("N=",r.cohort.units,"CLUSTERS=",r.cohort.clusters,
    "TRUE EFFECTIVE DISAGREEMENTS=",r.diagnostics.effectiveDisagreements);
  console.log("SIGNAL - EQUALLY INFORMED RISK OPTIMIZER IPS NET USD=",
    r.primarySignalVsEquallyInformedConventionalRisk.ipsDifferenceNetUSDPerUnit);
  console.log("CLUSTER BOOTSTRAP 95% CI=",
    r.primarySignalVsEquallyInformedConventionalRisk.clusterBootstrapCI95);
  console.log("RESULT=",r.statisticalVerdict,
    "(never valid proof of causal Signal software deployment or observed profit)");
}
await main();
