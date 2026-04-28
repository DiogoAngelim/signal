import { pool } from "@workspace/db";

export type TradeSignal = "Buy" | "Hold" | "Sell";
export type SignalSource = "node-ecu" | "heuristic";

export interface SignalDecision {
  signalAction: TradeSignal;
  signalConfidence: number;
  signalSource: SignalSource;
}

export interface SignalTrainingState {
  market: string;
  symbol: string;
  lastSignalAction: TradeSignal;
  lastSignalConfidence: number;
  lastSignalSource: SignalSource;
  lastSignalEmittedAt: string | null;
  lastSignalEntryPrice: number;
  lastObservedPrice: number;
  lastObservedAt: string | null;
  buyObservations: number;
  buySuccesses: number;
  holdObservations: number;
  holdSuccesses: number;
  sellObservations: number;
  sellSuccesses: number;
  buyThreshold: number;
  sellThreshold: number;
  confidenceBias: number;
}

export interface SignalSnapshot extends SignalDecision {
  signalEmittedAt: string;
  signalEntryPrice: number;
  signalReturnPercent: number;
}

const TABLE_NAME = "stock_signal_training_state";
const CACHE_TTL_MS = Number(process.env.STOCK_SIGNAL_TRAINING_CACHE_TTL_MS ?? 60_000);
const DEFAULT_BUY_THRESHOLD = 1.2;
const DEFAULT_SELL_THRESHOLD = -1.2;
const DEFAULT_CONFIDENCE_BIAS = 0;

const stateCache = new Map<string, { expiresAt: number; state: SignalTrainingState }>();
let schemaReady: Promise<void> | null = null;

function cacheKey(market: string, symbol: string): string {
  return `${market.trim().toUpperCase()}:${symbol.trim().toUpperCase()}`;
}

