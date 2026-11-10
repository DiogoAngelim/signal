#!/usr/bin/env node
import { createRequire } from "node:module";
import { generateKeyPairSync, createHash } from "node:crypto";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const {
  createAuditChainEntry,
  verifyChain,
  signAuditCheckpoint,
  verifyAuditCheckpoint,
  verifyCheckpointAgainstChain,
} = require("../api/runtime/dist/index.js");

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

const runs = Number(arg("--runs", "3"));
const sizes = arg("--sizes", "1000,10000,50000").split(",").map(Number);
const output = arg("--output", "benchmark-results/audit-chain.json");
if (!Number.isSafeInteger(runs) || runs < 3) throw new Error("runs must be >=3");
if (sizes.some((size) => !Number.isSafeInteger(size) || size < 100)) {
  throw new Error("sizes must contain integers >=100");
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const keyId = "signal-audit-benchmark-key";
const payloadFingerprint = createHash("sha256").update("signal-audit-benchmark").digest("hex");
const results = [];
const cpuBefore = process.cpuUsage();
const memoryBefore = process.memoryUsage();
let peakHeapUsedBytes = memoryBefore.heapUsed;
let peakRssBytes = memoryBefore.rss;

for (const size of sizes) {
  const appendRuns = [];
  const verifyRuns = [];
  const signRuns = [];
  const signatureVerifyRuns = [];
  const checkpointVerifyRuns = [];

  for (let run = 0; run < runs; run += 1) {
    const entries = [];
    const appendLatencies = [];
    const appendStarted = performance.now();
    for (let index = 0; index < size; index += 1) {
      const operationStarted = performance.now();
      const entry = createAuditChainEntry(entries.at(-1) ?? null, {
        operationName: "benchmark.audit.v1",
        operationKind: "mutation",
        messageId: `audit-${size}-${run}-${index}`,
        outcome: index % 17 === 0 ? "replayed" : "completed",
        idempotencyKey: `audit-key-${size}-${run}-${index}`,
        payloadFingerprint,
      });
      entries.push(entry);
      appendLatencies.push(performance.now() - operationStarted);
    }
    const appendWallTimeMs = performance.now() - appendStarted;
    if (entries.length !== size || !verifyChain(entries)) {
      throw new Error(`Audit chain construction invariant failed at size ${size}`);
    }

    let started = performance.now();
    const validChain = verifyChain(entries);
    verifyRuns.push(performance.now() - started);
    if (!validChain) throw new Error("Valid audit chain did not verify");

    started = performance.now();
    const checkpoint = signAuditCheckpoint(entries, {
      keyId,
      privateKey: privateKeyPem,
    });
    signRuns.push(performance.now() - started);

    started = performance.now();
    const signatureValid = verifyAuditCheckpoint(checkpoint, publicKeyPem, keyId);
    signatureVerifyRuns.push(performance.now() - started);
    if (!signatureValid) throw new Error("Signed audit checkpoint did not verify");

    started = performance.now();
    const checkpointMatches = verifyCheckpointAgainstChain(checkpoint, entries);
    checkpointVerifyRuns.push(performance.now() - started);
    if (!checkpointMatches) throw new Error("Signed checkpoint did not match the chain");

    const tampered = entries.slice();
    const last = tampered.at(-1);
    tampered[tampered.length - 1] = { ...last, outcome: last.outcome === "completed" ? "failed" : "completed" };
    const tamperRejected = !verifyChain(tampered);
    if (!tamperRejected) throw new Error("Audit chain accepted a tampered entry");

    const memory = process.memoryUsage();
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed);
    peakRssBytes = Math.max(peakRssBytes, memory.rss);
    appendRuns.push({
      appendLatency: stats(appendLatencies),
      appendWallTimeMs,
      appendEntriesPerSecond: size / (appendWallTimeMs / 1000),
      tamperRejected,
      finalSequence: entries.at(-1).sequence,
    });
  }

  results.push({
    chainLength: size,
    runs,
    appendLatency: {
      p50Ms: stats(appendRuns.map((run) => run.appendLatency.p50Ms)).p50Ms,
      p95Ms: stats(appendRuns.map((run) => run.appendLatency.p95Ms)).p50Ms,
      p99Ms: stats(appendRuns.map((run) => run.appendLatency.p99Ms)).p50Ms,
    },
    appendEntriesPerSecond: stats(appendRuns.map((run) => run.appendEntriesPerSecond)),
    fullChainVerification: stats(verifyRuns),
    signedCheckpointCreation: stats(signRuns),
    signatureVerification: stats(signatureVerifyRuns),
    checkpointAgainstChainVerification: stats(checkpointVerifyRuns),
    tamperDetectionPassed: appendRuns.every((run) => run.tamperRejected),
    perRun: appendRuns.map((run, index) => ({
      appendLatency: run.appendLatency,
      appendWallTimeMs: run.appendWallTimeMs,
      appendEntriesPerSecond: run.appendEntriesPerSecond,
      fullChainVerificationMs: verifyRuns[index],
      signedCheckpointCreationMs: signRuns[index],
      signatureVerificationMs: signatureVerifyRuns[index],
      checkpointAgainstChainVerificationMs: checkpointVerifyRuns[index],
      tamperRejected: run.tamperRejected,
    })),
  });
}

const cpu = process.cpuUsage(cpuBefore);
const memoryAfter = process.memoryUsage();
const report = {
  schemaVersion: 1,
  benchmark: "signal-audit-chain-and-checkpoints",
  scope: "Measures hash-chain append, full-chain verification, Ed25519 checkpoint signing/verification, checkpoint-to-chain verification, and tamper rejection. It does not prove append-only storage, key custody, or independent checkpoint retention.",
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? process.env.SOURCE_COMMIT ?? "unrecorded-local-run",
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    logicalCpus: os.cpus().length,
  },
  configuration: { runs, sizes, hash: "SHA-256", signature: "Ed25519" },
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
    everyChainVerified: results.length === sizes.length && results.every((result) => result.fullChainVerification.p95Ms >= 0),
    everyCheckpointVerified: results.every((result) => result.signatureVerification.p95Ms >= 0 && result.checkpointAgainstChainVerification.p95Ms >= 0),
    everyTamperedChainRejected: results.every((result) => result.tamperDetectionPassed),
  },
};
await mkdir(output.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
for (const result of results) {
  process.stdout.write(
    `chain=${result.chainLength} appendP95=${result.appendLatency.p95Ms.toFixed(4)}ms verifyP95=${result.fullChainVerification.p95Ms.toFixed(2)}ms checkpointSignP95=${result.signedCheckpointCreation.p95Ms.toFixed(2)}ms checkpointVerifyP95=${result.signatureVerification.p95Ms.toFixed(3)}ms\n`,
  );
}
process.stdout.write(`Wrote ${output}\n`);
