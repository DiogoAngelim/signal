import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStockRecognitionDiagnostics,
  buildStockRecognitionInput,
} from "./stock-recognition";

function signal(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "AAA",
    ticker: "AAA",
    signalAction: "Hold",
    allocationAction: "Blocked",
    signalStatus: "blocked",
    setupQuality: 82,
    riskPressure: 18,
    signalConfidence: 78,
    calibratedConfidence: 78,
    diagnostic: { rawAction: "Buy" },
    judgement: {
      similarSampleSize: 18,
      reliability: 86,
      outcomeStability: 88,
      evidence: {
        similarStates: 18,
        positiveOutcomes: 16,
        negativeOutcomes: 2,
        neutralOutcomes: 0,
      },
    },
    ...overrides,
  };
}

function trades(count = 18) {
  return Array.from({ length: count }, (_, index) => ({
    id: `trade-${index + 1}`,
    rawAction: "Buy",
    setupQuality: 82 + (index % 2),
    riskPressure: 18,
    confidence: 78,
    returnPct: index < count - 2 ? 4 : -1,
  }));
}

test("stock Recognition adapter attaches generic diagnostics without changing signal actions", () => {
  const source = [signal()];
  const result = applyStockRecognitionDiagnostics({
    market: "BINANCE",
    signals: source,
    trades: trades(),
    summary: { readinessScore: 88, dataReliability: { score: 95 } },
    opportunityDiscovery: {
      density: { density: 76, quality: 80 },
      candidates: [{ symbol: "AAA", candidateScore: 82 }],
      discovery: {
        confidence: 30,
        novelty: 90,
        memory: { similarOutcomes: 0, reliability: 20 },
      },
    },
  });

  assert.equal(result.signals[0]?.signalAction, "Hold");
  assert.equal(result.signals[0]?.allocationAction, "Blocked");
  assert.equal(result.signals[0]?.recognition.verdict, "recognized");
  assert.equal(result.recognitionDiagnostics.verdictCounts.recognized, 1);
  assert.equal(
    result.recognitionDiagnostics.primary?.metadata.module,
    "recognition",
  );
});

test("stock Recognition adapter keeps insufficient evidence explicit when history is missing", () => {
  const result = applyStockRecognitionDiagnostics({
    market: "ADX",
    signals: [signal({ judgement: undefined })],
    trades: [],
    opportunityDiscovery: {
      candidates: [{ symbol: "AAA", candidateScore: 82 }],
      discovery: {
        confidence: 28,
        novelty: 85,
        memory: { similarOutcomes: 0 },
      },
    },
  });

  assert.equal(result.signals[0]?.recognition.verdict, "insufficient_evidence");
  assert.ok(
    result.signals[0]?.recognition.missingEvidence.includes(
      "historical state samples",
    ),
  );
  assert.equal(
    result.recognitionDiagnostics.verdictCounts.insufficient_evidence,
    1,
  );
});

test("stock Recognition uses long-history regime coverage for historical similarity confidence", () => {
  const base = applyStockRecognitionDiagnostics({
    market: "NASDAQ",
    signals: [signal({ judgement: undefined })],
    trades: [],
    opportunityDiscovery: {
      candidates: [{ symbol: "AAA", candidateScore: 82 }],
      discovery: {
        confidence: 28,
        novelty: 85,
        memory: { similarOutcomes: 0 },
      },
    },
  });
  const extended = applyStockRecognitionDiagnostics({
    market: "NASDAQ",
    signals: [signal({ judgement: undefined })],
    trades: [],
    summary: {
      historyDiagnostics: {
        historyCoverageYears: 15,
        historyDepthScore: 96,
        regimeCoverageScore: 94,
        regimeDiversityScore: 91,
        sampleDiversityScore: 89,
        coverageStatus: "full",
        currentRegime: "recovery",
        keyRegimesCovered: [
          "bull",
          "bear",
          "crash",
          "recovery",
          "volatility_transition",
        ],
        regimeCounts: {
          bull: 1000,
          bear: 700,
          crash: 100,
          recovery: 400,
          volatility_transition: 250,
        },
      },
    },
    opportunityDiscovery: {
      candidates: [{ symbol: "AAA", candidateScore: 82 }],
      discovery: {
        confidence: 28,
        novelty: 85,
        memory: { similarOutcomes: 0 },
      },
    },
  });
  const baseRecognition = base.signals[0]?.recognition;
  const extendedRecognition = extended.signals[0]?.recognition;

  assert.ok((extendedRecognition?.historicalSimilarityConfidence ?? 0) >= 85);
  assert.ok(
    (extendedRecognition?.recurrenceConfidence ?? 0) >
      (baseRecognition?.recurrenceConfidence ?? 0),
  );
  assert.equal(
    extended.recognitionDiagnostics.signals[0]?.historicalSimilarityConfidence,
    extendedRecognition?.historicalSimilarityConfidence,
  );
});

