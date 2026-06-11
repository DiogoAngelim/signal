import {
  type DecisionCounterfactualResult,
  type DecisionOutcomeRecord,
  type DecisionQualityResult,
  type DiscoveryIntelligenceResult,
  createWisdom,
  evaluateCounterfactuals,
  evaluateDiscoveryIntelligence,
} from "../../../signal-framework";
import {
  type CapacityState,
  type PermissionState,
  type TrustState,
  type UrgencyState,
  evaluateDecisionStates,
} from "../../../signal-framework/decision-states/engine";
import {
  type DiscoveryAccountabilityResult,
  evaluateDiscoveryAccountability,
} from "../../../signal-framework/discovery-accountability/engine";
import {
  type ExecutionQualityResult,
  evaluateExecutionQuality,
} from "../../../signal-framework/execution-quality/engine";
import {
  type ExecutiveAction,
  type ExecutiveDecision,
  evaluateExecutiveDecision,
} from "../../../signal-framework/executive/engine";
import type {
  StrategySignalDecision,
  StrategySignalInput,
} from "./strategy-readiness";

export type StockExecutiveArchitecture = {
  executionQuality: ExecutionQualityResult;
  counterfactual: DecisionCounterfactualResult;
  discoveryAccountability: DiscoveryAccountabilityResult;
  discoveryIntelligence: DiscoveryIntelligenceResult;
  wisdom: DecisionQualityResult;
  executiveDecision: ExecutiveDecision;
  decisionStates: {
    trust: TrustState;
    permission: PermissionState;
    capacity: CapacityState;
    urgency: UrgencyState;
  };
};

export type StockExecutiveArchitectureInput = {
  signalInput: StrategySignalInput;
  decision: Pick<
    StrategySignalDecision,
    | "signalAction"
    | "allocationAction"
    | "signalStatus"
    | "suggestedExposure"
    | "maxPositionPct"
    | "signalConfidence"
    | "rawConfidence"
    | "calibratedConfidence"
    | "trustworthiness"
    | "rejectionReason"
    | "sizingMode"
    | "sizingReasons"
    | "sizingResult"
    | "trustGovernor"
    | "recovery"
    | "belief"
    | "judgement"
    | "survivalMemory"
  >;
};

