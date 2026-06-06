import { pool } from "@workspace/db";
import { logger } from "./logger";
import type { ModelLifecycleState } from "./model-lifecycle";

type DecisionTone = "good" | "info" | "warn" | "bad";
type RiskMode = "small" | "balanced" | "normal";

export type PortfolioDecisionTopTicker = {
  ticker: string;
  action: string;
  allocationPct: number;
  targetCapital: number;
  quality: number;
  risk: number;
};

export type PortfolioDecisionMemoryEntry = {
  id: string;
  market: string;
  recordedAt: number;
  signature: string;
  recommendation: string;
  readiness: string;
  tone: DecisionTone;
  budget: number;
  targetAllocationPct: number;
  targetCapital: number;
  confidenceFilter: RiskMode;
  confidenceFilterLabel: string;
  lifecycleState: ModelLifecycleState;
  lifecycleLabel: string;
  topTickers: PortfolioDecisionTopTicker[];
  startPortfolioValue: number;
  startTotalReturn: number;
  startSharpe: number | null;
  startProfitFactor: number | null;
  startClosedTrades: number;
  startDrawdown: number;
  dataQualityPct: number;
};

export type PortfolioDecisionOutcome = {
  id: number;
  decisionId: string;
  windowLabel: "1d" | "7d" | "30d";
  evaluatedAt: number;
  outcome: "Too early" | "Helped" | "Hurt" | "Mixed";
  tone: DecisionTone;
  returnChange: number;
  sharpeChange: number;
  closedTradeChange: number;
  drawdownChange: number;
  trustChange: string;
};

export type PortfolioDecisionAuditEntry = {
  id: number;
  decisionId: string | null;
  market: string;
  eventType: "recorded" | "outcome_checked";
  timestamp: number;
  snapshot: Record<string, unknown>;
};

type DecisionRow = {
  decision_id: string;
  market: string;
  recorded_at: string | Date;
  signature: string;
  recommendation: string;
  readiness: string;
  tone: DecisionTone;
  budget: number;
  target_allocation_pct: number;
  target_capital: number;
  confidence_filter: RiskMode;
  confidence_filter_label: string;
  lifecycle_state: ModelLifecycleState;
  lifecycle_label: string;
  top_tickers: PortfolioDecisionTopTicker[];
  start_portfolio_value: number;
  start_total_return: number;
  start_sharpe: number | null;
  start_profit_factor: number | null;
  start_closed_trades: number;
  start_drawdown: number;
  data_quality_pct: number;
};

type OutcomeRow = {
  outcome_id: number;
  decision_id: string;
  window_label: "1d" | "7d" | "30d";
  evaluated_at: string | Date;
  outcome: "Too early" | "Helped" | "Hurt" | "Mixed";
  tone: DecisionTone;
  return_change: number;
  sharpe_change: number;
  closed_trade_change: number;
  drawdown_change: number;
  trust_change: string;
};

type AuditRow = {
  audit_id: number;
  decision_id: string | null;
  market: string;
  event_type: "recorded" | "outcome_checked";
  timestamp: string | Date;
  snapshot: Record<string, unknown>;
};

const DECISION_TABLE = "stock_portfolio_decision_memory";
const OUTCOME_TABLE = "stock_portfolio_decision_outcomes";
const AUDIT_TABLE = "stock_portfolio_decision_audit";
const OUTCOME_WINDOWS = [
  { label: "1d" as const, ms: 86_400_000 },
  { label: "7d" as const, ms: 7 * 86_400_000 },
  { label: "30d" as const, ms: 30 * 86_400_000 },
];
const DEFAULT_LIMIT = 50;
const TRUST_RANK: Record<ModelLifecycleState, number> = {
  RETIRED: 0,
  RESEARCH: 1,
  CANDIDATE: 2,
  SHADOW: 3,
  REDUCED: 3,
  WATCHLIST: 4,
  SMALL_LIVE: 5,
  PRODUCTION: 6,
};

let schemaReady: Promise<void> | null = null;
let warningLogged = false;

