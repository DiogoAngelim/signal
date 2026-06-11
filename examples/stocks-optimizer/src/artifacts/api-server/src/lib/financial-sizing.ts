import { sizeAdaptiveOpportunity } from "../../../signal-framework/sizing/adaptive";
import type {
  SizingConstraint,
  SizingDecision,
  SizingMode,
  SizingResult,
} from "../../../signal-framework/sizing/engine";
import {
  type ViabilityConstraintInput,
  type ViabilityInput,
  type ViabilityResult,
  type ViabilityVerdict,
  createViabilityReason,
  evaluateViability,
} from "../../../signal-framework/viability/engine";
import type { StockSurvivalMemoryDiagnostic } from "./survival-memory-adapter";

export type FinancialExposureBand = {
  minPct: number;
  maxPct: number;
  label: string;
};

export type FinancialExposureSizingInput = {
  targetRef: string;
  actionRef?: string;
  decisionRef?: string;
  confidence: number;
  riskPressure: number;
  requestedExposurePct: number;
  availableExposurePct?: number;
  minExposurePct?: number;
  maxExposurePct: number;
  constraints?: SizingConstraint[];
  viability?: FinancialExposureViabilityInput;
  survivalMemory?: StockSurvivalMemoryDiagnostic | null;
};

export type FinancialExposureViabilityInput = {
  expectedBenefit: number;
  expectedCost: number;
  expectedRisk?: number;
  uncertainty?: number;
  confidence?: number;
  constraints?: ViabilityConstraintInput[];
  minMarginOfSafety?: number;
  thresholds?: ViabilityInput["thresholds"];
  weights?: ViabilityInput["weights"];
  context?: Record<string, unknown>;
};

export type FinancialExposureSizingResult = {
  sizingDecision: SizingDecision;
  sizingMode: SizingMode;
  sizingReasons: string[];
  sizingConstraints: SizingConstraint[];
  sizingResult: SizingResult;
  sizingRationale: string[];
  exposureBand: FinancialExposureBand;
  suggestedExposurePct: number;
  viabilityResult?: ViabilityResult;
  viabilityVerdict?: ViabilityVerdict;
  viabilityReason?: string;
  viabilityWarnings?: string[];
  viabilityBlockers?: string[];
  viabilityMarginOfSafety?: number;
};

export function financialExposureBandForSizingMode(
  mode: SizingMode,
  strategyCapPct: number,
): FinancialExposureBand {
  const cap = clamp(strategyCapPct);
  if (mode === "none") return { minPct: 0, maxPct: 0, label: "0%" };
  if (mode === "micro")
    return { minPct: 0, maxPct: Math.min(5, cap), label: "0-5%" };
  if (mode === "small")
    return {
      minPct: Math.min(5, cap),
      maxPct: Math.min(15, cap),
      label: "5-15%",
    };
  if (mode === "normal")
    return {
      minPct: Math.min(15, cap),
      maxPct: Math.min(40, cap),
      label: "15-40%",
    };
  if (mode === "large")
    return {
      minPct: Math.min(40, cap),
      maxPct: Math.min(70, cap),
      label: "40-70%",
    };
  return { minPct: Math.min(70, cap), maxPct: cap, label: "strategy cap" };
}

