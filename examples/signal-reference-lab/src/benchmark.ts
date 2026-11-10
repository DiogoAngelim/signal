import { cpus, release } from "node:os";
import { createReferenceLab } from "./signal-app.js";

export type BenchmarkReport = {
  kind: "local-in-process-query";
  workload: { operation: string; iterations: number; concurrency: number; warmup: number };
  environment: { node: string; platform: string; osRelease: string; arch: string; cpuModel: string; cpus: number; rssBefore: number; rssAfter: number; heapUsedBefore: number; heapUsedAfter: number };
  timing: { totalMs: number; throughputPerSecond: number; p50Ms: number; p90Ms: number; p95Ms: number; p99Ms: number; maxMs: number; minMs: number };
  samplesMs: number[];
  integrity: { valid: boolean; expectedSamples: number; actualSamples: number; invalidSamples: number };
  limitations: string[];
};

export async function runBenchmark(input: { iterations?: number; concurrency?: number; warmup?: number } = {}): Promise<BenchmarkReport> {
  const iterations = boundedInteger(input.iterations ?? 250, 1, 10000);
  const concurrency = boundedInteger(input.concurrency ?? 16, 1, 256);
  const warmup = boundedInteger(input.warmup ?? 20, 0, 1000);
  const app = createReferenceLab();
  const request = await app.submitRequest({ tenantId: "benchmark-tenant", title: "Benchmark query target", description: "A fixed request used to measure local query dispatch." });
  const memoryBefore = process.memoryUsage();
  for (let index = 0; index < warmup; index++) await app.getRequest(request.id, "benchmark-tenant");
  const samples: number[] = [];
  const started = performance.now();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, iterations) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= iterations) return;
      const before = performance.now();
      const result = await app.getRequest(request.id, "benchmark-tenant");
      const elapsed = performance.now() - before;
      if (!result) throw new Error("Benchmark query unexpectedly returned no request.");
      samples.push(elapsed);
    }
  });
  await Promise.all(workers);
  const totalMs = performance.now() - started;
  const memoryAfter = process.memoryUsage();
  const invalidSamples = samples.filter((value) => !Number.isFinite(value) || value < 0).length;
  const integrity = { valid: samples.length === iterations && invalidSamples === 0, expectedSamples: iterations, actualSamples: samples.length, invalidSamples };
  if (!integrity.valid) throw new Error("Benchmark measurement integrity failed: sample count or values are invalid.");
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
  return {
    kind: "local-in-process-query",
    workload: { operation: "lab.request.get.v1", iterations, concurrency, warmup },
    environment: { node: process.version, platform: process.platform, osRelease: release(), arch: process.arch, cpuModel: cpus()[0]?.model ?? "unknown", cpus: cpus().length, rssBefore: memoryBefore.rss, rssAfter: memoryAfter.rss, heapUsedBefore: memoryBefore.heapUsed, heapUsedAfter: memoryAfter.heapUsed },
    timing: { totalMs: round(totalMs), throughputPerSecond: round(iterations / (totalMs / 1000)), p50Ms: round(percentile(0.5)), p90Ms: round(percentile(0.9)), p95Ms: round(percentile(0.95)), p99Ms: round(percentile(0.99)), maxMs: round(sorted.at(-1) ?? 0), minMs: round(sorted[0] ?? 0) },
    samplesMs: [...samples],
    integrity,
    limitations: ["Measures only the in-process query path with the default memory idempotency store.", "Not a PostgreSQL, HTTP, distributed, production, or end-to-end throughput benchmark.", "Run on equivalent hardware, Node version, build and workload before comparing results."]
  };
}
function boundedInteger(value: number, min: number, max: number) { if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`Expected integer from ${min} to ${max}.`); return value; }
function round(value: number) { return Number(value.toFixed(3)); }
