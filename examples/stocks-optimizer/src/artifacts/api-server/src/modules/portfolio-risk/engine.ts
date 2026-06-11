/**
 * Portfolio & Risk Engine — THE CORE SYSTEM
 *
 * This is the SINGLE authoritative module where financial decisions exist.
 * Converts ValidatedSignal → Position with deterministic rules.
 *
 * Rules:
 * - Position sizing based on confidence + strength
 * - Enforce max exposure per asset
 * - Enforce total portfolio exposure limits
 * - Enforce cooldown per asset
 * - Deterministic outputs only (no randomness)
 *
 * ALL financial decision logic MUST live here.
 */

import type {
  PortfolioRiskConfig,
  PortfolioRiskInput,
  PortfolioRiskResult,
  Position,
  PositionDecision,
  PositionDirection,
  RejectedSignal,
  ValidatedSignal,
} from "./types";
import { DEFAULT_PORTFOLIO_RISK_CONFIG } from "./types";

/**
 * Evaluate a batch of validated signals and produce position decisions.
 *
 * This is the main entry point for the Portfolio & Risk layer.
 * It is fully deterministic: same inputs always produce same outputs.
 */
export function evaluatePortfolioRisk(
  input: PortfolioRiskInput,
): PortfolioRiskResult {
  const config = resolveConfig(input.config);
  const positions: PositionDecision[] = [];
  const rejected: RejectedSignal[] = [];
  const exposureByAsset: Record<string, number> = {
    ...input.currentExposureByAsset,
  };
  let totalExposure = input.totalCurrentExposure;

  for (const signal of input.signals) {
    const decision = evaluateSignal(signal, {
      config,
      equity: input.equity,
      availableEquity: input.availableEquity,
      exposureByAsset,
      totalExposure,
      lastTradeTimestampByAsset: input.lastTradeTimestampByAsset,
      nowMs: input.nowMs,
    });

    if (decision.accepted) {
      positions.push(decision.position);
      // Track exposure for subsequent signals in this batch
      const assetKey = signal.asset.toUpperCase();
      exposureByAsset[assetKey] =
        (exposureByAsset[assetKey] ?? 0) + decision.position.position.size;
      totalExposure += decision.position.position.size;
    } else {
      rejected.push({
        signal,
        reasons: decision.rejectionReasons,
      });
    }
  }

  return {
    positions,
    rejected,
    totalExposure,
    exposureByAsset,
  };
}

// ── Internal ────────────────────────────────────────────────────────

type SignalEvaluationContext = {
  config: PortfolioRiskConfig;
  equity: number;
  availableEquity: number;
  exposureByAsset: Record<string, number>;
  totalExposure: number;
  lastTradeTimestampByAsset: Record<string, number>;
  nowMs: number;
};

type SignalEvaluationResult = {
  accepted: boolean;
  position?: PositionDecision;
  rejectionReasons: string[];
};