export async function listPortfolioDecisionMemory(input: {
  market?: string;
  limit?: number;
} = {}): Promise<PortfolioDecisionMemoryEntry[]> {
  await ensureDecisionMemorySchema();
  const limit = Math.min(Math.max(Number(input.limit ?? DEFAULT_LIMIT), 1), 200);
  const market = normalizeMarket(input.market ?? "");
  const params: Array<string | number> = [];
  const where = market ? "WHERE market = $1" : "";
  if (market) params.push(market);
  params.push(limit);

  const result = await pool.query<DecisionRow>(
    `
      SELECT *
      FROM ${DECISION_TABLE}
      ${where}
      ORDER BY recorded_at DESC
      LIMIT $${params.length}
    `,
    params,
  );

  return result.rows.map(rowToEntry);
}

export async function listPortfolioDecisionAudit(input: {
  market?: string;
  limit?: number;
} = {}): Promise<PortfolioDecisionAuditEntry[]> {
  await ensureDecisionMemorySchema();
  const limit = Math.min(Math.max(Number(input.limit ?? DEFAULT_LIMIT), 1), 200);
  const market = normalizeMarket(input.market ?? "");
  const params: Array<string | number> = [];
  const where = market ? "WHERE market = $1" : "";
  if (market) params.push(market);
  params.push(limit);

  const result = await pool.query<AuditRow>(
    `
      SELECT *
      FROM ${AUDIT_TABLE}
      ${where}
      ORDER BY timestamp DESC, audit_id DESC
      LIMIT $${params.length}
    `,
    params,
  );

  return result.rows.map((row) => ({
    id: Number(row.audit_id),
    decisionId: row.decision_id,
    market: row.market,
    eventType: row.event_type,
    timestamp: new Date(row.timestamp).getTime(),
    snapshot: row.snapshot ?? {},
  }));
}

export async function listPortfolioDecisionOutcomes(input: {
  market?: string;
  limit?: number;
} = {}): Promise<PortfolioDecisionOutcome[]> {
  await ensureDecisionMemorySchema();
  const limit = Math.min(Math.max(Number(input.limit ?? DEFAULT_LIMIT), 1), 200);
  const market = normalizeMarket(input.market ?? "");
  const params: Array<string | number> = [];
  const marketJoin = market ? `JOIN ${DECISION_TABLE} d ON d.decision_id = o.decision_id` : "";
  const where = market ? "WHERE d.market = $1" : "";
  if (market) params.push(market);
  params.push(limit);

  const result = await pool.query<OutcomeRow>(
    `
      SELECT o.*
      FROM ${OUTCOME_TABLE} o
      ${marketJoin}
      ${where}
      ORDER BY o.evaluated_at DESC, o.outcome_id DESC
      LIMIT $${params.length}
    `,
    params,
  );

  return result.rows.map(rowToOutcome);
}

export async function recordPortfolioDecisionMemory(
  entry: PortfolioDecisionMemoryEntry,
): Promise<PortfolioDecisionMemoryEntry> {
  await ensureDecisionMemorySchema();
  const normalized = normalizeEntry(entry);

  const result = await pool.query<DecisionRow>(
    `
      INSERT INTO ${DECISION_TABLE} (
        decision_id,
        market,
        recorded_at,
        signature,
        recommendation,
        readiness,
        tone,
        budget,
        target_allocation_pct,
        target_capital,
        confidence_filter,
        confidence_filter_label,
        lifecycle_state,
        lifecycle_label,
        top_tickers,
        start_portfolio_value,
        start_total_return,
        start_sharpe,
        start_profit_factor,
        start_closed_trades,
        start_drawdown,
        data_quality_pct
      )
      VALUES (
        $1, $2, TO_TIMESTAMP($3 / 1000.0), $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19, $20, $21, $22
      )
      ON CONFLICT (market, signature) DO NOTHING
      RETURNING *
    `,
    [
      normalized.id,
      normalized.market,
      normalized.recordedAt,
      normalized.signature,
      normalized.recommendation,
      normalized.readiness,
      normalized.tone,
      normalized.budget,
      normalized.targetAllocationPct,
      normalized.targetCapital,
      normalized.confidenceFilter,
      normalized.confidenceFilterLabel,
      normalized.lifecycleState,
      normalized.lifecycleLabel,
      JSON.stringify(normalized.topTickers),
      normalized.startPortfolioValue,
      normalized.startTotalReturn,
      normalized.startSharpe,
      normalized.startProfitFactor,
      normalized.startClosedTrades,
      normalized.startDrawdown,
      normalized.dataQualityPct,
    ],
  );

  if (result.rows[0]) {
    await recordAudit({
      decisionId: result.rows[0].decision_id,
      market: result.rows[0].market,
      eventType: "recorded",
      snapshot: rowToEntry(result.rows[0]) as unknown as Record<string, unknown>,
    });
    return rowToEntry(result.rows[0]);
  }

  const existing = await loadDecisionBySignature(normalized.market, normalized.signature);
  return existing ?? normalized;
}

