import { describe, expect, it } from "vitest";
import { authorize } from "../agency/engine";
import { SignalFrameworkEngine } from "../core/engine";
import { MetricRegistry } from "../metrics/registry";
import {
  adjustStocksExposureForPruning,
  buildStocksPruningViewModel,
  evaluateStocksPruning,
} from "../adapters/stocks-optimizer";
import type { MetricInput, PerceptionLayerKey } from "../types";
import { evaluateDecisionQuality } from "../wisdom/engine";
import {
  InMemoryPruningStore,
  PruningValidationError,
  evaluatePruning,
  type PruningCandidateInput,
} from "./engine";

const baseCandidate: PruningCandidateInput = {
  candidateId: "candidate-1",
  candidateType: "raw-signal",
  sourceModule: "test",
  currentWeight: 60,
  historicalUtility: 62,
  predictiveContribution: 62,
  decisionContribution: 64,
  redundancyScore: 10,
  noiseScore: 12,
  volatilitySensitivity: 18,
  regimeStability: 75,
  evidenceQuality: 78,
  sampleSize: 42,
  staleDataRisk: 0,
  contradictionRate: 0,
  falsePositiveRate: 5,
  falseNegativeRate: 5,
  complexityCost: 15,
  maintenanceCost: 12,
  latencyCost: 3,
  userClarityCost: 18,
  overfitRisk: 10,
  explainabilityValue: 74,
  survivalValue: 35,
  recentOutcomeImpact: 12,
  counterfactualImpact: 8,
  confidenceImpact: 10,
  trustImpact: 12,
  uncertainty: 18,
  timestamp: "2026-05-31T12:00:00.000Z",
};

