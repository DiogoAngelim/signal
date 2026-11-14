/**
 * Offline, no-action preflight for aggregate Workbench PRODUCTION readiness.
 * Run only on an independently confirmed Neon project/branch SELECT output.
 * This code can classify supplied counts but CANNOT authenticate their origin.
 *
 * node scripts/validation/workbench-production-cohort-preflight.mjs --self-test
 * node scripts/validation/workbench-production-cohort-preflight.mjs \
 *   --snapshot /secure/aggregate-only-neon-output.json
 *
 * --snapshot accepts exactly one result row or an array of one result row.
 * NEVER supply row-level company data or customer identifiers to this tool.
 */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const OUTPUT="artifacts/validation/workbench-production-cohort-preflight-report.json";
const PROJECT="ancient-sea-71356131";
const BRANCH="br-tiny-glitter-b74qe2zs";
const NUMBERS=[
  "opportunity_count","relationship_count","decision_count","outcome_count",
  "receipt_count","activity_count","saved_oqs_count","signal_event_count",
  "verified_evidence_count","canonical_company_claims","repeated_company_claims",
  "companies_90_days_old","companies_with_terminal_outcome",
  "companies_with_model","companies_with_unverified_usd","companies_with_evidence",
  "companies_with_verified_evidence","companies_with_saved_oqs",
  "companies_with_assessment","companies_with_complete_assessment",
  "companies_with_minimum_shadow_source_inputs","owner_count"
];
const FIELDS=["audited_at","asserted_project_id",
  "asserted_production_branch_id",...NUMBERS,
  "score_table_present","event_table_present"];
const sha=x=>createHash("sha256").update(x).digest("hex");

