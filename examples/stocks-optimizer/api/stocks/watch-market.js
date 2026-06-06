const { getCache, setCache, acquireLock } = require("../_quote-cache.js");
const { syncMarketQuotes } = require("../_quote-sync.js");

function marketKey(value) {
  return String(value || "").trim().toUpperCase();
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return req.body;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const body = parseBody(req);

    const market = marketKey(body.market || body.exchange || "");
    const symbols = Array.isArray(body.symbols)
      ? body.symbols.map((symbol) => String(symbol).trim()).filter(Boolean)
      : [];

    if (!market) {
      res.status(400).json({ error: "MARKET_REQUIRED" });
      return;
    }

    await setCache(
      `active-market:${market}`,
      {
        market,
        symbols,
        updatedAt: Date.now()
      },
      60 * 10
    );

    let payload = await getCache(`quotes:${market}`);
    const isFresh = payload && Date.now() - payload.syncedAt < 10_000;

    if ((!isFresh || !payload) && symbols.length > 0) {
      const lock = await acquireLock(`lock:quotes:${market}:v2`, 15);

      if (lock.acquired || !payload) {
        payload = await syncMarketQuotes({ market, symbols });
      }
    }

    const quotes = payload?.quotes || [];

    res.status(200).json({
      market,
      symbols,
      quotes,
      data: quotes,
      items: quotes,
      syncedAt: payload?.syncedAt || null,
      stale: !payload,
      count: quotes.length
    });
  } catch (error) {
    res.status(500).json({
      error: "WATCH_MARKET_FAILED",
      message: error.message,
      stack: error.stack
    });
  }
};
