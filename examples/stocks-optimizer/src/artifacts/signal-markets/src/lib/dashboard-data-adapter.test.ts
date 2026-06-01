import { describe, expect, it } from "vitest";
import {
  parseDashboardMarketOptions,
  parseDashboardQuoteBatchResponse,
  parseDashboardStockListResponse,
  parseDashboardStrategyLiveMarket,
  parseDashboardTimeSeriesResponse,
} from "./dashboard-data-adapter";

describe("dashboard data adapter", () => {
  it("parses live market options from API payloads without static fallbacks", () => {
    const options = parseDashboardMarketOptions({
      data: [
        { code: "us", label: "US Equities", symbolCount: 8200 },
        { marketCode: "binance", displayName: "Binance Spot", total: 512 },
        { code: "" },
        { code: "US", label: "Duplicate should be ignored", count: 1 },
      ],
    });

    expect(options).toEqual([
      { code: "US", label: "US Equities", count: 8200 },
      { code: "BINANCE", label: "Binance Spot", count: 512 },
    ]);
  });

  it("parses stock lists and derives display fields from source rows", () => {
    const parsed = parseDashboardStockListResponse(
      {
        stocks: [
          {
            ticker: "aapl",
            description: "Apple Inc.",
            exchange: "NASDAQ",
            lastPrice: "205.40",
            regularMarketChangePercent: "1.25",
            history: [200, "202.5", null, -1],
          },
          { description: "missing symbol" },
        ],
        total: "1",
      },
      { market: "US", offset: 0, limit: 50 },
    );

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      symbol: "AAPL",
      ticker: "AAPL",
      name: "Apple Inc.",
      market: "NASDAQ",
      price: 205.4,
      changePercent: 1.25,
      history: [200, 202.5],
    });
    expect(parsed.total).toBe(1);
  });

  it("parses quote batches, unavailable symbols, and partial responses", () => {
    const parsed = parseDashboardQuoteBatchResponse(
      {
        market: "US",
        requestedSymbols: ["AAPL", "MSFT"],
        unavailableSymbols: ["MSFT"],
        quotes: [
          {
            symbol: "aapl",
            price: "205.40",
            changePercent: "-0.5",
            high52: "230",
            low52: "155",
          },
        ],
      },
      { market: "US", requestedSymbols: ["AAPL", "MSFT"] },
    );

    expect(parsed.partial).toBe(true);
    expect(parsed.unavailableSymbols).toEqual(["MSFT"]);
    expect(parsed.quotes[0]).toMatchObject({
      symbol: "AAPL",
      ticker: "AAPL",
      price: 205.4,
      changePercent: -0.5,
      high52: 230,
      low52: 155,
    });
  });

  it("keeps strategy recommendations and diagnostics sourced from backend output", () => {
    const parsed = parseDashboardStrategyLiveMarket({
      signals: [
        {
          symbol: "AAPL",
          action: "Buy",
          confidence: 78,
          summary: "Live strategy favors AAPL.",
        },
      ],
      regime: { state: "constructive" },
      opportunityDiscovery: { qualified: 4 },
      agencyDiagnostics: { trust: 71 },
      commitment: {
        source: "signal.commitment",
        summary: { totalRecommended: 420 },
        executionPlan: [{ symbol: "AAPL", commitmentAmount: 420 }],
      },
      summary: { recommendation: "Review AAPL" },
      decisionIntelligence: { confidence: 78 },
    });

    expect(parsed.signals).toEqual([
      {
        symbol: "AAPL",
        action: "Buy",
        confidence: 78,
        summary: "Live strategy favors AAPL.",
      },
    ]);
    expect(parsed.regime).toEqual({ state: "constructive" });
    expect(parsed.opportunityDiscovery).toEqual({ qualified: 4 });
    expect(parsed.agencyDiagnostics).toEqual({ trust: 71 });
    expect(parsed.commitment).toEqual({
      source: "signal.commitment",
      summary: { totalRecommended: 420 },
      executionPlan: [{ symbol: "AAPL", commitmentAmount: 420 }],
    });
    expect(parsed.summary).toEqual({ recommendation: "Review AAPL" });
    expect(parsed.decisionIntelligence).toEqual({ confidence: 78 });
  });

  it("parses portfolio and backtest time series arrays from real response keys", () => {
    expect(
      parseDashboardTimeSeriesResponse({
        history: [{ timestamp: 1, equity: 1000 }],
      }).data,
    ).toEqual([{ timestamp: 1, equity: 1000 }]);

    expect(
      parseDashboardTimeSeriesResponse({
        trades: [{ symbol: "AAPL", pnl: 12 }],
      }).data,
    ).toEqual([{ symbol: "AAPL", pnl: 12 }]);
  });
});