export function buildStockExecutiveArchitecture(
  input: StockExecutiveArchitectureInput,
): StockExecutiveArchitecture {
  const { signalInput, decision } = input;
  const executionQuality = evaluateExecutionQuality({
    action: decision.signalAction.toLowerCase(),
    entryQuality: signalInput.setupQuality,
    exitQuality: 100 - signalInput.riskPressure,
    liquidityQuality: signalInput.liquidityScore ?? 55,
    slippageRisk: slippageRiskFor(signalInput),
    volatilityRisk: volatilityRiskFor(signalInput.volatilityPct),
    timingUrgency: timingUrgencyFor(signalInput, decision),
    scalingQuality: scalingQualityFor(signalInput, decision),
    invalidationClarity: invalidationClarityFor(decision),
    executionReadiness: signalInput.readiness.readinessScore,
    marketImpactRisk: 100 - (signalInput.liquidityScore ?? 55),
    staleDataRisk: staleDataRiskFor(signalInput),
    blockers: executionBlockersFor(signalInput, decision),
    warnings: executionWarningsFor(signalInput, decision),
  });
  const discoveryAccountability = evaluateDiscoveryAccountability({
    discovery: {
      status:
        primaryOpportunity(signalInput)?.discovery?.status ??
        primaryOpportunity(signalInput)?.lifecycle?.status,
      confidence: firstNumber(
        primaryOpportunity(signalInput)?.discovery?.confidence,
        primaryOpportunity(signalInput)?.confidence,
        primaryOpportunity(signalInput)?.candidateScore,
      ),
      maturity: firstNumber(
        primaryOpportunity(signalInput)?.discovery?.maturity,
        primaryOpportunity(signalInput)?.maturity,
      ),
      novelty: firstNumber(
        primaryOpportunity(signalInput)?.discovery?.novelty,
        primaryOpportunity(signalInput)?.novelty,
      ),
      trust: decision.trustworthiness,
      opportunities: signalInput.opportunityCandidates,
    },
    events: discoveryEventsFor(signalInput),
  });
  const counterfactual = evaluateCounterfactuals({
    actualDecision: {
      decision: decision.signalAction.toLowerCase(),
      confidence: decision.signalConfidence,
      trust: decision.trustworthiness,
      opportunity: opportunityScoreFor(signalInput),
      risk: signalInput.riskPressure,
      maxExposure: decision.suggestedExposure,
      expectedReturn: signalInput.expectedEdgePct,
      reason: decision.rejectionReason ?? decision.sizingReasons[0],
    },
    unrestrictedDecision: {
      decision: signalInput.rawAction.toLowerCase(),
      confidence: signalInput.signalConfidence,
      trust: decision.trustworthiness,
      opportunity: opportunityScoreFor(signalInput),
      risk: signalInput.riskPressure,
      maxExposure: signalInput.rawSuggestedExposurePct,
      expectedReturn: signalInput.expectedEdgePct,
      reason: "Raw candidate before governance restrictions.",
    },
    normalSizeDecision: {
      decision:
        signalInput.rawAction === "Buy"
          ? "buy"
          : signalInput.rawAction.toLowerCase(),
      confidence: decision.rawConfidence,
      trust: decision.trustworthiness,
      opportunity: opportunityScoreFor(signalInput),
      risk: signalInput.riskPressure,
      maxExposure: signalInput.readiness.maxPositionPct,
      expectedReturn: signalInput.expectedEdgePct,
      reason: "Normal-size scenario before active caps.",
    },
    waitDecision: {
      decision: "watch",
      confidence: decision.calibratedConfidence,
      trust: decision.trustworthiness,
      opportunity: opportunityScoreFor(signalInput),
      risk: Math.max(0, signalInput.riskPressure - 10),
      maxExposure: 0,
      expectedReturn: Math.max(0, signalInput.expectedEdgePct * 0.35),
      reason: "Wait scenario avoids immediate execution risk.",
    },
    ignoredRestrictionDecision: decision.rejectionReason
      ? {
          decision: signalInput.rawAction.toLowerCase(),
          confidence: signalInput.signalConfidence,
          trust: decision.trustworthiness,
          opportunity: opportunityScoreFor(signalInput),
          risk: Math.min(100, signalInput.riskPressure + 25),
          maxExposure: Math.max(
            signalInput.rawSuggestedExposurePct,
            signalInput.readiness.maxPositionPct,
          ),
          expectedReturn: signalInput.expectedEdgePct,
          reason: `Ignored restriction: ${decision.rejectionReason}`,
        }
      : undefined,
    restrictions: restrictionLearningFor(decision),
  });
  const wisdomEngine = createWisdom({
    memory: wisdomMemoryFor(signalInput),
  });
  const wisdomRecord = wisdomRecordFor(signalInput, decision);
  const wisdom = wisdomEngine.evaluateDecisionQuality({
    decision: wisdomRecord,
    reflection: { score: signalInput.readiness.readinessScore },
    agency: signalInput.agencyResult,
    survivalMemory: decision.survivalMemory,
    discovery:
      primaryOpportunity(signalInput)?.discovery ??
      primaryOpportunity(signalInput)?.opportunityDiscovery,
    opportunityEconomics: wisdomEngine.evaluateOpportunityEconomics({
      selected:
        decision.signalStatus === "blocked"
          ? "reject"
          : decision.signalStatus === "watch"
            ? "wait"
            : decision.suggestedExposure < signalInput.rawSuggestedExposurePct
              ? "scale"
              : "action",
      action: {
        expectedReward: signalInput.expectedEdgePct,
        expectedRisk: signalInput.riskPressure / 12,
        confidence: signalInput.signalConfidence,
      },
      wait: {
        expectedReward: Math.max(0, signalInput.expectedEdgePct * 0.45),
        expectedRisk: Math.max(0, signalInput.riskPressure / 16),
        confidence: decision.calibratedConfidence,
      },
      reject: {
        expectedReward: 0,
        expectedRisk: 0,
        confidence: 100,
      },
      scale: {
        expectedReward:
          signalInput.expectedEdgePct * scaledShareFor(signalInput, decision),
        expectedRisk:
          (signalInput.riskPressure / 12) *
          scaledShareFor(signalInput, decision),
        confidence: decision.trustworthiness,
      },
    }),
    discoveryMaturity: wisdomEngine.evaluateDiscoveryMaturity({
      discoveries: wisdomDiscoveriesFor(signalInput),
    }),
    portfolioIntelligence: wisdomEngine.evaluatePortfolioIntelligence({
      opportunities: wisdomPortfolioOpportunities(signalInput),
      currentAllocations: wisdomAllocationsFor(signalInput, decision),
      capitalConstraints: {
        availableCapital: Math.max(
          100,
          signalInput.readiness.maxPositionPct * 10,
        ),
        maxAllocationPerOpportunity: signalInput.readiness.maxPositionPct,
      },
      riskProfile: {
        riskTolerance: Math.max(0, 100 - signalInput.riskPressure),
        concentrationLimit: signalInput.readiness.maxPositionPct,
      },
    }),
  });
  const separated = evaluateDecisionStates({
    confidence: decision.signalConfidence,
    risk: signalInput.riskPressure,
    opportunity: opportunityScoreFor(signalInput),
    trust: {
      score: decision.trustworthiness,
      status: trustStatusFor(decision.trustworthiness),
      reasons: ["Mapped from strategy calibration and trustworthiness."],
    },
    permission: permissionForDecision(decision),
    capacity: capacityForDecision(decision),
    urgency: {
      score: timingUrgencyFor(signalInput, decision),
      mode: urgencyModeFor(timingUrgencyFor(signalInput, decision)),
      reasons: [
        "Mapped from expected edge, risk pressure, and execution timing.",
      ],
    },
    trustGovernor: decision.trustGovernor,
    calibration: signalInput.readiness.calibration,
    readiness: signalInput.readiness,
    survivalMemory: decision.survivalMemory,
    executionQuality,
  });
  const discoveryIntelligence = evaluateDiscoveryIntelligence({
    discoveries: discoveryIntelligenceDiscoveriesFor(signalInput),
    decisions: discoveryIntelligenceDecisionsFor(signalInput, decision),
    outcomes: discoveryIntelligenceOutcomesFor(signalInput, decision),
    restrictions: discoveryIntelligenceRestrictionsFor(
      decision,
      counterfactual,
      executionQuality,
    ),
    traces: discoveryIntelligenceTracesFor(
      signalInput,
      decision,
      separated,
      wisdom,
      discoveryAccountability,
    ),
    historyDepthScore: firstNumber(
      (signalInput.readiness as any).historyDiagnostics?.historyDepthScore,
      signalInput.readiness.robustnessDiagnostics?.historyDepthScore,
    ),
    regimeCoverageScore: firstNumber(
      (signalInput.readiness as any).historyDiagnostics?.regimeCoverageScore,
      signalInput.readiness.robustnessDiagnostics?.regimeCoverageScore,
    ),
    sampleDiversityScore: firstNumber(
      (signalInput.readiness as any).historyDiagnostics?.sampleDiversityScore,
      signalInput.readiness.robustnessDiagnostics?.sampleDiversityScore,
    ),
    regimeDiversityScore: firstNumber(
      (signalInput.readiness as any).historyDiagnostics?.regimeDiversityScore,
      signalInput.readiness.robustnessDiagnostics?.regimeDiversityScore,
    ),
  });
  const executiveDecision = evaluateExecutiveDecision({
    proposedDecision: proposedDecisionFor(decision),
    confidence: decision.signalConfidence,
    discovery:
      primaryOpportunity(signalInput)?.discovery ??
      primaryOpportunity(signalInput)?.opportunityDiscovery,
    discoveryAccountability,
    discoveryIntelligence,
    recognition: (decision as any).recognition,
    belief: decision.belief,
    judgement: decision.judgement,
    agency: signalInput.agencyResult,
    wisdom,
    resolve: (decision as any).resolve,
    survivalMemory: decision.survivalMemory,
    calibration: signalInput.readiness.calibration,
    readiness: signalInput.readiness,
    trust: separated.trust,
    permission: separated.permission,
    capacity: separated.capacity,
    urgency: separated.urgency,
    risk: signalInput.riskPressure,
    opportunity: opportunityScoreFor(signalInput),
    restrictions: decision.rejectionReason
      ? [
          {
            id: "market-decision-rejection",
            label: "Market decision rejection",
            reason: decision.rejectionReason,
            severity: decision.signalStatus === "blocked" ? "high" : "medium",
            blocksAction: decision.signalStatus === "blocked",
            unlockCondition: decision.sizingReasons[0],
          },
        ]
      : [],
    historicalEvidence: [
      ...decision.sizingReasons.slice(0, 3),
      ...(decision.judgement?.reasons ?? []).slice(0, 2),
    ],
    executionQuality,
    counterfactual,
    maxExposure: decision.suggestedExposure,
    nextReviewCondition: nextReviewConditionFor(signalInput, decision),
  });

  return {
    executionQuality,
    counterfactual,
    discoveryAccountability,
    discoveryIntelligence,
    wisdom,
    executiveDecision,
    decisionStates: {
      trust: separated.trust,
      permission: separated.permission,
      capacity: separated.capacity,
      urgency: separated.urgency,
    },
  };
}

