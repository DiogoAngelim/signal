import assert from "node:assert/strict";
import { test } from "node:test";
import { applyStockAgencyDiagnostics } from "./agency-diagnostics";

test("agency diagnostics enrich signals with complete traces and state", () => {
  const result = applyStockAgencyDiagnostics({
    market: "ADX",
    summary: {
      updatedAt: "2026-01-02T00:00:00.000Z",
      productionEligible: true,
      maxPositionPct: 5,
      survivalScore: 76,
    },
    trades: [
      {
        symbol: "AAA",
        entryDate: "2026-01-01",
        exitDate: "2026-01-03",
        returnPct: 4.25,
        entryExposure: 2,
      },
      {
        symbol: "AAA",
        entryDate: "2025-12-01",
        exitDate: "2025-12-05",
        returnPct: -3,
        entryExposure: 2,
      },
      {
        symbol: "BBB",
        entryDate: "2026-01-02",
        exitDate: "2026-01-04",
        returnPct: -1.5,
        entryExposure: 1,
      },
      { returnPct: 7 },
    ],
    signals: [
      {
        symbol: "AAA",
        signalAction: "Buy",
        allocationAction: "Buy",
        suggestedExposure: 2,
        maxPositionPct: 4,
        setupQuality: 82,
        riskPressure: 22,
        signalConfidence: 84,
        expectedMove: 3.1,
        trendQuality: 78,
        timingQuality: 74,
        price: 10,
        explanation: "Accepted by the strategy.",
        sizingMode: "micro",
        sizingReasons: ["Sized by strategy quality."],
        opportunityDiscovery: {
          candidateScore: 72,
          lifecycle: "Sized",
          explanation: "Improving setup.",
        },
      },
      {
        symbol: "BBB",
        signalAction: "Sell",
        allocationAction: "Sell",
        suggestedExposure: 0,
        setupQuality: 55,
        riskPressure: 82,
        signalConfidence: 61,
        expectedMove: -1,
        rejectionReason: "Risk exit.",
      },
      {
        symbol: "CCC",
        signalAction: "Hold",
        allocationAction: "Hold",
        suggestedExposure: 0,
        setupQuality: 54,
        riskPressure: 40,
        expectedMove: 0,
      },
    ],
  });

  assert.equal(result.signals.length, 3);
  assert.equal(result.agencyDiagnostics.summary.traceCount, 3);
  assert.equal(result.agencyDiagnostics.state.traceCount, 3);
  assert.equal(result.agencyDiagnostics.summary.allowedActions, 2);
  assert.equal(result.agencyDiagnostics.summary.blockedActions, 1);
  assert.equal(result.agencyDiagnostics.summary.missingOutcomes, 1);

  const [buy, sell, hold] = result.signals;
  assert.equal(buy?.agencyTrace?.traceId, "agency-adx-aaa-1");
  assert.equal(buy?.agencyTrace?.timestamp, "2026-01-02T00:00:00.000Z");
  assert.equal(buy?.agency?.decisionKind, "increase_participation");
  assert.equal(buy?.agency?.allowed, true);
  assert.equal(buy?.agency?.actionKind, "request_exposure");
  assert.equal(buy?.agency?.outcomeLabel, "positive");
  assert.equal(buy?.agencyTrace?.outcome?.reward, 4.25);
  assert.equal(buy?.agencyTrace?.outcome?.durationMs, 172800000);
  assert.deepEqual(buy?.agencyTrace?.perception, {
    market: "ADX",
    symbol: "AAA",
    price: 10,
    setupQuality: 82,
    riskPressure: 22,
    opportunityScore: 72,
  });

  assert.equal(sell?.agency?.decisionKind, "reduce_participation");
  assert.equal(sell?.agency?.allowed, false);
  assert.equal(sell?.agency?.actionKind, null);
  assert.equal(sell?.agency?.outcomeLabel, "negative");
  assert.deepEqual(sell?.agency?.violations, ["blocked:risk_pressure_high"]);
  assert.equal(sell?.agencyTrace?.outcome?.loss, 1.5);

  assert.equal(hold?.agency?.decisionKind, "observe");
  assert.equal(hold?.agency?.outcomeLabel, "unknown");
  assert.equal(hold?.agencyTrace?.action, undefined);
  assert.equal(hold?.agencyTrace?.decision.confidence, 0.54);
});

