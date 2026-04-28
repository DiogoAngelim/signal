import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/navbar";
import { ApiRequestError, fetchMarkets, fetchStockList, fetchStockQuotes, type MarketOption, type StockData, type StockStatus, type TradeSignal } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpRight, ArrowDownRight, Clock, TrendingUp, LineChart, Info } from "lucide-react";
import { LineChart as RechartsLineChart, Line, ResponsiveContainer, YAxis } from "recharts";

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value);
}

function formatMaybeCurrency(value?: number) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return formatCurrency(value as number);
}

type MarketSchedule = {
  timeZone: string;
  open: [number, number];
  close: [number, number];
  weekend: number[];
};

const MARKET_SCHEDULES: Array<{ match: RegExp; schedule: MarketSchedule }> = [
  { match: /CRYPTO/i, schedule: { timeZone: "UTC", open: [0, 0], close: [24, 0], weekend: [] } },
  { match: /NASDAQ|NYSE|AMEX|ARCA|BATS|IEX|NYSEAMERICAN|NYSEARCA|NASDAQGS|NASDAQGM|NASDAQCM|US\b/i, schedule: { timeZone: "America/New_York", open: [9, 30], close: [16, 0], weekend: [0, 6] } },
  { match: /TSX|TSXV|CSE|NEO|CANADA/i, schedule: { timeZone: "America/Toronto", open: [9, 30], close: [16, 0], weekend: [0, 6] } },
  { match: /LSE|LONDON|AIM|UNITED KINGDOM|\bUK\b/i, schedule: { timeZone: "Europe/London", open: [8, 0], close: [16, 30], weekend: [0, 6] } },
  { match: /EURONEXT|PARIS|AMSTERDAM|BRUSSELS|LISBON/i, schedule: { timeZone: "Europe/Paris", open: [9, 0], close: [17, 30], weekend: [0, 6] } },
  { match: /XETRA|FRANKFURT|GERMANY|DE\b/i, schedule: { timeZone: "Europe/Berlin", open: [9, 0], close: [17, 30], weekend: [0, 6] } },
  { match: /SIX|SWITZERLAND/i, schedule: { timeZone: "Europe/Zurich", open: [9, 0], close: [17, 30], weekend: [0, 6] } },
  { match: /OSLO|STOCKHOLM|HELSINKI|COPENHAGEN|NORDIC|OMX/i, schedule: { timeZone: "Europe/Stockholm", open: [9, 0], close: [17, 30], weekend: [0, 6] } },
  { match: /TSE|TOKYO|JAPAN|JP\b/i, schedule: { timeZone: "Asia/Tokyo", open: [9, 0], close: [15, 0], weekend: [0, 6] } },
  { match: /SSE|SHANGHAI|SZSE|SHENZHEN|CHINA|CN\b/i, schedule: { timeZone: "Asia/Shanghai", open: [9, 30], close: [15, 0], weekend: [0, 6] } },
  { match: /HKEX|HONG KONG|HK\b/i, schedule: { timeZone: "Asia/Hong_Kong", open: [9, 30], close: [16, 0], weekend: [0, 6] } },
  { match: /SGX|SINGAPORE/i, schedule: { timeZone: "Asia/Singapore", open: [9, 0], close: [17, 0], weekend: [0, 6] } },
  { match: /NSE|BSE|INDIA|IN\b/i, schedule: { timeZone: "Asia/Kolkata", open: [9, 15], close: [15, 30], weekend: [0, 6] } },
  { match: /ASX|AUSTRALIA|AU\b/i, schedule: { timeZone: "Australia/Sydney", open: [10, 0], close: [16, 0], weekend: [0, 6] } },
  { match: /NZX|NEW ZEALAND|NZ\b/i, schedule: { timeZone: "Pacific/Auckland", open: [10, 0], close: [16, 45], weekend: [0, 6] } },
  { match: /JSE|SOUTH AFRICA|ZA\b/i, schedule: { timeZone: "Africa/Johannesburg", open: [9, 0], close: [17, 0], weekend: [0, 6] } },
  { match: /BAHRAIN/i, schedule: { timeZone: "Asia/Bahrain", open: [10, 0], close: [14, 30], weekend: [5, 6] } },
  { match: /SAUDI|TADAWUL|KSA|KUWAIT|QATAR|OMAN/i, schedule: { timeZone: "Asia/Riyadh", open: [10, 0], close: [15, 0], weekend: [5, 6] } },
  { match: /UAE|ABU DHABI|DUBAI|DFM|ADX/i, schedule: { timeZone: "Asia/Dubai", open: [10, 0], close: [15, 0], weekend: [0, 6] } }
];

