import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { runEvaluation, scoreEngineering } from "../src/evaluation.js";
import { runBenchmark } from "../src/benchmark.js";
import { compareBenchmarks } from "../src/comparison.js";

test("reference lab executes lifecycle and safety scenarios", async () => {
  const report = await runEvaluation();
  assert.equal(report.results.length, 16);
  assert.ok(report.results.every((item) => item.status === "passed" || ((item.id === "postgres-integration" && item.status === "blocked" && !process.env.DATABASE_URL) || (item.id === "signal-cli" && item.status === "blocked" && !existsSync("../../signal-cli/dist/cli/index.js"))) || (item.id === "signal-cli" && item.status === "blocked" && process.env.SIGNAL_CLI_READY !== "1")), JSON.stringify(report.results));
  const postgres = report.results.find((item) => item.id === "postgres-integration");
  assert.equal(postgres?.status, process.env.DATABASE_URL ? "passed" : "blocked");
  assert.ok(report.score.overall > 0 && report.score.overall <= 10);
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
  assert.ok(report.environment.rssAfter > 0);
  assert.ok(report.limitations.length >= 2);
});

test("benchmark comparison rejects mismatched workload", async () => {
  const baseline = await runBenchmark({ iterations: 10, concurrency: 2, warmup: 1 });
  const current = await runBenchmark({ iterations: 11, concurrency: 2, warmup: 1 });
  assert.throws(() => compareBenchmarks(current, baseline), /workload parameters differ/);
});
