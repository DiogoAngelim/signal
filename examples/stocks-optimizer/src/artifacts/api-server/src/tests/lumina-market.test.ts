import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getLuminaMarketQuote, getLuminaMarketHistory,
  luminaSymbol, LUMINA_MARKETS,
} from "../lib/lumina-market.js";

const now = Date.parse("2026-11-16T10:00:00.000Z");
const observedAt = new Date(now - 20_000).toISOString();

function makeFetcher(body: unknown, status = 200, capture?: (url: URL) => void) {
  const request = async (url: string | URL | Request) => {
    capture?.(new URL(String(url)));
    return new Response(JSON.stringify(body), {
      status, headers: { "content-type": "application/json" },
    });
  };
  return request as typeof fetch;
}
function quoteBody(input: Record<string, unknown> = {}) {
  return {
    quotes: [{
      symbol: "BTCUSDT",
      providerSymbol: "BTCUSDT",
      provider: "binance-public",
      source: "binance-public",
      timestamp: observedAt,
      close: 61000.20,
      open: 60000,
      realtime: true,
      delayed: false,
      reliability: { score: 0.86, confidence: "high" },
      ...input,
    }],
    errors: [], syncedAt: new Date(now - 1000).toISOString(),
  };
}

test("market scope is explicit; stocks and crypto have independent providers", () => {
  assert.equal(luminaSymbol("btcusdt"), "BTCUSDT");
  assert.equal(luminaSymbol("VALE3"), "VALE3");
  assert.equal(luminaSymbol("AAPL"), "AAPL");
  assert.equal(luminaSymbol("AAPL OR 1=1"), null);
  assert.equal(luminaSymbol("../secrets"), null);
  assert.equal(LUMINA_MARKETS.PETR4.tradingViewSymbol, "BMFBOVESPA:PETR4");
});

test("quotes use tradingview-data module, never a direct exchange request", async () => {
  let called: URL | null = null;
  const result = await getLuminaMarketQuote(
    "BTCUSDT", makeFetcher(quoteBody(), 200, (url) => { called = url; }), now,
  );
  assert.ok(called);
  assert.equal(called!.pathname, "/api/stocks/quotes");
  assert.equal(called!.searchParams.get("symbol"), "BTCUSDT");
  assert.equal(called!.searchParams.get("provider"), "binance-public");
  assert.equal(called!.searchParams.get("market"), "crypto");
  assert.equal(result.provider, "tradingview-data");
  assert.equal(result.underlyingProvider, "binance-public");
  assert.equal(result.status, "fresh");
  assert.equal(result.realtimeVerified, true);
  assert.equal(result.eligibleForLiveCalculations, true);
  assert.equal(result.price, 61000.20);
  assert.ok(result.change24hPercent !== null && result.change24hPercent > 0);
  assert.equal(result.quoteAt, observedAt);
});

test("TradingView guest quote is indicative even if recently synced", async () => {
  const stock = await getLuminaMarketQuote("PETR4", makeFetcher(quoteBody({
    symbol: "PETR4",
    providerSymbol: "BMFBOVESPA:PETR4",
    provider: "tradingview-remote",
    source: "tradingview-remote",
    timestamp: new Date(now - 5 * 60_000).toISOString(),
    close: 31.50,
    open: 30.50,
    realtime: true, // An upstream bug cannot promote a guest quote to realtime.
    delayed: false,
    reliability: { score: 0.45, confidence: "low" },
  })), now);
  assert.equal(stock.currency, "BRL");
  assert.equal(stock.provider, "tradingview-data");
  assert.equal(stock.status, "delayed");
  assert.equal(stock.realtimeVerified, false);
  assert.equal(stock.eligibleForLiveCalculations, false);
  assert.equal(stock.change24hPercent, null);
  assert.match(stock.note, /real-time entitlement is not verified/i);
});

test("a stale quote cannot be used for new live calculations", async () => {
  const stale = await getLuminaMarketQuote("BTCUSDT", makeFetcher(quoteBody({
    timestamp: new Date(now - 600_000).toISOString(),
  })), now);
  assert.equal(stale.status, "stale");
  assert.equal(stale.price, 61000.20);
  assert.equal(stale.eligibleForLiveCalculations, false);
  assert.equal(stale.change24hPercent, null);
});

