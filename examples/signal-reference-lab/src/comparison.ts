import type { BenchmarkReport } from "./benchmark.js";

export function compareBenchmarks(current: BenchmarkReport, baseline: BenchmarkReport) {
  const sameWorkload = JSON.stringify(current.workload) === JSON.stringify(baseline.workload);
  const sameEnvironment = current.environment.node === baseline.environment.node && current.environment.platform === baseline.environment.platform && current.environment.arch === baseline.environment.arch && current.environment.cpus === baseline.environment.cpus;
  if (!sameWorkload) throw new Error("Benchmark comparison rejected: workload parameters differ.");
  if (!sameEnvironment) throw new Error("Benchmark comparison rejected: runtime or host metadata differs.");
  const delta = (value: number, previous: number) => ({ absolute: Number((value - previous).toFixed(3)), percent: previous === 0 ? null : Number((((value - previous) / previous) * 100).toFixed(2)) });
  return {
    comparable: true,
    baselineKind: baseline.kind,
    currentKind: current.kind,
    workload: current.workload,
    environment: { node: current.environment.node, platform: current.environment.platform, arch: current.environment.arch, cpus: current.environment.cpus },
    metrics: {
      throughputPerSecond: { baseline: baseline.timing.throughputPerSecond, current: current.timing.throughputPerSecond, delta: delta(current.timing.throughputPerSecond, baseline.timing.throughputPerSecond), direction: "higher-is-better" },
      p95Ms: { baseline: baseline.timing.p95Ms, current: current.timing.p95Ms, delta: delta(current.timing.p95Ms, baseline.timing.p95Ms), direction: "lower-is-better" },
      p99Ms: { baseline: baseline.timing.p99Ms, current: current.timing.p99Ms, delta: delta(current.timing.p99Ms, baseline.timing.p99Ms), direction: "lower-is-better" },
      rssAfter: { baseline: baseline.environment.rssAfter, current: current.environment.rssAfter, delta: delta(current.environment.rssAfter, baseline.environment.rssAfter), direction: "lower-is-better" }
    },
    limitations: [...new Set([...baseline.limitations, ...current.limitations, "A matching Node/OS/CPU count is not proof of identical hardware or system load. Use isolated runners and repeat samples for release decisions."])]
  };
}
