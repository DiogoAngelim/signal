#!/usr/bin/env node
import { createRequire } from "node:module";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { createInProcessDispatcher } = require("../api/runtime/dist/dispatcher.js");
const { createSignalEnvelope } = require("../api/protocol/dist/envelope.js");

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
function percentile(sorted, p) {
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? 0;
}
function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? 0,
  };
}
function linearSlope(points, field) {
  if (points.length < 2) return null;
  const meanX = points.reduce((sum, point) => sum + point.elapsedMs, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point[field], 0) / points.length;
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.elapsedMs - meanX) * (point[field] - meanY);
    denominator += (point.elapsedMs - meanX) ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

const durationMs = Number(arg("--duration-ms", "60000"));
const concurrency = Number(arg("--concurrency", "32"));
const payloadBytes = Number(arg("--payload-bytes", "1024"));
const sampleIntervalMs = Number(arg("--sample-interval-ms", "1000"));
const output = arg("--output", "benchmark-results/sustained-runtime.json");
if (!Number.isSafeInteger(durationMs) || durationMs < 10_000) throw new Error("--duration-ms must be >= 10000");
if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error("--concurrency must be positive");
if (!Number.isSafeInteger(payloadBytes) || payloadBytes < 0) throw new Error("--payload-bytes must be non-negative");
if (!Number.isSafeInteger(sampleIntervalMs) || sampleIntervalMs < 100) throw new Error("--sample-interval-ms must be >= 100");

const dispatcher = createInProcessDispatcher();
let handled = 0;
dispatcher.subscribe("bench.sustained.received.v1", () => { handled += 1; });
const payload = { body: "x".repeat(payloadBytes) };
const latencies = [];
const samples = [];
const cpuBefore = process.cpuUsage();
const started = performance.now();
let nextSampleAt = started + sampleIntervalMs;
let submitted = 0;
let completed = 0;

while (performance.now() - started < durationMs) {
  const batchSize = concurrency;
  await Promise.all(Array.from({ length: batchSize }, async () => {
    const operationStarted = performance.now();
    await dispatcher.dispatch(createSignalEnvelope({
      kind: "event",
      name: "bench.sustained.received.v1",
      payload,
    }));
    latencies.push(performance.now() - operationStarted);
  }));
  submitted += batchSize;
  completed += batchSize;

  const now = performance.now();
  if (now >= nextSampleAt) {
    const memory = process.memoryUsage();
    samples.push({
      elapsedMs: now - started,
      heapUsedBytes: memory.heapUsed,
      rssBytes: memory.rss,
      externalBytes: memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
      handled,
    });
    nextSampleAt = now + sampleIntervalMs;
  }
}

const wallTimeMs = performance.now() - started;
const cpu = process.cpuUsage(cpuBefore);
const finalMemory = process.memoryUsage();
if (handled !== submitted || completed !== submitted) {
  throw new Error(`Dispatch invariant failed: submitted=${submitted}, completed=${completed}, handled=${handled}`);
}
const report = {
  schemaVersion: 1,
  benchmark: "signal-sustained-in-process-dispatch",
  scope: "Sustained in-process envelope construction and one-subscriber dispatch. Does not represent HTTP, database, broker, network, multi-process, or production behavior.",
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
  configuration: { durationMs, concurrency, payloadBytes, sampleIntervalMs },
  result: {
    submitted,
    completed,
    handled,
    wallTimeMs,
    throughputOpsPerSecond: completed / (wallTimeMs / 1000),
    latency: summarize(latencies),
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    cpuCoresUsed: ((cpu.user + cpu.system) / 1000) / wallTimeMs,
    finalMemory: finalMemory,
    samples,
    sampledHeapGrowthBytesPerSecond: linearSlope(samples, "heapUsedBytes") === null
      ? null
      : linearSlope(samples, "heapUsedBytes") * 1000,
    sampledRssGrowthBytesPerSecond: linearSlope(samples, "rssBytes") === null
      ? null
      : linearSlope(samples, "rssBytes") * 1000,
  },
  interpretation: [
    "The sample series is observational and does not by itself prove a memory leak or absence of one; use repeated runs, GC-aware profiling, and longer durations.",
    "Run on a dedicated, documented runner and compare equivalent runtime, build, workload, and hardware.",
    "This benchmark intentionally excludes database, HTTP, broker, and production infrastructure.",
  ],
};
await mkdir(output.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
process.stdout.write([
  `duration=${(wallTimeMs / 1000).toFixed(1)}s`,
  `handled=${handled}`,
  `throughput=${report.result.throughputOpsPerSecond.toFixed(0)} ops/s`,
  `p95=${report.result.latency.p95Ms.toFixed(4)}ms`,
  `p99=${report.result.latency.p99Ms.toFixed(4)}ms`,
  `heapSlope=${report.result.sampledHeapGrowthBytesPerSecond?.toFixed(0) ?? "n/a"} B/s`,
  `rssSlope=${report.result.sampledRssGrowthBytesPerSecond?.toFixed(0) ?? "n/a"} B/s`,
  `output=${output}`,
].join(" ") + "\n");
