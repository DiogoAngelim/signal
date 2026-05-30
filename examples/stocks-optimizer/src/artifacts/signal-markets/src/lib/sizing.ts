import {
  createViabilityReason,
  evaluateViability,
  sizeDecision,
  type SizingConstraint,
  type SizingDecision,
  type SizingMode,
  type SizingResult,
  type ViabilityResult,
  type ViabilityVerdict,
} from "../../../signal-framework";
import { sizeAdaptiveOpportunity } from "../../../signal-framework/sizing/adaptive";

export type FinancialExposureBand = {
  minPct: number;
  maxPct: number;
  label: string;
};

export type FinancialSizingView = {
  sizingDecision: SizingDecision;
  sizingMode: SizingMode;
  sizingReasons: string[];
  sizingConstraints: SizingConstraint[];
  sizingResult: SizingResult;
  sizingRationale?: string[];
  exposureBand: FinancialExposureBand;
  suggestedExposurePct: number;
  viabilityResult?: ViabilityResult;
  viabilityVerdict?: ViabilityVerdict;
  viabilityReason?: string;
  viabilityWarnings?: string[];
  viabilityBlockers?: string[];
  viabilityMarginOfSafety?: number;
};

export type DashboardExposureSizingInput = {
  marketRef: string;
  marketHealthPct: number;
  opportunityDensityPct: number;
  confidencePct: number;
  riskPct: number;
  requestedExposurePct: number;
  strategyCapPct: number;
  hasMarketData: boolean;
  hasProvidedSignals: boolean;
  strategyBlocked?: boolean;
  strategyBlockedLabel?: string;
  strategyBlockedReason?: string;
};

export type DashboardExposureSizingView = FinancialSizingView & {
  marketHealthPct: number;
  opportunityDensityPct: number;
  suggestedMaximumExposurePct: number;
  limitedReason: string;
  exposureExplanation: string;
};

export type AssetExposureSizingInput = {
  targetRef: string;
  signalAction: "Buy" | "Hold" | "Sell";
  signalStatus?: string;
  setupQuality: number;
  riskPressure: number;
  trendQuality: number;
  timingQuality: number;
  expectedMove: number;
  requestedExposurePct: number;
  maxExposurePct: number;
  hasEvidence: boolean;
  strategyBlocked?: boolean;
};

export type AssetExposureRequestInput = {
  signalAction: "Buy" | "Hold" | "Sell";
  allocationAction?: string | null;
  suggestedExposurePct?: number | null;
  setupQuality: number;
  riskPressure: number;
  maxExposurePct: number;
};

export function financialExposureBandForSizingMode(mode: SizingMode, strategyCapPct: number): FinancialExposureBand {
  const cap = clamp(strategyCapPct);
  if (mode === "none") return { minPct: 0, maxPct: 0, label: "0%" };
  if (mode === "micro") return { minPct: 0, maxPct: Math.min(5, cap), label: "0-5%" };
  if (mode === "small") return { minPct: Math.min(5, cap), maxPct: Math.min(15, cap), label: "5-15%" };
  if (mode === "normal") return { minPct: Math.min(15, cap), maxPct: Math.min(40, cap), label: "15-40%" };
  if (mode === "large") return { minPct: Math.min(40, cap), maxPct: Math.min(70, cap), label: "40-70%" };
  return { minPct: Math.min(70, cap), maxPct: cap, label: "strategy cap" };
}

export function interpretSizingAsExposure(
  sizingResult: SizingResult,
  strategyCapPct: number,
): Omit<FinancialSizingView, "sizingResult" | "sizingReasons" | "sizingConstraints"> {
  const exposureBand = financialExposureBandForSizingMode(sizingResult.mode, strategyCapPct);
  return {
    sizingDecision: sizingResult.decision,
    sizingMode: sizingResult.mode,
    exposureBand,
    suggestedExposurePct: round(Math.min(sizingResult.size, exposureBand.maxPct, clamp(strategyCapPct))),
  };
}

