/**
 * Portfolio & Risk Layer — Position Decisions
 *
 * This layer is the SINGLE authority for:
 *   - Position sizing (how much capital per trade)
 *   - Capital allocation (total portfolio allocation)
 *   - Exposure control (max exposure limits, concentration limits)
 *   - Portfolio normalization (scaling positions to portfolio size)
 *   - Risk constraints (stop-loss, max drawdown, VaR limits)
 *
 * Signal cannot bypass this layer.
 *
 * Output type: PositionDecision
 *
 * Flow: SignalOpportunity → Portfolio & Risk → PositionDecision
 */
import type {
  PortfolioConfig,
  PositionDecision,
  RiskConstraints,
  SignalLifecycle,
  SignalOpportunity,
  StockQuote,
  TradeSignal,
} from "./types";

// ─── Re-export governance from signal-lifecycle-governance ───────
export {
  governSignalDecision,
  applyLifecycleToSignal,
} from "./signal-lifecycle-governance";

// ─── Re-export lifecycle helper from stock-data ──────────────────
export { deriveLifecycleState } from "./stock-data";

// ─── Default portfolio configuration ─────────────────────────────

/**
 * Default portfolio configuration for a hedge-fund-grade system.
 * These values represent conservative institutional defaults.
 */
export const DEFAULT_PORTFOLIO_CONFIG: PortfolioConfig = {
  totalCapital: 1_000_000,
  maxPositionPct: 0.10,
  maxExposurePct: 1.0,
  maxDrawdownPct: 0.20,
  stopLossPct: 0.05,
  maxPositions: 50,
};

// ─── Portfolio metrics computation ────────────────────────────────

function mean(values: number[]): number {
  return values.length
    ? values.reduce((sum, v) => sum + v, 0) / values.length
    : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1),
  );
}

function returnsFromHistory(history: number[] | undefined): number[] {
  const prices = (history ?? []).filter(
    (p) => Number.isFinite(p) && p > 0,
  );
  if (prices.length < 2) return [];
  return prices
    .slice(1)
    .map((p, i) => (p - prices[i]) / prices[i])
    .filter(Number.isFinite);
}

function stabilizedRatio(returns: number[], downsideOnly = false): number {
  if (returns.length < 2) return 0;
  const downside = returns.filter((v) => v < 0);
  const vol = downsideOnly
    ? Math.sqrt(mean((downside.length ? downside : [0]).map((v) => v ** 2)))
    : standardDeviation(returns);
  const sampleWeight = Math.min(Math.max(returns.length / (returns.length + 20), 0), 1);
  const annualization = Math.sqrt(Math.min(Math.max(returns.length, 1), 30));
  const raw = (mean(returns) / Math.max(vol, 0.006)) * annualization;
  return Number(Math.max(-4, Math.min(4, raw * sampleWeight)).toFixed(2));
}

function maxDrawdownFromReturns(returns: number[]): number {
  let value = 1;
  let peak = 1;
  let maxDD = 0;
  for (const r of returns) {
    value *= 1 + r;
    peak = Math.max(peak, value);
    maxDD = Math.max(maxDD, peak > 0 ? (peak - value) / peak : 0);
  }
  return maxDD;
}

/**
 * Computes live portfolio metrics from a quote's history.
 * These metrics inform position sizing and risk decisions.
 */
export function computeLiveMetrics(quote: StockQuote): PositionDecision["liveMetrics"] {
  const returns = returnsFromHistory(quote.history).slice(-30);
  const winReturns = returns.filter((v) => v > 0);
  const lossReturns = returns.filter((v) => v < 0);
  const grossWins = winReturns.reduce((s, v) => s + v, 0);
  const grossLosses = Math.abs(lossReturns.reduce((s, v) => s + v, 0));
  const profitFactor =
    grossLosses > 0 ? grossWins / grossLosses : winReturns.length ? 4 : 1;
  const maxDD = maxDrawdownFromReturns(returns) * 100;
  const avgReturn = mean(returns);

  return {
    rollingSharpe: stabilizedRatio(returns),
    rollingSortino: stabilizedRatio(returns, true),
    hitRate: Number(
      (returns.length
        ? (winReturns.length / returns.length) * 100
        : 50
      ).toFixed(1),
    ),
    expectancy: Number((avgReturn * 100).toFixed(2)),
    profitFactor: Number(Math.min(9.99, profitFactor).toFixed(2)),
    maxDrawdown: Number(maxDD.toFixed(2)),
  };
}

