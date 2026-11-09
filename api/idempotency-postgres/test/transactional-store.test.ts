import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pool: vi.fn(),
  client: {
    query: vi.fn(),
    release: vi.fn(),
  },
  poolQuery: vi.fn(),
  end: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: mocks.pool,
}));

import { createPostgresTransactionalStore } from "../src/transactional-store";

beforeEach(() => {
  mocks.pool.mockReset();
  mocks.client.query.mockReset();
  mocks.client.release.mockReset();
  mocks.poolQuery.mockReset();
  mocks.end.mockReset();
  mocks.pool.mockImplementation(() => ({
    connect: async () => mocks.client,
    query: mocks.poolQuery,
    end: mocks.end,
  }));
  mocks.client.query.mockResolvedValue({ rowCount: 1, rows: [] });
});

const completion = {
  operationName: "invoice.issue.v1",
  idempotencyKey: "invoice-1",
  payloadFingerprint: "fingerprint",
  result: { invoiceId: "inv-1" },
  messageId: "mutation-1",
};

const event = {
  protocol: "signal.v1",
  kind: "event",
  name: "invoice.issued.v1",
  messageId: "event-1",
  timestamp: "2026-11-09T00:00:00.000Z",
  payload: { invoiceId: "inv-1" },
};

describe("PostgreSQL transactional storage", () => {
  it("commits the mutation result and emitted events in one transaction", async () => {
    const store = createPostgresTransactionalStore({
      connectionString: "postgres://example",
    });

    await store.completeWithEvents({
      ...completion,
      events: [event as never],
    });

    const statements = mocks.client.query.mock.calls.map(([sql]) =>
      String(sql).trim().split(/\s+/).slice(0, 3).join(" "),
    );
    expect(statements[0]).toBe("BEGIN");
    expect(statements[1]).toBe("UPDATE signal_idempotency_records SET");
    expect(statements[2]).toBe("INSERT INTO signal_outbox");
    expect(statements[3]).toBe("COMMIT");
    expect(statements).toHaveLength(4);
    expect(mocks.client.release).toHaveBeenCalledTimes(1);
    await store.close();
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });

  it("rolls back the result when an outbox insert fails", async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockRejectedValueOnce(new Error("outbox unavailable"))
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    const store = createPostgresTransactionalStore({
      connectionString: "postgres://example",
    });

    await expect(
      store.completeWithEvents({
        ...completion,
        events: [event as never],
      }),
    ).rejects.toThrow("outbox unavailable");

    expect(
      mocks.client.query.mock.calls.map(([sql]) => String(sql).trim()),
    ).toEqual([
      "BEGIN",
      expect.stringContaining("UPDATE signal_idempotency_records"),
      expect.stringContaining("INSERT INTO signal_outbox"),
      "ROLLBACK",
    ]);
    expect(mocks.client.release).toHaveBeenCalledTimes(1);
  });

  it("claims with SKIP LOCKED and guards acknowledgement by lease owner", async () => {
    mocks.client.query.mockResolvedValueOnce({ rowCount: null, rows: [] });
    mocks.client.query.mockResolvedValueOnce({
      rowCount: null,
      rows: [{
        id: "10",
        envelope: event,
        attempts: 1,
        created_at: new Date("2026-11-09T00:00:00.000Z"),
        lease_token: "lease-token-1",
      }],
    });
    mocks.client.query.mockResolvedValueOnce({ rowCount: null, rows: [] });
    mocks.poolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const store = createPostgresTransactionalStore({
      connectionString: "postgres://example",
    });
    const claimed = await store.claimBatch({
      workerId: "worker-1",
      limit: 20,
      leaseMs: 30_000,
    });
    const acknowledged = await store.acknowledge({
      id: "10",
      workerId: "worker-1",
      leaseToken: "lease-token-1",
    });

    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe("10");
    expect(claimed[0].leaseToken).toBe("lease-token-1");
    expect(mocks.client.query.mock.calls[1][0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(acknowledged).toBe(true);
    expect(mocks.poolQuery.mock.calls[0][0]).toContain("locked_by = $2");
    expect(mocks.poolQuery.mock.calls[0][0]).toContain("lease_token = $3");
  });

  it("reports bounded-cardinality outbox queue health", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        pending: "4",
        processing: "2",
        delivered: "19",
        dead_lettered: "1",
        oldest_pending_age_ms: "1250.5",
      }],
    });
    const store = createPostgresTransactionalStore({
      connectionString: "postgres://example",
    });

    await expect(store.getStats()).resolves.toEqual({
      pending: 4,
      processing: 2,
      delivered: 19,
      deadLettered: 1,
      oldestPendingAgeMs: 1250.5,
    });
    expect(mocks.poolQuery.mock.calls[0][0]).toContain("oldest_pending_age_ms");
    await store.close();
  });

});
