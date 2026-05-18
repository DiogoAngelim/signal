export type StockStatus = "Stable" | "Rising" | "Watch" | "Dip";
export type TradeSignal = "Buy" | "Hold" | "Sell";
export type AdaptiveRegime =
  | "TRENDING"
  | "MEAN_REVERTING"
  | "HIGH_VOL"
  | "LOW_VOL"
  | "BREAKOUT"
  | "PANIC"
  | "COMPRESSION";
export type SignalLifecycle =
  | "EMITTED"
  | "ACTIVE"
  | "DECAYING"
  | "INVALIDATED"
  | "COMPLETED";

export interface MarketOption {
  code: string;
  label: string;
  count: number;
}

export interface StockListItem {
  symbol: string;
  name: string;
  market?: string;
  sector?: string;
  image?: string;
  exchange: string;
  country: string;
}

export interface StockQuote {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  changePercent: number;
  status: StockStatus;
  high52: number;
  low52: number;
  history: number[];
  summary: string;
  impact: string;
  cap?: string;
  peRatio?: number;
  signalAction?: TradeSignal;
  signalConfidence?: number;
  signalSource?: "node-ecu" | "heuristic";
  signalEmittedAt?: string;
  signalEntryPrice?: number;
  signalReturnPercent?: number;
  quoteSource?: "binance-spot" | "binance-futures" | "tradingview";
  quoteStatus?: "available" | "pending" | "unavailable";
  quoteStatusReason?: string;
  quoteLastAttemptedAt?: number;
  regime?: AdaptiveRegime;
  confidence?: number;
  uncertainty?: number;
  driftScore?: number;
  stabilityScore?: number;
  expectedMovePct?: number;
  featureConsensus?: number;
  ensembleAgreement?: number;
  lifecycleState?: SignalLifecycle;
  liveMetrics?: {
    rollingSharpe: number;
    rollingSortino: number;
    hitRate: number;
    expectancy: number;
    profitFactor: number;
    maxDrawdown: number;
  };
  diagnostics?: {
    entropy: number;
    featureDrift: number;
    predictionResidual: number;
    volatilityShift: number;
  };
}

export type StockData = StockListItem & {
  ticker: string;
  price?: number;
  bid?: number;
  ask?: number;
  changePercent?: number;
  status?: StockStatus;
  high52?: number;
  low52?: number;
  history?: number[];
  summary?: string;
  impact?: string;
  cap?: string;
  peRatio?: number;
  signalAction?: TradeSignal;
  signalConfidence?: number;
  signalSource?: "node-ecu" | "heuristic";
  signalEmittedAt?: string;
  signalEntryPrice?: number;
  signalReturnPercent?: number;
  quoteSource?: "binance-spot" | "binance-futures" | "tradingview";
  quoteStatus?: "available" | "pending" | "unavailable";
  quoteStatusReason?: string;
  quoteLastAttemptedAt?: number;
  regime?: AdaptiveRegime;
  confidence?: number;
  uncertainty?: number;
  driftScore?: number;
  stabilityScore?: number;
  expectedMovePct?: number;
  featureConsensus?: number;
  ensembleAgreement?: number;
  lifecycleState?: SignalLifecycle;
  liveMetrics?: {
    rollingSharpe: number;
    rollingSortino: number;
    hitRate: number;
    expectancy: number;
    profitFactor: number;
    maxDrawdown: number;
  };
  diagnostics?: {
    entropy: number;
    featureDrift: number;
    predictionResidual: number;
    volatilityShift: number;
  };
};

export interface SignalEvent {
  id: string;
  scopeType: "market" | "exchange";
  scopeCode: string;
  symbol: string;
  token?: string;
  emittedAt: string;
  signal: StockQuote & Partial<StockData>;
}

export interface StockQuoteBatchResponse {
  market?: string;
  exchange?: string;
  requestedSymbols: string[];
  unavailableSymbols: string[];
  partial: boolean;
  quotes: StockQuote[];
}

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(
  /\/$/,
  "",
);

const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_RETRY_COUNT = 1;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const STATIC_CACHE_TTL_MS = 30 * 60_000;
const QUOTE_BATCH_CACHE_TTL_MS = 10 * 60_000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

function readCache<T>(key: string): T | null {
  const now = Date.now();
  const memoryEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memoryEntry && memoryEntry.expiresAt > now) return memoryEntry.value;
  if (memoryEntry) memoryCache.delete(key);

  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (entry.expiresAt > now) {
      memoryCache.set(key, entry);
      return entry.value;
    }
    sessionStorage.removeItem(key);
  } catch {
    return null;
  }

  return null;
}

function writeCache<T>(key: string, value: T, ttlMs: number) {
  const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
  memoryCache.set(key, entry);
  try {
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore storage pressure; the memory cache still covers this tab.
  }
}

export class ApiRequestError extends Error {
  status?: number;
  retryable: boolean;
  timedOut: boolean;

