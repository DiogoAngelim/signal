import type { AgencyResult } from "../agency/engine";
import type { CalibrationResult } from "../calibration/engine";
import type { JudgementResult } from "../judgement/engine";
import { clamp, mean } from "../math/statistics";
import type { ReflectionResult } from "../reflection/engine";
import type { ReliabilityResult } from "../reliability/engine";
import type {
  SurvivalMemoryAnalysis,
  SurvivalMemoryRecommendation,
  SurvivalMemoryStatus,
} from "../survival-memory/engine";

export type TrustParticipationMode =
  | "blocked"
  | "exits_only"
  | "paper"
  | "micro"
  | "limited"
  | "normal";

export type TrustGovernorAction =
  | "observe"
  | "paper_trade"
  | "risk_reducing_exits"
  | "new_exposure"
  | "increase_position";

export type TrustBlockerSeverity = "low" | "medium" | "high" | "critical";

export type TrustBlocker = {
  id: string;
  label: string;
  severity: TrustBlockerSeverity;
  reason: string;
  unlockCriteria: string[];
};

export type TrustGovernorPolicy = {
  paperTrustThreshold?: number;
  microTrustThreshold?: number;
  limitedTrustThreshold?: number;
  normalTrustThreshold?: number;
  maxRawCalibratedGap?: number;
  microMaxExposurePct?: number;
  limitedExposureMultiplier?: number;
};

export type TrustSurvivalMemoryInput = Partial<
  Omit<SurvivalMemoryAnalysis, "status" | "recommendation">
> & {
  status?: SurvivalMemoryStatus | string;
  recommendation?: SurvivalMemoryRecommendation | string;
  maxExposurePct?: number;
};

export type TrustGovernorInput = {
  rawConfidence?: number;
  calibratedConfidence?: number;
  requestedExposure?: number;
  maxExposure?: number;
  opensNewExposure?: boolean;
  calibration?: Partial<CalibrationResult> & {
    status?: string;
    explanation?: string;
  };
  judgement?: Partial<JudgementResult> | null;
  reflection?:
    | Partial<ReflectionResult>
    | { reflectionScore?: number; recommendedConfidenceCap?: number }
    | null;
  reliability?: Partial<ReliabilityResult> | null;
  agency?:
    | Partial<AgencyResult>
    | {
        status?: string;
        trust?: number;
        averageTrust?: number;
        blockedActions?: number;
        allowedActions?: number;
      }
    | null;
  belief?: {
    verdict?: string;
    confidence?: number;
    trustworthiness?: number;
    fragility?: number;
    blockers?: string[];
    warnings?: string[];
  } | null;
  strategy?: {
    blocked?: boolean;
    productionEligible?: boolean;
    stage?: string;
    readinessScore?: number;
    maxConfidence?: number;
    maxPositionPct?: number;
    failureFlags?: string[];
  } | null;
  survivalMemory?: TrustSurvivalMemoryInput | null;
  policy?: TrustGovernorPolicy;
};

export type TrustGovernorResult = {
  module: "signal.trust-governor";
  name: "Signal Trust Governor";
  trustScore: number;
  confidenceCap: number;
  participationMode: TrustParticipationMode;
  maxExposure: number;
  allowsNewExposure: boolean;
  requiresReview: boolean;
  allowedActions: TrustGovernorAction[];
  blockedActions: TrustGovernorAction[];
  primaryBlocker?: string;
  blockers: TrustBlocker[];
  unlockCriteria: string[];
  contradictions: string[];
  reasons: string[];
  audit: {
    componentScores: Record<string, number>;
    weights: Record<string, number>;
    rawMaxExposure: number;
    requestedExposure: number;
    survivalRecovery?: {
      status?: string;
      recommendation?: string;
      exposureMultiplier?: number;
      survivalConfidence?: number;
      confidencePenalty?: number;
      maxExposurePct?: number;
      trustedMaxExposure: number;
    };
    formulas: string[];
  };
};

const DEFAULT_POLICY = {
  paperTrustThreshold: 50,
  microTrustThreshold: 62,
  limitedTrustThreshold: 78,
  normalTrustThreshold: 86,
  maxRawCalibratedGap: 15,
  microMaxExposurePct: 1,
  limitedExposureMultiplier: 0.45,
};

const WEIGHTS = {
  calibration: 0.24,
  judgement: 0.18,
  reliability: 0.16,
  reflection: 0.1,
  strategy: 0.11,
  agency: 0.09,
  survival: 0.12,
};

const CALIBRATION_REVIEW_STATUSES = new Set([
  "insufficient-history",
  "insufficient history",
  "poor-calibration",
  "poor calibration",
  "unstable-outcomes",
  "unstable outcomes",
  "overconfident",
]);