test("stock Recognition derives history samples from regime counts when labels are absent", () => {
  const result = applyStockRecognitionDiagnostics({
    market: "NASDAQ",
    signals: [signal({ judgement: undefined })],
    trades: [],
    summary: {
      historyDiagnostics: {
        historyCoverageYears: 12,
        historyDepthScore: 82,
        regimeCoverageScore: 76,
        regimeDiversityScore: 74,
        sampleDiversityScore: 72,
        coverageStatus: "partial",
        currentRegime: "sideways",
        regimeCounts: { bull: 15, recovery: 7 },
      },
    },
    opportunityDiscovery: {
      candidates: [{ symbol: "AAA", candidateScore: 76 }],
      discovery: {
        confidence: 34,
        novelty: 80,
        memory: { similarOutcomes: 0 },
      },
    },
  });
  const recognition = result.signals[0]?.recognition;

  assert.ok((recognition?.historicalSimilarityConfidence ?? 0) > 0);
  assert.equal(
    result.recognitionDiagnostics.signals[0]?.historicalSimilarityConfidence,
    recognition?.historicalSimilarityConfidence,
  );
});

test("stock Recognition handles count-free history diagnostics as neutral evidence", () => {
  const result = applyStockRecognitionDiagnostics({
    market: "NASDAQ",
    signals: [signal({ judgement: undefined })],
    trades: [],
    summary: {
      historyDiagnostics: {
        historyCoverageYears: 8,
        historyDepthScore: 75,
        regimeCoverageScore: 68,
        regimeDiversityScore: 66,
        sampleDiversityScore: 64,
        coverageStatus: "partial",
        keyRegimesCovered: ["bull"],
      },
    },
    opportunityDiscovery: {
      candidates: [{ symbol: "AAA", candidateScore: 70 }],
      discovery: {
        confidence: 32,
        novelty: 78,
        memory: { similarOutcomes: 0 },
      },
    },
  });

  assert.ok(
    (result.signals[0]?.recognition.historicalSimilarityConfidence ?? 0) > 0,
  );
  assert.ok(result.signals[0]?.recognition.archetype.length);
});

test("stock Recognition tolerates zero-count history diagnostics", () => {
  const result = applyStockRecognitionDiagnostics({
    market: "NASDAQ",
    signals: [signal({ judgement: undefined })],
    trades: [],
    summary: {
      historyDiagnostics: {
        historyCoverageYears: 8,
        historyDepthScore: 75,
        regimeCoverageScore: 68,
        regimeDiversityScore: 66,
        sampleDiversityScore: 64,
        coverageStatus: "partial",
        keyRegimesCovered: [],
        regimeCounts: { bull: 0 },
      },
    },
  });

  assert.ok(result.signals[0]?.recognition.missingEvidence.length);
});

test("stock Recognition handles missing history regime counts", () => {
  const result = applyStockRecognitionDiagnostics({
    market: "NASDAQ",
    signals: [signal({ judgement: undefined })],
    trades: [],
    summary: {
      historyDiagnostics: {
        historyCoverageYears: 8,
        historyDepthScore: 70,
        coverageStatus: "partial",
        keyRegimesCovered: [],
      },
    },
  });

  assert.ok(result.signals[0]?.recognition.missingEvidence.length);
});

