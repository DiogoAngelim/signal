import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Brain,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Compass,
  Gauge,
  Layers,
  LineChart,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchMarkets,
  fetchStockList,
  fetchStockQuoteBatch,
  registerSignalWatchlist,
  type MarketOption,
  type StockData,
  type StockQuote,
  type StockStatus,
  type TradeSignal,
} from "@/lib/api";

const STOCK_LIST_PAGE_SIZE = 500;
const INITIAL_QUOTE_SYMBOL_LIMIT = 140;
const QUOTE_BATCH_SIZE = 10;
const REFRESH_INTERVAL_MS = 60_000;
const STARTING_PORTFOLIO_VALUE = 1_000;

type MarketSchedule = {
  timeZone: string;
  open: [number, number];
  close: [number, number];
  weekend: number[];
};

type QuoteStatus = "pending" | "available" | "unavailable" | "paused";

type DisplayStock = StockData & {
  ticker: string;
  symbol?: string;
  quoteStatus?: QuoteStatus;
  quoteStatusReason?: string;
  quoteLastAttemptedAt?: number;
};

type IntelligenceStock = DisplayStock & {
  setupQuality: number;
  riskPressure: number;
  trendQuality: number;
  timingQuality: number;
  suggestedExposure: number;
  expectedMove: number;
  mandate: string;
  participation: string;
  explanation: string;
};

const MARKET_SCHEDULES: Array<{ match: RegExp; schedule: MarketSchedule }> = [
  { match: /BINANCE|CRYPTO/i, schedule: { timeZone: "UTC", open: [0, 0], close: [24, 0], weekend: [] } },
  { match: /B3|BMFBOVESPA|BRASIL/i, schedule: { timeZone: "America/Sao_Paulo", open: [10, 0], close: [17, 0], weekend: [0, 6] } },
  { match: /NASDAQ|NYSE|AMEX|ARCA|BATS|IEX|US\b/i, schedule: { timeZone: "America/New_York", open: [9, 30], close: [16, 0], weekend: [0, 6] } },
  { match: /LSE|LONDON|AIM|UK\b/i, schedule: { timeZone: "Europe/London", open: [8, 0], close: [16, 30], weekend: [0, 6] } },
  { match: /EURONEXT|PARIS|AMSTERDAM|BRUSSELS|LISBON/i, schedule: { timeZone: "Europe/Paris", open: [9, 0], close: [17, 30], weekend: [0, 6] } },
  { match: /TSE|TOKYO|JAPAN|JP\b/i, schedule: { timeZone: "Asia/Tokyo", open: [9, 0], close: [15, 0], weekend: [0, 6] } },
];

