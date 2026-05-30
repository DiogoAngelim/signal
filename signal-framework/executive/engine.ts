import type { CounterfactualResult } from "../counterfactual/engine";
import type { DiscoveryAccountabilityResult } from "../discovery-accountability/engine";
import type { ExecutionQualityResult } from "../execution-quality/engine";
import type { DecisionQualityResult } from "../wisdom/engine";
import { clamp, mean } from "../math/statistics";
import {
  type CapacityState,
  type DecisionCondition,
  type DecisionRestriction,
  type PermissionState,
  type TrustState,
  type UrgencyState,
  evaluateDecisionStates,
} from "../decision-states/engine";

export type ExecutiveAction =
  | "buy"
  | "sell"
  | "hold"
  | "watch"
  | "avoid"
  | "escalate"
  | "deescalate"
  | "review";

export type ExecutiveParticipationMode = "none" | "watch" | "limited" | "normal" | "aggressive";

export type ExecutiveAudit = {
  module: "executive";
  version: "v1";
  componentScores: Record<string, number>;
  states: {
    trust: TrustState;
    permission: PermissionState;
    capacity: CapacityState;
    urgency: UrgencyState;
  };
  decisionTrace: string[];
  formulas: string[];
  sourceModules: string[];
  raw?: Record<string, unknown>;
};

export type ExecutiveInput = {
  proposedDecision?: ExecutiveAction | string | null;
  discovery?: any;
  discoveryAccountability?: DiscoveryAccountabilityResult | null;
  recognition?: any;
  belief?: any;
  judgement?: any;
  agency?: any;
  wisdom?: DecisionQualityResult | null;
  resolve?: any;
  survivalMemory?: any;
  calibration?: any;
  readiness?: any;
  trust?: Partial<TrustState> | number | null;
  permission?: Partial<PermissionState> | null;
  capacity?: Partial<CapacityState> | number | null;
  urgency?: Partial<UrgencyState> | number | null;
  risk?: number | null;
  opportunity?: number | null;
  constraints?: DecisionRestriction[];
  historicalEvidence?: string[];
  restrictions?: DecisionRestriction[];
  unlockConditions?: DecisionCondition[] | string[];
  invalidationConditions?: DecisionCondition[] | string[];
  executionQuality?: ExecutionQualityResult | null;
  counterfactual?: CounterfactualResult | null;
  confidence?: number | null;
  maxExposure?: number | null;
  nextReviewCondition?: string;
  now?: string | Date;
};

export type ExecutiveDecision = {
  decision: ExecutiveAction;
  participationMode: ExecutiveParticipationMode;
  confidence: number;
  trust: number;
  permission: PermissionState;
  capacity: CapacityState;
  urgency: UrgencyState;
  maxExposure: number;
  primaryReason: string;
  primaryLimiter?: string;
  strongestEvidence: string[];
  restrictions: DecisionRestriction[];
  unlockConditions: DecisionCondition[];
  invalidationConditions: DecisionCondition[];
  nextReviewCondition?: string;
  explanation: string;
  audit: ExecutiveAudit;
};

/**
 * Synthesizes prior decision modules into one final generic decision authority.
 *
 * @example
 * const executive = evaluateExecutiveDecision({
 *   proposedDecision: "buy",
 *   confidence: 78,
 *   trust: { score: 74, status: "trusted", reasons: ["Historical outcomes are stable."] },
 *   permission: { allowed: true, level: "limited", reasons: ["Execution is acceptable."] },
 *   capacity: { maxExposure: 4, mode: "reduced", reasons: ["Recovery cap is active."] },
 * });
 * executive.decision; // "buy"
 * executive.participationMode; // "limited"
 */
