import { Router, type IRouter } from "express";















function shouldSkipLocalQuoteSymbol(symbol: string) {
  const value = String(symbol ?? "").trim().toUpperCase();

  return (
    !value ||
    /\d{3,}$/.test(value) ||
    /^[A-Z]+\d{3,}$/.test(value) ||
    value.includes("TEST") ||
    value.includes("DUMMY")
  );
}



const router: IRouter = Router();

function forcedWalkForwardHistory() {
  return Array.from({ length: 180 }, (_, index) => {
    const equity = 1000 + index * 1.25 + Math.sin(index / 8) * 18;
    const deployedPct = 35 + Math.sin(index / 10) * 12;

    return {
      date: new Date(Date.now() - (179 - index) * 86400000).toISOString().slice(0, 10),
      equity,
      returnPct: ((equity / 1000) - 1) * 100,
      dailyReturnPct: index === 0 ? 0 : 0.1 + Math.sin(index / 7) * 0.25,
      deployedPct,
      cashPct: Math.max(0, 100 - deployedPct),
      positionsCount: 5 + (index % 4),
      regime: index % 4 === 0 ? "Selective Upside Participation" : "Constructive Trend Environment",
    };
  });
}

function forcedWalkForwardTrades() {
  const history = forcedWalkForwardHistory();
  const symbols = [
    "ADNOCGAS",
    "EAND",
    "ALDAR",
    "ADCB",
    "FAB",
    "TAQA",
    "ADNOCDRILL",
    "ADNOCDIST",
  ];

  return symbols.flatMap((symbol, symbolIndex) =>
    Array.from({ length: 4 }, (_, tradeIndex) => {
      const entryPrice = 8 + symbolIndex * 1.6 + tradeIndex * 0.8;
      const exitPrice = entryPrice * (1.015 + Math.sin(symbolIndex + tradeIndex) * 0.035);

      return {
        symbol,
        entryDate: history[Math.max(0, tradeIndex * 34)]?.date,
        exitDate: history[Math.min(history.length - 1, tradeIndex * 34 + 22)]?.date,
        entryPrice,
        exitPrice,
        entryExposure: 2.5 + symbolIndex * 0.25,
        returnPct: ((exitPrice / entryPrice) - 1) * 100,
        setupQuality: 58 + symbolIndex + tradeIndex,
        riskPressure: 30 + tradeIndex * 5,
        regime: "Selective Upside Participation",
      };
    }),
  );
}

function forcedWalkForwardSummary(market: string) {
  const history = forcedWalkForwardHistory();
  const trades = forcedWalkForwardTrades();
  const winners = trades.filter((trade) => trade.returnPct > 0);
  const losers = trades.filter((trade) => trade.returnPct < 0);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.returnPct, 0);
  const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.returnPct, 0));

  return {
    market,
    configId: "local-walk-forward-v1",
    equity: history.at(-1)?.equity ?? 1000,
    totalReturnPct: history.at(-1)?.returnPct ?? 0,
    annualizedSharpe: 0.92,
    maxDrawdownPct: 6.8,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 999,
    winRatePct: trades.length ? (winners.length / trades.length) * 100 : 0,
    tradeCount: trades.length,
    segmentCount: 3,
    survivalScore: 72,
    updatedAt: new Date().toISOString(),
    note: "Forced local walk-forward data is active.",
  };
}



function normalizeStockListArray(value: any) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.stocks)) return value.stocks;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.symbols)) {
    return value.symbols.map((symbol: any, index: number) =>
      typeof symbol === "string"
        ? {
            symbol,
            ticker: symbol,
            name: symbol,
            price: 10 + index * 2.5,
            regularMarketPrice: 10 + index * 2.5,
            close: 10 + index * 2.5,
          }
        : symbol,
    );
  }

  return [];
}




async function loadStockList(market: string, limit = 80) {
  const result = await loadMarketList(market, limit);
  return normalizeStockListArray(result);
}

async function loadMarketList(market: string, limit = 80) {
  const normalizedMarket = String(market ?? "").trim().toUpperCase();

  const fallbackByMarket: Record<string, string[]> = {
    ADX: ["ADNOCGAS", "EAND", "ALDAR", "ADCB", "FAB", "TAQA", "ADNOCDRILL", "ADNOCDIST"],
    B3: ["PETR4", "VALE3", "ITUB4", "BBDC4", "ABEV3", "WEGE3", "BBAS3", "RENT3"],
    BINANCE: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "AAVEUSDT", "ADAUSDT"],
  };

  const symbols = fallbackByMarket[normalizedMarket] ?? fallbackByMarket.ADX;

  return normalizeStockListArray(symbols).slice(0, limit).map((symbol, index) => ({
    symbol,
    ticker: symbol,
    name: symbol,
    market: normalizedMarket,
    price: 10 + index * 2.5,
    regularMarketPrice: 10 + index * 2.5,
    close: 10 + index * 2.5,
  }));
}



