const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "")
  .replace(/\/$/, "")
  .replace(/\/api\/stocks\/markets$/i, "")
  .replace(/\/api$/i, "");

function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!API_BASE_URL) {
    return normalizedPath;
  }

  return `${API_BASE_URL}${normalizedPath}`;
}

import {
  backtestCacheKey,
  recoverBacktestPayload,
  rememberBacktestPayload,
  shouldProtectBacktestUrl,
} from "./persistent-backtest-cache";
import { sanitizePromotionState } from "./promotion-sanity";
export type StockStatus = "Stable" | "Rising" | "Watch" | "Dip";
export type TradeSignal = "Hold" | "Buy" | "Sell";
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
export type ModelLifecycleState =
  | "RESEARCH"
  | "CANDIDATE"
  | "SHADOW"
  | "SMALL_LIVE"
  | "PRODUCTION"
  | "WATCHLIST"
  | "REDUCED"
  | "RETIRED";
export type ModelLifecycleAction =
  | "Awaiting Decision"
  | "Careful"
  | "Trusted"
  | "Disregard";

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
  modelId?: string;
  modelLifecycleState?: ModelLifecycleState;
  modelLifecycleAction?: ModelLifecycleAction;
  modelLifecycleReason?: string;
  modelCanOpenNewTrades?: boolean;
  modelAllocationMultiplier?: number;
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
  modelId?: string;
  modelLifecycleState?: ModelLifecycleState;
  modelLifecycleAction?: ModelLifecycleAction;
  modelLifecycleReason?: string;
  modelCanOpenNewTrades?: boolean;
  modelAllocationMultiplier?: number;
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

export interface EvaluationMetrics {
  expectancy_r: number;
  rolling_expectancy_r: number;
  profit_factor_after_costs: number;
  max_drawdown: number;
  average_winner_r: number;
  average_loser_r: number;
  top_1_profit_dependency: number;
  top_3_profit_dependency: number;
  result_without_top_1: number;
  result_without_top_3: number;
  slippage_sensitivity: number;
  live_vs_backtest_decay: number;
}

export interface ModelLifecycleRecord {
  model_id: string;
  parent_model_id: string | null;
  training_window_start: string;
  training_window_end: string;
  validation_window_start: string;
  validation_window_end: string;
  regime_scope: string;
  feature_hash: string;
  parameter_hash: string;
  objective_function: string;
  number_of_tested_variants: number;
  lifecycle_state: ModelLifecycleState;
  registered_at: string;
  updated_at: string;
}

export interface ModelLifecycleAuditEntry {
  audit_id: number;
  model_id: string;
  timestamp: string;
  old_state: ModelLifecycleState;
  new_state: ModelLifecycleState;
  metrics_snapshot: Partial<EvaluationMetrics>;
  reason: string;
}

export interface PortfolioDecisionTopTicker {
  ticker: string;
  action: string;
  allocationPct: number;
  targetCapital: number;
  quality: number;
  risk: number;
}

export interface PortfolioDecisionMemoryEntry {
  id: string;
  market: string;
  recordedAt: number;
  signature: string;
  recommendation: string;
  readiness: string;
  tone: "good" | "info" | "warn" | "bad";
  budget: number;
  targetAllocationPct: number;
  targetCapital: number;
  confidenceFilter: "small" | "balanced" | "normal";
  confidenceFilterLabel: string;
  lifecycleState: ModelLifecycleState;
  lifecycleLabel: string;
  topTickers: PortfolioDecisionTopTicker[];
  startPortfolioValue: number;
  startTotalReturn: number;
  startSharpe: number | null;
  startProfitFactor: number | null;
  startClosedTrades: number;
  startDrawdown: number;
  dataQualityPct: number;
}

export interface PortfolioDecisionOutcome {
  id: number;
  decisionId: string;
  windowLabel: "1d" | "7d" | "30d";
  evaluatedAt: number;
  outcome: "Too early" | "Helped" | "Hurt" | "Mixed";
  tone: "good" | "info" | "warn" | "bad";
  returnChange: number;
  sharpeChange: number;
  closedTradeChange: number;
  drawdownChange: number;
  trustChange: string;
}