test("stock Recognition defaults sparse history diagnostic scores", () => {
  const result = applyStockRecognitionDiagnostics({
    market: "NASDAQ",
    signals: [signal({ judgement: undefined })],
    trades: [],
    summary: {
      historyDiagnostics: {
        historyCoverageYears: 8,
        coverageStatus: "partial",
        keyRegimesCovered: ["bull"],
      },
    },
    opportunityDiscovery: {
      candidates: [{ symbol: "AAA", candidateScore: 70 }],
      discovery: {
        confidence: 32,
        novelty: 78,
        memory: { similarOutcomes: 0 },
      },
    },
  });

  assert.ok(
    (result.signals[0]?.recognition.historicalSimilarityConfidence ?? 0) >= 0,
  );
  assert.ok(result.signals[0]?.recognition.archetype.length);
});

test("stock Recognition reads history diagnostics from robustness diagnostics fallback", () => {
  const result = applyStockRecognitionDiagnostics({
    market: "NASDAQ",
    signals: [signal({ judgement: undefined })],
    trades: [],
    summary: {
      robustnessDiagnostics: {
        historyDiagnostics: {
          historyCoverageYears: 8,
          historyDepthScore: 78,
          regimeCoverageScore: 72,
          regimeDiversityScore: 70,
          sampleDiversityScore: 68,
          coverageStatus: "partial",
          keyRegimesCovered: ["bear"],
        },
      },
    },
  });

  assert.ok(
    (result.signals[0]?.recognition.historicalSimilarityConfidence ?? 0) >= 0,
  );
});

test("stock Recognition accepts strong aggregate Judgement as a guarded archetype", () => {
  const result = applyStockRecognitionDiagnostics({
    market: "BINANCE",
    signals: [
      signal({
        symbol: "SOLUSDT",
        ticker: "SOLUSDT",
        setupQuality: 100,
        riskPressure: 7,
        calibratedConfidence: 52,
        judgement: {
          similarSampleSize: 1049,
          reliability: 80,
          outcomeStability: 77,
          overfitRisk: 29,
          evidence: {
            similarStates: 1049,
            positiveOutcomes: 999,
            negativeOutcomes: 50,
            neutralOutcomes: 0,
          },
        },
      }),
    ],
    trades: [],
    summary: {
      strategyReadiness: { components: { dataReliability: { score: 100 } } },
    },
    opportunityDiscovery: {
      density: { density: 46, quality: 56 },
      candidates: [{ symbol: "SOLUSDT", candidateScore: 100 }],
      discovery: {
        confidence: 30,
        novelty: 93,
        memory: { similarOutcomes: 0, reliability: 20 },
        missingEvidence: ["Discovery evidence is not yet broad enough."],
      },
    },
  });

  const recognition = result.signals[0]?.recognition;
  assert.equal(recognition?.verdict, "recognized");
  assert.equal(recognition?.matchedSamples, 1049);
  assert.equal(recognition?.matchedPositiveOutcomes, 999);
  assert.equal(recognition?.matchedNegativeOutcomes, 50);
  assert.equal(recognition?.discoveryNoveltyJustified, false);
  assert.equal(recognition?.judgementSimilarityJustified, true);
  assert.ok((recognition?.noveltyScore ?? 100) < 35);
  assert.deepEqual(recognition?.missingEvidence, []);
});

test("stock Recognition rejects weak aggregate Judgement linkage", () => {
  const result = applyStockRecognitionDiagnostics({
    market: "BINANCE",
    signals: [
      signal({
        judgement: {
          similarSampleSize: 1049,
          reliability: 52,
          outcomeStability: 77,
          evidence: {
            similarStates: 1049,
            positiveOutcomes: 999,
            negativeOutcomes: 50,
            neutralOutcomes: 0,
          },
        },
      }),
    ],
    trades: [],
    summary: {
      strategyReadiness: { components: { dataReliability: { score: 100 } } },
    },
    opportunityDiscovery: {
      candidates: [{ symbol: "AAA", candidateScore: 82 }],
      discovery: {
        confidence: 30,
        novelty: 90,
        memory: { similarOutcomes: 0 },
      },
    },
  });

  assert.notEqual(result.signals[0]?.recognition.verdict, "recognized");
  assert.equal(
    result.signals[0]?.recognition.judgementSimilarityJustified,
    false,
  );
});

