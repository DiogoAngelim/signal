import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { handleWorkbenchHostRequest } from "../dist/src/handler.js";

// The synthetic requests below do not open a network connection or configure a real token.
function request(method, authorization, chunks = []) {
  const input = Readable.from(chunks);
  input.method = method;
  input.headers = authorization === undefined ? {} : { authorization };
  return input;
}
async function invoke(method, endpoint, authorization, chunks) {
  let body;
  const headers = new Map();
  const response = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    end(payload) { body = JSON.parse(payload); },
  };
  await handleWorkbenchHostRequest(request(method, authorization, chunks), response, endpoint);
  assert.equal(headers.get("cache-control"), "no-store");
  return { status: response.statusCode, body, headers };
}

test("public health is liveness-only with no credential or database presence leak", async () => {
  const response = await invoke("GET", "/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok", probe: "liveness" });
  assert.equal(JSON.stringify(response.body).includes("Configured"), false);
});

test("upstream event endpoint denies missing or malformed bearer before parsing body", async () => {
  const prior = process.env.SIGNAL_INGEST_SECRET;
  process.env.SIGNAL_INGEST_SECRET = "A".repeat(32);
  try {
    const missing = await invoke("POST", "/events", undefined, ['{"eventId":"x"}']);
    assert.equal(missing.status, 401);
    const malformed = await invoke("POST", "/events", "Invalid-header", ['{"eventId":"x"}']);
    assert.equal(malformed.status, 401);
    const wrong = await invoke("POST", "/events", "Bearer " + "B".repeat(32));
    assert.equal(wrong.status, 401);
    assert.equal(JSON.stringify(wrong.body).includes("A".repeat(32)), false);
  } finally {
    if (prior === undefined) delete process.env.SIGNAL_INGEST_SECRET;
    else process.env.SIGNAL_INGEST_SECRET = prior;
  }
});

test("byte-length mismatched Unicode bearer fails 401 rather than throwing", async () => {
  const prior = process.env.SIGNAL_INGEST_SECRET;
  process.env.SIGNAL_INGEST_SECRET = "A".repeat(31) + "é";
  try {
    const result = await invoke("POST", "/events", "Bearer " + "A".repeat(31) + "Z");
    assert.equal(result.status, 401);
  } finally {
    if (prior === undefined) delete process.env.SIGNAL_INGEST_SECRET;
    else process.env.SIGNAL_INGEST_SECRET = prior;
  }
});

test("authorized invalid event payload fails closed without invoking connector", async () => {
  const prior = process.env.SIGNAL_INGEST_SECRET;
  process.env.SIGNAL_INGEST_SECRET = "T".repeat(32);
  try {
    const malformed = await invoke("POST", "/events", "Bearer " + "T".repeat(32), ['{not json']);
    assert.equal(malformed.status, 400);
    assert.deepEqual(malformed.body, { message: "Invalid Signal event." });
    const oversized = await invoke("POST", "/events", "Bearer " + "T".repeat(32), ["x".repeat(65_537)]);
    assert.equal(oversized.status, 413);
    assert.deepEqual(oversized.body, { message: "Request body is too large." });
  } finally {
    if (prior === undefined) delete process.env.SIGNAL_INGEST_SECRET;
    else process.env.SIGNAL_INGEST_SECRET = prior;
  }
});

test("scheduler endpoint denies absent authorization and unknown routes return 404", async () => {
  const prior = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "C".repeat(32);
  try {
    const denied = await invoke("GET", "/sync/outcomes");
    assert.equal(denied.status, 401);
    const unknown = await invoke("DELETE", "/events");
    assert.equal(unknown.status, 404);
  } finally {
    if (prior === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prior;
  }
});
