import { Pool, type PoolConfig } from "pg";
import {
  assessCoherence,
  createRealitySnapshotForDecision,
  type OutcomeEvaluation,
  type RealitySnapshot,
  type SignalDecisionRecord,
} from "@signal/decision";
import type { DecisionReview, LearningRecord, RegimeSnapshot, Thesis } from "./learning";
import { normalizeRetentionTier } from "./retention";
import type {
  CalibrationHistoryEntry,
  DecisionMemoryStore,
  DecisionRecordFilter,
  LearningRecordFilter,
  MemorySummary,
  RealitySnapshotFilter,
  ReplaySnapshot,
  RetentionJobRecord,
  TrustHistoryEntry,
} from "./types";

export const SIGNAL_DECISION_MEMORY_MIGRATION_SQL = `
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

CREATE TABLE IF NOT EXISTS signal_theses (
  thesis_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('emerging','strengthening','stable','weakening','invalidated')),
  confidence DOUBLE PRECISION NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  thesis JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_signal_theses_source_updated_at
  ON signal_theses (source, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_theses_status
  ON signal_theses (status);

CREATE TABLE IF NOT EXISTS signal_regime_snapshots (
  regime_snapshot_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  market_category TEXT NOT NULL,
  venue TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  market_health DOUBLE PRECISION NOT NULL DEFAULT 50,
  risk_state TEXT NOT NULL,
  trust DOUBLE PRECISION NOT NULL DEFAULT 50,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 50,
  readiness DOUBLE PRECISION NOT NULL DEFAULT 50,
  opportunity_density DOUBLE PRECISION NOT NULL DEFAULT 0,
  final_recommendation TEXT NOT NULL,
  eventual_outcome JSONB,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_signal_regime_snapshots_source_captured_at
  ON signal_regime_snapshots (source, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_regime_snapshots_venue_captured_at
  ON signal_regime_snapshots (venue, captured_at DESC);

CREATE TABLE IF NOT EXISTS signal_decision_reviews (
  review_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  source TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('correct','wrong','early','late','inconclusive')),
  review JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_signal_decision_reviews_decision_id
  ON signal_decision_reviews (decision_id);
CREATE INDEX IF NOT EXISTS idx_signal_decision_reviews_source_reviewed_at
  ON signal_decision_reviews (source, reviewed_at DESC);

CREATE TABLE IF NOT EXISTS signal_learning_records (
  learning_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  decision_id TEXT,
  thesis_id TEXT,
  regime_snapshot_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  lesson TEXT NOT NULL,
  learning JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_signal_learning_records_source_created_at
  ON signal_learning_records (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_learning_records_decision_id
  ON signal_learning_records (decision_id);
CREATE INDEX IF NOT EXISTS idx_signal_learning_records_thesis_id
  ON signal_learning_records (thesis_id);

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
`;

export type NeonPostgresAdapterOptions = {
  connectionString?: string;
  pool?: Pool;
  autoMigrate?: boolean;
  source?: string;
  ssl?: boolean | PoolConfig["ssl"];
  max?: number;
};

type DecisionRow = {
  decision_id: string;
  created_at: string | Date;
  source: string;
  reality_snapshot_id: string;
  observation: unknown;
  discovery: unknown;
  judgment: unknown;
  purpose: unknown;
  need: unknown;
  coherence: unknown;
  prediction: unknown;
  simulation: unknown;
  wisdom: unknown;
  agency: unknown;
  action: unknown;
  outcome: unknown;
  accountability: unknown;
  human_summary: string;
  retention_tier: string;
};

type RealitySnapshotRow = {
  snapshot_id: string;
  source: string;
  created_at: string | Date;
  data_quality: number;
  freshness_score: number;
  payload: unknown;
  source_ref: RealitySnapshot["sourceRef"] | null;
  metadata: RealitySnapshot["metadata"] | null;
};

type ThesisRow = {
  thesis_id: string;
  source: string;
  title: string;
  description: string;
  status: Thesis["status"];
  confidence: number;
  created_at: string | Date;
  updated_at: string | Date;
  thesis: Thesis;
};

type RegimeSnapshotRow = {
  regime_snapshot_id: string;
  source: string;
  market_category: string;
  venue: string;
  captured_at: string | Date;
  market_health: number;
  risk_state: string;
  trust: number;
  confidence: number;
  readiness: number;
  opportunity_density: number;
  final_recommendation: string;
  eventual_outcome: RegimeSnapshot["eventualOutcome"] | null;
  snapshot: RegimeSnapshot;
};

