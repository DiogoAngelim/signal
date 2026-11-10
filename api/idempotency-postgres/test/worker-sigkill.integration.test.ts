import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createPostgresTransactionalStore } from "../src/transactional-store";

const connectionString = process.env.SIGNAL_TEST_DATABASE_URL;
const brokerUrl = process.env.SIGNAL_RABBITMQ_MANAGEMENT_URL;
const brokerUser = process.env.SIGNAL_RABBITMQ_USER ?? "signal";
const brokerPassword = process.env.SIGNAL_RABBITMQ_PASSWORD ?? "signal-simulation-only";
const queueName = "signal-production-simulation";
const integration = describe.skipIf(!connectionString || !brokerUrl);

async function publish(envelope: unknown, messageId: string): Promise<void> {
  const response = await fetch(new URL("api/exchanges/%2F/amq.default/publish", brokerUrl), {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${brokerUser}:${brokerPassword}`).toString("base64")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      properties: { delivery_mode: 2, message_id: messageId, content_type: "application/json" },
      routing_key: queueName,
      payload: JSON.stringify(envelope),
      payload_encoding: "string",
    }),
  });
  const body = await response.json() as { routed?: boolean };
  if (!response.ok || !body.routed) throw new Error("RabbitMQ did not route the worker's publish.");
}

integration("real worker process SIGKILL boundary", () => {
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
  });

  afterAll(async () => {
    await store.close();
    await admin.end();
  });

  it("kills a real worker after broker publish and before acknowledgement", async () => {
    const suffix = randomUUID();
    const operationName = "simulation.worker-sigkill.v1";
    const idempotencyKey = `worker-sigkill-${suffix}`;
    const messageId = `worker-sigkill-event-${suffix}`;
    const workerId = `worker-killed-${suffix}`;
    const reservation = await store.reserve({
      operationName,
      idempotencyKey,
      payloadFingerprint: suffix,
    });
    const envelope = {
      protocol: "signal.v1",
      kind: "event",
      name: "simulation.worker-sigkill.v1",
      messageId,
      timestamp: new Date().toISOString(),
      payload: { sideEffect: "apply-once", simulationId: suffix },
    };
    await store.completeWithEvents({
      operationName,
      idempotencyKey,
      payloadFingerprint: suffix,
      reservationToken: reservation.record!.reservationToken!,
      result: { accepted: true },
      events: [envelope],
    });

    const childScript = `
      const { Pool } = require("pg");
      const { randomUUID } = require("node:crypto");
      (async () => {
        const pool = new Pool({ connectionString: process.env.SIGNAL_TEST_DATABASE_URL });
        const workerId = process.env.SIGNAL_CHILD_WORKER_ID;
        const messageId = process.env.SIGNAL_CHILD_MESSAGE_ID;
        const leaseToken = randomUUID();
        const claimed = await pool.query(
          \`UPDATE signal_outbox
              SET status = 'processing', attempts = attempts + 1,
                  locked_by = $2, locked_until = now() + interval '30 seconds',
                  lease_token = $3::uuid
            WHERE message_id = $1 AND status = 'pending'
            RETURNING id, envelope\`,
          [messageId, workerId, leaseToken],
        );
        if (claimed.rowCount !== 1) throw new Error("Child worker could not claim its target event.");
        const response = await fetch(new URL("api/exchanges/%2F/amq.default/publish", process.env.SIGNAL_RABBITMQ_MANAGEMENT_URL), {
          method: "POST",
          headers: {
            authorization: "Basic " + Buffer.from(process.env.SIGNAL_RABBITMQ_USER + ":" + process.env.SIGNAL_RABBITMQ_PASSWORD).toString("base64"),
            "content-type": "application/json"
          },
          body: JSON.stringify({
            properties: { delivery_mode: 2, message_id: messageId, content_type: "application/json" },
            routing_key: process.env.SIGNAL_SIMULATION_QUEUE,
            payload: JSON.stringify(claimed.rows[0].envelope),
            payload_encoding: "string"
          })
        });
        const result = await response.json();
        if (!response.ok || !result.routed) throw new Error("Child worker publish was not routed.");
        process.stdout.write("PUBLISHED:" + leaseToken + "\\n");
        await new Promise(() => {});
      })().catch((error) => { console.error(error); process.exit(1); });
    `;

    const child = spawn(process.execPath, ["-e", childScript], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SIGNAL_CHILD_WORKER_ID: workerId,
        SIGNAL_CHILD_MESSAGE_ID: messageId,
        SIGNAL_SIMULATION_QUEUE: queueName,
        SIGNAL_RABBITMQ_USER: brokerUser,
        SIGNAL_RABBITMQ_PASSWORD: brokerPassword,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    const output = await new Promise<string>((resolve, reject) => {
      let stdout = "";
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`Worker did not publish before timeout. ${stderr}`));
      }, 10_000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        const line = stdout.split("\\n").find((value) => value.startsWith("PUBLISHED:"));
        if (line) {
          clearTimeout(timeout);
          resolve(line);
        }
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code, signal) => {
        clearTimeout(timeout);
        reject(new Error(`Worker exited before publish confirmation (code=${code}, signal=${signal}). ${stderr}`));
      });
    });

    const childLeaseToken = output.slice("PUBLISHED:".length);
    const exitPromise = once(child, "exit");
    expect(child.kill("SIGKILL")).toBe(true);
    const [exitCode, exitSignal] = await exitPromise as [number | null, NodeJS.Signals | null];
    expect(exitCode).toBeNull();
    expect(exitSignal).toBe("SIGKILL");

    const afterCrash = await admin.query(
      "SELECT id, status, locked_by, lease_token FROM signal_outbox WHERE message_id = $1",
      [messageId],
    );
    expect(afterCrash.rows[0]).toMatchObject({
      status: "processing",
      locked_by: workerId,
      lease_token: childLeaseToken,
    });

    await admin.query(
      "UPDATE signal_outbox SET locked_until = now() - interval '1 second' WHERE message_id = $1",
      [messageId],
    );
    const recoveryWorkerId = `worker-recovered-${suffix}`;
    const recovered = await store.claimBatch({
      workerId: recoveryWorkerId,
      limit: 100,
      leaseMs: 30_000,
    });
    const recoveryEvent = recovered.find((item) => item.envelope.messageId === messageId);
    expect(recoveryEvent).toBeDefined();
    await publish(recoveryEvent!.envelope, messageId);

    const deliveries = await fetch(new URL(`api/queues/%2F/${queueName}/get`, brokerUrl), {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${brokerUser}:${brokerPassword}`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ count: 20, ackmode: "ack_requeue_false", encoding: "auto", truncate: 50000 }),
    });
    const messages = await deliveries.json() as Array<{ payload: string }>;
    const duplicates = messages.filter((item) => {
      try { return JSON.parse(item.payload).messageId === messageId; } catch { return false; }
    });
    expect(duplicates.length).toBeGreaterThanOrEqual(2);

    for (const duplicate of duplicates) {
      const parsed = JSON.parse(duplicate.payload) as { messageId: string; payload: unknown };
      const client = await admin.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          "INSERT INTO signal_simulation_consumer_inbox (message_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING message_id",
          [parsed.messageId],
        );
        if (inserted.rowCount === 1) {
          await client.query(
            "INSERT INTO signal_simulation_side_effects (message_id, effect) VALUES ($1, $2::jsonb)",
            [parsed.messageId, JSON.stringify(parsed.payload)],
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

    expect((await admin.query(
      "SELECT count(*)::int AS count FROM signal_simulation_side_effects WHERE message_id = $1",
      [messageId],
    )).rows[0].count).toBe(1);
    expect(await store.acknowledge({
      id: String(afterCrash.rows[0].id),
      workerId,
      leaseToken: childLeaseToken,
    })).toBe(false);
    expect(await store.acknowledge({
      id: recoveryEvent!.id,
      workerId: recoveryWorkerId,
      leaseToken: recoveryEvent!.leaseToken,
    })).toBe(true);
  });
});