const BLOCKING_BELIEF_VERDICTS = new Set(["uncertain", "contradicted"]);

export function evaluateTrustGovernor(
  input: TrustGovernorInput,
): TrustGovernorResult {
  const policy = { ...DEFAULT_POLICY, ...(input.policy ?? {}) };
  const rawConfidence = score(
    input.rawConfidence,
    score(input.strategy?.maxConfidence, 50),
  );
  const calibratedConfidence = score(
    input.calibratedConfidence ?? input.calibration?.calibratedConfidence,
    rawConfidence,
  );
  const configuredMaxExposure = percent(
    input.maxExposure ?? input.strategy?.maxPositionPct,
    0,
  );
  const rawMaxExposure = survivalAdjustedMaxExposure(
    input.survivalMemory,
    configuredMaxExposure,
  );
  const requestedExposure = percent(input.requestedExposure, rawMaxExposure);
  const calibrationStatus = normalizedStatus(input.calibration?.status);
  const calibrationWarnings = normalizedWarnings(input.calibration?.warnings);
  const blockers = collectBlockers({
    input,
    rawConfidence,
    calibratedConfidence,
    rawMaxExposure,
    calibrationStatus,
    calibrationWarnings,
    policy,
  });
  const componentScores = {
    calibration: calibrationScore(
      input,
      calibratedConfidence,
      calibrationStatus,
      calibrationWarnings,
    ),
    judgement: judgementScore(input.judgement),
    reliability: reliabilityScore(input.reliability),
    reflection: reflectionScore(input.reflection),
    strategy: strategyScore(input.strategy),
    agency: agencyScore(input.agency),
    survival: survivalScore(input.survivalMemory),
  };
  const baseTrust = weightedScore(componentScores, WEIGHTS);
  const confidenceCap = confidenceCapFor({
    input,
    rawConfidence,
    calibratedConfidence,
  });
  const trustScore = roundScore(Math.min(baseTrust, confidenceCap));
  const contradictions = contradictionsFor({
    input,
    calibrationStatus,
    calibrationWarnings,
    blockers,
  });
  const participationMode = participationModeFor({
    trustScore,
    confidenceCap,
    rawMaxExposure,
    blockers,
    policy,
  });
  const maxExposure = exposureFor({
    mode: participationMode,
    rawMaxExposure,
    requestedExposure,
    policy,
  });
  const allowsNewExposure =
    participationMode === "micro" ||
    participationMode === "limited" ||
    participationMode === "normal";
  const requiresReview =
    blockers.length > 0 ||
    participationMode === "paper" ||
    participationMode === "exits_only";
  const allowedActions = allowedActionsFor(participationMode);
  const blockedActions = blockedActionsFor(participationMode);
  const primaryBlocker = blockers[0]?.id;
  const unlockCriteria = unique(
    blockers.flatMap((blocker) => blocker.unlockCriteria),
  );

  return {
    module: "signal.trust-governor",
    name: "Signal Trust Governor",
    trustScore,
    confidenceCap,
    participationMode,
    maxExposure,
    allowsNewExposure,
    requiresReview,
    allowedActions,
    blockedActions,
    ...(primaryBlocker ? { primaryBlocker } : {}),
    blockers,
    unlockCriteria,
    contradictions,
    reasons: reasonsFor({
      participationMode,
      trustScore,
      confidenceCap,
      maxExposure,
      blockers,
      contradictions,
    }),
    audit: {
      componentScores,
      weights: WEIGHTS,
      rawMaxExposure,
      requestedExposure,
      formulas: [
        "trustScore = weighted mean of calibration, judgement, reliability, reflection, strategy, and agency scores, capped by trusted confidence",
        "confidenceCap = min(raw confidence, calibrated confidence, reliability cap, reflection cap, and judgement adjusted confidence when present)",
        "survival memory can cap confidence and trusted exposure before participation mode is selected",
        "participationMode = blocked/exits_only/paper/micro/limited/normal based on hard blockers, confidence cap, trust score, survival recovery, and exposure capacity",
      ],
      ...survivalAuditFor(input.survivalMemory, rawMaxExposure),
    },
  };
}

export const governTrust = evaluateTrustGovernor;
export const evaluateSignalTrust = evaluateTrustGovernor;

