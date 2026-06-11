import { describe, expect, it } from "vitest";
import {
  type MarketReliabilitySource,
  applyReliabilityToMetricInputs,
  capReliabilityConfidence,
  capReliabilityExposure,
  evaluateMarketReliability,
  shouldUseDefensiveReliabilityPosture,
} from "./market-reliability";

const now = Date.parse("2026-05-28T14:30:00.000Z");

function stock(overrides: Record<string, any> = {}) {
  return {
    ticker: "AAA",
    price: 100,
    volume: 1_000_000,
    updatedAt: now - 10_000,
    quoteStatus: "available",
    signalStatus: "provided",
    history: [
      {
        date: "2026-05-26",
        open: 98,
        high: 101,
        low: 97,
        close: 100,
        volume: 900_000,
      },
      {
        date: "2026-05-27",
        open: 100,
        high: 102,
        low: 99,
        close: 101,
        volume: 1_000_000,
      },
    ],
    ...overrides,
  };
}

function source(
  overrides: Partial<MarketReliabilitySource> = {},
): MarketReliabilitySource {
  return {
    market: "US",
    marketStatus: "Open",
    stocks: [
      stock({ ticker: "AAA" }),
      stock({ ticker: "BBB", price: 42 }),
      stock({ ticker: "CCC", price: 18 }),
    ],
    avgRisk: 36,
    avgQuality: 68,
    breadth: 45,
    confidence: 72,
    targetExposure: 35,
    survivalScore: 74,
    failureFlags: [],
    staleData: false,
    hasBacktestData: true,
    hasProvidedSignals: true,
    backtestTradeCount: 40,
    backtestSharpe: 1.1,
    backtestMaxDrawdownPct: 8,
    backtestProfitFactor: 1.5,
    backtestWinRatePct: 55,
    backtestReturnPct: 12,
    lastSuccessfulSync: now - 10_000,
    exchangeSynchronized: true,
    now,
    ...overrides,
  };
}

