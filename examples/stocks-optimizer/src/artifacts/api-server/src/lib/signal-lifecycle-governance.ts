import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import {
  calculateEvaluationMetrics,
  evaluatePromotionGates,
  evaluateRetirementRules,
  isAllowedTransition,
  loadModelLifecycleConfig,
  type EvaluationMetrics,
  type ModelLifecycleState,
} from "./model-lifecycle";
import {
  type SignalDecision,
  type SignalTrainingState,
} from "./signal-training";
import { logger } from "./logger";

type LifecycleAction = "Awaiting Decision" | "Careful" | "Trusted" | "Disregard";

export interface SignalLifecycleDecision {
  modelId: string;
  modelLifecycleState: ModelLifecycleState;
  modelLifecycleAction: LifecycleAction;
  modelLifecycleReason: string;
  modelCanOpenNewTrades: boolean;
  modelAllocationMultiplier: number;
  modelMetrics?: EvaluationMetrics;
}

export interface GovernSignalDecisionInput {
  market: string;
  symbol: string;
  currentPrice: number;
  signal: SignalDecision;
  previousState: SignalTrainingState;
}

export type ModelRow = {
  model_id: string;
  parent_model_id: string | null;
  training_window_start: string | Date;
  training_window_end: string | Date;
  validation_window_start: string | Date;
  validation_window_end: string | Date;
  regime_scope: string;
  feature_hash: string;
  parameter_hash: string;
  objective_function: string;
  number_of_tested_variants: number;
  lifecycle_state: ModelLifecycleState;
  registered_at: string | Date;
  updated_at: string | Date;
};

type AuditRow = {
  audit_id: number;
  model_id: string;
  timestamp: string | Date;
  old_state: ModelLifecycleState;
  new_state: ModelLifecycleState;
  metrics_snapshot: EvaluationMetrics;
  reason: string;
};

const MODEL_REGISTRY_TABLE = "stock_model_registry";
const MODEL_AUDIT_TABLE = "stock_model_lifecycle_audit";
const MODEL_FEEDBACK_TABLE = "stock_model_feedback_events";
const LIVE_STATES = new Set<ModelLifecycleState>([
  "SMALL_LIVE",
  "PRODUCTION",
  "REDUCED",
]);
const NO_TRADE_STATES = new Set<ModelLifecycleState>([
  "RESEARCH",
  "CANDIDATE",
  "SHADOW",
  "WATCHLIST",
  "RETIRED",
]);
const MIN_LIFECYCLE_SAMPLE = Number(
  process.env.STOCK_MODEL_LIFECYCLE_MIN_SAMPLE ?? 30,
);
const PRODUCTION_PROMOTION_SAMPLE = Number(
  process.env.STOCK_MODEL_LIFECYCLE_PRODUCTION_SAMPLE ?? 200,
);
const FEEDBACK_SAMPLE_LIMIT = Number(
  process.env.STOCK_MODEL_LIFECYCLE_FEEDBACK_LIMIT ?? 500,
);
const RISK_UNIT_PERCENT = Number(
  process.env.STOCK_MODEL_LIFECYCLE_RISK_UNIT_PERCENT ?? 1,
);
const COST_R_PER_TRADE = Number(
  process.env.STOCK_MODEL_LIFECYCLE_COST_R_PER_TRADE ?? 0.01,
);
const SLIPPAGE_R_PER_TRADE = Number(
  process.env.STOCK_MODEL_LIFECYCLE_SLIPPAGE_R_PER_TRADE ?? 0.03,
);
const BASELINE_BACKTEST_EXPECTANCY_R = Number(
  process.env.STOCK_MODEL_LIFECYCLE_BASELINE_BACKTEST_EXPECTANCY_R ?? 0.08,
);
const ZERO_METRICS: EvaluationMetrics = {
  expectancy_r: 0,
  rolling_expectancy_r: 0,
  profit_factor_after_costs: 0,
  max_drawdown: 0,
  average_winner_r: 0,
  average_loser_r: 0,
  top_1_profit_dependency: 0,
  top_3_profit_dependency: 0,
  result_without_top_1: 0,
  result_without_top_3: 0,
  slippage_sensitivity: 0,
  live_vs_backtest_decay: 0,
};

let schemaReady: Promise<void> | null = null;
let warningLogged = false;

