CREATE TABLE IF NOT EXISTS public.reference_lab_state (
  id text PRIMARY KEY CHECK (id = 'main'),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reference_lab_auth_attempts (
  ip_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0
);

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reference_lab_auth_attempts_nonnegative'
      AND conrelid = 'public.reference_lab_auth_attempts'::regclass
  ) THEN
    ALTER TABLE public.reference_lab_auth_attempts
      ADD CONSTRAINT reference_lab_auth_attempts_nonnegative CHECK (attempts >= 0);
  END IF;
END
$migration$;

GRANT USAGE ON SCHEMA public TO signal_lab_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.reference_lab_state, public.reference_lab_auth_attempts
  TO signal_lab_runtime;
