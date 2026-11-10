#!/usr/bin/env node
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { createPostgresTransactionalStore } = require("../api/idempotency-postgres/dist/index.js");
const { createSignalEnvelope } = require("../api/protocol/dist/envelope.js");
const dbRequire = createRequire(new URL("../api/idempotency-postgres/package.json", import.meta.url));
const { Pool } = dbRequire("pg");

function arg(name, fallback) { const i=process.argv.indexOf(name); return i>=0?process.argv[i+1]:fallback; }
const connectionString=process.env.SIGNAL_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if(!connectionString) throw new Error("SIGNAL_TEST_DATABASE_URL or DATABASE_URL is required");
const iterations=Number(arg("--iterations","500"));
const runs=Number(arg("--runs","3"));
const concurrency=arg("--concurrency","1,8,32").split(",").map(Number);
const output=arg("--output","benchmark-results/postgres-outbox.json");
if(!Number.isSafeInteger(iterations)||iterations<100||!Number.isSafeInteger(runs)||runs<3) throw new Error("iterations must be >=100 and runs must be >=3");
function percentile(sorted,p){return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];}
function stats(values){const s=[...values].sort((a,b)=>a-b);return {p50Ms:percentile(s,.5),p95Ms:percentile(s,.95),p99Ms:percentile(s,.99),minMs:s[0],maxMs:s.at(-1)};}

const store=createPostgresTransactionalStore({connectionString,maxConnections:10,applicationName:"signal-engineering-benchmark"});
const cleanupPool=new Pool({connectionString,max:2,application_name:"signal-benchmark-cleanup"});
const runPrefix=`bench-${randomUUID()}`;
const results=[];
try {
  for(const payloadBytes of [256,4096]){
    for(const concurrencyLevel of concurrency){
      for(let run=0;run<runs;run+=1){
        const operationName=`benchmark.mutation.${payloadBytes}b.v1`;
        const workerId=`${runPrefix}-worker-${payloadBytes}-${concurrencyLevel}-${run}`;
        const payload={body:"x".repeat(payloadBytes)};
        const warmup=Math.max(20,Math.floor(iterations/10));
        for(let i=0;i<warmup;i+=1){
          const key=`${runPrefix}-warm-${payloadBytes}-${concurrencyLevel}-${run}-${i}`;
          const fingerprint=createHash("sha256").update(key).digest("hex");
          const reservation=await store.reserve({operationName,idempotencyKey:key,payloadFingerprint:fingerprint});
          if(reservation.state!=="reserved"||!reservation.record?.reservationToken) throw new Error("Warmup reservation failed");
          const event=createSignalEnvelope({kind:"event",name:"benchmark.outbox.created.v1",messageId:`${key}-event`,payload});
          await store.completeWithEvents({operationName,idempotencyKey:key,payloadFingerprint:fingerprint,reservationToken:reservation.record.reservationToken,result:{ok:true},messageId:`${key}-mutation`,events:[event]});
        }

        const latencies=[];
        let completed=0;
        const memoryBefore=process.memoryUsage();
        const cpuBefore=process.cpuUsage();
        const started=performance.now();
        for(let offset=0;offset<iterations;offset+=concurrencyLevel){
          const size=Math.min(concurrencyLevel,iterations-offset);
          await Promise.all(Array.from({length:size},async(_,j)=>{
            const index=offset+j;
            const key=`${runPrefix}-${payloadBytes}-${concurrencyLevel}-${run}-${index}`;
            const fingerprint=createHash("sha256").update(key).digest("hex");
            const opStarted=performance.now();
            const reservation=await store.reserve({operationName,idempotencyKey:key,payloadFingerprint:fingerprint});
            if(reservation.state!=="reserved"||!reservation.record?.reservationToken) throw new Error(`Reservation failed: ${reservation.state}`);
            const event=createSignalEnvelope({kind:"event",name:"benchmark.outbox.created.v1",messageId:`${key}-event`,payload});
            await store.completeWithEvents({
              operationName,idempotencyKey:key,payloadFingerprint:fingerprint,
              reservationToken:reservation.record.reservationToken,result:{ok:true,index},
              messageId:`${key}-mutation`,events:[event],
            });
            latencies.push(performance.now()-opStarted);
            completed+=1;
          }));
        }
        const wallTimeMs=performance.now()-started;
        const cpu=process.cpuUsage(cpuBefore);
        const memoryAfter=process.memoryUsage();
        if(completed!==iterations) throw new Error(`Expected ${iterations} commits, got ${completed}`);

        const claimLatencies=[];
        const ackLatencies=[];
        let acknowledged=0;
        let claimedTotal=0;
        while(true){
          const claimStarted=performance.now();
          const claimed=await store.claimBatch({limit:1000,workerId,leaseMs:30000});
          claimLatencies.push(performance.now()-claimStarted);
          if(claimed.length===0) break;
          claimedTotal+=claimed.length;
          await Promise.all(claimed.map(async(record)=>{
            const ackStarted=performance.now();
            const ok=await store.acknowledge({id:record.id,workerId,leaseToken:record.leaseToken});
            ackLatencies.push(performance.now()-ackStarted);
            if(!ok) throw new Error("Outbox acknowledgement lost its lease");
            acknowledged+=1;
          }));
        }
        if(claimedTotal!==iterations+warmup||acknowledged!==claimedTotal) throw new Error(`Outbox mismatch: claimed=${claimedTotal}, acked=${acknowledged}`);
        const cpuMs=(cpu.user+cpu.system)/1000;
        results.push({
          run:run+1,payloadBytes,concurrency:concurrencyLevel,iterations,completed,
          wallTimeMs,throughputOpsPerSecond:iterations/(wallTimeMs/1000),latency:stats(latencies),
          claimBatchLatency:stats(claimLatencies),acknowledgementLatency:stats(ackLatencies),
          claimedOutboxRows:claimedTotal,acknowledgedOutboxRows:acknowledged,
          cpuUserMs:cpu.user/1000,cpuSystemMs:cpu.system/1000,cpuUtilizationPercent:cpuMs/wallTimeMs*100,
          heapUsedBeforeBytes:memoryBefore.heapUsed,heapUsedAfterBytes:memoryAfter.heapUsed,
          heapUsedDeltaBytes:memoryAfter.heapUsed-memoryBefore.heapUsed,
          rssBeforeBytes:memoryBefore.rss,rssAfterBytes:memoryAfter.rss,rssDeltaBytes:memoryAfter.rss-memoryBefore.rss,
          poolMaxConnections:10,
        });
        await cleanupPool.query("DELETE FROM signal_outbox WHERE message_id LIKE $1",[keyLike(runPrefix)]);
        await cleanupPool.query("DELETE FROM signal_idempotency_records WHERE operation_name=$1 AND idempotency_key LIKE $2",[operationName,keyLike(runPrefix,payloadBytes,concurrencyLevel,run)]);
      }
    }
  }
} finally {
  await store.close();
  await cleanupPool.end();
}
function keyLike(prefix){return `${prefix}%`;}