export function evaluateExecutiveDecision(input: ExecutiveInput = {}): ExecutiveDecision {
  const restrictions = normalizeRestrictions(input);
  const states = evaluateDecisionStates({
    confidence: input.confidence,
    risk: input.risk,
    opportunity: input.opportunity,
    trust: input.trust,
    permission: input.permission,
    capacity: input.capacity ?? input.maxExposure,
    urgency: input.urgency,
    restrictions,
    trustGovernor: input.readiness?.trustGovernor ?? input.agency?.trustGovernor ?? input.resolve?.trustGovernor,
    calibration: input.calibration,
    readiness: input.readiness,
    agency: input.agency,
    survivalMemory: input.survivalMemory,
    executionQuality: input.executionQuality,
  });
  const componentScores = componentScoresFor(input, states.trust);
  const confidence = confidenceFor(input, componentScores, states.trust);
  const decisionTrace: string[] = [];
  const baseDecision = baseDecisionFor(input);
  const decision = finalDecisionFor(input, baseDecision, states, confidence, decisionTrace);
  const participationMode = participationModeFor(input, states, decision, confidence);
  const maxExposure = participationMode === "none" || decision === "avoid" || decision === "review"
    ? 0
    : roundExposure(states.capacity.maxExposure);
  const strongestEvidence = strongestEvidenceFor(input, componentScores);
  const primaryLimiter = primaryLimiterFor(input, states, restrictions);
  const unlockConditions = conditionsFor(input.unlockConditions, "unlock", [
    ...restrictions.map((restriction) => restriction.unlockCondition),
    ...states.permission.reasons,
    ...states.capacity.reasons,
    input.discoveryAccountability?.unlockConditions,
    input.wisdom?.counterfactuals?.explanation,
    input.executionQuality?.warnings,
    input.counterfactual?.recommendedLearning,
  ]);
  const invalidationConditions = conditionsFor(input.invalidationConditions, "invalidation", [
    input.resolve?.invalidationConditions,
    input.discovery?.invalidationConditions,
    input.survivalMemory?.invalidationConditions,
    decision === "buy" ? "Invalidate if permission, execution quality, or trust falls below the action threshold." : "",
  ]);
  const primaryReason = primaryReasonFor(input, decision, strongestEvidence, primaryLimiter);
  const nextReviewCondition = input.nextReviewCondition ?? nextReviewConditionFor(input, states, decision);

  return {
    decision,
    participationMode,
    confidence,
    trust: states.trust.score,
    permission: states.permission,
    capacity: states.capacity,
    urgency: states.urgency,
    maxExposure,
    primaryReason,
    ...(primaryLimiter ? { primaryLimiter } : {}),
    strongestEvidence,
    restrictions,
    unlockConditions,
    invalidationConditions,
    ...(nextReviewCondition ? { nextReviewCondition } : {}),
    explanation: explanationFor(decision, participationMode, confidence, states, primaryReason, primaryLimiter),
    audit: {
      module: "executive",
      version: "v1",
      componentScores,
      states: {
        trust: states.trust,
        permission: states.permission,
        capacity: states.capacity,
        urgency: states.urgency,
      },
      decisionTrace,
      formulas: [
        "confidence blends module confidence, calibration, judgement, execution quality, and trust, then caps by permission state",
        "wisdom contributes decision quality, opportunity cost, restriction value, and long-term learning before Resolve is treated as final commitment",
        "permission determines whether action is allowed; capacity determines max exposure; urgency determines timing pressure",
        "Executive does not contain market-specific logic; callers provide domain evidence through generic module outputs",
      ],
      sourceModules: sourceModulesFor(input),
      raw: { proposedDecision: input.proposedDecision ?? null },
    },
  };
}

export const synthesizeExecutiveDecision = evaluateExecutiveDecision;

function normalizeRestrictions(input: ExecutiveInput): DecisionRestriction[] {
  return [
    ...(input.restrictions ?? []),
    ...(input.constraints ?? []),
    ...(input.executionQuality?.blockers ?? []).map((blocker, index) => ({
      id: `execution-blocker-${index + 1}`,
      label: "Execution quality blocker",
      reason: blocker,
      severity: "high",
      blocksAction: true,
    })),
    ...(input.discoveryAccountability?.blockers ?? []).map((blocker, index) => ({
      id: `discovery-accountability-${index + 1}`,
      label: "Discovery accountability limiter",
      reason: blocker,
      severity: "medium",
      requiresReview: true,
    })),
  ];
}

function componentScoresFor(input: ExecutiveInput, trust: TrustState) {
  return {
    discovery: score(input.discovery?.confidence, 50),
    discoveryAccountability: score(input.discoveryAccountability?.accountabilityScore, 50),
    recognition: score(input.recognition?.recognitionScore ?? input.recognition?.confidence, 50),
    belief: score(input.belief?.confidence, 50),
    judgement: score(input.judgement?.adjustedConfidence ?? input.judgement?.reliability, 50),
    agency: score(input.agency?.trustPct ?? input.agency?.trust, 50),
    wisdom: score(input.wisdom?.wisdomScore ?? input.wisdom?.decisionQuality, 50),
    resolve: score(input.resolve?.resolveScore, 50),
    executionQuality: score(input.executionQuality?.score, 55),
    trust: trust.score,
    opportunity: score(input.opportunity, 50),
    riskSafety: 100 - score(input.risk, 45),
  };
}

