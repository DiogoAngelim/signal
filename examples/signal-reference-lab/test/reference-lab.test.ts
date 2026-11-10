import test from "node:test";
import assert from "node:assert/strict";
import { runEvaluation, scoreEngineering } from "../src/evaluation.js";
import { runBenchmark } from "../src/benchmark.js";

test("reference lab executes lifecycle and safety scenarios", async () => {
  const report = await runEvaluation();
  assert.equal(report.results.length, 5);
  assert.ok(report.results.every((item) => item.status === "passed"), JSON.stringify(report.results));
  assert.ok(report.score.overall > 0 && report.score.overall <= 10);
});

test("scorecard keeps unverified capabilities explicit", () => {
  const report = scoreEngineering([], [{ id: "db", area: "Persistence", capability: "Postgres", status: "not-verified", scenarios: [], evidence: "not configured" }]);
  assert.ok(report.interpretation.includes("not a certification"));
  assert.ok(report.dimensions.some((dimension) => dimension.confidence === "low"));
});

test("benchmark emits reproducible workload and percentile metadata", async () => {
  const report = await runBenchmark({ iterations: 12, concurrency: 3, warmup: 2 });
  assert.equal(report.workload.iterations, 12);
  assert.equal(report.workload.concurrency, 3);
  assert.ok(report.timing.p95Ms >= 0);
  assert.ok(report.environment.rssAfter > 0);
  assert.ok(report.limitations.length >= 2);
});
