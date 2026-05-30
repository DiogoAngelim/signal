import type { CounterfactualResult as DecisionCounterfactualResult } from "../counterfactual/engine";
import type {
  CapacityState,
  PermissionState,
  TrustState,
  UrgencyState,
} from "../decision-states/engine";
import { evaluateDecisionStates } from "../decision-states/engine";
import type { DiscoveryAccountabilityResult } from "../discovery-accountability/engine";
import type { DiscoveryIntelligenceResult } from "../discovery-intelligence/engine";
import type { ExecutiveDecision } from "../executive/engine";
import type { ExecutionQualityResult } from "../execution-quality/engine";
import type { DecisionQualityResult } from "../wisdom/engine";

export type ExecutivePipelineOutcome = "passed" | "limited" | "blocked" | "escalated";

export type ExecutiveTone = "good" | "warn" | "bad" | "neutral";

export type CanonicalReasonCode =
  | "survival_scar"
  | "trust_below_threshold"
  | "reduced_size"
  | "recovery_incomplete"
  | "agency_unresolved"
  | "opportunity_density_low"
  | "discovery_immature"
  | "calibration_review"
  | "readiness_blocked"
  | "overfit_risk"
  | "walk_forward_instability"
  | "data_reliability_low";

export type CanonicalReason = {
  code: CanonicalReasonCode;
  label: string;
  explanation: string;
  affectedModules: string[];
  unlockCondition: string;
  invalidationCondition: string;
  priority: number;
  evidence: string[];
};

export type EvidenceSummaryItem = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: ExecutiveTone;
  priority: number;
};

export type DecisionPipelineStep = {
  stage:
    | "Discovery"
    | "Recognition"
    | "Belief"
    | "Judgement"
    | "Agency"
    | "Resolve"
    | "Wisdom"
    | "Survival"
    | "Discovery Intelligence";
  status: string;
  score: number | null;
  confidenceLabel: string;
  reason: string;
  outcome: ExecutivePipelineOutcome;
  nextRequiredImprovement: string;
};

export type TerminologyGroup = {
  concept:
    | "Trust"
    | "Confidence"
    | "Reliability"
    | "Safety"
    | "Opportunity"
    | "Wisdom"
    | "Discovery Intelligence";
  description: string;
  metrics: Array<{
    label: string;
    value: string;
    source: string;
  }>;
};

export type WhyNotFullSize = {
  active: boolean;
  mode: string;
  factors: Array<{
    priority: number;
    code: CanonicalReasonCode;
    label: string;
    explanation: string;
    unlockCondition: string;
  }>;
};

export type DecisionChangeMap = {
  increaseExposure: string[];
  reduceExposure: string[];
  invalidateSignal: string[];
  watchToLimitedToNormal: string[];
};

export type DecisionCommandAction = "act" | "wait" | "reduce" | "invalidate" | "review";

export type ExposureStateName = "observe" | "probe" | "micro" | "limited" | "normal";

export type ExposureStateStatus = "active" | "available" | "locked";

export type GovernanceVeto = {
  source: string;
  severity: "hard" | "review" | "limit";
  condition: string;
  effect: string;
};

export type GovernanceConflict = {
  id: string;
  label: string;
  severity: ExecutiveTone;
  sources: string[];
  detail: string;
  resolution: string;
};

export type GovernanceArbitration = {
  authority: string;
  finalCommand: DecisionCommandAction;
  finalDecision: string;
  participationMode: string;
  reason: string;
  vetoes: GovernanceVeto[];
  conflicts: GovernanceConflict[];
};

export type GovernanceDecisionCommand = {
  action: DecisionCommandAction;
  label: string;
  tone: ExecutiveTone;
  allowedExposureState: ExposureStateName;
  maxExposure: string;
  reason: string;
  operatorInstruction: string;
  nextAudit: string;
};

export type ExposureStatePlan = {
  state: ExposureStateName;
  label: string;
  capPct: number;
  status: ExposureStateStatus;
  entryRule: string;
  exitRule: string;
  unlockCondition: string;
  invalidationCondition: string;
};

export type ConfidenceLedgerKind = "raw" | "calibrated" | "survival" | "trust" | "discovery";

export type ConfidenceLedgerStatus =
  | "trusted"
  | "provisional"
  | "immature"
  | "scarred"
  | "blocked"
  | "pending";

export type ConfidenceLedgerItem = {
  kind: ConfidenceLedgerKind;
  label: string;
  score: number | null;
  status: ConfidenceLedgerStatus;
  question: string;
  source: string;
  interpretation: string;
};

export type RestrictionAccountabilityStatus = "pending" | "helpful" | "harmful" | "needs_audit";

export type RestrictionAccountabilityBet = {
  code: CanonicalReasonCode;
  label: string;
  status: RestrictionAccountabilityStatus;
  avoidedLoss: number | null;
  missedUpside: number | null;
  falseBlockRate: number | null;
  timeToRecovery: number | null;
  interpretation: string;
  evidenceRequired: string[];
  nextAudit: string;
};

export type AccountabilityStepStatus = "complete" | "pending" | "review" | "blocked";

export type AccountabilityLoopStep = {
  id: string;
  label: string;
  status: AccountabilityStepStatus;
  evidenceRequired: string;
  nextAction: string;
};

export type DiscoveryInstitutionalizationPlan = {
  currentStage: string;
  nextStage: string;
  allowedInfluence: string;
  stageCounts: Record<"emerging" | "detected" | "observed" | "confirmed" | "repeatable" | "trusted" | "institutional", number>;
  promotionRequirements: string[];
};

export type GovernanceEvolution = {
  command: GovernanceDecisionCommand;
  arbitration: GovernanceArbitration;
  exposureStates: ExposureStatePlan[];
  confidenceLedger: ConfidenceLedgerItem[];
  restrictionBets: RestrictionAccountabilityBet[];
  accountabilityLoop: AccountabilityLoopStep[];
  discoveryInstitutionalization: DiscoveryInstitutionalizationPlan;
};

export type ExecutiveReasoning = {
  narrative: string;
  finalDecision: string;
  recommendedParticipationMode: string;
  maxExposure: string;
  mainReasonForRestriction: CanonicalReason | null;
  primaryUnlockCondition: string;
  primaryInvalidationCondition: string;
};

export type ExecutiveDashboardIA = {
  executive: ExecutiveDecision | null;
  executionQuality: ExecutionQualityResult | null;
  counterfactual: DecisionCounterfactualResult | null;
  discoveryAccountability: DiscoveryAccountabilityResult | null;
  discoveryIntelligence: DiscoveryIntelligenceResult | null;
  wisdom: DecisionQualityResult | null;
  decisionStates: {
    trust: TrustState;
    permission: PermissionState;
    capacity: CapacityState;
    urgency: UrgencyState;
  };
  executiveReasoning: ExecutiveReasoning;
  evidenceSummary: EvidenceSummaryItem[];
  canonicalReasons: CanonicalReason[];
  decisionPipeline: DecisionPipelineStep[];
  whyNotFullSize: WhyNotFullSize;
  decisionChange: DecisionChangeMap;
  governanceEvolution: GovernanceEvolution;
  terminologyGroups: TerminologyGroup[];
  traceability: {
    preservedModules: Record<string, unknown>;
    originalState: unknown;
  };
};

export type ExecutiveDashboardInput = {
  discovery?: any;
  discoveryDensity?: any;
  discoveryPipeline?: any;
  recognition?: any;
  belief?: any;
  judgement?: any;
  agency?: any;
  agencyDiagnostics?: any;
  wisdom?: DecisionQualityResult | null;
  discoveryIntelligence?: DiscoveryIntelligenceResult | null;
  resolve?: any;
  executive?: ExecutiveDecision | null;
  executionQuality?: ExecutionQualityResult | null;
  counterfactual?: DecisionCounterfactualResult | null;
  discoveryAccountability?: DiscoveryAccountabilityResult | null;
  decisionStates?: Partial<ExecutiveDashboardIA["decisionStates"]>;
  survivalMemory?: any;
  recovery?: any;
  sizing?: any;
  trustGovernor?: any;
  calibration?: any;
  readiness?: any;
  strategyReadiness?: any;
  strategyHistory?: any;
  backtestSummary?: any;
  opportunity?: any;
  riskPct?: number | null;
  sourceState?: unknown;
};

const DEFAULT_INVALIDATION = "Invalidate if the module evidence that justified the current decision materially weakens.";

const REASON_DEFINITIONS: Record<CanonicalReasonCode, Omit<CanonicalReason, "evidence">> = {
  survival_scar: {
    code: "survival_scar",
    label: "Survival memory scar",
    explanation: "Prior similar states carried meaningful survival cost, so the system must prove recovery before normal exposure returns.",
    affectedModules: ["Survival Memory", "Recovery", "Sizing", "Trust Governor"],
    unlockCondition: "Raise survival confidence to at least 70/100 or close clean reduced-size outcomes with acceptable drawdown and stress.",
    invalidationCondition: "Invalidate reduced-size recovery if similar-state survival cost rises or near-ruin patterns reappear.",
    priority: 10,
  },
  trust_below_threshold: {
    code: "trust_below_threshold",
    label: "Trust below restoration threshold",
    explanation: "The trust layer has not cleared the score required for normal participation.",
    affectedModules: ["Trust Governor", "Agency", "Resolve", "Calibration"],
    unlockCondition: "Raise trust score to at least 70/100 and clear Trust Governor blockers.",
    invalidationCondition: "Invalidate if Trust or Judgement falls below the commitment threshold.",
    priority: 20,
  },
  reduced_size: {
    code: "reduced_size",
    label: "Reduced-size participation",
    explanation: "The signal may participate, but exposure is capped until safety, trust, and readiness gates mature.",
    affectedModules: ["Sizing", "Trust Governor", "Recovery", "Resolve"],
    unlockCondition: "Clear reduced-size review and restore normal sizing capacity.",
    invalidationCondition: "Invalidate normal-sizing restoration if reduced-size outcomes fail survival checks.",
    priority: 30,
  },
  recovery_incomplete: {
    code: "recovery_incomplete",
    label: "Recovery incomplete",
    explanation: "Recovery has not fully restored trusted capacity after prior risk or survival pressure.",
    affectedModules: ["Recovery", "Survival Memory", "Trust Governor", "Sizing"],
    unlockCondition: "Raise recovery score and trusted capacity to the module restoration threshold.",
    invalidationCondition: "Invalidate recovery if drawdown, stress, or survival cost regresses.",
    priority: 40,
  },
  agency_unresolved: {
    code: "agency_unresolved",
    label: "Agency unresolved",
    explanation: "Agency has not fully approved commitment or still requires review before exposure can increase.",
    affectedModules: ["Agency", "Resolve", "Trust Governor"],
    unlockCondition: "Clear agency policy violations and human review requirements.",
    invalidationCondition: "Invalidate if Agency denies the action.",
    priority: 50,
  },
  opportunity_density_low: {
    code: "opportunity_density_low",
    label: "Opportunity density transitional",
    explanation: "Candidate quality or density is improving but not broad enough to justify normal exposure.",
    affectedModules: ["Discovery", "Sizing", "Opportunity"],
    unlockCondition: "Raise opportunity density and candidate quality above the app participation threshold.",
    invalidationCondition: "Invalidate if opportunity density collapses across candidates.",
    priority: 60,
  },
  discovery_immature: {
    code: "discovery_immature",
    label: "Discovery confidence immature",
    explanation: "Discovery has not matured enough to carry larger participation without confirmation.",
    affectedModules: ["Discovery", "Recognition", "Resolve"],
    unlockCondition: "Raise Discovery confidence and maturity above the review threshold or let Recognition recurrence clear the review item.",
    invalidationCondition: "Invalidate Discovery novelty if recurrence evidence remains stable across additional samples.",
    priority: 70,
  },
  calibration_review: {
    code: "calibration_review",
    label: "Calibration review gate",
    explanation: "Past confidence has not proven stable enough, so the dashboard should trust calibrated confidence rather than raw confidence.",
    affectedModules: ["Calibration", "Belief", "Agency", "Trust Governor"],
    unlockCondition: "Collect enough stable calibrated outcomes for trusted calibration status.",
    invalidationCondition: "Invalidate confidence expansion if calibration error widens or outcomes become unstable.",
    priority: 80,
  },
  readiness_blocked: {
    code: "readiness_blocked",
    label: "Readiness gate blocked",
    explanation: "Production readiness has active blockers, so the system cannot convert perception into normal live exposure.",
    affectedModules: ["Readiness", "Strategy History", "Trust Governor", "Sizing"],
    unlockCondition: "Clear readiness blockers and reopen trusted sizing capacity.",
    invalidationCondition: "Invalidate live participation if readiness gates fail again.",
    priority: 90,
  },
  overfit_risk: {
    code: "overfit_risk",
    label: "Overfit risk unresolved",
    explanation: "Robustness checks still see enough overfit risk to limit trust in historical performance.",
    affectedModules: ["Judgement", "Robustness", "Strategy History", "Readiness"],
    unlockCondition: "Reduce overfit risk to 30/100 or lower and preserve edge after costs.",
    invalidationCondition: "Invalidate if profit factor, Sharpe, or drawdown looks too clean for the sample size.",
    priority: 100,
  },
  walk_forward_instability: {
    code: "walk_forward_instability",
    label: "Walk-forward instability",
    explanation: "Independent test periods do not yet show enough stability for normal participation.",
    affectedModules: ["Readiness", "Strategy History", "Judgement"],
    unlockCondition: "Stabilize walk-forward results across at least 3 independent test periods.",
    invalidationCondition: "Invalidate if walk-forward returns remain concentrated or unstable.",
    priority: 110,
  },
  data_reliability_low: {
    code: "data_reliability_low",
    label: "Data reliability low",
    explanation: "The evidence feed is not reliable enough to support larger exposure.",
    affectedModules: ["Reliability", "Readiness", "Agency", "Discovery"],
    unlockCondition: "Restore data reliability above 70/100 with fresh quotes, signals, and validation evidence.",
    invalidationCondition: "Invalidate if quote or signal coverage degrades materially.",
    priority: 120,
  },
};