function evaluateSignal(
  signal: ValidatedSignal,
  ctx: SignalEvaluationContext,
): SignalEvaluationResult {
  const reasons: string[] = [];
  const rejectionReasons: string[] = [];

  // Flat signals never produce positions
  if (signal.direction === "flat") {
    return {
      accepted: false,
      rejectionReasons: ["flat_direction_no_position"],
    };
  }

  // Minimum confidence check
  if (signal.confidence < ctx.config.minConfidence) {
    rejectionReasons.push(
      `confidence_below_threshold:${signal.confidence.toFixed(3)}<${ctx.config.minConfidence}`,
    );
  }

  // Minimum strength check
  if (signal.strength < ctx.config.minStrength) {
    rejectionReasons.push(
      `strength_below_threshold:${signal.strength.toFixed(3)}<${ctx.config.minStrength}`,
    );
  }

  // Cooldown check
  const assetKey = signal.asset.toUpperCase();
  const lastTradeTs = ctx.lastTradeTimestampByAsset[assetKey] ?? 0;
  const cooldownRemaining = lastTradeTs + ctx.config.cooldownMs - ctx.nowMs;
  if (cooldownRemaining > 0) {
    rejectionReasons.push(`cooldown_active:${cooldownRemaining}ms_remaining`);
  }

  // If any hard rejection, return early
  if (rejectionReasons.length > 0) {
    return { accepted: false, rejectionReasons };
  }

  // ── Position Sizing ──────────────────────────────────────────────
  // Size = baseSizeFraction * confidence * strength * equity
  // This is deterministic: same inputs → same size always
  const rawSize =
    ctx.config.baseSizeFraction *
    signal.confidence *
    signal.strength *
    ctx.equity;

  // ── Max Exposure Per Asset ────────────────────────────────────────
  const currentAssetExposure = ctx.exposureByAsset[assetKey] ?? 0;
  const maxAssetExposure = ctx.config.maxExposurePerAsset * ctx.equity;
  const remainingAssetCapacity = Math.max(
    0,
    maxAssetExposure - currentAssetExposure,
  );
  const sizeAfterAssetCap = Math.min(rawSize, remainingAssetCapacity);

  if (sizeAfterAssetCap <= 0 && rawSize > 0) {
    rejectionReasons.push("max_exposure_per_asset_reached");
    return { accepted: false, rejectionReasons };
  }

  // ── Max Total Portfolio Exposure ───────────────────────────────────
  const maxTotalExposure = ctx.config.maxTotalExposure * ctx.equity;
  const remainingTotalCapacity = Math.max(
    0,
    maxTotalExposure - ctx.totalExposure,
  );
  const finalSize = Math.min(sizeAfterAssetCap, remainingTotalCapacity);

  if (finalSize <= 0 && rawSize > 0) {
    rejectionReasons.push("max_total_exposure_reached");
    return { accepted: false, rejectionReasons };
  }

  // ── Available Equity Cap ──────────────────────────────────────────
  const cappedSize = Math.min(finalSize, ctx.availableEquity);

  if (cappedSize <= 0) {
    rejectionReasons.push("no_available_equity");
    return { accepted: false, rejectionReasons };
  }

  // Round to 8 decimal places for financial precision
  const positionSize = round8(cappedSize);

  const position: Position = {
    asset: signal.asset,
    size: positionSize,
    direction:
      signal.direction === "long" ? "long" : ("short" as PositionDirection),
  };

  reasons.push(
    `sized_from_confidence_${signal.confidence.toFixed(3)}_strength_${signal.strength.toFixed(3)}`,
  );
  if (positionSize < rawSize) {
    reasons.push(
      `size_reduced_from_${round8(rawSize)}_to_${positionSize}_due_to_limits`,
    );
  }

  return {
    accepted: true,
    position: {
      position,
      signal,
      reasons,
    },
    rejectionReasons: [],
  };
}

function resolveConfig(
  partial?: Partial<PortfolioRiskConfig>,
): PortfolioRiskConfig {
  if (!partial) return DEFAULT_PORTFOLIO_RISK_CONFIG;
  return {
    maxExposurePerAsset:
      partial.maxExposurePerAsset ??
      DEFAULT_PORTFOLIO_RISK_CONFIG.maxExposurePerAsset,
    maxTotalExposure:
      partial.maxTotalExposure ??
      DEFAULT_PORTFOLIO_RISK_CONFIG.maxTotalExposure,
    minConfidence:
      partial.minConfidence ?? DEFAULT_PORTFOLIO_RISK_CONFIG.minConfidence,
    minStrength:
      partial.minStrength ?? DEFAULT_PORTFOLIO_RISK_CONFIG.minStrength,
    cooldownMs: partial.cooldownMs ?? DEFAULT_PORTFOLIO_RISK_CONFIG.cooldownMs,
    baseSizeFraction:
      partial.baseSizeFraction ??
      DEFAULT_PORTFOLIO_RISK_CONFIG.baseSizeFraction,
  };
}

function round8(value: number): number {
  return Number(value.toFixed(8));
}
