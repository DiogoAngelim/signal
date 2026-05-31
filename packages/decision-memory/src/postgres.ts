import { Pool, type PoolConfig } from "pg";
import { assessCoherence, type OutcomeEvaluation, type SignalDecisionRecord } from "@signal/decision";
import { normalizeRetentionTier } from "./retention";
import type {
  CalibrationHistoryEntry,
  DecisionMemoryStore,
  DecisionRecordFilter,
  MemorySummary,
  ReplaySnapshot,
  RetentionJobRecord,
  TrustHistoryEntry,
} from "./types";

export const SIGNAL_DECISION_MEMORY_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS signal_decision_records (
  decision_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
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

  async saveDecisionRecord(record: SignalDecisionRecord): Promise<SignalDecisionRecord> {
    await this.ensureReady();
    const normalized = normalizeRecord(record, this.source);
    await this.pool.query(
      `
      INSERT INTO signal_decision_records (
        decision_id,
        created_at,
        source,
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
        $1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,
        $11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18,
        CASE WHEN $18 IN ('warm','cold','expired') THEN NOW() ELSE NULL END,
        NOW()
      )
      ON CONFLICT (decision_id) DO UPDATE SET
        created_at = EXCLUDED.created_at,
        source = EXCLUDED.source,
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
    return result.rows[0] ? rowToDecision(result.rows[0]) : undefined;
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
  return {
    ...record,
    source: record.source || source,
    retentionTier: normalizeRetentionTier(record.retentionTier),
  };
}

function rowToDecision(row: DecisionRow): SignalDecisionRecord {
  return {
    decisionId: row.decision_id,
    createdAt: toIso(row.created_at),
    source: row.source,
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