export function buildExecutiveDashboardIA(input: ExecutiveDashboardInput = {}): ExecutiveDashboardIA {
  const canonicalReasons = resolveCanonicalExplanations(input);
  const evidenceSummary = buildEvidenceSummary(input);
  const decisionPipeline = buildDecisionPipeline(input);
  const extracted = extractUnlockInvalidationConditions(input, canonicalReasons);
  const executiveReasoning = buildExecutiveReasoning(input, canonicalReasons, extracted);
  const whyNotFullSize = buildWhyNotFullSize(input, canonicalReasons);
  const decisionChange = buildDecisionChangeMap(input, canonicalReasons, extracted);
  const terminologyGroups = buildTerminologyGroups(input);
  const decisionStates = buildDecisionStates(input);
  const governanceEvolution = buildGovernanceEvolution(input, canonicalReasons, extracted, decisionStates);

  return {
    executive: input.executive ?? null,
    executionQuality: input.executionQuality ?? null,
    counterfactual: input.counterfactual ?? null,
    discoveryAccountability: input.discoveryAccountability ?? null,
    discoveryIntelligence: input.discoveryIntelligence ?? null,
    wisdom: input.wisdom ?? null,
    decisionStates,
    executiveReasoning,
    evidenceSummary,
    canonicalReasons,
    decisionPipeline,
    whyNotFullSize,
    decisionChange,
    governanceEvolution,
    terminologyGroups,
    traceability: {
      preservedModules: {
        discovery: input.discovery ?? null,
        recognition: input.recognition ?? null,
        belief: input.belief ?? null,
        judgement: input.judgement ?? null,
        agency: input.agency ?? input.agencyDiagnostics ?? null,
        wisdom: input.wisdom ?? null,
        resolve: input.resolve ?? null,
        executive: input.executive ?? null,
        executionQuality: input.executionQuality ?? null,
        counterfactual: input.counterfactual ?? null,
        discoveryAccountability: input.discoveryAccountability ?? null,
        discoveryIntelligence: input.discoveryIntelligence ?? null,
        decisionStates,
        sizing: input.sizing ?? null,
        survivalMemory: input.survivalMemory ?? null,
        recovery: input.recovery ?? null,
        trustGovernor: input.trustGovernor ?? null,
        readiness: input.readiness ?? input.strategyReadiness ?? null,
        strategyHistory: input.strategyHistory ?? input.backtestSummary ?? null,
      },
      originalState: input.sourceState ?? null,
    },
  };
}

export function buildGovernanceEvolution(
  input: ExecutiveDashboardInput = {},
  canonicalReasons = resolveCanonicalExplanations(input),
  extracted = extractUnlockInvalidationConditions(input, canonicalReasons),
  decisionStates = buildDecisionStates(input),
): GovernanceEvolution {
  const confidenceLedger = buildConfidenceLedger(input);
  const exposureStates = buildExposureStatePlan(input, decisionStates, canonicalReasons, extracted);
  const conflicts = buildGovernanceConflicts(input, canonicalReasons, extracted);
  const vetoes = buildGovernanceVetoes(input, canonicalReasons, decisionStates, conflicts);
  const command = buildGovernanceDecisionCommand(input, decisionStates, exposureStates, canonicalReasons, conflicts, vetoes);
  const restrictionBets = buildRestrictionAccountability(input, canonicalReasons);
  const accountabilityLoop = buildAccountabilityLoop(input, restrictionBets);
  const discoveryInstitutionalization = buildDiscoveryInstitutionalization(input);
  const arbitration = buildGovernanceArbitration(input, command, vetoes, conflicts, canonicalReasons);

  return {
    command,
    arbitration,
    exposureStates,
    confidenceLedger,
    restrictionBets,
    accountabilityLoop,
    discoveryInstitutionalization,
  };
}

export function buildDecisionStates(input: ExecutiveDashboardInput = {}): ExecutiveDashboardIA["decisionStates"] {
  const executiveStates = input.executive?.audit?.states;
  const computed = evaluateDecisionStates({
    confidence: firstFinite(input.executive?.confidence, input.calibration?.calibratedConfidence, input.calibration?.rawConfidence),
    risk: input.riskPct,
    opportunity: firstFinite(input.opportunity?.densityPct, input.opportunity?.candidateQualityPct),
    trust: input.decisionStates?.trust ?? executiveStates?.trust ?? input.executive?.trust ?? input.trustGovernor?.trustScore,
    permission: input.decisionStates?.permission ?? executiveStates?.permission ?? input.executive?.permission,
    capacity: input.decisionStates?.capacity ?? executiveStates?.capacity ?? input.executive?.capacity ?? input.trustGovernor?.maxExposure,
    urgency: input.decisionStates?.urgency ?? executiveStates?.urgency ?? input.executive?.urgency,
    trustGovernor: input.trustGovernor,
    calibration: input.calibration,
    readiness: input.readiness ?? input.strategyReadiness,
    agency: input.agency ?? input.agencyDiagnostics,
    survivalMemory: input.survivalMemory,
    executionQuality: input.executionQuality,
  });

  return {
    trust: input.decisionStates?.trust ?? executiveStates?.trust ?? computed.trust,
    permission: input.decisionStates?.permission ?? executiveStates?.permission ?? computed.permission,
    capacity: input.decisionStates?.capacity ?? executiveStates?.capacity ?? computed.capacity,
    urgency: input.decisionStates?.urgency ?? executiveStates?.urgency ?? computed.urgency,
  };
}

export function resolveCanonicalExplanations(input: ExecutiveDashboardInput = {}): CanonicalReason[] {
  const reasons = new Map<CanonicalReasonCode, CanonicalReason>();
  const add = (code: CanonicalReasonCode, evidence: string | string[] = [], unlock?: string, invalidation?: string) => {
    const definition = REASON_DEFINITIONS[code];
    const current = reasons.get(code);
    const nextEvidence = uniqueStrings([...(current?.evidence ?? []), ...toStringArray(evidence)]);
    reasons.set(code, {
      ...definition,
      evidence: nextEvidence,
      unlockCondition: firstMeaningful(unlock, current?.unlockCondition, definition.unlockCondition),
      invalidationCondition: firstMeaningful(invalidation, current?.invalidationCondition, definition.invalidationCondition),
    });
  };

  const textEvidence = collectNarrativeText(input);
  for (const text of textEvidence) {
    for (const code of reasonCodesFromText(text)) {
      add(code, text);
    }
  }

  const survivalStatus = normalized(input.survivalMemory?.status);
  if (["scarred", "near ruin", "near_ruin"].includes(survivalStatus)) {
    add(
      "survival_scar",
      input.survivalMemory?.mainWarnings ?? input.survivalMemory?.reasons ?? input.survivalMemory?.status,
      firstString(input.survivalMemory?.unlockConditions),
      firstString(input.survivalMemory?.invalidationConditions),
    );
  }

  const recoveryStatus = normalized(input.recovery?.status);
  if (["locked", "recovering", "regressed"].includes(recoveryStatus)) {
    add(
      "recovery_incomplete",
      input.recovery?.blockers ?? input.recovery?.reasons ?? input.recovery?.status,
      firstString(input.recovery?.unlockConditions),
      firstString(input.recovery?.invalidationConditions),
    );
  }

  const trustMode = normalized(input.trustGovernor?.participationMode);
  const trustScore = firstFinite(input.trustGovernor?.trustScore, input.trustGovernor?.score);
  if (
    input.trustGovernor?.allowsNewExposure === false ||
    ["blocked", "exits only", "exits_only", "paper", "micro", "limited"].includes(trustMode) ||
    (trustScore != null && trustScore < 70)
  ) {
    const blocker = firstBlocker(input.trustGovernor);
    add(
      "trust_below_threshold",
      [
        input.trustGovernor?.primaryBlocker,
        blocker?.reason,
        ...(toStringArray(input.trustGovernor?.reasons).slice(0, 2)),
      ],
      firstString(blocker?.unlockCriteria) ?? firstString(input.trustGovernor?.unlockCriteria),
      firstString(input.trustGovernor?.contradictions) ?? firstString(input.trustGovernor?.invalidationConditions),
    );
  }

  const sizingMode = normalized(input.sizing?.sizingMode ?? input.sizing?.mode ?? input.trustGovernor?.participationMode);
  const maxExposure = firstFinite(
    input.sizing?.suggestedMaximumExposurePct,
    input.sizing?.maxExposure,
    input.sizing?.maxExposurePct,
    input.trustGovernor?.maxExposure,
    input.recovery?.recommendedExposureCap,
  );
  if (["micro", "small", "limited", "reduced", "reduced size", "reduced-size", "paper"].includes(sizingMode) || (maxExposure != null && maxExposure > 0 && maxExposure < 10)) {
    add(
      "reduced_size",
      [
        input.sizing?.limitedReason,
        input.sizing?.exposureExplanation,
        ...toStringArray(input.sizing?.sizingRationale),
        ...toStringArray(input.sizing?.sizingReasons),
      ],
      firstString(input.recovery?.unlockConditions) ?? firstString(input.trustGovernor?.unlockCriteria),
      firstString(input.recovery?.invalidationConditions) ?? firstString(input.resolve?.invalidationConditions),
    );
  }

  const agencyRecommendation = normalized(
    input.agency?.recommendation ??
      input.agencyDiagnostics?.summary?.recommendation ??
      input.agencyDiagnostics?.state?.selfDiagnosis?.recommendation,
  );
  if (agencyRecommendation && agencyRecommendation !== "act") {
    add(
      "agency_unresolved",
      input.agency?.reasons ?? input.agencyDiagnostics?.state?.selfDiagnosis?.reasons ?? agencyRecommendation,
      firstUnlockMatching(input, /agency|human review|policy/i),
      firstInvalidationMatching(input, /agency/i),
    );
  }

  const opportunityDensity = firstFinite(
    input.opportunity?.densityPct,
    input.opportunity?.opportunityDensityPct,
    input.discoveryDensity?.density,
    input.discoveryPipeline?.averageScore,
  );
  if (opportunityDensity != null && opportunityDensity < 45) {
    add("opportunity_density_low", input.discoveryDensity?.explanation ?? `Opportunity density ${Math.round(opportunityDensity)}/100.`);
  }

  const discoveryConfidence = firstFinite(input.discovery?.confidence, input.discoveryDensity?.confidence);
  const discoveryMaturity = firstFinite(input.discovery?.maturity);
  if ((discoveryConfidence != null && discoveryConfidence < 60) || (discoveryMaturity != null && discoveryMaturity < 60)) {
    add(
      "discovery_immature",
      input.discovery?.recommendedNextStep ?? input.discovery?.status,
      firstString(input.discovery?.unlockConditions) ?? firstUnlockMatching(input, /discovery|recognition/i),
      firstString(input.discovery?.invalidationConditions),
    );
  }

  const calibrationStatus = normalized(input.calibration?.status ?? input.readiness?.calibration?.status);
  if (
    ["insufficient history", "insufficient-history", "poor calibration", "poor-calibration", "unstable outcomes", "unstable-outcomes"].includes(calibrationStatus) ||
    toStringArray(input.calibration?.warnings).length > 0
  ) {
    add(
      "calibration_review",
      [input.calibration?.explanation, ...toStringArray(input.calibration?.warnings)],
      firstUnlockMatching(input, /calibration|outcome|sample/i),
      firstInvalidationMatching(input, /calibration|confidence|outcome/i),
    );
  }

  if (input.readiness?.blocked === true || input.strategyReadiness?.blocked === true || toStringArray(input.readiness?.failureFlags).length > 0) {
    add(
      "readiness_blocked",
      input.readiness?.failureFlags ?? input.readiness?.reason ?? input.strategyReadiness?.reason,
      firstUnlockMatching(input, /readiness|gate|capacity/i),
      firstInvalidationMatching(input, /readiness|gate/i),
    );
  }

  const overfitRisk = firstFinite(
    input.strategyHistory?.overfitRisk,
    input.strategyHistory?.overfitRiskScore,
    input.backtestSummary?.overfitRiskScore,
    input.judgement?.overfitRisk,
    input.readiness?.components?.robustness?.score != null ? 100 - Number(input.readiness.components.robustness.score) : null,
  );
  if (overfitRisk != null && overfitRisk > 30) {
    add("overfit_risk", `Overfit risk ${Math.round(overfitRisk)}/100.`, firstUnlockMatching(input, /overfit|robustness/i));
  }

  const walkForwardScore = walkForwardStability(input);
  if (walkForwardScore != null && walkForwardScore < 60) {
    add("walk_forward_instability", `Walk-forward stability ${Math.round(walkForwardScore)}/100.`, firstUnlockMatching(input, /walk-forward|period|segment/i));
  }

  const dataReliability = dataReliabilityScore(input);
  if (dataReliability != null && dataReliability < 70) {
    add("data_reliability_low", `Data reliability ${Math.round(dataReliability)}/100.`, firstUnlockMatching(input, /data|quote|signal/i));
  }

  return Array.from(reasons.values()).sort((a, b) => a.priority - b.priority);
}

