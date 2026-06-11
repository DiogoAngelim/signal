/**
 * Portfolio & Risk Layer — Type Definitions
 *
 * This module defines the canonical types for the Portfolio & Risk layer,
 * which is the SINGLE authoritative place where financial decisions are made.
 *
 * Signal ≠ Decision ≠ Execution
 * Risk is the single source of financial truth.
 */

// ── Signal Schema (BLACK BOX output) ────────────────────────────────

export type SignalDirection = "long" | "short" | "flat";

export type SignalHorizon = "scalp" | "intraday" | "swing";

export type Signal = {
  asset: string;
  direction: SignalDirection;
  strength: number;
  confidence: number;
  timestamp: number;
  horizon?: SignalHorizon;
};

export type ValidatedSignal = Signal & {
  _validated: true;
  _validationWarnings: string[];
};

// ── Position Schema (Portfolio & Risk output) ────────────────────────

export type PositionDirection = "long" | "short";

export type Position = {
  asset: string;
  size: number;
  direction: PositionDirection;
};

// ── Portfolio & Risk Configuration ───────────────────────────────────

export type PortfolioRiskConfig = {
  /** Maximum exposure per asset as fraction of total equity (0-1) */
  maxExposurePerAsset: number;
  /** Maximum total portfolio exposure as fraction of total equity (0-1) */
  maxTotalExposure: number;
  /** Minimum confidence threshold to open a position (0-1) */
  minConfidence: number;
  /** Minimum strength threshold to open a position (0-1) */
  minStrength: number;
  /** Cooldown duration in milliseconds per asset after a position is opened */
  cooldownMs: number;
  /** Base position size as fraction of equity per unit of confidence*strength */
  baseSizeFraction: number;
};

export const DEFAULT_PORTFOLIO_RISK_CONFIG: PortfolioRiskConfig = {
  maxExposurePerAsset: 0.2,
  maxTotalExposure: 0.65,
  minConfidence: 0.3,
  minStrength: 0.2,
  cooldownMs: 60_000,
  baseSizeFraction: 0.05,
};

// ── Portfolio & Risk Engine Input/Output ─────────────────────────────

export type PortfolioRiskInput = {
  signals: ValidatedSignal[];
  equity: number;
  availableEquity: number;
  currentExposureByAsset: Record<string, number>;
  totalCurrentExposure: number;
  lastTradeTimestampByAsset: Record<string, number>;
  nowMs: number;
  config?: Partial<PortfolioRiskConfig>;
};

export type PositionDecision = {
  position: Position;
  signal: ValidatedSignal;
  reasons: string[];
};

export type RejectedSignal = {
  signal: ValidatedSignal;
  reasons: string[];
};

export type PortfolioRiskResult = {
  positions: PositionDecision[];
  rejected: RejectedSignal[];
  totalExposure: number;
  exposureByAsset: Record<string, number>;
};

// ── Monitoring Types (minimal) ───────────────────────────────────────

export type SignalOutcomeLog = {
  signalAsset: string;
  signalDirection: SignalDirection;
  signalConfidence: number;
  signalStrength: number;
  signalTimestamp: number;
  positionSize: number;
  positionDirection: PositionDirection;
  evaluatedAt: string;
  reasons: string[];
};

export type ExecutionLog = {
  positionAsset: string;
  positionDirection: PositionDirection;
  positionSize: number;
  orderId: string;
  status: "submitted" | "filled" | "partially_filled" | "failed" | "rejected";
  submittedAt: string;
  fillPrice?: number;
  slippageBps?: number;
};

export type PnlRecord = {
  asset: string;
  realizedPnl: number;
  unrealizedPnl: number;
  totalExposure: number;
  timestamp: string;
};
