import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createPostgresTransactionalStore } from "../src/transactional-store";

const connectionString = process.env.SIGNAL_TEST_DATABASE_URL;
const integration = describe.skipIf(!connectionString);

integration("PostgreSQL transactional outbox integration", () => {
  const admin = new Pool({ connectionString });
  const store = createPostgresTransactionalStore({ connectionString: connectionString! });

  beforeAll(async () => {
    const migrationDirectory = join(__dirname, "../src/drizzle/migrations");
    await admin.query(readFileSync(join(migrationDirectory, "0000_initial.sql"), "utf8"));
    await admin.query(readFileSync(join(migrationDirectory, "0001_transactional_outbox.sql"), "utf8"));
    await admin.query(readFileSync(join(migrationDirectory, "0002_outbox_lease_fencing.sql"), "utf8"));
    await admin.query(readFileSync(join(migrationDirectory, "0003_idempotency_reservation_leases.sql"), "utf8"));
  });

  afterAll(async () => {
    await store.close();
    await admin.end();
  });

  it("commits result and outbox together and supports replay", async () => {
    const operationName = "integration.atomic.v1";
    const idempotencyKey = `atomic-${Date.now()}`;
    const reservation = await store.reserve({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-atomic",
    });
    expect(reservation.state).toBe("reserved");

    await store.completeWithEvents({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-atomic",
      reservationToken: reservation.record!.reservationToken!,
      result: { value: 7 },
      messageId: `mutation-${idempotencyKey}`,
      events: [{
        protocol: "signal.v1",
        kind: "event",
        name: "integration.atomic.completed.v1",
        messageId: `event-${idempotencyKey}`,
        timestamp: new Date().toISOString(),
        payload: { value: 7 },
      }],
    });

    const replay = await store.reserve({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-atomic",
    });
    expect(replay.state).toBe("replayed");
    expect(replay.record?.result).toEqual({ value: 7 });

    const claimed = await store.claimBatch({
      workerId: "integration-worker",
      limit: 10,
      leaseMs: 30_000,
    });
    const event = claimed.find((item) => item.envelope.messageId === `event-${idempotencyKey}`);
    expect(event?.envelope.payload).toEqual({ value: 7 });
    expect(await store.acknowledge({
      id: event!.id,
      workerId: "integration-worker",
      leaseToken: event!.leaseToken,
    })).toBe(true);
  });

  it("reclaims expired idempotency reservations and fences stale owners", async () => {
    const operationName = "integration.reservation-lease.v1";
    const idempotencyKey = `reservation-${Date.now()}`;
    const first = await store.reserve({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-reservation",
      leaseMs: 1_000,
    });
    expect(first.state).toBe("reserved");
    const firstToken = first.record!.reservationToken!;

    await admin.query(
      "UPDATE signal_idempotency_records SET reservation_expires_at = now() - interval '1 second' WHERE operation_name = $1 AND idempotency_key = $2",
      [operationName, idempotencyKey],
    );

    const second = await store.reserve({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-reservation",
      leaseMs: 30_000,
    });
    expect(second.state).toBe("reserved");
    expect(second.record!.reservationToken).not.toBe(firstToken);

    await expect(store.renewReservation({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-reservation",
      reservationToken: firstToken,
      leaseMs: 30_000,
    })).resolves.toBe(false);

    await expect(store.complete({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-reservation",
      reservationToken: firstToken,
      result: { stale: true },
    })).rejects.toThrow(/reservation is missing|stale|no longer pending/i);

    await expect(store.fail({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-reservation",
      reservationToken: firstToken,
      error: { code: "INTERNAL_ERROR", message: "stale owner" },
    })).rejects.toThrow(/not pending/i);

    await expect(store.renewReservation({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-reservation",
      reservationToken: second.record!.reservationToken!,
      leaseMs: 30_000,
    })).resolves.toBe(true);

    await store.complete({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-reservation",
      reservationToken: second.record!.reservationToken!,
      result: { current: true },
    });
    const replay = await store.reserve({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-reservation",
    });
    expect(replay.state).toBe("replayed");
    expect(replay.record?.result).toEqual({ current: true });
  });

  it("rolls back idempotency completion when outbox insertion fails", async () => {
    const operationName = "integration.rollback.v1";
    const idempotencyKey = `rollback-${Date.now()}`;
    const reservation = await store.reserve({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-rollback",
    });

    await admin.query(`
      ALTER TABLE signal_outbox
      ADD CONSTRAINT signal_outbox_integration_reject
      CHECK (envelope->>'messageId' <> 'integration-force-rollback')
    `);

    try {
      await expect(store.completeWithEvents({
        operationName,
        idempotencyKey,
        payloadFingerprint: "fingerprint-rollback",
        reservationToken: reservation.record!.reservationToken!,
        result: { committed: false },
        events: [{
          protocol: "signal.v1",
          kind: "event",
          name: "integration.rollback.v1",
          messageId: "integration-force-rollback",
          timestamp: new Date().toISOString(),
          payload: {},
        }],
      })).rejects.toThrow();

      const replay = await store.reserve({
        operationName,
        idempotencyKey,
        payloadFingerprint: "fingerprint-rollback",
      });
      expect(replay.state).toBe("inflight");
      expect(replay.record?.status).toBe("pending");
    } finally {
      await admin.query("ALTER TABLE signal_outbox DROP CONSTRAINT signal_outbox_integration_reject");
    }
  });


  it("prevents concurrent workers from claiming the same outbox message", async () => {
    const operationName = "integration.concurrent-claim.v1";
    const idempotencyKey = `concurrent-${Date.now()}`;
    const reservation = await store.reserve({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-concurrent",
    });
    await store.completeWithEvents({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-concurrent",
      reservationToken: reservation.record!.reservationToken!,
      result: { ok: true },
      events: [0, 1].map((index) => ({
        protocol: "signal.v1",
        kind: "event" as const,
        name: "integration.concurrent-claim.v1",
        messageId: `concurrent-event-${idempotencyKey}-${index}`,
        timestamp: new Date().toISOString(),
        payload: { index },
      })),
    });

    const [workerA, workerB] = await Promise.all([
      store.claimBatch({ workerId: "concurrent-worker-a", limit: 1, leaseMs: 30_000 }),
      store.claimBatch({ workerId: "concurrent-worker-b", limit: 1, leaseMs: 30_000 }),
    ]);

    expect(workerA).toHaveLength(1);
    expect(workerB).toHaveLength(1);
    expect(workerA[0].id).not.toBe(workerB[0].id);
    expect(workerA[0].envelope.messageId).not.toBe(workerB[0].envelope.messageId);
  });

  it("renews a live outbox lease and rejects renewal after expiry", async () => {
    const operationName = "integration.outbox-renewal.v1";
    const idempotencyKey = `outbox-renewal-${Date.now()}`;
    const reservation = await store.reserve({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-outbox-renewal",
    });
    await store.completeWithEvents({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-outbox-renewal",
      reservationToken: reservation.record!.reservationToken!,
      result: { ok: true },
      events: [{
        protocol: "signal.v1",
        kind: "event",
        name: "integration.outbox-renewal.v1",
        messageId: `outbox-renewal-event-${idempotencyKey}`,
        timestamp: new Date().toISOString(),
        payload: {},
      }],
    });
    const batch = await store.claimBatch({ workerId: "renewal-worker", limit: 100, leaseMs: 1_000 });
    const claimed = batch.find((item) => item.envelope.messageId === `outbox-renewal-event-${idempotencyKey}`);
    expect(claimed).toBeDefined();
    await expect(store.renewLease({
      id: claimed!.id,
      workerId: "renewal-worker",
      leaseToken: claimed!.leaseToken,
      leaseMs: 30_000,
    })).resolves.toBe(true);
    const renewed = await admin.query(
      "SELECT locked_until > now() + interval '20 seconds' AS extended FROM signal_outbox WHERE id = $1",
      [claimed!.id],
    );
    expect(renewed.rows[0]?.extended).toBe(true);

    await admin.query(
      "UPDATE signal_outbox SET locked_until = now() - interval '1 second' WHERE id = $1",
      [claimed!.id],
    );
    await expect(store.renewLease({
      id: claimed!.id,
      workerId: "renewal-worker",
      leaseToken: claimed!.leaseToken,
      leaseMs: 30_000,
    })).resolves.toBe(false);
    const reclaimed = await store.claimBatch({ workerId: "replacement-worker", limit: 100, leaseMs: 30_000 });
    const replacement = reclaimed.find((item) => item.id === claimed!.id);
    expect(replacement).toBeDefined();
    expect(replacement!.leaseToken).not.toBe(claimed!.leaseToken);
  });

  it("rejects acknowledgement and retry after an outbox lease expires", async () => {
    const operationName = "integration.expired-lease-fencing.v1";
    const idempotencyKey = `expired-lease-${Date.now()}`;
    const reservation = await store.reserve({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-expired-lease",
    });
    await store.completeWithEvents({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-expired-lease",
      reservationToken: reservation.record!.reservationToken!,
      result: { ok: true },
      events: [{
        protocol: "signal.v1",
        kind: "event",
        name: "integration.expired-lease-fencing.v1",
        messageId: `expired-lease-event-${idempotencyKey}`,
        timestamp: new Date().toISOString(),
        payload: {},
      }],
    });

    const firstBatch = await store.claimBatch({
      workerId: "expired-lease-worker-a",
      limit: 100,
      leaseMs: 30_000,
    });
    const first = firstBatch.find((item) => item.envelope.messageId === `expired-lease-event-${idempotencyKey}`);
    expect(first).toBeDefined();

    await admin.query(
      "UPDATE signal_outbox SET locked_until = now() - interval '1 second' WHERE id = $1",
      [first!.id],
    );

    expect(await store.acknowledge({
      id: first!.id,
      workerId: "expired-lease-worker-a",
      leaseToken: first!.leaseToken,
    })).toBe(false);
    expect(await store.retry({
      id: first!.id,
      workerId: "expired-lease-worker-a",
      leaseToken: first!.leaseToken,
      availableAt: new Date().toISOString(),
      error: "expired worker must not reschedule",
      maxAttempts: 5,
    })).toBe("lease-lost");

    const secondBatch = await store.claimBatch({
      workerId: "expired-lease-worker-b",
      limit: 100,
      leaseMs: 30_000,
    });
    const second = secondBatch.find((item) => item.envelope.messageId === `expired-lease-event-${idempotencyKey}`);
    expect(second).toBeDefined();
    expect(second!.leaseToken).not.toBe(first!.leaseToken);
    expect(await store.acknowledge({
      id: second!.id,
      workerId: "expired-lease-worker-b",
      leaseToken: second!.leaseToken,
    })).toBe(true);
  });

  it("recovers expired leases and dead-letters after the attempt limit", async () => {
    const operationName = "integration.lease.v1";
    const idempotencyKey = `lease-${Date.now()}`;
    const reservation = await store.reserve({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-lease",
    });
    await store.completeWithEvents({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-lease",
      reservationToken: reservation.record!.reservationToken!,
      result: { ok: true },
      events: [{
        protocol: "signal.v1",
        kind: "event",
        name: "integration.lease.v1",
        messageId: `lease-event-${idempotencyKey}`,
        timestamp: new Date().toISOString(),
        payload: {},
      }],
    });

    const firstBatch = await store.claimBatch({
      workerId: "reused-worker",
      limit: 100,
      leaseMs: 1000,
    });
    const first = firstBatch.find((item) => item.envelope.messageId === `lease-event-${idempotencyKey}`);
    expect(first).toBeDefined();
    await admin.query(
      "UPDATE signal_outbox SET locked_until = now() - interval '1 second' WHERE message_id = $1",
      [`lease-event-${idempotencyKey}`],
    );

    const recoveredBatch = await store.claimBatch({
      workerId: "reused-worker",
      limit: 100,
      leaseMs: 30_000,
    });
    const recovered = recoveredBatch.find((item) => item.envelope.messageId === `lease-event-${idempotencyKey}`);
    expect(recovered?.attempts).toBe(2);
    expect(recovered?.leaseToken).not.toBe(first!.leaseToken);
    expect(await store.acknowledge({
      id: recovered!.id,
      workerId: "reused-worker",
      leaseToken: first!.leaseToken,
    })).toBe(false);
    expect(await store.retry({
      id: recovered!.id,
      workerId: "reused-worker",
      leaseToken: first!.leaseToken,
      availableAt: new Date().toISOString(),
      error: "stale worker must not reschedule",
      maxAttempts: 2,
    })).toBe("lease-lost");

    expect(await store.retry({
      id: recovered!.id,
      workerId: "reused-worker",
      leaseToken: recovered!.leaseToken,
      availableAt: new Date().toISOString(),
      error: "permanent failure",
      maxAttempts: 2,
    })).toBe("dead-lettered");

    const deadLetter = await admin.query(
      "SELECT status FROM signal_outbox WHERE message_id = $1",
      [`lease-event-${idempotencyKey}`],
    );
    expect(deadLetter.rows[0]?.status).toBe("dead-letter");
  });
});
