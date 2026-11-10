#!/usr/bin/env node
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { createPostgresCircuitBreakerPort } = require("../api/idempotency-postgres/dist/index.js");
const dbRequire = createRequire(new URL("../api/idempotency-postgres/package.json", import.meta.url));
const { Pool } = dbRequire("pg");

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
function percentile(sorted, p) {
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50Ms: percentile(sorted, 0.50),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    minMs: sorted[0],
    maxMs: sorted.at(-1),
  };
}

const connectionString = process.env.SIGNAL_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("SIGNAL_TEST_DATABASE_URL or DATABASE_URL is required");
const iterations = Number(arg("--iterations", "100"));
const runs = Number(arg("--runs", "3"));
const concurrency = arg("--concurrency", "1,8,32").split(",").map(Number);
const output = arg("--output", "benchmark-results/distributed-circuit-breaker.json");
if (!Number.isSafeInteger(iterations) || iterations < 10) throw new Error("iterations must be >=10");
if (!Number.isSafeInteger(runs) || runs < 3) throw new Error("runs must be >=3");
if (concurrency.some((value) => !Number.isSafeInteger(value) || value < 1)) {
  throw new Error("concurrency must contain positive integers");
}

const prefix = `breaker-bench-${randomUUID()}`;
const portA = createPostgresCircuitBreakerPort({ connectionString, maxConnections: 10 });
const portB = createPostgresCircuitBreakerPort({ connectionString, maxConnections: 10 });
const cleanup = new Pool({ connectionString, max: 1, application_name: "signal-breaker-benchmark-cleanup" });
const config = { threshold: 1, resetTimeoutMs: 0, probeLeaseMs: 15_000 };
const results = [];

try {
  for (const concurrencyLevel of concurrency) {
    for (let run = 0; run < runs; run += 1) {
      const key = `${prefix}-c${concurrencyLevel}-r${run}`;
      const latencies = [];
      let granted = 0;
      let denied = 0;
      const memoryBefore = process.memoryUsage();
      const cpuBefore = process.cpuUsage();
      const started = performance.now();

      // Open once. Each measured cycle reopens the breaker with one failure,
      // then races independent adapter instances for the single half-open probe.
      await portA.tryAcquire(key, config);
      await portA.recordFailure(key, config, undefined, new Date(Date.now() - 10));

      for (let cycle = 0; cycle < iterations; cycle += 1) {
        if (cycle > 0) {
          await portA.recordFailure(key, config, undefined, new Date(Date.now() - 10));
        }
        const eligibleAt = new Date(Date.now() + 1);
        const permits = await Promise.all(
          Array.from({ length: concurrencyLevel }, async (_, index) => {
            const operationStarted = performance.now();
            const port = index % 2 === 0 ? portA : portB;
            const permit = await port.tryAcquire(key, config, eligibleAt);
            latencies.push(performance.now() - operationStarted);
            return { port, permit };
          }),
        );
        const winners = permits.filter(({ permit }) => permit.allowed);
        const losers = permits.length - winners.length;
        if (winners.length !== 1) {
          throw new Error(`Expected exactly one half-open probe, received ${winners.length}`);
        }
        granted += winners.length;
        denied += losers;
        const winner = winners[0];
        if (!winner.permit.probeToken) {
          throw new Error("Half-open permit did not include a fencing token");
        }
        const completed = await winner.port.recordSuccess(key, winner.permit.probeToken);
        if (!completed) throw new Error("Current half-open probe could not close the breaker");
      }

      const wallTimeMs = performance.now() - started;
      const cpu = process.cpuUsage(cpuBefore);
      const memoryAfter = process.memoryUsage();
      const attempts = iterations * concurrencyLevel;
      if (granted !== iterations || denied !== iterations * (concurrencyLevel - 1)) {
        throw new Error(`Probe contention mismatch: granted=${granted}, denied=${denied}`);
      }
      const finalState = await portA.snapshot(key);
      if (finalState?.state !== "closed") throw new Error("Breaker did not return to closed state");

      results.push({
        run: run + 1,
        concurrency: concurrencyLevel,
        iterations,
        acquisitionAttempts: attempts,
        grantedProbes: granted,
        deniedContenders: denied,
        grantRate: granted / iterations,
        contentionRejectionRate: attempts === 0 ? 0 : denied / attempts,
        wallTimeMs,
        probeCyclesPerSecond: iterations / (wallTimeMs / 1000),
        acquisitionAttemptsPerSecond: attempts / (wallTimeMs / 1000),
        acquisitionLatency: stats(latencies),
        cpuUserMs: cpu.user / 1000,
        cpuSystemMs: cpu.system / 1000,
        cpuUtilizationPercent: ((cpu.user + cpu.system) / 1000) / wallTimeMs * 100,
        heapUsedBeforeBytes: memoryBefore.heapUsed,
        heapUsedAfterBytes: memoryAfter.heapUsed,
        heapUsedDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
        rssBeforeBytes: memoryBefore.rss,
        rssAfterBytes: memoryAfter.rss,
        rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
        finalState: finalState.state,
        poolMaxConnectionsPerAdapter: 10,
      });
      await cleanup.query("DELETE FROM signal_circuit_breakers WHERE breaker_key = $1", [key]);
    }
  }
} finally {
  await Promise.all([portA.close(), portB.close(), cleanup.end()]);
}

const report = {
  schemaVersion: 1,
  benchmark: "signal-postgres-distributed-circuit-breaker",
  scope: "Two independent PostgreSQL adapter instances contend for one shared half-open probe. Each measured cycle records one closed-state failure, races concurrent acquisitions, verifies exactly one fenced permit, and closes through the winning adapter. Uses ephemeral PostgreSQL 16; excludes managed-database network latency, multi-region failover, and production traffic.",
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? process.env.SOURCE_COMMIT ?? "unrecorded-local-run",
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    logicalCpus: os.cpus().length,
  },
  database: { engine: "PostgreSQL", version: "16", adapterInstances: 2, poolMaxConnectionsPerAdapter: 10 },
  configuration: { iterations, runs, concurrency, breaker: config },
  results,
  invariants: {
    exactlyOneProbeGrantedPerCycle: results.every((result) => result.grantedProbes === iterations),
    allContendersAccountedFor: results.every((result) => result.grantedProbes + result.deniedContenders === result.acquisitionAttempts),
    allBreakersClosedAfterMeasurement: results.every((result) => result.finalState === "closed"),
  },
};
await mkdir(output.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
for (const result of results) {
  process.stdout.write(
    `concurrency=${result.concurrency} run=${result.run} probes=${result.grantedProbes} attempts=${result.acquisitionAttempts} cycles/s=${result.probeCyclesPerSecond.toFixed(1)} p50=${result.acquisitionLatency.p50Ms.toFixed(3)}ms p95=${result.acquisitionLatency.p95Ms.toFixed(3)}ms p99=${result.acquisitionLatency.p99Ms.toFixed(3)}ms\n`,
  );
}
process.stdout.write(`Wrote ${output}\n`);