test("agency diagnostics records readiness, approval, size, and missing-size blocks", () => {
  const result = applyStockAgencyDiagnostics({
    market: "NASDAQ",
    summary: {
      updatedAt: "not-a-date",
      productionEligible: false,
      promotionBlocked: true,
      strategyReadiness: {
        blocked: true,
        maxPositionPct: 1,
        maxConfidence: 66,
      },
      readinessLabel: "Blocked",
    },
    trades: [
      { ticker: "DDD", exitDate: "2026-01-01", returnPct: 1 },
      { ticker: "DDD", exitDate: "2026-01-05", returnPct: -2 },
    ],
    signals: [
      {
        ticker: "DDD",
        signalAction: "Buy",
        allocationAction: "Blocked",
        signalStatus: "blocked",
        suggestedExposure: 0,
        maxPositionPct: 0,
        signalConfidence: 40,
        riskPressure: 80,
        price: Number.NaN,
        observedAt: "also-invalid",
        signalDate: "2026-01-06",
        sizingReasons: [],
      },
      {
        symbol: "",
        signalAction: "Buy",
        suggestedExposure: 3,
      },
    ],
  });

  assert.equal(result.signals.length, 1);
  assert.equal(result.agencyDiagnostics.summary.traceCount, 1);

  const blocked = result.signals[0];
  assert.equal(blocked?.agencyTrace?.traceId, "agency-nasdaq-ddd-1");
  assert.equal(blocked?.agencyTrace?.timestamp, "2026-01-06T00:00:00.000Z");
  assert.equal(blocked?.agency?.decisionKind, "blocked_participation");
  assert.equal(blocked?.agency?.allowed, false);
  assert.equal(blocked?.agency?.requiresApproval, false);
  assert.equal(blocked?.agency?.outcomeLabel, "negative");
  assert.equal(blocked?.agencyTrace?.outcome?.durationMs, undefined);
  assert.equal(
    blocked?.agencyTrace?.sizing?.rationale,
    "Sizing translated from the current strategy decision.",
  );
  assert.deepEqual(blocked?.agency?.violations, [
    "confidence_below_minimum",
    "blocked:strategy_readiness_blocked",
    "blocked:risk_pressure_high",
    "blocked:missing_positive_size",
    "blocked:system_readiness_blocked",
  ]);
});

test("agency diagnostics handles approval requirements, neutral outcomes, and fallback ids", () => {
  const result = applyStockAgencyDiagnostics({
    market: "",
    summary: {
      promotionConfidence: 90,
      productionEligible: false,
    },
    trades: [
      {
        symbol: "X/Y",
        entryDate: "2026-01-05",
        exitDate: "2026-01-01",
        returnPct: 0,
      },
    ],
    signals: [
      {
        symbol: "X/Y",
        signalAction: "Buy",
        allocationAction: "Buy",
        suggestedExposure: 3,
        maxPositionPct: 2,
        price: null,
      },
    ],
  });

  const signal = result.signals[0];
  assert.equal(signal?.agencyTrace?.traceId, "agency-unknown-x-y-1");
  assert.equal(signal?.agencyTrace?.timestamp, "1970-01-01T00:00:00.000Z");
  assert.equal(signal?.agency?.requiresApproval, true);
  assert.equal(signal?.agency?.allowed, false);
  assert.deepEqual(signal?.agency?.violations, [
    "size_above_maximum",
    "human_approval_required",
  ]);
  assert.equal(signal?.agencyTrace?.policy.recommendedSize, 2);
  assert.equal(signal?.agencyTrace?.outcome?.success, null);
  assert.equal(signal?.agencyTrace?.outcome?.outcomeLabel, "unknown");
  assert.deepEqual(signal?.agencyTrace?.perception, {
    market: "",
    symbol: "X/Y",
    price: null,
    setupQuality: 0,
    riskPressure: 0,
    opportunityScore: 0,
  });
});