function confidenceFor(input: ExecutiveInput, scores: Record<string, number>, trust: TrustState) {
  const explicit = optionalScore(input.confidence);
  const blended = mean([
    explicit,
    scores.discovery,
    scores.discoveryAccountability,
    scores.recognition,
    scores.belief,
    scores.judgement,
    scores.wisdom,
    scores.resolve,
    scores.executionQuality,
    trust.score,
  ].filter((value): value is number => value != null));
  const permissionCap = input.permission?.allowed === false ? 55 : 100;
  return roundScore(Math.min(blended || trust.score, permissionCap));
}

function baseDecisionFor(input: ExecutiveInput): ExecutiveAction {
  const proposed = normalizeAction(input.proposedDecision);
  if (proposed) return proposed;

  const resolveDecision = normalized(input.resolve?.decision);
  if (resolveDecision === "commit") return input.opportunity != null && input.opportunity < 40 ? "hold" : "buy";
  if (resolveDecision === "reject" || resolveDecision === "invalidate") return "avoid";
  if (resolveDecision === "escalate") return "escalate";
  if (resolveDecision === "wait") return "watch";

  const agencyRecommendation = normalized(input.agency?.recommendation);
  if (agencyRecommendation.includes("review")) return "review";
  if (agencyRecommendation.includes("reject") || agencyRecommendation.includes("block")) return "avoid";
  if (agencyRecommendation.includes("act") || agencyRecommendation.includes("commit")) return "buy";

  return "watch";
}

function finalDecisionFor(
  input: ExecutiveInput,
  baseDecision: ExecutiveAction,
  states: ReturnType<typeof evaluateDecisionStates>,
  confidence: number,
  trace: string[],
): ExecutiveAction {
  if (!states.permission.allowed) {
    trace.push("Permission is blocked, so Executive cannot act.");
    return states.permission.level === "review_required" ? "review" : baseDecision === "sell" ? "sell" : "avoid";
  }
  if (states.permission.level === "review_required") {
    trace.push("Permission requires review.");
    return "review";
  }
  if (input.executionQuality?.status === "poor" && (baseDecision === "buy" || baseDecision === "sell")) {
    trace.push("Execution quality is poor, so action is held for cleaner execution.");
    return "hold";
  }
  if (confidence < 45 && baseDecision === "buy") {
    trace.push("Confidence is too low for a buy decision.");
    return "watch";
  }
  if (states.capacity.maxExposure <= 0 && (baseDecision === "buy" || baseDecision === "sell")) {
    trace.push("Capacity is zero, so action is watched instead of executed.");
    return "watch";
  }
  trace.push(`Base decision ${baseDecision} survived Executive synthesis.`);
  return baseDecision;
}

function participationModeFor(
  input: ExecutiveInput,
  states: ReturnType<typeof evaluateDecisionStates>,
  decision: ExecutiveAction,
  confidence: number,
): ExecutiveParticipationMode {
  if (!states.permission.allowed || decision === "avoid" || decision === "review") return "none";
  if (decision === "watch" || decision === "hold") return "watch";
  if (states.capacity.mode === "micro" || states.capacity.mode === "reduced" || states.permission.level === "limited") return "limited";
  if (states.capacity.mode === "expanded" && states.trust.status === "highly_trusted" && states.urgency.mode === "act_now" && confidence >= 82) return "aggressive";
  if (input.executionQuality?.status === "acceptable") return "limited";
  return "normal";
}

function strongestEvidenceFor(input: ExecutiveInput, scores: Record<string, number>) {
  const evidence = [
    ...toStringArray(input.historicalEvidence),
    ...toStringArray(input.discovery?.explanation?.supportingEvidence?.map((item: any) => item.reason ?? item.label)),
    ...toStringArray(input.belief?.supportingEvidence?.map((item: any) => item.reason ?? item.name)),
    ...toStringArray(input.judgement?.reasons),
    ...toStringArray(input.agency?.reasons),
    ...toStringArray(input.wisdom?.explanation),
    ...toStringArray(input.wisdom?.counterfactuals?.explanation),
    ...toStringArray(input.executionQuality?.warnings),
    ...toStringArray(input.counterfactual?.recommendedLearning),
  ];
  const scoredEvidence = Object.entries(scores)
    .filter(([, value]) => value >= 70)
    .map(([key, value]) => `${labelize(key)} contributes ${Math.round(value)}/100.`);
  return unique([...evidence, ...scoredEvidence]).slice(0, 8);
}

