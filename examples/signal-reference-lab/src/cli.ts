import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cpus, release } from "node:os";
import { runEvaluation } from "./evaluation.js";
import { runBenchmark, type BenchmarkReport } from "./benchmark.js";
import { compareBenchmarks } from "./comparison.js";

const provenance = () => ({
  generatedAt: new Date().toISOString(),
  signalCommit: process.env.SIGNAL_COMMIT ?? "not-injected",
  appCommit: process.env.APP_COMMIT ?? "not-injected",
  harnessVersion: "0.1.0",
  environment: {
    node: process.version,
    platform: process.platform,
    osRelease: release(),
    arch: process.arch,
    cpuModel: cpus()[0]?.model ?? "unknown",
    cpus: cpus().length,
  },
});

async function emit(output: unknown): Promise<void> {
  const serialized = JSON.stringify(output, null, 2);
  const outIndex = process.argv.indexOf("--out");
  const outputPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
  if (outputPath) {
    await mkdir(dirname(resolve(outputPath)), { recursive: true });
    await writeFile(outputPath, serialized + "\n");
  }
  console.log(serialized);
}

async function main() {
  const command = process.argv[2] ?? "evaluate";
  if (command === "benchmark") {
    const report = await runBenchmark({
      iterations: Number(process.env.LAB_ITERATIONS ?? 250),
      concurrency: Number(process.env.LAB_CONCURRENCY ?? 16),
      warmup: Number(process.env.LAB_WARMUP ?? 20),
    });
    await emit({ ...provenance(), ...report });
    return;
  }

  if (command === "compare") {
    const path = process.argv[3];
    if (!path) throw new Error("Usage: pnpm lab compare <baseline.json>");
    const baseline = JSON.parse(await readFile(path, "utf8")) as BenchmarkReport;
    const current = await runBenchmark({
      iterations: Number(process.env.LAB_ITERATIONS ?? baseline.workload.iterations),
      concurrency: Number(process.env.LAB_CONCURRENCY ?? baseline.workload.concurrency),
      warmup: Number(process.env.LAB_WARMUP ?? baseline.workload.warmup),
    });
    await emit({ ...provenance(), ...compareBenchmarks(current, baseline) });
    return;
  }

  if (command === "coverage" || command === "evaluate") {
    const report = await runEvaluation();
    await emit({ ...provenance(), ...report });
    if (report.results.some((item) => item.status === "failed" || item.status === "blocked")) {
      process.exitCode = 1;
    }
    return;
  }

  throw new Error(`Unknown command: ${command}. Use evaluate, benchmark, compare or coverage.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