export async function governSignalDecision(
  input: GovernSignalDecisionInput,
): Promise<SignalLifecycleDecision> {
  try {
    await ensureLifecycleSchema();
    const model = await ensureRuntimeModel(input.market);
    await recordClosedSignalOutcome(model.model_id, input);
    const tradeResults = await loadTradeResultsR(model.model_id);
    const metrics = calculateEvaluationMetrics({
      trade_results_r: tradeResults,
      rolling_window: 30,
      costs_r_per_trade: COST_R_PER_TRADE,
      slippage_r_per_trade: SLIPPAGE_R_PER_TRADE,
      live_expectancy_r: tradeResults.length ? undefined : 0,
      backtest_expectancy_r: BASELINE_BACKTEST_EXPECTANCY_R,
    });
    const transitioned = await applyLifecycleGates(model, metrics, tradeResults.length);
    return buildLifecycleDecision(transitioned, metrics, tradeResults.length);
  } catch (error) {
    logLifecycleWarning(error);
    return fallbackDecision(input.market);
  }
}

export function applyLifecycleToSignal<T extends SignalDecision>(
  signal: T,
  lifecycle: SignalLifecycleDecision,
): T {
  if (NO_TRADE_STATES.has(lifecycle.modelLifecycleState)) {
    return {
      ...signal,
      signalAction: "Hold",
      signalConfidence: Math.min(signal.signalConfidence, 25),
    };
  }

  if (lifecycle.modelLifecycleState === "REDUCED") {
    return {
      ...signal,
      signalConfidence: Math.max(15, Math.round(signal.signalConfidence * 0.65)),
    };
  }

  if (lifecycle.modelLifecycleState === "SMALL_LIVE") {
    return {
      ...signal,
      signalConfidence: Math.max(15, Math.round(signal.signalConfidence * 0.85)),
    };
  }

  return signal;
}

export async function listSignalLifecycleModels(): Promise<ModelRow[]> {
  await ensureLifecycleSchema();
  const result = await pool.query<ModelRow>(`
    SELECT *
    FROM ${MODEL_REGISTRY_TABLE}
    ORDER BY updated_at DESC, model_id ASC
  `);
  return result.rows;
}

export async function getSignalLifecycleAuditLog(modelId?: string) {
  await ensureLifecycleSchema();
  const params: string[] = [];
  const where = modelId ? "WHERE model_id = $1" : "";
  if (modelId) params.push(modelId);
  const result = await pool.query<AuditRow>(
    `
      SELECT *
      FROM ${MODEL_AUDIT_TABLE}
      ${where}
      ORDER BY timestamp DESC, audit_id DESC
      LIMIT 200
    `,
    params,
  );
  return result.rows;
}

export async function createSignalLifecycleCandidateVersions(input: {
  market: string;
  parentModelId?: string;
  reason?: string;
}): Promise<ModelRow[]> {
  await ensureLifecycleSchema();
  const normalizedMarket = normalizeScope(input.market);
  const parents = input.parentModelId
    ? await loadModelParentsById(input.parentModelId)
    : await loadModelParentsByMarket(normalizedMarket);
  const parentModels = parents.length
    ? parents
    : [await ensureBaselineModel(normalizedMarket)];
  const created: ModelRow[] = [];

  for (const parent of parentModels) {
    created.push(
      await createCandidateForParent(
        parent,
        input.reason ?? "Created candidate version from lifecycle console",
      ),
    );
  }

  return created;
}

