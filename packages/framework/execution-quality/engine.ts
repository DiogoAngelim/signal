import { clamp, mean } from "../math/statistics";

export type ExecutionQualityStatus = "blocked" | "poor" | "acceptable" | "good" | "excellent";

export type RecommendedExecutionMode =
  | "do_not_execute"
  | "wait"
  | "limit_only"
  | "small_probe"
  | "scale_in"
  | "normal";

export type ExecutionQualityInput = {
  action?: string;
  entryQuality?: number | null;
  exitQuality?: number | null;
  liquidityQuality?: number | null;
  slippageRisk?: number | null;
  volatilityRisk?: number | null;
  timingUrgency?: number | null;
  scalingQuality?: number | null;
  invalidationClarity?: number | null;
  executionReadiness?: number | null;
  marketImpactRisk?: number | null;
  staleDataRisk?: number | null;
  spreadRisk?: number | null;
  blockers?: string[];
  warnings?: string[];
  maxSlippageRisk?: number;
  maxStaleDataRisk?: number;
};

export type ExecutionQualityResult = {
  score: number;
  status: ExecutionQualityStatus;
  entryQuality: number;
  exitQuality: number;
  liquidityQuality: number;
  slippageRisk: number;
  volatilityRisk: number;
  timingUrgency: number;
  scalingQuality: number;
  invalidationClarity: number;
  blockers: string[];
  warnings: string[];
  recommendedExecutionMode: RecommendedExecutionMode;
  explanation: string;
  audit: Record<string, unknown>;
};

const WEIGHTS = {
  entryQuality: 0.14,
  exitQuality: 0.12,
  liquidityQuality: 0.14,
  slippageSafety: 0.12,
  volatilitySafety: 0.1,
  timingFit: 0.08,
  scalingQuality: 0.1,
  invalidationClarity: 0.12,
  executionReadiness: 0.1,
  marketImpactSafety: 0.04,
  staleDataSafety: 0.04,
};

/**
 * Scores whether a proposed action can be executed cleanly.
 * It does not judge whether the opportunity itself is attractive.
 *
 * @example
 * const execution = evaluateExecutionQuality({
 *   entryQuality: 76,
 *   liquidityQuality: 84,
 *   slippageRisk: 18,
 *   invalidationClarity: 80,
 * });
 * execution.recommendedExecutionMode; // "scale_in" or "normal"
 */
export function evaluateExecutionQuality(input: ExecutionQualityInput = {}): ExecutionQualityResult {
  const entryQuality = score(input.entryQuality, 50);
  const exitQuality = score(input.exitQuality, 55);
  const liquidityQuality = score(input.liquidityQuality, 50);
  const slippageRisk = score(input.slippageRisk ?? input.spreadRisk, 35);
  const volatilityRisk = score(input.volatilityRisk, 45);
  const timingUrgency = score(input.timingUrgency, 35);
  const scalingQuality = score(input.scalingQuality, 50);
  const invalidationClarity = score(input.invalidationClarity, 45);
  const executionReadiness = score(input.executionReadiness, mean([entryQuality, exitQuality, liquidityQuality]));
  const marketImpactRisk = score(input.marketImpactRisk, 25);
  const staleDataRisk = score(input.staleDataRisk, 25);
  const blockers = blockersFor(input, {
    liquidityQuality,
    slippageRisk,
    staleDataRisk,
    invalidationClarity,
  });
  const warnings = warningsFor(input, {
    entryQuality,
    exitQuality,
    liquidityQuality,
    slippageRisk,
    volatilityRisk,
    scalingQuality,
    staleDataRisk,
  });
  const timingFit = timingFitFor(timingUrgency, volatilityRisk, staleDataRisk);
  const scoreValue = roundScore(weightedScore({
    entryQuality,
    exitQuality,
    liquidityQuality,
    slippageSafety: 100 - slippageRisk,
    volatilitySafety: 100 - volatilityRisk,
    timingFit,
    scalingQuality,
    invalidationClarity,
    executionReadiness,
    marketImpactSafety: 100 - marketImpactRisk,
    staleDataSafety: 100 - staleDataRisk,
  }));
  const status = statusFor(scoreValue, blockers);
  const recommendedExecutionMode = modeFor(status, {
    timingUrgency,
    slippageRisk,
    liquidityQuality,
    scalingQuality,
  });

  return {
    score: scoreValue,
    status,
    entryQuality,
    exitQuality,
    liquidityQuality,
    slippageRisk,
    volatilityRisk,
    timingUrgency,
    scalingQuality,
    invalidationClarity,
    blockers,
    warnings,
    recommendedExecutionMode,
    explanation: explanationFor(status, recommendedExecutionMode, blockers, warnings),
    audit: {
      weights: WEIGHTS,
      timingFit,
      executionReadiness,
      marketImpactRisk,
      staleDataRisk,
      action: input.action ?? null,
      formulas: [
        "score = weighted execution cleanliness score, where risk inputs are inverted into safety scores",
        "status is blocked by hard execution blockers before score bands are considered",
        "recommendedExecutionMode describes execution mechanics only, not opportunity quality",
      ],
    },
  };
}

