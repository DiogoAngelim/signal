#!/usr/bin/env node
import { createRequire } from "node:module";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { createCircuitBreakerController } = require("../api/runtime/dist/index.js");

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

const iterations = Number(arg("--iterations", "10000"));
const runs = Number(arg("--runs", "3"));
const concurrency = arg("--concurrency", "1,16,64").split(",").map(Number);
const output = arg("--output", "benchmark-results/in-memory-circuit-breaker.json");
if (!Number.isSafeInteger(iterations) || iterations < 100) throw new Error("iterations must be >=100");
if (!Number.isSafeInteger(runs) || runs < 3) throw new Error("runs must be >=3");
if (concurrency.some((value) => !Number.isSafeInteger(value) || value < 1)) {
  throw new Error("concurrency must contain positive integers");
}

const results = [];
for (const concurrencyLevel of concurrency) {
  for (let run = 0; run < runs; run += 1) {
    const breaker = createCircuitBreakerController(5, 30_000);
    const latencies = [];
    const memoryBefore = process.memoryUsage();
    const cpuBefore = process.cpuUsage();
    let peakHeapUsedBytes = memoryBefore.heapUsed;
    let peakRssBytes = memoryBefore.rss;
    const started = performance.now();

    for (let offset = 0; offset < iterations; offset += concurrencyLevel) {
      const batchSize = Math.min(concurrencyLevel, iterations - offset);
      await Promise.all(Array.from({ length: batchSize }, async () => {
        const operationStarted = performance.now();
        const permit = breaker.acquire();
        if (!permit) throw new Error("Closed breaker unexpectedly denied an operation");
        if (!breaker.recordSuccess(permit)) throw new Error("Valid closed-state permit was not accepted");
        latencies.push(performance.now() - operationStarted);
      }));
      const memory = process.memoryUsage();
      peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed);
      peakRssBytes = Math.max(peakRssBytes, memory.rss);
    }

    const wallTimeMs = performance.now() - started;
    const cpu = process.cpuUsage(cpuBefore);
    const memoryAfter = process.memoryUsage();
    const finalState = breaker.snapshot();
    if (finalState.state !== "closed" || finalState.failureCount !== 0) {
      throw new Error("Closed-state benchmark ended with an unexpected breaker state");
    }

    results.push({
      run: run + 1,
      concurrency: concurrencyLevel,
      iterations,
      completedOperations: latencies.length,
      wallTimeMs,
      operationsPerSecond: iterations / (wallTimeMs / 1000),
      operationLatency: stats(latencies),
      cpuUserMs: cpu.user / 1000,
      cpuSystemMs: cpu.system / 1000,
      cpuUtilizationPercent: ((cpu.user + cpu.system) / 1000) / wallTimeMs * 100,
      heapUsedBeforeBytes: memoryBefore.heapUsed,
      heapUsedAfterBytes: memoryAfter.heapUsed,
      heapUsedDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
      peakHeapUsedBytes,
      rssBeforeBytes: memoryBefore.rss,
      rssAfterBytes: memoryAfter.rss,
      rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
      peakRssBytes,
      finalState: finalState.state,
    });
  }
}

// Exercise half-open admission under a same-process burst. The synchronous
// permit transition must admit exactly one contender before any outcome.
const probeResults = [];
for (const concurrencyLevel of concurrency) {
  let now = 100;
  const breaker = createCircuitBreakerController(1, 0, () => now, 1_000);
  const closedPermit = breaker.acquire(now);
  if (!closedPermit || !breaker.recordFailure(closedPermit, now)) {
    throw new Error("Could not transition the breaker into open state");
  }
  const latencies = [];
  const contenders = Array.from({ length: concurrencyLevel }, () => {
    const started = performance.now();
    const permit = breaker.acquire(now);
    latencies.push(performance.now() - started);
    return permit;
  });
  const winners = contenders.filter(Boolean);
  const denied = contenders.length - winners.length;
  if (winners.length !== 1) throw new Error(`Expected one half-open probe, received ${winners.length}`);
  const probe = winners[0];
  if (!breaker.renewProbe(probe, now + 100)) throw new Error("Active probe lease could not be renewed");
  if (!breaker.recordSuccess(probe, now + 100)) throw new Error("Renewed probe could not close the breaker");
  if (breaker.snapshot().state !== "closed") throw new Error("Probe burst did not return breaker to closed state");
  probeResults.push({
    concurrency: concurrencyLevel,
    contenders: concurrencyLevel,
    grantedProbes: winners.length,
    deniedContenders: denied,
    acquisitionLatency: stats(latencies),
    singleProbeInvariant: winners.length === 1,
    leaseRenewed: true,
    finalState: breaker.snapshot().state,
  });
}

const report = {
  schemaVersion: 1,
  benchmark: "signal-in-memory-circuit-breaker",
  scope: "Permit-scoped in-process circuit-breaker closed-state throughput, operation latency, CPU, sampled peak heap/RSS, and synchronous half-open contention. Does not measure cross-process coordination or production host behavior.",
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? process.env.SOURCE_COMMIT ?? "unrecorded-local-run",
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    logicalCpus: os.cpus().length,
  },
  configuration: { iterations, runs, concurrency, probeLeaseMs: 1_000 },
  results,
  halfOpenContention: probeResults,
  invariants: {
    allClosedStateOperationsCompleted: results.every((result) => result.completedOperations === iterations),
    allClosedStateRunsEndedClosed: results.every((result) => result.finalState === "closed"),
    exactlyOneProbeGrantedForEveryBurst: probeResults.every((result) => result.singleProbeInvariant),
    allProbeBurstsEndedClosed: probeResults.every((result) => result.finalState === "closed"),
  },
};
await mkdir(output.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
for (const result of results) {
  process.stdout.write(`concurrency=${result.concurrency} run=${result.run} throughput=${result.operationsPerSecond.toFixed(0)} ops/s p50=${result.operationLatency.p50Ms.toFixed(4)}ms p95=${result.operationLatency.p95Ms.toFixed(4)}ms p99=${result.operationLatency.p99Ms.toFixed(4)}ms\n`);
}
for (const result of probeResults) {
  process.stdout.write(`half-open concurrency=${result.concurrency} granted=${result.grantedProbes} denied=${result.deniedContenders} p95=${result.acquisitionLatency.p95Ms.toFixed(4)}ms\n`);
}
process.stdout.write(`Wrote ${output}\n`);
