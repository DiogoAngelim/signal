#!/usr/bin/env node
import { createRequire } from "node:module";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const runtime = require("../api/runtime/dist/index.js");
const sdk = require("../api/sdk-node/dist/index.js");
const binding = require("../api/binding-http/dist/index.js");
const { z } = createRequire(new URL("../api/runtime/package.json", import.meta.url))("zod");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const iterations = Number(arg("--iterations", "3000"));
const runs = Number(arg("--runs", "3"));
const concurrency = arg("--concurrency", "1,16,64").split(",").map(Number);
const output = arg("--output", "benchmark-results/http-binding.json");
if (!Number.isSafeInteger(iterations) || iterations < 100 || !Number.isSafeInteger(runs) || runs < 3) {
  throw new Error("iterations must be >=100 and runs must be >=3");
}

function percentile(sorted, p) { return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]; }
function stats(values) {
  const sorted = [...values].sort((a,b)=>a-b);
  return { p50Ms: percentile(sorted,.50), p95Ms: percentile(sorted,.95), p99Ms: percentile(sorted,.99), minMs: sorted[0], maxMs: sorted.at(-1) };
}

const appRuntime = new runtime.SignalRuntime({ eventPort: runtime.createInProcessDispatcher() });
appRuntime.registerQuery(sdk.defineQuery({
  name: "benchmark.lookup.v1",
  kind: "query",
  inputSchema: z.object({ id: z.number().int() }),
  resultSchema: z.object({ id: z.number().int(), found: z.boolean() }),
  authorize: (_input, context) => {
    if (!context.request.auth?.scopes?.includes("benchmark:read")) {
      throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
    }
  },
  handler: (input) => ({ id: input.id, found: true }),
}));
const app = binding.createSignalHttpServer(appRuntime, {
  rateLimits: {
    query: {
      max: concurrency.length * (iterations * runs + Math.max(100, Math.floor(iterations / 10)) * runs) + 1000,
      timeWindow: 60_000,
    },
  },
  resolveAuthContext: () => ({
    actor: { id: "benchmark-runner" },
    scopes: ["benchmark:read"],
  }),
});

const results = [];
try {
  for (const concurrencyLevel of concurrency) {
    for (let run = 0; run < runs; run += 1) {
      const warmup = Math.max(100, Math.floor(iterations / 10));
      for (let i=0;i<warmup;i+=1) {
        const response = await app.inject({
          method: "POST",
          url: "/signal/query/benchmark.lookup.v1",
          payload: { payload: { id: i } },
        });
        if (response.statusCode !== 200) throw new Error(`Warmup HTTP ${response.statusCode}`);
      }

      const latencies = [];
      let successes = 0;
      const memoryBefore = process.memoryUsage();
      const cpuBefore = process.cpuUsage();
      const started = performance.now();

      for (let offset=0; offset<iterations; offset+=concurrencyLevel) {
        const batchSize = Math.min(concurrencyLevel, iterations-offset);
        await Promise.all(Array.from({length:batchSize}, async (_, j) => {
          const operationStarted = performance.now();
          const response = await app.inject({
            method: "POST",
            url: "/signal/query/benchmark.lookup.v1",
            payload: { payload: { id: offset+j } },
          });
          if (response.statusCode !== 200) throw new Error(`HTTP ${response.statusCode}: ${response.body}`);
          const body = response.json();
          if (!body.ok || body.result.id !== offset+j) throw new Error("HTTP result validation failed");
          successes += 1;
          latencies.push(performance.now()-operationStarted);
        }));
      }

      const wallTimeMs = performance.now()-started;
      const cpu = process.cpuUsage(cpuBefore);
      const memoryAfter = process.memoryUsage();
      if (successes !== iterations) throw new Error(`Expected ${iterations} successful HTTP requests, got ${successes}`);
      const cpuMs=(cpu.user+cpu.system)/1000;
      results.push({
        run: run+1, concurrency: concurrencyLevel, iterations, successes,
        wallTimeMs, throughputOpsPerSecond: iterations/(wallTimeMs/1000),
        latency: stats(latencies),
        cpuUserMs: cpu.user/1000, cpuSystemMs: cpu.system/1000,
        cpuCoresUsed:cpuMs/wallTimeMs,
        cpuUtilizationPercent:cpuMs/(wallTimeMs*os.cpus().length)*100,
        heapUsedBeforeBytes: memoryBefore.heapUsed, heapUsedAfterBytes: memoryAfter.heapUsed,
        heapUsedDeltaBytes: memoryAfter.heapUsed-memoryBefore.heapUsed,
        rssBeforeBytes: memoryBefore.rss, rssAfterBytes: memoryAfter.rss,
        rssDeltaBytes: memoryAfter.rss-memoryBefore.rss,
      });
    }
  }
} finally {
  await app.close();
}

