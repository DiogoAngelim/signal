import { Pool, type PoolClient } from "pg";

export interface ConsumerInboxInput {
  readonly tenantId: string;
  readonly consumerName: string;
  readonly messageId: string;
}

export type ConsumerInboxOutcome<T> =
  | { readonly status: "processed"; readonly result: T }
  | { readonly status: "duplicate" };

export interface CreatePostgresConsumerInboxOptions {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly applicationName?: string;
}

/**
 * Transactional inbox for at-least-once event consumers. The handler's
 * PostgreSQL side effects and inbox claim commit or roll back together.
 * External APIs still require their own idempotency/reconciliation protocol.
 * Apply migration 0008 before use.
 */
export function createPostgresConsumerInbox(
  options: CreatePostgresConsumerInboxOptions,
): {
  processOnce<T>(
    input: ConsumerInboxInput,
    handler: (transaction: PoolClient) => Promise<T>,
  ): Promise<ConsumerInboxOutcome<T>>;
  close(): Promise<void>;
} {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 5,
    application_name: options.applicationName ?? "signal-consumer-inbox",
  });

  return {
    async processOnce<T>(input: ConsumerInboxInput, handler: (transaction: PoolClient) => Promise<T>): Promise<ConsumerInboxOutcome<T>> {
      if (!input.tenantId.trim() || input.tenantId.length > 200) {
        throw new RangeError("tenantId must contain 1 to 200 non-whitespace characters.");
      }
      if (!input.consumerName.trim() || input.consumerName.length > 200) {
        throw new RangeError("consumerName must contain 1 to 200 non-whitespace characters.");
      }
      if (!input.messageId.trim() || input.messageId.length > 500) {
        throw new RangeError("messageId must contain 1 to 500 non-whitespace characters.");
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('signal.tenant_id', $1, true)", [input.tenantId]);
        const inserted = await client.query(
          `INSERT INTO signal_consumer_inbox (tenant_id, consumer_name, message_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id, consumer_name, message_id) DO NOTHING
           RETURNING message_id`,
          [input.tenantId, input.consumerName, input.messageId],
        );
        if (inserted.rowCount === 0) {
          await client.query("COMMIT");
          return { status: "duplicate" };
        }

        const result = await handler(client);
        await client.query("COMMIT");
        return { status: "processed", result };
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
        throw error;
      } finally {
        client.release();
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}