test("stock Recognition labels guarded aggregate Judgement archetypes by outcome mix", () => {
  const stableNegative = buildStockRecognitionInput({
    signal: signal({
      judgement: {
        similarSampleSize: 24,
        reliability: 84,
        evidence: {
          similarStates: 24,
          consistency: 76,
          positiveOutcomes: 2,
          negativeOutcomes: 20,
          neutralOutcomes: 2,
        },
      },
    }),
    trades: [],
    opportunityDiscovery: {
      discovery: {
        confidence: 32,
        novelty: 88,
        memory: { similarOutcomes: 0 },
      },
    },
  });
  const mixed = buildStockRecognitionInput({
    signal: signal({
      judgement: {
        similarSampleSize: 24,
        reliability: 84,
        outcomeStability: 76,
        evidence: {
          similarStates: 24,
          positiveOutcomes: 9,
          negativeOutcomes: 8,
          neutralOutcomes: 7,
        },
      },
    }),
    trades: [],
    summary: { dataReliability: { score: 95 } },
    opportunityDiscovery: {
      discovery: {
        confidence: 32,
        novelty: 88,
        memory: { similarOutcomes: 0 },
      },
    },
  });

  assert.equal(stableNegative.archetypes?.[0]?.label, "stable_negative_state");
  assert.equal(stableNegative.archetypes?.[0]?.negativeOutcomes, 20);
  assert.equal(mixed.archetypes?.[0]?.label, "mixed_recurring_state");
  assert.equal(mixed.archetypes?.[0]?.sampleSize, 24);
});

test("stock Recognition rejects aggregate Judgement when market data reliability is weak", () => {
  const input = buildStockRecognitionInput({
    signal: signal({
      judgement: {
        similarSampleSize: 1049,
        reliability: 80,
        outcomeStability: 77,
        evidence: {
          similarStates: 1049,
          positiveOutcomes: 999,
          negativeOutcomes: 50,
          neutralOutcomes: 0,
        },
      },
    }),
    trades: [],
    summary: { dataReliability: { score: 60 } },
    opportunityDiscovery: {
      discovery: {
        confidence: 30,
        novelty: 90,
        memory: { similarOutcomes: 0 },
      },
    },
  });

  assert.deepEqual(input.archetypes, []);
});

test("stock Recognition input remains state-oriented and can use raw action intent", () => {
  const input = buildStockRecognitionInput({
    signal: signal(),
    trades: trades(3),
    summary: {
      strategyReadiness: { components: { dataReliability: { score: 92 } } },
    },
    opportunityDiscovery: {
      density: { density: 66, quality: 81 },
      discovery: { confidence: 40, novelty: 80 },
    },
  });

  assert.equal(input.currentState?.actionIntent, "Buy");
  assert.equal(input.currentState?.setupQuality, 82);
  assert.equal(input.perception?.dataReliability, 92);
  assert.equal(input.outcomeSamples?.length, 3);
});

test("stock Recognition adapter covers fallback sources without changing decisions", () => {
  const empty = applyStockRecognitionDiagnostics({
    market: "EMPTY",
    signals: [],
  });
  const fallbackSignal = signal({
    symbol: undefined,
    ticker: "BBB",
    diagnostic: {},
    signalAction: "Buy",
    calibratedConfidence: undefined,
    signalConfidence: 75,
    opportunityDiscovery: {
      discovery: { confidence: 61, novelty: 40 },
    },
    judgement: {
      similarSampleSize: 4,
      reliability: 60,
      outcomeStability: 50,
      survivalMemory: { matchedCount: 2 },
    },
  });
  const namelessSignal = signal({
    symbol: undefined,
    ticker: undefined,
    diagnostic: {},
    signalAction: "Buy",
    calibratedConfidence: undefined,
    signalConfidence: 75,
  });
  const result = applyStockRecognitionDiagnostics({
    market: "FALLBACK",
    signals: [fallbackSignal, namelessSignal],
    trades: [],
    summary: { dataReliability: { score: 88 } },
    opportunityDiscovery: { density: { quality: 60 } },
  });

  assert.equal(empty.recognitionDiagnostics.primary, null);
  assert.equal(result.recognitionDiagnostics.signals[0]?.symbol, "BBB");
  assert.equal(result.recognitionDiagnostics.signals[1]?.symbol, "");
  assert.deepEqual(
    result.signals.map((item) => item.signalAction),
    ["Buy", "Buy"],
  );
});

