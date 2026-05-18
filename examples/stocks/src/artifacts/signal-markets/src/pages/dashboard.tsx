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
  fetchSignalHistory,
  fetchMarkets,
  fetchStockList,
  fetchStockQuoteBatch,
  registerSignalWatchlist,
  type MarketOption,
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
const LIVE_QUOTE_CACHE_TTL_MS = 60_000;
const UNAVAILABLE_LIVE_QUOTE_CACHE_TTL_MS = 30_000;
const MARKET_DATA_CACHE_TTL_MS = 30 * 60_000;

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

function readMarketDataCache(market: string): CachedMarketData | null {
  try {
    const raw = sessionStorage.getItem(marketDataCacheKey(market));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedMarketData;
    if (Date.now() - cached.cachedAt > MARKET_DATA_CACHE_TTL_MS) {
      sessionStorage.removeItem(marketDataCacheKey(market));
      return null;
    }
    return Array.isArray(cached.stocks) && cached.stocks.length ? cached : null;
  } catch {
    return null;
  }
}

function writeMarketDataCache(market: string, data: Omit<CachedMarketData, "cachedAt">) {
  try {
    sessionStorage.setItem(
      marketDataCacheKey(market),
      JSON.stringify({ ...data, cachedAt: Date.now() }),
    );
  } catch {
    // Ignore storage pressure; live state still holds the latest sweep.
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
const QUOTE_REQUEST_SYMBOL_BATCH_SIZE = 30;
const QUOTE_BATCH_DELAY_MS = 100;
const QUOTE_REQUEST_TIMEOUT_MS = 240_000;
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
const PORTFOLIO_STORAGE_KEY = "signal-markets:portfolios";

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
    if (error.status === 429) return "Venue feed is rate limited. Retrying shortly.";
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

function createEmptyPortfolio(): SimulatedPortfolio {
  return {
    cash: 0,
    positions: {},
    startedAt: null,
    startValue: STARTING_PORTFOLIO_VALUE,
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

function resolveSimulatedEntryPrice(stock: StockData, currentPrice: number) {
  const signalEntryPrice = Number(stock.signalEntryPrice);
  if (
    Number.isFinite(signalEntryPrice) &&
    signalEntryPrice > 0 &&
    Math.abs(signalEntryPrice - currentPrice) / currentPrice > 0.0001
  ) {
    return signalEntryPrice;
  }

  const changePercent = Number(stock.changePercent);
  if (Number.isFinite(changePercent) && changePercent > -99.9) {
    const previousClose = currentPrice / (1 + changePercent / 100);
    if (Number.isFinite(previousClose) && previousClose > 0) {
      return previousClose;
    }
  }

  return currentPrice;
}

function returnsFromHistory(history: number[] | undefined): number[] {
  if (!history || history.length < 3) return [];

  return history
    .slice(1)
    .map((price, index) => {
      const previous = history[index];
      return previous && previous > 0 ? (price - previous) / previous : 0;
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
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
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
  const sample = downsideOnly ? returns.filter((value) => value < 0) : returns;
  const minWindow = 20;
  const sampleWeight = clampMetric(returns.length / minWindow, 0, 1);
  const avg = mean(returns);
  const volatilityFloor = 0.008;
  const volatility = Math.max(stddev(sample), volatilityFloor);
  const cappedAnnualization = Math.sqrt(Math.min(Math.max(returns.length, 1), 30));
  const raw = volatility > 0 ? (avg / volatility) * cappedAnnualization : 0;
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
  const volatilityShift = clampMetric(deviation * 1300 + absChange * 4);
  const driftScore = clampMetric(stock.driftScore ?? volatilityShift * 0.55 + (stock.quoteStatus === "unavailable" ? 35 : 0) + (stock.status === "Watch" ? 18 : 0));
  const stabilityScore = clampMetric(stock.stabilityScore ?? 100 - driftScore * 0.72 - (signalAction === "Hold" ? 8 : 0));
  const uncertainty = clampMetric(stock.uncertainty ?? 100 - confidence * 0.68 + driftScore * 0.38);
  const agreement = clampMetric(stock.ensembleAgreement != null ? stock.ensembleAgreement * 100 : confidence * 0.62 + stabilityScore * 0.32 - uncertainty * 0.12);
  const consensus = clampMetric(stock.featureConsensus != null ? stock.featureConsensus * 100 : agreement * 0.72 + stabilityScore * 0.2);
  const direction = signalAction === "Sell" ? -1 : signalAction === "Buy" ? 1 : change >= 0 ? 1 : -1;
  const expectedMovePct = Number((stock.expectedMovePct ?? direction * Math.max(absChange, deviation * 100) * (confidence / 75)).toFixed(2));
  const winReturns = returns.filter((value) => value > 0);
  const lossReturns = returns.filter((value) => value < 0);
  const hitRate = returns.length ? (winReturns.length / returns.length) * 100 : confidence * 0.55;
  const profitFactor = Math.abs(lossReturns.reduce((sum, value) => sum + value, 0)) > 0
    ? Math.abs(winReturns.reduce((sum, value) => sum + value, 0) / lossReturns.reduce((sum, value) => sum + value, 0))
    : winReturns.length ? 3 : 1;
  const maxDrawdown = Math.max(0, ...returns.map((_, index) => {
    const slice = returns.slice(0, index + 1);
    const cumulative = slice.reduce((value, item) => value * (1 + item), 1);
    const peak = Math.max(1, ...slice.map((__, peakIndex) => slice.slice(0, peakIndex + 1).reduce((value, item) => value * (1 + item), 1)));
    return ((peak - cumulative) / peak) * 100;
  }));
  const { state, ageMs } = lifecycleState(stock, now);
  const regime = stock.regime ?? deriveRegime(stock);
  const entropy = clampMetric(signalAction === "Hold" ? 62 - confidence * 0.2 : 44 + uncertainty * 0.38);
  const predictionResidual = clampMetric(Math.abs((stock.signalReturnPercent ?? change) - expectedMovePct) * 8);

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
  if (decision.riskLevel === "Extreme Risk") {
    return `Avoid new exposure while ${environment} conditions remain unstable. ${metaReasons}`;
  }
  if (decision.actionLabel === "Buy" && decision.convictionLabel === "High Conviction") {
    return `Conditions support selective upside participation within a controlled ${environment} framework. ${metaReasons}`;
  }
  if (decision.actionLabel === "Watch") {
    return `Participation is improving, but exposure should wait for broader confirmation. ${metaReasons}`;
  }
  if (decision.actionLabel === "Reduce" || decision.actionLabel === "Avoid") {
    return `Risk compensation has weakened; capital should remain defensive. ${metaReasons}`;
  }
  return `Conditions support a ${plainAction(decision.actionLabel).toLowerCase()} mandate while the market searches for cleaner participation. ${metaReasons}`;
}

function buildExecutionDecisions(
  signals: AdaptiveSignalView[],
  portfolio: SimulatedPortfolio,
  calibrationState: CalibrationState,
): ExecutionDecision[] {
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
    const signalQuality = clampMetric(
      calibratedConfidence * 0.34 +
      signal.stabilityScore * 0.22 +
      signal.ensembleAgreement * 100 * 0.22 +
      Math.max(0, Math.abs(signal.expectedMovePct)) * 2.2 -
      signal.driftScore * 0.18,
    );
    const calibrationScore = clampMetric(
      preliminaryCalibrationScore * 0.55 +
      (100 - calibrationState.calibrationError * 100) * 0.3 +
      (100 - calibrationState.drift) * 0.15,
    );
    const survival = survivalForecast.survivalProbability;
    const regime = regimeQuality(signal);
    const liquidity = liquidityScore(signal);
    const volatilityPenalty = clampMetric(12 + signal.volatilityShift * 0.72 + signal.uncertainty * 0.35, 8, 100);
    const riskScore = clampMetric(
      signal.driftScore * 0.35 +
      signal.uncertainty * 0.28 +
      signal.volatilityShift * 0.24 +
      (100 - calibrationScore) * 0.13 +
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
    const actionLabel: ExecutionDecision["actionLabel"] =
      action === "Buy" && qualityScore >= 62 && riskScore < 68
        ? "Buy"
        : action === "Buy" && qualityScore >= 48
          ? "Watch"
          : action === "Sell" && riskScore >= 58
            ? "Reduce"
            : riskScore >= 76
              ? "Avoid"
              : "Hold";
    const convictionLabel: ConvictionLevel =
      qualityScore >= 74 && calibratedConfidence >= 70
        ? "High Conviction"
        : qualityScore >= 52
          ? "Medium Conviction"
          : "Low Conviction";
    const baseSize =
      actionLabel === "Buy"
        ? metaAllocation.exposureMultiplier *
        (signalQuality / 100) *
        (calibrationScore / 100) *
        (survival / 100) *
        (regime / 100) *
        (liquidity / 100) /
        Math.max(0.45, volatilityPenalty / 38)
        : 0;
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
      classifiedRegime: classified.regime,
      survivalForecast,
      recommendedHoldingMinutes: survivalForecast.recommendedHoldingMinutes,
      genealogy: [
        { label: "Relative Strength", value: signalQuality, tone: "good" as const },
        { label: "Volatility Control", value: clampMetric(100 - volatilityPenalty), tone: riskScore > 65 ? "warn" as const : "info" as const },
        { label: "Regime Quality", value: regime, tone: "good" as const },
        { label: "Execution Depth", value: liquidity, tone: liquidity < 45 ? "warn" as const : "info" as const },
        { label: "Market Structure", value: regime, tone: signal.regime === "PANIC" ? "bad" as const : "good" as const },
        { label: "Participation Breadth", value: signal.ensembleAgreement * 100, tone: signal.ensembleAgreement > 0.7 ? "good" as const : "warn" as const },
        { label: "Meta Governor", value: metaAllocation.exposureMultiplier * 100, tone: metaAllocation.regimeRisk === "unstable" ? "bad" as const : metaAllocation.regimeRisk === "high" ? "warn" as const : "info" as const },
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
  const targetExposure =
    raw.length && mean(raw.map((item) => item.riskScore)) > 65
      ? 32
      : raw.length && mean(raw.map((item) => item.qualityScore)) > 66
        ? 72
        : 52;
  let deployed = 0;
  const decisions = raw.map((item) => {
    const normalized = totalBase > 0 ? (item._baseSize / totalBase) * targetExposure : 0;
    const maxPerAsset = item.riskLevel === "Low Risk" ? 5 : item.riskLevel === "Moderate Risk" ? 4.2 : 2.4;
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
  if (label === "Reduce") return "Reduce Exposure";
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


function derivePortfolioPosture(decisions: ExecutionDecision[], metrics: { drift: number; ensemble: number; survival: number; regimeStability: number }) {
  const scoped = decisions.slice(0, 80);
  const avgRisk = mean(scoped.map((item) => item.riskScore));
  const avgQuality = mean(scoped.map((item) => item.qualityScore));
  const recommendedExposure = Math.min(100, decisions.reduce((sum, item) => sum + item.suggestedAllocationPct, 0));
  const buys = scoped.filter((item) => item.actionLabel === "Buy").length;
  const avoids = scoped.filter((item) => item.actionLabel === "Avoid" || item.actionLabel === "Reduce").length;
  const dominantRegime = Array.from(distribution(scoped.map((item) => item.signal.regime)).entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

  let heading = "Selective Upside Participation";
  let action = "Maintain Selective Exposure";
  let label = "Transitional Regime";
  let summary = "Conditions remain constructive, but exposure should stay selective until participation broadens.";

  if (!scoped.length) {
    heading = "Awaiting Market Breadth";
    action = "Await Broader Participation";
    label = "Observation Regime";
    summary = "The system is waiting for sufficient live evidence before increasing exposure.";
  } else if (avgRisk >= 72 || dominantRegime === "PANIC") {
    heading = "Stress Regime";
    action = "Capital Preservation Mode";
    label = "Risk Reduction";
    summary = "Market stress is elevated. Preserve liquidity and avoid incremental risk.";
  } else if (avgRisk >= 58 || metrics.drift >= 58) {
    heading = "Defensive Allocation Regime";
    action = currentActionFromExposure(recommendedExposure, "defensive");
    label = "Capital Preservation";
    summary = "Conditions remain uneven. Exposure should stay narrow and risk budgets controlled.";
  } else if (avgQuality >= 68 && buys >= 3 && metrics.ensemble >= 65) {
    heading = "Constructive Trend Environment";
    action = "Increase Exposure Selectively";
    label = "Constructive";
    summary = "Trend quality is improving and investable setups are broadening. Add exposure with discipline.";
  } else if (avgQuality < 46 || metrics.survival < 35) {
    heading = "Capital Preservation Phase";
    action = "Await Broader Participation";
    label = "Capital Preservation";
    summary = "Durability is limited. Keep capital available until market structure improves.";
  } else if (avoids > buys) {
    heading = "Risk Reduction Regime";
    action = "Reduce Exposure";
    label = "Risk Reduction";
    summary = "Defensive conditions outweigh clean opportunities. Reduce fragile exposure and await stabilization.";
  }

  return { heading, action, label, summary, recommendedExposure };
}

function currentActionFromExposure(exposure: number, posture: "defensive" | "constructive") {
  if (posture === "defensive") return exposure > 45 ? "Reduce Exposure" : "Maintain Core Exposure";
  return exposure < 35 ? "Increase Exposure Selectively" : "Maintain Core Exposure";
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

function MarketRegimeHero({ decisions, metrics, portfolio, marketStatus, lastSyncedLabel }: { decisions: ExecutionDecision[]; metrics: { drift: number; entropy: number; ensemble: number; calibration: number; regimeStability: number; modelStability: number; survival: number; residual: number }; portfolio: SimulatedPortfolio; marketStatus: string; lastSyncedLabel: string }) {
  const totalValue = (portfolio.cash ?? 0) + Object.values(portfolio.positions ?? {}).reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
  const invested = Object.values(portfolio.positions ?? {}).reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
  const currentExposure = totalValue > 0 ? (invested / totalValue) * 100 : 0;
  const posture = derivePortfolioPosture(decisions, metrics);
  const confidence = clampMetric(metrics.ensemble * 0.42 + metrics.regimeStability * 0.28 + metrics.survival * 0.2 + (100 - metrics.drift) * 0.1);
  const deployable = Math.max(0, totalValue * Math.max(0, posture.recommendedExposure - currentExposure) / 100);
  const riskStatus = metrics.drift > 65 ? "Risk budget is tightening" : metrics.drift < 35 ? "Risk budget remains orderly" : "Risk budget is mixed";

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%),linear-gradient(135deg,#020617_0%,#0f172a_54%,#111827_100%)] p-7 text-slate-100 shadow-2xl">
      <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="relative grid gap-8 xl:grid-cols-[1.45fr_0.95fr]">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">{posture.label}</span>
            <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-400">Venue {marketStatus}</span>
            <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-400">Coverage {lastSyncedLabel}</span>
          </div>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">{posture.heading}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">{posture.summary}</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            {[
              ["Target Exposure", `${posture.recommendedExposure.toFixed(1)}%`],
              ["Live Exposure", `${currentExposure.toFixed(1)}%`],
              ["Available Risk Budget", formatMaybeCurrency(deployable)],
              ["Regime Confidence", `${confidence.toFixed(0)}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">{value}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-700/80 bg-slate-950/70 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Portfolio mandate</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-white">{posture.action}</div>
          <p className="mt-3 text-sm leading-6 text-slate-400">{riskStatus}. Position sizing should remain aligned with available risk budget.</p>
          <div className="mt-6 space-y-4">
            <div>
              <div className="mb-2 flex justify-between text-xs text-slate-400"><span>Exposure range</span><span>{currentExposure.toFixed(1)}% / {posture.recommendedExposure.toFixed(1)}%</span></div>
              <Meter value={posture.recommendedExposure} tone={posture.recommendedExposure > 60 ? "good" : posture.recommendedExposure > 35 ? "info" : "warn"} />
            </div>
            <div>
              <div className="mb-2 flex justify-between text-xs text-slate-400"><span>Risk pressure</span><span>{metrics.drift.toFixed(0)}</span></div>
              <Meter value={metrics.drift} tone={toneForValue(metrics.drift)} />
            </div>
            <div>
              <div className="mb-2 flex justify-between text-xs text-slate-400"><span>Participation breadth</span><span>{metrics.ensemble.toFixed(0)}%</span></div>
              <Meter value={metrics.ensemble} tone={metrics.ensemble > 65 ? "good" : metrics.ensemble > 45 ? "info" : "warn"} />
            </div>
          </div>
        </div>
      </div>
    </motion.section>
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
  const suggestedAction = suggestedExposure <= 10 ? "Capital Preservation Mode" : currentExposure > suggestedExposure + 8 ? "Reduce Exposure" : suggestedExposure > currentExposure + 8 ? "Increase Exposure Selectively" : "Maintain Core Exposure";

  return (
    <InsightShell title="Capital Allocation" eyebrow="Portfolio mandate" action={<Badge variant="outline" className="border-slate-700 text-slate-300">{suggestedAction}</Badge>}>
      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Target Exposure", `${suggestedExposure.toFixed(1)}%`, suggestedExposure],
          ["Live Exposure", `${currentExposure.toFixed(1)}%`, currentExposure],
          ["Capital Deployed", formatMaybeCurrency(capitalAtRisk), currentExposure],
          ["Available Budget", `${remainingRiskBudget.toFixed(1)}%`, remainingRiskBudget],
          ["Risk Pressure", avgRisk > 65 ? "Elevated" : avgRisk > 45 ? "Balanced" : "Contained", avgRisk],
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
  const rows = decisions.filter((item) => item.actionLabel === "Buy" || item.actionLabel === "Watch").slice(0, 5);
  const displayRows = rows.length ? rows : decisions.slice(0, 6);
  return (
    <InsightShell title="Priority Allocation Candidates" eyebrow="Highest-quality exposures first" action={<Badge variant="outline" className="border-slate-700 text-slate-300">Top {displayRows.length}</Badge>}>
      <div className="grid gap-4 lg:grid-cols-2">
        {displayRows.map((decision, index) => (
          <button key={decision.signal.adaptiveId} type="button" className="group rounded-3xl border border-slate-800 bg-slate-900/30 p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-400/40 hover:bg-slate-900/70">
            <div className="mb-4 flex items-center justify-between">
              <span className="rounded-full bg-slate-800 px-2.5 py-1 font-mono text-xs font-semibold text-slate-200">{cleanTicker(decision.signal.ticker)}</span>
              <span className="text-[11px] font-semibold text-slate-500">#{index + 1}</span>
            </div>
            <div className="text-sm font-semibold text-slate-100">{plainAction(decision.actionLabel)} · {plainConviction(decision.convictionLabel)}</div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div><div className="text-slate-500">Exposure</div><div className="mt-1 text-lg font-semibold text-slate-100">{decision.suggestedAllocationPct.toFixed(1)}%</div></div>
              <div><div className="text-slate-500">Expected range</div><div className={cn("mt-1 text-lg font-semibold", decision.signal.expectedMovePct >= 0 ? "text-emerald-300" : "text-rose-300")}>{decision.signal.expectedMovePct >= 0 ? "+" : ""}{decision.signal.expectedMovePct.toFixed(1)}%</div></div>
              <div><div className="text-slate-500">Participation</div><div className="mt-1 font-medium text-slate-200">{plainTiming(decision.timingState)}</div></div>
              <div><div className="text-slate-500">Setup quality</div><div className="mt-1 font-medium text-slate-200">{decision.qualityScore.toFixed(0)}/100</div></div>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-400">{decision.riskLevel === "Extreme Risk" ? "Avoid incremental exposure until volatility normalizes and participation improves." : decision.actionLabel === "Buy" ? "Relative strength is improving with contained downside pressure. Size selectively." : "Maintain coverage while waiting for broader confirmation."}</p>
          </button>
        ))}
      </div>
    </InsightShell>
  );
}

function MarketIntelligenceSummary({ metrics }: { metrics: { drift: number; entropy: number; ensemble: number; calibration: number; regimeStability: number; modelStability: number; survival: number; residual: number } }) {
  const groups = [
    { title: "Trend Quality", icon: Layers, value: metrics.ensemble, text: metrics.ensemble >= 65 ? "Participation is broadening across higher-quality exposures." : "Trend evidence remains mixed; keep selection standards high.", rows: [["Reliability", 100 - metrics.drift], ["Breadth", metrics.ensemble], ["Clarity", metrics.entropy]] },
    { title: "Risk Regime", icon: ShieldCheck, value: 100 - metrics.drift, text: metrics.drift < 40 ? "Volatility is orderly and model stability remains acceptable." : "Risk pressure is elevated; incremental exposure should remain restrained.", rows: [["Volatility Pressure", metrics.drift], ["Regime Stability", metrics.regimeStability], ["Calibration", metrics.calibration]] },
    { title: "Exposure Durability", icon: Brain, value: metrics.survival, text: metrics.survival >= 55 ? "Active exposures are holding long enough to support selective allocation." : "Persistence is limited; await stronger confirmation before adding risk.", rows: [["Model Durability", metrics.modelStability], ["Holding Quality", metrics.survival], ["Error Control", 100 - metrics.residual]] },
  ];
  return (
    <InsightShell title="Regime Intelligence" eyebrow="Market interpretation">
      <p className="mb-4 text-sm leading-6 text-slate-400">
        These metrics are diagnostic instruments, not optimization targets. They help adjust exposure, confidence, and holding duration based on realized outcome quality.
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
    <InsightShell title="Opportunity Surface" eyebrow="Relative strength versus risk">
      <div className="relative h-[360px] overflow-hidden rounded-3xl border border-slate-800 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))]">
        <div className="absolute left-1/2 top-0 h-full w-px bg-slate-800" /><div className="absolute left-0 top-1/2 h-px w-full bg-slate-800" />
        <div className="absolute left-4 top-4 text-xs text-emerald-300">Improving relative strength</div><div className="absolute bottom-4 right-4 text-xs text-rose-300">Elevated risk / weakening breadth</div><div className="absolute bottom-4 left-4 text-xs text-slate-500">Low participation</div><div className="absolute right-4 top-4 text-xs text-slate-400">Preferred allocation zone</div>
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
  | "risk"
  | "expectedMove"
  | "ticker"
  | "posture";

const opportunitySortLabels: Record<OpportunitySortKey, string> = {
  quality: "Setup Quality",
  allocation: "Exposure",
  risk: "Risk Pressure",
  expectedMove: "Expected Range",
  ticker: "Ticker",
  posture: "Mandate",
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
    risk: [a.riskScore, b.riskScore],
    expectedMove: [a.signal.expectedMovePct, b.signal.expectedMovePct],
  };
  const [left, right] = values[sortKey];
  return left - right;
}

function AdaptiveSignalFeed({ decisions, selected, onSelect }: { decisions: ExecutionDecision[]; selected?: string; onSelect: (signal: AdaptiveSignalView) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<OpportunitySortKey>("quality");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const pageCount = Math.max(1, Math.ceil(decisions.length / pageSize));
  const boundedPage = Math.min(page, pageCount);
  const sorted = useMemo(() => {
    return [...decisions].sort((a, b) => {
      const result = compareOpportunity(a, b, sortKey);
      return sortDirection === "asc" ? result : -result;
    });
  }, [decisions, sortDirection, sortKey]);
  const visible = sorted.slice((boundedPage - 1) * pageSize, boundedPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [pageSize, sortDirection, sortKey]);

  function updateSort(nextSortKey: OpportunitySortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "ticker" || nextSortKey === "posture" ? "asc" : "desc");
  }

  return (
    <InsightShell
      title="Allocation Ledger"
      eyebrow="Quality-ranked exposures"
      action={
        <div className="flex flex-wrap items-center gap-2">
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
            {decisions.length ? `${(boundedPage - 1) * pageSize + 1}-${Math.min(boundedPage * pageSize, decisions.length)} of ${decisions.length}` : "0 in view"}
          </Badge>
        </div>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-slate-800">
        <div className="sticky top-0 grid grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-4 border-b border-slate-800 bg-slate-950/95 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {[
            ["ticker", "Ticker"],
            ["posture", "Mandate"],
            ["allocation", "Exposure"],
            ["quality", "Quality"],
            ["risk", "Risk Pressure"],
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
          {visible.map((decision) => (
            <div key={decision.signal.adaptiveId}>
              <button type="button" onClick={() => { onSelect(decision.signal); setExpanded(expanded === decision.signal.adaptiveId ? null : decision.signal.adaptiveId); }} className={cn("grid w-full grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-4 px-4 py-3 text-left text-sm transition hover:bg-slate-900/60", selected === decision.signal.ticker && "bg-emerald-400/5")}>
                <span className="min-w-0"><span className="rounded-full bg-slate-800 px-2.5 py-1 font-mono text-xs font-semibold text-slate-100">{cleanTicker(decision.signal.ticker)}</span><span className="ml-2 hidden truncate text-xs text-slate-500 md:inline">{decision.signal.name}</span></span>
                <span className="text-slate-300">{plainAction(decision.actionLabel)}</span><span className="font-semibold text-slate-100">{decision.suggestedAllocationPct.toFixed(1)}%</span><span className="text-slate-300">{decision.qualityScore.toFixed(0)}/100</span><span className={decision.riskScore > 65 ? "text-rose-300" : "text-slate-300"}>{plainRisk(decision.riskLevel)}</span>
              </button>
              {expanded === decision.signal.adaptiveId && <div className="bg-slate-950/70 px-4 pb-4 text-sm text-slate-400"><div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">{decision.tradeExplanation} Participation: {plainTiming(decision.timingState)}. Breadth: {(decision.signal.ensembleAgreement * 100).toFixed(0)}%. Holding window: {formatDuration(decision.recommendedHoldingMinutes * 60_000)}.</div></div>}
            </div>
          ))}
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
    <InsightShell title="Return Path" eyebrow="Selected instrument history" action={active && <Badge variant="outline" className="border-slate-700 text-slate-300">{cleanTicker(active.ticker)}</Badge>}>
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
  const sharpe = periodReturns.length >= 2
    ? Math.max(-4, Math.min(4, (avg / Math.max(volatility, 0.004)) * Math.sqrt(Math.min(252, periodReturns.length))))
    : null;
  const first = history[0]?.t;
  const last = history[history.length - 1]?.t;
  const elapsedMonths = first && last ? (last - first) / (30.44 * 24 * 3_600_000) : 0;
  const monthlyReturn = elapsedMonths >= 0.5
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
    sharpe,
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
      title="Portfolio Performance"
      eyebrow="Compounded returns and execution record"
      action={
        <Badge variant="outline" className="border-slate-700 text-slate-300">
          {lastReturn >= 0 ? "+" : ""}{lastReturn.toFixed(2)}%
        </Badge>
      }
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as "chart" | "history" | "stats")}>
        <TabsList className="mb-5 bg-slate-900/70">
          <TabsTrigger value="chart">Returns</TabsTrigger>
          <TabsTrigger value="history">Execution</TabsTrigger>
          <TabsTrigger value="stats">Metrics</TabsTrigger>
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
                      {["Instrument", "Units", "Entry", "Exit", "P/L", "Opened", "State"].map((label) => (
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
              Execution history will appear once the portfolio establishes live exposures.
            </div>
          )}
        </TabsContent>

        <TabsContent value="stats">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Total Return", `${stats.totalReturn >= 0 ? "+" : ""}${(stats.totalReturn * 100).toFixed(2)}%`, stats.totalReturn >= 0],
              ["Monthly Return", stats.monthlyReturn == null ? "—" : `${stats.monthlyReturn >= 0 ? "+" : ""}${stats.monthlyReturn.toFixed(2)}%`, stats.monthlyReturn == null ? null : stats.monthlyReturn >= 0],
              ["Profit Factor", stats.profitFactor == null ? "—" : stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2), stats.profitFactor == null ? null : stats.profitFactor >= 1],
              ["Win Rate", stats.winRate == null ? "—" : `${stats.winRate.toFixed(1)}%`, stats.winRate == null ? null : stats.winRate >= 50],
              ["Max Drawdown", `${(stats.maxDrawdown * 100).toFixed(1)}%`, stats.maxDrawdown === 0 ? null : false],
              ["Risk Efficiency", stats.sharpe == null ? "—" : stats.sharpe.toFixed(2), stats.sharpe == null ? null : stats.sharpe >= 1],
              ["Closed Executions", String(stats.totalTrades), null],
              ["Average Holding Period", formatDuration(stats.averageDurationMs), null],
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
  const [selectedMarket, setSelectedMarket] = useState("BINANCE");
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | undefined>();
  const [syncTotal, setSyncTotal] = useState(0);
  const [syncAttempted, setSyncAttempted] = useState(0);
  const [syncUnavailable, setSyncUnavailable] = useState(0);
  const [simulatedPortfolios, setSimulatedPortfolios] = useState<Record<string, SimulatedPortfolio>>(() => {
    try {
      const saved = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
      return saved ? normalizePortfolioStorage(JSON.parse(saved)) : {};
    } catch {
      return {};
    }
  });

  const activeSimulatedPortfolio =
    simulatedPortfolios[selectedMarket] ?? createEmptyPortfolio();

  const adaptiveSignals = useMemo(
    () => stocks.map((stock) => deriveAdaptiveSignal(stock, Date.now())),
    [stocks],
  );

  const calibrationState = useMemo(
    () => calibrationStateFromSignals(adaptiveSignals),
    [adaptiveSignals],
  );

  const executionDecisions = useMemo(
    () => buildExecutionDecisions(adaptiveSignals, activeSimulatedPortfolio, calibrationState),
    [adaptiveSignals, activeSimulatedPortfolio, calibrationState],
  );

  const allocationDecisions = useMemo(
    () => buildExecutionDecisions(adaptiveSignals, createEmptyPortfolio(), calibrationState),
    [adaptiveSignals, calibrationState],
  );

  const selectedDecision =
    executionDecisions.find((decision) => decision.signal.ticker === selectedTicker) ??
    executionDecisions[0];

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

          const preferred = marketResponse.find(
            (m) =>
              m.code.toUpperCase() === "BINANCE",
          );

          if (preferred) {
            setSelectedMarket(preferred.code);
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
            setStocks((current) =>
              {
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
          cacheUnavailableLiveQuotes(selectedMarket, quoteBatch.unavailableSymbols);

          setStocks((current) =>
            {
              const next = mergeStockQuotes(current, quoteBatch.quotes, stockBySymbol, selectedMarket);
              if (quoteBatch.quotes.length) latestSyncedAt = Date.now();
              writeMarketDataCache(selectedMarket, {
                stocks: next,
                selectedTicker: quoteBatch.quotes[0]?.symbol ?? next[0]?.ticker,
                lastSyncedAt: latestSyncedAt,
                syncTotal: symbols.length,
                syncAttempted: attemptedCount + quoteBatch.quotes.length + quoteBatch.unavailableSymbols.length,
                syncUnavailable: unavailableCount + quoteBatch.unavailableSymbols.length,
              });
              return next;
            },
          );
          setSelectedTicker((current) => current ?? quoteBatch.quotes[0]?.symbol);
          attemptedCount += quoteBatch.quotes.length + quoteBatch.unavailableSymbols.length;
          unavailableCount += quoteBatch.unavailableSymbols.length;
          setSyncAttempted((current) =>
            current + quoteBatch.quotes.length + quoteBatch.unavailableSymbols.length,
          );
          setSyncUnavailable((current) => current + quoteBatch.unavailableSymbols.length);
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
    if (!selectedMarket || !stocks.length || selectedMarketStatus !== "Open") return;

    setSimulatedPortfolios((current) => {
      const existing = current[selectedMarket];
      const now = Date.now();
      const liveByTicker = new Map(stocks.map((stock) => [stock.ticker, stock]));
      const actionable = allocationDecisions
        .filter((decision) => decision.actionLabel === "Buy" && decision.suggestedAllocationPct > 0)
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

      let cash = existing?.cash ?? STARTING_PORTFOLIO_VALUE;
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
          const entryPrice = resolveSimulatedEntryPrice(stock, ask);
          positions[ticker] = {
            ...stock,
            quantity: addedQuantity,
            entryPrice,
            investedAmount: addedQuantity * entryPrice,
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
          startValue: existing?.startValue ?? STARTING_PORTFOLIO_VALUE,
          cash: Math.max(0, cash),
          positions,
          valueHistory: [...(existing?.valueHistory ?? []).slice(-239), { t: now, v: value }],
          closedPositions: dedupeClosedPositions(closedPositions),
        },
      };
    });
  }, [allocationDecisions, selectedMarket, selectedMarketStatus, stocks]);
  return (
    <main className="min-h-screen bg-[#020817] text-slate-100">
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Capital Intelligence
              </div>

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
            </div>

          </div>

          <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-slate-800 bg-[#061226]">
            {[
              ["Venue", selectedMarketStatus],
              ["Mandate", selectedDecision ? plainAction(selectedDecision.actionLabel) : "Reviewing"],
              ["Exposure", `${Math.min(100, executionDecisions.reduce((sum, decision) => sum + decision.suggestedAllocationPct, 0)).toFixed(1)}%`],
            ].map(([label, value]) => (
              <div key={label} className="min-w-[140px] border-l border-slate-800 p-4 first:border-l-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  {label}
                </div>

                <div className="mt-2 text-lg font-semibold text-white">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </header>

        {refreshError && (
          <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {refreshError}
          </div>
        )}

        {!executionDecisions.length ? (
          <section className="rounded-3xl border border-slate-800 bg-[#040d1d] p-8 text-sm text-slate-400">
            {loading ? "Reviewing market coverage..." : "No priced instruments returned for this venue."}
          </section>
        ) : (
          <>
            <div className="mb-8">
              <MarketRegimeHero
                decisions={executionDecisions}
                metrics={intelligenceMetrics}
                portfolio={activeSimulatedPortfolio}
                marketStatus={selectedMarketStatus}
                lastSyncedLabel={lastSyncedLabel}
              />
            </div>

            <div className="mb-6">
              <PortfolioIntelligence decisions={executionDecisions} portfolio={activeSimulatedPortfolio} />
            </div>

            <div className="mb-6">
              <PortfolioPerformanceTabs portfolio={activeSimulatedPortfolio} />
            </div>

            <section className="mb-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <TopOpportunities decisions={executionDecisions} />
              <MarketIntelligenceSummary metrics={intelligenceMetrics} />
            </section>

            <section className="mb-6 grid gap-4 xl:grid-cols-2">
              <OpportunityMap
                decisions={executionDecisions}
                selected={selectedTicker}
                onSelect={(signal) => setSelectedTicker(signal.ticker)}
              />
              <LiveIntelligenceChart decision={selectedDecision} fallback={executionDecisions} />
            </section>

            <AdaptiveSignalFeed
              decisions={executionDecisions}
              selected={selectedTicker}
              onSelect={(signal) => setSelectedTicker(signal.ticker)}
            />
          </>
        )}
      </div>
    </main>
  );
}
