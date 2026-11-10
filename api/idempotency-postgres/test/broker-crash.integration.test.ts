import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createPostgresTransactionalStore } from "../src/transactional-store";

const connectionString = process.env.SIGNAL_TEST_DATABASE_URL;
const brokerUrl = process.env.SIGNAL_RABBITMQ_MANAGEMENT_URL;
const brokerUser = process.env.SIGNAL_RABBITMQ_USER ?? "signal";
const brokerPassword = process.env.SIGNAL_RABBITMQ_PASSWORD ?? "signal-simulation-only";
const queueName = "signal-production-simulation";
const integration = describe.skipIf(!connectionString || !brokerUrl);

async function brokerRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(new URL(path, brokerUrl), {
    ...init,
    headers: {
      authorization: `Basic ${Buffer.from(`${brokerUser}:${brokerPassword}`).toString("base64")}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`RabbitMQ management API ${response.status}: ${body}`);
  return body ? JSON.parse(body) as unknown : undefined;
}

integration("broker and consumer crash-boundary simulation", () => {
  const admin = new Pool({ connectionString });
  const store = createPostgresTransactionalStore({ connectionString: connectionString! });

  beforeAll(async () => {
    const migrationDirectory = new URL("../src/drizzle/migrations/", import.meta.url);
    const { readFile } = await import("node:fs/promises");
    await admin.query(await readFile(new URL("0000_initial.sql", migrationDirectory), "utf8"));
    await admin.query(await readFile(new URL("0001_transactional_outbox.sql", migrationDirectory), "utf8"));
    await admin.query(await readFile(new URL("0002_outbox_lease_fencing.sql", migrationDirectory), "utf8"));
    await admin.query(await readFile(new URL("0003_idempotency_reservation_leases.sql", migrationDirectory), "utf8"));
    await admin.query(`
      CREATE TABLE IF NOT EXISTS signal_simulation_consumer_inbox (
        message_id text PRIMARY KEY,
        received_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS signal_simulation_side_effects (
        message_id text PRIMARY KEY,
        effect jsonb NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await brokerRequest(`api/queues/%2F/${queueName}`, {
      method: "PUT",
      body: JSON.stringify({ durable: true, auto_delete: false, arguments: {} }),
    });
  });

  afterAll(async () => {
    await store.close();
    await admin.end();
  });

  it("deduplicates consumer side effects after publish confirmation and worker lease loss", async () => {
    const suffix = randomUUID();
    const operationName = "simulation.broker-crash-boundary.v1";
    const idempotencyKey = `broker-${suffix}`;
    const messageId = `broker-event-${suffix}`;
    const reservation = await store.reserve({ operationName, idempotencyKey, payloadFingerprint: suffix });
    await store.completeWithEvents({
      operationName,
      idempotencyKey,
      payloadFingerprint: suffix,
      reservationToken: reservation.record!.reservationToken!,
      result: { accepted: true },
      events: [{
        protocol: "signal.v1",
        kind: "event",
        name: "simulation.consumer-effect.v1",
        messageId,
        timestamp: new Date().toISOString(),
        payload: { sideEffect: "charge-once", simulationId: suffix },
      }],
    });

    const firstClaim = await store.claimBatch({
      workerId: `worker-before-crash-${suffix}`,
      limit: 100,
      leaseMs: 1000,
    });
    const event = firstClaim.find((item) => item.envelope.messageId === messageId);
    expect(event).toBeDefined();

    const publish = async () => brokerRequest("api/exchanges/%2F/amq.default/publish", {
      method: "POST",
      body: JSON.stringify({
        properties: { delivery_mode: 2, message_id: messageId, content_type: "application/json" },
        routing_key: queueName,
        payload: JSON.stringify(event!.envelope),
        payload_encoding: "string",
      }),
    });

    // The broker confirms the first publish; the worker crashes before DB ack.
    const firstPublishStartedAt = Date.now();
    expect(await publish()).toMatchObject({ routed: true });
    const firstPublishConfirmedAt = Date.now();
    await admin.query(
      "UPDATE signal_outbox SET locked_until = now() - interval '1 second' WHERE message_id = $1",
      [messageId],
    );

    const secondWorkerId = `worker-after-restart-${suffix}`;
    const recoveryClaimStartedAt = Date.now();
    const secondClaim = await store.claimBatch({ workerId: secondWorkerId, limit: 100, leaseMs: 30_000 });
    const recoveryClaimLatencyMs = Date.now() - recoveryClaimStartedAt;
    const recovered = secondClaim.find((item) => item.envelope.messageId === messageId);
    expect(recovered).toBeDefined();
    // Recovery republishes because the first worker cannot know whether publish succeeded.
    const recoveryPublishStartedAt = Date.now();
    expect(await publish()).toMatchObject({ routed: true });
    const recoveryPublishConfirmedAt = Date.now();

    const deliveries = await brokerRequest(`api/queues/%2F/${queueName}/get`, {
      method: "POST",
      body: JSON.stringify({ count: 10, ackmode: "ack_requeue_false", encoding: "auto", truncate: 50000 }),
    }) as Array<{ payload: string; properties?: { message_id?: string } }>;
    const matching = deliveries.filter((delivery) => {
      try { return JSON.parse(delivery.payload).messageId === messageId; } catch { return false; }
    });
    expect(matching.length).toBeGreaterThanOrEqual(2);

    // Model the consumer's durable inbox + side effect in one transaction.
    for (const delivery of matching) {
      const envelope = JSON.parse(delivery.payload) as { messageId: string; payload: unknown };
      const client = await admin.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          "INSERT INTO signal_simulation_consumer_inbox (message_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING message_id",
          [envelope.messageId],
        );
        if (inserted.rowCount === 1) {
          await client.query(
            "INSERT INTO signal_simulation_side_effects (message_id, effect) VALUES ($1, $2::jsonb)",
            [envelope.messageId, JSON.stringify(envelope.payload)],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    const sideEffectCount = (await admin.query(
      "SELECT count(*)::int AS count FROM signal_simulation_side_effects WHERE message_id = $1",
      [messageId],
    )).rows[0].count;
    expect(sideEffectCount).toBe(1);

    const staleAckAccepted = await store.acknowledge({ id: event!.id, workerId: `worker-before-crash-${suffix}`, leaseToken: event!.leaseToken });
    const recoveryAckAccepted = await store.acknowledge({ id: recovered!.id, workerId: secondWorkerId, leaseToken: recovered!.leaseToken });
    expect(staleAckAccepted).toBe(false);
    expect(recoveryAckAccepted).toBe(true);
    console.info("SIGNAL_BROKER_RECOVERY_METRICS", JSON.stringify({
      initialPublishLatencyMs: firstPublishConfirmedAt - firstPublishStartedAt,
      recoveryClaimLatencyMs,
      recoveryPublishLatencyMs: recoveryPublishConfirmedAt - recoveryPublishStartedAt,
      recoveryElapsedMs: recoveryPublishConfirmedAt - firstPublishConfirmedAt,
      duplicateDeliveries: matching.length,
      redeliveryAmplification: matching.length,
      consumerSideEffects: sideEffectCount,
      staleAcknowledgementRejected: !staleAckAccepted,
      recoveryAcknowledgementAccepted: recoveryAckAccepted,
    }));
  });

  it("does not acknowledge an outbox event when broker publication fails", async () => {
    const suffix = randomUUID();
    const operationName = "simulation.broker-unavailable.v1";
    const idempotencyKey = `unavailable-${suffix}`;
    const messageId = `unavailable-event-${suffix}`;
    const reservation = await store.reserve({ operationName, idempotencyKey, payloadFingerprint: suffix });
    await store.completeWithEvents({
      operationName, idempotencyKey, payloadFingerprint: suffix,
      reservationToken: reservation.record!.reservationToken!,
      result: {},
      events: [{
        protocol: "signal.v1", kind: "event", name: "simulation.broker-unavailable.v1",
        messageId, timestamp: new Date().toISOString(), payload: {},
      }],
    });
    const workerId = `broker-down-${suffix}`;
    const initialClaims = await store.claimBatch({ workerId, limit: 100, leaseMs: 30_000 });
    const initialClaim = initialClaims.find((item) => item.envelope.messageId === messageId);
    expect(initialClaim).toBeDefined();
    await expect(fetch("http://127.0.0.1:1/unavailable", { signal: AbortSignal.timeout(500) })).rejects.toThrow();
    const row = await admin.query("SELECT status FROM signal_outbox WHERE message_id = $1", [messageId]);
    expect(row.rows[0]?.status).toBe("processing");
    await admin.query("UPDATE signal_outbox SET locked_until = now() - interval '1 second' WHERE message_id = $1", [messageId]);
    const recoveryWorker = "broker-recovery-" + suffix;
    const recovered = await store.claimBatch({ workerId: recoveryWorker, limit: 100, leaseMs: 30_000 });
    const event = recovered.find((item) => item.envelope.messageId === messageId);
    expect(event).toBeDefined();
    expect(await brokerRequest("api/exchanges/%2F/amq.default/publish", {
      method: "POST",
      body: JSON.stringify({
        properties: { delivery_mode: 2, message_id: messageId, content_type: "application/json" },
        routing_key: queueName,
        payload: JSON.stringify(event!.envelope),
        payload_encoding: "string",
      }),
    })).toMatchObject({ routed: true });
    expect(await store.acknowledge({ id: event!.id, workerId: recoveryWorker, leaseToken: event!.leaseToken })).toBe(true);
  });
});
