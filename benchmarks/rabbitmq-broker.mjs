#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";

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

const managementUrl = process.env.SIGNAL_RABBITMQ_MANAGEMENT_URL;
const username = process.env.SIGNAL_RABBITMQ_USER ?? "signal";
const password = process.env.SIGNAL_RABBITMQ_PASSWORD;
if (!managementUrl || !password) {
  throw new Error("SIGNAL_RABBITMQ_MANAGEMENT_URL and SIGNAL_RABBITMQ_PASSWORD are required");
}
const messages = Number(arg("--messages", "500"));
const concurrency = Number(arg("--concurrency", "32"));
const output = arg("--output", "simulation-evidence/rabbitmq-broker-benchmark.json");
if (!Number.isSafeInteger(messages) || messages < 100) throw new Error("messages must be >=100");
if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error("concurrency must be >=1");

const auth = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
async function request(path, init = {}) {
  const response = await fetch(new URL(path, managementUrl), {
    ...init,
    headers: {
      authorization: auth,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`RabbitMQ management API ${response.status}: ${body}`);
  return body ? JSON.parse(body) : undefined;
}

const queueName = `signal-benchmark-${randomUUID()}`;
const publishLatencies = [];
const deliveryLatencies = [];
const drainBatchLatencies = [];
const receivedSequences = new Set();
let peakHeapUsedBytes = process.memoryUsage().heapUsed;
let peakRssBytes = process.memoryUsage().rss;
let queueDepthAtPublishCompletion = 0;
let publishWallTimeMs = 0;
let backlogDrainMs = 0;
let consumed = 0;
const cpuBefore = process.cpuUsage();
const memoryBefore = process.memoryUsage();
const totalStarted = performance.now();

try {
  await request(`api/queues/%2F/${encodeURIComponent(queueName)}`, {
    method: "PUT",
    body: JSON.stringify({ durable: true, auto_delete: true, arguments: {} }),
  });

  const publishStarted = performance.now();
  for (let offset = 0; offset < messages; offset += concurrency) {
    const size = Math.min(concurrency, messages - offset);
    await Promise.all(Array.from({ length: size }, async (_, index) => {
      const sequence = offset + index;
      const createdAtMs = Date.now();
      const operationStarted = performance.now();
      const result = await request("api/exchanges/%2F/amq.default/publish", {
        method: "POST",
        body: JSON.stringify({
          properties: {
            delivery_mode: 2,
            message_id: `${queueName}-${sequence}`,
            content_type: "application/json",
          },
          routing_key: queueName,
          payload: JSON.stringify({ sequence, createdAtMs, benchmark: "signal-rabbitmq-broker" }),
          payload_encoding: "string",
        }),
      });
      publishLatencies.push(performance.now() - operationStarted);
      if (!result?.routed) throw new Error(`RabbitMQ did not route message ${sequence}`);
    }));
    const memory = process.memoryUsage();
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed);
    peakRssBytes = Math.max(peakRssBytes, memory.rss);
  }
  publishWallTimeMs = performance.now() - publishStarted;

  const queueReadyStarted = performance.now();
  let queueAfterPublish;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    queueAfterPublish = await request(`api/queues/%2F/${encodeURIComponent(queueName)}`);
    queueDepthAtPublishCompletion = Number(queueAfterPublish.messages_ready ?? 0);
    if (queueDepthAtPublishCompletion === messages) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const queueReadyWaitMs = performance.now() - queueReadyStarted;
  if (queueDepthAtPublishCompletion !== messages) {
    throw new Error(`Expected ${messages} ready messages, found ${queueDepthAtPublishCompletion}`);
  }

  const drainStarted = performance.now();
  while (consumed < messages) {
    const batchStarted = performance.now();
    const batch = await request(`api/queues/%2F/${encodeURIComponent(queueName)}/get`, {
      method: "POST",
      body: JSON.stringify({
        count: Math.min(100, messages - consumed),
        ackmode: "ack_requeue_false",
        encoding: "auto",
        truncate: 50_000,
      }),
    });
    drainBatchLatencies.push(performance.now() - batchStarted);
    if (!Array.isArray(batch) || batch.length === 0) break;
    const retrievedAt = Date.now();
    for (const delivery of batch) {
      const envelope = JSON.parse(delivery.payload);
      if (!Number.isSafeInteger(envelope.sequence) || typeof envelope.createdAtMs !== "number") {
        throw new Error("RabbitMQ returned a malformed benchmark payload");
      }
      deliveryLatencies.push(Math.max(0, retrievedAt - envelope.createdAtMs));
      receivedSequences.add(envelope.sequence);
      consumed += 1;
    }
    const memory = process.memoryUsage();
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed);
    peakRssBytes = Math.max(peakRssBytes, memory.rss);
  }
  backlogDrainMs = performance.now() - drainStarted;

  const queueDrainSettledStarted = performance.now();
  let queueAfterDrain;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    queueAfterDrain = await request(`api/queues/%2F/${encodeURIComponent(queueName)}`);
    if (
      Number(queueAfterDrain.messages_ready ?? 0) === 0 &&
      Number(queueAfterDrain.messages_unacknowledged ?? 0) === 0
    ) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const queueDrainSettledWaitMs = performance.now() - queueDrainSettledStarted;
  const duplicates = consumed - receivedSequences.size;
  if (consumed !== messages || receivedSequences.size !== messages || duplicates !== 0) {
    throw new Error(`Broker drain mismatch: consumed=${consumed}, unique=${receivedSequences.size}, expected=${messages}`);
  }
  if (Number(queueAfterDrain.messages_ready ?? 0) !== 0 || Number(queueAfterDrain.messages_unacknowledged ?? 0) !== 0) {
    throw new Error(
      `RabbitMQ queue did not settle: ready=${queueAfterDrain.messages_ready}, unacknowledged=${queueAfterDrain.messages_unacknowledged}, total=${queueAfterDrain.messages}`,
    );
  }

  const cpu = process.cpuUsage(cpuBefore);
  const memoryAfter = process.memoryUsage();
  const totalWallTimeMs = performance.now() - totalStarted;
  const report = {
    schemaVersion: 1,
    benchmark: "signal-rabbitmq-management-api-backlog",
    scope: "Ephemeral RabbitMQ durable queue measured through its management HTTP API: persistent publish latency, ready-queue depth, enqueue-to-pull age, acknowledgement-on-get backlog drain, CPU, and sampled process memory. This is not an AMQP client benchmark or production broker certification.",
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? process.env.SOURCE_COMMIT ?? "unrecorded-local-run",
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuModel: os.cpus()[0]?.model ?? "unknown",
      logicalCpus: os.cpus().length,
    },
    configuration: { messages, concurrency, durableQueue: true, deliveryMode: 2 },
    results: {
      publishedMessages: messages,
      publishLatency: stats(publishLatencies),
      publishWallTimeMs,
      publishMessagesPerSecond: messages / (publishWallTimeMs / 1000),
      queueDepthAtPublishCompletion,
      queueReadyWaitMs,
      consumedMessages: consumed,
      deliveryAge: stats(deliveryLatencies),
      backlogDrainMs,
      backlogDrainMessagesPerSecond: consumed / (backlogDrainMs / 1000),
      drainBatchLatency: stats(drainBatchLatencies),
      duplicateDeliveries: duplicates,
      queueDrainSettledWaitMs,
      readyMessagesAfterDrain: Number(queueAfterDrain.messages_ready ?? 0),
      unacknowledgedMessagesAfterDrain: Number(queueAfterDrain.messages_unacknowledged ?? 0),
      cpuUserMs: cpu.user / 1000,
      cpuSystemMs: cpu.system / 1000,
      heapUsedBeforeBytes: memoryBefore.heapUsed,
      heapUsedAfterBytes: memoryAfter.heapUsed,
      heapUsedDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
      peakHeapUsedBytes,
      rssBeforeBytes: memoryBefore.rss,
      rssAfterBytes: memoryAfter.rss,
      rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
      peakRssBytes,
      totalWallTimeMs,
    },
    invariants: {
      everyMessagePublished: publishLatencies.length === messages,
      everyMessageConsumedOnce: consumed === messages && receivedSequences.size === messages,
      noReadyBacklogAfterDrain: Number(queueAfterDrain.messages_ready ?? 0) === 0,
      noUnacknowledgedMessagesAfterDrain: Number(queueAfterDrain.messages_unacknowledged ?? 0) === 0,
    },
  };
  await mkdir(output.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  process.stdout.write(`published=${messages} publish=${report.results.publishMessagesPerSecond.toFixed(0)} msg/s publishP95=${report.results.publishLatency.p95Ms.toFixed(2)}ms deliveryAgeP95=${report.results.deliveryAge.p95Ms.toFixed(2)}ms drain=${report.results.backlogDrainMessagesPerSecond.toFixed(0)} msg/s duplicates=${duplicates}\n`);
  process.stdout.write(`Wrote ${output}\n`);
} finally {
  try {
    await request(`api/queues/%2F/${encodeURIComponent(queueName)}?if-empty=true`, { method: "DELETE" });
  } catch {
    // Preserve the original benchmark failure if queue cleanup is blocked.
  }
}
