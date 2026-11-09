import type {
  IdempotencyRecord,
  IdempotencyReservation,
  OutboxPort,
  OutboxRecord,
  OutboxStats,
  StoragePort,
  TransactionalStoragePort,
} from "@signal/ports";
import type {
  SignalEnvelope,
  SignalErrorEnvelope,
  SignalResultMeta,
} from "@signal/protocol";
import { Pool, type PoolClient } from "pg";

export interface CreateSignalPostgresTransactionalStoreOptions {
  connectionString: string;
  maxConnections?: number;
  applicationName?: string;
}

type IdempotencyRow = {
  operation_name: string;
  idempotency_key: string;
  payload_fingerprint: string;
  status: "pending" | "completed" | "failed";
  result: unknown;
  result_meta: unknown;
  error: unknown;
  message_id: string | null;
  created_at: Date;
  updated_at: Date;
};

function toRecord(row: IdempotencyRow): IdempotencyRecord {
  return {
    operationName: row.operation_name,
    idempotencyKey: row.idempotency_key,
    payloadFingerprint: row.payload_fingerprint,
    status: row.status,
    result: row.result ?? undefined,
    resultMeta: row.result_meta
      ? (row.result_meta as SignalResultMeta)
      : undefined,
    error: row.error ? (row.error as SignalErrorEnvelope) : undefined,
    messageId: row.message_id ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original transaction error.
  }
}

/**
 * PostgreSQL implementation whose idempotency completion and outbox inserts
 * share one transaction. Apply migrations in src/drizzle/migrations before use.
 * Delivery is at-least-once; consumers must deduplicate on envelope.messageId.
 */