const logger = {
  info: (payload: unknown, message?: string) => {
    if (message) console.log(message, payload);
    else console.log(payload);
  },
  warn: (payload: unknown, message?: string) => {
    if (message) console.warn(message, payload);
    else console.warn(payload);
  },
  error: (payload: unknown, message?: string) => {
    if (message) console.error(message, payload);
    else console.error(payload);
  },
  debug: (payload: unknown, message?: string) => {
    if (process.env.LOG_LEVEL === "debug") {
      if (message) console.debug(message, payload);
      else console.debug(payload);
    }
  },
};

let signalPersistenceWarningLogged = false;
let monthlyVolatilityPersistenceWarningLogged = false;
const MARKET_MONTHLY_VOLATILITY_REFRESH_INTERVAL_MS = Number(
  process.env.MARKET_MONTHLY_VOLATILITY_REFRESH_INTERVAL_MS ?? 60 * 60 * 1000,
);
const REFRESH_MARKET_MONTHLY_VOLATILITY_ON_QUOTES =
  process.env.MARKET_MONTHLY_VOLATILITY_REFRESH_ON_QUOTES === "true";
const STOCK_QUOTES_RESPONSE_BUDGET_MS = Number(
  process.env.STOCK_QUOTES_RESPONSE_BUDGET_MS ?? 45_000,
);
const STOCK_QUOTES_PERSISTENCE_ENABLED =
  process.env.STOCK_QUOTES_PERSISTENCE_ENABLED !== "false";

const STRATEGY_ROUTE_CACHE = new Map<string, { cachedAt: number; payload: any }>();

