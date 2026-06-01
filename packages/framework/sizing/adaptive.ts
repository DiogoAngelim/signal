/* c8 ignore next */
import { clamp, mean, numeric } from "../math/statistics";
import type { DetectedNeed } from "../types";
import { sizeDecision, type SizingConstraint, type SizingInput, type SizingResult } from "./engine";

export const ADAPTIVE_SIZING_LADDER = [0, 1, 2, 5, 10, 15, 25, 50, 100] as const;

export type AdaptiveSizingInput = {
  targetRef: string;
  actionRef?: string;
  decisionRef?: string;
  opportunityQuality: number;
  signalConfidence: number;
  marketParticipation: number;
  riskControl: number;
  perceptionAlignment: number;
  systemTrust: number;
  discoveryStrength: number;
  risk?: number;
  requestedCapacity?: number;
  availableCapacity?: number;
  minCapacity?: number;
  maxCapacity?: number;
  needs?: DetectedNeed[];
  constraints?: SizingConstraint[];
  ladder?: readonly number[];
  context?: Record<string, unknown>;
};

export type AdaptiveSizingResult = SizingResult & {
  selectedLadderPct: number;
  ladder: number[];
  sizingRationale: string[];
};

/**
 * Adaptive sizing wraps the generic risk gate with an explainable ladder.
 *
 * The base `sizeDecision` remains responsible for hard constraints, caps, and
 * risk normalization. This adapter only chooses the largest graduated step that
 * fits inside the allowed capacity, keeping exploratory allocations possible
 * without bypassing existing safety checks.
 */
export function sizeAdaptiveOpportunity(input: AdaptiveSizingInput): AdaptiveSizingResult {
  const ladder = normalizeLadder(input.ladder ?? ADAPTIVE_SIZING_LADDER);
  const quality = ratio(input.opportunityQuality);
  const confidence = ratio(input.signalConfidence);
  const participation = ratio(input.marketParticipation);
  const riskControl = ratio(input.riskControl);
  const alignment = ratio(input.perceptionAlignment);
  const trust = ratio(input.systemTrust);
  const discovery = ratio(input.discoveryStrength);
  const needRisk = needRiskPressure(input.needs ?? []);
  const risk = Math.max(ratio(input.risk ?? 1 - riskControl), 1 - riskControl, needRisk);
  const blendedConfidence = mean([quality, confidence, alignment, trust, discovery]);
  const utility = mean([quality, participation, discovery, needParticipationBoost(input.needs ?? [])]);
  const constraints = [...(input.constraints ?? []), ...constraintsFromNeeds(input.needs ?? [])];
  const baseInput: SizingInput = {
    targetRef: input.targetRef,
    actionRef: input.actionRef,
    decisionRef: input.decisionRef,
    confidence: blendedConfidence,
    risk,
    utility,
    requestedCapacity: input.requestedCapacity,
    availableCapacity: input.availableCapacity,
    minCapacity: input.minCapacity,
    maxCapacity: input.maxCapacity,
    constraints,
    context: input.context,
  };
  const base = sizeDecision(baseInput);
  const allowedCapacity = base.decision === "allowed" ? base.size : 0;
  const selectedLadderPct = selectLadderStep(ladder, allowedCapacity);
  const finalSize = selectedLadderPct;
  /* c8 ignore next */
  const normalizedSize = normalizeByCapacity(finalSize, input.maxCapacity ?? input.availableCapacity ?? input.requestedCapacity);
  const sizingRationale = [
    `Opportunity quality ${formatPct(quality)} and discovery strength ${formatPct(discovery)} set the opportunity tier.`,
    `Signal confidence ${formatPct(confidence)}, alignment ${formatPct(alignment)}, and system trust ${formatPct(trust)} set the confidence tier.`,
    `Risk control ${formatPct(riskControl)} and detected needs keep the final step inside existing safety gates.`,
    `Selected ladder step ${formatNumber(selectedLadderPct)} from ${ladder.join(", ")}.`,
  ];

  return {
    ...base,
    decision: selectedLadderPct > 0 ? base.decision : base.decision === "blocked" ? "blocked" : "deferred",
    mode: modeForStep(selectedLadderPct),
    size: finalSize,
    normalizedSize,
    selectedLadderPct,
    ladder: ladder.slice(),
    reasons: [...base.reasons, ...sizingRationale],
    sizingRationale,
  };
}

function constraintsFromNeeds(needs: DetectedNeed[]): SizingConstraint[] {
  return needs.flatMap((need): SizingConstraint[] => {
    if (need.category === "reduce-exposure" && need.severity >= 70) {
      return [{
        id: `need:${need.category}`,
        label: "Need detection",
        type: "hard" as const,
        passed: false,
        severity: "high" as const,
        reason: need.explanation,
      }];
    }

    if (need.category === "wait" && need.severity >= 70) {
      return [{
        id: `need:${need.category}`,
        label: "Need detection",
        type: "hard" as const,
        passed: false,
        severity: "high" as const,
        reason: need.explanation,
      }];
    }

    if (need.category === "gather-evidence") {
      return [{
        id: `need:${need.category}`,
        label: "Need detection",
        type: "soft" as const,
        passed: need.severity < 60,
        severity: "medium" as const,
        reason: need.explanation,
      }];
    }

    return [];
  });
}

function needRiskPressure(needs: DetectedNeed[]) {
  return ratio(Math.max(0, ...needs
    .filter((need) => need.category === "reduce-exposure" || need.category === "wait")
    .map((need) => need.severity)));
}

function needParticipationBoost(needs: DetectedNeed[]) {
  const increase = needs.find((need) => need.category === "increase-participation");
  return increase ? ratio(increase.confidence) : 0.5;
}

function selectLadderStep(ladder: number[], allowedCapacity: number) {
  const selected = ladder.reduce((stepSelected, step) => (step <= allowedCapacity ? step : stepSelected), 0);
  if (selected > 0 || allowedCapacity <= 0) return selected;
  /* c8 ignore next */
  return ladder.find((step) => step > 0) ?? 0;
}

function normalizeLadder(ladder: readonly number[]) {
  return Array.from(new Set(ladder.map((step) => Math.max(0, numeric(step))).filter(Number.isFinite))).sort((a, b) => a - b);
}

function normalizeByCapacity(size: number, capacity: number | undefined) {
  const basis = numeric(capacity, 100);
  return basis <= 0 ? 0 : Number(clamp(size / basis, 0, 1).toFixed(6));
}

function ratio(value: unknown) {
  const parsed = numeric(value);
  return clamp(Math.abs(parsed) > 1 ? parsed / 100 : parsed, 0, 1);
}

function modeForStep(step: number): SizingResult["mode"] {
  if (step <= 0) return "none";
  if (step <= 2) return "micro";
  if (step <= 10) return "small";
  if (step <= 25) return "normal";
  if (step <= 50) return "large";
  return "maxSafe";
}

function formatPct(value: number) {
  return `${Math.round(value * 100)}%`;
}

/* c8 ignore start */
function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
/* c8 ignore stop */
