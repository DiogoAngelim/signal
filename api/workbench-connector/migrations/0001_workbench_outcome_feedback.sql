BEGIN;

CREATE TABLE IF NOT EXISTS signal_workbench_outcome_cursors (
  tenant_id text PRIMARY KEY,
  after_at text,
  outcome_id uuid,
  cash_change_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signal_workbench_cursor_shape_ck CHECK (
    (after_at IS NULL AND outcome_id IS NULL AND cash_change_id IS NULL) OR
    (after_at IS NOT NULL AND outcome_id IS NOT NULL AND cash_change_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS signal_workbench_outcome_events (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  outcome_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  collected_usd numeric(18,2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'USD',
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id),
  CONSTRAINT signal_workbench_outcome_currency_ck CHECK (currency = 'USD')
);

CREATE INDEX IF NOT EXISTS signal_workbench_outcome_events_tenant_time_idx
  ON signal_workbench_outcome_events (tenant_id, occurred_at, outcome_id);

ALTER TABLE signal_workbench_outcome_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_workbench_outcome_cursors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signal_workbench_outcome_cursors_tenant_policy ON signal_workbench_outcome_cursors;
CREATE POLICY signal_workbench_outcome_cursors_tenant_policy
  ON signal_workbench_outcome_cursors
  USING (tenant_id = current_setting('signal.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('signal.tenant_id', true));

ALTER TABLE signal_workbench_outcome_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_workbench_outcome_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signal_workbench_outcome_events_tenant_policy ON signal_workbench_outcome_events;
CREATE POLICY signal_workbench_outcome_events_tenant_policy
  ON signal_workbench_outcome_events
  USING (tenant_id = current_setting('signal.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('signal.tenant_id', true));

COMMIT;
