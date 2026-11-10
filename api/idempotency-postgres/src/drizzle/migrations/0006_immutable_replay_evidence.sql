CREATE TABLE IF NOT EXISTS signal_replay_evidence (
  tenant_id text NOT NULL CHECK (length(trim(tenant_id)) > 0),
  execution_id text NOT NULL CHECK (length(trim(execution_id)) > 0),
  operation_name text NOT NULL CHECK (length(trim(operation_name)) > 0),
  operation_version text NOT NULL CHECK (length(trim(operation_version)) > 0),
  handler_artifact_digest char(64) NOT NULL CHECK (handler_artifact_digest ~ '^[a-f0-9]{64}$'),
  policy_version text NOT NULL CHECK (length(trim(policy_version)) > 0),
  record jsonb NOT NULL,
  captured_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, execution_id)
);

CREATE INDEX IF NOT EXISTS signal_replay_evidence_operation
  ON signal_replay_evidence (tenant_id, operation_name, operation_version, captured_at DESC);

ALTER TABLE signal_replay_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_replay_evidence FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signal_replay_evidence_tenant_isolation ON signal_replay_evidence;
CREATE POLICY signal_replay_evidence_tenant_isolation
  ON signal_replay_evidence
  USING (tenant_id = current_setting('signal.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('signal.tenant_id', true));

CREATE OR REPLACE FUNCTION signal_reject_replay_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Signal replay evidence is immutable; % is prohibited', TG_OP
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS signal_replay_evidence_no_update_delete ON signal_replay_evidence;
CREATE TRIGGER signal_replay_evidence_no_update_delete
  BEFORE UPDATE OR DELETE ON signal_replay_evidence
  FOR EACH ROW EXECUTE FUNCTION signal_reject_replay_evidence_mutation();

DROP TRIGGER IF EXISTS signal_replay_evidence_no_truncate ON signal_replay_evidence;
CREATE TRIGGER signal_replay_evidence_no_truncate
  BEFORE TRUNCATE ON signal_replay_evidence
  FOR EACH STATEMENT EXECUTE FUNCTION signal_reject_replay_evidence_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON signal_replay_evidence FROM PUBLIC;