function singleRow(input){
  const obj=Array.isArray(input)?(assert.equal(input.length,1,
    "exactly one aggregate snapshot row required"),input[0]):input;
  assert(obj&&typeof obj==="object"&&!Array.isArray(obj),
    "aggregate-only snapshot object required");
  assert.deepEqual(Object.keys(obj).sort(),FIELDS.slice().sort(),
    "snapshot schema mismatch: no raw company/person identifiers or outcome rows permitted");
  return obj;
}
function count(value,name){
  assert(typeof value==="string"||typeof value==="number",
    "non-numeric count field "+name);
  assert(/^(0|[1-9][0-9]*)$/.test(String(value)),
    "count must be a nonnegative integer: "+name);
  const n=Number(value);
  assert(Number.isSafeInteger(n),"count exceeds safe integer range: "+name);
  return n;
}
function evaluate(input,sourceBytes){
  const raw=singleRow(input);
  assert.equal(raw.asserted_project_id,PROJECT,"unrecognized claimed project ID");
  assert.equal(raw.asserted_production_branch_id,BRANCH,
    "unrecognized claimed production branch ID");
  assert(typeof raw.audited_at==="string" &&
    Number.isFinite(Date.parse(raw.audited_at)) &&
    /^\d{4}-\d{2}-\d{2}T/.test(raw.audited_at),
    "audited_at must be UTC ISO timestamp");
  const at=Date.parse(raw.audited_at);
  assert(at<=Date.now()+60_000,"future audit timestamp invalid");
  assert(raw.score_table_present===true || raw.score_table_present===false,
    "score_table_present must be a boolean");
  assert(raw.event_table_present===true || raw.event_table_present===false,
    "event_table_present must be a boolean");
  const n=Object.fromEntries(NUMBERS.map(k=>[k,count(raw[k],k)]));
  const company=n.canonical_company_claims, opportunities=n.opportunity_count;
  assert(company<=opportunities,"company groups cannot exceed opportunity count");
  assert(n.repeated_company_claims<=company,"repeated company count invalid");
  assert(n.relationship_count>=company,
    "canonical groups cannot exceed registered relationship count");
  assert(n.companies_90_days_old<=company,"age count invalid");
  assert(n.companies_with_terminal_outcome<=company,"terminal company count invalid");
  assert(n.companies_with_model<=company,"modeled company count invalid");
  assert(n.companies_with_unverified_usd<=company,"USD count invalid");
  assert(n.companies_with_evidence<=company &&
    n.companies_with_verified_evidence<=n.companies_with_evidence,
    "evidence company count invalid");
  assert(n.companies_with_saved_oqs<=company &&
    n.companies_with_assessment<=company &&
    n.companies_with_complete_assessment<=n.companies_with_assessment,
    "assessment/scoring company count invalid");
  assert(n.companies_with_minimum_shadow_source_inputs<=company &&
    n.companies_with_minimum_shadow_source_inputs<=n.companies_with_model &&
    n.companies_with_minimum_shadow_source_inputs<=n.companies_with_verified_evidence &&
    n.companies_with_minimum_shadow_source_inputs<=n.companies_with_saved_oqs &&
    n.companies_with_minimum_shadow_source_inputs<=n.companies_with_complete_assessment,
    "impossible minimum-input intersection count");
  assert(n.owner_count<=company && !(company>0 && n.owner_count===0),
    "owner aggregate inconsistent");
  if(n.saved_oqs_count>0)assert(raw.score_table_present,
    "score rows cannot exist without corresponding table");
  if(n.signal_event_count>0)assert(raw.event_table_present,
    "Signal event rows cannot exist without corresponding table");
  // Repeat counts are not independent sample size; the unit is canonical company.
  const gaps=[];
  if(company===0)gaps.push("no_canonical_company_relationships");
  if(n.companies_with_minimum_shadow_source_inputs===0)
    gaps.push("no_complete_preoutcome_model_evidence_and_assessment");
  if(n.companies_with_model<company)gaps.push("missing_company_economic_models");
  if(n.companies_with_verified_evidence<company)
    gaps.push("missing_verified_preoutcome_evidence");
  if(n.companies_with_saved_oqs<company)gaps.push("missing_saved_opportunity_scores");
  if(n.companies_with_complete_assessment<company)
    gaps.push("missing_complete_six_input_commercial_assessments");
  if(n.companies_with_unverified_usd>0)gaps.push("source_currency_unverified");
  if(n.outcome_count===0 || n.receipt_count===0)
    gaps.push("no_measured_cash_and_cost_complete_net_outcomes");
  if(n.companies_90_days_old===0)gaps.push("no_mature_90_day_company_units");
  if(!raw.score_table_present)gaps.push("acquisition_score_table_not_present");
  if(!raw.event_table_present)gaps.push("signal_event_table_not_present");

  const preoutcome=company===0?"NO_COHORT":
    n.companies_with_minimum_shadow_source_inputs===0?"COHORT_IDENTIFIED_SHADOW_INPUTS_MISSING":
    "POSSIBLE_PREOUTCOME_INPUTS_REQUIRES_INDEPENDENT_REVIEW";
  return {
    classification:"READ_ONLY_AGGREGATE_PRE_TRIAL_FEASIBILITY_NOT_CAUSAL_PROOF",
    source:{
      projectIdClaim:PROJECT,branchIdClaim:BRANCH,
      databaseBranchIndependentlyAuthenticatedByThisScript:false,
      auditedAt:raw.audited_at,
      sourceSnapshotSha256:sha(sourceBytes),
      independentConsentAndCostVerification:false,
      noIndividualBusinessDataReadByScript:true
    },
    totals:{
      opportunityCount:opportunities,registeredRelationshipCount:n.relationship_count,
      canonicalCompanyCount:company,ownerCount:n.owner_count,
      repeatedCompanyCount:n.repeated_company_claims,
      sourceModelCompanyCount:n.companies_with_model,
      verifiedEvidenceCompanyCount:n.companies_with_verified_evidence,
      scoredCompanyCount:n.companies_with_saved_oqs,
      completeAssessmentCompanyCount:n.companies_with_complete_assessment,
      fullPreoutcomeSourceInputsCompanyCount:n.companies_with_minimum_shadow_source_inputs,
      outcomeCount:n.outcome_count,cashReceiptCount:n.receipt_count,
      mature90DayCompanyCount:n.companies_90_days_old,
      tablePresence:{scores:raw.score_table_present,signalEvents:raw.event_table_present}
    },
    preoutcomeFeasibility:preoutcome,
    science:{
      completedTrial:false,realizedProfitEffectObserved:false,
      verifiedIncrementalCausalNetProfitOverOptimizer:false,
      assignmentAndExperimentApproved:false,
      enrollmentAuthorized:false,
      canEnrollNow:false,
      // Even a fully-populated aggregate only indicates a place to start
      // checking independent consent, predecision source and trial power.
      requiresIndependentProvenance:true,
      requiredMissingElements:[
        "Pre-outcome separately frozen baseline and actual Signal engine proposals, with evidence provenance and native veto records",
        "Actual independent qualified cohort, consent and canonical relationship-level interference checks",
        "Measured baseline-only USD net contribution variance and prospective study power",
        "External human/ethics approval, external assignment key and manifest custody",
        "Mature randomized observed income and all costs with independently reconciled receipt ledger"
      ]
    },
    observedReadinessGaps:gaps
  };
}

