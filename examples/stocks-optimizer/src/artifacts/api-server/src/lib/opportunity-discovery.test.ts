import assert from "node:assert/strict";
import test from "node:test";
import {
  type StockBar,
  type StockOpportunityCandidate,
  type StockOpportunitySignal,
  discoverStockOpportunities,
} from "./opportunity-discovery";

function bars(start: number, drift: number, volume = 100_000): StockBar[] {
  let close = start;
  return Array.from({ length: 42 }, (_, index) => {
    close = Math.max(1, close * (1 + drift + Math.sin(index / 5) * 0.003));
    return {
      date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
      close,
      high: close * 1.01,
      low: close * 0.99,
      volume: volume + index * 1_250,
    };
  });
}

function signal(
  overrides: Partial<StockOpportunitySignal>,
): StockOpportunitySignal {
  return {
    symbol: "AAA",
    signalAction: "Hold",
    signalStatus: "provided",
    signalConfidence: 60,
    suggestedExposure: 0,
    maxPositionPct: 5,
    setupQuality: 60,
    riskPressure: 35,
    trendQuality: 60,
    timingQuality: 58,
    expectedMove: 1,
    price: 100,
    volume: 120_000,
    history: [95, 96, 97, 98, 100],
    ...overrides,
  };
}

test("ranks improving candidates, stores evidence, and emits adaptive sizing diagnostics", () => {
  const signals = [
    signal({
      symbol: "AAA",
      signalAction: "Buy",
      suggestedExposure: 1,
      setupQuality: 86,
      riskPressure: 18,
      expectedMove: 4,
    }),
    signal({
      symbol: "BBB",
      signalAction: "Buy",
      suggestedExposure: 2,
      setupQuality: 82,
      riskPressure: 22,
      expectedMove: 3,
    }),
    signal({
      symbol: "CCC",
      signalAction: "Hold",
      setupQuality: 66,
      riskPressure: 30,
      expectedMove: 2,
    }),
    signal({
      symbol: "DDD",
      signalStatus: "active",
      setupQuality: 70,
      riskPressure: 28,
      expectedMove: 1.5,
    }),
    signal({
      symbol: "EEE",
      signalStatus: "closed",
      setupQuality: 72,
      riskPressure: 26,
      expectedMove: 1.2,
    }),
    signal({
      symbol: "FFF",
      signalAction: "Sell",
      setupQuality: 30,
      riskPressure: 78,
      expectedMove: -3,
    }),
  ];
  const barsBySymbol = new Map([
    ["AAA", bars(80, 0.008, 200_000)],
    ["BBB", bars(60, 0.007, 180_000)],
    ["CCC", bars(40, 0.004, 140_000)],
    ["DDD", bars(70, 0.003, 130_000)],
    ["EEE", bars(90, 0.002, 120_000)],
    ["FFF", bars(50, -0.006, 80_000)],
  ]);
  const result = discoverStockOpportunities({
    market: "NASDAQ",
    signals,
    barsBySymbol,
    trades: [
      { symbol: "AAA", returnPct: 4 },
      { symbol: "BBB", returnPct: 2 },
      { symbol: "FFF", returnPct: -3 },
    ],
    systemTrust: 88,
    perceptionAlignment: 82,
  });

  assert.equal(result.candidates.length, 6);
  assert.equal(result.candidates[0].rank, 1);
  assert.equal(
    result.candidates[0].candidateScore >= result.candidates[1].candidateScore,
    true,
  );
  assert.equal(result.density.density > 0, true);
  assert.equal(result.diagnostics.eligibleCount > 0, true);
  assert.equal(result.discovery.metadata.module, "discovery");
  assert.equal(result.discovery.opportunities.length > 0, true);
  assert.equal(
    result.discovery.explanation.supportingEvidence.length > 0,
    true,
  );
  assert.equal(result.discovery.lifecycle.status !== "none", true);
  assert.equal(result.discovery.recommendedNextStep.length > 0, true);
  assert.equal(
    result.findings.some((finding) => finding.findingId.startsWith("feature:")),
    true,
  );
  assert.equal(
    result.findings.some(
      (finding) => finding.findingId === "almost-qualified:persistence",
    ),
    true,
  );
  assert.equal(
    result.candidates.some((candidate) =>
      candidate.evidence.some((item) => item.startsWith("Explorer insight:")),
    ),
    true,
  );

  const buy = result.candidates.find((candidate) => candidate.symbol === "AAA");
  assert.ok(buy);
  assert.equal(buy.adaptiveSizing.sizingRationale.length, 4);
  assert.equal(buy.discovery?.candidateId, "AAA");
  assert.equal((buy.discovery?.supportingEvidence?.length ?? 0) > 0, true);
  assert.equal(
    buy.progression.some(
      (point) => point.stage === "Eligible" || point.stage === "Sized",
    ),
    true,
  );
  assert.equal(
    buy.evidence.some((item) => item.includes("strategy signal")),
    true,
  );

  const closed = result.candidates.find(
    (candidate) => candidate.symbol === "EEE",
  );
  assert.equal(closed?.lifecycle, "Closed");
  assert.equal(closed?.progression.at(-1)?.stage, "Closed");
});

