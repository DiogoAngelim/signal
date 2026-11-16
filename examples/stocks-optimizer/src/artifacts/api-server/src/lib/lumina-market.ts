import { z } from "zod";

/**
 * Lúmina talks only to the user's tradingview-data module.
 *
 * That service chooses the underlying market-data provider. Lúmina must NOT
 * infer quote realtime entitlement from a successful response or a recent
 * syncedAt timestamp. A TradingView websocket daily-close fallback is
 * indicative history, not a tradeable live price.
 */
export const LUMINA_MARKETS = {
  BTCUSDT: { label: "Bitcoin", currency: "USD", tradingViewSymbol: "BINANCE:BTCUSDT", market: "crypto", exchange: "BINANCE", providerId: "binance-public" },
  ETHUSDT: { label: "Ethereum", currency: "USD", tradingViewSymbol: "BINANCE:ETHUSDT", market: "crypto", exchange: "BINANCE", providerId: "binance-public" },
  SOLUSDT: { label: "Solana", currency: "USD", tradingViewSymbol: "BINANCE:SOLUSDT", market: "crypto", exchange: "BINANCE", providerId: "binance-public" },
  BNBUSDT: { label: "BNB", currency: "USD", tradingViewSymbol: "BINANCE:BNBUSDT", market: "crypto", exchange: "BINANCE", providerId: "binance-public" },
  PETR4: { label: "Petrobras", currency: "BRL", tradingViewSymbol: "BMFBOVESPA:PETR4", market: "stock", exchange: "BMFBOVESPA", providerId: "tradingview-remote" },
  VALE3: { label: "Vale", currency: "BRL", tradingViewSymbol: "BMFBOVESPA:VALE3", market: "stock", exchange: "BMFBOVESPA", providerId: "tradingview-remote" },
  AAPL: { label: "Apple", currency: "USD", tradingViewSymbol: "NASDAQ:AAPL", market: "stock", exchange: "NASDAQ", providerId: "tradingview-remote" },
  MSFT: { label: "Microsoft", currency: "USD", tradingViewSymbol: "NASDAQ:MSFT", market: "stock", exchange: "NASDAQ", providerId: "tradingview-remote" },
} as const;

export type LuminaSymbol = keyof typeof LUMINA_MARKETS;
export type LuminaQuoteStatus = "fresh" | "delayed" | "stale" | "unavailable";
type SourceFetcher = typeof fetch;
const FRESH_MS = 120_000;
const INDICATIVE_MS = 7 * 24 * 60 * 60_000;

export function luminaSymbol(value: unknown): LuminaSymbol | null {
  const key = String(value ?? "").trim().toUpperCase();
  return Object.hasOwn(LUMINA_MARKETS, key) ? key as LuminaSymbol : null;
}

const Numeric = z.coerce.number().finite();
const QuoteSchema = z.object({
  symbol: z.string(),
  providerSymbol: z.string().optional(),
  provider: z.string().optional(),
  source: z.string().optional(),
  market: z.string().optional(),
  exchange: z.string().optional(),
  timestamp: z.string(),
  close: Numeric.positive(),
  open: Numeric.positive().nullable().optional(),
  realtime: z.boolean().nullable().optional(),
  delayed: z.boolean().nullable().optional(),
  reliability: z.object({
    score: Numeric.min(0).max(1).optional(),
    confidence: z.string().optional(),
    reason: z.string().optional(),
  }).nullable().optional(),
});
const QuoteResponseSchema = z.object({
  quotes: z.array(QuoteSchema).max(20),
  errors: z.array(z.unknown()).optional(),
  syncedAt: z.string().optional(),
});
const CandleSchema = z.object({
  timestamp: z.string(),
  symbol: z.string().optional(),
  providerSymbol: z.string().optional(),
  open: Numeric.positive(),
  high: Numeric.positive(),
  low: Numeric.positive(),
  close: Numeric.positive(),
  volume: Numeric.nonnegative().nullable().optional(),
});
const HistoryResponseSchema = z.object({
  provider: z.string(),
  source: z.string().optional(),
  bars: z.array(CandleSchema).max(600),
  syncedAt: z.string().optional(),
  delayed: z.boolean().nullable().optional(),
});

