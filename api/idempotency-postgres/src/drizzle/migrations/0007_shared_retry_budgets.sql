CREATE TABLE IF NOT EXISTS signal_retry_budgets (
  budget_key text PRIMARY KEY CHECK (length(trim(budget_key)) BETWEEN 1 AND 200),
  capacity integer NOT NULL CHECK (capacity >= 1),
  refill_rate_per_second numeric NOT NULL CHECK (refill_rate_per_second >= 0),
  available numeric NOT NULL CHECK (available >= 0 AND available <= capacity),
  last_refill_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS signal_retry_budgets_updated_at
  ON signal_retry_budgets (updated_at DESC);

COMMENT ON TABLE signal_retry_budgets IS
  'Shared PostgreSQL token buckets for bounding retry amplification across Signal processes.';