test("uses previous candidate progression, object bars, and fallback histories deterministically", () => {
  const previous: StockOpportunityCandidate[] = discoverStockOpportunities({
    signals: [signal({ symbol: "AAA", setupQuality: 55, expectedMove: 0.5 })],
    barsBySymbol: { AAA: bars(50, 0.001) },
  }).candidates;
  const result = discoverStockOpportunities({
    market: "BINANCE",
    signals: [
      signal({
        symbol: "AAA",
        setupQuality: 68,
        expectedMove: 2,
        suggestedExposure: 0,
      }),
      signal({
        symbol: undefined,
        ticker: "GGG",
        setupQuality: 44,
        riskPressure: 42,
        expectedMove: -0.2,
        history: [],
        maxPositionPct: 0,
      }),
      signal({
        symbol: "ZERO",
        ticker: "ZERO",
        setupQuality: 50,
        riskPressure: 45,
        expectedMove: 0,
        history: [10],
        volume: 0,
      }),
      signal({ symbol: "", ticker: "", setupQuality: 99 }),
    ],
    barsBySymbol: {
      AAA: bars(50, 0.006),
      ZERO: bars(20, 0).map((bar) => ({ ...bar, volume: 0 })),
    },
    previousCandidates: previous,
    trades: [],
  });

  const aaa = result.candidates.find((candidate) => candidate.symbol === "AAA");
  const ggg = result.candidates.find((candidate) => candidate.symbol === "GGG");

  assert.equal(result.candidates.length, 3);
  assert.equal(result.discovery.memory.sampleSize >= 0, true);
  assert.equal(
    result.discovery.missingEvidence.includes("similar closed outcomes"),
    true,
  );
  assert.equal(
    result.density.trend === "improving" || result.density.trend === "flat",
    true,
  );
  assert.equal(aaa?.previousScore, previous[0].candidateScore);
  assert.equal((aaa?.scoreVelocity ?? 0) > 0, true);
  assert.equal(["Detected", "Emerging"].includes(ggg?.lifecycle ?? ""), true);
  assert.equal(
    ggg?.adaptiveSizing.decision !== "allowed" || ggg.adaptiveSizing.size >= 0,
    true,
  );
});

test("generic Discovery flags weak breadth without changing candidate output", () => {
  const result = discoverStockOpportunities({
    market: "BINANCE",
    signals: [
      signal({
        symbol: "WEAK1",
        signalAction: "Hold",
        setupQuality: 25,
        riskPressure: 82,
        expectedMove: -3,
        history: [10, 9, 8],
      }),
      signal({
        symbol: "WEAK2",
        signalAction: "Sell",
        setupQuality: 28,
        riskPressure: 85,
        expectedMove: -2,
        history: [12, 11, 10],
      }),
    ],
    barsBySymbol: {
      WEAK1: bars(20, -0.006, 10_000),
      WEAK2: bars(30, -0.005, 8_000),
    },
  });

  assert.equal(result.candidates.length, 2);
  assert.equal(
    result.discovery.explanation.contradictoryEvidence.some(
      (item) => item.label === "Weak breadth confirmation",
    ),
    true,
  );
});

test("long-history discovery improves regime awareness without opening zero-cap sizing", () => {
  const historyDiagnostics = {
    symbolCount: 1,
    requestedYears: 15,
    historyCoverageYears: 15,
    coveragePct: 100,
    historyDepthScore: 96,
    regimeCoverageScore: 92,
    regimeDiversityScore: 90,
    sampleDiversityScore: 88,
    temporalConcentrationScore: 12,
    coverageStatus: "full" as const,
    currentRegime: "recovery" as const,
    keyRegimesCovered: [
      "bull" as const,
      "bear" as const,
      "crash" as const,
      "recovery" as const,
      "volatility_transition" as const,
    ],
    regimeCounts: {
      bull: 1000,
      bear: 800,
      crash: 120,
      recovery: 500,
      volatility_transition: 240,
    },
    totalBars: 3780,
    auditQualityScore: 100,
    auditWarnings: [],
    explanation:
      "Extended history improves regime awareness and calibration. Recent outcomes still govern sizing restoration.",
  };
  const result = discoverStockOpportunities({
    market: "NASDAQ",
    signals: [
      signal({
        symbol: "SAFE",
        signalAction: "Buy",
        suggestedExposure: 5,
        maxPositionPct: 0,
        setupQuality: 88,
        riskPressure: 20,
        expectedMove: 4,
      }),
    ],
    barsBySymbol: { SAFE: bars(100, 0.006, 180_000) },
    historyDiagnostics,
  });
  const candidate = result.candidates[0];

  assert.equal(result.diagnostics.regimeCoverageScore, 92);
  assert.equal(result.discovery.regimeCoverageScore, 92);
  assert.equal(candidate.adaptiveSizing.size, 0);
  assert.equal(candidate.adaptiveSizing.audit.maxCapacity, 0);
  assert.ok(candidate.factors.regimeTransition > 60);
});