const report={
  schemaVersion:1,benchmark:"signal-postgres-idempotency-transactional-outbox",
  scope:"PostgreSQL idempotency reservation + transactional completion with one outbox event, then batch claim and acknowledgement. CI PostgreSQL 16 service; excludes managed database network, production data volume, replicas, broker transport, and production pool contention.",
  generatedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA??process.env.SOURCE_COMMIT??"unrecorded-local-run",
  runtime:{node:process.version,platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model??"unknown",logicalCpus:os.cpus().length},
  database:{engine:"PostgreSQL",version:"16",poolMaxConnections:10},
  configuration:{iterations,runs,concurrency,payloadBytes:[256,4096]},results,
};
await mkdir(output.split("/").slice(0,-1).join("/")||".",{recursive:true});
await writeFile(output,JSON.stringify(report,null,2));
for(const r of results) process.stdout.write(`payload=${r.payloadBytes} concurrency=${r.concurrency} run=${r.run} commitThroughput=${r.throughputOpsPerSecond.toFixed(0)} ops/s p50=${r.latency.p50Ms.toFixed(3)}ms p95=${r.latency.p95Ms.toFixed(3)}ms p99=${r.latency.p99Ms.toFixed(3)}ms claimP95=${r.claimBatchLatency.p95Ms.toFixed(3)}ms ackP95=${r.acknowledgementLatency.p95Ms.toFixed(3)}ms\n`);
process.stdout.write(`Wrote ${output}\n`);