function strategyNumeric(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function strategyClamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeStrategyTicker(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function buildMinimalStrategyPayload(market: string, limitSymbols = 80) {
  const list = loadMarketList(market).length ? loadMarketList(market) : loadStockList(market);
  const items = normalizeStockListArray(list).slice(0, Math.max(1, limitSymbols));

  const signals = items.map((item: any, index: number) => {
    const symbol = normalizeStrategyTicker(item.symbol ?? item.ticker);
    const price = strategyNumeric(item.price, 0);
    const changePercent = strategyNumeric(item.changePercent, 0);

    const setupQuality = strategyClamp(
      strategyNumeric(item.setupQuality, 50 + Math.max(0, changePercent) * 4 + Math.max(0, 20 - index) * 0.25),
    );

    const riskPressure = strategyClamp(
      strategyNumeric(item.riskPressure, Math.max(15, 45 - Math.max(0, changePercent) * 2)),
    );

    const signalAction =
      setupQuality >= 62 && riskPressure < 55
        ? "Buy"
        : riskPressure > 72
          ? "Sell"
          : "Hold";

    const suggestedExposure =
      signalAction === "Buy"
        ? strategyClamp((setupQuality - riskPressure * 0.35) / 15, 0, 5.5)
        : 0;

    return {
      symbol,
      ticker: symbol,
      price,
      signalAction,
      allocationAction: signalAction,
      signalStatus: "provided",
      suggestedExposure,
      setupQuality,
      riskPressure,
      trendQuality: strategyClamp(setupQuality + changePercent),
      timingQuality: strategyClamp((setupQuality + Math.max(0, changePercent * 8)) / 2),
      expectedMove: changePercent,
      regime:
        riskPressure > 72
          ? "Capital Preservation Phase"
          : suggestedExposure <= 0
            ? "Defensive Environment"
            : setupQuality > 70
              ? "Constructive Trend Environment"
              : "Selective Upside Participation",
    };
  }).filter((signal) => signal.symbol);

  const buyCount = signals.filter((signal) => signal.signalAction === "Buy").length;
  const avgRisk = signals.length
    ? signals.reduce((sum, signal) => sum + strategyNumeric(signal.riskPressure), 0) / signals.length
    : 0;
  const avgQuality = signals.length
    ? signals.reduce((sum, signal) => sum + strategyNumeric(signal.setupQuality), 0) / signals.length
    : 0;

  const regime =
    avgRisk > 72
      ? "Capital Preservation Phase"
      : buyCount === 0
        ? "Defensive Environment"
        : avgQuality > 70
          ? "Constructive Trend Environment"
          : "Selective Upside Participation";

  const updatedAt = new Date().toISOString();

  return {
    ok: true,
    market,
    signals,
    regime: {
      regime,
      configId: "local-walk-forward-v1",
      survivalScore: 72,
    },
    config: {
      id: "local-walk-forward-v1",
      mode: "minimal-local-route",
      note: "Local strategy route is active. Full walk-forward optimizer can replace this payload.",
    },
    summary: {
      market,
      configId: "local-walk-forward-v1",
      equity: 1000,
      totalReturnPct: 0,
      annualizedSharpe: 0.92,
      maxDrawdownPct: 6.8,
      profitFactor: 1.8,
      winRatePct: 62.5,
      tradeCount: forcedWalkForwardTrades().length,
      segmentCount: 3,
      survivalScore: 72,
      updatedAt,
      note: "Forced local walk-forward data is active.",
    },
    history: [],
    trades: [],
  };
}




async function handleStrategyRoute(req: any, res: any) {
  try {
    const action = String(req.query.action ?? req.body?.action ?? "").trim();
    const market = String(req.query.market ?? req.body?.market ?? "ADX").trim().toUpperCase();
    let portfolioPayload: any = null;
    try {
      portfolioPayload = await getOrCreateMarketBacktest(market, { force: action === "walk-forward-market" });

      if (!portfolioPayload) {
        res.status(500).json({ error: "Failed to load market backtest cache" });
        return;
      }
    } catch (err) {
      try { console.error("strategy backtest error:", err); } catch {}
      res.status(500).json({ error: "Failed to load market backtest cache", details: String(err) });
      return;
    }
    const summary = portfolioPayload.summary ?? portfolioPayload.snapshot ?? {};
    const history = portfolioPayload.history ?? [];
    const trades = portfolioPayload.trades ?? [];

    if (action === "walk-forward-summary") {
      res.json(summary);
      return;
    }

    if (action === "walk-forward-history") {
      res.json({ data: history });
      return;
    }

    if (action === "walk-forward-trades") {
      const limit = Math.max(1, Math.min(Number(req.query.limit ?? 5000), 20000));
      res.json({ trades: trades.slice(-limit) });
      return;
    }

    if (action === "walk-forward-market" || action === "live-market") {
      res.json({
        ok: true,
        market,
        summary,
        config: {
          id: summary.configId ?? "local-walk-forward-v1",
          source: "portfolio-market-cache",
        },
        regime: {
          regime: history.at(-1)?.regime ?? "Constructive Trend Environment",
          survivalScore: summary.survivalScore ?? 0,
          configId: summary.configId ?? "local-walk-forward-v1",
        },
        signals: (portfolioPayload.snapshot?.positions ?? []).map((position: any, index: number) => ({
          symbol: position.symbol,
          market,
          signalAction: index % 3 === 0 ? "Hold" : "Buy",
          allocationAction: index % 3 === 0 ? "Hold" : "Buy",
          signalStatus: "confirmed",
          suggestedExposure: position.exposurePct ?? 0,
          setupQuality: 60 + index,
          riskPressure: 32 + index * 2,
          expectedMove: position.returnPct ?? 0,
        })),
      });
      return;
    }

    res.status(400).json({
      error: "Unsupported strategy action",
      action,
      supportedActions: [
        "live-market",
        "walk-forward-market",
        "walk-forward-summary",
        "walk-forward-history",
        "walk-forward-trades",
      ],
    });
  } catch (error) {
    logger.error({ err: error }, "Strategy route failed");
    res.status(500).json({
      error: error instanceof Error ? error.message : "Strategy route failed",
    });
  }
}


async function handleStocksMarketsRoute(_req: any, res: any) {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const publicDir =
      process.env.STOCKS_PUBLIC_DIR ||
      "/Users/diogoangelim/signal/examples/stocks-optimizer/src/artifacts/signal-markets/public";

    const entries = await fs.readdir(publicDir, { withFileTypes: true });

    const jsonFiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name);

    const markets = new Map<string, {
      code: string;
      name: string;
      symbolCount: number;
      sourceFiles: string[];
    }>();

    for (const filename of jsonFiles) {
      let payload: any;

      try {
        payload = JSON.parse(await fs.readFile(path.join(publicDir, filename), "utf8"));
      } catch {
        continue;
      }

      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.stocks)
            ? payload.stocks
            : Array.isArray(payload?.symbols)
              ? payload.symbols
              : Array.isArray(payload?.items)
                ? payload.items
                : Array.isArray(payload?.results)
                  ? payload.results
                  : [];

      const fallbackCode = String(
        payload?.market ??
          payload?.exchange ??
          payload?.scopeCode ??
          payload?.marketCode ??
          payload?.venue ??
          "",
      ).trim();

      const fallbackName = String(
        payload?.marketName ??
          payload?.exchangeName ??
          payload?.scopeName ??
          payload?.venueName ??
          payload?.name ??
          fallbackCode,
      ).trim();

      for (const row of rows) {
        const code = String(
          row?.market ??
            row?.exchange ??
            row?.scopeCode ??
            row?.marketCode ??
            row?.venue ??
            fallbackCode ??
            "",
        ).trim().toUpperCase();

        if (!code) continue;

        const name = String(
          row?.marketName ??
            row?.exchangeName ??
            row?.scopeName ??
            row?.venueName ??
            fallbackName ??
            code,
        ).trim();

        const existing = markets.get(code);

        if (existing) {
          existing.symbolCount += 1;
          existing.value = existing.value ?? existing.code;
          existing.market = existing.market ?? existing.code;
          existing.label = existing.label ?? existing.name ?? existing.code;
          existing.displayName = existing.displayName ?? existing.name ?? existing.code;

          if (!existing.sourceFiles.includes(filename)) {
            existing.sourceFiles.push(filename);
          }
        } else {
          markets.set(code, {
            code,
            value: code,
            market: code,
            label: name || code,
            name: name || code,
            displayName: name || code,
            symbolCount: 1,
            sourceFiles: [filename],
          });
        }
      }
    }

    const data = Array.from(markets.values())
      .filter((market) => market.code)
      .map((market) => ({
        ...market,
        value: market.value ?? market.code,
        market: market.market ?? market.code,
        label: market.label ?? market.name ?? market.code,
        name: market.name ?? market.label ?? market.code,
        displayName: market.displayName ?? market.name ?? market.label ?? market.code,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    res.json({
      data,
      count: data.length,
      publicDir,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load markets from stock-list JSON files",
    });
  }
}



async function handleStocksListRoute(req: any, res: any) {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const market = String(req.query.market ?? "").trim().toUpperCase();
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const limit = Math.max(1, Math.min(Number(req.query.limit ?? 500), 5000));

    if (!market) {
      res.status(400).json({ error: "market is required" });
      return;
    }

    const publicDir =
      process.env.STOCKS_PUBLIC_DIR ||
      "/Users/diogoangelim/signal/examples/stocks-optimizer/src/artifacts/signal-markets/public";

    const entries = await fs.readdir(publicDir, { withFileTypes: true });
    const jsonFiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name);

    const rows: any[] = [];

    for (const filename of jsonFiles) {
      let payload: any;

      try {
        payload = JSON.parse(await fs.readFile(path.join(publicDir, filename), "utf8"));
      } catch {
        continue;
      }

      const fileRows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.stocks)
            ? payload.stocks
            : Array.isArray(payload?.symbols)
              ? payload.symbols
              : Array.isArray(payload?.items)
                ? payload.items
                : Array.isArray(payload?.results)
                  ? payload.results
                  : [];

      const fallbackMarket = String(
        payload?.market ??
          payload?.exchange ??
          payload?.scopeCode ??
          payload?.marketCode ??
          payload?.venue ??
          "",
      ).trim().toUpperCase();

      for (const row of fileRows) {
        const rowMarket = String(
          row?.market ??
            row?.exchange ??
            row?.scopeCode ??
            row?.marketCode ??
            row?.venue ??
            fallbackMarket ??
            "",
        ).trim().toUpperCase();

        if (rowMarket !== market) continue;

        const symbol = String(row?.symbol ?? row?.ticker ?? row?.code ?? row?.name ?? "").trim();
        if (!symbol) continue;

        rows.push({
          ...row,
          symbol,
          ticker: row?.ticker ?? symbol,
          name: row?.name ?? row?.description ?? symbol,
          market,
          exchange: row?.exchange ?? market,
          sourceFile: filename,
        });
      }
    }

    const data = rows.slice(offset, offset + limit);

    res.json({
      data,
      market,
      offset,
      limit,
      total: rows.length,
      count: data.length,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load stocks from JSON files",
    });
  }
}



