/**
 * Public randomized-data *development-period-only* mechanism diagnosis.
 * Do not read, log or evaluate the former Nov 29-30 holdout outcomes.
 * No policy changes, economic/causal lift claims, production writes, or deployments.
 *
 * Protocol: docs/case-studies/native-gate-development-diagnostics-2026-11-14.md
 * node scripts/validation/native-gate-development-diagnostics.mjs --self-test
 * node scripts/validation/native-gate-development-diagnostics.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import signalDecision from "../../packages/decision/dist/index.js";

const { evaluateDecision }=signalDecision;
assert.equal(typeof evaluateDecision,"function","actual native Signal decision gate unavailable");

const SOURCE_SHA="8cbd5fa4558b7ad2ba4781546d6604e4cc3e07c4";
const RANDOM_BLOB="e99ba925c30ccd537a554ce8ea2104a005c6f49e";
const N_ARMS=34, SMOOTHING_IMPRESSIONS=150, AFFINITY_PER_PAST_CLICK=.0005;
const SOURCE="ZOZO Open Bandit public random-policy sample";
const FIT_CUTOFF_MS=Date.parse("2019-11-27T00:00:00Z");
const TEST_CUTOFF_MS=Date.parse("2019-11-29T00:00:00Z");
const SOURCE_URL="https://raw.githubusercontent.com/st-tech/zr-obp/"+SOURCE_SHA+"/obd/random/men/men.csv";
const OUT="artifacts/validation/native-gate-development-diagnostics.json";
const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));

async function getDevelopmentOnlyRows(){
  const response=await fetch(SOURCE_URL,{
    headers:{Accept:"text/csv"},signal:AbortSignal.timeout(90000)});
  assert(response.ok,"source download failed HTTP "+response.status);
  const source=Buffer.from(await response.arrayBuffer());
  assert(source.length>3000000&&source.length<4000000,"source size outside pinned range");
  const sha=createHash("sha1").update("blob "+source.length+"\0").update(source).digest("hex");
  assert.equal(sha,RANDOM_BLOB,"public Open Bandit source Git blob mismatch");
  const lines=source.toString("utf8").trimEnd().split(/\r?\n/);
  const header=lines.shift().split(",");
  assert.equal(lines.length,10000,"not the pinned ten-thousand-row example");
  const fields=new Map(header.map((k,i)=>[k,i]));
  for(const k of ["timestamp","click","item_id","position","propensity_score",
    ...Array.from({length:N_ARMS},(_,i)=>"user-item_affinity_"+i)]){
    assert(fields.has(k),"required source column missing "+k);
  }
  const rows=[];
  let heldoutExcluded=0;
  const identifiers=new Set();
  for(const line of lines){
    const csv=line.split(",");
    assert.equal(csv.length,header.length,"unexpected source CSV width");
    const id=Number(csv[0]);
    assert(Number.isSafeInteger(id)&&!identifiers.has(id),"duplicate source row ID");
    identifiers.add(id);
    const timestamp=Date.parse(csv[fields.get("timestamp")].replace(" ","T"));
    assert(Number.isFinite(timestamp),"invalid public event time");
    if(timestamp>=TEST_CUTOFF_MS){
      // Never read logged action, reward, propensity, affinities or outcome from
      // former heldout rows; only verify file integrity, row count and time split.
      heldoutExcluded++;
      continue;
    }
    const position=Number(csv[fields.get("position")]);
    const action=Number(csv[fields.get("item_id")]);
    const pscore=Number(csv[fields.get("propensity_score")]);
    assert(Number.isInteger(position)&&position>=1&&position<=3);
    assert(Number.isInteger(action)&&action>=0&&action<N_ARMS);
    assert(Math.abs(pscore-1/N_ARMS)<1e-12,"development source not random policy");
    const affinities=Array.from({length:N_ARMS},(_,i)=>
      Number(csv[fields.get("user-item_affinity_"+i)]));
    assert(affinities.every(v=>Number.isFinite(v)&&v>=0),
      "development affinities missing");
    // Outcome labels read ONLY in the initial fitting period. No diagnostic
    // period label nor original heldout label influences this experiment.
    const reward=timestamp<FIT_CUTOFF_MS?
      Number(csv[fields.get("click")]):undefined;
    if(reward!==undefined)assert(reward===0||reward===1,"bad development-fit click");
    rows.push({id,timestamp,position,action,pscore,affinities,
      ...(reward===undefined?{}:{reward})});
  }
  assert.equal(rows.length,7189,"unexpected development period count");
  assert.equal(heldoutExcluded,2811,"original holdout separation mismatch");
  rows.sort((a,b)=>a.timestamp-b.timestamp||a.id-b.id);
  return {rows,sha,heldoutExcluded,bytes:source.length};
}
function fitDevelopmentModel(rows){
  const fit=rows.filter(r=>r.timestamp<FIT_CUTOFF_MS);
  const diagnosis=rows.filter(r=>r.timestamp>=FIT_CUTOFF_MS);
  assert(fit.length>1500&&diagnosis.length>1500,"development fold empty");
  const clicks=fit.reduce((s,r)=>s+r.reward,0);
  const globalCtr=clicks/fit.length;
  assert(globalCtr>0&&globalCtr<1,"no fitting label support");
  const counts=Array.from({length:3},()=>
    Array.from({length:N_ARMS},()=>({n:0,clicks:0})));
  for(const r of fit){
    const c=counts[r.position-1][r.action];c.n++;c.clicks+=r.reward;
  }
  const rate=counts.map(groups=>groups.map(({n,clicks})=>
    (clicks+SMOOTHING_IMPRESSIONS*globalCtr)/(n+SMOOTHING_IMPRESSIONS)));
  return {fitN:fit.length,fitClicks:clicks,globalCtr,rate,diagnosis};
}

function chooseCandidate(row, model) {
  let winner = -1, winningScore = -Infinity;
  for (let a = 0; a < N_ARMS; a += 1) {
    // Candidate scoring is a declared, non-Signal domain heuristic.
    const score = model.rate[row.position - 1][a] +
      AFFINITY_PER_PAST_CLICK * Math.min(4, row.affinities[a]);
    if (score > winningScore) {
      winner = a;
      winningScore = score;
    }
  }
  assert(winner >= 0, "no supported action");
  return { action: winner, forecast: winningScore };
}

function signalDecisionForCandidate(row, candidate, model, withEvidence) {
  // This conversion is a precommitted, explicitly *ordinal* domain adapter.
  // The 0–100 score is NOT a calibrated click probability.
  const score = clamp(
    65 + 20 * Math.log(Math.max(candidate.forecast, 1e-9) / model.globalCtr),
    25, 95
  );
  const modules = Object.fromEntries([
    "discovery", "judgment", "purpose", "need", "trust", "reflection", "recovery",
    "memory", "learning", "calibration", "identity", "awareness", "agency",
  ].map(name => [name, Math.round(score)]));

  const context = {
    decisionId: "obd-signal-policy:" + row.id + ":" + Number(withEvidence),
    source: SOURCE,
    createdAt: new Date(row.timestamp).toISOString(),
    observation: {
      proposedItem: candidate.action, position: row.position,
      trainingOnlyScore: candidate.forecast,
      // Deliberately no outcome, outcome-derived field or logged action.
    },
    modules,
    prediction: {
      currentScore: score,
      expectedReward: score, expectedRisk: 100 - score,
      uncertainty: 100 - score, purposeAlignment: score,
      needAlignment: score, confidence: score,
    },
    wisdom: {
      expectedReward: score, downsideRisk: 100 - score,
      irreversibleRisk: 30, survivalPriority: 80,
      longTermAlignment: score, shortTermTemptation: score,
      uncertainty: 100 - score, confidence: score,
    },
    action: { proposedItem: candidate.action, operation: "show-recommendation" },
  };
  if (withEvidence) {
    context.assessment = {
      decisionId: context.decisionId,
      createdAt: context.createdAt,
      desiredConfidence: 65,
      known: ["Candidate propensity is based exclusively on the training period."],
      unknowns: [
        "The example sample may not represent actual application traffic.",
        "Forecasts and historical source signals are not independently calibrated.",
      ],
      evidence: [{
        evidenceId: "training-click-evidence",
        label: "Published randomized training click labels",
        direction: "supporting",
        sourceRef: { sourceId: "ZOZO-OBD-public-sample", sourceType: "database" },
        eventAt: "2019-11-28T23:59:59Z",
        observedAt: "2019-11-28T23:59:59Z",
        recordedAt: "2019-11-28T23:59:59Z",
        reliability: 65,
        quality: 65,
        independence: 40,
        replication: 20,
        calibration: 20,
        traceability: 75,
      }],
    };
  }
  return evaluateDecision(context);
}

function normalizeGate(result) {
  const scale = result.actionAllowed ? clamp(result.actionScale, 0, 1) : 0;
  assert(Number.isFinite(scale), "invalid Signal actionScale");
  return { scale, allowed: result.actionAllowed,
    wisdom: result.wisdomDecision, simulation: result.simulationRecommendation,
    coherence: result.coherenceStatus };
}



function count(obj,key){
  obj[key]=(obj[key]||0)+1;
}
function scoreBin(score){
  if(score<40)return "25-39";
  if(score<55)return "40-54";
  if(score<70)return "55-69";
  if(score<85)return "70-84";
  return "85-95";
}
function assessmentState(record){
  const assessment=record.assessment;
  return {
    stewardship:assessment?.stewardship?.recommendation??"not_applicable",
    governanceBlockers:assessment?.governance?.blockers?.length??0,
    confidenceCap:assessment?.confidence?.cap??null
  };
}
function inspectNative(result){
  const coh=result.record?.coherence;
  assert(coh&&Number.isFinite(coh.actionScale)&&typeof coh.actionAllowed==="boolean",
    "native coherence snapshot unavailable");
  assert(Number.isFinite(result.actionScale)&&result.actionScale>=0&&result.actionScale<=1,
    "native effective actionScale must be [0,1]");
  if(result.actionAllowed)assert(result.actionScale>0,
    "zero-scale permission safety invariant violated");
  const assessment=assessmentState(result.record);
  const flags={
    coherencePermissionDenied:!coh.actionAllowed,
    coherenceZeroScale:coh.actionScale===0,
    simulationWait:result.simulationRecommendation==="wait",
    simulationBlock:result.simulationRecommendation==="block",
    wisdomWait:result.wisdomDecision==="wait",
    wisdomAvoid:result.wisdomDecision==="avoid",
    governanceWait:assessment.stewardship==="wait",
    governanceAvoid:assessment.stewardship==="avoid",
    governanceExplicitBlockers:assessment.governanceBlockers>0
  };
  if(flags.simulationWait||flags.simulationBlock||
     flags.wisdomWait||flags.wisdomAvoid||
     flags.governanceWait||flags.governanceAvoid||
     flags.governanceExplicitBlockers||flags.coherencePermissionDenied||
     flags.coherenceZeroScale){
    assert(!result.actionAllowed,
      "an observed hard blocker cannot allow action");
  }
  return {
    allowed:result.actionAllowed,effectiveScale:result.actionScale,
    coherenceScale:coh.actionScale,
    coherenceAllowed:coh.actionAllowed,
    wisdom:result.wisdomDecision,
    simulation:result.simulationRecommendation,
    stewardship:assessment.stewardship,
    confidenceCap:assessment.confidenceCap,
    governanceBlockerCount:assessment.governanceBlockers,
    coherenceStatus:result.coherenceStatus,
    flags
  };
}
function createCounters(){
  return {n:0,allowed:0,effectiveScaleSum:0,coherenceAllowed:0,
    rawCoherenceScaleSum:0,wisdom:{},simulation:{},stewardship:{},
    coherenceStatus:{},blockedBy:{},
    wisdomSimulation:{},scoreBuckets:{},confidenceCapAvailable:0,
    governanceBlockerCountSum:0};
}
function recordDiagnostic(counts,record,ordinal){
  counts.n++;
  if(record.allowed)counts.allowed++;
  if(record.coherenceAllowed)counts.coherenceAllowed++;
  counts.effectiveScaleSum+=record.effectiveScale;
  counts.rawCoherenceScaleSum+=record.coherenceScale;
  counts.governanceBlockerCountSum+=record.governanceBlockerCount;
  if(record.confidenceCap!==null)counts.confidenceCapAvailable++;
  count(counts.wisdom,record.wisdom);
  count(counts.simulation,record.simulation);
  count(counts.stewardship,record.stewardship);
  count(counts.coherenceStatus,record.coherenceStatus);
  count(counts.wisdomSimulation,record.wisdom+" | "+record.simulation);
  for(const [name,present] of Object.entries(record.flags)){
    if(present)count(counts.blockedBy,name);
  }
  const bin=scoreBin(ordinal);
  if(!counts.scoreBuckets[bin])counts.scoreBuckets[bin]={n:0,allowed:0};
  counts.scoreBuckets[bin].n++;
  if(record.allowed)counts.scoreBuckets[bin].allowed++;
}
function summarize(counts){
  assert(counts.n>0);
  return {
    n:counts.n,allowed:counts.allowed,allowedFraction:counts.allowed/counts.n,
    meanEffectiveActionScale:counts.effectiveScaleSum/counts.n,
    rawCoherenceAllowed:counts.coherenceAllowed,
    meanRawCoherenceScale:counts.rawCoherenceScaleSum/counts.n,
    governanceBlockersTotal:counts.governanceBlockerCountSum,
    confidenceCapAvailable:counts.confidenceCapAvailable,
    wisdom:counts.wisdom,simulation:counts.simulation,
    stewardship:counts.stewardship,
    coherenceStatus:counts.coherenceStatus,
    simultaneousBlockerOccurrences:counts.blockedBy,
    wisdomBySimulation:counts.wisdomSimulation,
    ordinalScoreBuckets:counts.scoreBuckets
  };
}
function ordinalForCandidate(candidate,model){
  return clamp(65+20*Math.log(Math.max(candidate.forecast,1e-9)/model.globalCtr),25,95);
}
function sensitivitySweep(row,model){
  const out=[];
  for(let ordinal=25;ordinal<=95;ordinal+=5){
    const pseudoCandidate={action:0,
      forecast:model.globalCtr*Math.exp((ordinal-65)/20)};
    const without=inspectNative(signalDecisionForCandidate(row,pseudoCandidate,model,false));
    const withAssessment=inspectNative(signalDecisionForCandidate(row,pseudoCandidate,model,true));
    out.push({ordinalInput:ordinal,
      noAssessment:{allowed:without.allowed,effectiveScale:without.effectiveScale,
        simulation:without.simulation,wisdom:without.wisdom},
      withEvidence:{allowed:withAssessment.allowed,
        effectiveScale:withAssessment.effectiveScale,
        simulation:withAssessment.simulation,wisdom:withAssessment.wisdom,
        stewardship:withAssessment.stewardship}});
  }
  return out;
}
function selfTest(){
  const row={id:0,timestamp:Date.parse("2019-11-27T12:00:00Z"),
    position:1,action:0,affinities:Array.from({length:N_ARMS},()=>0)};
  const model={globalCtr:.005,rate:Array.from({length:3},()=>
    Array.from({length:N_ARMS},()=>.006))};
  const candidate=chooseCandidate(row,model);
  const no=inspectNative(signalDecisionForCandidate(row,candidate,model,false));
  const yes=inspectNative(signalDecisionForCandidate(row,candidate,model,true));
  assert.equal(typeof no.allowed,"boolean");
  assert.equal(typeof yes.allowed,"boolean");
  assert(no.allowed?no.effectiveScale>0:true);
  assert(yes.allowed?yes.effectiveScale>0:true);
  const result=sensitivitySweep(row,model);
  assert.equal(result.length,15);
  assert(result.every(v=>v.ordinalInput>=25&&v.ordinalInput<=95));
  const cnt=createCounters();
  recordDiagnostic(cnt,yes,ordinalForCandidate(candidate,model));
  assert.equal(summarize(cnt).n,1);
  console.log("SELF_TEST_PASS: native unmodified gate, fail-closed state, ordinal sweep and aggregated blocker counts");
  console.log("No public data, customer outcomes or policy effects evaluated in self test.");
}
async function main(){
  const source=await getDevelopmentOnlyRows();
  const model=fitDevelopmentModel(source.rows);
  const counters={withoutEvidence:createCounters(),withEvidence:createCounters()};
  const ordinals=[];
  let exactFixedReplayChecks=0,syntheticLabelNonLeakageChecks=0;
  for(const row of model.diagnosis){
    const candidate=chooseCandidate(row,model);
    const ordinal=ordinalForCandidate(candidate,model);
    ordinals.push(ordinal);
    const legacy=inspectNative(signalDecisionForCandidate(row,candidate,model,false));
    const governed=inspectNative(signalDecisionForCandidate(row,candidate,model,true));
    recordDiagnostic(counters.withoutEvidence,legacy,ordinal);
    recordDiagnostic(counters.withEvidence,governed,ordinal);
    if(exactFixedReplayChecks<12){
      const again=inspectNative(signalDecisionForCandidate(row,candidate,model,true));
      assert.deepEqual(again,governed,"non-deterministic native gate");
      exactFixedReplayChecks++;
      const syntheticOutcome={...row,reward:1};
      const rerun=inspectNative(signalDecisionForCandidate(syntheticOutcome,candidate,model,true));
      assert.deepEqual(rerun,governed,"diagnostic outcome influenced policy input");
      syntheticLabelNonLeakageChecks++;
    }
  }
  ordinals.sort((a,b)=>a-b);
  const report={
    study:"native-gate-development-mechanism-audit-20261114",
    classification:"DEVELOPMENT_ONLY_CAUSE_DIAGNOSTICS_NO_POLICY_OR_CAUSAL_VALIDATION",
    inputs:{
      pinnedPublisher:SOURCE,pinnedGitCommit:SOURCE_SHA,
      verifiedBlobSha1:source.sha,bytes:source.bytes,
      formerHoldoutRowsExcludedWithoutOutcomeParsing:source.heldoutExcluded,
      modelFitBeforeUTC:new Date(FIT_CUTOFF_MS).toISOString(),
      diagnosticBeforeUTC:new Date(TEST_CUTOFF_MS).toISOString(),
      fitN:model.fitN,fitClicks:model.fitClicks,diagnosticN:model.diagnosis.length,
      featureOnlyRanker:"per-item per-position training CTR + 150 smoothing observations + 0.0005 per past capped affinity",
      nativeAdapter:"exact original published scripts/validation/actual-policy-ope.mjs mapping, not a new tuned policy"
    },
    scoreDistribution:{
      minimum:ordinals[0],median:ordinals[Math.floor(ordinals.length/2)],
      maximum:ordinals[ordinals.length-1]
    },
    nativeGate:{
      withoutEvidence:summarize(counters.withoutEvidence),
      withEvidence:summarize(counters.withEvidence)
    },
    fixedContextOrdinalSensitivity:sensitivitySweep(model.diagnosis[0],model),
    determinism:{exactFixedReplayChecks,syntheticLabelNonLeakageChecks},
    interpretation:[
      "Overlapping blockers may be simultaneously true; these tallies are not causal estimates or necessary/sufficient cause assignments.",
      "The same published domain adaptor used ordinal score inputs, not probabilities or observed net economic utilities.",
      "All diagnostic rows are from the original Nov 27-28 DEVELOPMENT period; Nov 29-30 holdout outcomes and actions are never read by this script.",
      "The ordinal sweep modifies hypothetical candidate score for sensitivity diagnostics only. It does not retune the decision policy or validate that any hypothetical action is beneficial.",
      "A safely abstaining gate can be operationally correct but not economically effective; a new independent randomized software experiment is still required.",
      "No real policy action, production side effect, Workbench access, learning from holdout outcomes or deployment occurred."
    ]
  };
  await mkdir("artifacts/validation",{recursive:true});
  await writeFile(OUT,JSON.stringify(report,null,2)+"\n");
  console.log("PUBLIC SOURCE VERIFIED",report.inputs.verifiedBlobSha1,
    "FIT",report.inputs.fitN,"DIAGNOSTIC",report.inputs.diagnosticN,
    "HOLDOUT LABELS NEVER READ",source.heldoutExcluded);
  for(const [name,stats] of Object.entries(report.nativeGate)){
    console.log(name,"ALLOWED",stats.allowed,"OF",stats.n,
      "WISDOM",JSON.stringify(stats.wisdom),
      "SIMULATION",JSON.stringify(stats.simulation),
      "STEWARDSHIP",JSON.stringify(stats.stewardship),
      "OVERLAPPING BLOCKERS",JSON.stringify(stats.simultaneousBlockerOccurrences));
  }
  console.log("DEVELOPMENT-ONLY DIAGNOSTIC: NO REAL DECISION OR ECONOMIC LIFT PROVEN");
  if(process.env.GITHUB_STEP_SUMMARY){
    const a=report.nativeGate.withEvidence,b=report.nativeGate.withoutEvidence;
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      "## Training-only actual Signal gate mechanism\n\n"+
      "- Pinned source blob: "+source.sha+"\n"+
      "- Development fit: "+model.fitN+"; diagnostic: "+model.diagnosis.length+
        "; former holdout excluded without reading labels: "+source.heldoutExcluded+"\n"+
      "- Allowed without assessment: "+b.allowed+"/"+b.n+
        "; governed: "+a.allowed+"/"+a.n+"\n"+
      "- With-evidence wisdom: "+JSON.stringify(a.wisdom)+
        "; simulation: "+JSON.stringify(a.simulation)+
        "; stewardship: "+JSON.stringify(a.stewardship)+"\n\n"+
      "**Exploratory blocked-action mechanism. No policy utility, causality or deployment claim.**\n");
  }
}
if(process.argv.includes("--self-test"))selfTest();
else await main();