function serviceUrl(route: "/api/stocks/quotes" | "/api/stocks/history"): URL {
  const configured = process.env.LUMINA_MARKET_DATA_URL?.trim() ||
    "https://tradingview-data.vercel.app";
  const root = new URL(configured);
  if (root.username || root.password ||
    !["https:", "http:"].includes(root.protocol) ||
    (process.env.NODE_ENV === "production" && root.protocol !== "https:")) {
    throw new Error("Invalid Lúmina market data service configuration.");
  }
  return new URL(route, root.origin);
}

async function requestFromModule<T>(
  url: URL, schema: z.ZodType<T>, fetcher: SourceFetcher,
  timeoutMs: number, maxBytes: number,
): Promise<T> {
  const response = await fetcher(url.toString(), {
    method: "GET", headers: { accept: "application/json" },
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error("tradingview-data returned a provider error.");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) throw new Error("tradingview-data response exceeded size limit.");
  const raw = await response.text();
  if (raw.length > maxBytes) throw new Error("tradingview-data response exceeded size limit.");
  const payload = JSON.parse(raw);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error("tradingview-data response contract mismatch.");
  return parsed.data;
}
function observationMs(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

export type LuminaMarketQuote = {
  symbol: LuminaSymbol;
  label: string;
  currency: "BRL" | "USD";
  tradingViewSymbol: string;
  market: "crypto" | "stock";
  exchange: string;
  price: number | null;
  change24hPercent: number | null;
  status: LuminaQuoteStatus;
  provider: "tradingview-data";
  underlyingProvider: string | null;
  source: string | null;
  receivedAt: string;
  syncedAt: string | null;
  quoteAt: string | null;
  realtimeVerified: boolean;
  eligibleForLiveCalculations: boolean;
  reliabilityScore: number | null;
  note: string;
};

function unavailableQuote(symbol: LuminaSymbol, now: number): LuminaMarketQuote {
  const meta = LUMINA_MARKETS[symbol];
  return {
    symbol, label: meta.label, currency: meta.currency,
    tradingViewSymbol: meta.tradingViewSymbol,
    market: meta.market, exchange: meta.exchange,
    price: null, change24hPercent: null, status: "unavailable",
    provider: "tradingview-data", underlyingProvider: null, source: null,
    receivedAt: new Date(now).toISOString(), syncedAt: null, quoteAt: null,
    realtimeVerified: false, eligibleForLiveCalculations: false,
    reliabilityScore: null,
    note: "The tradingview-data module could not verify this price. No market value was substituted.",
  };
}

export async function getLuminaMarketQuote(
  symbol: LuminaSymbol,
  fetcher: SourceFetcher = fetch,
  now = Date.now(),
): Promise<LuminaMarketQuote> {
  const meta = LUMINA_MARKETS[symbol];
  try {
    const url = serviceUrl("/api/stocks/quotes");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("market", meta.market);
    url.searchParams.set("exchange", meta.exchange);
    url.searchParams.set("provider", meta.providerId);
    const data = await requestFromModule(url, QuoteResponseSchema, fetcher, 5_500, 128_000);
    const quote = data.quotes.find((entry) =>
      entry.symbol.toUpperCase() === symbol &&
      (entry.providerSymbol === undefined ||
        [String(symbol), String(meta.tradingViewSymbol)].includes(entry.providerSymbol.toUpperCase())),
    );
    if (!quote || quote.provider !== meta.providerId || quote.source !== meta.providerId) {
      return unavailableQuote(symbol, now);
    }
    const observedAt = observationMs(quote.timestamp);
    const age = now - observedAt;
    if (!Number.isFinite(observedAt) || age < -10_000) return unavailableQuote(symbol, now);
    const realtimeVerified =
      quote.provider === "binance-public" &&
      quote.realtime === true && quote.delayed === false &&
      meta.market === "crypto";
    const status: LuminaQuoteStatus =
      realtimeVerified && age <= FRESH_MS ? "fresh" :
      age <= INDICATIVE_MS && meta.market === "stock" ? "delayed" : "stale";
    const eligible = status === "fresh";
    const open = quote.open ?? null;
    const change24hPercent =
      eligible && typeof open === "number" && open > 0
        ? ((quote.close - open) / open) * 100
        : null;
    const syncedMs = data.syncedAt ? observationMs(data.syncedAt) : NaN;
    return {
      symbol, label: meta.label, currency: meta.currency,
      tradingViewSymbol: meta.tradingViewSymbol,
      market: meta.market, exchange: meta.exchange,
      price: quote.close,
      change24hPercent: Number.isFinite(change24hPercent) ? change24hPercent : null,
      status, provider: "tradingview-data",
      underlyingProvider: quote.provider,
      source: quote.source,
      receivedAt: new Date(now).toISOString(),
      syncedAt: Number.isFinite(syncedMs) ? new Date(syncedMs).toISOString() : null,
      quoteAt: new Date(observedAt).toISOString(),
      realtimeVerified,
      eligibleForLiveCalculations: eligible,
      reliabilityScore: quote.reliability?.score ?? null,
      note: status === "fresh"
        ? "Exchange quote via tradingview-data. This is market evidence, not investment advice."
        : status === "delayed"
          ? "TradingView guest data are indicative; real-time entitlement is not verified. Do not use as a live trading quote."
          : "Market evidence is stale or its real-time status cannot be verified. No new live recommendation is available.",
    };
  } catch {
    return unavailableQuote(symbol, now);
  }
}

export type LuminaHistoryBar = {
  timestamp: string; open: number; high: number; low: number;
  close: number; volume: number | null;
};
export type LuminaMarketHistory = {
  symbol: LuminaSymbol;
  provider: "tradingview-data";
  underlyingProvider: string | null;
  source: string | null;
  status: "available" | "unavailable";
  bars: LuminaHistoryBar[];
  lastBarAt: string | null;
  syncedAt: string | null;
  note: string;
};

export async function getLuminaMarketHistory(
  symbol: LuminaSymbol,
  bars = 90,
  fetcher: SourceFetcher = fetch,
  now = Date.now(),
): Promise<LuminaMarketHistory> {
  const fallback: LuminaMarketHistory = {
    symbol, provider: "tradingview-data", underlyingProvider: null, source: null,
    status: "unavailable", bars: [], lastBarAt: null, syncedAt: null,
    note: "Verified historical observations are unavailable; no synthetic history was generated.",
  };
  if (!Number.isInteger(bars) || bars < 10 || bars > 365) return fallback;
  const meta = LUMINA_MARKETS[symbol];
  try {
    const url = serviceUrl("/api/stocks/history");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("market", meta.market);
    url.searchParams.set("exchange", meta.exchange);
    url.searchParams.set("provider", meta.providerId);
    url.searchParams.set("interval", "D");
    url.searchParams.set("bars", String(bars));
    const data = await requestFromModule(url, HistoryResponseSchema, fetcher, 11_000, 2_000_000);
    if (data.provider !== meta.providerId || data.source !== meta.providerId) return fallback;
    const byDate = new Map<string, LuminaHistoryBar>();
    for (const raw of data.bars) {
      const at = observationMs(raw.timestamp);
      if (!Number.isFinite(at) || at > now + 60_000 ||
        raw.low > raw.high || raw.open < raw.low || raw.open > raw.high ||
        raw.close < raw.low || raw.close > raw.high) continue;
      if (raw.symbol && raw.symbol.toUpperCase() !== symbol) continue;
      if (raw.providerSymbol &&
        ![String(symbol), String(meta.tradingViewSymbol)].includes(raw.providerSymbol.toUpperCase())) continue;
      const timestamp = new Date(at).toISOString();
      byDate.set(timestamp, {
        timestamp, open: raw.open, high: raw.high, low: raw.low,
        close: raw.close, volume: raw.volume ?? null,
      });
    }
    const clean = [...byDate.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-bars);
    if (clean.length < 2) return fallback;
    const syncedMs = data.syncedAt ? observationMs(data.syncedAt) : NaN;
    return {
      symbol, provider: "tradingview-data", underlyingProvider: data.provider,
      source: data.source ?? null, status: "available", bars: clean,
      lastBarAt: clean[clean.length - 1].timestamp,
      syncedAt: Number.isFinite(syncedMs) ? new Date(syncedMs).toISOString() : null,
      note: "Daily OHLCV observations via tradingview-data; an unfinished day may change. History is not a return forecast.",
    };
  } catch {
    return fallback;
  }
}