export function buildEvidenceSummary(input: ExecutiveDashboardInput = {}): EvidenceSummaryItem[] {
  const similarSamples = firstFinite(input.recognition?.matchedSamples, input.judgement?.similarSampleSize);
  const positiveOutcomes = firstFinite(input.recognition?.matchedPositiveOutcomes, input.judgement?.evidence?.positiveOutcomes);
  const negativeOutcomes = firstFinite(input.recognition?.matchedNegativeOutcomes, input.judgement?.evidence?.negativeOutcomes);
  const neutralOutcomes = firstFinite(input.judgement?.evidence?.neutralOutcomes, input.recognition?.matchedNeutralOutcomes);
  const outcomeStability = firstFinite(input.recognition?.outcomeStability, input.judgement?.outcomeStability);
  const overfitRisk = firstFinite(input.strategyHistory?.overfitRisk, input.backtestSummary?.overfitRiskScore, input.judgement?.overfitRisk);
  const sharpeRatio = firstFinite(
    input.strategyHistory?.sharpeRatio,
    input.strategyHistory?.annualizedSharpe,
    input.backtestSummary?.annualizedSharpe,
    input.backtestSummary?.annualized_sharpe,
  );
  const profitFactor = firstFinite(input.strategyHistory?.profitFactor, input.backtestSummary?.profitFactor, input.backtestSummary?.profit_factor);
  const maxDrawdown = firstFinite(input.strategyHistory?.maxDrawdownPct, input.backtestSummary?.maxDrawdownPct, input.backtestSummary?.max_drawdown_pct);
  const dataReliability = dataReliabilityScore(input);
  const calibrationTrustworthiness = firstFinite(input.calibration?.trustworthiness, input.readiness?.trustworthiness, input.strategyReadiness?.trustworthiness);
  const walkForward = walkForwardStability(input);
  const readinessScore = firstFinite(input.readiness?.readinessScore, input.readiness?.score, input.strategyReadiness?.readinessScore, input.backtestSummary?.readinessScore);
  const wisdomScore = firstFinite(input.wisdom?.wisdomScore);
  const decisionQuality = firstFinite(input.wisdom?.decisionQuality);
  const restrictionValue = firstFinite(input.wisdom?.counterfactuals?.restrictionValue);
  const opportunityCost = firstFinite(input.wisdom?.opportunityEconomics?.opportunityCost);
  const discoveryIntelligenceScore = firstFinite(input.discoveryIntelligence?.score);

  return [
    evidence("similar-samples", "Similar samples", countValue(similarSamples), "Comparable historical state count.", countTone(similarSamples, 30), 10),
    evidence("positive-outcomes", "Positive outcomes", countValue(positiveOutcomes), "Positive outcomes among comparable samples.", countTone(positiveOutcomes, 12), 20),
    evidence("negative-outcomes", "Negative outcomes", countValue(negativeOutcomes), "Negative outcomes among comparable samples.", inverseCountTone(negativeOutcomes, positiveOutcomes), 30),
    evidence("neutral-outcomes", "Neutral outcomes", countValue(neutralOutcomes), "Neutral or mixed outcomes among comparable samples.", "neutral", 40),
    evidence("outcome-stability", "Outcome stability", pctValue(outcomeStability), "Stability of outcomes in similar states.", scoreTone(outcomeStability), 50),
    evidence("overfit-risk", "Overfit risk", pctValue(overfitRisk), "Residual robustness or overfit pressure.", inverseScoreTone(overfitRisk, 30), 60),
    evidence("sharpe-ratio", "Sharpe ratio", decimalValue(sharpeRatio), "Risk-adjusted return after the available strategy checks.", sharpeTone(sharpeRatio), 70),
    evidence("profit-factor", "Profit factor", decimalValue(profitFactor), "Gross profit divided by gross loss.", profitFactorTone(profitFactor), 80),
    evidence("max-drawdown", "Max drawdown", pctValue(maxDrawdown), "Largest peak-to-trough loss in the available history.", inverseScoreTone(maxDrawdown, 25), 90),
    evidence("data-reliability", "Data reliability", pctValue(dataReliability), "Freshness and coverage of quotes, signals, and validation data.", scoreTone(dataReliability), 100),
    evidence("calibration-trustworthiness", "Calibration trustworthiness", pctValue(calibrationTrustworthiness), "How trustworthy calibrated confidence is relative to raw confidence.", scoreTone(calibrationTrustworthiness), 110),
    evidence("walk-forward-stability", "Walk-forward stability", pctValue(walkForward), "Stability across independent test periods.", scoreTone(walkForward), 120),
    evidence("readiness-score", "Readiness score", pctValue(readinessScore), "Overall production or live-test readiness.", scoreTone(readinessScore), 130),
    evidence("wisdom-score", "Wisdom score", pctValue(wisdomScore), "Decision quality after opportunity cost, counterfactuals, Agency value, and portfolio reasoning.", scoreTone(wisdomScore), 140),
    evidence("decision-quality", "Decision quality", pctValue(decisionQuality), "How the proposed action compares with alternatives and historical outcomes.", scoreTone(decisionQuality), 150),
    evidence("restriction-value", "Restriction value", pctValue(restrictionValue), "Whether restrictions saved more downside than they sacrificed upside.", scoreTone(restrictionValue), 160),
    evidence("opportunity-cost", "Opportunity cost", decimalValue(opportunityCost), "Utility sacrificed by not taking the best available option.", inverseScoreTone(opportunityCost, 25), 170),
    evidence("discovery-intelligence-score", "Discovery intelligence", pctValue(discoveryIntelligenceScore), "Whether discoveries, governance, economics, institutional knowledge, and meta-learning create durable value.", scoreTone(discoveryIntelligenceScore), 180),
  ];
}