test("agency diagnostics permits limited-live participation when trust gates allow it", () => {
  const trustGovernor = {
    allowsNewExposure: true,
    requiresReview: true,
    maxExposure: 1.25,
    participationMode: "limited",
    blockers: [
      {
        id: "raw_calibrated_confidence_gap",
        label: "Raw/calibrated gap",
        severity: "medium",
        reason:
          "Raw confidence is materially higher than calibrated confidence.",
        unlockCriteria: ["Reduce the confidence gap."],
      },
    ],
  } as any;
  const result = applyStockAgencyDiagnostics({
    market: "LIMITED",
    summary: {
      updatedAt: "2026-01-02T00:00:00.000Z",
      productionEligible: false,
      promotionBlocked: false,
      readinessLabel: "Limited live",
      strategyReadiness: {
        blocked: false,
        maxPositionPct: 1.25,
        maxConfidence: 72,
      },
      trustGovernor,
    },
    signals: [
      {
        symbol: "LTD",
        signalAction: "Buy",
        allocationAction: "Buy",
        suggestedExposure: 1,
        maxPositionPct: 1.25,
        rawConfidence: 85,
        calibratedConfidence: 72,
        riskPressure: 18,
        trustGovernor,
      },
    ],
  });

  const signal = result.signals[0];
  assert.equal(signal?.agency?.requiresApproval, false);
  assert.equal(signal?.agency?.allowed, true);
  assert.equal(signal?.agencyTrace?.policy.maxSize, 1.25);
  assert.equal(
    signal?.agency?.violations.includes("human_approval_required"),
    false,
  );
});

test("agency diagnostics downgrades participation when Survival Memory says to wait", () => {
  const result = applyStockAgencyDiagnostics({
    market: "NASDAQ",
    summary: {
      updatedAt: "2026-01-02T00:00:00.000Z",
      productionEligible: true,
      maxPositionPct: 5,
    },
    signals: [
      {
        symbol: "SCAR",
        signalAction: "Buy",
        allocationAction: "Buy",
        suggestedExposure: 1,
        maxPositionPct: 5,
        signalConfidence: 88,
        rawConfidence: 88,
        calibratedConfidence: 82,
        riskPressure: 24,
        survivalMemory: {
          module: "stocks.survival-memory",
          name: "Survival Memory",
          status: "near_ruin",
          recommendation: "wait",
          recordCount: 6,
          matchedCount: 6,
          scarCount: 4,
          nearRuinCount: 2,
          averageSurvivalCost: 72,
          recoveryBurden: 66,
          survivalConfidence: 28,
          currentStateSimilarity: 82,
          exposureMultiplier: 0,
          confidencePenalty: 55,
          maxExposurePct: 0,
          stateFingerprint: "venue:nasdaq|action:buy",
          mainWarnings: ["Similar states include near-ruin survival patterns."],
          reasons: [
            "Wait because similar states had unacceptable survival cost.",
          ],
          missingEvidence: ["Survival memory clearance"],
          unlockConditions: [
            "Wait until similar states show survival cost below 35/100 and no near-ruin match.",
          ],
          invalidationConditions: [
            "Invalidate if liquidity or tail pressure remains elevated in the current state.",
          ],
          fragileMatches: [],
          records: [],
        },
      },
    ],
  });

  const signal = result.signals[0];
  assert.equal(signal?.agency?.allowed, false);
  assert.equal(signal?.agency?.requiresApproval, true);
  assert.equal(signal?.agencyTrace?.policy.maxSize, 0);
  assert.ok(
    signal?.agency?.violations.includes("blocked:survival_memory_wait"),
  );
  assert.equal(signal?.agency?.survivalRecommendation, "wait");
  assert.equal(signal?.agency?.calibratedConfidence, 28);
});