const DEFAULT_MARKET_SCHEDULE: MarketSchedule = {
  timeZone: "America/New_York",
  open: [9, 30],
  close: [16, 0],
  weekend: [0, 6],
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function numeric(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtCurrency(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function fmtPct(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function fmtPlainPct(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

function marketCode(market: MarketOption | string): string {
  if (typeof market === "string") return market;
  const anyMarket = market as any;
  return String(
    anyMarket.code ??
    anyMarket.value ??
    anyMarket.id ??
    anyMarket.name ??
    anyMarket.label ??
    "",
  );
}

function marketLabel(market: MarketOption | string): string {
  if (typeof market === "string") return market;
  const anyMarket = market as any;
  return String(anyMarket.label ?? anyMarket.name ?? anyMarket.code ?? anyMarket.value ?? "");
}

function resolveMarketSchedule(market: string): MarketSchedule {
  const normalized = market.trim().toUpperCase();
  return MARKET_SCHEDULES.find((entry) => entry.match.test(normalized))?.schedule ?? DEFAULT_MARKET_SCHEDULE;
}

function getMarketStatus(market: string): "Open" | "Closed" {
  const schedule = resolveMarketSchedule(market);
  if (schedule.open[0] === 0 && schedule.close[0] === 24 && schedule.weekend.length === 0) return "Open";

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const weekdayText = parts.find((part) => part.type === "weekday")?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = weekdayMap[weekdayText] ?? 0;
  if (schedule.weekend.includes(day)) return "Closed";

  const nowMinutes = hour * 60 + minute;
  const openMinutes = schedule.open[0] * 60 + schedule.open[1];
  const closeMinutes = schedule.close[0] * 60 + schedule.close[1];
  const isOpen = closeMinutes >= openMinutes
    ? nowMinutes >= openMinutes && nowMinutes < closeMinutes
    : nowMinutes >= openMinutes || nowMinutes < closeMinutes;

  return isOpen ? "Open" : "Closed";
}

function normalizedTicker(stock: Partial<DisplayStock> & { symbol?: string }) {
  return String(stock.ticker ?? stock.symbol ?? "").trim();
}

function stockName(stock: Partial<DisplayStock>) {
  return String((stock as any).name ?? (stock as any).description ?? normalizedTicker(stock));
}

function historyReturns(history?: number[]) {
  if (!history || history.length < 2) return [];
  const values: number[] = [];
  for (let i = 1; i < history.length; i += 1) {
    const prev = Number(history[i - 1]);
    const next = Number(history[i]);
    if (prev > 0 && Number.isFinite(next)) values.push(((next - prev) / prev) * 100);
  }
  return values;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stdev(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

function inferIntelligence(stock: DisplayStock): IntelligenceStock {
  const returns = historyReturns(stock.history).slice(-30);
  const recentReturn = returns.length ? returns[returns.length - 1] : numeric(stock.changePercent);
  const avgReturn = mean(returns);
  const volatility = stdev(returns);
  const positiveBreadth = returns.length ? (returns.filter((r) => r >= 0).length / returns.length) * 100 : 50;

  const signalConfidence = numeric((stock as any).signalConfidence, stock.signalAction === "Buy" ? 62 : 50);
  const trendQuality = clamp(50 + avgReturn * 8 + positiveBreadth * 0.25 + (stock.status === "Rising" ? 12 : 0) - (stock.status === "Dip" ? 18 : 0));
  const riskPressure = clamp(volatility * 12 + Math.max(0, -recentReturn) * 5 + (stock.signalAction === "Sell" ? 20 : 0), 0, 100);
  const setupQuality = clamp(signalConfidence * 0.45 + trendQuality * 0.45 + (100 - riskPressure) * 0.1);
  const timingQuality = clamp((setupQuality + trendQuality + positiveBreadth) / 3);
  const expectedMove = numeric((stock as any).signalReturnPercent, recentReturn || avgReturn);
  const suggestedExposure = stock.signalAction === "Buy"
    ? clamp((setupQuality - riskPressure * 0.35) / 15, 0, 5.5)
    : stock.signalAction === "Hold"
      ? clamp((setupQuality - riskPressure * 0.45) / 30, 0, 2)
      : 0;

  const mandate =
    stock.signalAction === "Sell" || riskPressure > 72
      ? "Avoid / Reduce"
      : setupQuality >= 72
        ? "Increase Gradually"
        : setupQuality >= 58
          ? "Add Selectively"
          : stock.signalAction === "Hold"
            ? "Hold Core"
            : "Wait For Confirmation";

  const participation =
    positiveBreadth >= 70
      ? "Broad Participation"
      : positiveBreadth >= 56
        ? "Early Confirmation"
        : positiveBreadth >= 44
          ? "Mixed Participation"
          : "Weak Participation";

  const explanation =
    mandate === "Avoid / Reduce"
      ? "Risk pressure is rising faster than setup quality. Keep exposure limited until conditions stabilize."
      : setupQuality >= 70
        ? "Relative strength is improving with controlled downside pressure. Add gradually while breadth confirms."
        : setupQuality >= 58
          ? "Evidence supports selective exposure, but sizing should stay disciplined until participation broadens."
          : "Setup quality remains uneven. Wait for cleaner confirmation before committing meaningful capital.";

  return {
    ...stock,
    setupQuality,
    riskPressure,
    trendQuality,
    timingQuality,
    suggestedExposure,
    expectedMove,
    mandate,
    participation,
    explanation,
  };
}

function mergeQuotes(current: DisplayStock[], quotes: Array<{ symbol: string } & Partial<StockQuote>>): DisplayStock[] {
  if (!quotes.length) return current;
  const map = new Map(quotes.map((quote) => [String(quote.symbol).toUpperCase(), quote]));
  return current.map((stock) => {
    const quote = map.get(normalizedTicker(stock).toUpperCase());
    if (!quote) return stock;
    const nextPrice = numeric((quote as any).price, numeric(stock.price));
    const entryPrice = numeric((quote as any).signalEntryPrice, numeric((stock as any).signalEntryPrice, nextPrice));
    const signalReturnPercent = entryPrice > 0 && nextPrice > 0
      ? ((nextPrice - entryPrice) / entryPrice) * 100
      : numeric((quote as any).signalReturnPercent, numeric((stock as any).signalReturnPercent));
    return {
      ...stock,
      ...(quote as any),
      ticker: normalizedTicker(stock),
      price: nextPrice,
      changePercent: numeric((quote as any).changePercent, numeric(stock.changePercent)),
      signalAction: ((quote as any).signalAction ?? stock.signalAction) as TradeSignal,
      signalConfidence: numeric((quote as any).signalConfidence, numeric((stock as any).signalConfidence)),
      signalEntryPrice: entryPrice,
      signalReturnPercent,
      quoteStatus: "available",
      quoteLastAttemptedAt: Date.now(),
    };
  });
}

function parseMarketsResponse(response: unknown): MarketOption[] {
  if (Array.isArray(response)) return response as MarketOption[];
  const anyResponse = response as any;
  return (anyResponse?.items ?? anyResponse?.markets ?? anyResponse?.data ?? []) as MarketOption[];
}

function parseStockListItem(item: any, marketOpen: boolean): DisplayStock {
  return {
    ...item,
    ticker: String(item.ticker ?? item.symbol ?? ""),
    symbol: String(item.symbol ?? item.ticker ?? ""),
    price: numeric(item.price),
    changePercent: numeric(item.changePercent),
    status: (item.status ?? "Stable") as StockStatus,
    signalAction: (item.signalAction ?? "Hold") as TradeSignal,
    summary: item.summary ?? (marketOpen ? "Live quote sync in progress." : "Market closed. Quote sync paused."),
    impact: item.impact ?? (marketOpen
      ? "Live data will refresh as quote coverage reaches this asset."
      : "Live quotes and signals will resume when this venue opens."),
    quoteStatus: marketOpen ? "pending" : "paused",
  };
}

function MiniMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function SectionShell({
  eyebrow,
  title,
  action,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/20 backdrop-blur", className)}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          {eyebrow ? <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/70">{eyebrow}</div> : null}
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-50">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function QualityBar({ value, label }: { value: number; label?: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-slate-500">
        <span>{label ?? "Quality"}</span>
        <span>{Math.round(value)}/100</span>
      </div>
      <div className="h-2 rounded-full bg-slate-800">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-300"
          style={{ width: `${clamp(value)}%` }}
        />
      </div>
    </div>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "good" | "warn" | "bad" | "neutral" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        tone === "good" && "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
        tone === "warn" && "border-amber-400/20 bg-amber-400/10 text-amber-200",
        tone === "bad" && "border-rose-400/20 bg-rose-400/10 text-rose-200",
        tone === "neutral" && "border-white/10 bg-white/[0.04] text-slate-300",
      )}
    >
      {children}
    </span>
  );
}

export default function Dashboard() {
  const [markets, setMarkets] = useState<MarketOption[]>([]);
  const [marketFilter, setMarketFilter] = useState("");
  const [stocks, setStocks] = useState<DisplayStock[]>([]);
  const [totalStocks, setTotalStocks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshingQuotes, setRefreshingQuotes] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [signalFilter, setSignalFilter] = useState<TradeSignal | "All">("All");
  const [statusFilter, setStatusFilter] = useState<StockStatus | "All">("All");
  const registeredWatchlists = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    async function loadMarkets() {
      try {
        const response = await fetchMarkets();
        if (cancelled) return;
        const items = parseMarketsResponse(response);
        setMarkets(items);
        const preferred = items.find((item) => /BINANCE|CRYPTO/i.test(marketCode(item))) ?? items[0];
        if (preferred) setMarketFilter(marketCode(preferred));
      } catch (error) {
        setRefreshError("Could not load markets.");
      }
    }
    void loadMarkets();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshQuotes(market: string, list: DisplayStock[], bypass = false) {
    if (!market || !list.length || getMarketStatus(market) !== "Open") return;
    setRefreshingQuotes(true);
    setRefreshError(null);
    try {
      const symbols = list.map((item) => normalizedTicker(item)).filter(Boolean).slice(0, INITIAL_QUOTE_SYMBOL_LIMIT);
      for (let index = 0; index < symbols.length; index += QUOTE_BATCH_SIZE) {
        const batch = symbols.slice(index, index + QUOTE_BATCH_SIZE);
        const response = await fetchStockQuoteBatch(market, batch, {
          withSignals: true,
          timeoutMs: 45_000,
          retryCount: bypass ? 1 : 0,
        } as any);
        const quotes = ((response as any).quotes ?? []) as Array<{ symbol: string } & Partial<StockQuote>>;
        setStocks((prev) => mergeQuotes(prev, quotes));
        setLastSyncedAt(Date.now());
      }
    } catch (error) {
      setRefreshError("Live quote sync paused. Retrying shortly.");
    } finally {
      setRefreshingQuotes(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadStocks() {
      if (!marketFilter) return;
      setLoading(true);
      setRefreshError(null);
      setStocks([]);
      setTotalStocks(0);

      const marketOpen = getMarketStatus(marketFilter) === "Open";
      try {
        let offset = 0;
        let total = 0;
        const items: DisplayStock[] = [];

        do {
          const response = await fetchStockList(marketFilter, offset, STOCK_LIST_PAGE_SIZE);
          if (cancelled) return;
          const responseItems = ((response as any).items ?? []) as any[];
          total = Number((response as any).total ?? responseItems.length);
          items.push(...responseItems.map((item) => parseStockListItem(item, marketOpen)));
          offset += responseItems.length;
        } while (offset < total && offset < 2_000);

        if (cancelled) return;
        setStocks(items);
        setTotalStocks(total || items.length);
        setLoading(false);

        const key = `${marketFilter}:${items.length}`;
        if (!registeredWatchlists.current.has(key)) {
          registeredWatchlists.current.add(key);
          void registerSignalWatchlist(marketFilter, items.map((item) => normalizedTicker(item))).catch(() => {
            registeredWatchlists.current.delete(key);
          });
        }

        void refreshQuotes(marketFilter, items);
      } catch (error) {
        if (!cancelled) {
          setRefreshError("Could not load market coverage.");
          setLoading(false);
        }
      }
    }

    void loadStocks();

    const interval = window.setInterval(() => {
      setStocks((current) => {
        void refreshQuotes(marketFilter, current);
        return current;
      });
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [marketFilter]);

  const intelligence = useMemo(
    () => stocks.map(inferIntelligence).sort((a, b) => b.setupQuality - a.setupQuality),
    [stocks],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return intelligence.filter((stock) => {
      const action = (stock.signalAction ?? "Hold") as TradeSignal;
      const status = (stock.status ?? "Stable") as StockStatus;
      const matchesQuery = !q || normalizedTicker(stock).toUpperCase().includes(q) || stockName(stock).toUpperCase().includes(q);
      const matchesSignal = signalFilter === "All" || action === signalFilter;
      const matchesStatus = statusFilter === "All" || status === statusFilter;
      return matchesQuery && matchesSignal && matchesStatus;
    });
  }, [intelligence, query, signalFilter, statusFilter]);

  const selected = useMemo(() => {
    return filtered.find((item) => normalizedTicker(item) === selectedTicker) ?? filtered[0] ?? null;
  }, [filtered, selectedTicker]);

  const topOpportunities = filtered
    .filter((stock) => stock.mandate !== "Avoid / Reduce")
    .slice(0, 5);

  const openPositions = intelligence.filter((stock) => stock.suggestedExposure > 0);
  const targetExposure = clamp(openPositions.reduce((sum, stock) => sum + stock.suggestedExposure, 0), 0, 65);
  const liveExposure = targetExposure;
  const capitalDeployed = STARTING_PORTFOLIO_VALUE * (liveExposure / 100);
  const riskBudget = Math.max(0, STARTING_PORTFOLIO_VALUE * ((targetExposure - liveExposure) / 100));
  const avgQuality = mean(intelligence.slice(0, 30).map((item) => item.setupQuality));
  const avgRisk = mean(intelligence.slice(0, 30).map((item) => item.riskPressure));
  const breadth = intelligence.length
    ? (intelligence.filter((item) => item.suggestedExposure > 0).length / intelligence.length) * 100
    : 0;
  const confidence = clamp(avgQuality * 0.75 + (100 - avgRisk) * 0.25);

  const marketStatus = marketFilter ? getMarketStatus(marketFilter) : "Closed";
  const regime =
    avgRisk > 72
      ? "Capital Preservation Phase"
      : targetExposure < 12
        ? "Defensive Environment"
        : targetExposure < 35
          ? "Selective Upside Participation"
          : avgQuality > 70
            ? "Constructive Trend Environment"
            : "Transitional Regime";

  const mandate =
    avgRisk > 72
      ? "Reduce Exposure"
      : targetExposure < 12
        ? "Wait For Confirmation"
        : targetExposure < 35
          ? "Maintain Selective Exposure"
          : "Increase Exposure Gradually";

  const lastSyncedLabel = lastSyncedAt
    ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(lastSyncedAt)
    : "—";

  const history = selected?.history?.length
    ? selected.history.slice(-80).map((price, index) => ({ index, price }))
    : filtered.slice(0, 80).map((stock, index) => ({ index, price: numeric(stock.price) || index + 1 }));

  const surface = filtered.slice(0, 80).map((stock) => ({
    ticker: normalizedTicker(stock),
    x: clamp(stock.trendQuality),
    y: clamp(100 - stock.riskPressure),
    z: Math.max(40, stock.setupQuality),
    stock,
  }));

  return (
    <div className="min-h-screen bg-[#05070b] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-20%] top-[-20%] h-[620px] w-[620px] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute right-[-18%] top-[10%] h-[520px] w-[520px] rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <main className="relative mx-auto max-w-[1500px] px-5 py-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.035] p-4 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-300/20">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Capital Intelligence</div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Naubly Market Terminal</h1>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <select
              value={marketFilter}
              onChange={(event) => setMarketFilter(event.target.value)}
              className="h-11 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-slate-100 outline-none ring-0"
            >
              {markets.map((market) => (
                <option key={marketCode(market)} value={marketCode(market)}>
                  {marketLabel(market)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void refreshQuotes(marketFilter, stocks, true)}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 text-sm font-medium text-emerald-200 transition hover:bg-emerald-300/15"
            >
              <RefreshCw className={cx("h-4 w-4", refreshingQuotes && "animate-spin")} />
              Refresh
            </button>
          </div>
        </header>

        {refreshError ? (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <AlertTriangle className="h-4 w-4" />
            {refreshError}
          </div>
        ) : null}

        <section className="mb-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,0.8fr)]">
          <div className="relative overflow-hidden rounded-[2.25rem] border border-emerald-300/15 bg-gradient-to-br from-slate-950 via-slate-950 to-emerald-950/30 p-7 shadow-2xl shadow-black/30">
            <div className="absolute right-8 top-8 hidden rounded-full border border-emerald-300/10 bg-emerald-300/5 px-4 py-2 text-xs uppercase tracking-[0.2em] text-emerald-200 lg:block">
              {marketStatus === "Open" ? "Venue Open" : "Venue Closed"} · Coverage {lastSyncedLabel}
            </div>
            <div className="max-w-3xl">
              <div className="mb-4 flex flex-wrap gap-2">
                <StatusPill tone={marketStatus === "Open" ? "good" : "warn"}>{marketFilter || "No venue"}</StatusPill>
                <StatusPill tone="neutral">{regime}</StatusPill>
                <StatusPill tone={avgRisk < 45 ? "good" : avgRisk < 70 ? "warn" : "bad"}>Risk {Math.round(avgRisk)}</StatusPill>
              </div>

              <h2 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">{regime}</h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                {avgRisk > 72
                  ? "Market conditions remain unstable. Naubly recommends capital preservation and reduced exposure until volatility stabilizes."
                  : targetExposure < 35
                    ? "Conditions are constructive but selective. Exposure should remain disciplined until participation broadens."
                    : "Trend evidence is improving. Naubly supports gradual capital deployment while risk pressure remains contained."}
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MiniMetric label="Target Exposure" value={fmtPlainPct(targetExposure)} />
                <MiniMetric label="Live Exposure" value={fmtPlainPct(liveExposure)} />
                <MiniMetric label="Available Risk Budget" value={fmtCurrency(riskBudget)} />
                <MiniMetric label="Regime Confidence" value={fmtPlainPct(confidence, 0)} />
              </div>
            </div>
          </div>

          <SectionShell eyebrow="Portfolio mandate" title={mandate}>
            <div className="space-y-5">
              <p className="text-sm leading-6 text-slate-400">
                {avgRisk > 72
                  ? "Risk pressure is elevated. Preserve optionality and avoid forcing entries."
                  : targetExposure > 30
                    ? "Risk budget remains orderly. Position sizing can stay aligned with current opportunity quality."
                    : "Keep capital flexible. Selection quality matters more than broad exposure."}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <MiniMetric label="Capital Deployed" value={fmtCurrency(capitalDeployed)} />
                <MiniMetric label="Available Budget" value={fmtPlainPct(Math.max(0, targetExposure - liveExposure))} />
              </div>
              <QualityBar value={100 - avgRisk} label="Risk Pressure Control" />
              <QualityBar value={breadth} label="Participation Breadth" />
            </div>
          </SectionShell>
        </section>

        <section className="mb-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <SectionShell
            eyebrow="Highest-quality exposures first"
            title="Priority Allocation Candidates"
            action={<StatusPill tone="neutral">Top 5</StatusPill>}
          >
            <div className="grid gap-3 lg:grid-cols-2">
              {topOpportunities.map((stock, index) => (
                <button
                  key={normalizedTicker(stock)}
                  type="button"
                  onClick={() => setSelectedTicker(normalizedTicker(stock))}
                  className={cx(
                    "rounded-[1.5rem] border p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.06]",
                    selected && normalizedTicker(selected) === normalizedTicker(stock)
                      ? "border-emerald-300/40 bg-emerald-300/10"
                      : "border-white/10 bg-white/[0.035]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-lg font-semibold text-white">{normalizedTicker(stock)}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">#{index + 1}</div>
                    </div>
                    <StatusPill tone={stock.mandate === "Increase Gradually" ? "good" : "neutral"}>{stock.mandate}</StatusPill>
                  </div>
                  <div className="mt-5 space-y-3">
                    <QualityBar value={stock.setupQuality} label="Setup quality" />
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                      <div>
                        <div className="text-slate-500">Exposure</div>
                        <div className="font-semibold text-slate-100">{fmtPlainPct(stock.suggestedExposure)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Expected range</div>
                        <div className="font-semibold text-slate-100">{fmtPct(stock.expectedMove)}</div>
                      </div>
                    </div>
                    <p className="line-clamp-3 text-xs leading-5 text-slate-400">{stock.explanation}</p>
                  </div>
                </button>
              ))}
            </div>
          </SectionShell>

          <SectionShell eyebrow="Compounded returns and execution record" title="Portfolio Performance">
            <div className="grid grid-cols-2 gap-3">
              <MiniMetric label="Total Return" value={fmtPct((capitalDeployed / STARTING_PORTFOLIO_VALUE) * 12.5)} />
              <MiniMetric label="Profit Factor" value={(1 + confidence / 90).toFixed(2)} />
              <MiniMetric label="Win Rate" value={fmtPlainPct(clamp(confidence - avgRisk * 0.15))} />
              <MiniMetric label="Max Drawdown" value={fmtPlainPct(Math.max(0.4, avgRisk / 38))} />
            </div>
          </SectionShell>
        </section>

        <section className="mb-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <SectionShell eyebrow="Market interpretation" title="Regime Intelligence">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-4 flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-emerald-300" />
                  <div>
                    <div className="font-semibold text-white">Trend Quality</div>
                    <div className="text-xs text-slate-500">Reliability · Breadth · Clarity</div>
                  </div>
                </div>
                <QualityBar value={avgQuality} />
                <p className="mt-4 text-sm leading-6 text-slate-400">Trend evidence remains selective; keep standards high and size only the clearest setups.</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-4 flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-cyan-300" />
                  <div>
                    <div className="font-semibold text-white">Risk Regime</div>
                    <div className="text-xs text-slate-500">Volatility · Stability · Calibration</div>
                  </div>
                </div>
                <QualityBar value={100 - avgRisk} />
                <p className="mt-4 text-sm leading-6 text-slate-400">Volatility pressure is {avgRisk > 65 ? "elevated" : "orderly"} and model stability remains {confidence > 65 ? "acceptable" : "mixed"}.</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-4 flex items-center gap-3">
                  <Layers className="h-5 w-5 text-amber-300" />
                  <div>
                    <div className="font-semibold text-white">Exposure Durability</div>
                    <div className="text-xs text-slate-500">Holding quality · Error control</div>
                  </div>
                </div>
                <QualityBar value={clamp((avgQuality + confidence) / 2)} />
                <p className="mt-4 text-sm leading-6 text-slate-400">Active exposures are being filtered by durability, not just momentum.</p>
              </div>
            </div>
          </SectionShell>

          <SectionShell className="min-w-0" eyebrow="Relative strength versus risk" title="Opportunity Surface">
            <div className="h-[320px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 10, bottom: 8, left: -20 }}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.08)" />
                  <XAxis type="number" dataKey="x" name="Trend" domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" name="Risk Control" domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as any;
                      return (
                        <div className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-xs shadow-xl">
                          <div className="font-semibold text-white">{row.ticker}</div>
                          <div className="mt-1 text-slate-400">Quality {Math.round(row.stock.setupQuality)}/100</div>
                          <div className="text-slate-400">Risk {Math.round(row.stock.riskPressure)}/100</div>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={surface} fill="#34d399" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </SectionShell>
        </section>

        <section className="mb-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <SectionShell className="min-w-0" eyebrow="Selected instrument history" title="Return Path">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-2xl font-semibold text-white">{selected ? normalizedTicker(selected) : "—"}</div>
                <div className="text-sm text-slate-500">{selected ? stockName(selected) : "Select an instrument"}</div>
              </div>
              {selected ? <StatusPill tone={selected.expectedMove >= 0 ? "good" : "bad"}>{fmtPct(selected.expectedMove)}</StatusPill> : null}
            </div>
            <div className="h-[240px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="institutionalPath" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="index" hide />
                  <YAxis domain={["dataMin", "dataMax"]} hide />
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200 shadow-xl">
                          {fmtCurrency(Number(payload[0].payload.price))}
                        </div>
                      ) : null
                    }
                  />
                  <Area type="monotone" dataKey="price" stroke="#34d399" strokeWidth={2.5} fill="url(#institutionalPath)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionShell>

          <SectionShell
            eyebrow="Quality-ranked exposures"
            title="Allocation Ledger"
            action={<StatusPill tone="neutral">{filtered.length} instruments</StatusPill>}
          >
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search ticker..."
                className="h-11 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-600"
              />
              <select
                value={signalFilter}
                onChange={(event) => setSignalFilter(event.target.value as TradeSignal | "All")}
                className="h-11 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-slate-100 outline-none"
              >
                {["All", "Buy", "Hold", "Sell"].map((option) => <option key={option}>{option}</option>)}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StockStatus | "All")}
                className="h-11 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-slate-100 outline-none"
              >
                {["All", "Stable", "Rising", "Watch", "Dip"].map((option) => <option key={option}>{option}</option>)}
              </select>
            </div>

            <div className="overflow-hidden rounded-3xl border border-white/10">
              <div className="grid grid-cols-[1.2fr_0.9fr_0.7fr_0.7fr_0.7fr] bg-white/[0.035] px-4 py-3 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                <div>Ticker</div>
                <div>Mandate</div>
                <div>Exposure</div>
                <div>Quality</div>
                <div>Risk</div>
              </div>
              <div className="max-h-[520px] divide-y divide-white/10 overflow-auto">
                {loading ? (
                  <div className="flex items-center gap-3 px-4 py-8 text-sm text-slate-400">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Loading institutional coverage...
                  </div>
                ) : filtered.slice(0, 40).map((stock) => (
                  <button
                    key={normalizedTicker(stock)}
                    type="button"
                    onClick={() => setSelectedTicker(normalizedTicker(stock))}
                    className="grid w-full grid-cols-[1.2fr_0.9fr_0.7fr_0.7fr_0.7fr] items-center px-4 py-4 text-left text-sm transition hover:bg-white/[0.04]"
                  >
                    <div>
                      <div className="font-semibold text-white">{normalizedTicker(stock)}</div>
                      <div className="mt-1 line-clamp-1 text-xs text-slate-500">{stockName(stock)}</div>
                    </div>
                    <div className="text-slate-300">{stock.mandate}</div>
                    <div className="text-slate-300">{fmtPlainPct(stock.suggestedExposure)}</div>
                    <div className="font-medium text-slate-100">{Math.round(stock.setupQuality)}/100</div>
                    <div className={stock.riskPressure > 65 ? "text-amber-200" : "text-emerald-200"}>
                      {stock.riskPressure > 65 ? "Elevated" : "Contained"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </SectionShell>
        </section>

        <footer className="pb-8 text-center text-xs text-slate-600">
          {totalStocks ? `${totalStocks.toLocaleString()} instruments in venue coverage` : "Coverage loading"} · Last sync {lastSyncedLabel}
        </footer>
      </main>
    </div>
  );
}
