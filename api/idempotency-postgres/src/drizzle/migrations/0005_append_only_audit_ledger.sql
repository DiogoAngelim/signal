CREATE TABLE IF NOT EXISTS signal_audit_entries (
  sequence bigint PRIMARY KEY CHECK (sequence >= 0),
  entry jsonb NOT NULL,
  previous_hash char(64) NOT NULL CHECK (previous_hash ~ '^[a-f0-9]{64}$'),
  entry_hash char(64) NOT NULL CHECK (entry_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signal_audit_entries_created_at
  ON signal_audit_entries (created_at);

CREATE TABLE IF NOT EXISTS signal_audit_checkpoints (
  checkpoint_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version integer NOT NULL CHECK (version = 1),
  key_id text NOT NULL CHECK (length(trim(key_id)) > 0),
  sequence bigint NOT NULL CHECK (sequence >= -1),
  chain_head_hash char(64) NOT NULL CHECK (chain_head_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  signature text NOT NULL CHECK (length(signature) > 0),
  stored_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence, key_id, created_at)
);

CREATE INDEX IF NOT EXISTS signal_audit_checkpoints_latest
  ON signal_audit_checkpoints (sequence DESC, stored_at DESC);

CREATE OR REPLACE FUNCTION signal_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Signal audit ledger is append-only; % is prohibited', TG_OP
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS signal_audit_entries_no_update_delete ON signal_audit_entries;
CREATE TRIGGER signal_audit_entries_no_update_delete
  BEFORE UPDATE OR DELETE ON signal_audit_entries
  FOR EACH ROW EXECUTE FUNCTION signal_reject_audit_mutation();

DROP TRIGGER IF EXISTS signal_audit_entries_no_truncate ON signal_audit_entries;
CREATE TRIGGER signal_audit_entries_no_truncate
  BEFORE TRUNCATE ON signal_audit_entries
  FOR EACH STATEMENT EXECUTE FUNCTION signal_reject_audit_mutation();

DROP TRIGGER IF EXISTS signal_audit_checkpoints_no_update_delete ON signal_audit_checkpoints;
CREATE TRIGGER signal_audit_checkpoints_no_update_delete
  BEFORE UPDATE OR DELETE ON signal_audit_checkpoints
  FOR EACH ROW EXECUTE FUNCTION signal_reject_audit_mutation();

DROP TRIGGER IF EXISTS signal_audit_checkpoints_no_truncate ON signal_audit_checkpoints;
CREATE TRIGGER signal_audit_checkpoints_no_truncate
  BEFORE TRUNCATE ON signal_audit_checkpoints
  FOR EACH STATEMENT EXECUTE FUNCTION signal_reject_audit_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON signal_audit_entries FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON signal_audit_checkpoints FROM PUBLIC;
