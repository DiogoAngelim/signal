import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyStockResolveDiagnostics,
  mapStockSignalToResolveInput,
  recognitionClearsDiscoveryReview,
  type StockResolveSignal,
} from "./resolve-adapter";

describe("stocks Resolve adapter", () => {
  it("maps app diagnostics into generic Resolve inputs at the boundary", () => {
    const input = mapStockSignalToResolveInput({
      signal: stockSignal(),
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
      opportunityDensity: 46,
    });

    assert.equal(input.actionName, "Buy AAA");
    assert.equal(input.agencyRecommendation, "act");
    assert.equal(input.agencyTrust, 86);
    assert.equal(input.trustScore, 85);
    assert.equal(input.calibratedConfidence, 78);
    assert.equal(input.rawConfidence, 86);
    assert.equal(input.judgementReliability, 88);
    assert.equal(input.outcomeStability, 82);
    assert.equal(input.overfitRisk, 20);
    assert.equal(input.riskScore, 20);
    assert.equal(input.dataReliability, 96);
    assert.equal(input.beliefConfidence, 82);
    assert.equal(input.beliefFragility, 18);
    assert.equal(input.sizingMode, "micro");
    assert.equal(input.suggestedExposure, 2);
    assert.equal(input.maxTrustedExposure, 3);
    assert.equal(input.similarSamples, 24);
    assert.equal(input.positiveOutcomes, 20);
    assert.equal(input.negativeOutcomes, 4);
    assert.ok((input.evidence?.missingEvidence as string[]).includes("Broader opportunity density across independent candidates"));
    assert.ok((input.evidence?.unlockConditions as string[]).includes("Increase opportunity density above the app review threshold."));
  });

  it("falls back through summary, readiness, and alternate reliability sources", () => {
    const summaryFallback = mapStockSignalToResolveInput({
      signal: stockSignal({
        rawConfidence: undefined,
        calibratedConfidence: undefined,
        trustGovernor: undefined,
        maxPositionPct: 4,
      }),
      summary: stockSummary({
        trustGovernor: undefined,
        trustedMaxExposurePct: undefined,
        rawConfidence: 80,
        calibratedConfidence: 72,
      }),
      agencyDiagnostics: agencyDiagnostics("act", 86),
    });
    const readinessFallback = mapStockSignalToResolveInput({
      signal: stockSignal({
        rawConfidence: undefined,
        calibratedConfidence: undefined,
        trustGovernor: undefined,
        maxPositionPct: undefined,
        judgement: judgement({ overfitRisk: undefined }),
      }),
      summary: stockSummary({
        trustGovernor: undefined,
        trustedMaxExposurePct: undefined,
        rawConfidence: undefined,
        calibratedConfidence: undefined,
        strategyReadiness: readiness({
          rawConfidence: 70,
          calibratedConfidence: 65,
          maxPositionPct: 1.5,
          components: {},
        }),
        robustnessDiagnostics: { overfitRiskPct: 31 },
        dataReliability: { score: 88 },
      }),
      agencyDiagnostics: agencyDiagnostics("act", 86),
    });
    const coverageFallback = mapStockSignalToResolveInput({
      signal: stockSignal(),
      summary: stockSummary({
        strategyReadiness: readiness({ components: {} }),
        dataReliability: undefined,
        dataQualityReport: { coveragePct: 77 },
      }),
      agencyDiagnostics: agencyDiagnostics("act", 86),
    });

    assert.equal(summaryFallback.rawConfidence, 80);
    assert.equal(summaryFallback.calibratedConfidence, 72);
    assert.equal(summaryFallback.maxTrustedExposure, 4);
    assert.equal(readinessFallback.rawConfidence, 70);
    assert.equal(readinessFallback.calibratedConfidence, 65);
    assert.equal(readinessFallback.maxTrustedExposure, 1.5);
    assert.equal(readinessFallback.overfitRisk, 31);
    assert.equal(readinessFallback.dataReliability, 88);
    assert.equal(coverageFallback.dataReliability, 77);
  });

  it("falls back from signal audit to agency summary and then wait recommendation", () => {
    const agencyFallback = mapStockSignalToResolveInput({
      signal: stockSignal({ agency: undefined }),
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("requires_human_review", 62),
    });
    const defaultFallback = mapStockSignalToResolveInput({
      signal: stockSignal({ agency: undefined }),
      summary: stockSummary(),
      agencyDiagnostics: null,
    });

    assert.equal(agencyFallback.agencyRecommendation, "requires_human_review");
    assert.equal(agencyFallback.agencyTrust, 62);
    assert.equal(defaultFallback.agencyRecommendation, "wait");
  });

  it("keeps sparse signals deterministic without app-specific trading defaults", () => {
    const tickerOnly = mapStockSignalToResolveInput({
      signal: { ticker: "SPARSE", signalAction: "Buy" } as StockResolveSignal,
    });
    const nameless = mapStockSignalToResolveInput({
      signal: {} as StockResolveSignal,
    });

    assert.equal(tickerOnly.actionName, "Buy SPARSE");
    assert.equal(tickerOnly.suggestedExposure, undefined);
    assert.equal(tickerOnly.evidence?.humanReviewRequired, false);
    assert.equal(nameless.actionName, "Review selected instrument");
    assert.equal(nameless.agencyRecommendation, "wait");
  });

  it("uses alternate opportunity density fields before resolving signals", () => {
    const futureDensity = applyStockResolveDiagnostics({
      market: "BINANCE",
      signals: [stockSignal()],
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
      opportunityDiscovery: { density: { futureDensity: 45 } },
    });
    const confidenceDensity = applyStockResolveDiagnostics({
      market: "BINANCE",
      signals: [stockSignal()],
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
      opportunityDiscovery: { density: { confidence: 44 } },
    });

    assert.ok(futureDensity.signals[0]?.resolve.missingEvidence.includes("Broader opportunity density across independent candidates"));
    assert.ok(confidenceDensity.signals[0]?.resolve.missingEvidence.includes("Broader opportunity density across independent candidates"));
  });

  it("enriches Resolve missing evidence and invalidation conditions from generic Discovery", () => {
    const result = applyStockResolveDiagnostics({
      market: "BINANCE",
      signals: [stockSignal()],
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
      opportunityDiscovery: {
        density: { density: 82 },
        discovery: {
          status: "emerging",
          opportunities: [],
          confidence: 42,
          trust: 50,
          fragility: 64,
          novelty: 35,
          maturity: 40,
          contextMatch: [],
          memory: {
            sampleSize: 1,
            similarOutcomes: 1,
            positiveOutcomes: 0,
            negativeOutcomes: 1,
            neutralOutcomes: 0,
            successRatio: 0,
            failureRatio: 100,
            neutralRatio: 0,
            reliability: 55,
            recurringSuccessPatterns: [],
            recurringFailurePatterns: ["Failed persistence"],
            mostPredictiveEvidence: [],
            mostMisleadingEvidence: ["Early spike"],
          },
          foresight: {
            counterfactuals: [],
            invalidationConditions: ["Discovery invalidates if support fails."],
            unlockConditions: ["Collect independent confirmation."],
            fragilityDrivers: [],
            safetyDrivers: [],
          },
          explanation: {
            summary: "Discovery is emerging.",
            supportingEvidence: [],
            contradictoryEvidence: [],
            confidenceAttribution: [],
            confidencePenalties: [],
            missingEvidence: ["independent confirmation"],
          },
          lifecycle: {
            status: "emerging",
            transitionReason: "Evidence is improving but incomplete.",
            maturity: 40,
            persistence: 50,
            velocity: 60,
            decayRisk: 64,
            readiness: 48,
            stageScores: {
              none: 0,
              detected: 20,
              emerging: 40,
              strengthening: 35,
              eligible: 30,
              sized: 20,
              active: 15,
              closed: 0,
            },
          },
          missingEvidence: ["independent confirmation"],
          invalidationConditions: ["Discovery invalidates if support fails."],
          recommendedNextStep: "Resolve missing evidence: independent confirmation.",
          traces: [],
          metadata: { module: "discovery", version: "v1", createdAt: "1970-01-01T00:00:00.000Z" },
        },
      },
    });

    const resolve = result.signals[0]?.resolve;
    assert.ok(resolve?.missingEvidence.includes("independent confirmation"));
    assert.ok(resolve?.missingEvidence.includes("Discovery confidence above the app review threshold"));
    assert.ok(resolve?.unlockConditions.includes("Collect independent confirmation."));
    assert.ok(resolve?.invalidationConditions.includes("Discovery invalidates if support fails."));
  });

  it("lets strong Recognition evidence clear the Discovery confidence review item", () => {
    const recognized = strongRecognition();
    const archetypeOnlyRecognition = {
      ...recognized,
      matchedSamples: 0,
      archetypeConfidence: 91,
    };
    const result = applyStockResolveDiagnostics({
      market: "BINANCE",
      signals: [stockSignal({ recognition: recognized })],
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
      opportunityDiscovery: {
        density: { density: 82 },
        discovery: lowConfidenceDiscovery(),
      },
    });
    const input = mapStockSignalToResolveInput({
      signal: stockSignal({ recognition: recognized }),
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
      opportunityDensity: 82,
      discovery: lowConfidenceDiscovery() as any,
    });
    const summaryFallback = mapStockSignalToResolveInput({
      signal: stockSignal(),
      summary: stockSummary({
        recognitionDiagnostics: { primary: archetypeOnlyRecognition },
      }),
      agencyDiagnostics: agencyDiagnostics("act", 86),
      opportunityDensity: 82,
      discovery: lowConfidenceDiscovery() as any,
    });

    assert.equal(recognitionClearsDiscoveryReview(recognized), true);
    assert.equal(recognitionClearsDiscoveryReview(archetypeOnlyRecognition), true);
    assert.equal(result.signals[0]?.resolve.missingEvidence.includes("Discovery confidence above the app review threshold"), false);
    assert.equal((input.evidence?.missingEvidence as string[]).includes("Discovery confidence above the app review threshold"), false);
    assert.equal((summaryFallback.evidence?.missingEvidence as string[]).includes("Discovery confidence above the app review threshold"), false);
    assert.equal(summaryFallback.evidence?.recognition, archetypeOnlyRecognition);
    assert.ok((input.evidence?.unlockConditions as string[]).includes("Recognition recurrence evidence clears the Discovery confidence review item."));
  });

  it("preserves the Discovery confidence review item when Recognition is absent or insufficient", () => {
    const absent = mapStockSignalToResolveInput({
      signal: stockSignal(),
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
      discovery: lowConfidenceDiscovery() as any,
    });
    const insufficient = mapStockSignalToResolveInput({
      signal: stockSignal({
        recognition: {
          ...strongRecognition(),
          verdict: "insufficient_evidence",
          recurrenceConfidence: 42,
          recognitionScore: 44,
          matchedSamples: 0,
          outcomeStability: 0,
        },
      }),
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
      discovery: lowConfidenceDiscovery() as any,
    });

    assert.equal(recognitionClearsDiscoveryReview(null), false);
    assert.equal(recognitionClearsDiscoveryReview(insufficient.evidence?.recognition as any), false);
    assert.ok((absent.evidence?.missingEvidence as string[]).includes("Discovery confidence above the app review threshold"));
    assert.ok((insufficient.evidence?.missingEvidence as string[]).includes("Discovery confidence above the app review threshold"));
  });

  it("summarizes empty, rejected, invalidated, and waiting resolve decisions", () => {
    const empty = applyStockResolveDiagnostics({
      market: "BINANCE",
      signals: [],
      summary: stockSummary(),
    });
    const mixed = applyStockResolveDiagnostics({
      market: "BINANCE",
      signals: [
        stockSignal({
          symbol: "REJECT",
          ticker: "REJECT",
          agency: agencyAudit({ recommendation: "denied", allowed: false }),
        }),
        stockSignal({
          symbol: "INVALID",
          ticker: "INVALID",
          judgement: judgement({
            outcomeStability: 30,
            similarSampleSize: 10,
            evidence: {
              similarStates: 10,
              positiveOutcomes: 1,
              negativeOutcomes: 9,
              neutralOutcomes: 0,
            },
          }),
        }),
        stockSignal({
          symbol: "WAIT",
          ticker: "WAIT",
          agency: agencyAudit({ recommendation: "wait", allowed: true }),
        }),
        stockSignal({
          symbol: "ESCALATE",
          ticker: "ESCALATE",
          agency: agencyAudit({
            recommendation: "requires_human_review",
            allowed: false,
            requiresApproval: true,
            trust: 66,
          }),
        }),
      ],
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("wait", 86),
      opportunityDiscovery: { density: { density: 82 } },
    });

    assert.equal(empty.resolveDiagnostics.primary, null);
    assert.equal(mixed.resolveDiagnostics.decisionCounts.reject, 1);
    assert.equal(mixed.resolveDiagnostics.decisionCounts.invalidate, 1);
    assert.equal(mixed.resolveDiagnostics.decisionCounts.wait, 1);
    assert.equal(mixed.resolveDiagnostics.decisionCounts.escalate, 1);
    assert.equal(mixed.resolveDiagnostics.primary?.decision, "escalate");
  });

  it("escalates trusted judgement when Agency still blocks the action", () => {
    const result = applyStockResolveDiagnostics({
      market: "BINANCE",
      signals: [
        stockSignal({
          allocationAction: "Blocked",
          suggestedExposure: 0,
          sizingMode: "none",
          agency: agencyAudit({
            allowed: false,
            requiresApproval: true,
            recommendation: "requires_human_review",
            trust: 69,
          }),
        }),
      ],
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("requires_human_review", 69),
      opportunityDiscovery: { density: { density: 46 } },
    });

    const resolve = result.signals[0]?.resolve;
    assert.equal(resolve?.decision, "escalate");
    assert.equal(resolve?.humanReviewRequired, true);
    assert.ok(resolve?.missingEvidence.includes("Agency approval for this action"));
    assert.ok(resolve?.missingEvidence.includes("Unblocked agency action"));
    assert.equal(result.resolveDiagnostics.primary?.decision, "escalate");
  });

  it("commits only when trusted judgement and Agency are both open", () => {
    const result = applyStockResolveDiagnostics({
      market: "BINANCE",
      signals: [stockSignal()],
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
      opportunityDiscovery: { density: { density: 82 } },
    });

    assert.equal(result.signals[0]?.resolve.decision, "commit");
    assert.equal(result.signals[0]?.resolve.commitmentLevel, "limited");
    assert.equal(result.resolveDiagnostics.decisionCounts.commit, 1);
  });

  it("waits when Survival Memory shows near-ruin similar states", () => {
    const result = applyStockResolveDiagnostics({
      market: "BINANCE",
      signals: [stockSignal({
        survivalMemory: {
          module: "stocks.survival-memory",
          name: "Survival Memory",
          status: "near_ruin",
          recommendation: "wait",
          recordCount: 5,
          matchedCount: 5,
          scarCount: 4,
          nearRuinCount: 2,
          averageSurvivalCost: 74,
          recoveryBurden: 68,
          survivalConfidence: 26,
          currentStateSimilarity: 82,
          exposureMultiplier: 0,
          confidencePenalty: 56,
          maxExposurePct: 0,
          stateFingerprint: "venue:binance|action:buy",
          mainWarnings: ["Similar states include near-ruin survival patterns."],
          reasons: ["Wait because similar states had unacceptable survival cost."],
          missingEvidence: ["Survival memory clearance"],
          unlockConditions: ["Wait until similar states show survival cost below 35/100 and no near-ruin match."],
          invalidationConditions: ["Invalidate if liquidity or tail pressure remains elevated in the current state."],
          fragileMatches: [],
          records: [],
        },
      })],
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
      opportunityDiscovery: { density: { density: 82 } },
    });

    const resolve = result.signals[0]?.resolve;
    assert.equal(resolve?.decision, "wait");
    assert.ok(resolve?.missingEvidence.includes("Survival memory clearance"));
    assert.ok(resolve?.unlockConditions.some((condition) => condition.includes("survival cost below 35/100")));
    assert.ok(resolve?.explanation.includes("Resolve waits"));
  });

  it("uses Survival Memory fallback resolve text for wait and reduced-size states", () => {
    const wait = mapStockSignalToResolveInput({
      signal: stockSignal({
        survivalMemory: survivalMemory({
          recommendation: "wait",
          status: "near_ruin",
          exposureMultiplier: 0.2,
          maxExposurePct: 0.6,
          unlockConditions: [],
          invalidationConditions: [],
        }),
      }),
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
    });
    const reduced = mapStockSignalToResolveInput({
      signal: stockSignal({
        survivalMemory: survivalMemory({
          recommendation: "act_with_reduced_size",
          status: "scarred",
          exposureMultiplier: 0.4,
          maxExposurePct: 1.2,
          unlockConditions: [],
        }),
      }),
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
    });
    const recognizedReduced = mapStockSignalToResolveInput({
      signal: stockSignal({
        recognition: strongRecognition(),
        survivalMemory: survivalMemory({
          recommendation: "act_with_reduced_size",
          status: "scarred",
          exposureMultiplier: 0.4,
          maxExposurePct: 1.2,
          unlockConditions: [],
        }),
      }),
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
    });
    const survivalOnly = mapStockSignalToResolveInput({
      signal: {
        ticker: "SOLO",
        signalAction: "Buy",
        suggestedExposure: 1,
        survivalMemory: survivalMemory({ maxExposurePct: 0.4 }),
      } as StockResolveSignal,
      summary: {},
      agencyDiagnostics: agencyDiagnostics("act", 86),
    });

    assert.ok((wait.evidence?.unlockConditions as string[]).includes("Wait until similar states show acceptable survival cost before opening exposure."));
    assert.ok((wait.evidence?.invalidationConditions as string[]).includes("Invalidate if similar states repeat unacceptable adverse excursion."));
    assert.equal(wait.maxTrustedExposure, 0.6);
    assert.ok((reduced.evidence?.missingEvidence as string[]).includes("Reduced-size survival review"));
    assert.ok((reduced.evidence?.unlockConditions as string[]).includes("Restore normal sizing only after survival confidence improves."));
    assert.ok((recognizedReduced.evidence?.unlockConditions as string[]).some((condition) =>
      condition.includes("reduced-size outcomes with acceptable drawdown and stress cost"),
    ));
    assert.ok((recognizedReduced.evidence?.invalidationConditions as string[]).includes(
      "Do not restore normal sizing from Recognition state recurrence alone if survival-cost outcome linkage remains missing.",
    ));
    assert.equal(reduced.maxTrustedExposure, 1.2);
    assert.equal(survivalOnly.maxTrustedExposure, 0.4);
  });

  it("escalates strong confidence when data reliability is poor", () => {
    const result = applyStockResolveDiagnostics({
      market: "BINANCE",
      signals: [stockSignal()],
      summary: stockSummary({
        strategyReadiness: readiness({ components: { dataReliability: { score: 35, passed: false } } }),
      }),
      agencyDiagnostics: agencyDiagnostics("act", 86),
      opportunityDiscovery: { density: { density: 82 } },
    });

    assert.equal(result.signals[0]?.resolve.decision, "escalate");
    assert.ok(result.signals[0]?.resolve.unlockConditions.includes("Restore data reliability to at least 70/100."));
  });

  it("escalates high overfit risk even when trust is otherwise strong", () => {
    const result = applyStockResolveDiagnostics({
      market: "BINANCE",
      signals: [stockSignal({ judgement: judgement({ overfitRisk: 82 }) })],
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
      opportunityDiscovery: { density: { density: 82 } },
    });

    assert.equal(result.signals[0]?.resolve.decision, "escalate");
    assert.ok(result.signals[0]?.resolve.unlockConditions.includes("Reduce overfit risk to 35/100 or lower."));
  });

  it("keeps limited live readiness review-gated until approval and sizing are available", () => {
    const result = applyStockResolveDiagnostics({
      market: "BINANCE",
      signals: [
        stockSignal({
          allocationAction: "Blocked",
          suggestedExposure: 0,
          trustGovernor: trustGovernor({ maxExposure: 0, participationMode: "paper", requiresReview: true }),
          agency: agencyAudit({
            allowed: false,
            requiresApproval: true,
            recommendation: "requires_human_review",
            trust: 72,
          }),
        }),
      ],
      summary: stockSummary({
        trustGovernor: trustGovernor({ maxExposure: 0, participationMode: "paper", requiresReview: true }),
        strategyReadiness: readiness({ stage: "Limited live", maxPositionPct: 0 }),
      }),
      agencyDiagnostics: agencyDiagnostics("requires_human_review", 72),
      opportunityDiscovery: { density: { density: 82 } },
    });

    const resolve = result.signals[0]?.resolve;
    assert.equal(resolve?.decision, "escalate");
    assert.equal(resolve?.commitmentLevel, "none");
    assert.ok(resolve?.missingEvidence.includes("Trusted sizing capacity"));
    assert.ok(resolve?.explanation.includes("Resolve escalates"));
  });

  it("annotates signals without changing buy, watch, or sell list decisions", () => {
    const source = [
      stockSignal({ symbol: "BUY", ticker: "BUY", allocationAction: "Buy", signalAction: "Buy" }),
      stockSignal({
        symbol: "WATCH",
        ticker: "WATCH",
        allocationAction: "Watch",
        signalAction: "Hold",
        suggestedExposure: 0,
        sizingMode: "none",
        agency: agencyAudit({ recommendation: "wait", allowed: true }),
      }),
      stockSignal({
        symbol: "SELL",
        ticker: "SELL",
        allocationAction: "Sell",
        signalAction: "Sell",
        suggestedExposure: 0,
        sizingMode: "none",
      }),
    ];

    const result = applyStockResolveDiagnostics({
      market: "BINANCE",
      signals: source,
      summary: stockSummary(),
      agencyDiagnostics: agencyDiagnostics("act", 86),
      opportunityDiscovery: { density: { density: 82 } },
    });

    assert.deepEqual(result.signals.map((signal) => signal.allocationAction), ["Buy", "Watch", "Sell"]);
    assert.deepEqual(result.signals.map((signal) => signal.signalAction), ["Buy", "Hold", "Sell"]);
    assert.ok(result.signals.every((signal) => signal.resolve.metadata.module === "resolve"));
  });
});