test("provider substitutions, mismatched symbols, malformed data and errors fail closed", async () => {
  const swapped = await getLuminaMarketQuote("BTCUSDT", makeFetcher(quoteBody({
    provider: "static-fallback", source: "static-fallback",
  })), now);
  const wrong = await getLuminaMarketQuote("ETHUSDT", makeFetcher(quoteBody()), now);
  const malformed = await getLuminaMarketQuote("BTCUSDT", makeFetcher({ quotes: [{ close: -10 }] }), now);
  const broken = await getLuminaMarketQuote("BTCUSDT", makeFetcher({ error: "offline" }, 502), now);
  const future = await getLuminaMarketQuote("BTCUSDT", makeFetcher(quoteBody({
    timestamp: new Date(now + 120000).toISOString(),
  })), now);
  for (const response of [swapped, wrong, malformed, broken, future]) {
    assert.equal(response.status, "unavailable");
    assert.equal(response.price, null);
    assert.equal(response.eligibleForLiveCalculations, false);
    assert.equal(response.provider, "tradingview-data");
  }
});

test("historical candles are sourced from the module and normalized without invention", async () => {
  const base = "2026-11-12T00:00:00.000Z";
  const bars = [
    { timestamp: base, symbol: "PETR4", providerSymbol: "BMFBOVESPA:PETR4", open: 29, high: 31, low: 28, close: 30, volume: 100 },
    { timestamp: "2026-11-13T00:00:00.000Z", symbol: "PETR4", providerSymbol: "BMFBOVESPA:PETR4", open: 30, high: 32, low: 29, close: 31, volume: 200 },
    { timestamp: base, symbol: "PETR4", providerSymbol: "BMFBOVESPA:PETR4", open: 29, high: 31, low: 28, close: 30, volume: 100 },
    { timestamp: "2026-11-14T00:00:00.000Z", symbol: "PETR4", providerSymbol: "BMFBOVESPA:PETR4", open: 90, high: 31, low: 28, close: 30, volume: 100 },
  ];
  let endpoint: URL | null = null;
  const history = await getLuminaMarketHistory("PETR4", 90,
    makeFetcher({
      provider: "tradingview-remote",
      source: "tradingview-remote",
      bars,
      syncedAt: new Date(now).toISOString(),
    }, 200, (url) => { endpoint = url; }), now);
  assert.ok(endpoint);
  assert.equal(endpoint!.pathname, "/api/stocks/history");
  assert.equal(endpoint!.searchParams.get("exchange"), "BMFBOVESPA");
  assert.equal(endpoint!.searchParams.get("bars"), "90");
  assert.equal(history.status, "available");
  assert.equal(history.bars.length, 2);
  assert.equal(history.bars[1].close, 31);
  assert.match(history.note, /not a return forecast/);
});

test("history rejects synthetic provider substitutions, insufficient samples and invalid counts", async () => {
  const valid = {
    timestamp: "2026-11-12T00:00:00.000Z", symbol: "BTCUSDT",
    open: 100, high: 110, low: 90, close: 102, volume: 100,
  };
  const wrongProvider = await getLuminaMarketHistory("BTCUSDT", 90,
    makeFetcher({ provider: "static-fallback", source: "static-fallback", bars: [valid, valid] }), now);
  assert.equal(wrongProvider.status, "unavailable");
  assert.deepEqual(wrongProvider.bars, []);
  const oneBar = await getLuminaMarketHistory("BTCUSDT", 90,
    makeFetcher({ provider: "binance-public", source: "binance-public", bars: [valid] }), now);
  assert.equal(oneBar.status, "unavailable");
  const invalid = await getLuminaMarketHistory("BTCUSDT", 999,
    makeFetcher({ provider: "binance-public", source: "binance-public", bars: [valid, valid] }), now);
  assert.equal(invalid.status, "unavailable");
});

test("a live upstream 451 restriction is surfaced without host hopping or fake data", async () => {
  const result = await getLuminaMarketQuote("BTCUSDT", makeFetcher({
    quotes: [],
    errors: [{ symbol: "BTCUSDT", error: "Binance ticker failed: 451" }],
    syncedAt: new Date(now).toISOString(),
  }), now);
  assert.equal(result.status, "unavailable");
  assert.equal(result.price, null);
  assert.equal(result.eligibleForLiveCalculations, false);
  assert.match(result.note, /restricted access/);
});
