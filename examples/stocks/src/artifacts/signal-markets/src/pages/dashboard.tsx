import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Line,
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
  TrendingUp,
  LineChart,
  Info,
  Clock,
} from "lucide-react";
import {
  ApiRequestError,
  emitFakeSignal,
  fetchSignalHistory,
  fetchMarkets,
  fetchStockList,
  fetchStockQuotes,
  registerSignalWatchlist,
  type MarketOption,
  type SignalEvent,
  type StockData,
  type StockQuote,
  type StockStatus,
  type TradeSignal,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const DISPLAY_ZERO_THRESHOLD = 0.005;
const LIVE_QUOTE_CACHE_TTL_MS = 60_000;
const UNAVAILABLE_LIVE_QUOTE_CACHE_TTL_MS = 30_000;

type CachedQuoteEntry =
  | { status: "available"; quote: StockQuote; cachedAt: number }
  | { status: "unavailable"; cachedAt: number };

const liveQuoteCache = new Map<string, CachedQuoteEntry>();

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
  const cachedPendingSymbols: string[] = [];
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
      cachedPendingSymbols.push(symbol);
    }
  }

  return { cachedQuotes, cachedPendingSymbols, uncachedSymbols };
}

function cacheLiveQuotes(market: string, quotes: Array<{ symbol: string } & Partial<StockQuote>>) {
  const cachedAt = Date.now();
  for (const quote of quotes) {
    if (!quote.symbol) continue;
    liveQuoteCache.set(liveQuoteCacheKey(market, quote.symbol), {
      status: "available",
      quote: quote as StockQuote,
      cachedAt,
    });
  }
}

function cacheUnavailableLiveQuotes(market: string, symbols: string[]) {
  const cachedAt = Date.now();
  for (const symbol of symbols) {
    liveQuoteCache.set(liveQuoteCacheKey(market, symbol), {
      status: "unavailable",
      cachedAt,
    });
  }
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
  const symbol = signal.symbol ?? signal.ticker ?? "Signal";
  const action = signal.signalAction ?? "Hold";
  const status = signal.status ?? "Stable";
  const price = formatMaybeCurrency(signal.price);
  const confidence =
    signal.signalConfidence != null
      ? `${Math.round(Number(signal.signalConfidence))}%`
      : "—";

  return {
    title: `${symbol} ${action} · ${status}`,
    description: `${price} · confidence ${confidence}`,
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
const REFRESH_INTERVAL_MS = 60_000;
const STALE_AFTER_MS = REFRESH_INTERVAL_MS * 2;
const STOCK_LIST_PAGE_SIZE = 500;
const INITIAL_QUOTE_SYMBOL_LIMIT = 120;
const VISIBLE_QUOTE_SYMBOL_LIMIT = 120;
const QUOTE_REQUEST_SYMBOL_BATCH_SIZE = 8;
const QUOTE_BATCH_DELAY_MS = 500;
const QUOTE_REQUEST_TIMEOUT_MS = 45_000;
const SYNCING_QUOTE_SUMMARY = "Live quote sync in progress.";
const PREFERRED_INITIAL_MARKETS = ["NASDAQ", "NYSE", "AMEX"];
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
    if (error.timedOut) return "Live data request timed out. Retrying shortly.";
    if (error.status === 429) return "Live data rate limited. Retrying shortly.";
    if (error.status) return `Live data unavailable (${error.status}). Retrying shortly.`;
  }

  return "Live data unavailable. Retrying shortly.";
}

function formatSyncTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function getOverallSignal(stocks: StockData[]): string {
  if (!stocks.length) return "Loading";

  const stableCount = stocks.filter(
    (stock) => (stock.status ?? "Stable") === "Stable",
  ).length;
  const buyCount = stocks.filter((stock) => stock.signalAction === "Buy").length;
  const sellCount = stocks.filter(
    (stock) => stock.signalAction === "Sell",
  ).length;

  if (stableCount / stocks.length >= 0.5) return "Mostly Stable";
  if (buyCount > sellCount) return "Buy Momentum";
  if (sellCount > buyCount) return "Defensive";
  return "Mixed";
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
  return stock.signalAction === "Buy" && stock.status === "Rising";
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
  let color = "";
  if (action === "Buy") color = "bg-green-500 text-white";
  if (action === "Sell") color = "bg-red-500 text-white";
  if (action === "Hold") color = "bg-yellow-500 text-black";
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs font-semibold", color)}>
      {action}
    </span>
  );
}

