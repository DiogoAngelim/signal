import type { OutboxPort, OutboxRecord } from "@signal/ports";
import type { SignalEnvelope } from "@signal/protocol";
import { describe, expect, it, vi } from "vitest";
import { dispatchOutboxBatch } from "./outbox";

function record(id: string, attempts = 1): OutboxRecord {
  return {
    id,
    attempts,
    createdAt: "2026-11-09T00:00:00.000Z",
    leaseToken: "lease-" + id,
    envelope: {
      protocol: "signal.v1",
      kind: "event",
      name: "example.event.v1",
      messageId: id,
      timestamp: "2026-11-09T00:00:00.000Z",
      payload: { value: id },
    } as SignalEnvelope,
  };
}

function createOutbox(records: OutboxRecord[]) {
  const acknowledged: string[] = [];
  const retried: Array<{ id: string; maxAttempts: number }> = [];
  const outbox: OutboxPort = {
    getStats: vi.fn(async () => ({ pending: 0, processing: 0, delivered: 0, deadLettered: 0, oldestPendingAgeMs: null })),
    claimBatch: vi.fn(async () => records),
    acknowledge: vi.fn(async ({ id }) => {
      acknowledged.push(id);
      return true;
    }),
    retry: vi.fn(async ({ id, maxAttempts }) => {
      retried.push({ id, maxAttempts });
      return "scheduled" as const;
    }),
  };
  return { outbox, acknowledged, retried };
}

describe("durable outbox dispatcher", () => {
  it("dispatches and acknowledges a claimed batch", async () => {
    const harness = createOutbox([record("event-1"), record("event-2")]);
    const dispatch = vi.fn(async () => undefined);
    const result = await dispatchOutboxBatch(
      harness.outbox,
      { dispatch, subscribe: () => () => undefined },
      { workerId: "worker-1", now: () => 1000 },
    );

    expect(result).toEqual({
      claimed: 2,
      delivered: 2,
      scheduled: 0,
      deadLettered: 0,
      leaseLost: 0,
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(harness.acknowledged).toEqual(["event-1", "event-2"]);
  });

  it("reschedules failed delivery with bounded exponential delay", async () => {
    const harness = createOutbox([record("event-3", 3)]);
    const dispatch = vi.fn(async () => {
      throw new Error("broker unavailable");
    });
    const result = await dispatchOutboxBatch(
      harness.outbox,
      { dispatch, subscribe: () => () => undefined },
      { workerId: "worker-2", now: () => 10_000 },
    );

    expect(result.scheduled).toBe(1);
    expect(harness.retried).toEqual([{ id: "event-3", maxAttempts: 12 }]);
    expect(harness.outbox.retry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "event-3",
        workerId: "worker-2",
        availableAt: new Date(14_000).toISOString(),
        error: "broker unavailable",
      }),
    );
  });

  it("does not report delivery when the lease was lost before acknowledgement", async () => {
    const harness = createOutbox([record("event-4")]);
    harness.outbox.acknowledge = vi.fn(async () => false);
    const result = await dispatchOutboxBatch(
      harness.outbox,
      { dispatch: vi.fn(async () => undefined), subscribe: () => () => undefined },
    );
    expect(result.delivered).toBe(0);
    expect(result.leaseLost).toBe(1);
  });

  it("rejects invalid batch bounds before claiming", async () => {
    const harness = createOutbox([]);
    await expect(
      dispatchOutboxBatch(
        harness.outbox,
        { dispatch: vi.fn(), subscribe: () => () => undefined },
        { limit: 0 },
      ),
    ).rejects.toThrow("limit");
    expect(harness.outbox.claimBatch).not.toHaveBeenCalled();
  });
});
