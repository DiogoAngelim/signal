-- Durable, cross-process circuit-breaker state and generation-fenced probe leases.
CREATE TABLE IF NOT EXISTS signal_circuit_breakers (
  breaker_key text PRIMARY KEY,
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_failure_at timestamptz,
  state text NOT NULL DEFAULT 'closed'
    CHECK (state IN ('closed', 'open', 'half-open')),
  threshold integer NOT NULL CHECK (threshold > 0),
  reset_timeout_ms integer NOT NULL CHECK (reset_timeout_ms >= 0),
  probe_token uuid,
  probe_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signal_circuit_breaker_probe_consistency CHECK (
    (state = 'half-open' AND probe_token IS NOT NULL AND probe_expires_at IS NOT NULL)
    OR
    (state <> 'half-open' AND probe_token IS NULL AND probe_expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS signal_circuit_breakers_open_due
  ON signal_circuit_breakers (last_failure_at)
  WHERE state = 'open';