export const scoreExecutionQuality = evaluateExecutionQuality;

function blockersFor(
  input: ExecutionQualityInput,
  values: {
    liquidityQuality: number;
    slippageRisk: number;
    staleDataRisk: number;
    invalidationClarity: number;
  },
) {
  return unique([
    ...(input.blockers ?? []),
    values.liquidityQuality < 20 ? "Liquidity is too weak for clean execution." : "",
    values.slippageRisk > (input.maxSlippageRisk ?? 85) ? "Slippage risk exceeds execution policy." : "",
    values.staleDataRisk > (input.maxStaleDataRisk ?? 85) ? "Execution data is too stale." : "",
    values.invalidationClarity < 20 ? "Stop or invalidation condition is unclear." : "",
  ]);
}

function warningsFor(
  input: ExecutionQualityInput,
  values: {
    entryQuality: number;
    exitQuality: number;
    liquidityQuality: number;
    slippageRisk: number;
    volatilityRisk: number;
    scalingQuality: number;
    staleDataRisk: number;
  },
) {
  return unique([
    ...(input.warnings ?? []),
    values.entryQuality < 45 ? "Entry quality is below the clean-execution band." : "",
    values.exitQuality < 45 ? "Exit quality is below the clean-execution band." : "",
    values.liquidityQuality < 45 ? "Liquidity is thin; use smaller or more patient execution." : "",
    values.slippageRisk > 55 ? "Spread or slippage risk is elevated." : "",
    values.volatilityRisk > 65 ? "Volatility timing is noisy." : "",
    values.scalingQuality < 45 ? "Scaling plan is not strong enough for normal size." : "",
    values.staleDataRisk > 55 ? "Execution data freshness should be checked before acting." : "",
  ]);
}

function timingFitFor(timingUrgency: number, volatilityRisk: number, staleDataRisk: number) {
  const urgencyValue = timingUrgency >= 70 ? 80 : timingUrgency >= 40 ? 65 : 55;
  return clamp(urgencyValue - volatilityRisk * 0.25 - staleDataRisk * 0.2);
}

function statusFor(scoreValue: number, blockers: string[]): ExecutionQualityStatus {
  if (blockers.length) return "blocked";
  if (scoreValue < 45) return "poor";
  if (scoreValue < 65) return "acceptable";
  if (scoreValue < 82) return "good";
  return "excellent";
}

function modeFor(
  status: ExecutionQualityStatus,
  values: {
    timingUrgency: number;
    slippageRisk: number;
    liquidityQuality: number;
    scalingQuality: number;
  },
): RecommendedExecutionMode {
  if (status === "blocked") return "do_not_execute";
  if (status === "poor") return "wait";
  if (values.slippageRisk > 50) return "limit_only";
  if (values.liquidityQuality < 55 || values.scalingQuality < 55) return "small_probe";
  if (status === "acceptable" || values.timingUrgency < 70) return "scale_in";
  return "normal";
}

function explanationFor(
  status: ExecutionQualityStatus,
  mode: RecommendedExecutionMode,
  blockers: string[],
  warnings: string[],
) {
  if (blockers.length) {
    return `Execution is blocked: ${blockers[0]}`;
  }
  if (warnings.length) {
    return `Execution quality is ${status}; ${mode.replace(/_/g, " ")} is recommended because ${warnings[0]}`;
  }
  return `Execution quality is ${status}; ${mode.replace(/_/g, " ")} execution is acceptable.`;
}

function weightedScore(values: Record<keyof typeof WEIGHTS, number>) {
  return Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + values[key as keyof typeof WEIGHTS] * weight, 0);
}

function score(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Math.round(clamp(Number.isFinite(numeric) ? numeric : fallback));
}

function roundScore(value: number) {
  return Math.round(clamp(value));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
