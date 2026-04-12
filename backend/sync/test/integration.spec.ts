import { receiveEnvelope } from "@digelim/02.received";
import { validateEnvelope } from "@digelim/03.validated";
import { InMemorySignalStore } from "@digelim/13.store";
import { InMemoryIdempotencyStore } from "@digelim/14.idempotency";
import { describe, expect, it } from "vitest";
import { createCollectingTransport, syncPendingRecords } from "../src";

describe("offline-first lifecycle integration", () => {
  it("persists locally and syncs later", async () => {
    const store = new InMemorySignalStore();
    const idempotencyStore = new InMemoryIdempotencyStore();
    const now = () => "2024-01-01T00:00:00.000Z";

    const received = await receiveEnvelope(
      {
        kind: "mutation",
        name: "portfolio.update.v1",
        messageId: "message-1",
        traceId: "trace-1",
        payload: { ok: true },
        meta: { idempotencyKey: "idem-1" },
      },
      { store, now, idFactory: () => "record-1" },
    );

    expect(received.ok).toBe(true);

    const validated = await validateEnvelope(
      received.ok ? received.value : ({} as never),
      {
        store,
        now: () => "2024-01-02T00:00:00.000Z",
      },
    );

    expect(validated.ok).toBe(true);

    const stored = await store.getByMessageId("message-1");
    expect(stored?.lifecycle).toBe("validated");
    expect(stored?.synced).toBe(false);

    const { transport } = createCollectingTransport();
    await syncPendingRecords({
      store,
      transport,
      idempotencyStore,
      now: () => "2024-01-03T00:00:00.000Z",
    });

    const synced = await store.getByMessageId("message-1");
    expect(synced?.synced).toBe(true);
  });

  it("leaves records intact on sync failure", async () => {
    const store = new InMemorySignalStore();

    await receiveEnvelope(
      {
        kind: "event",
        name: "portfolio.received.v1",
        messageId: "message-2",
        traceId: "trace-2",
        payload: { ok: true },
      },
      { store },
    );

    const transport = {
      deliver: async () => ({ ok: false as const, error: "offline" }),
    };

    const result = await syncPendingRecords({ store, transport });
    expect(result.failed).toBe(1);

    const stored = await store.getByMessageId("message-2");
    expect(stored?.synced).toBe(false);
    expect(stored?.syncAttempts).toBe(1);
  });

  it("supports offline lifecycle without transport", async () => {
    const store = new InMemorySignalStore();
    const received = await receiveEnvelope(
      {
        kind: "query",
        name: "portfolio.evaluate.v1",
        messageId: "message-3",
        traceId: "trace-3",
        payload: { ok: true },
      },
      { store },
    );

    expect(received.ok).toBe(true);

    const validated = await validateEnvelope(
      received.ok ? received.value : ({} as never),
      {
        store,
      },
    );

    expect(validated.ok).toBe(true);
    const stored = await store.getByMessageId("message-3");
    expect(stored?.synced).toBe(false);
  });
});
