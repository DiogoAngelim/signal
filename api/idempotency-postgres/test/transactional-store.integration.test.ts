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
    await admin.query("DELETE FROM signal_outbox");
    await admin.query("DELETE FROM signal_idempotency_records");
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
    })).toBe(true);
  });

  it("rolls back idempotency completion when outbox insertion fails", async () => {
    const operationName = "integration.rollback.v1";
    const idempotencyKey = `rollback-${Date.now()}`;
    await store.reserve({
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

  it("recovers expired leases and dead-letters after the attempt limit", async () => {
    const operationName = "integration.lease.v1";
    const idempotencyKey = `lease-${Date.now()}`;
    await store.reserve({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-lease",
    });
    await store.completeWithEvents({
      operationName,
      idempotencyKey,
      payloadFingerprint: "fingerprint-lease",
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

    const first = await store.claimBatch({
      workerId: "crashed-worker",
      limit: 1,
      leaseMs: 1000,
    });
    expect(first).toHaveLength(1);
    await admin.query(
      "UPDATE signal_outbox SET locked_until = now() - interval '1 second' WHERE message_id = $1",
      [`lease-event-${idempotencyKey}`],
    );

    const recovered = await store.claimBatch({
      workerId: "recovery-worker",
      limit: 1,
      leaseMs: 30_000,
    });
    expect(recovered[0]?.attempts).toBe(2);
    expect(await store.acknowledge({
      id: recovered[0].id,
      workerId: "crashed-worker",
    })).toBe(false);

    expect(await store.retry({
      id: recovered[0].id,
      workerId: "recovery-worker",
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
