import { describe, expect, it } from "vitest";
import {
  buildStocksPurposeViewModel,
  evaluateStocksPurpose,
} from "../adapters/stocks-optimizer";
import { authorize } from "../agency/engine";
import { SignalFrameworkEngine } from "../core/engine";
import { MetricRegistry } from "../metrics/registry";
import { evaluatePruning } from "../pruning/engine";
import type { MetricInput, PerceptionLayerKey } from "../types";
import { evaluateDecisionQuality } from "../wisdom/engine";
import { evaluatePurpose, translateAmbition } from "./engine";

describe("purpose ambition translation", () => {
  it("uses a nonlinear ambition model and derives the full purpose profile", () => {
    const low = translateAmbition(10);
    const medium = translateAmbition(50);
    const high = translateAmbition(90);
    const max = translateAmbition(100);

    expect(max.ambitionIntensity - high.ambitionIntensity).toBeGreaterThan(
      medium.ambitionIntensity - translateAmbition(40).ambitionIntensity,
    );
    expect(high.purposeProfile.opportunityPreference).toBeGreaterThan(
      medium.purposeProfile.opportunityPreference,
    );
    expect(low.purposeProfile.certaintyPreference).toBeGreaterThan(
      high.purposeProfile.certaintyPreference,
    );
    expect(max.purposeProfile.survivalPriority).toBeGreaterThanOrEqual(58);
  });

  it("only requires ambition and generates a canonical purpose statement", () => {
    const result = evaluatePurpose({ ambition: 50 });

    expect(result.purposeStatement).toMatch(
      /^I am willing to sacrifice .+ to achieve .+ within .+ while respecting .+\.$/,
    );
    expect(result.purposeProfile.growthPreference).toBeGreaterThan(0);
    expect(result.behavioralAmbition).toBe(50);
    expect(result.trace.map((entry) => entry.id)).toContain("satisfaction");
  });
});

describe("purpose behavioral identity", () => {
  it("reconciles declared future intensity with observed behavior", () => {
    const result = evaluatePurpose({
      ambition: 100,
      behavior: [
        {
          patience: 28,
          discipline: 34,
          consistency: 30,
          recovery: 36,
          conviction: 44,
          adaptation: 38,
          stressTolerance: 26,
          confidenceCalibration: 35,
          panicExit: true,
          reversal: true,
          regret: 74,
        },
        {
          patience: 35,
          discipline: 42,
          consistency: 39,
          recovery: 45,
          conviction: 52,
          adaptation: 44,
          stressTolerance: 33,
          confidenceCalibration: 40,
          panicExit: true,
          regret: 68,
        },
      ],
    });

    expect(result.behavioralAmbition).toBeLessThan(60);
    expect(result.behavioralIdentity.identityConflictScore).toBeGreaterThan(35);
    expect(result.recommendedAction).toBe("review-identity");
    expect(result.warnings).toContain(
      "Declared ambition and observed behavior are materially different.",
    );
  });
});

describe("purpose experience models", () => {
  it("reduces satisfaction when expectations miss reality", () => {
    const aligned = evaluatePurpose({
      ambition: 60,
      expectations: [
        {
          expectedExperience: 70,
          actualExperience: 72,
          expectedOutcome: 68,
          actualOutcome: 70,
        },
      ],
      currentPath: { progress: 72, survivability: 80 },
    });
    const mismatch = evaluatePurpose({
      ambition: 60,
      expectations: [
        {
          expectedExperience: 85,
          actualExperience: 42,
          expectedOutcome: 88,
          actualOutcome: 35,
          expectationShock: 58,
        },
      ],
      currentPath: { progress: 72, survivability: 80 },
    });

    expect(mismatch.expectationCalibrationScore).toBeLessThan(
      aligned.expectationCalibrationScore,
    );
    expect(mismatch.satisfactionScore).toBeLessThan(aligned.satisfactionScore);
  });

  it("penalizes regret and friction across satisfaction, retention, and advocacy", () => {
    const smooth = evaluatePurpose({
      ambition: 70,
      friction: { simplicity: 90, clarity: 88 },
      expectations: [{ regret: 8, disappointment: 6, progress: 76 }],
      currentPath: { progress: 76, survivability: 82, usefulness: 78 },
    });
    const heavy = evaluatePurpose({
      ambition: 70,
      friction: {
        complexity: 84,
        mentalEffort: 78,
        attentionRequired: 82,
        interactionBurden: 74,
        cognitiveLoad: 88,
      },
      expectations: [{ regret: 82, disappointment: 76, confidenceShock: 70 }],
      currentPath: { progress: 76, survivability: 82, usefulness: 78 },
    });

    expect(heavy.regretScore).toBeLessThan(smooth.regretScore);
    expect(heavy.frictionScore).toBeLessThan(smooth.frictionScore);
    expect(heavy.retentionScore).toBeLessThan(smooth.retentionScore);
    expect(heavy.advocacyScore).toBeLessThan(smooth.advocacyScore);
  });
});

