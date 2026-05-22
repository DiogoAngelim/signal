import { Router, type IRouter } from "express";
import {
  attachSignalsToQuotes,
  fetchMarketDailyCandles,
  fetchMarketQuotes,
  fetchQuotes,
  listMarkets,
  loadMarketList,
  loadStockList,
  type StockQuote,
} from "../lib/stock-data";
import {
  emitFakeFrontendSignal,
  getBackgroundSignalEngineStatus,
  getSignalEvents,
  registerSymbolsForBackgroundRefresh,
  storeSignalEvents,
  storeSignalSnapshots,
  type SignalScope,
} from "../lib/signal-backend";
import {
  ensureMarketContextSchema,
  hydrateMarketContextFromAvailableHistory,
  storeMarketMonthlyVolatilityFromCandles,
} from "../lib/market-context-occurrences";
import {
  createSignalLifecycleCandidateVersions,
  getSignalLifecycleAuditLog,
  listSignalLifecycleModels,
} from "../lib/signal-lifecycle-governance";
import { logger } from "../lib/logger";

const router: IRouter = Router();
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
const monthlyVolatilityRefreshes = new Map<
  string,
  { lastStartedAt: number; pending?: Promise<void> }
>();

function resolveScope(market: string, exchange: string): SignalScope {
  if (market) {
    return {
      scopeType: "market",
      scopeCode: market,
    };
  }

  return {
    scopeType: "exchange",
    scopeCode: exchange,
  };
}

function logSignalPersistenceWarning(
  error: unknown,
  message: string,
  scope: SignalScope,
) {
  if (signalPersistenceWarningLogged) {
    return;
  }

  signalPersistenceWarningLogged = true;
  logger.warn(
    {
      err: error,
      scopeType: scope.scopeType,
      scopeCode: scope.scopeCode,
    },
    message,
  );
}

async function registerSymbolsForBackgroundRefreshIfAvailable(
  scope: SignalScope,
  symbols: string[],
) {
  try {
    await registerSymbolsForBackgroundRefresh(scope, symbols);
  } catch (error) {
    logSignalPersistenceWarning(
      error,
      "Signal watchlist persistence unavailable; continuing with live quotes",
      scope,
    );
  }
}

async function storeSignalSnapshotsIfAvailable(
  scope: SignalScope,
  quotes: StockQuote[],
) {
  try {
    await storeSignalSnapshots(scope, quotes);
  } catch (error) {
    logSignalPersistenceWarning(
      error,
      "Signal snapshot persistence unavailable; live quotes were returned",
      scope,
    );
  }
}

async function storeMarketMonthlyVolatilityIfAvailable(
  market: string,
  quotes: StockQuote[],
) {
  if (!market || !quotes.length) return;

  try {
    const candles = await fetchMarketDailyCandles(
      market,
      quotes.map((quote) => quote.symbol),
    );
    if (!candles.length) return;

    await storeMarketMonthlyVolatilityFromCandles({
      market,
      venue: market,
      candles,
    });
  } catch (error) {
    if (monthlyVolatilityPersistenceWarningLogged) return;
    monthlyVolatilityPersistenceWarningLogged = true;
    logger.warn(
      { err: error, market },
      "Market monthly volatility persistence unavailable; continuing with live quotes",
    );
  }
}

function scheduleMarketMonthlyVolatilityRefresh(
  market: string,
  quotes: StockQuote[],
) {
  if (!REFRESH_MARKET_MONTHLY_VOLATILITY_ON_QUOTES) return;

  const normalizedMarket = market.trim().toUpperCase();
  if (!normalizedMarket || !quotes.length) return;

  const now = Date.now();
  const current = monthlyVolatilityRefreshes.get(normalizedMarket);
  if (
    current?.pending ||
    now - (current?.lastStartedAt ?? 0) <
      MARKET_MONTHLY_VOLATILITY_REFRESH_INTERVAL_MS
  ) {
    return;
  }

  const pending = storeMarketMonthlyVolatilityIfAvailable(
    normalizedMarket,
    quotes,
  ).finally(() => {
    const latest = monthlyVolatilityRefreshes.get(normalizedMarket);
    if (latest?.pending === pending) {
      monthlyVolatilityRefreshes.set(normalizedMarket, {
        lastStartedAt: latest.lastStartedAt,
      });
    }
  });

  monthlyVolatilityRefreshes.set(normalizedMarket, {
    lastStartedAt: now,
    pending,
  });
}

router.get("/stocks/exchanges", (_req, res) => {
  const markets = listMarkets();
  res.json({ data: markets });
});

router.get("/stocks/markets", (_req, res) => {
  const markets = listMarkets();
  res.json({ data: markets });
});

router.get("/stocks/signals/status", async (_req, res) => {
  const status = await getBackgroundSignalEngineStatus();
  res.json({ data: status });
});

router.post("/stocks/context/schema", async (_req, res) => {
  await ensureMarketContextSchema();
  res.json({ data: { ready: true } });
});

router.post("/stocks/context/replay", async (req, res) => {
  const result = await hydrateMarketContextFromAvailableHistory({
    candleTable:
      typeof req.body?.candleTable === "string"
        ? req.body.candleTable
        : undefined,
    batchSize: Number(req.body?.batchSize ?? undefined) || undefined,
    market: typeof req.body?.market === "string" ? req.body.market : undefined,
    venue: typeof req.body?.venue === "string" ? req.body.venue : undefined,
    asset: typeof req.body?.asset === "string" ? req.body.asset : undefined,
    timeframe:
      typeof req.body?.timeframe === "string" ? req.body.timeframe : undefined,
    ingestionSource:
      typeof req.body?.ingestionSource === "string"
        ? req.body.ingestionSource
        : undefined,
  });
  res.json({ data: result });
});