// ─── Position Sizing ─────────────────────────────────────────────

/**
 * Computes position size using confidence-weighted allocation.
 *
 * Formula:
 *   baseSize = totalCapital × maxPositionPct
 *   adjustedSize = baseSize × allocationMultiplier × confidenceWeight
 *   finalSize = min(adjustedSize, maxNotional)
 *
 * This ensures:
 *   - No single position exceeds maxPositionPct of capital
 *   - Higher confidence → larger allocation (conviction sizing)
 *   - Allocation multiplier from governance is respected
 *   - Hard cap from risk constraints is never exceeded
 */
export function computePositionSize(
  opportunity: SignalOpportunity,
  config: PortfolioConfig,
  allocationMultiplier: number,
  currentExposurePct: number,
): number {
  if (opportunity.action === "Hold") return 0;

  const baseSize = config.totalCapital * config.maxPositionPct;
  const confidenceWeight = opportunity.confidence / 100;
  const adjustedSize = baseSize * allocationMultiplier * confidenceWeight;

  // Enforce max position size
  const maxNotional = config.totalCapital * config.maxPositionPct;
  const positionSize = Math.min(adjustedSize, maxNotional);

  // Check if adding this position would exceed max exposure
  const newExposurePct = currentExposurePct + (positionSize / config.totalCapital);
  if (newExposurePct > config.maxExposurePct) {
    // Scale down to fit within exposure limit
    const remainingCapacity = (config.maxExposurePct - currentExposurePct) * config.totalCapital;
    return Math.max(0, remainingCapacity);
  }

  return Math.max(0, positionSize);
}

// ─── Exposure Control ────────────────────────────────────────────

/**
 * Computes current portfolio exposure as a fraction of total capital.
 *
 * Exposure = sum of all position notionals / totalCapital
 *
 * This is used to enforce maxExposurePct limits.
 */
export function computeExposure(
  positionNotionals: number[],
  totalCapital: number,
): number {
  if (totalCapital <= 0) return 0;
  const totalExposure = positionNotionals.reduce((sum, n) => sum + n, 0);
  return totalExposure / totalCapital;
}

/**
 * Checks whether a new position would exceed exposure limits.
 */
export function checkExposureLimit(
  newNotional: number,
  currentExposurePct: number,
  config: PortfolioConfig,
): { allowed: boolean; newExposurePct: number } {
  const additionalPct = newNotional / config.totalCapital;
  const newExposurePct = currentExposurePct + additionalPct;
  return {
    allowed: newExposurePct <= config.maxExposurePct,
    newExposurePct,
  };
}

// ─── Risk Constraints ────────────────────────────────────────────

/**
 * Computes risk constraints for a position.
 *
 * These are HARD limits that cannot be exceeded:
 *   - maxNotional: maximum position size in capital units
 *   - stopLossPrice: price at which position must be exited
 *   - portfolioExposurePct: resulting portfolio exposure after this position
 *   - allowed: whether the position passes all risk checks
 */
export function computeRiskConstraints(
  opportunity: SignalOpportunity,
  positionSize: number,
  entryPrice: number,
  currentExposurePct: number,
  config: PortfolioConfig,
): RiskConstraints {
  const maxNotional = config.totalCapital * config.maxPositionPct;
  const stopLossPrice = opportunity.action === "Buy"
    ? entryPrice * (1 - config.stopLossPct)
    : entryPrice * (1 + config.stopLossPct);
  const portfolioExposurePct = currentExposurePct + (positionSize / config.totalCapital);

  // Risk checks
  const checks: { allowed: boolean; reason?: string }[] = [
    {
      allowed: positionSize <= maxNotional,
      reason: positionSize > maxNotional
        ? `Position size ${positionSize.toFixed(0)} exceeds max notional ${maxNotional.toFixed(0)}`
        : undefined,
    },
    {
      allowed: portfolioExposurePct <= config.maxExposurePct,
      reason: portfolioExposurePct > config.maxExposurePct
        ? `Portfolio exposure ${(portfolioExposurePct * 100).toFixed(1)}% exceeds limit ${(config.maxExposurePct * 100).toFixed(1)}%`
        : undefined,
    },
    {
      allowed: opportunity.action !== "Hold",
      reason: opportunity.action === "Hold"
        ? "Hold signals do not require positions"
        : undefined,
    },
  ];

  const failedCheck = checks.find((c) => !c.allowed);
  return {
    maxNotional,
    stopLossPrice: Number(stopLossPrice.toFixed(4)),
    portfolioExposurePct,
    allowed: !failedCheck,
    reason: failedCheck?.reason,
  };
}