export function buildDecisionPipeline(input: ExecutiveDashboardInput = {}): DecisionPipelineStep[] {
  const discoveryScore = firstFinite(input.discovery?.confidence, input.discoveryDensity?.confidence, input.discoveryPipeline?.averageScore);
  const recognitionScore = firstFinite(input.recognition?.recognitionScore, input.recognition?.recurrenceConfidence);
  const beliefScore = firstFinite(input.belief?.confidence, input.belief?.trustworthiness);
  const judgementScore = firstFinite(input.judgement?.adjustedConfidence, input.judgement?.reliability);
  const agencyScore = agencyTrustScore(input);
  const wisdomScore = firstFinite(input.wisdom?.wisdomScore, input.wisdom?.decisionQuality);
  const resolveScore = firstFinite(input.resolve?.resolveScore);
  const survivalScore = firstFinite(input.survivalMemory?.survivalConfidence, input.survivalMemory?.score, input.survivalMemory?.survivalScore);
  const discoveryIntelligenceScore = firstFinite(input.discoveryIntelligence?.score);

  return [
    {
      stage: "Discovery",
      status: readable(input.discovery?.status ?? input.discovery?.lifecycle?.status ?? "pending"),
      score: discoveryScore,
      confidenceLabel: pctValue(discoveryScore),
      reason: firstMeaningful(input.discovery?.recommendedNextStep, input.discoveryDensity?.explanation, input.discovery?.explanation, "Discovery evidence is pending."),
      outcome: outcomeFromScoreStatus(discoveryScore, input.discovery?.status),
      nextRequiredImprovement: firstMeaningful(input.discovery?.recommendedNextStep, firstUnlockMatching(input, /discovery|candidate|density/i), "Mature candidate density and confidence."),
    },
    {
      stage: "Recognition",
      status: readable(input.recognition?.verdict ?? "pending"),
      score: recognitionScore,
      confidenceLabel: pctValue(recognitionScore),
      reason: firstMeaningful(input.recognition?.reason, "Recognition is waiting for comparable state evidence."),
      outcome: recognitionOutcome(input.recognition),
      nextRequiredImprovement: firstMeaningful(firstString(input.recognition?.missingEvidence), firstUnlockMatching(input, /recognition|recurrence|sample/i), "Increase comparable state and outcome evidence."),
    },
    {
      stage: "Belief",
      status: readable(input.belief?.verdict ?? "pending"),
      score: beliefScore,
      confidenceLabel: pctValue(beliefScore),
      reason: firstMeaningful(input.belief?.reason, "Belief evidence is pending."),
      outcome: beliefOutcome(input.belief),
      nextRequiredImprovement: firstMeaningful(firstString(input.belief?.blockers), firstString(input.belief?.warnings), "Resolve contradictory evidence and improve evidence agreement."),
    },
    {
      stage: "Judgement",
      status: readable(input.judgement?.status ?? "pending"),
      score: judgementScore,
      confidenceLabel: pctValue(judgementScore),
      reason: firstMeaningful(firstString(input.judgement?.reasons), "Judgement is waiting for similar historical outcomes."),
      outcome: judgementOutcome(input.judgement),
      nextRequiredImprovement: firstMeaningful(firstString(input.judgement?.warnings), firstUnlockMatching(input, /judgement|similar|outcome/i), "Raise reliability and outcome stability."),
    },
    {
      stage: "Agency",
      status: readable(input.agency?.recommendation ?? input.agencyDiagnostics?.summary?.recommendation ?? "pending"),
      score: agencyScore,
      confidenceLabel: pctValue(agencyScore),
      reason: firstMeaningful(firstString(input.agency?.reasons), firstString(input.agencyDiagnostics?.state?.selfDiagnosis?.reasons), "Agency diagnostics are pending."),
      outcome: agencyOutcome(input),
      nextRequiredImprovement: firstMeaningful(firstUnlockMatching(input, /agency|human review|policy/i), "Clear agency review and policy requirements."),
    },
    {
      stage: "Resolve",
      status: readable(input.resolve?.decision ?? "pending"),
      score: resolveScore,
      confidenceLabel: pctValue(resolveScore),
      reason: firstMeaningful(input.resolve?.explanation, "Resolve will appear after upstream evidence is evaluated."),
      outcome: resolveOutcome(input.resolve),
      nextRequiredImprovement: firstMeaningful(firstString(input.resolve?.unlockConditions), firstString(input.resolve?.missingEvidence), "Clear the primary resolve gate."),
    },
    {
      stage: "Wisdom",
      status: readable(input.wisdom ? "evaluated" : "pending"),
      score: wisdomScore,
      confidenceLabel: pctValue(wisdomScore),
      reason: firstMeaningful(input.wisdom?.explanation, input.wisdom?.counterfactuals?.explanation, "Wisdom is waiting for decision outcome memory and counterfactual evidence."),
      outcome: outcomeFromScoreStatus(wisdomScore, input.wisdom ? "evaluated" : "pending"),
      nextRequiredImprovement: firstMeaningful(
        input.wisdom?.counterfactuals?.missedUpside && input.wisdom.counterfactuals.missedUpside > input.wisdom.counterfactuals.avoidedLoss
          ? "Reduce opportunity cost or allow smaller probes when caution is too expensive."
          : "",
        input.wisdom?.learningConfidence != null && input.wisdom.learningConfidence < 60
          ? "Record more comparable outcomes and alternative scenario results."
          : "",
        "Record decision outcomes, alternatives, and realized counterfactuals.",
      ),
    },
    {
      stage: "Survival",
      status: readable(input.survivalMemory?.status ?? "pending"),
      score: survivalScore,
      confidenceLabel: pctValue(survivalScore),
      reason: firstMeaningful(firstString(input.survivalMemory?.mainWarnings), firstString(input.survivalMemory?.reasons), "Survival memory is waiting for comparable outcome evidence."),
      outcome: outcomeFromScoreStatus(survivalScore, input.survivalMemory?.status),
      nextRequiredImprovement: firstMeaningful(firstString(input.survivalMemory?.unlockConditions), "Clear active survival restrictions and preserve recovery evidence."),
    },
    {
      stage: "Discovery Intelligence",
      status: readable(input.discoveryIntelligence ? "evaluated" : "pending"),
      score: discoveryIntelligenceScore,
      confidenceLabel: pctValue(discoveryIntelligenceScore),
      reason: firstMeaningful(firstString(input.discoveryIntelligence?.recommendations?.map((item) => item.message)), "Discovery Intelligence is waiting for lifecycle, economics, governance, institutional, and outcome traces."),
      outcome: outcomeFromScoreStatus(discoveryIntelligenceScore, input.discoveryIntelligence ? "evaluated" : "pending"),
      nextRequiredImprovement: firstMeaningful(firstString(input.discoveryIntelligence?.recommendations?.map((item) => item.message)), "Record outcomes for discoveries, decisions, restrictions, and institutional promotions."),
    },
  ];
}

export function extractUnlockInvalidationConditions(
  input: ExecutiveDashboardInput = {},
  canonicalReasons = resolveCanonicalExplanations(input),
) {
  const unlockConditions = uniqueStrings([
    ...canonicalReasons.map((reason) => reason.unlockCondition),
    ...toStringArray(input.discovery?.unlockConditions),
    ...toStringArray(input.recognition?.missingEvidence),
    ...toStringArray(input.recovery?.unlockConditions),
    ...toStringArray(input.survivalMemory?.unlockConditions),
    ...toStringArray(input.trustGovernor?.unlockCriteria),
    ...toStringArray(firstBlocker(input.trustGovernor)?.unlockCriteria),
    ...toStringArray(input.resolve?.unlockConditions),
    ...toStringArray(input.executive?.unlockConditions?.map((condition: any) => condition.description ?? condition)),
    ...toStringArray(input.discoveryAccountability?.unlockConditions),
    ...toStringArray(input.discoveryIntelligence?.recommendations?.map((item) => item.message)),
    ...toStringArray(input.wisdom?.counterfactuals?.explanation),
    ...(input.wisdom?.opportunityEconomics?.opportunityCost && input.wisdom.opportunityEconomics.opportunityCost > 25
      ? ["Review caution cost and consider smaller scaled actions when restrictions are too expensive."]
      : []),
    ...toStringArray(input.executionQuality?.warnings),
    ...toStringArray(input.counterfactual?.recommendedLearning),
    ...toStringArray(input.readiness?.unlockConditions),
  ]);

  const invalidationConditions = uniqueStrings([
    ...canonicalReasons.map((reason) => reason.invalidationCondition),
    ...toStringArray(input.discovery?.invalidationConditions),
    ...toStringArray(input.recognition?.invalidationConditions),
    ...toStringArray(input.recovery?.invalidationConditions),
    ...toStringArray(input.survivalMemory?.invalidationConditions),
    ...toStringArray(input.resolve?.invalidationConditions),
    ...toStringArray(input.executive?.invalidationConditions?.map((condition: any) => condition.description ?? condition)),
    ...toStringArray(input.trustGovernor?.contradictions),
    ...(input.wisdom?.decisionQuality != null && input.wisdom.decisionQuality < 35
      ? ["Invalidate if Wisdom shows the actual decision persistently underperforms available alternatives."]
      : []),
    ...(input.discoveryIntelligence?.economics.missedUpside != null &&
    input.discoveryIntelligence.economics.missedUpside > input.discoveryIntelligence.economics.avoidedLoss
      ? ["Invalidate institutional trust if discovery caution persistently costs more value than it protects."]
      : []),
  ]);

  return {
    unlockConditions,
    invalidationConditions,
    primaryUnlockCondition: unlockConditions[0] ?? "Collect more evidence until the primary limiting gate clears.",
    primaryInvalidationCondition: invalidationConditions[0] ?? DEFAULT_INVALIDATION,
  };
}

export function buildWhyNotFullSize(
  input: ExecutiveDashboardInput = {},
  canonicalReasons = resolveCanonicalExplanations(input),
): WhyNotFullSize {
  const mode = normalizedParticipationMode(input);
  const maxExposure = firstFinite(
    input.trustGovernor?.maxExposure,
    input.sizing?.suggestedMaximumExposurePct,
    input.sizing?.maxExposure,
    input.recovery?.recommendedExposureCap,
    input.readiness?.maxPositionPct,
  );
  const active = ["micro", "small", "limited", "reduced", "reduced-size", "paper", "blocked", "exits-only", "exits_only"].includes(mode) ||
    (maxExposure != null && maxExposure < 10) ||
    canonicalReasons.length > 0;
  const factors = canonicalReasons
    .filter((reason) => [
      "survival_scar",
      "trust_below_threshold",
      "reduced_size",
      "recovery_incomplete",
      "discovery_immature",
      "opportunity_density_low",
      "agency_unresolved",
      "calibration_review",
      "readiness_blocked",
    ].includes(reason.code))
    .sort((a, b) => a.priority - b.priority)
    .map((reason, index) => ({
      priority: index + 1,
      code: reason.code,
      label: reason.label,
      explanation: reason.explanation,
      unlockCondition: reason.unlockCondition,
    }));

  return {
    active,
    mode: readable(mode || "normal"),
    factors,
  };
}

export function buildDecisionChangeMap(
  input: ExecutiveDashboardInput = {},
  canonicalReasons = resolveCanonicalExplanations(input),
  extracted = extractUnlockInvalidationConditions(input, canonicalReasons),
): DecisionChangeMap {
  const increaseExposure = uniqueStrings([
    ...canonicalReasons.slice(0, 5).map((reason) => reason.unlockCondition),
    ...extracted.unlockConditions.slice(0, 4),
  ]).slice(0, 6);
  const reduceExposure = uniqueStrings([
    ...canonicalReasons.map((reason) => reason.invalidationCondition),
    ...extracted.invalidationConditions,
    "Reduce exposure if risk, drawdown, or survival cost rises materially.",
  ]).slice(0, 6);
  const invalidateSignal = uniqueStrings([
    ...extracted.invalidationConditions,
    firstInvalidationMatching(input, /resolve|signal|belief|agency/i),
  ]).slice(0, 5);
  const primaryUnlock = extracted.primaryUnlockCondition;
  const normalUnlock = canonicalReasons.find((reason) => reason.code === "survival_scar" || reason.code === "recovery_incomplete")?.unlockCondition ??
    canonicalReasons.find((reason) => reason.code === "trust_below_threshold")?.unlockCondition ??
    primaryUnlock;

  return {
    increaseExposure: increaseExposure.length ? increaseExposure : ["Clear the active restriction reasons and preserve evidence stability."],
    reduceExposure,
    invalidateSignal: invalidateSignal.length ? invalidateSignal : [DEFAULT_INVALIDATION],
    watchToLimitedToNormal: [
      `Watch -> limited: ${primaryUnlock}`,
      `Limited -> normal: ${normalUnlock}`,
    ],
  };
}