export function createPostgresTransactionalStore(
  options: CreateSignalPostgresTransactionalStoreOptions,
): StoragePort &
  TransactionalStoragePort &
  OutboxPort & { close(): Promise<void> } {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
    application_name: options.applicationName ?? "signal-runtime",
  });

  async function updateCompleted(
    client: PoolClient,
    input: {
      operationName: string;
      idempotencyKey: string;
      payloadFingerprint: string;
      result: unknown;
      resultMeta?: SignalResultMeta;
      messageId?: string;
    },
  ): Promise<void> {
    const updated = await client.query(
      `UPDATE signal_idempotency_records
       SET status = 'completed', result = $4::jsonb,
           result_meta = $5::jsonb, message_id = $6, updated_at = now()
       WHERE operation_name = $1 AND idempotency_key = $2
         AND payload_fingerprint = $3 AND status = 'pending'`,
      [
        input.operationName,
        input.idempotencyKey,
        input.payloadFingerprint,
        JSON.stringify(input.result),
        input.resultMeta === undefined ? null : JSON.stringify(input.resultMeta),
        input.messageId ?? null,
      ],
    );
    if (updated.rowCount !== 1) {
      throw new Error("Idempotency reservation is missing, stale, or no longer pending.");
    }
  }

  return {
    async getStats(): Promise<OutboxStats> {
      const result = await pool.query<{
        pending: string;
        processing: string;
        delivered: string;
        dead_lettered: string;
        oldest_pending_age_ms: string | null;
      }>(
        "SELECT " +
          "count(*) FILTER (WHERE status = 'pending')::text AS pending, " +
          "count(*) FILTER (WHERE status = 'processing')::text AS processing, " +
          "count(*) FILTER (WHERE status = 'delivered')::text AS delivered, " +
          "count(*) FILTER (WHERE status = 'dead-letter')::text AS dead_lettered, " +
          "(extract(epoch FROM now() - min(created_at) FILTER (WHERE status = 'pending')) * 1000)::text AS oldest_pending_age_ms " +
          "FROM signal_outbox",
      );
      const row = result.rows[0];
      return {
        pending: Number(row?.pending ?? 0),
        processing: Number(row?.processing ?? 0),
        delivered: Number(row?.delivered ?? 0),
        deadLettered: Number(row?.dead_lettered ?? 0),
        oldestPendingAgeMs: row?.oldest_pending_age_ms == null
          ? null
          : Math.max(0, Number(row.oldest_pending_age_ms)),
      };
    },
    async reserve(input): Promise<IdempotencyReservation> {
      const inserted = await pool.query<IdempotencyRow>(
        `INSERT INTO signal_idempotency_records
          (operation_name, idempotency_key, payload_fingerprint, status)
         VALUES ($1, $2, $3, 'pending')
         ON CONFLICT (operation_name, idempotency_key) DO NOTHING
         RETURNING *`,
        [input.operationName, input.idempotencyKey, input.payloadFingerprint],
      );
      if (inserted.rows[0]) {
        return { state: "reserved", record: toRecord(inserted.rows[0]) };
      }

      const existing = await pool.query<IdempotencyRow>(
        `SELECT * FROM signal_idempotency_records
         WHERE operation_name = $1 AND idempotency_key = $2`,
        [input.operationName, input.idempotencyKey],
      );
      const row = existing.rows[0];
      if (!row) return { state: "inflight" };
      const record = toRecord(row);
      if (record.payloadFingerprint !== input.payloadFingerprint) {
        return { state: "conflict", record };
      }
      if (record.status === "pending") return { state: "inflight", record };
      return { state: "replayed", record };
    },

    async complete(input): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await updateCompleted(client, input);
        await client.query("COMMIT");
      } catch (error) {
        await rollback(client);
        throw error;
      } finally {
        client.release();
      }
    },

    async completeWithEvents(input): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await updateCompleted(client, input);
        for (const event of input.events) {
          const inserted = await client.query(
            `INSERT INTO signal_outbox (message_id, envelope)
             VALUES ($1, $2::jsonb)
             ON CONFLICT (message_id) DO UPDATE
               SET message_id = EXCLUDED.message_id
               WHERE signal_outbox.envelope = EXCLUDED.envelope
             RETURNING message_id`,
            [event.messageId, JSON.stringify(event)],
          );
          if (inserted.rowCount !== 1) {
            throw new Error(
              `Outbox message ID "${event.messageId}" already exists with a different envelope.`,
            );
          }
        }
        await client.query("COMMIT");
      } catch (error) {
        await rollback(client);
        throw error;
      } finally {
        client.release();
      }
    },

    async fail(input): Promise<void> {
      const result = await pool.query(
        `UPDATE signal_idempotency_records
         SET status = 'failed', error = $4::jsonb, updated_at = now()
         WHERE operation_name = $1 AND idempotency_key = $2
           AND payload_fingerprint = $3 AND status = 'pending'`,
        [
          input.operationName,
          input.idempotencyKey,
          input.payloadFingerprint,
          JSON.stringify(input.error),
        ],
      );
      if (result.rowCount !== 1) {
        throw new Error("Cannot fail an idempotency reservation that is not pending.");
      }
    },

    async claimBatch(input): Promise<OutboxRecord[]> {
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1000) {
        throw new RangeError("Outbox limit must be between 1 and 1000.");
      }
      if (!Number.isFinite(input.leaseMs) || input.leaseMs < 1000) {
        throw new RangeError("Outbox lease must be at least 1000 milliseconds.");
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const claimed = await client.query<{
          id: string;
          envelope: SignalEnvelope;
          attempts: number;
          created_at: Date;
        }>(
          `WITH candidates AS (
             SELECT id FROM signal_outbox
             WHERE (status = 'pending' AND available_at <= now())
                OR (status = 'processing' AND locked_until <= now())
             ORDER BY created_at, id
             FOR UPDATE SKIP LOCKED
             LIMIT $1
           )
           UPDATE signal_outbox AS outbox
           SET status = 'processing', locked_by = $2,
               locked_until = now() + ($3 * interval '1 millisecond'),
               attempts = outbox.attempts + 1
           FROM candidates
           WHERE outbox.id = candidates.id
           RETURNING outbox.id, outbox.envelope, outbox.attempts, outbox.created_at`,
          [input.limit, input.workerId, input.leaseMs],
        );
        await client.query("COMMIT");
        return claimed.rows.map((row) => ({
          id: row.id,
          envelope: row.envelope,
          attempts: row.attempts,
          createdAt: new Date(row.created_at).toISOString(),
        }));
      } catch (error) {
        await rollback(client);
        throw error;
      } finally {
        client.release();
      }
    },

    async acknowledge(input): Promise<boolean> {
      const result = await pool.query(
        `UPDATE signal_outbox
         SET status = 'delivered', delivered_at = now(),
             locked_by = NULL, locked_until = NULL, last_error = NULL
         WHERE id = $1 AND status = 'processing' AND locked_by = $2`,
        [input.id, input.workerId],
      );
      return result.rowCount === 1;
    },

    async retry(input) {
      const result = await pool.query<{ status: "pending" | "dead-letter" }>(
        `UPDATE signal_outbox
         SET status = CASE WHEN attempts >= $5 THEN 'dead-letter' ELSE 'pending' END,
             available_at = $3::timestamptz, last_error = $4,
             locked_by = NULL, locked_until = NULL
         WHERE id = $1 AND status = 'processing' AND locked_by = $2
         RETURNING status`,
        [input.id, input.workerId, input.availableAt, input.error, input.maxAttempts],
      );
      const status = result.rows[0]?.status;
      if (!status) return "lease-lost";
      return status === "dead-letter" ? "dead-lettered" : "scheduled";
    },

    async close() {
      await pool.end();
    },
  };
}
