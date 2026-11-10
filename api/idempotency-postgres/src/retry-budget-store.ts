import type { RetryBudgetPort, RetryBudgetSnapshot } from "@signal/ports";
import { Pool } from "pg";

export interface CreatePostgresRetryBudgetOptions {
  readonly connectionString: string;
  /** Stable shared identifier for all processes that must consume one budget. */
  readonly budgetKey: string;
  readonly capacity: number;
  readonly refillRatePerSecond?: number;
  readonly maxConnections?: number;
  readonly applicationName?: string;
}

function validateOptions(options: CreatePostgresRetryBudgetOptions): void {
  if (!options.budgetKey.trim() || options.budgetKey.length > 200) {
    throw new RangeError("budgetKey must contain 1 to 200 non-whitespace characters.");
  }
  if (!Number.isSafeInteger(options.capacity) || options.capacity < 1) {
    throw new RangeError("capacity must be a positive safe integer.");
  }
  const refillRate = options.refillRatePerSecond ?? 0;
  if (!Number.isFinite(refillRate) || refillRate < 0) {
    throw new RangeError("refillRatePerSecond must be finite and non-negative.");
  }
}

export interface PostgresRetryBudget extends RetryBudgetPort {
  close(): Promise<void>;
}

/**
 * PostgreSQL-coordinated token bucket. Multiple processes/adapters using the
 * same database and budgetKey consume from one atomic shared allowance.
 * Apply migration 0007 before use; keep the table in a low-latency,
 * highly-available coordination database for latency-sensitive retry paths.
 */
export function createPostgresRetryBudget(
  options: CreatePostgresRetryBudgetOptions,
): PostgresRetryBudget {
  validateOptions(options);
  const refillRate = options.refillRatePerSecond ?? 0;
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 3,
    application_name: options.applicationName ?? "signal-retry-budget",
  });

  async function refill(): Promise<number> {
    const result = await pool.query<{ available: string }>(
      `INSERT INTO signal_retry_budgets
        (budget_key, capacity, refill_rate_per_second, available, last_refill_at)
       VALUES ($1, $2::integer, $3::numeric, $4::numeric, clock_timestamp())
       ON CONFLICT (budget_key) DO UPDATE SET
         available = LEAST(
           signal_retry_budgets.capacity::numeric,
           signal_retry_budgets.available + GREATEST(
             0::numeric,
             EXTRACT(EPOCH FROM (clock_timestamp() - signal_retry_budgets.last_refill_at))
               * signal_retry_budgets.refill_rate_per_second
           )
         ),
         last_refill_at = GREATEST(signal_retry_budgets.last_refill_at, clock_timestamp()),
         updated_at = clock_timestamp()
       WHERE signal_retry_budgets.capacity = EXCLUDED.capacity
         AND signal_retry_budgets.refill_rate_per_second = EXCLUDED.refill_rate_per_second
       RETURNING available::text`,
      [options.budgetKey, options.capacity, refillRate, options.capacity],
    );
    if (!result.rows[0]) {
      throw new Error("PostgreSQL retry budget configuration conflicts with the persisted budget.");
    }
    return Number(result.rows[0].available);
  }

  return {
    async tryConsume(): Promise<boolean> {
      await refill();
      const result = await pool.query<{ available: string }>(
        `UPDATE signal_retry_budgets
         SET available = available - 1, updated_at = clock_timestamp()
         WHERE budget_key = $1 AND available >= 1
         RETURNING available::text`,
        [options.budgetKey],
      );
      return result.rowCount === 1;
    },

    async snapshot(): Promise<RetryBudgetSnapshot> {
      const available = await refill();
      return {
        capacity: options.capacity,
        available,
        refillRatePerSecond: refillRate,
      };
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}