export function buildDashboardExposureSizing(input: DashboardExposureSizingInput): DashboardExposureSizingView {
  const marketHealthPct = clamp(input.marketHealthPct);
  const opportunityDensityPct = clamp(input.opportunityDensityPct);
  const strategyCapPct = clamp(input.strategyCapPct);
  const constraints = dashboardConstraints(input, marketHealthPct, opportunityDensityPct);
  const sizingResult = sizeAdaptiveOpportunity({
    targetRef: input.marketRef,
    actionRef: "market-exposure",
    opportunityQuality: opportunityDensityPct,
    signalConfidence: input.confidencePct,
    marketParticipation: opportunityDensityPct,
    riskControl: 100 - input.riskPct,
    perceptionAlignment: marketHealthPct,
    systemTrust: input.confidencePct,
    discoveryStrength: opportunityDensityPct,
    risk: input.riskPct,
    availableCapacity: strategyCapPct,
    requestedCapacity: clamp(input.requestedExposurePct, 0, strategyCapPct),
    maxCapacity: strategyCapPct,
    constraints,
  });
  const viabilityResult = evaluateViability({
    targetRef: input.marketRef,
    actionRef: "market-exposure",
    expectedBenefit: clamp(marketHealthPct * 0.35 + opportunityDensityPct * 0.45 + input.confidencePct * 0.2),
    expectedCost: clamp(input.riskPct * 0.45),
    expectedRisk: input.riskPct,
    uncertainty: 100 - input.confidencePct,
    confidence: input.confidencePct,
    minMarginOfSafety: 0,
    thresholds: { minConfidence: 35, maxRisk: 72, maxUncertainty: 70, maxCost: 85 },
    constraints: viabilityConstraintsFromSizing(constraints),
  });
  const effectiveSizingResult = applyViabilityToSizing(sizingResult, viabilityResult);
  const exposureView = interpretSizingAsExposure(effectiveSizingResult, strategyCapPct);
  const suggestedMaximumExposurePct = input.hasProvidedSignals ? exposureView.suggestedExposurePct : 0;
  const limitedReason = exposureLimitReason({
    marketHealthPct,
    confidencePct: clamp(input.confidencePct),
    suggestedMaximumExposurePct,
    sizingResult: effectiveSizingResult,
  });

  return {
    ...exposureView,
    sizingReasons: effectiveSizingResult.reasons,
    sizingConstraints: effectiveSizingResult.constraints,
    sizingResult: effectiveSizingResult,
    sizingRationale: sizingResult.sizingRationale,
    marketHealthPct,
    opportunityDensityPct,
    suggestedMaximumExposurePct,
    limitedReason,
    exposureExplanation: limitedReason,
    ...viabilityFields(viabilityResult),
  };
}

export function requestedExposureForAsset(input: AssetExposureRequestInput) {
  const maxExposurePct = clamp(input.maxExposurePct);
  const allocationAction = input.allocationAction == null ? undefined : String(input.allocationAction);

  if (input.signalAction !== "Buy") return 0;
  if (allocationAction && allocationAction !== "Buy") return 0;

  const explicitExposure = positiveFinite(input.suggestedExposurePct);
  if (explicitExposure != null) return round(clamp(explicitExposure, 0, maxExposurePct));

  const setupQuality = clamp(input.setupQuality);
  const riskPressure = clamp(input.riskPressure);
  return round(clamp((setupQuality - riskPressure * 0.35) / 15, 0, maxExposurePct));
}

