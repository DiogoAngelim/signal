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
const FOREX_EXCHANGE = "FX";

function listForexCountries(): Array<{ code: string; label: string; count: number }> {
  const items = loadStockList(FOREX_EXCHANGE);
  const counts = new Map<string, { label: string; count: number }>();

  for (const item of items) {
    const label = String(item.market ?? "").trim();
    if (!label) continue;
    const code = label.toUpperCase();
    const current = counts.get(code);
    if (current) {
      current.count += 1;
    } else {
      counts.set(code, { label, count: 1 });
    }
  }

  return Array.from(counts.entries())
    .map(([code, value]) => ({ code, label: value.label, count: value.count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function loadForexCountryList(country: string): ReturnType<typeof loadStockList> {
  const normalizedCountry = country.trim().toUpperCase();
  const items = loadStockList(FOREX_EXCHANGE);
  if (!normalizedCountry) {
    return items;
  }

  return items.filter(
    (item) => (item.market ?? "").trim().toUpperCase() === normalizedCountry,
  );
}

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

router.get("/forex/exchanges", (_req, res) => {
  const countries = listForexCountries();
  res.json({ data: countries });
});

router.get("/forex/markets", (_req, res) => {
  const countries = listForexCountries();
  res.json({ data: countries });
});

router.get("/forex/signals/status", async (_req, res) => {
  const status = await getBackgroundSignalEngineStatus();
  res.json({ data: status });
});

router.get("/forex/list", (req, res) => {
  const market = String(req.query.market ?? req.query.country ?? "").trim();
  const offset = Math.max(0, Number(req.query.offset ?? 0));
  const limitRaw = Number(req.query.limit ?? 24);
  const limit = Math.min(Math.max(limitRaw, 1), 5000);

  const items = loadForexCountryList(market);
  const paged = items.slice(offset, offset + limit);

  res.json({
    data: {
      country: market || undefined,
      market: market || undefined,
      exchange: FOREX_EXCHANGE,
      total: items.length,
      items: paged,
    },
  });
});

router.post("/forex/quotes", async (req, res) => {
  const market = String(req.body?.market ?? "").trim();
  const exchange = FOREX_EXCHANGE;
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

  const quotes = await fetchQuotes(exchange, symbols);

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