export function buildTerminologyGroups(input: ExecutiveDashboardInput = {}): TerminologyGroup[] {
  const trustScore = firstFinite(input.trustGovernor?.trustScore);
  const trustworthiness = firstFinite(input.calibration?.trustworthiness, input.belief?.trustworthiness);
  const agencyTrust = agencyTrustScore(input);
  const rawConfidence = firstFinite(input.calibration?.rawConfidence, input.judgement?.rawConfidence);
  const calibratedConfidence = firstFinite(input.calibration?.calibratedConfidence, input.judgement?.adjustedConfidence);
  const adjustedConfidence = firstFinite(input.judgement?.adjustedConfidence);
  const confidenceCap = firstFinite(input.trustGovernor?.confidenceCap, input.readiness?.maxConfidence);
  const reliability = firstFinite(input.judgement?.reliability, input.strategyHistory?.modelReliability, input.readiness?.modelReliability);
  const calibrationHealth = firstFinite(input.agency?.calibrationHealthPct != null ? input.agency.calibrationHealthPct * 100 : null, input.calibration?.trustworthiness);
  const survivalConfidence = firstFinite(input.survivalMemory?.survivalConfidence);
  const recoveryScore = firstFinite(input.recovery?.recoveryScore);
  const opportunityDensity = firstFinite(input.opportunity?.densityPct, input.discoveryDensity?.density);
  const candidateQuality = firstFinite(input.opportunity?.candidateQualityPct, input.discoveryDensity?.quality, input.discoveryPipeline?.averageScore);
  const discoveryConfidence = firstFinite(input.discovery?.confidence, input.discoveryDensity?.confidence);
  const wisdomScore = firstFinite(input.wisdom?.wisdomScore);
  const restrictionValue = firstFinite(input.wisdom?.counterfactuals?.restrictionValue);
  const opportunityCost = firstFinite(input.wisdom?.opportunityEconomics?.opportunityCost);
  const discoveryIntelligenceScore = firstFinite(input.discoveryIntelligence?.score);
  const maturityScore = firstFinite(input.discoveryIntelligence?.maturity.maturityScore);
  const governanceScore = firstFinite(input.discoveryIntelligence?.governance.score);
  const metaLearningScore = firstFinite(input.discoveryIntelligence?.metaLearning.score);

  return [
    group("Trust", "Whether the system is allowed to rely on its evidence.", [
      metric("Trust score", pctValue(trustScore), "Trust Governor"),
      metric("Trustworthiness", pctValue(trustworthiness), "Calibration / Belief"),
      metric("Agency trust", pctValue(agencyTrust), "Agency"),
    ]),
    group("Confidence", "How strongly the current signal is believed before and after calibration.", [
      metric("Raw confidence", pctValue(rawConfidence), "Calibration"),
      metric("Calibrated confidence", pctValue(calibratedConfidence), "Calibration"),
      metric("Adjusted confidence", pctValue(adjustedConfidence), "Judgement"),
      metric("Confidence cap", pctValue(confidenceCap), "Trust Governor"),
    ]),
    group("Reliability", "How stable the evidence and model history are.", [
      metric("Data reliability", pctValue(dataReliabilityScore(input)), "Reliability"),
      metric("Model reliability", pctValue(reliability), "Judgement / Readiness"),
      metric("Calibration health", pctValue(calibrationHealth), "Calibration"),
      metric("Walk-forward stability", pctValue(walkForwardStability(input)), "Strategy History"),
    ]),
    group("Safety", "Whether prior damage, recovery, and risk controls allow exposure.", [
      metric("Survival memory", readable(input.survivalMemory?.status ?? "pending"), "Survival Memory"),
      metric("Survival confidence", pctValue(survivalConfidence), "Survival Memory"),
      metric("Recovery score", pctValue(recoveryScore), "Recovery"),
      metric("Max drawdown", pctValue(firstFinite(input.strategyHistory?.maxDrawdownPct, input.backtestSummary?.maxDrawdownPct)), "Strategy History"),
    ]),
    group("Opportunity", "Whether enough high-quality candidates exist to justify participation.", [
      metric("Opportunity density", pctValue(opportunityDensity), "Discovery"),
      metric("Candidate quality", pctValue(candidateQuality), "Discovery"),
      metric("Discovery confidence", pctValue(discoveryConfidence), "Discovery"),
    ]),
    group("Wisdom", "Whether the action is justified against alternatives, restrictions, and capital use.", [
      metric("Wisdom score", pctValue(wisdomScore), "Wisdom"),
      metric("Restriction value", pctValue(restrictionValue), "Wisdom / Counterfactuals"),
      metric("Opportunity cost", decimalValue(opportunityCost), "Wisdom / Opportunity Economics"),
    ]),
    group("Discovery Intelligence", "Whether discovery behavior creates value and becomes trusted reusable knowledge.", [
      metric("Discovery Intelligence score", pctValue(discoveryIntelligenceScore), "Discovery Intelligence"),
      metric("Maturity score", pctValue(maturityScore), "Discovery Intelligence"),
      metric("Governance score", pctValue(governanceScore), "Discovery Intelligence"),
      metric("Meta-learning score", pctValue(metaLearningScore), "Discovery Intelligence"),
    ]),
  ];
}

function buildExecutiveReasoning(
  input: ExecutiveDashboardInput,
  canonicalReasons: CanonicalReason[],
  extracted: ReturnType<typeof extractUnlockInvalidationConditions>,
): ExecutiveReasoning {
  const finalDecision = finalDecisionLabel(input);
  const participationMode = readable(normalizedParticipationMode(input) || "pending");
  const maxExposureValue = firstFinite(
    input.trustGovernor?.maxExposure,
    input.sizing?.suggestedMaximumExposurePct,
    input.sizing?.maxExposure,
    input.recovery?.recommendedExposureCap,
    input.readiness?.maxPositionPct,
  );
  const maxExposure = maxExposureValue == null ? "Pending" : pctValue(maxExposureValue);
  const mainReason = canonicalReasons[0] ?? null;
  const opportunityPhrase = opportunityPhraseFor(input);
  const reliabilityPhrase = reliabilityPhraseFor(input);
  const riskPhrase = riskPhraseFor(input);
  const wisdomPhrase = input.wisdom
    ? `Wisdom scores decision quality at ${pctValue(input.wisdom.decisionQuality)} with ${pctValue(input.wisdom.counterfactuals.restrictionValue)} restriction value`
    : "Wisdom is still collecting outcome memory";
  const discoveryIntelligencePhrase = input.discoveryIntelligence
    ? `Discovery Intelligence scores the learning loop at ${pctValue(input.discoveryIntelligence.score)}`
    : "Discovery Intelligence is still collecting lifecycle and outcome evidence";
  const recoveryPhrase = canonicalReasons.some((reason) => reason.code === "recovery_incomplete" || reason.code === "survival_scar")
    ? "recovery is incomplete"
    : "recovery is not the active limiter";
  const restrictionPhrase = mainReason
    ? `${mainReason.label.toLowerCase()} remains active`
    : "no primary restriction is active";
  const narrative = `${opportunityPhrase} with ${reliabilityPhrase} reliability and ${riskPhrase}. ${wisdomPhrase}. ${discoveryIntelligencePhrase}. However, ${restrictionPhrase}, so governance recommends ${participationMode.toLowerCase()} participation. The opportunity is ${opportunityPhrase.includes("positive") || opportunityPhrase.includes("real") ? "real" : "not fully proven"}, but ${recoveryPhrase}.`;

  return {
    narrative,
    finalDecision,
    recommendedParticipationMode: participationMode,
    maxExposure,
    mainReasonForRestriction: mainReason,
    primaryUnlockCondition: extracted.primaryUnlockCondition,
    primaryInvalidationCondition: extracted.primaryInvalidationCondition,
  };
}

function buildConfidenceLedger(input: ExecutiveDashboardInput): ConfidenceLedgerItem[] {
  const raw = firstFinite(input.calibration?.rawConfidence, input.judgement?.rawConfidence, input.executive?.confidence);
  const calibrated = firstFinite(input.calibration?.calibratedConfidence, input.judgement?.adjustedConfidence);
  const survival = firstFinite(input.survivalMemory?.survivalConfidence, input.survivalMemory?.score, input.survivalMemory?.survivalScore);
  const trust = firstFinite(input.trustGovernor?.trustScore, input.executive?.trust, input.calibration?.trustworthiness);
  const discovery = firstFinite(input.discovery?.confidence, input.discoveryDensity?.confidence, input.discoveryIntelligence?.maturity.maturityScore);

  return [
    confidenceLedgerItem(
      "raw",
      "Raw confidence",
      raw,
      "What does the model think before outcome correction?",
      "Calibration / Judgement",
      confidenceInterpretation("raw", raw, input),
      confidenceStatusFor("raw", raw, input),
    ),
    confidenceLedgerItem(
      "calibrated",
      "Calibrated confidence",
      calibrated,
      "How often is the model right when it feels this sure?",
      "Calibration",
      confidenceInterpretation("calibrated", calibrated, input),
      confidenceStatusFor("calibrated", calibrated, input),
    ),
    confidenceLedgerItem(
      "survival",
      "Survival confidence",
      survival,
      "Can this state avoid damaging drawdown and recovery burden?",
      "Survival Memory",
      confidenceInterpretation("survival", survival, input),
      confidenceStatusFor("survival", survival, input),
    ),
    confidenceLedgerItem(
      "trust",
      "Governance trust",
      trust,
      "Is the decision process reliable enough to rely on?",
      "Trust Governor / Executive",
      confidenceInterpretation("trust", trust, input),
      confidenceStatusFor("trust", trust, input),
    ),
    confidenceLedgerItem(
      "discovery",
      "Discovery confidence",
      discovery,
      "Is the edge becoming repeatable rather than merely interesting?",
      "Discovery / Discovery Intelligence",
      confidenceInterpretation("discovery", discovery, input),
      confidenceStatusFor("discovery", discovery, input),
    ),
  ];
}

function confidenceLedgerItem(
  kind: ConfidenceLedgerKind,
  label: string,
  score: number | null,
  question: string,
  source: string,
  interpretation: string,
  status: ConfidenceLedgerStatus,
): ConfidenceLedgerItem {
  return {
    kind,
    label,
    score,
    status,
    question,
    source,
    interpretation,
  };
}

function buildExposureStatePlan(
  input: ExecutiveDashboardInput,
  decisionStates: ExecutiveDashboardIA["decisionStates"],
  canonicalReasons: CanonicalReason[],
  extracted: ReturnType<typeof extractUnlockInvalidationConditions>,
): ExposureStatePlan[] {
  const activeState = exposureStateFor(input, decisionStates);
  const maxExposure = firstFinite(
    decisionStates.capacity.maxExposure,
    input.trustGovernor?.maxExposure,
    input.sizing?.suggestedMaximumExposurePct,
    input.sizing?.maxExposure,
    input.recovery?.recommendedExposureCap,
    input.readiness?.maxPositionPct,
  );
  const normalUnlock = canonicalReasons.find((reason) => reason.code === "survival_scar" || reason.code === "recovery_incomplete")?.unlockCondition ??
    extracted.primaryUnlockCondition;
  const limitedUnlock = canonicalReasons.find((reason) => reason.code === "trust_below_threshold")?.unlockCondition ??
    canonicalReasons.find((reason) => reason.code === "agency_unresolved")?.unlockCondition ??
    extracted.primaryUnlockCondition;

  const definitions: Array<Omit<ExposureStatePlan, "status">> = [
    {
      state: "observe",
      label: "Observe",
      capPct: 0,
      entryRule: "Any hard veto, blocked permission, or missing minimum evidence.",
      exitRule: "Move to probe only after permission is no longer blocked.",
      unlockCondition: limitedUnlock,
      invalidationCondition: extracted.primaryInvalidationCondition,
    },
    {
      state: "probe",
      label: "Probe",
      capPct: exposureCapFor("probe", maxExposure),
      entryRule: "Permission is limited, evidence is promising, and hard vetoes are absent.",
      exitRule: "Close a small outcome with controlled adverse excursion and usable liquidity.",
      unlockCondition: "Record a clean probe outcome with acceptable slippage, drawdown, and timing.",
      invalidationCondition: "Return to observe if probe adverse excursion breaches the survival boundary.",
    },
    {
      state: "micro",
      label: "Micro",
      capPct: exposureCapFor("micro", maxExposure),
      entryRule: "Trust is provisional or survival memory is scarred, but action is allowed.",
      exitRule: "Promote only after reduced-size outcomes support survival and trust restoration.",
      unlockCondition: normalUnlock,
      invalidationCondition: extracted.primaryInvalidationCondition,
    },
    {
      state: "limited",
      label: "Limited",
      capPct: exposureCapFor("limited", maxExposure),
      entryRule: "Trust clears review, readiness is open, and discovery is at least confirmed.",
      exitRule: "Promote after survival, calibration, trust, and discovery gates remain stable.",
      unlockCondition: normalUnlock,
      invalidationCondition: "Reduce to micro if trust, opportunity density, or survival confidence regresses.",
    },
    {
      state: "normal",
      label: "Normal",
      capPct: exposureCapFor("normal", maxExposure),
      entryRule: "Primary restrictions are clear and discovery is repeatable or trusted.",
      exitRule: "Downgrade immediately when a veto, contradiction, or adverse outcome appears.",
      unlockCondition: "Maintain trusted calibration, clear survival status, and repeatable discovery evidence.",
      invalidationCondition: "Invalidate normal sizing if any active veto reappears.",
    },
  ];
  const activeIndex = Math.max(0, definitions.findIndex((item) => item.state === activeState));

  return definitions.map((item, index) => ({
    ...item,
    status: index === activeIndex ? "active" : index < activeIndex ? "available" : "locked",
  }));
}

