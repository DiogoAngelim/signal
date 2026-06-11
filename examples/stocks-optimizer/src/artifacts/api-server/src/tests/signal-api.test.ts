import assert from "node:assert/strict";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { validateSignalEnvironment } from "../config/signal-environment.js";
import {
  type SignalEnvelope,
  SignalEnvelopeSchema,
} from "../schemas/signal-api.js";
import { verifyWebhookSignatureWithSecrets } from "../security/signal-secrets.js";
import {
  resetSignalRateLimitersForTests,
  signIngestionPayload,
  signWebhookPayload,
} from "../security/signal-security.js";
import { buildSignalTrustMetadata } from "../services/signal-distribution.js";
import { resetSignalServicesForTests } from "../services/signal-distribution.js";
import {
  getSignalStore,
  resetSignalStoreForTests,
} from "../storage/signal-store.js";

process.env.NODE_ENV = "test";
process.env.SIGNAL_API_KEYS = "test-key:reader|emitter|webhook_admin|auditor";
process.env.SIGNAL_API_ALLOW_DEV_KEY = "false";
process.env.SIGNAL_API_RATE_LIMIT_MAX = "1000";
process.env.SIGNAL_API_RATE_LIMIT_WINDOW_MS = "60000";
process.env.SIGNAL_WEBHOOK_ALLOW_PRIVATE_TARGETS = "true";
process.env.SIGNAL_WEBHOOK_RETRY_BASE_MS = "20";
process.env.SIGNAL_WEBHOOK_MAX_ATTEMPTS = "2";

const { default: app } = await import("../app.js");

test.beforeEach(async () => {
  process.env.SIGNAL_API_KEYS = "test-key:reader|emitter|webhook_admin|auditor";
  process.env.SIGNAL_API_ALLOW_DEV_KEY = "false";
  process.env.SIGNAL_API_RATE_LIMIT_MAX = "1000";
  process.env.SIGNAL_API_RATE_LIMIT_WINDOW_MS = "60000";
  process.env.SIGNAL_WEBHOOK_ALLOW_PRIVATE_TARGETS = "true";
  process.env.SIGNAL_INGESTION_SIGNING_SECRET = undefined;
  process.env.SIGNAL_REQUIRE_EMIT_SIGNATURE = undefined;
  await resetSignalStoreForTests();
  resetSignalServicesForTests();
  resetSignalRateLimitersForTests();
});

test("signal schema strictly rejects unexpected fields", () => {
  const parsed = SignalEnvelopeSchema.safeParse({
    ...sampleSignal(),
    unexpected: true,
  });

  assert.equal(parsed.success, false);
});

test("trust metadata makes confidence, risk, exposure, and actionability explicit", () => {
  const trust = buildSignalTrustMetadata(
    sampleSignal({
      kind: "risk_off",
      status: "rejected",
      risk: 91,
      metrics: { calibratedConfidence: 52, dataFreshnessMs: 240_000 },
    }),
  );

  assert.equal(trust.rawConfidence, 74);
  assert.equal(trust.calibratedConfidence, 52);
  assert.equal(trust.riskState, "risk_off");
  assert.equal(trust.actionability, "blocked");
  assert.equal(trust.dataFreshness, "stale");
  assert.equal(trust.exposureCap, 6);
  assert.match(trust.rejectionReason ?? "", /breakout/);
});

