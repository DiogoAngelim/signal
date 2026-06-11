import assert from "node:assert/strict";
import test from "node:test";
import {
  type SurvivalMemoryRecord,
  buildSurvivalMemoryRecord,
  calculateSurvivalCost,
  classifySurvivalOutcome,
  evaluateSurvivalMemory,
  fingerprintSurvivalState,
  scarWeightForOutcome,
} from "./engine";

test("survival cost uses adverse excursion, drawdown, recovery, and stress inputs", () => {
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

  assert.equal(cost, 42.3);
});

test("survival outcome classification separates comfortable, stressed, barely survived, and failed states", () => {
  assert.equal(
    classifySurvivalOutcome({
      realizedReturn: 2,
      maxDrawdown: 2,
      maxAdverseExcursion: 3,
      recoveryTimeBars: 2,
      volatilityExpansion: 8,
      tailRisk: 4,
      liquidityStress: 3,
      structuralDanger: 5,
      novelty: 12,
    }),
    "comfortable_survival",
  );

  assert.equal(
    classifySurvivalOutcome({
      realizedReturn: 0.5,
      maxDrawdown: 12,
      maxAdverseExcursion: 13,
      recoveryTimeBars: 12,
      volatilityExpansion: 42,
      tailRisk: 24,
      liquidityStress: 18,
      structuralDanger: 15,
      novelty: 20,
    }),
    "stressed_survival",
  );

  assert.equal(
    classifySurvivalOutcome({
      realizedReturn: 8,
      maxDrawdown: 32,
      maxAdverseExcursion: 36,
      recoveryTimeBars: 50,
      volatilityExpansion: 75,
      tailRisk: 82,
      liquidityStress: 84,
      structuralDanger: 65,
      novelty: 45,
    }),
    "barely_survived",
  );

  assert.equal(
    classifySurvivalOutcome({
      realizedReturn: -1,
      maxDrawdown: 6,
      maxAdverseExcursion: 8,
    }),
    "stressed_survival",
  );

  assert.equal(
    classifySurvivalOutcome({
      realizedReturn: -3,
      maxDrawdown: 28,
      maxAdverseExcursion: 32,
      tailRisk: 76,
    }),
    "failed_survival",
  );
});