export class NeonPostgresAdapter implements DecisionMemoryStore {
  private readonly pool: Pool;
  private readonly autoMigrate: boolean;
  private readonly source: string;
  private migrated: Promise<void> | undefined;

  constructor(options: NeonPostgresAdapterOptions = {}) {
    const connectionString = options.connectionString ?? process.env["DATABASE_URL"];
    if (!options.pool && !connectionString) {
      throw new Error("DATABASE_URL is required for NeonPostgresAdapter");
    }

    this.pool = options.pool ?? new Pool({
      connectionString,
      ssl: resolveSsl(connectionString, options.ssl),
      max: options.max ?? 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    });
    this.autoMigrate = options.autoMigrate !== false;
    this.source = options.source ?? process.env["SIGNAL_SOURCE_ID"] ?? "signal";
  }

  async migrate(): Promise<void> {
    await this.pool.query(SIGNAL_DECISION_MEMORY_MIGRATION_SQL);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async saveRealitySnapshot(snapshot: RealitySnapshot): Promise<RealitySnapshot> {
    await this.ensureReady();
    await this.pool.query(
      `
      INSERT INTO signal_reality_snapshots (
        snapshot_id,
        source,
        created_at,
        data_quality,
        freshness_score,
        payload,
        source_ref,
        metadata,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,NOW())
      ON CONFLICT (snapshot_id) DO UPDATE SET
        source = EXCLUDED.source,
        created_at = EXCLUDED.created_at,
        data_quality = EXCLUDED.data_quality,
        freshness_score = EXCLUDED.freshness_score,
        payload = EXCLUDED.payload,
        source_ref = EXCLUDED.source_ref,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      `,
      [
        snapshot.snapshotId,
        snapshot.source,
        snapshot.createdAt,
        snapshot.dataQuality,
        snapshot.freshnessScore,
        jsonb(snapshot.payload),
        jsonb(snapshot.sourceRef),
        jsonb(snapshot.metadata),
      ],
    );
    return snapshot;
  }

  async getRealitySnapshot(snapshotId: string): Promise<RealitySnapshot | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<RealitySnapshotRow>(
      "SELECT * FROM signal_reality_snapshots WHERE snapshot_id = $1 LIMIT 1",
      [snapshotId],
    );
    return result.rows[0] ? rowToRealitySnapshot(result.rows[0]) : undefined;
  }

  async listRealitySnapshots(filter: RealitySnapshotFilter = {}): Promise<RealitySnapshot[]> {
    await this.ensureReady();
    const where: string[] = [];
    const params: unknown[] = [];
    addCondition(where, params, filter.snapshotId, "snapshot_id =");
    addCondition(where, params, filter.source, "source =");
    addCondition(where, params, filter.createdBefore, "created_at <");
    addCondition(where, params, filter.createdAfter, "created_at >");
    const limit = clampLimit(filter.limit);
    params.push(limit);
    const sql = `
      SELECT *
      FROM signal_reality_snapshots
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `;
    const result = await this.pool.query<RealitySnapshotRow>(sql, params);
    return result.rows.map(rowToRealitySnapshot);
  }

  async saveDecisionRecord(record: SignalDecisionRecord): Promise<SignalDecisionRecord> {
    await this.ensureReady();
    const normalized = normalizeRecord(record, this.source);
    await this.saveRealitySnapshot(normalized.realitySnapshot ?? createRealitySnapshotForDecision(normalized));
    await this.pool.query(
      `
      INSERT INTO signal_decision_records (
        decision_id,
        created_at,
        source,
        reality_snapshot_id,
        observation,
        discovery,
        judgment,
        purpose,
        need,
        coherence,
        prediction,
        simulation,
        wisdom,
        agency,
        action,
        outcome,
        accountability,
        human_summary,
        retention_tier,
        compacted_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,
        $12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18,$19,
        CASE WHEN $19 IN ('warm','cold','expired') THEN NOW() ELSE NULL END,
        NOW()
      )
      ON CONFLICT (decision_id) DO UPDATE SET
        created_at = EXCLUDED.created_at,
        source = EXCLUDED.source,
        reality_snapshot_id = EXCLUDED.reality_snapshot_id,
        observation = EXCLUDED.observation,
        discovery = EXCLUDED.discovery,
        judgment = EXCLUDED.judgment,
        purpose = EXCLUDED.purpose,
        need = EXCLUDED.need,
        coherence = EXCLUDED.coherence,
        prediction = EXCLUDED.prediction,
        simulation = EXCLUDED.simulation,
        wisdom = EXCLUDED.wisdom,
        agency = EXCLUDED.agency,
        action = EXCLUDED.action,
        outcome = EXCLUDED.outcome,
        accountability = EXCLUDED.accountability,
        human_summary = EXCLUDED.human_summary,
        retention_tier = EXCLUDED.retention_tier,
        compacted_at = COALESCE(EXCLUDED.compacted_at, signal_decision_records.compacted_at),
        updated_at = NOW()
      `,
      [
        normalized.decisionId,
        normalized.createdAt,
        normalized.source,
        normalized.realitySnapshotId,
        jsonb(normalized.observation),
        jsonb(normalized.discovery),
        jsonb(normalized.judgment),
        jsonb(normalized.purpose),
        jsonb(normalized.need),
        jsonb(normalized.coherence),
        jsonb(normalized.prediction),
        jsonb(normalized.simulation),
        jsonb(normalized.wisdom),
        jsonb(normalized.agency),
        jsonb(normalized.action),
        jsonb(normalized.outcome),
        jsonb(normalized.accountability),
        normalized.humanSummary,
        normalized.retentionTier,
      ],
    );
    return normalized;
  }