function createDefaultState(market: string, symbol: string): SignalTrainingState {
  return {
    market: market.trim().toUpperCase(),
    symbol: symbol.trim().toUpperCase(),
    lastSignalAction: "Hold",
    lastSignalConfidence: 50,
    lastSignalSource: "heuristic",
    lastSignalEmittedAt: null,
    lastSignalEntryPrice: 0,
    lastObservedPrice: 0,
    lastObservedAt: null,
    buyObservations: 0,
    buySuccesses: 0,
    holdObservations: 0,
    holdSuccesses: 0,
    sellObservations: 0,
    sellSuccesses: 0,
    buyThreshold: DEFAULT_BUY_THRESHOLD,
    sellThreshold: DEFAULT_SELL_THRESHOLD,
    confidenceBias: DEFAULT_CONFIDENCE_BIAS,
  };
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mapRowToState(row: Record<string, unknown>, market: string, symbol: string): SignalTrainingState {
  const fallback = createDefaultState(market, symbol);
  return {
    market: String(row.market ?? fallback.market),
    symbol: String(row.symbol ?? fallback.symbol),
    lastSignalAction:
      row.last_signal_action === "Buy" || row.last_signal_action === "Sell" || row.last_signal_action === "Hold"
        ? row.last_signal_action
        : fallback.lastSignalAction,
    lastSignalConfidence: Math.round(toNumber(row.last_signal_confidence, fallback.lastSignalConfidence)),
    lastSignalSource: row.last_signal_source === "node-ecu" ? "node-ecu" : "heuristic",
    lastSignalEmittedAt:
      typeof row.last_signal_emitted_at === "string"
        ? row.last_signal_emitted_at
        : row.last_signal_emitted_at instanceof Date
          ? row.last_signal_emitted_at.toISOString()
          : fallback.lastSignalEmittedAt,
    lastSignalEntryPrice: toNumber(row.last_signal_entry_price, fallback.lastSignalEntryPrice),
    lastObservedPrice: toNumber(row.last_observed_price, fallback.lastObservedPrice),
    lastObservedAt:
      typeof row.last_observed_at === "string"
        ? row.last_observed_at
        : row.last_observed_at instanceof Date
          ? row.last_observed_at.toISOString()
          : fallback.lastObservedAt,
    buyObservations: Math.max(0, Math.round(toNumber(row.buy_observations, fallback.buyObservations))),
    buySuccesses: Math.max(0, Math.round(toNumber(row.buy_successes, fallback.buySuccesses))),
    holdObservations: Math.max(0, Math.round(toNumber(row.hold_observations, fallback.holdObservations))),
    holdSuccesses: Math.max(0, Math.round(toNumber(row.hold_successes, fallback.holdSuccesses))),
    sellObservations: Math.max(0, Math.round(toNumber(row.sell_observations, fallback.sellObservations))),
    sellSuccesses: Math.max(0, Math.round(toNumber(row.sell_successes, fallback.sellSuccesses))),
    buyThreshold: toNumber(row.buy_threshold, fallback.buyThreshold),
    sellThreshold: toNumber(row.sell_threshold, fallback.sellThreshold),
    confidenceBias: toNumber(row.confidence_bias, fallback.confidenceBias),
  };
}

async function ensureSignalTrainingSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        last_signal_action TEXT NOT NULL DEFAULT 'Hold',
        last_signal_confidence INTEGER NOT NULL DEFAULT 50,
        last_signal_source TEXT NOT NULL DEFAULT 'heuristic',
        last_signal_emitted_at TIMESTAMPTZ,
        last_signal_entry_price DOUBLE PRECISION NOT NULL DEFAULT 0,
        last_observed_price DOUBLE PRECISION NOT NULL DEFAULT 0,
        last_observed_at TIMESTAMPTZ,
        buy_observations INTEGER NOT NULL DEFAULT 0,
        buy_successes INTEGER NOT NULL DEFAULT 0,
        hold_observations INTEGER NOT NULL DEFAULT 0,
        hold_successes INTEGER NOT NULL DEFAULT 0,
        sell_observations INTEGER NOT NULL DEFAULT 0,
        sell_successes INTEGER NOT NULL DEFAULT 0,
        buy_threshold DOUBLE PRECISION NOT NULL DEFAULT ${DEFAULT_BUY_THRESHOLD},
        sell_threshold DOUBLE PRECISION NOT NULL DEFAULT ${DEFAULT_SELL_THRESHOLD},
        confidence_bias DOUBLE PRECISION NOT NULL DEFAULT ${DEFAULT_CONFIDENCE_BIAS},
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (market, symbol)
      )
    `).then(() => undefined);
  }

  await schemaReady;
}

function getActionStats(state: SignalTrainingState, action: TradeSignal): { observations: number; successes: number } {
  switch (action) {
    case "Buy":
      return { observations: state.buyObservations, successes: state.buySuccesses };
    case "Sell":
      return { observations: state.sellObservations, successes: state.sellSuccesses };
    default:
      return { observations: state.holdObservations, successes: state.holdSuccesses };
  }
}

function getActionSuccessRate(state: SignalTrainingState, action: TradeSignal): number | null {
  const stats = getActionStats(state, action);
  return stats.observations > 0 ? stats.successes / stats.observations : null;
}

function evaluateSignalOutcome(action: TradeSignal, returnPercent: number): boolean {
  if (action === "Buy") {
    return returnPercent >= 0;
  }
  if (action === "Sell") {
    return returnPercent <= 0;
  }
  return Math.abs(returnPercent) <= 1;
}

function recomputeAdaptiveState(state: SignalTrainingState): SignalTrainingState {
  const buyRate = getActionSuccessRate(state, "Buy") ?? 0.55;
  const sellRate = getActionSuccessRate(state, "Sell") ?? 0.55;
  const holdRate = getActionSuccessRate(state, "Hold") ?? 0.55;

  state.buyThreshold = Number(clamp(DEFAULT_BUY_THRESHOLD + (0.55 - buyRate) * 1.6, 0.6, 2.4).toFixed(4));
  state.sellThreshold = Number(clamp(DEFAULT_SELL_THRESHOLD - (0.55 - sellRate) * 1.6, -2.4, -0.6).toFixed(4));

  const overallBias = ((buyRate - 0.5) + (sellRate - 0.5) + (holdRate - 0.5)) / 3;
  state.confidenceBias = Number(clamp(overallBias * 24, -12, 12).toFixed(4));

  return state;
}

function applyTrainingOutcome(
  state: SignalTrainingState,
  action: TradeSignal,
  entryPrice: number,
  currentPrice: number
): SignalTrainingState {
  if (!(entryPrice > 0) || !(currentPrice > 0)) {
    return state;
  }

  const returnPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  const success = evaluateSignalOutcome(action, returnPercent);

  if (action === "Buy") {
    state.buyObservations += 1;
    if (success) state.buySuccesses += 1;
  } else if (action === "Sell") {
    state.sellObservations += 1;
    if (success) state.sellSuccesses += 1;
  } else {
    state.holdObservations += 1;
    if (success) state.holdSuccesses += 1;
  }

  return recomputeAdaptiveState(state);
}

async function saveSignalTrainingState(state: SignalTrainingState): Promise<void> {
  await ensureSignalTrainingSchema();

  const nowIso = new Date().toISOString();
  await pool.query(
    `INSERT INTO ${TABLE_NAME} (
      market,
      symbol,
      last_signal_action,
      last_signal_confidence,
      last_signal_source,
      last_signal_emitted_at,
      last_signal_entry_price,
      last_observed_price,
      last_observed_at,
      buy_observations,
      buy_successes,
      hold_observations,
      hold_successes,
      sell_observations,
      sell_successes,
      buy_threshold,
      sell_threshold,
      confidence_bias,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
    )
    ON CONFLICT (market, symbol)
    DO UPDATE SET
      last_signal_action = EXCLUDED.last_signal_action,
      last_signal_confidence = EXCLUDED.last_signal_confidence,
      last_signal_source = EXCLUDED.last_signal_source,
      last_signal_emitted_at = EXCLUDED.last_signal_emitted_at,
      last_signal_entry_price = EXCLUDED.last_signal_entry_price,
      last_observed_price = EXCLUDED.last_observed_price,
      last_observed_at = EXCLUDED.last_observed_at,
      buy_observations = EXCLUDED.buy_observations,
      buy_successes = EXCLUDED.buy_successes,
      hold_observations = EXCLUDED.hold_observations,
      hold_successes = EXCLUDED.hold_successes,
      sell_observations = EXCLUDED.sell_observations,
      sell_successes = EXCLUDED.sell_successes,
      buy_threshold = EXCLUDED.buy_threshold,
      sell_threshold = EXCLUDED.sell_threshold,
      confidence_bias = EXCLUDED.confidence_bias,
      updated_at = EXCLUDED.updated_at`,
    [
      state.market,
      state.symbol,
      state.lastSignalAction,
      Math.round(state.lastSignalConfidence),
      state.lastSignalSource,
      state.lastSignalEmittedAt,
      state.lastSignalEntryPrice,
      state.lastObservedPrice,
      state.lastObservedAt,
      state.buyObservations,
      state.buySuccesses,
      state.holdObservations,
      state.holdSuccesses,
      state.sellObservations,
      state.sellSuccesses,
      state.buyThreshold,
      state.sellThreshold,
      state.confidenceBias,
      nowIso,
    ]
  );

  stateCache.set(cacheKey(state.market, state.symbol), {
    expiresAt: Date.now() + CACHE_TTL_MS,
    state: { ...state },
  });
}

export async function getSignalTrainingState(market: string, symbol: string): Promise<SignalTrainingState> {
  const key = cacheKey(market, symbol);
  const cached = stateCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.state };
  }

  await ensureSignalTrainingSchema();
  const normalizedMarket = market.trim().toUpperCase() || "GLOBAL";
  const normalizedSymbol = symbol.trim().toUpperCase();
  const result = await pool.query(
    `SELECT * FROM ${TABLE_NAME} WHERE market = $1 AND symbol = $2 LIMIT 1`,
    [normalizedMarket, normalizedSymbol]
  );

  const state = result.rows[0]
    ? mapRowToState(result.rows[0] as Record<string, unknown>, normalizedMarket, normalizedSymbol)
    : createDefaultState(normalizedMarket, normalizedSymbol);

  stateCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    state: { ...state },
  });

  return state;
}

export function calibrateSignalDecision(
  decision: SignalDecision,
  state: SignalTrainingState
): SignalDecision {
  const actionRate = getActionSuccessRate(state, decision.signalAction);
  const actionBias = actionRate == null ? 0 : (actionRate - 0.5) * 18;

  return {
    ...decision,
    signalConfidence: Math.round(
      clamp(decision.signalConfidence + state.confidenceBias + actionBias, 15, 99)
    ),
  };
}

export function getAdaptiveThresholds(state: SignalTrainingState): {
  buyThreshold: number;
  sellThreshold: number;
} {
  return {
    buyThreshold: state.buyThreshold || DEFAULT_BUY_THRESHOLD,
    sellThreshold: state.sellThreshold || DEFAULT_SELL_THRESHOLD,
  };
}

export async function recordSignalSnapshot(input: {
  market: string;
  symbol: string;
  currentPrice: number;
  signal: SignalDecision;
  previousState: SignalTrainingState;
}): Promise<SignalSnapshot> {
  const { currentPrice, signal } = input;
  const state: SignalTrainingState = {
    ...input.previousState,
  };
  const nowIso = new Date().toISOString();

  const hasPreviousEmission =
    Boolean(state.lastSignalEmittedAt) &&
    state.lastSignalEntryPrice > 0;

  if (hasPreviousEmission && state.lastSignalAction !== signal.signalAction) {
    applyTrainingOutcome(
      state,
      state.lastSignalAction,
      state.lastSignalEntryPrice,
      currentPrice
    );
    state.lastSignalEmittedAt = nowIso;
    state.lastSignalEntryPrice = currentPrice;
  } else if (!state.lastSignalEmittedAt) {
    state.lastSignalEmittedAt = nowIso;
    state.lastSignalEntryPrice = currentPrice;
  }

  state.lastSignalAction = signal.signalAction;
  state.lastSignalConfidence = signal.signalConfidence;
  state.lastSignalSource = signal.signalSource;
  state.lastObservedPrice = currentPrice;
  state.lastObservedAt = nowIso;

  await saveSignalTrainingState(state);

  const signalReturnPercent =
    state.lastSignalEntryPrice > 0
      ? ((currentPrice - state.lastSignalEntryPrice) / state.lastSignalEntryPrice) * 100
      : 0;

  return {
    ...signal,
    signalEmittedAt: state.lastSignalEmittedAt ?? nowIso,
    signalEntryPrice: state.lastSignalEntryPrice,
    signalReturnPercent: Number(signalReturnPercent.toFixed(2)),
  };
}