test("agency diagnostics records reduced-size Survival Memory constraints", () => {
  const result = applyStockAgencyDiagnostics({
    market: "NASDAQ",
    summary: {
      productionEligible: true,
      maxPositionPct: 5,
    },
    signals: [
      {
        symbol: "SCAR",
        signalAction: "Buy",
        allocationAction: "Buy",
        suggestedExposure: 1,
        maxPositionPct: 5,
        signalConfidence: 88,
        rawConfidence: 88,
        calibratedConfidence: 82,
        riskPressure: 24,
        survivalMemory: {
          module: "stocks.survival-memory",
          name: "Survival Memory",
          status: "scarred",
          recommendation: "act_with_reduced_size",
          recordCount: 5,
          matchedCount: 5,
          scarCount: 3,
          nearRuinCount: 0,
          averageSurvivalCost: 48,
          recoveryBurden: 32,
          survivalConfidence: 58,
          currentStateSimilarity: 62,
          exposureMultiplier: 0.4,
          confidencePenalty: 32,
          maxExposurePct: 1.2,
          stateFingerprint: "venue:nasdaq|action:buy",
          mainWarnings: [
            "Similar states were profitable but carried unacceptable drawdown or stress.",
          ],
          reasons: [
            "Cap exposure to 40% of the normal limit before opportunity sizing expands it.",
          ],
          missingEvidence: ["Reduced-size survival review"],
          unlockConditions: [
            "Raise survival confidence above 70/100 before normal sizing is restored.",
          ],
          invalidationConditions: [
            "Invalidate if similar states repeat max adverse excursion above the survival boundary.",
          ],
          fragileMatches: [],
          records: [],
        },
      },
    ],
  });

  const signal = result.signals[0];
  assert.equal(signal?.agency?.allowed, true);
  assert.equal(signal?.agencyTrace?.policy.maxSize, 1.2);
  assert.equal(
    signal?.agency?.violations.includes("blocked:survival_memory_reduced_size"),
    false,
  );
  assert.equal(signal?.agency?.survivalRecommendation, "act_with_reduced_size");
  assert.deepEqual(signal?.agency?.survivalWarnings, [
    "Similar states were profitable but carried unacceptable drawdown or stress.",
  ]);
});

test("agency diagnostics credits only clean reduced-size outcome traces", () => {
  const survivalMemory = {
    module: "stocks.survival-memory",
    name: "Survival Memory",
    status: "scarred",
    recommendation: "act_with_reduced_size",
    recordCount: 8,
    matchedCount: 8,
    scarCount: 4,
    nearRuinCount: 0,
    averageSurvivalCost: 29,
    recoveryBurden: 10,
    survivalConfidence: 68,
    currentStateSimilarity: 50,
    exposureMultiplier: 0.45,
    confidencePenalty: 18,
    maxExposurePct: 1.2,
    stateFingerprint: "venue:binance|action:buy",
    mainWarnings: [
      "Similar states were profitable but carried unacceptable drawdown or stress.",
    ],
    reasons: ["Act with reduced size while recovery evidence matures."],
    missingEvidence: ["Reduced-size survival review"],
    unlockConditions: [
      "Raise survival confidence above 70/100 before normal sizing is restored.",
    ],
    invalidationConditions: [
      "Invalidate if similar states repeat max adverse excursion above the survival boundary.",
    ],
    fragileMatches: [],
    records: [],
  } as any;
  const baseSignal = {
    symbol: "SCAR",
    signalAction: "Buy" as const,
    allocationAction: "Buy",
    suggestedExposure: 1,
    maxPositionPct: 5,
    signalConfidence: 88,
    rawConfidence: 88,
    calibratedConfidence: 82,
    trustworthiness: 84,
    riskPressure: 24,
    survivalMemory,
  };

  const clean = applyStockAgencyDiagnostics({
    market: "BINANCE",
    summary: { productionEligible: true, maxPositionPct: 5 },
    trades: [
      {
        symbol: "SCAR",
        entryDate: "2026-01-01",
        exitDate: "2026-01-05",
        returnPct: 2.4,
      },
    ],
    signals: [baseSignal],
  });
  const failed = applyStockAgencyDiagnostics({
    market: "BINANCE",
    summary: { productionEligible: true, maxPositionPct: 5 },
    trades: [
      {
        symbol: "SCAR",
        entryDate: "2026-01-01",
        exitDate: "2026-01-05",
        returnPct: -2.4,
      },
    ],
    signals: [baseSignal],
  });
  const nonRequestAction = applyStockAgencyDiagnostics({
    market: "BINANCE",
    summary: { productionEligible: true, maxPositionPct: 5 },
    trades: [
      {
        symbol: "SCAR",
        entryDate: "2026-01-01",
        exitDate: "2026-01-05",
        returnPct: 2.4,
      },
    ],
    signals: [
      {
        ...baseSignal,
        signalAction: "Sell",
        allocationAction: "Sell",
        suggestedExposure: 0,
        expectedMove: -1,
      },
    ],
  });

  const cleanAudit = clean.signals[0]?.agency;
  const failedAudit = failed.signals[0]?.agency;
  const nonRequestAudit = nonRequestAction.signals[0]?.agency;
  assert.ok((cleanAudit?.trustAdjustment ?? 0) > 0);
  assert.ok(
    (cleanAudit?.trust ?? 0) >
      (clean.signals[0]?.agencyTrace?.selfDiagnosis.trust ?? 1),
  );
  assert.ok(
    cleanAudit?.reasons.some((reason) =>
      reason.includes("Clean reduced-size outcome evidence"),
    ),
  );
  assert.ok((clean.agencyDiagnostics.summary.trustAdjustment ?? 0) > 0);
  assert.ok((nonRequestAudit?.trustAdjustment ?? 0) > 0);
  assert.ok(
    (nonRequestAudit?.trustAdjustment ?? 0) <
      (cleanAudit?.trustAdjustment ?? 0),
  );
  assert.equal(failedAudit?.trustAdjustment, undefined);
  assert.equal(failed.agencyDiagnostics.summary.trustAdjustment, undefined);
});