describe("stocks optimizer market reliability policy", () => {
  it("keeps a synchronized closed venue healthy while explaining the pause", () => {
    const result = evaluateMarketReliability(
      source({ marketStatus: "Closed" }),
    );

    expect(result.status).toBe("healthy");
    expect(result.confidenceCap).toBe(100);
    expect(result.market.venueStatus).toBe("closed");
    expect(result.market.synchronizationStatus).toBe("synced");
    expect(result.market.explanation).toContain("venue is closed");
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "VENUE_CLOSED",
    );
  });

  it("does not coerce closed signal-only coverage into invalid price ranges", () => {
    const stocks = Array.from({ length: 4 }, (_, index) => ({
      ticker: `ADX${index}`,
      price: index === 0 ? "" : null,
      volume: null,
      quoteStatus: "paused",
      signalStatus: "provided",
      signalConfidence: 62,
      history: [],
    }));
    const result = evaluateMarketReliability(
      source({
        market: "ADX",
        marketStatus: "Closed",
        stocks,
        expectedAssetCount: stocks.length,
        lastSuccessfulSync: null,
        breadth: 0,
      }),
    );

    expect(result.status).not.toBe("invalid");
    expect(result.market.rejectedAssets).toBe(0);
    expect(result.market.primaryIssues).not.toContain("Invalid field ranges");
    expect(result.diagnostics.map((item) => item.code)).not.toContain(
      "FIELD_OUT_OF_RANGE",
    );
  });

  it("treats a closed venue with listed but unquoted assets as insufficient instead of invalid", () => {
    const stocks = Array.from({ length: 4 }, (_, index) => ({
      ticker: `WAIT${index}`,
      price: null,
      quoteStatus: "paused",
      signalStatus: "missing",
      history: [],
    }));
    const result = evaluateMarketReliability(
      source({
        marketStatus: "Closed",
        stocks,
        expectedAssetCount: stocks.length,
        hasProvidedSignals: false,
        lastSuccessfulSync: null,
      }),
    );

    expect(result.status).toBe("insufficient");
    expect(result.market.rejectedAssets).toBe(stocks.length);
    expect(result.market.primaryIssues).not.toContain("Invalid field ranges");
    expect(result.diagnostics.map((item) => item.code)).not.toContain(
      "FIELD_OUT_OF_RANGE",
    );
  });

  it("marks an open market with stale records as stale", () => {
    const result = evaluateMarketReliability(
      source({
        staleData: true,
        stocks: [
          stock({ ticker: "OLD1", updatedAt: now - 600_000 }),
          stock({
            ticker: "OLD2",
            updatedAt: new Date(now - 600_000).toISOString(),
          }),
        ],
        expectedAssetCount: 2,
      }),
    );

    expect(result.status).toBe("stale");
    expect(result.confidenceCap).toBeLessThanOrEqual(75);
    expect(result.market.defensiveMode).toBe(true);
    expect(result.market.synchronizationStatus).toBe("stale");
  });

  it("detects missing OHLCV fields, missing volume, duplicate candles, and low synchronized samples", () => {
    const result = evaluateMarketReliability(
      source({
        stocks: [
          stock({
            ticker: "BAD",
            volume: null,
            history: [
              { date: "2026-05-27", open: 10, close: 11 },
              {
                date: "2026-05-27",
                open: 10,
                high: 11,
                low: 9,
                close: 10,
                volume: 20,
              },
            ],
          }),
        ],
        expectedAssetCount: 1,
      }),
      { minSynchronizedSamples: 3, requireVolume: true },
    );

    expect(result.market.missingVolume).toBe(1);
    expect(result.market.missingOhlcv).toBe(1);
    expect(result.market.duplicateCandles).toBe(1);
    expect(result.market.lowSynchronizedSamples).toBe(1);
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "MISSING_VOLUME",
        "MISSING_OHLCV",
        "DUPLICATED_CANDLES",
        "LOW_SYNCHRONIZED_CANDLE_COUNT",
      ]),
    );
  });

  it("distinguishes insufficient coverage and low breadth from bearish signals", () => {
    const result = evaluateMarketReliability(
      source({
        breadth: 0,
        expectedAssetCount: 10,
        stocks: [stock({ ticker: "ONLY" })],
      }),
    );

    expect(result.status).toBe("insufficient");
    expect(result.market.primaryIssues).toEqual(
      expect.arrayContaining(["Low ticker coverage"]),
    );
    expect(result.market.primaryIssues).not.toContain(
      "Low breadth participation",
    );
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "BREADTH_PARTICIPATION_LOW",
          severity: "info",
        }),
      ]),
    );
    expect(result.market.explanation).toContain("Insufficient data");
  });

  it("keeps high coverage market data healthy when only a small tail is unavailable", () => {
    const unavailable = (ticker: string) => ({
      ticker,
      price: null,
      volume: null,
      quoteStatus: "unavailable",
      source: "tradingview-unavailable:empty",
      signalStatus: "missing",
      history: [],
    });
    const stocks = [
      ...Array.from({ length: 68 }, (_, index) =>
        stock({
          ticker: `OK${index}`,
          price: 10 + index,
          signalStatus: "missing",
        }),
      ),
      unavailable("MISS1"),
      unavailable("MISS2"),
      unavailable("MISS3"),
    ];
    const result = evaluateMarketReliability(
      source({
        market: "ADX",
        stocks,
        expectedAssetCount: 71,
        breadth: 0,
      }),
    );

    expect(result.status).toBe("healthy");
    expect(result.confidenceCap).toBe(100);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.market.synchronizationStatus).toBe("synced");
    expect(result.market.validAssets).toBe(68);
    expect(result.market.rejectedAssets).toBe(3);
    expect(result.market.missingVolume).toBe(0);
    expect(result.market.lowSynchronizedSamples).toBe(0);
    expect(result.market.primaryIssues).not.toContain(
      "Low breadth participation",
    );
    expect(result.market.primaryIssues).not.toContain("Partial API failure");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PARTIAL_API_FAILURE",
          severity: "info",
          observed: 3,
        }),
      ]),
    );
  });

  it("activates defensive mode for desync, partial API failure, fallback, and synthetic data", () => {
    const result = evaluateMarketReliability(
      source({
        exchangeSynchronized: false,
        fallbackMode: true,
        partialApiFailures: 1,
        stocks: [
          stock({
            ticker: "PENDING",
            quoteStatus: "pending",
            source: "pending",
          }),
          stock({ ticker: "PAUSED", quoteStatus: "paused", source: "paused" }),
          stock({
            ticker: "FAIL",
            quoteStatus: "unavailable",
            source: "tradingview-failed:502",
          }),
          stock({ ticker: "FALL", quoteSource: "fallback-cache" }),
          stock({
            ticker: "SYN",
            sourceFile: "mock-data.json",
            name: "Demo asset",
          }),
        ],
        expectedAssetCount: 5,
      }),
    );

    expect(result.status).toBe("insufficient");
    expect(shouldUseDefensiveReliabilityPosture(result)).toBe(true);
    expect(result.market.fallbackMode).toBe(true);
    expect(result.market.syntheticDataDetected).toBe(true);
    expect(result.market.partialApiFailures).toBeGreaterThan(1);
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "EXCHANGE_DESYNCHRONIZED",
        "PARTIAL_API_FAILURE",
        "FALLBACK_MODE_ACTIVE",
        "SYNTHETIC_DATA_DETECTED",
      ]),
    );
  });

  it("renders missing data as uncertainty and caps downstream confidence", () => {
    const reliability = evaluateMarketReliability(
      source({
        stocks: [
          { ticker: "MISSING", quoteStatus: "unavailable", source: "failed" },
        ],
        expectedAssetCount: 4,
        hasProvidedSignals: false,
      }),
    );
    const metrics = applyReliabilityToMetricInputs(
      [
        {
          key: "dataReliability",
          value: 0,
          raw: 0,
          confidence: 100,
          detail: "Raw 0.0%",
        },
        { key: "modelConfidence", value: 80, raw: 80, confidence: 100 },
        { key: "trendStrength", value: 80, raw: 80, confidence: 90 },
      ],
      reliability,
    );

    expect(reliability.status).toBe("invalid");
    expect(metrics[0].raw).toContain("Market data is invalid or unavailable");
    expect(metrics[0].value).toBe(0);
    expect(metrics[1].value).toBeLessThanOrEqual(reliability.score);
    expect(metrics[2].value).toBe(80);
    expect(
      metrics.every(
        (metric) => (metric.confidence ?? 100) <= reliability.confidenceCap,
      ),
    ).toBe(true);
    expect(capReliabilityConfidence(75, reliability)).toBe(
      reliability.confidenceCap,
    );
    expect(capReliabilityConfidence(null, reliability)).toBeNull();
    expect(capReliabilityExposure(50, reliability)).toBe(
      50 * (reliability.confidenceCap / 100),
    );
    expect(capReliabilityExposure(Number.NaN, reliability)).toBe(0);
  });

  it("handles open healthy data and invalid price ranges deterministically", () => {
    const healthy = evaluateMarketReliability(source());
    const invalid = evaluateMarketReliability(
      source({
        stocks: [stock({ ticker: "ZERO", price: 0, history: [101, 102] })],
        expectedAssetCount: 1,
      }),
    );

    expect(healthy.status).toBe("healthy");
    expect(healthy.market.venueStatus).toBe("open");
    expect(invalid.status).toBe("invalid");
    expect(invalid.market.rejectedAssets).toBe(1);
    expect(invalid.diagnostics.map((item) => item.code)).toContain(
      "FIELD_OUT_OF_RANGE",
    );
  });

  it("uses a reliable fallback quote field instead of treating a blank price as zero", () => {
    const result = evaluateMarketReliability(
      source({
        stocks: [
          stock({
            ticker: "FALLBACK",
            price: "",
            last: "105",
            quoteStatus: "available",
            signalStatus: "missing",
            history: [104, 105],
          }),
        ],
        expectedAssetCount: 1,
        hasProvidedSignals: false,
      }),
    );

    expect(result.status).toBe("healthy");
    expect(result.market.validAssets).toBe(1);
    expect(result.market.rejectedAssets).toBe(0);
    expect(result.diagnostics.map((item) => item.code)).not.toContain(
      "FIELD_OUT_OF_RANGE",
    );
  });

  it("accepts valid Binance dust and fiat-denominated crypto prices", () => {
    const result = evaluateMarketReliability(
      source({
        market: "BINANCE",
        stocks: [
          stock({
            ticker: "ADXBTC",
            price: 8.7e-7,
            history: [8.5e-7, 8.7e-7],
            signalStatus: "missing",
          }),
          stock({
            ticker: "BTCIDR",
            price: 1_310_431_087,
            history: [1_300_000_000, 1_310_431_087],
            signalStatus: "missing",
          }),
          stock({
            ticker: "BTCTRY",
            price: 3_386_240,
            history: [3_350_000, 3_386_240],
            signalStatus: "missing",
          }),
        ],
        expectedAssetCount: 3,
        hasProvidedSignals: false,
      }),
    );

    expect(result.status).toBe("healthy");
    expect(result.market.validAssets).toBe(3);
    expect(result.market.rejectedAssets).toBe(0);
    expect(result.diagnostics.map((item) => item.code)).not.toContain(
      "FIELD_OUT_OF_RANGE",
    );
    expect(result.diagnostics.map((item) => item.code)).not.toContain(
      "FIELD_OUTLIER",
    );
  });

  it("explains degraded source quality and accepts Date timestamps", () => {
    const result = evaluateMarketReliability(
      source({
        stocks: [
          stock({
            ticker: "DATE",
            updatedAt: new Date(now - 1_000),
            sourceQuality: 40,
          }),
        ],
        expectedAssetCount: 1,
      }),
    );

    expect(result.status).toBe("degraded");
    expect(result.market.explanation).toContain("degraded source quality");
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "SOURCE_QUALITY_DEGRADED",
    );
  });

  it("falls back to evaluation time when records have no timestamp", () => {
    const result = evaluateMarketReliability(
      source({
        lastSuccessfulSync: null,
        stocks: [
          {
            ticker: "TIMELESS",
            price: 22,
            volume: 300,
            quoteStatus: "available",
            signalStatus: "provided",
            history: [21, 22],
          },
        ],
        expectedAssetCount: 1,
      }),
    );

    expect(result.status).toBe("healthy");
    expect(result.metadata.validCount).toBe(1);
  });

  it("normalizes sparse identifiers, source labels, invalid timestamps, and uncapped metric confidence", () => {
    const result = evaluateMarketReliability({
      ...source(),
      now: undefined,
      expectedAssetCount: undefined,
      lastSuccessfulSync: null,
      stocks: [
        {
          symbol: "SYM",
          last: 33,
          regularMarketVolume: 10,
          syncedAt: "bad-date",
          timestamp: new Date("bad-date"),
          source: "synthetic-feed",
          quoteStatus: "available",
        },
        {
          name: "Named source",
          close: 34,
          quoteVolume: 20,
          quoteStatus: "provided",
          history: [
            {
              time: "2026-05-28T14:00:00.000Z",
              open: 33,
              high: 35,
              low: 32,
              close: 34,
              volume: 20,
            },
            {
              timestamp: "2026-05-28T14:01:00.000Z",
              open: 34,
              high: 36,
              low: 33,
              close: 35,
              volume: 21,
            },
            { note: "non-candle metadata" },
          ],
        },
        {
          ticker: "   ",
          regularMarketPrice: 35,
          volume: 40,
          quoteStatusReason: "timeout fallback",
          history: [],
        },
        {
          ticker: "BLOCKED",
          price: 36,
          volume: 50,
          quoteStatus: "blocked",
          history: [35, 36],
        },
        {
          price: 37,
          volume: 60,
          history: [36, 37],
        },
      ],
    });
    const adjusted = applyReliabilityToMetricInputs(
      [{ key: "trendStrength", value: 60, raw: 60 }],
      result,
    );

    expect(result.metadata.inputCount).toBe(5);
    expect(adjusted[0].confidence).toBe(result.confidenceCap);
    expect(
      capReliabilityExposure(50, {
        ...result,
        confidenceCap: Number.POSITIVE_INFINITY,
      }),
    ).toBe(0);
  });

  it("handles malformed stock collections as invalid market data", () => {
    const result = evaluateMarketReliability({
      ...source(),
      stocks: null as unknown as Array<Record<string, any>>,
    });

    expect(result.status).toBe("invalid");
    expect(result.metadata.inputCount).toBe(0);
  });

  it("handles undefined market codes and invalid numeric fields", () => {
    const result = evaluateMarketReliability(
      source({
        market: undefined,
        stocks: [
          stock({
            ticker: "BADNUM",
            price: "not-a-number",
            history: ["bad", "worse"],
          }),
        ],
        expectedAssetCount: 1,
      }),
    );

    expect(result.status).toBe("healthy");
    expect(result.market.validAssets).toBe(1);
  });
});