function proposedDecisionFor(
  decision: Pick<
    StrategySignalDecision,
    "signalAction" | "allocationAction" | "signalStatus"
  >,
): ExecutiveAction {
  if (decision.signalAction === "Sell") return "sell";
  if (decision.signalAction === "Buy") return "buy";
  if (decision.allocationAction === "Blocked") return "avoid";
  if (decision.signalStatus === "watch") return "watch";
  return "hold";
}

function permissionForDecision(
  decision: StockExecutiveArchitectureInput["decision"],
): PermissionState {
  if (decision.signalStatus === "blocked") {
    return {
      allowed: false,
      level: "blocked",
      reasons: [
        decision.rejectionReason ?? "Signal is blocked by strategy governance.",
      ],
    };
  }
  if (decision.rejectionReason) {
    return {
      allowed: true,
      level: "review_required",
      reasons: [decision.rejectionReason],
    };
  }
  if (
    decision.suggestedExposure > 0 &&
    decision.suggestedExposure < decision.maxPositionPct
  ) {
    return {
      allowed: true,
      level: "limited",
      reasons: [
        "Exposure is allowed but capped below normal position capacity.",
      ],
    };
  }
  return {
    allowed: true,
    level: "approved",
    reasons: ["Strategy governance allows the action."],
  };
}

function capacityForDecision(
  decision: StockExecutiveArchitectureInput["decision"],
): CapacityState {
  const maxExposure = Math.max(
    0,
    decision.suggestedExposure || decision.trustGovernor?.maxExposure || 0,
  );
  return {
    maxExposure,
    mode:
      maxExposure <= 0
        ? "none"
        : maxExposure <= 1.5
          ? "micro"
          : maxExposure < 10
            ? "reduced"
            : maxExposure <= 25
              ? "normal"
              : "expanded",
    reasons: decision.sizingReasons.length
      ? decision.sizingReasons
      : ["Mapped from strategy sizing result."],
  };
}

