/**
 * Historical JTPA randomized earnings policy test: pinned academic replication
 * Preregistration: docs/case-studies/jtpa-academic-rct-policy-prereg-2026-11-14.md
 *
 * Uses real @signal/decision evaluateQuantitativeDecision; NOT an online
 * randomized deployment of Signal. Only the assignment instrument is randomized.
 * Outcome "earnings" is gross participant earnings (not social net benefit).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import signalDecision from "../../packages/decision/dist/index.js";

const { evaluateQuantitativeDecision }=signalDecision;
assert.equal(typeof evaluateQuantitativeDecision,"function");
const REVISION = "e98d6cba1853b607e16e63d29aff7635f04b47ad";
const EXPECTED_GIT_BLOB_SHA1 = "c26124a0716b5d7b44c2c357087c7136752a0aa7";
const EXPECTED_BYTES = 658746;
const SOURCE_URL = "https://raw.githubusercontent.com/nppackages-replication/CJM_2024_JOE/" +
  REVISION + "/jtpa.csv";
const EXPECTED_ROWS=9223;
const BOOT_SEED=20261114, BOOT_REPS=2000, TRAIN_SHARE=0.4;
const PRIOR_N=300, Z=1.96, PENALTY=0.5;
const STUDY = "jtpa-academic-pinned-risk-policy-20261114-v1";
const OUT="artifacts/validation/jtpa-academic-economic-report.json";
const PREREG="docs/case-studies/jtpa-academic-rct-policy-prereg-2026-11-14.md";
const ARM_IDS=["not_offered","offered"];
const SEGMENTS=[0,1];
const STATE_PROBS=[0.25,0.50,0.25];
const ci95=(point,se)=>[point-1.959963984540054*se,point+1.959963984540054*se];
const rand=(seed)=>{
  let state=seed>>>0;
  return ()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/4294967296);
};
function erfc(x){
  const z=Math.abs(x), t=1/(1+0.5*z);
  const a=t*Math.exp(-z*z-1.26551223+
    t*(1.00002368+t*(0.37409196+t*(0.09678418+
    t*(-0.18628806+t*(0.27886807+t*(-1.13520398+
    t*(1.48851587+t*(-0.82215223+t*0.17087277)))))))));
  return x>=0?a:2-a;
}
function percentile(values,q){
  const sorted=[...values].sort((a,b)=>a-b);
  const x=q*(sorted.length-1),a=Math.floor(x),b=Math.ceil(x);
  return sorted[a]+(sorted[b]-sorted[a])*(x-a);
}
function bootstrapInterval(draws){return [percentile(draws,.025),percentile(draws,.975)];}
function parseCsv(line){
  const out=[];let tok="",quoted=false;
  for(let i=0;i<line.length;i++){
    if(line[i]==='"'){
      if(quoted&&line[i+1]==='"'){tok+='"';i++;}
      else quoted=!quoted;
    }else if(line[i]===","&&!quoted){
      out.push(tok);tok="";
    }else tok+=line[i];
  }
  assert(!quoted,"unterminated CSV quotation");
  out.push(tok);return out;
}
function number(v,field,lower,upper){
  assert(v!==undefined&&String(v).trim()!=="","missing required field "+field);
  const n=Number(v);
  assert(Number.isFinite(n)&&n>=lower&&n<=upper,"invalid field "+field);
  return n;
}
function partition(i){
  const key=createHash("sha256").update("signal-jtpa-academic-20261114-v1:"+i).digest("hex");
  return parseInt(key.slice(0,8),16)/4294967296<TRAIN_SHARE?"train":"test";
}
async function downloadSource(){
  const res=await fetch(SOURCE_URL,{
    headers:{Accept:"text/plain,text/csv,application/octet-stream"},
    signal:AbortSignal.timeout(120000)
  });
  assert(res.ok, "immutable scholarly CSV unavailable: HTTP "+res.status);
  const bytes=Buffer.from(await res.arrayBuffer());
  assert.equal(bytes.length,EXPECTED_BYTES,"academic source file size mismatch");
  const gitBlob=createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
  assert.equal(gitBlob,EXPECTED_GIT_BLOB_SHA1,"pinned scholarly Git-blob mismatch");
  const sha256=createHash("sha256").update(bytes).digest("hex");
  return {url:SOURCE_URL,gitBlob,sha256,bytes:bytes.length,text:bytes.toString("utf8")};
}
function parseData(text){
  const lines=text.replace(/^\uFEFF/,"").trim().split(/\r?\n/);
  assert.equal(lines.length-1,EXPECTED_ROWS,"unexpected participant row count");
  const header=parseCsv(lines[0]).map(k=>k.toLowerCase().trim());
  const expected=["v1","income","instrument","treatment","male","hsorged",
    "black","hispanic","married","wkless13","afdc","age2225","age2629",
    "age3035","age3644","age4554","class_tr","ojt_jsa","f2sms","logincome","nonwhite"];
  assert.deepEqual(header,expected,"unexpected academic JTPA CSV schema");
  const idx=new Map(header.map((k,i)=>[k,i]));
  const out=[];
  for(let i=1;i<lines.length;i++){
    const cells=parseCsv(lines[i]);
    assert.equal(cells.length,21,"invalid row column count");
    const v=k=>cells[idx.get(k)];
    const row={
      fold:partition(i-1),
      male:number(v("male"),"male",0,1),
      married:number(v("married"),"married",0,1),
      age2225:number(v("age2225"),"age2225",0,1),
      hsorged:number(v("hsorged"),"hsorged",0,1),
      z2:number(v("instrument"),"randomized instrument",0,1),
      d2:number(v("treatment"),"nonrandomized enrollment",0,1),
      earnings:number(v("income"),"30-month earnings",0,10000000)
    };
    for(const key of ["male","married","age2225","hsorged","z2","d2"])
      assert(Number.isInteger(row[key]),"not a binary source value "+key);
    out.push(row);
  }
  return out;
}
function stats(values){
  assert(values.length>=2);
  const n=values.length,sum=values.reduce((a,b)=>a+b,0),mean=sum/n;
  const variance=values.reduce((acc,v)=>acc+(v-mean)**2,0)/(n-1);
  return {n,mean,variance,sd:Math.sqrt(variance)};
}
function buildGroups(rows){
  const groups=new Map(SEGMENTS.map(g=>[g,{n:0,arms:[[],[]],covariates:[[],[]]}]));
  for(const r of rows){
    const group=groups.get(r.hsorged);
    assert(group,"unexpected preearn segment");
    group.arms[r.z2].push(r.earnings);
    group.covariates[r.z2].push({sex:r.sex,edu:r.edu,prevearn:r.prevearn,d2:r.d2});
    group.n++;
  }
  return groups;
}
function meanDiffBalance(groups,keys){
  return Object.fromEntries(keys.map(k=>{
    const all=[0,1].map(a=>Array.from(groups.values()).flatMap(g=>g.covariates[a]).map(x=>x[k]));
    const A=stats(all[0]),B=stats(all[1]);
    const denom=Math.sqrt((A.variance+B.variance)/2);
    return [k,{noOfferMean:A.mean,offerMean:B.mean,smd:denom?(B.mean-A.mean)/denom:0}];
  }));
}
function fitPolicies(train){
  const groups=buildGroups(train);
  const totals=[0,1].map(a=>stats(Array.from(groups.values()).flatMap(g=>g.arms[a])));
  assert(totals.every(s=>s.n>=100),"global training group insufficient");
  const globalArgmax=totals[0].mean>=totals[1].mean?0:1;
  const configurations=[];
  for(const seg of SEGMENTS){
    const group=groups.get(seg);
    assert(group.arms.every(a=>a.length>=30),"insufficient train randomized group in segment "+seg);
    const items=[0,1].map(a=>{
      const local=stats(group.arms[a]),global=totals[a];
      const weight=local.n/(local.n+PRIOR_N);
      const m=weight*local.mean+(1-weight)*global.mean;
      // Deliberately heuristic; within-global covariance is omitted.
      const heuristicSE=Math.sqrt(weight*weight*local.variance/local.n+
        (1-weight)*(1-weight)*global.variance/global.n);
      return {arm:ARM_IDS[a],n:local.n,shrunkMean:m,heuristicSE};
    });
    const actions=items.map((a,index)=>({
      id:ARM_IDS[index],upfrontCost:0,opportunityCost:0,
      payoffs:[
        {stateId:"low",amount:a.shrunkMean-Z*a.heuristicSE},
        {stateId:"central",amount:a.shrunkMean},
        {stateId:"high",amount:a.shrunkMean+Z*a.heuristicSE}
      ]
    }));
    const model={
      modelVersion:STUDY+"-segment-"+seg,
      unit:"observed gross 30-month earnings USD per randomized participant",
      probabilityEvidence:"estimated",
      states:["low","central","high"].map((id,i)=>({id,probability:STATE_PROBS[i]})),
      actions,
      riskPolicy:{tailMass:.25,downsidePenalty:PENALTY}
    };
    const selected=evaluateQuantitativeDecision(model);
    const withoutRisk=evaluateQuantitativeDecision({
      ...model,modelVersion:model.modelVersion+"-risk-zero",
      riskPolicy:{tailMass:.25,downsidePenalty:0}
    });
    assert.equal(selected.status,"recommended");
    assert.equal(withoutRisk.status,"recommended");
    const contextual=items[0].shrunkMean>=items[1].shrunkMean?0:1;
    assert.equal(withoutRisk.recommendedActionId,ARM_IDS[contextual],
      "zero-risk Signal must match conventional contextual argmax");
    for(let a=0;a<2;a++){
      const expected=items[a].shrunkMean - PENALTY*Z*items[a].heuristicSE;
      assert(Math.abs(selected.actions[a].objectiveValue-expected)<1e-7,
        "native Signal objective inconsistent with preregistration");
    }
    const signal=ARM_IDS.indexOf(selected.recommendedActionId);
    assert(signal>=0,"invalid native selected action");
    configurations.push({segment:seg,trainingN:group.n,
      inputs:items,signal,global:globalArgmax,contextual,
      selectedByRealSignal:selected.recommendedActionId,
      zeroRiskSignal:withoutRisk.recommendedActionId,
      objective:selected.actions.map(r=>r.objectiveValue)});
  }
  return {configurations,globalTrainingArms:totals.map((a,i)=>({
    action:ARM_IDS[i],n:a.n,mean:a.mean,sd:a.sd
  })),globalArgmax:ARM_IDS[globalArgmax]};
}
function comparison(policy,other,fit,groups){
  const n=Array.from(groups.values()).reduce((s,g)=>s+g.n,0);
  let diff=0,varEst=0,disagreementN=0;
  const details=[];
  for(const conf of fit.configurations){
    const group=groups.get(conf.segment);
    assert(group.arms.every(a=>a.length>=30),"insufficient TEST assigned subjects in segment "+conf.segment);
    const a=conf[policy],b=conf[other],w=group.n/n;
    if(a!==b){
      const A=stats(group.arms[a]),B=stats(group.arms[b]);
      const groupDiff=A.mean-B.mean;
      diff+=w*groupDiff;
      varEst+=w*w*(A.variance/A.n+B.variance/B.n);
      disagreementN+=group.n;
      details.push({segment:conf.segment,n:group.n,
        policyAction:ARM_IDS[a],baselineAction:ARM_IDS[b],
        observedDifference:groupDiff,weightedContribution:w*groupDiff});
    }else{
      details.push({segment:conf.segment,n:group.n,
        policyAction:ARM_IDS[a],baselineAction:ARM_IDS[b],
        observedDifference:0,weightedContribution:0});
    }
  }
  const se=Math.sqrt(varEst);
  return {policy,baseline:other,differenceUSD:diff,seUSD:se,
    ci95:ci95(diff,se),pTwoSided:se>0?erfc(Math.abs(diff/se)/Math.SQRT2):1,
    disagreementN,disagreementRate:disagreementN/n,details,
    unit:"30-month gross earnings USD per participant",
    estimator:"randomized intent-to-treat covariate-stratified mean contrast"};
}
function value(policy,fit,groups){
  const n=Array.from(groups.values()).reduce((s,g)=>s+g.n,0);
  let mean=0,varEstimate=0;
  const details=[];
  for(const conf of fit.configurations){
    const group=groups.get(conf.segment);
    assert(group.arms.every(a=>a.length>=30),"test support insufficient");
    const s=stats(group.arms[conf[policy]]);
    const weight=group.n/n;
    mean+=weight*s.mean;
    varEstimate+=weight*weight*s.variance/s.n;
    details.push({segment:conf.segment,action:ARM_IDS[conf[policy]],
      cellN:group.n,observedTreatmentN:s.n,meanUSD:s.mean});
  }
  return {policy,valueUSD:mean,seUSD:Math.sqrt(varEstimate),details};
}
function pairedBootstrap(policy,other,fit,groups){
  const n=Array.from(groups.values()).reduce((s,g)=>s+g.n,0);
  const diffGroups=fit.configurations.filter(c=>c[policy]!==c[other])
    .map(conf=>{
      const g=groups.get(conf.segment);
      return {weight:g.n/n,x:g.arms[conf[policy]],y:g.arms[conf[other]]};
    });
  if(!diffGroups.length)return {replicates:BOOT_REPS,seed:BOOT_SEED,ci95:[0,0],identicalPolicy:true};
  const next=rand(BOOT_SEED), draws=[];
  for(let i=0;i<BOOT_REPS;i++){
    let sum=0;
    for(const c of diffGroups){
      let x=0,y=0;
      for(let j=0;j<c.x.length;j++)x+=c.x[Math.floor(next()*c.x.length)];
      for(let j=0;j<c.y.length;j++)y+=c.y[Math.floor(next()*c.y.length)];
      sum+=c.weight*(x/c.x.length-y/c.y.length);
    }
    draws.push(sum);
  }
  return {replicates:BOOT_REPS,seed:BOOT_SEED,
    ci95:bootstrapInterval(draws),identicalPolicy:false,
    method:"paired within-(preprogram education stratum x randomized assignment) customer bootstrap"};
}
function selfTest(){
  assert.equal(partition(123),partition(123));
  assert.deepEqual(parseCsv("a,\"b,c\",d"),["a","b,c","d"]);
  const train=[],test=[];
  for(let seg=0;seg<=1;seg++){
    for(let arm=0;arm<=1;arm++){
      for(let i=0;i<140;i++){
        const r={hsorged:seg,z2:arm,earnings:2000+400*arm+250*seg+100*(i%5),
          sex:i%2,edu:12,prevearn:500*seg,d2:arm};
        train.push(r);test.push({...r});
      }
    }
  }
  const fit=fitPolicies(train),groups=buildGroups(test);
  assert.equal(fit.configurations.length,2);
  const eq=comparison("signal","signal",fit,groups);
  assert.equal(eq.differenceUSD,0);
  assert.deepEqual(eq.ci95,[0,0]);
  assert.deepEqual(pairedBootstrap("signal","signal",fit,groups).ci95,[0,0]);
  const alt=comparison("signal","contextual",fit,groups);
  assert(Number.isFinite(alt.differenceUSD));
  assert(Math.abs(erfc(0)-1)<1e-6);
  console.log("SELF_TEST_PASS: actual Signal optimization, fixed parameters, zero-penalty conventional control and paired comparison");
}
async function main(){
  const source=await downloadSource(),data=parseData(source.text);
  const train=data.filter(x=>x.fold==="train"),test=data.filter(x=>x.fold==="test");
  assert(train.length>3000&&test.length>5000,"unexpected frozen split");
  const fit=fitPolicies(train),groups=buildGroups(test);
  const primary=comparison("signal","global",fit,groups);
  const boot=pairedBootstrap("signal","global",fit,groups);
  const secondary=comparison("signal","contextual",fit,groups);
  const vsOffer=(function(){
    const ff={...fit,configurations:fit.configurations.map(c=>({...c,allOffered:1}))};
    return comparison("signal","allOffered",ff,groups);
  })();
  const vsNoOffer=(function(){
    const ff={...fit,configurations:fit.configurations.map(c=>({...c,neverOffered:0}))};
    return comparison("signal","neverOffered",ff,groups);
  })();
  const values=Object.fromEntries(["signal","global","contextual"].map(k=>
    [k,value(k,fit,groups)]));
  const pass=primary.disagreementN>0&&primary.differenceUSD>=500&&
    primary.ci95[0]>250&&primary.pTwoSided<.05&&boot.ci95[0]>0;
  const testGroupCounts=Object.fromEntries(SEGMENTS.map(seg=>{
    const g=groups.get(seg);
    return [String(seg),{n:g.n,assignmentCounts:g.arms.map(a=>a.length)}];
  }));
  const sourceProvenance={
    academicRepository:"nppackages-replication/CJM_2024_JOE",
    academicReference:"Cattaneo, Jansson & Ma (2024), Journal of Econometrics",
    originalTrial:"Job Training Partnership Act, early 1990s",
    frozenGitCommit:REVISION,file:"jtpa.csv",source:source.url,
    expectedGitBlobSha1:EXPECTED_GIT_BLOB_SHA1,observedGitBlobSha1:source.gitBlob,
    observedSha256:source.sha256,
    bytes:source.bytes,allRecords:data.length,trainN:train.length,testN:test.length
  };
  
const report={
    study:STUDY,preregistration:PREREG,
    status:"INDEPENDENT_HISTORICAL_RCT_DATASET_NOT_RANDOMIZED_SIGNAL_SOFTWARE",
    source:sourceProvenance,
    intervention:{
      randomizedVariable:"instrument (randomized offer assignment)",notTreatment:"treatment (actual take-up, not randomized)",
      outcome:"30-month actual participant earnings USD; NOT measured program net profit",
      preTreatmentPolicyFeature:"hsorged (preprogram diploma or GED; no protected-attribute policy targeting)",
      nativeApi:"@signal/decision evaluateQuantitativeDecision",
      policyDefinition:"three-state ranker m-0.98*heuristic_SE, priorN=300, riskPenalty=0.5",
      noSignalExecutionInOriginalTrial:true
    },
    training:{
      globalArms:fit.globalTrainingArms,globalConventionalAction:fit.globalArgmax,
      groups:fit.configurations
    },
    integrity:{
      testCounts:testGroupCounts,allAssignmentCounts:[
        data.filter(r=>r.z2===0).length,data.filter(r=>r.z2===1).length
      ],
      baselineStandardizedMeanDifferences:meanDiffBalance(buildGroups(data),
        ["male","married","age2225"]),
      missingRows:0,missingOutcomeRows:0
    },
    results:{
      primary:{...primary,bootstrap:boot,
        preregisteredMinimum:{pointUSD:500,normalLowerUSD:250,pTwoSided:.05,bootstrapLowerUSD:0},
        passesPreregisteredPracticalAndStatisticalGate:pass,
        verdict:pass?"EXTERNAL_RCT_SUPPORTS_SPECIFIED_POLICY_VALUE_NOT_SOFTWARE_ATTRIBUTION":
          "NO_INDEPENDENT_PROOF_OF_SIGNAL_POLICY_SUPERIORITY"},
      secondarySignalMinusContextual:secondary,
      secondarySignalMinusAlwaysOffer:vsOffer,
      secondarySignalMinusNeverOffer:vsNoOffer,
      policyValues:values
    },
    interpretation:{
      policyRuleCausalContrastIdentifiableAssumingRandomizedAssignment:true,
      signalSoftwareEffectIdentifiable:false,
      socialNetValueIdentifiable:false,
      economicCostMeasured:false,
      actualSignalDeployment:false,
      authorizationToDeploy:false,
      limitations:[
        "Historical randomized offer assignment is not randomized use of Signal software.",
        "Training offer assignment (Z2) must not be confused with actual nonrandomized participation D2.",
        "Gross 30-month labor earnings are NOT social profits, do not include job-program delivery or participant costs.",
        "The risk penalization states and heuristic standard errors are application-defined; model does not prove their calibration.",
        "The trial population and selection/attrition cannot be audited beyond the archived sample.",
        "No unique Signal implementation advantage; a conventional program could implement identical risk preferences.",
        "One external historical test, not live 2026 Workbench operational validation."
      ]
    }
  };
  await mkdir("artifacts/validation",{recursive:true});
  await writeFile(OUT,JSON.stringify(report,null,2)+"\n");
  console.log("SOURCE VERIFIED GIT_BLOB",source.gitBlob,"SHA256",source.sha256,
    "N",data.length,"TRAIN",train.length,"TEST",test.length);
  console.log("TRAINING GROUPS",JSON.stringify(fit.configurations.map(c=>
    ({segment:c.segment,signal:ARM_IDS[c.signal],global:ARM_IDS[c.global],
      contextual:ARM_IDS[c.contextual],n:c.trainingN}))));
  console.log("POLICY VALUES",JSON.stringify(Object.fromEntries(
    Object.entries(values).map(([k,v])=>[k,v.valueUSD]))));
  console.log("PRIMARY SIGNAL MINUS GLOBAL",JSON.stringify(report.results.primary));
  console.log("SECONDARY SIGNAL MINUS CONTEXTUAL",JSON.stringify(secondary));
  console.log("FINAL VERDICT",report.results.primary.verdict);
  console.log("NOT A SOFTWARE RANDOMIZED TRIAL; NO OBSERVED NET PROFIT");
  if(process.env.GITHUB_STEP_SUMMARY){
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      "## External JTPA randomized assignment, observed 30-month earnings\n"+
      "- Dataset academic pinned Git blob: "+source.gitBlob+"; source N="+data.length+"\n"+
      "- Train N="+train.length+"; randomized holdout N="+test.length+"\n"+
      "- Primary Signal-minus-global USD/person: "+primary.differenceUSD+
      "; CI95: "+JSON.stringify(primary.ci95)+
      "; p="+primary.pTwoSided+"\n"+
      "- Bootstrap CI95: "+JSON.stringify(boot.ci95)+"\n"+
      "- Preregistered verdict: **"+report.results.primary.verdict+"**\n"+
      "- **No Signal-software randomization or measured net benefit.**\n");
  }
}
if(process.argv.includes("--self-test"))selfTest();
else await main();