function collectBlockers(input: {
  input: TrustGovernorInput;
  rawConfidence: number;
  calibratedConfidence: number;
  rawMaxExposure: number;
  calibrationStatus: string;
  calibrationWarnings: string[];
  policy: Required<typeof DEFAULT_POLICY>;
}) {
  const blockers: TrustBlocker[] = [];
  const warnings = input.calibrationWarnings;
  const status = input.calibrationStatus;
  const reliabilityStatus = normalizedStatus(input.input.reliability?.status);
  const reliabilityScoreValue = score(input.input.reliability?.score, 100);
  const reliabilityCap = score(input.input.reliability?.confidenceCap, 100);
  const flags = Array.isArray(input.input.strategy?.failureFlags)
    ? input.input.strategy.failureFlags.filter(Boolean)
    : [];
  const strategyFlagBlockers = blockersForStrategyFlags(flags);
  const survivalMemoryBlockers = survivalBlockers(
    input.input.survivalMemory,
    input.input.opensNewExposure !== false,
  );
  const gap = input.rawConfidence - input.calibratedConfidence;
  const beliefVerdict = normalizedStatus(input.input.belief?.verdict);
  const agencyStatus = normalizedStatus(input.input.agency?.status);

  if (
    reliabilityStatus === "invalid" ||
    reliabilityStatus === "stale" ||
    reliabilityScoreValue < 35 ||
    reliabilityCap < 35
  ) {
    blockers.push(
      blocker(
        "data_reliability_unusable",
        "Data reliability unusable",
        "critical",
        "Market data reliability is too weak to trust new exposure.",
        [
          "Restore fresh, complete, non-stale market data.",
          "Raise reliability confidence cap above 35%.",
        ],
      ),
    );
  }

  blockers.push(...strategyFlagBlockers);
  blockers.push(...survivalMemoryBlockers);

  if (
    (input.input.strategy?.blocked === true || flags.length > 0) &&
    strategyFlagBlockers.length === 0
  ) {
    blockers.push(
      blocker(
        "strategy_readiness_blocked",
        "Strategy readiness blocked",
        "high",
        "Strategy readiness gates do not allow new exposure.",
        [
          "Clear readiness failure flags.",
          "Keep benchmark, drawdown, robustness, and walk-forward checks passing.",
        ],
      ),
    );
  }

  const zeroCapacityExplainedByReadiness =
    input.input.strategy?.blocked === true ||
    flags.length > 0 ||
    strategyFlagBlockers.length > 0 ||
    survivalMemoryBlockers.length > 0;
  if (
    input.rawMaxExposure <= 0 &&
    input.input.opensNewExposure !== false &&
    !zeroCapacityExplainedByReadiness
  ) {
    blockers.push(
      blocker(
        "capacity_unavailable",
        "Capacity unavailable",
        "high",
        "No trusted exposure capacity is currently available.",
        ["Restore a positive trusted max exposure cap."],
      ),
    );
  }

  if (status && CALIBRATION_REVIEW_STATUSES.has(status)) {
    blockers.push(calibrationBlockerForStatus(status));
  } else if (warnings.includes("unstable outcomes")) {
    blockers.push(calibrationBlockerForStatus("unstable-outcomes"));
  } else if (
    warnings.includes("poor calibration") ||
    warnings.includes("overconfidence")
  ) {
    blockers.push(calibrationBlockerForStatus("poor-calibration"));
  }

  if (gap >= input.policy.maxRawCalibratedGap) {
    blockers.push(
      blocker(
        "raw_calibrated_confidence_gap",
        "Raw/calibrated gap",
        gap >= 25 ? "high" : "medium",
        "Raw confidence is materially higher than calibrated confidence.",
        [
          "Reduce the raw-vs-calibrated confidence gap below the policy threshold.",
          "Close more outcomes that match predicted confidence.",
        ],
      ),
    );
  }

  if (input.input.judgement?.status === "blocked") {
    blockers.push(
      blocker(
        "judgement_blocked",
        "Judgement blocked",
        "high",
        "Similar historical states do not justify new exposure.",
        [
          "Improve similar-state outcome stability.",
          "Reduce overfit risk in similar historical samples.",
        ],
      ),
    );
  } else if (input.input.judgement?.status === "review_required") {
    blockers.push(
      blocker(
        "judgement_review_required",
        "Judgement requires review",
        "high",
        "Similar historical states require human review before new exposure.",
        [
          "Raise judgement reliability and outcome stability above review thresholds.",
        ],
      ),
    );
  }

  if (BLOCKING_BELIEF_VERDICTS.has(beliefVerdict)) {
    blockers.push(
      blocker(
        `belief_${beliefVerdict}`,
        "Belief unresolved",
        "high",
        `Belief is ${beliefVerdict}, so new exposure is not justified.`,
        [
          "Resolve contradictory evidence.",
          "Raise belief confidence above the justified threshold.",
        ],
      ),
    );
  } else if (beliefVerdict === "weak") {
    blockers.push(
      blocker(
        "belief_weak",
        "Belief weak",
        "medium",
        "Belief is weak and should be reviewed before increasing participation.",
        [
          "Raise evidence strength, coverage, and agreement enough to justify the claim.",
        ],
      ),
    );
  }

  if (
    [
      "denied",
      "deferred",
      "requires-review",
      "requires_human_review",
      "escalated",
    ].includes(agencyStatus)
  ) {
    blockers.push(
      blocker(
        "agency_review_gate",
        "Agency review gate",
        agencyStatus === "denied" ? "high" : "medium",
        "Agency policy does not fully approve commitment.",
        [
          "Clear agency policy violations.",
          "Resolve human review requirements.",
        ],
      ),
    );
  }

  return uniqueBlockers(blockers);
}