export function sizeFinancialExposure(
  input: FinancialExposureSizingInput,
): FinancialExposureSizingResult {
  const configuredMaxExposurePct = clamp(input.maxExposurePct);
  const survivalMultiplier = input.survivalMemory?.exposureMultiplier ?? 1;
  const maxExposurePct = round(
    Math.min(
      configuredMaxExposurePct,
      configuredMaxExposurePct * survivalMultiplier,
      input.survivalMemory?.maxExposurePct ?? configuredMaxExposurePct,
    ),
  );
  const requestedExposurePct = clamp(
    input.requestedExposurePct,
    0,
    maxExposurePct,
  );
  const availableExposurePct =
    input.availableExposurePct == null
      ? maxExposurePct
      : clamp(input.availableExposurePct, 0, maxExposurePct);
  const sizingResult = sizeAdaptiveOpportunity({
    targetRef: input.targetRef,
    actionRef: input.actionRef,
    decisionRef: input.decisionRef,
    opportunityQuality: input.confidence,
    signalConfidence: input.confidence,
    marketParticipation:
      maxExposurePct > 0 ? (requestedExposurePct / maxExposurePct) * 100 : 0,
    riskControl: 100 - input.riskPressure,
    perceptionAlignment: input.confidence,
    systemTrust: 70,
    discoveryStrength: input.confidence,
    risk: input.riskPressure,
    availableCapacity: availableExposurePct,
    requestedCapacity: requestedExposurePct,
    minCapacity: input.minExposurePct,
    maxCapacity: maxExposurePct,
    constraints: [
      ...(input.constraints ?? []),
      ...survivalSizingConstraints(input.survivalMemory),
    ],
  });
  const viabilityResult = input.viability
    ? evaluateViability({
        targetRef: input.targetRef,
        actionRef: input.actionRef,
        decisionRef: input.decisionRef,
        expectedBenefit: input.viability.expectedBenefit,
        expectedCost: input.viability.expectedCost,
        expectedRisk: input.viability.expectedRisk ?? input.riskPressure,
        uncertainty: input.viability.uncertainty ?? 100 - input.confidence,
        confidence: input.viability.confidence ?? input.confidence,
        constraints: input.viability.constraints,
        minMarginOfSafety: input.viability.minMarginOfSafety,
        thresholds: input.viability.thresholds,
        weights: input.viability.weights,
        context: input.viability.context,
      })
    : undefined;
  const viabilityReason = viabilityResult
    ? createViabilityReason(viabilityResult)
    : undefined;
  const viabilityAllowsExposure =
    !viabilityResult ||
    viabilityResult.verdict === "viable" ||
    viabilityResult.verdict === "marginal";
  const sizingReasons = unique([
    ...survivalSizingReasons(
      input.survivalMemory,
      configuredMaxExposurePct,
      maxExposurePct,
    ),
    ...sizingResult.reasons,
    ...(viabilityReason ? [viabilityReason] : []),
    ...(viabilityResult?.warnings ?? []),
  ]);
  const effectiveSizingResult: SizingResult = viabilityAllowsExposure
    ? { ...sizingResult, reasons: sizingReasons }
    : {
        ...sizingResult,
        decision:
          sizingResult.decision === "blocked" ||
          viabilityResult?.verdict === "blocked"
            ? "blocked"
            : "deferred",
        mode: "none",
        size: 0,
        normalizedSize: 0,
        reasons: sizingReasons,
      };
  const exposureBand = financialExposureBandForSizingMode(
    effectiveSizingResult.mode,
    maxExposurePct,
  );
  const suggestedExposurePct = viabilityAllowsExposure
    ? round(
        Math.min(
          effectiveSizingResult.size,
          exposureBand.maxPct,
          maxExposurePct,
        ),
      )
    : 0;

  return {
    sizingDecision: effectiveSizingResult.decision,
    sizingMode: effectiveSizingResult.mode,
    sizingReasons,
    sizingConstraints: effectiveSizingResult.constraints,
    sizingResult: effectiveSizingResult,
    sizingRationale: sizingResult.sizingRationale,
    exposureBand,
    suggestedExposurePct,
    viabilityResult,
    viabilityVerdict: viabilityResult?.verdict,
    viabilityReason,
    viabilityWarnings: viabilityResult?.warnings,
    viabilityBlockers: viabilityResult?.blockers,
    viabilityMarginOfSafety: viabilityResult?.marginOfSafety,
  };
}

function survivalSizingConstraints(
  survivalMemory?: StockSurvivalMemoryDiagnostic | null,
): SizingConstraint[] {
  if (
    !survivalMemory ||
    survivalMemory.recordCount === 0 ||
    survivalMemory.scarCount === 0
  )
    return [];

  return [
    {
      id: "survival-memory",
      label: "Survival memory",
      type: survivalMemory.recommendation === "wait" ? "hard" : "soft",
      passed: survivalMemory.recommendation !== "wait",
      severity: survivalMemory.recommendation === "wait" ? "high" : "medium",
      reason:
        survivalMemory.reasons[0] ?? "Similar states carried survival scars.",
    },
  ];
}

function survivalSizingReasons(
  survivalMemory: StockSurvivalMemoryDiagnostic | null | undefined,
  configuredMaxExposurePct: number,
  maxExposurePct: number,
) {
  if (
    !survivalMemory ||
    survivalMemory.recordCount === 0 ||
    survivalMemory.scarCount === 0
  )
    return [];

  const reasons = [
    `Survival memory capped max exposure from ${formatPct(configuredMaxExposurePct)} to ${formatPct(maxExposurePct)}.`,
    ...survivalMemory.mainWarnings,
  ];

  if (survivalMemory.recommendation === "wait") {
    reasons.push(
      "Survival memory requires waiting before normal opportunity sizing can expand exposure.",
    );
  }

  return reasons;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatPct(value: number) {
  return `${round(value)}%`;
}
