import { runEvaluation } from "./evaluation.js";
import { runBenchmark } from "./benchmark.js";
async function main() {
  const command = process.argv[2] ?? "evaluate";
  if (command === "benchmark") {
    const report = await runBenchmark({ iterations: Number(process.env.LAB_ITERATIONS ?? 250), concurrency: Number(process.env.LAB_CONCURRENCY ?? 16), warmup: Number(process.env.LAB_WARMUP ?? 20) });
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), signalCommit: process.env.SIGNAL_COMMIT ?? "not-injected", harnessVersion: "0.1.0", ...report }, null, 2));
    return;
  }
  if (command === "coverage") {
    const { capabilities } = await runEvaluation();
    console.log(JSON.stringify({ total: capabilities.length, exercised: capabilities.filter((item) => item.status === "exercised").length, partial: capabilities.filter((item) => item.status === "partial").length, notVerified: capabilities.filter((item) => item.status === "not-verified").length, inventory: capabilities }, null, 2));
    return;
  }
  if (command !== "evaluate") throw new Error(`Unknown command: ${command}. Use evaluate, benchmark or coverage.`);
  const report = await runEvaluation();
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), signalCommit: process.env.SIGNAL_COMMIT ?? "not-injected", harnessVersion: "0.1.0", environment: { node: process.version, platform: process.platform, arch: process.arch }, ...report }, null, 2));
  if (report.results.some((item) => item.status !== "passed")) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