function stockSignal(overrides: Partial<StockResolveSignal> = {}): StockResolveSignal {
  return {
    symbol: "AAA",
    ticker: "AAA",
    market: "BINANCE",
    price: 100,
    signalAction: "Buy",
    allocationAction: "Buy",
    signalStatus: "provided",
    suggestedExposure: 2,
    maxPositionPct: 3,
    setupQuality: 84,
    riskPressure: 20,
    trendQuality: 82,
    timingQuality: 80,
    expectedMove: 2.4,
    rawConfidence: 86,
    calibratedConfidence: 78,
    sizingMode: "micro",
    belief: {
      verdict: "strong",
      confidence: 82,
      trustworthiness: 88,
      fragility: 18,
    },
    judgement: judgement(),
    trustGovernor: trustGovernor(),
    agency: agencyAudit(),
    ...overrides,
  };
}

function stockSummary(overrides: Record<string, unknown> = {}) {
  return {
    updatedAt: "2026-05-29T12:00:00.000Z",
    rawConfidence: 86,
    calibratedConfidence: 78,
    trustworthiness: 84,
    trustedMaxExposurePct: 3,
    trustGovernor: trustGovernor(),
    strategyReadiness: readiness(),
    robustnessDiagnostics: { overfitRisk: 20 },
    ...overrides,
  } as any;
}