function primaryLimiterFor(
  input: ExecutiveInput,
  states: ReturnType<typeof evaluateDecisionStates>,
  restrictions: DecisionRestriction[],
) {
  return firstString(
    restrictions.find((restriction) => restriction.blocksAction || restriction.severity === "critical")?.reason,
    restrictions[0]?.reason,
    states.permission.level !== "approved" ? states.permission.reasons[0] : "",
    states.capacity.mode !== "normal" && states.capacity.mode !== "expanded" ? states.capacity.reasons[0] : "",
    input.wisdom && input.wisdom.wisdomScore < 45 ? input.wisdom.explanation : "",
    input.executionQuality?.blockers?.[0],
    input.discoveryAccountability?.blockers?.[0],
  );
}

function primaryReasonFor(input: ExecutiveInput, decision: ExecutiveAction, evidence: string[], limiter?: string) {
  return firstString(
    decision === "review" ? limiter : "",
    decision === "avoid" ? limiter : "",
    evidence[0],
    input.resolve?.explanation,
    input.belief?.reason,
    `Executive selected ${decision}.`,
  ) ?? `Executive selected ${decision}.`;
}

function conditionsFor(values: ExecutiveInput["unlockConditions"], source: string, fallbacks: unknown[]): DecisionCondition[] {
  const explicit = (Array.isArray(values) ? values : []).map((condition, index) => normalizeCondition(condition, source, index));
  const fallback = fallbacks.flatMap((item) => toStringArray(item)).map((description, index) => normalizeCondition(description, source, explicit.length + index));
  const seen = new Set<string>();
  return [...explicit, ...fallback].filter((condition) => {
    const key = condition.description.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(condition.description);
  }).slice(0, 10);
}

function normalizeCondition(value: DecisionCondition | string | undefined, source: string, index: number): DecisionCondition {
  if (value && typeof value === "object" && "description" in value) return value;
  return {
    id: `${source}-${index + 1}`,
    description: String(value ?? "").trim(),
    source,
    priority: index + 1,
  };
}

function nextReviewConditionFor(input: ExecutiveInput, states: ReturnType<typeof evaluateDecisionStates>, decision: ExecutiveAction) {
  if (decision === "review") return "Review immediately because permission requires human or policy review.";
  if (states.urgency.mode === "act_now" || states.urgency.mode === "act_soon") return "Review after the next execution-quality or risk update.";
  if (input.wisdom && input.wisdom.learningConfidence < 45) return "Review when Wisdom records more comparable outcomes or counterfactuals.";
  if (input.discoveryAccountability?.status === "immature") return "Review when discovery accountability matures or confirms recurrence.";
  return "Review when trust, permission, capacity, urgency, or invalidation evidence changes.";
}

function explanationFor(
  decision: ExecutiveAction,
  mode: ExecutiveParticipationMode,
  confidence: number,
  states: ReturnType<typeof evaluateDecisionStates>,
  reason: string,
  limiter?: string,
) {
  const limiterText = limiter ? ` Primary limiter: ${limiter}` : "";
  return `Executive decision is ${decision} with ${mode} participation, ${confidence}/100 confidence, ${states.trust.score}/100 trust, ${states.permission.level} permission, and ${states.capacity.maxExposure}% capacity. ${reason}${limiterText}`;
}

function sourceModulesFor(input: ExecutiveInput) {
  return Object.entries({
    discovery: input.discovery,
    discoveryAccountability: input.discoveryAccountability,
    recognition: input.recognition,
    belief: input.belief,
    judgement: input.judgement,
    agency: input.agency,
    wisdom: input.wisdom,
    resolve: input.resolve,
    survivalMemory: input.survivalMemory,
    calibration: input.calibration,
    readiness: input.readiness,
    executionQuality: input.executionQuality,
    counterfactual: input.counterfactual,
  }).filter(([, value]) => value != null).map(([key]) => key);
}

function normalizeAction(value: unknown): ExecutiveAction | null {
  const action = normalized(value);
  if (["buy", "sell", "hold", "watch", "avoid", "escalate", "deescalate", "review"].includes(action)) return action as ExecutiveAction;
  return null;
}

function optionalScore(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric) : null;
}

function score(value: unknown, fallback: number) {
  return Math.round(optionalScore(value) ?? fallback);
}

function roundScore(value: number) {
  return Math.round(clamp(value));
}

function roundExposure(value: number) {
  return Number(Math.max(0, value).toFixed(2));
}

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/_/g, " ");
}

function labelize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
