import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadBundledSemanticLexicon } from "../../../signal-framework";
import MarketPerceptionEngine from "../components/MarketPerceptionEngine";
import {
  MARKET_LAYER_DEFINITIONS,
  MarketStateEngine,
  buildMarketPerceptionMetrics,
  createDefaultMetricRegistry,
} from "./market-perception";

const source = {
  marketStatus: "Open" as const,
  stocks: [
    {
      ticker: "ADX",
      price: 28.4,
      changePercent: 2.2,
      history: [24, 24.3, 24.7, 25.2, 26.1, 27.4, 28.4],
      quoteStatus: "available",
      signalStatus: "provided",
      signalAction: "Buy",
      setupQuality: 78,
      trendQuality: 82,
      timingQuality: 74,
      riskPressure: 28,
      suggestedExposure: 5,
      expectedMove: 3.1,
      volumeExpansion: 76,
    },
    {
      ticker: "BETA",
      price: 42.1,
      changePercent: -0.4,
      history: [43, 42.8, 42.5, 42.4, 42.2, 42.3, 42.1],
      quoteStatus: "available",
      signalStatus: "provided",
      signalAction: "Hold",
      setupQuality: 54,
      trendQuality: 48,
      timingQuality: 52,
      riskPressure: 44,
      suggestedExposure: 2,
      expectedMove: 0.8,
      volumeExpansion: 48,
    },
    {
      ticker: "OMEGA",
      price: 18.7,
      changePercent: 1.1,
      history: [17.9, 18.1, 18.3, 18.2, 18.4, 18.5, 18.7],
      quoteStatus: "available",
      signalStatus: "provided",
      signalAction: "Buy",
      setupQuality: 68,
      trendQuality: 66,
      timingQuality: 64,
      riskPressure: 36,
      suggestedExposure: 3,
      expectedMove: 1.7,
      volumeExpansion: 62,
    },
  ],
  avgRisk: 36,
  avgQuality: 68,
  breadth: 72,
  confidence: 74,
  targetExposure: 58,
  survivalScore: 76,
  failureFlags: [],
  staleData: false,
  hasBacktestData: true,
  hasProvidedSignals: true,
  backtestTradeCount: 64,
  backtestSharpe: 1.24,
  backtestMaxDrawdownPct: 8.2,
  backtestProfitFactor: 1.7,
  backtestWinRatePct: 58,
  backtestReturnPct: 14.5,
  executionProfile: {
    spreadBps: 2,
    slippageBps: 1,
    rebalanceThresholdBps: 35,
    totalExposureCap: 75,
    riskAversion: 7,
  },
};