  constructor(
    message: string,
    options?: { status?: number; retryable?: boolean; timedOut?: boolean },
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options?.status;
    this.retryable = options?.retryable ?? false;
    this.timedOut = options?.timedOut ?? false;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(
  path: string,
  options?: RequestInit & { timeoutMs?: number; retryCount?: number },
): Promise<T> {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    retryCount = DEFAULT_RETRY_COUNT,
    ...fetchOptions
  } = options ?? {};

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const externalSignal = fetchOptions.signal;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abortListener = () => controller.abort();

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", abortListener, { once: true });
      }
    }

    try {
      const response = await fetch(`${apiBase}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...fetchOptions,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ApiRequestError(`Request failed: ${response.status}`, {
          status: response.status,
          retryable: RETRYABLE_STATUSES.has(response.status),
        });
      }

      const body = (await response.json()) as { data: T };
      return body.data;
    } catch (error) {
      const normalized =
        error instanceof ApiRequestError
          ? error
          : timedOut
            ? new ApiRequestError("Request timed out", {
              retryable: true,
              timedOut: true,
            })
            : new ApiRequestError(
              error instanceof Error ? error.message : "Request failed",
              { retryable: true },
            );

      if (attempt < retryCount && normalized.retryable) {
        await delay(500 * (attempt + 1));
        continue;
      }

      throw normalized;
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", abortListener);
      }
    }
  }

  throw new ApiRequestError("Request failed", { retryable: false });
}

export async function fetchMarkets(): Promise<MarketOption[]> {
  const key = "signal-markets:markets";
  const cached = readCache<MarketOption[]>(key);
  if (cached) return cached;
  const markets = await request<MarketOption[]>("/stocks/markets");
  writeCache(key, markets, STATIC_CACHE_TTL_MS);
  return markets;
}

export async function fetchStockList(
  market: string,
  offset = 0,
  limit = 24,
): Promise<{ market: string; total: number; items: StockListItem[] }> {
  const cacheKey = `signal-markets:stock-list:${market}:${offset}:${limit}`;
  const cached = readCache<{ market: string; total: number; items: StockListItem[] }>(
    cacheKey,
  );
  if (cached) return cached;

  const params = new URLSearchParams({
    market,
    offset: String(offset),
    limit: String(limit),
  });
  const stockList = await request<{ market: string; total: number; items: StockListItem[] }>(
    `/stocks/list?${params}`,
  );
  writeCache(cacheKey, stockList, STATIC_CACHE_TTL_MS);
  return stockList;
}

export async function fetchStockQuoteBatch(
  market: string,
  symbols: string[],
  options?: { withSignals?: boolean; timeoutMs?: number; retryCount?: number },
): Promise<StockQuoteBatchResponse> {
  if (!symbols.length) {
    return {
      market,
      requestedSymbols: [],
      unavailableSymbols: [],
      partial: false,
      quotes: [],
    };
  }

  const normalizedSymbols = Array.from(
    new Set(symbols.map((symbol) => symbol.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const cacheKey = `signal-markets:quote-batch:${market}:${options?.withSignals ? "signals" : "plain"}:${normalizedSymbols.join(",")}`;
  const cached = readCache<StockQuoteBatchResponse>(cacheKey);
  if (cached) return cached;

  const response = await request<{
    market?: string;
    exchange?: string;
    requestedSymbols?: string[];
    unavailableSymbols?: string[];
    partial?: boolean;
    quotes: StockQuote[];
  }>("/stocks/quotes", {
    method: "POST",
    body: JSON.stringify({
      market,
      symbols,
      withSignals: options?.withSignals,
    }),
    timeoutMs: options?.timeoutMs,
    retryCount: options?.retryCount,
  });

  const requestedSymbols = response.requestedSymbols ?? symbols;
  const returnedSymbols = new Set(response.quotes.map((quote) => quote.symbol));
  const unavailableSymbols =
    response.unavailableSymbols ??
    requestedSymbols.filter((symbol) => !returnedSymbols.has(symbol));

  const batch = {
    market: response.market,
    exchange: response.exchange,
    requestedSymbols,
    unavailableSymbols,
    partial: response.partial ?? unavailableSymbols.length > 0,
    quotes: response.quotes,
  };
  writeCache(cacheKey, batch, QUOTE_BATCH_CACHE_TTL_MS);
  return batch;
}

export async function fetchStockQuotes(
  market: string,
  symbols: string[],
  options?: { withSignals?: boolean; timeoutMs?: number; retryCount?: number },
): Promise<StockQuote[]> {
  const response = await fetchStockQuoteBatch(market, symbols, options);
  return response.quotes;
}

export async function registerSignalWatchlist(
  market: string,
  symbols: string[],
): Promise<{ registered: number }> {
  if (!symbols.length) {
    return { registered: 0 };
  }

  return request<{ registered: number }>("/stocks/signals/watch", {
    method: "POST",
    body: JSON.stringify({ market, symbols }),
    timeoutMs: 30_000,
    retryCount: 0,
  });
}

export async function fetchSignalHistory(
  market?: string,
  limit = 100,
): Promise<SignalEvent[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (market) params.set("market", market);
  return request<SignalEvent[]>(`/stocks/signals/history?${params}`);
}

export async function emitFakeSignal(
  data: Partial<StockData> & { symbol?: string; market?: string } = {},
): Promise<{ emitted: boolean }> {
  return request<{ emitted: boolean }>("/stocks/signals/fake", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