  async getDecisionRecord(decisionId: string): Promise<SignalDecisionRecord | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<DecisionRow>(
      "SELECT * FROM signal_decision_records WHERE decision_id = $1 LIMIT 1",
      [decisionId],
    );
    if (!result.rows[0]) return undefined;
    const record = rowToDecision(result.rows[0]);
    const snapshot = await this.getRealitySnapshot(record.realitySnapshotId);
    return snapshot ? { ...record, realitySnapshot: snapshot } : record;
  }

  async listDecisionRecords(filter: DecisionRecordFilter = {}): Promise<SignalDecisionRecord[]> {
    await this.ensureReady();
    const where: string[] = [];
    const params: unknown[] = [];
    addCondition(where, params, filter.decisionId, "decision_id =");
    addCondition(where, params, filter.source, "source =");
    addCondition(where, params, filter.retentionTier, "retention_tier =");
    addCondition(where, params, filter.createdBefore, "created_at <");
    addCondition(where, params, filter.createdAfter, "created_at >");
    const limit = clampLimit(filter.limit);
    params.push(limit);
    const sql = `
      SELECT *
      FROM signal_decision_records
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `;
    const result = await this.pool.query<DecisionRow>(sql, params);
    return result.rows.map(rowToDecision);
  }

  async deleteDecisionRecord(decisionId: string): Promise<void> {
    await this.ensureReady();
    await this.pool.query("DELETE FROM signal_decision_records WHERE decision_id = $1", [decisionId]);
  }

  async recordOutcome(outcome: OutcomeEvaluation): Promise<OutcomeEvaluation> {
    await this.ensureReady();
    await this.pool.query(
      `
      INSERT INTO signal_outcomes (
        outcome_id,
        decision_id,
        source,
        category,
        trust_impact,
        calibration_impact,
        outcome
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
      ON CONFLICT (outcome_id) DO UPDATE SET
        decision_id = EXCLUDED.decision_id,
        source = EXCLUDED.source,
        category = EXCLUDED.category,
        trust_impact = EXCLUDED.trust_impact,
        calibration_impact = EXCLUDED.calibration_impact,
        outcome = EXCLUDED.outcome
      `,
      [
        outcome.outcomeId,
        outcome.decisionId,
        this.source,
        outcome.category,
        outcome.trustImpact,
        outcome.calibrationImpact,
        jsonb(outcome),
      ],
    );
    await this.pool.query(
      `
      UPDATE signal_decision_records
      SET outcome = $2::jsonb, updated_at = NOW()
      WHERE decision_id = $1
      `,
      [outcome.decisionId, jsonb(outcome)],
    );
    return outcome;
  }

  async listOutcomes(decisionId?: string): Promise<OutcomeEvaluation[]> {
    await this.ensureReady();
    const result = await this.pool.query<{ outcome: OutcomeEvaluation }>(
      `
      SELECT outcome
      FROM signal_outcomes
      ${decisionId ? "WHERE decision_id = $1" : ""}
      ORDER BY recorded_at DESC
      `,
      decisionId ? [decisionId] : [],
    );
    return result.rows.map((row) => row.outcome);
  }

  async saveReplaySnapshot(snapshot: ReplaySnapshot): Promise<ReplaySnapshot> {
    await this.ensureReady();
    await this.pool.query(
      `
      INSERT INTO signal_replay_snapshots (
        snapshot_id,
        decision_id,
        source,
        created_at,
        retention_tier,
        snapshot
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      ON CONFLICT (snapshot_id) DO UPDATE SET
        decision_id = EXCLUDED.decision_id,
        source = EXCLUDED.source,
        created_at = EXCLUDED.created_at,
        retention_tier = EXCLUDED.retention_tier,
        snapshot = EXCLUDED.snapshot
      `,
      [
        snapshot.snapshotId,
        snapshot.decisionId,
        snapshot.source,
        snapshot.createdAt,
        snapshot.retentionTier,
        jsonb(snapshot.snapshot),
      ],
    );
    return snapshot;
  }

  async listReplaySnapshots(decisionId?: string): Promise<ReplaySnapshot[]> {
    await this.ensureReady();
    const result = await this.pool.query<{
      snapshot_id: string;
      decision_id: string;
      source: string;
      created_at: string | Date;
      retention_tier: string;
      snapshot: unknown;
    }>(
      `
      SELECT *
      FROM signal_replay_snapshots
      ${decisionId ? "WHERE decision_id = $1" : ""}
      ORDER BY created_at DESC
      `,
      decisionId ? [decisionId] : [],
    );
    return result.rows.map((row) => ({
      snapshotId: row.snapshot_id,
      decisionId: row.decision_id,
      source: row.source,
      createdAt: toIso(row.created_at),
      retentionTier: normalizeRetentionTier(row.retention_tier),
      snapshot: row.snapshot,
    }));
  }

  async recordCalibration(entry: CalibrationHistoryEntry): Promise<CalibrationHistoryEntry> {
    await this.ensureReady();
    await this.pool.query(
      `
      INSERT INTO signal_calibration_history (
        calibration_id,
        decision_id,
        source,
        created_at,
        impact,
        calibration
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      ON CONFLICT (calibration_id) DO UPDATE SET
        decision_id = EXCLUDED.decision_id,
        source = EXCLUDED.source,
        created_at = EXCLUDED.created_at,
        impact = EXCLUDED.impact,
        calibration = EXCLUDED.calibration
      `,
      [
        entry.calibrationId,
        entry.decisionId ?? null,
        entry.source,
        entry.createdAt,
        entry.impact,
        jsonb(entry.calibration),
      ],
    );
    return entry;
  }

  async recordTrust(entry: TrustHistoryEntry): Promise<TrustHistoryEntry> {
    await this.ensureReady();
    await this.pool.query(
      `
      INSERT INTO signal_trust_history (
        trust_id,
        decision_id,
        source,
        created_at,
        impact,
        trust
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      ON CONFLICT (trust_id) DO UPDATE SET
        decision_id = EXCLUDED.decision_id,
        source = EXCLUDED.source,
        created_at = EXCLUDED.created_at,
        impact = EXCLUDED.impact,
        trust = EXCLUDED.trust
      `,
      [
        entry.trustId,
        entry.decisionId ?? null,
        entry.source,
        entry.createdAt,
        entry.impact,
        jsonb(entry.trust),
      ],
    );
    return entry;
  }

  async listCalibrationHistory(decisionId?: string): Promise<CalibrationHistoryEntry[]> {
    await this.ensureReady();
    const result = await this.pool.query<{
      calibration_id: string;
      decision_id: string | null;
      source: string;
      created_at: string | Date;
      impact: number;
      calibration: unknown;
    }>(
      `
      SELECT *
      FROM signal_calibration_history
      ${decisionId ? "WHERE decision_id = $1" : ""}
      ORDER BY created_at DESC
      `,
      decisionId ? [decisionId] : [],
    );
    return result.rows.map((row) => ({
      calibrationId: row.calibration_id,
      ...(row.decision_id ? { decisionId: row.decision_id } : {}),
      source: row.source,
      createdAt: toIso(row.created_at),
      impact: Number(row.impact),
      calibration: row.calibration,
    }));
  }

  async listTrustHistory(decisionId?: string): Promise<TrustHistoryEntry[]> {
    await this.ensureReady();
    const result = await this.pool.query<{
      trust_id: string;
      decision_id: string | null;
      source: string;
      created_at: string | Date;
      impact: number;
      trust: unknown;
    }>(
      `
      SELECT *
      FROM signal_trust_history
      ${decisionId ? "WHERE decision_id = $1" : ""}
      ORDER BY created_at DESC
      `,
      decisionId ? [decisionId] : [],
    );
    return result.rows.map((row) => ({
      trustId: row.trust_id,
      ...(row.decision_id ? { decisionId: row.decision_id } : {}),
      source: row.source,
      createdAt: toIso(row.created_at),
      impact: Number(row.impact),
      trust: row.trust,
    }));
  }

  async saveSummary(summary: MemorySummary): Promise<MemorySummary> {
    await this.ensureReady();
    await this.pool.query(
      `
      INSERT INTO signal_memory_summaries (
        summary_id,
        source,
        created_at,
        window_start,
        window_end,
        retention_tier,
        human_summary,
        summary
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      ON CONFLICT (summary_id) DO UPDATE SET
        source = EXCLUDED.source,
        created_at = EXCLUDED.created_at,
        window_start = EXCLUDED.window_start,
        window_end = EXCLUDED.window_end,
        retention_tier = EXCLUDED.retention_tier,
        human_summary = EXCLUDED.human_summary,
        summary = EXCLUDED.summary
      `,
      [
        summary.summaryId,
        summary.source,
        summary.createdAt,
        summary.windowStart ?? null,
        summary.windowEnd ?? null,
        summary.retentionTier,
        summary.humanSummary,
        jsonb(summary.summary),
      ],
    );
    return summary;
  }

  async listSummaries(filter: { source?: string; limit?: number } = {}): Promise<MemorySummary[]> {
    await this.ensureReady();
    const params: unknown[] = [];
    const where = filter.source ? "WHERE source = $1" : "";
    if (filter.source) params.push(filter.source);
    params.push(clampLimit(filter.limit));
    const result = await this.pool.query<{
      summary_id: string;
      source: string;
      created_at: string | Date;
      window_start: string | Date | null;
      window_end: string | Date | null;
      retention_tier: string;
      human_summary: string;
      summary: MemorySummary["summary"];
    }>(
      `
      SELECT *
      FROM signal_memory_summaries
      ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length}
      `,
      params,
    );
    return result.rows.map((row) => ({
      summaryId: row.summary_id,
      source: row.source,
      createdAt: toIso(row.created_at),
      ...(row.window_start ? { windowStart: toIso(row.window_start) } : {}),
      ...(row.window_end ? { windowEnd: toIso(row.window_end) } : {}),
      retentionTier: normalizeRetentionTier(row.retention_tier, "warm"),
      humanSummary: row.human_summary,
      summary: row.summary,
    }));
  }

  async saveThesis(thesis: Thesis): Promise<Thesis> {
    await this.ensureReady();
    await this.pool.query(
      `
      INSERT INTO signal_theses (
        thesis_id,
        source,
        title,
        description,
        status,
        confidence,
        created_at,
        updated_at,
        thesis
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
      ON CONFLICT (thesis_id) DO UPDATE SET
        source = EXCLUDED.source,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        confidence = EXCLUDED.confidence,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        thesis = EXCLUDED.thesis
      `,
      [
        thesis.thesisId,
        thesis.source,
        thesis.title,
        thesis.description,
        thesis.status,
        thesis.confidence,
        thesis.createdAt,
        thesis.updatedAt,
        jsonb(thesis),
      ],
    );
    return thesis;
  }

  async getThesis(thesisId: string): Promise<Thesis | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<ThesisRow>(
      "SELECT * FROM signal_theses WHERE thesis_id = $1 LIMIT 1",
      [thesisId],
    );
    return result.rows[0] ? rowToThesis(result.rows[0]) : undefined;
  }

  async listTheses(filter: LearningRecordFilter = {}): Promise<Thesis[]> {
    await this.ensureReady();
    const where: string[] = [];
    const params: unknown[] = [];
    addCondition(where, params, filter.source, "source =");
    addCondition(where, params, filter.thesisId, "thesis_id =");
    addCondition(where, params, filter.createdBefore, "created_at <");
    addCondition(where, params, filter.createdAfter, "created_at >");
    params.push(clampLimit(filter.limit));
    const result = await this.pool.query<ThesisRow>(
      `
      SELECT *
      FROM signal_theses
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY updated_at DESC
      LIMIT $${params.length}
      `,
      params,
    );
    return result.rows.map(rowToThesis);
  }

  async saveRegimeSnapshot(snapshot: RegimeSnapshot): Promise<RegimeSnapshot> {
    await this.ensureReady();
    await this.pool.query(
      `
      INSERT INTO signal_regime_snapshots (
        regime_snapshot_id,
        source,
        market_category,
        venue,
        captured_at,
        market_health,
        risk_state,
        trust,
        confidence,
        readiness,
        opportunity_density,
        final_recommendation,
        eventual_outcome,
        snapshot
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb)
      ON CONFLICT (regime_snapshot_id) DO UPDATE SET
        source = EXCLUDED.source,
        market_category = EXCLUDED.market_category,
        venue = EXCLUDED.venue,
        captured_at = EXCLUDED.captured_at,
        market_health = EXCLUDED.market_health,
        risk_state = EXCLUDED.risk_state,
        trust = EXCLUDED.trust,
        confidence = EXCLUDED.confidence,
        readiness = EXCLUDED.readiness,
        opportunity_density = EXCLUDED.opportunity_density,
        final_recommendation = EXCLUDED.final_recommendation,
        eventual_outcome = EXCLUDED.eventual_outcome,
        snapshot = EXCLUDED.snapshot
      `,
      [
        snapshot.regimeSnapshotId,
        snapshot.source,
        snapshot.marketCategory,
        snapshot.venue,
        snapshot.timestamp,
        snapshot.marketHealth,
        snapshot.riskState,
        snapshot.trust,
        snapshot.confidence,
        snapshot.readiness,
        snapshot.opportunityDensity,
        snapshot.finalRecommendation,
        jsonb(snapshot.eventualOutcome),
        jsonb(snapshot),
      ],
    );
    return snapshot;
  }

  async getRegimeSnapshot(regimeSnapshotId: string): Promise<RegimeSnapshot | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<RegimeSnapshotRow>(
      "SELECT * FROM signal_regime_snapshots WHERE regime_snapshot_id = $1 LIMIT 1",
      [regimeSnapshotId],
    );
    return result.rows[0] ? rowToRegimeSnapshot(result.rows[0]) : undefined;
  }

  async listRegimeSnapshots(filter: LearningRecordFilter = {}): Promise<RegimeSnapshot[]> {
    await this.ensureReady();
    const where: string[] = [];
    const params: unknown[] = [];
    addCondition(where, params, filter.source, "source =");
    addCondition(where, params, filter.regimeSnapshotId, "regime_snapshot_id =");
    addCondition(where, params, filter.venue, "venue =");
    addCondition(where, params, filter.createdBefore, "captured_at <");
    addCondition(where, params, filter.createdAfter, "captured_at >");
    params.push(clampLimit(filter.limit));
    const result = await this.pool.query<RegimeSnapshotRow>(
      `
      SELECT *
      FROM signal_regime_snapshots
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY captured_at DESC
      LIMIT $${params.length}
      `,
      params,
    );
    return result.rows.map(rowToRegimeSnapshot);
  }

  async saveDecisionReview(review: DecisionReview): Promise<DecisionReview> {
    await this.ensureReady();
    await this.pool.query(
      `
      INSERT INTO signal_decision_reviews (
        review_id,
        decision_id,
        source,
        reviewed_at,
        classification,
        review
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      ON CONFLICT (review_id) DO UPDATE SET
        decision_id = EXCLUDED.decision_id,
        source = EXCLUDED.source,
        reviewed_at = EXCLUDED.reviewed_at,
        classification = EXCLUDED.classification,
        review = EXCLUDED.review
      `,
      [
        review.reviewId,
        review.decisionId,
        review.source,
        review.reviewedAt,
        review.classification,
        jsonb(review),
      ],
    );
    return review;
  }

  async listDecisionReviews(filter: LearningRecordFilter = {}): Promise<DecisionReview[]> {
    await this.ensureReady();
    const where: string[] = [];
    const params: unknown[] = [];
    addCondition(where, params, filter.source, "source =");
    addCondition(where, params, filter.decisionId, "decision_id =");
    addCondition(where, params, filter.createdBefore, "reviewed_at <");
    addCondition(where, params, filter.createdAfter, "reviewed_at >");
    params.push(clampLimit(filter.limit));
    const result = await this.pool.query<{ review: DecisionReview }>(
      `
      SELECT review
      FROM signal_decision_reviews
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY reviewed_at DESC
      LIMIT $${params.length}
      `,
      params,
    );
    return result.rows.map((row) => row.review);
  }

  async saveLearningRecord(record: LearningRecord): Promise<LearningRecord> {
    await this.ensureReady();
    await this.pool.query(
      `
      INSERT INTO signal_learning_records (
        learning_id,
        source,
        decision_id,
        thesis_id,
        regime_snapshot_id,
        created_at,
        lesson,
        learning
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      ON CONFLICT (learning_id) DO UPDATE SET
        source = EXCLUDED.source,
        decision_id = EXCLUDED.decision_id,
        thesis_id = EXCLUDED.thesis_id,
        regime_snapshot_id = EXCLUDED.regime_snapshot_id,
        created_at = EXCLUDED.created_at,
        lesson = EXCLUDED.lesson,
        learning = EXCLUDED.learning
      `,
      [
        record.learningId,
        record.source,
        record.decisionId ?? null,
        record.thesisId ?? null,
        record.regimeSnapshotId ?? null,
        record.createdAt,
        record.lesson,
        jsonb(record),
      ],
    );
    return record;
  }

  async listLearningRecords(filter: LearningRecordFilter = {}): Promise<LearningRecord[]> {
    await this.ensureReady();
    const where: string[] = [];
    const params: unknown[] = [];
    addCondition(where, params, filter.source, "source =");
    addCondition(where, params, filter.decisionId, "decision_id =");
    addCondition(where, params, filter.thesisId, "thesis_id =");
    addCondition(where, params, filter.regimeSnapshotId, "regime_snapshot_id =");
    addCondition(where, params, filter.createdBefore, "created_at <");
    addCondition(where, params, filter.createdAfter, "created_at >");
    params.push(clampLimit(filter.limit));
    const result = await this.pool.query<{ learning: LearningRecord }>(
      `
      SELECT learning
      FROM signal_learning_records
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT $${params.length}
      `,
      params,
    );
    return result.rows.map((row) => row.learning);
  }

  async saveRetentionJob(job: RetentionJobRecord): Promise<RetentionJobRecord> {
    await this.ensureReady();
    await this.pool.query(
      `
      INSERT INTO signal_retention_jobs (
        job_id,
        job_type,
        status,
        started_at,
        completed_at,
        policy,
        result,
        error
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
      ON CONFLICT (job_id) DO UPDATE SET
        job_type = EXCLUDED.job_type,
        status = EXCLUDED.status,
        started_at = EXCLUDED.started_at,
        completed_at = EXCLUDED.completed_at,
        policy = EXCLUDED.policy,
        result = EXCLUDED.result,
        error = EXCLUDED.error
      `,
      [
        job.jobId,
        job.jobType,
        job.status,
        job.startedAt,
        job.completedAt ?? null,
        jsonb(job.policy),
        jsonb(job.result),
        job.error ?? null,
      ],
    );
    return job;
  }

  async updateRetentionJob(
    jobId: string,
    patch: Partial<RetentionJobRecord>,
  ): Promise<RetentionJobRecord | undefined> {
    await this.ensureReady();
    const existing = await this.pool.query<{
      job_id: string;
      job_type: RetentionJobRecord["jobType"];
      status: RetentionJobRecord["status"];
      started_at: string | Date;
      completed_at: string | Date | null;
      policy: RetentionJobRecord["policy"];
      result: unknown;
      error: string | null;
    }>("SELECT * FROM signal_retention_jobs WHERE job_id = $1 LIMIT 1", [jobId]);
    const row = existing.rows[0];
    if (!row) return undefined;
    const merged: RetentionJobRecord = {
      jobId: row.job_id,
      jobType: patch.jobType ?? row.job_type,
      status: patch.status ?? row.status,
      startedAt: patch.startedAt ?? toIso(row.started_at),
      completedAt: patch.completedAt ?? (row.completed_at ? toIso(row.completed_at) : undefined),
      policy: patch.policy ?? row.policy,
      result: patch.result ?? row.result,
      error: patch.error ?? row.error ?? undefined,
    };
    await this.saveRetentionJob(merged);
    return merged;
  }

  private async ensureReady(): Promise<void> {
    if (!this.autoMigrate) return;
    this.migrated ??= this.migrate();
    await this.migrated;
  }
}