test("stock Recognition input normalizes action, outcome, and archetype fallbacks", () => {
  const fallbackInput = buildStockRecognitionInput({
    signal: signal({
      symbol: undefined,
      ticker: "BBB",
      diagnostic: {},
      signalAction: "Buy",
      calibratedConfidence: undefined,
      signalConfidence: 75,
      opportunityDiscovery: {
        discovery: { confidence: 61, novelty: 40 },
      },
      judgement: {
        similarSampleSize: 4,
        reliability: 60,
        outcomeStability: 50,
        survivalMemory: { matchedCount: 2 },
      },
    }),
    trades: [
      { tradeId: "profit", action: "Buy", profitPct: 2, signalConfidence: 60 },
      { action: "Buy", value: -1 },
      { score: 0 },
      {},
    ],
    summary: {
      dataReliability: { score: 88 },
      recovery: { status: "recovering" },
    },
  });
  const signalDiscoveryInput = buildStockRecognitionInput({
    signal: signal({
      opportunityDiscovery: {
        discovery: { confidence: 64, novelty: 36 },
      },
    }),
    candidate: { candidateScore: 77 },
  });
  const allocationInput = buildStockRecognitionInput({
    signal: { allocationAction: "Sell", rawConfidence: 70 },
    trades: [{}],
  });
  const emptyRawActionInput = buildStockRecognitionInput({
    signal: { diagnostic: { rawAction: "" }, rawConfidence: 70 },
    trades: [{}],
  });
  const holdInput = buildStockRecognitionInput({
    signal: {},
  });
  const negativeArchetypeInput = buildStockRecognitionInput({
    signal: signal(),
    candidate: { candidateScore: 50 },
    trades: [{ returnPct: -1 }, { profitPct: -2 }],
  });
  const compactRecoveryInput = buildStockRecognitionInput({
    signal: signal({
      recovery: {
        status: "recovering",
        mode: "reduced-size",
        recoveryScore: 53,
        trustedCapacity: 36,
        recommendedExposureCap: 1.9,
        confidenceCapLift: 0.5,
        audit: { noisyNestedDiagnostics: true },
      },
    }),
  });
  const emptyRecoveryInput = buildStockRecognitionInput({
    signal: signal({ recovery: { audit: { noisyNestedDiagnostics: true } } }),
  });
  const arrayRecoveryInput = buildStockRecognitionInput({
    signal: signal({ recovery: [] }),
  });

  assert.equal(fallbackInput.discovery?.confidence, 61);
  assert.equal(signalDiscoveryInput.discovery?.confidence, 64);
  assert.deepEqual(fallbackInput.survivalMemory, { matchedCount: 2 });
  assert.equal(fallbackInput.currentState?.signalConfidence, 75);
  assert.equal(fallbackInput.perception?.dataReliability, 88);
  assert.deepEqual(fallbackInput.recovery, { status: "recovering" });
  assert.deepEqual(
    fallbackInput.outcomeSamples?.map((item) => item.success),
    [true, false, null, null],
  );
  assert.deepEqual(
    fallbackInput.outcomeSamples?.map((item) => item.archetype),
    [
      "stable_positive_state",
      "stable_negative_state",
      "mixed_recurring_state",
      "mixed_recurring_state",
    ],
  );
  assert.deepEqual(fallbackInput.archetypes, []);
  assert.equal(allocationInput.currentState?.actionIntent, "Sell");
  assert.equal(
    allocationInput.outcomeSamples?.[0]?.state?.actionIntent,
    "Sell",
  );
  assert.equal(emptyRawActionInput.currentState?.actionIntent, "");
  assert.equal(
    emptyRawActionInput.outcomeSamples?.[0]?.state?.actionIntent,
    "Buy",
  );
  assert.equal(holdInput.currentState?.actionIntent, "Hold");
  assert.equal(
    negativeArchetypeInput.archetypes?.[0]?.label,
    "stable_negative_state",
  );
  assert.equal(negativeArchetypeInput.archetypes?.[0]?.confidence, 50);
  assert.deepEqual(compactRecoveryInput.recovery, {
    status: "recovering",
    mode: "reduced-size",
    recoveryScore: 53,
    trustedCapacity: 36,
    recommendedExposureCap: 1.9,
    confidenceCapLift: 0.5,
  });
  assert.equal(emptyRecoveryInput.recovery, null);
  assert.equal(arrayRecoveryInput.recovery, null);
});