test("REST signal routes require API key auth", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/signals`);
    const body = (await response.json()) as any;

    assert.equal(response.status, 401);
    assert.equal(body.error.code, "missing_api_key");
    assert.ok(body.error.requestId);
  });
});

test("scoped API keys can be created, used, expired, and revoked without exposing hashes", async () => {
  process.env.SIGNAL_API_KEYS = "admin-test:admin";
  await resetSignalStoreForTests();

  await withServer(async (baseUrl) => {
    const created = await apiFetch(baseUrl, "/api/v1/admin/api-keys", {
      apiKey: "admin-test",
      method: "POST",
      body: {
        name: "read only integration",
        scopes: ["signals:read"],
        rateLimitMax: 5,
        rateLimitWindowMs: 60_000,
      },
    });

    assert.equal(created.status, 201);
    assert.match(created.body.secret, /^sopt_/);
    assert.equal(created.body.apiKey.name, "read only integration");
    assert.deepEqual(created.body.apiKey.scopes, ["signals:read"]);
    assert.equal(JSON.stringify(created.body).includes("secretHash"), false);

    const listed = await apiFetch(baseUrl, "/api/v1/admin/api-keys", {
      apiKey: "admin-test",
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.length, 1);
    assert.equal(
      JSON.stringify(listed.body).includes(created.body.secret),
      false,
    );

    const read = await apiFetch(baseUrl, "/api/v1/signals", {
      apiKey: created.body.secret,
    });
    assert.equal(read.status, 200);

    const forbidden = await apiFetch(baseUrl, "/api/v1/signals/emit", {
      apiKey: created.body.secret,
      method: "POST",
      body: { signal: sampleSignal() },
    });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error.code, "insufficient_scope");

    const expired = await apiFetch(baseUrl, "/api/v1/admin/api-keys", {
      apiKey: "admin-test",
      method: "POST",
      body: {
        name: "expired integration",
        scopes: ["signals:read"],
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      },
    });
    assert.equal(expired.status, 201);
    const expiredRead = await apiFetch(baseUrl, "/api/v1/signals", {
      apiKey: expired.body.secret,
    });
    assert.equal(expiredRead.status, 401);

    const revoked = await apiFetch(
      baseUrl,
      `/api/v1/admin/api-keys/${created.body.apiKey.id}/revoke`,
      {
        apiKey: "admin-test",
        method: "POST",
      },
    );
    assert.equal(revoked.status, 200);
    assert.ok(revoked.body.revokedAt);

    const revokedRead = await apiFetch(baseUrl, "/api/v1/signals", {
      apiKey: created.body.secret,
    });
    assert.equal(revokedRead.status, 401);
  });
});

test("REST emit, list, latest, get, audit, and idempotency duplicate handling work", async () => {
  await withServer(async (baseUrl) => {
    const signal = sampleSignal({ symbol: "MSFT" });
    const emitted = await apiFetch(baseUrl, "/api/v1/signals/emit", {
      method: "POST",
      body: { signal },
    });

    assert.equal(emitted.status, 202);
    assert.equal(emitted.body.accepted, true);
    assert.equal(emitted.body.duplicate, false);
    assert.equal(emitted.body.signal.id, signal.id);
    assert.equal(emitted.body.trust.actionability, "actionable");

    const latest = await apiFetch(
      baseUrl,
      "/api/v1/signals/latest?symbol=MSFT",
    );
    assert.equal(latest.status, 200);
    assert.equal(latest.body.signal.symbol, "MSFT");

    const fetched = await apiFetch(baseUrl, `/api/v1/signals/${signal.id}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.signal.messageId, signal.messageId);

    const listed = await apiFetch(baseUrl, "/api/v1/signals?symbol=MSFT");
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.length, 1);

    const duplicate = await apiFetch(baseUrl, "/api/v1/signals/emit", {
      method: "POST",
      body: { signal },
    });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.accepted, false);
    assert.equal(duplicate.body.duplicate, true);

    const audit = await apiFetch(baseUrl, "/api/v1/audit/signals");
    assert.equal(audit.status, 200);
    assert.ok(
      audit.body.data.some((entry: any) => entry.action === "signal.emitted"),
    );
    assert.ok(
      audit.body.data.some((entry: any) => entry.action === "signal.duplicate"),
    );
  });
});

test("emit rejects invalid HMAC signatures and prevents signed replay", async () => {
  process.env.SIGNAL_INGESTION_SIGNING_SECRET = "ingest-secret";

  await withServer(async (baseUrl) => {
    const signal = sampleSignal({ symbol: "NVDA" });
    const timestamp = new Date().toISOString();
    const body = JSON.stringify(signal);
    const invalid = await apiFetch(baseUrl, "/api/v1/signals/emit", {
      method: "POST",
      headers: {
        "X-Stocks-Optimizer-Timestamp": timestamp,
        "X-Stocks-Optimizer-Signature": "sha256=bad",
      },
      body: { signal },
    });

    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.error.code, "invalid_signature");

    const signature = signIngestionPayload({
      secret: "ingest-secret",
      timestamp,
      body,
    });
    const signedHeaders = {
      "X-Stocks-Optimizer-Timestamp": timestamp,
      "X-Stocks-Optimizer-Signature": signature,
    };

    const accepted = await apiFetch(baseUrl, "/api/v1/signals/emit", {
      method: "POST",
      headers: signedHeaders,
      body: { signal },
    });
    assert.equal(accepted.status, 202);

    const replay = await apiFetch(baseUrl, "/api/v1/signals/emit", {
      method: "POST",
      headers: signedHeaders,
      body: { signal },
    });
    assert.equal(replay.status, 409);
    assert.equal(replay.body.error.code, "replay_detected");
  });
});

