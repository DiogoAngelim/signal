import type { SignalErrorEnvelope } from "@signal/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), pool: vi.fn() }));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: mocks.drizzle }));
vi.mock("pg", () => ({ Pool: mocks.pool }));

import { createPostgresIdempotencyStore } from "../src";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    operationName: "payment.capture.v1",
    idempotencyKey: "capture-1",
    payloadFingerprint: "fingerprint-a",
    status: "pending",
    result: null,
    resultMeta: null,
    error: null,
    messageId: null,
    createdAt: new Date("2026-03-25T00:00:00.000Z"),
    updatedAt: new Date("2026-03-25T00:00:00.000Z"),
    reservationToken: "reservation-token",
    reservationExpiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

function createDbHarness() {
  const selectQueue: unknown[][] = [];
  const insertQueue: unknown[][] = [];
  const updateQueue: unknown[][] = [];
  const updates: Array<{ values: unknown }> = [];
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
      values: vi.fn((values: unknown) => {
        inserted.push(values);
        return {
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => {
              if (insertShouldThrow) throw new Error("unique violation");
              return insertQueue.shift() ?? [];
            }),
          })),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            updates.push({ values });
            return updateQueue.shift() ?? [];
          }),
        })),
      })),
    })),
  };
  return {
    db, selectQueue, insertQueue, updateQueue, updates, inserted,
    setInsertShouldThrow(value: boolean) { insertShouldThrow = value; },
  };
}

beforeEach(() => {
  mocks.drizzle.mockReset();
  mocks.pool.mockReset();
  mocks.pool.mockImplementation(() => ({}));
});

describe("postgres idempotency store", () => {
  it("reserves a new record and completes it with the reservation token", async () => {
    const harness = createDbHarness();
    mocks.drizzle.mockReturnValue(harness.db);
    harness.insertQueue.push([makeRow()]);
    harness.updateQueue.push([{ operationName: "payment.capture.v1" }]);
    const store = createPostgresIdempotencyStore({ connectionString: "postgres://example" });

    const reservation = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-a",
    });
    expect(reservation.state).toBe("reserved");
    expect(reservation.record?.reservationToken).toBe("reservation-token");

    await store.complete({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-a",
      reservationToken: "reservation-token",
      result: { ok: true },
      messageId: "msg-1",
    });

    expect(harness.inserted).toHaveLength(1);
    expect(harness.inserted[0]).toMatchObject({
      status: "pending",
      reservationToken: expect.any(String),
      reservationExpiresAt: expect.any(Date),
    });
    expect(harness.updates[0].values).toMatchObject({
      status: "completed",
      reservationToken: null,
      reservationExpiresAt: null,
    });
  });

  it("reclaims an expired reservation with a new fencing token", async () => {
    const harness = createDbHarness();
    mocks.drizzle.mockReturnValue(harness.db);
    harness.insertQueue.push([]);
    harness.updateQueue.push([makeRow({
      reservationToken: "new-token",
      reservationExpiresAt: new Date(Date.now() + 60_000),
    })]);
    const store = createPostgresIdempotencyStore({ connectionString: "postgres://example" });

    const reservation = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-a",
    });
    expect(reservation.state).toBe("reserved");
    expect(reservation.record?.reservationToken).toBe("new-token");
  });

  it("renews only the current unexpired reservation", async () => {
    const harness = createDbHarness();
    mocks.drizzle.mockReturnValue(harness.db);
    harness.updateQueue.push([{ operationName: "payment.capture.v1" }], []);
    const store = createPostgresIdempotencyStore({ connectionString: "postgres://example" });

    await expect(store.renewReservation({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-a",
      reservationToken: "reservation-token",
      leaseMs: 30_000,
    })).resolves.toBe(true);
    await expect(store.renewReservation({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-a",
      reservationToken: "stale-token",
      leaseMs: 30_000,
    })).resolves.toBe(false);
  });

  it("distinguishes inflight, completed replay, failed replay, and fingerprint conflict", async () => {
    const harness = createDbHarness();
    mocks.drizzle.mockReturnValue(harness.db);
    const store = createPostgresIdempotencyStore({ connectionString: "postgres://example" });
    const cases = [
      { row: makeRow(), fingerprint: "fingerprint-a", state: "inflight" },
      { row: makeRow({ status: "completed", result: { ok: true } }), fingerprint: "fingerprint-a", state: "replayed" },
      { row: makeRow({ status: "failed", error: { code: "INTERNAL_ERROR", message: "failed" } satisfies SignalErrorEnvelope }), fingerprint: "fingerprint-a", state: "replayed" },
      { row: makeRow({ status: "completed" }), fingerprint: "different", state: "conflict" },
    ];
    for (const testCase of cases) {
      harness.insertQueue.push([]);
      harness.updateQueue.push([]);
      harness.selectQueue.push([testCase.row]);
      const result = await store.reserve({
        operationName: "payment.capture.v1",
        idempotencyKey: "capture-1",
        payloadFingerprint: testCase.fingerprint,
      });
      expect(result.state).toBe(testCase.state);
    }
  });

  it("fences failure updates by reservation token", async () => {
    const harness = createDbHarness();
    mocks.drizzle.mockReturnValue(harness.db);
    harness.updateQueue.push([{ operationName: "user.onboard.v1" }]);
    const store = createPostgresIdempotencyStore({ connectionString: "postgres://example" });

    await store.fail({
      operationName: "user.onboard.v1",
      idempotencyKey: "onboard-1",
      payloadFingerprint: "fingerprint-a",
      reservationToken: "reservation-token",
      error: {
        code: "INTERNAL_ERROR",
        message: "boom",
        retryable: true,
      },
    });
    expect(harness.updates[0].values).toMatchObject({
      status: "failed",
      reservationToken: null,
      reservationExpiresAt: null,
    });
  });
});
