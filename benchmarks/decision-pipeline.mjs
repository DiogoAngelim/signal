#!/usr/bin/env node
import { createRequire } from "node:module";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const {
  assessDecisionEvidence,
  assessCoherence,
  deriveLearningPatterns,
  evaluateDecision,
  replayDecision,
  reviewDecisionOutcome,
} = require("../packages/decision/dist/index.js");

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
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
function makeEvidence(size) {
  const now = new Date().toISOString();
  return Array.from({ length: size }, (_, index) => ({
    evidenceId: `decision-benchmark-evidence-${size}-${index}`,
    label: `Evidence observation ${index}`,
    summary: `Synthetic decision evidence item ${index}`,
    direction: index % 5 === 0 ? "contradicting" : "supporting",
    quality: 60 + (index % 35),
    reliability: 65 + (index % 30),
    freshness: 70 + (index % 25),
    independence: 55 + (index % 40),
    replication: 50 + (index % 45),
    calibration: 60 + (index % 35),
    traceability: 75 + (index % 25),
    strength: 55 + (index % 40),
    sourceRef: {
      sourceId: `decision-benchmark-source-${index % 20}`,
      sourceType: "database",
      reliabilityScore: 80,
    },
  }));
}
function makeLearning(size) {
  return Array.from({ length: size }, (_, index) => ({
    learningId: `decision-benchmark-learning-${size}-${index}`,
    decisionId: `decision-benchmark-decision-${index}`,
    whatHappened: "The observed outcome followed the decision.",
    why: "Synthetic fixture for computational measurement.",
    whatShouldChange: `lesson-${index % 12}`,
    outcome: index % 4 === 0 ? "contradicted" : "confirmed",
  }));
}
const modules = {
  discovery: 82,
  judgment: 76,
  purpose: 72,
  need: 70,
  trust: 78,
  recovery: 78,
  calibration: 82,
  agency: 55,
  identity: 78,
  awareness: 80,
  reflection: 76,
};
const createdAt = new Date().toISOString();
const runs = Number(arg("--runs", "3"));
const evidenceSizes = arg("--evidence-sizes", "100,1000,5000").split(",").map(Number);
const learningSizes = arg("--learning-sizes", "1000,10000,50000").split(",").map(Number);
const output = arg("--output", "benchmark-results/decision-pipeline.json");
if (!Number.isSafeInteger(runs) || runs < 3) throw new Error("runs must be >=3");
if (evidenceSizes.some((size) => !Number.isSafeInteger(size) || size < 100)) {
  throw new Error("evidence-sizes must contain integers >=100");
}
if (learningSizes.some((size) => !Number.isSafeInteger(size) || size < 100)) {
  throw new Error("learning-sizes must contain integers >=100");
}

const results = [];
const cpuBefore = process.cpuUsage();
const memoryBefore = process.memoryUsage();
let peakHeapUsedBytes = memoryBefore.heapUsed;
let peakRssBytes = memoryBefore.rss;

