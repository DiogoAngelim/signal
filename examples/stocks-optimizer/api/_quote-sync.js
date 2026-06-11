const { setCache } = require("./_quote-cache.js");

function marketKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeSymbol(value) {
  return String(value || "").trim();
}

const TRADINGVIEW_EXCHANGE_BY_MARKET = {
  ADX: "ADX",
  AMEX: "AMEX",
  DFM: "DFM",
  DXB: "DFM",
  B3: "BMFBOVESPA",
  BMFBOVESPA: "BMFBOVESPA",
  BINANCE: "BINANCE",
  LSE: "LSE",
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
};

const TRADINGVIEW_EXCHANGE_BY_SUFFIX = {
  AD: "ADX",
  AE: "DFM",
  SA: "BMFBOVESPA",
};

const TRADINGVIEW_SCANNER_BY_MARKET = {
  ADX: "uae",
  AMEX: "america",
  B3: "brazil",
  BINANCE: "crypto",
  BMFBOVESPA: "brazil",
  DFM: "uae",
  DXB: "uae",
  LSE: "uk",
  NASDAQ: "america",
  NYSE: "america",
};

const TRADINGVIEW_SCANNER_COLUMNS = [
  "name",
  "description",
  "close",
  "change",
  "change_abs",
  "volume",
  "open",
  "high",
  "low",
];

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function stripKnownSuffix(symbol) {
  return String(symbol || "").replace(/\.(AD|AE|SA)$/i, "");
}

function tradingViewExchangeFor(market, symbol) {
  const raw = normalizeSymbol(symbol);
  const suffix = raw.match(/\.([A-Z]{1,5})$/i)?.[1]?.toUpperCase();
  return (
    (suffix ? TRADINGVIEW_EXCHANGE_BY_SUFFIX[suffix] : null) ||
    TRADINGVIEW_EXCHANGE_BY_MARKET[marketKey(market)]
  );
}

function tradingViewSymbolCandidates(market, symbol) {
  const raw = normalizeSymbol(symbol);
  if (!raw) return [];
  if (raw.includes(":")) return [raw];

  const base = stripKnownSuffix(raw);
  const exchange = tradingViewExchangeFor(market, symbol);

  if (exchange) {
    return unique([
      `${exchange}:${base}`,
      base !== raw ? `${exchange}:${raw}` : "",
    ]);
  }

  return unique([raw, base !== raw ? base : ""]);
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
  const normalized = String(csv || "")
    .trim()
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
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
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, values.length) },
    worker,
  );
  await Promise.all(workers);
  return results;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 stocks-optimizer",
    },
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
    source,
  };
}

function unavailableQuote(symbol, market, source) {
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
    source,
  };
}

function unavailableQuotes(symbols, market, source) {
  return symbols.map((symbol) => unavailableQuote(symbol, market, source));
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
        ...unavailableQuote(symbol, "BINANCE", `${source}-missing`),
        binanceSymbol,
      };
    }

    return quoteFromBinanceRow(symbol, row, source);
  });
}

function quoteFromScannerRow(symbol, market, ticker, row) {
  const data = Array.isArray(row?.d) ? row.d : [];
  const close = numberOrNull(data[2]);
  if (close === null) return null;

  const changePercent = numberOrNull(data[3]);
  const change = numberOrNull(data[4]);
  const previousClose = change !== null ? close - change : null;
  const history = previousClose !== null ? [previousClose, close] : [close];

  return {
    symbol,
    ticker: symbol,
    providerSymbol: ticker,
    name: data[1] || data[0] || symbol,
    market,
    exchange: market,
    price: close,
    last: close,
    change,
    changePercent,
    percentChange: changePercent,
    open: numberOrNull(data[6]),
    high: numberOrNull(data[7]),
    low: numberOrNull(data[8]),
    previousClose,
    volume: numberOrNull(data[5]),
    history,
    sampleCount: history.length,
    updatedAt: new Date().toISOString(),
    source: "tradingview-scanner",
  };
}

async function fetchTradingViewScannerQuotes(market, symbols) {
  const normalizedMarket = marketKey(market);
  const scannerMarket = TRADINGVIEW_SCANNER_BY_MARKET[normalizedMarket];
  if (!scannerMarket) return [];

  const requests = symbols
    .map((symbol) => {
      const exchange = tradingViewExchangeFor(normalizedMarket, symbol);
      const raw = normalizeSymbol(symbol);
      const base = raw.includes(":") ? raw : stripKnownSuffix(raw);
      const ticker = raw.includes(":") ? raw : `${exchange}:${base}`;
      return exchange ? { symbol, ticker } : null;
    })
    .filter(Boolean);

  if (!requests.length) return [];

  const response = await fetch(
    `https://scanner.tradingview.com/${scannerMarket}/scan`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 stocks-optimizer",
      },
      body: JSON.stringify({
        symbols: {
          tickers: requests.map((request) => request.ticker),
          query: { types: [] },
        },
        columns: TRADINGVIEW_SCANNER_COLUMNS,
      }),
    },
  );

  if (!response.ok) return [];

  const payload = await response.json();
  const byTicker = new Map(
    (payload?.data || []).map((row) => [String(row.s), row]),
  );

  return requests
    .map((request) =>
      quoteFromScannerRow(
        request.symbol,
        normalizedMarket,
        request.ticker,
        byTicker.get(request.ticker),
      ),
    )
    .filter(Boolean);
}

