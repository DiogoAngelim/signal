import { InMemorySignalStore } from "@digelim/13.store";
import { describe, expect, it } from "vitest";
import { isReceivedEnvelope, receiveEnvelope } from "../src";

describe("received envelope intake", () => {
  it("accepts a valid minimal envelope", async () => {
    const payload = { amount: 120 };
    const result = await receiveEnvelope({
      kind: "query",
      name: "portfolio.evaluate.v1",
      payload,
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.protocol).toBe("signal.v1");
      expect(result.value.lifecycle).toBe("received");
      expect(isReceivedEnvelope(result.value)).toBe(true);
    }
  });

  it("stamps lifecycle and receivedAt", async () => {
    const result = await receiveEnvelope({
      kind: "event",
      name: "portfolio.received.v1",
      payload: { ok: true },
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.lifecycle).toBe("received");
      expect(typeof result.value.receivedAt).toBe("string");
      expect(result.value.receivedAt?.length).toBeGreaterThan(0);
    }
  });

  it("preserves payload", async () => {
    const payload = { nested: { value: 42 } };
    const result = await receiveEnvelope({
      kind: "mutation",
      name: "portfolio.update.v1",
      payload,
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.payload).toBe(payload);
    }
  });

  it("rejects malformed input", async () => {
    const result = await receiveEnvelope("invalid" as unknown);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects invalid protocol when present", async () => {
    const result = await receiveEnvelope({
      protocol: "signal.v9",
      kind: "query",
      name: "portfolio.evaluate.v1",
      payload: {},
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("PROTOCOL_ERROR");
    }
  });

  it("preserves or creates traceability", async () => {
    const result = await receiveEnvelope({
      protocol: "signal.v1",
      kind: "query",
      name: "portfolio.evaluate.v1",
      messageId: "message-1",
      traceId: "trace-1",
      timestamp: new Date().toISOString(),
      payload: { ok: true },
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.messageId).toBe("message-1");
      expect(result.value.traceId).toBe("trace-1");
    }

    const generated = await receiveEnvelope({
      kind: "query",
      name: "portfolio.evaluate.v1",
      payload: { ok: true },
    });

    expect(generated.ok).toBe(true);

    if (generated.ok) {
      expect(typeof generated.value.messageId).toBe("string");
      expect(generated.value.messageId.length).toBeGreaterThan(0);
      expect(typeof generated.value.traceId).toBe("string");
      expect(generated.value.traceId.length).toBeGreaterThan(0);
    }
  });

  it("persists received envelopes when store provided", async () => {
    const store = new InMemorySignalStore();
    const now = () => "2024-01-01T00:00:00.000Z";

    const result = await receiveEnvelope(
      {
        kind: "event",
        name: "portfolio.received.v1",
        messageId: "message-1",
        traceId: "trace-1",
        payload: { ok: true },
      },
      { store, now, idFactory: () => "record-1" },
    );

    expect(result.ok).toBe(true);

    const stored = await store.getByMessageId("message-1");
    expect(stored?.lifecycle).toBe("received");
    expect(stored?.synced).toBe(false);
  });

  it("skips duplicate messageId persistence", async () => {
    const store = new InMemorySignalStore();

    await receiveEnvelope(
      {
        kind: "query",
        name: "portfolio.evaluate.v1",
        messageId: "message-1",
        traceId: "trace-1",
        payload: { ok: true },
      },
      { store, idFactory: () => "record-1" },
    );

    await receiveEnvelope(
      {
        kind: "query",
        name: "portfolio.evaluate.v1",
        messageId: "message-1",
        traceId: "trace-1",
        payload: { ok: true },
      },
      { store, idFactory: () => "record-2" },
    );

    const unsynced = await store.getUnsynced();
    expect(unsynced).toHaveLength(1);
  });

  it("does not persist invalid envelopes", async () => {
    const store = new InMemorySignalStore();
    const result = await receiveEnvelope("invalid" as unknown, { store });

    expect(result.ok).toBe(false);
    const unsynced = await store.getUnsynced();
    expect(unsynced).toHaveLength(0);
  });
});
