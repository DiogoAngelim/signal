DO $$
BEGIN
  CREATE TYPE signal_idempotency_status AS ENUM ('pending', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS signal_idempotency_records (
  operation_name text NOT NULL,
  idempotency_key text NOT NULL,
  payload_fingerprint text NOT NULL,
  status signal_idempotency_status NOT NULL DEFAULT 'pending',
  result jsonb,
  error jsonb,
  message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signal_idempotency_operation_key UNIQUE (operation_name, idempotency_key)
);