test("agency diagnostics keeps positive participation review-gated when readiness is blocked", () => {
  const result = applyStockAgencyDiagnostics({
    market: "BLOCKED",
    summary: {
      productionEligible: false,
      promotionBlocked: true,
      readinessLabel: "Blocked",
      strategyReadiness: {
        blocked: true,
        maxPositionPct: 2,
        maxConfidence: 70,
      },
      trustGovernor: {
        allowsNewExposure: true,
        requiresReview: false,
        maxExposure: 1,
      } as any,
    },
    signals: [
      {
        symbol: "BLKD",
        signalAction: "Buy",
        allocationAction: "Buy",
        suggestedExposure: 1,
        signalConfidence: 75,
        riskPressure: 20,
      },
    ],
  });

  const signal = result.signals[0];
  assert.equal(signal?.agency?.requiresApproval, true);
  assert.equal(signal?.agency?.allowed, false);
  assert.ok(signal?.agency?.violations.includes("human_approval_required"));
  assert.ok(
    signal?.agency?.violations.includes("blocked:system_readiness_blocked"),
  );
});

test("agency diagnostics carries Belief metadata and blocks unresolved belief", () => {
  const belief = {
    verdict: "weak",
    confidence: 62,
    trustworthiness: 70,
    evidenceStrength: 64,
    evidenceAgreement: 72,
    fragility: 40,
    blockers: [],
    warnings: ["Evidence needs review."],
    reason: "Belief weak: evidence needs review.",
  };
  const result = applyStockAgencyDiagnostics({
    market: "ADX",
    summary: {
      updatedAt: "2026-01-01T00:00:00.000Z",
      productionEligible: true,
    },
    signals: [
      {
        symbol: "AAA",
        signalAction: "Hold",
        allocationAction: "Watch",
        suggestedExposure: 0,
        signalConfidence: 80,
        belief,
      },
    ],
  });

  const signal = result.signals[0];
  assert.equal(signal?.agencyTrace?.decision.confidence, 0.62);
  assert.deepEqual(
    (signal?.agencyTrace?.decision.metadata as any).belief,
    belief,
  );
  assert.deepEqual(signal?.agency?.violations, ["blocked:belief_weak"]);
  assert.equal(signal?.agency?.allowed, false);
});