function buildGovernanceConflicts(
  input: ExecutiveDashboardInput,
  _canonicalReasons: CanonicalReason[],
  extracted: ReturnType<typeof extractUnlockInvalidationConditions>,
): GovernanceConflict[] {
  const conflicts: GovernanceConflict[] = [];
  const finalDecision = normalized(finalDecisionLabel(input));
  const wisdomBest = normalized(input.wisdom?.opportunityEconomics?.bestOption);
  const rawConfidence = firstFinite(input.calibration?.rawConfidence, input.judgement?.rawConfidence);
  const calibratedConfidence = firstFinite(input.calibration?.calibratedConfidence, input.judgement?.adjustedConfidence);
  const survivalStatus = normalized(input.survivalMemory?.status);
  const survivalConfidence = firstFinite(input.survivalMemory?.survivalConfidence, input.survivalMemory?.score, input.survivalMemory?.survivalScore);
  const actionLeaning = /act|buy|commit|escalate/.test(finalDecision);

  if (actionLeaning && (wisdomBest === "reject" || wisdomBest === "wait")) {
    conflicts.push({
      id: "executive-wisdom-conflict",
      label: "Executive and Wisdom disagree",
      severity: wisdomBest === "reject" ? "bad" : "warn",
      sources: ["Executive", "Wisdom"],
      detail: `Executive leans ${readable(finalDecision)}, while Wisdom prefers ${readable(wisdomBest)}.`,
      resolution: "Route the decision through governance review; larger sizing stays locked until the opportunity economics agree with the executive posture.",
    });
  }

  if (
    survivalConfidence != null &&
    survivalConfidence >= 70 &&
    ["scarred", "near ruin", "near_ruin"].includes(survivalStatus) &&
    extracted.unlockConditions.some((condition) => /survival confidence.*70|70.*survival confidence/i.test(condition))
  ) {
    conflicts.push({
      id: "survival-threshold-status-conflict",
      label: "Survival score cleared but scar status remains",
      severity: "warn",
      sources: ["Survival Memory", "Recovery"],
      detail: `Survival confidence is ${Math.round(survivalConfidence)}/100, but status is still ${readable(survivalStatus)}.`,
      resolution: "Treat the status and reduced-size outcome record as the authority; the scalar score alone cannot restore normal sizing.",
    });
  }

  if (rawConfidence != null && calibratedConfidence != null && rawConfidence - calibratedConfidence >= 15) {
    conflicts.push({
      id: "raw-calibrated-confidence-gap",
      label: "Raw confidence exceeds calibrated confidence",
      severity: "warn",
      sources: ["Calibration", "Judgement"],
      detail: `Raw confidence is ${Math.round(rawConfidence)}%, calibrated confidence is ${Math.round(calibratedConfidence)}%.`,
      resolution: "Use calibrated confidence for trust, permission, and sizing until outcome stability closes the gap.",
    });
  }

  return conflicts;
}

function buildGovernanceVetoes(
  input: ExecutiveDashboardInput,
  canonicalReasons: CanonicalReason[],
  decisionStates: ExecutiveDashboardIA["decisionStates"],
  conflicts: GovernanceConflict[],
): GovernanceVeto[] {
  const vetoes: GovernanceVeto[] = [];
  const reasonCodes = new Set(canonicalReasons.map((reason) => reason.code));

  if (!decisionStates.permission.allowed || decisionStates.permission.level === "blocked") {
    vetoes.push({
      source: "Permission",
      severity: "hard",
      condition: firstString(decisionStates.permission.reasons) ?? "Permission is blocked.",
      effect: "No new exposure may be opened.",
    });
  }

  if (reasonCodes.has("data_reliability_low")) {
    vetoes.push({
      source: "Data Reliability",
      severity: "hard",
      condition: canonicalReasons.find((reason) => reason.code === "data_reliability_low")?.label ?? "Data reliability low",
      effect: "Decision must wait or invalidate until evidence is synchronized.",
    });
  }

  if (reasonCodes.has("readiness_blocked")) {
    vetoes.push({
      source: "Readiness",
      severity: "hard",
      condition: canonicalReasons.find((reason) => reason.code === "readiness_blocked")?.label ?? "Readiness blocked",
      effect: "Live participation is blocked.",
    });
  }

  for (const code of ["survival_scar", "trust_below_threshold", "recovery_incomplete", "agency_unresolved"] as CanonicalReasonCode[]) {
    const reason = canonicalReasons.find((item) => item.code === code);
    if (!reason) continue;
    vetoes.push({
      source: reason.affectedModules[0] ?? reason.label,
      severity: code === "agency_unresolved" ? "review" : "limit",
      condition: reason.label,
      effect: code === "agency_unresolved" ? "Requires review before exposure increases." : "Caps exposure below normal sizing.",
    });
  }

  if (conflicts.some((conflict) => conflict.id === "executive-wisdom-conflict")) {
    vetoes.push({
      source: "Wisdom",
      severity: "review",
      condition: "Executive posture conflicts with opportunity economics.",
      effect: "Escalates the decision to review before larger participation.",
    });
  }

  if (input.trustGovernor?.allowsNewExposure === false) {
    vetoes.push({
      source: "Trust Governor",
      severity: "hard",
      condition: input.trustGovernor.primaryBlocker ?? "Trust Governor blocks new exposure.",
      effect: "New exposure is blocked until the trust gate reopens.",
    });
  }

  return vetoes;
}

function buildGovernanceDecisionCommand(
  input: ExecutiveDashboardInput,
  decisionStates: ExecutiveDashboardIA["decisionStates"],
  exposureStates: ExposureStatePlan[],
  canonicalReasons: CanonicalReason[],
  conflicts: GovernanceConflict[],
  vetoes: GovernanceVeto[],
): GovernanceDecisionCommand {
  const finalDecision = normalized(finalDecisionLabel(input));
  const activeExposure = exposureStates.find((state) => state.status === "active") ?? exposureStates[0];
  const hardVeto = vetoes.find((veto) => veto.severity === "hard");
  const primaryConflict = conflicts[0];
  const mainReason = canonicalReasons[0];
  const action = commandActionFor(finalDecision, decisionStates, hardVeto, primaryConflict);
  const tone = commandToneFor(action, activeExposure?.state, vetoes);
  const label = commandLabelFor(action, activeExposure?.label ?? "Observe");
  const reason = primaryConflict?.resolution ??
    hardVeto?.effect ??
    mainReason?.explanation ??
    (action === "act" ? "Governance allows participation inside the active exposure state." : "Governance is waiting for clearer evidence.");

  return {
    action,
    label,
    tone,
    allowedExposureState: activeExposure?.state ?? "observe",
    maxExposure: pctValue(decisionStates.capacity.maxExposure),
    reason,
    operatorInstruction: operatorInstructionFor(action, activeExposure?.state ?? "observe"),
    nextAudit: nextAuditForCommand(action, mainReason),
  };
}

function buildRestrictionAccountability(
  input: ExecutiveDashboardInput,
  canonicalReasons: CanonicalReason[],
): RestrictionAccountabilityBet[] {
  const audits = Array.isArray(input.discoveryIntelligence?.governance.restrictions)
    ? input.discoveryIntelligence?.governance.restrictions
    : [];
  const fallbackAvoided = firstFinite(
    input.wisdom?.counterfactuals?.avoidedLoss,
    input.counterfactual?.avoidedLossScore,
    input.discoveryIntelligence?.economics.avoidedLoss,
  );
  const fallbackMissed = firstFinite(
    input.wisdom?.counterfactuals?.missedUpside,
    input.counterfactual?.missedUpsideScore,
    input.discoveryIntelligence?.economics.missedUpside,
  );
  const falseBlockRate = firstFinite(
    input.discoveryAccountability?.falseDiscoveryRate,
    input.discoveryIntelligence?.maturity.falseDiscoveryRate,
  );
  const timeToRecovery = firstFinite(input.recovery?.audit?.timeToRecovery, input.survivalMemory?.recoveryBurden);

  return canonicalReasons.slice(0, 6).map((reason) => {
    const audit = audits.find((item) => {
      const haystack = normalized(`${item.id} ${item.type} ${item.label}`);
      return haystack.includes(normalized(reason.label)) || haystack.includes(reason.code.replace(/_/g, " "));
    });
    const avoidedLoss = firstFinite(audit?.avoidedLoss, fallbackAvoided);
    const missedUpside = firstFinite(audit?.missedUpside, fallbackMissed);
    const status = restrictionAccountabilityStatus(audit, avoidedLoss, missedUpside);

    return {
      code: reason.code,
      label: reason.label,
      status,
      avoidedLoss,
      missedUpside,
      falseBlockRate,
      timeToRecovery,
      interpretation: restrictionAccountabilityInterpretation(status, avoidedLoss, missedUpside),
      evidenceRequired: [
        "realized return",
        "max adverse excursion",
        "avoided loss",
        "missed upside",
        "restriction decision timestamp",
      ],
      nextAudit: `Audit whether ${reason.label.toLowerCase()} protected more capital than it cost.`,
    };
  });
}

function buildAccountabilityLoop(
  input: ExecutiveDashboardInput,
  restrictionBets: RestrictionAccountabilityBet[],
): AccountabilityLoopStep[] {
  const hasDecision = Boolean(input.executive || input.resolve);
  const hasRestrictionAudit = restrictionBets.some((bet) => bet.status === "helpful" || bet.status === "harmful");
  const hasOutcomeMemory = Boolean(input.wisdom?.counterfactuals?.actualOutcome || input.counterfactual?.scenarios?.length);
  const needsPolicyReview = Boolean(
    input.counterfactual?.shouldAdjustRestrictionPolicy ||
      input.counterfactual?.shouldAdjustDiscoveryPolicy ||
      input.counterfactual?.shouldAdjustSizingPolicy ||
      restrictionBets.some((bet) => bet.status === "harmful"),
  );
  const hasInstitutionalAsset = firstFinite(input.discoveryIntelligence?.institutionalization.institutionalCount) != null &&
    Number(input.discoveryIntelligence?.institutionalization.institutionalCount) > 0;

  return [
    {
      id: "decision-snapshot",
      label: "Decision snapshot",
      status: hasDecision ? "complete" : "pending",
      evidenceRequired: "final decision, participation mode, exposure state, and active vetoes",
      nextAction: hasDecision ? "Preserve the decision snapshot for outcome review." : "Record the decision before evaluation continues.",
    },
    {
      id: "restriction-bet",
      label: "Restriction bet",
      status: hasRestrictionAudit ? "complete" : restrictionBets.length ? "pending" : "blocked",
      evidenceRequired: "avoided loss, missed upside, false block rate, and time to recovery",
      nextAction: hasRestrictionAudit ? "Compare restriction value against caution cost." : "Attach measurable economics to each active restriction.",
    },
    {
      id: "outcome-capture",
      label: "Outcome capture",
      status: hasOutcomeMemory ? "complete" : "pending",
      evidenceRequired: "realized outcome, best alternative, worst alternative, and adverse excursion",
      nextAction: hasOutcomeMemory ? "Feed the result back into Wisdom and Discovery Intelligence." : "Capture the realized outcome when the review window closes.",
    },
    {
      id: "policy-adjustment",
      label: "Policy adjustment",
      status: needsPolicyReview ? "review" : hasRestrictionAudit ? "complete" : "pending",
      evidenceRequired: "restriction value versus caution cost and repeated conflict patterns",
      nextAction: needsPolicyReview ? "Review thresholds before the next comparable signal." : "Leave thresholds unchanged until restriction economics disagree.",
    },
    {
      id: "institutional-memory",
      label: "Institutional memory",
      status: hasInstitutionalAsset ? "complete" : "pending",
      evidenceRequired: "trusted discovery, policy, standard, or reusable governance rule",
      nextAction: hasInstitutionalAsset ? "Reuse the institutional rule in future comparable states." : "Promote repeatable discoveries into durable policy only after outcome proof.",
    },
  ];
}