function blockersForStrategyFlags(flags: string[]) {
  const blockers: TrustBlocker[] = [];
  const normalizedFlags = new Set(
    flags.map((flag) =>
      String(flag ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_"),
    ),
  );

  if (normalizedFlags.has("ROBUSTNESS_EXECUTION_BLOCKED")) {
    blockers.push(
      blocker(
        "robustness_execution_blocked",
        "Robustness execution blocked",
        "high",
        "The robustness safety gate blocks new execution.",
        [
          "Clear the robustness safety gate.",
          "Keep overfit risk at or below 30%.",
          "Keep deployment readiness above 60%.",
        ],
      ),
    );
  } else if (normalizedFlags.has("ROBUSTNESS_OVERFIT_RISK")) {
    blockers.push(
      blocker(
        "robustness_overfit_risk",
        "Robustness overfit risk",
        "high",
        "Robustness overfit risk is above the execution threshold.",
        [
          "Reduce overfit risk to 30% or lower.",
          "Keep deployment readiness above 60%.",
          "Retest on independent periods before allowing exposure.",
        ],
      ),
    );
  }

  if (normalizedFlags.has("PARAMETER_INSTABILITY")) {
    blockers.push(
      blocker(
        "parameter_instability",
        "Parameter instability",
        "high",
        "Nearby strategy variants do not preserve the edge.",
        [
          "Improve parameter pass rate.",
          "Verify nearby variants still beat the benchmark safety margin.",
        ],
      ),
    );
  }

  if (
    normalizedFlags.has("OUTLIER_DEPENDENCY") ||
    normalizedFlags.has("OVERFIT_TOP_WINNER_DEPENDENCY") ||
    normalizedFlags.has("OVERFIT_SEGMENT_CONCENTRATION") ||
    normalizedFlags.has("MEDIAN_TRADE_RETURN_NOT_POSITIVE")
  ) {
    const hasTopWinnerDependency = normalizedFlags.has(
      "OVERFIT_TOP_WINNER_DEPENDENCY",
    );
    const hasSegmentConcentration = normalizedFlags.has(
      "OVERFIT_SEGMENT_CONCENTRATION",
    );
    const hasMedianFailure = normalizedFlags.has(
      "MEDIAN_TRADE_RETURN_NOT_POSITIVE",
    );
    const unlockCriteria = [
      ...(hasTopWinnerDependency ? ["Reduce top-winner concentration."] : []),
      ...(hasSegmentConcentration
        ? ["Reduce period concentration across independent test windows."]
        : []),
      ...(hasMedianFailure
        ? ["Confirm median trade return stays positive."]
        : []),
    ];
    const reason =
      hasTopWinnerDependency && hasSegmentConcentration
        ? "Results depend too much on a few winners or periods."
        : hasTopWinnerDependency
          ? "Results depend too much on a few winning trades."
          : hasSegmentConcentration
            ? "Results depend too much on one validation period."
            : hasMedianFailure
              ? "Median trade return is not positive enough to trust new exposure."
              : "Return concentration is too high to trust new exposure.";

    blockers.push(
      blocker(
        "concentration_dependency",
        "Concentration dependency",
        "high",
        reason,
        unlockCriteria.length
          ? unlockCriteria
          : ["Reduce return concentration."],
      ),
    );
  }

  if (normalizedFlags.has("SURVIVAL_NEAR_RUIN")) {
    blockers.push(
      blocker(
        "survival_near_ruin",
        "Survival near-ruin",
        "high",
        "Survival memory identifies near-ruin patterns; new exposure must wait for recovery evidence.",
        [
          "Wait until similar states show survival cost below 35/100 and no near-ruin match.",
          "Restore a positive recovery exposure cap.",
        ],
      ),
    );
  }

  return blockers;
}

function calibrationBlockerForStatus(status: string) {
  if (status === "unstable-outcomes" || status === "unstable outcomes") {
    return blocker(
      "calibration_unstable_outcomes",
      "Calibration unstable outcomes",
      "high",
      "Calibration has samples, but similar outcomes are unstable.",
      [
        "Observe more closed outcomes in similar states.",
        "Keep outcome stability above the review threshold.",
        "Reduce overconfidence warnings.",
      ],
    );
  }

  if (status === "insufficient-history" || status === "insufficient history") {
    return blocker(
      "calibration_insufficient_history",
      "Calibration insufficient history",
      "high",
      "Calibration history is insufficient for trusted new exposure.",
      [
        "Collect the minimum number of evaluated outcomes.",
        "Keep new exposure in paper or review mode until history is usable.",
      ],
    );
  }

  return blocker(
    "calibration_poor",
    "Calibration poor",
    "high",
    "Historical calibration does not support trusting the raw signal yet.",
    [
      "Improve calibration quality.",
      "Reduce overconfidence warnings.",
      "Close outcomes that match predicted confidence.",
    ],
  );
}

function calibrationScore(
  input: TrustGovernorInput,
  calibratedConfidence: number,
  status: string,
  warnings: string[],
) {
  const trustworthiness = score(
    input.calibration?.trustworthiness,
    calibratedConfidence,
  );
  const historicalAccuracy = score(
    input.calibration?.historicalAccuracy,
    trustworthiness,
  );
  const calibrationError = Math.abs(
    Number(input.calibration?.calibrationError ?? 0),
  );
  const quality = clamp(100 - calibrationError);
  let result = mean([
    calibratedConfidence,
    trustworthiness,
    historicalAccuracy,
    quality,
  ]);

  if (status === "unstable-outcomes" || warnings.includes("unstable outcomes"))
    result -= 18;
  if (status === "poor-calibration" || warnings.includes("poor calibration"))
    result -= 14;
  if (
    status === "insufficient-history" ||
    warnings.includes("insufficient history")
  )
    result -= 12;
  if (warnings.includes("overconfidence")) result -= 8;
  if (warnings.includes("low trustworthiness")) result -= 10;

  return roundScore(result);
}

function judgementScore(judgement: TrustGovernorInput["judgement"]) {
  if (!judgement) return 60;
  const trust = score(judgement.trust, score(judgement.adjustedConfidence, 50));
  const reliability = score(judgement.reliability, trust);
  const stability = score(judgement.outcomeStability, trust);
  const calibration = score(judgement.calibration, trust);
  const overfitSafety = clamp(100 - score(judgement.overfitRisk, 50));
  let result = mean([
    trust,
    reliability,
    stability,
    calibration,
    overfitSafety,
  ]);

  if (judgement.status === "blocked") result = Math.min(result, 20);
  if (judgement.status === "review_required") result = Math.min(result, 45);
  if (judgement.status === "cautious") result = Math.min(result, 70);

  return roundScore(result);
}

function reliabilityScore(reliability: TrustGovernorInput["reliability"]) {
  if (!reliability) return 75;
  const status = normalizedStatus(reliability.status);
  let result = mean([
    score(reliability.score, 75),
    score(reliability.confidenceCap, 75),
  ]);

  if (status === "invalid") result = Math.min(result, 10);
  if (status === "stale") result = Math.min(result, 25);
  if (status === "insufficient") result = Math.min(result, 45);
  if (status === "degraded") result = Math.min(result, 65);

  return roundScore(result);
}

function reflectionScore(reflection: TrustGovernorInput["reflection"]) {
  if (!reflection) return 65;
  return score(reflection.reflectionScore, 65);
}

function strategyScore(strategy: TrustGovernorInput["strategy"]) {
  if (!strategy) return 65;
  let result = mean([
    score(strategy.readinessScore, score(strategy.maxConfidence, 60)),
    score(strategy.maxConfidence, score(strategy.readinessScore, 60)),
  ]);

  if (strategy.blocked === true) result = Math.min(result, 30);
  if (strategy.productionEligible === false) result = Math.min(result, 72);

  return roundScore(result);
}

function agencyScore(agency: TrustGovernorInput["agency"]) {
  if (!agency) return 65;
  const status = normalizedStatus(agency.status);
  const trust = score(
    (agency as { trust?: number }).trust ??
      (agency as { averageTrust?: number }).averageTrust ??
      (agency as Partial<AgencyResult>).commitmentConfidence ??
      (agency as Partial<AgencyResult>).agencyScore,
    65,
  );
  let result = trust;

  if (status === "denied") result = Math.min(result, 20);
  if (status === "deferred") result = Math.min(result, 45);
  if (
    status === "requires-review" ||
    status === "requires_human_review" ||
    status === "escalated"
  ) {
    result = Math.min(result, 55);
  }
  if (status === "limited") result = Math.min(result, 72);

  return roundScore(result);
}

function survivalScore(survivalMemory: TrustGovernorInput["survivalMemory"]) {
  if (!survivalMemory) return 75;

  const status = normalizedStatus(survivalMemory.status);
  const recommendation = normalizedStatus(survivalMemory.recommendation);
  const confidence = score(
    survivalMemory.survivalConfidence,
    status === "empty" ? 75 : 70,
  );
  const multiplierScore =
    ratioScore(survivalMemory.exposureMultiplier, 1) * 100;
  const costSafety = clamp(100 - score(survivalMemory.averageSurvivalCost, 0));
  const penaltySafety = clamp(100 - score(survivalMemory.confidencePenalty, 0));
  let result = mean([confidence, multiplierScore, costSafety, penaltySafety]);

  if (recommendation === "wait" || status === "near-ruin")
    result = Math.min(result, 35);
  if (recommendation === "act-with-reduced-size") result = Math.min(result, 65);
  if (status === "scarred") result = Math.min(result, 60);
  if (status === "watch") result = Math.min(result, 75);

  return roundScore(result);
}

function confidenceCapFor(input: {
  input: TrustGovernorInput;
  rawConfidence: number;
  calibratedConfidence: number;
}) {
  const caps = [
    input.rawConfidence,
    input.calibratedConfidence,
    score(input.input.reliability?.confidenceCap, 100),
    score(
      (
        input.input.reflection as
          | { recommendedConfidenceCap?: number }
          | null
          | undefined
      )?.recommendedConfidenceCap,
      100,
    ),
  ];

  if (input.input.judgement?.adjustedConfidence != null) {
    caps.push(score(input.input.judgement.adjustedConfidence, 100));
  }

  if (input.input.strategy?.maxConfidence != null) {
    caps.push(score(input.input.strategy.maxConfidence, 100));
  }

  if (input.input.belief?.confidence != null) {
    caps.push(score(input.input.belief.confidence, 100));
  }

  if (input.input.belief?.trustworthiness != null) {
    caps.push(score(input.input.belief.trustworthiness, 100));
  }

  if (input.input.survivalMemory?.survivalConfidence != null) {
    caps.push(score(input.input.survivalMemory.survivalConfidence, 100));
  }

  if (input.input.survivalMemory?.confidencePenalty != null) {
    caps.push(
      clamp(100 - score(input.input.survivalMemory.confidencePenalty, 0)),
    );
  }

  return roundScore(Math.min(...caps.filter(Number.isFinite)));
}

function survivalBlockers(
  survivalMemory: TrustGovernorInput["survivalMemory"],
  opensNewExposure: boolean,
): TrustBlocker[] {
  if (!survivalMemory || !opensNewExposure) return [];

  const status = normalizedStatus(survivalMemory.status);
  const recommendation = normalizedStatus(survivalMemory.recommendation);
  const nearRuinCount = finiteNumber(survivalMemory.nearRuinCount) ?? 0;
  const scarCount = finiteNumber(survivalMemory.scarCount) ?? 0;
  const exposureMultiplier = ratioScore(survivalMemory.exposureMultiplier, 1);
  const unlockCriteria =
    Array.isArray(survivalMemory.unlockConditions) &&
    survivalMemory.unlockConditions.length
      ? survivalMemory.unlockConditions
      : [
          "Wait until similar states show survival cost below 35/100 and no near-ruin match.",
          "Restore a positive recovery exposure cap.",
        ];

  if (
    recommendation === "wait" ||
    status === "near-ruin" ||
    (nearRuinCount > 0 && exposureMultiplier <= 0.2) ||
    exposureMultiplier === 0
  ) {
    return [
      blocker(
        "survival_memory_wait",
        "Survival memory wait",
        "high",
        "Survival memory blocks new exposure until recovery evidence clears the near-ruin pattern.",
        unlockCriteria,
      ),
    ];
  }

  if (
    recommendation === "act-with-reduced-size" ||
    scarCount > 0 ||
    exposureMultiplier < 0.85
  ) {
    return [
      blocker(
        "survival_reduced_size",
        "Survival reduced size",
        "medium",
        "Survival memory allows only reduced-size recovery exposure.",
        Array.isArray(survivalMemory.unlockConditions) &&
          survivalMemory.unlockConditions.length
          ? survivalMemory.unlockConditions
          : [
              "Move Survival Memory from scarred/watch to clear with survival confidence above 70/100 and clean reduced-size outcomes before normal sizing is restored.",
            ],
      ),
    ];
  }

  return [];
}

function participationModeFor(input: {
  trustScore: number;
  confidenceCap: number;
  rawMaxExposure: number;
  blockers: TrustBlocker[];
  policy: Required<typeof DEFAULT_POLICY>;
}): TrustParticipationMode {
  const critical = input.blockers.some(
    (blocker) => blocker.severity === "critical",
  );
  const hard = input.blockers.some((blocker) => blocker.severity === "high");

  if (critical) return "blocked";
  if (hard) return "exits_only";
  if (input.rawMaxExposure <= 0) return "exits_only";
  if (
    input.trustScore < input.policy.paperTrustThreshold ||
    input.confidenceCap < input.policy.paperTrustThreshold
  ) {
    return "paper";
  }
  if (input.trustScore < input.policy.microTrustThreshold) return "micro";
  if (input.trustScore < input.policy.limitedTrustThreshold) return "limited";
  if (input.trustScore < input.policy.normalTrustThreshold) return "limited";
  return "normal";
}

function exposureFor(input: {
  mode: TrustParticipationMode;
  rawMaxExposure: number;
  requestedExposure: number;
  policy: Required<typeof DEFAULT_POLICY>;
}) {
  if (
    input.mode === "blocked" ||
    input.mode === "exits_only" ||
    input.mode === "paper"
  )
    return 0;
  if (input.mode === "micro")
    return roundExposure(
      Math.min(input.rawMaxExposure, input.policy.microMaxExposurePct),
    );
  if (input.mode === "limited") {
    return roundExposure(
      Math.min(
        input.rawMaxExposure,
        Math.max(
          input.policy.microMaxExposurePct,
          input.rawMaxExposure * input.policy.limitedExposureMultiplier,
        ),
      ),
    );
  }
  return roundExposure(input.rawMaxExposure);
}

function survivalAdjustedMaxExposure(
  survivalMemory: TrustGovernorInput["survivalMemory"],
  configuredMaxExposure: number,
) {
  if (!survivalMemory) return configuredMaxExposure;

  const caps = [configuredMaxExposure];
  const maxExposurePct = finiteNumber(survivalMemory.maxExposurePct);
  const exposureMultiplier = ratioScore(survivalMemory.exposureMultiplier, 1);
  const recommendation = normalizedStatus(survivalMemory.recommendation);

  if (maxExposurePct != null) caps.push(Math.max(0, maxExposurePct));
  if (maxExposurePct == null && exposureMultiplier < 1)
    caps.push(configuredMaxExposure * exposureMultiplier);
  if (recommendation === "wait") caps.push(0);

  return roundExposure(Math.min(...caps));
}

function survivalAuditFor(
  survivalMemory: TrustGovernorInput["survivalMemory"],
  trustedMaxExposure: number,
) {
  if (!survivalMemory) return {};

  return {
    survivalRecovery: {
      ...(survivalMemory.status == null
        ? {}
        : { status: String(survivalMemory.status) }),
      ...(survivalMemory.recommendation == null
        ? {}
        : { recommendation: String(survivalMemory.recommendation) }),
      ...(survivalMemory.exposureMultiplier == null
        ? {}
        : {
            exposureMultiplier: ratioScore(
              survivalMemory.exposureMultiplier,
              1,
            ),
          }),
      ...(survivalMemory.survivalConfidence == null
        ? {}
        : { survivalConfidence: score(survivalMemory.survivalConfidence, 0) }),
      ...(survivalMemory.confidencePenalty == null
        ? {}
        : { confidencePenalty: score(survivalMemory.confidencePenalty, 0) }),
      ...(survivalMemory.maxExposurePct == null
        ? {}
        : { maxExposurePct: percent(survivalMemory.maxExposurePct, 0) }),
      trustedMaxExposure,
    },
  };
}

function allowedActionsFor(
  mode: TrustParticipationMode,
): TrustGovernorAction[] {
  if (mode === "blocked") return ["observe"];
  if (mode === "exits_only") return ["observe", "risk_reducing_exits"];
  if (mode === "paper")
    return ["observe", "paper_trade", "risk_reducing_exits"];
  return [
    "observe",
    "paper_trade",
    "risk_reducing_exits",
    "new_exposure",
    "increase_position",
  ];
}

function blockedActionsFor(
  mode: TrustParticipationMode,
): TrustGovernorAction[] {
  if (mode === "normal" || mode === "limited" || mode === "micro") return [];
  if (mode === "paper") return ["new_exposure", "increase_position"];
  if (mode === "exits_only")
    return ["paper_trade", "new_exposure", "increase_position"];
  return [
    "paper_trade",
    "risk_reducing_exits",
    "new_exposure",
    "increase_position",
  ];
}

function contradictionsFor(input: {
  input: TrustGovernorInput;
  calibrationStatus: string;
  calibrationWarnings: string[];
  blockers: TrustBlocker[];
}) {
  const contradictions: string[] = [];
  const calibrationBlocked =
    CALIBRATION_REVIEW_STATUSES.has(input.calibrationStatus) ||
    input.calibrationWarnings.includes("unstable outcomes") ||
    input.calibrationWarnings.includes("poor calibration");
  const judgementStatus = input.input.judgement?.status;
  const reliabilityStatus = normalizedStatus(input.input.reliability?.status);
  const agencyStatus = normalizedStatus(input.input.agency?.status);

  if (
    (judgementStatus === "trusted" || judgementStatus === "cautious") &&
    calibrationBlocked
  ) {
    contradictions.push(
      "Judgement finds similar history usable, but calibration still requires review.",
    );
  }
  if (
    input.input.strategy?.productionEligible === true &&
    input.blockers.length > 0
  ) {
    contradictions.push(
      "Backtest readiness is production-eligible, but trust gates still block live participation.",
    );
  }
  if (
    (reliabilityStatus === "healthy" || reliabilityStatus === "") &&
    input.blockers.some((blocker) => blocker.id.startsWith("calibration_"))
  ) {
    contradictions.push(
      "Market data is reliable, but model calibration is not stable enough for new exposure.",
    );
  }
  if (
    (agencyStatus === "approved" || agencyStatus === "act") &&
    input.blockers.length > 0
  ) {
    contradictions.push(
      "Agency approval conflicts with unresolved trust blockers.",
    );
  }

  return unique(contradictions);
}

function reasonsFor(input: {
  participationMode: TrustParticipationMode;
  trustScore: number;
  confidenceCap: number;
  maxExposure: number;
  blockers: TrustBlocker[];
  contradictions: string[];
}) {
  const reasons = [
    `Signal Trust Governor selected ${input.participationMode.replace(/_/g, " ")} mode with trust ${formatPercent(input.trustScore)} and confidence cap ${formatPercent(input.confidenceCap)}.`,
  ];

  if (input.blockers.length) {
    reasons.push(input.blockers[0].reason);
  } else if (input.maxExposure > 0) {
    reasons.push(
      `Trusted maximum exposure is ${formatExposure(input.maxExposure)}.`,
    );
  }

  if (input.contradictions.length) {
    reasons.push(input.contradictions[0]);
  }

  return unique(reasons);
}

function blocker(
  id: string,
  label: string,
  severity: TrustBlockerSeverity,
  reason: string,
  unlockCriteria: string[],
): TrustBlocker {
  return {
    id,
    label,
    severity,
    reason,
    unlockCriteria,
  };
}

function weightedScore(
  scores: Record<string, number>,
  weights: Record<string, number>,
) {
  const totalWeight = Object.values(weights).reduce(
    (sum, value) => sum + value,
    0,
  );
  const weighted = Object.entries(weights).reduce(
    (sum, [key, weight]) => sum + score(scores[key], 0) * weight,
    0,
  );
  return roundScore(totalWeight > 0 ? weighted / totalWeight : 0);
}

function score(value: unknown, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return clamp(fallback);
  return roundScore(
    Math.abs(numberValue) <= 1 ? numberValue * 100 : numberValue,
  );
}

function ratioScore(value: unknown, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return Math.min(1, Math.max(0, fallback));
  return Math.min(1, Math.max(0, numberValue));
}

function finiteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function percent(value: unknown, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return Math.max(0, fallback);
  return roundExposure(Math.max(0, numberValue));
}

function normalizedStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function normalizedWarnings(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) =>
          String(item ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    : [];
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueBlockers(blockers: TrustBlocker[]) {
  const byId = new Map<string, TrustBlocker>();

  for (const blocker of blockers) {
    if (!byId.has(blocker.id)) byId.set(blocker.id, blocker);
  }

  return Array.from(byId.values()).sort(
    (left, right) => severityRank(right.severity) - severityRank(left.severity),
  );
}

function severityRank(severity: TrustBlockerSeverity) {
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

function roundScore(value: number) {
  return Math.round(clamp(value) * 100) / 100;
}

function roundExposure(value: number) {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatExposure(value: number) {
  return `${roundExposure(value).toFixed(2)}%`;
}