export interface PortfolioDecisionAuditEntry {
  id: number;
  decisionId: string | null;
  market: string;
  eventType: "recorded" | "outcome_checked";
  timestamp: number;
  snapshot: Record<string, unknown>;
}

export interface StockQuoteBatchResponse {
  market?: string;
  exchange?: string;
  requestedSymbols: string[];
  unavailableSymbols: string[];
  deferredSymbols?: string[];
  partial: boolean;
  quotes: StockQuote[];
}


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

function sanitizeBacktestApiPayload<T>(url: string, payload: T): T {
  if (
    !url.includes("/api/portfolio") &&
    !url.includes("/portfolio") &&
    !url.includes("/api/strategy") &&
    !url.includes("/strategy")
  ) {
    return sanitizeBacktestApiPayload(requestUrl, payload);
  }

  const anyPayload: any = payload;

  if (anyPayload?.summary) {
    return {
      ...anyPayload,
      summary: sanitizePromotionState(anyPayload.summary),
      snapshot: anyPayload.snapshot
        ? sanitizePromotionState(anyPayload.snapshot)
        : anyPayload.snapshot,
    };
  }

  if (
    anyPayload &&
    typeof anyPayload === "object" &&
    ("tradeCount" in anyPayload || "survivalScore" in anyPayload || "backtestStatus" in anyPayload)
  ) {
    return sanitizePromotionState(anyPayload) as T;
  }

  return payload;
}


function protectBacktestApiPayload<T>(url: string, method: string, payload: T): T {
  if (!shouldProtectBacktestUrl(url)) return payload;

  const key = backtestCacheKey(url, method);
  const recovered = recoverBacktestPayload(key, payload);

  if (recovered === payload) {
    rememberBacktestPayload(key, payload);
  }

  return sanitizeBacktestApiPayload(requestUrl, recovered);
}


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
  options?: RequestInit & {
 timeoutMs?: number; retryCount?: number },
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
        const rawPath = typeof path === "string" ? path : String(path);

  if (
    rawPath.includes("/api/stocks/watch-market") &&
    import.meta.env.VITE_ENABLE_PORTFOLIO_API !== "true"
  ) {
    console.info("[api] Skipping /api/stocks/watch-market locally");
    return {
      ok: true,
      skipped: true,
      reason: "portfolio API disabled locally",
    } as any;
  }

  const response = await fetch(apiUrl(path), {
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

export async function fetchMarkets(): Promise<any[]> {
  const response = await request<any>("/api/stocks/markets");

  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.markets)) return response.markets;

  return [];
}

export async function fetchStockList(
  market: string,
  offset = 0,
  limit = 50,
): Promise<any> {
  const response = await request<any>(
    `/api/stocks/list?market=${encodeURIComponent(market)}&offset=${offset}&limit=${limit}`,
  );

  const items =
    Array.isArray(response)
      ? response
      : Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.items)
          ? response.items
          : Array.isArray(response?.stocks)
            ? response.stocks
            : [];

  console.log("[api] fetchStockList", { market, items, response });
  return {
    ...response,
    data: items,
    items,
    total: Number(response?.total ?? items.length),
    offset: Number(response?.offset ?? offset),
    limit: Number(response?.limit ?? limit),
    market: response?.market ?? market,
  };
}