test("agency diagnostics carries Judgement metadata and gates review or blocked actions", () => {
  const reviewJudgement = {
    status: "review_required" as const,
    rawConfidence: 80,
    adjustedConfidence: 42,
    trust: 48,
    calibration: 50,
    reliability: 45,
    overfitRisk: 70,
    outcomeStability: 40,
    similarSampleSize: 6,
    confidenceDelta: -38,
    reasons: ["Judgement requires review."],
    warnings: ["human review required"],
    evidence: {
      similarStates: 6,
      positiveOutcomes: 3,
      negativeOutcomes: 3,
      neutralOutcomes: 0,
    },
  };
  const blockedJudgement = {
    ...reviewJudgement,
    status: "blocked" as const,
    adjustedConfidence: 0,
    trust: 20,
    warnings: ["judgement blocked action"],
  };
  const result = applyStockAgencyDiagnostics({
    market: "JDG",
    summary: {
      productionEligible: true,
      maxPositionPct: 5,
    },
    signals: [
      {
        symbol: "REV",
        signalAction: "Buy",
        allocationAction: "Buy",
        suggestedExposure: 2,
        judgement: reviewJudgement,
      },
      {
        symbol: "BLK",
        signalAction: "Buy",
        allocationAction: "Buy",
        suggestedExposure: 2,
        judgement: blockedJudgement,
      },
    ],
  });

  const review = result.signals[0];
  const blocked = result.signals[1];
  assert.equal(review?.agencyTrace?.decision.confidence, 0.42);
  assert.deepEqual(
    (review?.agencyTrace?.decision.metadata as any).judgement,
    reviewJudgement,
  );
  assert.equal(review?.agencyTrace?.policy.maxSize, 0);
  assert.equal(review?.agency?.requiresApproval, true);
  assert.ok(
    review?.agency?.violations.includes("blocked:judgement_review_required"),
  );
  assert.equal(blocked?.agencyTrace?.policy.maxSize, 0);
  assert.ok(blocked?.agency?.violations.includes("blocked:judgement_blocked"));
});

test("agency diagnostics carries Signal Trust Governor metadata and blocks gated participation", () => {
  const trustGovernor = {
    module: "signal.trust-governor" as const,
    name: "Signal Trust Governor" as const,
    trustScore: 66,
    confidenceCap: 66,
    participationMode: "exits_only" as const,
    maxExposure: 0,
    allowsNewExposure: false,
    requiresReview: true,
    allowedActions: ["observe" as const, "risk_reducing_exits" as const],
    blockedActions: [
      "paper_trade" as const,
      "new_exposure" as const,
      "increase_position" as const,
    ],
    primaryBlocker: "calibration_unstable_outcomes",
    blockers: [
      {
        id: "calibration_unstable_outcomes",
        label: "Calibration unstable outcomes",
        severity: "high" as const,
        reason: "Calibration has samples, but similar outcomes are unstable.",
        unlockCriteria: ["Observe more closed outcomes in similar states."],
      },
    ],
    unlockCriteria: ["Observe more closed outcomes in similar states."],
    contradictions: [
      "Judgement finds similar history usable, but calibration still requires review.",
    ],
    reasons: ["Signal Trust Governor selected exits only mode."],
    audit: {
      componentScores: {},
      weights: {},
      rawMaxExposure: 5,
      requestedExposure: 2,
      formulas: [],
    },
  };
  const result = applyStockAgencyDiagnostics({
    market: "TRUST",
    summary: {
      productionEligible: true,
      maxPositionPct: 5,
    },
    signals: [
      {
        symbol: "TST",
        signalAction: "Buy",
        allocationAction: "Buy",
        suggestedExposure: 2,
        maxPositionPct: 5,
        rawConfidence: 85,
        calibratedConfidence: 66,
        trustGovernor,
      },
    ],
  });

  const signal = result.signals[0];
  assert.equal(signal?.agencyTrace?.policy.maxSize, 0);
  assert.equal(signal?.agencyTrace?.decision.confidence, 0.66);
  assert.deepEqual(
    (signal?.agencyTrace?.decision.metadata as any).trustGovernor,
    trustGovernor,
  );
  assert.ok(
    signal?.agency?.violations.includes(
      "blocked:trust_calibration_unstable_outcomes",
    ),
  );
  assert.equal(signal?.agency?.allowed, false);
  assert.equal(signal?.agency?.requiresApproval, true);
});

