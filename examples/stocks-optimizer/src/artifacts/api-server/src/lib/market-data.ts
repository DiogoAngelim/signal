/**
 * Market Data Layer — Quote Fetching & Caching
 *
 * This layer fetches market data from external providers (TradingView, Binance)
 * and manages caching, rate limiting, and symbol resolution.
 *
 * Output type: StockQuote (raw, without signals)
 *
 * Flow: Symbol + Exchange → Market Data → StockQuote
 */
// ─── Re-export from stock-data for backward compatibility ──────
// These functions live in stock-data.ts during migration.
// After full migration, they will be moved here.

export {
  fetchQuotes,
  fetchMarketQuotes,
  fetchMarketDailyCandles,
  loadStockList,
  loadMarketList,
  listExchanges,
  listMarkets,
  estimateSpread,
} from "./stock-data";