export async function reviewPortfolioDecisionOutcomes(input: {
  market: string;
  evaluatedAt?: number;
  currentPortfolioValue: number;
  currentTotalReturn: number;
  currentSharpe: number | null;
  currentProfitFactor: number | null;
  currentClosedTrades: number;
  currentDrawdown: number;
  lifecycleState: ModelLifecycleState;
  lifecycleLabel: string;
}): Promise<{
  entries: PortfolioDecisionMemoryEntry[];
  outcomes: PortfolioDecisionOutcome[];
}> {
  await ensureDecisionMemorySchema();
  const market = normalizeMarket(input.market);
  if (!market) return { entries: [], outcomes: [] };
  const evaluatedAt = Number(input.evaluatedAt ?? Date.now());
  const entries = await listPortfolioDecisionMemory({ market, limit: 200 });
  const created: PortfolioDecisionOutcome[] = [];

  for (const entry of entries) {
    for (const window of OUTCOME_WINDOWS) {
      if (evaluatedAt - entry.recordedAt < window.ms) continue;
      const existing = await pool.query(
        `
          SELECT 1
          FROM ${OUTCOME_TABLE}
          WHERE decision_id = $1 AND window_label = $2
          LIMIT 1
        `,
        [entry.id, window.label],
      );
      if (existing.rowCount) continue;

      const outcome = classifyOutcome(entry, input);
      const result = await pool.query<OutcomeRow>(
        `
          INSERT INTO ${OUTCOME_TABLE} (
            decision_id,
            window_label,
            evaluated_at,
            outcome,
            tone,
            return_change,
            sharpe_change,
            closed_trade_change,
            drawdown_change,
            trust_change
          )
          VALUES ($1, $2, TO_TIMESTAMP($3 / 1000.0), $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
        [
          entry.id,
          window.label,
          evaluatedAt,
          outcome.outcome,
          outcome.tone,
          outcome.returnChange,
          outcome.sharpeChange,
          outcome.closedTradeChange,
          outcome.drawdownChange,
          outcome.trustChange,
        ],
      );
      const createdOutcome = rowToOutcome(result.rows[0]);
      created.push(createdOutcome);
      await recordAudit({
        decisionId: entry.id,
        market,
        eventType: "outcome_checked",
        snapshot: createdOutcome as unknown as Record<string, unknown>,
      });
    }
  }

  return {
    entries: await listPortfolioDecisionMemory({ market, limit: DEFAULT_LIMIT }),
    outcomes: created,
  };
}

async function ensureDecisionMemorySchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${DECISION_TABLE} (
          decision_id TEXT PRIMARY KEY,
          market TEXT NOT NULL,
          recorded_at TIMESTAMPTZ NOT NULL,
          signature TEXT NOT NULL,
          recommendation TEXT NOT NULL,
          readiness TEXT NOT NULL,
          tone TEXT NOT NULL,
          budget DOUBLE PRECISION NOT NULL,
          target_allocation_pct DOUBLE PRECISION NOT NULL,
          target_capital DOUBLE PRECISION NOT NULL,
          confidence_filter TEXT NOT NULL,
          confidence_filter_label TEXT NOT NULL,
          lifecycle_state TEXT NOT NULL,
          lifecycle_label TEXT NOT NULL,
          top_tickers JSONB NOT NULL DEFAULT '[]'::jsonb,
          start_portfolio_value DOUBLE PRECISION NOT NULL,
          start_total_return DOUBLE PRECISION NOT NULL,
          start_sharpe DOUBLE PRECISION,
          start_profit_factor DOUBLE PRECISION,
          start_closed_trades INTEGER NOT NULL,
          start_drawdown DOUBLE PRECISION NOT NULL,
          data_quality_pct DOUBLE PRECISION NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ${DECISION_TABLE}_market_signature_uidx
        ON ${DECISION_TABLE} (market, signature)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${DECISION_TABLE}_market_recorded_idx
        ON ${DECISION_TABLE} (market, recorded_at DESC)
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${OUTCOME_TABLE} (
          outcome_id BIGSERIAL PRIMARY KEY,
          decision_id TEXT NOT NULL REFERENCES ${DECISION_TABLE}(decision_id) ON DELETE CASCADE,
          window_label TEXT NOT NULL,
          evaluated_at TIMESTAMPTZ NOT NULL,
          outcome TEXT NOT NULL,
          tone TEXT NOT NULL,
          return_change DOUBLE PRECISION NOT NULL,
          sharpe_change DOUBLE PRECISION NOT NULL,
          closed_trade_change INTEGER NOT NULL,
          drawdown_change DOUBLE PRECISION NOT NULL,
          trust_change TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (decision_id, window_label)
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${OUTCOME_TABLE}_decision_window_idx
        ON ${OUTCOME_TABLE} (decision_id, window_label)
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${AUDIT_TABLE} (
          audit_id BIGSERIAL PRIMARY KEY,
          decision_id TEXT,
          market TEXT NOT NULL,
          event_type TEXT NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${AUDIT_TABLE}_market_timestamp_idx
        ON ${AUDIT_TABLE} (market, timestamp DESC)
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  await schemaReady;
}

async function loadDecisionBySignature(market: string, signature: string) {
  const result = await pool.query<DecisionRow>(
    `
      SELECT *
      FROM ${DECISION_TABLE}
      WHERE market = $1 AND signature = $2
      LIMIT 1
    `,
    [market, signature],
  );
  return result.rows[0] ? rowToEntry(result.rows[0]) : null;
}

async function recordAudit(input: {
  decisionId: string | null;
  market: string;
  eventType: "recorded" | "outcome_checked";
  snapshot: Record<string, unknown>;
}) {
  await pool.query(
    `
      INSERT INTO ${AUDIT_TABLE} (decision_id, market, event_type, snapshot)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [
      input.decisionId,
      input.market,
      input.eventType,
      JSON.stringify(input.snapshot),
    ],
  );
}

function normalizeEntry(entry: PortfolioDecisionMemoryEntry): PortfolioDecisionMemoryEntry {
  const market = normalizeMarket(entry.market);
  const recordedAt = finiteOr(entry.recordedAt, Date.now());
  return {
    id: String(entry.id || `${market}:${recordedAt}`),
    market,
    recordedAt,
    signature: String(entry.signature || ""),
    recommendation: String(entry.recommendation || "Hold Cash"),
    readiness: String(entry.readiness || "Paper trade only"),
    tone: normalizeTone(entry.tone),
    budget: finiteOr(entry.budget, 0),
    targetAllocationPct: finiteOr(entry.targetAllocationPct, 0),
    targetCapital: finiteOr(entry.targetCapital, 0),
    confidenceFilter: normalizeRiskMode(entry.confidenceFilter),
    confidenceFilterLabel: String(entry.confidenceFilterLabel || "Conservative"),
    lifecycleState: normalizeLifecycleState(entry.lifecycleState),
    lifecycleLabel: String(entry.lifecycleLabel || entry.lifecycleState || "Needs More Proof"),
    topTickers: Array.isArray(entry.topTickers)
      ? entry.topTickers.slice(0, 12).map((ticker) => ({
        ticker: String(ticker.ticker ?? "").trim().toUpperCase(),
        action: String(ticker.action ?? "Hold"),
        allocationPct: finiteOr(ticker.allocationPct, 0),
        targetCapital: finiteOr(ticker.targetCapital, 0),
        quality: finiteOr(ticker.quality, 0),
        risk: finiteOr(ticker.risk, 0),
      })).filter((ticker) => ticker.ticker)
      : [],
    startPortfolioValue: finiteOr(entry.startPortfolioValue, 0),
    startTotalReturn: finiteOr(entry.startTotalReturn, 0),
    startSharpe: nullableNumber(entry.startSharpe),
    startProfitFactor: nullableNumber(entry.startProfitFactor),
    startClosedTrades: Math.max(0, Math.round(finiteOr(entry.startClosedTrades, 0))),
    startDrawdown: finiteOr(entry.startDrawdown, 0),
    dataQualityPct: finiteOr(entry.dataQualityPct, 0),
  };
}

function classifyOutcome(
  entry: PortfolioDecisionMemoryEntry,
  current: {
    currentTotalReturn: number;
    currentSharpe: number | null;
    currentClosedTrades: number;
    currentDrawdown: number;
    lifecycleState: ModelLifecycleState;
  },
) {
  const returnChange = (finiteOr(current.currentTotalReturn, 0) - entry.startTotalReturn) * 100;
  const sharpeChange = (current.currentSharpe ?? 0) - (entry.startSharpe ?? 0);
  const closedTradeChange = Math.max(0, Math.round(finiteOr(current.currentClosedTrades, 0) - entry.startClosedTrades));
  const drawdownChange = finiteOr(current.currentDrawdown, 0) - entry.startDrawdown;
  const trustDelta =
    (TRUST_RANK[normalizeLifecycleState(current.lifecycleState)] ?? 1) -
    (TRUST_RANK[normalizeLifecycleState(entry.lifecycleState)] ?? 1);
  const trustChange =
    trustDelta > 0
      ? "Trust improved"
      : trustDelta < 0
        ? "Trust weakened"
        : "Trust unchanged";
  const classified =
    closedTradeChange < 5 && Math.abs(returnChange) < 0.25
      ? { outcome: "Too early" as const, tone: "info" as const }
      : returnChange > 0.25 && sharpeChange >= -0.1
        ? { outcome: "Helped" as const, tone: "good" as const }
        : returnChange < -0.25 && sharpeChange < 0
          ? { outcome: "Hurt" as const, tone: "bad" as const }
          : { outcome: "Mixed" as const, tone: "warn" as const };

  return {
    ...classified,
    returnChange,
    sharpeChange,
    closedTradeChange,
    drawdownChange,
    trustChange,
  };
}

function rowToEntry(row: DecisionRow): PortfolioDecisionMemoryEntry {
  return {
    id: row.decision_id,
    market: row.market,
    recordedAt: new Date(row.recorded_at).getTime(),
    signature: row.signature,
    recommendation: row.recommendation,
    readiness: row.readiness,
    tone: normalizeTone(row.tone),
    budget: Number(row.budget),
    targetAllocationPct: Number(row.target_allocation_pct),
    targetCapital: Number(row.target_capital),
    confidenceFilter: normalizeRiskMode(row.confidence_filter),
    confidenceFilterLabel: row.confidence_filter_label,
    lifecycleState: normalizeLifecycleState(row.lifecycle_state),
    lifecycleLabel: row.lifecycle_label,
    topTickers: Array.isArray(row.top_tickers) ? row.top_tickers : [],
    startPortfolioValue: Number(row.start_portfolio_value),
    startTotalReturn: Number(row.start_total_return),
    startSharpe: nullableNumber(row.start_sharpe),
    startProfitFactor: nullableNumber(row.start_profit_factor),
    startClosedTrades: Number(row.start_closed_trades),
    startDrawdown: Number(row.start_drawdown),
    dataQualityPct: Number(row.data_quality_pct),
  };
}

function rowToOutcome(row: OutcomeRow): PortfolioDecisionOutcome {
  return {
    id: Number(row.outcome_id),
    decisionId: row.decision_id,
    windowLabel: row.window_label,
    evaluatedAt: new Date(row.evaluated_at).getTime(),
    outcome: row.outcome,
    tone: normalizeTone(row.tone),
    returnChange: Number(row.return_change),
    sharpeChange: Number(row.sharpe_change),
    closedTradeChange: Number(row.closed_trade_change),
    drawdownChange: Number(row.drawdown_change),
    trustChange: row.trust_change,
  };
}

function normalizeMarket(value: string) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeTone(value: unknown): DecisionTone {
  return value === "good" || value === "warn" || value === "bad" || value === "info"
    ? value
    : "info";
}

function normalizeRiskMode(value: unknown): RiskMode {
  return value === "balanced" || value === "normal" || value === "small"
    ? value
    : "small";
}

function normalizeLifecycleState(value: unknown): ModelLifecycleState {
  const state = String(value ?? "");
  if (
    state === "RESEARCH" ||
    state === "CANDIDATE" ||
    state === "SHADOW" ||
    state === "SMALL_LIVE" ||
    state === "PRODUCTION" ||
    state === "WATCHLIST" ||
    state === "REDUCED" ||
    state === "RETIRED"
  ) {
    return state;
  }
  return "RESEARCH";
}

function finiteOr(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function logDecisionMemoryWarning(error: unknown) {
  if (warningLogged) return;
  warningLogged = true;
  logger.warn(
    { err: error },
    "Portfolio decision memory persistence unavailable; continuing without durable records",
  );
}