export function sizeAssetExposure(input: AssetExposureSizingInput): FinancialSizingView {
  const maxExposurePct = clamp(input.maxExposurePct);
  const constraints = assetConstraints(input);
  const confidencePct = clamp(input.setupQuality * 0.48 + input.trendQuality * 0.32 + input.timingQuality * 0.2);
  const sizingResult = sizeAdaptiveOpportunity({
    targetRef: input.targetRef,
    actionRef: input.signalAction,
    opportunityQuality: input.setupQuality,
    signalConfidence: confidencePct,
    marketParticipation: clamp(input.expectedMove + 50),
    riskControl: 100 - input.riskPressure,
    perceptionAlignment: clamp((input.trendQuality + input.timingQuality) / 2),
    systemTrust: confidencePct,
    discoveryStrength: clamp(input.setupQuality * 0.55 + input.trendQuality * 0.45),
    risk: input.riskPressure,
    availableCapacity: maxExposurePct,
    requestedCapacity: clamp(input.requestedExposurePct, 0, maxExposurePct),
    maxCapacity: maxExposurePct,
    constraints,
  });
  const viabilityResult = evaluateViability({
    targetRef: input.targetRef,
    actionRef: input.signalAction,
    expectedBenefit: clamp(
      input.setupQuality * 0.5 +
        input.trendQuality * 0.22 +
        input.timingQuality * 0.14 +
        Math.max(0, input.expectedMove) * 5,
    ),
    expectedCost: clamp(Math.abs(input.expectedMove) * 3),
    expectedRisk: input.riskPressure,
    uncertainty: 100 - confidencePct,
    confidence: confidencePct,
    minMarginOfSafety: 0,
    thresholds: { minConfidence: 35, maxRisk: 72, maxUncertainty: 70, maxCost: 85 },
    constraints: viabilityConstraintsFromSizing(constraints),
  });
  const effectiveSizingResult = applyViabilityToSizing(sizingResult, viabilityResult);
  const exposureView = interpretSizingAsExposure(effectiveSizingResult, maxExposurePct);

  return {
    ...exposureView,
    sizingReasons: effectiveSizingResult.reasons,
    sizingConstraints: effectiveSizingResult.constraints,
    sizingResult: effectiveSizingResult,
    sizingRationale: sizingResult.sizingRationale,
    ...viabilityFields(viabilityResult),
  };
}

export function assetSizingLabel(input: {
  allocationAction?: string;
  suggestedExposure?: number;
  setupQuality?: number;
  sizingMode?: SizingMode;
}) {
  if (input.allocationAction === "Sell") return "Risk exit";
  if (input.allocationAction === "Blocked" || input.sizingMode === "none") return "Blocked";
  if (input.allocationAction === "Buy" && Number(input.suggestedExposure ?? 0) > 0) {
    return Number(input.setupQuality ?? 0) >= 72 ? "Mature" : "Candidate";
  }
  return "Watch";
}

function dashboardConstraints(
  input: DashboardExposureSizingInput,
  marketHealthPct: number,
  opportunityDensityPct: number,
): SizingConstraint[] {
  return [
    {
      id: "market-health",
      label: "Market health",
      type: "soft",
      passed: marketHealthPct >= 45,
      severity: "medium",
      reason: "Market health is below the preferred threshold.",
    },
    {
      id: "data-completeness",
      label: "Data completeness",
      type: "hard",
      passed: input.hasMarketData && input.hasProvidedSignals,
      severity: "critical",
      reason: "Data incompleteness prevents position sizing.",
    },
    {
      id: "opportunity-density",
      label: "Opportunity density",
      type: "hard",
      passed: opportunityDensityPct > 0,
      severity: "high",
      reason: "Actionable opportunity density is too low.",
    },
    {
      id: "risk-gate",
      label: "Risk gate",
      type: "hard",
      passed: clamp(input.riskPct) < 72,
      severity: "high",
      reason: "Risk gates prevent position sizing.",
    },
    {
      id: "strategy-readiness",
      label: input.strategyBlockedLabel ?? "Strategy readiness",
      type: "hard",
      passed: input.strategyBlocked !== true,
      severity: "critical",
      reason: input.strategyBlockedReason ?? "Strategy readiness gates block new exposure.",
    },
  ];
}

