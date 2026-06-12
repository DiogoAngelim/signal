/**
 * Shared types for the Stocks Optimizer pipeline.
 *
 * These types define the contracts between layers:
 *   Market Data → Alpha → Portfolio & Risk → Execution → Monitoring
 *
 * The `StockQuote` type is preserved for backward compatibility
 * with the frontend and existing consumers.
 */

// ─── Trade Signal ───────────────────────────────────────────────

export type TradeSignal = "Buy" | "Hold" | "Sell";

// ─── Adaptive Regime ────────────────────────────────────────────

export type AdaptiveRegime =
  | "TRENDING"
  | "MEAN_REVERTING"
  | "HIGH_VOL"
  | "LOW_VOL"
  | "BREAKOUT"
  | "PANIC"
  | "COMPRESSION";

// ─── Signal Lifecycle ───────────────────────────────────────────

export type SignalLifecycle =
  | "EMITTED"
  | "ACTIVE"
  | "DECAYING"
  | "INVALIDATED"
  | "COMPLETED";

// ─── Stock List ────────────────────────────────────────────────

export interface StockListItem {
  symbol: string;
  name: string;
  market?: string;
  sector?: string;
  image?: string;
  exchange: string;
  country: string;
}

// ─── Stock Quote (backward compatible) ──────────────────────────

export interface StockQuote {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  changePercent: number;
  status: "Stable" | "Rising" | "Watch" | "Dip";
  high52: number;
  low52: number;
  history: number[];
  summary: string;
  impact: string;
  cap?: string;
  peRatio?: number;
  signalAction?: TradeSignal;
  signalConfidence?: number;
  signalSource?: "node-ecu" | "heuristic";
  signalEmittedAt?: string;
  signalEntryPrice?: number;
  signalReturnPercent?: number;
  modelId?: string;
  modelLifecycleState?: string;
  modelLifecycleAction?: string;
  modelLifecycleReason?: string;
  modelCanOpenNewTrades?: boolean;
  modelAllocationMultiplier?: number;
  quoteSource?: "binance-spot" | "binance-futures" | "tradingview";
  regime?: AdaptiveRegime;
  confidence?: number;
  uncertainty?: number;
  driftScore?: number;
  stabilityScore?: number;
  expectedMovePct?: number;
  featureConsensus?: number;
  ensembleAgreement?: number;
  lifecycleState?: SignalLifecycle;
  liveMetrics?: {
    rollingSharpe: number;
    rollingSortino: number;
    hitRate: number;
    expectancy: number;
    profitFactor: number;
    maxDrawdown: number;
  };
  diagnostics?: {
    entropy: number;
    featureDrift: number;
    predictionResidual: number;
    volatilityShift: number;
  };
}

// ─── Market Data ────────────────────────────────────────────────

export interface MarketDailyCandle {
  market: string;
  venue: string;
  asset: string;
  timestampUtc: string | Date;
  close: number;
}

export interface QuoteFetchOptions {
  bypassCache?: boolean;
  deadlineAt?: number;
  minRemainingMs?: number;
}

export interface SignalAttachOptions {
  bypassSignalCache?: boolean;
  deadlineAt?: number;
  minRemainingMs?: number;
  recordSignalSnapshots?: boolean;
}

// ─── Signal Decision (internal) ─────────────────────────────────

export type SignalDecision = {
  signalAction: TradeSignal;
  signalConfidence: number;
  signalSource: "node-ecu" | "heuristic";
};

// ─── Signal Snapshot (internal) ─────────────────────────────────

export type SignalSnapshot = Pick<
  StockQuote,
  | "signalAction"
  | "signalConfidence"
  | "signalSource"
  | "signalEmittedAt"
  | "signalEntryPrice"
  | "signalReturnPercent"
  | "modelId"
  | "modelLifecycleState"
  | "modelLifecycleAction"
  | "modelLifecycleReason"
  | "modelCanOpenNewTrades"
  | "modelAllocationMultiplier"
>;

// ─── Pipeline Layer Types ───────────────────────────────────────

/**
 * Alpha layer output: a trading opportunity identified by the signal.
 * Alpha does NOT control money — it only identifies opportunities.
 */
export interface SignalOpportunity {
  symbol: string;
  action: TradeSignal;
  confidence: number;
  source: "node-ecu" | "heuristic";
  regime: AdaptiveRegime;
  emittedAt: string;
  entryPrice: number;
}

/**
 * Portfolio configuration — defines capital and risk limits.
 * This is the SINGLE source of truth for portfolio constraints.
 */
export interface PortfolioConfig {
  /** Total capital available for allocation */
  totalCapital: number;
  /** Maximum fraction of capital per single position (0-1) */
  maxPositionPct: number;
  /** Maximum total exposure as fraction of capital (0-1+) */
  maxExposurePct: number;
  /** Maximum portfolio drawdown before risk reduction (0-1) */
  maxDrawdownPct: number;
  /** Default stop-loss as fraction of entry price (0-1) */
  stopLossPct: number;
  /** Maximum number of concurrent positions */
  maxPositions: number;
}

/**
 * Risk constraints applied to a position.
 * These are the hard limits that cannot be exceeded.
 */
export interface RiskConstraints {
  /** Maximum notional value for this position */
  maxNotional: number;
  /** Stop-loss price level */
  stopLossPrice: number;
  /** Maximum portfolio exposure after this position */
  portfolioExposurePct: number;
  /** Whether position is allowed under current risk limits */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: string;
}

/**
 * Portfolio & Risk layer output: a position decision after governance.
 * This is the SINGLE authority for sizing, exposure, and allocation.
 */
export interface PositionDecision {
  symbol: string;
  direction: TradeSignal;
  confidence: number;
  allocationMultiplier: number;
  canOpenNewTrades: boolean;
  lifecycleState: SignalLifecycle;
  modelId: string;
  modelLifecycleState: string;
  modelLifecycleAction: string;
  /** Position size in capital units (how much money to allocate) */
  positionSize: number;
  /** Target notional value of the position */
  targetNotional: number;
  /** Risk constraints applied to this position */
  riskConstraints: RiskConstraints;
  liveMetrics: {
    rollingSharpe: number;
    rollingSortino: number;
    hitRate: number;
    expectancy: number;
    profitFactor: number;
    maxDrawdown: number;
  };
}

/**
 * Execution layer output: assessment of execution conditions.
 */
export interface ExecutionAssessment {
  symbol: string;
  summary: string;
  impact: string;
  spread: { bid: number; ask: number };
}

/**
 * Monitoring layer output: diagnostic snapshot.
 */
export interface DiagnosticsSnapshot {
  entropy: number;
  featureDrift: number;
  predictionResidual: number;
  volatilityShift: number;
  stabilityScore: number;
  driftScore: number;
  uncertainty: number;
  featureConsensus: number;
  ensembleAgreement: number;
  expectedMovePct: number;
}