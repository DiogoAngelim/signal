import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { test } from "node:test";
import { handleWorkbenchHostRequest } from "../dist/src/handler.js";

// Deliberately isolated loopback Workbench stub: no external requests, real
// credentials, databases, customer effects, scheduled jobs, or Vercel deploys.
const ownerId = "offline-test-owner";
const token = "w".repeat(48);
const ingress = "i".repeat(48);
const event = {
  schemaVersion: 2,
  sourceRevision: 1,
  eventId: "offline-event-00001",
  signalId: "offline-signal-0001",
  ownerId,
  eventType: "signal.created",
  opportunityId: "2b46c98b-97f3-4d35-9cc3-5a21a1a6f922",
  sourceName: "Offline fixture",
  signalType: "delivery_capacity",
  title: "Synthetic offline Signal",
  statement: "Synthetic signal for contract verification only.",
  observedAt: "2026-11-14T12:00:00.000Z",
  confidence: 0.82,
  payload: { synthetic: true },
};

async function callHost(payload) {
  const request = Readable.from([JSON.stringify(payload)]);
  request.method = "POST";
  request.headers = { authorization: "Bearer " + ingress };
  const headers = new Map();
  const response = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    end(content) { this.body = JSON.parse(content); },
  };
  await handleWorkbenchHostRequest(request, response, "/events");
  assert.equal(headers.get("cache-control"), "no-store");
  return { status: response.statusCode, body: response.body };
}

test("synthetic host-to-Workbench delivery verifies signature, ack, 5xx retry and permanent failure", async () => {
  const original = new Map(
    ["WORKBENCH_BASE_URL", "WORKBENCH_OWNER_ID", "WORKBENCH_SIGNAL_TOKEN", "SIGNAL_INGEST_SECRET"]
      .map((name) => [name, process.env[name]]),
  );
  let mode = "accept";
  const calls = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const expectedSignature = "sha256=" + createHmac("sha256", token).update(raw).digest("hex");
    calls.push({ path: req.url, signatureMatches: req.headers["x-signal-signature"] === expectedSignature,
      tokenMatches: req.headers["x-signal-token"] === token, body: JSON.parse(raw), mode });
    res.setHeader("content-type", "application/json");
    if (mode === "server-error") {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "temporary unavailable" }));
    } else if (mode === "client-error") {
      res.writeHead(403);
      res.end(JSON.stringify({ error: "permanent rejection" }));
    } else if (mode === "bad-ack") {
      res.writeHead(200);
      res.end(JSON.stringify({ accepted: true, duplicate: false,
        eventId: "different-event", sourceRevision: event.sourceRevision }));
    } else {
      res.writeHead(200);
      res.end(JSON.stringify({ accepted: true, duplicate: false,
        eventId: event.eventId, sourceRevision: event.sourceRevision }));
    }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    process.env.WORKBENCH_BASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.WORKBENCH_OWNER_ID = ownerId;
    process.env.WORKBENCH_SIGNAL_TOKEN = token;
    process.env.SIGNAL_INGEST_SECRET = ingress;

    mode = "accept";
    const accepted = await callHost(event);
    assert.equal(accepted.status, 202);
    assert.deepEqual(accepted.body, {
      accepted: true, eventId: event.eventId, sourceRevision: event.sourceRevision,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/api/integrations/signal/events");
    assert.equal(calls[0].signatureMatches, true);
    assert.equal(calls[0].tokenMatches, true);
    assert.deepEqual(calls[0].body, event);

    const beforeCrossOwner = calls.length;
    const rejected = await callHost({ ...event, ownerId: "another-test-owner" });
    assert.equal(rejected.status, 400);
    assert.equal(calls.length, beforeCrossOwner, "Cross-owner event must not leave the host");

    mode = "server-error";
    const temporary = await callHost(event);
    assert.equal(temporary.status, 503);
    assert.deepEqual(temporary.body, { message: "Signal event delivery unavailable." });

    mode = "client-error";
    const permanent = await callHost(event);
    assert.equal(permanent.status, 400);
    assert.deepEqual(permanent.body, { message: "Signal event rejected." });

    mode = "bad-ack";
    const mismatched = await callHost(event);
    assert.equal(mismatched.status, 400);
    assert.deepEqual(mismatched.body, { message: "Signal event rejected." });

    assert.equal(calls.length, 4);
    assert.equal(calls.every((c) => c.signatureMatches && c.tokenMatches), true);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
