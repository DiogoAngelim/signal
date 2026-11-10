import test from "node:test";
import assert from "node:assert/strict";
import { runEvaluation, scoreEngineering } from "../src/evaluation.js";
import { runBenchmark } from "../src/benchmark.js";
import { compareBenchmarks } from "../src/comparison.js";
import { scoreQuality } from "../src/quality-score.js";

test("reference lab executes lifecycle and safety scenarios", async () => {
  const report = await runEvaluation();
  assert.equal(report.results.length, 17);
  const cliReady = process.env.SIGNAL_CLI_READY === "1";
  assert.ok(report.results.every((item) => item.status === "passed" || (item.id === "postgres-integration" && item.status === "blocked" && !process.env.DATABASE_URL) || (item.id === "signal-cli" && item.status === "blocked" && !cliReady)), JSON.stringify(report.results));
  const postgres = report.results.find((item) => item.id === "postgres-integration");
  assert.equal(postgres?.status, process.env.DATABASE_URL ? "passed" : "blocked");
  const cli = report.results.find((item) => item.id === "signal-cli");
  assert.equal(cli?.status, cliReady ? "passed" : "blocked");
  assert.equal(report.capabilities.find((item) => item.id === "postgres.transactions")?.status, process.env.DATABASE_URL ? "exercised" : "not-verified");
  assert.equal(report.capabilities.find((item) => item.id === "cli.signal-verification")?.status, cliReady ? "exercised" : "not-verified");
  assert.ok(report.score.overall > 0 && report.score.overall <= 10);
  assert.equal(report.qualityGates["reference-app"].total, 3);
  assert.equal(report.qualityGates.integration.total, 2);
  assert.equal(report.qualityGates.signal.total, 12);
  assert.equal(report.qualityGates.signal.passed, 12 - (process.env.DATABASE_URL ? 0 : 1) - (cliReady ? 0 : 1));
  assert.equal(report.score.dimensions.reduce((sum, item) => sum + item.weight, 0), 100);
  assert.ok(report.score.dimensions.every((item) => item.score >= 0 && item.score <= 10));
});

test("scorecard keeps unverified capabilities explicit", () => {
  const report = scoreEngineering([], [{ id: "db", area: "Persistence", capability: "Postgres", status: "not-verified", scenarios: [], evidence: "not configured" }]);
  assert.ok(report.interpretation.includes("not a certification"));
  assert.ok(report.dimensions.some((dimension) => dimension.confidence === "low"));
  const covered = scoreEngineering([], [{ id: "db", area: "Persistence", capability: "Postgres", status: "exercised", scenarios: ["db"], evidence: "integration test" }]);
  assert.ok(covered.dimensions.find((dimension) => dimension.name === "Architecture/design")!.score > report.dimensions.find((dimension) => dimension.name === "Architecture/design")!.score);
});

test("benchmark emits reproducible workload and percentile metadata", async () => {
  const report = await runBenchmark({ iterations: 12, concurrency: 3, warmup: 2 });
  assert.equal(report.workload.iterations, 12);
  assert.equal(report.workload.concurrency, 3);
  assert.ok(report.timing.p95Ms >= 0);
  assert.equal(report.samplesMs.length, 12);
  assert.equal(report.integrity.valid, true);
  assert.equal(report.integrity.actualSamples, report.workload.iterations);
  assert.ok(report.environment.cpuModel.length > 0 && report.environment.osRelease.length > 0);
  assert.ok(report.environment.rssAfter > 0);
  assert.ok(report.limitations.length >= 2);
});

test("benchmark comparison rejects mismatched workload", async () => {
  const baseline = await runBenchmark({ iterations: 10, concurrency: 2, warmup: 1 });
  const current = await runBenchmark({ iterations: 11, concurrency: 2, warmup: 1 });
  assert.throws(() => compareBenchmarks(current, baseline), /workload parameters differ/);
  assert.throws(() => compareBenchmarks({ ...baseline, integrity: { ...baseline.integrity, valid: false } }, baseline), /measurement integrity is invalid/);
  assert.throws(() => compareBenchmarks({ ...baseline, samplesMs: [] }, baseline), /measurement integrity is invalid/);
});


