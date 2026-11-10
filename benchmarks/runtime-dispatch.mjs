#!/usr/bin/env node
import { createRequire } from "node:module";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { createInProcessDispatcher } = require("../api/runtime/dist/dispatcher.js");
const { createSignalEnvelope } = require("../api/protocol/dist/envelope.js");

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const iterations = Number(argument("--iterations", "5000"));
const runs = Number(argument("--runs", "3"));
const output = argument("--output", "benchmark-results/runtime-dispatch.json");
const concurrency = argument("--concurrency", "1,16,64")
  .split(",")
  .map(Number);

if (!Number.isSafeInteger(iterations) || iterations < 100) {
  throw new Error("--iterations must be an integer >= 100");
}
if (!Number.isSafeInteger(runs) || runs < 3) {
  throw new Error("--runs must be an integer >= 3 for repeatability");
}
if (concurrency.some((value) => !Number.isSafeInteger(value) || value < 1)) {
  throw new Error("--concurrency must contain positive integers");
}

function percentile(sorted, p) {
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50Ms: percentile(sorted, 0.50),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
  };
}

async function runScenario(payloadBytes, concurrencyLevel, runIndex) {
  const dispatcher = createInProcessDispatcher();
  let handled = 0;
  dispatcher.subscribe("bench.event.received.v1", () => {
    handled += 1;
  });

  const payload = { body: "x".repeat(payloadBytes) };
  const warmup = Math.max(100, Math.floor(iterations / 10));
  for (let i = 0; i < warmup; i += 1) {
    await dispatcher.dispatch(createSignalEnvelope({
      kind: "event",
      name: "bench.event.received.v1",
      payload,
    }));
  }
  handled = 0;

  const latencies = [];
  const memoryBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const started = performance.now();

  for (let offset = 0; offset < iterations; offset += concurrencyLevel) {
    const batchSize = Math.min(concurrencyLevel, iterations - offset);
    await Promise.all(Array.from({ length: batchSize }, async () => {
      const operationStarted = performance.now();
      const envelope = createSignalEnvelope({
        kind: "event",
        name: "bench.event.received.v1",
        payload,
      });
      await dispatcher.dispatch(envelope);
      latencies.push(performance.now() - operationStarted);
    }));
  }

  const wallTimeMs = performance.now() - started;
  const cpu = process.cpuUsage(cpuBefore);
  const memoryAfter = process.memoryUsage();

  if (handled !== iterations) {
    throw new Error(`Lost dispatches: expected ${iterations}, handled ${handled}`);
  }

  const cpuTimeMs = (cpu.user + cpu.system) / 1000;
  return {
    run: runIndex + 1,
    payloadBytes,
    concurrency: concurrencyLevel,
    iterations,
    handled,
    wallTimeMs,
    throughputOpsPerSecond: iterations / (wallTimeMs / 1000),
    latency: summarize(latencies),
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    cpuUtilizationPercent: (cpuTimeMs / wallTimeMs) * 100,
    heapUsedBeforeBytes: memoryBefore.heapUsed,
    heapUsedAfterBytes: memoryAfter.heapUsed,
    heapUsedDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
    rssBeforeBytes: memoryBefore.rss,
    rssAfterBytes: memoryAfter.rss,
    rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
  };
}

const results = [];
for (const payloadBytes of [256, 4096, 65536]) {
  for (const concurrencyLevel of concurrency) {
    for (let runIndex = 0; runIndex < runs; runIndex += 1) {
      results.push(await runScenario(payloadBytes, concurrencyLevel, runIndex));
    }
  }
}

const report = {
  schemaVersion: 1,
  benchmark: "signal-in-process-event-dispatch",
  scope: "Signal envelope construction plus one-subscriber in-process dispatch; excludes HTTP, PostgreSQL, broker, network, and external side effects.",
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? process.env.SOURCE_COMMIT ?? "unrecorded-local-run",
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    logicalCpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
  configuration: { iterations, runs, concurrency },
  results,
  interpretation: [
    "Compare only reports produced on equivalent hardware, runtime, build mode, and workload.",
    "Use the per-run distributions; do not treat one run as a stable baseline.",
    "This microbenchmark does not represent database, HTTP, broker, or production service latency.",
  ],
};

await import("node:fs/promises").then(({ mkdir }) => mkdir(output.split("/").slice(0, -1).join("/") || ".", { recursive: true }));
await writeFile(output, JSON.stringify(report, null, 2));
for (const row of results) {
  process.stdout.write([
    `payload=${row.payloadBytes}`,
    `concurrency=${row.concurrency}`,
    `run=${row.run}`,
    `throughput=${row.throughputOpsPerSecond.toFixed(0)} ops/s`,
    `p50=${row.latency.p50Ms.toFixed(4)}ms`,
    `p95=${row.latency.p95Ms.toFixed(4)}ms`,
    `p99=${row.latency.p99Ms.toFixed(4)}ms`,
    `cpu=${row.cpuUtilizationPercent.toFixed(1)}%`,
    `heapDelta=${row.heapUsedDeltaBytes}`,
    `rssDelta=${row.rssDeltaBytes}`,
  ].join(" ") + "\n");
}
process.stdout.write(`Wrote ${output}\n`);