function executionBlockersFor(
  input: StrategySignalInput,
  decision: StockExecutiveArchitectureInput["decision"],
) {
  return [
    input.liquidityScore != null && input.liquidityScore < 20
      ? "Asset liquidity is too weak for clean execution."
      : "",
    decision.signalStatus === "blocked" && decision.rejectionReason
      ? decision.rejectionReason
      : "",
  ].filter(Boolean);
}

function executionWarningsFor(
  input: StrategySignalInput,
  decision: StockExecutiveArchitectureInput["decision"],
) {
  return [
    input.riskPressure > 65
      ? "Risk pressure is elevated for immediate execution."
      : "",
    decision.sizingMode === "micro" || decision.sizingMode === "none"
      ? "Execution should stay small or wait until capacity improves."
      : "",
  ].filter(Boolean);
}

function discoveryEventsFor(input: StrategySignalInput) {
  return (input.opportunityCandidates ?? [])
    .slice(0, 12)
    .map((candidate: any, index) => ({
      id: String(candidate.symbol ?? candidate.id ?? index),
      outcome:
        Number(
          candidate.expectedMove ??
            candidate.returnPct ??
            candidate.score ??
            candidate.candidateScore ??
            0,
        ) > 0
          ? "positive"
          : "unknown",
      profitScore: firstNumber(
        candidate.expectedMove,
        candidate.returnPct,
        candidate.score,
        candidate.candidateScore,
      ),
      confidence: firstNumber(candidate.confidence, candidate.candidateScore),
      maturity: firstNumber(candidate.maturity, candidate.lifecycle?.maturity),
      novelty: firstNumber(candidate.novelty, candidate.discovery?.novelty),
      wasEarly: normalized(
        candidate.lifecycle?.status ?? candidate.status,
      ).includes("emerging"),
      wasRejected: normalized(candidate.signalStatus).includes("blocked"),
      wasFalseDiscovery:
        normalized(candidate.signalStatus).includes("blocked") &&
        Number(candidate.expectedMove ?? 0) <= 0,
    }));
}

function discoveryIntelligenceDiscoveriesFor(input: StrategySignalInput) {
  const candidates = (input.opportunityCandidates ?? []).slice(0, 48);
  const mapped = candidates.map((candidate: any, index) => {
    const confidence =
      firstNumber(
        candidate.confidence,
        candidate.candidateScore,
        input.signalConfidence,
      ) ?? 50;
    const expectedValue =
      firstNumber(
        candidate.expectedMove,
        candidate.returnPct,
        candidate.score,
        candidate.candidateScore,
      ) ?? 0;
    const stage =
      candidate.lifecycle?.status ??
      candidate.discovery?.status ??
      candidate.status ??
      (confidence >= 85
        ? "TRUSTED"
        : confidence >= 70
          ? "CONFIRMED"
          : confidence >= 45
            ? "OBSERVED"
            : "DETECTED");

    return {
      id: String(
        candidate.symbol ??
          candidate.ticker ??
          candidate.id ??
          `candidate-${index + 1}`,
      ),
      stage,
      previousStage:
        candidate.lifecycle?.previousStatus ?? candidate.previousStatus,
      novelty: firstNumber(candidate.novelty, candidate.discovery?.novelty),
      confidence,
      trust: firstNumber(
        candidate.trust,
        candidate.trustworthiness,
        input.readiness.calibration?.trustworthiness,
      ),
      maturity: firstNumber(
        candidate.maturity,
        candidate.discovery?.maturity,
        candidate.lifecycle?.maturity,
      ),
      value: expectedValue,
      abandoned: normalized(candidate.signalStatus).includes("blocked"),
      falseDiscovery:
        normalized(candidate.signalStatus).includes("blocked") &&
        expectedValue <= 0,
      converted: expectedValue > 0 && confidence >= 60,
      institutionalStage:
        candidate.institutionalStage ?? candidate.knowledgeStage,
    };
  });

  if (mapped.length) return mapped;
  return [
    {
      id: String(input.symbol || "primary-discovery"),
      stage: input.signalConfidence >= 70 ? "CONFIRMED" : "OBSERVED",
      confidence: input.signalConfidence,
      trust: input.readiness.calibration?.trustworthiness,
      maturity: input.setupQuality,
      value: input.expectedEdgePct,
      converted: input.expectedEdgePct > 0,
    },
  ];
}

function discoveryIntelligenceDecisionsFor(
  input: StrategySignalInput,
  decision: StockExecutiveArchitectureInput["decision"],
) {
  const fullUtility = input.expectedEdgePct - input.riskPressure / 12;
  const actualShare = scaledShareFor(input, decision);
  const actualUtility =
    decision.signalStatus === "blocked" ? 0 : fullUtility * actualShare;

  return [
    {
      id: discoveryIntelligenceDecisionId(input),
      discoveryId: String(input.symbol || "primary-discovery"),
      action: discoveryIntelligenceActionFor(input, decision),
      expectedValue: fullUtility,
      actualValue: actualUtility,
      alternatives: {
        ACT: fullUtility,
        WAIT: Math.max(
          0,
          input.expectedEdgePct * 0.45 - input.riskPressure / 16,
        ),
        REJECT: 0,
        RESTRICT: fullUtility * Math.max(0.25, actualShare || 0.5),
      },
      confidence: decision.signalConfidence,
    },
  ];
}

