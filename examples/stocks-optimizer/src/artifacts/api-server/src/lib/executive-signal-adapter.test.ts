import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStockExecutiveArchitecture } from "./executive-signal-adapter";

function readiness(overrides: Record<string, any> = {}) {
  return {
    stage: "Limited live",
    blocked: false,
    productionEligible: false,
    readinessScore: 72,
    maxConfidence: 82,
    rawConfidence: 80,
    calibratedConfidence: 76,
    trustworthiness: 74,
    maxPositionPct: 10,
    failureFlags: [],
    calibration: {
      status: "trusted",
      calibratedConfidence: 76,
      trustworthiness: 74,
      warnings: [],
    },
    components: {
      dataReliability: { score: 82, passed: true },
      liveSignalConsistency: { score: 70, passed: true },
      walkForwardRobustness: { score: 72, passed: true },
      parameterRobustness: { score: 71, passed: true },
    },
    benchmarks: {
      excessReturnAfterCostsPct: 7,
      strategyReturnPct: 12,
    },
    concentration: {
      top1TradeContributionPct: 18,
      top5TradeContributionPct: 42,
      bestPeriodContributionPct: 20,
      outlierDependent: false,
    },
    ...overrides,
  };
}

function signalInput(overrides: Record<string, any> = {}) {
  return {
    readiness: readiness(),
    symbol: "AAPL",
    market: "US",
    rawAction: "Buy",
    expectedEdgePct: 5,
    rawSuggestedExposurePct: 6,
    setupQuality: 78,
    riskPressure: 34,
    volatilityPct: 3,
    liquidityScore: 84,
    signalConfidence: 80,
    opportunityCandidates: [{
      symbol: "AAPL",
      candidateScore: 78,
      confidence: 76,
      maturity: 64,
      novelty: 58,
      expectedMove: 5,
      lifecycle: { status: "emerging" },
      discovery: { confidence: 76, maturity: 64, novelty: 58 },
    }],
    ...overrides,
  };
}

function decision(overrides: Record<string, any> = {}) {
  return {
    signalAction: "Buy",
    allocationAction: "Buy",
    signalStatus: "confirmed",
    suggestedExposure: 4,
    maxPositionPct: 10,
    signalConfidence: 76,
    rawConfidence: 80,
    calibratedConfidence: 74,
    trustworthiness: 74,
    calibrationWarnings: [],
    judgement: {
      status: "trusted",
      adjustedConfidence: 74,
      reliability: 76,
      reasons: ["Similar trades worked."],
      warnings: [],
    },
    belief: {
      verdict: "justified",
      confidence: 76,
      trustworthiness: 74,
      reason: "Evidence supports action.",
    },
    rejectionReason: null,
    sizingMode: "micro",
    sizingReasons: ["Recovery cap keeps the position reduced."],
    sizingConstraints: [],
    sizingResult: {
      decision: "allowed",
      mode: "micro",
      size: 4,
      normalizedSize: 4,
      reasons: ["Allowed."],
    },
    trustGovernor: {
      trustScore: 74,
      confidenceCap: 74,
      participationMode: "limited",
      maxExposure: 4,
      allowsNewExposure: true,
      requiresReview: false,
      allowedActions: ["new_exposure"],
      blockedActions: [],
      blockers: [],
      unlockCriteria: [],
      reasons: ["Limited live participation."],
    },
    recovery: {
      recommendedExposureCap: 4,
      reasons: ["Reduced size."],
    },
    survivalMemory: {
      status: "watch",
      recommendation: "act_with_reduced_size",
      maxExposurePct: 4,
      survivalConfidence: 72,
      scarCount: 1,
      nearRuinCount: 0,
      currentStateSimilarity: 60,
      reasons: ["Survival memory caps size."],
    },
    ...overrides,
  };
}

describe("stock executive signal adapter", () => {
  it("maps market signal data into generic Executive modules", () => {
    const architecture = buildStockExecutiveArchitecture({
      signalInput: signalInput() as any,
      decision: decision() as any,
    });

    assert.equal(architecture.executionQuality.status === "good" || architecture.executionQuality.status === "excellent", true);
    assert.equal(architecture.executiveDecision.decision, "buy");
    assert.equal(architecture.executiveDecision.participationMode, "limited");
    assert.equal(architecture.discoveryAccountability.accountabilityScore > 0, true);
    assert.equal(architecture.counterfactual.scenarios.length >= 4, true);
    assert.equal(architecture.wisdom.wisdomScore > 0, true);
    assert.equal(architecture.executiveDecision.audit.sourceModules.includes("wisdom"), true);
    assert.equal(architecture.decisionStates.trust.status, "trusted");
    assert.equal(architecture.decisionStates.permission.allowed, true);
    assert.equal(architecture.decisionStates.capacity.mode, "reduced");
  });

  it("keeps blocked permission distinct from high trust and high confidence", () => {
    const architecture = buildStockExecutiveArchitecture({
      signalInput: signalInput({
        riskPressure: 80,
        liquidityScore: 10,
      }) as any,
      decision: decision({
        signalAction: "Hold",
        allocationAction: "Blocked",
        signalStatus: "blocked",
        suggestedExposure: 0,
        signalConfidence: 90,
        trustworthiness: 88,
        rejectionReason: "Risk checks did not pass",
        trustGovernor: {
          trustScore: 88,
          confidenceCap: 88,
          participationMode: "blocked",
          maxExposure: 0,
          allowsNewExposure: false,
          requiresReview: true,
          allowedActions: [],
          blockedActions: ["new_exposure"],
          blockers: [{ label: "Risk lock", severity: "high", reason: "Risk checks did not pass" }],
          unlockCriteria: ["Lower risk pressure."],
          reasons: ["Risk lock."],
        },
      }) as any,
    });

    assert.equal(architecture.decisionStates.trust.status, "highly_trusted");
    assert.equal(architecture.decisionStates.permission.level, "blocked");
    assert.equal(architecture.decisionStates.capacity.maxExposure, 0);
    assert.equal(architecture.executiveDecision.decision, "avoid");
    assert.equal(architecture.wisdom.counterfactuals.avoidedLoss >= 0, true);
  });
});