test("rate limiting protects authenticated routes", async () => {
  process.env.SIGNAL_API_RATE_LIMIT_MAX = "1";
  process.env.SIGNAL_API_RATE_LIMIT_WINDOW_MS = "1000";
  resetSignalRateLimitersForTests();

  await withServer(async (baseUrl) => {
    const first = await apiFetch(baseUrl, "/api/v1/signals");
    const second = await apiFetch(baseUrl, "/api/v1/signals");

    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.equal(second.body.error.code, "rate_limited");
  });
});

test("SSE streams authenticated signal updates with filters", async () => {
  await withServer(async (baseUrl) => {
    const controller = new AbortController();
    const stream = await fetch(
      `${baseUrl}/api/v1/signals/stream?apiKey=test-key&symbol=TSLA`,
      {
        signal: controller.signal,
      },
    );
    assert.equal(stream.status, 200);
    assert.ok(stream.body);

    const reader = stream.body.getReader();
    const readPromise = readUntil(reader, '"symbol":"TSLA"');

    await apiFetch(baseUrl, "/api/v1/signals/emit", {
      method: "POST",
      body: { signal: sampleSignal({ symbol: "TSLA" }) },
    });

    const text = await readPromise;
    controller.abort();
    await reader.cancel().catch(() => {});
    assert.match(text, /event: signal/);
    assert.match(text, /"symbol":"TSLA"/);
  });
});

test("webhooks block SSRF destinations unless explicitly enabled for development", async () => {
  process.env.SIGNAL_WEBHOOK_ALLOW_PRIVATE_TARGETS = "false";

  await withServer(async (baseUrl) => {
    const response = await apiFetch(baseUrl, "/api/v1/webhooks", {
      method: "POST",
      body: {
        url: "http://127.0.0.1:65530/hook",
        secret: "webhook-secret",
      },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "webhook_ssrf_blocked");
  });
});

test("webhooks send signed payloads and retry failed deliveries", async () => {
  const received: Array<{
    body: string;
    headers: Record<string, string | string[] | undefined>;
  }> = [];
  const hookServer = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      received.push({ body, headers: req.headers });
      res.statusCode = received.length === 1 ? 500 : 204;
      res.end();
    });
  });

  await listen(hookServer);

  try {
    const hookBase = serverBaseUrl(hookServer);
    await withServer(async (baseUrl) => {
      const created = await apiFetch(baseUrl, "/api/v1/webhooks", {
        method: "POST",
        body: {
          url: `${hookBase}/hook`,
          secret: "webhook-secret",
          filters: { symbols: ["AAPL"] },
        },
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.secret, "webhook-secret");

      const emitted = await apiFetch(baseUrl, "/api/v1/signals/emit", {
        method: "POST",
        body: { signal: sampleSignal({ symbol: "AAPL" }) },
      });
      assert.equal(emitted.status, 202);

      await waitFor(() => received.length >= 2, 2000);
      const second = received[1];
      const timestamp = String(second.headers["x-stocks-optimizer-timestamp"]);
      const event = String(second.headers["x-stocks-optimizer-event"]);
      const deliveryId = String(
        second.headers["x-stocks-optimizer-delivery-id"],
      );
      const expected = signWebhookPayload({
        secret: "webhook-secret",
        timestamp,
        event,
        deliveryId,
        body: second.body,
      });

      assert.equal(event, "signal.emitted");
      assert.equal(second.headers["x-stocks-optimizer-signature"], expected);
      assert.match(second.body, /"symbol":"AAPL"/);
    });
  } finally {
    await closeServer(hookServer);
  }
});

