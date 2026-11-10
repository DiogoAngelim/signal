import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type {
  DistributedCircuitBreakerConfig,
  DistributedCircuitBreakerPermit,
  DistributedCircuitBreakerPort,
  DistributedCircuitBreakerSnapshot,
} from "@signal/ports";

export interface CreatePostgresCircuitBreakerPortOptions {
  connectionString: string;
  maxConnections?: number;
}

function validateKey(key: string): void {
  if (!key.trim() || key.length > 512) {
    throw new RangeError("Circuit breaker key must contain 1-512 characters.");
  }
}

function validateConfig(config: DistributedCircuitBreakerConfig): void {
  if (!Number.isSafeInteger(config.threshold) || config.threshold < 1) {
    throw new RangeError("Circuit breaker threshold must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(config.resetTimeoutMs) || config.resetTimeoutMs < 0) {
    throw new RangeError("Circuit breaker reset timeout must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(config.probeLeaseMs) || config.probeLeaseMs < 1000 || config.probeLeaseMs > 86_400_000) {
    throw new RangeError("Circuit breaker probe lease must be between 1000 and 86400000 milliseconds.");
  }
}

function toSnapshot(row: Record<string, unknown>): DistributedCircuitBreakerSnapshot {
  return {
    key: String(row.breaker_key),
    failureCount: Number(row.failure_count),
    lastFailureAt: row.last_failure_at ? new Date(String(row.last_failure_at)).toISOString() : null,
    state: row.state as DistributedCircuitBreakerSnapshot["state"],
    threshold: Number(row.threshold),
    resetTimeoutMs: Number(row.reset_timeout_ms),
  };
}

/**
 * PostgreSQL-backed coordination for a globally single half-open probe.
 *
 * Each state transition is a single conditional SQL statement. Probe results
 * are accepted only while their UUID lease is current and unexpired, fencing
 * late workers after lease takeover. Closed-state requests are not serialized.
 */
export function createPostgresCircuitBreakerPort(
  options: CreatePostgresCircuitBreakerPortOptions,
): DistributedCircuitBreakerPort & { close(): Promise<void> } {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
  });

  async function ensureRow(
    key: string,
    config: DistributedCircuitBreakerConfig,
  ): Promise<Record<string, unknown>> {
    await pool.query(
      `INSERT INTO signal_circuit_breakers
        (breaker_key, threshold, reset_timeout_ms)
       VALUES ($1, $2, $3)
       ON CONFLICT (breaker_key) DO NOTHING`,
      [key, config.threshold, config.resetTimeoutMs],
    );
    const result = await pool.query(
      `SELECT breaker_key, failure_count, last_failure_at, state,
              threshold, reset_timeout_ms
         FROM signal_circuit_breakers
        WHERE breaker_key = $1`,
      [key],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("Circuit breaker state could not be initialized.");
    if (
      Number(row.threshold) !== config.threshold ||
      Number(row.reset_timeout_ms) !== config.resetTimeoutMs
    ) {
      throw new Error("Circuit breaker configuration differs across processes.");
    }
    return row;
  }

  return {
    async snapshot(key) {
      validateKey(key);
      const result = await pool.query(
        `SELECT breaker_key, failure_count, last_failure_at, state,
                threshold, reset_timeout_ms
           FROM signal_circuit_breakers
          WHERE breaker_key = $1`,
        [key],
      );
      return result.rows[0]
        ? toSnapshot(result.rows[0] as Record<string, unknown>)
        : null;
    },

    async tryAcquire(
      key,
      config,
      now = new Date(),
    ): Promise<DistributedCircuitBreakerPermit> {
      validateKey(key);
      validateConfig(config);
      if (!Number.isFinite(now.getTime())) throw new RangeError("now must be a valid date.");
      const row = await ensureRow(key, config);
      if (row.state === "closed") return { allowed: true };

      const probeToken = randomUUID();
      const claimed = await pool.query(
        `UPDATE signal_circuit_breakers
            SET state = 'half-open',
                probe_token = $2::uuid,
                probe_expires_at = $3::timestamptz + ($4::bigint * interval '1 millisecond'),
                updated_at = $3::timestamptz
          WHERE breaker_key = $1
            AND (
              (state = 'open'
                AND last_failure_at IS NOT NULL
                AND last_failure_at + (reset_timeout_ms * interval '1 millisecond') <= $3::timestamptz)
              OR
              (state = 'half-open' AND probe_expires_at <= $3::timestamptz)
            )
          RETURNING breaker_key`,
        [key, probeToken, now, config.probeLeaseMs],
      );
      return claimed.rowCount === 1
        ? { allowed: true, probeToken }
        : { allowed: false };
    },

    async recordSuccess(key, probeToken) {
      validateKey(key);
      const result = probeToken
        ? await pool.query(
            `UPDATE signal_circuit_breakers
                SET state = 'closed', failure_count = 0,
                    last_failure_at = NULL, probe_token = NULL,
                    probe_expires_at = NULL, updated_at = now()
              WHERE breaker_key = $1 AND state = 'half-open'
                AND probe_token = $2::uuid AND probe_expires_at > now()
              RETURNING breaker_key`,
            [key, probeToken],
          )
        : await pool.query(
            `UPDATE signal_circuit_breakers
                SET failure_count = 0, last_failure_at = NULL, updated_at = now()
              WHERE breaker_key = $1 AND state = 'closed'
              RETURNING breaker_key`,
            [key],
          );
      return result.rowCount === 1;
    },

    async recordFailure(key, config, probeToken, now = new Date()) {
      validateKey(key);
      validateConfig(config);
      if (!Number.isFinite(now.getTime())) throw new RangeError("now must be a valid date.");
      await ensureRow(key, config);

      const result = probeToken
        ? await pool.query(
            `UPDATE signal_circuit_breakers
                SET failure_count = failure_count + 1,
                    last_failure_at = $3::timestamptz,
                    state = 'open', probe_token = NULL,
                    probe_expires_at = NULL, updated_at = $3::timestamptz
              WHERE breaker_key = $1 AND state = 'half-open'
                AND probe_token = $2::uuid AND probe_expires_at > $3::timestamptz
              RETURNING breaker_key`,
            [key, probeToken, now],
          )
        : await pool.query(
            `UPDATE signal_circuit_breakers
                SET failure_count = failure_count + 1,
                    last_failure_at = $2::timestamptz,
                    state = CASE WHEN failure_count + 1 >= threshold THEN 'open' ELSE 'closed' END,
                    updated_at = $2::timestamptz
              WHERE breaker_key = $1 AND state = 'closed'
              RETURNING breaker_key`,
            [key, now],
          );
      return result.rowCount === 1;
    },

    async close() {
      await pool.end();
    },
  };
}
