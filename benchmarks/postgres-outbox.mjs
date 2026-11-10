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
async function readDatabaseStats(pool) {
  await pool.query("SELECT pg_stat_clear_snapshot()");
  const result = await pool.query(`
    SELECT xact_commit, xact_rollback, blks_hit, blks_read, deadlocks
    FROM pg_stat_database
    WHERE datname = current_database()
  `);
  return result.rows[0];
}
async function captureOutboxClaimPlan(pool, workerId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      WITH candidates AS (
        SELECT id FROM signal_outbox
        WHERE (status = 'pending' AND available_at <= now())
           OR (status = 'processing' AND locked_until <= now())
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      )
      UPDATE signal_outbox AS outbox
      SET status = 'processing', locked_by = $2,
          locked_until = now() + ($3 * interval '1 millisecond'),
          lease_token = gen_random_uuid(),
          attempts = outbox.attempts + 1
      FROM candidates
      WHERE outbox.id = candidates.id
      RETURNING outbox.id
    `, [1000, workerId, 30_000]);
    const plan = result.rows[0]?.["QUERY PLAN"]?.[0] ?? null;
    if (!plan) throw new Error("PostgreSQL did not return the outbox claim query plan");
    await client.query("ROLLBACK");
    return plan;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
async function observeAdapterConnections(pool) {
  const result = await pool.query(`
    SELECT
      count(*)::int AS connections,
      count(*) FILTER (WHERE state = 'active')::int AS active_connections,
      count(*) FILTER (WHERE wait_event_type = 'Lock')::int AS lock_waiting_connections,
      coalesce(
        max(extract(epoch FROM clock_timestamp() - query_start) * 1000)
          FILTER (WHERE state = 'active'),
        0
      )::float8 AS max_active_query_duration_ms
    FROM pg_stat_activity
    WHERE application_name = 'signal-engineering-benchmark'
  `);
  return result.rows[0];
}


const store=createPostgresTransactionalStore({connectionString,maxConnections:10,applicationName:"signal-engineering-benchmark"});
const cleanupPool=new Pool({connectionString,max:2,application_name:"signal-benchmark-cleanup"});
const runPrefix=`bench-${randomUUID()}`;
const results=[];
let deadLetterTransition;
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
        const dbStatsBefore=await readDatabaseStats(cleanupPool);
        const pgObserved={maxConnections:0,maxActiveConnections:0,maxLockWaitingConnections:0,maxActiveQueryDurationMs:0,samples:0};
        const samplePg=async()=>{
          const sample=await observeAdapterConnections(cleanupPool);
          pgObserved.maxConnections=Math.max(pgObserved.maxConnections,Number(sample.connections));
          pgObserved.maxActiveConnections=Math.max(pgObserved.maxActiveConnections,Number(sample.active_connections));
          pgObserved.maxLockWaitingConnections=Math.max(pgObserved.maxLockWaitingConnections,Number(sample.lock_waiting_connections));
          pgObserved.maxActiveQueryDurationMs=Math.max(pgObserved.maxActiveQueryDurationMs,Number(sample.max_active_query_duration_ms));
          pgObserved.samples+=1;
        };
        const memoryBefore=process.memoryUsage();
        const cpuBefore=process.cpuUsage();
        const started=performance.now();
        const transactionBatches=Math.ceil(iterations/concurrencyLevel);
        const sampleEvery=Math.max(1,Math.floor(transactionBatches/20));
        for(let offset=0;offset<iterations;offset+=concurrencyLevel){
          const size=Math.min(concurrencyLevel,iterations-offset);
          const batchPromise=Promise.all(Array.from({length:size},async(_,j)=>{
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
          if ((Math.floor(offset/concurrencyLevel)+1)%sampleEvery===0) {
            await Promise.all([batchPromise, samplePg()]);
          } else {
            await batchPromise;
          }
        }
        await samplePg();
        const wallTimeMs=performance.now()-started;
        const cpu=process.cpuUsage(cpuBefore);
        const memoryAfter=process.memoryUsage();
        if(completed!==iterations) throw new Error(`Expected ${iterations} commits, got ${completed}`);

        const outboxClaimQueryPlan=await captureOutboxClaimPlan(cleanupPool,workerId);
        const claimLatencies=[];
        const ackLatencies=[];
        let acknowledged=0;
        let claimedTotal=0;
        const queueAgeLatencies=[];
        const drainStarted=performance.now();
        while(true){
          const claimStarted=performance.now();
          const claimPromise=store.claimBatch({limit:1000,workerId,leaseMs:30000});
          const [claimed]=await Promise.all([claimPromise,samplePg()]);
          claimLatencies.push(performance.now()-claimStarted);
          if(claimed.length===0) break;
          claimedTotal+=claimed.length;
          for (const record of claimed) {
            queueAgeLatencies.push(Math.max(0, Date.now() - Date.parse(record.createdAt)));
          }
          const acknowledgementPromise=Promise.all(claimed.map(async(record)=>{
            const ackStarted=performance.now();
            const ok=await store.acknowledge({id:record.id,workerId,leaseToken:record.leaseToken});
            ackLatencies.push(performance.now()-ackStarted);
            if(!ok) throw new Error("Outbox acknowledgement lost its lease");
            acknowledged+=1;
          }));
          await Promise.all([acknowledgementPromise,samplePg()]);
        }
        const backlogDrainMs=performance.now()-drainStarted;
        if(claimedTotal!==iterations+warmup||acknowledged!==claimedTotal) throw new Error(`Outbox mismatch: claimed=${claimedTotal}, acked=${acknowledged}`);
        const dbStatsAfter=await readDatabaseStats(cleanupPool);
        const cpuMs=(cpu.user+cpu.system)/1000;
        results.push({
          run:run+1,payloadBytes,concurrency:concurrencyLevel,iterations,completed,
          wallTimeMs,throughputOpsPerSecond:iterations/(wallTimeMs/1000),latency:stats(latencies),
          claimBatchLatency:stats(claimLatencies),acknowledgementLatency:stats(ackLatencies),
          queueAgeLatency:stats(queueAgeLatencies),backlogDrainMs,backlogDrainRowsPerSecond:claimedTotal/(backlogDrainMs/1000),
          claimedOutboxRows:claimedTotal,acknowledgedOutboxRows:acknowledged,
          cpuUserMs:cpu.user/1000,cpuSystemMs:cpu.system/1000,cpuUtilizationPercent:cpuMs/wallTimeMs*100,
          heapUsedBeforeBytes:memoryBefore.heapUsed,heapUsedAfterBytes:memoryAfter.heapUsed,
          heapUsedDeltaBytes:memoryAfter.heapUsed-memoryBefore.heapUsed,
          rssBeforeBytes:memoryBefore.rss,rssAfterBytes:memoryAfter.rss,rssDeltaBytes:memoryAfter.rss-memoryBefore.rss,
          poolMaxConnections:10,
          postgresObservation:pgObserved,
          queryPlans:{outboxClaim:outboxClaimQueryPlan},
          databaseStatsDelta:{
            transactionsCommitted:Number(dbStatsAfter.xact_commit)-Number(dbStatsBefore.xact_commit),
            transactionsRolledBack:Number(dbStatsAfter.xact_rollback)-Number(dbStatsBefore.xact_rollback),
            sharedBufferHits:Number(dbStatsAfter.blks_hit)-Number(dbStatsBefore.blks_hit),
            sharedBufferReads:Number(dbStatsAfter.blks_read)-Number(dbStatsBefore.blks_read),
            deadlocks:Number(dbStatsAfter.deadlocks)-Number(dbStatsBefore.deadlocks),
          },
        });
        await cleanupPool.query("DELETE FROM signal_outbox WHERE message_id LIKE $1",[keyLike(runPrefix)]);
        await cleanupPool.query("DELETE FROM signal_idempotency_records WHERE operation_name=$1 AND idempotency_key LIKE $2",[operationName,keyLike(runPrefix)]);
      }
    }
  }

  const deadLetterOperation = "benchmark.deadletter.v1";
  const deadLetterKey = `${runPrefix}-deadletter`;
  const deadLetterMessageId = `${deadLetterKey}-event`;
  const deadLetterReservation = await store.reserve({
    operationName: deadLetterOperation,
    idempotencyKey: deadLetterKey,
    payloadFingerprint: createHash("sha256").update(deadLetterKey).digest("hex"),
  });
  if (deadLetterReservation.state !== "reserved" || !deadLetterReservation.record?.reservationToken) {
    throw new Error("Dead-letter benchmark reservation failed");
  }
  await store.completeWithEvents({
    operationName: deadLetterOperation,
    idempotencyKey: deadLetterKey,
    payloadFingerprint: createHash("sha256").update(deadLetterKey).digest("hex"),
    reservationToken: deadLetterReservation.record.reservationToken,
    result: { ok: true },
    messageId: `${deadLetterKey}-mutation`,
    events: [createSignalEnvelope({
      kind: "event",
      name: "benchmark.outbox.deadletter.v1",
      messageId: deadLetterMessageId,
      payload: { benchmark: true },
    })],
  });
  const deadLetterWorker = `${runPrefix}-deadletter-worker`;
  const claimStarted = performance.now();
  const deadLetterClaims = await store.claimBatch({ limit: 1, workerId: deadLetterWorker, leaseMs: 30_000 });
  const deadLetterClaimLatencyMs = performance.now() - claimStarted;
  const deadLetterClaim = deadLetterClaims.find((record) => record.envelope.messageId === deadLetterMessageId);
  if (!deadLetterClaim) throw new Error("Dead-letter benchmark could not claim its outbox event");
  const retryStarted = performance.now();
  const retryOutcome = await store.retry({
    id: deadLetterClaim.id,
    workerId: deadLetterWorker,
    leaseToken: deadLetterClaim.leaseToken,
    availableAt: new Date().toISOString(),
    error: "Benchmark forced dead-letter transition",
    maxAttempts: 1,
  });
  const retryLatencyMs = performance.now() - retryStarted;
  const persistedDeadLetter = await cleanupPool.query(
    "SELECT status FROM signal_outbox WHERE message_id = $1",
    [deadLetterMessageId],
  );
  if (retryOutcome !== "dead-lettered" || persistedDeadLetter.rows[0]?.status !== "dead-letter") {
    throw new Error("Dead-letter benchmark did not persist the expected terminal state");
  }
  deadLetterTransition = {
    claimLatencyMs: deadLetterClaimLatencyMs,
    retryTransitionLatencyMs: retryLatencyMs,
    retryOutcome,
    persistedStatus: persistedDeadLetter.rows[0].status,
    deadLetteredRows: 1,
    forcedDeadLetterRate: 1,
  };
  await cleanupPool.query("DELETE FROM signal_outbox WHERE message_id = $1", [deadLetterMessageId]);
  await cleanupPool.query(
    "DELETE FROM signal_idempotency_records WHERE operation_name = $1 AND idempotency_key = $2",
    [deadLetterOperation, deadLetterKey],
  );
} finally {
  await store.close();
  await cleanupPool.end();
}
function keyLike(prefix){return `${prefix}%`;}

const report={
  schemaVersion:1,benchmark:"signal-postgres-idempotency-transactional-outbox",
  scope:"PostgreSQL idempotency reservation + transactional completion with one outbox event, then batch claim and acknowledgement; records queue age and backlog drain; and forces one bounded dead-letter transition. Samples pg_stat_activity connection/active/lock-wait/query-duration observations, pg_stat_database commit/rollback/buffer/deadlock deltas, and an EXPLAIN ANALYZE BUFFERS plan for the transactional outbox claim query (executed inside a rolled-back transaction). CI PostgreSQL 16 service; excludes managed database network, production data volume, replicas, broker transport, and production pool contention.",
  generatedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA??process.env.SOURCE_COMMIT??"unrecorded-local-run",
  runtime:{node:process.version,platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model??"unknown",logicalCpus:os.cpus().length},
  database:{engine:"PostgreSQL",version:"16",poolMaxConnections:10},
  configuration:{iterations,runs,concurrency,payloadBytes:[256,4096]},results,deadLetterTransition,
};
await mkdir(output.split("/").slice(0,-1).join("/")||".",{recursive:true});
await writeFile(output,JSON.stringify(report,null,2));
for(const r of results) process.stdout.write(`payload=${r.payloadBytes} concurrency=${r.concurrency} run=${r.run} commitThroughput=${r.throughputOpsPerSecond.toFixed(0)} ops/s p50=${r.latency.p50Ms.toFixed(3)}ms p95=${r.latency.p95Ms.toFixed(3)}ms p99=${r.latency.p99Ms.toFixed(3)}ms claimP95=${r.claimBatchLatency.p95Ms.toFixed(3)}ms ackP95=${r.acknowledgementLatency.p95Ms.toFixed(3)}ms queueAgeP95=${r.queueAgeLatency.p95Ms.toFixed(3)}ms backlogDrain=${r.backlogDrainRowsPerSecond.toFixed(0)} rows/s\n`);
process.stdout.write(`deadLetter retryP95=${deadLetterTransition.retryTransitionLatencyMs.toFixed(3)}ms status=${deadLetterTransition.persistedStatus}\n`);
process.stdout.write(`Wrote ${output}\n`);