function normalizeRecord(record: SignalDecisionRecord, source: string): SignalDecisionRecord {
  const snapshot = record.realitySnapshot ?? createRealitySnapshotForDecision({
    decisionId: record.decisionId,
    source: record.source || source,
    createdAt: record.createdAt,
    observation: record.observation,
    realitySnapshotId: record.realitySnapshotId,
  });

  return {
    ...record,
    source: record.source || source,
    realitySnapshotId: snapshot.snapshotId,
    realitySnapshot: snapshot,
    retentionTier: normalizeRetentionTier(record.retentionTier),
  };
}

function rowToDecision(row: DecisionRow): SignalDecisionRecord {
  return {
    decisionId: row.decision_id,
    createdAt: toIso(row.created_at),
    source: row.source,
    realitySnapshotId: row.reality_snapshot_id,
    observation: row.observation,
    ...(row.discovery == null ? {} : { discovery: row.discovery }),
    ...(row.judgment == null ? {} : { judgment: row.judgment }),
    ...(row.purpose == null ? {} : { purpose: row.purpose }),
    ...(row.need == null ? {} : { need: row.need }),
    coherence: row.coherence == null ? assessCoherence({}) : row.coherence as SignalDecisionRecord["coherence"],
    ...(row.prediction == null ? {} : { prediction: row.prediction as SignalDecisionRecord["prediction"] }),
    ...(row.simulation == null ? {} : { simulation: row.simulation as SignalDecisionRecord["simulation"] }),
    ...(row.wisdom == null ? {} : { wisdom: row.wisdom as SignalDecisionRecord["wisdom"] }),
    ...(row.agency == null ? {} : { agency: row.agency }),
    ...(row.action == null ? {} : { action: row.action }),
    ...(row.outcome == null ? {} : { outcome: row.outcome as SignalDecisionRecord["outcome"] }),
    ...(row.accountability == null ? {} : { accountability: row.accountability as SignalDecisionRecord["accountability"] }),
    humanSummary: row.human_summary,
    retentionTier: normalizeRetentionTier(row.retention_tier),
  };
}