async function ensureLifecycleSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${MODEL_REGISTRY_TABLE} (
          model_id TEXT PRIMARY KEY,
          parent_model_id TEXT,
          training_window_start TIMESTAMPTZ NOT NULL,
          training_window_end TIMESTAMPTZ NOT NULL,
          validation_window_start TIMESTAMPTZ NOT NULL,
          validation_window_end TIMESTAMPTZ NOT NULL,
          regime_scope TEXT NOT NULL,
          feature_hash TEXT NOT NULL,
          parameter_hash TEXT NOT NULL,
          objective_function TEXT NOT NULL,
          number_of_tested_variants INTEGER NOT NULL DEFAULT 1,
          lifecycle_state TEXT NOT NULL,
          registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        ALTER TABLE ${MODEL_REGISTRY_TABLE}
        ADD COLUMN IF NOT EXISTS parent_model_id TEXT,
        ADD COLUMN IF NOT EXISTS training_window_start TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS training_window_end TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS validation_window_start TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS validation_window_end TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS regime_scope TEXT,
        ADD COLUMN IF NOT EXISTS feature_hash TEXT,
        ADD COLUMN IF NOT EXISTS parameter_hash TEXT,
        ADD COLUMN IF NOT EXISTS objective_function TEXT,
        ADD COLUMN IF NOT EXISTS number_of_tested_variants INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS lifecycle_state TEXT,
        ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      `);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ${MODEL_REGISTRY_TABLE}_model_id_uidx
        ON ${MODEL_REGISTRY_TABLE} (model_id)
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${MODEL_AUDIT_TABLE} (
          audit_id BIGSERIAL PRIMARY KEY,
          model_id TEXT NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          old_state TEXT NOT NULL,
          new_state TEXT NOT NULL,
          metrics_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
          reason TEXT NOT NULL
        )
      `);

      await pool.query(`
        ALTER TABLE ${MODEL_AUDIT_TABLE}
        ADD COLUMN IF NOT EXISTS model_id TEXT,
        ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS old_state TEXT,
        ADD COLUMN IF NOT EXISTS new_state TEXT,
        ADD COLUMN IF NOT EXISTS metrics_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS reason TEXT
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${MODEL_FEEDBACK_TABLE} (
          model_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          signal_action TEXT NOT NULL,
          signal_emitted_at TIMESTAMPTZ NOT NULL,
          signal_entry_price DOUBLE PRECISION NOT NULL,
          observed_price DOUBLE PRECISION NOT NULL,
          observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          return_percent DOUBLE PRECISION NOT NULL,
          result_r DOUBLE PRECISION NOT NULL,
          PRIMARY KEY (model_id, symbol, signal_emitted_at)
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${MODEL_FEEDBACK_TABLE}_model_observed_idx
        ON ${MODEL_FEEDBACK_TABLE} (model_id, observed_at DESC)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${MODEL_AUDIT_TABLE}_model_timestamp_idx
        ON ${MODEL_AUDIT_TABLE} (model_id, timestamp DESC)
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  await schemaReady;
}

async function ensureRuntimeModel(market: string): Promise<ModelRow> {
  const normalizedMarket = normalizeScope(market);
  await ensureBaselineModel(normalizedMarket);

  const active = await loadPreferredRuntimeModel(normalizedMarket);
  if (active) return active;

  const baseline = await loadModelById(`stock-signal:${normalizedMarket}:baseline`);
  if (!baseline) {
    throw new Error(`Lifecycle model for ${normalizedMarket} could not be loaded`);
  }
  return baseline;
}

async function ensureBaselineModel(normalizedMarket: string): Promise<ModelRow> {
  const now = new Date();
  const validationStart = new Date(now.getTime() - 30 * 86_400_000);
  const trainingStart = new Date(now.getTime() - 120 * 86_400_000);
  const trainingEnd = new Date(now.getTime() - 30 * 86_400_000);
  const modelId = `stock-signal:${normalizedMarket}:baseline`;
  const featureHash = stableHash(`features:v1:${normalizedMarket}`);
  const parameterHash = stableHash(`parameters:v1:${normalizedMarket}`);

  await pool.query(
    `
      INSERT INTO ${MODEL_REGISTRY_TABLE} (
        model_id,
        parent_model_id,
        training_window_start,
        training_window_end,
        validation_window_start,
        validation_window_end,
        regime_scope,
        feature_hash,
        parameter_hash,
        objective_function,
        number_of_tested_variants,
        lifecycle_state,
        registered_at,
        updated_at
      )
      VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, 1, 'SMALL_LIVE', NOW(), NOW())
      ON CONFLICT (model_id) DO NOTHING
    `,
    [
      modelId,
      trainingStart.toISOString(),
      trainingEnd.toISOString(),
      validationStart.toISOString(),
      now.toISOString(),
      normalizedMarket,
      featureHash,
      parameterHash,
      "maximize_expectancy_r_after_costs",
    ],
  );

  const result = await pool.query<ModelRow>(
    `SELECT * FROM ${MODEL_REGISTRY_TABLE} WHERE model_id = $1 LIMIT 1`,
    [modelId],
  );
  const model = result.rows[0];
  if (!model) {
    throw new Error(`Lifecycle model ${modelId} could not be loaded`);
  }
  return model;
}

async function loadPreferredRuntimeModel(regimeScope: string): Promise<ModelRow | null> {
  const result = await pool.query<ModelRow>(
    `
      SELECT *
      FROM ${MODEL_REGISTRY_TABLE}
      WHERE regime_scope = $1
      ORDER BY
        CASE lifecycle_state
          WHEN 'PRODUCTION' THEN 1
          WHEN 'SMALL_LIVE' THEN 2
          WHEN 'REDUCED' THEN 3
          WHEN 'WATCHLIST' THEN 4
          WHEN 'SHADOW' THEN 5
          WHEN 'CANDIDATE' THEN 6
          WHEN 'RESEARCH' THEN 7
          WHEN 'RETIRED' THEN 8
          ELSE 9
        END,
        updated_at DESC,
        registered_at DESC
      LIMIT 1
    `,
    [regimeScope],
  );
  return result.rows[0] ?? null;
}

async function loadModelById(modelId: string): Promise<ModelRow | null> {
  const result = await pool.query<ModelRow>(
    `SELECT * FROM ${MODEL_REGISTRY_TABLE} WHERE model_id = $1 LIMIT 1`,
    [modelId],
  );
  return result.rows[0] ?? null;
}

async function loadModelParentsById(modelId: string): Promise<ModelRow[]> {
  const model = await loadModelById(modelId);
  return model ? [model] : [];
}

async function loadModelParentsByMarket(normalizedMarket: string): Promise<ModelRow[]> {
  const result = await pool.query<ModelRow>(
    `
      WITH ranked AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY regime_scope
            ORDER BY
              CASE lifecycle_state
                WHEN 'PRODUCTION' THEN 1
                WHEN 'SMALL_LIVE' THEN 2
                WHEN 'REDUCED' THEN 3
                WHEN 'WATCHLIST' THEN 4
                WHEN 'SHADOW' THEN 5
                WHEN 'CANDIDATE' THEN 6
                WHEN 'RESEARCH' THEN 7
                WHEN 'RETIRED' THEN 8
                ELSE 9
              END,
              updated_at DESC,
              registered_at DESC
          ) AS rn
        FROM ${MODEL_REGISTRY_TABLE}
        WHERE regime_scope = $1 OR regime_scope LIKE $2
      )
      SELECT *
      FROM ranked
      WHERE rn = 1
      ORDER BY regime_scope ASC
      LIMIT 16
    `,
    [normalizedMarket, `${normalizedMarket}|%`],
  );
  return result.rows;
}

async function createCandidateForParent(
  parent: ModelRow,
  reason: string,
): Promise<ModelRow> {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = stableHash(`${parent.model_id}:${timestamp}:${reason}`).slice(0, 8);
  const modelId = `stock-signal:${parent.regime_scope}:candidate:${timestamp}:${suffix}`;
  const trainingEnd = new Date(now.getTime() - 7 * 86_400_000);
  const trainingStart = new Date(now.getTime() - 127 * 86_400_000);

  await pool.query(
    `
      INSERT INTO ${MODEL_REGISTRY_TABLE} (
        model_id,
        parent_model_id,
        training_window_start,
        training_window_end,
        validation_window_start,
        validation_window_end,
        regime_scope,
        feature_hash,
        parameter_hash,
        objective_function,
        number_of_tested_variants,
        lifecycle_state,
        registered_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'CANDIDATE', NOW(), NOW())
      ON CONFLICT (model_id) DO NOTHING
    `,
    [
      modelId,
      parent.model_id,
      trainingStart.toISOString(),
      trainingEnd.toISOString(),
      trainingEnd.toISOString(),
      now.toISOString(),
      parent.regime_scope,
      stableHash(`${parent.feature_hash}:candidate:${timestamp}`),
      stableHash(`${parent.parameter_hash}:candidate:${timestamp}`),
      parent.objective_function || "maximize_expectancy_r_after_costs",
      Math.max(1, Number(parent.number_of_tested_variants) + 1),
    ],
  );

  const created = await loadModelById(modelId);
  if (!created) {
    throw new Error(`Candidate model ${modelId} could not be loaded`);
  }

  await appendAudit({
    model_id: created.model_id,
    old_state: "RESEARCH",
    new_state: "CANDIDATE",
    metrics_snapshot: ZERO_METRICS,
    reason: `${reason}; parent=${parent.model_id}`,
  });

  return created;
}

async function recordClosedSignalOutcome(
  modelId: string,
  input: GovernSignalDecisionInput,
): Promise<void> {
  const previous = input.previousState;
  const previousEmittedAt = previous.lastSignalEmittedAt;
  if (
    !previousEmittedAt ||
    previous.lastSignalEntryPrice <= 0 ||
    input.currentPrice <= 0 ||
    previous.lastSignalAction === input.signal.signalAction
  ) {
    return;
  }

  const returnPercent =
    ((input.currentPrice - previous.lastSignalEntryPrice) /
      previous.lastSignalEntryPrice) *
    100;
  const resultR = resultRForAction(previous.lastSignalAction, returnPercent);

  await pool.query(
    `
      INSERT INTO ${MODEL_FEEDBACK_TABLE} (
        model_id,
        symbol,
        signal_action,
        signal_emitted_at,
        signal_entry_price,
        observed_price,
        observed_at,
        return_percent,
        result_r
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8)
      ON CONFLICT (model_id, symbol, signal_emitted_at)
      DO UPDATE SET
        signal_action = EXCLUDED.signal_action,
        signal_entry_price = EXCLUDED.signal_entry_price,
        observed_price = EXCLUDED.observed_price,
        observed_at = EXCLUDED.observed_at,
        return_percent = EXCLUDED.return_percent,
        result_r = EXCLUDED.result_r
    `,
    [
      modelId,
      input.symbol.trim().toUpperCase(),
      previous.lastSignalAction,
      previousEmittedAt,
      previous.lastSignalEntryPrice,
      input.currentPrice,
      Number(returnPercent.toFixed(6)),
      resultR,
    ],
  );
}

async function loadTradeResultsR(modelId: string): Promise<number[]> {
  const result = await pool.query<{ result_r: number }>(
    `
      SELECT result_r
      FROM ${MODEL_FEEDBACK_TABLE}
      WHERE model_id = $1
      ORDER BY observed_at DESC
      LIMIT $2
    `,
    [modelId, FEEDBACK_SAMPLE_LIMIT],
  );
  return result.rows
    .map((row) => Number(row.result_r))
    .filter((value) => Number.isFinite(value))
    .reverse();
}

async function applyLifecycleGates(
  model: ModelRow,
  metrics: EvaluationMetrics,
  sampleSize: number,
): Promise<ModelRow> {
  if (sampleSize < MIN_LIFECYCLE_SAMPLE || model.lifecycle_state === "RETIRED") {
    return model;
  }

  const config = loadModelLifecycleConfig();
  const retirement = evaluateRetirementRules(metrics, config.retirement_rules);
  if (
    retirement.should_retire &&
    isAllowedTransition(model.lifecycle_state, retirement.target_state, config)
  ) {
    return transitionModel(
      model,
      retirement.target_state,
      metrics,
      `Feedback loop breached retirement gates: ${retirement.failures
        .map((failure) => failure.message)
        .join("; ")}`,
    );
  }

  if (sampleSize < PRODUCTION_PROMOTION_SAMPLE) {
    return model;
  }

  const promotion = evaluatePromotionGates(
    metrics,
    { number_of_tested_variants: Number(model.number_of_tested_variants) || 1 },
    config.promotion_rules,
  );
  if (!promotion.passed) {
    return model;
  }

  if (
    model.lifecycle_state === "SMALL_LIVE" &&
    isAllowedTransition("SMALL_LIVE", "PRODUCTION", config)
  ) {
    return transitionModel(
      model,
      "PRODUCTION",
      metrics,
      "Feedback loop cleared production promotion gates",
    );
  }

  if (
    model.lifecycle_state === "REDUCED" &&
    isAllowedTransition("REDUCED", "PRODUCTION", config)
  ) {
    return transitionModel(
      model,
      "PRODUCTION",
      metrics,
      "Feedback loop recovered and cleared production gates",
    );
  }

  if (
    model.lifecycle_state === "WATCHLIST" &&
    isAllowedTransition("WATCHLIST", "SHADOW", config)
  ) {
    return transitionModel(
      model,
      "SHADOW",
      metrics,
      "Feedback loop recovered enough for shadow review",
    );
  }

  return model;
}

async function transitionModel(
  model: ModelRow,
  newState: ModelLifecycleState,
  metrics: EvaluationMetrics,
  reason: string,
): Promise<ModelRow> {
  if (model.lifecycle_state === newState) {
    return model;
  }

  await pool.query(
    `
      UPDATE ${MODEL_REGISTRY_TABLE}
      SET lifecycle_state = $2, updated_at = NOW()
      WHERE model_id = $1
    `,
    [model.model_id, newState],
  );

  await appendAudit({
    model_id: model.model_id,
    old_state: model.lifecycle_state,
    new_state: newState,
    metrics_snapshot: metrics,
    reason,
  });

  return {
    ...model,
    lifecycle_state: newState,
    updated_at: new Date().toISOString(),
  };
}

async function appendAudit(input: {
  model_id: string;
  old_state: ModelLifecycleState;
  new_state: ModelLifecycleState;
  metrics_snapshot: EvaluationMetrics;
  reason: string;
}): Promise<void> {
  await pool.query(
    `
      INSERT INTO ${MODEL_AUDIT_TABLE} (
        model_id,
        timestamp,
        old_state,
        new_state,
        metrics_snapshot,
        reason
      )
      VALUES ($1, NOW(), $2, $3, $4::jsonb, $5)
    `,
    [
      input.model_id,
      input.old_state,
      input.new_state,
      JSON.stringify(input.metrics_snapshot),
      input.reason,
    ],
  );
}

function buildLifecycleDecision(
  model: ModelRow,
  metrics: EvaluationMetrics,
  sampleSize: number,
): SignalLifecycleDecision {
  const state = model.lifecycle_state;
  const canOpen = LIVE_STATES.has(state);

  if (state === "RETIRED") {
    return {
      modelId: model.model_id,
      modelLifecycleState: state,
      modelLifecycleAction: "Disregard",
      modelLifecycleReason: "Retired by lifecycle gates; new trades are blocked.",
      modelCanOpenNewTrades: false,
      modelAllocationMultiplier: 0,
      modelMetrics: metrics,
    };
  }

  if (state === "WATCHLIST" || state === "REDUCED") {
    return {
      modelId: model.model_id,
      modelLifecycleState: state,
      modelLifecycleAction: "Careful",
      modelLifecycleReason:
        state === "REDUCED"
          ? "Lifecycle gates reduced trust; new exposure is size-capped."
          : "Lifecycle gates moved this model to watchlist; new trades are blocked.",
      modelCanOpenNewTrades: state === "REDUCED",
      modelAllocationMultiplier: state === "REDUCED" ? 0.35 : 0,
      modelMetrics: metrics,
    };
  }

  if (state === "PRODUCTION") {
    return {
      modelId: model.model_id,
      modelLifecycleState: state,
      modelLifecycleAction: "Trusted",
      modelLifecycleReason: "Model has cleared configured production gates.",
      modelCanOpenNewTrades: true,
      modelAllocationMultiplier: 1,
      modelMetrics: metrics,
    };
  }

  if (state === "SMALL_LIVE") {
    return {
      modelId: model.model_id,
      modelLifecycleState: state,
      modelLifecycleAction: "Awaiting Decision",
      modelLifecycleReason:
        sampleSize < PRODUCTION_PROMOTION_SAMPLE
          ? `Collecting live feedback (${sampleSize}/${PRODUCTION_PROMOTION_SAMPLE}) before production.`
          : "Awaiting promotion gate review.",
      modelCanOpenNewTrades: true,
      modelAllocationMultiplier: 0.65,
      modelMetrics: metrics,
    };
  }

  return {
    modelId: model.model_id,
    modelLifecycleState: state,
    modelLifecycleAction: "Awaiting Decision",
    modelLifecycleReason: `${state} models run without real orders until promoted.`,
    modelCanOpenNewTrades: canOpen,
    modelAllocationMultiplier: canOpen ? 0.5 : 0,
    modelMetrics: metrics,
  };
}

function fallbackDecision(market: string): SignalLifecycleDecision {
  return {
    modelId: `stock-signal:${normalizeScope(market)}:fallback`,
    modelLifecycleState: "WATCHLIST",
    modelLifecycleAction: "Careful",
    modelLifecycleReason:
      "Lifecycle persistence is unavailable; blocking new risk until governance recovers.",
    modelCanOpenNewTrades: false,
    modelAllocationMultiplier: 0,
  };
}

function resultRForAction(action: string, returnPercent: number): number {
  const riskUnit = Math.max(0.01, RISK_UNIT_PERCENT);
  if (action === "Sell") {
    return Number((-returnPercent / riskUnit).toFixed(6));
  }
  if (action === "Hold") {
    return Number((-Math.abs(returnPercent) / riskUnit).toFixed(6));
  }
  return Number((returnPercent / riskUnit).toFixed(6));
}

function normalizeScope(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9|:_-]+/g, "_") || "GLOBAL";
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function logLifecycleWarning(error: unknown) {
  if (warningLogged) return;
  warningLogged = true;
  logger.warn(
    { err: error },
    "Model lifecycle governance unavailable; returning conservative signal gate",
  );
}
