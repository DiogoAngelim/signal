import { Router, type IRouter } from "express";
import {
  attachSignalsToQuotes,
  fetchMarketQuotes,
  fetchQuotes,
  listMarkets,
  loadMarketList,
  loadStockList,
  type StockQuote,
} from "../lib/stock-data";
import {
  getBackgroundSignalEngineStatus,
  getStoredSignalSnapshots,
  registerSymbolsForBackgroundRefresh,
  storeSignalSnapshots,
  type SignalScope,
} from "../lib/signal-backend";
import { logger } from "../lib/logger";

const router: IRouter = Router();
let signalPersistenceWarningLogged = false;

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

async function getStoredSignalSnapshotsIfAvailable(
  scope: SignalScope,
  symbols: string[],
): Promise<StockQuote[]> {
  try {
    return await getStoredSignalSnapshots(scope, symbols);
  } catch (error) {
    logSignalPersistenceWarning(
      error,
      "Stored signal snapshots unavailable; fetching live quotes",
      scope,
    );
    return [];
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
  const market = String(req.body?.market ?? "").trim();
  const exchange = String(req.body?.exchange ?? "US").toUpperCase();
  const symbols = Array.isArray(req.body?.symbols)
    ? req.body.symbols.map(String)
    : [];
  const withSignals = Boolean(req.body?.withSignals);
  const scope = resolveScope(market, exchange);

  if (!symbols.length) {
    res.status(400).json({ error: "symbols array is required" });
    return;
  }

  await registerSymbolsForBackgroundRefreshIfAvailable(scope, symbols);

  if (withSignals) {
    const storedQuotes = await getStoredSignalSnapshotsIfAvailable(
      scope,
      symbols,
    );
    if (storedQuotes.length === symbols.length) {
      res.json({
        data: {
          market: market || undefined,
          exchange: market ? undefined : exchange,
          quotes: storedQuotes,
        },
      });
      return;
    }
  }

  const quotes = market
    ? await fetchMarketQuotes(market, symbols)
    : await fetchQuotes(exchange, symbols);

  const enrichedQuotes = withSignals
    ? await attachSignalsToQuotes(quotes, market || exchange)
    : quotes;

  if (withSignals && enrichedQuotes.length) {
    await storeSignalSnapshotsIfAvailable(scope, enrichedQuotes);
  }

  res.json({
    data: {
      market: market || undefined,
      exchange: market ? undefined : exchange,
      quotes: enrichedQuotes,
    },
  });
});

export default router;
