import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Navbar } from "@/components/navbar";
import { toast } from "@/hooks/use-toast";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Brain,
  Layers,
  RefreshCcw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import {
  buildCalibrationState,
  classifyMarketRegime,
  decideMetaAllocation,
  forecastSignalSurvival,
  type CalibrationState,
  type DiagnosticInputs,
  type MarketRegimeClassification,
  type MetaAllocationDecision,
  type SurvivalForecast,
} from "@/lib/metaAllocation";
import {
  ApiRequestError,
  emitFakeSignal,
  fetchModelLifecycle,
  fetchPortfolioDecisionAudit,
  fetchPortfolioDecisionMemory,
  fetchSignalHistory,
  fetchMarkets,
  fetchStockList,
  fetchStockQuoteBatch,
  registerSignalWatchlist,
  recordPortfolioDecisionMemory,
  reviewPortfolioDecisionOutcomes,
  type MarketOption,
  type ModelLifecycleRecord,
  type ModelLifecycleState,
  type PortfolioDecisionAuditEntry,
  type SignalEvent,
  type AdaptiveRegime,
  type SignalLifecycle,
  type StockListItem,
  type StockData,
  type StockQuote,
  type StockStatus,
  type TradeSignal,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const DISPLAY_ZERO_THRESHOLD = 0.005;
const MARKET_DATA_CACHE_TTL_MS = 30 * 60_000;
const LIVE_QUOTE_CACHE_TTL_MS = MARKET_DATA_CACHE_TTL_MS;
const UNAVAILABLE_LIVE_QUOTE_CACHE_TTL_MS = 5 * 60_000;

type CachedQuoteEntry =
  | { status: "available"; quote: StockQuote; cachedAt: number }
  | { status: "unavailable"; reason: string; cachedAt: number };

const liveQuoteCache = new Map<string, CachedQuoteEntry>();

type CachedMarketData = {
  stocks: StockData[];
  selectedTicker?: string;
  lastSyncedAt: number | null;
  syncTotal: number;
  syncAttempted: number;
  syncUnavailable: number;
  cachedAt: number;
};

function marketDataCacheKey(market: string) {
  return `signal-markets:market-data:${market.trim().toUpperCase()}`;
}

function cacheStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readMarketDataCache(market: string): CachedMarketData | null {
  const storage = cacheStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(marketDataCacheKey(market));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedMarketData;
    if (Date.now() - cached.cachedAt > MARKET_DATA_CACHE_TTL_MS) {
      storage.removeItem(marketDataCacheKey(market));
      return null;
    }
    if (!Array.isArray(cached.stocks) || !cached.stocks.length) return null;
    hydrateLiveQuoteCacheFromStocks(market, cached.stocks, cached.cachedAt);
    return cached;
  } catch {
    return null;
  }
}

function writeMarketDataCache(market: string, data: Omit<CachedMarketData, "cachedAt">) {
  const storage = cacheStorage();
  if (!storage) return;
  try {
    storage.setItem(
      marketDataCacheKey(market),
      JSON.stringify({ ...data, cachedAt: Date.now() }),
    );
  } catch {
    // Ignore storage pressure; live state still holds the latest sweep.
  }
}

function hydrateLiveQuoteCacheFromStocks(
  market: string,
  stocks: StockData[],
  cachedAt: number,
) {
  for (const stock of stocks) {
    if (!stock.ticker || !Number.isFinite(stock.price)) continue;
    liveQuoteCache.set(liveQuoteCacheKey(market, stock.ticker), {
      status: "available",
      quote: {
        ...stock,
        symbol: stock.ticker,
        quoteStatus: "available",
        quoteStatusReason: undefined,
        quoteLastAttemptedAt: cachedAt,
      } as StockQuote,
      cachedAt,
    });
  }
}

function liveQuoteCacheKey(market: string, symbol: string) {
  return `${market.trim().toUpperCase()}:${symbol.trim().toUpperCase()}`;
}

function isLiveQuoteCacheEntryFresh(entry: CachedQuoteEntry) {
  const ttl =
    entry.status === "available"
      ? LIVE_QUOTE_CACHE_TTL_MS
      : UNAVAILABLE_LIVE_QUOTE_CACHE_TTL_MS;
  return Date.now() - entry.cachedAt < ttl;
}

function readLiveQuoteCache(market: string, symbols: string[]) {
  const cachedQuotes: StockQuote[] = [];
  const cachedUnavailableSymbols: string[] = [];
  const uncachedSymbols: string[] = [];

  for (const symbol of symbols) {
    const cacheKey = liveQuoteCacheKey(market, symbol);
    const cached = liveQuoteCache.get(cacheKey);
    if (!cached) {
      uncachedSymbols.push(symbol);
      continue;
    }

    if (!isLiveQuoteCacheEntryFresh(cached)) {
      liveQuoteCache.delete(cacheKey);
      uncachedSymbols.push(symbol);
      continue;
    }

    if (cached.status === "available") {
      cachedQuotes.push(cached.quote);
    } else {
      cachedUnavailableSymbols.push(symbol);
    }
  }

  return { cachedQuotes, cachedUnavailableSymbols, uncachedSymbols };
}

function cacheLiveQuotes(market: string, quotes: Array<{ symbol: string } & Partial<StockQuote>>) {
  const cachedAt = Date.now();
  for (const quote of quotes) {
    if (!quote.symbol) continue;
    liveQuoteCache.set(liveQuoteCacheKey(market, quote.symbol), {
      status: "available",
      quote: {
        ...quote,
        quoteStatus: "available",
        quoteStatusReason: undefined,
        quoteLastAttemptedAt: cachedAt,
      } as StockQuote,
      cachedAt,
    });
  }
}

function cacheUnavailableLiveQuotes(
  market: string,
  symbols: string[],
  reason = "No institutional-grade quote was available for this instrument.",
) {
  const cachedAt = Date.now();
  for (const symbol of symbols) {
    liveQuoteCache.set(liveQuoteCacheKey(market, symbol), {
      status: "unavailable",
      reason,
      cachedAt,
    });
  }
}

function isPlaceholderQuoteSummary(summary?: string) {
  return (
    !summary ||
    summary === SYNCING_QUOTE_SUMMARY ||
    summary === MARKET_CLOSED_QUOTE_SUMMARY ||
    summary === UNAVAILABLE_QUOTE_SUMMARY
  );
}

function isPlaceholderQuoteImpact(impact?: string) {
  return (
    !impact ||
    impact === "Coverage will update as the market sweep reaches this instrument." ||
    impact === MARKET_CLOSED_QUOTE_IMPACT ||
    impact === UNAVAILABLE_QUOTE_IMPACT
  );
}

function formatMaybeCurrency(value: number | undefined | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  const displayValue = Math.abs(value) < DISPLAY_ZERO_THRESHOLD ? 0 : value;
  return displayValue.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number | undefined | null) {
  if (value == null || !Number.isFinite(value)) return "0.00";
  const displayValue = Math.abs(value) < DISPLAY_ZERO_THRESHOLD ? 0 : value;
  return displayValue.toFixed(2);
}

function formatQuantity(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 6,
  });
}

function formatSignalTime(dateStr: string | undefined) {
  if (!dateStr) return "—";
  const timestamp = Date.parse(dateStr);
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function describeSignalToast(signal: Partial<StockData> & { symbol?: string }) {
  const symbol = signal.symbol ?? signal.ticker ?? "Instrument";
  const action = signal.signalAction ?? "Hold";
  const status = signal.status ?? "Stable";
  const price = formatMaybeCurrency(signal.price);
  const confidence =
    signal.signalConfidence != null
      ? `${Math.round(Number(signal.signalConfidence))}%`
      : "—";

  return {
    title: `${symbol} ${action} · ${status}`,
    description: `${price} · conviction quality ${confidence}`,
  };
}

function makeLocalSignalEvent(
  signal: Partial<StockData> & { symbol?: string },
  market: string,
): SignalEvent {
  const symbol = signal.symbol ?? signal.ticker ?? "UNKNOWN";
  const emittedAt = signal.signalEmittedAt ?? new Date().toISOString();

  return {
    id: `${symbol}-${emittedAt}-${Math.random().toString(36).slice(2)}`,
    scopeType: "market",
    scopeCode: market || "LOCAL",
    symbol,
    emittedAt,
    signal: {
      symbol,
      price: Number(signal.price ?? 0),
      changePercent: Number(signal.changePercent ?? 0),
      status: signal.status ?? "Stable",
      high52: Number(signal.high52 ?? signal.price ?? 0),
      low52: Number(signal.low52 ?? signal.price ?? 0),
      history: signal.history ?? [],
      summary: signal.summary ?? "",
      impact: signal.impact ?? "",
      ...signal,
    },
  };
}

type MarketSchedule = {
  timeZone: string;
  open: [number, number];
  close: [number, number];
  weekend: number[];
};

const MARKET_SCHEDULES: Array<{ match: RegExp; schedule: MarketSchedule }> = [
  {
    match: /BINANCE|CRYPTO/i,
    schedule: { timeZone: "UTC", open: [0, 0], close: [24, 0], weekend: [] },
  },
  {
    match: /B3|BMFBOVESPA|BRASIL/i,
    schedule: {
      timeZone: "America/Sao_Paulo",
      open: [10, 0],
      close: [17, 0],
      weekend: [0, 6],
    },
  },
  {
    match: /NASDAQ|NYSE|AMEX|ARCA|BATS|IEX|NYSEAMERICAN|NYSEARCA|NASDAQGS|NASDAQGM|NASDAQCM|US\b/i,
    schedule: {
      timeZone: "America/New_York",
      open: [9, 30],
      close: [16, 0],
      weekend: [0, 6],
    },
  },
  {
    match: /LSE|LONDON|AIM|UNITED KINGDOM|\bUK\b/i,
    schedule: {
      timeZone: "Europe/London",
      open: [8, 0],
      close: [16, 30],
      weekend: [0, 6],
    },
  },
  {
    match: /EURONEXT|PARIS|AMSTERDAM|BRUSSELS|LISBON/i,
    schedule: {
      timeZone: "Europe/Paris",
      open: [9, 0],
      close: [17, 30],
      weekend: [0, 6],
    },
  },
  {
    match: /TSE|TOKYO|JAPAN|JP\b/i,
    schedule: {
      timeZone: "Asia/Tokyo",
      open: [9, 0],
      close: [15, 0],
      weekend: [0, 6],
    },
  },
];

const DEFAULT_MARKET_SCHEDULE: MarketSchedule = {
  timeZone: "America/New_York",
  open: [9, 30],
  close: [16, 0],
  weekend: [0, 6],
};
const STARTING_PORTFOLIO_VALUE = 1000;
const STOCK_LIST_PAGE_SIZE = 5000;
const QUOTE_REQUEST_SYMBOL_BATCH_SIZE = 24;
const QUOTE_BATCH_DELAY_MS = 0;
const QUOTE_REQUEST_TIMEOUT_MS = 75_000;
const SYNCING_QUOTE_SUMMARY = "Market sweep in progress.";
const MARKET_CLOSED_QUOTE_SUMMARY = "Market closed. Coverage paused.";
const MARKET_CLOSED_QUOTE_IMPACT =
  "Coverage will resume when the venue reopens.";
const UNAVAILABLE_QUOTE_SUMMARY =
  "Quote unavailable from the current venue feed.";
const UNAVAILABLE_QUOTE_IMPACT =
  "The instrument remains in coverage, but the venue feed did not return a usable quote.";
const PREFERRED_INITIAL_MARKETS = ["BINANCE", "CRYPTO", "NASDAQ", "NYSE", "AMEX"];
const statusOptions: Array<StockStatus | "All"> = [
  "All",
  "Stable",
  "Rising",
  "Watch",
  "Dip",
];
const signalOptions: Array<TradeSignal | "All"> = [
  "All",
  "Buy",
  "Hold",
  "Sell",
];
type RiskMode = "small" | "balanced" | "normal";
const RISK_MODE_CONFIG: Record<RiskMode, { label: string; description: string; maxExposure: number; allocationMultiplier: number; minQuality: number }> = {
  small: {
    label: "Conservative",
    description: "Only strongest setups qualify.",
    maxExposure: 20,
    allocationMultiplier: 0.45,
    minQuality: 55,
  },
  balanced: {
    label: "Balanced",
    description: "Quality filter with moderate sizing.",
    maxExposure: 45,
    allocationMultiplier: 0.72,
    minQuality: 48,
  },
  normal: {
    label: "Aggressive",
    description: "More participation, wider risk budget.",
    maxExposure: 75,
    allocationMultiplier: 1,
    minQuality: 42,
  },
};
const LEGACY_PORTFOLIO_STORAGE_KEYS = [
  "signal-markets:portfolios",
  "signal-markets:portfolios:v",
  "signal-markets:portfolios:v2",
];
const PORTFOLIO_STORAGE_KEY = "signal-markets:portfolios:v3";
const PORTFOLIO_STORAGE_PREFIX = "signal-markets:portfolios";
const PORTFOLIO_BUDGET_STORAGE_KEY = "signal-markets:portfolio-budgets:v1";
const SELECTED_MARKET_STORAGE_KEY = "signal-markets:preference:selected-market:v1";
const RISK_MODE_STORAGE_KEY = "signal-markets:preference:confidence-filter:v1";
const SIGNAL_PAGE_SIZE_STORAGE_KEY = "signal-markets:preference:signal-page-size:v1";
const DECISION_MEMO_STORAGE_KEY = "signal-markets:preference:decision-memo-expanded:v1";
const DECISION_MEMORY_STORAGE_KEY = "signal-markets:decision-memory:v1";
const DECISION_MEMORY_LIMIT = 60;
const SIMULATED_EXECUTIONS_ENABLED =
  import.meta.env.VITE_ENABLE_SIMULATED_EXECUTIONS !== "false";
const FRESH_START_STORAGE_KEY =
  "signal-markets:fresh-start:allocation-ledger:2026-05-21";

function clearSignalMarketsStorageForFreshStart() {
  try {
    if (localStorage.getItem(FRESH_START_STORAGE_KEY) === "done") {
      return;
    }

    const keysToRemove = new Set<string>([
      ...LEGACY_PORTFOLIO_STORAGE_KEYS,
      PORTFOLIO_STORAGE_KEY,
    ]);
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("signal-markets:")) {
        keysToRemove.add(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    localStorage.setItem(FRESH_START_STORAGE_KEY, "done");
  } catch {
    // Ignore storage failures in private browsing or restricted previews.
  }
}

function clearPortfolioStorage() {
  try {
    const keysToRemove = new Set<string>([
      ...LEGACY_PORTFOLIO_STORAGE_KEYS,
      PORTFOLIO_STORAGE_KEY,
    ]);
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(PORTFOLIO_STORAGE_PREFIX)) {
        keysToRemove.add(key);
      }
    }
    for (const key of keysToRemove) localStorage.removeItem(key);
  } catch {
    // Ignore storage failures in private browsing or restricted previews.
  }
}

function normalizeBudgetMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const budgets: Record<string, number> = {};
  for (const [market, rawBudget] of Object.entries(value as Record<string, unknown>)) {
    const budget = Number(rawBudget);
    if (Number.isFinite(budget) && budget > 0) budgets[market] = budget;
  }
  return budgets;
}

function readStoredString(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function readStoredRiskMode() {
  const stored = readStoredString(RISK_MODE_STORAGE_KEY, "small");
  return stored in RISK_MODE_CONFIG ? stored as RiskMode : "small";
}

function readStoredSignalPageSize() {
  try {
    const stored = Number(localStorage.getItem(SIGNAL_PAGE_SIZE_STORAGE_KEY));
    return [20, 50, 100].includes(stored) ? stored : 20;
  } catch {
    return 20;
  }
}

function readStoredBoolean(key: string, fallback = false) {
  try {
    const stored = localStorage.getItem(key);
    if (stored == null) return fallback;
    return stored === "true";
  } catch {
    return fallback;
  }
}

function writeStoredPreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in private browsing or restricted previews.
  }
}

type DecisionMemoryTopTicker = {
  ticker: string;
  action: ExecutionDecision["actionLabel"];
  allocationPct: number;
  targetCapital: number;
  quality: number;
  risk: number;
};

type DecisionMemoryEntry = {
  id: string;
  market: string;
  recordedAt: number;
  signature: string;
  recommendation: string;
  readiness: string;
  tone: UserActionTone;
  budget: number;
  targetAllocationPct: number;
  targetCapital: number;
  confidenceFilter: RiskMode;
  confidenceFilterLabel: string;
  lifecycleState: ModelLifecycleState;
  lifecycleLabel: string;
  topTickers: DecisionMemoryTopTicker[];
  startPortfolioValue: number;
  startTotalReturn: number;
  startSharpe: number | null;
  startProfitFactor: number | null;
  startClosedTrades: number;
  startDrawdown: number;
  dataQualityPct: number;
};