function discoveryIntelligenceOutcomesFor(
  input: StrategySignalInput,
  decision: StockExecutiveArchitectureInput["decision"],
) {
  const fullUtility = input.expectedEdgePct - input.riskPressure / 12;
  const actualShare = scaledShareFor(input, decision);
  const actualUtility =
    decision.signalStatus === "blocked" ? 0 : fullUtility * actualShare;
  const historical = [
    ...(input.previousTrades ?? []),
    ...(input.strategyHistory ?? []),
  ]
    .slice(-48)
    .map((trade: any, index) => {
      const value =
        firstNumber(
          trade?.returnPct,
          trade?.return_pct,
          trade?.profitPct,
          trade?.value,
        ) ?? 0;
      return {
        id: `historical-discovery-outcome-${index + 1}`,
        discoveryId: String(
          trade?.symbol ?? trade?.ticker ?? input.symbol ?? "historical",
        ),
        action: trade?.action ?? trade?.signalAction ?? "ACT",
        value,
        success: value > 0,
        calibrationScore: firstNumber(
          trade?.calibrationScore,
          trade?.calibratedConfidence,
          decision.calibratedConfidence,
        ),
        trustScore: firstNumber(
          trade?.trustScore,
          trade?.trustworthiness,
          decision.trustworthiness,
        ),
        survivalScore: firstNumber(
          trade?.survivalScore,
          trade?.survivalConfidence,
          decision.survivalMemory?.survivalConfidence,
        ),
        decisionQuality: firstNumber(
          trade?.decisionQuality,
          trade?.confidence,
          decision.signalConfidence,
        ),
        governanceScore: firstNumber(
          trade?.governanceScore,
          decision.trustGovernor?.trustScore,
          decision.trustworthiness,
        ),
        timestamp: firstNumber(
          trade?.timestamp,
          trade?.closedAt,
          trade?.date,
          index,
        ),
      };
    });

  return [
    {
      id: `${discoveryIntelligenceDecisionId(input)}:outcome`,
      decisionId: discoveryIntelligenceDecisionId(input),
      discoveryId: String(input.symbol || "primary-discovery"),
      action: discoveryIntelligenceActionFor(input, decision),
      value: actualUtility,
      success: actualUtility >= 0,
      calibrationScore: decision.calibratedConfidence,
      trustScore: decision.trustworthiness,
      survivalScore: decision.survivalMemory?.survivalConfidence,
      decisionQuality:
        wisdomStatusFor(input, decision) === "approved"
          ? decision.signalConfidence
          : decision.calibratedConfidence,
      governanceScore:
        decision.trustGovernor?.trustScore ?? decision.trustworthiness,
    },
    ...historical,
  ];
}

function discoveryIntelligenceRestrictionsFor(
  decision: StockExecutiveArchitectureInput["decision"],
  counterfactual: DecisionCounterfactualResult,
  executionQuality: ExecutionQualityResult,
) {
  const restrictions = [];
  if (decision.rejectionReason) {
    restrictions.push({
      id: "decision-governance-restriction",
      type: decision.sizingMode === "none" ? "trust gate" : "readiness gate",
      label: decision.rejectionReason,
      decisionId: discoveryIntelligenceDecisionIdFromDecision(decision),
      avoidedLoss: counterfactual.avoidedLossScore / 10,
      missedUpside: counterfactual.missedUpsideScore / 10,
    });
  }
  for (const [index, blocker] of executionQuality.blockers.entries()) {
    restrictions.push({
      id: `execution-quality-blocker-${index + 1}`,
      type: "execution gate",
      label: blocker,
      decisionId: discoveryIntelligenceDecisionIdFromDecision(decision),
      avoidedLoss:
        executionQuality.score < 50 ? (50 - executionQuality.score) / 5 : 0,
      missedUpside: counterfactual.cautionCostScore / 20,
    });
  }
  return restrictions;
}

