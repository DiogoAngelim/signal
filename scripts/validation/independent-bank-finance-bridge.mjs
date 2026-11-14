/**
 * NO STRIPE / NO WORKBENCH. Offline, strict intake for sanitized bank statement
 * and bookkeeping CSV exports from an INDEPENDENT, consenting pilot operator.
 *
 * Produces the existing independent-software-profit-ledger.mjs finance JSONL
 * schema. This cannot attest the true source system, authorize participation,
 * run a trial, randomize actual software usage, or measure an economic effect.
 *
 * node scripts/validation/independent-bank-finance-bridge.mjs --self-test
 * node scripts/validation/independent-bank-finance-bridge.mjs \
 *   --config /private/trial.json \
 *   --manifest /private/frozen-assignments.csv \
 *   --transactions /private/normalized-bank-transactions.csv \
 *   --costs /private/normalized-independent-costs.csv \
 *   --closeouts /private/verified-account-closeouts.csv \
 *   --finances /private/finances.jsonl \
 *   --report /private/bank-bridge-summary.json
 *
 * Never put original bank statements, customer names, IDs, emails, IBANs,
 * addresses, or original source transaction references in these inputs.
 */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const sha=(x)=>createHash("sha256").update(x).digest("hex");
const HEX=/^[0-9a-f]{64}$/i;
const MANIFEST=[
  "unit_hash","registered_trial_id","assigned_arm","assigned_at","decision_at",
  "baseline_action","signal_action","baseline_model_version",
  "signal_model_version","decision_input_sha256"
];
const BANK=[
  "unit_hash","transaction_hash","posted_at","currency","entry_type",
  "amount_cents","statement_sha256","source_record_sha256"
];
const COST=[
  "unit_hash","bookkeeping_sha256","cost_record_sha256",
  "fulfillment_cents","sales_minutes","sales_hourly_loaded_cents",
  "delivery_minutes","delivery_hourly_loaded_cents",
  "review_minutes","review_hourly_loaded_cents","compute_cents",
  "other_software_cents","delay_cents","remediation_cents","harm_event"
];
const CLOSE=[
  "unit_hash","outcome_at","statement_at","bank_statement_sha256",
  "bookkeeping_sha256","period_complete","receipts_reconciled",
  "costs_reconciled","all_payment_channels_included",
  "zero_receipts_verified","reversal_window_closed"
];
const FINANCE=[
  "unit_hash","registered_trial_id","outcome_at","statement_at",
  "currency","receipt_cents","refund_cents","payment_fees_cents",
  "fulfillment_cents","sales_minutes","sales_hourly_loaded_cents",
  "delivery_minutes","delivery_hourly_loaded_cents","review_minutes",
  "review_hourly_loaded_cents","compute_cents","other_software_cents",
  "delay_cents","remediation_cents","harm_event","period_complete",
  "receipts_reconciled","costs_reconciled","zero_receipts_verified",
  "finance_export_sha256"
];
const MONEY_FIELDS=[
  "fulfillment_cents","sales_minutes","sales_hourly_loaded_cents",
  "delivery_minutes","delivery_hourly_loaded_cents",
  "review_minutes","review_hourly_loaded_cents","compute_cents",
  "other_software_cents","delay_cents","remediation_cents"
];
const ENTRY_TYPES=new Set(["settled_receipt","settled_refund","payment_fee"]);
const bound=(s,name,max=32000000)=>{
  assert(typeof s==="string"&&Buffer.byteLength(s,"utf8")<=max,
    "invalid or oversized "+name);
  return s;
};
function csv(source,header,label,allowEmpty=false){
  const lines=bound(source,label).replace(/^\uFEFF/,"").trimEnd().split(/\r?\n/);
  assert.equal(lines[0],header.join(","),"wrong "+label+" header");
  assert(lines.length<=200001,"excessive "+label+" records");
  if(!allowEmpty)assert(lines.length>1,"missing "+label+" source rows");
  return lines.slice(1).map((line,i)=>{
    assert(line.length<=2048&&!/["\r\n]/.test(line),
      "unsafe "+label+" CSV quoting/newline on row "+(i+2)+
      " (normalize locally first; never copy raw bank export)");
    const cells=line.split(",");
    assert.equal(cells.length,header.length,
      "wrong "+label+" CSV width on row "+(i+2));
    return Object.fromEntries(header.map((key,j)=>[key,cells[j]]));
  });
}
function hex(x,label){
  assert(typeof x==="string"&&HEX.test(x),"invalid pseudonymous "+label);
  return x.toLowerCase();
}
function utc(s,label){
  assert(typeof s==="string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(s),
    "invalid UTC "+label);
  const v=Date.parse(s);
  assert(Number.isFinite(v)&&v<=Date.now()+60000,"future or invalid "+label);
  return v;
}
function integer(s,label,max=1_000_000_000){
  assert(typeof s==="string"&&/^(0|[1-9][0-9]*)$/.test(s),
    "nonnegative integer cents or minutes required: "+label);
  const n=Number(s);
  assert(Number.isSafeInteger(n)&&n<=max,"out-of-bounds "+label);
  return n;
}
function flag(s,label){
  assert(s==="0"||s==="1","explicit 0/1 flag required: "+label);
  return s==="1";
}
function rowMap(rows,label){
  const map=new Map();
  for(const row of rows){
    const id=hex(row.unit_hash,label+" unit");
    assert(!map.has(id),"duplicate "+label+" unit hash");
    map.set(id,row);
  }
  return map;
}
function scrutinize(configSource,manifestSource,transactionSource,
  costSource,closeSource){
  const cfg=JSON.parse(bound(configSource,"frozen trial configuration",100000));
  assert(cfg&&typeof cfg==="object"&&!Array.isArray(cfg),
    "invalid immutable trial config");
  assert(typeof cfg.trial_id==="string"&&
    /^[A-Za-z0-9._:-]{2,128}$/.test(cfg.trial_id),"invalid trial ID");
  assert(Number.isSafeInteger(cfg.expected_observation_days)&&
    cfg.expected_observation_days>=1&&cfg.expected_observation_days<=365,
    "missing prospective observation window");
  assert(typeof cfg.utility_definition==="string"&&
    cfg.utility_definition.startsWith("verified_net_usd_per_"),
    "only prespecified net-USD economic utility supported");
  const manifest=csv(manifestSource,MANIFEST,"frozen assignment manifest");
  const planned=rowMap(manifest,"manifest");
  const costs=rowMap(csv(costSource,COST,"bookkeeping costs"),"bookkeeping");
  const closeouts=rowMap(csv(closeSource,CLOSE,"verified closeouts"),"closeout");
  assert(planned.size===costs.size&&planned.size===closeouts.size,
    "incomplete ITT denominator: every randomized unit requires costs and a closeout");
  const bank=csv(transactionSource,BANK,"normalized bank entries",true);
  assert(bank.length<=250000,"bank source too large for reviewed ledger");
  const seenTransactions=new Set(),seenSourceLines=new Set();
  const booked=new Map();
  const bankCounts={settled_receipt:0,settled_refund:0,payment_fee:0};
  for(const m of manifest){
    assert(m.registered_trial_id===cfg.trial_id,"manifest trial ID mismatch");
    assert(["baseline","signal"].includes(m.assigned_arm),"invalid randomized trial arm");
    hex(m.unit_hash,"manifest unit");
    hex(m.decision_input_sha256,"frozen proposal");
    utc(m.assigned_at,"assigned_at");
    assert(costs.has(m.unit_hash.toLowerCase()) &&
      closeouts.has(m.unit_hash.toLowerCase()),
      "missing cost/closeout for assigned unit");
    booked.set(m.unit_hash.toLowerCase(),{
      settled_receipt:0,settled_refund:0,payment_fee:0,events:0
    });
  }
  for(const b of bank){
    const unit=hex(b.unit_hash,"bank unit");
    assert(planned.has(unit),"bank transaction references a unit outside ITT cohort");
    const txHash=hex(b.transaction_hash,"transaction reference");
    const sourceHash=hex(b.source_record_sha256,"source transaction line");
    hex(b.statement_sha256,"original bank statement");
    assert(!seenTransactions.has(txHash)&&!seenSourceLines.has(sourceHash),
      "duplicate bank transaction or original bank source row");
    seenTransactions.add(txHash);seenSourceLines.add(sourceHash);
    assert(b.currency==="USD","bank entry not confirmed USD; independent FX review needed");
    assert(ENTRY_TYPES.has(b.entry_type),"unrecognized bank transaction economic type");
    const posted=utc(b.posted_at,"bank transaction posted_at");
    const assigned=utc(planned.get(unit).assigned_at,"assigned_at");
    const close=closeouts.get(unit);
    const periodEnd=utc(close.outcome_at,"outcome_at");
    const statementAt=utc(close.statement_at,"statement_at");
    assert(posted>=assigned,"pre-assignment transaction in trial outcome source");
    assert(posted<=statementAt,
      "bank entry after externally finalized statement cutoff");
    if(b.entry_type==="settled_receipt"){
      assert(posted<=periodEnd,
        "new cash receipt after predeclared outcome horizon");
    }
    assert(b.statement_sha256.toLowerCase()===
      hex(close.bank_statement_sha256,"closeout bank source"),
      "bank source statement digest differs from closeout");
    const n=integer(b.amount_cents,"bank amount_cents");
    assert(n>0,"zero-value bank transactions must not be used as evidence of zero receipts");
    const grp=booked.get(unit);
    grp[b.entry_type]+=n;grp.events++;
    assert(grp[b.entry_type]<=1_000_000_000,
      "cumulative bank amount exceeds approved per-unit integer-cent bound");
    bankCounts[b.entry_type]++;
  }
  const totalRows=[];
  let receiptTotal=0,costTotal=0,zeroUnits=0,refundUnits=0;
  const digestInputs=sha([
    "signal-processor-free-bank-ledger-v1",
    sha(configSource),sha(manifestSource),sha(transactionSource),
    sha(costSource),sha(closeSource)
  ].join("\n"));
  for(const m of manifest){
    const unit=hex(m.unit_hash,"manifest unit"),assigned=utc(m.assigned_at,"assigned_at");
    const c=costs.get(unit),end=closeouts.get(unit),cash=booked.get(unit);
    assert(c&&end&&cash,"missing financial outcome source for randomized unit");
    const bookkeepingSource=hex(c.bookkeeping_sha256,"cost source");
    hex(c.cost_record_sha256,"cost record");
    assert(bookkeepingSource===hex(end.bookkeeping_sha256,"verified bookkeeping source"),
      "bookkeeping cost digest disagrees with closeout");
    const outcome=utc(end.outcome_at,"outcome_at");
    const statement=utc(end.statement_at,"statement_at");
    assert(outcome>=assigned+cfg.expected_observation_days*86400000,
      "realized outcome horizon not fully observed");
    assert(statement>=outcome,"statement closes before outcome horizon");
    for(const k of ["period_complete","receipts_reconciled","costs_reconciled",
      "all_payment_channels_included","reversal_window_closed"]){
      assert(flag(end[k],k),k+" requires independent accountant's positive verification");
    }
    const verifiedZero=flag(end.zero_receipts_verified,
      "zero_receipts_verified");
    assert((cash.settled_receipt===0)===verifiedZero,
      "zero settled receipts must be explicitly verified, not inferred");
    if(verifiedZero)zeroUnits++;
    if(cash.settled_refund>0)refundUnits++;
    const money={};
    for(const name of MONEY_FIELDS){
      const max=name.endsWith("_minutes")?100000:
        name.includes("hourly_loaded_cents")?1000000:1000000000;
      money[name]=integer(c[name],name,max);
    }
    const harm=flag(c.harm_event,"harm_event");
    const row={
      unit_hash:unit,registered_trial_id:cfg.trial_id,
      outcome_at:end.outcome_at,statement_at:end.statement_at,
      currency:"USD",
      receipt_cents:cash.settled_receipt,
      refund_cents:cash.settled_refund,
      payment_fees_cents:cash.payment_fee,
      ...money,harm_event:Number(harm),period_complete:true,
      receipts_reconciled:true,costs_reconciled:true,
      zero_receipts_verified:verifiedZero,
      finance_export_sha256:sha(digestInputs+"\0"+unit)
    };
    assert.deepEqual(Object.keys(row),FINANCE,
      "downstream signed-ledger finance schema drift");
    // Real customer prices, gross margin or unpaid receivables cannot be
    // inferred by this adapter. The cost sources are independently claimed.
    const labor=(minutes,rate)=>Math.round(minutes*rate/60);
    const costCents=cash.settled_refund+cash.payment_fee+
      money.fulfillment_cents+
      labor(money.sales_minutes,money.sales_hourly_loaded_cents)+
      labor(money.delivery_minutes,money.delivery_hourly_loaded_cents)+
      labor(money.review_minutes,money.review_hourly_loaded_cents)+
      money.compute_cents+money.other_software_cents+
      money.delay_cents+money.remediation_cents;
    assert(Number.isSafeInteger(costCents)&&costCents<=1e11,
      "unsafe money arithmetic; use independently reviewed decimal ledger");
    receiptTotal+=cash.settled_receipt;costTotal+=costCents;
    totalRows.push(row);
  }
  assert(Number.isSafeInteger(receiptTotal)&&Number.isSafeInteger(costTotal),
    "unsafe population money total");
  const data=totalRows.map(JSON.stringify).join("\n")+"\n";
  return {
    data,
    summary:{
      classification:"PROCESSOR_FREE_CASH_SOURCE_ASSERTED_NOT_INDEPENDENTLY_VERIFIED",
      trialId:cfg.trial_id,randomizedUnits:planned.size,bankEntries:bank.length,
      bankEntryCounts:bankCounts,verifiedZeroReceiptUnitClaims:zeroUnits,
      refundedUnitCount:refundUnits,
      totalsUSD:{
        collected:receiptTotal/100,claimedCosts:costTotal/100,
        claimedNetContribution:(receiptTotal-costTotal)/100
      },
      privacy:{
        noSourceBankAccountNumbersImportedByContract:true,
        noRawPaymentIdentifiersAcceptedByContract:true,
        bankAuthAndPIIDeidentificationIndependentlyAudited:false
      },
      integrity:{
        frozenManifestSHA256:sha(manifestSource),
        normalizedTransactionSHA256:sha(transactionSource),
        costLedgerSHA256:sha(costSource),
        closeoutSHA256:sha(closeSource),
        outputFinanceJSONL_SHA256:sha(data),
        externalBankProvenanceAuthenticated:false,
        accountantStatementsIndependentlyVerifiedByCLI:false,
        originalTrialManifestExternallyAnchoredByCLI:false
      },
      limitations:[
        "No Stripe, PayPal, API payment system or Workbench dependency.",
        "Sanitized bank and accounting extracts are caller data; hashes do not verify the original bank, receipts, costs, consent or source completeness.",
        "All payment channels and liabilities, including late refunds, must be independently reconciled to a closed statement before signed trial analysis.",
        "This is a finance-input adapter, not randomized Signal software exposure or evidence of its causal net economic effect.",
        "The resulting JSONL must be signed by an independent approved custodian and evaluated with the unmodified exposure and ITT analyzers."
      ],
      actualSignalCausalProfitEstablished:false,
      authorizedEnrollment:false
    }
  };
}
const testCfg={
  trial_id:"synthetic_no_processor_trial_v1",registered_at:"2024-01-01T00:00:00Z",
  locked_git_commit:"0123456789abcdef0123456789abcdef01234567",
  allocation_signal:.5,minimum_units_per_arm:30,
  minimum_policy_disagreement_rate:.1,minimum_policy_adherence:.8,
  minimum_point_net_gain_usd:1,minimum_lower_ci_net_gain_usd:.1,
  max_harm_rate_increase:.1,bootstrap_repetitions:2000,bootstrap_seed:77,
  expected_observation_days:14,
  model_version_signal:"signal-v1",model_version_baseline:"conventional-v1",
  utility_definition:"verified_net_usd_per_independent_partner_account",
  allocation_unit_definition:"one independent consenting partner account",
  external_approval_ref:"fictional-approval-2024"
};
function fixture(){
  const config=JSON.stringify(testCfg);
  const manifest=[MANIFEST.join(",")],transactions=[BANK.join(",")],
    costs=[COST.join(",")],closeouts=[CLOSE.join(",")],exposures=[];
  for(let i=0;i<64;i++){
    const unit=sha("fictional-independent-company-"+i);
    const arm=i%2===0?"signal":"baseline";
    const baseline="monitor",signal=i%3===0?"wait":"monitor";
    manifest.push([unit,testCfg.trial_id,arm,"2024-01-05T00:00:00Z",
      "2024-01-04T00:00:00Z",baseline,signal,
      testCfg.model_version_baseline,testCfg.model_version_signal,
      sha("fictional-frozen-decision-"+i)].join(","));
    const statement=sha("fictional-independent-bank-statement-"+i);
    const book=sha("fictional-cost-ledger-"+i);
    const zero=i%13===0;
    if(!zero){
      for(const [kind,amount] of [
        ["settled_receipt",arm==="signal"?12000:10000],
        ["payment_fee",130],...(i%5===0?[["settled_refund",500]]:[])
      ]){
        const j=transactions.length;
        transactions.push([
          unit,sha("fictional-bank-transaction-"+j),
          kind==="settled_receipt"?"2024-01-10T00:00:00Z":
            "2024-02-22T00:00:00Z",
          "USD",kind,amount,statement,sha("original-bank-source-line-"+j)
        ].join(","));
      }
    }
    costs.push([
      unit,book,sha("cost-entry-"+i),
      500,20,5000,10,3000,5,3000,
      arm==="signal"?40:10,70,30,0,0
    ].join(","));
    closeouts.push([
      unit,"2024-02-20T00:00:00Z","2024-02-25T00:00:00Z",
      statement,book,"1","1","1","1",zero?"1":"0","1"
    ].join(","));
    const planned=arm==="signal"?signal:baseline;
    exposures.push({
      unit_hash:unit,registered_trial_id:testCfg.trial_id,
      consent_at:"2024-01-02T00:00:00Z",
      eligible_at:"2024-01-03T00:00:00Z",
      delivery_status:"shown",delivered_at:"2024-01-05T00:01:00Z",
      delivered_arm:arm,delivered_action:planned,
      effective_action:planned,
      action_at:planned==="wait"?null:"2024-01-05T00:04:00Z",
      human_approved_at:planned==="wait"?null:"2024-01-05T00:03:00Z",
      exposure_log_sha256:sha("synthetic-exposure-record-"+i)
    });
  }
  return {config,manifest:manifest.join("\n")+"\n",
    transactions:transactions.join("\n")+"\n",
    costs:costs.join("\n")+"\n",
    closeouts:closeouts.join("\n")+"\n",
    exposures:exposures.map(JSON.stringify).join("\n")+"\n"};
}
async function selfTest(){
  const f=fixture();
  const report=scrutinize(f.config,f.manifest,f.transactions,
    f.costs,f.closeouts);
  assert.equal(report.summary.randomizedUnits,64);
  assert.equal(report.data.trim().split("\n").length,64);
  assert.equal(report.summary.verifiedZeroReceiptUnitClaims,5);
  assert.equal(report.summary.actualSignalCausalProfitEstablished,false);
  assert.deepEqual(scrutinize(f.config,f.manifest,f.transactions,
    f.costs,f.closeouts),report,"deterministic source processing");
  const replaceIn=(source,token,value)=>{
    assert(source.includes(token),"invalid synthetic test source mutation");
    return source.replace(token,value);
  };
  assert.throws(()=>scrutinize(f.config,f.manifest,
    replaceIn(f.transactions,",USD,settled_receipt",",BRL,settled_receipt"),
    f.costs,f.closeouts),/bank entry not confirmed USD/);
  assert.throws(()=>scrutinize(f.config,f.manifest,
    replaceIn(f.transactions,",12000,",",-12000,"),
    f.costs,f.closeouts),/nonnegative integer/);
  assert.throws(()=>scrutinize(f.config,f.manifest,
    f.transactions+"\n"+f.transactions.trim().split("\n")[1]+"\n",
    f.costs,f.closeouts),/duplicate bank transaction/);
  assert.throws(()=>scrutinize(f.config,f.manifest,f.transactions,
    replaceIn(f.costs,",500,20,5000",",500,,5000"),
    f.closeouts),/nonnegative integer/);
  assert.throws(()=>scrutinize(f.config,f.manifest,f.transactions,
    f.costs,replaceIn(f.closeouts,",1,1,1,1,0,1",",1,1,0,1,0,1")),
    /requires independent accountant/);
  assert.throws(()=>scrutinize(f.config,f.manifest,
    replaceIn(f.transactions,"2024-01-10T00:00:00Z","2024-02-24T00:00:00Z"),
    f.costs,f.closeouts),/cash receipt after predeclared outcome horizon/);
  assert.throws(()=>scrutinize(f.config,f.manifest,f.transactions,
    f.costs,replaceIn(f.closeouts,",0,1\n",",1,1\n")),
    /zero settled receipts must be explicitly verified/);
  assert.throws(()=>scrutinize(f.config,f.manifest,f.transactions,
    f.costs,f.closeouts.trimEnd().split("\n").slice(0,-1).join("\n")+"\n"),
    /incomplete ITT denominator/);

  // TRUE END-TO-END SYNTHETIC ENGINEERING PROOF:
  // bank statement -> exact finance JSONL -> cryptographic attestation ->
  // existing signed independent ledger -> existing randomized ITT evaluator.
  const tmp=await mkdtemp(join(tmpdir(),"signal-stripe-free-synthetic-"));
  try{
    const paths={
      config:join(tmp,"config.json"),manifest:join(tmp,"manifest.csv"),
      exposures:join(tmp,"exposures.jsonl"),finances:join(tmp,"finances.jsonl"),
      attestation:join(tmp,"attestation.json"),pubkey:join(tmp,"public.pem"),
      finalized:join(tmp,"finalized.csv"),summary:join(tmp,"ledger-summary.json")
    };
    const keypair=generateKeyPairSync("ed25519");
    const source={
      config:f.config,manifest:f.manifest,exposures:f.exposures,
      finances:report.data
    };
    const att={
      trial_id:testCfg.trial_id,signed_at:"2024-02-26T00:00:00Z",
      config_sha256:sha(source.config),manifest_sha256:sha(source.manifest),
      exposures_sha256:sha(source.exposures),finances_sha256:sha(source.finances),
      signature_base64:""
    };
    const payload=[
      "signal-independent-software-trial-custody-v1",att.trial_id,
      att.signed_at,att.config_sha256,att.manifest_sha256,
      att.exposures_sha256,att.finances_sha256,""
    ].join("\n");
    att.signature_base64=sign(null,Buffer.from(payload),keypair.privateKey)
      .toString("base64");
    for(const [key,data] of Object.entries(source))
      await writeFile(paths[key],data);
    await writeFile(paths.attestation,JSON.stringify(att));
    await writeFile(paths.pubkey,keypair.publicKey.export({
      type:"spki",format:"pem"
    }));
    const ledger=fileURLToPath(new URL(
      "./independent-software-profit-ledger.mjs",import.meta.url));
    const args=["--config",paths.config,"--manifest",paths.manifest,
      "--exposures",paths.exposures,"--finances",paths.finances,
      "--attestation",paths.attestation,"--trusted-pubkey",paths.pubkey,
      "--finalized",paths.finalized,"--summary",paths.summary];
    const v=spawnSync(process.execPath,[ledger,...args],{
      cwd:process.cwd(),encoding:"utf8",maxBuffer:1000000,timeout:30000
    });
    assert.equal(v.status,0,
      "bank-to-independent-ledger integration failed: "+v.stderr+" "+v.stdout);
    const aggregate=JSON.parse(await readFile(paths.summary,"utf8"));
    assert.equal(aggregate.randomizedUnits,64);
    assert.equal(aggregate.accounting.actualBankAndPayrollReconciliationIndependentlyVerifiedByCLI,false);
    const auditor=fileURLToPath(new URL(
      "./prospective-policy-trial-audit.mjs",import.meta.url));
    const a=spawnSync(process.execPath,[
      auditor,"--config",paths.config,"--manifest",paths.manifest,
      "--data",paths.finalized
    ],{cwd:tmp,encoding:"utf8",maxBuffer:1000000,timeout:30000});
    assert.equal(a.status,0,
      "bank-to-final-ITT integration failed: "+a.stderr+" "+a.stdout);
    const audited=JSON.parse(await readFile(join(tmp,
      "artifacts/validation/prospective-policy-trial-report.json"),"utf8"));
    assert.equal(audited.randomizedUnitCount,64);
    assert.equal(audited.evidenceIntegrity.externalAuditVerified,false);
  }finally{
    await rm(tmp,{recursive:true,force:true});
  }
  console.log("SELF_TEST_PASS: Stripe-free strict bank + costs + verified-closeout reconciliation; real signature-format compatibility; downstream ITT audit; source missingness, currency, timing, costs and double-count defenses");
  console.log("SYNTHETIC FIXTURE ONLY. NO LIVE BANK ACCOUNT, PARTNER, TRIAL PARTICIPANT, OR OBSERVED CAUSAL SIGNAL PROFIT.");
}
function absoluteOutsideRepo(p){
  assert(isAbsolute(p),"private output requires absolute path");
  const resolved=resolve(p),root=resolve(process.cwd())+sep;
  assert(!resolved.startsWith(root),"private finance output cannot be in repository");
  return resolved;
}
async function main(){
  const args=process.argv.slice(2);
  if(args.includes("--self-test"))return selfTest();
  const get=k=>{
    const index=args.indexOf("--"+k);
    assert(index!==-1&&args[index+1],
      "missing --"+k);
    return args[index+1];
  };
  const source={};
  for(const field of ["config","manifest","transactions","costs","closeouts"])
    source[field]=await readFile(get(field),"utf8");
  const {data,summary}=scrutinize(
    source.config,source.manifest,source.transactions,source.costs,source.closeouts);
  const out=absoluteOutsideRepo(get("finances")),
    report=absoluteOutsideRepo(get("report"));
  assert(out!==report,"output and report paths must differ");
  await writeFile(out,data,{encoding:"utf8",flag:"wx",mode:0o600});
  await writeFile(report,JSON.stringify(summary,null,2)+"\n",{
    encoding:"utf8",flag:"wx",mode:0o600
  });
  console.log(JSON.stringify({
    study:summary.trialId,units:summary.randomizedUnits,
    verifiedSourceByCLI:false,causalSignalProfit:false,
    next:"Independent authorized custodian must verify original sources and sign all exact input file digests before downstream outcome ITT analysis."
  }));
}
await main();