function readiness(overrides: Record<string, unknown> = {}) {
  return {
    stage: "Production eligible",
    readinessScore: 88,
    maxPositionPct: 3,
    rawConfidence: 86,
    calibratedConfidence: 78,
    trustworthiness: 84,
    calibration: {
      status: "trusted",
      sampleSize: 24,
      warnings: [],
    },
    components: {
      dataReliability: { score: 96, passed: true },
    },
    ...overrides,
  };
}

function judgement(overrides: Record<string, unknown> = {}) {
  return {
    status: "trusted",
    rawConfidence: 86,
    adjustedConfidence: 78,
    trust: 88,
    calibration: 84,
    reliability: 88,
    overfitRisk: 20,
    outcomeStability: 82,
    similarSampleSize: 24,
    confidenceDelta: -8,
    reasons: ["Similar outcomes support the action."],
    warnings: [],
    evidence: {
      similarStates: 24,
      positiveOutcomes: 20,
      negativeOutcomes: 4,
      neutralOutcomes: 0,
    },
    ...overrides,
  } as any;
}

function trustGovernor(overrides: Record<string, unknown> = {}) {
  return {
    module: "signal.trust-governor",
    name: "Signal Trust Governor",
    trustScore: 85,
    confidenceCap: 78,
    participationMode: "micro",
    maxExposure: 3,
    allowsNewExposure: true,
    requiresReview: false,
    allowedActions: ["new_exposure"],
    blockedActions: [],
    blockers: [],
    unlockCriteria: [],
    contradictions: [],
    reasons: ["Trust governor allows micro participation."],
    audit: {
      componentScores: {},
      weights: {},
      rawMaxExposure: 3,
      requestedExposure: 2,
      formulas: [],
    },
    ...overrides,
  } as any;
}