describe("pruning scoring", () => {
  it("reduces useful redundant evidence and keeps it as backup", () => {
    const result = evaluatePruning({
      ...baseCandidate,
      redundancyScore: 84,
      historicalUtility: 72,
      predictiveContribution: 70,
      decisionContribution: 68,
    });

    expect(result.recommendedAction).toBe("reduce");
    expect(result.reducedSignals).toContain("candidate-1");
    expect(result.candidates[0]?.backupEvidence).toBe(true);
    expect(result.candidates[0]?.markedRedundant).toBe(true);
  });

  it("ignores noisy low-utility signals with adequate evidence", () => {
    const result = evaluatePruning({
      ...baseCandidate,
      historicalUtility: 10,
      predictiveContribution: 8,
      decisionContribution: 12,
      noiseScore: 92,
      complexityCost: 78,
      evidenceQuality: 82,
      sampleSize: 80,
    });

    expect(result.recommendedAction).toBe("ignore");
    expect(result.ignoredSignals).toContain("candidate-1");
    expect(result.ignoranceEffectivenessScore).toBeGreaterThan(40);
  });

  it("quarantines overfit and contradictory signals", () => {
    const overfit = evaluatePruning({ ...baseCandidate, overfitRisk: 92, evidenceQuality: 85, sampleSize: 90 });
    const contradictory = evaluatePruning({ ...baseCandidate, contradictionRate: 88, evidenceQuality: 80, sampleSize: 60 });

    expect(overfit.recommendedAction).toBe("quarantine");
    expect(contradictory.recommendedAction).toMatch(/quarantine|reduce/);
    expect(overfit.quarantinedSignals).toContain("candidate-1");
  });

  it("uses review or isolation when evidence is weak or missing", () => {
    const result = evaluatePruning({
      ...baseCandidate,
      evidenceQuality: 12,
      sampleSize: 0,
      regimeStability: 15,
      staleDataRisk: 70,
    });
    const missing = evaluatePruning({});

    expect(result.recommendedAction).toMatch(/review|isolate|reduce/);
    expect(result.degradedMode).toBe(true);
    expect(missing.degradedMode).toBe(true);
    expect(missing.recommendedAction).toBe("review");
  });

  it("preserves survival-critical warnings despite short-term pruning pressure", () => {
    const result = evaluatePruning({
      ...baseCandidate,
      candidateId: "survival-warning",
      survivalValue: 95,
      governanceFlags: ["survival-critical"],
      noiseScore: 70,
      complexityCost: 60,
      historicalUtility: 45,
    });

    expect(result.recommendedAction).toBe("keep");
    expect(result.survivalCriticalSignals).toContain("survival-warning");
    expect(result.preservedSignals).toContain("survival-warning");
  });

  it("hides confusing frontend metrics without deleting useful evidence", () => {
    const result = evaluatePruning({
      ...baseCandidate,
      candidateId: "dashboard-noise",
      candidateType: "frontend-insight",
      userClarityCost: 88,
      historicalUtility: 58,
      predictiveContribution: 58,
      decisionContribution: 54,
    });

    expect(result.recommendedAction).toBe("isolate");
    expect(result.frontendHiddenSignals).toContain("dashboard-noise");
  });

  it("keeps scores bounded and deterministic across property-style samples", () => {
    for (let index = 0; index < 40; index += 1) {
      const candidate = {
        ...baseCandidate,
        noiseScore: index * 3,
        overfitRisk: 100 - index * 2,
        survivalValue: index,
      };
      const first = evaluatePruning(candidate);
      const second = evaluatePruning(candidate);

      expect(first).toEqual(second);
      for (const value of [
        first.pruningScore,
        first.ignoranceEffectivenessScore,
        first.keepScore,
        first.ignoreScore,
        first.reduceScore,
        first.quarantineScore,
        first.evidenceConfidence,
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("does not let more noise, overfit, or weak evidence increase keep confidence", () => {
    const clean = evaluatePruning({ ...baseCandidate, noiseScore: 5, overfitRisk: 5, evidenceQuality: 90, sampleSize: 90 });
    const noisy = evaluatePruning({ ...baseCandidate, noiseScore: 95, overfitRisk: 5, evidenceQuality: 90, sampleSize: 90 });
    const overfit = evaluatePruning({ ...baseCandidate, noiseScore: 5, overfitRisk: 95, evidenceQuality: 90, sampleSize: 90 });
    const weakEvidence = evaluatePruning({ ...baseCandidate, noiseScore: 5, overfitRisk: 5, evidenceQuality: 10, sampleSize: 0 });
    const survival = evaluatePruning({ ...baseCandidate, survivalValue: 95, governanceFlags: ["survival-critical"], noiseScore: 70 });

    expect(noisy.keepScore).toBeLessThanOrEqual(clean.keepScore);
    expect(overfit.keepScore).toBeLessThanOrEqual(clean.keepScore);
    expect(weakEvidence.evidenceConfidence).toBeLessThan(clean.evidenceConfidence);
    expect(survival.recommendedAction).not.toBe("ignore");
  });

  it("validates invalid inputs or safely degrades by default", () => {
    const degraded = evaluatePruning({
      ...baseCandidate,
      candidateId: undefined,
      noiseScore: 150,
    });

    expect(degraded.validationIssues.length).toBeGreaterThan(0);
    expect(degraded.degradedMode).toBe(true);
    expect(() => evaluatePruning({ ...baseCandidate, candidateId: undefined, strictValidation: true })).toThrow(
      PruningValidationError,
    );
  });

  it("can persist auditable pruning records through the generic store interface", () => {
    const store = new InMemoryPruningStore();
    const result = evaluatePruning(baseCandidate);
    store.record(result.candidates[0] ?? result);

    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.candidateId).toBe("candidate-1");
  });
});

describe("pruning integration", () => {
  it("appears in the Signal pipeline and Agency avoids quarantined drivers", async () => {
    const engine = new SignalFrameworkEngine(registry());
    const snapshot = await engine.cycleOnce({
      id: "cycle-pruning",
      timestamp: 1_800_000_000_000,
      metrics: metrics(),
      decision: { id: "decision-1", type: "generic", confidence: 80, uncertainty: 10 },
      agency: { authority: "autonomous", reviewPolicy: { mode: "fully-autonomous" } },
      pruning: {
        candidates: [{ ...baseCandidate, candidateId: "driver-1", overfitRisk: 94, evidenceQuality: 90, sampleSize: 90 }],
      },
    });

    expect(snapshot.pruning?.recommendedAction).toBe("quarantine");
    expect(snapshot.agency?.status).toBe("denied");
    expect(snapshot.events.map((event) => event.type)).toContain("pruning.quarantine");
  });

  it("lets Wisdom lower confidence and escalate review when pruning finds unsafe evidence", () => {
    const pruning = evaluatePruning({
      ...baseCandidate,
      overfitRisk: 95,
      noiseScore: 82,
      evidenceQuality: 88,
      sampleSize: 90,
    });
    const withPruning = evaluateDecisionQuality({ pruning });
    const withoutPruning = evaluateDecisionQuality();

    expect(withPruning.falseConfidenceRisk).toBeGreaterThan(withoutPruning.falseConfidenceRisk);
    expect(withPruning.recommendedAction).toBe("review");
    expect(withPruning.sourceModules).toContain("pruning");
  });

  it("lets Agency reduce or block actions from pruning output directly", () => {
    const pruning = evaluatePruning({
      ...baseCandidate,
      candidateId: "unsafe-driver",
      overfitRisk: 96,
      evidenceQuality: 92,
      sampleSize: 90,
    });
    const result = authorize({
      decision: { id: "decision", confidence: 90, uncertainty: 5 },
      authority: "autonomous",
      reviewPolicy: { mode: "fully-autonomous" },
      pruning,
    });

    expect(result.pruningGate.quarantinedCandidateIds).toContain("unsafe-driver");
    expect(result.status).toBe("denied");
  });

  it("exposes stocks optimizer pruning without breaking legacy view mode", () => {
    const source = {
      marketStatus: "Open" as const,
      stocks: [
        {
          ticker: "ALPHA",
          history: [10, 10.2, 10.4, 10.5],
          signalAction: "Buy",
          quoteStatus: "available",
          signalStatus: "provided",
          setupQuality: 76,
          trendQuality: 78,
          timingQuality: 74,
          riskPressure: 30,
          suggestedExposure: 5,
          expectedMove: 2.5,
        },
        {
          ticker: "RISK",
          history: [20, 18, 16, 14],
          signalAction: "Sell",
          quoteStatus: "available",
          signalStatus: "provided",
          setupQuality: 40,
          trendQuality: 30,
          timingQuality: 35,
          riskPressure: 88,
          suggestedExposure: 0,
          expectedMove: -5,
        },
      ],
      avgRisk: 48,
      avgQuality: 62,
      breadth: 55,
      confidence: 70,
      targetExposure: 40,
      survivalScore: 84,
      failureFlags: [],
      staleData: false,
      hasBacktestData: true,
      hasProvidedSignals: true,
      backtestTradeCount: 72,
      backtestSharpe: 1.1,
      backtestMaxDrawdownPct: 9,
      backtestProfitFactor: 1.6,
      backtestWinRatePct: 58,
      backtestReturnPct: 12,
      now: 1_800_000_000_000,
    };

    const pruning = evaluateStocksPruning(source);
    const enhanced = buildStocksPruningViewModel(pruning);
    const legacy = buildStocksPruningViewModel(null);

    expect(enhanced.mode).toMatch(/enhanced|degraded/);
    expect(enhanced.survivalCriticalSignals.length).toBeGreaterThan(0);
    expect(enhanced.explanation).toContain("Pruning");
    expect(legacy.mode).toBe("legacy");
    expect(adjustStocksExposureForPruning(80, { recommendedAction: "reduce" })).toBe(40);
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
    value: 72,
    confidence: 92,
    timestamp: 1_800_000_000_000,
  }));
}
