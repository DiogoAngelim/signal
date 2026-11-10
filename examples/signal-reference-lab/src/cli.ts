import { readFile, writeFile } from "node:fs/promises";
import { runEvaluation } from "./evaluation.js";
import { runBenchmark, type BenchmarkReport } from "./benchmark.js";
import { compareBenchmarks } from "./comparison.js";
async function main() {
  const command = process.argv[2] ?? "evaluate";
  if (command === "benchmark") {
    const report = await runBenchmark({ iterations: Number(process.env.LAB_ITERATIONS ?? 250), concurrency: Number(process.env.LAB_CONCURRENCY ?? 16), warmup: Number(process.env.LAB_WARMUP ?? 20) });
    const output = { generatedAt: new Date().toISOString(), signalCommit: process.env.SIGNAL_COMMIT ?? "not-injected", harnessVersion: "0.1.0", ...report };
    const outIndex = process.argv.indexOf("--out");
    if (outIndex >= 0 && process.argv[outIndex + 1]) await writeFile(process.argv[outIndex + 1], JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (command === "compare") {
    const path = process.argv[3];
    if (!path) throw new Error("Usage: pnpm lab compare <baseline.json>");
    const baseline = JSON.parse(await readFile(path, "utf8")) as BenchmarkReport;
    const current = await runBenchmark({ iterations: Number(process.env.LAB_ITERATIONS ?? baseline.workload.iterations), concurrency: Number(process.env.LAB_CONCURRENCY ?? baseline.workload.concurrency), warmup: Number(process.env.LAB_WARMUP ?? baseline.workload.warmup) });
    console.log(JSON.stringify(compareBenchmarks(current, baseline), null, 2));
    return;
  }
  if (command === "coverage") {
    const { capabilities } = await runEvaluation();
    console.log(JSON.stringify({ total: capabilities.length, exercised: capabilities.filter((item) => item.status === "exercised").length, partial: capabilities.filter((item) => item.status === "partial").length, notVerified: capabilities.filter((item) => item.status === "not-verified").length, inventory: capabilities }, null, 2));
    return;
  }
  if (command !== "evaluate") throw new Error(`Unknown command: ${command}. Use evaluate, benchmark, compare or coverage.`);
  const report = await runEvaluation();
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), signalCommit: process.env.SIGNAL_COMMIT ?? "not-injected", harnessVersion: "0.1.0", environment: { node: process.version, platform: process.platform, arch: process.arch }, ...report }, null, 2));
  if (report.results.some((item) => item.status !== "passed")) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
