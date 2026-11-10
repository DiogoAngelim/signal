#!/usr/bin/env node
import { createRequire } from "node:module";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const {
  evaluateCalibrationMetrics,
  evaluateCalibrationDrift,
  calibrateConfidence,
  learnFromTraces,
} = require("../packages/agency/dist/index.js");

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
function makeHistory(size) {
  const start = Date.UTC(2026, 0, 1);
  return Array.from({ length: size }, (_, index) => {
    const confidence = ((index % 20) + 0.5) / 20;
    const success = (index % 100) < Math.round(confidence * 100);
    return {
      traceId: `agency-statistics-${size}-${index}`,
      timestamp: new Date(start + index * 60_000).toISOString(),
      decision: {
        kind: ["prepare_response", "collect_context", "execute_action"][index % 3],
        confidence,
      },
      policy: {
        allowed: true,
        requiresApproval: false,
        reason: "Benchmark policy allows the synthetic trace.",
        violations: [],
      },
      outcome: {
        success,
        outcomeLabel: success ? "positive" : "negative",
      },
      selfDiagnosis: {
        trust: 0.8,
        dataReliability: 0.9,
        calibrationHealth: 0.8,
        overfitRisk: 0.1,
        recommendation: "wait",
        reasons: [],
      },
    };
  });
}

const runs = Number(arg("--runs", "3"));
const sizes = arg("--sizes", "1000,10000,50000").split(",").map(Number);
const bootstrapIterations = Number(arg("--bootstrap-iterations", "1000"));
const output = arg("--output", "benchmark-results/agency-statistics.json");
if (!Number.isSafeInteger(runs) || runs < 3) throw new Error("runs must be >=3");
if (sizes.some((size) => !Number.isSafeInteger(size) || size < 100)) {
  throw new Error("sizes must contain integers >=100");
}
if (!Number.isSafeInteger(bootstrapIterations) || bootstrapIterations < 100 || bootstrapIterations > 10_000) {
  throw new Error("bootstrap-iterations must be between 100 and 10000");
}

const results = [];
const cpuBefore = process.cpuUsage();
const memoryBefore = process.memoryUsage();
let peakHeapUsedBytes = memoryBefore.heapUsed;
let peakRssBytes = memoryBefore.rss;

for (const sampleSize of sizes) {
  const history = makeHistory(sampleSize);
  const reverseHistory = [...history].reverse();
  const calibrationRuns = [];
  const driftRuns = [];
  const calibrationAdjustmentRuns = [];
  const learningRuns = [];

  for (let run = 0; run < runs; run += 1) {
    let started = performance.now();
    const metrics = evaluateCalibrationMetrics(history, {
      minimumEvaluationSamples: 100,
      minimumBucketSamples: 10,
      bucketCount: 10,
    });
    calibrationRuns.push(performance.now() - started);
    if (
      metrics.sampleSize !== sampleSize ||
      metrics.brierScoreInterval?.confidenceLevel !== 0.95 ||
      metrics.calibrationBiasInterval?.confidenceLevel !== 0.95 ||
      !Number.isFinite(metrics.expectedCalibrationError)
    ) {
      throw new Error(`Calibration metrics invariant failed at sample size ${sampleSize}`);
    }

    started = performance.now();
    const drift = evaluateCalibrationDrift(reverseHistory, {
      windowCount: 4,
      minimumWindowSamples: 30,
      minimumBucketSamples: 1,
      bootstrapIterations,
      bootstrapSeed: 20261109,
    });
    driftRuns.push(performance.now() - started);
    if (
      drift.sampleSize !== sampleSize ||
      drift.status === "insufficient_data" ||
      drift.brierScoreDeltaInterval?.method !== "moving_block_bootstrap" ||
      !Number.isFinite(drift.brierScoreDelta)
    ) {
      throw new Error(`Calibration drift invariant failed at sample size ${sampleSize}`);
    }

    started = performance.now();
    const calibrated = calibrateConfidence(history, {
      minimumSamples: 100,
      minimumEvaluationSamples: 100,
      minimumBucketSamples: 10,
    });
    calibrationAdjustmentRuns.push(performance.now() - started);
    if (calibrated.sampleSize !== sampleSize || !Number.isFinite(calibrated.calibratedConfidence)) {
      throw new Error(`Confidence adjustment invariant failed at sample size ${sampleSize}`);
    }

    started = performance.now();
    const learning = learnFromTraces(history, calibrated);
    learningRuns.push(performance.now() - started);
    if (
      learning.excludedDuplicateTraceCount ||
      learning.excludedMissingTraceIdCount ||
      !Array.isArray(learning.learnedPatterns) ||
      !Number.isFinite(learning.confidenceAdjustment)
    ) {
      throw new Error(`Learning invariant failed at sample size ${sampleSize}`);
    }

    const memory = process.memoryUsage();
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed);
    peakRssBytes = Math.max(peakRssBytes, memory.rss);
  }

  results.push({
    sampleSize,
    runs,
    bootstrapIterations,
    calibrationMetrics: stats(calibrationRuns),
    calibrationDrift: stats(driftRuns),
    confidenceAdjustment: stats(calibrationAdjustmentRuns),
    learning: stats(learningRuns),
  });
}

const cpu = process.cpuUsage(cpuBefore);
const memoryAfter = process.memoryUsage();
const report = {
  schemaVersion: 1,
  benchmark: "signal-agency-calibration-and-learning",
  scope: "Calibration metrics, Wilson/Brier confidence intervals, chronological calibration drift with moving-block bootstrap, confidence adjustment, and trace-based learning. Synthetic traces validate computational cost and invariants, not real-world decision effectiveness.",
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? process.env.SOURCE_COMMIT ?? "unrecorded-local-run",
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    logicalCpus: os.cpus().length,
  },
  configuration: { runs, sizes, bootstrapIterations, windowCount: 4, bucketCount: 10 },
  results,
  resourceUsage: {
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    heapUsedBeforeBytes: memoryBefore.heapUsed,
    heapUsedAfterBytes: memoryAfter.heapUsed,
    heapUsedDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
    sampledPeakHeapUsedBytes: peakHeapUsedBytes,
    rssBeforeBytes: memoryBefore.rss,
    rssAfterBytes: memoryAfter.rss,
    rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
    sampledPeakRssBytes: peakRssBytes,
  },
  invariants: {
    everyCalibrationRunProducedConfidenceIntervals: true,
    everyDriftRunProducedMovingBlockBootstrapInterval: true,
    everyConfidenceAdjustmentWasFinite: true,
    everyLearningRunExcludedNoValidTrace: true,
  },
};
await mkdir(output.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
for (const result of results) {
  process.stdout.write(
    `samples=${result.sampleSize} calibrationP95=${result.calibrationMetrics.p95Ms.toFixed(2)}ms driftP95=${result.calibrationDrift.p95Ms.toFixed(2)}ms bootstrap=${bootstrapIterations} learningP95=${result.learning.p95Ms.toFixed(2)}ms\n`,
  );
}
process.stdout.write(`Wrote ${output}\n`);
