import { InMemorySignalStore, type LocalSignalRecord } from "@digelim/13.store";
import { describe, expect, it } from "vitest";
import { validateEnvelope } from "../src";

const createReceivedEnvelope = () => ({
  protocol: "signal.v1",
  kind: "query",
  name: "portfolio.evaluate.v1",
  messageId: "message-1",
  timestamp: new Date().toISOString(),
  traceId: "trace-1",
  payload: { ok: true },
  lifecycle: "received" as const,
  receivedAt: new Date().toISOString(),
});

const createRecordFromReceived = (
  overrides: Partial<LocalSignalRecord> = {},
): LocalSignalRecord => ({
  id: "record-1",
  traceId: "trace-1",
  messageId: "message-1",
  protocol: "signal.v1",
  kind: "query",
  name: "portfolio.evaluate.v1",
  lifecycle: "received",
  payload: { ok: true },
  timestamp: "2024-01-01T00:00:00.000Z",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  synced: false,
  syncAttempts: 0,
  ...overrides,
});

describe("validated envelope checks", () => {
  it("accepts a properly received valid envelope", async () => {
    const result = await validateEnvelope(createReceivedEnvelope());

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.lifecycle).toBe("validated");
      expect(typeof result.value.validatedAt).toBe("string");
    }
  });

  it("rejects invalid operation names", async () => {
    const result = await validateEnvelope({
      ...createReceivedEnvelope(),
      name: "invalid",
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.issues.some((issue) => issue.path === "name")).toBe(true);
    }
  });

  it("rejects missing required fields", async () => {
    const invalid = createReceivedEnvelope() as Record<string, unknown>;
    invalid.payload = undefined;

    const result = await validateEnvelope(invalid as never);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.issues.some((issue) => issue.path === "payload")).toBe(
        true,
      );
    }
  });

  it("rejects invalid lifecycle transitions", async () => {
    const result = await validateEnvelope({
      ...createReceivedEnvelope(),
      lifecycle: "validated" as const,
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("TRANSITION_ERROR");
    }
  });

  it("returns structured issues", async () => {
    const result = await validateEnvelope({
      ...createReceivedEnvelope(),
      timestamp: "not-a-date",
      traceId: "",
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toHaveProperty("path");
      expect(result.issues[0]).toHaveProperty("message");
      expect(result.issues[0]).toHaveProperty("rule");
    }
  });

  it("flags edge-case field values", async () => {
    const result = await validateEnvelope({
      ...createReceivedEnvelope(),
      messageId: "",
      traceId: "",
      timestamp: "bad-timestamp",
      kind: "command" as unknown as "query",
      meta: {
        replay: "nope",
        extra: "unexpected",
      },
    } as unknown as Parameters<typeof validateEnvelope>[0]);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      const paths = result.issues.map((issue) => issue.path);
      expect(paths).toContain("messageId");
      expect(paths).toContain("traceId");
      expect(paths).toContain("timestamp");
      expect(paths).toContain("kind");
      expect(paths).toContain("meta.replay");
      expect(paths).toContain("meta.extra");
    }
  });

  it("updates stored records on validation", async () => {
    const store = new InMemorySignalStore();
    await store.append(createRecordFromReceived());

    const result = await validateEnvelope(createReceivedEnvelope(), {
      store,
      now: () => "2024-01-02T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);

    const stored = await store.getByMessageId("message-1");
    expect(stored?.lifecycle).toBe("validated");
    expect(stored?.updatedAt).toBe("2024-01-02T00:00:00.000Z");
  });

  it("does not update stored record on validation failure", async () => {
    const store = new InMemorySignalStore();
    await store.append(createRecordFromReceived());

    const result = await validateEnvelope(
      { ...createReceivedEnvelope(), name: "invalid" },
      { store },
    );

    expect(result.ok).toBe(false);
    const stored = await store.getByMessageId("message-1");
    expect(stored?.lifecycle).toBe("received");
  });

  it("handles repeated validation attempts", async () => {
    const store = new InMemorySignalStore();
    await store.append(createRecordFromReceived());

    await validateEnvelope(createReceivedEnvelope(), {
      store,
      now: () => "2024-01-02T00:00:00.000Z",
    });
    await validateEnvelope(createReceivedEnvelope(), {
      store,
      now: () => "2024-01-03T00:00:00.000Z",
    });

    const stored = await store.getByMessageId("message-1");
    expect(stored?.lifecycle).toBe("validated");
    expect(stored?.updatedAt).toBe("2024-01-03T00:00:00.000Z");

    const unsynced = await store.getUnsynced();
    expect(unsynced).toHaveLength(1);
  });
});
