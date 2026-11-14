/**
 * Reproducible offline evaluation of real Karlan & List 2007 randomized DONOR
 * receipts using actual Signal QuantitativeDecision API, not a copied heuristic.
 * SOURCE pinned to publicly available source git commit and SHA256; no raw
 * donor rows leave the runner; no behavior is changed.
 *
 * Important: the outcome is real donated dollars, NOT charity net profit.
 * Solicitation and matching program all-in costs are unobserved, software not
 * randomized, and native Signal domain/evidence gate cannot be evaluated.
 *
 * Run after building packages/decision:
 * node scripts/validation/karlan-real-donation-policy.mjs --self-test
 * node scripts/validation/karlan-real-donation-policy.mjs /private/statadata.csv
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import decision from "../../packages/decision/dist/index.js";
const { evaluateQuantitativeDecision }=decision;
assert.equal(typeof evaluateQuantitativeDecision,"function","Actual Signal API absent");
const SOURCE_HASH="9cfcee8260889663456b8bdec122b737d16fc746dc05a54a9b46d1821c32d18d";
const SOURCE_COMMIT="c0e2e8211a57d18239c7017dd57f7f57ef73becd";
const N=50083;
const ARMS={control:16687,match:33396};
const TRAIN_FRACTION=0.6;
const TAIL=0.1,PENALTY=0.5,BOOT=1000,SEED=20261114;
const POLICY_VERSION="signal-karlan-research-frozen-20261114-v1";
const UNIT="USD observed donation receipts per randomized mailed donor";
const OUTPUT="artifacts/validation/karlan-real-donation-policy-value.json";
const sha=s=>createHash("sha256").update(s).digest("hex");
const finite=(x,name)=>{const n=Number(x);assert(typeof x==="string"&&x.trim()!==""&&Number.isFinite(n),name+" invalid");return n;};
const kbin=(s,limit1,limit2)=>{if(s===""||!Number.isFinite(Number(s)))return "missing";const x=Number(s);return x<=limit1?"low":x<=limit2?"mid":"high";};
const key=r=>"hpa:"+kbin(r.hpa,25,100)+"|freq:"+kbin(r.freq,4,4)+"|dormant:"+(r.dormant==="0"?"0":r.dormant==="1"?"1":"missing");
function readReal(s,strict=true){
  if(strict)assert.equal(sha(s),SOURCE_HASH,"real donor file checksum mismatch; stop before looking at outcomes");
  assert(Buffer.byteLength(s,"utf8")<25*1024*1024,"unexpected source size");
  const lines=s.trim().split(/\r?\n/);
  assert.equal(lines.length-1,strict?N:lines.length-1,"source RCT record count mismatch");
  const heads=lines[0].split(",");
  assert(heads.length>=40 && new Set(heads).size===heads.length,"unexpected data schema");
  for(const name of ["treatment","amount","hpa","freq","dormant","gave"])assert(heads.includes(name),"missing verified source field "+name);
  const ix=Object.fromEntries(heads.map((x,i)=>[x,i]));
  const data=[],count={control:0,match:0},donorCount={control:0,match:0};
  for(let i=1;i<lines.length;i++){
    const arr=lines[i].split(",");
    assert(arr.length===heads.length,"unsupported quoted/multiline CSV; fail closed (no fabricated rows)");
    const a=arr[ix.treatment],amount=finite(arr[ix.amount],"observed donation amount");
    assert(a==="0"||a==="1","randomized treatment arm must be 0 or 1");
    assert(amount>=0&&amount<1e7,"negative/unreasonable donation receipt; stop for adjudication");
    const tr=a==="1"?"match":"control";
    count[tr]++;
    donorCount[tr]+=Number(amount>0);
    const r={
      arm:tr,amount,
      hpa:arr[ix.hpa],freq:arr[ix.freq],dormant:arr[ix.dormant],
      gave:arr[ix.gave],id:i
    };
    data.push({ ...r,key:key(r),
      train:Number.parseInt(sha(POLICY_VERSION+"|"+i).slice(0,8),16)/4294967296<TRAIN_FRACTION});
  }
  if(strict)assert.deepEqual(count,ARMS,"published arm counts do not match");
  return {data,count,donorCount};
}
const blank=()=>({n:0,sum:0,p:[0,0,0],binAmount:[0,0,0]});
const bin=y=>y===0?0:y<=25?1:2;
function buildModels(train){
  const stats=new Map(),global={control:blank(),match:blank()};
  for(const row of train){
    const key=row.key;
    if(!stats.has(key))stats.set(key,{control:blank(),match:blank()});
    for(const st of [stats.get(key)[row.arm],global[row.arm]]){
      st.n++; st.sum+=row.amount;
      const b=bin(row.amount);st.p[b]++;st.binAmount[b]+=row.amount;
    }
  }
  assert(global.control.n>1000&&global.match.n>1000,"insufficient randomized pre-outcome training-arm support");
  const models=new Map(),riskBenchmark=new Map(),globalMean={control:global.control.sum/global.control.n,match:global.match.sum/global.match.n};
  for(const [k,rowStats] of stats){
    const armDist={};
    for(const arm of ["control","match"]){
      // A fixed 100-equivalent-sample shrinkage avoids noise in small cells.
      const a=rowStats[arm],g=global[arm],n=a.n+100;
      const prior=g.p.map(v=>100*v/g.n);
      const p=a.p.map((v,j)=>(v+prior[j])/n);
      const avg=a.binAmount.map((v,j)=>{
        const gMeanBin=g.p[j]>0?g.binAmount[j]/g.p[j]:0;
        return (v+prior[j]*gMeanBin)/(a.p[j]+prior[j]||1);
      });
      assert(Math.abs(p.reduce((x,y)=>x+y,0)-1)<1e-10);
      armDist[arm]={p,avg};
    }
    // Joint potential outcomes NOT identifiable by RCT; product-coupling only
    // encodes the two observed marginal distributions. Per-action EU/CVaR are
    // invariant to the unobserved cross-action dependence.
    const states=[],actions=[{id:"control",payoffs:[]},{id:"match",payoffs:[]}];
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){
      const id="c"+i+"m"+j;
      states.push({id,probability:armDist.control.p[i]*armDist.match.p[j]});
      actions[0].payoffs.push({stateId:id,amount:armDist.control.avg[i]});
      actions[1].payoffs.push({stateId:id,amount:armDist.match.avg[j]});
    }
    const model={modelVersion:POLICY_VERSION,unit:UNIT,
      probabilityEvidence:"estimated",
      states,actions,
      riskPolicy:{tailMass:TAIL,downsidePenalty:PENALTY}};
    const native=evaluateQuantitativeDecision(model);
    assert.equal(native.status,"recommended");
    const best=metric=>native.actions.reduce((p,c)=>c[metric]>p[metric]+1e-10?c:p).actionId;
    const expected=best("expectedUtility");
    const risk=best("objectiveValue");
    // Independently recompute and assert exact native score parity
    const sorted=actions.map((a,idx)=>{
      const outcome=states.map((state,i)=>({p:state.probability,y:a.payoffs[i].amount})).sort((x,y)=>x.y-y.y);
      let mass=TAIL,tail=0,mean=0;
      for(const o of outcome)mean+=o.p*o.y;
      for(const o of outcome){const take=Math.min(o.p,mass);tail+=take*o.y;mass-=take;if(mass<1e-10)break;}
      const obj=mean-PENALTY*Math.max(0,mean-tail/TAIL);
      assert(Math.abs(native.actions[idx].expectedUtility-mean)<1e-7);
      assert(Math.abs(native.actions[idx].objectiveValue-obj)<1e-7);
      return {id:a.id,mean,obj};
    });
    const independentRisk=[...sorted].sort((a,b)=>b.obj-a.obj||a.id.localeCompare(b.id))[0].id;
    assert.equal(risk,independentRisk,"Signal vs equally informed conventional risk optimizer disagree; invalid mathematical baseline");
    assert.equal(native.recommendedActionId,risk);
    models.set(k,{signal:risk,conventionalRisk:independentRisk,conventionalMean:expected,armMeans:Object.fromEntries(native.actions.map(a=>[a.actionId,a.expectedUtility]))});
  }
  return {models,globalMean,trainN:train.length};
}
function prng(seed){let s=seed>>>0;return ()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};}
function value(test,models){
  const policyNames=["signal","conventionalRisk","conventionalMean","alwaysMatch","alwaysControl","loggedRandom"];
  const vals=Object.fromEntries(policyNames.map(p=>[p,{sum:0,sumW:0,sumW2:0,sumWY:0}]));
  const obs=[];
  for(const r of test){
    const m=models.get(r.key);
    if(!m)throw Error("unseen holdout stratum; no test outcome-based model fallbacks allowed");
    const row={};const pi=r.arm==="match"?2/3:1/3;
    for(const p of policyNames){
      const action=p==="alwaysMatch"?"match":p==="alwaysControl"?"control":p==="loggedRandom"?r.arm:m[p];
      const w=p==="loggedRandom"?1:Number(r.arm===action)/pi;
      const z=w*r.amount,stats=vals[p];
      stats.sum+=z;stats.sumW+=w;stats.sumW2+=w*w;stats.sumWY+=w*r.amount;
      row[p]=z;
    }
    obs.push(row);
  }
  for(const p of policyNames) {
    vals[p].ipsUsdPerDonor=vals[p].sum/test.length;
    vals[p].snipsUsdPerDonor=vals[p].sumWY/vals[p].sumW;
    vals[p].importanceESS=vals[p].sumW**2/vals[p].sumW2;
    delete vals[p].sum;delete vals[p].sumW;delete vals[p].sumW2;delete vals[p].sumWY;
  }
  const paired=(left,right)=>{
    const d=obs.map(r=>r[left]-r[right]);
    const mean=d.reduce((s,v)=>s+v,0)/d.length;
    const rng=prng(SEED);
    const replicas=[];
    for(let b=0;b<BOOT;b++){
      let sum=0;
      for(let j=0;j<d.length;j++)sum+=d[Math.floor(rng()*d.length)];
      replicas.push(sum/d.length);
    }
    replicas.sort((a,b)=>a-b);
    return {differenceUsdPerDonor:mean,bootstrap95:[replicas[Math.floor(.025*BOOT)],replicas[Math.floor(.975*BOOT)]],
      matchedDonorN:d.length,lowerCIPositive:replicas[Math.floor(.025*BOOT)]>0};
  };
  return {policyValues:vals,comparison:{
    signalVsEquallyInformedConventionalRisk:paired("signal","conventionalRisk"),
    signalVsConventionalMean:paired("signal","conventionalMean"),
    signalVsLoggedRandomizedCampaign:paired("signal","loggedRandom")
  }};
}
function analyze(s,strict=true){
  const {data,count,donorCount}=readReal(s,strict);
  const train=data.filter(x=>x.train),test=data.filter(x=>!x.train);
  const {models,globalMean}=buildModels(train);
  const result=value(test,models);
  const disagreements={
    signalVsConventionalRisk:[...models.values()].filter(x=>x.signal!==x.conventionalRisk).length,
    signalVsConventionalMean:[...models.values()].filter(x=>x.signal!==x.conventionalMean).length
  };
  return {
    classification:strict?"REAL_RANDOMIZED_DONATION_POLICY_EXPLORATORY_NOT_NET_PROFIT":
      "SYNTHETIC_TEST_ONLY",
    source:{experiment:"Karlan and List 2007 matching-grant randomized donor campaign",repoCommit:SOURCE_COMMIT,
      sourceSHA256:sha(s),verifiedPublishedArmCounts:strict,
      originalRCTUnits:strict?N:data.length,arms:count,positiveGiftCounts:donorCount,
      originalOutcome:"USD actually donated to charity in response to randomized mail solicitation"},
    design:{trainN:train.length,holdoutN:test.length,holdoutSourceOutcomesNeverUsedToFitPolicy:true,
      deterministicSplit:"SHA256(policyVersion+rowIndex)",policyVersion:POLICY_VERSION,
      contextFeatures:["pre-treatment highest past donation (hpa)","past donor frequency (freq)","pre-treatment dormant flag"],
      contextStrata:models.size,trainingOnlyShrinkageEquivalentN:100,
      riskPolicy:{lowerTailMass:TAIL,downsidePenalty:PENALTY},
      knownLoggingPropensities:{control:1/3,match:2/3},
      originalMatchedDonationProgramCostUSD:null,incrementalSignalSoftwareCostUSD:null,
      actualProfitDefinitionAvailable:false,realizedDonationsAreNotNetProfit:true},
    trainingArmAverageReceiptUSD:globalMean,disagreements,
    ...result,
    claims:{historicalRCTRandomizedAction:true,signalPolicyEvaluatedWithActualSignalQuantitativeAPI:true,
      nativeDomainGateEvaluated:false, randomizedSignalSoftwareDeployment:false,
      verifiedIncrementalSignalNetProfit:false,
      softwareCausalNetProfitEffectIdentified:false},
    limitations:[
      "Original historical RCT randomized matching-grant offers, not Signal software. Offline causal policy value is NOT a measured causal Signal deployment effect.",
      "Donation receipts are monetary gross contributions, not measured net firm profit, and matching/solicitation/software expenses were not observed in this file.",
      "The policy was built after experiment published, so result is exploratory, not a prospectively preregistered independent software trial.",
      "Empirical-bin model does not establish calibrated individual treatment effects; sparse extreme donations can make bootstrap intervals wide.",
      "The equally informed conventional risk optimizer uses the exact same states and risk objective and should agree with Signal by algebraic construction.",
      "Unobserved joint potential-outcome dependence across actions is represented by a product coupling; only its randomized action-specific marginals are supported."
    ]
  };
}
function selfTest(){
  // Validates the executed Signal code and critical equality invariant;
  // synthetic fixture is deliberately NOT treated as a source observation.
  const rows=[];
  const head=["treatment","amount","hpa","freq","dormant","gave"];
  rows.push([...head,...Array.from({length:35},(_,i)=>"dummy"+i)].join(","));
  for(let i=0;i<12000;i++){
    const t=i%3===0?"0":"1", amount=(i%29===0)?String(10+i%50):"0";
    rows.push([t,amount,String((i%5)*25),String(i%10),String(i%2),String(Number(amount)>0),
      ...Array.from({length:35},()=>"0")].join(","));
  }
  const s=rows.join("\n")+"\n";
  const out=analyze(s,false);
  assert(out.design.trainN>4000&&out.design.holdoutN>3000);
  assert.equal(out.disagreements.signalVsConventionalRisk,0);
  assert.equal(out.comparison.signalVsEquallyInformedConventionalRisk.differenceUsdPerDonor,0);
  assert.deepEqual(out.comparison.signalVsEquallyInformedConventionalRisk.bootstrap95,[0,0]);
  assert.equal(out.claims.softwareCausalNetProfitEffectIdentified,false);
  assert.throws(()=>analyze(s.replace(",amount,",",revenue,"),false),/missing verified source field/);
  assert.throws(()=>analyze(s.replace("\n0,10,", "\ncorrupt,10,"),false),/randomized treatment arm/);
  console.log("SELF_TEST_PASS: actual Signal API, train-only fixed split, independent equal-risk comparator, propensity-weighted dollar outcomes and paired bootstrap");
  console.log("SYNTHETIC ONLY. REAL TRIAL IS RUN VIA SEPARATE PINNED CSV PATH.");
}
async function main(){
  if(process.argv.includes("--self-test"))return selfTest();
  assert(process.argv.length===3,"usage: node karlan-real-donation-policy.mjs /secure/pinned/statadata.csv");
  const s=await readFile(process.argv[2],"utf8");
  const report=analyze(s);
  await mkdir("artifacts/validation",{recursive:true});
  await writeFile(OUTPUT,JSON.stringify(report,null,2)+"\n");
  console.log("ORIGINAL_REAL_RCT_N",report.source.originalRCTUnits,"TRAIN",report.design.trainN,
    "HOLDOUT",report.design.holdoutN,"STRATA",report.design.contextStrata);
  console.log("SIGNAL_VS_EQUALLY_INFORMED_CONVENTIONAL_RISK",
    JSON.stringify(report.comparison.signalVsEquallyInformedConventionalRisk));
  console.log("SIGNAL_VS_CONVENTIONAL_MEAN",
    JSON.stringify(report.comparison.signalVsConventionalMean));
  console.log("SIGNAL_VS_RANDOMIZED_CAMPAIGN",
    JSON.stringify(report.comparison.signalVsLoggedRandomizedCampaign));
  console.log("RESEARCH_VERDICT: real observed donation-policy value; NO OBSERVED NET PROFIT OR SIGNAL SOFTWARE CAUSAL EFFECT");
}
await main();
