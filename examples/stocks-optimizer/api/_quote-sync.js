const { setCache } = require("./_quote-cache.js");

function marketKey(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeSymbol(value) {
  return String(value || "").trim();
}

function normalizeBinanceSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^BINANCE:/, "")
    .replace(/\.P$/, "")
    .replace(/[^A-Z0-9]/g, "");
}

function parseTradingViewCsv(csv) {
  const normalized = String(csv || "").trim().replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = normalized.split("\n").filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index];
    });

    return row;
  });
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 stocks-optimizer"
    }
  });

  if (!response.ok) {
    const error = new Error(`Request failed ${response.status}: ${url}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function quoteFromBinanceRow(symbol, row, source) {
  const binanceSymbol = normalizeBinanceSymbol(symbol);

  const price = numberOrNull(row?.lastPrice);
  const change = numberOrNull(row?.priceChange);
  const changePercent = numberOrNull(row?.priceChangePercent);
  const volume = numberOrNull(row?.volume);
  const quoteVolume = numberOrNull(row?.quoteVolume);

  return {
    symbol,
    ticker: symbol,
    binanceSymbol,
    name: symbol,
    market: "BINANCE",
    exchange: "BINANCE",
    price,
    last: price,
    change,
    changePercent,
    percentChange: changePercent,
    volume,
    quoteVolume,
    high: numberOrNull(row?.highPrice),
    low: numberOrNull(row?.lowPrice),
    open: numberOrNull(row?.openPrice),
    previousClose: numberOrNull(row?.prevClosePrice),
    currency: binanceSymbol.endsWith("USDT") ? "USDT" : null,
    updatedAt: new Date().toISOString(),
    source
  };
}

async function fetchBinanceEndpointQuotes(symbols, url, source) {
  const rows = await fetchJson(url);
  const bySymbol = new Map();

  for (const row of rows) {
    bySymbol.set(String(row.symbol).toUpperCase(), row);
  }

  return symbols.map((symbol) => {
    const binanceSymbol = normalizeBinanceSymbol(symbol);
    const row = bySymbol.get(binanceSymbol);

    if (!row) {
      return {
        symbol,
        ticker: symbol,
        binanceSymbol,
        name: symbol,
        market: "BINANCE",
        exchange: "BINANCE",
        price: null,
        last: null,
        change: null,
        changePercent: null,
        percentChange: null,
        volume: null,
        updatedAt: new Date().toISOString(),
        source: `${source}-missing`
      };
    }

    return quoteFromBinanceRow(symbol, row, source);
  });
}

async function fetchTradingViewQuotes(market, symbols, reason = null) {
  const baseUrl =
    process.env.TRADINGVIEW_DATA_BASE_URL ||
    "https://tradingview-data.vercel.app/api/chart-data";

  async function fetchOne(symbol) {
    const url = new URL(baseUrl);
    url.searchParams.set("symbol", String(symbol || "").trim());
    url.searchParams.set("bars", "2");

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 stocks-optimizer"
      }
    });

    if (!response.ok) {
      return {
        symbol,
        ticker: symbol,
        name: symbol,
        market,
        exchange: market,
        price: null,
        last: null,
        change: null,
        changePercent: null,
        percentChange: null,
        volume: null,
        updatedAt: new Date().toISOString(),
        source: `tradingview-failed:${response.status}${reason ? `:${reason}` : ""}`
      };
    }

    const csv = await response.text();
    const rows = parseTradingViewCsv(csv);

    const lastRow = rows[rows.length - 1] || {};
    const previousRow = rows[rows.length - 2] || {};

    const close = numberOrNull(lastRow.Close);
    const previousClose = numberOrNull(previousRow.Close);

    const change =
      close !== null && previousClose !== null
        ? close - previousClose
        : null;

    const changePercent =
      close !== null && previousClose !== null && previousClose !== 0
        ? ((close - previousClose) / previousClose) * 100
        : null;

    return {
      symbol,
      ticker: symbol,
      name: symbol,
      market,
      exchange: market,
      price: close,
      last: close,
      change,
      changePercent,
      percentChange: changePercent,
      open: numberOrNull(lastRow.Open),
      high: numberOrNull(lastRow.High),
      low: numberOrNull(lastRow.Low),
      previousClose,
      volume: numberOrNull(lastRow.Volume),
      updatedAt: new Date().toISOString(),
      source: "tradingview-data"
    };
  }

  return Promise.all(symbols.map(fetchOne));
}

async function fetchBinanceQuotes(symbols) {
  const spotUrl =
    process.env.BINANCE_SPOT_BASE_URL ||
    "https://api.binance.com/api/v3/ticker/24hr";

  const futuresUrl =
    process.env.BINANCE_FUTURES_BASE_URL ||
    "https://fapi.binance.com/fapi/v1/ticker/24hr";

  try {
    return await fetchBinanceEndpointQuotes(symbols, spotUrl, "binance-spot");
  } catch (spotError) {
    try {
      return await fetchBinanceEndpointQuotes(symbols, futuresUrl, "binance-futures");
    } catch (_futuresError) {
      return fetchTradingViewQuotes(
        "BINANCE",
        symbols,
        `binance-blocked:${spotError.status || "unknown"}`
      );
    }
  }
}

async function syncMarketQuotes({ market, symbols }) {
  const normalizedMarket = marketKey(market);
  const uniqueSymbols = Array.from(
    new Set(symbols.map(normalizeSymbol).filter(Boolean))
  ).slice(0, 50);

  const quotes =
    normalizedMarket === "BINANCE"
      ? await fetchBinanceQuotes(uniqueSymbols)
      : await fetchTradingViewQuotes(normalizedMarket, uniqueSymbols);

  const payload = {
    market: normalizedMarket,
    quotes,
    data: quotes,
    items: quotes,
    syncedAt: Date.now()
  };

  await setCache(`quotes:${normalizedMarket}`, payload, 30);

  return payload;
}

module.exports = {
  syncMarketQuotes
};