describe("purpose decision rules", () => {
  it("never lets high return override low alignment or survival", () => {
    const lowAlignment = evaluatePurpose({
      ambition: 90,
      decision: { expectedReturn: 95, alignment: 32, survivability: 72 },
      currentPath: { alignment: 32, survivability: 72, progress: 60 },
    });
    const lowSurvival = evaluatePurpose({
      ambition: 90,
      decision: { expectedReturn: 95, alignment: 90, survivability: 25 },
      currentPath: { alignment: 90, survivability: 25, progress: 82 },
    });

    expect(lowAlignment.recommendedAction).toBe("reduce-priority");
    expect(lowSurvival.recommendedAction).toBe("protect-survival");
    expect(lowSurvival.purposeScore).toBeLessThan(lowAlignment.purposeScore);
  });

  it("uses pruning, wisdom, and agency-compatible confidence in integration", () => {
    const pruning = evaluatePruning({
      candidateId: "driver",
      candidateType: "raw-signal",
      sourceModule: "test",
      historicalUtility: 18,
      predictiveContribution: 14,
      decisionContribution: 12,
      noiseScore: 90,
      overfitRisk: 92,
      evidenceQuality: 86,
      sampleSize: 80,
      survivalValue: 30,
    });
    const wisdom = evaluateDecisionQuality({ pruning });
    const purpose = evaluatePurpose({
      ambition: 80,
      wisdom,
      pruning,
      currentPath: { alignment: 58, survivability: 70, progress: 62 },
    });
    const agency = authorize({
      decision: {
        id: "purpose-aware",
        confidence: purpose.purposeConfidence,
        uncertainty: 100 - purpose.purposeConfidence,
      },
      authority: "autonomous",
      reviewPolicy: {
        mode: "review-when-confidence-low",
        confidenceThreshold: 65,
      },
    });

    expect(purpose.warnings).toContain(
      "Pruning found evidence that could create false confidence.",
    );
    expect(wisdom.sourceModules).toContain("pruning");
    expect(["requires-review", "approved", "deferred"]).toContain(
      agency.status,
    );
  });
});

describe("purpose framework and stocks integration", () => {
  it("appears in the Signal framework snapshot when ambition is supplied", async () => {
    const engine = new SignalFrameworkEngine(registry());
    const snapshot = await engine.cycleOnce({
      id: "purpose-cycle",
      timestamp: 1_800_000_000_000,
      metrics: metrics(),
      purpose: { ambition: 65 },
      decision: {
        id: "decision",
        confidence: 76,
        uncertainty: 18,
        expectedValue: 70,
      },
      agency: {
        authority: "autonomous",
        reviewPolicy: { mode: "fully-autonomous" },
      },
    });

    expect(snapshot.purpose?.purposeStatement).toContain("I am willing");
    expect(snapshot.events.map((event) => event.type)).toContain(
      `purpose.${snapshot.purpose?.recommendedAction}`,
    );
  });

  it("exposes beginner-facing stocks optimizer purpose fields", () => {
    const source = {
      marketStatus: "Open" as const,
      stocks: [
        {
          ticker: "ALPHA",
          history: [10, 10.2, 10.4],
          signalAction: "Buy",
          quoteStatus: "available",
          signalStatus: "provided",
          setupQuality: 78,
          trendQuality: 76,
          timingQuality: 74,
          riskPressure: 34,
          suggestedExposure: 4,
          expectedMove: 2,
        },
      ],
      avgRisk: 36,
      avgQuality: 74,
      breadth: 62,
      confidence: 72,
      targetExposure: 24,
      survivalScore: 78,
      failureFlags: [],
      staleData: false,
      hasBacktestData: true,
      hasProvidedSignals: true,
      backtestTradeCount: 80,
      backtestSharpe: 1.2,
      backtestMaxDrawdownPct: 8,
      backtestProfitFactor: 1.7,
      backtestWinRatePct: 58,
      backtestReturnPct: 14,
      ambition: 72,
    };

    const purpose = evaluateStocksPurpose(source);
    const view = buildStocksPurposeViewModel(purpose);

    expect(view.mode).toBe("enhanced");
    expect(view.ambition).toBe(72);
    expect(view.behavioralAmbition).toBeGreaterThan(0);
    expect(view.purposeStatement).toContain("I am willing");
    expect(view.alignmentTrustScore).toBeGreaterThan(0);
    expect(view.primaryFocus).toMatch(
      /Protecting progress|Building momentum|Pursuing growth|Preserving flexibility|Reducing stress|Staying disciplined/,
    );
  });
});

function registry() {
  const result = new MetricRegistry();
  for (const layer of [
    "survival",
    "emotion",
    "conviction",
    "harmony",
    "information",
    "intuition",
    "macroContext",
    "selfAwareness",
  ] as PerceptionLayerKey[]) {
    result.register({
      key: `${layer}Metric`,
      label: `${layer} metric`,
      description: `${layer} metric`,
      layerMappings: [{ layer, weight: 1 }],
    });
  }
  return result;
}

function metrics(): MetricInput[] {
  return [
    "survival",
    "emotion",
    "conviction",
    "harmony",
    "information",
    "intuition",
    "macroContext",
    "selfAwareness",
  ].map((layer) => ({
    key: `${layer}Metric`,
    value: layer === "survival" ? 82 : 72,
    confidence: 92,
    timestamp: 1_800_000_000_000,
  }));
}