function normalizeDecisionMemory(value: unknown): DecisionMemoryEntry[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((entry): DecisionMemoryEntry | null => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Partial<DecisionMemoryEntry>;
      const market = String(item.market ?? "").trim();
      const recordedAt = Number(item.recordedAt);
      if (!market || !Number.isFinite(recordedAt)) return null;
      const confidenceFilter = item.confidenceFilter && item.confidenceFilter in RISK_MODE_CONFIG
        ? item.confidenceFilter
        : "small";
      const lifecycleState = item.lifecycleState ?? "RESEARCH";
      return {
        id: String(item.id ?? `${market}:${recordedAt}`),
        market,
        recordedAt,
        signature: String(item.signature ?? ""),
        recommendation: String(item.recommendation ?? "Hold Cash"),
        readiness: String(item.readiness ?? "Paper trade only"),
        tone: item.tone === "good" || item.tone === "bad" || item.tone === "warn" ? item.tone : "info",
        budget: Number(item.budget) || STARTING_PORTFOLIO_VALUE,
        targetAllocationPct: Number(item.targetAllocationPct) || 0,
        targetCapital: Number(item.targetCapital) || 0,
        confidenceFilter,
        confidenceFilterLabel: String(item.confidenceFilterLabel ?? RISK_MODE_CONFIG[confidenceFilter].label),
        lifecycleState,
        lifecycleLabel: String(item.lifecycleLabel ?? plainLifecycleState(lifecycleState)),
        topTickers: Array.isArray(item.topTickers)
          ? item.topTickers.slice(0, 4).map((ticker) => ({
            ticker: String(ticker.ticker ?? ""),
            action: String(ticker.action ?? "Hold") as ExecutionDecision["actionLabel"],
            allocationPct: Number(ticker.allocationPct) || 0,
            targetCapital: Number(ticker.targetCapital) || 0,
            quality: Number(ticker.quality) || 0,
            risk: Number(ticker.risk) || 0,
          })).filter((ticker) => ticker.ticker)
          : [],
        startPortfolioValue: Number(item.startPortfolioValue) || 0,
        startTotalReturn: Number(item.startTotalReturn) || 0,
        startSharpe: item.startSharpe == null ? null : Number(item.startSharpe),
        startProfitFactor: item.startProfitFactor == null ? null : Number(item.startProfitFactor),
        startClosedTrades: Number(item.startClosedTrades) || 0,
        startDrawdown: Number(item.startDrawdown) || 0,
        dataQualityPct: Number(item.dataQualityPct) || 0,
      };
    })
    .filter((entry): entry is DecisionMemoryEntry => Boolean(entry))
    .sort((a, b) => b.recordedAt - a.recordedAt);
  const seen = new Set<string>();
  return normalized.filter((entry) => {
    const key = `${entry.market}:${entry.signature || entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, DECISION_MEMORY_LIMIT);
}

function readDecisionMemory() {
  try {
    const saved = localStorage.getItem(DECISION_MEMORY_STORAGE_KEY);
    return saved ? normalizeDecisionMemory(JSON.parse(saved)) : [];
  } catch {
    return [];
  }
}

function writeDecisionMemory(entries: DecisionMemoryEntry[]) {
  try {
    localStorage.setItem(
      DECISION_MEMORY_STORAGE_KEY,
      JSON.stringify(normalizeDecisionMemory(entries)),
    );
  } catch {
    // Ignore storage failures in private browsing or restricted previews.
  }
}

function resolveMarketSchedule(market: string): MarketSchedule {
  const normalized = market.trim().toUpperCase();
  if (!normalized) return DEFAULT_MARKET_SCHEDULE;
  return (
    MARKET_SCHEDULES.find((entry) => entry.match.test(normalized))?.schedule ??
    DEFAULT_MARKET_SCHEDULE
  );
}

function getMarketStatus(market: string): "Open" | "Closed" {
  const schedule = resolveMarketSchedule(market);
  if (schedule.open[0] === 0 && schedule.close[0] === 24 && !schedule.weekend.length) {
    return "Open";
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );
  const weekdayText =
    parts.find((part) => part.type === "weekday")?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayIndex = weekdayMap[weekdayText] ?? 0;

  if (schedule.weekend.includes(dayIndex)) return "Closed";

  const nowMinutes = hour * 60 + minute;
  const openMinutes = schedule.open[0] * 60 + schedule.open[1];
  const closeMinutes = schedule.close[0] * 60 + schedule.close[1];
  const isOpen =
    closeMinutes >= openMinutes
      ? nowMinutes >= openMinutes && nowMinutes < closeMinutes
      : nowMinutes >= openMinutes || nowMinutes < closeMinutes;

  return isOpen ? "Open" : "Closed";
}

function describeRefreshError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.timedOut) return "Market coverage timed out. Retrying shortly.";
    if (error.status === 429) return "Market price feed is rate limited. Retrying shortly.";
    if (error.status) return `Market coverage unavailable (${error.status}). Retrying shortly.`;
  }

  return "Market coverage unavailable. Retrying shortly.";
}

function formatSyncTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function getOverallSignal(stocks: StockData[]): string {
  if (!stocks.length) return "Awaiting Coverage";

  const stableCount = stocks.filter(
    (stock) => (stock.status ?? "Stable") === "Stable",
  ).length;
  const buyCount = stocks.filter((stock) => stock.signalAction === "Buy").length;
  const sellCount = stocks.filter(
    (stock) => stock.signalAction === "Sell",
  ).length;

  if (stableCount / stocks.length >= 0.5) return "Balanced Tape";
  if (buyCount > sellCount) return "Constructive Trend Environment";
  if (sellCount > buyCount) return "Capital Preservation Phase";
  return "Mixed Regime";
}

type SimulatedPosition = StockData & {
  quantity: number;
  entryPrice: number;
  investedAmount: number;
  marketValue: number;
  targetWeight: number;
  openedAt: number;
  entrySignalKey?: string;
};

type SimulatedPortfolio = {
  cash: number;
  positions: Record<string, SimulatedPosition>;
  startedAt: number | null;   // epoch ms when this portfolio was first opened; null if not yet started
  startValue: number;  // initial capital (used as cumulative baseline)
  valueHistory: Array<{ t: number; v: number }>; // cumulative value over time
  closedPositions: Array<{ ticker: string; name?: string; quantity: number; entryPrice: number; exitPrice: number; investedAmount: number; proceeds: number; openedAt: number; closedAt: number; entrySignalKey?: string }>;
};
type ClosedPosition = SimulatedPortfolio["closedPositions"][number];

function createEmptyPortfolio(startValue = STARTING_PORTFOLIO_VALUE): SimulatedPortfolio {
  return {
    cash: startValue,
    positions: {},
    startedAt: null,
    startValue,
    valueHistory: [],
    closedPositions: [],
  };
}

function toUtcDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
}

function rounded(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function closedPositionFingerprint(position: ClosedPosition): string {
  return [
    position.ticker.trim().toUpperCase(),
    position.entrySignalKey ?? "legacy",
    rounded(position.quantity, 6),
    rounded(position.entryPrice, 4),
    rounded(position.exitPrice, 4),
    toUtcDayKey(position.openedAt),
    toUtcDayKey(position.closedAt),
  ].join("|");
}

function dedupeClosedPositions(items: ClosedPosition[]): ClosedPosition[] {
  const seen = new Set<string>();
  const deduped: ClosedPosition[] = [];

  for (const item of items) {
    const key = closedPositionFingerprint(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function normalizePortfolioStorage(
  portfolios: Record<string, SimulatedPortfolio>,
): Record<string, SimulatedPortfolio> {
  return Object.fromEntries(
    Object.entries(portfolios).map(([market, portfolio]) => [
      market,
      {
        ...portfolio,
        closedPositions: dedupeClosedPositions(portfolio.closedPositions ?? []),
      },
    ]),
  );
}

function isBuySetup(stock: StockData): boolean {
  return stock.signalAction === "Buy" || stock.status === "Rising";
}

function signalEntryKey(stock: StockData): string {
  const emittedAt = stock.signalEmittedAt
    ? String(stock.signalEmittedAt)
    : "unknown-time";
  const entryPrice = Number(stock.signalEntryPrice);
  const priceKey = Number.isFinite(entryPrice) && entryPrice > 0
    ? rounded(entryPrice, 6)
    : "market";

  return [
    stock.ticker.trim().toUpperCase(),
    stock.signalAction ?? "Hold",
    emittedAt,
    priceKey,
  ].join("|");
}

function returnsFromHistory(history: number[] | undefined): number[] {
  const prices = (history ?? []).filter((price) => Number.isFinite(price) && price > 0);
  if (prices.length < 2) return [];

  return prices
    .slice(1)
    .map((price, index) => {
      const previous = prices[index];
      return (price - previous) / previous;
    })
    .filter((value) => Number.isFinite(value));
}

function covariance(a: number[], b: number[], meanA: number, meanB: number) {
  const length = Math.min(a.length, b.length);
  if (length < 2) return 0;

  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += (a[a.length - length + index] - meanA) * (b[b.length - length + index] - meanB);
  }
  return sum / (length - 1);
}

function portfolioSharpe(weights: number[], means: number[], covariances: number[][]) {
  const expectedReturn = weights.reduce(
    (sum, weight, index) => sum + weight * means[index],
    0,
  );
  let variance = 0;
  for (let row = 0; row < weights.length; row += 1) {
    for (let column = 0; column < weights.length; column += 1) {
      variance += weights[row] * weights[column] * covariances[row][column];
    }
  }

  const risk = Math.sqrt(Math.max(variance, 1e-10));
  return expectedReturn / risk;
}

function normalizeWeights(weights: number[]) {
  const cleaned = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 0,
  );
  const total = cleaned.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return weights.map(() => 1 / weights.length);
  }
  return cleaned.map((weight) => weight / total);
}

function maxSharpeWeights(stocks: StockData[]): number[] {
  if (stocks.length <= 1) return stocks.map(() => 1);

  const returnSeries = stocks.map((stock) => returnsFromHistory(stock.history));
  if (returnSeries.some((series) => series.length < 2)) {
    return stocks.map(() => 1 / stocks.length);
  }

  const means = returnSeries.map(
    (series) => series.reduce((sum, value) => sum + value, 0) / series.length,
  );
  const covariances = returnSeries.map((seriesA, row) =>
    returnSeries.map((seriesB, column) =>
      covariance(seriesA, seriesB, means[row], means[column]),
    ),
  );
  const candidates: number[][] = [];
  candidates.push(stocks.map(() => 1 / stocks.length));
  for (let index = 0; index < stocks.length; index += 1) {
    candidates.push(stocks.map((_, candidateIndex) => (candidateIndex === index ? 1 : 0)));
  }
  candidates.push(
    normalizeWeights(
      means.map((mean, index) => {
        const variance = Math.max(covariances[index][index], 1e-8);
        return Math.max(0, mean) / variance;
      }),
    ),
  );

  for (let sample = 1; sample <= 1200; sample += 1) {
    candidates.push(
      normalizeWeights(
        stocks.map((_, index) => {
          const seed = Math.sin((sample + 1) * (index + 3) * 12.9898) * 43758.5453;
          return seed - Math.floor(seed);
        }),
      ),
    );
  }

  return candidates.reduce((best, candidate) =>
    portfolioSharpe(candidate, means, covariances) >
      portfolioSharpe(best, means, covariances)
      ? candidate
      : best,
  );
}

// StatusBadge and SignalBadge components
function StatusBadge({ status }: { status: StockStatus }) {
  let variant: any = "default";
  if (status === "Rising") variant = "secondary";
  if (status === "Dip") variant = "destructive";
  if (status === "Watch") variant = "outline";
  return <Badge variant={variant}>{status}</Badge>;
}
function SignalBadge({ action }: { action: TradeSignal }) {
  let color = "bg-slate-500/15 text-slate-300 border border-slate-500/30";
  if (action === "Buy") color = "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
  if (action === "Sell") color = "bg-rose-500/15 text-rose-300 border border-rose-500/30";
  if (action === "Hold") color = "bg-sky-500/15 text-sky-300 border border-sky-500/30";
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs font-semibold", color)}>
      {action}
    </span>
  );
}

type AdaptiveSignalView = StockData & {
  adaptiveId: string;
  regime: AdaptiveRegime;
  confidence: number;
  uncertainty: number;
  driftScore: number;
  stabilityScore: number;
  expectedMovePct: number;
  featureConsensus: number;
  ensembleAgreement: number;
  rollingSharpe: number;
  rollingSortino: number;
  hitRate: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdown: number;
  entropy: number;
  predictionResidual: number;
  volatilityShift: number;
  lifecycleState: SignalLifecycle;
  signalAgeMs: number;
  confidenceColor: string;
  regimeColor: string;
};

function clampMetric(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stddev(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (values.length - 1),
  );
}

function maxDrawdownFromReturns(returns: number[]) {
  let value = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const periodReturn of returns) {
    value *= 1 + periodReturn;
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - value) / peak : 0);
  }
  return maxDrawdown;
}

function rollingReturns(stock: StockData) {
  return returnsFromHistory(stock.history).slice(-30);
}

function regimeColor(regime: AdaptiveRegime) {
  const colors: Record<AdaptiveRegime, string> = {
    TRENDING: "hsl(150 74% 46%)",
    MEAN_REVERTING: "hsl(200 82% 55%)",
    HIGH_VOL: "hsl(31 92% 55%)",
    LOW_VOL: "hsl(215 26% 58%)",
    BREAKOUT: "hsl(169 84% 44%)",
    PANIC: "hsl(0 84% 60%)",
    COMPRESSION: "hsl(267 84% 68%)",
  };
  return colors[regime];
}

function confidenceColor(action: TradeSignal, confidence: number, uncertainty: number) {
  const alpha = clampMetric((confidence - uncertainty * 0.35) / 100, 0.18, 0.96);
  if (action === "Buy") return `rgba(16, 185, 129, ${alpha})`;
  if (action === "Sell") return `rgba(244, 63, 94, ${alpha})`;
  return `rgba(56, 189, 248, ${alpha})`;
}

function deriveRegime(stock: StockData): AdaptiveRegime {
  const change = Number(stock.changePercent ?? 0);
  const absChange = Math.abs(change);
  const returns = rollingReturns(stock);
  const vol = stddev(returns) * 100;
  const range =
    stock.high52 && stock.low52 && stock.price
      ? ((stock.high52 - stock.low52) / Math.max(stock.price, 0.0001)) * 100
      : 0;

  if (absChange >= 8 || stock.status === "Watch" && change < -3) return "PANIC";
  if (stock.status === "Watch" || vol >= 2.5) return "HIGH_VOL";
  if (stock.signalAction === "Buy" && stock.status === "Rising" && absChange >= 1.2) return "BREAKOUT";
  if (stock.signalAction === "Buy" && change > 0) return "TRENDING";
  if (stock.signalAction === "Sell" || stock.status === "Dip") return "MEAN_REVERTING";
  if (vol <= 0.35 && range <= 12) return "COMPRESSION";
  return "LOW_VOL";
}

function lifecycleState(stock: StockData, now: number): { state: SignalLifecycle; ageMs: number } {
  if (stock.quoteStatus === "unavailable") return { state: "INVALIDATED", ageMs: 0 };
  const emitted = Date.parse(stock.signalEmittedAt ?? "");
  const ageMs = Number.isFinite(emitted) ? Math.max(0, now - emitted) : 0;
  if (!stock.signalEmittedAt) return { state: "EMITTED", ageMs };
  if ((stock.signalReturnPercent ?? 0) >= 3 || (stock.signalReturnPercent ?? 0) <= -3) {
    return { state: "COMPLETED", ageMs };
  }
  if (stock.signalAction === "Hold" && ageMs > 10 * 60_000) return { state: "DECAYING", ageMs };
  if (ageMs < 3 * 60_000) return { state: "EMITTED", ageMs };
  if (ageMs > 90 * 60_000) return { state: "DECAYING", ageMs };
  return { state: "ACTIVE", ageMs };
}

function stabilizedRatio(returns: number[], downsideOnly = false) {
  if (returns.length < 2) return 0;
  const downside = returns.filter((value) => value < 0);
  const sampleWeight = clampMetric(returns.length / (returns.length + 20), 0, 1);
  const avg = mean(returns);
  const volatility = downsideOnly
    ? Math.sqrt(mean((downside.length ? downside : [0]).map((value) => value ** 2)))
    : stddev(returns);
  const cappedAnnualization = Math.sqrt(Math.min(Math.max(returns.length, 1), 30));
  const raw = (avg / Math.max(volatility, 0.006)) * cappedAnnualization;
  return Number((Math.max(-4, Math.min(4, raw * sampleWeight))).toFixed(2));
}

function deriveAdaptiveSignal(stock: StockData, now: number): AdaptiveSignalView {
  const returns = rollingReturns(stock);
  const avg = mean(returns);
  const deviation = stddev(returns);
  const change = Number(stock.changePercent ?? 0);
  const absChange = Math.abs(change);
  const signalAction = stock.signalAction ?? "Hold";
  const confidence = clampMetric(stock.confidence ?? stock.signalConfidence ?? (signalAction === "Hold" ? 46 : 58 + absChange * 8));
  const volatilityPct = deviation * 100;
  const volatilityShift = clampMetric(stock.diagnostics?.volatilityShift ?? deviation * 1000 + absChange * 3);
  const driftScore = clampMetric(stock.driftScore ?? volatilityShift * 0.58 + (stock.quoteStatus === "unavailable" ? 35 : 0) + (stock.status === "Watch" ? 16 : 0));
  const stabilityScore = clampMetric(stock.stabilityScore ?? 100 - driftScore * 0.72 - (signalAction === "Hold" ? 8 : 0));
  const uncertainty = clampMetric(stock.uncertainty ?? 100 - confidence * 0.68 + driftScore * 0.38);
  const agreement = clampMetric(stock.ensembleAgreement != null ? stock.ensembleAgreement * 100 : confidence * 0.62 + stabilityScore * 0.32 - uncertainty * 0.12);
  const consensus = clampMetric(stock.featureConsensus != null ? stock.featureConsensus * 100 : agreement * 0.72 + stabilityScore * 0.2);
  const direction = signalAction === "Sell" ? -1 : signalAction === "Buy" ? 1 : change >= 0 ? 1 : -1;
  const trendComponentPct =
    Math.abs(avg) * 100 * Math.sqrt(Math.min(Math.max(returns.length, 1), 10));
  const volatilityForecastPct =
    volatilityPct * Math.sqrt(Math.min(Math.max(returns.length, 1), 5));
  const fallbackMovePct =
    direction *
    clampMetric(
      (Math.max(absChange * 0.45, trendComponentPct) + volatilityForecastPct * 0.6) *
      (0.55 + confidence / 160),
      0.05,
      18,
    );
  const expectedMovePct = Number((stock.expectedMovePct ?? fallbackMovePct).toFixed(2));
  const winReturns = returns.filter((value) => value > 0);
  const lossReturns = returns.filter((value) => value < 0);
  const hitRate = returns.length ? (winReturns.length / returns.length) * 100 : confidence * 0.55;
  const profitFactor = Math.abs(lossReturns.reduce((sum, value) => sum + value, 0)) > 0
    ? Math.abs(winReturns.reduce((sum, value) => sum + value, 0) / lossReturns.reduce((sum, value) => sum + value, 0))
    : winReturns.length ? 3 : 1;
  const maxDrawdown = maxDrawdownFromReturns(returns) * 100;
  const { state, ageMs } = lifecycleState(stock, now);
  const regime = stock.regime ?? deriveRegime(stock);
  const entropy = clampMetric(signalAction === "Hold" ? 62 - confidence * 0.2 : 44 + uncertainty * 0.38);
  const predictionResidual = clampMetric(
    Math.abs((stock.signalReturnPercent ?? change) - expectedMovePct) * 5 +
    Math.max(0, volatilityShift - 60) * 0.15,
  );

  return {
    ...stock,
    adaptiveId: `${stock.ticker}:${stock.signalEmittedAt ?? "live"}`,
    regime,
    confidence,
    uncertainty,
    driftScore,
    stabilityScore,
    expectedMovePct,
    featureConsensus: consensus / 100,
    ensembleAgreement: agreement / 100,
    rollingSharpe: stock.liveMetrics?.rollingSharpe ?? stabilizedRatio(returns),
    rollingSortino: stock.liveMetrics?.rollingSortino ?? stabilizedRatio(returns, true),
    hitRate: stock.liveMetrics?.hitRate ?? Number(hitRate.toFixed(1)),
    expectancy: stock.liveMetrics?.expectancy ?? Number((avg * 100).toFixed(2)),
    profitFactor: stock.liveMetrics?.profitFactor ?? Number(Math.min(9.99, profitFactor).toFixed(2)),
    maxDrawdown: stock.liveMetrics?.maxDrawdown ?? Number(maxDrawdown.toFixed(2)),
    entropy: stock.diagnostics?.entropy ?? entropy,
    predictionResidual: stock.diagnostics?.predictionResidual ?? predictionResidual,
    volatilityShift: stock.diagnostics?.volatilityShift ?? volatilityShift,
    lifecycleState: state,
    signalAgeMs: ageMs,
    confidenceColor: confidenceColor(signalAction, confidence, uncertainty),
    regimeColor: regimeColor(regime),
  };
}

function formatAge(ms: number) {
  if (!ms) return "new";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function distribution<T extends string>(items: T[]) {
  const map = new Map<T, number>();
  for (const item of items) map.set(item, (map.get(item) ?? 0) + 1);
  return map;
}

type TimingState = "Early" | "Active" | "Late" | "Exhausted";
type RiskLevel = "Low Risk" | "Moderate Risk" | "High Risk" | "Extreme Risk";
type ConvictionLevel = "Low Conviction" | "Medium Conviction" | "High Conviction";

type ExecutionDecision = {
  signal: AdaptiveSignalView;
  actionLabel: "Buy" | "Watch" | "Hold" | "Reduce" | "Avoid";
  convictionLabel: ConvictionLevel;
  calibratedConfidence: number;
  suggestedAllocationPct: number;
  portfolioExposurePct: number;
  remainingRiskBudgetPct: number;
  timingState: TimingState;
  riskLevel: RiskLevel;
  riskScore: number;
  qualityScore: number;
  environmentLabel: string;
  tradeExplanation: string;
  signalQuality: number;
  calibrationScore: number;
  survivalProbability: number;
  regimeQuality: number;
  liquidityScore: number;
  volatilityPenalty: number;
  metaAllocation: MetaAllocationDecision;
  lifecycleState?: ModelLifecycleState;
  lifecycleAction?: string;
  lifecycleReason?: string;
  lifecycleAllocationMultiplier: number;
  lifecycleCanOpenNewTrades: boolean;
  classifiedRegime: MarketRegimeClassification;
  survivalForecast: SurvivalForecast;
  recommendedHoldingMinutes: number;
  genealogy: Array<{ label: string; value: number; tone: "good" | "warn" | "bad" | "info" }>;
};

function formatRegime(regime: AdaptiveRegime) {
  const labels: Record<AdaptiveRegime, string> = {
    TRENDING: "Constructive Trend Environment",
    MEAN_REVERTING: "Mean-Reversion Window",
    HIGH_VOL: "Elevated Volatility Regime",
    LOW_VOL: "Quiet Risk Environment",
    BREAKOUT: "Improving Relative Strength",
    PANIC: "Stress Regime",
    COMPRESSION: "Capital Preservation Phase",
  };
  return labels[regime];
}

function qualityLabel(value: number, good = "Institutional", mid = "Selective", weak = "Limited") {
  if (value >= 72) return good;
  if (value >= 48) return mid;
  return weak;
}

function deriveTimingState(signal: AdaptiveSignalView): TimingState {
  const minutes = signal.signalAgeMs / 60_000;
  const decayPressure = signal.uncertainty + signal.volatilityShift * 0.4 - signal.stabilityScore * 0.35;
  if (signal.lifecycleState === "COMPLETED" || signal.lifecycleState === "INVALIDATED" || minutes > 180 || decayPressure > 58) {
    return "Exhausted";
  }
  if (signal.lifecycleState === "DECAYING" || minutes > 90 || decayPressure > 42) return "Late";
  if (signal.lifecycleState === "EMITTED" || minutes < 12) return "Early";
  return "Active";
}

function deriveRiskLevel(score: number): RiskLevel {
  if (score >= 82) return "Extreme Risk";
  if (score >= 62) return "High Risk";
  if (score >= 36) return "Moderate Risk";
  return "Low Risk";
}

function calibrateConfidence(signal: AdaptiveSignalView) {
  const samples = rollingReturns(signal).length;
  const sampleWeight = samples / (samples + 24);
  const baseConfidence = signal.signalAction === "Hold" ? 50 : 57;
  const raw = signal.confidence;
  const shrunk = baseConfidence * (1 - sampleWeight) + raw * sampleWeight;
  const penalty =
    signal.uncertainty * 0.22 +
    signal.driftScore * 0.14 +
    signal.volatilityShift * 0.1 +
    Math.max(0, 0.62 - signal.ensembleAgreement) * 22;
  const cap =
    samples >= 25 && signal.ensembleAgreement > 0.86 && signal.driftScore < 22 && signal.uncertainty < 24
      ? 96
      : 91;
  return clampMetric(shrunk - penalty, 28, cap);
}

function liquidityScore(signal: AdaptiveSignalView) {
  const price = Number(signal.price ?? 0);
  const hasLiveQuote = signal.quoteStatus === "available" ? 18 : signal.quoteStatus === "unavailable" ? -22 : 0;
  const priceQuality = price > 1 ? 72 : price > 0 ? 48 : 32;
  const historyQuality = Math.min(18, (signal.history?.length ?? 0) * 1.2);
  return clampMetric(priceQuality + historyQuality + hasLiveQuote);
}

function regimeQuality(signal: AdaptiveSignalView) {
  const action = signal.signalAction ?? "Hold";
  if (signal.regime === "PANIC") return action === "Sell" ? 62 : 22;
  if (signal.regime === "BREAKOUT") return action === "Buy" ? 88 : 46;
  if (signal.regime === "TRENDING") return action === "Buy" ? 82 : 54;
  if (signal.regime === "MEAN_REVERTING") return action === "Sell" ? 72 : 56;
  if (signal.regime === "COMPRESSION") return 50;
  if (signal.regime === "HIGH_VOL") return action === "Hold" ? 42 : 48;
  return 64;
}

function survivalProbability(signal: AdaptiveSignalView) {
  const lifecycleBoost: Record<SignalLifecycle, number> = {
    EMITTED: 68,
    ACTIVE: 74,
    DECAYING: 42,
    INVALIDATED: 12,
    COMPLETED: 55,
  };
  return clampMetric(
    lifecycleBoost[signal.lifecycleState] +
    signal.stabilityScore * 0.18 +
    signal.ensembleAgreement * 12 -
    signal.driftScore * 0.18 -
    signal.uncertainty * 0.12,
  );
}

function diagnosticsFromSignal(
  signal: AdaptiveSignalView,
  calibrationScore: number,
  legacySurvival: number,
): DiagnosticInputs {
  return {
    trendQuality: clampMetric(signal.rollingSharpe * 12 + signal.hitRate * 0.35 + Math.max(0, signal.expectancy) * 7 + 42),
    reliability: clampMetric(100 - signal.driftScore),
    breadth: clampMetric(signal.ensembleAgreement * 100),
    clarity: clampMetric(100 - signal.entropy),
    calibration: calibrationScore,
    volatilityPressure: signal.volatilityShift,
    regimeStability: signal.stabilityScore,
    modelDurability: clampMetric(100 - signal.predictionResidual),
    holdingQuality: legacySurvival,
    errorControl: clampMetric(100 - signal.predictionResidual),
    survivalProbability: legacySurvival,
    residualInstability: signal.predictionResidual,
    entropy: signal.entropy,
    drift: signal.driftScore,
  };
}

function realizedOutcomeQuality(signal: AdaptiveSignalView) {
  const realizedReturn = Number(signal.signalReturnPercent ?? signal.changePercent ?? 0);
  const expectedDirection = signal.signalAction === "Sell" ? -1 : signal.signalAction === "Buy" ? 1 : 0;
  const directionalCredit =
    expectedDirection === 0
      ? 0.52
      : realizedReturn * expectedDirection > 0
        ? 0.72
        : realizedReturn * expectedDirection < -1
          ? 0.22
          : 0.44;
  const residualCredit = 1 - clampMetric(signal.predictionResidual, 0, 100) / 100;
  const durabilityCredit = survivalProbability(signal) / 100;
  return clampMetric((directionalCredit * 0.42 + residualCredit * 0.34 + durabilityCredit * 0.24) * 100);
}

function calibrationStateFromSignals(signals: AdaptiveSignalView[]): CalibrationState {
  return buildCalibrationState(
    signals
      .filter((signal) => Number.isFinite(signal.confidence))
      .map((signal) => ({
        predictedProbability: signal.confidence / 100,
        realizedOutcomeQuality: realizedOutcomeQuality(signal) / 100,
      })),
  );
}

function buildTradeExplanation(decision: Omit<ExecutionDecision, "tradeExplanation">) {
  const environment = decision.environmentLabel.toLowerCase();
  const metaReasons = decision.metaAllocation.reasons.slice(0, 2).join(" ");
  const investorReason = plainLifecycleReason(decision.lifecycleReason);
  if (!decision.lifecycleCanOpenNewTrades) {
    return `Do not add new risk yet. ${investorReason}`;
  }
  if (decision.lifecycleAllocationMultiplier < 1) {
    return `Use a smaller position while evidence builds. ${investorReason} ${metaReasons}`;
  }
  if (decision.riskLevel === "Extreme Risk") {
    return `Avoid new positions while ${environment} conditions remain unstable. ${metaReasons}`;
  }
  if (decision.actionLabel === "Buy" && decision.convictionLabel === "High Conviction") {
    return `Conditions support selective upside participation within a controlled ${environment} framework. ${metaReasons}`;
  }
  if (decision.actionLabel === "Watch") {
    return `Participation is improving, but new money should wait for broader confirmation. ${metaReasons}`;
  }
  if (decision.actionLabel === "Reduce" || decision.actionLabel === "Avoid") {
    return `Risk compensation has weakened; capital should stay defensive. ${metaReasons}`;
  }
  return `Conditions support ${plainAction(decision.actionLabel).toLowerCase()} while the market searches for cleaner participation. ${metaReasons}`;
}

type LifecycleGate = {
  state?: ModelLifecycleState;
  action?: string;
  reason?: string;
  canOpenNewTrades: boolean;
  allocationMultiplier: number;
};

function portfolioLifecycleMultiplier(insight?: PortfolioLifecycleInsight): number {
  if (!insight) return 1;
  if (insight.state === "RETIRED") return 0;
  if (insight.state === "WATCHLIST") return 0;
  if (insight.state === "REDUCED") return 0.35;
  if (insight.state === "PRODUCTION") return 1;
  if (insight.state === "SMALL_LIVE") return 0.65;
  return 0.5;
}

function lifecycleGateForSignal(
  signal: AdaptiveSignalView,
  portfolioLifecycle?: PortfolioLifecycleInsight,
): LifecycleGate {
  const modelMultiplier = signal.modelAllocationMultiplier ?? 1;
  const portfolioMultiplier = portfolioLifecycleMultiplier(portfolioLifecycle);
  const modelCanTrade = signal.modelCanOpenNewTrades ?? true;
  const portfolioCanTrade = portfolioMultiplier > 0;
  const allocationMultiplier = Math.min(modelMultiplier, portfolioMultiplier);
  const state = signal.modelLifecycleState ?? portfolioLifecycle?.state;
  const action = signal.modelLifecycleAction ?? portfolioLifecycle?.label;
  const reason = signal.modelLifecycleReason ?? portfolioLifecycle?.reason;

  return {
    state,
    action,
    reason,
    canOpenNewTrades: modelCanTrade && portfolioCanTrade,
    allocationMultiplier: modelCanTrade && portfolioCanTrade
      ? clampMetric(allocationMultiplier, 0, 1)
      : 0,
  };
}

function buildExecutionDecisions(
  signals: AdaptiveSignalView[],
  portfolio: SimulatedPortfolio,
  calibrationState: CalibrationState,
  portfolioLifecycle?: PortfolioLifecycleInsight,
  riskMode: RiskMode = "small",
): ExecutionDecision[] {
  const riskConfig = RISK_MODE_CONFIG[riskMode];
  const totalValue =
    (portfolio.cash ?? 0) +
    Object.values(portfolio.positions ?? {}).reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
  const exposurePct = totalValue > 0
    ? (Object.values(portfolio.positions ?? {}).reduce((sum, position) => sum + (position.marketValue ?? 0), 0) / totalValue) * 100
    : 0;
  const raw = signals.map((signal) => {
    const initialCalibratedConfidence = calibrateConfidence(signal);
    const preliminaryCalibrationScore = clampMetric(100 - signal.predictionResidual * 1.7 - Math.max(0, signal.confidence - initialCalibratedConfidence) * 0.4);
    const legacySurvival = survivalProbability(signal);
    const diagnostics = diagnosticsFromSignal(signal, preliminaryCalibrationScore, legacySurvival);
    const classified = classifyMarketRegime(diagnostics);
    const survivalForecast = forecastSignalSurvival({
      diagnostics,
      signalAgeMinutes: signal.signalAgeMs / 60_000,
      trendConsistency: clampMetric(signal.stabilityScore * 0.58 + signal.ensembleAgreement * 100 * 0.42),
      recentSignalReversals: signal.lifecycleState === "DECAYING" ? 1 : signal.lifecycleState === "INVALIDATED" ? 2 : 0,
    });
    const metaAllocation = decideMetaAllocation({
      diagnostics,
      calibrationState,
      regime: classified,
      survival: survivalForecast,
    });
    const calibratedConfidence = clampMetric(initialCalibratedConfidence * metaAllocation.confidenceDiscount, 24, initialCalibratedConfidence);
    const returnQuality = clampMetric(
      50 +
      signal.rollingSharpe * 9 +
      signal.expectancy * 5 -
      signal.maxDrawdown * 0.35,
    );
    const tradableExpectedRange = signal.expectedMovePct > 0;
    const expectedMoveQuality = tradableExpectedRange
      ? clampMetric(signal.expectedMovePct * 7, 0, 24)
      : 0;
    const signalQuality = clampMetric(
      calibratedConfidence * 0.28 +
      signal.stabilityScore * 0.2 +
      signal.ensembleAgreement * 100 * 0.18 +
      returnQuality * 0.18 +
      expectedMoveQuality -
      signal.driftScore * 0.14,
    );
    const calibrationScore = clampMetric(
      preliminaryCalibrationScore * 0.55 +
      (100 - calibrationState.calibrationError * 100) * 0.3 +
      (100 - calibrationState.drift) * 0.15,
    );
    const survival = survivalForecast.survivalProbability;
    const regime = regimeQuality(signal);
    const liquidity = liquidityScore(signal);
    const volatilityPenalty = clampMetric(
      10 +
      signal.volatilityShift * 0.62 +
      signal.uncertainty * 0.28 +
      signal.maxDrawdown * 0.45,
      8,
      100,
    );
    const riskScore = clampMetric(
      signal.driftScore * 0.3 +
      signal.uncertainty * 0.24 +
      signal.volatilityShift * 0.2 +
      signal.maxDrawdown * 0.16 +
      (100 - calibrationScore) * 0.1 +
      (signal.regime === "PANIC" ? 18 : 0),
    );
    const timingState = deriveTimingState(signal);
    const qualityScore = clampMetric(
      signalQuality * 0.3 +
      calibrationScore * 0.18 +
      survival * 0.18 +
      regime * 0.16 +
      liquidity * 0.12 -
      volatilityPenalty * 0.14 -
      (timingState === "Late" ? 6 : timingState === "Exhausted" ? 24 : 0),
    );
    const action = signal.signalAction ?? "Hold";
    const riskLevel = deriveRiskLevel(riskScore);
    const initialActionLabel: ExecutionDecision["actionLabel"] =
      !tradableExpectedRange && (action === "Buy" || action === "Hold")
        ? "Avoid"
        : action === "Buy" && qualityScore >= 62 && riskScore < 68
          ? "Buy"
          : action === "Buy" && qualityScore >= 48
            ? "Watch"
            : action === "Sell" && riskScore >= 58
              ? "Reduce"
              : riskScore >= 76
                ? "Avoid"
                : "Hold";
    const lifecycleGate = lifecycleGateForSignal(signal, portfolioLifecycle);
    const isHeld = Boolean(portfolio.positions?.[signal.ticker]);
    const actionLabel: ExecutionDecision["actionLabel"] =
      !lifecycleGate.canOpenNewTrades
        ? isHeld
          ? "Reduce"
          : "Avoid"
        : initialActionLabel;
    const convictionLabel: ConvictionLevel =
      qualityScore >= 74 && calibratedConfidence >= 70
        ? "High Conviction"
        : qualityScore >= 52
          ? "Medium Conviction"
          : "Low Conviction";
    const allocationIntent =
      !tradableExpectedRange
        ? 0
        : qualityScore < riskConfig.minQuality
          ? 0
          : actionLabel === "Buy"
            ? 1
            : actionLabel === "Watch"
              ? 0.55
              : actionLabel === "Hold" && action !== "Sell" && qualityScore >= 30 && riskScore < 72
                ? 0.22
                : 0;
    const baseSize =
      allocationIntent *
      riskConfig.allocationMultiplier *
      lifecycleGate.allocationMultiplier *
      metaAllocation.exposureMultiplier *
      (signalQuality / 100) *
      (calibrationScore / 100) *
      (survival / 100) *
      (regime / 100) *
      (liquidity / 100) /
      Math.max(0.45, volatilityPenalty / 38);
    const decisionBase = {
      signal,
      actionLabel,
      convictionLabel,
      calibratedConfidence,
      suggestedAllocationPct: 0,
      portfolioExposurePct: exposurePct,
      remainingRiskBudgetPct: 0,
      timingState,
      riskLevel,
      riskScore,
      qualityScore,
      environmentLabel: formatRegime(signal.regime),
      signalQuality,
      calibrationScore,
      survivalProbability: survival,
      regimeQuality: regime,
      liquidityScore: liquidity,
      volatilityPenalty,
      metaAllocation,
      lifecycleState: lifecycleGate.state,
      lifecycleAction: lifecycleGate.action,
      lifecycleReason: lifecycleGate.reason,
      lifecycleAllocationMultiplier: lifecycleGate.allocationMultiplier,
      lifecycleCanOpenNewTrades: lifecycleGate.canOpenNewTrades,
      classifiedRegime: classified.regime,
      survivalForecast,
      recommendedHoldingMinutes: survivalForecast.recommendedHoldingMinutes,
      genealogy: [
        { label: "Relative Strength", value: signalQuality, tone: "good" as const },
        { label: "Volatility Control", value: clampMetric(100 - volatilityPenalty), tone: riskScore > 65 ? "warn" as const : "info" as const },
        { label: "Regime Quality", value: regime, tone: "good" as const },
        { label: "Trade Quality", value: liquidity, tone: liquidity < 45 ? "warn" as const : "info" as const },
        { label: "Market Structure", value: regime, tone: signal.regime === "PANIC" ? "bad" as const : "good" as const },
        { label: "Participation Breadth", value: signal.ensembleAgreement * 100, tone: signal.ensembleAgreement > 0.7 ? "good" as const : "warn" as const },
        { label: "Size Control", value: metaAllocation.exposureMultiplier * 100, tone: metaAllocation.regimeRisk === "unstable" ? "bad" as const : metaAllocation.regimeRisk === "high" ? "warn" as const : "info" as const },
      ],
      _baseSize: baseSize,
    };
    return {
      ...decisionBase,
      tradeExplanation: buildTradeExplanation(decisionBase),
    };
  });

  const totalBase = raw.reduce((sum, item) => sum + item._baseSize, 0);
  const regimeTotals = new Map<AdaptiveRegime, number>();
  const investable = raw.filter((item) => item._baseSize > 0);
  const targetExposure = investable.length
    ? clampMetric(
      mean(investable.map((item) => item.qualityScore)) * 0.46 +
      mean(investable.map((item) => item.survivalProbability)) * 0.24 +
      mean(investable.map((item) => item.metaAllocation.exposureMultiplier * 100)) * 0.26 -
      mean(investable.map((item) => item.riskScore)) * 0.34,
      8,
      riskConfig.maxExposure,
    )
    : 0;
  let deployed = 0;
  const decisions = raw.map((item) => {
    const normalized = totalBase > 0 ? (item._baseSize / totalBase) * targetExposure : 0;
    const maxPerAsset =
      item.actionLabel === "Watch"
        ? item.riskLevel === "Low Risk" ? 3.2 : item.riskLevel === "Moderate Risk" ? 2.6 : 1.4
        : item.actionLabel === "Hold"
          ? item.riskLevel === "Low Risk" ? 2.2 : item.riskLevel === "Moderate Risk" ? 1.6 : 0.8
          : item.riskLevel === "Low Risk" ? 5 : item.riskLevel === "Moderate Risk" ? 4.2 : 2.4;
    const regimeCap = item.signal.regime === "PANIC" ? 8 : 18;
    const currentRegime = regimeTotals.get(item.signal.regime) ?? 0;
    const allocation = Math.max(
      0,
      Math.min(
        normalized,
        maxPerAsset,
        item.metaAllocation.allocationCap,
        Math.max(0, regimeCap - currentRegime),
      ),
    );
    regimeTotals.set(item.signal.regime, currentRegime + allocation);
    deployed += allocation;
    const { _baseSize, ...decision } = item;
    return {
      ...decision,
      suggestedAllocationPct: Number(allocation.toFixed(1)),
      remainingRiskBudgetPct: Number(Math.max(0, targetExposure - deployed).toFixed(1)),
    };
  });

  return decisions.sort(
    (a, b) =>
      b.suggestedAllocationPct - a.suggestedAllocationPct ||
      b.qualityScore - a.qualityScore,
  );
}

function cleanTicker(ticker: string) {
  return ticker.replace(/^(BINANCE|NASDAQ|NYSE|AMEX|CRYPTO|B3|BMFBOVESPA)[:_\-/]/i, "");
}

function plainConviction(label: ConvictionLevel) {
  if (label === "Low Conviction") return "Weak Setup Quality";
  if (label === "Medium Conviction") return "Selective Setup Quality";
  return "Institutional Setup Quality";
}

function plainTiming(label: TimingState) {
  if (label === "Exhausted") return "Participation Extended";
  if (label === "Late") return "Late-Cycle Participation";
  if (label === "Early") return "Early Confirmation";
  return "Active Confirmation";
}

function plainAction(label: ExecutionDecision["actionLabel"]) {
  if (label === "Buy") return "Add Selectively";
  if (label === "Watch") return "Maintain Coverage";
  if (label === "Reduce") return "Trim Position";
  if (label === "Avoid") return "Avoid New Risk";
  return "Hold Core";
}

function plainRisk(label: RiskLevel) {
  if (label === "Extreme Risk") return "Stress";
  if (label === "High Risk") return "Elevated";
  if (label === "Moderate Risk") return "Balanced";
  return "Contained";
}

function plainTradeStatus(label: "Open" | "Closed") {
  return label === "Open" ? "Active" : "Realized";
}

function plainCapitalMove(currentValue: number, targetValue: number) {
  const delta = targetValue - currentValue;
  if (delta > 1) return `Add ${formatMaybeCurrency(delta)}`;
  if (delta < -1) return `Trim ${formatMaybeCurrency(Math.abs(delta))}`;
  if (currentValue > 1) return "Hold";
  return "No capital";
}

function plainRegime(regime: AdaptiveRegime) {
  const labels: Record<AdaptiveRegime, string> = {
    TRENDING: "Constructive Trend Environment",
    MEAN_REVERTING: "Mean-Reversion Window",
    HIGH_VOL: "Elevated Volatility Regime",
    LOW_VOL: "Quiet Risk Environment",
    BREAKOUT: "Improving Relative Strength",
    PANIC: "Stress Regime",
    COMPRESSION: "Capital Preservation Phase",
  };
  return labels[regime];
}

function plainLifecycleState(state?: ModelLifecycleState) {
  const labels: Record<ModelLifecycleState, string> = {
    RESEARCH: "Needs More Proof",
    CANDIDATE: "Needs More Proof",
    SHADOW: "Watch Only",
    SMALL_LIVE: "Starter Size",
    PRODUCTION: "Ready For Size",
    WATCHLIST: "Watch Closely",
    REDUCED: "Reduce Size",
    RETIRED: "Do Not Trade",
  };
  return state ? labels[state] : "Needs More Proof";
}

function plainLifecycleAction(action?: string) {
  const normalized = String(action ?? "").toLowerCase();
  if (!normalized) return "Needs More Proof";
  if (normalized.includes("retired") || normalized.includes("block") || normalized.includes("disregard")) return "Do Not Trade";
  if (normalized.includes("reduced") || normalized.includes("careful") || normalized.includes("watchlist")) return "Reduce Size";
  if (normalized.includes("production") || normalized.includes("trusted")) return "Ready For Size";
  if (normalized.includes("shadow") || normalized.includes("await")) return "Watch Only";
  if (normalized.includes("small")) return "Starter Size";
  return action ?? "Needs More Proof";
}

function plainLifecycleReason(reason?: string) {
  const text = String(reason ?? "").trim();
  if (!text) return "There is not enough evidence yet for normal position sizing.";
  const lower = text.toLowerCase();
  if (lower.includes("retired")) return "This strategy is paused and will not add new positions.";
  if (lower.includes("negative") || lower.includes("expectancy")) return "Recent closed trades have not justified taking more risk.";
  if (lower.includes("profit factor")) return "Winners are not yet large enough compared with losers.";
  if (lower.includes("risk-adjusted") || lower.includes("sharpe")) return "Returns are not yet strong enough for the amount of risk taken.";
  if (lower.includes("sample") || lower.includes("execution") || lower.includes("feedback")) return "More closed trades are needed before sizing up.";
  if (lower.includes("coverage") || lower.includes("quote")) return "Some market data is missing or stale, so sizing stays conservative.";
  if (lower.includes("reduced") || lower.includes("allocation")) return "Position size is capped until results improve.";
  if (lower.includes("watchlist")) return "This strategy is being watched closely before adding risk.";
  if (lower.includes("production") || lower.includes("clear")) return "The evidence supports normal controlled sizing.";
  return text
    .replace(/\blifecycle gates?\b/gi, "review rules")
    .replace(/\blifecycle\b/gi, "review")
    .replace(/\bmodel\b/gi, "strategy")
    .replace(/\bcandidate\b/gi, "review")
    .replace(/\bpromotion\b/gi, "approval")
    .replace(/\bproduction\b/gi, "ready")
    .replace(/\bexecution\b/gi, "trade");
}

function priorityAllocationCandidates(decisions: ExecutionDecision[]) {
  return decisions
    .filter(
      (item) =>
        (item.actionLabel === "Buy" || item.actionLabel === "Watch") &&
        item.signal.expectedMovePct > 0 &&
        item.suggestedAllocationPct > 0,
    )
    .slice(0, 5);
}

type PriorityCandidateSnapshot = {
  ticker: string;
  actionLabel: ExecutionDecision["actionLabel"];
  allocationPct: number;
  expectedMovePct: number;
};

function priorityCandidatesStorageKey(market: string) {
  return `signal-markets:priority-candidates:${market.trim().toUpperCase()}`;
}

function serializePriorityCandidates(candidates: ExecutionDecision[]): string {
  const snapshot: PriorityCandidateSnapshot[] = candidates.map((candidate) => ({
    ticker: candidate.signal.ticker.trim().toUpperCase(),
    actionLabel: candidate.actionLabel,
    allocationPct: Number(candidate.suggestedAllocationPct.toFixed(1)),
    expectedMovePct: Number(candidate.signal.expectedMovePct.toFixed(1)),
  }));
  return JSON.stringify(snapshot);
}

function parsePriorityCandidates(value: string | null): PriorityCandidateSnapshot[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        ticker: String(item.ticker ?? "").trim().toUpperCase(),
        actionLabel: String(item.actionLabel ?? "Hold") as ExecutionDecision["actionLabel"],
        allocationPct: Number(item.allocationPct ?? 0),
        expectedMovePct: Number(item.expectedMovePct ?? 0),
      }))
      .filter((item) => item.ticker);
  } catch {
    return [];
  }
}

function describePriorityCandidateChange(
  previous: PriorityCandidateSnapshot[],
  next: PriorityCandidateSnapshot[],
) {
  const previousByTicker = new Map(previous.map((item) => [item.ticker, item]));
  const nextByTicker = new Map(next.map((item) => [item.ticker, item]));
  const enter = next.filter((item) => !previousByTicker.has(item.ticker));
  const close = previous.filter((item) => !nextByTicker.has(item.ticker));
  const resize = next.filter((item) => {
    const previousItem = previousByTicker.get(item.ticker);
    return (
      previousItem &&
      (previousItem.actionLabel !== item.actionLabel ||
        Math.abs(previousItem.allocationPct - item.allocationPct) >= 0.5)
    );
  });

  const parts = [
    ...enter.map((item) => `Add ${cleanTicker(item.ticker)} ${item.allocationPct.toFixed(1)}%`),
    ...resize.map((item) => `Adjust ${cleanTicker(item.ticker)} to ${item.allocationPct.toFixed(1)}%`),
    ...close.map((item) => `Close/review ${cleanTicker(item.ticker)}`),
  ];
  return parts.slice(0, 6).join("; ");
}

async function sendPriorityAllocationNotification(market: string, body: string) {
  if (!body || typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  try {
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return false;

    new Notification(`${market} top ideas changed`, {
      body,
      tag: `signal-markets-priority-${market}`,
    });
    return true;
  } catch {
    return false;
  }
}

function derivePortfolioPosture(decisions: ExecutionDecision[], metrics: { drift: number; ensemble: number; survival: number; regimeStability: number }) {
  const scoped = decisions.slice(0, 80);
  const avgRisk = mean(scoped.map((item) => item.riskScore));
  const avgQuality = mean(scoped.map((item) => item.qualityScore));
  const recommendedExposure = Math.min(100, decisions.reduce((sum, item) => sum + item.suggestedAllocationPct, 0));
  const buys = scoped.filter((item) => item.actionLabel === "Buy").length;
  const avoids = scoped.filter((item) => item.actionLabel === "Avoid" || item.actionLabel === "Reduce").length;
  const dominantRegime = Array.from(distribution(scoped.map((item) => item.signal.regime)).entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

  let heading = "Selective Upside Participation";
  let action = "Hold Selectively";
  let label = "Transitional Regime";
  let summary = "Conditions remain constructive, but position size should stay selective until participation broadens.";

  if (!scoped.length) {
    heading = "Awaiting Market Breadth";
    action = "Await Broader Participation";
    label = "Observation Regime";
    summary = "The system is waiting for sufficient live evidence before increasing position size.";
  } else if (avgRisk >= 72 || dominantRegime === "PANIC") {
    heading = "Stress Regime";
    action = "Capital Preservation Mode";
    label = "Risk Reduction";
    summary = "Market stress is elevated. Preserve liquidity and avoid incremental risk.";
  } else if (avgRisk >= 58 || metrics.drift >= 58) {
    heading = "Defensive Allocation Regime";
    action = currentActionFromExposure(recommendedExposure, "defensive");
    label = "Capital Preservation";
    summary = "Conditions remain uneven. Position size should stay narrow and risk budgets controlled.";
  } else if (avgQuality >= 68 && buys >= 3 && metrics.ensemble >= 65) {
    heading = "Constructive Trend Environment";
    action = "Add Selectively";
    label = "Constructive";
    summary = "Trend quality is improving and investable setups are broadening. Add capital with discipline.";
  } else if (avgQuality < 46 || metrics.survival < 35) {
    heading = "Capital Preservation Phase";
    action = "Await Broader Participation";
    label = "Capital Preservation";
    summary = "Durability is limited. Keep capital available until market structure improves.";
  } else if (avoids > buys) {
    heading = "Risk Reduction Regime";
    action = "Trim Positions";
    label = "Risk Reduction";
    summary = "Defensive conditions outweigh clean opportunities. Trim fragile positions and await stabilization.";
  }

  return { heading, action, label, summary, recommendedExposure };
}

function currentActionFromExposure(exposure: number, posture: "defensive" | "constructive") {
  if (posture === "defensive") return exposure > 45 ? "Trim Positions" : "Hold Core";
  return exposure < 35 ? "Add Selectively" : "Hold Core";
}

type UserActionTone = "good" | "info" | "warn" | "bad";

function statisticalConfidence(sampleSize: number): { label: string; tone: UserActionTone; detail: string } {
  if (sampleSize >= 500) return { label: "High confidence", tone: "good", detail: "A large number of closed trades." };
  if (sampleSize >= 200) return { label: "Moderate confidence", tone: "info", detail: "Enough closed trades to trust directionally." };
  if (sampleSize >= 50) return { label: "Early confidence", tone: "warn", detail: "Useful evidence, but still fragile." };
  return { label: "Low confidence", tone: "bad", detail: "Too few closed trades for full trust." };
}

function benchmarkReturnFromCoverage(stocks: StockData[]): number | null {
  const returns = stocks
    .map((stock) => {
      const history = (stock.history ?? []).filter((price) => Number.isFinite(price) && price > 0);
      if (history.length < 2) return null;
      const start = history[0];
      const end = Number(stock.price) > 0 ? Number(stock.price) : history[history.length - 1];
      return start > 0 ? ((end - start) / start) * 100 : null;
    })
    .filter((value): value is number => value != null && Number.isFinite(value));
  return returns.length >= 3 ? mean(returns) : null;
}

function toneClasses(tone: UserActionTone) {
  return {
    good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-200",
    warn: "border-amber-500/35 bg-amber-500/10 text-amber-200",
    bad: "border-rose-500/35 bg-rose-500/10 text-rose-200",
  }[tone];
}

function deriveUserAction(input: {
  decisions: ExecutionDecision[];
  metrics: { drift: number; ensemble: number; survival: number; regimeStability: number };
  portfolio: SimulatedPortfolio;
  lifecycle: PortfolioLifecycleInsight;
  marketStatus: string;
  benchmarkReturn: number | null;
  dataQualityPct: number;
}) {
  const stats = portfolioStats(input.portfolio);
  const confidence = statisticalConfidence(stats.totalTrades);
  const totalReturnPct = stats.totalReturn * 100;
  const suggestedExposure = Math.min(
    100,
    input.decisions.reduce((sum, item) => sum + item.suggestedAllocationPct, 0),
  );
  const investableCount = input.decisions.filter(
    (item) => item.suggestedAllocationPct > DISPLAY_ZERO_THRESHOLD,
  ).length;
  const profitFactor = stats.profitFactor === Infinity ? 99 : stats.profitFactor ?? 0;
  const sharpe = stats.normalizedAnnualSharpe ?? 0;
  const benchmarkSpread =
    input.benchmarkReturn == null ? null : totalReturnPct - input.benchmarkReturn;
  const warnings: string[] = [];

  if (input.lifecycle.reason) warnings.push(plainLifecycleReason(input.lifecycle.reason));
  if (stats.totalTrades < 200) warnings.push(`${confidence.label}: ${confidence.detail}`);
  if (profitFactor < 1 && stats.totalTrades > 0) warnings.push("Winners are not yet outweighing losers.");
  if (sharpe < 0 && stats.totalTrades > 0) warnings.push("Returns are not yet compensating for risk.");
  if (benchmarkSpread != null && benchmarkSpread < -1) warnings.push("The strategy is trailing a simple equal-weight basket.");
  if (input.dataQualityPct < 90) warnings.push("Some quotes are missing or stale, so keep sizing conservative.");

  if (input.lifecycle.state === "RETIRED") {
    return {
      action: "Stop",
      heading: "Do Not Add Risk",
      tone: "bad" as const,
      summary: "The evidence is not good enough to trust this strategy with new money right now.",
      nextStep: "Protect capital. No new positions.",
      confidence,
      suggestedExposure,
      investableCount,
      benchmarkSpread,
      warnings,
    };
  }

  if (
    input.lifecycle.state === "REDUCED" ||
    input.lifecycle.state === "WATCHLIST" ||
    profitFactor < 1 ||
    sharpe < 0 ||
    input.metrics.drift >= 65
  ) {
    return {
      action: "Reduce",
      heading: "Trim Risk",
      tone: "warn" as const,
      summary: "Recent results do not support normal sizing. Treat new ideas as small and selective.",
      nextStep: "Trim weak holdings. Cap new positions.",
      confidence,
      suggestedExposure,
      investableCount,
      benchmarkSpread,
      warnings,
    };
  }

  if (
    stats.totalTrades < 200 ||
    input.lifecycle.state !== "PRODUCTION" ||
    confidence.tone === "warn" ||
    confidence.tone === "bad"
  ) {
    return {
      action: "Trade Small",
      heading: "Start Small",
      tone: "info" as const,
      summary: "The strategy can keep learning, but it has not earned full-size positions yet.",
      nextStep: "Use starter positions only.",
      confidence,
      suggestedExposure,
      investableCount,
      benchmarkSpread,
      warnings,
    };
  }

  if (suggestedExposure <= DISPLAY_ZERO_THRESHOLD || input.marketStatus !== "Open") {
    return {
      action: "Observe",
      heading: "Observe",
      tone: "info" as const,
      summary: "No current idea is strong enough to deserve fresh capital.",
      nextStep: "Hold cash. Wait for cleaner setups.",
      confidence,
      suggestedExposure,
      investableCount,
      benchmarkSpread,
      warnings,
    };
  }

  return {
    action: "Invest",
    heading: "Invest Normally",
    tone: "good" as const,
    summary: "The evidence supports normal controlled sizing across the ranked ideas.",
    nextStep: "Use the position sizes below.",
    confidence,
    suggestedExposure,
    investableCount,
    benchmarkSpread,
    warnings,
  };
}

function toneForValue(value: number, warn = 45, bad = 70) {
  if (value >= bad) return "bad" as const;
  if (value >= warn) return "warn" as const;
  return "good" as const;
}

function Meter({ value, tone = "good" }: { value: number; tone?: "good" | "warn" | "bad" | "info" }) {
  const toneClass = {
    good: "bg-emerald-400/80",
    warn: "bg-amber-400/80",
    bad: "bg-rose-400/80",
    info: "bg-sky-400/80",
  }[tone];
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-800/80">
      <div className={cn("h-full rounded-full", toneClass)} style={{ width: `${clampMetric(value)}%` }} />
    </div>
  );
}

function InsightShell({ title, eyebrow, children, action }: { title: string; eyebrow?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.28)] backdrop-blur">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          {eyebrow && <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{eyebrow}</div>}
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-100">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MarketRegimeHero({
  decisions,
  metrics,
  portfolio,
  marketStatus,
  lastSyncedLabel,
  lifecycleInsight,
  benchmarkReturn,
  dataQualityPct,
  riskMode,
}: {
  decisions: ExecutionDecision[];
  metrics: { drift: number; entropy: number; ensemble: number; calibration: number; regimeStability: number; modelStability: number; survival: number; residual: number };
  portfolio: SimulatedPortfolio;
  marketStatus: string;
  lastSyncedLabel: string;
  lifecycleInsight: PortfolioLifecycleInsight;
  benchmarkReturn: number | null;
  dataQualityPct: number;
  riskMode: RiskMode;
}) {
  const totalValue = (portfolio.cash ?? 0) + Object.values(portfolio.positions ?? {}).reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
  const invested = Object.values(portfolio.positions ?? {}).reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
  const currentExposure = totalValue > 0 ? (invested / totalValue) * 100 : 0;
  const stats = portfolioStats(portfolio);
  const userAction = deriveUserAction({
    decisions,
    metrics,
    portfolio,
    lifecycle: lifecycleInsight,
    marketStatus,
    benchmarkReturn,
    dataQualityPct,
  });
  const deployable = Math.max(0, totalValue * Math.max(0, userAction.suggestedExposure - currentExposure) / 100);
  const benchmarkLabel =
    userAction.benchmarkSpread == null
      ? "Basket pending"
      : `${userAction.benchmarkSpread >= 0 ? "+" : ""}${userAction.benchmarkSpread.toFixed(2)} pts`;

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-lg border border-slate-800 bg-[#050b18] p-6 text-slate-100 shadow-2xl">
      <div className="relative grid gap-8 xl:grid-cols-[1.45fr_0.95fr]">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]", toneClasses(userAction.tone))}>{userAction.action}</span>
            <span className={cn("rounded-full border px-3 py-1 text-xs", lifecycleInsight.className)}>{plainLifecycleState(lifecycleInsight.state)}</span>
            <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-400">Market {marketStatus}</span>
            <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-400">{RISK_MODE_CONFIG[riskMode].label}</span>
            <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-400">Prices {lastSyncedLabel}</span>
          </div>
          <h1 className="max-w-4xl text-4xl font-semibold text-white md:text-6xl">{userAction.heading}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">{userAction.summary}</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            {[
              ["Closed Trade Count", `${stats.totalTrades}`, "200+ supports normal size"],
              ["Basket Spread", benchmarkLabel, "strategy minus equal-weight basket"],
              ["Trust To Trade", plainLifecycleState(lifecycleInsight.state), plainLifecycleReason(lifecycleInsight.reason)],
              ["Price Coverage", `${dataQualityPct.toFixed(0)}%`, "priced tickers available"],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/55 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">{value}</div>
                <div className="mt-1 text-xs text-slate-500">{detail}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-700/80 bg-slate-950/70 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Portfolio Move</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-white">{userAction.nextStep}</div>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Position size follows closed trades, basket spread, market risk, and price coverage.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              ["Target Size", `${userAction.suggestedExposure.toFixed(1)}%`],
              ["Current Size", `${currentExposure.toFixed(1)}%`],
              ["Cash Room To Add", formatMaybeCurrency(deployable)],
              ["Stocks With Size", `${userAction.investableCount}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/35 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
                <div className="mt-2 text-lg font-semibold tabular-nums text-slate-100">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-4">
            <div>
              <div className="mb-2 flex justify-between text-xs text-slate-400"><span>Position size</span><span>{currentExposure.toFixed(1)}% / {userAction.suggestedExposure.toFixed(1)}%</span></div>
              <Meter value={userAction.suggestedExposure} tone={userAction.suggestedExposure > 60 ? "good" : userAction.suggestedExposure > 35 ? "info" : "warn"} />
            </div>
            <div>
              <div className="mb-2 flex justify-between text-xs text-slate-400"><span>Market risk</span><span>{metrics.drift.toFixed(0)}</span></div>
              <Meter value={metrics.drift} tone={toneForValue(metrics.drift)} />
            </div>
            <div>
              <div className="mb-2 flex justify-between text-xs text-slate-400"><span>Opportunity breadth</span><span>{metrics.ensemble.toFixed(0)}%</span></div>
              <Meter value={metrics.ensemble} tone={metrics.ensemble > 65 ? "good" : metrics.ensemble > 45 ? "info" : "warn"} />
            </div>
          </div>
          <div className="mt-6 space-y-2">
            {(userAction.warnings.length ? userAction.warnings : [plainLifecycleReason(lifecycleInsight.reason)]).slice(0, 4).map((warning) => (
              <div key={warning} className="rounded-lg border border-slate-800 bg-slate-900/35 px-3 py-2 text-xs leading-5 text-slate-300">
                {warning}
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function modelMatchesMarket(model: ModelLifecycleRecord, market: string) {
  const normalized = market.trim().toUpperCase();
  const scope = String(model.regime_scope ?? "").trim().toUpperCase();
  return scope === normalized || scope.startsWith(`${normalized}|`);
}

function compactModelId(modelId: string) {
  const parts = modelId.split(":");
  if (parts.length <= 3) return modelId;
  return parts.slice(-3).join(":");
}

function formatLifecycleTimestamp(value: string | Date | undefined) {
  if (!value) return "—";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function lifecycleStateClass(state: ModelLifecycleState | undefined) {
  if (state === "PRODUCTION") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (state === "SMALL_LIVE" || state === "SHADOW" || state === "CANDIDATE") return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  if (state === "WATCHLIST" || state === "REDUCED") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  if (state === "RETIRED") return "border-rose-500/35 bg-rose-500/10 text-rose-200";
  return "border-slate-700 bg-slate-900/50 text-slate-400";
}

function LifecycleOperationsPanel({
  market,
  decisions,
  lifecycleInsight,
  dataQualityPct,
}: {
  market: string;
  decisions: ExecutionDecision[];
  lifecycleInsight: PortfolioLifecycleInsight;
  dataQualityPct: number;
}) {
  const [models, setModels] = useState<ModelLifecycleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const currentSignalModelId = decisions.find((decision) => decision.signal.modelId)?.signal.modelId;
  const scopedModels = useMemo(
    () => models.filter((model) => modelMatchesMarket(model, market)),
    [market, models],
  );
  const currentModel =
    scopedModels.find((model) => model.model_id === currentSignalModelId) ??
    scopedModels[0];
  const blockedReasons = useMemo(() => {
    const reasons = new Set<string>();
    if (lifecycleInsight.reason) reasons.add(plainLifecycleReason(lifecycleInsight.reason));
    if (dataQualityPct < 90) reasons.add("Some market data is missing or stale.");
    decisions
      .filter((decision) => !decision.lifecycleCanOpenNewTrades || decision.suggestedAllocationPct <= DISPLAY_ZERO_THRESHOLD)
      .slice(0, 8)
      .forEach((decision) => {
        if (decision.lifecycleReason) reasons.add(plainLifecycleReason(decision.lifecycleReason));
        if (decision.riskScore >= 70) reasons.add(`${cleanTicker(decision.signal.ticker)} carries elevated risk right now.`);
        if (decision.qualityScore < 45) reasons.add(`${cleanTicker(decision.signal.ticker)} is not strong enough for a position.`);
      });
    return Array.from(reasons).slice(0, 5);
  }, [dataQualityPct, decisions, lifecycleInsight.reason]);

  async function refreshLifecycle() {
    setLoading(true);
    try {
      const nextModels = await fetchModelLifecycle();
      setModels(nextModels);
    } catch (error) {
      toast({
        title: "Could not update trust check",
        description: error instanceof Error ? plainLifecycleReason(error.message) : "Could not load the latest strategy trust check.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshLifecycle();
  }, [market]);

  return (
    <InsightShell
      title="Strategy Trust Check"
      eyebrow="Determines whether this strategy can add capital"
      action={
        <button
          type="button"
          onClick={() => void refreshLifecycle()}
          disabled={loading}
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs font-medium text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Update
        </button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Active Strategy ID</div>
              <div className="mt-2 break-all font-mono text-sm text-slate-100">
                {currentModel ? compactModelId(currentModel.model_id) : "No trust record yet"}
              </div>
            </div>
            <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", lifecycleStateClass(currentModel?.lifecycle_state))}>
              {plainLifecycleState(currentModel?.lifecycle_state ?? lifecycleInsight.state)}
            </span>
          </div>
          <div className="grid gap-3 text-xs text-slate-400">
            <div>
              <div className="text-slate-500">Built from</div>
              <div className="mt-1 break-all font-mono text-slate-300">
                {currentModel?.parent_model_id ? compactModelId(currentModel.parent_model_id) : "Original strategy"}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Last reviewed</div>
              <div className="mt-1 text-slate-300">{formatLifecycleTimestamp(currentModel?.updated_at)}</div>
            </div>
            <div>
              <div className="text-slate-500">Comeback rule</div>
              <div className="mt-1 leading-5 text-slate-300">
                A stopped strategy stays on record. A comeback starts as a fresh review.
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Why Position Size Is Capped</div>
          <div className="grid gap-2">
            {(blockedReasons.length ? blockedReasons : ["No trust blockers are active. Use the position sizes shown above."]).map((reason) => (
              <div key={reason} className="rounded-lg border border-slate-800 bg-slate-950/45 px-3 py-2 text-xs leading-5 text-slate-300">
                {reason}
              </div>
            ))}
          </div>
        </div>
      </div>
    </InsightShell>
  );
}

function PortfolioIntelligence({ decisions, portfolio }: { decisions: ExecutionDecision[]; portfolio: SimulatedPortfolio }) {
  const totalValue = (portfolio.cash ?? 0) + Object.values(portfolio.positions ?? {}).reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
  const invested = Object.values(portfolio.positions ?? {}).reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
  const currentExposure = totalValue > 0 ? (invested / totalValue) * 100 : 0;
  const suggestedExposure = Math.min(100, decisions.reduce((sum, item) => sum + item.suggestedAllocationPct, 0));
  const capitalAtRisk = (totalValue * currentExposure) / 100;
  const remainingRiskBudget = Math.max(0, suggestedExposure - currentExposure);
  const avgRisk = mean(decisions.slice(0, 60).map((item) => item.riskScore));
  const suggestedAction = suggestedExposure <= 10 ? "Capital Preservation Mode" : currentExposure > suggestedExposure + 8 ? "Trim Positions" : suggestedExposure > currentExposure + 8 ? "Add Selectively" : "Hold Core";

  return (
    <InsightShell title="Capital At Work" eyebrow="Target size versus current size" action={<Badge variant="outline" className="border-slate-700 text-slate-300">{suggestedAction}</Badge>}>
      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Target Size", `${suggestedExposure.toFixed(1)}%`, suggestedExposure],
          ["Current Size", `${currentExposure.toFixed(1)}%`, currentExposure],
          ["Capital Deployed", formatMaybeCurrency(capitalAtRisk), currentExposure],
          ["Available Budget", `${remainingRiskBudget.toFixed(1)}%`, remainingRiskBudget],
          ["Market Risk", avgRisk > 65 ? "Elevated" : avgRisk > 45 ? "Balanced" : "Contained", avgRisk],
        ].map(([label, value, meter]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900/35 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">{value}</div>
            <div className="mt-3"><Meter value={Number(meter)} tone={String(label).includes("Stress") ? toneForValue(Number(meter)) : "info"} /></div>
          </div>
        ))}
      </div>
    </InsightShell>
  );
}

function TopOpportunities({ decisions }: { decisions: ExecutionDecision[] }) {
  const rows = priorityAllocationCandidates(decisions);
  const displayRows = rows.length
    ? rows
    : decisions
      .filter((item) => item.signal.expectedMovePct > 0 && item.suggestedAllocationPct > 0)
      .slice(0, 6);
  return (
    <InsightShell title="Stocks Worth Capital Now" eyebrow="Ranked by upside, risk, and strategy trust" action={<Badge variant="outline" className="border-slate-700 text-slate-300">Top {displayRows.length}</Badge>}>
      <div className="grid gap-4 lg:grid-cols-2">
        {displayRows.length ? displayRows.map((decision, index) => (
          <div key={decision.signal.adaptiveId} className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="rounded-full bg-slate-800 px-2.5 py-1 font-mono text-xs font-semibold text-slate-200">{cleanTicker(decision.signal.ticker)}</span>
              <div className="flex items-center gap-2">
                {decision.lifecycleAction && (
                  <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                    {plainLifecycleAction(decision.lifecycleAction)}
                  </span>
                )}
                <span className="text-[11px] font-semibold text-slate-500">#{index + 1}</span>
              </div>
            </div>
            <div className="text-sm font-semibold text-slate-100">{plainAction(decision.actionLabel)} · {plainConviction(decision.convictionLabel)}</div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
              <div><div className="text-slate-500">Suggested size</div><div className="mt-1 text-lg font-semibold text-slate-100">{decision.suggestedAllocationPct.toFixed(1)}%</div></div>
              <div><div className="text-slate-500">Upside range</div><div className={cn("mt-1 text-lg font-semibold", decision.signal.expectedMovePct >= 0 ? "text-emerald-300" : "text-rose-300")}>{decision.signal.expectedMovePct >= 0 ? "+" : ""}{decision.signal.expectedMovePct.toFixed(1)}%</div></div>
              <div><div className="text-slate-500">Confidence</div><div className="mt-1 font-medium text-slate-200">{decision.qualityScore.toFixed(0)}/100</div></div>
            </div>
            <div className="mt-4 space-y-2 text-xs leading-5 text-slate-400">
              <div><span className="font-semibold text-slate-300">Reason:</span> {decision.tradeExplanation}</div>
              <div><span className="font-semibold text-slate-300">Position size:</span> confidence {decision.qualityScore.toFixed(0)}, risk {decision.riskScore.toFixed(0)}, trust cap {(decision.lifecycleAllocationMultiplier * 100).toFixed(0)}% of normal size.</div>
              <div><span className="font-semibold text-slate-300">Step back if:</span> {decision.lifecycleCanOpenNewTrades ? "the strategy is downgraded, timing gets stretched, or market risk rises." : "the strategy is already blocked from new risk."}</div>
            </div>
          </div>
        )) : (
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-5 text-sm leading-6 text-slate-400 lg:col-span-2">
            No stock currently deserves fresh capital.
          </div>
        )}
      </div>
    </InsightShell>
  );
}

function MarketIntelligenceSummary({ metrics }: { metrics: { drift: number; entropy: number; ensemble: number; calibration: number; regimeStability: number; modelStability: number; survival: number; residual: number } }) {
  const groups = [
    { title: "Trend Quality", icon: Layers, value: metrics.ensemble, text: metrics.ensemble >= 65 ? "Participation is broadening across higher-quality ideas." : "Trend evidence remains mixed; keep selection standards high.", rows: [["Reliability", 100 - metrics.drift], ["Breadth", metrics.ensemble], ["Clarity", metrics.entropy]] },
    { title: "Risk Climate", icon: ShieldCheck, value: 100 - metrics.drift, text: metrics.drift < 40 ? "Volatility is orderly and strategy stability remains acceptable." : "Market risk is elevated; incremental capital should remain restrained.", rows: [["Volatility", metrics.drift], ["Market Stability", metrics.regimeStability], ["Confidence Fit", metrics.calibration]] },
    { title: "Position Durability", icon: Brain, value: metrics.survival, text: metrics.survival >= 55 ? "Active positions are holding long enough to support selective allocation." : "Persistence is limited; await stronger confirmation before adding risk.", rows: [["Strategy Durability", metrics.modelStability], ["Holding Quality", metrics.survival], ["Error Control", 100 - metrics.residual]] },
  ];
  return (
    <InsightShell title="Market Risk Read" eyebrow="Why capital size changes">
      <p className="mb-4 text-sm leading-6 text-slate-400">
        These scores help decide how much capital to put at risk, how much confidence to assign, and how long positions should be given to work.
      </p>
      <div className="grid gap-4 lg:grid-cols-1">
        {groups.map((group) => (
          <div key={group.title} className="rounded-3xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold text-slate-100"><group.icon className="h-4 w-4 text-slate-400" />{group.title}</div><span className="text-xl font-semibold text-slate-100">{group.value.toFixed(0)}</span></div>
            <p className="min-h-12 text-sm leading-6 text-slate-400">{group.text}</p>
            <div className="mt-4 space-y-3">
              {group.rows.map(([label, value]) => (
                <div key={String(label)}><div className="mb-1 flex justify-between text-xs text-slate-500"><span>{label}</span><span>{Number(value).toFixed(0)}%</span></div><Meter value={Number(value)} tone={String(label).includes("Volatility") ? toneForValue(Number(value)) : Number(value) > 60 ? "good" : Number(value) > 40 ? "info" : "warn"} /></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </InsightShell>
  );
}

function OpportunityMap({ decisions, selected, onSelect }: { decisions: ExecutionDecision[]; selected?: string; onSelect: (signal: AdaptiveSignalView) => void }) {
  const points = decisions.slice(0, 40).map((decision) => ({
    decision,
    x: clampMetric(50 + decision.signal.expectedMovePct * 5 + (decision.qualityScore - 50) * 0.35),
    y: clampMetric(100 - decision.riskScore),
  }));
  return (
    <InsightShell title="Upside/Risk Map" eyebrow="Top-right is preferred: higher upside, lower risk">
      <div className="relative h-[360px] overflow-hidden rounded-3xl border border-slate-800 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))]">
        <div className="absolute left-1/2 top-0 h-full w-px bg-slate-800" /><div className="absolute left-0 top-1/2 h-px w-full bg-slate-800" />
        <div className="absolute left-4 top-4 text-xs text-emerald-300">Improving upside</div><div className="absolute bottom-4 right-4 text-xs text-rose-300">Higher risk / weaker breadth</div><div className="absolute bottom-4 left-4 text-xs text-slate-500">Low participation</div><div className="absolute right-4 top-4 text-xs text-slate-400">Preferred zone</div>
        {points.map(({ decision, x, y }) => (
          <button key={decision.signal.adaptiveId} type="button" onClick={() => onSelect(decision.signal)} className={cn("absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-1 font-mono text-[10px] font-semibold shadow-lg transition hover:scale-110", selected === decision.signal.ticker ? "border-emerald-300 bg-emerald-400 text-slate-950" : decision.riskScore > 65 ? "border-rose-400/40 bg-rose-400/15 text-rose-200" : "border-emerald-400/40 bg-emerald-400/15 text-emerald-200")} style={{ left: `${x}%`, top: `${100 - y}%` }}>
            {cleanTicker(decision.signal.ticker)}
          </button>
        ))}
      </div>
    </InsightShell>
  );
}

type OpportunitySortKey =
  | "quality"
  | "allocation"
  | "dollars"
  | "risk"
  | "expectedMove"
  | "ticker"
  | "posture";

const opportunitySortLabels: Record<OpportunitySortKey, string> = {
  quality: "Confidence",
  allocation: "Suggested Size",
  dollars: "Capital",
  risk: "Risk",
  expectedMove: "Upside Range",
  ticker: "Ticker",
  posture: "Action",
};

function compareOpportunity(
  a: ExecutionDecision,
  b: ExecutionDecision,
  sortKey: OpportunitySortKey,
) {
  if (sortKey === "ticker") {
    return cleanTicker(a.signal.ticker).localeCompare(cleanTicker(b.signal.ticker));
  }
  if (sortKey === "posture") {
    return a.actionLabel.localeCompare(b.actionLabel);
  }
  const values: Record<Exclude<OpportunitySortKey, "ticker" | "posture">, [number, number]> = {
    quality: [a.qualityScore, b.qualityScore],
    allocation: [a.suggestedAllocationPct, b.suggestedAllocationPct],
    dollars: [a.suggestedAllocationPct, b.suggestedAllocationPct],
    risk: [a.riskScore, b.riskScore],
    expectedMove: [a.signal.expectedMovePct, b.signal.expectedMovePct],
  };
  const [left, right] = values[sortKey];
  return left - right;
}

function AdaptiveSignalFeed({
  decisions,
  portfolio,
  budget,
  onBudgetChange,
  selected,
  onSelect,
}: {
  decisions: ExecutionDecision[];
  portfolio: SimulatedPortfolio;
  budget: number;
  onBudgetChange: (budget: number) => void;
  selected?: string;
  onSelect: (signal: AdaptiveSignalView) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<OpportunitySortKey>("quality");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readStoredSignalPageSize);
  const [budgetInput, setBudgetInput] = useState(() => String(Math.round(budget)));
  const parsedBudgetInput = Number(budgetInput.replace(/[,$\s]/g, ""));
  const budgetDraftIsValid = Number.isFinite(parsedBudgetInput) && parsedBudgetInput > 0;
  const planningBudget = budgetDraftIsValid ? parsedBudgetInput : budget;
  const budgetDraftChanged =
    budgetDraftIsValid && Math.abs(planningBudget - budget) > 0.01;
  const exposedDecisions = useMemo(
    () => decisions.filter((decision) => decision.suggestedAllocationPct > DISPLAY_ZERO_THRESHOLD),
    [decisions],
  );
  const targetByTicker = useMemo(
    () => new Map(exposedDecisions.map((decision) => [
      decision.signal.ticker,
      (planningBudget * decision.suggestedAllocationPct) / 100,
    ])),
    [exposedDecisions, planningBudget],
  );
  const capitalSummary = useMemo(() => {
    const currentByTicker = new Map(
      Object.values(portfolio.positions ?? {}).map((position) => [position.ticker, position.marketValue]),
    );
    const targetTotal = Array.from(targetByTicker.values()).reduce((sum, value) => sum + value, 0);
    let add = 0;
    let trim = 0;
    let hold = 0;

    for (const [ticker, targetValue] of targetByTicker.entries()) {
      const currentValue = currentByTicker.get(ticker) ?? 0;
      add += Math.max(0, targetValue - currentValue);
      trim += Math.max(0, currentValue - targetValue);
      hold += Math.min(currentValue, targetValue);
    }

    for (const [ticker, currentValue] of currentByTicker.entries()) {
      if (!targetByTicker.has(ticker)) trim += currentValue;
    }

    return {
      add,
      trim,
      hold,
      cashLeft: Math.max(0, planningBudget - targetTotal),
    };
  }, [planningBudget, portfolio.positions, targetByTicker]);
  const pageCount = Math.max(1, Math.ceil(exposedDecisions.length / pageSize));
  const boundedPage = Math.min(page, pageCount);
  const sorted = useMemo(() => {
    return [...exposedDecisions].sort((a, b) => {
      const result = compareOpportunity(a, b, sortKey);
      return sortDirection === "asc" ? result : -result;
    });
  }, [exposedDecisions, sortDirection, sortKey]);
  const visible = sorted.slice((boundedPage - 1) * pageSize, boundedPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [exposedDecisions.length, pageSize, sortDirection, sortKey]);

  useEffect(() => {
    setBudgetInput(String(Math.round(budget)));
  }, [budget]);

  useEffect(() => {
    writeStoredPreference(SIGNAL_PAGE_SIZE_STORAGE_KEY, String(pageSize));
  }, [pageSize]);

  function updateSort(nextSortKey: OpportunitySortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "ticker" || nextSortKey === "posture" ? "asc" : "desc");
  }

  function applyBudget() {
    if (!budgetDraftChanged) return;
    onBudgetChange(planningBudget);
  }

  return (
    <InsightShell
      title="Position Sizes To Use"
      eyebrow="Stocks at 0% size are hidden"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-400">
            Capital Budget
            <input
              value={budgetInput}
              onChange={(event) => setBudgetInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applyBudget();
                }
              }}
              inputMode="decimal"
              className="h-6 w-24 bg-transparent text-right font-semibold tabular-nums text-slate-100 outline-none"
              aria-label="Capital budget"
            />
          </label>
          {budgetDraftChanged && (
            <button
              type="button"
              onClick={applyBudget}
              className="h-8 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 text-xs font-medium text-cyan-200"
            >
              Apply
            </button>
          )}
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="h-8 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-300 outline-none"
          >
            {[20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} lines
              </option>
            ))}
          </select>
          <Badge variant="outline" className="border-slate-700 text-slate-300">
            {exposedDecisions.length
              ? `${(boundedPage - 1) * pageSize + 1}-${Math.min(boundedPage * pageSize, exposedDecisions.length)} of ${exposedDecisions.length}`
              : "0 active ideas"}
          </Badge>
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
            Live
          </Badge>
        </div>
      }
    >
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {[
          ["Add", capitalSummary.add, capitalSummary.add > 1 ? "good" : "info"],
          ["Trim", capitalSummary.trim, capitalSummary.trim > 1 ? "warn" : "info"],
          ["Hold", capitalSummary.hold, "info"],
          ["Unassigned", capitalSummary.cashLeft, "info"],
        ].map(([label, value, tone]) => (
          <div
            key={String(label)}
            className={cn(
              "rounded-lg border px-4 py-3",
              tone === "good"
                ? "border-emerald-500/30 bg-emerald-500/10"
                : tone === "warn"
                  ? "border-amber-500/35 bg-amber-500/10"
                  : "border-slate-800 bg-slate-900/30",
            )}
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
            <div className="mt-2 text-xl font-semibold tabular-nums text-slate-100">{formatMaybeCurrency(Number(value))}</div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-800">
        <div className="sticky top-0 grid grid-cols-[1.1fr_0.85fr_0.85fr_0.75fr_0.75fr_0.75fr] gap-4 border-b border-slate-800 bg-slate-950/95 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {[
            ["ticker", "Ticker"],
            ["posture", "Action"],
            ["dollars", "Capital"],
            ["allocation", "Size"],
            ["quality", "Confidence"],
            ["risk", "Risk"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => updateSort(key as OpportunitySortKey)}
              className="text-left uppercase tracking-[0.18em] transition hover:text-slate-200"
            >
              {label}
              {sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
            </button>
          ))}
        </div>
        <div className="divide-y divide-slate-800">
          {visible.length ? (
            visible.map((decision) => {
              const currentValue = portfolio.positions?.[decision.signal.ticker]?.marketValue ?? 0;
              const targetValue = targetByTicker.get(decision.signal.ticker) ?? 0;
              return (
                <div key={decision.signal.adaptiveId}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(decision.signal);
                      setExpanded(expanded === decision.signal.adaptiveId ? null : decision.signal.adaptiveId);
                    }}
                    className={cn(
                      "grid w-full grid-cols-[1.1fr_0.85fr_0.85fr_0.75fr_0.75fr_0.75fr] gap-4 px-4 py-3 text-left text-sm transition hover:bg-slate-900/60",
                      selected === decision.signal.ticker && "bg-emerald-400/5",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="rounded-full bg-slate-800 px-2.5 py-1 font-mono text-xs font-semibold text-slate-100">
                        {cleanTicker(decision.signal.ticker)}
                      </span>
                      <span className="ml-2 hidden truncate text-xs text-slate-500 md:inline">
                        {decision.signal.name}
                      </span>
                    </span>
                    <span className="text-slate-300">{plainCapitalMove(currentValue, targetValue)}</span>
                    <span className="font-semibold text-slate-100">{formatMaybeCurrency(targetValue)}</span>
                    <span className="font-semibold text-slate-100">{decision.suggestedAllocationPct.toFixed(1)}%</span>
                    <span className="text-slate-300">{decision.qualityScore.toFixed(0)}/100</span>
                    <span className={decision.riskScore > 65 ? "text-rose-300" : "text-slate-300"}>
                      {plainRisk(decision.riskLevel)}
                    </span>
                  </button>
                  {expanded === decision.signal.adaptiveId && (
                    <div className="bg-slate-950/70 px-4 pb-4 text-sm text-slate-400">
                      <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/30 p-4 md:grid-cols-3">
                        <div>
                          <span className="font-semibold text-slate-300">Why capital:</span>{" "}
                          {decision.tradeExplanation}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-300">Why this size:</span>{" "}
                          target {formatMaybeCurrency(targetValue)} from{" "}
                          {decision.suggestedAllocationPct.toFixed(1)}% of budget, confidence{" "}
                          {decision.qualityScore.toFixed(0)}, risk {decision.riskScore.toFixed(0)}, trust cap{" "}
                          {(decision.lifecycleAllocationMultiplier * 100).toFixed(0)}%.
                        </div>
                        <div>
                          <span className="font-semibold text-slate-300">Reduce if:</span>{" "}
                          trust falls, market risk rises, timing stretches, or price data weakens. Entry timing:{" "}
                          {plainTiming(decision.timingState)}. Expected hold:{" "}
                          {formatDuration(decision.recommendedHoldingMinutes * 60_000)}.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="px-4 py-6 text-sm text-slate-400">
              No stock currently earns a position size. 0% rows are hidden.
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          Ordered by {opportunitySortLabels[sortKey].toLowerCase()} {sortDirection === "asc" ? "ascending" : "descending"}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={boundedPage <= 1}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500">
            Page {boundedPage} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={boundedPage >= pageCount}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </InsightShell>
  );
}

function LiveIntelligenceChart({ decision, fallback }: { decision?: ExecutionDecision; fallback: ExecutionDecision[] }) {
  const activeDecision = decision ?? fallback[0];
  const active = activeDecision?.signal;
  const chartRows = useMemo(() => {
    const history = active?.history?.length ? active.history : fallback.flatMap((item) => item.signal.history ?? []).slice(-30);
    const prices = history.length ? history : [0, 0];
    return prices.slice(-80).map((price, index) => ({ index, price }));
  }, [active, fallback]);
  return (
    <InsightShell title="Selected Price Path" eyebrow="Price history for the highlighted ticker" action={active && <Badge variant="outline" className="border-slate-700 text-slate-300">{cleanTicker(active.ticker)}</Badge>}>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs><linearGradient id="institutionalPath" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(158 64% 52%)" stopOpacity={0.24} /><stop offset="100%" stopColor="hsl(158 64% 52%)" stopOpacity={0} /></linearGradient></defs>
            <XAxis dataKey="index" hide /><YAxis domain={["dataMin", "dataMax"]} hide />
            <Tooltip content={({ active: isActive, payload }) => isActive && payload?.length ? <div className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 shadow-xl">{formatMaybeCurrency(payload[0].payload.price)}</div> : null} />
            <Area type="monotone" dataKey="price" stroke="hsl(158 64% 52%)" strokeWidth={2.5} fill="url(#institutionalPath)" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </InsightShell>
  );
}

function stockDataFromQuote(
  quote: StockQuote,
  stock: StockListItem | undefined,
  market: string,
): StockData {
  return {
    ...stock,
    ...quote,
    symbol: quote.symbol,
    ticker: quote.symbol,
    name: stock?.name ?? quote.symbol,
    exchange: stock?.exchange ?? market,
    country: stock?.country ?? "",
    market: stock?.market ?? market,
    quoteStatus: "available",
  };
}

function mergeStockQuotes(
  current: StockData[],
  quotes: StockQuote[],
  stockBySymbol: Map<string, StockListItem>,
  market: string,
): StockData[] {
  if (!quotes.length) return current;
  const merged = new Map(current.map((stock) => [stock.ticker, stock]));
  for (const quote of quotes) {
    if (!Number.isFinite(quote.price)) continue;
    merged.set(
      quote.symbol,
      stockDataFromQuote(quote, stockBySymbol.get(quote.symbol), market),
    );
  }
  return Array.from(merged.values());
}

function liveBidFor(stock: StockData): number {
  const price = Number(stock.price) || 0;
  return Number.isFinite(stock.bid) && stock.bid! > 0
    ? Number(stock.bid)
    : price;
}

function resolvePositionBid(
  liveStock: StockData | undefined,
  position: SimulatedPosition,
): number {
  const liveBid = liveStock ? liveBidFor(liveStock) : 0;
  if (Number.isFinite(liveBid) && liveBid > 0) return liveBid;
  const positionBid = Number(position.bid);
  if (Number.isFinite(positionBid) && positionBid > 0) return positionBid;
  const positionPrice = Number(position.price);
  if (Number.isFinite(positionPrice) && positionPrice > 0) return positionPrice;
  return position.entryPrice;
}

function buildPortfolioReturnHistory(portfolio: SimulatedPortfolio) {
  const recorded = (portfolio.valueHistory ?? []).filter((point) =>
    Number.isFinite(point.t) && Number.isFinite(point.v) && point.v > 0,
  );
  if (recorded.length >= 2) return recorded.slice(-240);

  const positions = Object.values(portfolio.positions ?? {}).filter(
    (position) => position.history && position.history.length >= 2,
  );
  if (!positions.length) return recorded;

  const length = Math.min(80, ...positions.map((position) => position.history?.length ?? 0));
  const totalInvested = positions.reduce((sum, position) => sum + position.investedAmount, 0);
  const now = Date.now();
  const points = Array.from({ length }, (_, index) => {
    const value = positions.reduce((sum, position) => {
      const history = position.history ?? [];
      const start = history[history.length - length];
      const price = history[history.length - length + index];
      const weight = totalInvested > 0 ? position.investedAmount / totalInvested : 1 / positions.length;
      return sum + STARTING_PORTFOLIO_VALUE * weight * (price / Math.max(start, 0.0001));
    }, 0);
    return {
      t: now - (length - index - 1) * 60_000,
      v: value,
    };
  });

  return points;
}

type PortfolioTradeRow = {
  ticker: string;
  name?: string;
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  pnl: number;
  pnlPct: number;
  openedAt: number;
  closedAt?: number;
  status: "Open" | "Closed";
};

function buildTradeRows(portfolio: SimulatedPortfolio): PortfolioTradeRow[] {
  const openRows = Object.values(portfolio.positions ?? {}).map((position) => ({
    ticker: position.ticker,
    name: position.name,
    quantity: position.quantity,
    entryPrice: position.entryPrice,
    exitPrice: undefined,
    pnl: position.marketValue - position.investedAmount,
    pnlPct:
      position.investedAmount > 0
        ? (position.marketValue - position.investedAmount) / position.investedAmount
        : 0,
    openedAt: position.openedAt,
    closedAt: undefined,
    status: "Open" as const,
  }));
  const closedRows = (portfolio.closedPositions ?? []).slice().reverse().map((position) => {
    const pnl = position.proceeds - position.investedAmount;
    return {
      ticker: position.ticker,
      name: position.name,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      exitPrice: position.exitPrice,
      pnl,
      pnlPct: position.investedAmount > 0 ? pnl / position.investedAmount : 0,
      openedAt: position.openedAt,
      closedAt: position.closedAt,
      status: "Closed" as const,
    };
  });
  return [...openRows, ...closedRows].filter((row) => row.quantity > 0);
}

function portfolioStats(portfolio: SimulatedPortfolio) {
  const history = buildPortfolioReturnHistory(portfolio);
  const trades = buildTradeRows(portfolio);
  const closed = trades.filter((trade) => trade.status === "Closed");
  const wins = closed.filter((trade) => trade.pnl > 0);
  const losses = closed.filter((trade) => trade.pnl <= 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null;
  const currentValue =
    (portfolio.cash ?? 0) +
    Object.values(portfolio.positions ?? {}).reduce((sum, position) => sum + position.marketValue, 0);
  const baseline = portfolio.startValue ?? STARTING_PORTFOLIO_VALUE;
  const chartValue = history[history.length - 1]?.v;
  const effectiveValue = currentValue > 0 ? currentValue : chartValue ?? baseline;
  const totalReturn = baseline > 0 ? (effectiveValue - baseline) / baseline : 0;
  let maxDrawdown = 0;
  let peak = history[0]?.v ?? baseline;
  for (const point of history) {
    peak = Math.max(peak, point.v);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - point.v) / peak : 0);
  }

  const periodReturns = history.slice(1).map((point, index) => {
    const previous = history[index].v;
    return previous > 0 ? (point.v - previous) / previous : 0;
  }).filter((value) => Number.isFinite(value));
  const volatility = stddev(periodReturns);
  const avg = mean(periodReturns);
  const intervals = history.slice(1).map((point, index) => point.t - history[index].t).filter((value) => value > 0);
  const avgIntervalMs = mean(intervals);
  const periodsPerYear = avgIntervalMs > 0
    ? Math.min(252, (365.25 * 24 * 3_600_000) / avgIntervalMs)
    : 0;
  const annualizationPeriods = periodsPerYear || Math.min(252, periodReturns.length);
  const annualizedReturn = avg * annualizationPeriods;
  const annualizedVolatility = volatility * Math.sqrt(annualizationPeriods);
  const normalizedAnnualSharpe = periodReturns.length >= 2 && annualizedVolatility > 0
    ? annualizedReturn / annualizedVolatility
    : null;
  const first = history[0]?.t;
  const last = history[history.length - 1]?.t;
  const elapsedMonths = first && last ? (last - first) / (30.44 * 24 * 3_600_000) : 0;
  const monthlyReturn = elapsedMonths >= 0.5 && totalReturn > -1
    ? (Math.pow(1 + totalReturn, 1 / elapsedMonths) - 1) * 100
    : null;
  const averageDurationMs = closed.length
    ? closed.reduce(
      (sum, trade) => sum + Math.max(0, (trade.closedAt ?? Date.now()) - trade.openedAt),
      0,
    ) / closed.length
    : null;

  return {
    currentValue: effectiveValue,
    totalReturn,
    maxDrawdown,
    normalizedAnnualSharpe,
    monthlyReturn,
    profitFactor,
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    totalTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    averageDurationMs,
  };
}

function formatDuration(ms: number | null) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const days = ms / 86_400_000;
  if (days >= 1) return `${days.toFixed(days >= 10 ? 0 : 1)}d`;
  const hours = ms / 3_600_000;
  if (hours >= 1) return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  const minutes = ms / 60_000;
  return `${Math.max(1, Math.round(minutes))}m`;
}

type PortfolioLifecycleInsight = {
  label: string;
  state: ModelLifecycleState;
  className: string;
  reason: string;
};

function portfolioLifecycleInsight(
  stats: ReturnType<typeof portfolioStats>,
  trainingActive: boolean,
): PortfolioLifecycleInsight {
  const profitFactor = stats.profitFactor === Infinity ? 9.99 : stats.profitFactor ?? 0;
  const sharpe = stats.normalizedAnnualSharpe ?? 0;
  const winRate = stats.winRate ?? 0;

  if (!trainingActive) {
    return {
      label: "Needs More Proof",
      state: "RESEARCH",
      className: "border-slate-700 bg-slate-900/50 text-slate-400",
      reason: "No closed trades yet.",
    };
  }

  if (stats.totalTrades === 0) {
    return {
      label: "Starter Size",
      state: "SMALL_LIVE",
      className: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
      reason: "Collecting the first live results with reduced sizing.",
    };
  }

  if (stats.totalTrades < 30) {
    return {
      label: "Needs More Proof",
      state: "CANDIDATE",
      className: "border-sky-500/30 bg-sky-500/10 text-sky-200",
      reason: "More closed trades are needed before sizing up.",
    };
  }

  if (stats.totalReturn < 0 && (profitFactor < 1 || sharpe < 0)) {
    return {
      label: "Do Not Trade",
      state: "RETIRED",
      className: "border-rose-500/35 bg-rose-500/10 text-rose-200",
      reason: "Recent closed trades have not justified taking more risk.",
    };
  }

  if (profitFactor < 1 || sharpe < 0 || winRate < 35) {
    return {
      label: "Reduce Size",
      state: "REDUCED",
      className: "border-amber-500/35 bg-amber-500/10 text-amber-200",
      reason: "Results are not strong enough for full-size positions.",
    };
  }

  if (stats.totalTrades < 100) {
    return {
      label: "Watch Only",
      state: "SHADOW",
      className: "border-sky-500/30 bg-sky-500/10 text-sky-200",
      reason: "Promising, but needs more closed trades.",
    };
  }

  if (stats.maxDrawdown > 0.08 || profitFactor < 1.15 || sharpe < 0.5) {
    return {
      label: "Watch Closely",
      state: "WATCHLIST",
      className: "border-amber-500/35 bg-amber-500/10 text-amber-200",
      reason: "Keep sizing conservative until returns improve versus risk.",
    };
  }

  if (stats.totalTrades >= 200 && stats.totalReturn > 0 && profitFactor >= 1.25 && sharpe >= 1) {
    return {
      label: "Ready For Size",
      state: "PRODUCTION",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      reason: "The trade sample supports normal controlled sizing.",
    };
  }

  return {
    label: "Starter Size",
    state: "SMALL_LIVE",
    className: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
    reason: "Live results are improving, but still below full-size standards.",
  };
}

function portfolioReviewTrigger(stats: ReturnType<typeof portfolioStats>, lifecycle: PortfolioLifecycleInsight, dataQualityPct: number) {
  if (dataQualityPct < 80) return "Review when price coverage is back above 80%.";
  if (stats.totalTrades < 30) return `Review after ${30 - stats.totalTrades} more closed trades.`;
  if (stats.totalTrades < 100) return `Review after ${100 - stats.totalTrades} more closed trades.`;
  if ((stats.normalizedAnnualSharpe ?? 0) < 0) return "Review when risk-adjusted returns turn positive.";
  if ((stats.profitFactor ?? 0) < 1) return "Review when winners exceed losers after costs.";
  if (stats.maxDrawdown > 0.08) return "Review when drawdown is back under 8%.";
  if (lifecycle.state === "PRODUCTION") return "Review when drawdown, Sharpe, or trust state changes.";
  return "Review after the next closed trade batch.";
}

function portfolioDecisionPosture(
  stats: ReturnType<typeof portfolioStats>,
  lifecycle: PortfolioLifecycleInsight,
  dataQualityPct: number,
  targetAllocationPct: number,
): { label: string; tone: UserActionTone; reason: string } {
  const sharpe = stats.normalizedAnnualSharpe ?? 0;
  const profitFactor = stats.profitFactor === Infinity ? 9.99 : stats.profitFactor ?? 0;

  if (lifecycle.state === "RETIRED") {
    return {
      label: "Do Not Add Capital",
      tone: "bad",
      reason: lifecycle.reason,
    };
  }

  if (dataQualityPct < 70) {
    return {
      label: "Wait For Cleaner Prices",
      tone: "warn",
      reason: `Only ${dataQualityPct.toFixed(0)}% of the market list has usable prices.`,
    };
  }

  if (targetAllocationPct < 1) {
    return {
      label: "Hold Cash",
      tone: "info",
      reason: "No current stock clears the quality and risk filter.",
    };
  }

  if (
    lifecycle.state === "RESEARCH" ||
    lifecycle.state === "CANDIDATE" ||
    lifecycle.state === "SHADOW" ||
    lifecycle.state === "SMALL_LIVE" ||
    stats.totalTrades < 30
  ) {
    return {
      label: "Test Small",
      tone: "info",
      reason: lifecycle.reason,
    };
  }

  if (lifecycle.state === "REDUCED" || lifecycle.state === "WATCHLIST" || sharpe < 0 || profitFactor < 1) {
    return {
      label: "Reduce / Wait",
      tone: "warn",
      reason: lifecycle.reason,
    };
  }

  if (lifecycle.state === "PRODUCTION") {
    return {
      label: "Deploy Capital",
      tone: "good",
      reason: lifecycle.reason,
    };
  }

  return {
    label: "Deploy Carefully",
    tone: "info",
    reason: lifecycle.reason,
  };
}

function targetAllocationPctForDecisions(decisions: ExecutionDecision[]) {
  return Math.min(
    100,
    decisions
      .filter((decision) => decision.suggestedAllocationPct > DISPLAY_ZERO_THRESHOLD)
      .reduce((sum, decision) => sum + decision.suggestedAllocationPct, 0),
  );
}

function topCapitalDriversForDecisions(decisions: ExecutionDecision[], budget: number, limit = 4): DecisionMemoryTopTicker[] {
  return [...decisions]
    .filter((decision) => decision.suggestedAllocationPct > DISPLAY_ZERO_THRESHOLD)
    .sort((a, b) => b.suggestedAllocationPct - a.suggestedAllocationPct)
    .slice(0, limit)
    .map((decision) => ({
      ticker: cleanTicker(decision.signal.ticker),
      action: decision.actionLabel,
      allocationPct: Number(decision.suggestedAllocationPct.toFixed(1)),
      targetCapital: (budget * decision.suggestedAllocationPct) / 100,
      quality: Number(decision.qualityScore.toFixed(0)),
      risk: Number(decision.riskScore.toFixed(0)),
    }));
}

function decisionReadinessLabel(
  stats: ReturnType<typeof portfolioStats>,
  lifecycle: PortfolioLifecycleInsight,
  dataQualityPct: number,
  targetAllocationPct: number,
  riskMode: RiskMode,
) {
  const sampleTarget = riskMode === "normal" ? 200 : riskMode === "balanced" ? 100 : 30;
  const checklistPassed =
    dataQualityPct >= 80 &&
    lifecycle.state !== "RETIRED" &&
    stats.totalTrades >= sampleTarget &&
    stats.maxDrawdown <= 0.08 &&
    targetAllocationPct >= 1;
  const hasHardBlock =
    lifecycle.state === "RETIRED" ||
    dataQualityPct < 70 ||
    stats.maxDrawdown > 0.08 ||
    targetAllocationPct < 1;

  if (hasHardBlock) return { label: "Wait", tone: "bad" as const };
  if (checklistPassed && lifecycle.state === "PRODUCTION") return { label: "Ready to follow", tone: "good" as const };
  return { label: "Paper trade only", tone: "warn" as const };
}

function lifecycleTrustRank(state: ModelLifecycleState) {
  const ranks: Record<ModelLifecycleState, number> = {
    RETIRED: 0,
    RESEARCH: 1,
    CANDIDATE: 2,
    SHADOW: 3,
    REDUCED: 3,
    WATCHLIST: 4,
    SMALL_LIVE: 5,
    PRODUCTION: 6,
  };
  return ranks[state] ?? 1;
}

function decisionMemorySignature(entry: Pick<DecisionMemoryEntry, "market" | "recommendation" | "readiness" | "budget" | "targetAllocationPct" | "confidenceFilter" | "lifecycleState" | "topTickers">) {
  return [
    entry.market,
    entry.recommendation,
    entry.readiness,
    Math.round(entry.budget),
    entry.targetAllocationPct.toFixed(1),
    entry.confidenceFilter,
    entry.lifecycleState,
    entry.topTickers.map((ticker) => `${ticker.ticker}:${ticker.action}:${ticker.allocationPct.toFixed(1)}`).join("|"),
  ].join("::");
}

function buildDecisionMemoryEntry({
  market,
  decisions,
  portfolio,
  budget,
  lifecycleInsight,
  dataQualityPct,
  riskMode,
}: {
  market: string;
  decisions: ExecutionDecision[];
  portfolio: SimulatedPortfolio;
  budget: number;
  lifecycleInsight: PortfolioLifecycleInsight;
  dataQualityPct: number;
  riskMode: RiskMode;
}): DecisionMemoryEntry {
  const stats = portfolioStats(portfolio);
  const targetAllocationPct = targetAllocationPctForDecisions(decisions);
  const posture = portfolioDecisionPosture(stats, lifecycleInsight, dataQualityPct, targetAllocationPct);
  const readiness = decisionReadinessLabel(stats, lifecycleInsight, dataQualityPct, targetAllocationPct, riskMode);
  const topTickers = topCapitalDriversForDecisions(decisions, budget);
  const entry: DecisionMemoryEntry = {
    id: `${market}:${Date.now()}`,
    market,
    recordedAt: Date.now(),
    signature: "",
    recommendation: posture.label,
    readiness: readiness.label,
    tone: readiness.tone,
    budget,
    targetAllocationPct,
    targetCapital: (budget * targetAllocationPct) / 100,
    confidenceFilter: riskMode,
    confidenceFilterLabel: RISK_MODE_CONFIG[riskMode].label,
    lifecycleState: lifecycleInsight.state,
    lifecycleLabel: plainLifecycleState(lifecycleInsight.state),
    topTickers,
    startPortfolioValue: stats.currentValue,
    startTotalReturn: stats.totalReturn,
    startSharpe: stats.normalizedAnnualSharpe,
    startProfitFactor: stats.profitFactor === Infinity ? 9.99 : stats.profitFactor,
    startClosedTrades: stats.totalTrades,
    startDrawdown: stats.maxDrawdown,
    dataQualityPct,
  };
  return {
    ...entry,
    signature: decisionMemorySignature(entry),
  };
}

function evaluateDecisionMemory(entry: DecisionMemoryEntry, portfolio: SimulatedPortfolio, lifecycle: PortfolioLifecycleInsight) {
  const stats = portfolioStats(portfolio);
  const returnChange = (stats.totalReturn - entry.startTotalReturn) * 100;
  const closedTradeChange = stats.totalTrades - entry.startClosedTrades;
  const currentSharpe = stats.normalizedAnnualSharpe ?? 0;
  const startSharpe = entry.startSharpe ?? 0;
  const sharpeChange = currentSharpe - startSharpe;
  const trustChange = lifecycleTrustRank(lifecycle.state) - lifecycleTrustRank(entry.lifecycleState);

  const outcome =
    closedTradeChange < 5 && Math.abs(returnChange) < 0.25
      ? { label: "Too early", tone: "info" as const }
      : returnChange > 0.25 && sharpeChange >= -0.1
        ? { label: "Helped", tone: "good" as const }
        : returnChange < -0.25 && sharpeChange < 0
          ? { label: "Hurt", tone: "bad" as const }
          : { label: "Mixed", tone: "warn" as const };
  const trust =
    trustChange > 0
      ? "Trust improved"
      : trustChange < 0
        ? "Trust weakened"
        : "Trust unchanged";

  return {
    ...outcome,
    returnChange,
    closedTradeChange,
    sharpeChange,
    trust,
  };
}

type CanonicalDecision = {
  decision: "Do Not Trade" | "Paper Trade Only" | "Trade Small" | "Trade";
  capitalAction: string;
  confidence: "Low" | "Medium" | "High";
  confidenceTone: UserActionTone;
  validUntil: string;
  why: string[];
  whatWouldChangeIt: string;
  bottomLine: string;
  tone: UserActionTone;
  targetAllocationPct: number;
  targetCapital: number;
  spread: number | null;
  unchangedCount: number;
};

function formatPointDelta(value: number | null | undefined, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) < 0.01) return `0.00${suffix}`;
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

function metricDelta(current: number | null, previous: number | null, suffix = "") {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return "First reading";
  }
  const delta = current - previous;
  if (Math.abs(delta) < 0.01) return "No meaningful change";
  return `${formatPointDelta(previous, suffix)} -> ${formatPointDelta(current, suffix)} ${delta > 0 ? "up" : "down"}`;
}

function decisionConfidence(stats: ReturnType<typeof portfolioStats>, lifecycle: PortfolioLifecycleInsight): CanonicalDecision["confidence"] {
  const profitFactor = stats.profitFactor === Infinity ? 9.99 : stats.profitFactor ?? 0;
  const sharpe = stats.normalizedAnnualSharpe ?? 0;
  if (stats.totalTrades >= 200 && lifecycle.state === "PRODUCTION" && sharpe >= 1 && profitFactor >= 1.25) return "High";
  if (stats.totalTrades >= 50 && lifecycle.state !== "RETIRED" && profitFactor >= 1) return "Medium";
  return "Low";
}

function buildCanonicalDecision(input: {
  decisions: ExecutionDecision[];
  portfolio: SimulatedPortfolio;
  budget: number;
  lifecycleInsight: PortfolioLifecycleInsight;
  dataQualityPct: number;
  riskMode: RiskMode;
  benchmarkReturn: number | null;
  memory: DecisionMemoryEntry[];
}): CanonicalDecision {
  const stats = portfolioStats(input.portfolio);
  const targetAllocationPct = targetAllocationPctForDecisions(input.decisions);
  const targetCapital = (input.budget * targetAllocationPct) / 100;
  const profitFactor = stats.profitFactor === Infinity ? 9.99 : stats.profitFactor ?? 0;
  const sharpe = stats.normalizedAnnualSharpe ?? 0;
  const spread = input.benchmarkReturn == null ? null : stats.totalReturn * 100 - input.benchmarkReturn;
  const confidence = decisionConfidence(stats, input.lifecycleInsight);
  const confidenceTone: UserActionTone = confidence === "High" ? "good" : confidence === "Medium" ? "info" : "bad";
  const unchangedCount = input.memory.filter((entry) => entry.recommendation === input.memory[0]?.recommendation).length;

  if (
    input.lifecycleInsight.state === "RETIRED" ||
    input.dataQualityPct < 70 ||
    stats.maxDrawdown > 0.08 ||
    targetAllocationPct < 1 ||
    sharpe < 0 ||
    profitFactor < 1
  ) {
    const why = [
      input.lifecycleInsight.state === "RETIRED" || sharpe < 0 || profitFactor < 1
        ? "No confirmed edge after risk and trade outcomes."
        : null,
      targetAllocationPct < 1
        ? "No stock clears the allocation threshold."
        : input.dataQualityPct < 70
          ? "Market data quality is below the trading minimum."
          : stats.maxDrawdown > 0.08
            ? "Drawdown is beyond the risk limit."
            : null,
    ].filter((item): item is string => Boolean(item)).slice(0, 2);
    return {
      decision: "Do Not Trade",
      capitalAction: "Hold cash / no new allocation",
      confidence,
      confidenceTone,
      validUntil: "Until profit factor clears 1.00, Sharpe is positive, and at least one setup earns capital.",
      why: why.length ? why : ["Evidence does not justify new risk."],
      whatWouldChangeIt: "Positive Sharpe, profit factor above 1.00, clean prices, and investable setup breadth.",
      bottomLine: "Bottom line: no edge confirmed; capital remains unallocated.",
      tone: "bad",
      targetAllocationPct,
      targetCapital,
      spread,
      unchangedCount,
    };
  }

  if (input.lifecycleInsight.state !== "PRODUCTION" || stats.totalTrades < 200 || confidence !== "High") {
    return {
      decision: input.lifecycleInsight.state === "SMALL_LIVE" ? "Trade Small" : "Paper Trade Only",
      capitalAction: `Cap allocation at ${targetAllocationPct.toFixed(1)}% (${formatMaybeCurrency(targetCapital)})`,
      confidence,
      confidenceTone,
      validUntil: `Until closed trades reach 200 and trust state reaches ${plainLifecycleState("PRODUCTION")}.`,
      why: [
        plainLifecycleReason(input.lifecycleInsight.reason),
        `${stats.totalTrades} closed trades; full-size requires 200.`,
      ],
      whatWouldChangeIt: "More closed trades with positive Sharpe, stronger profit factor, and stable drawdown.",
      bottomLine: "Bottom line: evidence is improving, but capital stays limited.",
      tone: "warn",
      targetAllocationPct,
      targetCapital,
      spread,
      unchangedCount,
    };
  }

  return {
    decision: "Trade",
    capitalAction: `Allocate ${formatMaybeCurrency(targetCapital)} across qualified names`,
    confidence,
    confidenceTone,
    validUntil: "Until drawdown, coverage, trust state, or opportunity breadth deteriorates.",
    why: [
      "Closed trade sample and trust state support controlled allocation.",
      `${targetAllocationPct.toFixed(1)}% target exposure clears the active filter.`,
    ],
    whatWouldChangeIt: "Drawdown above 8%, profit factor below 1.25, or trust falling out of production.",
    bottomLine: "Bottom line: edge is confirmed enough for controlled allocation.",
    tone: "good",
    targetAllocationPct,
    targetCapital,
    spread,
    unchangedCount,
  };
}

function DecisionSpine({
  decision,
  budget,
  onBudgetChange,
}: {
  decision: CanonicalDecision;
  budget: number;
  onBudgetChange: (budget: number) => void;
}) {
  const [budgetInput, setBudgetInput] = useState(() => String(Math.round(budget)));
  const parsedBudget = Number(budgetInput.replace(/[,$\s]/g, ""));
  const budgetChanged = Number.isFinite(parsedBudget) && parsedBudget > 0 && Math.abs(parsedBudget - budget) > 0.01;

  useEffect(() => {
    setBudgetInput(String(Math.round(budget)));
  }, [budget]);

  return (
    <section className="rounded-lg border border-slate-800 bg-[#050b18] p-6 shadow-2xl">
      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn(toneClasses(decision.tone))}>
              Decision: {decision.decision}
            </Badge>
            <Badge variant="outline" className={cn(toneClasses(decision.confidenceTone))}>
              Confidence: {decision.confidence}
            </Badge>
            {decision.unchangedCount > 1 && (
              <Badge variant="outline" className="border-slate-700 bg-slate-900/50 text-slate-300">
                Decision unchanged across last {Math.min(decision.unchangedCount, 4)} evaluations
              </Badge>
            )}
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
            {decision.capitalAction}
          </h1>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {decision.why.slice(0, 2).map((reason) => (
              <div key={reason} className="rounded-lg border border-slate-800 bg-slate-950/55 p-4 text-sm leading-6 text-slate-300">
                {reason}
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/35 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">What Would Change It</div>
            <div className="mt-2 text-sm leading-6 text-slate-300">{decision.whatWouldChangeIt}</div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Time Validity</div>
          <div className="mt-2 text-sm leading-6 text-slate-300">{decision.validUntil}</div>
          <div className="mt-5 grid gap-3">
            {[
              ["Target allocation", `${decision.targetAllocationPct.toFixed(1)}%`],
              ["Target capital", formatMaybeCurrency(decision.targetCapital)],
              ["Basket spread", decision.spread == null ? "Pending" : formatPointDelta(decision.spread, " pts")],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/35 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
                <div className="mt-2 text-lg font-semibold tabular-nums text-slate-100">{value}</div>
              </div>
            ))}
          </div>
          <label className="mt-5 block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Capital Budget</span>
            <div className="mt-2 flex gap-2">
              <input
                value={budgetInput}
                onChange={(event) => setBudgetInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && budgetChanged) onBudgetChange(parsedBudget);
                }}
                inputMode="decimal"
                className="h-10 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-right text-sm font-semibold tabular-nums text-slate-100 outline-none"
                aria-label="Capital budget"
              />
              {budgetChanged && (
                <button
                  type="button"
                  onClick={() => onBudgetChange(parsedBudget)}
                  className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 text-xs font-medium text-cyan-200"
                >
                  Apply
                </button>
              )}
            </div>
          </label>
        </div>
      </div>
      <div className={cn("mt-5 rounded-lg border px-4 py-3 text-sm font-semibold", toneClasses(decision.tone))}>
        {decision.bottomLine}
      </div>
    </section>
  );
}

function EvidenceCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-4 grid gap-3">{children}</div>
    </div>
  );
}

function EvidenceRow({
  label,
  value,
  threshold,
  delta,
  tone,
}: {
  label: string;
  value: string;
  threshold: string;
  delta: string;
  tone: UserActionTone;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-200">{label}</div>
        <Badge variant="outline" className={cn(toneClasses(tone))}>{value}</Badge>
      </div>
      <div className="mt-2 text-xs leading-5 text-slate-500">{threshold}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{delta}</div>
    </div>
  );
}

function EvidenceLayer({
  decisions,
  portfolio,
  lifecycleInsight,
  dataQualityPct,
  benchmarkReturn,
  memory,
  riskMode,
  onRiskModeChange,
}: {
  decisions: ExecutionDecision[];
  portfolio: SimulatedPortfolio;
  lifecycleInsight: PortfolioLifecycleInsight;
  dataQualityPct: number;
  benchmarkReturn: number | null;
  memory: DecisionMemoryEntry[];
  riskMode: RiskMode;
  onRiskModeChange: (mode: RiskMode) => void;
}) {
  const stats = portfolioStats(portfolio);
  const previous = memory[1] ?? memory[0];
  const currentSpread = benchmarkReturn == null ? null : stats.totalReturn * 100 - benchmarkReturn;
  const previousSpread = previous ? previous.startTotalReturn * 100 : null;
  const profitFactor = stats.profitFactor === Infinity ? 9.99 : stats.profitFactor ?? 0;
  const sharpe = stats.normalizedAnnualSharpe ?? 0;
  const investable = decisions.filter((decision) => decision.suggestedAllocationPct > DISPLAY_ZERO_THRESHOLD);
  const avgQuality = mean(decisions.map((decision) => decision.qualityScore));
  const nearDrawdownLimit = stats.maxDrawdown >= 0.06;
  const nearCoverageLimit = dataQualityPct < 90;
  const noMeaningfulChange =
    previous &&
    Math.abs((currentSpread ?? 0) - (previousSpread ?? 0)) < 0.05 &&
    Math.abs(dataQualityPct - previous.dataQualityPct) < 1 &&
    lifecycleInsight.state === previous.lifecycleState;

  return (
    <InsightShell
      title="Evidence"
      eyebrow="Only decision-relevant thresholds"
      action={
        noMeaningfulChange ? (
          <Badge variant="outline" className="border-slate-700 bg-slate-900/50 text-slate-300">
            No meaningful change since last review
          </Badge>
        ) : null
      }
    >
      <div className="grid gap-4 xl:grid-cols-4">
        <EvidenceCard title="Performance">
          <EvidenceRow
            label="Profit factor"
            value={profitFactor.toFixed(2)}
            threshold="Needs 1.00 to resume, 1.25 for full size."
            delta={metricDelta(profitFactor, previous?.startProfitFactor ?? null)}
            tone={profitFactor >= 1.25 ? "good" : profitFactor >= 1 ? "info" : "bad"}
          />
          <EvidenceRow
            label="Sharpe"
            value={sharpe.toFixed(2)}
            threshold="Needs positive; +1.00 confirms full-size risk."
            delta={metricDelta(sharpe, previous?.startSharpe ?? null)}
            tone={sharpe >= 1 ? "good" : sharpe >= 0 ? "info" : "bad"}
          />
        </EvidenceCard>
        <EvidenceCard title="Risk">
          <EvidenceRow
            label="Max drawdown"
            value={`${(stats.maxDrawdown * 100).toFixed(1)}%`}
            threshold="8.0% is the hard watch limit."
            delta={metricDelta(stats.maxDrawdown * 100, previous ? previous.startDrawdown * 100 : null, "%")}
            tone={stats.maxDrawdown <= 0.04 ? "good" : nearDrawdownLimit ? "warn" : "info"}
          />
          <EvidenceRow
            label="Active exposure"
            value={`${targetAllocationPctForDecisions(decisions).toFixed(1)}%`}
            threshold={`${RISK_MODE_CONFIG[riskMode].label} caps exposure at ${RISK_MODE_CONFIG[riskMode].maxExposure}%.`}
            delta={`${investable.length} stocks currently qualify.`}
            tone={investable.length ? "info" : "bad"}
          />
        </EvidenceCard>
        <EvidenceCard title="Market Quality">
          <EvidenceRow
            label="Price coverage"
            value={`${dataQualityPct.toFixed(0)}%`}
            threshold="80% minimum, 90% preferred."
            delta={metricDelta(dataQualityPct, previous?.dataQualityPct ?? null, "%")}
            tone={dataQualityPct >= 90 ? "good" : nearCoverageLimit && dataQualityPct >= 80 ? "warn" : "bad"}
          />
          <EvidenceRow
            label="Basket spread"
            value={currentSpread == null ? "Pending" : formatPointDelta(currentSpread, " pts")}
            threshold="Strategy should not trail the basket by more than 1 point."
            delta={metricDelta(currentSpread, previousSpread, " pts")}
            tone={currentSpread == null ? "info" : currentSpread >= 0 ? "good" : currentSpread >= -1 ? "warn" : "bad"}
          />
        </EvidenceCard>
        <EvidenceCard title="Model Trust">
          <EvidenceRow
            label="Closed trades"
            value={`${stats.totalTrades}`}
            threshold="30 to review, 100 to trust directionally, 200 for full size."
            delta={previous ? `Previous call had ${previous.startClosedTrades}.` : "First reading"}
            tone={stats.totalTrades >= 200 ? "good" : stats.totalTrades >= 30 ? "info" : "warn"}
          />
          <EvidenceRow
            label="Trust state"
            value={plainLifecycleState(lifecycleInsight.state)}
            threshold="Production is required for full allocation."
            delta={previous ? `${plainLifecycleState(previous.lifecycleState)} -> ${plainLifecycleState(lifecycleInsight.state)}` : "First reading"}
            tone={lifecycleInsight.state === "PRODUCTION" ? "good" : lifecycleInsight.state === "RETIRED" ? "bad" : "warn"}
          />
        </EvidenceCard>
      </div>
      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Control Rules Active</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(RISK_MODE_CONFIG) as RiskMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onRiskModeChange(mode)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                  riskMode === mode
                    ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"
                    : "border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200",
                )}
              >
                {RISK_MODE_CONFIG[mode].label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {[
            `${RISK_MODE_CONFIG[riskMode].label}: ${RISK_MODE_CONFIG[riskMode].description}`,
            `Lifecycle cap: ${plainLifecycleState(lifecycleInsight.state)}`,
            `Quality filter: ${RISK_MODE_CONFIG[riskMode].minQuality}+ score`,
          ].map((rule) => (
            <div key={rule} className="rounded-lg border border-slate-800 bg-slate-950/45 px-3 py-2 text-sm text-slate-300">
              {rule}
            </div>
          ))}
        </div>
      </div>
    </InsightShell>
  );
}

function AppendixLayer({
  portfolio,
  decisionMemory,
  decisionAudit,
  lifecycleInsight,
}: {
  portfolio: SimulatedPortfolio;
  decisionMemory: DecisionMemoryEntry[];
  decisionAudit: PortfolioDecisionAuditEntry[];
  lifecycleInsight: PortfolioLifecycleInsight;
}) {
  const [tab, setTab] = useState<"trades" | "decisions">("trades");

  return (
    <InsightShell title="Appendix" eyebrow="Logs only">
      <Tabs value={tab} onValueChange={(value) => setTab(value as "trades" | "decisions")}>
        <TabsList className="mb-5 bg-slate-900/70">
          <TabsTrigger value="trades">Trade History</TabsTrigger>
          <TabsTrigger value="decisions">Decision History & Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="trades">
          <PortfolioPerformanceTabs portfolio={portfolio} />
        </TabsContent>
        <TabsContent value="decisions">
          <DecisionMemoryPanel
            entries={decisionMemory}
            auditEntries={decisionAudit}
            portfolio={portfolio}
            lifecycleInsight={lifecycleInsight}
          />
        </TabsContent>
      </Tabs>
    </InsightShell>
  );
}

function PortfolioDecisionSummary({
  decisions,
  portfolio,
  budget,
  lifecycleInsight,
  dataQualityPct,
  riskMode,
  onRiskModeChange,
}: {
  decisions: ExecutionDecision[];
  portfolio: SimulatedPortfolio;
  budget: number;
  lifecycleInsight: PortfolioLifecycleInsight;
  dataQualityPct: number;
  riskMode: RiskMode;
  onRiskModeChange: (mode: RiskMode) => void;
}) {
  const [showDecisionMemo, setShowDecisionMemo] = useState(() =>
    readStoredBoolean(DECISION_MEMO_STORAGE_KEY),
  );
  const stats = portfolioStats(portfolio);
  const targetAllocationPct = Math.min(
    100,
    decisions
      .filter((decision) => decision.suggestedAllocationPct > DISPLAY_ZERO_THRESHOLD)
      .reduce((sum, decision) => sum + decision.suggestedAllocationPct, 0),
  );
  const targetCapital = (budget * targetAllocationPct) / 100;
  const currentCapital = Object.values(portfolio.positions ?? {}).reduce(
    (sum, position) => sum + (position.marketValue ?? 0),
    0,
  );
  const unassigned = Math.max(0, budget - targetCapital);
  const posture = portfolioDecisionPosture(stats, lifecycleInsight, dataQualityPct, targetAllocationPct);
  const riskConfig = RISK_MODE_CONFIG[riskMode];
  const profitFactor = stats.profitFactor === Infinity ? 9.99 : stats.profitFactor ?? 0;
  const sharpe = stats.normalizedAnnualSharpe ?? 0;
  const avgQuality = mean(decisions.map((decision) => decision.qualityScore));
  const avgRisk = mean(decisions.map((decision) => decision.riskScore));
  const topCapitalDrivers = [...decisions]
    .filter((decision) => decision.suggestedAllocationPct > DISPLAY_ZERO_THRESHOLD)
    .sort((a, b) => b.suggestedAllocationPct - a.suggestedAllocationPct)
    .slice(0, 4);
  const topAllocationPct = topCapitalDrivers[0]?.suggestedAllocationPct ?? 0;
  const topTwoAllocationPct = topCapitalDrivers
    .slice(0, 2)
    .reduce((sum, decision) => sum + decision.suggestedAllocationPct, 0);
  const topAllocationShare = targetAllocationPct > 0 ? (topAllocationPct / targetAllocationPct) * 100 : 0;
  const topTwoAllocationShare = targetAllocationPct > 0 ? (topTwoAllocationPct / targetAllocationPct) * 100 : 0;
  const concentrationClear =
    targetAllocationPct < 1 ||
    (topCapitalDrivers.length >= 3 && topAllocationShare <= 35 && topTwoAllocationShare <= 60);
  const sampleTarget = riskMode === "normal" ? 200 : riskMode === "balanced" ? 100 : 30;
  const checklist = [
    {
      label: "Prices Are Usable",
      passed: dataQualityPct >= 80,
      detail: `${dataQualityPct.toFixed(0)}% coverage; 80% minimum.`,
    },
    {
      label: "Trust Allows Trading",
      passed: lifecycleInsight.state !== "RETIRED",
      detail: plainLifecycleState(lifecycleInsight.state),
    },
    {
      label: "Trade Sample Fits Size",
      passed: stats.totalTrades >= sampleTarget,
      detail: `${stats.totalTrades} closed trades; ${sampleTarget}+ for ${riskConfig.label.toLowerCase()}.`,
    },
    {
      label: "Drawdown Inside Limit",
      passed: stats.maxDrawdown <= 0.08,
      detail: `${(stats.maxDrawdown * 100).toFixed(1)}%; 8.0% limit.`,
    },
    {
      label: "Allocation Is Diversified",
      passed: concentrationClear,
      detail: targetAllocationPct >= 1
        ? `Top name ${topAllocationShare.toFixed(0)}%, top two ${topTwoAllocationShare.toFixed(0)}% of target.`
        : "No active allocation.",
    },
    {
      label: "Cash Impact Is Clear",
      passed: budget > 0 && targetCapital <= budget && Number.isFinite(targetCapital),
      detail: `${formatMaybeCurrency(targetCapital)} target, ${formatMaybeCurrency(unassigned)} unassigned.`,
    },
  ];
  const hasHardBlock =
    lifecycleInsight.state === "RETIRED" ||
    dataQualityPct < 70 ||
    stats.maxDrawdown > 0.08 ||
    targetAllocationPct < 1;
  const checklistPassed = checklist.every((item) => item.passed);
  const readiness = hasHardBlock
    ? { label: "Wait", tone: "bad" as const }
    : checklistPassed && lifecycleInsight.state === "PRODUCTION"
      ? { label: "Ready to follow", tone: "good" as const }
      : { label: "Paper trade only", tone: "warn" as const };
  const capitalUpside = [
    targetAllocationPct >= 1
      ? `Qualified setups support ${targetAllocationPct.toFixed(1)}% target exposure.`
      : "No ticker currently clears the capital filter.",
    dataQualityPct >= 90
      ? `${dataQualityPct.toFixed(0)}% of covered tickers have usable prices.`
      : null,
    avgQuality >= riskConfig.minQuality
      ? `Average setup quality is ${avgQuality.toFixed(0)}, above the ${riskConfig.minQuality} filter.`
      : null,
    lifecycleInsight.state === "PRODUCTION" || lifecycleInsight.state === "SMALL_LIVE"
      ? plainLifecycleReason(lifecycleInsight.reason)
      : null,
  ].filter((item): item is string => Boolean(item));
  const capitalRestraints = [
    stats.totalTrades < 200
      ? `Closed trade sample is ${stats.totalTrades}; 200+ supports normal sizing.`
      : null,
    sharpe < 1
      ? `Normalized annual Sharpe is ${sharpe.toFixed(2)}; +1.00 is the full-size mark.`
      : null,
    profitFactor < 1.25
      ? `Profit factor is ${profitFactor.toFixed(2)}; 1.25+ supports full size.`
      : null,
    stats.maxDrawdown > 0.08
      ? `Max drawdown is ${(stats.maxDrawdown * 100).toFixed(1)}%; the watch limit is 8.0%.`
      : null,
    dataQualityPct < 90
      ? `Price coverage is ${dataQualityPct.toFixed(0)}%; sizing improves above 90%.`
      : null,
    avgRisk > 55
      ? `Average risk score is ${avgRisk.toFixed(0)}, so capital stays selective.`
      : null,
  ].filter((item): item is string => Boolean(item));

  useEffect(() => {
    writeStoredPreference(DECISION_MEMO_STORAGE_KEY, String(showDecisionMemo));
  }, [showDecisionMemo]);

  return (
    <InsightShell
      title="Portfolio Decision"
      eyebrow="Capital to allocate right now"
      action={<Badge variant="outline" className={cn(toneClasses(posture.tone))}>{posture.label}</Badge>}
    >
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Capital Posture", posture.label],
              ["Budget", formatMaybeCurrency(budget)],
              ["Target Allocation", formatMaybeCurrency(targetCapital)],
              ["Unassigned Cash", formatMaybeCurrency(unassigned)],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
                <div className="mt-2 text-xl font-semibold tabular-nums text-slate-100">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 border-t border-slate-800 pt-4 md:grid-cols-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Main Reason</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">{plainLifecycleReason(posture.reason)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Next Review Trigger</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                {portfolioReviewTrigger(stats, lifecycleInsight, dataQualityPct)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current Capital</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                {formatMaybeCurrency(currentCapital)} currently invested. Target is {targetAllocationPct.toFixed(1)}% of budget.
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={() => setShowDecisionMemo((current) => !current)}
              aria-expanded={showDecisionMemo}
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-100"
            >
              {showDecisionMemo ? "Hide capital memo" : "Why this capital call?"}
            </button>
          </div>
          {showDecisionMemo && (
            <div className="mt-4 grid gap-3 border-t border-slate-800 pt-4 xl:grid-cols-2">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">What Supports Capital</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                  {capitalUpside.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">What Caps Capital</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                  {capitalRestraints.length ? capitalRestraints.map((item) => (
                    <div key={item}>{item}</div>
                  )) : <div>No major cap is active beyond the selected confidence filter.</div>}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Promotion Marks</div>
                <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                  {[
                    ["Closed trades", `${stats.totalTrades} / 200`],
                    ["Sharpe", `${sharpe.toFixed(2)} / 1.00`],
                    ["Profit factor", `${profitFactor.toFixed(2)} / 1.25`],
                    ["Max drawdown", `${(stats.maxDrawdown * 100).toFixed(1)}% / 8.0% max`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
                      <div className="mt-1 font-semibold tabular-nums text-slate-100">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Tickers Driving The Call</div>
                <div className="mt-3 space-y-2">
                  {topCapitalDrivers.length ? topCapitalDrivers.map((decision) => (
                    <div key={decision.signal.adaptiveId} className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm">
                      <div>
                        <div className="font-mono font-semibold text-slate-100">{cleanTicker(decision.signal.ticker)}</div>
                        <div className="text-xs text-slate-500">{plainAction(decision.actionLabel)} · quality {decision.qualityScore.toFixed(0)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold tabular-nums text-slate-100">{formatMaybeCurrency((budget * decision.suggestedAllocationPct) / 100)}</div>
                        <div className="text-xs text-slate-500">{decision.suggestedAllocationPct.toFixed(1)}%</div>
                      </div>
                    </div>
                  )) : <div className="text-sm text-slate-400">No ticker currently receives capital.</div>}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Confidence Filter</div>
              <div className="mt-2 text-sm text-slate-300">{riskConfig.description}</div>
            </div>
            <Badge variant="outline" className="border-slate-700 text-slate-300">
              {riskConfig.minQuality}+ quality
            </Badge>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {(Object.entries(RISK_MODE_CONFIG) as Array<[RiskMode, (typeof RISK_MODE_CONFIG)[RiskMode]]>).map(([mode, config]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onRiskModeChange(mode)}
                className={cn(
                  "rounded-lg border px-3 py-3 text-left transition",
                  mode === riskMode
                    ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                    : "border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-600 hover:text-slate-200",
                )}
              >
                <div className="text-sm font-semibold">{config.label}</div>
                <div className="mt-1 text-xs leading-5 opacity-80">Max {config.maxExposure}% exposure</div>
              </button>
            ))}
          </div>
          <div className="mt-4 border-t border-slate-800 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Review Checklist</div>
              <Badge variant="outline" className={cn(toneClasses(readiness.tone))}>
                {readiness.label}
              </Badge>
            </div>
            <div className="mt-3 space-y-2">
              {checklist.map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/45 px-3 py-2"
                >
                  <span
                    className={cn(
                      "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                      item.passed ? "bg-emerald-400" : "bg-amber-400",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-200">{item.label}</span>
                    <span className="block text-xs leading-5 text-slate-500">{item.detail}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className={cn("mt-3 rounded-lg border px-3 py-2 text-sm font-semibold", toneClasses(readiness.tone))}>
              {readiness.label}
            </div>
          </div>
        </div>
      </div>
    </InsightShell>
  );
}

function DecisionMemoryPanel({
  entries,
  auditEntries,
  portfolio,
  lifecycleInsight,
}: {
  entries: DecisionMemoryEntry[];
  auditEntries: PortfolioDecisionAuditEntry[];
  portfolio: SimulatedPortfolio;
  lifecycleInsight: PortfolioLifecycleInsight;
}) {
  const visibleEntries = entries.slice(0, 5);
  const judged = visibleEntries.map((entry) => ({
    entry,
    outcome: evaluateDecisionMemory(entry, portfolio, lifecycleInsight),
  }));
  const latestOutcome = judged[0]?.outcome;

  return (
    <InsightShell
      title="Decision Memory"
      eyebrow="Has following this helped?"
      action={
        latestOutcome ? (
          <Badge variant="outline" className={cn(toneClasses(latestOutcome.tone))}>
            Latest {latestOutcome.label}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-slate-700 text-slate-300">
            Recording
          </Badge>
        )
      }
    >
      {judged.length ? (
        <div className="grid gap-3">
          {judged.map(({ entry, outcome }) => (
            <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn(toneClasses(entry.tone))}>
                      {entry.readiness}
                    </Badge>
                    <Badge variant="outline" className={cn(toneClasses(outcome.tone))}>
                      {outcome.label}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {formatDuration(Date.now() - entry.recordedAt)} ago
                    </span>
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-300">
                    Recommended <span className="font-semibold text-slate-100">{entry.recommendation}</span>{" "}
                    with {entry.confidenceFilterLabel.toLowerCase()} filter,{" "}
                    {formatMaybeCurrency(entry.targetCapital)} target capital, and{" "}
                    {plainLifecycleState(entry.lifecycleState).toLowerCase()} trust.
                  </div>
                </div>
                <div className="grid min-w-[240px] grid-cols-3 gap-2 text-right">
                  {[
                    ["Return", `${outcome.returnChange >= 0 ? "+" : ""}${outcome.returnChange.toFixed(2)} pts`],
                    ["Trades", `+${Math.max(0, outcome.closedTradeChange)}`],
                    ["Trust", outcome.trust],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-100">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {entry.topTickers.length ? entry.topTickers.map((ticker) => (
                  <span
                    key={`${entry.id}:${ticker.ticker}`}
                    className="rounded-full border border-slate-700 bg-slate-950/50 px-2.5 py-1 text-xs text-slate-300"
                  >
                    {ticker.ticker} {ticker.allocationPct.toFixed(1)}%
                  </span>
                )) : (
                  <span className="rounded-full border border-slate-700 bg-slate-950/50 px-2.5 py-1 text-xs text-slate-400">
                    No ticker received capital
                  </span>
                )}
              </div>
            </div>
          ))}
          <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Decision Audit
            </div>
            <div className="mt-3 divide-y divide-slate-800">
              {auditEntries.slice(0, 5).length ? auditEntries.slice(0, 5).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <div>
                    <div className="font-medium text-slate-200">
                      {entry.eventType === "recorded" ? "Capital call recorded" : "Outcome checked"}
                    </div>
                    <div className="text-xs text-slate-500">{entry.decisionId ?? entry.market}</div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {formatDuration(Date.now() - entry.timestamp)} ago
                  </div>
                </div>
              )) : (
                <div className="py-2 text-sm text-slate-400">
                  Audit events will appear after the first durable decision record.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4 text-sm text-slate-400">
          The next portfolio call will be recorded here and judged against later results.
        </div>
      )}
    </InsightShell>
  );
}

function PortfolioPerformanceTabs({ portfolio }: { portfolio: SimulatedPortfolio }) {
  const [tab, setTab] = useState<"chart" | "history" | "stats">("chart");
  const [tradePage, setTradePage] = useState(1);
  const [tradePageSize, setTradePageSize] = useState(10);
  const history = buildPortfolioReturnHistory(portfolio);
  const trades = buildTradeRows(portfolio);
  const stats = portfolioStats(portfolio);
  const tradePageCount = Math.max(1, Math.ceil(trades.length / tradePageSize));
  const boundedTradePage = Math.min(tradePage, tradePageCount);
  const visibleTrades = trades.slice(
    (boundedTradePage - 1) * tradePageSize,
    boundedTradePage * tradePageSize,
  );
  const baseline = portfolio.startValue ?? STARTING_PORTFOLIO_VALUE;
  const chartRows = history.map((point) => ({
    t: point.t,
    r: baseline > 0 ? ((point.v - baseline) / baseline) * 100 : 0,
  }));
  const lastReturn = chartRows[chartRows.length - 1]?.r ?? 0;
  const trainingActive =
    SIMULATED_EXECUTIONS_ENABLED &&
    (portfolio.valueHistory.length > 0 || Object.keys(portfolio.positions).length > 0);
  const lifecycleInsight = portfolioLifecycleInsight(stats, trainingActive);
  const strokeColor = lastReturn >= 0 ? "hsl(158 64% 52%)" : "hsl(348 83% 60%)";
  const gradientId = lastReturn >= 0 ? "compoundedReturnsUp" : "compoundedReturnsDown";
  const formatDate = (timestamp: number) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(timestamp);
  const money = (value: number | undefined) => formatMaybeCurrency(value);

  useEffect(() => {
    setTradePage(1);
  }, [tradePageSize, trades.length]);

  return (
    <InsightShell
      title="Portfolio Results"
      eyebrow="Return, trade count, and drawdown"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-slate-700 text-slate-300">
            {lastReturn >= 0 ? "+" : ""}{lastReturn.toFixed(2)}%
          </Badge>
          <Badge variant="outline" className="border-slate-700 text-slate-300">
            Budget {formatMaybeCurrency(portfolio.startValue)}
          </Badge>
          <Badge
            variant="outline"
            className={cn(lifecycleInsight.className)}
            title={`Strategy trust: ${plainLifecycleState(lifecycleInsight.state)}. ${plainLifecycleReason(lifecycleInsight.reason)}`}
          >
            {lifecycleInsight.label}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              trainingActive
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-slate-700 bg-slate-900/50 text-slate-400",
            )}
          >
            {trainingActive ? "Trade Learning Active" : "Trade Learning Idle"}
          </Badge>
        </div>
      }
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as "chart" | "history" | "stats")}>
        <TabsList className="mb-5 bg-slate-900/70">
          <TabsTrigger value="chart">Growth</TabsTrigger>
          <TabsTrigger value="history">Trades</TabsTrigger>
          <TabsTrigger value="stats">Risk Review</TabsTrigger>
        </TabsList>

        <TabsContent value="chart">
          {chartRows.length >= 2 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={strokeColor} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    scale="time"
                    tickFormatter={(value) => formatDate(Number(value)).split(",")[0]}
                    tick={{ fontSize: 10, fill: "rgb(100 116 139)" }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={48}
                  />
                  <YAxis hide domain={["auto", "auto"]} />
                  <ReferenceLine y={0} stroke="rgb(51 65 85)" strokeDasharray="4 4" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as { t: number; r: number };
                      return (
                        <div className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 shadow-xl">
                          <div className="font-semibold">{row.r >= 0 ? "+" : ""}{row.r.toFixed(2)}%</div>
                          <div className="text-slate-500">{formatDate(row.t)}</div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="r"
                    stroke={strokeColor}
                    strokeWidth={2.5}
                    fill={`url(#${gradientId})`}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6 text-sm text-slate-400">
              Returns will appear after the first portfolio valuation.
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          {trades.length ? (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <select
                  value={tradePageSize}
                  onChange={(event) => setTradePageSize(Number(event.target.value))}
                  className="h-8 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-300 outline-none"
                >
                  {[10, 25, 50].map((size) => (
                    <option key={size} value={size}>
                      {size} lines
                    </option>
                  ))}
                </select>
                <Badge variant="outline" className="border-slate-700 text-slate-300">
                  {(boundedTradePage - 1) * tradePageSize + 1}-{Math.min(boundedTradePage * tradePageSize, trades.length)} of {trades.length}
                </Badge>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full min-w-[840px] text-sm">
                  <thead className="bg-slate-950/95 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      {["Ticker", "Units", "Entry Price", "Exit Price", "P/L", "Opened", "Status"].map((label) => (
                        <th key={label} className="px-4 py-3 text-left font-semibold last:text-right">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {visibleTrades.map((trade, index) => (
                      <tr key={`${trade.ticker}-${trade.status}-${boundedTradePage}-${index}`} className="bg-slate-900/25">
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-slate-800 px-2.5 py-1 font-mono text-xs font-semibold text-slate-100">
                            {cleanTicker(trade.ticker)}
                          </span>
                          <span className="ml-2 hidden text-xs text-slate-500 md:inline">{trade.name}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{formatQuantity(trade.quantity)}</td>
                        <td className="px-4 py-3 text-slate-300">{money(trade.entryPrice)}</td>
                        <td className="px-4 py-3 text-slate-300">{trade.exitPrice != null ? money(trade.exitPrice) : "Active"}</td>
                        <td className={cn("px-4 py-3 font-semibold", trade.pnl >= 0 ? "text-emerald-300" : "text-rose-300")}>
                          {trade.pnl >= 0 ? "+" : ""}{money(trade.pnl)} ({(trade.pnlPct * 100).toFixed(1)}%)
                        </td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(trade.openedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn("rounded-full px-2 py-1 text-xs", trade.status === "Open" ? "bg-emerald-400/15 text-emerald-300" : "bg-slate-800 text-slate-300")}>
                            {plainTradeStatus(trade.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTradePage((current) => Math.max(1, current - 1))}
                  disabled={boundedTradePage <= 1}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-500">
                  Page {boundedTradePage} / {tradePageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setTradePage((current) => Math.min(tradePageCount, current + 1))}
                  disabled={boundedTradePage >= tradePageCount}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6 text-sm text-slate-400">
              Trade history will appear once the portfolio opens positions.
            </div>
          )}
        </TabsContent>

        <TabsContent value="stats">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Total Return", `${stats.totalReturn >= 0 ? "+" : ""}${(stats.totalReturn * 100).toFixed(2)}%`, stats.totalReturn >= 0],
              ["Winner / Loser Balance", stats.profitFactor == null ? "—" : stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2), stats.profitFactor == null ? null : stats.profitFactor >= 1],
              ["Risk-Adjusted Return", stats.normalizedAnnualSharpe == null ? "—" : stats.normalizedAnnualSharpe.toFixed(2), stats.normalizedAnnualSharpe == null ? null : stats.normalizedAnnualSharpe >= 1],
              ["Largest Pullback", `${(stats.maxDrawdown * 100).toFixed(1)}%`, stats.maxDrawdown === 0 ? null : false],
              ["Closed Trades", String(stats.totalTrades), null],
              ["Avg. Holding Time", formatDuration(stats.averageDurationMs), null],
            ].map(([label, value, positive]) => (
              <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
                <div className={cn("mt-2 text-2xl font-semibold tabular-nums", positive == null ? "text-slate-100" : positive ? "text-emerald-300" : "text-rose-300")}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </InsightShell>
  );
}

export default function Dashboard() {
  const [markets, setMarkets] = useState<MarketOption[]>([]);
  const [selectedMarket, setSelectedMarket] = useState(() =>
    readStoredString(SELECTED_MARKET_STORAGE_KEY, "BINANCE"),
  );
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | undefined>();
  const [riskMode, setRiskMode] = useState<RiskMode>(readStoredRiskMode);
  const [syncTotal, setSyncTotal] = useState(0);
  const [syncAttempted, setSyncAttempted] = useState(0);
  const [syncUnavailable, setSyncUnavailable] = useState(0);
  const [portfolioBudgets, setPortfolioBudgets] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(PORTFOLIO_BUDGET_STORAGE_KEY);
      return saved ? normalizeBudgetMap(JSON.parse(saved)) : {};
    } catch {
      return {};
    }
  });
  const [decisionMemory, setDecisionMemory] = useState<DecisionMemoryEntry[]>(readDecisionMemory);
  const [decisionAudit, setDecisionAudit] = useState<PortfolioDecisionAuditEntry[]>([]);
  const [simulatedPortfolios, setSimulatedPortfolios] = useState<Record<string, SimulatedPortfolio>>(() => {
    try {
      clearSignalMarketsStorageForFreshStart();
      if (!SIMULATED_EXECUTIONS_ENABLED) {
        clearPortfolioStorage();
        return {};
      }
      const saved = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
      return saved ? normalizePortfolioStorage(JSON.parse(saved)) : {};
    } catch {
      return {};
    }
  });

  const activeBudget = portfolioBudgets[selectedMarket] ?? STARTING_PORTFOLIO_VALUE;
  const activeSimulatedPortfolio =
    simulatedPortfolios[selectedMarket] ?? createEmptyPortfolio(activeBudget);
  const activeDecisionMemory = useMemo(
    () => decisionMemory.filter((entry) => entry.market === selectedMarket),
    [decisionMemory, selectedMarket],
  );
  const activeDecisionAudit = useMemo(
    () => decisionAudit.filter((entry) => entry.market === selectedMarket),
    [decisionAudit, selectedMarket],
  );
  const activePortfolioTrainingActive =
    SIMULATED_EXECUTIONS_ENABLED &&
    (stocks.length > 0 ||
      activeSimulatedPortfolio.valueHistory.length > 0 ||
      Object.keys(activeSimulatedPortfolio.positions).length > 0);
  const activePortfolioLifecycleInsight = useMemo(
    () => portfolioLifecycleInsight(
      portfolioStats(activeSimulatedPortfolio),
      activePortfolioTrainingActive,
    ),
    [activePortfolioTrainingActive, activeSimulatedPortfolio],
  );

  function applyPortfolioBudget(nextBudget: number) {
    if (!selectedMarket || !Number.isFinite(nextBudget) || nextBudget <= 0) return;
    const currentBudget = portfolioBudgets[selectedMarket] ?? STARTING_PORTFOLIO_VALUE;
    if (Math.abs(nextBudget - currentBudget) < 0.01) return;

    const existing = simulatedPortfolios[selectedMarket];
    const hasHistory = Boolean(
      existing &&
      (Object.keys(existing.positions ?? {}).length ||
        (existing.closedPositions ?? []).length ||
        (existing.valueHistory ?? []).length),
    );
    if (
      hasHistory &&
      typeof window !== "undefined" &&
      !window.confirm("Changing the capital budget starts a new paper portfolio for this market. Continue?")
    ) {
      return;
    }

    setPortfolioBudgets((current) => ({
      ...current,
      [selectedMarket]: nextBudget,
    }));
    setSimulatedPortfolios((current) => ({
      ...current,
      [selectedMarket]: createEmptyPortfolio(nextBudget),
    }));
  }

  const adaptiveSignals = useMemo(
    () => stocks.map((stock) => deriveAdaptiveSignal(stock, Date.now())),
    [stocks],
  );

  const calibrationState = useMemo(
    () => calibrationStateFromSignals(adaptiveSignals),
    [adaptiveSignals],
  );

  const executionDecisions = useMemo(
    () => buildExecutionDecisions(
      adaptiveSignals,
      activeSimulatedPortfolio,
      calibrationState,
      activePortfolioLifecycleInsight,
      riskMode,
    ),
    [
      adaptiveSignals,
      activeSimulatedPortfolio,
      calibrationState,
      activePortfolioLifecycleInsight,
      riskMode,
    ],
  );

  const allocationDecisions = useMemo(
    () => buildExecutionDecisions(
      adaptiveSignals,
      createEmptyPortfolio(),
      calibrationState,
      activePortfolioLifecycleInsight,
      riskMode,
    ),
    [adaptiveSignals, calibrationState, activePortfolioLifecycleInsight, riskMode],
  );

  const priorityCandidates = useMemo(
    () => priorityAllocationCandidates(allocationDecisions),
    [allocationDecisions],
  );
  const benchmarkReturn = useMemo(
    () => benchmarkReturnFromCoverage(stocks),
    [stocks],
  );
  const availableQuoteCount = stocks.filter(
    (stock) => stock.quoteStatus !== "unavailable" && Number(stock.price) > 0,
  ).length;
  const dataQualityPct = syncAttempted
    ? ((syncAttempted - syncUnavailable) / Math.max(1, syncAttempted)) * 100
    : stocks.length
      ? (availableQuoteCount / Math.max(1, stocks.length)) * 100
      : 0;
  const canonicalDecision = useMemo(
    () => buildCanonicalDecision({
      decisions: executionDecisions,
      portfolio: activeSimulatedPortfolio,
      budget: activeBudget,
      lifecycleInsight: activePortfolioLifecycleInsight,
      dataQualityPct,
      riskMode,
      benchmarkReturn,
      memory: activeDecisionMemory,
    }),
    [
      activeBudget,
      activeDecisionMemory,
      activePortfolioLifecycleInsight,
      activeSimulatedPortfolio,
      benchmarkReturn,
      dataQualityPct,
      executionDecisions,
      riskMode,
    ],
  );

  const selectedMarketStatus = getMarketStatus(selectedMarket);
  const lastSyncedLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
    : loading
      ? "reviewing"
      : "pending";

  const intelligenceMetrics = useMemo(
    () => ({
      drift: mean(adaptiveSignals.map((signal) => signal.driftScore)),
      entropy: mean(adaptiveSignals.map((signal) => signal.entropy)),
      ensemble: mean(adaptiveSignals.map((signal) => signal.ensembleAgreement * 100)),
      calibration: mean(executionDecisions.map((decision) => decision.calibrationScore)),
      regimeStability: mean(adaptiveSignals.map((signal) => signal.stabilityScore)),
      modelStability: mean(adaptiveSignals.map((signal) => 100 - signal.predictionResidual)),
      survival: mean(executionDecisions.map((decision) => decision.survivalProbability)),
      residual: mean(adaptiveSignals.map((signal) => signal.predictionResidual)),
    }),
    [adaptiveSignals, executionDecisions],
  );

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true);

        const marketResponse = await fetchMarkets();

        if (Array.isArray(marketResponse)) {
          setMarkets(marketResponse);

          const savedMarket = readStoredString(SELECTED_MARKET_STORAGE_KEY, selectedMarket);
          const saved = marketResponse.find((market) => market.code === savedMarket);
          const preferred = marketResponse.find(
            (m) =>
              m.code.toUpperCase() === "BINANCE",
          );

          if (saved || preferred) {
            setSelectedMarket((saved ?? preferred)!.code);
          }
        }
      } catch (err) {
        console.error("Failed loading markets", err);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMarketData() {
      if (!selectedMarket) return;

      try {
        const cachedMarketData = readMarketDataCache(selectedMarket);
        if (cachedMarketData) {
          setStocks(cachedMarketData.stocks);
          setSelectedTicker(
            cachedMarketData.selectedTicker ?? cachedMarketData.stocks[0]?.ticker,
          );
          setLastSyncedAt(cachedMarketData.lastSyncedAt);
          setSyncTotal(cachedMarketData.syncTotal);
          setSyncAttempted(cachedMarketData.syncAttempted);
          setSyncUnavailable(cachedMarketData.syncUnavailable);
          setLoading(false);
        } else {
          setLoading(true);
          setStocks([]);
          setSelectedTicker(undefined);
          setLastSyncedAt(null);
          setSyncTotal(0);
          setSyncAttempted(0);
          setSyncUnavailable(0);
        }

        setRefreshError(null);

        let offset = 0;
        let total = 0;
        const listItems: StockListItem[] = [];

        do {
          const stockList = await fetchStockList(
            selectedMarket,
            offset,
            STOCK_LIST_PAGE_SIZE,
          );
          if (cancelled) return;

          const pageItems = Array.isArray(stockList.items) ? stockList.items : [];
          total = stockList.total;
          if (!pageItems.length) break;
          listItems.push(...pageItems);
          offset += pageItems.length;
        } while (offset < total && listItems.length < total);

        const symbols = Array.from(new Set(listItems
          .map((stock) => stock.symbol)
          .filter(Boolean)));
        const stockBySymbol = new Map(listItems.map((stock) => [stock.symbol, stock]));
        setSyncTotal(symbols.length);
        setSyncAttempted(0);
        setSyncUnavailable(0);
        setLoading(false);
        let attemptedCount = 0;
        let unavailableCount = 0;
        let latestSyncedAt = cachedMarketData?.lastSyncedAt ?? null;

        for (let index = 0; index < symbols.length; index += QUOTE_REQUEST_SYMBOL_BATCH_SIZE) {
          if (cancelled) return;
          const batchSymbols = symbols.slice(index, index + QUOTE_REQUEST_SYMBOL_BATCH_SIZE);
          const {
            cachedQuotes,
            cachedUnavailableSymbols,
            uncachedSymbols,
          } = readLiveQuoteCache(selectedMarket, batchSymbols);

          if (cachedQuotes.length) {
            setStocks((current) => {
              const next = mergeStockQuotes(current, cachedQuotes, stockBySymbol, selectedMarket);
              latestSyncedAt = Date.now();
              writeMarketDataCache(selectedMarket, {
                stocks: next,
                selectedTicker: cachedQuotes[0]?.symbol ?? next[0]?.ticker,
                lastSyncedAt: latestSyncedAt,
                syncTotal: symbols.length,
                syncAttempted: attemptedCount + cachedQuotes.length + cachedUnavailableSymbols.length,
                syncUnavailable: unavailableCount + cachedUnavailableSymbols.length,
              });
              return next;
            },
            );
            setSelectedTicker((current) => current ?? cachedQuotes[0]?.symbol);
            setLastSyncedAt(latestSyncedAt);
          }

          if (cachedQuotes.length || cachedUnavailableSymbols.length) {
            attemptedCount += cachedQuotes.length + cachedUnavailableSymbols.length;
            unavailableCount += cachedUnavailableSymbols.length;
            setSyncAttempted((current) =>
              current + cachedQuotes.length + cachedUnavailableSymbols.length,
            );
            setSyncUnavailable((current) => current + cachedUnavailableSymbols.length);
          }

          if (!uncachedSymbols.length) continue;

          const quoteBatch = await fetchStockQuoteBatch(selectedMarket, uncachedSymbols, {
            withSignals: true,
            timeoutMs: QUOTE_REQUEST_TIMEOUT_MS,
            retryCount: 0,
          });
          if (cancelled) return;

          cacheLiveQuotes(selectedMarket, quoteBatch.quotes);
          const deferredSymbols = new Set(quoteBatch.deferredSymbols ?? []);
          const terminalUnavailableSymbols = quoteBatch.unavailableSymbols.filter(
            (symbol) => !deferredSymbols.has(symbol),
          );
          cacheUnavailableLiveQuotes(selectedMarket, terminalUnavailableSymbols);

          setStocks((current) => {
            const next = mergeStockQuotes(current, quoteBatch.quotes, stockBySymbol, selectedMarket);
            if (quoteBatch.quotes.length) latestSyncedAt = Date.now();
            writeMarketDataCache(selectedMarket, {
              stocks: next,
              selectedTicker: quoteBatch.quotes[0]?.symbol ?? next[0]?.ticker,
              lastSyncedAt: latestSyncedAt,
              syncTotal: symbols.length,
              syncAttempted: attemptedCount + quoteBatch.quotes.length + terminalUnavailableSymbols.length,
              syncUnavailable: unavailableCount + terminalUnavailableSymbols.length,
            });
            return next;
          },
          );
          setSelectedTicker((current) => current ?? quoteBatch.quotes[0]?.symbol);
          attemptedCount += quoteBatch.quotes.length + terminalUnavailableSymbols.length;
          unavailableCount += terminalUnavailableSymbols.length;
          setSyncAttempted((current) =>
            current + quoteBatch.quotes.length + terminalUnavailableSymbols.length,
          );
          setSyncUnavailable((current) => current + terminalUnavailableSymbols.length);
          if (quoteBatch.quotes.length) {
            setLastSyncedAt(latestSyncedAt);
          }

          if (QUOTE_BATCH_DELAY_MS > 0 && index + QUOTE_REQUEST_SYMBOL_BATCH_SIZE < symbols.length) {
            await new Promise((resolve) => setTimeout(resolve, QUOTE_BATCH_DELAY_MS));
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed loading market data", err);
        setRefreshError(describeRefreshError(err));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMarketData();

    return () => {
      cancelled = true;
    };
  }, [selectedMarket]);

  useEffect(() => {
    if (selectedMarket) writeStoredPreference(SELECTED_MARKET_STORAGE_KEY, selectedMarket);
  }, [selectedMarket]);

  useEffect(() => {
    writeStoredPreference(RISK_MODE_STORAGE_KEY, riskMode);
  }, [riskMode]);

  useEffect(() => {
    if (!selectedMarket) return;
    let cancelled = false;
    Promise.all([
      fetchPortfolioDecisionMemory(selectedMarket, DECISION_MEMORY_LIMIT),
      fetchPortfolioDecisionAudit(selectedMarket, DECISION_MEMORY_LIMIT),
    ])
      .then(([entries, auditEntries]) => {
        if (cancelled) return;
        setDecisionMemory((current) =>
          normalizeDecisionMemory([...(entries as unknown[]), ...current]),
        );
        setDecisionAudit(auditEntries);
      })
      .catch(() => {
        // Local decision memory remains available when the backend is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMarket]);

  useEffect(() => {
    if (loading || !selectedMarket || !executionDecisions.length || syncAttempted === 0) return;
    const entry = buildDecisionMemoryEntry({
      market: selectedMarket,
      decisions: executionDecisions,
      portfolio: activeSimulatedPortfolio,
      budget: activeBudget,
      lifecycleInsight: activePortfolioLifecycleInsight,
      dataQualityPct,
      riskMode,
    });

    setDecisionMemory((current) => {
      const normalized = normalizeDecisionMemory(current);
      const latestForMarket = normalized.find((item) => item.market === selectedMarket);
      if (latestForMarket?.signature === entry.signature) return current;
      void recordPortfolioDecisionMemory(entry)
        .then(() => fetchPortfolioDecisionAudit(selectedMarket, DECISION_MEMORY_LIMIT))
        .then(setDecisionAudit)
        .catch(() => {
          // The local copy remains auditable in this browser if persistence is unavailable.
        });
      return normalizeDecisionMemory([entry, ...normalized]);
    });
  }, [
    activeBudget,
    activePortfolioLifecycleInsight,
    activeSimulatedPortfolio,
    dataQualityPct,
    executionDecisions,
    loading,
    riskMode,
    selectedMarket,
    syncAttempted,
  ]);

  useEffect(() => {
    writeDecisionMemory(decisionMemory);
  }, [decisionMemory]);

  useEffect(() => {
    if (loading || !selectedMarket || !activeDecisionMemory.length || syncAttempted === 0) return;
    const stats = portfolioStats(activeSimulatedPortfolio);
    reviewPortfolioDecisionOutcomes({
      market: selectedMarket,
      evaluatedAt: Date.now(),
      currentPortfolioValue: stats.currentValue,
      currentTotalReturn: stats.totalReturn,
      currentSharpe: stats.normalizedAnnualSharpe,
      currentProfitFactor: stats.profitFactor === Infinity ? 9.99 : stats.profitFactor,
      currentClosedTrades: stats.totalTrades,
      currentDrawdown: stats.maxDrawdown,
      lifecycleState: activePortfolioLifecycleInsight.state,
      lifecycleLabel: plainLifecycleState(activePortfolioLifecycleInsight.state),
    })
      .then(async (result) => {
        setDecisionMemory((current) =>
          normalizeDecisionMemory([...(result.entries as unknown[]), ...current]),
        );
        setDecisionAudit(await fetchPortfolioDecisionAudit(selectedMarket, DECISION_MEMORY_LIMIT));
      })
      .catch(() => {
        // Outcome checks are retried on the next refresh when the backend is available.
      });
  }, [
    activeDecisionMemory.length,
    activePortfolioLifecycleInsight,
    activeSimulatedPortfolio,
    loading,
    selectedMarket,
    syncAttempted,
  ]);

  useEffect(() => {
    if (!SIMULATED_EXECUTIONS_ENABLED) {
      clearPortfolioStorage();
      return;
    }

    try {
      localStorage.setItem(
        PORTFOLIO_STORAGE_KEY,
        JSON.stringify(normalizePortfolioStorage(simulatedPortfolios)),
      );
    } catch {
      // Ignore storage failures in private browsing or restricted previews.
    }
  }, [simulatedPortfolios]);

  useEffect(() => {
    try {
      localStorage.setItem(
        PORTFOLIO_BUDGET_STORAGE_KEY,
        JSON.stringify(normalizeBudgetMap(portfolioBudgets)),
      );
    } catch {
      // Ignore storage failures in private browsing or restricted previews.
    }
  }, [portfolioBudgets]);

  useEffect(() => {
    if (!SIMULATED_EXECUTIONS_ENABLED) {
      setSimulatedPortfolios((current) =>
        Object.keys(current).length ? {} : current,
      );
      return;
    }
    if (!selectedMarket || !stocks.length || selectedMarketStatus !== "Open") return;

    setSimulatedPortfolios((current) => {
      const existing = current[selectedMarket];
      const now = Date.now();
      const liveByTicker = new Map(stocks.map((stock) => [stock.ticker, stock]));
      const actionable = allocationDecisions
        .filter((decision) => decision.suggestedAllocationPct > 0 && decision.actionLabel !== "Avoid" && decision.actionLabel !== "Reduce")
        .slice(0, 40);
      const rawSuggestedExposure = actionable.reduce((sum, decision) => sum + decision.suggestedAllocationPct, 0);
      const scale =
        rawSuggestedExposure > 100
          ? 100 / rawSuggestedExposure
          : 1;
      const targetByTicker = new Map(
        actionable.map((decision) => [
          decision.signal.ticker,
          {
            stock: liveByTicker.get(decision.signal.ticker) ?? decision.signal,
            targetPct: Math.min(100, Math.max(0, decision.suggestedAllocationPct * scale)),
          },
        ]),
      );

      let cash = existing?.cash ?? activeBudget;
      const positions: Record<string, SimulatedPosition> = {};
      const closedPositions = [...(existing?.closedPositions ?? [])];

      function closePosition(ticker: string, position: SimulatedPosition, liveStock: StockData | undefined, quantity = position.quantity) {
        const exitPrice = resolvePositionBid(liveStock, position);
        const closeQuantity = Math.min(position.quantity, Math.max(0, quantity));
        if (closeQuantity <= 0) return 0;
        const proceeds = closeQuantity * exitPrice;
        const investedAmount = position.quantity > 0
          ? position.investedAmount * (closeQuantity / position.quantity)
          : position.investedAmount;
        cash += proceeds;
        const closedCandidate: ClosedPosition = {
          ticker,
          name: (liveStock ?? position).name,
          quantity: closeQuantity,
          entryPrice: position.entryPrice,
          exitPrice,
          investedAmount,
          proceeds,
          openedAt: position.openedAt,
          closedAt: now,
          entrySignalKey: position.entrySignalKey,
        };
        if (
          closeQuantity > 0 &&
          !closedPositions.some(
            (item) =>
              closedPositionFingerprint(item) === closedPositionFingerprint(closedCandidate),
          )
        ) {
          closedPositions.push(closedCandidate);
        }
        return proceeds;
      }

      for (const [ticker, position] of Object.entries(existing?.positions ?? {})) {
        const liveStock = liveByTicker.get(ticker);
        const target = targetByTicker.get(ticker);
        if (!target || !liveStock) {
          closePosition(ticker, position, liveStock);
          continue;
        }

        const bid = resolvePositionBid(liveStock, position);
        positions[ticker] = {
          ...position,
          ...liveStock,
          quantity: position.quantity,
          entryPrice: position.entryPrice,
          investedAmount: position.investedAmount,
          targetWeight: target.targetPct / 100,
          openedAt: position.openedAt,
          entrySignalKey: position.entrySignalKey,
          marketValue: position.quantity * bid,
        };
      }

      const markedValue = Object.values(positions).reduce(
        (sum, position) => sum + position.marketValue,
        0,
      );
      const totalValue = Math.max(0, cash) + markedValue;

      for (const [ticker, position] of Object.entries({ ...positions })) {
        const target = targetByTicker.get(ticker);
        const liveStock = liveByTicker.get(ticker) ?? target?.stock;
        const targetValue = totalValue * ((target?.targetPct ?? 0) / 100);
        if (!target || !liveStock || targetValue < 1) {
          closePosition(ticker, position, liveStock);
          delete positions[ticker];
          continue;
        }

        const bid = resolvePositionBid(liveStock, position);
        const currentValue = position.quantity * bid;
        if (currentValue <= targetValue) continue;

        const sellValue = currentValue - targetValue;
        const sellQuantity = Math.min(position.quantity, sellValue / Math.max(bid, 0.0001));
        closePosition(ticker, position, liveStock, sellQuantity);
        const remainingQuantity = Math.max(0, position.quantity - sellQuantity);
        if (remainingQuantity <= 0.000001) {
          delete positions[ticker];
        } else {
          const remainingRatio = remainingQuantity / position.quantity;
          positions[ticker] = {
            ...position,
            quantity: Number(remainingQuantity.toFixed(6)),
            investedAmount: position.investedAmount * remainingRatio,
            marketValue: remainingQuantity * bid,
            targetWeight: target.targetPct / 100,
          };
        }
      }

      for (const decision of actionable) {
        const ticker = decision.signal.ticker;
        const target = targetByTicker.get(ticker);
        const stock = target?.stock;
        if (!target || !stock) continue;
        const price = Number(stock.price) || 0;
        const ask = Number.isFinite(stock.ask) && stock.ask! > 0 ? Number(stock.ask) : price;
        const bid = liveBidFor(stock);
        const current = positions[ticker];
        const currentValue = current ? current.quantity * bid : 0;
        const targetValue = totalValue * (target.targetPct / 100);
        const buyValue = Math.min(Math.max(0, targetValue - currentValue), cash);
        if (buyValue < 1 || ask <= 0) continue;

        const addedQuantity = Number((buyValue / ask).toFixed(6));
        if (addedQuantity <= 0) continue;
        cash -= addedQuantity * ask;

        if (current) {
          const quantity = current.quantity + addedQuantity;
          const investedAmount = current.investedAmount + addedQuantity * ask;
          positions[ticker] = {
            ...current,
            ...stock,
            quantity,
            entryPrice: investedAmount / Math.max(quantity, 0.0001),
            investedAmount,
            targetWeight: target.targetPct / 100,
            openedAt: current.openedAt,
            entrySignalKey: current.entrySignalKey,
            marketValue: quantity * bid,
          };
        } else {
          positions[ticker] = {
            ...stock,
            quantity: addedQuantity,
            entryPrice: ask,
            investedAmount: addedQuantity * ask,
            marketValue: addedQuantity * bid,
            targetWeight: target.targetPct / 100,
            openedAt: now,
            entrySignalKey: signalEntryKey(stock),
          };
        }
      }

      const positionValue = Object.values(positions).reduce(
        (sum, position) => sum + position.marketValue,
        0,
      );
      Object.values(positions).forEach((position) => {
        const target = targetByTicker.get(position.ticker);
        position.targetWeight = target ? target.targetPct / 100 : 0;
      });
      const value = Math.max(0, cash) + positionValue;

      return {
        ...current,
        [selectedMarket]: {
          startedAt: existing?.startedAt ?? now,
          startValue: existing?.startValue ?? activeBudget,
          cash: Math.max(0, cash),
          positions,
          valueHistory: [...(existing?.valueHistory ?? []).slice(-239), { t: now, v: value }],
          closedPositions: dedupeClosedPositions(closedPositions),
        },
      };
    });
  }, [activeBudget, allocationDecisions, selectedMarket, selectedMarketStatus, stocks]);

  useEffect(() => {
    if (!selectedMarket || loading || syncAttempted === 0) return;
    const storage = cacheStorage();
    if (!storage) return;

    const key = priorityCandidatesStorageKey(selectedMarket);
    const nextSignature = serializePriorityCandidates(priorityCandidates);
    let previousSignature: string | null = null;
    try {
      previousSignature = storage.getItem(key);
    } catch {
      previousSignature = null;
    }

    if (previousSignature && previousSignature !== nextSignature) {
      const previous = parsePriorityCandidates(previousSignature);
      const next = parsePriorityCandidates(nextSignature);
      const body = describePriorityCandidateChange(previous, next);

      if (body) {
        void sendPriorityAllocationNotification(selectedMarket, body);
        toast({
          title: "Top ideas changed",
          description: body,
        });
      }
    }

    try {
      storage.setItem(key, nextSignature);
    } catch {
      // Notification dedupe is best-effort when browser storage is restricted.
    }
  }, [loading, priorityCandidates, selectedMarket, syncAttempted]);
  return (
    <main className="min-h-screen bg-[#020817] text-slate-100">
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
              Stocks Capital Desk
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
              Add, trim, hold, or wait.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Every position size is tied to closed trades, basket spread, market risk, and strategy trust.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Market List</span>
              <div className="w-[220px]">
                <select
                  value={selectedMarket}
                  onChange={(e) => setSelectedMarket(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-800 bg-[#061226] px-4 text-sm font-medium text-slate-200 outline-none transition focus:border-cyan-500"
                >
                  {markets.map((market) => (
                    <option
                      key={market.code}
                      value={market.code}
                    >
                      {market.label ?? market.code}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>
        </header>

        {refreshError && (
          <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {refreshError}
          </div>
        )}

        {!executionDecisions.length ? (
          <section className="rounded-3xl border border-slate-800 bg-[#040d1d] p-8 text-sm text-slate-400">
            {loading ? "Pricing the market list..." : "No priced tickers returned for this market list."}
          </section>
        ) : (
          <>
            <div className="mb-6">
              <DecisionSpine
                decision={canonicalDecision}
                budget={activeBudget}
                onBudgetChange={applyPortfolioBudget}
              />
            </div>

            <div className="mb-6">
              <EvidenceLayer
                decisions={executionDecisions}
                portfolio={activeSimulatedPortfolio}
                lifecycleInsight={activePortfolioLifecycleInsight}
                dataQualityPct={dataQualityPct}
                benchmarkReturn={benchmarkReturn}
                memory={activeDecisionMemory}
                riskMode={riskMode}
                onRiskModeChange={setRiskMode}
              />
            </div>

            <div className="mb-6">
              <AppendixLayer
                portfolio={activeSimulatedPortfolio}
                decisionMemory={activeDecisionMemory}
                decisionAudit={activeDecisionAudit}
                lifecycleInsight={activePortfolioLifecycleInsight}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