test("four-pillar scorecard withholds composite score until matched performance evidence exists", async () => {
  const report = await runEvaluation();
  assert.deepEqual(report.qualityScore.pillars.map((item) => item.id), ["correctness", "security", "performance", "reliability"]);
  assert.equal(report.qualityScore.pillars.find((item) => item.id === "performance")?.score, null);
  assert.equal(report.qualityScore.overall, null);
  assert.ok(report.qualityScore.pillars.every((item) => item.score === null || (item.score >= 0 && item.score <= 10)));
});

test("four-pillar scorecard scores performance only against a matched, integrity-checked baseline", () => {
  const ids = ["invalid-input", "lifecycle", "tenant-isolation", "idempotency", "concurrency", "replay-evidence", "kernel-pipeline", "postgres-integration", "runtime-authorization", "http-binding", "runtime-policy", "audit-integrity", "resilience", "observability-metrics"];
  const results = ids.map((id) => ({ id, title: id, target: "signal" as const, status: "passed" as const, durationMs: 1, assertions: 1, failures: [], evidence: ["deterministic test fixture"] }));
  const environment = { node: "v22.0.0", platform: "linux", osRelease: "6.1", arch: "x64", cpuModel: "fixture CPU", cpus: 8, rssBefore: 1000, rssAfter: 2000, heapUsedBefore: 500, heapUsedAfter: 1000 };
  const workload = { operation: "lab.request.get.v1", iterations: 100, concurrency: 4, warmup: 10 };
  const timing = { totalMs: 100, throughputPerSecond: 1000, p50Ms: 1, p90Ms: 2, p95Ms: 3, p99Ms: 4, maxMs: 5, minMs: 0.5 };
  const baseline = { timing: { ...timing, p95Ms: 4, p99Ms: 5, throughputPerSecond: 900 }, environment, workload, integrity: { valid: true, expectedSamples: 100, actualSamples: 100, invalidSamples: 0 } };
  const benchmark = { timing, environment, workload, integrity: { valid: true, expectedSamples: 100, actualSamples: 100, invalidSamples: 0 }, baseline };
  const report = scoreQuality(results, benchmark);
  assert.ok(report.overall !== null);
  assert.equal(report.pillars.find((item) => item.id === "performance")?.score, 9.7);
  const failed = scoreQuality(results.map((item) => item.id === "runtime-policy" ? { ...item, status: "failed" as const } : item), benchmark);
  assert.ok((failed.pillars.find((item) => item.id === "security")?.score ?? 10) <= 2);
});

test("four-pillar scorecard rejects mismatched performance environments", () => {
  const benchmark = {
    timing: { totalMs: 1, throughputPerSecond: 100, p50Ms: 1, p90Ms: 1, p95Ms: 1, p99Ms: 1, maxMs: 1, minMs: 1 },
    environment: { node: "v22", platform: "linux", osRelease: "6.1", arch: "x64", cpuModel: "current", cpus: 8, rssBefore: 1, rssAfter: 2, heapUsedBefore: 1, heapUsedAfter: 2 },
    workload: { operation: "query", iterations: 100, concurrency: 4, warmup: 10 },
    integrity: { valid: true, expectedSamples: 100, actualSamples: 100, invalidSamples: 0 },
    baseline: {
      timing: { totalMs: 1, throughputPerSecond: 100, p50Ms: 1, p90Ms: 1, p95Ms: 1, p99Ms: 1, maxMs: 1, minMs: 1 },
      environment: { node: "v22", platform: "linux", osRelease: "6.1", arch: "x64", cpuModel: "different", cpus: 8, rssBefore: 1, rssAfter: 2, heapUsedBefore: 1, heapUsedAfter: 2 },
      workload: { operation: "query", iterations: 100, concurrency: 4, warmup: 10 },
      integrity: { valid: true, expectedSamples: 100, actualSamples: 100, invalidSamples: 0 },
    },
  };
  const report = scoreQuality([], benchmark);
  assert.equal(report.pillars.find((item) => item.id === "performance")?.score, null);
  assert.equal(report.overall, null);
});