const fixture=(updates={})=>({
  audited_at:"2026-11-14T13:54:09.741Z",
  asserted_project_id:PROJECT, asserted_production_branch_id:BRANCH,
  opportunity_count:"11",relationship_count:"10",decision_count:"0",
  outcome_count:"0",receipt_count:"0",activity_count:"0",saved_oqs_count:"0",
  signal_event_count:"0",verified_evidence_count:"0",
  canonical_company_claims:"10",repeated_company_claims:"1",
  companies_90_days_old:"0",companies_with_terminal_outcome:"0",
  companies_with_model:"0",companies_with_unverified_usd:"0",
  companies_with_evidence:"0",companies_with_verified_evidence:"0",
  companies_with_saved_oqs:"0",companies_with_assessment:"0",
  companies_with_complete_assessment:"0",
  companies_with_minimum_shadow_source_inputs:"0",owner_count:"1",
  score_table_present:true,event_table_present:true,...updates
});

function selfTest(){
  const raw=fixture(),source=JSON.stringify([raw]);
  const p=evaluate([raw],source);
  assert.equal(p.totals.canonicalCompanyCount,10);
  assert.equal(p.totals.repeatedCompanyCount,1);
  assert.equal(p.preoutcomeFeasibility,"COHORT_IDENTIFIED_SHADOW_INPUTS_MISSING");
  assert.equal(p.science.canEnrollNow,false);
  assert.equal(p.science.verifiedIncrementalCausalNetProfitOverOptimizer,false);
  assert(p.observedReadinessGaps.includes("missing_company_economic_models"));
  assert.deepEqual(evaluate([raw],source),p);
  const empty=fixture({opportunity_count:"0",relationship_count:"0",
    canonical_company_claims:"0",repeated_company_claims:"0",
    owner_count:"0"});
  assert.equal(evaluate(empty,JSON.stringify(empty)).preoutcomeFeasibility,"NO_COHORT");
  const filled=fixture({companies_with_model:"10",
    companies_with_evidence:"10",companies_with_verified_evidence:"10",
    companies_with_saved_oqs:"10",companies_with_assessment:"10",
    companies_with_complete_assessment:"10",
    companies_with_minimum_shadow_source_inputs:"10",saved_oqs_count:"10",
    verified_evidence_count:"10"});
  const future=evaluate(filled,JSON.stringify(filled));
  assert.equal(future.preoutcomeFeasibility,
    "POSSIBLE_PREOUTCOME_INPUTS_REQUIRES_INDEPENDENT_REVIEW");
  assert.equal(future.science.canEnrollNow,false);
  assert.throws(()=>evaluate({...raw,relationship_name:"PRIVATE"},source),
    /snapshot schema mismatch/);
  assert.throws(()=>evaluate(fixture({canonical_company_claims:"11"}),source),
    /registered relationship count/);
  assert.throws(()=>evaluate(fixture({companies_with_complete_assessment:"2"}),source),
    /assessment\/scoring company/);
  assert.throws(()=>evaluate(fixture({companies_with_minimum_shadow_source_inputs:"1"}),source),
    /intersection count/);
  assert.throws(()=>evaluate(fixture({asserted_production_branch_id:"development"}),source),
    /claimed production branch/);
  assert.throws(()=>evaluate(fixture({opportunity_count:"1.5"}),source),
    /nonnegative integer/);
  assert.throws(()=>evaluate(fixture({receipt_count:null}),source),
    /non-numeric count/);
  console.log("SELF_TEST_PASS: strict aggregate-only production cohort preflight; source branch and company independence boundaries; no silent enrollment or positive profit");
}

async function main(){
  const argv=process.argv.slice(2);
  if(argv.includes("--self-test"))return selfTest();
  const i=argv.indexOf("--snapshot");
  assert(i>=0&&argv[i+1],"usage: --snapshot aggregate-only-Neon-JSON.json");
  const source=await readFile(argv[i+1],"utf8");
  assert(Buffer.byteLength(source,"utf8")<50_000,
    "aggregate-only snapshot too large; refuse individual record data");
  const report=evaluate(JSON.parse(source),source);
  await mkdir("artifacts/validation",{recursive:true});
  await writeFile(OUTPUT,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({result:report.preoutcomeFeasibility,
    canonicalCompanies:report.totals.canonicalCompanyCount,
    sourceCompleteCompanies:report.totals.fullPreoutcomeSourceInputsCompanyCount,
    observedOutcomes:report.totals.outcomeCount,
    canEnroll:report.science.canEnrollNow,
    caveat:"No source authenticity, randomized software deployment or causal net profit was verified."},null,2));
}
await main();