test("long-history discovery can derive regime states from regime counts", () => {
  const result = discoverStockOpportunities({
    signals: [
      signal({
        symbol: "COUNTED",
        signalAction: "Buy",
        suggestedExposure: undefined,
        maxPositionPct: undefined,
        setupQuality: 82,
        riskPressure: 24,
        expectedMove: 3,
      }),
    ],
    barsBySymbol: { COUNTED: bars(100, 0.005, 160_000) },
    historyDiagnostics: {
      symbolCount: 1,
      requestedYears: 15,
      historyCoverageYears: 15,
      coveragePct: 100,
      historyDepthScore: 50,
      regimeCoverageScore: 76,
      regimeDiversityScore: 74,
      sampleDiversityScore: 73,
      temporalConcentrationScore: 18,
      coverageStatus: "partial",
      currentRegime: "bull" as const,
      keyRegimesCovered: [],
      regimeCounts: { bull: 50, recovery: 25 },
      totalBars: 900,
      auditQualityScore: 92,
      auditWarnings: [],
      explanation:
        "Regime counts are available even without key regime labels.",
    },
  });

  assert.equal(result.discovery.regimeCoverageScore, 76);
  assert.ok(
    result.discovery.contextMatch.some((match) =>
      match.label.includes("regime context"),
    ),
  );
});

test("long-history discovery handles missing regime counts conservatively", () => {
  const result = discoverStockOpportunities({
    signals: [
      signal({ symbol: "NOCOUNTS", signalAction: "Hold", setupQuality: 58 }),
    ],
    historyDiagnostics: {
      symbolCount: 1,
      requestedYears: 10,
      historyCoverageYears: 4,
      coveragePct: 40,
      historyDepthScore: 54,
      regimeCoverageScore: 40,
      regimeDiversityScore: 38,
      sampleDiversityScore: 42,
      temporalConcentrationScore: 30,
      coverageStatus: "partial",
      currentRegime: "bear" as const,
      keyRegimesCovered: [],
      regimeCounts: undefined as any,
      totalBars: 200,
      auditQualityScore: 70,
      auditWarnings: [],
      explanation: "History is sparse and regime counts are not available.",
    },
  });

  assert.equal(result.discovery.regimeCoverageScore, 40);
  assert.ok(
    result.discovery.missingEvidence.includes(
      "broader long-history regime coverage",
    ),
  );
});

test("generic Discovery handles sparse prior outcomes and constraint fallbacks", () => {
  const previous = discoverStockOpportunities({
    signals: [
      signal({ symbol: "SPARSE", setupQuality: 52, expectedMove: 0.4 }),
    ],
    barsBySymbol: { SPARSE: bars(30, 0.001) },
  }).candidates;
  const result = discoverStockOpportunities({
    signals: [
      signal({
        symbol: "SPARSE",
        signalAction: "Buy",
        setupQuality: 72,
        riskPressure: 64,
        expectedMove: 2,
      }),
    ],
    barsBySymbol: { SPARSE: bars(32, 0.004) },
    previousCandidates: previous,
    trades: [{ profitPct: 0 }, { symbol: "LOSS", profitPct: -2 }],
    needs: [
      {
        needId: "need-wait",
        category: "wait",
        severity: 85,
        confidence: 62,
        explanation: undefined as unknown as string,
        recommendations: [],
      },
    ],
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(
    result.discovery.missingEvidence.includes("similar closed outcomes"),
    true,
  );
  assert.equal(
    result.discovery.contextMatch.some((match) =>
      match.label.includes("previous context"),
    ),
    true,
  );
  assert.equal(result.discovery.recommendedNextStep.length > 0, true);
});

test("generic Discovery remains safe for empty dashboard input", () => {
  const result = discoverStockOpportunities({ signals: [] });

  assert.equal(result.candidates.length, 0);
  assert.equal(result.discovery.status, "none");
  assert.equal(result.discovery.metadata.module, "discovery");
  assert.equal(result.discovery.missingEvidence.length > 0, true);
});
