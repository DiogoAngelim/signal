import { randomUUID, createHash } from "crypto";
import { pool } from "@workspace/db";
import { type StockQuote, type TradeSignal } from "./stock-data";
import { logger } from "./logger";
import type { SignalScope } from "./signal-backend";

export type OccurrenceOrigin = "historical_backfill" | "live_runtime";

export interface ContextReplayRequest {
  candleTable?: string;
  batchSize?: number;
  market?: string;
  venue?: string;
  asset?: string;
  timeframe?: string;
  origin?: OccurrenceOrigin;
  ingestionSource?: string;
}

export interface ContextReplayResult {
  jobId: string;
  status: "completed" | "failed" | "skipped";
  processedRows: number;
  emittedOccurrences: number;
  message?: string;
}

type MarketContextInput = {
  timestampUtc: string;
  occurrenceOrigin: OccurrenceOrigin;
  market: string;
  venue: string;
  asset: string;
  timeframe: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  history?: number[];
  quote?: StockQuote;
  ingestionSource: string;
  emittedBy: string;
};

type DiagnosedMarketContext = {
  occurrenceId: string;
  previousOccurrenceId: string | null;
  timestampUtc: string;
  occurrenceOrigin: OccurrenceOrigin;
  market: string;
  venue: string;
  asset: string;
  timeframe: string;
  regimeState: string;
  regimeConfidence: number;
  trendQuality: number;
  breadth: number;
  participation: number;
  volatilityPressure: number;
  regimeStability: number;
  exposureDurability: number;
  holdingQuality: number;
  calibration: number;
  riskPressure: number;
  allocationPosture: string;
  capitalDeployed: number;
  availableRiskBudget: number;
  setupQualityDistribution: Record<string, number>;
  signalDistribution: Record<TradeSignal, number>;
  marketInterpretationLabels: string[];
  stateTransitionLabels: string[];
  stateHash: string;
  transitionType: string;
  transitionMagnitude: number;
  emittedReason: string;
  emittedBy: string;
  ingestionSource: string;
  signalId?: string | null;
};

type OccurrenceRow = {
  occurrence_id: string;
  state_hash: string;
  regime_state: string;
  allocation_posture: string;
  trend_quality: number;
  breadth: number;
  participation: number;
  volatility_pressure: number;
  regime_confidence: number;
  risk_pressure: number;
};

type ReplaySourceRow = {
  timestamp_utc: string | Date;
  market: string | null;
  venue: string | null;
  asset: string | null;
  timeframe: string | null;
  open: number | string | null;
  high: number | string | null;
  low: number | string | null;
  close: number | string | null;
  volume: number | string | null;
};

const MARKET_OCCURRENCES_TABLE = "market_occurrences";
const MARKET_STATE_SNAPSHOTS_TABLE = "market_state_snapshots";
const SIGNAL_OCCURRENCES_TABLE = "signal_occurrences";
const REGIME_TRANSITIONS_TABLE = "regime_transitions";
const ALLOCATION_STATE_OCCURRENCES_TABLE = "allocation_state_occurrences";
const HISTORICAL_REPLAY_JOBS_TABLE = "historical_replay_jobs";
const HISTORICAL_REPLAY_CHECKPOINTS_TABLE = "historical_replay_checkpoints";
const DEFAULT_CANDLE_TABLE =
  process.env.MARKET_CONTEXT_CANDLE_TABLE ?? "market_candles";
const DEFAULT_REPLAY_BATCH_SIZE = Number(
  process.env.MARKET_CONTEXT_REPLAY_BATCH_SIZE ?? 1000,
);

let schemaReady: Promise<void> | null = null;
let contextPersistenceWarningLogged = false;

function normalizeIdentifierValue(value: string | undefined, fallback: string) {
  const normalized = value?.trim().toUpperCase();
  return normalized || fallback;
}