// ─── Portfolio Normalization ──────────────────────────────────────

/**
 * Normalizes a position size to fit within portfolio constraints.
 *
 * This scales down positions that would exceed limits while
 * preserving the relative allocation between positions.
 */
export function normalizePositionSize(
  positionSize: number,
  config: PortfolioConfig,
  currentExposurePct: number,
): number {
  const maxNotional = config.totalCapital * config.maxPositionPct;
  const cappedByPosition = Math.min(positionSize, maxNotional);
  const remainingCapacity = Math.max(
    0,
    (config.maxExposurePct - currentExposurePct) * config.totalCapital,
  );
  return Math.min(cappedByPosition, remainingCapacity);
}

// ─── Lifecycle State ─────────────────────────────────────────────

/**
 * Derives lifecycle state from a quote.
 * This is a Portfolio & Risk responsibility because lifecycle
 * state governs position management decisions.
 */
function deriveLifecycleStateFromQuote(quote: StockQuote): SignalLifecycle {
  const emittedAt = Date.parse(quote.signalEmittedAt ?? "");
  const ageMs = Number.isFinite(emittedAt) ? Date.now() - emittedAt : 0;
  const returnPercent = Number(quote.signalReturnPercent ?? 0);

  if (Math.abs(returnPercent) >= 3) return "COMPLETED";
  if (!quote.signalEmittedAt || ageMs < 3 * 60_000) return "EMITTED";
  if (quote.signalAction === "Hold" && ageMs > 10 * 60_000) return "DECAYING";
  if (ageMs > 90 * 60_000) return "DECAYING";
  return "ACTIVE";
}

// ─── Main Entry Point ────────────────────────────────────────────

/**
 * Evaluates a position decision from a signal opportunity.
 * This is the Portfolio & Risk layer's main entry point.
 *
 * It performs ALL portfolio & risk responsibilities:
 *   1. Position sizing (how much capital)
 *   2. Capital allocation (within portfolio limits)
 *   3. Exposure control (max exposure check)
 *   4. Risk constraints (stop-loss, max notional)
 *   5. Portfolio normalization (scale to fit)
 */
export function evaluatePosition(
  opportunity: SignalOpportunity,
  quote: StockQuote,
  governedSignal: {
    direction: TradeSignal;
    confidence: number;
    allocationMultiplier: number;
    canOpenNewTrades: boolean;
    modelId: string;
    modelLifecycleState: string;
    modelLifecycleAction: string;
  },
  config: PortfolioConfig = DEFAULT_PORTFOLIO_CONFIG,
  currentExposurePct: number = 0,
): PositionDecision {
  // 1. Compute position size (how much capital to allocate)
  const rawPositionSize = computePositionSize(
    opportunity,
    config,
    governedSignal.allocationMultiplier,
    currentExposurePct,
  );

  // 2. Normalize to fit within portfolio constraints
  const positionSize = normalizePositionSize(
    rawPositionSize,
    config,
    currentExposurePct,
  );

  // 3. Compute target notional
  const entryPrice = opportunity.entryPrice > 0 ? opportunity.entryPrice : quote.price;
  const targetNotional = opportunity.action !== "Hold"
    ? positionSize
    : 0;

  // 4. Compute risk constraints (exposure control, stop-loss)
  const riskConstraints = computeRiskConstraints(
    opportunity,
    positionSize,
    entryPrice,
    currentExposurePct,
    config,
  );

  // 5. If risk constraints disallow, zero out the position
  const finalPositionSize = riskConstraints.allowed ? positionSize : 0;
  const finalTargetNotional = riskConstraints.allowed ? targetNotional : 0;

  return {
    symbol: opportunity.symbol,
    direction: governedSignal.direction,
    confidence: governedSignal.confidence,
    allocationMultiplier: governedSignal.allocationMultiplier,
    canOpenNewTrades: governedSignal.canOpenNewTrades,
    lifecycleState: deriveLifecycleStateFromQuote(quote),
    modelId: governedSignal.modelId,
    modelLifecycleState: governedSignal.modelLifecycleState,
    modelLifecycleAction: governedSignal.modelLifecycleAction,
    positionSize: finalPositionSize,
    targetNotional: finalTargetNotional,
    riskConstraints,
    liveMetrics: computeLiveMetrics(quote),
  };
}