router.post("/stocks/signals/watch", async (req, res) => {
  const market = String(req.body?.market ?? "").trim();
  const exchange = String(req.body?.exchange ?? "US").toUpperCase();
  const symbols = Array.isArray(req.body?.symbols)
    ? req.body.symbols.map(String)
    : [];
  const scope = resolveScope(market, exchange);

  if (!symbols.length) {
    res.status(400).json({ error: "symbols array is required" });
    return;
  }

  await registerSymbolsForBackgroundRefresh(scope, symbols);
  res.json({ data: { registered: symbols.length } });
});

router.get("/stocks/signals/history", async (req, res) => {
  const market = String(req.query.market ?? "").trim();
  const exchange = String(req.query.exchange ?? "").trim();
  const limit = Number(req.query.limit ?? 100);
  const scope = market
    ? resolveScope(market, "")
    : exchange
      ? resolveScope("", exchange)
      : undefined;

  const events = await getSignalEvents(scope, limit);
  res.json({ data: events });
});

router.get("/stocks/model-lifecycle", async (_req, res) => {
  const models = await listSignalLifecycleModels();
  res.json({ data: models });
});

router.get("/stocks/model-lifecycle/audit", async (req, res) => {
  const modelId =
    typeof req.query.modelId === "string" ? req.query.modelId : undefined;
  const entries = await getSignalLifecycleAuditLog(modelId);
  res.json({ data: entries });
});

router.post("/stocks/model-lifecycle/candidate", async (req, res) => {
  const market = String(req.body?.market ?? "").trim();
  const parentModelId =
    typeof req.body?.parentModelId === "string"
      ? req.body.parentModelId.trim()
      : undefined;
  const reason =
    typeof req.body?.reason === "string" ? req.body.reason.trim() : undefined;

  if (!market) {
    res.status(400).json({ error: "market is required" });
    return;
  }

  const models = await createSignalLifecycleCandidateVersions({
    market,
    parentModelId: parentModelId || undefined,
    reason,
  });
  res.json({ data: { created: models.length, models } });
});

router.post("/stocks/signals/fake", async (req, res) => {
  if (process.env.VERCEL) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const market = String(req.body?.market ?? "DEV").trim();
  const scope = resolveScope(market, "");
  const signal = emitFakeFrontendSignal(req.body ?? {});
  await storeSignalEvents(scope, [signal]);
  res.json({ data: { emitted: true } });
});

router.get("/stocks/list", (req, res) => {
  const market = String(req.query.market ?? "").trim();
  const exchange = String(req.query.exchange ?? "US").toUpperCase();
  const offset = Math.max(0, Number(req.query.offset ?? 0));
  const limitRaw = Number(req.query.limit ?? 24);
  const limit = Math.min(Math.max(limitRaw, 1), 5000);

  const items = market ? loadMarketList(market) : loadStockList(exchange);
  const paged = items.slice(offset, offset + limit);

  res.json({
    data: {
      market: market || undefined,
      exchange: market ? undefined : exchange,
      total: items.length,
      items: paged,
    },
  });
});

router.post("/stocks/quotes", async (req, res) => {
  const startedAt = Date.now();
  const deadlineAt =
    startedAt + Math.max(5_000, Math.min(STOCK_QUOTES_RESPONSE_BUDGET_MS, 55_000));
  const market = String(req.body?.market ?? "").trim();
  const exchange = String(req.body?.exchange ?? "US").toUpperCase();
  const symbols: string[] = Array.isArray(req.body?.symbols)
    ? (req.body.symbols as unknown[]).map((symbol) => String(symbol))
    : [];
  const requestedSymbols: string[] = Array.from(
    new Set(symbols.map((symbol) => symbol.trim()).filter(Boolean)),
  );
  const withSignals = Boolean(req.body?.withSignals);
  const scope = resolveScope(market, exchange);

  if (!requestedSymbols.length) {
    res.status(400).json({ error: "symbols array is required" });
    return;
  }

  if (STOCK_QUOTES_PERSISTENCE_ENABLED) {
    void registerSymbolsForBackgroundRefreshIfAvailable(scope, requestedSymbols);
  }

  const quotes = market
    ? await fetchMarketQuotes(market, requestedSymbols, {
      deadlineAt,
      minRemainingMs: 4_000,
    })
    : await fetchQuotes(exchange, requestedSymbols, {
      deadlineAt,
      minRemainingMs: 4_000,
    });

  const enrichedQuotes = withSignals
    ? await attachSignalsToQuotes(quotes, market || exchange, {
      deadlineAt,
      minRemainingMs: 2_000,
      recordSignalSnapshots: STOCK_QUOTES_PERSISTENCE_ENABLED,
    })
    : quotes;

  if (STOCK_QUOTES_PERSISTENCE_ENABLED && withSignals && enrichedQuotes.length) {
    void storeSignalSnapshotsIfAvailable(scope, enrichedQuotes);
  }

  if (STOCK_QUOTES_PERSISTENCE_ENABLED) {
    scheduleMarketMonthlyVolatilityRefresh(market, enrichedQuotes);
  }

  const returnedSymbols = new Set(enrichedQuotes.map((quote) => quote.symbol));
  const unavailableSymbols = requestedSymbols.filter(
    (symbol) => !returnedSymbols.has(symbol),
  );
  const deadlineExhausted = Date.now() + 2_000 >= deadlineAt;

  res.json({
    data: {
      market: market || undefined,
      exchange: market ? undefined : exchange,
      requestedSymbols,
      unavailableSymbols,
      deferredSymbols: deadlineExhausted ? unavailableSymbols : [],
      partial: unavailableSymbols.length > 0,
      quotes: enrichedQuotes,
      elapsedMs: Date.now() - startedAt,
    },
  });
});

export default router;
