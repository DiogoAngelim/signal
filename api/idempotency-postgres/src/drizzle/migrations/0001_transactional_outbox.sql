CREATE TABLE IF NOT EXISTS signal_outbox (
  id bigserial PRIMARY KEY,
  message_id text NOT NULL UNIQUE,
  envelope jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'delivered', 'dead-letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  CONSTRAINT signal_outbox_lease_consistency CHECK (
    (status = 'processing' AND locked_by IS NOT NULL AND locked_until IS NOT NULL)
    OR
    (status <> 'processing' AND locked_by IS NULL AND locked_until IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS signal_outbox_pending_available
  ON signal_outbox (available_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS signal_outbox_expired_leases
  ON signal_outbox (locked_until, created_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS signal_outbox_dead_letter_created
  ON signal_outbox (created_at)
  WHERE status = 'dead-letter';
