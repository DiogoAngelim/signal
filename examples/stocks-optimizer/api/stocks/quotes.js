const { getCache, acquireLock } = require("../_quote-cache.js");
const { syncMarketQuotes } = require("../_quote-sync.js");
const crypto = require("node:crypto");

function marketKey(value) {
  return String(value || "").trim().toUpperCase();
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return req.body;
}

function symbolKey(value) {
  return String(value || "").trim().toUpperCase();
}

function quoteSymbolKey(quote) {
  return symbolKey(quote?.symbol || quote?.ticker);
}

function quoteHasLivePrice(quote) {
  const value = Number(quote?.price ?? quote?.last ?? quote?.close);
  return Number.isFinite(value) && value > 0;
}

function coversRequestedSymbols(payload, symbols) {
  if (!symbols.length) return true;
  const available = new Set((payload?.quotes || []).map(quoteSymbolKey).filter(Boolean));
  return symbols.every((symbol) => available.has(symbolKey(symbol)));
}

function hasMissingRequestedQuote(payload, symbols) {
  if (!symbols.length) return false;
  const bySymbol = new Map((payload?.quotes || []).map((quote) => [quoteSymbolKey(quote), quote]));
  return symbols.some((symbol) => {
    const quote = bySymbol.get(symbolKey(symbol));
    return !quote || !quoteHasLivePrice(quote);
  });
}

function quotesForSymbols(payload, symbols) {
  const quotes = payload?.quotes || [];
  if (!symbols.length) return quotes;

  const bySymbol = new Map(quotes.map((quote) => [quoteSymbolKey(quote), quote]));
  return symbols.map((symbol) => bySymbol.get(symbolKey(symbol))).filter(Boolean);
}

function symbolsFingerprint(symbols) {
  return crypto
    .createHash("sha1")
    .update(symbols.map(symbolKey).sort().join("|"))
    .digest("hex")
    .slice(0, 16);
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
    const body = req.method === "POST" ? parseBody(req) : {};

    const market = marketKey(
      body.market ||
      body.exchange ||
      url.searchParams.get("market") ||
      url.searchParams.get("exchange") ||
      ""
    );

    const symbols = Array.isArray(body.symbols)
      ? body.symbols.map((symbol) => String(symbol).trim()).filter(Boolean)
      : [];

    if (!market) {
      res.status(400).json({ error: "MARKET_REQUIRED" });
      return;
    }

    let payload = await getCache(`quotes:${market}`);
    const coversRequest = coversRequestedSymbols(payload, symbols);
    const retryMissing = Number(body.retryCount ?? 0) > 0 || body.bypass === true;
    const hasMissingQuote = hasMissingRequestedQuote(payload, symbols);
    const isFresh = payload && Date.now() - payload.syncedAt < 10_000 && coversRequest && !(retryMissing && hasMissingQuote);

    if ((!isFresh || !payload) && symbols.length > 0) {
      const lock = await acquireLock(`lock:quotes:${market}:${symbolsFingerprint(symbols)}:v3`, 15);

      if (lock.acquired || !payload || !coversRequest || (retryMissing && hasMissingQuote)) {
        payload = await syncMarketQuotes({ market, symbols });
      }
    }

    const quotes = quotesForSymbols(payload, symbols);

    res.status(200).json({
      market,
      quotes,
      data: quotes,
      items: quotes,
      syncedAt: payload?.syncedAt || null,
      stale: !payload || Date.now() - payload.syncedAt > 15_000,
      count: quotes.length
    });
  } catch (error) {
    res.status(500).json({
      error: "QUOTES_READ_FAILED",
      message: error.message,
      stack: error.stack
    });
  }
};