function discoveryIntelligenceTracesFor(
  input: StrategySignalInput,
  decision: StockExecutiveArchitectureInput["decision"],
  states: ReturnType<typeof evaluateDecisionStates>,
  wisdom: DecisionQualityResult,
  discoveryAccountability: DiscoveryAccountabilityResult,
) {
  return [
    {
      id: "current-calibration",
      metric: "calibration",
      value: decision.calibratedConfidence,
    },
    {
      id: "current-trust",
      metric: "trust",
      value: states.trust.score,
    },
    {
      id: "current-survival",
      metric: "survival",
      value:
        decision.survivalMemory?.survivalConfidence ??
        input.readiness.readinessScore,
    },
    {
      id: "current-decision-quality",
      metric: "decision quality",
      value: wisdom.decisionQuality,
    },
    {
      id: "current-governance",
      metric: "governance",
      value: discoveryAccountability.accountabilityScore,
    },
    {
      id: "current-regime-coverage",
      metric: "regime coverage",
      value: firstNumber(
        (input.readiness as any).historyDiagnostics?.regimeCoverageScore,
        input.readiness.robustnessDiagnostics?.regimeCoverageScore,
      ),
    },
    ...[...(input.previousTrades ?? []), ...(input.strategyHistory ?? [])]
      .slice(-24)
      .flatMap((trade: any, index) => [
        {
          id: `history-${index + 1}:calibration`,
          metric: "calibration",
          value: firstNumber(
            trade?.calibrationScore,
            trade?.calibratedConfidence,
          ),
          timestamp: firstNumber(trade?.timestamp, trade?.closedAt, index),
        },
        {
          id: `history-${index + 1}:trust`,
          metric: "trust",
          value: firstNumber(trade?.trustScore, trade?.trustworthiness),
          timestamp: firstNumber(trade?.timestamp, trade?.closedAt, index),
        },
        {
          id: `history-${index + 1}:decision-quality`,
          metric: "decision quality",
          value: firstNumber(trade?.decisionQuality, trade?.confidence),
          timestamp: firstNumber(trade?.timestamp, trade?.closedAt, index),
        },
      ]),
  ];
}

function discoveryIntelligenceActionFor(
  input: StrategySignalInput,
  decision: StockExecutiveArchitectureInput["decision"],
) {
  if (decision.signalStatus === "blocked") return "REJECT";
  if (decision.signalStatus === "watch") return "WAIT";
  if (decision.suggestedExposure < input.rawSuggestedExposurePct)
    return "RESTRICT";
  return "ACT";
}

function discoveryIntelligenceDecisionId(input: StrategySignalInput) {
  return `discovery-intelligence:${normalized(input.market)}:${normalized(input.symbol) || "primary"}`;
}

function discoveryIntelligenceDecisionIdFromDecision(
  decision: StockExecutiveArchitectureInput["decision"],
) {
  return `discovery-intelligence:${normalized((decision as any).market)}:${normalized((decision as any).symbol) || "primary"}`;
}

function restrictionLearningFor(
  decision: StockExecutiveArchitectureInput["decision"],
) {
  if (!decision.rejectionReason) return [];
  return [
    {
      reason: decision.rejectionReason,
      avoidedLossScore: decision.signalStatus === "blocked" ? 70 : 35,
      blockedUpsideScore: decision.signalStatus === "watch" ? 45 : 15,
    },
  ];
}

function primaryOpportunity(input: StrategySignalInput) {
  const symbol = normalized(input.symbol);
  return (
    (input.opportunityCandidates ?? []).find(
      (candidate: any) =>
        normalized(candidate.symbol ?? candidate.ticker) === symbol,
    ) ??
    input.opportunityCandidates?.[0] ??
    null
  );
}

function slippageRiskFor(input: StrategySignalInput) {
  const spreadPct = firstNumber(
    (input as any).spreadPct,
    (input as any).estimatedSpreadPct,
  );
  if (spreadPct != null) return clamp(spreadPct * 12);
  return clamp(
    (100 - (input.liquidityScore ?? 55)) * 0.5 + input.volatilityPct * 4,
  );
}

function volatilityRiskFor(volatilityPct: number) {
  return clamp(volatilityPct * 8);
}

function timingUrgencyFor(
  input: StrategySignalInput,
  decision: StockExecutiveArchitectureInput["decision"],
) {
  return clamp(
    input.signalConfidence * 0.45 +
      Math.max(0, input.expectedEdgePct) * 4 +
      (100 - input.riskPressure) * 0.2 +
      (decision.suggestedExposure > 0 ? 12 : 0),
  );
}

function scalingQualityFor(
  input: StrategySignalInput,
  decision: StockExecutiveArchitectureInput["decision"],
) {
  if (decision.suggestedExposure <= 0)
    return decision.signalStatus === "blocked" ? 25 : 45;
  const target = Math.max(1, input.readiness.maxPositionPct);
  return clamp(100 - Math.abs(target - decision.suggestedExposure) * 4);
}

function invalidationClarityFor(
  decision: StockExecutiveArchitectureInput["decision"],
) {
  const hasJudgement = Boolean(
    decision.judgement?.warnings?.length || decision.judgement?.reasons?.length,
  );
  const hasSizingReasons = decision.sizingReasons.length > 0;
  const hasRejection = Boolean(decision.rejectionReason);
  return clamp(
    (hasJudgement ? 35 : 0) +
      (hasSizingReasons ? 35 : 0) +
      (hasRejection ? 20 : 10),
  );
}

function staleDataRiskFor(input: StrategySignalInput) {
  const attemptedAt = firstNumber(
    (input as any).quoteLastAttemptedAt,
    (input as any).lastUpdatedAt,
  );
  if (attemptedAt == null) return 25;
  const ageMinutes = Math.max(0, Date.now() - attemptedAt) / 60_000;
  return clamp(ageMinutes * 3);
}

function opportunityScoreFor(input: StrategySignalInput) {
  return clamp(
    input.setupQuality * 0.5 +
      Math.max(0, input.expectedEdgePct) * 4 +
      input.signalConfidence * 0.2,
  );
}