function buildDiscoveryInstitutionalization(input: ExecutiveDashboardInput): DiscoveryInstitutionalizationPlan {
  const maturity = input.discoveryIntelligence?.maturity;
  const stageCounts = {
    emerging: Number(maturity?.emerging ?? 0),
    detected: Number(maturity?.detected ?? 0),
    observed: Number(maturity?.observed ?? 0),
    confirmed: Number(maturity?.confirmed ?? 0),
    repeatable: Number(maturity?.repeatable ?? 0),
    trusted: Number(maturity?.trusted ?? 0),
    institutional: Number(maturity?.institutional ?? 0),
  };
  const stages = Object.keys(stageCounts) as Array<keyof typeof stageCounts>;
  const detectedStage = [...stages].reverse().find((stage) => stageCounts[stage] > 0);
  const currentStage = detectedStage ?? (normalized(input.discovery?.status) || "emerging");
  const currentIndex = Math.max(0, stages.indexOf(currentStage as keyof typeof stageCounts));
  const nextStage = stages[Math.min(stages.length - 1, currentIndex + 1)];
  const allowedInfluence = institutionalInfluenceFor(currentStage, input.discoveryIntelligence?.score);
  const recommendationMessages = toStringArray(input.discoveryIntelligence?.recommendations?.map((item) => item.message));

  return {
    currentStage: readable(currentStage),
    nextStage: readable(nextStage),
    allowedInfluence,
    stageCounts,
    promotionRequirements: uniqueStrings([
      ...recommendationMessages,
      promotionRequirementFor(currentStage),
    ]).slice(0, 4),
  };
}

function buildGovernanceArbitration(
  input: ExecutiveDashboardInput,
  command: GovernanceDecisionCommand,
  vetoes: GovernanceVeto[],
  conflicts: GovernanceConflict[],
  canonicalReasons: CanonicalReason[],
): GovernanceArbitration {
  const hardVeto = vetoes.find((veto) => veto.severity === "hard");
  const reviewVeto = vetoes.find((veto) => veto.severity === "review");
  const limiter = canonicalReasons[0];
  const authority = hardVeto?.source ??
    (conflicts.length
      ? "Governance arbitration"
      : reviewVeto?.source ?? limiter?.affectedModules[0] ?? "Executive");

  return {
    authority,
    finalCommand: command.action,
    finalDecision: finalDecisionLabel(input),
    participationMode: readable(normalizedParticipationMode(input) || "pending"),
    reason: hardVeto?.effect ?? conflicts[0]?.resolution ?? limiter?.explanation ?? command.reason,
    vetoes,
    conflicts,
  };
}

function confidenceStatusFor(
  kind: ConfidenceLedgerKind,
  score: number | null,
  input: ExecutiveDashboardInput,
): ConfidenceLedgerStatus {
  if (score == null) return "pending";
  const survivalStatus = normalized(input.survivalMemory?.status);

  if (kind === "survival") {
    if (survivalStatus === "near ruin" || survivalStatus === "near_ruin") return "blocked";
    if (survivalStatus === "scarred") return "scarred";
  }

  if (kind === "discovery" && score < 60) return "immature";
  if (score >= 72) return "trusted";
  if (score >= 50) return "provisional";
  return "blocked";
}

function confidenceInterpretation(
  kind: ConfidenceLedgerKind,
  score: number | null,
  input: ExecutiveDashboardInput,
) {
  if (score == null) return "Evidence is pending.";
  if (kind === "raw") return "Model conviction before outcome correction; it cannot directly authorize sizing.";
  if (kind === "calibrated") return "Sizing should trust this value before raw confidence when the two disagree.";
  if (kind === "trust") return "Governance trust controls whether confidence may become permission.";
  if (kind === "discovery") {
    const maturity = firstFinite(input.discoveryIntelligence?.maturity.maturityScore, input.discovery?.maturity);
    if (maturity != null && maturity < 60) return "Discovery can guide attention and probes, but not normal sizing yet.";
    return "Discovery evidence is mature enough to influence participation rules.";
  }

  const status = normalized(input.survivalMemory?.status);
  if (["scarred", "near ruin", "near_ruin"].includes(status)) {
    return "The score is not enough by itself; survival status and clean reduced-size outcomes must confirm recovery.";
  }
  return "Survival memory does not currently veto normal participation.";
}

function exposureStateFor(
  input: ExecutiveDashboardInput,
  decisionStates: ExecutiveDashboardIA["decisionStates"],
): ExposureStateName {
  const mode = normalizedParticipationMode(input);
  const capacityMode = normalized(decisionStates.capacity.mode);
  const maxExposure = firstFinite(decisionStates.capacity.maxExposure);

  if (
    !decisionStates.permission.allowed ||
    decisionStates.permission.level === "blocked" ||
    ["blocked", "exits only", "exits_only", "none", "watch"].includes(mode) ||
    maxExposure === 0
  ) {
    return "observe";
  }

  if (["paper", "probe"].includes(mode) || (maxExposure != null && maxExposure <= 0.3)) return "probe";
  if (mode === "micro" || capacityMode === "micro" || (maxExposure != null && maxExposure <= 0.75)) return "micro";
  if (["limited", "small", "reduced", "reduced size", "reduced-size", "graduated"].includes(mode) || capacityMode === "reduced") {
    return "limited";
  }
  if (["normal", "aggressive", "full", "approved"].includes(mode) || capacityMode === "normal" || capacityMode === "expanded") return "normal";

  return maxExposure != null && maxExposure >= 2 ? "normal" : "limited";
}

function exposureCapFor(state: ExposureStateName, maxExposure: number | null) {
  const cap = maxExposure ?? 0;
  if (state === "observe") return 0;
  if (state === "probe") return roundExposure(Math.min(nonZeroCap(cap, 0.25), 0.25));
  if (state === "micro") return roundExposure(Math.min(nonZeroCap(cap, 0.5), 0.5));
  if (state === "limited") return roundExposure(Math.min(nonZeroCap(cap, 1), 1));
  return roundExposure(Math.max(cap, 2));
}

function nonZeroCap(value: number, fallback: number) {
  return value > 0 ? value : fallback;
}

function commandActionFor(
  finalDecision: string,
  decisionStates: ExecutiveDashboardIA["decisionStates"],
  hardVeto: GovernanceVeto | undefined,
  primaryConflict: GovernanceConflict | undefined,
): DecisionCommandAction {
  if (/invalidate/.test(finalDecision)) return "invalidate";
  if (/sell|deescalate|reduce/.test(finalDecision)) return "reduce";
  if (hardVeto) return hardVeto.source === "Data Reliability" ? "invalidate" : "wait";
  if (primaryConflict?.id === "executive-wisdom-conflict") return "review";
  if (/reject|avoid/.test(finalDecision)) return "invalidate";
  if (/wait|watch|hold|pending/.test(finalDecision)) return "wait";
  if (/act|buy|commit|escalate/.test(finalDecision) && decisionStates.permission.allowed && decisionStates.capacity.maxExposure > 0) {
    return "act";
  }
  return "review";
}

function commandToneFor(
  action: DecisionCommandAction,
  exposureState: ExposureStateName | undefined,
  vetoes: GovernanceVeto[],
): ExecutiveTone {
  if (action === "invalidate" || action === "reduce") return "bad";
  if (action === "wait" || action === "review") return "warn";
  if (vetoes.some((veto) => veto.severity !== "hard") || exposureState !== "normal") return "warn";
  return "good";
}

function commandLabelFor(action: DecisionCommandAction, exposureLabel: string) {
  if (action === "act") return `Act - ${exposureLabel}`;
  if (action === "wait") return "Wait";
  if (action === "reduce") return "Reduce";
  if (action === "invalidate") return "Invalidate";
  return "Review";
}

function operatorInstructionFor(action: DecisionCommandAction, exposureState: ExposureStateName) {
  if (action === "act") return `Participation is allowed only inside ${readable(exposureState)} exposure.`;
  if (action === "wait") return "Do not add exposure until the active veto clears.";
  if (action === "reduce") return "Reduce or exit exposure according to the active risk gate.";
  if (action === "invalidate") return "Treat the signal as invalid until new evidence rebuilds the case.";
  return "Resolve the named conflict before increasing exposure.";
}

function nextAuditForCommand(action: DecisionCommandAction, mainReason?: CanonicalReason) {
  if (action === "act") return "Record realized return, max adverse excursion, slippage, and whether the limiter helped.";
  if (action === "wait") return "Record whether waiting avoided loss or created missed upside.";
  if (action === "reduce") return "Record avoided drawdown and the recovery time after reduction.";
  if (action === "invalidate") return "Record the failed condition and prevent automatic restoration without new evidence.";
  return mainReason
    ? `Resolve the ${mainReason.label.toLowerCase()} evidence before the next decision.`
    : "Resolve the active governance conflict before the next decision.";
}

function restrictionAccountabilityStatus(
  audit: { helpful?: boolean } | undefined,
  avoidedLoss: number | null,
  missedUpside: number | null,
): RestrictionAccountabilityStatus {
  if (audit?.helpful === true) return "helpful";
  if (audit?.helpful === false) return "harmful";
  if (avoidedLoss == null || missedUpside == null) return "pending";
  if (avoidedLoss > missedUpside) return "helpful";
  if (missedUpside > avoidedLoss) return "harmful";
  return "needs_audit";
}

function restrictionAccountabilityInterpretation(
  status: RestrictionAccountabilityStatus,
  avoidedLoss: number | null,
  missedUpside: number | null,
) {
  if (status === "pending") return "Restriction economics are not yet measurable.";
  if (status === "needs_audit") return "Restriction value is flat; collect another comparable outcome.";
  if (status === "helpful") return `Avoided loss ${valueLabel(avoidedLoss)} exceeds missed upside ${valueLabel(missedUpside)}.`;
  return `Missed upside ${valueLabel(missedUpside)} exceeds avoided loss ${valueLabel(avoidedLoss)}.`;
}

function institutionalInfluenceFor(stage: string, score: unknown) {
  const normalizedStage = normalized(stage);
  const intelligenceScore = firstFinite(score);
  if (normalizedStage === "institutional" || normalizedStage === "trusted") return "May affect sizing rules and reusable policy.";
  if (normalizedStage === "repeatable" || normalizedStage === "confirmed" || (intelligenceScore != null && intelligenceScore >= 60)) {
    return "May shape watchlists, probes, and reduced-size participation.";
  }
  return "Attention only; discovery cannot authorize major sizing.";
}

function promotionRequirementFor(stage: string) {
  const normalizedStage = normalized(stage);
  if (normalizedStage === "institutional") return "Maintain policy performance through recurring audits.";
  if (normalizedStage === "trusted") return "Convert trusted discovery into a reusable policy or standard.";
  if (normalizedStage === "repeatable") return "Promote after repeated outcomes show stable value after costs.";
  if (normalizedStage === "confirmed") return "Observe recurrence across independent states before trusting sizing.";
  if (normalizedStage === "observed") return "Confirm with outcome memory and counterfactual review.";
  return "Collect enough detections and outcomes to confirm the pattern.";
}

function collectNarrativeText(input: ExecutiveDashboardInput) {
  return uniqueStrings([
    input.sizing?.limitedReason,
    input.sizing?.exposureExplanation,
    ...toStringArray(input.sizing?.sizingReasons),
    ...toStringArray(input.sizing?.sizingRationale),
    ...toStringArray(input.survivalMemory?.mainWarnings),
    ...toStringArray(input.survivalMemory?.reasons),
    ...toStringArray(input.survivalMemory?.missingEvidence),
    ...toStringArray(input.recovery?.reasons),
    ...toStringArray(input.recovery?.blockers),
    ...toStringArray(input.trustGovernor?.reasons),
    input.trustGovernor?.primaryBlocker,
    ...toStringArray(input.trustGovernor?.blockers).map((blocker: any) => blocker?.reason ?? blocker?.label ?? blocker),
    ...toStringArray(input.resolve?.missingEvidence),
    input.resolve?.explanation,
    ...toStringArray(input.agency?.reasons),
    ...toStringArray(input.agencyDiagnostics?.state?.selfDiagnosis?.reasons),
    input.wisdom?.explanation,
    input.wisdom?.counterfactuals?.explanation,
    input.wisdom?.agencyEffectiveness?.explanation,
    input.discoveryDensity?.explanation,
    input.discovery?.recommendedNextStep,
    input.discovery?.status,
    input.calibration?.explanation,
    ...toStringArray(input.calibration?.warnings),
    ...toStringArray(input.readiness?.failureFlags),
  ]);
}

