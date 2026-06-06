CREATE TABLE IF NOT EXISTS signal_schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signal_records (
  id text PRIMARY KEY,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  message_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  venue text NOT NULL,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  kind text NOT NULL,
  trust numeric NOT NULL,
  record jsonb NOT NULL,
  request_id text,
  accepted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signal_records_symbol_sequence_idx
  ON signal_records (symbol, sequence DESC);

CREATE INDEX IF NOT EXISTS signal_records_venue_symbol_timeframe_sequence_idx
  ON signal_records (venue, symbol, timeframe, sequence DESC);

CREATE INDEX IF NOT EXISTS signal_records_kind_trust_sequence_idx
  ON signal_records (kind, trust, sequence DESC);

CREATE TABLE IF NOT EXISTS signal_idempotency_keys (
  idempotency_key text PRIMARY KEY,
  signal_id text NOT NULL REFERENCES signal_records(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS latest_signal_indexes (
  venue text NOT NULL,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  signal_id text NOT NULL REFERENCES signal_records(id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venue, symbol, timeframe)
);

CREATE TABLE IF NOT EXISTS signal_audit_logs (
  id text PRIMARY KEY,
  signal_id text,
  message_id text,
  action text NOT NULL,
  actor text,
  request_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signal_audit_logs_action_created_idx
  ON signal_audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS signal_audit_logs_actor_created_idx
  ON signal_audit_logs (actor, created_at DESC);

CREATE TABLE IF NOT EXISTS signal_api_keys (
  id text PRIMARY KEY,
  prefix text NOT NULL UNIQUE,
  name text,
  secret_hash text NOT NULL,
  scopes jsonb NOT NULL,
  rate_limit_max integer,
  rate_limit_window_ms integer,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  rotated_from_key_id text REFERENCES signal_api_keys(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signal_api_keys_active_prefix_idx
  ON signal_api_keys (prefix)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS signal_secret_rotations (
  id text PRIMARY KEY,
  subject_type text NOT NULL CHECK (subject_type IN ('api_key', 'webhook')),
  subject_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'rotated', 'revoked')),
  previous_subject_id text,
  grace_expires_at timestamptz,
  actor text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signal_secret_rotations_subject_idx
  ON signal_secret_rotations (subject_type, subject_id, created_at DESC);

CREATE TABLE IF NOT EXISTS signal_webhook_subscriptions (
  id text PRIMARY KEY,
  url text NOT NULL,
  secret_ciphertext text NOT NULL,
  secret_preview text NOT NULL,
  previous_secret_ciphertext text,
  previous_secret_expires_at timestamptz,
  events jsonb NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signal_webhook_subscriptions_active_idx
  ON signal_webhook_subscriptions (active, created_at DESC);

CREATE TABLE IF NOT EXISTS signal_delivery_dedupe (
  delivery_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signal_webhook_delivery_attempts (
  id text PRIMARY KEY,
  webhook_id text NOT NULL REFERENCES signal_webhook_subscriptions(id) ON DELETE CASCADE,
  signal_id text,
  event text NOT NULL,
  delivery_id text NOT NULL,
  attempt integer NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'delivered', 'failed', 'retrying')),
  status_code integer,
  error text,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signal_webhook_delivery_attempts_delivery_idx
  ON signal_webhook_delivery_attempts (delivery_id, attempt);

CREATE INDEX IF NOT EXISTS signal_webhook_delivery_attempts_status_idx
  ON signal_webhook_delivery_attempts (status, created_at DESC);

CREATE TABLE IF NOT EXISTS signal_queue_jobs (
  id text PRIMARY KEY,
  queue text NOT NULL,
  dedupe_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'dead_letter')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  run_at timestamptz NOT NULL,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS signal_queue_jobs_active_dedupe_idx
  ON signal_queue_jobs (queue, dedupe_key)
  WHERE status IN ('queued', 'running', 'failed');

CREATE INDEX IF NOT EXISTS signal_queue_jobs_claim_idx
  ON signal_queue_jobs (queue, status, run_at);

CREATE INDEX IF NOT EXISTS signal_queue_jobs_dead_letter_idx
  ON signal_queue_jobs (queue, updated_at DESC)
  WHERE status = 'dead_letter';

CREATE TABLE IF NOT EXISTS signal_replay_keys (
  replay_key text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signal_replay_keys_expires_idx
  ON signal_replay_keys (expires_at);