for (const evidenceSize of evidenceSizes) {
  const evidence = makeEvidence(evidenceSize);
  const assessmentInput = {
    decisionId: `decision-benchmark-${evidenceSize}`,
    createdAt,
    evidence,
    known: [{ label: "The current observation is recorded", evidenceIds: [evidence[0].evidenceId] }],
    unknowns: ["Whether the observed condition persists"],
    assumptions: [{ label: "The observation remains relevant", evidenceIds: [evidence[0].evidenceId] }],
    contradicted: [],
    desiredConfidence: 90,
    importance: 80,
    threats: [{ label: "Loss of optionality", severity: 45, likelihood: 35 }],
    optionality: 70,
    resilience: 75,
    reversibility: { canUndo: true, cost: 20, speed: 80 },
  };
  const assessmentRuns = [];
  const coherenceRuns = [];
  const pipelineRuns = [];
  const replayRuns = [];
  const outcomeReviewRuns = [];

  for (let run = 0; run < runs; run += 1) {
    let started = performance.now();
    const assessment = assessDecisionEvidence(assessmentInput);
    assessmentRuns.push(performance.now() - started);
    if (assessment.evidence.length !== evidenceSize || !Number.isFinite(assessment.confidence.capped)) {
      throw new Error(`Decision evidence assessment invariant failed at size ${evidenceSize}`);
    }

    started = performance.now();
    const coherence = assessCoherence(modules);
    coherenceRuns.push(performance.now() - started);
    if (!Number.isFinite(coherence.score) || !Number.isFinite(coherence.actionScale)) {
      throw new Error("Coherence assessment produced non-finite output");
    }

    started = performance.now();
    const pipeline = evaluateDecision({
      decisionId: `decision-pipeline-${evidenceSize}-${run}`,
      createdAt,
      observation: { source: "synthetic benchmark", sampleSize: evidenceSize },
      modules,
      prediction: { labels: ["positive", "negative", "uncertain"] },
      assessment: assessmentInput,
      outcome: {
        decisionId: `decision-pipeline-${evidenceSize}-${run}`,
        actualSuccessScore: 72,
        expectedConfidence: 68,
      },
    });
    pipelineRuns.push(performance.now() - started);
    if (
      !pipeline.record ||
      !pipeline.decisionReplayAvailable ||
      !Number.isFinite(pipeline.coherenceScore) ||
      !Number.isFinite(pipeline.actionScale)
    ) {
      throw new Error(`Decision pipeline invariant failed at size ${evidenceSize}`);
    }

    started = performance.now();
    const replay = replayDecision({
      record: pipeline.record,
      currentCoherence: pipeline.record.coherence,
    });
    replayRuns.push(performance.now() - started);
    if (replay.replayResult !== "same-decision") {
      throw new Error("Decision replay did not reproduce the original decision");
    }

    started = performance.now();
    const review = reviewDecisionOutcome({
      decisionId: pipeline.record.decisionId,
      whatHappened: "Synthetic benchmark outcome observed.",
      why: "The fixture records a known outcome.",
      assumptions: [
        { label: "The observation remained relevant", status: "survived" },
      ],
      evidence: [
        { label: "Primary observation", role: "mattered" },
        { label: "Conflicting observation", role: "misleading" },
      ],
    });
    outcomeReviewRuns.push(performance.now() - started);
    if (!review.learning || review.learning.decisionId !== pipeline.record.decisionId) {
      throw new Error("Decision outcome review did not produce linked learning");
    }

    const memory = process.memoryUsage();
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed);
    peakRssBytes = Math.max(peakRssBytes, memory.rss);
  }

  results.push({
    evidenceSize,
    runs,
    evidenceAssessment: stats(assessmentRuns),
    coherenceAssessment: stats(coherenceRuns),
    fullDecisionPipeline: stats(pipelineRuns),
    decisionReplay: stats(replayRuns),
    outcomeReview: stats(outcomeReviewRuns),
  });
}

const learningResults = [];
for (const learningSize of learningSizes) {
  const learnings = makeLearning(learningSize);
  const durations = [];
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    const patterns = deriveLearningPatterns(learnings);
    durations.push(performance.now() - started);
    const frequencyTotal = patterns.reduce((sum, pattern) => sum + pattern.frequency, 0);
    if (frequencyTotal !== learningSize) {
      throw new Error(`Decision learning pattern frequency mismatch at size ${learningSize}`);
    }
  }
  learningResults.push({
    learningSize,
    runs,
    patternDerivation: stats(durations),
    patternCount: deriveLearningPatterns(learnings).length,
  });
  const memory = process.memoryUsage();
  peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed);
  peakRssBytes = Math.max(peakRssBytes, memory.rss);
}

const cpu = process.cpuUsage(cpuBefore);
const memoryAfter = process.memoryUsage();
const report = {
  schemaVersion: 1,
  benchmark: "signal-decision-pipeline-and-replay",
  scope: "Core decision evidence assessment, coherence, complete decision pipeline, deterministic replay comparison, outcome review, and learning-pattern derivation. Synthetic data measures computational cost and internal consistency, not domain decision effectiveness.",
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? process.env.SOURCE_COMMIT ?? "unrecorded-local-run",
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    logicalCpus: os.cpus().length,
  },
  configuration: { runs, evidenceSizes, learningSizes },
  results,
  learningResults,
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
    everyAssessmentProducedFiniteConfidence: results.every((result) => result.evidenceAssessment.p95Ms >= 0),
    everyCoherenceAssessmentWasFinite: results.every((result) => result.coherenceAssessment.p95Ms >= 0),
    everyDecisionPipelineCompleted: results.every((result) => result.fullDecisionPipeline.p95Ms >= 0),
    everyReplayMatchedOriginalDecision: results.every((result) => result.decisionReplay.p95Ms >= 0),
    everyOutcomeReviewProducedLearning: results.every((result) => result.outcomeReview.p95Ms >= 0),
    everyLearningPatternFrequencyBalanced: learningResults.length === learningSizes.length,
  },
};
await mkdir(output.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
for (const result of results) {
  process.stdout.write(
    `evidence=${result.evidenceSize} assessmentP95=${result.evidenceAssessment.p95Ms.toFixed(2)}ms pipelineP95=${result.fullDecisionPipeline.p95Ms.toFixed(2)}ms replayP95=${result.decisionReplay.p95Ms.toFixed(4)}ms\n`,
  );
}
for (const result of learningResults) {
  process.stdout.write(
    `learnings=${result.learningSize} patternP95=${result.patternDerivation.p95Ms.toFixed(2)}ms patterns=${result.patternCount}\n`,
  );
}
process.stdout.write(`Wrote ${output}\n`);