function nextReviewConditionFor(
  input: StrategySignalInput,
  decision: StockExecutiveArchitectureInput["decision"],
) {
  if (decision.signalStatus === "blocked")
    return "Review when the blocking readiness, calibration, trust, or survival condition clears.";
  if (decision.signalStatus === "watch")
    return "Review when expected edge, execution quality, or capacity improves.";
  if (input.rawAction === "Buy")
    return "Review after the next quote, spread, and invalidation update.";
  return "Review if risk pressure, edge, or exit evidence changes.";
}

function wisdomRecordFor(
  input: StrategySignalInput,
  decision: StockExecutiveArchitectureInput["decision"],
): DecisionOutcomeRecord {
  const fullSize = Math.max(
    input.rawSuggestedExposurePct,
    input.readiness.maxPositionPct,
    decision.maxPositionPct,
  );
  const actualShare = scaledShareFor(input, decision);
  const fullUtility = input.expectedEdgePct - input.riskPressure / 12;
  const actualUtility =
    decision.signalStatus === "blocked" ? 0 : fullUtility * actualShare;

  return {
    id: `wisdom:${normalized(input.market)}:${normalized(input.symbol) || "unknown"}`,
    action: decision.signalAction.toLowerCase(),
    status: wisdomStatusFor(input, decision),
    context: {
      symbol: input.symbol,
      market: input.market,
      signalStatus: decision.signalStatus,
      sizingMode: decision.sizingMode,
      restrictionReason: decision.rejectionReason,
    },
    realizedResult: {
      value: actualUtility,
      reward: Math.max(0, input.expectedEdgePct * actualShare),
      adverseImpact: (input.riskPressure / 12) * actualShare,
      confidence: decision.signalConfidence,
    },
    alternatives: [
      {
        id: "do-nothing",
        kind: "do-nothing",
        action: "hold",
        expectedValue: 0,
        expectedRisk: 0,
        expectedConfidence: 100,
        counterfactualResult: { value: 0, adverseImpact: 0, confidence: 100 },
      },
      {
        id: "normal-size",
        kind: "alternative",
        action: input.rawAction.toLowerCase(),
        expectedReward: input.expectedEdgePct,
        expectedRisk: input.riskPressure / 12,
        expectedConfidence: input.signalConfidence,
        scale: fullSize / Math.max(1, fullSize),
        counterfactualResult: {
          value: fullUtility,
          reward: input.expectedEdgePct,
          adverseImpact: input.riskPressure / 12,
          confidence: input.signalConfidence,
        },
      },
      {
        id: "half-size",
        kind: "scale",
        action: input.rawAction.toLowerCase(),
        expectedReward: input.expectedEdgePct * 0.5,
        expectedRisk: input.riskPressure / 24,
        expectedConfidence: decision.trustworthiness,
        scale: 0.5,
        counterfactualResult: {
          value: fullUtility * 0.5,
          reward: input.expectedEdgePct * 0.5,
          adverseImpact: input.riskPressure / 24,
          confidence: decision.trustworthiness,
        },
      },
      {
        id: "wait-24h",
        kind: "wait",
        action: "watch",
        delayHours: 24,
        expectedReward: Math.max(0, input.expectedEdgePct * 0.45),
        expectedRisk: Math.max(0, input.riskPressure / 16),
        expectedConfidence: decision.calibratedConfidence,
        counterfactualResult: {
          value: Math.max(
            0,
            input.expectedEdgePct * 0.45 - input.riskPressure / 16,
          ),
          reward: Math.max(0, input.expectedEdgePct * 0.45),
          adverseImpact: Math.max(0, input.riskPressure / 16),
          confidence: decision.calibratedConfidence,
        },
      },
    ],
    agency: input.agencyResult,
    survivalMemory: decision.survivalMemory,
    discovery:
      primaryOpportunity(input)?.discovery ??
      primaryOpportunity(input)?.opportunityDiscovery,
  };
}

function wisdomStatusFor(
  input: StrategySignalInput,
  decision: StockExecutiveArchitectureInput["decision"],
): DecisionOutcomeRecord["status"] {
  if (decision.signalStatus === "blocked") return "blocked";
  if (decision.signalStatus === "watch") return "delayed";
  if (decision.rejectionReason) return "rejected";
  if (
    decision.suggestedExposure > 0 &&
    decision.suggestedExposure < input.rawSuggestedExposurePct
  )
    return "reduced-size";
  return "approved";
}