test("webhook secrets rotate with a previous-secret grace period", async () => {
  const hookServer = createServer((_req, res) => {
    res.statusCode = 204;
    res.end();
  });

  await listen(hookServer);

  try {
    const hookBase = serverBaseUrl(hookServer);
    await withServer(async (baseUrl) => {
      const created = await apiFetch(baseUrl, "/api/v1/webhooks", {
        method: "POST",
        body: {
          url: `${hookBase}/hook`,
          secret: "old-webhook-secret",
        },
      });
      assert.equal(created.status, 201);

      const rotated = await apiFetch(
        baseUrl,
        `/api/v1/webhooks/${created.body.webhook.id}/rotate-secret`,
        {
          method: "POST",
          body: { graceSeconds: 60 },
        },
      );
      assert.equal(rotated.status, 200);
      assert.notEqual(rotated.body.secret, "old-webhook-secret");
      assert.ok(rotated.body.previousSecretGraceExpiresAt);

      const body = JSON.stringify({ ok: true });
      const timestamp = new Date().toISOString();
      const event = "signal.emitted";
      const deliveryId = "delivery-rotation-test";
      const oldSignature = signWebhookPayload({
        secret: "old-webhook-secret",
        timestamp,
        event,
        deliveryId,
        body,
      });
      const newSignature = signWebhookPayload({
        secret: rotated.body.secret,
        timestamp,
        event,
        deliveryId,
        body,
      });

      assert.equal(
        verifyWebhookSignatureWithSecrets({
          currentSecret: rotated.body.secret,
          previousSecret: "old-webhook-secret",
          previousSecretExpiresAt: rotated.body.previousSecretGraceExpiresAt,
          timestamp,
          event,
          deliveryId,
          body,
          signature: oldSignature,
        }),
        true,
      );
      assert.equal(
        verifyWebhookSignatureWithSecrets({
          currentSecret: rotated.body.secret,
          previousSecret: "old-webhook-secret",
          previousSecretExpiresAt: new Date(Date.now() - 1_000).toISOString(),
          timestamp,
          event,
          deliveryId,
          body,
          signature: oldSignature,
        }),
        false,
      );
      assert.equal(
        verifyWebhookSignatureWithSecrets({
          currentSecret: rotated.body.secret,
          timestamp,
          event,
          deliveryId,
          body,
          signature: newSignature,
        }),
        true,
      );
    });
  } finally {
    await closeServer(hookServer);
  }
});

test("webhook queue dead-letters exhausted jobs and supports redrive", async () => {
  process.env.SIGNAL_WEBHOOK_MAX_ATTEMPTS = "1";
  process.env.SIGNAL_WEBHOOK_RETRY_BASE_MS = "10";

  const hookServer = createServer((_req, res) => {
    res.statusCode = 500;
    res.end();
  });

  await listen(hookServer);

  try {
    const hookBase = serverBaseUrl(hookServer);
    await withServer(async (baseUrl) => {
      const created = await apiFetch(baseUrl, "/api/v1/webhooks", {
        method: "POST",
        body: {
          url: `${hookBase}/hook`,
          secret: "dead-letter-secret",
        },
      });
      assert.equal(created.status, 201);

      const emitted = await apiFetch(baseUrl, "/api/v1/signals/emit", {
        method: "POST",
        body: { signal: sampleSignal({ symbol: "DLQ" }) },
      });
      assert.equal(emitted.status, 202);

      await waitFor(
        async () =>
          (await getSignalStore().queueStats("signal-webhooks")).deadLetter ===
          1,
        2_000,
      );
      const stats = await getSignalStore().queueStats("signal-webhooks");
      assert.equal(stats.deadLetter, 1);

      process.env.SIGNAL_API_KEYS = "admin-test:admin";
      const redrive = await apiFetch(baseUrl, "/api/v1/admin/queue/redrive", {
        apiKey: "admin-test",
        method: "POST",
        body: { queue: "signal-webhooks" },
      });
      assert.equal(redrive.status, 200);
      assert.equal(redrive.body.redriven, 1);
    });
  } finally {
    await closeServer(hookServer);
  }
});

test("emit latency remains on the non-blocking hot path", async () => {
  await withServer(async (baseUrl) => {
    const startedAt = performance.now();
    const response = await apiFetch(baseUrl, "/api/v1/signals/emit", {
      method: "POST",
      body: { signal: sampleSignal({ symbol: "META" }) },
    });
    const elapsed = performance.now() - startedAt;

    assert.equal(response.status, 202);
    assert.equal(response.body.accepted, true);
    assert.ok(response.body.latencyMs < 100);
    assert.ok(elapsed < 1000);
  });
});