function reasonCodesFromText(value: string): CanonicalReasonCode[] {
  const text = normalized(value);
  const codes: CanonicalReasonCode[] = [];
  if (/survival|scar|near ruin|near-ruin|fragile/.test(text)) codes.push("survival_scar");
  if (/trust.*below|below.*trust|trust governor|trust threshold|restoration threshold/.test(text)) codes.push("trust_below_threshold");
  if (/reduced size|reduced-size|micro|limited exposure|small size|normal sizing/.test(text)) codes.push("reduced_size");
  if (/recovery incomplete|recovering|recovery burden|restore|restoring/.test(text)) codes.push("recovery_incomplete");
  if (/agency|human review|policy/.test(text)) codes.push("agency_unresolved");
  if (/opportunity density|candidate density|density.*low|transitional/.test(text)) codes.push("opportunity_density_low");
  if (/discovery confidence|discovery.*mature|novelty|maturity/.test(text)) codes.push("discovery_immature");
  if (/calibration|calibrated|raw confidence|unstable outcomes/.test(text)) codes.push("calibration_review");
  if (/readiness|execution gate|capacity|blocked/.test(text)) codes.push("readiness_blocked");
  if (/overfit|robustness|too clean/.test(text)) codes.push("overfit_risk");
  if (/walk-forward|walk forward|segment|test period/.test(text)) codes.push("walk_forward_instability");
  if (/data reliability|quote|signal coverage|freshness|stale/.test(text)) codes.push("data_reliability_low");
  return codes;
}

function finalDecisionLabel(input: ExecutiveDashboardInput) {
  const resolveDecision = readable(input.resolve?.decision);
  if (resolveDecision) return resolveDecision;
  const trustMode = normalized(input.trustGovernor?.participationMode);
  if (trustMode === "blocked" || input.trustGovernor?.allowsNewExposure === false) return "Watch";
  const sizingDecision = readable(input.sizing?.sizingDecision ?? input.sizing?.decision);
  if (sizingDecision) return sizingDecision;
  return "Pending";
}

function normalizedParticipationMode(input: ExecutiveDashboardInput) {
  return normalized(
    input.trustGovernor?.participationMode ??
      input.sizing?.sizingMode ??
      input.sizing?.mode ??
      input.resolve?.commitmentLevel ??
      "pending",
  );
}

function opportunityPhraseFor(input: ExecutiveDashboardInput) {
  if (input.recognition?.verdict === "recognized" && firstFinite(input.recognition?.matchedPositiveOutcomes) != null) {
    return "The system sees a historically recurring positive state";
  }
  if (input.belief?.verdict === "justified" || input.judgement?.status === "trusted") {
    return "The system sees a supported opportunity";
  }
  if (input.discovery) return "The system sees an emerging opportunity";
  return "The system is still assembling the opportunity picture";
}

function reliabilityPhraseFor(input: ExecutiveDashboardInput) {
  const reliability = firstFinite(
    input.judgement?.reliability,
    input.calibration?.trustworthiness,
    input.readiness?.readinessScore,
    input.strategyReadiness?.readinessScore,
  );
  if (reliability == null) return "pending";
  if (reliability >= 75) return "strong";
  if (reliability >= 55) return "moderate";
  return "weak";
}

function riskPhraseFor(input: ExecutiveDashboardInput) {
  const risk = firstFinite(input.riskPct, input.strategyHistory?.riskPct);
  if (risk == null) return "unconfirmed risk";
  if (risk <= 35) return "controlled risk";
  if (risk <= 65) return "transitional risk";
  return "elevated risk";
}

function dataReliabilityScore(input: ExecutiveDashboardInput) {
  return firstFinite(
    input.strategyHistory?.dataReliability,
    input.readiness?.components?.dataReliability?.score,
    input.strategyReadiness?.components?.dataReliability?.score,
    input.agency?.dataReliabilityPct != null ? input.agency.dataReliabilityPct * 100 : null,
    input.agencyDiagnostics?.state?.selfDiagnosis?.dataReliability != null
      ? input.agencyDiagnostics.state.selfDiagnosis.dataReliability * 100
      : null,
  );
}

function walkForwardStability(input: ExecutiveDashboardInput) {
  const explicit = firstFinite(
    input.strategyHistory?.walkForwardStability,
    input.readiness?.walkForwardStability,
    input.readiness?.components?.walkForwardRobustness?.score,
    input.strategyReadiness?.components?.walkForwardRobustness?.score,
  );
  if (explicit != null) return explicit;

  const walkForward = input.strategyHistory?.walkForward ?? input.readiness?.walkForward ?? input.strategyReadiness?.walkForward;
  const positive = firstFinite(walkForward?.positiveSegmentCount, walkForward?.positiveSegments);
  const total = firstFinite(walkForward?.segmentCount, walkForward?.segments);
  if (positive != null && total != null && total > 0) return (positive / total) * 100;
  return null;
}

function agencyTrustScore(input: ExecutiveDashboardInput) {
  return firstFinite(
    input.agency?.trustPct,
    input.agency?.trust,
    input.agencyDiagnostics?.summary?.averageTrust != null ? input.agencyDiagnostics.summary.averageTrust * 100 : null,
    input.agencyDiagnostics?.state?.selfDiagnosis?.trust != null ? input.agencyDiagnostics.state.selfDiagnosis.trust * 100 : null,
  );
}

function firstBlocker(trustGovernor: any) {
  return Array.isArray(trustGovernor?.blockers) ? trustGovernor.blockers[0] : null;
}

function firstUnlockMatching(input: ExecutiveDashboardInput, pattern: RegExp) {
  return allUnlocks(input).find((item) => pattern.test(item));
}

function firstInvalidationMatching(input: ExecutiveDashboardInput, pattern: RegExp) {
  return allInvalidations(input).find((item) => pattern.test(item));
}

function allUnlocks(input: ExecutiveDashboardInput) {
  return uniqueStrings([
    ...toStringArray(input.discovery?.unlockConditions),
    ...toStringArray(input.recognition?.missingEvidence),
    ...toStringArray(input.recovery?.unlockConditions),
    ...toStringArray(input.survivalMemory?.unlockConditions),
    ...toStringArray(input.trustGovernor?.unlockCriteria),
    ...toStringArray(firstBlocker(input.trustGovernor)?.unlockCriteria),
    ...toStringArray(input.resolve?.unlockConditions),
    ...toStringArray(input.readiness?.unlockConditions),
  ]);
}

function allInvalidations(input: ExecutiveDashboardInput) {
  return uniqueStrings([
    ...toStringArray(input.discovery?.invalidationConditions),
    ...toStringArray(input.recognition?.invalidationConditions),
    ...toStringArray(input.recovery?.invalidationConditions),
    ...toStringArray(input.survivalMemory?.invalidationConditions),
    ...toStringArray(input.resolve?.invalidationConditions),
    ...toStringArray(input.trustGovernor?.contradictions),
  ]);
}

function outcomeFromScoreStatus(score: number | null, status: unknown): ExecutivePipelineOutcome {
  const text = normalized(status);
  if (/block|reject|invalid/.test(text)) return "blocked";
  if (/review|escalat/.test(text)) return "escalated";
  if (score != null && score >= 70) return "passed";
  return "limited";
}

function recognitionOutcome(recognition: any): ExecutivePipelineOutcome {
  const verdict = normalized(recognition?.verdict);
  if (verdict === "recognized") return "passed";
  if (verdict === "conflicted") return "blocked";
  if (verdict === "insufficient evidence" || verdict === "insufficient_evidence") return "escalated";
  return "limited";
}

function beliefOutcome(belief: any): ExecutivePipelineOutcome {
  const verdict = normalized(belief?.verdict);
  if (verdict === "justified") return "passed";
  if (verdict === "contradicted") return "blocked";
  return "limited";
}

function judgementOutcome(judgement: any): ExecutivePipelineOutcome {
  const status = normalized(judgement?.status);
  if (status === "trusted") return "passed";
  if (status === "blocked") return "blocked";
  if (status === "review required" || status === "review_required") return "escalated";
  return "limited";
}

function agencyOutcome(input: ExecutiveDashboardInput): ExecutivePipelineOutcome {
  const recommendation = normalized(input.agency?.recommendation ?? input.agencyDiagnostics?.summary?.recommendation);
  if (recommendation === "act") return "passed";
  if (/human review|requires_human_review|review/.test(recommendation)) return "escalated";
  if (/deny|block|reject|invalidate/.test(recommendation)) return "blocked";
  return "limited";
}

function resolveOutcome(resolve: any): ExecutivePipelineOutcome {
  const decision = normalized(resolve?.decision);
  if (decision === "commit") return "passed";
  if (decision === "reject" || decision === "invalidate") return "blocked";
  if (decision === "escalate") return "escalated";
  return "limited";
}

function evidence(id: string, label: string, value: string, detail: string, tone: ExecutiveTone, priority: number): EvidenceSummaryItem {
  return { id, label, value, detail, tone, priority };
}

function group(concept: TerminologyGroup["concept"], description: string, metrics: TerminologyGroup["metrics"]): TerminologyGroup {
  return { concept, description, metrics };
}

function metric(label: string, value: string, source: string) {
  return { label, value, source };
}

function roundExposure(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, value) * 100) / 100;
}

function pctValue(value: unknown, digits = 0) {
  const n = firstFinite(value);
  return n == null ? "Pending" : `${n.toFixed(digits)}%`;
}

function valueLabel(value: unknown) {
  const n = firstFinite(value);
  if (n == null) return "pending";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function countValue(value: unknown) {
  const n = firstFinite(value);
  return n == null ? "Pending" : String(Math.round(n));
}

function decimalValue(value: unknown) {
  const n = firstFinite(value);
  if (n == null) return "Pending";
  if (!Number.isFinite(n)) return "Infinity";
  return n.toFixed(2);
}

function scoreTone(value: unknown): ExecutiveTone {
  const n = firstFinite(value);
  if (n == null) return "neutral";
  if (n >= 70) return "good";
  if (n >= 45) return "warn";
  return "bad";
}

function inverseScoreTone(value: unknown, limit: number): ExecutiveTone {
  const n = firstFinite(value);
  if (n == null) return "neutral";
  if (n <= limit) return "good";
  if (n <= limit * 1.6) return "warn";
  return "bad";
}

function countTone(value: unknown, target: number): ExecutiveTone {
  const n = firstFinite(value);
  if (n == null) return "neutral";
  if (n >= target) return "good";
  if (n >= Math.max(1, target / 3)) return "warn";
  return "bad";
}

function inverseCountTone(negative: unknown, positive: unknown): ExecutiveTone {
  const bad = firstFinite(negative);
  const good = firstFinite(positive);
  if (bad == null) return "neutral";
  if (good != null && good > 0 && bad / good <= 0.25) return "good";
  if (good != null && good > 0 && bad / good <= 0.6) return "warn";
  return bad <= 2 ? "warn" : "bad";
}

function sharpeTone(value: unknown): ExecutiveTone {
  const n = firstFinite(value);
  if (n == null) return "neutral";
  if (n >= 1) return "good";
  if (n >= 0.4) return "warn";
  return "bad";
}

function profitFactorTone(value: unknown): ExecutiveTone {
  const n = firstFinite(value);
  if (n == null) return "neutral";
  if (n >= 1.3) return "good";
  if (n >= 1) return "warn";
  return "bad";
}

function readable(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalized(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (item == null) return [];
      if (typeof item === "string") return item;
      if (typeof item === "number" || typeof item === "boolean") return String(item);
      if (typeof item === "object") {
        const record = item as Record<string, unknown>;
        return String(record.reason ?? record.label ?? record.title ?? record.id ?? "");
      }
      return String(item);
    }).filter(Boolean);
  }
  if (value == null) return [];
  if (typeof value === "string") return value ? [value] : [];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [String(record.reason ?? record.label ?? record.title ?? record.id ?? "")].filter(Boolean);
  }
  return [];
}

function firstString(value: unknown) {
  return toStringArray(value)[0];
}

function firstMeaningful(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    if (value == null || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.flatMap((item) => toStringArray(item))) {
    const text = value.trim();
    const key = normalized(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}