function wisdomMemoryFor(input: StrategySignalInput): DecisionOutcomeRecord[] {
  const trades = [
    ...(input.previousTrades ?? []),
    ...(input.strategyHistory ?? []),
  ].slice(-120);
  return trades.map((trade: any, index) => {
    const value =
      firstNumber(
        trade?.returnPct,
        trade?.return_pct,
        trade?.profitPct,
        trade?.value,
      ) ?? 0;
    const adverseImpact = Math.abs(
      firstNumber(
        trade?.maxDrawdown,
        trade?.maxDrawdownPct,
        trade?.adverseImpact,
        trade?.risk,
      ) ?? Math.min(0, value),
    );
    return {
      id: `historical-outcome-${index + 1}`,
      action:
        normalized(trade?.action ?? trade?.signalAction ?? "observed") ||
        "observed",
      status: value >= 0 ? "approved" : "blocked",
      realizedResult: {
        value,
        reward: Math.max(0, value),
        adverseImpact,
        confidence:
          firstNumber(trade?.confidence, trade?.signalConfidence) ?? 50,
      },
      alternatives: [
        {
          id: `historical-outcome-${index + 1}:wait`,
          kind: "wait",
          counterfactualResult: {
            value: value * 0.4,
            adverseImpact: adverseImpact * 0.5,
            confidence: 45,
          },
        },
      ],
    };
  });
}

function wisdomDiscoveriesFor(input: StrategySignalInput) {
  return (input.opportunityCandidates ?? [])
    .slice(0, 24)
    .map((candidate: any, index) => ({
      id: String(candidate.symbol ?? candidate.id ?? index),
      status:
        candidate.lifecycle?.status ??
        candidate.discovery?.status ??
        candidate.status,
      detectedAt: candidate.detectedAt ?? candidate.createdAt,
      confirmationCount: firstNumber(
        candidate.confirmationCount,
        candidate.discovery?.confirmationCount,
        candidate.confirmations,
      ),
      recurrenceCount: firstNumber(
        candidate.recurrenceCount,
        candidate.lifecycle?.recurrenceCount,
        candidate.recurrence,
      ),
      observationCount: firstNumber(
        candidate.observationCount,
        candidate.lifecycle?.observationCount,
        candidate.samples,
      ),
      conversionCount: firstNumber(
        candidate.conversionCount,
        candidate.lifecycle?.conversionCount,
        1,
      ),
      successCount: firstNumber(
        candidate.successCount,
        Number(
          candidate.expectedMove ?? candidate.returnPct ?? candidate.score ?? 0,
        ) > 0
          ? 1
          : 0,
      ),
      novelty: firstNumber(candidate.novelty, candidate.discovery?.novelty),
      maturityScore: firstNumber(
        candidate.maturity,
        candidate.discovery?.maturity,
        candidate.lifecycle?.maturity,
      ),
    }));
}

function wisdomPortfolioOpportunities(input: StrategySignalInput) {
  return (input.opportunityCandidates ?? [])
    .slice(0, 24)
    .map((candidate: any, index) => ({
      id: String(
        candidate.symbol ??
          candidate.ticker ??
          candidate.id ??
          `candidate-${index + 1}`,
      ),
      expectedValue:
        firstNumber(
          candidate.expectedMove,
          candidate.returnPct,
          candidate.score,
          candidate.candidateScore,
        ) ?? 0,
      expectedRisk:
        firstNumber(
          candidate.riskPressure,
          candidate.risk,
          input.riskPressure,
        ) ?? 0,
      allocation:
        firstNumber(candidate.suggestedExposure, candidate.allocation, 0) ?? 0,
      group: String(
        candidate.sector ?? candidate.group ?? candidate.market ?? "ungrouped",
      ),
      upside: Math.max(
        0,
        firstNumber(
          candidate.expectedMove,
          candidate.returnPct,
          candidate.score,
        ) ?? 0,
      ),
      downside:
        firstNumber(
          candidate.riskPressure,
          candidate.risk,
          input.riskPressure,
        ) ?? 0,
      confidence:
        firstNumber(
          candidate.confidence,
          candidate.candidateScore,
          input.signalConfidence,
        ) ?? 50,
    }));
}

function wisdomAllocationsFor(
  input: StrategySignalInput,
  decision: StockExecutiveArchitectureInput["decision"],
) {
  const symbol = String(input.symbol ?? "primary");
  const allocations: Record<string, number> = {
    [symbol]: Math.max(0, decision.suggestedExposure),
  };
  for (const candidate of input.opportunityCandidates ?? []) {
    const id = String(
      candidate.symbol ?? candidate.ticker ?? candidate.id ?? "",
    );
    if (id && allocations[id] == null) {
      allocations[id] = Math.max(
        0,
        firstNumber(candidate.suggestedExposure, candidate.allocation, 0) ?? 0,
      );
    }
  }
  return allocations;
}

function scaledShareFor(
  input: StrategySignalInput,
  decision: StockExecutiveArchitectureInput["decision"],
) {
  const raw = Math.max(
    1,
    input.rawSuggestedExposurePct ||
      input.readiness.maxPositionPct ||
      decision.maxPositionPct ||
      1,
  );
  return clamp(decision.suggestedExposure / raw, 0, 1);
}

function trustStatusFor(score: number): TrustState["status"] {
  if (score >= 88) return "highly_trusted";
  if (score >= 72) return "trusted";
  if (score >= 50) return "provisional";
  return "untrusted";
}

function urgencyModeFor(score: number): UrgencyState["mode"] {
  if (score <= 0) return "none";
  if (score < 35) return "wait";
  if (score < 60) return "monitor";
  if (score < 82) return "act_soon";
  return "act_now";
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return undefined;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalized(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
