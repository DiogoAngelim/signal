import { describe, expect, it } from "vitest";
import { InMemorySignalStore, type LocalSignalRecord } from "../src";

const createRecord = (
  overrides: Partial<LocalSignalRecord> = {},
): LocalSignalRecord => ({
  id: "record-1",
  traceId: "trace-1",
  messageId: "message-1",
  protocol: "signal.v1",
  kind: "mutation",
  name: "portfolio.update.v1",
  lifecycle: "received",
  payload: { ok: true },
  timestamp: "2024-01-01T00:00:00.000Z",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  synced: false,
  syncAttempts: 0,
  ...overrides,
});

describe("signal store", () => {
  it("appends records", async () => {
    const store = new InMemorySignalStore();
    const record = createRecord();

    await store.append(record);
    const stored = await store.getById(record.id);

    expect(stored).not.toBeNull();
    expect(stored?.messageId).toBe(record.messageId);
  });

  it("updates records", async () => {
    const store = new InMemorySignalStore();
    const record = createRecord();

    await store.append(record);

    const updated: LocalSignalRecord = {
      ...record,
      lifecycle: "validated",
      updatedAt: "2024-01-02T00:00:00.000Z",
    };

    await store.update(updated);

    const stored = await store.getById(record.id);
    expect(stored?.lifecycle).toBe("validated");
    expect(stored?.updatedAt).toBe("2024-01-02T00:00:00.000Z");
  });

  it("fetches by messageId", async () => {
    const store = new InMemorySignalStore();
    const record = createRecord();

    await store.append(record);

    const stored = await store.getByMessageId(record.messageId);
    expect(stored?.id).toBe(record.id);
  });

  it("lists unsynced records", async () => {
    const store = new InMemorySignalStore();

    await store.append(createRecord({ id: "record-1" }));
    await store.append(
      createRecord({
        id: "record-2",
        messageId: "message-2",
        synced: true,
      }),
    );

    const unsynced = await store.getUnsynced();

    expect(unsynced).toHaveLength(1);
    expect(unsynced[0].id).toBe("record-1");
  });

  it("marks records as synced", async () => {
    const store = new InMemorySignalStore();
    const record = createRecord();

    await store.append(record);
    await store.markSynced(record.id, "2024-01-03T00:00:00.000Z");

    const stored = await store.getById(record.id);
    expect(stored?.synced).toBe(true);
    expect(stored?.lastSyncedAt).toBe("2024-01-03T00:00:00.000Z");
  });

  it("marks sync failure and increments attempts", async () => {
    const store = new InMemorySignalStore();
    const record = createRecord();

    await store.append(record);
    await store.markSyncFailed(record.id, "network down");

    const stored = await store.getById(record.id);
    expect(stored?.syncAttempts).toBe(1);
    expect(stored?.lastSyncError).toBe("network down");
  });

  it("preserves trace grouping", async () => {
    const store = new InMemorySignalStore();

    await store.append(createRecord({ id: "record-1", traceId: "trace-1" }));
    await store.append(
      createRecord({
        id: "record-2",
        messageId: "message-2",
        traceId: "trace-1",
      }),
    );
    await store.append(
      createRecord({
        id: "record-3",
        messageId: "message-3",
        traceId: "trace-2",
      }),
    );

    const grouped = await store.listByTraceId("trace-1");

    expect(grouped).toHaveLength(2);
    expect(grouped[0].id).toBe("record-1");
    expect(grouped[1].id).toBe("record-2");
  });
});