const rateLimitApp = binding.createSignalHttpServer(appRuntime, {
  rateLimits: {
    query: { max: 25, timeWindow: 60_000 },
    mutation: { max: 25, timeWindow: 60_000 },
  },
  resolveAuthContext: () => ({
    actor: { id: "benchmark-runner" },
    scopes: ["benchmark:read"],
  }),
});
let rateLimitMeasurement;
try {
  const acceptedLatencies = [];
  const rejectedLatencies = [];
  const memoryBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const started = performance.now();
  for (let i = 0; i < 25; i += 1) {
    const operationStarted = performance.now();
    const response = await rateLimitApp.inject({
      method: "POST",
      url: "/signal/query/benchmark.lookup.v1",
      payload: { payload: { id: i } },
    });
    if (response.statusCode !== 200) throw new Error(`Expected admitted request, received HTTP ${response.statusCode}`);
    acceptedLatencies.push(performance.now() - operationStarted);
  }
  for (let i = 0; i < 25; i += 1) {
    const operationStarted = performance.now();
    const response = await rateLimitApp.inject({
      method: "POST",
      url: "/signal/query/benchmark.lookup.v1",
      payload: { payload: { id: i + 25 } },
    });
    if (response.statusCode !== 429) throw new Error(`Expected rate-limit rejection, received HTTP ${response.statusCode}`);
    rejectedLatencies.push(performance.now() - operationStarted);
  }
  const wallTimeMs = performance.now() - started;
  const cpu = process.cpuUsage(cpuBefore);
  const memoryAfter = process.memoryUsage();
  rateLimitMeasurement = {
    configuredLimit: 25,
    timeWindowMs: 60_000,
    acceptedRequests: acceptedLatencies.length,
    rejectedRequests: rejectedLatencies.length,
    rejectionRateAfterLimit: rejectedLatencies.length / (acceptedLatencies.length + rejectedLatencies.length),
    acceptedLatency: stats(acceptedLatencies),
    rejectedLatency: stats(rejectedLatencies),
    wallTimeMs,
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    heapUsedDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
    rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
    retryAfterHeaderPresent: Boolean((await rateLimitApp.inject({
      method: "POST",
      url: "/signal/query/benchmark.lookup.v1",
      payload: { payload: { id: 99 } },
    })).headers["retry-after"]),
  };
  if (rateLimitMeasurement.acceptedRequests !== 25 || rateLimitMeasurement.rejectedRequests !== 25) {
    throw new Error("Rate-limit benchmark did not observe the configured admission/rejection counts");
  }
} finally {
  await rateLimitApp.close();
}

const report = {
  schemaVersion: 1,
  benchmark: "signal-fastify-inject-query",
  scope: "Fastify inject + HTTP binding validation + server-side auth resolver + Signal query execution and JSON serialization; includes per-route rate-limit overhead and a controlled admission/rejection burst. Excludes TCP/TLS, reverse proxy, network, shared Redis storage, and production auth provider.",
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? process.env.SOURCE_COMMIT ?? "unrecorded-local-run",
  runtime: { node: process.version, platform: process.platform, arch: process.arch, cpuModel: os.cpus()[0]?.model ?? "unknown", logicalCpus: os.cpus().length },
  configuration: { iterations, runs, concurrency },
  results,
  rateLimit: rateLimitMeasurement,
};
await mkdir(output.split("/").slice(0,-1).join("/")||".",{recursive:true});
await writeFile(output,JSON.stringify(report,null,2));
for(const r of results) process.stdout.write(`concurrency=${r.concurrency} run=${r.run} throughput=${r.throughputOpsPerSecond.toFixed(0)} req/s p50=${r.latency.p50Ms.toFixed(3)}ms p95=${r.latency.p95Ms.toFixed(3)}ms p99=${r.latency.p99Ms.toFixed(3)}ms\n`);
process.stdout.write(`Wrote ${output}\n`);