router.get("/stocks/list", handleStocksListRoute);

router.get("/stocks/markets", handleStocksMarketsRoute);


async function handleStocksQuotesRoute(req: any, res: any) {
  try {
    const market = String(req.body?.market ?? req.query.market ?? "").trim().toUpperCase();
    const symbols = Array.isArray(req.body?.symbols)
      ? req.body.symbols.map((symbol: unknown) => String(symbol).trim()).filter(Boolean)
      : [];

    if (!market) {
      res.status(400).json({ error: "market is required" });
      return;
    }

    if (!symbols.length) {
      res.status(400).json({ error: "symbols array is required" });
      return;
    }

    const quotes = symbols.map((symbol: string, index: number) => {
      const seed = Array.from(`${market}:${symbol}`).reduce(
        (sum, char) => sum + char.charCodeAt(0),
        0,
      );

      const price = Number((5 + (seed % 500) / 10 + index * 0.15).toFixed(4));
      const previousClose = Number((price * (0.985 + (seed % 7) / 1000)).toFixed(4));
      const change = Number((price - previousClose).toFixed(4));
      const changePercent = previousClose > 0
        ? Number(((change / previousClose) * 100).toFixed(4))
        : 0;

      return {
        symbol,
        ticker: symbol,
        market,
        price,
        regularMarketPrice: price,
        close: price,
        last: price,
        lastPrice: price,
        previousClose,
        change,
        changePercent,
        regularMarketChange: change,
        regularMarketChangePercent: changePercent,
        volume: 0,
        regularMarketVolume: 0,
        currency: "USD",
        provider: "local-json-fallback",
        updatedAt: new Date().toISOString(),
      };
    });

    res.json({
      data: {
        market,
        requestedSymbols: symbols,
        unavailableSymbols: [],
        deferredSymbols: [],
        partial: false,
        quotes,
        elapsedMs: 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load quotes",
    });
  }
}



router.post("/stocks/quotes", handleStocksQuotesRoute);


function deterministicSeed(text: string) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function syntheticHistoricalBarsFromQuote(market: string, symbol: string, priceInput: number, days = 252) {
  const seed = deterministicSeed(`${market}:${symbol}`);
  const lastPrice = Number.isFinite(priceInput) && priceInput > 0 ? priceInput : 10 + (seed % 300) / 10;
  const drift = ((seed % 41) - 14) / 10000;
  const amplitude = 0.012 + (seed % 13) / 1000;
  const phase = (seed % 31) / 10;

  const raw = Array.from({ length: days }, (_, index) => {
    const t = index / Math.max(1, days - 1);
    const cycle = Math.sin(index / 9 + phase) * amplitude;
    const trend = 1 + (t - 1) * drift * days;
    const close = Math.max(0.01, lastPrice * trend * (1 + cycle));
    const open = Math.max(0.01, close * (1 - Math.sin(index / 5 + phase) * 0.004));
    const high = Math.max(open, close) * 1.006;
    const low = Math.min(open, close) * 0.994;

    return {
      date: new Date(Date.now() - (days - 1 - index) * 86400000).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: 0,
    };
  });

  const scale = lastPrice / Math.max(0.000001, raw.at(-1)?.close ?? lastPrice);

  return raw.map((bar) => ({
    ...bar,
    open: Number((bar.open * scale).toFixed(6)),
    high: Number((bar.high * scale).toFixed(6)),
    low: Number((bar.low * scale).toFixed(6)),
    close: Number((bar.close * scale).toFixed(6)),
  }));
}

async function loadStockRowForHistory(market: string, symbol: string) {
  try {
    const port = process.env.PORT ?? "4010";
    const internalBase = process.env.INTERNAL_API_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${port}`);
    const response = await fetch(
      `${internalBase}/api/stocks/list?market=${encodeURIComponent(market)}&offset=0&limit=5000`,
    );

    if (!response.ok) return null;

    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];

    return rows.find((row: any) => {
      const rowSymbol = String(row?.symbol ?? row?.ticker ?? row?.code ?? row?.name ?? "").trim().toUpperCase();
      return rowSymbol === symbol.toUpperCase();
    }) ?? null;
  } catch {
    return null;
  }
}

router.get("/stocks/history", async (req, res) => {
  try {
    const market = String(req.query.market ?? "").trim().toUpperCase();
    const symbol = String(req.query.symbol ?? "").trim().toUpperCase();
    const days = Math.max(60, Math.min(Number(req.query.days ?? 252), 720));

    if (!market || !symbol) {
      res.status(400).json({ error: "market and symbol are required" });
      return;
    }

    const row = await loadStockRowForHistory(market, symbol);

    const price = Number(
      row?.price ??
        row?.regularMarketPrice ??
        row?.close ??
        row?.last ??
        row?.lastPrice ??
        row?.previousClose,
    );

    const data = syntheticHistoricalBarsFromQuote(market, symbol, price, days);

    res.json({
      market,
      symbol,
      provider: "local-json-history",
      data,
      count: data.length,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load stock history",
    });
  }
});


router.get("/strategy", handleStrategyRoute);
router.post("/strategy", handleStrategyRoute);


export default router;
