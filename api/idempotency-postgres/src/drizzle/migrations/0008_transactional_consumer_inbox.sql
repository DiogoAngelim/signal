CREATE TABLE IF NOT EXISTS signal_consumer_inbox (
  tenant_id text NOT NULL CHECK (length(trim(tenant_id)) BETWEEN 1 AND 200),
  consumer_name text NOT NULL CHECK (length(trim(consumer_name)) BETWEEN 1 AND 200),
  message_id text NOT NULL CHECK (length(trim(message_id)) BETWEEN 1 AND 500),
  processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, consumer_name, message_id)
);

ALTER TABLE signal_consumer_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_consumer_inbox FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signal_consumer_inbox_tenant_isolation ON signal_consumer_inbox;
CREATE POLICY signal_consumer_inbox_tenant_isolation
  ON signal_consumer_inbox
  USING (tenant_id = current_setting('signal.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('signal.tenant_id', true));

CREATE INDEX IF NOT EXISTS signal_consumer_inbox_processed_at
  ON signal_consumer_inbox (processed_at);

COMMENT ON TABLE signal_consumer_inbox IS
  'Tenant-scoped transactional deduplication records for at-least-once Signal event consumers.';