function agencyAudit(overrides: Record<string, unknown> = {}) {
  return {
    traceId: "agency-binance-aaa-1",
    symbol: "AAA",
    decisionKind: "increase_participation",
    allowed: true,
    requiresApproval: false,
    actionKind: "request_exposure",
    outcomeLabel: "positive",
    trust: 86,
    rawConfidence: 86,
    calibratedConfidence: 78,
    trustworthiness: 84,
    calibrationWarnings: [],
    recommendation: "act",
    violations: [],
    reasons: [],
    ...overrides,
  } as any;
}

function survivalMemory(overrides: Record<string, unknown> = {}) {
  return {
    module: "stocks.survival-memory",
    name: "Survival Memory",
    status: "scarred",
    recommendation: "act_with_reduced_size",
    recordCount: 4,
    matchedCount: 4,
    scarCount: 3,
    nearRuinCount: 1,
    averageSurvivalCost: 58,
    recoveryBurden: 42,
    survivalConfidence: 48,
    currentStateSimilarity: 62,
    exposureMultiplier: 0.4,
    confidencePenalty: 36,
    maxExposurePct: 1.2,
    stateFingerprint: "venue:binance|action:buy",
    mainWarnings: ["Similar states were profitable but carried unacceptable drawdown or stress."],
    reasons: ["Cap exposure to 40% of the normal limit before opportunity sizing expands it."],
    missingEvidence: ["Reduced-size survival review"],
    unlockConditions: ["Raise survival confidence above 70/100 before normal sizing is restored."],
    invalidationConditions: ["Invalidate if similar states repeat max adverse excursion above the survival boundary."],
    fragileMatches: [],
    records: [],
    ...overrides,
  } as any;
}

