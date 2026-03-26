import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SignalErrorEnvelope } from "@signal/protocol";

const mocks = vi.hoisted(() => ({
  drizzle: vi.fn(),
  pool: vi.fn(),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: mocks.drizzle,
}));

vi.mock("pg", () => ({
  Pool: mocks.pool,
}));

import { createPostgresIdempotencyStore } from "../src";

function createDbHarness() {
  const selectQueue: unknown[][] = [];
  const updates: Array<{ type: "complete" | "fail"; values: unknown }> = [];
  const inserted: unknown[] = [];
  let insertShouldThrow = false;

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => selectQueue.shift() ?? []),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: unknown) => {
        if (insertShouldThrow) {
          throw new Error("unique violation");
        }
        inserted.push(values);
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn(async () => {
          updates.push({
            type:
              values &&
              typeof values === "object" &&
              "error" in (values as Record<string, unknown>)
                ? "fail"
                : "complete",
            values,
          });
        }),
      })),
    })),
  };

  return {
    db,
    selectQueue,
    updates,
    inserted,
    setInsertShouldThrow(value: boolean) {
      insertShouldThrow = value;
    },
  };
}

beforeEach(() => {
  mocks.drizzle.mockReset();
  mocks.pool.mockReset();
});

describe("postgres idempotency store", () => {
  it("reserves new records and completes them", async () => {
    const harness = createDbHarness();
    mocks.drizzle.mockReturnValue(harness.db);

    const store = createPostgresIdempotencyStore({
      connectionString: "postgres://example",
    });

    harness.selectQueue.push([]);

    const reservation = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-a",
    });

    await store.complete({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-a",
      result: { ok: true },
      messageId: "msg-1",
    });

    expect(reservation.state).toBe("reserved");
    expect(harness.inserted).toHaveLength(1);
    expect(harness.updates).toEqual([
      {
        type: "complete",
        values: {
          status: "completed",
          result: { ok: true },
          messageId: "msg-1",
          updatedAt: expect.any(Date),
        },
      },
    ]);
    expect(mocks.pool).toHaveBeenCalledWith({
      connectionString: "postgres://example",
    });
  });

  it("detects conflicts, inflight records, and completed replays", async () => {
    const harness = createDbHarness();
    mocks.drizzle.mockReturnValue(harness.db);
    const store = createPostgresIdempotencyStore({
      connectionString: "postgres://example",
    });

    harness.selectQueue.push([
      {
        operationName: "payment.capture.v1",
        idempotencyKey: "capture-1",
        payloadFingerprint: "fingerprint-a",
        status: "pending",
        result: null,
        error: null,
        createdAt: new Date("2026-03-25T00:00:00.000Z"),
        updatedAt: new Date("2026-03-25T00:00:00.000Z"),
        messageId: null,
      },
    ]);
    harness.selectQueue.push([
      {
        operationName: "payment.capture.v1",
        idempotencyKey: "capture-2",
        payloadFingerprint: "fingerprint-b",
        status: "completed",
        result: { ok: true },
        error: null,
        createdAt: new Date("2026-03-25T00:00:00.000Z"),
        updatedAt: new Date("2026-03-25T00:00:00.000Z"),
        messageId: "msg-2",
      },
    ]);
    harness.selectQueue.push([
      {
        operationName: "payment.capture.v1",
        idempotencyKey: "capture-3",
        payloadFingerprint: "fingerprint-c",
        status: "failed",
        result: null,
        error: { code: "CONFLICT", message: "failed" } satisfies SignalErrorEnvelope,
        createdAt: new Date("2026-03-25T00:00:00.000Z"),
        updatedAt: new Date("2026-03-25T00:00:00.000Z"),
        messageId: null,
      },
    ]);
    harness.selectQueue.push([
      {
        operationName: "payment.capture.v1",
        idempotencyKey: "capture-4",
        payloadFingerprint: "fingerprint-other",
        status: "completed",
        result: { ok: true },
        error: null,
        createdAt: new Date("2026-03-25T00:00:00.000Z"),
        updatedAt: new Date("2026-03-25T00:00:00.000Z"),
        messageId: "msg-4",
      },
    ]);

    const inflight = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-a",
    });
    const replayed = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-2",
      payloadFingerprint: "fingerprint-b",
    });
    const failed = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-3",
      payloadFingerprint: "fingerprint-c",
    });
    const conflict = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-4",
      payloadFingerprint: "fingerprint-d",
    });

    expect(inflight.state).toBe("inflight");
    expect(replayed.state).toBe("replayed");
    expect(failed.state).toBe("replayed");
    expect(conflict.state).toBe("conflict");
  });

  it("handles insert races and failure updates", async () => {
    const harness = createDbHarness();
    mocks.drizzle.mockReturnValue(harness.db);
    const store = createPostgresIdempotencyStore({
      connectionString: "postgres://example",
    });

    harness.setInsertShouldThrow(true);
    harness.selectQueue.push([]);
    harness.selectQueue.push([]);

    const inflight = await store.reserve({
      operationName: "user.onboard.v1",
      idempotencyKey: "onboard-1",
      payloadFingerprint: "fingerprint-a",
    });

    await store.fail({
      operationName: "user.onboard.v1",
      idempotencyKey: "onboard-1",
      payloadFingerprint: "fingerprint-a",
      error: {
        code: "INTERNAL_ERROR",
        message: "boom",
        retryable: true,
      },
    });

    expect(inflight.state).toBe("inflight");
    expect(harness.updates).toEqual([
      {
        type: "fail",
        values: {
          status: "failed",
          error: {
            code: "INTERNAL_ERROR",
            message: "boom",
            retryable: true,
          },
          updatedAt: expect.any(Date),
        },
      },
    ]);
  });

  it("reconciles retry records after a unique violation", async () => {
    const harness = createDbHarness();
    mocks.drizzle.mockReturnValue(harness.db);
    const store = createPostgresIdempotencyStore({
      connectionString: "postgres://example",
    });

    harness.setInsertShouldThrow(true);
    harness.selectQueue.push([]);
    harness.selectQueue.push([
      {
        operationName: "payment.capture.v1",
        idempotencyKey: "capture-10",
        payloadFingerprint: "fingerprint-other",
        status: "completed",
        result: { ok: true },
        error: null,
        createdAt: new Date("2026-03-25T00:00:00.000Z"),
        updatedAt: new Date("2026-03-25T00:00:00.000Z"),
        messageId: "msg-10",
      },
    ]);
    harness.selectQueue.push([]);
    harness.selectQueue.push([
      {
        operationName: "payment.capture.v1",
        idempotencyKey: "capture-11",
        payloadFingerprint: "fingerprint-b",
        status: "pending",
        result: null,
        error: null,
        createdAt: new Date("2026-03-25T00:00:00.000Z"),
        updatedAt: new Date("2026-03-25T00:00:00.000Z"),
        messageId: null,
      },
    ]);
    harness.selectQueue.push([]);
    harness.selectQueue.push([
      {
        operationName: "payment.capture.v1",
        idempotencyKey: "capture-12",
        payloadFingerprint: "fingerprint-c",
        status: "completed",
        result: { ok: true },
        error: null,
        createdAt: new Date("2026-03-25T00:00:00.000Z"),
        updatedAt: new Date("2026-03-25T00:00:00.000Z"),
        messageId: "msg-12",
      },
    ]);

    const conflict = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-10",
      payloadFingerprint: "fingerprint-a",
    });
    const inflight = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-11",
      payloadFingerprint: "fingerprint-b",
    });
    const replayed = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-12",
      payloadFingerprint: "fingerprint-c",
    });

    expect(conflict.state).toBe("conflict");
    expect(inflight.state).toBe("inflight");
    expect(replayed.state).toBe("replayed");
  });
});
