import { InMemorySignalStore, type LocalSignalRecord } from "@digelim/13.store";
import { InMemoryIdempotencyStore } from "@digelim/14.idempotency";
import { describe, expect, it } from "vitest";
import { createCollectingTransport, syncPendingRecords } from "../src";

const createRecord = (
  overrides: Partial<LocalSignalRecord> = {},
): LocalSignalRecord => ({
  id: "record-1",
  traceId: "trace-1",
  messageId: "message-1",
  protocol: "signal.v1",
  kind: "event",
  name: "portfolio.received.v1",
  lifecycle: "validated",
  payload: { ok: true },
  timestamp: "2024-01-01T00:00:00.000Z",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  synced: false,
  syncAttempts: 0,
  ...overrides,
});

describe("sync engine", () => {
  it("syncs and marks records as synced", async () => {
    const store = new InMemorySignalStore();
    await store.append(createRecord());

    const { transport } = createCollectingTransport();
    const result = await syncPendingRecords({
      store,
      transport,
      now: () => "2024-01-02T00:00:00.000Z",
    });

    expect(result).toEqual({ attempted: 1, succeeded: 1, failed: 0 });

    const stored = await store.getById("record-1");
    expect(stored?.synced).toBe(true);
    expect(stored?.lastSyncedAt).toBe("2024-01-02T00:00:00.000Z");
  });

  it("increments attempts on failure", async () => {
    const store = new InMemorySignalStore();
    await store.append(createRecord());

    const transport = {
      deliver: async () => ({ ok: false as const, error: "offline" }),
    };

    const result = await syncPendingRecords({ store, transport });

    expect(result.failed).toBe(1);
    const stored = await store.getById("record-1");
    expect(stored?.syncAttempts).toBe(1);
    expect(stored?.lastSyncError).toBe("offline");
  });

  it("is safe to run repeatedly", async () => {
    const store = new InMemorySignalStore();
    await store.append(createRecord());

    const { transport } = createCollectingTransport();
    await syncPendingRecords({ store, transport });

    const result = await syncPendingRecords({ store, transport });
    expect(result).toEqual({ attempted: 0, succeeded: 0, failed: 0 });
  });

  it("skips duplicate deliveries when idempotency applies", async () => {
    const store = new InMemorySignalStore();
    await store.append(
      createRecord({
        id: "record-1",
        messageId: "message-1",
        meta: { idempotencyKey: "idem-1" },
      }),
    );
    await store.append(
      createRecord({
        id: "record-2",
        messageId: "message-2",
        meta: { idempotencyKey: "idem-1" },
      }),
    );

    const { transport, delivered } = createCollectingTransport();
    const idempotencyStore = new InMemoryIdempotencyStore();

    const result = await syncPendingRecords({
      store,
      transport,
      idempotencyStore,
      now: () => "2024-01-02T00:00:00.000Z",
    });

    expect(result.succeeded).toBe(2);
    expect(delivered).toHaveLength(1);

    const second = await store.getById("record-2");
    expect(second?.synced).toBe(true);
  });

  it("handles empty unsynced queues", async () => {
    const store = new InMemorySignalStore();
    const { transport } = createCollectingTransport();

    const result = await syncPendingRecords({ store, transport });
    expect(result).toEqual({ attempted: 0, succeeded: 0, failed: 0 });
  });

  it("handles partial sync success", async () => {
    const store = new InMemorySignalStore();
    await store.append(createRecord({ id: "record-1" }));
    await store.append(
      createRecord({ id: "record-2", messageId: "message-2" }),
    );

    let attempt = 0;
    const transport = {
      deliver: async () => {
        attempt += 1;
        if (attempt === 1) {
          return { ok: true as const };
        }
        return { ok: false as const, error: "down" };
      },
    };

    const result = await syncPendingRecords({ store, transport });
    expect(result).toEqual({ attempted: 2, succeeded: 1, failed: 1 });

    const first = await store.getById("record-1");
    const second = await store.getById("record-2");
    expect(first?.synced).toBe(true);
    expect(second?.synced).toBe(false);
  });
});