function agencyDiagnostics(recommendation: string, averageTrust: number) {
  return {
    summary: {
      traceCount: 1,
      allowedActions: recommendation === "act" ? 1 : 0,
      blockedActions: recommendation === "act" ? 0 : 1,
      missingOutcomes: 0,
      averageTrust,
      recommendation,
    },
    state: {} as any,
    traces: [],
    signalAudits: [],
  } as any;
}

function lowConfidenceDiscovery() {
  return {
    status: "emerging",
    opportunities: [],
    confidence: 32,
    trust: 50,
    fragility: 64,
    novelty: 88,
    maturity: 40,
    contextMatch: [],
    memory: {
      sampleSize: 1,
      similarOutcomes: 0,
      positiveOutcomes: 0,
      negativeOutcomes: 0,
      neutralOutcomes: 0,
      successRatio: 0,
      failureRatio: 0,
      neutralRatio: 0,
      reliability: 25,
      recurringSuccessPatterns: [],
      recurringFailurePatterns: [],
      mostPredictiveEvidence: [],
      mostMisleadingEvidence: [],
    },
    foresight: {
      counterfactuals: [],
      invalidationConditions: ["Discovery invalidates if support fails."],
      unlockConditions: ["Collect independent confirmation."],
      fragilityDrivers: [],
      safetyDrivers: [],
    },
    explanation: {
      summary: "Discovery is emerging.",
      supportingEvidence: [],
      contradictoryEvidence: [],
      confidenceAttribution: [],
      confidencePenalties: [],
      missingEvidence: ["similar closed outcomes"],
    },
    lifecycle: {
      status: "emerging",
      transitionReason: "Evidence is improving but incomplete.",
      maturity: 40,
      persistence: 50,
      velocity: 60,
      decayRisk: 64,
      readiness: 48,
      stageScores: {
        none: 0,
        detected: 20,
        emerging: 40,
        strengthening: 35,
        eligible: 30,
        sized: 20,
        active: 15,
        closed: 0,
      },
    },
    missingEvidence: ["similar closed outcomes"],
    invalidationConditions: ["Discovery invalidates if support fails."],
    recommendedNextStep: "Resolve missing evidence: similar closed outcomes.",
    traces: [],
    metadata: { module: "discovery", version: "v1", createdAt: "1970-01-01T00:00:00.000Z" },
  };
}

function strongRecognition() {
  return {
    recognitionScore: 86,
    recurrenceConfidence: 88,
    noveltyScore: 22,
    archetype: "stable_positive_state",
    archetypeConfidence: 90,
    stateFingerprint: "recog-v1:test",
    matchedSamples: 24,
    matchedPositiveOutcomes: 22,
    matchedNegativeOutcomes: 2,
    outcomeStability: 84,
    discoveryNoveltyJustified: false,
    judgementSimilarityJustified: true,
    verdict: "recognized" as const,
    reason: "Recurring stable state.",
    missingEvidence: [],
    invalidationConditions: ["Invalidate if recurrence disappears."],
    metadata: { module: "recognition" as const, version: "v1" as const, createdAt: "1970-01-01T00:00:00.000Z" },
  };
}