export async function fetchStockQuoteBatch(
  market: string,
  symbols: string[],
  options?: {
    withSignals?: boolean;
    timeoutMs?: number;
    retryCount?: number;
  },
): Promise<{ quotes: any[] }> {
  const response = await request<any>("/api/stocks/quotes", {
    method: "POST",
    body: JSON.stringify({
      market,
      symbols,
      withSignals: options?.withSignals ?? true,
      timeoutMs: options?.timeoutMs,
      retryCount: options?.retryCount,
    }),
  });

  const quotes =
    Array.isArray(response)
      ? response
      : Array.isArray(response?.quotes)
        ? response.quotes
        : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.items)
            ? response.items
            : [];

  console.log("[api] fetchStockQuoteBatch", { market, symbols, quotes });
  return { quotes };
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
): Promise<void> {
  await request("/api/stocks/watch-market", {
    method: "POST",
    body: JSON.stringify({ market, symbols }),
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

export async function fetchModelLifecycle(): Promise<ModelLifecycleRecord[]> {
  return request<ModelLifecycleRecord[]>("/stocks/model-lifecycle", {
    timeoutMs: 30_000,
    retryCount: 0,
  });
}

export async function fetchModelLifecycleAudit(
  modelId?: string,
): Promise<ModelLifecycleAuditEntry[]> {
  const params = new URLSearchParams();
  if (modelId) params.set("modelId", modelId);
  return request<ModelLifecycleAuditEntry[]>(
    `/stocks/model-lifecycle/audit${params.size ? `?${params}` : ""}`,
    {
      timeoutMs: 30_000,
      retryCount: 0,
    },
  );
}

export async function createModelLifecycleCandidate(input: {
  market: string;
  parentModelId?: string;
  reason?: string;
}): Promise<{ created: number; models: ModelLifecycleRecord[] }> {
  return request<{ created: number; models: ModelLifecycleRecord[] }>(
    "/stocks/model-lifecycle/candidate",
    {
      method: "POST",
      body: JSON.stringify(input),
      timeoutMs: 30_000,
      retryCount: 0,
    },
  );
}

export async function fetchPortfolioDecisionMemory(
  market?: string,
  limit = 50,
): Promise<PortfolioDecisionMemoryEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (market) params.set("market", market);
  return request<PortfolioDecisionMemoryEntry[]>(
    `/stocks/portfolio-decisions?${params}`,
    {
      timeoutMs: 30_000,
      retryCount: 0,
    },
  );
}

export async function fetchPortfolioDecisionAudit(
  market?: string,
  limit = 50,
): Promise<PortfolioDecisionAuditEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (market) params.set("market", market);
  return request<PortfolioDecisionAuditEntry[]>(
    `/stocks/portfolio-decisions/audit?${params}`,
    {
      timeoutMs: 30_000,
      retryCount: 0,
    },
  );
}

export async function fetchPortfolioDecisionOutcomes(
  market?: string,
  limit = 50,
): Promise<PortfolioDecisionOutcome[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (market) params.set("market", market);
  return request<PortfolioDecisionOutcome[]>(
    `/stocks/portfolio-decisions/outcomes?${params}`,
    {
      timeoutMs: 30_000,
      retryCount: 0,
    },
  );
}

export async function recordPortfolioDecisionMemory(
  entry: PortfolioDecisionMemoryEntry,
): Promise<PortfolioDecisionMemoryEntry> {
  return request<PortfolioDecisionMemoryEntry>("/stocks/portfolio-decisions", {
    method: "POST",
    body: JSON.stringify(entry),
    timeoutMs: 30_000,
    retryCount: 0,
  });
}

export async function reviewPortfolioDecisionOutcomes(input: {
  market: string;
  evaluatedAt?: number;
  currentPortfolioValue: number;
  currentTotalReturn: number;
  currentSharpe: number | null;
  currentProfitFactor: number | null;
  currentClosedTrades: number;
  currentDrawdown: number;
  lifecycleState: ModelLifecycleState;
  lifecycleLabel: string;
}): Promise<{
  entries: PortfolioDecisionMemoryEntry[];
  outcomes: PortfolioDecisionOutcome[];
}> {
  return request<{
    entries: PortfolioDecisionMemoryEntry[];
    outcomes: PortfolioDecisionOutcome[];
  }>("/stocks/portfolio-decisions/outcomes", {
    method: "POST",
    body: JSON.stringify(input),
    timeoutMs: 30_000,
    retryCount: 0,
  });
}

export async function emitFakeSignal(
  data: Partial<StockData> & { symbol?: string; market?: string } = {},
): Promise<{ emitted: boolean }> {
  return request<{ emitted: boolean }>("/stocks/signals/fake", {
    method: "POST",
    body: JSON.stringify(data),
  });
}