test("unsafe production signal API config is rejected by environment validation", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousStorageDriver = process.env.SIGNAL_STORAGE_DRIVER;
  const previousDevKey = process.env.SIGNAL_API_ALLOW_DEV_KEY;
  const previousSecretKey = process.env.SIGNAL_SECRET_ENCRYPTION_KEY;
  const previousPlainKeys = process.env.SIGNAL_API_KEYS;

  try {
    process.env.NODE_ENV = "production";
    process.env.SIGNAL_STORAGE_DRIVER = "memory";
    process.env.SIGNAL_API_ALLOW_DEV_KEY = "true";
    process.env.SIGNAL_SECRET_ENCRYPTION_KEY = undefined;
    process.env.SIGNAL_API_KEYS = "plain:admin";

    const report = validateSignalEnvironment();
    assert.equal(report.ok, false);
    assert.ok(
      report.errors.some((error) =>
        error.includes("SIGNAL_STORAGE_DRIVER=postgres"),
      ),
    );
    assert.ok(
      report.errors.some((error) =>
        error.includes("SIGNAL_SECRET_ENCRYPTION_KEY"),
      ),
    );
    assert.ok(
      report.errors.some((error) =>
        error.includes("plaintext SIGNAL_API_KEYS"),
      ),
    );
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    restoreEnv("SIGNAL_STORAGE_DRIVER", previousStorageDriver);
    restoreEnv("SIGNAL_API_ALLOW_DEV_KEY", previousDevKey);
    restoreEnv("SIGNAL_SECRET_ENCRYPTION_KEY", previousSecretKey);
    restoreEnv("SIGNAL_API_KEYS", previousPlainKeys);
  }
});

test("metrics responses do not leak API keys or webhook secrets", async () => {
  process.env.SIGNAL_API_KEYS = "test-key:admin";
  await resetSignalStoreForTests();

  await withServer(async (baseUrl) => {
    const created = await apiFetch(baseUrl, "/api/v1/admin/api-keys", {
      method: "POST",
      body: {
        name: "metrics-secret-check",
        scopes: ["signals:read"],
      },
    });
    assert.equal(created.status, 201);

    await apiFetch(baseUrl, "/api/v1/webhooks", {
      method: "POST",
      body: {
        url: "http://127.0.0.1:65530/hook",
        secret: "super-sensitive-webhook-secret",
      },
    });

    const metrics = await apiFetch(baseUrl, "/api/v1/metrics");
    assert.equal(metrics.status, 200);
    const serialized = JSON.stringify(metrics.body);
    assert.equal(serialized.includes(created.body.secret), false);
    assert.equal(serialized.includes("super-sensitive-webhook-secret"), false);
  });
});

async function apiFetch(
  baseUrl: string,
  path: string,
  options: {
    apiKey?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${options.apiKey ?? "test-key"}`,
      ...(options.body == null ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function withServer(callback: (baseUrl: string) => Promise<void>) {
  const server = createServer(app);
  await listen(server);
  try {
    await callback(serverBaseUrl(server));
  } finally {
    await closeServer(server);
  }
}

async function listen(server: Server) {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
}

function serverBaseUrl(server: Server) {
  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("Expected server to listen on a TCP address");
  }
  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  needle: string,
) {
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 3000;

  while (Date.now() < deadline) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) =>
        setTimeout(() => resolve({ done: false, value: new Uint8Array() }), 50),
      ),
    ]);
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
    if (text.includes(needle)) return text;
  }

  throw new Error(`Timed out waiting for ${needle}. Received: ${text}`);
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for condition");
}

function restoreEnv(name: string, value: string | undefined) {
  if (value == null) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function sampleSignal(overrides: Partial<SignalEnvelope> = {}): SignalEnvelope {
  const id = overrides.id ?? `sig-${Math.random().toString(36).slice(2)}`;

  return {
    protocol: "stocks-optimizer.signal",
    version: "1.0",
    id,
    messageId: overrides.messageId ?? `msg-${id}`,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    source: "unit-test",
    venue: "NASDAQ",
    symbol: "AAPL",
    timeframe: "1m",
    kind: "buy",
    confidence: 74,
    trust: 81,
    risk: 32,
    exposure: 2,
    sizingMode: "micro",
    maxExposure: 6,
    reason: "Breakout confirmed with controlled risk.",
    explanation:
      "The breakout has aligned confidence, trust, and fresh market data.",
    metrics: { calibratedConfidence: 78, dataFreshnessMs: 10 },
    modules: {
      discovery: { score: 82 },
      judgement: { trust: 80 },
      calibration: { confidence: 78 },
    },
    status: "confirmed",
    idempotencyKey: overrides.idempotencyKey ?? `idem-${id}`,
    ...overrides,
  };
}