test("profitable but dangerous outcomes become survival scars", () => {
  const record = buildSurvivalMemoryRecord({
    id: "scar-1",
    timestamp: "2026-01-02",
    asset: "AAA",
    venue: "NASDAQ",
    regime: "trend",
    state: {
      venue: "NASDAQ",
      regime: "trend",
      action: "buy",
      riskPressure: 72,
    },
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

  assert.equal(record.outcomeClass, "barely_survived");
  assert.ok(record.survivalCost >= 60);
  assert.ok(record.scarWeight >= 0.55);
  assert.ok(
    record.notes?.includes(
      "Profitable outcome carried unacceptable survival cost.",
    ),
  );
});

test("survival memory penalizes current states similar to fragile history", () => {
  const fragile = buildSurvivalMemoryRecord({
    id: "fragile",
    timestamp: "2026-01-03",
    state: {
      venue: "NASDAQ",
      regime: "trend",
      action: "buy",
      riskPressure: 74,
      volatilityExpansion: 80,
    },
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
    state: {
      venue: "NASDAQ",
      regime: "trend",
      action: "buy",
      riskPressure: 18,
      volatilityExpansion: 10,
    },
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
    currentState: {
      venue: "NASDAQ",
      regime: "trend",
      action: "buy",
      riskPressure: 76,
      volatilityExpansion: 84,
    },
    similarityThreshold: 0.3,
  });

  assert.equal(analysis.status, "near_ruin");
  assert.equal(analysis.recommendation, "wait");
  assert.equal(analysis.scarCount, 1);
  assert.equal(analysis.nearRuinCount, 1);
  assert.equal(analysis.exposureMultiplier, 0.2);
  assert.ok(analysis.confidencePenalty > 40);
  assert.ok(
    analysis.mainWarnings.includes(
      "Current state resembles fragile historical states.",
    ),
  );
  assert.ok(analysis.missingEvidence.includes("Survival memory clearance"));
});

test("survival memory does not collapse confidence or capacity from raw scar counts when average survival cost is controlled", () => {
  const current = fingerprintSurvivalState({
    venue: "BINANCE",
    action: "buy",
    riskPressure: 57,
    volatilityExpansion: 38,
  });
  const moderateNearRuin: SurvivalMemoryRecord[] = Array.from(
    { length: 54 },
    (_, index) => ({
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
    }),
  );
  const stressedScars: SurvivalMemoryRecord[] = Array.from(
    { length: 35 },
    (_, index) => ({
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
    }),
  );
  const comfortable: SurvivalMemoryRecord[] = Array.from(
    { length: 9 },
    (_, index) => ({
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
    }),
  );
  const analysis = evaluateSurvivalMemory({
    records: [...moderateNearRuin, ...stressedScars, ...comfortable],
    stateFingerprint: current,
  });

  assert.equal(analysis.scarCount, 89);
  assert.equal(analysis.nearRuinCount, 54);
  assert.ok((analysis.severeNearRuinRate ?? 0) > 50);
  assert.ok(analysis.averageSurvivalCost < 30);
  assert.equal(analysis.status, "scarred");
  assert.equal(analysis.recommendation, "act_with_reduced_size");
  assert.equal(analysis.exposureMultiplier, 0.65);
  assert.ok(analysis.survivalConfidence > 60);
  assert.ok(analysis.confidencePenalty < 25);
  assert.equal(
    analysis.missingEvidence.includes("Survival memory clearance"),
    false,
  );
});

test("survival memory maximizes controlled recovery confidence without clearing reduced-size status", () => {
  const current = fingerprintSurvivalState({
    venue: "BINANCE",
    action: "buy",
    regime: "low-vol-grind",
  });
  const recoveredNearRuin: SurvivalMemoryRecord[] = Array.from(
    { length: 21 },
    (_, index) => ({
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
    }),
  );
  const controlledScars: SurvivalMemoryRecord[] = Array.from(
    { length: 26 },
    (_, index) => ({
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
    }),
  );
  const analysis = evaluateSurvivalMemory({
    records: [...recoveredNearRuin, ...controlledScars],
    stateFingerprint: current,
  });

  assert.equal(analysis.scarCount, 47);
  assert.equal(analysis.nearRuinCount, 21);
  assert.ok(analysis.averageSurvivalCost < 30);
  assert.equal(analysis.recoveryBurden, 10);
  assert.equal(analysis.status, "scarred");
  assert.equal(analysis.recommendation, "act_with_reduced_size");
  assert.ok(analysis.survivalConfidence >= 70);
  assert.ok(analysis.missingEvidence.includes("Reduced-size survival review"));
});

test("survival memory does not hard-gate on an isolated severe outlier when aggregate recovery is controlled", () => {
  const current = fingerprintSurvivalState({
    venue: "BINANCE",
    action: "buy",
    regime: "rotation",
  });
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
  const comfortable: SurvivalMemoryRecord[] = Array.from(
    { length: 19 },
    (_, index) => ({
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
    }),
  );
  const analysis = evaluateSurvivalMemory({
    records: [severeOutlier, ...comfortable],
    stateFingerprint: current,
  });

  assert.equal(analysis.nearRuinCount, 1);
  assert.equal(analysis.severeNearRuinRate, 5);
  assert.equal(analysis.status, "watch");
  assert.equal(analysis.recommendation, "act_with_reduced_size");
  assert.equal(analysis.exposureMultiplier, 1);
  assert.ok(analysis.survivalConfidence > 70);
  assert.equal(
    analysis.missingEvidence.includes("Survival memory clearance"),
    false,
  );
});

test("survival memory remains clear when matching history survived comfortably", () => {
  const state = {
    venue: "NYSE",
    regime: "low-vol",
    action: "buy",
    riskPressure: 15,
  };
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

  assert.equal(analysis.status, "clear");
  assert.equal(analysis.recommendation, "act");
  assert.equal(analysis.exposureMultiplier, 1);
  assert.deepEqual(analysis.missingEvidence, []);
  assert.equal(scarWeightForOutcome("comfortable_survival", 2), 0);
});

test("empty survival memory is explicit and deterministic", () => {
  const analysis = evaluateSurvivalMemory();

  assert.equal(analysis.status, "empty");
  assert.equal(analysis.recordCount, 0);
  assert.equal(analysis.survivalConfidence, 100);
  assert.equal(
    analysis.reasons[0],
    "No survival memory records are available yet.",
  );
});

test("prebuilt fingerprints and alternate actions are normalized", () => {
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

  assert.equal(record.timestamp, "1970-01-01T00:00:00.000Z");
  assert.equal(record.action, "exit");
  assert.equal(record.maxExposure, 40);
  assert.equal(record.recoveryTimeBars, 120);
  assert.equal(record.outcomeClass, "barely_survived");
});

test("state fingerprints include booleans, arrays, and ignore empty keys", () => {
  const fingerprint = fingerprintSurvivalState({
    active: true,
    inactive: false,
    tags: ["tail risk", "liquidity"],
    empty: "",
    missing: undefined,
    "": "ignored",
    nested: { ignored: true },
  });

  assert.ok(fingerprint.includes("active:true"));
  assert.ok(fingerprint.includes("inactive:false"));
  assert.ok(fingerprint.includes("tags:tail-risk"));
  assert.ok(fingerprint.includes("tags:liquidity"));
  assert.equal(fingerprint.includes("ignored"), false);
});

test("survival scoring handles non-finite defensive inputs", () => {
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
      {
        ...unknown,
        id: "high-cost",
        stateFingerprint: "different:state",
        outcomeClass: "stressed_survival",
        survivalCost: 72,
        scarWeight: 0.2,
        maxDrawdown: 12,
        maxAdverseExcursion: 14,
      },
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
  const analysis = evaluateSurvivalMemory({
    records: [],
    currentState: { venue: null },
    similarityThreshold: Number.NaN,
  });

  assert.equal(cost, 0);
  assert.equal(scarWeight, 0.55);
  assert.equal(watch.action, "watch");
  assert.equal(emptySimilarity.currentStateSimilarity, 0);
  assert.equal(highAverageCost.exposureMultiplier, 0.25);
  assert.equal(severeCluster.exposureMultiplier, 0);
  assert.equal(analysis.status, "empty");
  assert.equal(fingerprintSurvivalState({}), "survival:unknown");
});
