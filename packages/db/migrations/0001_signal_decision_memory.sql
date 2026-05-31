CREATE TABLE IF NOT EXISTS signal_reality_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  data_quality DOUBLE PRECISION NOT NULL DEFAULT 50,
  freshness_score DOUBLE PRECISION NOT NULL DEFAULT 50,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_ref JSONB,
  metadata JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_reality_snapshots_source_created_at
  ON signal_reality_snapshots (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_reality_snapshots_created_at
  ON signal_reality_snapshots (created_at DESC);

CREATE TABLE IF NOT EXISTS signal_decision_records (
  decision_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  reality_snapshot_id TEXT NOT NULL,
  observation JSONB NOT NULL DEFAULT '{}'::jsonb,
  discovery JSONB,
  judgment JSONB,
  purpose JSONB,
  need JSONB,
  coherence JSONB,
  prediction JSONB,
  simulation JSONB,
  wisdom JSONB,
  agency JSONB,
  action JSONB,
  outcome JSONB,
  accountability JSONB,
  human_summary TEXT NOT NULL,
  retention_tier TEXT NOT NULL DEFAULT 'hot' CHECK (retention_tier IN ('hot','warm','cold','expired')),
  compacted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_decision_records_decision_id
  ON signal_decision_records (decision_id);
CREATE INDEX IF NOT EXISTS idx_signal_decision_records_created_at
  ON signal_decision_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_decision_records_source
  ON signal_decision_records (source);
CREATE INDEX IF NOT EXISTS idx_signal_decision_records_retention_tier
  ON signal_decision_records (retention_tier);

ALTER TABLE signal_decision_records
  ADD COLUMN IF NOT EXISTS reality_snapshot_id TEXT;

INSERT INTO signal_reality_snapshots (
  snapshot_id,
  source,
  created_at,
  data_quality,
  freshness_score,
  payload,
  metadata
)
SELECT
  COALESCE(NULLIF(reality_snapshot_id, ''), CONCAT('reality:', decision_id)),
  source,
  created_at,
  50,
  50,
  jsonb_build_object('observation', observation),
  jsonb_build_object('decisionId', decision_id, 'capture', 'legacy-observation')
FROM signal_decision_records
WHERE reality_snapshot_id IS NULL OR reality_snapshot_id = ''
ON CONFLICT (snapshot_id) DO NOTHING;

UPDATE signal_decision_records
SET reality_snapshot_id = CONCAT('reality:', decision_id)
WHERE reality_snapshot_id IS NULL OR reality_snapshot_id = '';

ALTER TABLE signal_decision_records
  ALTER COLUMN reality_snapshot_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signal_decision_records_reality_snapshot_id
  ON signal_decision_records (reality_snapshot_id);

CREATE TABLE IF NOT EXISTS signal_outcomes (
  outcome_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'signal',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category TEXT NOT NULL,
  trust_impact DOUBLE PRECISION NOT NULL DEFAULT 0,
  calibration_impact DOUBLE PRECISION NOT NULL DEFAULT 0,
  outcome JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_signal_outcomes_decision_id
  ON signal_outcomes (decision_id);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_recorded_at
  ON signal_outcomes (recorded_at DESC);

CREATE TABLE IF NOT EXISTS signal_replay_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'signal',
  created_at TIMESTAMPTZ NOT NULL,
  retention_tier TEXT NOT NULL DEFAULT 'hot' CHECK (retention_tier IN ('hot','warm','cold','expired')),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_signal_replay_snapshots_decision_id
  ON signal_replay_snapshots (decision_id);
CREATE INDEX IF NOT EXISTS idx_signal_replay_snapshots_created_at
  ON signal_replay_snapshots (created_at DESC);

CREATE TABLE IF NOT EXISTS signal_calibration_history (
  calibration_id TEXT PRIMARY KEY,
  decision_id TEXT,
  source TEXT NOT NULL DEFAULT 'signal',
  created_at TIMESTAMPTZ NOT NULL,
  impact DOUBLE PRECISION NOT NULL DEFAULT 0,
  calibration JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_signal_calibration_history_decision_id
  ON signal_calibration_history (decision_id);
CREATE INDEX IF NOT EXISTS idx_signal_calibration_history_created_at
  ON signal_calibration_history (created_at DESC);

CREATE TABLE IF NOT EXISTS signal_trust_history (
  trust_id TEXT PRIMARY KEY,
  decision_id TEXT,
  source TEXT NOT NULL DEFAULT 'signal',
  created_at TIMESTAMPTZ NOT NULL,
  impact DOUBLE PRECISION NOT NULL DEFAULT 0,
  trust JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_signal_trust_history_decision_id
  ON signal_trust_history (decision_id);
CREATE INDEX IF NOT EXISTS idx_signal_trust_history_created_at
  ON signal_trust_history (created_at DESC);

CREATE TABLE IF NOT EXISTS signal_memory_summaries (
  summary_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  retention_tier TEXT NOT NULL DEFAULT 'warm' CHECK (retention_tier IN ('hot','warm','cold','expired')),
  human_summary TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_signal_memory_summaries_source_created_at
  ON signal_memory_summaries (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_memory_summaries_retention_tier
  ON signal_memory_summaries (retention_tier);

CREATE TABLE IF NOT EXISTS signal_retention_jobs (
  job_id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_signal_retention_jobs_status_started_at
  ON signal_retention_jobs (status, started_at DESC);