function normalizeAsset(value: string | undefined) {
  return normalizeIdentifierValue(value, "UNKNOWN");
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function mean(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function returnsFromHistory(history: number[] | undefined): number[] {
  if (!history || history.length < 2) return [];
  return history
    .slice(1)
    .map((price, index) => {
      const previous = history[index];
      return previous > 0 ? (price - previous) / previous : 0;
    })
    .filter((value) => Number.isFinite(value));
}

function transitionMagnitude(
  previous: OccurrenceRow | null,
  current: DiagnosedMarketContext,
): number {
  if (!previous) return 100;

  const numericShift =
    Math.abs(toFiniteNumber(previous.trend_quality) - current.trendQuality) *
      0.16 +
    Math.abs(toFiniteNumber(previous.breadth) - current.breadth) * 0.12 +
    Math.abs(toFiniteNumber(previous.participation) - current.participation) *
      0.1 +
    Math.abs(
      toFiniteNumber(previous.volatility_pressure) -
        current.volatilityPressure,
    ) *
      0.2 +
    Math.abs(toFiniteNumber(previous.regime_confidence) - current.regimeConfidence) *
      0.12 +
    Math.abs(toFiniteNumber(previous.risk_pressure) - current.riskPressure) *
      0.14;
  const regimeShift = previous.regime_state === current.regimeState ? 0 : 18;
  const postureShift =
    previous.allocation_posture === current.allocationPosture ? 0 : 14;

  return Number(clamp(numericShift + regimeShift + postureShift).toFixed(4));
}

function diagnoseRegime(input: MarketContextInput) {
  const history =
    input.history?.length
      ? input.history
      : [input.open, input.high, input.low, input.close ?? input.price]
          .map((value) => toFiniteNumber(value, Number.NaN))
          .filter((value) => Number.isFinite(value));
  const returns = returnsFromHistory(history);
  const first = history[0] ?? input.price;
  const last = history[history.length - 1] ?? input.price;
  const trendPct = first > 0 ? ((last - first) / first) * 100 : 0;
  const rangePct =
    input.high && input.low && last > 0
      ? ((input.high - input.low) / last) * 100
      : Math.abs(input.quote?.changePercent ?? trendPct);
  const volatility = standardDeviation(returns) * 100;
  const volatilityPressure = clamp(volatility * 18 + rangePct * 3);
  const trendQuality = clamp(50 + trendPct * 7 - volatilityPressure * 0.18);
  const breadth = clamp(50 + (input.quote?.changePercent ?? trendPct) * 4);
  const participation = clamp(
    input.volume && input.volume > 0 ? 56 + Math.log10(input.volume) * 4 : 50,
  );
  const riskPressure = clamp(volatilityPressure * 0.75 + (trendPct < 0 ? Math.abs(trendPct) * 4 : 0));
  const regimeState =
    riskPressure >= 76
      ? "PANIC"
      : volatilityPressure >= 68
        ? "HIGH_VOL"
        : trendPct >= 1.2 && trendQuality >= 58
          ? "TRENDING"
          : trendPct <= -1.2
            ? "MEAN_REVERTING"
            : volatilityPressure <= 24
              ? "COMPRESSION"
              : "LOW_VOL";
  const regimeConfidence = clamp(
    Math.abs(trendPct) * 8 +
      Math.abs(volatilityPressure - 50) * 0.55 +
      (input.quote?.signalConfidence ?? 50) * 0.35,
    15,
    99,
  );
  const regimeStability = clamp(100 - volatilityPressure * 0.68 - riskPressure * 0.18);
  const exposureDurability = clamp(
    trendQuality * 0.44 + regimeStability * 0.38 + participation * 0.18,
  );
  const holdingQuality = clamp(
    exposureDurability * 0.64 + (input.quote?.signalReturnPercent ?? 0) * 3,
  );
  const calibration = clamp(
    (input.quote?.confidence ?? input.quote?.signalConfidence ?? regimeConfidence) *
      0.7 +
      regimeStability * 0.3,
  );
  const allocationPosture =
    riskPressure >= 74
      ? "DEFENSIVE"
      : exposureDurability >= 70 && trendQuality >= 62
        ? "EXPANSION"
        : exposureDurability <= 38
          ? "CASH_PRESERVATION"
          : "BALANCED";

  return {
    regimeState,
    regimeConfidence: Number(regimeConfidence.toFixed(4)),
    trendQuality: Number(trendQuality.toFixed(4)),
    breadth: Number(breadth.toFixed(4)),
    participation: Number(participation.toFixed(4)),
    volatilityPressure: Number(volatilityPressure.toFixed(4)),
    regimeStability: Number(regimeStability.toFixed(4)),
    exposureDurability: Number(exposureDurability.toFixed(4)),
    holdingQuality: Number(holdingQuality.toFixed(4)),
    calibration: Number(calibration.toFixed(4)),
    riskPressure: Number(riskPressure.toFixed(4)),
    allocationPosture,
  };
}

function hashState(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function buildStateLabels(
  previous: OccurrenceRow | null,
  context: DiagnosedMarketContext,
): string[] {
  const labels: string[] = [];
  if (!previous) labels.push("initial_state");
  if (previous && previous.regime_state !== context.regimeState) {
    labels.push("regime_changed");
  }
  if (previous && previous.allocation_posture !== context.allocationPosture) {
    labels.push("allocation_posture_changed");
  }
  if (
    previous &&
    Math.abs(toFiniteNumber(previous.breadth) - context.breadth) >= 12
  ) {
    labels.push("breadth_shift");
  }
  if (
    previous &&
    Math.abs(toFiniteNumber(previous.participation) - context.participation) >=
      12
  ) {
    labels.push("participation_shift");
  }
  if (
    previous &&
    Math.abs(
      toFiniteNumber(previous.volatility_pressure) -
        context.volatilityPressure,
    ) >= 10
  ) {
    labels.push("volatility_transition");
  }
  if (
    previous &&
    Math.abs(toFiniteNumber(previous.regime_confidence) - context.regimeConfidence) >=
      15
  ) {
    labels.push("confidence_shift");
  }
  return labels.length ? labels : ["state_hash_changed"];
}

function transitionType(labels: string[]) {
  if (labels.includes("initial_state")) return "initial";
  if (labels.includes("regime_changed")) return "regime_change";
  if (labels.includes("allocation_posture_changed")) return "allocation_change";
  if (labels.includes("volatility_transition")) return "volatility_transition";
  if (labels.includes("breadth_shift")) return "breadth_shift";
  if (labels.includes("participation_shift")) return "participation_shift";
  if (labels.includes("confidence_shift")) return "confidence_shift";
  return "state_hash_change";
}

function quoteToContextInput(
  scope: SignalScope,
  quote: StockQuote,
  origin: OccurrenceOrigin,
  ingestionSource: string,
): MarketContextInput {
  const timestampUtc =
    quote.signalEmittedAt && Number.isFinite(Date.parse(quote.signalEmittedAt))
      ? new Date(quote.signalEmittedAt).toISOString()
      : new Date().toISOString();

  return {
    timestampUtc,
    occurrenceOrigin: origin,
    market: normalizeIdentifierValue(scope.scopeCode, "GLOBAL"),
    venue: scope.scopeType === "market" ? normalizeIdentifierValue(scope.scopeCode, "GLOBAL") : "EXCHANGE",
    asset: normalizeAsset(quote.symbol),
    timeframe: "live",
    price: quote.price,
    high: quote.high52,
    low: quote.low52,
    close: quote.price,
    history: quote.history,
    quote,
    ingestionSource,
    emittedBy: "signal-backend",
  };
}

async function getPreviousOccurrence(input: MarketContextInput) {
  const result = await pool.query<OccurrenceRow>(
    `
      SELECT
        occurrence_id,
        state_hash,
        regime_state,
        allocation_posture,
        trend_quality,
        breadth,
        participation,
        volatility_pressure,
        regime_confidence,
        risk_pressure
      FROM ${MARKET_OCCURRENCES_TABLE}
      WHERE market = $1
        AND venue = $2
        AND asset = $3
        AND timeframe = $4
        AND timestamp_utc <= $5::timestamptz
      ORDER BY timestamp_utc DESC, created_at DESC
      LIMIT 1
    `,
    [
      input.market,
      input.venue,
      input.asset,
      input.timeframe,
      input.timestampUtc,
    ],
  );

  return result.rows[0] ?? null;
}

async function diagnoseContext(
  input: MarketContextInput,
): Promise<DiagnosedMarketContext> {
  const metrics = diagnoseRegime(input);
  const signalAction = input.quote?.signalAction ?? "Hold";
  const setupQualityDistribution = {
    weak: metrics.exposureDurability < 40 ? 1 : 0,
    developing:
      metrics.exposureDurability >= 40 && metrics.exposureDurability < 65
        ? 1
        : 0,
    strong: metrics.exposureDurability >= 65 ? 1 : 0,
  };
  const signalDistribution: Record<TradeSignal, number> = {
    Buy: signalAction === "Buy" ? 1 : 0,
    Hold: signalAction === "Hold" ? 1 : 0,
    Sell: signalAction === "Sell" ? 1 : 0,
  };
  const marketInterpretationLabels = [
    metrics.regimeState.toLowerCase(),
    metrics.allocationPosture.toLowerCase(),
    metrics.riskPressure >= 70 ? "risk_pressure_high" : "risk_pressure_normal",
    metrics.participation >= 60 ? "participation_confirmed" : "participation_muted",
  ];
  const stateHash = hashState({
    market: input.market,
    venue: input.venue,
    asset: input.asset,
    timeframe: input.timeframe,
    regimeState: metrics.regimeState,
    allocationPosture: metrics.allocationPosture,
    trendQuality: Math.round(metrics.trendQuality),
    breadth: Math.round(metrics.breadth),
    participation: Math.round(metrics.participation),
    volatilityPressure: Math.round(metrics.volatilityPressure),
    regimeConfidence: Math.round(metrics.regimeConfidence),
    setupQualityDistribution,
    signalDistribution,
  });
  const previous = await getPreviousOccurrence(input);

  const context: DiagnosedMarketContext = {
    occurrenceId: randomUUID(),
    previousOccurrenceId: previous?.occurrence_id ?? null,
    timestampUtc: input.timestampUtc,
    occurrenceOrigin: input.occurrenceOrigin,
    market: input.market,
    venue: input.venue,
    asset: input.asset,
    timeframe: input.timeframe,
    ...metrics,
    capitalDeployed:
      metrics.allocationPosture === "EXPANSION"
        ? metrics.exposureDurability
        : metrics.allocationPosture === "BALANCED"
          ? metrics.exposureDurability * 0.55
          : metrics.exposureDurability * 0.18,
    availableRiskBudget: clamp(100 - metrics.riskPressure),
    setupQualityDistribution,
    signalDistribution,
    marketInterpretationLabels,
    stateTransitionLabels: [],
    stateHash,
    transitionType: "state_hash_change",
    transitionMagnitude: 0,
    emittedReason: "deterministic_context_state_transition",
    emittedBy: input.emittedBy,
    ingestionSource: input.ingestionSource,
  };

  context.transitionMagnitude = transitionMagnitude(previous, context);
  context.stateTransitionLabels = buildStateLabels(previous, context);
  context.transitionType = transitionType(context.stateTransitionLabels);

  return context;
}

function logContextPersistenceWarning(error: unknown, message: string) {
  if (contextPersistenceWarningLogged) return;
  contextPersistenceWarningLogged = true;
  logger.warn({ err: error }, message);
}

async function tableExists(tableName: string) {
  const result = await pool.query<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [tableName],
  );
  return Boolean(result.rows[0]?.exists);
}

function quoteIdent(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteQualifiedIdentifier(value: string) {
  const parts = value.split(".").map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.length > 2) {
    throw new Error(`Invalid table identifier: ${value}`);
  }
  if (!parts.every((part) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(part))) {
    throw new Error(`Invalid table identifier: ${value}`);
  }
  return parts.map(quoteIdent).join(".");
}

async function addCompatibilityColumnIfTableExists(
  tableName: string,
  columnName: string,
) {
  if (!(await tableExists(tableName))) return;
  await pool.query(
    `ALTER TABLE ${quoteQualifiedIdentifier(tableName)}
     ADD COLUMN IF NOT EXISTS ${quoteIdent(columnName)} UUID`,
  );
}

async function tryEnableTimescale(tableName: string) {
  try {
    const extension = await pool.query<{ available: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') AS available",
    );
    if (!extension.rows[0]?.available) return;
    await pool.query("CREATE EXTENSION IF NOT EXISTS timescaledb");
    await pool.query(
      "SELECT create_hypertable($1::regclass, 'timestamp_utc', if_not_exists => TRUE)",
      [tableName],
    );
  } catch (error) {
    logger.warn(
      { err: error, tableName },
      "TimescaleDB optimization unavailable; using standard PostgreSQL indexes",
    );
  }
}

export async function ensureMarketContextSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${MARKET_OCCURRENCES_TABLE} (
          occurrence_id UUID PRIMARY KEY,
          previous_occurrence_id UUID,
          timestamp_utc TIMESTAMPTZ NOT NULL,
          occurrence_origin TEXT NOT NULL CHECK (occurrence_origin IN ('historical_backfill', 'live_runtime')),
          market TEXT NOT NULL,
          venue TEXT NOT NULL,
          asset TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          regime_state TEXT NOT NULL,
          regime_confidence DOUBLE PRECISION NOT NULL,
          trend_quality DOUBLE PRECISION NOT NULL,
          breadth DOUBLE PRECISION NOT NULL,
          participation DOUBLE PRECISION NOT NULL,
          volatility_pressure DOUBLE PRECISION NOT NULL,
          regime_stability DOUBLE PRECISION NOT NULL,
          exposure_durability DOUBLE PRECISION NOT NULL,
          holding_quality DOUBLE PRECISION NOT NULL,
          calibration DOUBLE PRECISION NOT NULL,
          risk_pressure DOUBLE PRECISION NOT NULL,
          allocation_posture TEXT NOT NULL,
          capital_deployed DOUBLE PRECISION NOT NULL,
          available_risk_budget DOUBLE PRECISION NOT NULL,
          setup_quality_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
          signal_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
          market_interpretation_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
          state_transition_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
          state_hash TEXT NOT NULL,
          transition_type TEXT NOT NULL,
          transition_magnitude DOUBLE PRECISION NOT NULL,
          emitted_reason TEXT NOT NULL,
          emitted_by TEXT NOT NULL,
          ingestion_source TEXT NOT NULL,
          trade_id TEXT,
          execution_id TEXT,
          signal_id TEXT,
          portfolio_action_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT ${MARKET_OCCURRENCES_TABLE}_previous_fk
            FOREIGN KEY (previous_occurrence_id)
            REFERENCES ${MARKET_OCCURRENCES_TABLE}(occurrence_id)
        )
      `);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ${MARKET_OCCURRENCES_TABLE}_idempotency_uidx
        ON ${MARKET_OCCURRENCES_TABLE} (
          timestamp_utc,
          market,
          venue,
          asset,
          timeframe,
          state_hash
        )
      `);

      for (const column of [
        "timestamp_utc",
        "asset",
        "market",
        "venue",
        "timeframe",
        "regime_state",
        "transition_type",
        "occurrence_origin",
        "state_hash",
      ]) {
        await pool.query(`
          CREATE INDEX IF NOT EXISTS ${MARKET_OCCURRENCES_TABLE}_${column}_idx
          ON ${MARKET_OCCURRENCES_TABLE} (${column})
        `);
      }

      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${MARKET_OCCURRENCES_TABLE}_timestamp_brin_idx
        ON ${MARKET_OCCURRENCES_TABLE} USING BRIN (timestamp_utc)
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${MARKET_STATE_SNAPSHOTS_TABLE} (
          snapshot_id UUID PRIMARY KEY,
          occurrence_id UUID NOT NULL REFERENCES ${MARKET_OCCURRENCES_TABLE}(occurrence_id),
          timestamp_utc TIMESTAMPTZ NOT NULL,
          market TEXT NOT NULL,
          venue TEXT NOT NULL,
          asset TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          state_hash TEXT NOT NULL,
          context_payload JSONB NOT NULL,
          ingestion_source TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (occurrence_id)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SIGNAL_OCCURRENCES_TABLE} (
          signal_occurrence_id UUID PRIMARY KEY,
          occurrence_id UUID NOT NULL REFERENCES ${MARKET_OCCURRENCES_TABLE}(occurrence_id),
          signal_id TEXT,
          trade_id TEXT,
          execution_id TEXT,
          portfolio_action_id TEXT,
          timestamp_utc TIMESTAMPTZ NOT NULL,
          market TEXT NOT NULL,
          venue TEXT NOT NULL,
          asset TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          signal_action TEXT,
          signal_confidence DOUBLE PRECISION,
          signal_source TEXT,
          signal_entry_price DOUBLE PRECISION,
          signal_return_percent DOUBLE PRECISION,
          signal_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          occurrence_origin TEXT NOT NULL CHECK (occurrence_origin IN ('historical_backfill', 'live_runtime')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (occurrence_id, signal_id)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${REGIME_TRANSITIONS_TABLE} (
          regime_transition_id UUID PRIMARY KEY,
          occurrence_id UUID NOT NULL REFERENCES ${MARKET_OCCURRENCES_TABLE}(occurrence_id),
          previous_occurrence_id UUID,
          timestamp_utc TIMESTAMPTZ NOT NULL,
          market TEXT NOT NULL,
          venue TEXT NOT NULL,
          asset TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          from_regime_state TEXT,
          to_regime_state TEXT NOT NULL,
          transition_type TEXT NOT NULL,
          transition_magnitude DOUBLE PRECISION NOT NULL,
          state_transition_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
          occurrence_origin TEXT NOT NULL CHECK (occurrence_origin IN ('historical_backfill', 'live_runtime')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (occurrence_id)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${ALLOCATION_STATE_OCCURRENCES_TABLE} (
          allocation_occurrence_id UUID PRIMARY KEY,
          occurrence_id UUID NOT NULL REFERENCES ${MARKET_OCCURRENCES_TABLE}(occurrence_id),
          timestamp_utc TIMESTAMPTZ NOT NULL,
          market TEXT NOT NULL,
          venue TEXT NOT NULL,
          asset TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          allocation_posture TEXT NOT NULL,
          capital_deployed DOUBLE PRECISION NOT NULL,
          available_risk_budget DOUBLE PRECISION NOT NULL,
          setup_quality_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
          signal_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
          occurrence_origin TEXT NOT NULL CHECK (occurrence_origin IN ('historical_backfill', 'live_runtime')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (occurrence_id)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${HISTORICAL_REPLAY_JOBS_TABLE} (
          job_id UUID PRIMARY KEY,
          status TEXT NOT NULL,
          candle_table TEXT NOT NULL,
          market TEXT,
          venue TEXT,
          asset TEXT,
          timeframe TEXT,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ,
          processed_rows BIGINT NOT NULL DEFAULT 0,
          emitted_occurrences BIGINT NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${HISTORICAL_REPLAY_CHECKPOINTS_TABLE} (
          checkpoint_id UUID PRIMARY KEY,
          job_id UUID NOT NULL REFERENCES ${HISTORICAL_REPLAY_JOBS_TABLE}(job_id),
          candle_table TEXT NOT NULL,
          market TEXT,
          venue TEXT,
          asset TEXT,
          timeframe TEXT,
          last_timestamp_utc TIMESTAMPTZ,
          last_market TEXT,
          last_venue TEXT,
          last_asset TEXT,
          last_timeframe TEXT,
          processed_rows BIGINT NOT NULL DEFAULT 0,
          emitted_occurrences BIGINT NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (job_id)
        )
      `);

      for (const tableName of [
        MARKET_STATE_SNAPSHOTS_TABLE,
        SIGNAL_OCCURRENCES_TABLE,
        REGIME_TRANSITIONS_TABLE,
        ALLOCATION_STATE_OCCURRENCES_TABLE,
      ]) {
        await pool.query(`
          CREATE INDEX IF NOT EXISTS ${tableName}_timestamp_idx
          ON ${tableName} (timestamp_utc)
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS ${tableName}_asset_idx
          ON ${tableName} (asset)
        `);
      }

      await addCompatibilityColumnIfTableExists("trades", "market_occurrence_id");
      await addCompatibilityColumnIfTableExists("executions", "market_occurrence_id");
      await addCompatibilityColumnIfTableExists("executions", "signal_occurrence_id");
      await addCompatibilityColumnIfTableExists("positions", "market_occurrence_id");
      await addCompatibilityColumnIfTableExists("portfolio_activity", "market_occurrence_id");
      await addCompatibilityColumnIfTableExists("portfolio_actions", "market_occurrence_id");
      await addCompatibilityColumnIfTableExists("signals", "market_occurrence_id");

      await tryEnableTimescale(MARKET_OCCURRENCES_TABLE);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  await schemaReady;
}

async function insertDiagnosedContext(context: DiagnosedMarketContext) {
  await ensureMarketContextSchema();
  const result = await pool.query<{ occurrence_id: string }>(
    `
      INSERT INTO ${MARKET_OCCURRENCES_TABLE} (
        occurrence_id,
        previous_occurrence_id,
        timestamp_utc,
        occurrence_origin,
        market,
        venue,
        asset,
        timeframe,
        regime_state,
        regime_confidence,
        trend_quality,
        breadth,
        participation,
        volatility_pressure,
        regime_stability,
        exposure_durability,
        holding_quality,
        calibration,
        risk_pressure,
        allocation_posture,
        capital_deployed,
        available_risk_budget,
        setup_quality_distribution,
        signal_distribution,
        market_interpretation_labels,
        state_transition_labels,
        state_hash,
        transition_type,
        transition_magnitude,
        emitted_reason,
        emitted_by,
        ingestion_source,
        signal_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23::jsonb,
        $24::jsonb, $25::jsonb, $26::jsonb, $27, $28,
        $29, $30, $31, $32, $33
      )
      ON CONFLICT (
        timestamp_utc,
        market,
        venue,
        asset,
        timeframe,
        state_hash
      )
      DO NOTHING
      RETURNING occurrence_id
    `,
    [
      context.occurrenceId,
      context.previousOccurrenceId,
      context.timestampUtc,
      context.occurrenceOrigin,
      context.market,
      context.venue,
      context.asset,
      context.timeframe,
      context.regimeState,
      context.regimeConfidence,
      context.trendQuality,
      context.breadth,
      context.participation,
      context.volatilityPressure,
      context.regimeStability,
      context.exposureDurability,
      context.holdingQuality,
      context.calibration,
      context.riskPressure,
      context.allocationPosture,
      context.capitalDeployed,
      context.availableRiskBudget,
      JSON.stringify(context.setupQualityDistribution),
      JSON.stringify(context.signalDistribution),
      JSON.stringify(context.marketInterpretationLabels),
      JSON.stringify(context.stateTransitionLabels),
      context.stateHash,
      context.transitionType,
      context.transitionMagnitude,
      context.emittedReason,
      context.emittedBy,
      context.ingestionSource,
      context.signalId ?? null,
    ],
  );

  return result.rows[0]?.occurrence_id ?? null;
}

async function insertOccurrenceDetailRows(context: DiagnosedMarketContext) {
  await pool.query(
    `
      INSERT INTO ${MARKET_STATE_SNAPSHOTS_TABLE} (
        snapshot_id,
        occurrence_id,
        timestamp_utc,
        market,
        venue,
        asset,
        timeframe,
        state_hash,
        context_payload,
        ingestion_source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
      ON CONFLICT (occurrence_id) DO NOTHING
    `,
    [
      randomUUID(),
      context.occurrenceId,
      context.timestampUtc,
      context.market,
      context.venue,
      context.asset,
      context.timeframe,
      context.stateHash,
      JSON.stringify(context),
      context.ingestionSource,
    ],
  );

  await pool.query(
    `
      INSERT INTO ${REGIME_TRANSITIONS_TABLE} (
        regime_transition_id,
        occurrence_id,
        previous_occurrence_id,
        timestamp_utc,
        market,
        venue,
        asset,
        timeframe,
        from_regime_state,
        to_regime_state,
        transition_type,
        transition_magnitude,
        state_transition_labels,
        occurrence_origin
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10, $11, $12::jsonb, $13)
      ON CONFLICT (occurrence_id) DO NOTHING
    `,
    [
      randomUUID(),
      context.occurrenceId,
      context.previousOccurrenceId,
      context.timestampUtc,
      context.market,
      context.venue,
      context.asset,
      context.timeframe,
      context.regimeState,
      context.transitionType,
      context.transitionMagnitude,
      JSON.stringify(context.stateTransitionLabels),
      context.occurrenceOrigin,
    ],
  );

  await pool.query(
    `
      INSERT INTO ${ALLOCATION_STATE_OCCURRENCES_TABLE} (
        allocation_occurrence_id,
        occurrence_id,
        timestamp_utc,
        market,
        venue,
        asset,
        timeframe,
        allocation_posture,
        capital_deployed,
        available_risk_budget,
        setup_quality_distribution,
        signal_distribution,
        occurrence_origin
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13)
      ON CONFLICT (occurrence_id) DO NOTHING
    `,
    [
      randomUUID(),
      context.occurrenceId,
      context.timestampUtc,
      context.market,
      context.venue,
      context.asset,
      context.timeframe,
      context.allocationPosture,
      context.capitalDeployed,
      context.availableRiskBudget,
      JSON.stringify(context.setupQualityDistribution),
      JSON.stringify(context.signalDistribution),
      context.occurrenceOrigin,
    ],
  );
}

async function insertSignalOccurrence(
  context: DiagnosedMarketContext,
  quote?: StockQuote,
) {
  if (!quote?.signalAction) return;
  const signalId =
    context.signalId ??
    hashState({
      asset: context.asset,
      action: quote.signalAction,
      emittedAt: quote.signalEmittedAt ?? context.timestampUtc,
      entryPrice: quote.signalEntryPrice ?? null,
    });

  await pool.query(
    `
      INSERT INTO ${SIGNAL_OCCURRENCES_TABLE} (
        signal_occurrence_id,
        occurrence_id,
        signal_id,
        timestamp_utc,
        market,
        venue,
        asset,
        timeframe,
        signal_action,
        signal_confidence,
        signal_source,
        signal_entry_price,
        signal_return_percent,
        signal_payload,
        occurrence_origin
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15)
      ON CONFLICT (occurrence_id, signal_id) DO NOTHING
    `,
    [
      randomUUID(),
      context.occurrenceId,
      signalId,
      context.timestampUtc,
      context.market,
      context.venue,
      context.asset,
      context.timeframe,
      quote.signalAction,
      quote.signalConfidence ?? null,
      quote.signalSource ?? null,
      quote.signalEntryPrice ?? null,
      quote.signalReturnPercent ?? null,
      JSON.stringify(quote),
      context.occurrenceOrigin,
    ],
  );
}

export async function appendMarketContextOccurrence(
  input: MarketContextInput,
): Promise<string | null> {
  await ensureMarketContextSchema();
  const context = await diagnoseContext(input);
  const insertedOccurrenceId = await insertDiagnosedContext(context);

  if (!insertedOccurrenceId) {
    return null;
  }

  await insertOccurrenceDetailRows(context);
  await insertSignalOccurrence(context, input.quote);
  return insertedOccurrenceId;
}

export async function appendLiveMarketContextOccurrences(
  scope: SignalScope,
  quotes: StockQuote[],
  ingestionSource: string,
): Promise<number> {
  let emitted = 0;
  for (const quote of quotes) {
    try {
      const occurrenceId = await appendMarketContextOccurrence(
        quoteToContextInput(scope, quote, "live_runtime", ingestionSource),
      );
      if (occurrenceId) emitted += 1;
    } catch (error) {
      logContextPersistenceWarning(
        error,
        "Market context persistence unavailable; continuing signal storage",
      );
    }
  }
  return emitted;
}

async function availableColumns(tableName: string) {
  const parts = tableName.split(".");
  const table = parts[parts.length - 1];
  const schema = parts.length === 2 ? parts[0] : "public";
  const result = await pool.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
    `,
    [schema, table],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

function firstColumn(columns: Set<string>, candidates: string[]) {
  return candidates.find((candidate) => columns.has(candidate)) ?? null;
}

function replayRowToInput(
  row: ReplaySourceRow,
  request: ContextReplayRequest,
): MarketContextInput {
  const close = toFiniteNumber(row.close, 0);
  const market = normalizeIdentifierValue(
    String(row.market ?? request.market ?? ""),
    "GLOBAL",
  );
  const venue = normalizeIdentifierValue(
    String(row.venue ?? request.venue ?? market),
    market,
  );
  return {
    timestampUtc:
      row.timestamp_utc instanceof Date
        ? row.timestamp_utc.toISOString()
        : new Date(row.timestamp_utc).toISOString(),
    occurrenceOrigin: request.origin ?? "historical_backfill",
    market,
    venue,
    asset: normalizeAsset(String(row.asset ?? request.asset ?? "")),
    timeframe: normalizeIdentifierValue(
      String(row.timeframe ?? request.timeframe ?? "1D"),
      "1D",
    ),
    price: close,
    open: toFiniteNumber(row.open, close),
    high: toFiniteNumber(row.high, close),
    low: toFiniteNumber(row.low, close),
    close,
    volume: toFiniteNumber(row.volume, 0),
    history: [
      toFiniteNumber(row.open, close),
      toFiniteNumber(row.high, close),
      toFiniteNumber(row.low, close),
      close,
    ],
    ingestionSource: request.ingestionSource ?? "postgres_historical_replay",
    emittedBy: "historical-replay-engine",
  };
}

export async function replayHistoricalMarketContext(
  request: ContextReplayRequest = {},
): Promise<ContextReplayResult> {
  await ensureMarketContextSchema();
  const candleTable = request.candleTable ?? DEFAULT_CANDLE_TABLE;
  const quotedTable = quoteQualifiedIdentifier(candleTable);
  const jobId = randomUUID();

  if (!(await tableExists(candleTable))) {
    return {
      jobId,
      status: "skipped",
      processedRows: 0,
      emittedOccurrences: 0,
      message: `Replay source table ${candleTable} was not found in the existing database.`,
    };
  }

  const columns = await availableColumns(candleTable);
  const timestampColumn = firstColumn(columns, [
    "timestamp_utc",
    "timestamp",
    "time",
    "occurred_at",
    "date",
  ]);
  const assetColumn = firstColumn(columns, ["asset", "symbol", "ticker"]);
  const marketColumn = firstColumn(columns, ["market", "exchange", "scope_code"]);
  const venueColumn = firstColumn(columns, ["venue", "exchange", "market"]);
  const timeframeColumn = firstColumn(columns, ["timeframe", "interval"]);
  const openColumn = firstColumn(columns, ["open", "open_price"]);
  const highColumn = firstColumn(columns, ["high", "high_price"]);
  const lowColumn = firstColumn(columns, ["low", "low_price"]);
  const closeColumn = firstColumn(columns, ["close", "close_price", "price"]);
  const volumeColumn = firstColumn(columns, ["volume", "base_volume"]);

  if (!timestampColumn || !assetColumn || !closeColumn) {
    return {
      jobId,
      status: "skipped",
      processedRows: 0,
      emittedOccurrences: 0,
      message: `Replay source ${candleTable} needs timestamp, asset/symbol, and close/price columns.`,
    };
  }

  await pool.query(
    `
      INSERT INTO ${HISTORICAL_REPLAY_JOBS_TABLE} (
        job_id,
        status,
        candle_table,
        market,
        venue,
        asset,
        timeframe
      ) VALUES ($1, 'running', $2, $3, $4, $5, $6)
    `,
    [
      jobId,
      candleTable,
      request.market ?? null,
      request.venue ?? null,
      request.asset ?? null,
      request.timeframe ?? null,
    ],
  );

  let processedRows = 0;
  let emittedOccurrences = 0;
  let lastTimestamp: string | null = null;
  let lastMarket = "";
  let lastVenue = "";
  let lastAsset = "";
  let lastTimeframe = "";
  const batchSize = Math.min(
    Math.max(Math.floor(request.batchSize ?? DEFAULT_REPLAY_BATCH_SIZE), 1),
    10_000,
  );
  const filters: string[] = [];
  const params: unknown[] = [];

  function addFilter(column: string | null, value: string | undefined) {
    if (!column || !value) return;
    params.push(value.toUpperCase());
    filters.push(`UPPER(${quoteIdent(column)}::text) = $${params.length}`);
  }

  addFilter(marketColumn, request.market);
  addFilter(venueColumn, request.venue);
  addFilter(assetColumn, request.asset);
  addFilter(timeframeColumn, request.timeframe);

  const marketOrderExpression = marketColumn
    ? `COALESCE(${quoteIdent(marketColumn)}::text, '')`
    : "''";
  const venueOrderExpression = venueColumn
    ? `COALESCE(${quoteIdent(venueColumn)}::text, '')`
    : "''";
  const timeframeOrderExpression = timeframeColumn
    ? `COALESCE(${quoteIdent(timeframeColumn)}::text, '')`
    : "''";

  try {
    while (true) {
      const cursorParams = [...params];
      const cursorFilters = [...filters];
      if (lastTimestamp) {
        cursorParams.push(
          lastTimestamp,
          lastTimestamp,
          lastMarket,
          lastVenue,
          lastAsset,
          lastTimeframe,
        );
        cursorFilters.push(
          `(
            ${quoteIdent(timestampColumn)} > $${cursorParams.length - 5}::timestamptz
            OR (
              ${quoteIdent(timestampColumn)} = $${cursorParams.length - 4}::timestamptz
              AND (
                ${marketOrderExpression},
                ${venueOrderExpression},
                ${quoteIdent(assetColumn)}::text,
                ${timeframeOrderExpression}
              ) > (
                $${cursorParams.length - 3},
                $${cursorParams.length - 2},
                $${cursorParams.length - 1},
                $${cursorParams.length}
              )
            )
          )`,
        );
      }

      cursorParams.push(batchSize);
      const limitParam = cursorParams.length;
      const whereClause = cursorFilters.length
        ? `WHERE ${cursorFilters.join(" AND ")}`
        : "";

      const result = await pool.query<ReplaySourceRow>(
        `
          SELECT
            ${quoteIdent(timestampColumn)} AS timestamp_utc,
            ${marketColumn ? quoteIdent(marketColumn) : "NULL"} AS market,
            ${venueColumn ? quoteIdent(venueColumn) : "NULL"} AS venue,
            ${quoteIdent(assetColumn)} AS asset,
            ${timeframeColumn ? quoteIdent(timeframeColumn) : "NULL"} AS timeframe,
            ${openColumn ? quoteIdent(openColumn) : "NULL"} AS open,
            ${highColumn ? quoteIdent(highColumn) : "NULL"} AS high,
            ${lowColumn ? quoteIdent(lowColumn) : "NULL"} AS low,
            ${quoteIdent(closeColumn)} AS close,
            ${volumeColumn ? quoteIdent(volumeColumn) : "NULL"} AS volume
          FROM ${quotedTable}
          ${whereClause}
          ORDER BY
            ${quoteIdent(timestampColumn)} ASC,
            ${marketOrderExpression} ASC,
            ${venueOrderExpression} ASC,
            ${quoteIdent(assetColumn)}::text ASC,
            ${timeframeOrderExpression} ASC
          LIMIT $${limitParam}
        `,
        cursorParams,
      );

      if (!result.rows.length) break;

      for (const row of result.rows) {
        processedRows += 1;
        const occurrenceId = await appendMarketContextOccurrence(
          replayRowToInput(row, request),
        );
        if (occurrenceId) emittedOccurrences += 1;
        lastTimestamp =
          row.timestamp_utc instanceof Date
            ? row.timestamp_utc.toISOString()
            : new Date(row.timestamp_utc).toISOString();
        lastMarket = String(row.market ?? "");
        lastVenue = String(row.venue ?? "");
        lastAsset = String(row.asset ?? "");
        lastTimeframe = String(row.timeframe ?? "");
      }

      await pool.query(
        `
          INSERT INTO ${HISTORICAL_REPLAY_CHECKPOINTS_TABLE} (
            checkpoint_id,
            job_id,
            candle_table,
            market,
            venue,
            asset,
            timeframe,
            last_timestamp_utc,
            last_market,
            last_venue,
            last_asset,
            last_timeframe,
            processed_rows,
            emitted_occurrences,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
          ON CONFLICT (job_id)
          DO UPDATE SET
            last_timestamp_utc = EXCLUDED.last_timestamp_utc,
            last_market = EXCLUDED.last_market,
            last_venue = EXCLUDED.last_venue,
            last_asset = EXCLUDED.last_asset,
            last_timeframe = EXCLUDED.last_timeframe,
            processed_rows = EXCLUDED.processed_rows,
            emitted_occurrences = EXCLUDED.emitted_occurrences,
            updated_at = NOW()
        `,
        [
          randomUUID(),
          jobId,
          candleTable,
          request.market ?? null,
          request.venue ?? null,
          request.asset ?? null,
          request.timeframe ?? null,
          lastTimestamp,
          lastMarket,
          lastVenue,
          lastAsset,
          lastTimeframe,
          processedRows,
          emittedOccurrences,
        ],
      );

      if (result.rows.length < batchSize) break;
    }

    await pool.query(
      `
        UPDATE ${HISTORICAL_REPLAY_JOBS_TABLE}
        SET
          status = 'completed',
          completed_at = NOW(),
          processed_rows = $2,
          emitted_occurrences = $3
        WHERE job_id = $1
      `,
      [jobId, processedRows, emittedOccurrences],
    );

    return {
      jobId,
      status: "completed",
      processedRows,
      emittedOccurrences,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Replay failed";
    await pool.query(
      `
        UPDATE ${HISTORICAL_REPLAY_JOBS_TABLE}
        SET
          status = 'failed',
          completed_at = NOW(),
          processed_rows = $2,
          emitted_occurrences = $3,
          last_error = $4
        WHERE job_id = $1
      `,
      [jobId, processedRows, emittedOccurrences, message],
    );
    throw error;
  }
}