export default function Dashboard() {
  const [markets, setMarkets] = useState<MarketOption[]>([]);
  const [marketFilter, setMarketFilter] = useState<string>("");
  const [marketQuery, setMarketQuery] = useState<string>("");
  const [marketMenuOpen, setMarketMenuOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StockStatus | "All">("All");
  const [signalFilter, setSignalFilter] = useState<TradeSignal | "All">("All");
  const [chartTimeframe, setChartTimeframe] = useState<"1W" | "1M" | "3M" | "All">("All");
  const [portfolioTab, setPortfolioTab] = useState<"chart" | "history" | "stats">("chart");
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockData | null>(null);
  const [signalHistory, setSignalHistory] = useState<SignalEvent[]>([]);
  const [signalsMenuOpen, setSignalsMenuOpen] = useState(true);
  const [totalStocks, setTotalStocks] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [updateMsg, setUpdateMsg] = useState<string>("Loading market data...");
  const [loading, setLoading] = useState(true);
  const [marketClock, setMarketClock] = useState(() => Date.now());
  // v10: fractional sizing, signal emission de-dupe, and closed-market pause.
  const PORTFOLIO_SCHEMA_VERSION = 10;
  const [simulatedPortfolios, setSimulatedPortfolios] = useState<
    Record<string, SimulatedPortfolio>
  >(() => {
    try {
      const schemaVersion = Number(localStorage.getItem("signal-markets:portfolios:v") ?? 0);
      if (schemaVersion < PORTFOLIO_SCHEMA_VERSION) {
        localStorage.removeItem("signal-markets:portfolios");
        localStorage.setItem("signal-markets:portfolios:v", String(PORTFOLIO_SCHEMA_VERSION));
        return {};
      }
      const saved = localStorage.getItem("signal-markets:portfolios");
      if (!saved) {
        return {};
      }

      const parsed = JSON.parse(saved) as Record<string, SimulatedPortfolio>;
      return normalizePortfolioStorage(parsed);
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("signal-markets:portfolios", JSON.stringify(simulatedPortfolios));
    } catch { }
  }, [simulatedPortfolios]);

  const refreshInFlight = useRef(false);
  const marketMenuRef = useRef<HTMLDivElement | null>(null);
  const marketSearchInputRef = useRef<HTMLInputElement | null>(null);
  const watchlistRegisteredRef = useRef(new Set<string>());
  const stocksRef = useRef<StockData[]>([]);
  const marketFilterRef = useRef("");
  const notificationsEnabledRef = useRef(false);
  const signalSnapshotRef = useRef(
    new Map<string, { action?: TradeSignal; source?: string }>(),
  );

  stocksRef.current = stocks;
  marketFilterRef.current = marketFilter;

  const selectedMarketStatus = marketFilter ? getMarketStatus(marketFilter) : "Closed";
  const isSelectedMarketOpen = selectedMarketStatus === "Open";

  // --- WebSocket integration for real-time signals ---
  const WS_URLS = (() => {
    const envUrl = (import.meta as any).env?.VITE_WS_URL;
    if (envUrl === "none" || envUrl === "disabled") return [];
    if (envUrl) return [envUrl];
    if (typeof window !== "undefined") {
      const apiUrl = (import.meta as any).env?.VITE_API_BASE_URL;
      const base = apiUrl
        ? new URL(apiUrl, window.location.origin)
        : window.location;
      const proto = base.protocol === "https:" ? "wss:" : "ws:";
      const urls = [
        proto + "//" + base.host + "/ws",
        "ws://localhost:3000/ws",
      ];
      return Array.from(new Set(urls));
    }
    return ["ws://localhost:3000/ws"];
  })();

  useEffect(() => {
    if (!WS_URLS.length || typeof window === "undefined") return;
    let ws: WebSocket | null = null;
    let alive = true;


    function connect(urlIndex = 0) {
      let opened = false;
      ws = new window.WebSocket(WS_URLS[urlIndex]);

      ws.onopen = () => {
        opened = true;
        // Optionally, send a hello or subscribe message if protocol requires
        // ws.send(JSON.stringify({ type: "subscribe", markets: [marketFilter] }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const currentMarket = marketFilterRef.current;
          if (currentMarket && getMarketStatus(currentMarket) !== "Open" && !msg.dev) {
            setUpdateMsg("Market closed. Watching status until it reopens.");
            return;
          }
          const incomingSignals: Array<Partial<StockData> & { symbol?: string }> =
            msg?.type === "signal" && msg.data?.symbol
              ? [msg.data]
              : msg?.type === "signal-update" && Array.isArray(msg.signals)
                ? msg.signals
                : [];

          if (incomingSignals.length) {
            const firstSignal = incomingSignals[0] as Partial<StockData> & {
              symbol?: string;
            };
            toast(describeSignalToast(firstSignal));
            setSignalHistory((current) => [
              ...incomingSignals.map((signal) =>
                makeLocalSignalEvent(signal, marketFilterRef.current),
              ),
              ...current,
            ].slice(0, 100));
            setStocks((prev) => {
              let next = prev;
              for (const signal of incomingSignals) {
                const symbol = signal.symbol ?? signal.ticker;
                if (!symbol) continue;
                const idx = next.findIndex((stock) => stock.ticker === symbol);
                if (idx !== -1) {
                  next = next.map((stock, i) =>
                    i === idx ? { ...stock, ...signal, ticker: symbol } : stock,
                  );
                } else {
                  next = [{
                    ...signal,
                    ticker: symbol,
                    symbol,
                    name: signal.name ?? symbol,
                    exchange: signal.exchange ?? marketFilterRef.current,
                    country: signal.country ?? marketFilterRef.current,
                  }, ...next];
                }
              }
              return next;
            });
            setUpdateMsg(`${incomingSignals.length} signal update${incomingSignals.length === 1 ? "" : "s"} received.`);
          }
        } catch (err) {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (alive) {
          // Try to reconnect after a delay
          const nextIndex = opened ? urlIndex : Math.min(urlIndex + 1, WS_URLS.length - 1);
          setTimeout(() => connect(nextIndex), 2000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      alive = false;
      ws?.close();
    };
  }, [WS_URLS.join("|")]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    (window as any).signalMarketsFakeSignal = async (
      data: Partial<StockData> & { symbol?: string } = {},
    ) => {
      try {
        await emitFakeSignal({ market: marketFilterRef.current || "DEV", ...data });
      } catch {
      }

      const symbol = data.symbol ?? data.ticker ?? "BINANCE:POLBRL";
      const price = Number(data.price ?? 0.47);
      const signal = {
        symbol,
        ticker: symbol,
        name: data.name ?? "Temporary fake signal",
        price,
        changePercent: data.changePercent ?? 1.5,
        status: data.status ?? "Rising",
        high52: data.high52 ?? price,
        low52: data.low52 ?? 0.46,
        history: data.history ?? [0.46, price],
        summary: data.summary ?? "Temporary fake Buy + Rising signal.",
        impact: data.impact ?? "Dev-only browser console signal.",
        signalAction: data.signalAction ?? "Buy",
        signalConfidence: data.signalConfidence ?? 88,
        signalSource: data.signalSource ?? "heuristic",
        signalEmittedAt: data.signalEmittedAt ?? new Date().toISOString(),
        signalEntryPrice: data.signalEntryPrice ?? 0.46,
        ...data,
      } satisfies Partial<StockData> & { symbol: string };

      toast(describeSignalToast(signal));
      setSignalHistory((current) => [
        makeLocalSignalEvent(signal, marketFilterRef.current),
        ...current,
      ].slice(0, 100));
      setStocks((prev) => {
        const idx = prev.findIndex((stock) => stock.ticker === symbol);
        if (idx === -1) return [signal as StockData, ...prev];
        return prev.map((stock, index) =>
          index === idx ? { ...stock, ...signal } : stock,
        );
      });
      setUpdateMsg(`Fake signal received for ${symbol}.`);
    };

    return () => {
      delete (window as any).signalMarketsFakeSignal;
    };
  }, []);

  async function refreshVisibleQuotes(reason: string) {
    const currentStocks = stocksRef.current;
    const currentMarket = marketFilterRef.current;

    if (!currentStocks.length || !currentMarket || refreshInFlight.current) {
      return;
    }

    if (getMarketStatus(currentMarket) !== "Open") {
      setUpdateMsg("Market closed. Watching status until it reopens.");
      return;
    }

    refreshInFlight.current = true;
    setUpdateMsg(reason);

    try {
      await fetchQuotesBatched(currentMarket, currentStocks, () => false, {
        bypassCache: true,
      });
    } finally {
      refreshInFlight.current = false;
    }
  }

  useEffect(() => {
    let mounted = true;

    fetchMarkets()
      .then((data) => {
        if (!mounted) return;
        setMarkets(data);
        if (data.length) {
          const preferredMarket =
            PREFERRED_INITIAL_MARKETS.find((code) =>
              data.some((item) => item.code === code),
            ) ?? data[0].code;
          setMarketFilter((current) =>
            current &&
              current !== data[0].code &&
              data.some((item) => item.code === current)
              ? current
              : preferredMarket,
          );
        } else {
          setLoading(false);
        }
      })
      .catch((error) => {
        if (!mounted) return;
        setMarkets([]);
        setLoading(false);
        const message = describeRefreshError(error);
        setRefreshError(message);
        setUpdateMsg(message);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setMarketClock(Date.now());
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!marketMenuOpen) return;
    marketSearchInputRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (
        marketMenuRef.current &&
        !marketMenuRef.current.contains(event.target as Node)
      ) {
        setMarketMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [marketMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    fetchSignalHistory(undefined, 100)
      .then((events) => {
        if (!cancelled) setSignalHistory(events);
      })
      .catch(() => {
        if (!cancelled) setSignalHistory([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // --- Stocks List Cache ---
  const stocksListCacheRef = useRef<{ [market: string]: { items: StockData[]; total: number } }>({});

  useEffect(() => {
    let cancelled = false;

    async function loadStocks() {
      if (!marketFilter) {
        setLoading(false);
        return;
      }

      // Check cache first
      const cached = stocksListCacheRef.current[marketFilter];
      if (cached && cached.items.length > 0) {
        setTotalStocks(cached.total);
        setStocks(cached.items);
        setLoading(false);
        const watchKey = `${marketFilter}:${cached.items.length}`;
        if (!watchlistRegisteredRef.current.has(watchKey)) {
          watchlistRegisteredRef.current.add(watchKey);
          void registerSignalWatchlist(
            marketFilter,
            cached.items.map((item) => item.ticker),
          ).catch(() => {
            watchlistRegisteredRef.current.delete(watchKey);
          });
        }
        if (getMarketStatus(marketFilter) === "Open") {
          await fetchQuotesBatched(marketFilter, cached.items, () => cancelled, {
            symbolLimit: INITIAL_QUOTE_SYMBOL_LIMIT,
          });
        } else {
          setUpdateMsg("Market closed. Watching status until it reopens.");
        }
        return;
      }

      setLoading(true);
      setRefreshError(null);
      setLastSyncedAt(null);
      setStocks([]);
      setSelectedStock(null);
      setUpdateMsg("Syncing live market data...");

      try {
        let offset = 0;
        let total = 0;
        const items: StockData[] = [];

        do {
          const response = await fetchStockList(
            marketFilter,
            offset,
            STOCK_LIST_PAGE_SIZE,
          );
          if (cancelled) return;

          total = response.total;
          items.push(
            ...response.items.map((item) => ({
              ...item,
              ticker: item.symbol,
              summary: SYNCING_QUOTE_SUMMARY,
              impact: "Live data will refresh as the market-wide quote sync reaches this asset.",
            })),
          );
          offset += response.items.length;
        } while (offset < total && items.length < total);

        setTotalStocks(total);
        setStocks(items);
        setLoading(false);
        // Cache the result
        stocksListCacheRef.current[marketFilter] = { items, total };
        const watchKey = `${marketFilter}:${items.length}`;
        if (!watchlistRegisteredRef.current.has(watchKey)) {
          watchlistRegisteredRef.current.add(watchKey);
          void registerSignalWatchlist(
            marketFilter,
            items.map((item) => item.ticker),
          ).catch(() => {
            watchlistRegisteredRef.current.delete(watchKey);
          });
        }
        if (getMarketStatus(marketFilter) === "Open") {
          await fetchQuotesBatched(marketFilter, items, () => cancelled, {
            symbolLimit: INITIAL_QUOTE_SYMBOL_LIMIT,
          });
        } else {
          setUpdateMsg("Market closed. Watching status until it reopens.");
        }
      } catch (error) {
        if (!cancelled) {
          setLoading(false);
          const message = describeRefreshError(error);
          setRefreshError(message);
          setUpdateMsg(message);
        }
      }
    }

    void loadStocks();

    return () => {
      cancelled = true;
    };
  }, [marketFilter]);

  useEffect(() => {
    if (!stocks.length || !marketFilter) return;
    const interval = setInterval(() => {
      if (getMarketStatus(marketFilter) !== "Open") {
        setUpdateMsg("Market closed. Watching status until it reopens.");
        return;
      }
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      setUpdateMsg("Refreshing live market data...");
      const visibleStocks = stocks.filter((stock) => {
        const matchesStatus =
          statusFilter === "All" || stock.status === statusFilter;
        const action = stock.signalAction ?? "Hold";
        const matchesSignal = signalFilter === "All" || action === signalFilter;
        return matchesStatus && matchesSignal;
      });
      fetchQuotesBatched(marketFilter, visibleStocks.slice(0, VISIBLE_QUOTE_SYMBOL_LIMIT), () => false, {
        bypassCache: true,
      }).finally(() => {
        refreshInFlight.current = false;
      });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [stocks, marketFilter, statusFilter, signalFilter]);

  useEffect(() => {
    if (!stocks.length || !marketFilter || refreshInFlight.current) return;
    if (!isSelectedMarketOpen) {
      setUpdateMsg("Market closed. Watching status until it reopens.");
      return;
    }
    if (!lastSyncedAt || marketClock - lastSyncedAt >= REFRESH_INTERVAL_MS) {
      void refreshVisibleQuotes("Market open. Refreshing live signals...");
    }
  }, [isSelectedMarketOpen, lastSyncedAt, marketClock, marketFilter, stocks.length]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const maybeRefresh = (reason: string) => {
      const needsRefresh =
        !lastSyncedAt ||
        marketClock - lastSyncedAt >= REFRESH_INTERVAL_MS ||
        Boolean(refreshError);

      if (needsRefresh) {
        void refreshVisibleQuotes(reason);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        maybeRefresh("Tab active. Refreshing market data...");
      }
    };

    const handleOnline = () => {
      maybeRefresh("Back online. Refreshing market data...");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, [lastSyncedAt, marketClock, refreshError]);

  useEffect(() => {
    if (!selectedStock) return;
    const updated = stocks.find(
      (stock) => stock.ticker === selectedStock.ticker,
    );
    if (updated) {
      setSelectedStock(updated);
    }
  }, [stocks, selectedStock]);

  useEffect(() => {
    if (!marketFilter || !stocks.length) return;
    if (!isSelectedMarketOpen) return;

    setSimulatedPortfolios((current) => {
      const existing = current[marketFilter];
      const now = Date.now();
      // Helper to compute bid price for a live stock
      function liveBidFor(stock: StockData): number {
        const price = Number(stock.price) || 0;
        return Number.isFinite(stock.bid) && stock.bid! > 0
          ? Number(stock.bid)
          : price;
      }

      function fallbackBidForPosition(pos: SimulatedPosition): number {
        const posBid = Number(pos.bid);
        if (Number.isFinite(posBid) && posBid > 0) return posBid;
        const posPrice = Number(pos.price);
        if (Number.isFinite(posPrice) && posPrice > 0) return posPrice;
        return pos.entryPrice;
      }

      function resolvedBidForPosition(
        liveStock: StockData | undefined,
        pos: SimulatedPosition,
      ): number {
        if (liveStock) {
          const liveBid = liveBidFor(liveStock);
          if (Number.isFinite(liveBid) && liveBid > 0) {
            return liveBid;
          }
        }
        return fallbackBidForPosition(pos);
      }

      // ── First visit for this market: open initial Buy+Rising positions ──
      if (!existing) {
        const eligible = stocks.filter((s) => {
          const price = Number(s.price);
          return isBuySetup(s) && Number.isFinite(price) && price > 0;
        });
        if (!eligible.length) {
          return {
            ...current,
            [marketFilter]: {
              cash: STARTING_PORTFOLIO_VALUE,
              positions: {},
              startedAt: now,
              startValue: STARTING_PORTFOLIO_VALUE,
              valueHistory: [],
              closedPositions: [],
            },
          };
        }

        const weights = maxSharpeWeights(eligible);
        let cash = STARTING_PORTFOLIO_VALUE;
        const positions: Record<string, SimulatedPosition> = {};
        eligible.forEach((stock, index) => {
          const price = Number(stock.price) || 0;
          const ask = Number.isFinite(stock.ask) && stock.ask! > 0 ? Number(stock.ask) : price;
          const bid = liveBidFor(stock);
          const targetWeight = weights[index] ?? 0;
          const amount = STARTING_PORTFOLIO_VALUE * targetWeight;
          const entryPrice = resolveSimulatedEntryPrice(stock, ask);
          const quantity =
            entryPrice > 0 ? Number((amount / entryPrice).toFixed(6)) : 0;
          if (quantity <= 0) return;
          const actualCost = quantity * entryPrice;
          cash -= actualCost;
          positions[stock.ticker] = {
            ...stock,
            quantity,
            entryPrice,
            investedAmount: actualCost,
            marketValue: quantity * bid,
            targetWeight,
            openedAt: now,
            entrySignalKey: signalEntryKey(stock),
          };
        });
        if (cash < 0.01) cash = 0;
        const totalMV = Object.values(positions).reduce((s, p) => s + p.marketValue, 0);
        Object.values(positions).forEach((p) => {
          p.targetWeight = totalMV > 0 ? p.marketValue / totalMV : 0;
        });
        return {
          ...current,
          [marketFilter]: {
            cash,
            positions,
            startedAt: now,
            startValue: STARTING_PORTFOLIO_VALUE,
            valueHistory: [{ t: now, v: totalMV + cash }],
            closedPositions: [],
          },
        };
      }

      // ── Subsequent refreshes: sell exits, buy new entries, update values ──
      const buyRisingSet = new Set(
        stocks
          .filter((s) => {
            const price = Number(s.price);
            return isBuySetup(s) && Number.isFinite(price) && price > 0;
          })
          .map((s) => s.ticker),
      );

      let cash = existing.cash ?? STARTING_PORTFOLIO_VALUE;
      const positions: Record<string, SimulatedPosition> = {};
      const closedPositions = [...(existing.closedPositions ?? [])];

      // Step 1 – Update held positions and sell those that are no longer Buy+Rising
      for (const [ticker, pos] of Object.entries(existing.positions)) {
        const liveStock = stocks.find((s) => s.ticker === ticker);

        if (!buyRisingSet.has(ticker)) {
          // SELL: position exited — crystallise proceeds at current bid
          const bid = resolvedBidForPosition(liveStock, pos);
          const proceeds = pos.quantity * bid;
          cash += proceeds;
          const closedCandidate: ClosedPosition = {
            ticker,
            name: (liveStock ?? pos).name,
            quantity: pos.quantity,
            entryPrice: pos.entryPrice,
            exitPrice: bid,
            investedAmount: pos.investedAmount,
            proceeds,
            openedAt: pos.openedAt,
            closedAt: now,
            entrySignalKey: pos.entrySignalKey,
          };
          if (
            pos.quantity > 0 &&
            !closedPositions.some(
              (existingPosition) =>
                closedPositionFingerprint(existingPosition) ===
                closedPositionFingerprint(closedCandidate),
            )
          ) {
            closedPositions.push(closedCandidate);
          }
          continue;
        }

        // Still Buy+Rising — update live fields, preserve entry/quantity
        if (!liveStock) {
          positions[ticker] = pos;
          continue;
        }
        const bid = resolvedBidForPosition(liveStock, pos);
        positions[ticker] = {
          ...pos,
          price: liveStock.price,
          bid: liveStock.bid,
          ask: liveStock.ask,
          changePercent: liveStock.changePercent,
          status: liveStock.status,
          signalAction: liveStock.signalAction,
          signalConfidence: liveStock.signalConfidence,
          signalEmittedAt: liveStock.signalEmittedAt,
          signalReturnPercent: liveStock.signalReturnPercent,
          summary: liveStock.summary,
          entryPrice: pos.entryPrice,
          quantity: pos.quantity,
          investedAmount: pos.investedAmount,
          targetWeight: pos.targetWeight,
          openedAt: pos.openedAt,
          marketValue: pos.quantity * bid,
        };
      }

      // Recovery guard for legacy corrupted state: no positions + no cash.
      if (Object.keys(positions).length === 0 && cash <= 0) {
        cash = existing.startValue ?? STARTING_PORTFOLIO_VALUE;
      }

      // Step 2 – Open new Buy+Rising entries with available cash.
      // Existing positions are NEVER disturbed — each position lives and dies
      // on its own signal. No forced rebalancing.
      const heldTickers = new Set(Object.keys(positions));
      const closedSignalKeys = new Set(
        closedPositions
          .map((position) => position.entrySignalKey)
          .filter(Boolean) as string[],
      );
      const newEntries = stocks.filter(
        (s) =>
          buyRisingSet.has(s.ticker) &&
          !heldTickers.has(s.ticker) &&
          !closedSignalKeys.has(signalEntryKey(s)),
      );

      if (newEntries.length > 0 && cash > 0) {
        const deployable = cash;
        if (deployable > 0) {
          const newWeights = maxSharpeWeights(newEntries);
          newEntries.forEach((stock, index) => {
            const price = Number(stock.price) || 0;
            const ask = Number.isFinite(stock.ask) && stock.ask! > 0 ? Number(stock.ask) : price;
            const bid = liveBidFor(stock);
            const targetWeight = newWeights[index] ?? 0;
            const amount = deployable * targetWeight;
            const entryPrice = resolveSimulatedEntryPrice(stock, ask);
            const quantity =
              entryPrice > 0 ? Number((amount / entryPrice).toFixed(6)) : 0;
            if (quantity <= 0) return;
            const actualCost = quantity * entryPrice;
            cash -= actualCost;
            positions[stock.ticker] = {
              ...stock,
              quantity,
              entryPrice,
              investedAmount: actualCost,
              marketValue: quantity * bid,
              targetWeight,
              openedAt: now,
              entrySignalKey: signalEntryKey(stock),
            };
          });
          if (cash < 0.01) cash = 0;
        }
      }

      // Step 3 – Recompute target weights across all positions
      const totalMV = Object.values(positions).reduce((s, p) => s + p.marketValue, 0);
      Object.values(positions).forEach((p) => {
        p.targetWeight = totalMV > 0 ? p.marketValue / totalMV : 0;
      });

      // Step 4 – Record value snapshot (positions + cash)
      const portfolioValue = totalMV + cash;
      const prevHistory = existing.valueHistory ?? [];
      const valueHistory: Array<{ t: number; v: number }> = [
        ...prevHistory.slice(-499),
        { t: now, v: portfolioValue },
      ];

      return {
        ...current,
        [marketFilter]: {
          startedAt: existing.startedAt ?? now,
          startValue: existing.startValue ?? STARTING_PORTFOLIO_VALUE,
          cash,
          positions,
          valueHistory,
          closedPositions: dedupeClosedPositions(closedPositions),
        },
      };
    });
  }, [isSelectedMarketOpen, marketFilter, stocks]);

  useEffect(() => {
    if (!notificationsEnabledRef.current || typeof Notification === "undefined")
      return;

    for (const stock of stocks) {
      if (stock.signalSource !== "node-ecu" || !stock.signalAction) {
        continue;
      }
      const previous = signalSnapshotRef.current.get(stock.ticker);
      if (
        previous &&
        previous.action &&
        previous.action !== stock.signalAction
      ) {
        const confidence =
          stock.signalConfidence != null
            ? `${Math.round(stock.signalConfidence)}%`
            : "—";
        new Notification(`Signal change: ${stock.ticker}`, {
          body: `${previous.action} → ${stock.signalAction} (confidence ${confidence})`,
        });
      }
      signalSnapshotRef.current.set(stock.ticker, {
        action: stock.signalAction,
        source: stock.signalSource,
      });
    }
  }, [stocks]);

  async function fetchQuotesBatched(
    market: string,
    list: StockData[],
    shouldCancel: () => boolean,
    options?: { bypassCache?: boolean; symbolLimit?: number },
  ) {
    const symbols = list
      .map((stock) => stock.ticker)
      .filter(Boolean)
      .slice(0, options?.symbolLimit ?? list.length);

    setRefreshError(null);

    for (let index = 0; index < symbols.length; index += QUOTE_REQUEST_SYMBOL_BATCH_SIZE) {
      const batchSymbols = symbols.slice(index, index + QUOTE_REQUEST_SYMBOL_BATCH_SIZE);
      const {
        cachedQuotes,
        cachedPendingSymbols,
        uncachedSymbols,
      } = options?.bypassCache
          ? {
            cachedQuotes: [],
            cachedPendingSymbols: [],
            uncachedSymbols: batchSymbols,
          }
          : readLiveQuoteCache(market, batchSymbols);
      let quotes;

      if (cachedQuotes.length) {
        setStocks((prev) => mergeQuotes(prev, cachedQuotes));
        setLastSyncedAt(Date.now());
      }

      if (cachedPendingSymbols.length) {
        setStocks((prev) => markQuotesPending(prev, cachedPendingSymbols));
      }

      if (!uncachedSymbols.length) {
        if (cachedQuotes.length) {
          const head = cachedQuotes[0];
          const direction = head.changePercent >= 0 ? "up" : "down";
          setUpdateMsg(
            `${head.symbol} ${direction} ${Math.abs(head.changePercent).toFixed(2)}%`,
          );
        }
        continue;
      }

      try {
        quotes = await fetchStockQuotes(market, uncachedSymbols, {
          withSignals: true,
          timeoutMs: QUOTE_REQUEST_TIMEOUT_MS,
          retryCount: 0,
        });
      } catch (error) {
        if (!shouldCancel()) {
          const message = describeRefreshError(error);
          setRefreshError(message);
          setUpdateMsg(message);
          setStocks((prev) => markQuotesPending(prev, uncachedSymbols));
        }
        continue;
      }

      if (shouldCancel()) return;

      cacheLiveQuotes(market, quotes);
      setStocks((prev) => mergeQuotes(prev, quotes));
      const returnedSymbols = new Set(quotes.map((quote) => quote.symbol));
      const missingSymbols = uncachedSymbols.filter(
        (symbol) => !returnedSymbols.has(symbol),
      );
      if (missingSymbols.length) {
        cacheUnavailableLiveQuotes(market, missingSymbols);
        setStocks((prev) => markQuotesPending(prev, missingSymbols));
      }
      setLastSyncedAt(Date.now());
      if (quotes.length) {
        const head = quotes[0];
        const direction = head.changePercent >= 0 ? "up" : "down";
        setUpdateMsg(
          `${quotes.length} quotes synced. ${head.symbol} ${direction} ${Math.abs(head.changePercent).toFixed(2)}%`,
        );
      }

      if (QUOTE_BATCH_DELAY_MS > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, QUOTE_BATCH_DELAY_MS),
        );
        if (shouldCancel()) return;
      }
    }
  }

  function markQuotesPending(current: StockData[], symbols: string[]) {
    const pending = new Set(symbols);
    return current.map((stock) =>
      pending.has(stock.ticker)
        ? {
          ...stock,
          summary:
            !stock.summary || stock.summary === SYNCING_QUOTE_SUMMARY
              ? "Live quote unavailable. Retrying in background."
              : stock.summary,
          impact:
            !stock.impact ||
              stock.impact ===
                "Live data will refresh as the market-wide quote sync reaches this asset."
              ? "This symbol remains tracked and will retry on the next scheduled refresh."
              : stock.impact,
        }
        : stock,
    );
  }

  function mergeQuotes(
    current: StockData[],
    quotes: Array<{ symbol: string } & Partial<StockData>>,
  ): StockData[] {
    if (!quotes.length) return current;
    const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
    return current.map((stock) => {
      const quote = quoteMap.get(stock.ticker);
      if (!quote) return stock;
      const signalAction = quote.signalAction ?? stock.signalAction;
      const sameSignalAction = Boolean(
        signalAction && stock.signalAction === signalAction,
      );
      const signalEntryPrice = sameSignalAction
        ? (stock.signalEntryPrice ?? quote.signalEntryPrice)
        : (quote.signalEntryPrice ?? stock.signalEntryPrice);
      const signalEmittedAt = sameSignalAction
        ? (stock.signalEmittedAt ?? quote.signalEmittedAt)
        : (quote.signalEmittedAt ?? stock.signalEmittedAt);
      const nextPrice = quote.price ?? stock.price;
      const signalReturnPercent =
        signalEntryPrice && nextPrice
          ? Number(
            (
              ((nextPrice - signalEntryPrice) / signalEntryPrice) *
              100
            ).toFixed(2),
          )
          : (quote.signalReturnPercent ?? stock.signalReturnPercent);

      return {
        ...stock,
        price: nextPrice,
        changePercent: quote.changePercent ?? stock.changePercent,
        status: quote.status ?? stock.status,
        high52: quote.high52 ?? stock.high52,
        low52: quote.low52 ?? stock.low52,
        history: quote.history ?? stock.history,
        summary: quote.summary ?? stock.summary,
        impact: quote.impact ?? stock.impact,
        cap: quote.cap ?? stock.cap,
        peRatio: quote.peRatio ?? stock.peRatio,
        signalAction,
        signalConfidence: quote.signalConfidence ?? stock.signalConfidence,
        signalSource: quote.signalSource ?? stock.signalSource,
        signalEmittedAt,
        signalEntryPrice,
        signalReturnPercent,
      };
    });
  }

  const filteredStocks = useMemo(() => {
    return stocks.filter((stock) => {
      const matchesStatus =
        statusFilter === "All" || stock.status === statusFilter;
      const action = stock.signalAction ?? "Hold";
      const matchesSignal = signalFilter === "All" || action === signalFilter;
      return matchesStatus && matchesSignal;
    });
  }, [stocks, statusFilter, signalFilter]);

  const activeSimulatedPortfolio =
    simulatedPortfolios[marketFilter] ?? createEmptyPortfolio();

  const portfolioPositions = useMemo(
    () =>
      Object.values(activeSimulatedPortfolio.positions).filter((p) => p.quantity > 0).sort(
        (a, b) => b.marketValue - a.marketValue,
      ),
    [activeSimulatedPortfolio.positions],
  );

  const portfolio = useMemo(
    () => {
      const positionsValue = portfolioPositions.reduce(
        (sum, stock) => sum + stock.marketValue,
        0,
      );
      const investedAmount = portfolioPositions.reduce(
        (sum, stock) => sum + stock.investedAmount,
        0,
      );
      const cash = activeSimulatedPortfolio.cash ?? 0;
      const totalValue = positionsValue + cash;
      const startValue =
        activeSimulatedPortfolio.startValue ?? STARTING_PORTFOLIO_VALUE;
      const totalReturn = totalValue - startValue;
      const totalReturnPercent =
        startValue > 0
          ? Number(((totalReturn / startValue) * 100).toFixed(2))
          : 0;

      return {
        totalValue,
        cash,
        investedAmount,
        startValue,
        startedAt: activeSimulatedPortfolio.startedAt ?? null,
        totalReturn,
        totalReturnPercent,
        marketStatus: selectedMarketStatus,
        overallSignal: getOverallSignal(stocks),
        positionCount: portfolioPositions.length,
      };
    },
    [
      activeSimulatedPortfolio.cash,
      activeSimulatedPortfolio.startValue,
      activeSimulatedPortfolio.startedAt,
      marketFilter,
      marketClock,
      portfolioPositions,
      selectedMarketStatus,
      stocks,
    ],
  );

  const allocation = useMemo(() => {
    const total = portfolioPositions.reduce(
      (sum, stock) => sum + stock.marketValue,
      0,
    );
    return {
      total,
      items: portfolioPositions,
    };
  }, [portfolioPositions]);

  const filteredMarkets = useMemo(() => {
    const query = marketQuery.trim().toLowerCase();
    if (!query) return markets;
    return markets.filter(
      (market) =>
        market.label.toLowerCase().includes(query) ||
        market.code.toLowerCase().includes(query),
    );
  }, [markets, marketQuery]);

  useEffect(() => {
    if (!selectedStock) return;
    const stillVisible = filteredStocks.some(
      (stock) => stock.ticker === selectedStock.ticker,
    );
    if (!stillVisible) {
      setSelectedStock(null);
    }
  }, [filteredStocks, selectedStock]);

  const selectedMarketLabel = markets.find((m) => m.code === marketFilter)?.label ?? null;
  const visibleSignalHistory = useMemo(
    () =>
      marketFilter
        ? signalHistory.filter(
          (event) => event.scopeCode === marketFilter || event.signal.market === marketFilter,
        )
        : signalHistory,
    [marketFilter, signalHistory],
  );
  const totalValue = portfolio.totalValue ?? 0;
  const positionCount = portfolio.positionCount ?? 0;
  const valueHistory = activeSimulatedPortfolio.valueHistory ?? [];
  const filteredValueHistory = (() => {
    if (valueHistory.length === 0) return valueHistory;
    const durationMs: Record<"1W" | "1M" | "3M", number> = {
      "1W": 7 * 24 * 60 * 60_000,
      "1M": 30 * 24 * 60 * 60_000,
      "3M": 90 * 24 * 60 * 60_000,
    };
    if (chartTimeframe === "All") {
      return valueHistory;
    }
    const latest = valueHistory[valueHistory.length - 1]?.t ?? 0;
    const cutoff = latest - durationMs[chartTimeframe];
    const firstBeforeCutoff = [...valueHistory]
      .reverse()
      .find((point) => point.t < cutoff);
    const windowed = valueHistory.filter((point) => point.t >= cutoff);
    if (firstBeforeCutoff && windowed.length) {
      return [firstBeforeCutoff, ...windowed];
    }
    return windowed.length > 1
      ? windowed
      : valueHistory.slice(Math.max(0, valueHistory.length - 2));
  })();
  const totalReturn =
    Math.abs(portfolio.totalReturn ?? 0) < DISPLAY_ZERO_THRESHOLD
      ? 0
      : (portfolio.totalReturn ?? 0);
  const totalReturnPercent =
    Math.abs(portfolio.totalReturnPercent ?? 0) < DISPLAY_ZERO_THRESHOLD
      ? 0
      : (portfolio.totalReturnPercent ?? 0);
  const isStale =
    !loading &&
    (Boolean(refreshError) ||
      (lastSyncedAt !== null && marketClock - lastSyncedAt > STALE_AFTER_MS));
  const lastSyncedLabel = lastSyncedAt
    ? formatSyncTime(lastSyncedAt)
    : "Waiting for first sync";

  const portfolioStartedAt = portfolio.startedAt ?? null;
  const portfolioStartLabel = portfolioStartedAt
    ? new Date(portfolioStartedAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-muted-foreground animate-pulse">
            <TrendingUp className="h-8 w-8" />
            <p>Gathering market intelligence...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <Navbar />
      <aside
        className={`fixed left-0 top-24 z-40 max-h-[calc(100vh-7rem)] border border-border/60 bg-card shadow-lg transition-all ${
          signalsMenuOpen ? "w-80" : "w-10"
        }`}
      >
        <button
          className="flex h-10 w-full items-center justify-between px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
          onClick={() => setSignalsMenuOpen((open) => !open)}
        >
          {signalsMenuOpen && <span>Signal History</span>}
          <span>{signalsMenuOpen ? "‹" : "›"}</span>
        </button>
        {signalsMenuOpen && (
          <div className="max-h-[calc(100vh-10rem)] overflow-y-auto border-t border-border/60">
            {visibleSignalHistory.length ? (
              visibleSignalHistory.map((event) => {
                const signal = event.signal;
                const action = signal.signalAction ?? "Hold";
                const status = signal.status ?? "Stable";
                return (
                  <div key={event.id} className="border-b border-border/50 p-3 text-xs last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-foreground">
                        {event.symbol}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {event.scopeCode}
                      </span>
                    </div>
                    <div className="mt-1 font-medium">
                      {action} · {status} · {formatMaybeCurrency(signal.price)}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {formatSignalTime(event.emittedAt)}
                      {signal.signalConfidence != null &&
                        ` · ${Math.round(Number(signal.signalConfidence))}%`}
                    </div>
                    {signal.summary && (
                      <div className="mt-1 line-clamp-2 text-muted-foreground">
                        {signal.summary}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-3 text-xs text-muted-foreground">
                No signals emitted yet.
              </div>
            )}
          </div>
        )}
      </aside>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        {/* Top Summary Bar */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6"
        >
          <div>
            <h1 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Portfolio Value {selectedMarketLabel && `— ${selectedMarketLabel}`}
            </h1>
            <div className="flex items-baseline gap-4">
              <span className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground">
                {marketFilter ? formatMaybeCurrency(totalValue) : "—"}
              </span>
              {marketFilter && (
                <div
                  className={`text-sm font-medium ${totalReturn >= 0 ? "text-primary" : "text-destructive"
                    }`}
                >
                  {totalReturn >= 0 ? "+" : ""}
                  {formatMaybeCurrency(totalReturn)} ({formatPercent(totalReturnPercent)}%)
                </div>
              )}
            </div>
            {marketFilter && (
              <p className="mt-2 text-sm text-muted-foreground">
                {positionCount} simulated positions ·{" "}
                {formatMaybeCurrency(portfolio.cash)} cash available
                {portfolioStartLabel && (
                  <> · started {portfolioStartLabel}</>
                )}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {marketFilter ? <>Last synced: {lastSyncedLabel}</> : "Select an exchange market to view portfolio data"}
            </p>
          </div>

          <div className="flex items-center gap-6 bg-card border border-border/50 rounded-2xl px-6 py-4 shadow-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Market Status
              </div>
              <div className="font-medium">{marketFilter ? portfolio.marketStatus : "—"}</div>
            </div>
            <div className="w-px h-8 bg-border/60"></div>
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                <LineChart className="h-3.5 w-3.5" /> Overall Signal
              </div>
              <div className="font-medium">{marketFilter ? portfolio.overallSignal : "—"}</div>
            </div>
          </div>
        </motion.header>

        {/* Portfolio Tabs: Cumulative Returns Chart | Operations History */}
        <Tabs value={portfolioTab} onValueChange={(v) => setPortfolioTab(v as "chart" | "history" | "stats")} className="mb-8">
          <TabsList className="mb-4">
            <TabsTrigger value="chart">Cumulative Returns</TabsTrigger>
            <TabsTrigger value="history">Operations History</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
          </TabsList>

          <TabsContent value="chart">
            {valueHistory.length > 1 && (() => {
              const chartData = filteredValueHistory;
              const first = chartData[0].v;
              const returnData = chartData.map((point) => ({
                t: point.t,
                r: first > 0 ? Number((((point.v - first) / first) * 100).toFixed(2)) : 0,
              }));
              const lastReturn = returnData[returnData.length - 1]?.r ?? 0;
              const isUp = lastReturn >= 0;
              const strokeColor = isUp ? "hsl(var(--primary))" : "hsl(var(--destructive))";
              const gradientId = "portfolioGradient";
              const timeframes = ["1W", "1M", "3M", "All"] as const;
              const spanMs = chartData[chartData.length - 1].t - chartData[0].t;
              const tickFmt = (t: number) => {
                const d = new Date(t);
                if (spanMs > 20 * 60 * 60_000) {
                  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                }
                return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
              };
              const tooltipFmt = (t: number) => {
                const d = new Date(t);
                if (spanMs > 20 * 60 * 60_000) {
                  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                }
                return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
              };
              return (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-8 bg-card border border-border/50 rounded-2xl px-6 py-4 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Cumulative Returns
                    </span>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium ${isUp ? "text-primary" : "text-destructive"}`}>
                        {isUp ? "+" : ""}
                        {formatPercent(lastReturn)}% {chartTimeframe === "All" ? `since ${portfolioStartLabel ?? "inception"}` : `since start of ${chartTimeframe}`}
                      </span>
                      <div className="flex items-center gap-0.5">
                        {timeframes.map((tf) => (
                          <button
                            key={tf}
                            onClick={() => setChartTimeframe(tf)}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${chartTimeframe === tf
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:text-foreground"
                              }`}
                          >
                            {tf}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="h-36 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={returnData}
                        margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={strokeColor} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="t"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          scale="time"
                          tickFormatter={tickFmt}
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={60}
                        />
                        <YAxis domain={["auto", "auto"]} hide />
                        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload as { t: number; r: number };
                            return (
                              <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs shadow-md">
                                <div className="font-medium text-foreground">
                                  {d.r >= 0 ? "+" : ""}{formatPercent(d.r)}%
                                </div>
                                <div className="text-muted-foreground">{tooltipFmt(d.t)}</div>
                              </div>
                            );
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="r"
                          stroke={strokeColor}
                          strokeWidth={2}
                          fill={`url(#${gradientId})`}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>
              );
            })()}
          </TabsContent>

          <TabsContent value="history">
            {(() => {
              const closed = (activeSimulatedPortfolio?.closedPositions ?? []).filter((c) => c.quantity > 0);
              const open = portfolioPositions;
              if (closed.length === 0 && open.length === 0) {
                return (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                    No operations yet. Start a portfolio to track trades.
                  </div>
                );
              }
              const allRows: Array<{ ticker: string; name?: string; quantity: number; entryPrice: number; exitPrice?: number; pnl?: number; pnlPct?: number; openedAt: number; closedAt?: number; status: "Open" | "Closed" }> = [
                ...open.map((p) => ({
                  ticker: p.ticker,
                  name: p.name,
                  quantity: p.quantity,
                  entryPrice: p.entryPrice,
                  exitPrice: undefined,
                  pnl: p.marketValue - p.investedAmount,
                  pnlPct: p.investedAmount > 0 ? (p.marketValue - p.investedAmount) / p.investedAmount : 0,
                  openedAt: p.openedAt,
                  closedAt: undefined,
                  status: "Open" as const,
                })),
                ...closed.slice().reverse().map((c) => ({
                  ticker: c.ticker,
                  name: c.name,
                  quantity: c.quantity,
                  entryPrice: c.entryPrice,
                  exitPrice: c.exitPrice,
                  pnl: c.proceeds - c.investedAmount,
                  pnlPct: c.investedAmount > 0 ? (c.proceeds - c.investedAmount) / c.investedAmount : 0,
                  openedAt: c.openedAt,
                  closedAt: c.closedAt,
                  status: "Closed" as const,
                })),
              ];
              const dedupedRows = (() => {
                const seen = new Set<string>();
                return allRows.filter((row) => {
                  const key = [
                    row.ticker.trim().toUpperCase(),
                    row.status,
                    rounded(row.quantity, 6),
                    rounded(row.entryPrice, 4),
                    rounded(row.exitPrice ?? 0, 4),
                    toUtcDayKey(row.openedAt),
                    row.closedAt != null ? toUtcDayKey(row.closedAt) : "open",
                  ].join("|");

                  if (seen.has(key)) {
                    return false;
                  }

                  seen.add(key);
                  return true;
                });
              })();
              const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
              const fmtMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
              return (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                        <th className="text-left px-4 py-3 font-medium">Ticker</th>
                        <th className="text-right px-4 py-3 font-medium">Qty</th>
                        <th className="text-right px-4 py-3 font-medium">Entry</th>
                        <th className="text-right px-4 py-3 font-medium">Exit</th>
                        <th className="text-right px-4 py-3 font-medium">Return</th>
                        <th className="text-right px-4 py-3 font-medium">Opened</th>
                        <th className="text-right px-4 py-3 font-medium">Closed</th>
                        <th className="text-right px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dedupedRows.map((row, i) => (
                        <tr key={`${row.ticker}-${i}`} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-mono font-semibold">{row.ticker}</td>
                          <td className="px-4 py-3 text-right">{formatQuantity(row.quantity)}</td>
                          <td className="px-4 py-3 text-right">{fmtMoney(row.entryPrice)}</td>
                          <td className="px-4 py-3 text-right">{row.exitPrice != null ? fmtMoney(row.exitPrice) : "—"}</td>
                          <td className={`px-4 py-3 text-right font-medium ${(row.pnl ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {row.pnl != null ? `${(row.pnl ?? 0) >= 0 ? "+" : ""}${fmtMoney(row.pnl)} (${((row.pnlPct ?? 0) * 100).toFixed(1)}%)` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmtDate(row.openedAt)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{row.closedAt != null ? fmtDate(row.closedAt) : "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${row.status === "Open" ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </TabsContent>

          <TabsContent value="stats">
            {(() => {
              const closed = (activeSimulatedPortfolio?.closedPositions ?? []).filter((c) => c.quantity > 0);
              const vh = valueHistory;

              // --- Closed-trade metrics ---
              const wins = closed.filter((c) => c.proceeds - c.investedAmount > 0);
              const losses = closed.filter((c) => c.proceeds - c.investedAmount <= 0);
              const grossProfit = wins.reduce((s, c) => s + (c.proceeds - c.investedAmount), 0);
              const grossLoss = Math.abs(losses.reduce((s, c) => s + (c.proceeds - c.investedAmount), 0));
              const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null;
              const totalTrades = closed.length;
              const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : null;
              // --- Value-history metrics ---
              const startValue = activeSimulatedPortfolio?.startValue ?? STARTING_PORTFOLIO_VALUE;
              const currentValue = (activeSimulatedPortfolio?.cash ?? 0) +
                Object.values(activeSimulatedPortfolio?.positions ?? {}).reduce((s, p) => s + p.marketValue, 0);

              // Max drawdown from valueHistory
              let maxDrawdown = 0;
              let peak = vh[0]?.v ?? 0;
              for (const pt of vh) {
                if (pt.v > peak) peak = pt.v;
                const dd = peak > 0 ? (peak - pt.v) / peak : 0;
                if (dd > maxDrawdown) maxDrawdown = dd;
              }

              // Monthly return: compounded from total elapsed time
              const firstT = vh[0]?.t;
              const lastT = vh[vh.length - 1]?.t;
              const elapsedMs = firstT && lastT ? lastT - firstT : 0;
              const elapsedMonths = elapsedMs / (30.44 * 24 * 3_600_000);
              const totalReturn = startValue > 0 ? (currentValue - startValue) / startValue : 0;
              const monthlyReturn = elapsedMonths >= 0.5 && startValue > 0
                ? (Math.pow(1 + totalReturn, 1 / elapsedMonths) - 1) * 100
                : null;

              // Sharpe, annualised from the actual spacing between value snapshots.
              let sharpe: number | null = null;
              if (vh.length >= 5) {
                const periodReturns: number[] = [];
                const intervals: number[] = [];
                for (let i = 1; i < vh.length; i++) {
                  const prev = vh[i - 1].v;
                  const curr = vh[i].v;
                  const dt = vh[i].t - vh[i - 1].t;
                  if (prev > 0 && dt > 0) {
                    periodReturns.push((curr - prev) / prev);
                    intervals.push(dt);
                  }
                }
                if (periodReturns.length >= 2) {
                  const mean = periodReturns.reduce((s, r) => s + r, 0) / periodReturns.length;
                  const variance = periodReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (periodReturns.length - 1);
                  const std = Math.sqrt(variance);
                  const avgInterval =
                    intervals.reduce((sum, dt) => sum + dt, 0) / intervals.length;
                  const periodsPerYear =
                    avgInterval > 0 ? (365.25 * 24 * 3_600_000) / avgInterval : 0;
                  sharpe = std > 0 && periodsPerYear > 0
                    ? (mean / std) * Math.sqrt(periodsPerYear)
                    : null;
                }
              }
              const riskAdjustedReturn =
                sharpe === null ? null : totalReturn * Math.max(sharpe, 0);

              const fmt = (v: number | null, decimals = 2, suffix = "") =>
                v === null ? "—" : `${v.toFixed(decimals)}${suffix}`;
              const fmtPF = (v: number | null) =>
                v === null ? "—" : v === Infinity ? "∞" : v.toFixed(2);

              const stats: Array<{ label: string; value: string; sub?: string; positive?: boolean | null }> = [
                { label: "Profit Factor", value: fmtPF(profitFactor), sub: "gross profit / gross loss", positive: profitFactor === null ? null : profitFactor >= 1 },
                { label: "Risk Adjusted", value: riskAdjustedReturn === null ? "—" : `${riskAdjustedReturn >= 0 ? "+" : ""}${(riskAdjustedReturn * 100).toFixed(2)}%`, sub: "return adjusted by Sharpe", positive: riskAdjustedReturn === null ? null : riskAdjustedReturn >= 0 },
                { label: "Monthly Return", value: monthlyReturn === null ? "—" : `${monthlyReturn >= 0 ? "+" : ""}${monthlyReturn.toFixed(2)}%`, sub: "compounded", positive: monthlyReturn === null ? null : monthlyReturn >= 0 },
                { label: "Total Trades", value: String(totalTrades), sub: `${wins.length}W / ${losses.length}L`, positive: null },
                { label: "Win Rate", value: fmt(winRate, 1, "%"), sub: "closed trades", positive: winRate === null ? null : winRate >= 50 },
                { label: "Max Drawdown", value: fmt(maxDrawdown * 100, 1, "%"), sub: "peak-to-trough", positive: maxDrawdown === 0 ? null : false },
                { label: "Sharpe Ratio", value: fmt(sharpe, 2), sub: "annualised", positive: sharpe === null ? null : sharpe >= 1 },
                { label: "Total Return", value: `${totalReturn >= 0 ? "+" : ""}${(totalReturn * 100).toFixed(2)}%`, sub: `${(currentValue - startValue) >= 0 ? "+" : ""}$${(currentValue - startValue).toFixed(2)} net`, positive: totalReturn >= 0 },
              ];

              const hasData = totalTrades > 0 || vh.length >= 2;

              return (
                <div>
                  {!hasData && (
                    <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                      No data yet. Statistics will appear once the portfolio has history.
                    </div>
                  )}
                  {hasData && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {stats.map((s) => (
                        <div key={s.label} className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{s.label}</span>
                          <span className={`text-2xl font-semibold tabular-nums ${s.positive === null ? "text-foreground" : s.positive ? "text-emerald-500" : "text-red-500"}`}>
                            {s.value}
                          </span>
                          {s.sub && <span className="text-xs text-muted-foreground">{s.sub}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </TabsContent>
        </Tabs>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full md:max-w-3xl">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Exchange Market
              </label>
              <div className="relative" ref={marketMenuRef}>
                <button
                  type="button"
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
                  onClick={() => {
                    setMarketMenuOpen((open) => !open);
                    setMarketQuery("");
                  }}
                >
                  <span className="truncate">
                    {selectedMarketLabel ?? "Select market"}
                  </span>
                  <span className="text-muted-foreground">⌄</span>
                </button>
                {marketMenuOpen && (
                  <div
                    className="absolute z-50 mt-1 max-h-72 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <div className="sticky top-0 z-10 bg-popover px-2 pt-2 pb-1">
                      <input
                        ref={marketSearchInputRef}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="Search markets"
                        value={marketQuery}
                        onChange={(event) => setMarketQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setMarketMenuOpen(false);
                        }}
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1">
                      {filteredMarkets.length ? (
                        filteredMarkets.map((market) => (
                          <button
                            key={market.code}
                            type="button"
                            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                            onClick={() => {
                              setMarketFilter(market.code);
                              setMarketMenuOpen(false);
                            }}
                          >
                            {market.label}
                          </button>
                        ))
                      ) : (
                        <div className="px-2 py-2 text-xs text-muted-foreground">
                          No markets found.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Status
              </label>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as StockStatus | "All")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Signal
              </label>
              <Select
                value={signalFilter}
                onValueChange={(value) =>
                  setSignalFilter(value as TradeSignal | "All")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All signals" />
                </SelectTrigger>
                <SelectContent>
                  {signalOptions.map((signal) => (
                    <SelectItem key={signal} value={signal}>
                      {signal}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Showing {filteredStocks.length} of {totalStocks || stocks.length}{" "}
            stocks
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredStocks.length === 0 ? (
                <div className="col-span-full bg-card border border-border/50 rounded-2xl p-6 text-sm text-muted-foreground">
                  No stocks match the current filters.
                </div>
              ) : (
                filteredStocks.map((stock, i) => {
                  const changePercent = Number.isFinite(stock.changePercent)
                    ? (stock.changePercent as number)
                    : null;
                  const status = stock.status ?? "Stable";
                  const signalAction = stock.signalAction ?? "Hold";
                  const summary = stock.summary ?? SYNCING_QUOTE_SUMMARY;

                  return (
                    <motion.button
                      key={stock.ticker}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setSelectedStock(stock)}
                      className={`text-left group relative bg-card border rounded-2xl p-5 transition-all duration-300 hover:shadow-md hover:border-primary/30 ${selectedStock?.ticker === stock.ticker ? "ring-2 ring-primary/20 border-primary/40" : "border-border/60 shadow-sm"}`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">
                            {stock.ticker}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {stock.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={status} />
                          <SignalBadge action={signalAction} />
                        </div>
                      </div>

                      <div className="flex items-baseline justify-between mb-4">
                        <span className="text-2xl font-medium">
                          {formatMaybeCurrency(stock.price)}
                        </span>
                        <span
                          className={`text-sm font-medium ${changePercent === null
                            ? "text-muted-foreground"
                            : changePercent >= 0
                              ? "text-primary"
                              : "text-destructive"
                            }`}
                        >
                          {changePercent === null
                            ? "—"
                            : `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`}
                        </span>
                      </div>

                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-1">
                        {summary}
                      </p>
                    </motion.button>
                  );
                })
              )}
            </div>

            <div
              className={`bg-card border rounded-2xl p-4 flex items-center gap-4 text-sm shadow-sm ${isStale ? "border-[#ffecb3] bg-[#fff8e1]/50 dark:border-[#f57f17]/30 dark:bg-[#f57f17]/10" : "border-border/50"}`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <TrendingUp size={16} />
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">
                  <strong className="text-foreground font-medium">
                    {isStale ? "Stale:" : "Live:"}
                  </strong>{" "}
                  {updateMsg}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last synced {lastSyncedLabel}
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm">
              <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                <LineChart className="h-4 w-4 text-primary" />
                Simulated Positions
              </h3>
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                Positioning opens only on fresh Buy + Rising signals while the selected exchange market is open. Available cash is split across new entries by Sharpe-weighted sizing, held positions stay untouched, and exits happen when that ticker no longer qualifies.
              </p>
              {allocation.total > 0 ? (
                <div className="space-y-3">
                  {allocation.items.map((stock) => {
                    const percent = Math.min(
                      100,
                      Math.max(
                        2,
                        Math.round(
                          (stock.marketValue / allocation.total) * 100,
                        ),
                      ),
                    );
                    return (
                      <div
                        key={stock.ticker}
                        className="space-y-1"
                      >
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <div>
                            <span className="font-medium text-foreground">
                              {stock.ticker}
                            </span>
                            <span className="ml-2 text-muted-foreground">
                              {formatQuantity(stock.quantity)} units
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">
                              {formatMaybeCurrency(stock.marketValue)}
                            </div>
                            <div className="text-muted-foreground">
                              Entry {formatMaybeCurrency(stock.entryPrice)}
                            </div>
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percent}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="h-full bg-primary/80 rounded-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Positions will appear when this exchange market emits Buy +
                  Rising setups.
                </p>
              )}
            </div>

            <AnimatePresence mode="wait">
              {selectedStock ? (
                <motion.div
                  key={selectedStock.ticker}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-card border border-border/60 rounded-3xl p-6 shadow-sm sticky top-24"
                >
                  <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-6">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight">
                        {selectedStock.ticker}
                      </h2>
                      <p className="text-muted-foreground text-sm">
                        {selectedStock.name}
                      </p>
                    </div>
                    <StatusBadge status={selectedStock.status ?? "Stable"} />
                  </div>

                  <div className="h-32 w-full mb-6 relative group">
                    {selectedStock.history?.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsLineChart
                          data={selectedStock.history.map((price: number) => ({
                            price,
                          }))}
                        >
                          <YAxis domain={["dataMin", "dataMax"]} hide />
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={true}
                          />
                        </RechartsLineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                        Intraday series pending.
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent pointer-events-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-y-4 gap-x-2 mb-8 text-sm">
                    <div>
                      <span className="text-muted-foreground block mb-1">
                        Signal
                      </span>
                      <span className="font-medium">
                        {selectedStock.signalAction ?? "Hold"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">
                        Confidence
                      </span>
                      <span className="font-medium">
                        {selectedStock.signalConfidence != null
                          ? `${Math.round(selectedStock.signalConfidence)}%`
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">
                        Signal Emitted
                      </span>
                      <span className="font-medium">
                        {formatSignalTime(selectedStock.signalEmittedAt)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">
                        Entry Price
                      </span>
                      <span className="font-medium">
                        {formatMaybeCurrency(selectedStock.signalEntryPrice)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">
                        Market Cap
                      </span>
                      <span className="font-medium">
                        {selectedStock.cap ?? "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">
                        P/E Ratio
                      </span>
                      <span className="font-medium">
                        {selectedStock.peRatio != null
                          ? selectedStock.peRatio.toFixed(2)
                          : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">
                        52W High
                      </span>
                      <span className="font-medium">
                        {formatMaybeCurrency(selectedStock.high52)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">
                        52W Low
                      </span>
                      <span className="font-medium">
                        {formatMaybeCurrency(selectedStock.low52)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-muted/40 rounded-xl p-4">
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                        <Info className="h-4 w-4 text-primary" /> The Signal
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {selectedStock.summary ??
                          "Live insight will appear once quotes are synced."}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-2 text-foreground">
                        What this means for you
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {selectedStock.impact ??
                          "Watchlist impact is updating."}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="bg-muted/20 border border-dashed border-border/60 rounded-3xl p-8 h-[500px] flex flex-col items-center justify-center text-center sticky top-24">
                  <div className="h-12 w-12 rounded-full bg-card shadow-sm border border-border/50 flex items-center justify-center mb-4 text-muted-foreground">
                    <LineChart size={20} />
                  </div>
                  <p className="text-muted-foreground">
                    Select a stock from your portfolio to view detailed
                    intelligence.
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/40 bg-background/50 mt-auto py-4">
        <div className="container mx-auto px-4 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            System Health: Optimal
          </div>
          <div>
            Data as of{" "}
            {new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      </footer>
    </div>
  );
}
