import { Router, type IRouter } from "express";
import { attachSignalsToQuotes, fetchMarketQuotes, fetchQuotes, listMarkets, loadMarketList, loadStockList } from "../lib/stock-data";

const router: IRouter = Router();

router.get("/stocks/exchanges", (_req, res) => {
  const markets = listMarkets();
  res.json({ data: markets });
});

router.get("/stocks/markets", (_req, res) => {
  const markets = listMarkets();
  res.json({ data: markets });
});

router.get("/stocks/list", (req, res) => {
  const market = String(req.query.market ?? "").trim();
  const exchange = String(req.query.exchange ?? "US").toUpperCase();
  const offset = Math.max(0, Number(req.query.offset ?? 0));
  const limitRaw = Number(req.query.limit ?? 24);
  const limit = Math.min(Math.max(limitRaw, 1), 50);

  const items = market
    ? loadMarketList(market)
    : loadStockList(exchange);
  const paged = items.slice(offset, offset + limit);

  res.json({
    data: {
      market: market || undefined,
      exchange: market ? undefined : exchange,
      total: items.length,
      items: paged
    }
  });
});

router.post("/stocks/quotes", async (req, res) => {
  const market = String(req.body?.market ?? "").trim();
  const exchange = String(req.body?.exchange ?? "US").toUpperCase();
  const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols.map(String) : [];
  const withSignals = Boolean(req.body?.withSignals);

  if (!symbols.length) {
    res.status(400).json({ error: "symbols array is required" });
    return;
  }

  const quotes = market
    ? await fetchMarketQuotes(market, symbols)
    : await fetchQuotes(exchange, symbols);

  const enrichedQuotes = withSignals
    ? await attachSignalsToQuotes(quotes, market || exchange)
    : quotes;

  res.json({
    data: {
      market: market || undefined,
      exchange: market ? undefined : exchange,
      quotes: enrichedQuotes
    }
  });
});

export default router;