function rowToRealitySnapshot(row: RealitySnapshotRow): RealitySnapshot {
  return {
    snapshotId: row.snapshot_id,
    source: row.source,
    createdAt: toIso(row.created_at),
    dataQuality: Number(row.data_quality),
    freshnessScore: Number(row.freshness_score),
    payload: row.payload,
    ...(row.source_ref == null ? {} : { sourceRef: row.source_ref }),
    ...(row.metadata == null ? {} : { metadata: row.metadata }),
  };
}

function rowToThesis(row: ThesisRow): Thesis {
  return {
    ...row.thesis,
    thesisId: row.thesis.thesisId ?? row.thesis_id,
    source: row.thesis.source ?? row.source,
    title: row.thesis.title ?? row.title,
    description: row.thesis.description ?? row.description,
    status: row.thesis.status ?? row.status,
    confidence: Number(row.thesis.confidence ?? row.confidence),
    createdAt: row.thesis.createdAt ?? toIso(row.created_at),
    updatedAt: row.thesis.updatedAt ?? toIso(row.updated_at),
  };
}

function rowToRegimeSnapshot(row: RegimeSnapshotRow): RegimeSnapshot {
  return {
    ...row.snapshot,
    regimeSnapshotId: row.snapshot.regimeSnapshotId ?? row.regime_snapshot_id,
    source: row.snapshot.source ?? row.source,
    marketCategory: row.snapshot.marketCategory ?? row.market_category,
    venue: row.snapshot.venue ?? row.venue,
    timestamp: row.snapshot.timestamp ?? toIso(row.captured_at),
    marketHealth: Number(row.snapshot.marketHealth ?? row.market_health),
    riskState: row.snapshot.riskState ?? row.risk_state,
    trust: Number(row.snapshot.trust ?? row.trust),
    confidence: Number(row.snapshot.confidence ?? row.confidence),
    readiness: Number(row.snapshot.readiness ?? row.readiness),
    opportunityDensity: Number(row.snapshot.opportunityDensity ?? row.opportunity_density),
    finalRecommendation: row.snapshot.finalRecommendation ?? row.final_recommendation,
    ...(row.snapshot.eventualOutcome ?? row.eventual_outcome
      ? { eventualOutcome: row.snapshot.eventualOutcome ?? row.eventual_outcome ?? undefined }
      : {}),
  };
}

function resolveSsl(connectionString: string | undefined, ssl: NeonPostgresAdapterOptions["ssl"]): PoolConfig["ssl"] | undefined {
  if (ssl !== undefined) return ssl;
  if (!connectionString) return undefined;
  if (/sslmode=require/i.test(connectionString) || /\.neon\.tech\//i.test(connectionString)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function addCondition(where: string[], params: unknown[], value: unknown, expression: string): void {
  if (value === undefined || value === "") return;
  params.push(value);
  where.push(`${expression} $${params.length}`);
}

function clampLimit(limit: unknown): number {
  const parsed = Number(limit ?? 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(Math.round(parsed), 1_000));
}

function jsonb(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