describe("market perception end-to-end integration", () => {
  it("produces a dashboard-safe snapshot from framework cognition output", async () => {
    const engine = new MarketStateEngine(createDefaultMetricRegistry());
    engine.setSource(source);

    const snapshot = await engine.ingest(buildMarketPerceptionMetrics(source), {
      market: "NASDAQ",
      timeframe: "live",
      timestamp: 1_800_000_000_000,
    });

    const layerKeys = Object.keys(MARKET_LAYER_DEFINITIONS);
    const semanticWords = new Set(loadBundledSemanticLexicon().entries.map((entry) => entry.word));
    const awarenessWords = new Set([
      "Uncalibrated",
      "Review-gated",
      "Self-aware",
      "Autonomous-ready",
      "Commitment blocked",
      "Human review",
      "Reduced autonomy",
      "Autonomy ready",
      "Observation only",
      "Calibration pending",
    ]);
    const auditLayerLabels = Object.values(snapshot.metrics).flatMap((metric) =>
      metric.layers.map((mapping) => MARKET_LAYER_DEFINITIONS[mapping.layer].label),
    );

    expect(Object.keys(snapshot.layers).sort()).toEqual(layerKeys.sort());
    expect(Object.values(snapshot.layers).every((layer) => semanticWords.has(layer.classification) || awarenessWords.has(layer.classification))).toBe(true);
    expect(auditLayerLabels).toContain("Survival");
    expect(snapshot.framework?.synchronization.venueState).toBe("LIVE_SYNCED");
    expect(snapshot.reliability?.status).toBe("healthy");
    expect(snapshot.reliability?.confidenceCap).toBe(100);
    expect(snapshot.framework?.executionReadiness.state).toMatch(/Constructive|Expanding|Extended|Emerging/);
    expect(snapshot.framework?.rankings[0]?.id).toBe("ADX");
    expect(snapshot.framework?.needs.length).toBeGreaterThan(0);
    expect(snapshot.framework?.opportunities.length).toBeGreaterThan(0);
    expect(snapshot.framework?.opportunityDensity.density).toBeGreaterThanOrEqual(0);
  });

  it("server-renders the perception component without the metric-layer label crash", async () => {
    const engine = new MarketStateEngine(createDefaultMetricRegistry());
    engine.setSource(source);
    const snapshot = await engine.ingest(buildMarketPerceptionMetrics(source), {
      market: "NASDAQ",
      timeframe: "live",
      timestamp: 1_800_000_000_000,
    });

    expect(() => renderToString(<MarketPerceptionEngine snapshot={snapshot} />)).not.toThrow();
    expect(renderToString(<MarketPerceptionEngine snapshot={snapshot} />)).toContain("Metric registry and raw calculation audit");
  });

  it("surfaces system self-awareness instead of generic resilience when agency diagnostics are present", async () => {
    const engine = new MarketStateEngine(createDefaultMetricRegistry());
    engine.setSource(source);
    const snapshot = await engine.ingest(buildMarketPerceptionMetrics(source), {
      market: "BINANCE",
      timeframe: "live",
      timestamp: 1_800_000_000_000,
    });

    const html = renderToString(
      <MarketPerceptionEngine
        snapshot={snapshot}
        agencyLevel={{
          recommendation: "act_with_reduced_size",
          trustPct: 62,
          traceCount: 6,
          allowedActions: 6,
          blockedActions: 0,
          missingOutcomes: 0,
          dataReliabilityPct: 1,
          calibrationHealthPct: 1,
          overfitRiskPct: 0,
        }}
      />,
    );

    expect(html).toContain("System Self-Awareness");
    expect(html).toContain("Reduced autonomy");
    expect(html).toContain("System self-awareness");
    expect(html).toContain("Agency recommendation: act with reduced size.");
    expect(html).toContain("System Self-Awareness<!-- --> is the dominant layer at <!-- -->96<!-- -->/100.");
    expect(html).toContain("Agency-informed self-awareness 96/100.");
  });

  it("minimizes residual overfit risk to zero when readiness-adjusted robustness clears tolerance", async () => {
    const robustSource = {
      ...source,
      robustnessOverfitRisk: 91,
      robustnessScore: 85,
      deploymentReadinessScore: 83,
    };
    const engine = new MarketStateEngine(createDefaultMetricRegistry());
    engine.setSource(robustSource);
    const snapshot = await engine.ingest(buildMarketPerceptionMetrics(robustSource), {
      market: "BINANCE",
      timeframe: "live",
      timestamp: 1_800_000_000_000,
    });
    const overfitMetric = snapshot.metrics.overfitRisk;
    const overfitContributor = snapshot.layers.white.contributors.find((item) => item.metricKey === "overfitRisk");
    const html = renderToString(<MarketPerceptionEngine snapshot={snapshot} />);

    expect(overfitMetric.raw).toBe(0);
    expect(overfitContributor?.raw).toBe(0);
    expect(snapshot.framework?.diagnostics.overfitProbability).toBe(0);
    expect(html).toContain("Residual risk 0%");
    expect(html).toContain("reported risk 91%");
  });

  it("feeds readiness calibration into framework self-awareness", async () => {
    const calibratedSource = {
      ...source,
      calibrationRawConfidence: 90,
      calibrationCalibratedConfidence: 62,
      calibrationHistoricalAccuracy: 60,
      calibrationError: 30,
      calibrationTrustworthiness: 61,
      calibrationSampleSize: 42,
      calibrationStatus: "poor-calibration",
      calibrationWarnings: ["poor calibration", "overconfidence"],
    };
    const engine = new MarketStateEngine(createDefaultMetricRegistry());
    engine.setSource(calibratedSource);

    const snapshot = await engine.ingest(buildMarketPerceptionMetrics(calibratedSource), {
      market: "BINANCE",
      timeframe: "live",
      timestamp: 1_800_000_000_000,
    });

    expect(snapshot.framework?.calibration?.sampleSize).toBe(42);
    expect(snapshot.framework?.calibration?.warnings).toContain("poor calibration");
    expect(snapshot.metrics.calibrationQuality.detail).toContain("raw confidence 90%");
    expect(snapshot.layers.white.contributors.some((item) => item.metricKey === "memoryDepth")).toBe(true);
    expect(snapshot.layers.white.meaning).toContain("calibrated confidence");
  });
});