const DEFAULT_MARKET_SCHEDULE: MarketSchedule = {
  timeZone: "America/New_York",
  open: [9, 30],
  close: [16, 0],
  weekend: [0, 6]
};

const REFRESH_INTERVAL_MS = 60_000;
const STALE_AFTER_MS = REFRESH_INTERVAL_MS * 2;
const COMMISSION_RATE = 0.005;

function resolveMarketSchedule(market: string): MarketSchedule {
  const normalized = market.trim().toUpperCase();
  if (!normalized) return DEFAULT_MARKET_SCHEDULE;
  const match = MARKET_SCHEDULES.find((entry) => entry.match.test(normalized));
  return match?.schedule ?? DEFAULT_MARKET_SCHEDULE;
}

function getMarketStatus(market: string): "Open" | "Closed" {
  const schedule = resolveMarketSchedule(market);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const weekdayText = parts.find((part) => part.type === "weekday")?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayIndex = weekdayMap[weekdayText] ?? 0;

  if (schedule.weekend.includes(dayIndex)) {
    return "Closed";
  }

  const nowMinutes = hour * 60 + minute;
  const openMinutes = schedule.open[0] * 60 + schedule.open[1];
  const closeMinutes = schedule.close[0] * 60 + schedule.close[1];
  const isOpen = closeMinutes >= openMinutes
    ? nowMinutes >= openMinutes && nowMinutes < closeMinutes
    : nowMinutes >= openMinutes || nowMinutes < closeMinutes;

  return isOpen ? "Open" : "Closed";
}

function describeRefreshError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.timedOut) {
      return "Live data request timed out. Retrying shortly.";
    }

    if (error.status === 429) {
      return "Live data rate limited. Retrying shortly.";
    }

    if (error.status) {
      return `Live data unavailable (${error.status}). Retrying shortly.`;
    }
  }

  return "Live data unavailable. Retrying shortly.";
}

function formatSyncTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(timestamp);
}

function formatSignalTime(value?: string): string {
  if (!value) return "—";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(timestamp);
}

function StatusBadge({ status }: { status: StockStatus }) {
  const styles = {
    Stable: "bg-muted text-muted-foreground border-border",
    Rising: "bg-[#e8f5e9] text-[#2e7d32] border-[#c8e6c9] dark:bg-[#1b5e20]/20 dark:text-[#81c784] dark:border-[#2e7d32]/30",
    Watch: "bg-[#fff8e1] text-[#f57f17] border-[#ffecb3] dark:bg-[#f57f17]/10 dark:text-[#ffd54f] dark:border-[#f57f17]/30",
    Dip: "bg-[#ffebee] text-[#c62828] border-[#ffcdd2] dark:bg-[#c62828]/20 dark:text-[#e57373] dark:border-[#c62828]/30"
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${styles[status]}`}>
      {status}
    </span>
  );
}

function SignalBadge({ action }: { action: TradeSignal }) {
  const styles = {
    Buy: "bg-[#e3f2fd] text-[#1565c0] border-[#bbdefb] dark:bg-[#1565c0]/20 dark:text-[#90caf9] dark:border-[#1565c0]/30",
    Hold: "bg-muted text-muted-foreground border-border",
    Sell: "bg-[#ffebee] text-[#c62828] border-[#ffcdd2] dark:bg-[#c62828]/20 dark:text-[#ef9a9a] dark:border-[#c62828]/30"
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${styles[action]}`}>
      {action}
    </span>
  );
}

