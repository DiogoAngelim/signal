import { describe, expect, it } from "vitest";
import {
  buildSurvivalMemoryRecord,
  calculateSurvivalCost,
  classifySurvivalOutcome,
  evaluateSurvivalMemory,
  fingerprintSurvivalState,
  scarWeightForOutcome,
  type SurvivalMemoryRecord,
} from "./engine";

describe("Survival Memory", () => {
  it("uses adverse excursion, drawdown, recovery, and stress inputs", () => {
    const cost = calculateSurvivalCost({
      maxDrawdown: 20,
      maxAdverseExcursion: 30,
      recoveryTimeBars: 30,
      volatilityExpansion: 60,
      tailRisk: 70,
      liquidityStress: 40,
      structuralDanger: 50,
      novelty: 20,
    });

    expect(cost).toBe(42.3);
  });

  it("classifies comfortable, stressed, barely-survived, and failed states", () => {
    expect(classifySurvivalOutcome({
      realizedReturn: 2,
      maxDrawdown: 2,
      maxAdverseExcursion: 3,
      recoveryTimeBars: 2,
      volatilityExpansion: 8,
      tailRisk: 4,
      liquidityStress: 3,
      structuralDanger: 5,
      novelty: 12,
    })).toBe("comfortable_survival");

    expect(classifySurvivalOutcome({
      realizedReturn: 0.5,
      maxDrawdown: 12,
      maxAdverseExcursion: 13,
      recoveryTimeBars: 12,
      volatilityExpansion: 42,
      tailRisk: 24,
      liquidityStress: 18,
      structuralDanger: 15,
      novelty: 20,
    })).toBe("stressed_survival");

    expect(classifySurvivalOutcome({
      realizedReturn: 8,
      maxDrawdown: 32,
      maxAdverseExcursion: 36,
      recoveryTimeBars: 50,
      volatilityExpansion: 75,
      tailRisk: 82,
      liquidityStress: 84,
      structuralDanger: 65,
      novelty: 45,
    })).toBe("barely_survived");

    expect(classifySurvivalOutcome({
      realizedReturn: -1,
      maxDrawdown: 6,
      maxAdverseExcursion: 8,
    })).toBe("failed_survival");
  });

  it("turns profitable but dangerous outcomes into survival scars", () => {
    const record = buildSurvivalMemoryRecord({
      id: "scar-1",
      timestamp: "2026-01-02",
      asset: "AAA",
      venue: "NASDAQ",
      regime: "trend",
      state: { venue: "NASDAQ", regime: "trend", action: "buy", riskPressure: 72 },
      action: "buy",
      maxExposure: 8,
      realizedReturn: 8,
      maxDrawdown: -32,
      maxAdverseExcursion: -36,
      recoveryTimeBars: 55,
      volatilityExpansion: 76,
      tailRisk: 86,
      liquidityStress: 83,
      structuralDanger: 64,
      novelty: 42,
      opportunityDensity: 75,
    });

    expect(record.outcomeClass).toBe("barely_survived");
    expect(record.survivalCost).toBeGreaterThanOrEqual(60);
    expect(record.scarWeight).toBeGreaterThanOrEqual(0.55);
    expect(record.notes).toContain("Profitable outcome carried unacceptable survival cost.");
  });

  it("penalizes current states similar to fragile history", () => {
    const fragile = buildSurvivalMemoryRecord({
      id: "fragile",
      timestamp: "2026-01-03",
      state: { venue: "NASDAQ", regime: "trend", action: "buy", riskPressure: 74, volatilityExpansion: 80 },
      action: "buy",
      realizedReturn: 5,
      maxExposure: 6,
      maxDrawdown: 46,
      maxAdverseExcursion: 48,
      recoveryTimeBars: 70,
      volatilityExpansion: 80,
      tailRisk: 92,
      liquidityStress: 91,
      structuralDanger: 72,
      novelty: 45,
      opportunityDensity: 70,
    });
    const comfortable = buildSurvivalMemoryRecord({
      id: "comfortable",
      timestamp: "2026-01-04",
      state: { venue: "NASDAQ", regime: "trend", action: "buy", riskPressure: 18, volatilityExpansion: 10 },
      action: "buy",
      realizedReturn: 3,
      maxExposure: 3,
      maxDrawdown: 2,
      maxAdverseExcursion: 3,
      recoveryTimeBars: 2,
      volatilityExpansion: 10,
      tailRisk: 5,
      liquidityStress: 6,
      structuralDanger: 8,
      novelty: 10,
      opportunityDensity: 60,
    });
    const analysis = evaluateSurvivalMemory({
      records: [comfortable, fragile],
      currentState: { venue: "NASDAQ", regime: "trend", action: "buy", riskPressure: 76, volatilityExpansion: 84 },
      similarityThreshold: 0.3,
    });

    expect(analysis.status).toBe("near_ruin");
    expect(analysis.recommendation).toBe("wait");
    expect(analysis.scarCount).toBe(1);
    expect(analysis.nearRuinCount).toBe(1);
    expect(analysis.exposureMultiplier).toBe(0.2);
    expect(analysis.confidencePenalty).toBeGreaterThan(40);
    expect(analysis.mainWarnings).toContain("Current state resembles fragile historical states.");
    expect(analysis.missingEvidence).toContain("Survival memory clearance");
  });

  it("does not collapse confidence or capacity from raw scar counts when average survival cost is controlled", () => {
    const current = fingerprintSurvivalState({ venue: "BINANCE", action: "buy", riskPressure: 57, volatilityExpansion: 38 });
    const moderateNearRuin: SurvivalMemoryRecord[] = Array.from({ length: 54 }, (_, index) => ({
      id: `moderate-near-${index}`,
      timestamp: "2026-01-01T00:00:00.000Z",
      stateFingerprint: current,
      action: "buy",
      maxExposure: 8,
      realizedReturn: 4,
      maxDrawdown: 31,
      maxAdverseExcursion: 46,
      recoveryTimeBars: 5,
      volatilityExpansion: 22,
      tailRisk: 44,
      liquidityStress: 18,
      structuralDanger: 22,
      novelty: 16,
      opportunityDensity: 64,
      outcomeClass: "barely_survived",
      survivalCost: 29,
      scarWeight: 0.55,
      notes: ["Profitable outcome carried unacceptable survival cost."],
    }));
    const stressedScars: SurvivalMemoryRecord[] = Array.from({ length: 35 }, (_, index) => ({
      id: `stressed-${index}`,
      timestamp: "2026-01-01T00:00:00.000Z",
      stateFingerprint: current,
      action: "buy",
      maxExposure: 5,
      realizedReturn: 2,
      maxDrawdown: 12,
      maxAdverseExcursion: 14,
      recoveryTimeBars: 3,
      volatilityExpansion: 16,
      tailRisk: 24,
      liquidityStress: 12,
      structuralDanger: 18,
      novelty: 12,
      opportunityDensity: 48,
      outcomeClass: "stressed_survival",
      survivalCost: 27,
      scarWeight: 0.2,
    }));
    const comfortable: SurvivalMemoryRecord[] = Array.from({ length: 9 }, (_, index) => ({
      id: `comfortable-${index}`,
      timestamp: "2026-01-01T00:00:00.000Z",
      stateFingerprint: current,
      action: "buy",
      maxExposure: 2,
      realizedReturn: 1,
      maxDrawdown: 2,
      maxAdverseExcursion: 3,
      recoveryTimeBars: 1,
      volatilityExpansion: 4,
      tailRisk: 3,
      liquidityStress: 2,
      structuralDanger: 4,
      novelty: 6,
      opportunityDensity: 28,
      outcomeClass: "comfortable_survival",
      survivalCost: 5,
      scarWeight: 0,
    }));
    const analysis = evaluateSurvivalMemory({
      records: [...moderateNearRuin, ...stressedScars, ...comfortable],
      stateFingerprint: current,
    });

    expect(analysis.scarCount).toBe(89);
    expect(analysis.nearRuinCount).toBe(54);
    expect(analysis.severeNearRuinRate).toBeGreaterThan(50);
    expect(analysis.averageSurvivalCost).toBeLessThan(30);
    expect(analysis.status).toBe("scarred");
    expect(analysis.recommendation).toBe("act_with_reduced_size");
    expect(analysis.exposureMultiplier).toBe(0.65);
    expect(analysis.survivalConfidence).toBeGreaterThan(60);
    expect(analysis.confidencePenalty).toBeLessThan(25);
    expect(analysis.missingEvidence).not.toContain("Survival memory clearance");
  });

  it("maximizes controlled recovery confidence without clearing reduced-size status", () => {
    const current = fingerprintSurvivalState({ venue: "BINANCE", action: "buy", regime: "low-vol-grind" });
    const recoveredNearRuin: SurvivalMemoryRecord[] = Array.from({ length: 21 }, (_, index) => ({
      id: `recovered-near-${index}`,
      timestamp: "2026-05-29T00:00:00.000Z",
      stateFingerprint: current,
      action: "buy",
      maxExposure: 4,
      realizedReturn: 3,
      maxDrawdown: 31,
      maxAdverseExcursion: 46,
      recoveryTimeBars: 6,
      volatilityExpansion: 22,
      tailRisk: 44,
      liquidityStress: 18,
      structuralDanger: 22,
      novelty: 16,
      opportunityDensity: 37,
      outcomeClass: "barely_survived",
      survivalCost: 29,
      scarWeight: 0.55,
    }));
    const controlledScars: SurvivalMemoryRecord[] = Array.from({ length: 26 }, (_, index) => ({
      id: `controlled-scar-${index}`,
      timestamp: "2026-05-29T00:00:00.000Z",
      stateFingerprint: current,
      action: "buy",
      maxExposure: 3,
      realizedReturn: 2,
      maxDrawdown: 12,
      maxAdverseExcursion: 14,
      recoveryTimeBars: 6,
      volatilityExpansion: 16,
      tailRisk: 24,
      liquidityStress: 12,
      structuralDanger: 18,
      novelty: 12,
      opportunityDensity: 37,
      outcomeClass: "stressed_survival",
      survivalCost: 27,
      scarWeight: 0.2,
    }));
    const analysis = evaluateSurvivalMemory({
      records: [...recoveredNearRuin, ...controlledScars],
      stateFingerprint: current,
    });

    expect(analysis.scarCount).toBe(47);
    expect(analysis.nearRuinCount).toBe(21);
    expect(analysis.averageSurvivalCost).toBeLessThan(30);
    expect(analysis.recoveryBurden).toBe(10);
    expect(analysis.status).toBe("scarred");
    expect(analysis.recommendation).toBe("act_with_reduced_size");
    expect(analysis.survivalConfidence).toBeGreaterThanOrEqual(70);
    expect(analysis.missingEvidence).toContain("Reduced-size survival review");
  });

  it("does not hard-gate on an isolated severe outlier when aggregate recovery is controlled", () => {
    const current = fingerprintSurvivalState({ venue: "BINANCE", action: "buy", regime: "rotation" });
    const severeOutlier: SurvivalMemoryRecord = {
      id: "severe-outlier",
      timestamp: "2026-01-01T00:00:00.000Z",
      stateFingerprint: current,
      action: "buy",
      maxExposure: 8,
      realizedReturn: 3,
      maxDrawdown: 48,
      maxAdverseExcursion: 50,
      recoveryTimeBars: 6,
      volatilityExpansion: 32,
      tailRisk: 58,
      liquidityStress: 24,
      structuralDanger: 28,
      novelty: 15,
      opportunityDensity: 60,
      outcomeClass: "barely_survived",
      survivalCost: 78,
      scarWeight: 0.8,
    };
    const comfortable: SurvivalMemoryRecord[] = Array.from({ length: 19 }, (_, index) => ({
      id: `comfortable-recovery-${index}`,
      timestamp: "2026-01-01T00:00:00.000Z",
      stateFingerprint: current,
      action: "buy",
      maxExposure: 2,
      realizedReturn: 1,
      maxDrawdown: 2,
      maxAdverseExcursion: 3,
      recoveryTimeBars: 1,
      volatilityExpansion: 4,
      tailRisk: 3,
      liquidityStress: 2,
      structuralDanger: 4,
      novelty: 6,
      opportunityDensity: 28,
      outcomeClass: "comfortable_survival",
      survivalCost: 5,
      scarWeight: 0,
    }));
    const analysis = evaluateSurvivalMemory({
      records: [severeOutlier, ...comfortable],
      stateFingerprint: current,
    });

    expect(analysis.nearRuinCount).toBe(1);
    expect(analysis.severeNearRuinRate).toBe(5);
    expect(analysis.status).toBe("watch");
    expect(analysis.recommendation).toBe("act_with_reduced_size");
    expect(analysis.exposureMultiplier).toBe(1);
    expect(analysis.survivalConfidence).toBeGreaterThan(70);
    expect(analysis.missingEvidence).not.toContain("Survival memory clearance");
  });

  it("stays clear when matching history survived comfortably", () => {
    const state = { venue: "NYSE", regime: "low-vol", action: "buy", riskPressure: 15 };
    const record = buildSurvivalMemoryRecord({
      id: "calm",
      state,
      action: "buy",
      realizedReturn: 2,
      maxExposure: 2,
      maxDrawdown: 1,
      maxAdverseExcursion: 2,
      recoveryTimeBars: 1,
      volatilityExpansion: 5,
      tailRisk: 3,
      liquidityStress: 2,
      structuralDanger: 4,
      novelty: 10,
      opportunityDensity: 45,
    });
    const analysis = evaluateSurvivalMemory({
      records: [record],
      stateFingerprint: fingerprintSurvivalState(state),
    });

    expect(analysis.status).toBe("clear");
    expect(analysis.recommendation).toBe("act");
    expect(analysis.exposureMultiplier).toBe(1);
    expect(analysis.missingEvidence).toEqual([]);
    expect(scarWeightForOutcome("comfortable_survival", 2)).toBe(0);
  });

  it("is explicit and deterministic when empty", () => {
    const analysis = evaluateSurvivalMemory();

    expect(analysis.status).toBe("empty");
    expect(analysis.recordCount).toBe(0);
    expect(analysis.survivalConfidence).toBe(100);
    expect(analysis.reasons[0]).toBe("No survival memory records are available yet.");
  });

  it("normalizes prebuilt fingerprints and alternate actions", () => {
    const record: SurvivalMemoryRecord = buildSurvivalMemoryRecord({
      id: "manual",
      timestamp: "bad-date",
      stateFingerprint: "venue:nasdaq|action:exit",
      action: "exit",
      realizedReturn: 0,
      maxExposure: 0.4,
      maxDrawdown: 0.2,
      maxAdverseExcursion: 0.3,
      recoveryTimeBars: 120,
      volatilityExpansion: 0.4,
      tailRisk: 0.2,
      liquidityStress: 0.1,
      structuralDanger: 0.1,
      novelty: 0.1,
      opportunityDensity: 0.2,
    });

    expect(record.timestamp).toBe("1970-01-01T00:00:00.000Z");
    expect(record.action).toBe("exit");
    expect(record.maxExposure).toBe(40);
    expect(record.recoveryTimeBars).toBe(120);
    expect(record.outcomeClass).toBe("barely_survived");
  });

  it("fingerprints booleans and arrays while ignoring empty keys", () => {
    const fingerprint = fingerprintSurvivalState({
      active: true,
      inactive: false,
      tags: ["tail risk", "liquidity"],
      empty: "",
      missing: undefined,
      "": "ignored",
      nested: { ignored: true },
    });

    expect(fingerprint).toContain("active:true");
    expect(fingerprint).toContain("inactive:false");
    expect(fingerprint).toContain("tags:tail-risk");
    expect(fingerprint).toContain("tags:liquidity");
    expect(fingerprint.includes("ignored")).toBe(false);
  });

  it("handles non-finite defensive inputs", () => {
    const cost = calculateSurvivalCost({
      maxDrawdown: Number.NaN,
      maxAdverseExcursion: Number.POSITIVE_INFINITY,
      recoveryTimeBars: Number.NaN,
      volatilityExpansion: Number.NaN,
    });
    const scarWeight = scarWeightForOutcome("barely_survived", Number.NaN);
    const watch = buildSurvivalMemoryRecord({
      id: "watch",
      action: "watch",
      realizedReturn: 0,
      maxDrawdown: 0,
      maxAdverseExcursion: 0,
    });
    const unknown = buildSurvivalMemoryRecord({
      id: "unknown",
      realizedReturn: 0,
      maxDrawdown: 0,
      maxAdverseExcursion: 0,
    });
    const emptySimilarity = evaluateSurvivalMemory({
      stateFingerprint: "",
      records: [{ ...unknown, stateFingerprint: "|" }],
    });
    const highAverageCost = evaluateSurvivalMemory({
      stateFingerprint: "current:state",
      records: [
        { ...unknown, id: "high-cost", survivalCost: 72, outcomeClass: "stressed_survival", scarWeight: 0.2 },
      ],
    });
    const severeCluster = evaluateSurvivalMemory({
      stateFingerprint: "cluster:fragile",
      records: [0, 1].map((index) => ({
        ...unknown,
        id: `severe-cluster-${index}`,
        stateFingerprint: "cluster:fragile",
        outcomeClass: "failed_survival",
        survivalCost: 86,
        scarWeight: 1,
        maxDrawdown: 48,
        maxAdverseExcursion: 52,
        tailRisk: 92,
        liquidityStress: 88,
      })),
    });

    expect(cost).toBe(0);
    expect(scarWeight).toBe(0.55);
    expect(watch.action).toBe("watch");
    expect(unknown.action).toBe("buy");
    expect(emptySimilarity.matchedCount).toBe(1);
    expect(highAverageCost.exposureMultiplier).toBe(0.25);
    expect(severeCluster.exposureMultiplier).toBe(0);
  });
});