async function fetchTradingViewQuotes(market, symbols, reason = null) {
  const baseUrl =
    process.env.TRADINGVIEW_DATA_BASE_URL ||
    "https://tradingview-data.vercel.app/api/chart-data";
  const concurrency = Number(process.env.TRADINGVIEW_QUOTE_CONCURRENCY || 6);

  async function fetchOne(symbol) {
    let lastFailure = null;

    for (const candidate of tradingViewSymbolCandidates(market, symbol)) {
      const url = new URL(baseUrl);
      url.searchParams.set("symbol", candidate);
      url.searchParams.set("bars", "5");
      url.searchParams.set("format", "csv");

      let rows = [];

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch(url.toString(), {
          headers: {
            "User-Agent": "Mozilla/5.0 stocks-optimizer",
          },
        });

        if (!response.ok) {
          lastFailure = `failed:${response.status}:${candidate}`;
          break;
        }

        const csv = await response.text();
        rows = parseTradingViewCsv(csv);
        if (rows.length > 0) break;

        lastFailure = `empty:${candidate}`;
        await delay(150);
      }

      const lastRow = rows[rows.length - 1] || {};
      const previousRow = rows[rows.length - 2] || {};
      const close = numberOrNull(lastRow.Close);

      if (close === null) {
        lastFailure = `empty:${candidate}`;
        continue;
      }

      const previousClose = numberOrNull(previousRow.Close);
      const change =
        close !== null && previousClose !== null ? close - previousClose : null;
      const changePercent =
        close !== null && previousClose !== null && previousClose !== 0
          ? ((close - previousClose) / previousClose) * 100
          : null;
      const history = rows
        .map((row) => numberOrNull(row.Close))
        .filter((value) => value !== null);

      return {
        symbol,
        ticker: symbol,
        providerSymbol: candidate,
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
        history,
        sampleCount: history.length,
        updatedAt: new Date().toISOString(),
        source: "tradingview-data",
      };
    }

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
      open: null,
      high: null,
      low: null,
      previousClose: null,
      volume: null,
      updatedAt: new Date().toISOString(),
      source: `tradingview-unavailable:${lastFailure || "no-candidates"}${reason ? `:${reason}` : ""}`,
    };
  }

  const scannerQuotes = await fetchTradingViewScannerQuotes(market, symbols);
  const scannerBySymbol = new Map(
    scannerQuotes.map((quote) => [quote.symbol, quote]),
  );
  const missingSymbols = symbols.filter(
    (symbol) => !scannerBySymbol.has(symbol),
  );
  const fallbackQuotes = await mapWithConcurrency(
    missingSymbols,
    Math.max(1, Math.min(12, concurrency)),
    fetchOne,
  );
  const fallbackBySymbol = new Map(
    fallbackQuotes.map((quote) => [quote.symbol, quote]),
  );

  return symbols.map(
    (symbol) => scannerBySymbol.get(symbol) || fallbackBySymbol.get(symbol),
  );
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
      return await fetchBinanceEndpointQuotes(
        symbols,
        futuresUrl,
        "binance-futures",
      );
    } catch (futuresError) {
      const blockedStatus =
        spotError.status === 451 || futuresError.status === 451 ? 451 : null;

      if (blockedStatus) {
        return fetchTradingViewQuotes(
          "BINANCE",
          symbols,
          `binance-blocked:${blockedStatus}`,
        );
      }

      return fetchTradingViewQuotes(
        "BINANCE",
        symbols,
        `binance-unavailable:${spotError.status || futuresError.status || "unknown"}`,
      );
    }
  }
}

async function syncMarketQuotes({ market, symbols }) {
  const normalizedMarket = marketKey(market);
  const uniqueSymbols = Array.from(
    new Set(symbols.map(normalizeSymbol).filter(Boolean)),
  ).slice(0, 500);

  const quotes =
    normalizedMarket === "BINANCE"
      ? await fetchBinanceQuotes(uniqueSymbols)
      : await fetchTradingViewQuotes(normalizedMarket, uniqueSymbols);

  const payload = {
    market: normalizedMarket,
    quotes,
    data: quotes,
    items: quotes,
    syncedAt: Date.now(),
  };

  await setCache(`quotes:${normalizedMarket}`, payload, 30);

  return payload;
}

module.exports = {
  syncMarketQuotes,
};