test("agency diagnostics handles trust fallback blockers and trust cap sources", () => {
  const summaryTrustGovernor = {
    requiresReview: true,
    maxExposure: 2,
  } as any;
  const result = applyStockAgencyDiagnostics({
    market: "TRUSTCAP",
    summary: {
      productionEligible: true,
      trustGovernor: summaryTrustGovernor,
    },
    signals: [
      {
        symbol: "PAPER",
        signalAction: "Buy",
        allocationAction: "Buy",
        suggestedExposure: 1,
        signalConfidence: 70,
        trustGovernor: {
          allowsNewExposure: false,
          requiresReview: false,
          participationMode: "paper",
          maxExposure: 0,
        } as any,
      },
      {
        symbol: "SIGCAP",
        signalAction: "Buy",
        allocationAction: "Buy",
        suggestedExposure: 3,
        signalConfidence: 70,
        trustGovernor: {
          allowsNewExposure: true,
          requiresReview: false,
          participationMode: "limited",
          maxExposure: 1,
        } as any,
      },
      {
        symbol: "SUMCAP",
        signalAction: "Buy",
        allocationAction: "Buy",
        suggestedExposure: 1,
        signalConfidence: 70,
      },
    ],
  });

  const [paper, signalCap, summaryCap] = result.signals;

  assert.ok(paper?.agency?.violations.includes("blocked:trust_paper"));
  assert.equal(signalCap?.agencyTrace?.policy.maxSize, 1);
  assert.equal(summaryCap?.agencyTrace?.policy.maxSize, 2);
  assert.equal(summaryCap?.agency?.requiresApproval, true);
});

test("agency diagnostics handles empty inputs and fallback sizing and confidence paths", () => {
  const empty = applyStockAgencyDiagnostics({
    market: "EMPTY",
    signals: [{ symbol: "" }],
  });

  assert.equal(empty.signals.length, 0);
  assert.equal(empty.agencyDiagnostics.summary.traceCount, 0);
  assert.equal(empty.agencyDiagnostics.summary.averageTrust, 0);
  assert.deepEqual(empty.agencyDiagnostics.signalAudits, []);

  const strategyCap = applyStockAgencyDiagnostics({
    market: "CAP",
    summary: {
      productionEligible: true,
      strategyReadiness: {
        maxPositionPct: 4,
        maxConfidence: 63,
      },
    },
    signals: [
      {
        symbol: "CAP",
        signalAction: "Buy",
        allocationAction: "Buy",
        suggestedExposure: 3,
      },
    ],
  });
  assert.equal(strategyCap.signals[0]?.agencyTrace?.policy.maxSize, 4);
  assert.equal(strategyCap.signals[0]?.agencyTrace?.decision.confidence, 0.63);

  const survivalFallback = applyStockAgencyDiagnostics({
    market: "SURVIVAL",
    summary: {
      productionEligible: true,
      survivalScore: 71,
    },
    signals: [
      {
        symbol: "SURV",
        signalAction: "Hold",
        allocationAction: "Hold",
      },
    ],
  });
  assert.equal(
    survivalFallback.signals[0]?.agencyTrace?.decision.confidence,
    0.71,
  );

  const defaultFallback = applyStockAgencyDiagnostics({
    market: "DEFAULT",
    summary: {
      productionEligible: true,
    },
    signals: [
      {
        symbol: "DEF",
      },
    ],
  });
  assert.equal(
    defaultFallback.signals[0]?.agencyTrace?.decision.confidence,
    0.5,
  );
  assert.deepEqual(defaultFallback.signals[0]?.agencyTrace?.decision.metadata, {
    symbol: "DEF",
    signalAction: "Hold",
    allocationAction: "Hold",
    sizingMode: "none",
    rawConfidence: 50,
    calibratedConfidence: 50,
    trustworthiness: 50,
    calibrationWarnings: [],
  });

  const malformedCalibrationWarnings = applyStockAgencyDiagnostics({
    market: "CAL",
    signals: [
      {
        symbol: "CAL",
        signalAction: "Hold",
        allocationAction: "Hold",
        rawConfidence: 80,
        calibratedConfidence: 40,
        calibrationWarnings: "not-an-array" as any,
      },
    ],
  });
  assert.deepEqual(
    malformedCalibrationWarnings.signals[0]?.agency?.calibrationWarnings,
    [],
  );

  const missingExitFallback = applyStockAgencyDiagnostics({
    market: "NOEXIT",
    summary: {
      productionEligible: true,
    },
    trades: [
      { symbol: "NOEND", entryDate: "2026-01-01", returnPct: 2 },
      { symbol: "NOEND", entryDate: "2026-01-02", returnPct: 3 },
    ],
    signals: [
      {
        symbol: "NOEND",
        signalAction: "Hold",
        allocationAction: "Hold",
      },
    ],
  });
  assert.equal(
    missingExitFallback.signals[0]?.agencyTrace?.outcome?.durationMs,
    undefined,
  );
});