export default function Dashboard() {
  const [markets, setMarkets] = useState<MarketOption[]>([]);
  const [marketFilter, setMarketFilter] = useState("");
  const [marketQuery, setMarketQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StockStatus | "All">("All");
  const [signalFilter, setSignalFilter] = useState<TradeSignal | "All">("All");
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockData | null>(null);
  const [totalStocks, setTotalStocks] = useState(0);
  const [updateMsg, setUpdateMsg] = useState("Loading market data...");
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshInFlight = useRef(false);
  const stocksRef = useRef<StockData[]>([]);
  const marketFilterRef = useRef("");
  const signalSnapshotRef = useRef(new Map<string, { action?: TradeSignal; source?: string }>());
  const notificationsEnabledRef = useRef(false);
  const [marketClock, setMarketClock] = useState(() => Date.now());

  stocksRef.current = stocks;
  marketFilterRef.current = marketFilter;

  const statusOptions: Array<StockStatus | "All"> = ["All", "Stable", "Rising", "Watch", "Dip"];
  const signalOptions: Array<TradeSignal | "All"> = ["All", "Buy", "Hold", "Sell"];

  const portfolioPositions = useMemo(() => {
    return stocks
      .filter((stock) =>
        stock.signalAction === "Buy"
        && stock.status === "Rising"
        && Number.isFinite(stock.price)
      )
      .map((stock) => {
        const quantity = 1;
        const price = stock.price ?? 0;
        const signalEntryPrice = stock.signalEntryPrice ?? price;
        const grossMarketValue = price * quantity;
        const grossSignalCostBasis = signalEntryPrice * quantity;
        const exitCommission = grossMarketValue * COMMISSION_RATE;
        const entryCommission = grossSignalCostBasis * COMMISSION_RATE;
        const marketValue = grossMarketValue - exitCommission;
        const signalCostBasis = grossSignalCostBasis + entryCommission;
        const signalReturnDollar = marketValue - signalCostBasis;

        return {
          ...stock,
          quantity,
          entryCommission,
          exitCommission,
          marketValue,
          signalEntryPrice,
          signalCostBasis,
          signalReturnDollar
        };
      });
  }, [stocks]);

  const portfolio = useMemo(() => {
    const totalValue = portfolioPositions.reduce((sum, stock) => sum + stock.marketValue, 0);
    const signalCostBasis = portfolioPositions.reduce((sum, stock) => sum + stock.signalCostBasis, 0);
    const signalReturnDollar = portfolioPositions.reduce((sum, stock) => sum + stock.signalReturnDollar, 0);
    const signalReturnPercent = signalCostBasis > 0
      ? Number(((signalReturnDollar / signalCostBasis) * 100).toFixed(2))
      : 0;
    const totalQuantity = portfolioPositions.reduce((sum, stock) => sum + stock.quantity, 0);

    const overallSignal = !portfolioPositions.length
      ? "No Buy Setup"
      : signalReturnPercent >= 1
        ? "Buy Momentum"
        : "Accumulating";

    return {
      totalValue,
      signalCostBasis,
      signalReturnDollar,
      signalReturnPercent,
      marketStatus: getMarketStatus(marketFilter),
      overallSignal,
      positionCount: portfolioPositions.length,
      totalQuantity
    };
  }, [portfolioPositions, marketFilter, marketClock]);

  const isStale = !loading && (
    Boolean(refreshError)
    || (lastSyncedAt !== null && marketClock - lastSyncedAt > STALE_AFTER_MS)
  );
  const lastSyncedLabel = lastSyncedAt ? formatSyncTime(lastSyncedAt) : "Waiting for first sync";

  async function refreshVisibleQuotes(reason: string) {
    const currentStocks = stocksRef.current;
    const currentMarket = marketFilterRef.current;

    if (!currentStocks.length || !currentMarket || refreshInFlight.current) {
      return;
    }

    refreshInFlight.current = true;
    setUpdateMsg(reason);

    try {
      await fetchQuotesBatched(currentMarket, currentStocks, () => false);
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
        if (data.length && !data.find((item) => item.code === marketFilter)) {
          setMarketFilter(data[0].code);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setMarkets([]);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      notificationsEnabledRef.current = true;
      return;
    }
    if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        notificationsEnabledRef.current = permission === "granted";
      });
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setMarketClock(Date.now());
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStocks() {
      if (!marketFilter) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setRefreshError(null);
      setLastSyncedAt(null);
      setStocks([]);
      setSelectedStock(null);
      setUpdateMsg("Syncing live market data...");

      try {
        const listResponse = await fetchStockList(marketFilter, 0, 24);
        if (cancelled) return;

        setTotalStocks(listResponse.total);
        const baseStocks = listResponse.items.map((item) => ({
          ...item,
          ticker: item.symbol
        }));
        setStocks(baseStocks);
        setLoading(false);
        await fetchQuotesBatched(marketFilter, baseStocks, () => cancelled);
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
    if (!stocks.length) return;
    const interval = setInterval(() => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      setUpdateMsg("Refreshing live market data...");
      fetchQuotesBatched(marketFilter, stocks, () => false).finally(() => {
        refreshInFlight.current = false;
      });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [stocks, marketFilter]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const maybeRefresh = (reason: string) => {
      const needsRefresh = !lastSyncedAt
        || marketClock - lastSyncedAt >= REFRESH_INTERVAL_MS
        || Boolean(refreshError);

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
    const updated = stocks.find((stock) => stock.ticker === selectedStock.ticker);
    if (updated) {
      setSelectedStock(updated);
    }
  }, [stocks, selectedStock]);

  useEffect(() => {
    if (!notificationsEnabledRef.current || typeof Notification === "undefined") return;

    for (const stock of stocks) {
      if (stock.signalSource !== "node-ecu" || !stock.signalAction) {
        continue;
      }
      const previous = signalSnapshotRef.current.get(stock.ticker);
      if (previous && previous.action && previous.action !== stock.signalAction) {
        const confidence = stock.signalConfidence != null
          ? `${Math.round(stock.signalConfidence)}%`
          : "—";
        new Notification(`Signal change: ${stock.ticker}`, {
          body: `${previous.action} → ${stock.signalAction} (confidence ${confidence})`
        });
      }
      signalSnapshotRef.current.set(stock.ticker, {
        action: stock.signalAction,
        source: stock.signalSource
      });
    }
  }, [stocks]);

  async function fetchQuotesBatched(
    market: string,
    list: StockData[],
    shouldCancel: () => boolean
  ) {
    const symbols = list.map((stock) => stock.ticker).filter(Boolean);
    const batchSize = 4;
    const delayMs = 700;

    setRefreshError(null);

    for (let index = 0; index < symbols.length; index += batchSize) {
      const batch = symbols.slice(index, index + batchSize);
      let quotes;

      try {
        quotes = await fetchStockQuotes(market, batch, { withSignals: true });
      } catch (error) {
        if (!shouldCancel()) {
          const message = describeRefreshError(error);
          setRefreshError(message);
          setUpdateMsg(message);
        }
        return;
      }

      if (shouldCancel()) return;

      setStocks((prev) => mergeQuotes(prev, quotes));
      setLastSyncedAt(Date.now());
      if (quotes.length) {
        const head = quotes[0];
        const direction = head.changePercent >= 0 ? "up" : "down";
        setUpdateMsg(`${head.symbol} ${direction} ${Math.abs(head.changePercent).toFixed(2)}%`);
      }

      if (delayMs > 0 && index + batchSize < symbols.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (shouldCancel()) return;
      }
    }
  }

  function mergeQuotes(current: StockData[], quotes: Array<{ symbol: string } & Partial<StockData>>): StockData[] {
    if (!quotes.length) return current;
    const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
    return current.map((stock) => {
      const quote = quoteMap.get(stock.ticker);
      if (!quote) return stock;
      const signalAction = quote.signalAction ?? stock.signalAction;
      const sameSignalAction = Boolean(signalAction && stock.signalAction === signalAction);
      const signalEntryPrice = sameSignalAction
        ? stock.signalEntryPrice ?? quote.signalEntryPrice
        : quote.signalEntryPrice ?? stock.signalEntryPrice;
      const signalEmittedAt = sameSignalAction
        ? stock.signalEmittedAt ?? quote.signalEmittedAt
        : quote.signalEmittedAt ?? stock.signalEmittedAt;
      const nextPrice = quote.price ?? stock.price;
      const signalReturnPercent = signalEntryPrice && nextPrice
        ? Number((((nextPrice - signalEntryPrice) / signalEntryPrice) * 100).toFixed(2))
        : quote.signalReturnPercent ?? stock.signalReturnPercent;

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
        signalReturnPercent
      };
    });
  }

  const filteredStocks = useMemo(() => {
    return stocks.filter((stock) => {
      const matchesStatus = statusFilter === "All" || stock.status === statusFilter;
      const action = stock.signalAction ?? "Hold";
      const matchesSignal = signalFilter === "All" || action === signalFilter;
      return matchesStatus && matchesSignal;
    });
  }, [stocks, statusFilter, signalFilter]);

  const allocation = useMemo(() => {
    const total = portfolioPositions.reduce((sum, stock) => sum + stock.marketValue, 0);
    return {
      total,
      items: portfolioPositions.slice(0, 5)
    };
  }, [portfolioPositions]);

  const filteredMarkets = useMemo(() => {
    const query = marketQuery.trim().toLowerCase();
    if (!query) return markets;
    return markets.filter((market) =>
      market.label.toLowerCase().includes(query) || market.code.toLowerCase().includes(query)
    );
  }, [markets, marketQuery]);

  useEffect(() => {
    if (!selectedStock) return;
    const stillVisible = filteredStocks.some((stock) => stock.ticker === selectedStock.ticker);
    if (!stillVisible) {
      setSelectedStock(null);
    }
  }, [filteredStocks, selectedStock]);

  const totalValue = portfolio.totalValue ?? 0;
  const totalChange = portfolio.signalReturnDollar ?? 0;
  const totalChangePercent = portfolio.signalReturnPercent ?? 0;
  const positionCount = portfolio.positionCount ?? 0;
  const totalQuantity = portfolio.totalQuantity ?? 0;

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

      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        {/* Top Summary Bar */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6"
        >
          <div>
            <h1 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Portfolio Value</h1>
            <div className="flex items-baseline gap-4">
              <span className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground">
                {formatMaybeCurrency(totalValue)}
              </span>
              <div className={`flex items-center text-sm font-medium ${totalChange >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {totalChange >= 0 ? <ArrowUpRight className="h-4 w-4 mr-1" /> : <ArrowDownRight className="h-4 w-4 mr-1" />}
                {formatMaybeCurrency(Math.abs(totalChange))} ({totalChangePercent}%) since signal
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {positionCount} positions · {totalQuantity} shares · Buy + Rising only · signal-entry basis · 0.5% commission included
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Last synced: {lastSyncedLabel}
            </p>
          </div>

          <div className="flex items-center gap-6 bg-card border border-border/50 rounded-2xl px-6 py-4 shadow-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Market Status
              </div>
              <div className="font-medium">{portfolio.marketStatus}</div>
            </div>
            <div className="w-px h-8 bg-border/60"></div>
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                <LineChart className="h-3.5 w-3.5" /> Overall Signal
              </div>
              <div className="font-medium">{portfolio.overallSignal}</div>
            </div>
          </div>
        </motion.header>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full md:max-w-3xl">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Market</label>
              <Select
                value={marketFilter}
                onValueChange={setMarketFilter}
                onOpenChange={(open) => {
                  if (open) {
                    setMarketQuery("");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select market" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <div className="sticky top-0 z-10 bg-popover px-2 pt-2 pb-1">
                    <input
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="Search markets"
                      value={marketQuery}
                      onChange={(event) => setMarketQuery(event.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                    />
                  </div>
                  {filteredMarkets.length ? (
                    filteredMarkets.map((market) => (
                      <SelectItem key={market.code} value={market.code}>
                        {market.label}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      No markets found.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StockStatus | "All")}>
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
              <label className="text-xs font-medium text-muted-foreground">Signal</label>
              <Select value={signalFilter} onValueChange={(value) => setSignalFilter(value as TradeSignal | "All")}>
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
            Showing {filteredStocks.length} of {totalStocks || stocks.length} stocks
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
                  const changePercent = Number.isFinite(stock.changePercent) ? (stock.changePercent as number) : null;
                  const status = stock.status ?? "Stable";
                  const signalAction = stock.signalAction ?? "Hold";
                  const summary = stock.summary ?? "Fetching live quote...";

                  return (
                    <motion.button
                      key={stock.ticker}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setSelectedStock(stock)}
                      className={`text-left group relative bg-card border rounded-2xl p-5 transition-all duration-300 hover:shadow-md hover:border-primary/30 ${selectedStock?.ticker === stock.ticker ? 'ring-2 ring-primary/20 border-primary/40' : 'border-border/60 shadow-sm'}`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">{stock.ticker}</h3>
                          <p className="text-sm text-muted-foreground">{stock.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={status} />
                          <SignalBadge action={signalAction} />
                        </div>
                      </div>

                      <div className="flex items-baseline justify-between mb-4">
                        <span className="text-2xl font-medium">{formatMaybeCurrency(stock.price)}</span>
                        <span
                          className={`text-sm font-medium ${changePercent === null ? "text-muted-foreground" : changePercent >= 0 ? "text-primary" : "text-destructive"
                            }`}
                        >
                          {changePercent === null ? "—" : `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`}
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

            <div className={`bg-card border rounded-2xl p-4 flex items-center gap-4 text-sm shadow-sm ${isStale ? "border-[#ffecb3] bg-[#fff8e1]/50 dark:border-[#f57f17]/30 dark:bg-[#f57f17]/10" : "border-border/50"}`}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <TrendingUp size={16} />
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">
                  <strong className="text-foreground font-medium">{isStale ? "Stale:" : "Live:"}</strong> {updateMsg}
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
                Allocation Overview
              </h3>
              {allocation.total > 0 ? (
                <div className="space-y-3">
                  {allocation.items.map((stock) => {
                    const percent = Math.min(100, Math.max(2, Math.round((stock.marketValue / allocation.total) * 100)));
                    return (
                      <div key={stock.ticker} className="flex items-center gap-3">
                        <div className="w-12 text-xs font-medium text-muted-foreground">{stock.ticker}</div>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percent}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="h-full bg-primary/80 rounded-full"
                          />
                        </div>
                        <div className="w-10 text-right text-xs font-medium">{percent}%</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Allocation will appear once Buy + Rising positions are loaded.</p>
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
                      <h2 className="text-2xl font-semibold tracking-tight">{selectedStock.ticker}</h2>
                      <p className="text-muted-foreground text-sm">{selectedStock.name}</p>
                    </div>
                    <StatusBadge status={selectedStock.status ?? "Stable"} />
                  </div>

                  <div className="h-32 w-full mb-6 relative group">
                    {selectedStock.history?.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsLineChart data={selectedStock.history.map((price) => ({ price }))}>
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
                      <span className="text-muted-foreground block mb-1">Signal</span>
                      <span className="font-medium">{selectedStock.signalAction ?? "Hold"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">Confidence</span>
                      <span className="font-medium">
                        {selectedStock.signalConfidence != null ? `${Math.round(selectedStock.signalConfidence)}%` : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">Signal Emitted</span>
                      <span className="font-medium">{formatSignalTime(selectedStock.signalEmittedAt)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">Entry Price</span>
                      <span className="font-medium">{formatMaybeCurrency(selectedStock.signalEntryPrice)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">Since Signal</span>
                      <span className={`font-medium ${(selectedStock.signalReturnPercent ?? 0) >= 0 ? "text-primary" : "text-destructive"}`}>
                        {selectedStock.signalReturnPercent != null ? `${selectedStock.signalReturnPercent >= 0 ? "+" : ""}${selectedStock.signalReturnPercent.toFixed(2)}%` : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">Market Cap</span>
                      <span className="font-medium">{selectedStock.cap ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">P/E Ratio</span>
                      <span className="font-medium">
                        {selectedStock.peRatio != null ? selectedStock.peRatio.toFixed(2) : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">52W High</span>
                      <span className="font-medium">{formatMaybeCurrency(selectedStock.high52)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">52W Low</span>
                      <span className="font-medium">{formatMaybeCurrency(selectedStock.low52)}</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-muted/40 rounded-xl p-4">
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                        <Info className="h-4 w-4 text-primary" /> The Signal
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {selectedStock.summary ?? "Live insight will appear once quotes are synced."}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-2 text-foreground">What this means for you</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {selectedStock.impact ?? "Watchlist impact is updating."}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="bg-muted/20 border border-dashed border-border/60 rounded-3xl p-8 h-[500px] flex flex-col items-center justify-center text-center sticky top-24">
                  <div className="h-12 w-12 rounded-full bg-card shadow-sm border border-border/50 flex items-center justify-center mb-4 text-muted-foreground">
                    <LineChart size={20} />
                  </div>
                  <p className="text-muted-foreground">Select a stock from your portfolio to view detailed intelligence.</p>
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
          <div>Data as of {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </footer>
    </div>
  );
}
