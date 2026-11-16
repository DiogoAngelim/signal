import assert from "node:assert/strict";
import { test } from "node:test";
import { getLuminaMarketQuote, luminaSymbol, LUMINA_MARKETS } from "../lib/lumina-market.js";

const now = Date.parse("2026-11-16T10:00:00.000Z");
function makeFetcher(value: unknown, status = 200) {
  const fn = async () => new Response(JSON.stringify(value), {
    status, headers: { "content-type": "application/json" },
  });
  return fn as typeof fetch;
}
test("the Lúmina market universe is explicit and non-injectable", () => {
  assert.equal(luminaSymbol("btcusdt"), "BTCUSDT");
  assert.equal(luminaSymbol("ETHUSDT"), "ETHUSDT");
  assert.equal(luminaSymbol("../secrets"), null);
  assert.equal(luminaSymbol("AAPL"), null);
  assert.equal(LUMINA_MARKETS.BTCUSDT.tradingViewSymbol, "BINANCE:BTCUSDT");
});
test("fresh Binance evidence includes source, timestamp and no execution", async () => {
  const quote = await getLuminaMarketQuote("BTCUSDT", makeFetcher({
    symbol: "BTCUSDT", lastPrice: "61000.20", priceChangePercent: "1.2",
    closeTime: now - 20000,
  }), now);
  assert.equal(quote.status, "fresh");
  assert.equal(quote.price, 61000.20);
  assert.equal(quote.eligibleForLiveCalculations, true);
  assert.equal(quote.provider, "Binance Spot public API");
  assert.equal(quote.quoteAt, new Date(now - 20000).toISOString());
  assert.equal("executed" in quote, false);
});
test("stale observations fail closed instead of displaying a fresh signal", async () => {
  const quote = await getLuminaMarketQuote("BTCUSDT", makeFetcher({
    symbol: "BTCUSDT", lastPrice: "123", priceChangePercent: "-1",
    closeTime: now - 600000,
  }), now);
  assert.equal(quote.status, "stale");
  assert.equal(quote.eligibleForLiveCalculations, false);
  assert.match(quote.note, /stale/i);
});
test("network errors and malformed payloads never invent a market price", async () => {
  const wrong = await getLuminaMarketQuote("ETHUSDT", makeFetcher({
    symbol: "BTCUSDT", lastPrice: "2200", priceChangePercent: "0",
    closeTime: now - 2000,
  }), now);
  assert.equal(wrong.status, "unavailable");
  assert.equal(wrong.price, null);
  const broken = await getLuminaMarketQuote("ETHUSDT", (() => {
    throw new Error("provider offline");
  }) as typeof fetch, now);
  assert.equal(broken.status, "unavailable");
  assert.equal(broken.eligibleForLiveCalculations, false);
});