function assetConstraints(input: AssetExposureSizingInput): SizingConstraint[] {
  return [
    {
      id: "signal-persistence",
      label: "Signal persistence",
      type: "soft",
      passed: input.signalStatus === "provided" || input.signalStatus === "confirmed",
      severity: "medium",
      reason: "Signal persistence is not confirmed.",
    },
    {
      id: "cross-timeframe-agreement",
      label: "Cross-timeframe agreement",
      type: "soft",
      passed: input.trendQuality >= 52 && input.timingQuality >= 52,
      severity: "high",
      reason: "Trend and timing evidence do not agree.",
    },
    {
      id: "liquidity-data-availability",
      label: "Liquidity and data availability",
      type: "hard",
      passed: input.hasEvidence,
      severity: "high",
      reason: "Liquidity or data availability is incomplete.",
    },
    {
      id: "volatility-acceptance",
      label: "Volatility acceptance",
      type: "hard",
      passed: input.riskPressure < 72,
      severity: "high",
      reason: "Volatility is too high for position sizing.",
    },
    {
      id: "confidence-stability",
      label: "Confidence stability",
      type: "soft",
      passed: input.setupQuality >= 50,
      severity: "medium",
      reason: "Confidence stability is weak.",
    },
    {
      id: "opportunity-density",
      label: "Opportunity density",
      type: "hard",
      passed: input.signalAction === "Buy" && input.requestedExposurePct > 0 && input.expectedMove >= -0.5,
      severity: "high",
      reason: "Actionable opportunity density is too low.",
    },
    {
      id: "risk-gate",
      label: "Risk gate",
      type: "hard",
      passed: input.riskPressure < 72,
      severity: "high",
      reason: "Risk gate prevents position sizing.",
    },
    {
      id: "strategy-readiness",
      label: "Strategy readiness",
      type: "hard",
      passed: input.strategyBlocked !== true && maxPositive(input.maxExposurePct),
      severity: "critical",
      reason: "Strategy readiness gates block new exposure.",
    },
  ];
}

function exposureLimitReason(input: {
  marketHealthPct: number;
  confidencePct: number;
  suggestedMaximumExposurePct: number;
  sizingResult: SizingResult;
}) {
  const strategyReadinessFailure = input.sizingResult.constraints.find(
    (constraint) => constraint.id === "strategy-readiness" && !constraint.passed,
  );
  if (strategyReadinessFailure?.reason) return strategyReadinessFailure.reason;

  if (input.marketHealthPct >= 60 && input.confidencePct >= 60 && input.suggestedMaximumExposurePct === 0) {
    return "Market structure is healthy, but sizing is blocked because actionable opportunity density is too low or risk gates prevent position sizing.";
  }

  const failedConstraint = input.sizingResult.constraints.find((constraint) => !constraint.passed);
  if (failedConstraint?.reason) return failedConstraint.reason;
  const capReason = input.sizingResult.reasons.find((reason) => reason.startsWith("Capped by"));
  if (capReason) return normalizeCapacityReason(capReason);
  return input.sizingResult.reasons[0] ?? "Sizing is limited by the current confidence, risk, and capacity inputs.";
}

function normalizeCapacityReason(reason: string) {
  const requestedCapacity = reason.match(/^Capped by requestedCapacity at ([\d.]+)/i);
  if (requestedCapacity) {
    return `Portfolio exposure is capped by requested capacity at ${Number(requestedCapacity[1]).toFixed(1)}%.`;
  }

  return reason;
}

function applyViabilityToSizing(
  sizingResult: SizingResult,
  viabilityResult: ViabilityResult,
): SizingResult {
  const viabilityReason = createViabilityReason(viabilityResult);
  const reasons = unique([
    ...sizingResult.reasons,
    viabilityReason,
    ...viabilityResult.warnings,
  ]);

  if (viabilityResult.verdict === "viable" || viabilityResult.verdict === "marginal") {
    return { ...sizingResult, reasons };
  }

  return {
    ...sizingResult,
    decision: sizingResult.decision === "blocked" || viabilityResult.verdict === "blocked" ? "blocked" : "deferred",
    mode: "none",
    size: 0,
    normalizedSize: 0,
    reasons,
  };
}

function viabilityFields(viabilityResult: ViabilityResult) {
  return {
    viabilityResult,
    viabilityVerdict: viabilityResult.verdict,
    viabilityReason: createViabilityReason(viabilityResult),
    viabilityWarnings: viabilityResult.warnings,
    viabilityBlockers: viabilityResult.blockers,
    viabilityMarginOfSafety: viabilityResult.marginOfSafety,
  };
}

function viabilityConstraintsFromSizing(constraints: SizingConstraint[]) {
  return constraints.map((constraint) => ({
    id: constraint.id,
    label: constraint.label,
    type: constraint.type,
    hard: constraint.type === "hard",
    passed: constraint.passed,
    severity: constraint.severity,
    reason: constraint.reason,
  }));
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function maxPositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

function positiveFinite(value: number | null | undefined) {
  if (value == null) return null;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
