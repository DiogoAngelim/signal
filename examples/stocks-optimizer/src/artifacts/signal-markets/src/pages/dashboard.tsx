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
const QUOTE_BATCH_SIZE = 25;
const REFRESH_INTERVAL_MS = 60_000;
const STARTING_PORTFOLIO_VALUE = 1_000;
const ENABLE_STRATEGY_API = import.meta.env.VITE_ENABLE_STRATEGY_API === "true";
const ENABLE_PORTFOLIO_API = import.meta.env.VITE_ENABLE_PORTFOLIO_API === "true";

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
  signalStatus?: "provided" | "missing";
  allocationAction?: TradeSignal;
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

const MARKET_EXECUTION_PRESETS = {
  CRYPTO_LIQUID: {
    spreadBps: 5,
    slippageBps: 2,
    rebalanceThresholdBps: 50,
    totalExposureCap: 65,
    maxPositionPct: 5.5,
    mptLookback: 60,
    riskAversion: 8,
    shrinkage: 0.35,
  },
  US_LARGE_CAP: {
    spreadBps: 2,
    slippageBps: 1,
    rebalanceThresholdBps: 35,
    totalExposureCap: 75,
    maxPositionPct: 6,
    mptLookback: 60,
    riskAversion: 7,
    shrinkage: 0.3,
  },
  BRAZIL_B3: {
    spreadBps: 8,
    slippageBps: 5,
    rebalanceThresholdBps: 75,
    totalExposureCap: 55,
    maxPositionPct: 4.5,
    mptLookback: 75,
    riskAversion: 10,
    shrinkage: 0.4,
  },
  EUROPE_LIQUID: {
    spreadBps: 4,
    slippageBps: 2,
    rebalanceThresholdBps: 50,
    totalExposureCap: 65,
    maxPositionPct: 5,
    mptLookback: 75,
    riskAversion: 8,
    shrinkage: 0.35,
  },
  JAPAN_LIQUID: {
    spreadBps: 5,
    slippageBps: 3,
    rebalanceThresholdBps: 60,
    totalExposureCap: 60,
    maxPositionPct: 5,
    mptLookback: 75,
    riskAversion: 9,
    shrinkage: 0.38,
  },
};


function normalizeStrategyArray(payload: any) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.history)) return payload.history;
  if (Array.isArray(payload?.trades)) return payload.trades;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function normalizeStrategySummary(payload: any) {
  if (!payload) return null;
  if (payload.summary) return payload.summary;
  if (payload.data?.summary) return payload.data.summary;
  return payload;
}


function executionPresetForMarket(market: string) {

  const stockListVisualMap = useMemo(() => {
    return buildInstrumentVisualMap([
      ...(Array.isArray(stocks) ? stocks : []), ...(Array.isArray(totalStocks) ? totalStocks : [])
    ]);
  }, [stocks, totalStocks]);

  const normalized = market.trim().toUpperCase();

  if (/BINANCE|CRYPTO/.test(normalized)) {
    return { profile: "CRYPTO_LIQUID", ...MARKET_EXECUTION_PRESETS.CRYPTO_LIQUID };
  }

  if (/B3|BMFBOVESPA|BRASIL|BRAZIL/.test(normalized)) {
    return { profile: "BRAZIL_B3", ...MARKET_EXECUTION_PRESETS.BRAZIL_B3 };
  }

  if (/NASDAQ|NYSE|AMEX|ARCA|BATS|IEX|US\b|USA/.test(normalized)) {
    return { profile: "US_LARGE_CAP", ...MARKET_EXECUTION_PRESETS.US_LARGE_CAP };
  }

  if (/LSE|LONDON|AIM|UK\b|EURONEXT|PARIS|AMSTERDAM|BRUSSELS|LISBON|EUROPE/.test(normalized)) {
    return { profile: "EUROPE_LIQUID", ...MARKET_EXECUTION_PRESETS.EUROPE_LIQUID };
  }

  if (/TSE|TOKYO|JAPAN|JP\b/.test(normalized)) {
    return { profile: "JAPAN_LIQUID", ...MARKET_EXECUTION_PRESETS.JAPAN_LIQUID };
  }

  return { profile: "CRYPTO_LIQUID", ...MARKET_EXECUTION_PRESETS.CRYPTO_LIQUID };
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}


function asChartData<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value;

  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.history)) return value.history;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.points)) return value.points;

  return [];
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

function hasStockEvidence(stock: Partial<DisplayStock>) {
  const history = Array.isArray((stock as any).history) ? (stock as any).history : [];
  const price = Number((stock as any).price);
  const changePercent = Number((stock as any).changePercent);
  const signalConfidence = Number((stock as any).signalConfidence);

  return (
    stock.quoteStatus === "available" ||
    stock.signalStatus === "provided" ||
    history.length >= 2 ||
    (Number.isFinite(price) && price > 0 && Number.isFinite(changePercent) && changePercent !== 0) ||
    Number.isFinite(signalConfidence)
  );
}

function dataCoverageLabel(stock: Partial<DisplayStock>) {
  if (stock.quoteStatus === "available") return "live quote";
  if (stock.signalStatus === "provided") return "signal";
  if (Array.isArray((stock as any).history) && (stock as any).history.length >= 2) return "history";
  return "pending";
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

function dateKey(value: unknown) {
  return String(value ?? "").slice(0, 10);
}

function equityReturnsFromCurve(curve: Array<any>) {
  const returns: number[] = [];

  for (let index = 1; index < curve.length; index += 1) {
    const previous = numeric(curve[index - 1]?.equity);
    const current = numeric(curve[index]?.equity);

    if (previous > 0 && current > 0) {
      returns.push((current - previous) / previous);
    }
  }

  return returns;
}

function metricsFromCurve(curve: Array<any>) {
  if (curve.length < 2) {
    return {
      totalReturnPct: null,
      annualizedSharpe: null,
      profitFactor: null,
      winRatePct: null,
      maxDrawdownPct: null,
      equity: null,
    };
  }

  const returns = equityReturnsFromCurve(curve);
  const avgReturn = mean(returns);
  const volatility = stdev(returns);
  const annualizedSharpe = volatility > 0 ? (avgReturn / volatility) * Math.sqrt(252) : null;

  const grossProfit = returns.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(returns.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : null) : grossProfit / grossLoss;
  const winRatePct = returns.length ? (returns.filter((value) => value > 0).length / returns.length) * 100 : null;

  let peak = numeric(curve[0]?.equity);
  let maxDrawdownPct = 0;

  for (const point of curve) {
    const equity = numeric(point.equity, peak);
    peak = Math.max(peak, equity);

    if (peak > 0) {
      maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - equity) / peak) * 100);
    }
  }

  const last = curve[curve.length - 1];
  const first = curve[0];

  return {
    totalReturnPct: numeric(first?.equity) > 0 ? ((numeric(last?.equity) / numeric(first?.equity)) - 1) * 100 : null,
    annualizedSharpe,
    profitFactor,
    winRatePct,
    maxDrawdownPct,
    equity: numeric(last?.equity),
  };
}

function applyExecutionCostsToCurve(curve: Array<any>, trades: Array<any>, commissionBps: number, slippageBps: number) {
  const totalCostBps = Math.max(0, commissionBps) + Math.max(0, slippageBps);

  if (!curve.length || !trades.length || totalCostBps <= 0) return curve;

  const commissionRate = totalCostBps / 10_000;
  const events = new Map<string, number>();

  for (const trade of trades) {
    const exposure = Math.max(0, numeric(trade.entryExposure)) / 100;

    if (exposure <= 0) continue;

    const entryDate = dateKey(trade.entryDate);
    const exitDate = dateKey(trade.exitDate);

    events.set(entryDate, (events.get(entryDate) ?? 0) + exposure * commissionRate);

    if (exitDate) {
      events.set(exitDate, (events.get(exitDate) ?? 0) + exposure * commissionRate);
    }
  }

  let dragFactor = 1;

  return curve.map((point, index) => {
    const date = dateKey(point.date);
    const eventCost = events.get(date) ?? 0;

    if (eventCost > 0) {
      dragFactor *= Math.max(0, 1 - eventCost);
    }

    const adjustedEquity = numeric(point.equity) * dragFactor;
    const baseEquity = index === 0 ? adjustedEquity : numeric(curve[0]?.equity) * dragFactor;

    return {
      ...point,
      equity: adjustedEquity,
      returnPct: baseEquity > 0 ? ((adjustedEquity / baseEquity) - 1) * 100 : numeric(point.returnPct),
      commissionAdjusted: true,
    };
  });
}


type ConfidenceGate = {
  key: string;
  label: string;
  passed: boolean;
  value: string;
  reason: string;
  severity: "good" | "warn" | "bad" | "neutral";
};

function scoreGate(passed: boolean, weight: number) {
  return passed ? weight : 0;
}

function finiteNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatGateNumber(value: unknown, digits = 2) {
  const n = finiteNumber(value);
  return n == null ? "—" : n.toFixed(digits);
}

function normalizeRegimeLabel(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function extractTradeCount(summary: any, trades: Array<any>) {
  const explicit =
    finiteNumber(summary?.tradeCount) ??
    finiteNumber(summary?.trade_count) ??
    finiteNumber(summary?.trades) ??
    finiteNumber(summary?.closedTrades) ??
    finiteNumber(summary?.closed_trades);

  return explicit ?? trades.length;
}

function extractSegmentCount(summary: any) {
  return (
    finiteNumber(summary?.segments) ??
    finiteNumber(summary?.segmentCount) ??
    finiteNumber(summary?.segment_count) ??
    finiteNumber(summary?.walkForwardSegments) ??
    finiteNumber(summary?.walk_forward_segments) ??
    null
  );
}

function extractBenchmarkPass(summary: any) {
  const excessReturn = finiteNumber(summary?.excessReturnPct ?? summary?.excess_return_pct);
  const excessSharpe = finiteNumber(summary?.excessSharpe ?? summary?.excess_sharpe);

  if (excessReturn == null && excessSharpe == null) return null;

  return (excessReturn ?? 0) >= 0 && (excessSharpe ?? 0) >= -0.1;
}

function extractRegimeConsistency(summary: any, currentRegime: string, trades: Array<any>) {
  const explicit =
    finiteNumber(summary?.regimeConsistencyPct) ??
    finiteNumber(summary?.regime_consistency_pct) ??
    finiteNumber(summary?.regimeSurvivalPct) ??
    finiteNumber(summary?.regime_survival_pct);

  if (explicit != null) return explicit;

  const current = normalizeRegimeLabel(currentRegime);
  const regimeTrades = trades
    .map((trade) => normalizeRegimeLabel(trade.regime ?? trade.marketRegime ?? trade.market_regime))
    .filter(Boolean);

  if (!current || !regimeTrades.length) return null;

  const matching = regimeTrades.filter((regime) => regime === current).length;
  return (matching / regimeTrades.length) * 100;
}

function computeSurvivalScore(input: {
  hasBacktestData: boolean;
  hasBacktestCurve: boolean;
  hasProvidedSignals: boolean;
  totalReturnPct: unknown;
  sharpe: unknown;
  maxDrawdownPct: unknown;
  profitFactor: unknown;
  winRatePct: unknown;
  excessReturnPct: unknown;
  excessSharpe: unknown;
  tradeCount: number;
  segmentCount: number | null;
  regimeConsistencyPct: number | null;
  staleData: boolean;
  hasFailureFlags: boolean;
}) {
  if (!input.hasBacktestData) return 0;

  const totalReturn = finiteNumber(input.totalReturnPct) ?? 0;
  const sharpe = finiteNumber(input.sharpe) ?? 0;
  const maxDrawdown = finiteNumber(input.maxDrawdownPct) ?? 100;
  const profitFactor = finiteNumber(input.profitFactor) ?? 0;
  const winRate = finiteNumber(input.winRatePct) ?? 0;
  const excessReturn = finiteNumber(input.excessReturnPct) ?? 0;
  const excessSharpe = finiteNumber(input.excessSharpe) ?? 0;
  const regimeConsistency = input.regimeConsistencyPct ?? 0;

  let score = 0;

  score += scoreGate(input.hasBacktestCurve, 8);
  score += scoreGate(input.hasProvidedSignals, 8);
  score += scoreGate(totalReturn > 0, 10);
  score += scoreGate(sharpe >= 0.75, 12);
  score += scoreGate(maxDrawdown <= 18, 12);
  score += scoreGate(profitFactor >= 1.15, 10);
  score += scoreGate(winRate >= 45, 6);
  score += scoreGate(excessReturn >= 0, 8);
  score += scoreGate(excessSharpe >= -0.1, 6);
  score += scoreGate(input.tradeCount >= 30, 8);
  score += scoreGate(input.segmentCount == null || input.segmentCount >= 3, 5);
  score += scoreGate(regimeConsistency === 0 || regimeConsistency >= 50, 5);

  if (input.staleData) score -= 15;
  if (input.hasFailureFlags) score -= 20;

  return clamp(score, 0, 100);
}

function productionStage(score: number, gates: ConfidenceGate[]) {
  const failedBadGates = gates.filter((gate) => !gate.passed && gate.severity === "bad").length;

  if (score >= 85 && failedBadGates === 0) return "Production eligible";
  if (score >= 70 && failedBadGates <= 1) return "Forward-test eligible";
  if (score >= 55) return "Research validated";
  if (score >= 35) return "Candidate only";
  return "Not ready";
}


function applyBackendBlockersToConfidenceGates(
  gates: ConfidenceGate[],
  summary: any,
): ConfidenceGate[] {
  const flags = Array.isArray(summary?.failureFlags) ? summary.failureFlags : [];

  const blocked =
    summary?.promotionBlocked === true ||
    summary?.automaticFailureDetected === true ||
    summary?.promotionState === "Blocked" ||
    summary?.readinessLabel === "Blocked" ||
    flags.length > 0;

  if (!blocked) return gates;

  const hasInvalidSharpe =
    flags.includes("INVALID_SHARPE") ||
    summary?.annualizedSharpe == null ||
    summary?.annualized_sharpe == null;

  const hasInvalidDrawdown =
    flags.includes("INVALID_DRAWDOWN") ||
    flags.includes("ZERO_DRAWDOWN_WITH_TRADES") ||
    summary?.maxDrawdownPct == null ||
    summary?.max_drawdown_pct == null;

  const hasInsufficientSegments =
    flags.includes("INSUFFICIENT_WALK_FORWARD_SEGMENTS") ||
    Number(summary?.segmentCount ?? summary?.segment_count ?? 0) < 3;

  const hasBenchmarkFailure =
    flags.includes("BENCHMARK_FAILED") ||
    flags.includes("BENCHMARK_COMPARISON_FAILED") ||
    flags.includes("BENCHMARK_UNDERPERFORMANCE") ||
    flags.includes("SEVERE_BENCHMARK_UNDERPERFORMANCE") ||
    summary?.benchmarkStatus === "Failed" ||
    summary?.benchmarkPassed === false ||
    Number(summary?.excessReturnPct ?? summary?.excess_return_pct ?? summary?.excessReturn ?? 0) < 0;

  return gates.map((gate) => {
    if (gate.key === "walkForward" && hasInsufficientSegments) {
      return {
        ...gate,
        passed: false,
        value: `${Number(summary?.segmentCount ?? summary?.segment_count ?? 1)} / 3 segments`,
        severity: "warn",
      };
    }

    if (gate.key === "sameEngine" && blocked) {
      return {
        ...gate,
        passed: false,
        value: gate.value ? `${gate.value}, blocked` : "Blocked",
        severity: "warn",
      };
    }

    if (gate.key === "riskAdjusted" && hasInvalidSharpe) {
      return {
        ...gate,
        passed: false,
        value: "Statistically unreliable",
        severity: "warn",
      };
    }

    if (gate.key === "drawdown" && hasInvalidDrawdown) {
      return {
        ...gate,
        passed: false,
        value: flags.includes("ZERO_DRAWDOWN_WITH_TRADES")
          ? "Suspicious zero drawdown"
          : flags.includes("INVALID_DRAWDOWN")
            ? "Unavailable"
            : fmtPlainPct(summary?.maxDrawdownPct ?? summary?.max_drawdown_pct ?? 0),
        severity: "warn",
      };
    }

    if (gate.key === "benchmark" && hasBenchmarkFailure) {
      return {
        ...gate,
        passed: false,
        value: "Failed",
        severity: "bad",
      };
    }

    return gate;
  });
}



function formatPromotionBlocker(flag: string) {
  const labels: Record<string, string> = {
    INVALID_SHARPE: "Risk-adjusted return is not reliable enough yet",
    SUSPICIOUS_SHARPE: "Risk-adjusted return is not reliable enough yet",
    ZERO_DRAWDOWN_WITH_TRADES: "The drawdown result looks unrealistic",
    INSUFFICIENT_WALK_FORWARD_SEGMENTS: "More test periods are needed",
    BENCHMARK_UNDERPERFORMANCE: "The strategy did not beat the simple benchmark",
    SEVERE_BENCHMARK_UNDERPERFORMANCE: "The strategy was far below the simple benchmark",
    BENCHMARK_COMPARISON_FAILED: "Benchmark comparison failed",
    INVALID_DRAWDOWN: "Drawdown could not be checked",
    BENCHMARK_FAILED: "The strategy failed the benchmark check",
  };

  return labels[flag] ?? flag;
}


function productionTone(stage: string): "good" | "warn" | "bad" | "neutral" {
  if (stage === "Production eligible") return "good";
  if (stage === "Forward-test eligible" || stage === "Research validated") return "warn";
  if (stage === "Not ready") return "bad";
  return "neutral";
}

function plainStageLabel(value: unknown) {
  const text = String(value ?? "").trim();
  const labels: Record<string, string> = {
    "Production eligible": "Ready for live review",
    "Forward-test eligible": "Ready for real-time testing",
    "Research validated": "Research review",
    "Candidate only": "Idea only",
    "Not ready": "Not ready",
    "Promotion blocked": "Blocked",
    Blocked: "Blocked",
  };

  return labels[text] ?? text;
}


function inferIntelligence(stock: DisplayStock): IntelligenceStock {
  const returns = historyReturns(stock.history).slice(-30);
  const recentReturn = returns.length ? returns[returns.length - 1] : numeric(stock.changePercent);
  const avgReturn = mean(returns);
  const volatility = stdev(returns);
  const positiveBreadth = returns.length ? (returns.filter((r) => r >= 0).length / returns.length) * 100 : 50;

  const hasEvidence = hasStockEvidence(stock);
  const signalConfidence = numeric((stock as any).signalConfidence, stock.signalAction === "Buy" ? 62 : 50);

  const inferredTrendQuality = clamp(
    50 +
    avgReturn * 8 +
    positiveBreadth * 0.25 +
    (stock.status === "Rising" ? 12 : 0) -
    (stock.status === "Dip" ? 18 : 0) +
    (hasEvidence ? 0 : -18),
  );

  const inferredRiskPressure = clamp(
    volatility * 12 +
    Math.max(0, -recentReturn) * 5 +
    (stock.signalAction === "Sell" ? 20 : 0) +
    (hasEvidence ? 0 : 18),
    0,
    100,
  );

  const trendQuality = clamp(numeric((stock as any).trendQuality, inferredTrendQuality));
  const riskPressure = clamp(numeric((stock as any).riskPressure, inferredRiskPressure));
  const setupQuality = clamp(
    numeric(
      (stock as any).setupQuality,
      signalConfidence * 0.45 + trendQuality * 0.45 + (100 - riskPressure) * 0.1,
    ),
  );
  const timingQuality = clamp(numeric((stock as any).timingQuality, (setupQuality + trendQuality + positiveBreadth) / 3));
  const expectedMove = numeric((stock as any).expectedMove, numeric((stock as any).signalReturnPercent, recentReturn || avgReturn));
  const hasProvidedSignal = stock.signalStatus === "provided";

  const suggestedExposure =
    hasProvidedSignal && stock.signalAction === "Buy"
      ? clamp((setupQuality - riskPressure * 0.35) / 15, 0, 5.5)
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
      ? "Risk is rising faster than the opportunity. Keep the position small until conditions improve."
      : setupQuality >= 70
        ? "The trend is improving and risk is controlled. Consider adding gradually."
        : setupQuality >= 58
          ? "This looks reasonable, but position size should stay limited until there is more confirmation."
          : "The signal is not clear enough yet. Wait for stronger confirmation before adding money.";

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

function deriveAllocationAction(
  stock: IntelligenceStock,
  context: {
    regime: string;
    avgRisk: number;
    breadth: number;
    targetExposure: number;
    marketStatus: "Open" | "Closed";
  },
): TradeSignal {
  const rawAction = (stock.signalAction ?? "Hold") as TradeSignal;
  const hasExplicitSignal = stock.signalStatus === "provided";

  if (hasExplicitSignal && rawAction === "Sell") {
    return "Sell";
  }

  if (stock.mandate === "Avoid / Reduce" || stock.riskPressure >= 78) {
    return "Sell";
  }

  if (context.regime === "Capital Preservation Phase") {
    if (stock.setupQuality >= 82 && stock.riskPressure < 38 && stock.expectedMove > 0) {
      return "Buy";
    }

    if (stock.riskPressure > 64 || stock.expectedMove < -1.5) {
      return "Sell";
    }

    return "Hold";
  }

  if (context.regime === "Defensive Environment") {
    if (
      stock.setupQuality >= 72 &&
      stock.riskPressure < 48 &&
      stock.suggestedExposure > 0 &&
      stock.expectedMove > 0
    ) {
      return "Buy";
    }

    if (stock.riskPressure > 70 || stock.expectedMove < -2) {
      return "Sell";
    }

    return "Hold";
  }

  if (hasExplicitSignal && rawAction === "Buy" && stock.riskPressure < 72) {
    return "Buy";
  }

  if (
    stock.suggestedExposure > 0 &&
    stock.setupQuality >= 58 &&
    stock.riskPressure < 68 &&
    stock.expectedMove >= -0.5
  ) {
    return "Buy";
  }

  if (stock.setupQuality < 42 && stock.expectedMove < 0) {
    return "Sell";
  }

  return "Hold";
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
      signalStatus: (quote as any).signalAction ? "provided" : stock.signalStatus ?? "missing",
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
    symbol: String(item.symbol || item.ticker || ""),
    price: numeric(item.price),
    changePercent: numeric(item.changePercent),
    status: (item.status ?? "Stable") as StockStatus,
    signalAction: (item.signalAction ?? "Hold") as TradeSignal,
    signalStatus: item.signalAction ? "provided" : "missing",
    summary: item.summary ?? (marketOpen ? "Live quote sync in progress." : "Market closed. Quote sync paused."),
    impact: item.impact ?? (marketOpen
      ? "Live data will refresh as quote coverage reaches this asset."
      : "Live quotes and signals will resume when this venue opens."),
    quoteStatus: marketOpen ? "pending" : "paused",
  };
}


function getInstrumentSymbol(value: any) {
  return String(value?.symbol ?? value?.ticker ?? value?.code ?? value?.id ?? "")
    .trim()
    .toUpperCase();
}

function getInstrumentVisual(value: any) {
  if (!value || typeof value !== "object") return "";

  const direct =
    value.svg ??
    value.logo ??
    value.icon ??
    value.image ??
    value.visual ??
    value.logoSvg ??
    value.logo_svg ??
    value.iconSvg ??
    value.icon_svg ??
    value.imageSvg ??
    value.image_svg ??
    value.svgMarkup ??
    value.svg_markup ??
    value.logoMarkup ??
    value.logo_markup ??
    value.logoUrl ??
    value.logo_url ??
    value.imageUrl ??
    value.image_url ??
    value.iconUrl ??
    value.icon_url ??
    value.svgUrl ??
    value.svg_url;

  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") continue;

    const k = key.toLowerCase();
    const v = raw.trim();

    if (!v) continue;

    if (
      k.includes("svg") ||
      k.includes("logo") ||
      k.includes("icon") ||
      k.includes("image")
    ) {
      return v;
    }

    if (
      v.startsWith("<svg") ||
      v.startsWith("data:image/svg+xml") ||
      v.endsWith(".svg")
    ) {
      return v;
    }
  }

  return "";
}

function buildInstrumentVisualMap(items: any[]) {
  const map = new Map<string, any>();

  for (const item of Array.isArray(items) ? items : []) {
    const symbol = getInstrumentSymbol(item);
    if (!symbol) continue;

    const visual = getInstrumentVisual(item);

    if (visual) {
      map.set(symbol, {
        ...item,
        visual,
      });
    }
  }

  return map;
}

function mergeInstrumentVisual(candidate: any, visualMap: Map<string, any>) {
  const symbol = getInstrumentSymbol(candidate);
  const source = symbol ? visualMap.get(symbol) : null;

  if (!source) {
    return candidate;
  }

  return {
    ...source,
    ...candidate,
    visual:
      getInstrumentVisual(candidate) ||
      source.visual ||
      getInstrumentVisual(source),
    stockListSource: source,
  };
}





















function instrumentSymbol(value: any) {
  return String(value?.symbol ?? value?.ticker ?? value?.code ?? "")
    .trim()
    .toUpperCase();
}

function instrumentBaseSymbol(value: any) {
  return instrumentSymbol(value)
    .replace(/\.(SA|AD|AE|DXB|DU|QA|BH|KW|OM|US|NYSE|NASDAQ)$/i, "")
    .trim()
    .toUpperCase();
}

function instrumentVisual(value: any) {
  if (!value || typeof value !== "object") return "";

  const preferredKeys = [
    "svg",
    "logo",
    "icon",
    "image",
    "visual",
    "logoSvg",
    "logo_svg",
    "iconSvg",
    "icon_svg",
    "imageSvg",
    "image_svg",
    "svgMarkup",
    "svg_markup",
    "logoMarkup",
    "logo_markup",
    "logoUrl",
    "logo_url",
    "imageUrl",
    "image_url",
    "iconUrl",
    "icon_url",
    "svgUrl",
    "svg_url",
  ];

  for (const key of preferredKeys) {
    const raw = value?.[key];

    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }

  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") continue;

    const lowerKey = key.toLowerCase();
    const text = raw.trim();

    if (
      text &&
      (
        lowerKey.includes("svg") ||
        lowerKey.includes("logo") ||
        lowerKey.includes("icon") ||
        lowerKey.includes("image") ||
        text.startsWith("<svg") ||
        text.startsWith("data:image/svg+xml") ||
        text.endsWith(".svg")
      )
    ) {
      return text;
    }
  }

  return "";
}

function InstrumentAvatar({ instrument }: { instrument: any }) {
  const symbol = instrumentSymbol(instrument);
  const visual = instrumentVisual(instrument);

  if (visual.startsWith("<svg")) {
    return (
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 [&_svg]:h-full [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: visual }}
        aria-label={`${symbol} logo`}
      />
    );
  }

  if (
    visual.startsWith("data:image/svg+xml") ||
    visual.startsWith("http") ||
    visual.startsWith("/") ||
    visual.endsWith(".svg") ||
    visual.endsWith(".png") ||
    visual.endsWith(".jpg") ||
    visual.endsWith(".jpeg") ||
    visual.endsWith(".webp")
  ) {
    return (
      <img
        src={visual}
        alt={`${symbol} logo`}
        className="h-11 w-11 shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] object-contain p-1.5"
      />
    );
  }

  return null;
}


function MiniMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</div>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
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
    <section className={cx("rounded-xl border border-white/10 bg-[#0f0f0f] p-5 shadow-2xl shadow-black/20", className)}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FDD000]">{eyebrow}</div> : null}
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function QualityBar({ value, label }: { value: number; label?: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-slate-500">
        <span>{label ?? "Quality score"}</span>
        <span>{Math.round(value)}/100</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800">
        <div
          className="h-2 rounded-full bg-[#FDD000]"
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
        tone === "good" && "border-[#FDD000]/40 bg-[#FDD000] text-black",
        tone === "warn" && "border-[#FDD000]/30 bg-[#FDD000]/15 text-[#FDD000]",
        tone === "bad" && "border-red-400/30 bg-red-500/10 text-red-200",
        tone === "neutral" && "border-white/10 bg-white/[0.04] text-zinc-200",
      )}
    >
      {children}
    </span>
  );
}

function AllocationLedgerTable({
  action,
  items,
  selectedTicker,
  onSelectInstrument,
  loading,
}: {
  action: TradeSignal;
  items: IntelligenceStock[];
  selectedTicker: string | null;
  onSelectInstrument: (ticker: string) => void;
  loading: boolean;
}) {
  const tone = action === "Buy" ? "good" : action === "Sell" ? "bad" : "neutral";

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#151515]">
      <div className="flex flex-col gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <StatusPill tone={tone}>{action}</StatusPill>
          <div>
            <div className="text-sm font-semibold text-white">{action}</div>
            <div className="text-xs text-zinc-500">{items.length} items</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[0.8fr_0.6fr_0.6fr] bg-white/[0.025] px-4 py-3 text-[9px] uppercase tracking-[0.16em] text-zinc-500">
        <div>Asset</div>
        <div>Max position</div>
        <div>Score</div>
      </div>

      <div className="max-h-[360px] divide-y divide-white/10 overflow-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-700/60 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-500/80 [&::-webkit-scrollbar-corner]:bg-transparent">
        {loading ? (
          <div className="flex items-center gap-3 px-4 py-8 text-sm text-zinc-400">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading market data...
          </div>
        ) : items.length ? (
          items.slice(0, 40).map((stock) => {
            const ticker = normalizedTicker(stock);
            const isSelected = selectedTicker === ticker;

            return (
              <button
                key={ticker}
                type="button"
                onClick={() => onSelectInstrument(ticker)}
                className={cx(
                  "grid w-full grid-cols-[1.2fr_0.7fr_0.7fr] items-center px-4 py-4 text-left text-sm transition hover:bg-white/[0.04]",
                  isSelected && "bg-[#FDD000]/10",
                )}
              >
                <div>
                  <div className="font-semibold text-white">{ticker}</div>
                  <div className="mt-1 line-clamp-1 text-xs text-zinc-500">{stockName(stock)}</div>
                  <div className="mt-1 text-[11px] text-zinc-600">
                    {stock.status ?? "Stable"} · {dataCoverageLabel(stock)}
                  </div>
                </div>
                <div className="text-zinc-300">{fmtPlainPct(stock.suggestedExposure)}</div>
                <div className="font-medium text-slate-100">{Math.round(stock.setupQuality)}%</div>
              </button>
            );
          })
        ) : (
          <div className="px-4 py-8 text-sm text-zinc-500">
            No {action.toLowerCase()} instruments match the current search.
          </div>
        )}
      </div>
    </div>
  );
}

async function asJsonOrNull(value: any) {
  if (!value) return null;

  if (typeof value.json === "function") {
    try {
      return await value.json();
    } catch (error) {
      console.warn("Failed to parse JSON response", error);
      return null;
    }
  }

  return value;
}

async function fetchJsonOrNull(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const response = await fetch(input, init);

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn("Failed to fetch JSON response", error);
    return null;
  }
}

export default function Dashboard() {
  const [stockVisualMap, setStockVisualMap] = useState<Map<string, any>>(new Map());

  const [markets, setMarkets] = useState<MarketOption[]>([]);
  const [marketFilter, setMarketFilter] = useState("");
  const [stocks, setStocks] = useState<DisplayStock[]>([]);
  const [totalStocks, setTotalStocks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshingQuotes, setRefreshingQuotes] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [isSelectedCardFlipped, setIsSelectedCardFlipped] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<Array<{ index: number; date?: string; price: number }>>([]);
  const [selectedHistoryLoading, setSelectedHistoryLoading] = useState(false);
  const [portfolioSummary, setPortfolioSummary] = useState<any | null>(null);
  const [persistentPortfolioHistory, setPersistentPortfolioHistory] = useState<Array<any>>([]);
  const [backtestSummary, setBacktestSummary] = useState<any | null>(null);
  const [backtestHistory, setBacktestHistory] = useState<Array<any>>([]);
  const [walkForwardTrades, setWalkForwardTrades] = useState<Array<any>>([]);
  const [commissionBps, setCommissionBps] = useState(0);
  const [frontendSlippageBps, setFrontendSlippageBps] = useState(0);
  const [strategySignals, setStrategySignals] = useState<Array<any>>([]);
  const [strategyRegime, setStrategyRegime] = useState<any | null>(null);
  const [portfolioRefreshing, setPortfolioRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const registeredWatchlists = useRef(new Set<string>());
  const refreshedPortfolioMarkets = useRef(new Set<string>());


  useEffect(() => {
    let cancelled = false;
    async function loadMarkets() {
      try {
        const response = await fetchMarkets();
        if (cancelled) return;
        const items = parseMarketsResponse(response);
        setMarkets(items);
        const preferred = items[0];
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

  useEffect(() => {
    if (!marketFilter || !ENABLE_STRATEGY_API) {
      setStrategySignals([]);
      setStrategyRegime(null);
      return;
    }

    let cancelled = false;

    async function loadStrategySignals() {
      try {
        const response = await fetchJsonOrNull("/api/strategy?action=live-market", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            market: marketFilter,
            limitSymbols: 25,
          }),
        });

        const payload = await asJsonOrNull(response);

        if (cancelled) return;

        setStrategySignals(Array.isArray(payload?.signals) ? payload.signals : []);
        setStrategyRegime(payload?.regime ?? null);
      } catch (error) {
        console.warn("Keeping previous backtest/portfolio state after refresh failure", error);
        if (!cancelled) {
        }
      }
    }

    void loadStrategySignals();

    const interval = window.setInterval(() => {
      void loadStrategySignals();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [marketFilter]);

  const stocksWithStrategySignals = useMemo(() => {
    if (!strategySignals.length) return stocks;

    const signalMap = new Map(
      strategySignals.map((signal) => [
        String(signal.symbol ?? signal.ticker ?? "").toUpperCase(),
        signal,
      ]),
    );

    return stocks.map((stock) => {
      const ticker = normalizedTicker(stock);
      const signal = signalMap.get(ticker.toUpperCase());

      if (!signal) return stock;

      return {
        ...stock,
        ticker,
        symbol: ticker,
        price: numeric(signal.price, numeric(stock.price)),
        signalAction: signal.signalAction ?? stock.signalAction,
        allocationAction: signal.allocationAction ?? stock.allocationAction,
        signalStatus: "provided",
        suggestedExposure: numeric(signal.suggestedExposure, numeric((stock as any).suggestedExposure)),
        setupQuality: numeric(signal.setupQuality, numeric((stock as any).setupQuality)),
        riskPressure: numeric(signal.riskPressure, numeric((stock as any).riskPressure)),
        trendQuality: numeric(signal.trendQuality, numeric((stock as any).trendQuality)),
        timingQuality: numeric(signal.timingQuality, numeric((stock as any).timingQuality)),
        expectedMove: numeric(signal.expectedMove, numeric((stock as any).expectedMove)),
        regime: signal.regime,
        quoteStatus: stock.quoteStatus ?? "available",
      } as DisplayStock;
    });
  }, [stocks, strategySignals]);

  const intelligence = useMemo(
    () => stocksWithStrategySignals.map(inferIntelligence).sort((a, b) => b.setupQuality - a.setupQuality),
    [stocksWithStrategySignals],
  );

  const coveredIntelligence = useMemo(
    () => intelligence.filter((stock) => hasStockEvidence(stock)),
    [intelligence],
  );

  const marketUniverse = coveredIntelligence.length ? coveredIntelligence : intelligence;

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();

    return marketUniverse.filter((stock) => {
      return (
        !q ||
        normalizedTicker(stock).toUpperCase().includes(q) ||
        stockName(stock).toUpperCase().includes(q)
      );
    });
  }, [marketUniverse, query]);

  const hasUsableMarketData =
    !loading &&
    intelligence.length > 0 &&
    intelligence.some((stock) => {
      return (
        stock.quoteStatus === "available" ||
        stock.signalStatus === "provided" ||
        Number.isFinite(numeric(stock.price, NaN))
      );
    });

  const hasProvidedSignals =
    hasUsableMarketData &&
    intelligence.some((stock) => stock.signalStatus === "provided");

  const hasMarketData = hasUsableMarketData;

  const selected = useMemo(() => {
    return filtered.find((item) => normalizedTicker(item) === selectedTicker) ?? filtered[0] ?? null;
  }, [filtered, selectedTicker]);

  useEffect(() => {
    setIsSelectedCardFlipped(false);
  }, [marketFilter]);

  useEffect(() => {
    refreshedPortfolioMarkets.current.clear();
  }, [marketFilter]);

  useEffect(() => {
    setPortfolioSummary(null);
    setPersistentPortfolioHistory([]);
    setBacktestSummary(normalizeStrategySummary(null));
    setBacktestHistory(normalizeStrategyArray([]));
    setWalkForwardTrades(normalizeStrategyArray([]));
    setStrategySignals([]);
    setStrategyRegime(null);
  }, [marketFilter]);


  useEffect(() => {
    // Disabled damaged selected-history refresh effect after syntax recovery.
    // Backend/API persistence remains the source of truth for validation state.
  }, []);

  const openPositions = coveredIntelligence.filter((stock) => stock.suggestedExposure > 0);
  const targetExposure = clamp(openPositions.reduce((sum, stock) => sum + stock.suggestedExposure, 0), 0, 65);
  const liveExposure = targetExposure;
  const capitalDeployed = "******";
  const riskBudget = Math.max(0, STARTING_PORTFOLIO_VALUE * ((targetExposure - liveExposure) / 100));
  const avgQuality = mean(coveredIntelligence.slice(0, 30).map((item) => item.setupQuality));
  const avgRisk = mean(coveredIntelligence.slice(0, 30).map((item) => item.riskPressure));
  const breadth = coveredIntelligence.length
    ? (coveredIntelligence.filter((item) => item.suggestedExposure > 0).length / coveredIntelligence.length) * 100
    : 0;
  const confidence = clamp(avgQuality * 0.75 + (100 - avgRisk) * 0.25);

  const lastSyncedLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
    : "Not synced";





  const marketStatus = marketFilter ? getMarketStatus(marketFilter) : "Closed";
  const inferredRegime =
    avgRisk != null && avgRisk > 72
      ? "Capital Preservation Phase"
      : targetExposure < 12
        ? "Defensive Environment"
        : targetExposure < 35
          ? "Selective Upside Participation"
          : avgQuality > 70
            ? "Constructive Trend Environment"
            : "Improving, Not Yet Fully Confirmed";

  const regime = String(strategyRegime?.regime ?? inferredRegime);

  const mandate =
    avgRisk != null && avgRisk > 72
      ? "Reduce exposure"
      : targetExposure < 12
        ? "Wait for confirmation"
        : targetExposure < 35
          ? "Maintain selective exposure only"
          : "Increase exposure gradually";

  const allocationContext = useMemo(
    () => ({
      regime,
      avgRisk,
      breadth,
      targetExposure,
      marketStatus,
    }),
    [regime, avgRisk, breadth, targetExposure, marketStatus],
  );

  const allocationUniverse = useMemo(
    () =>
      filtered.map((stock) => ({
        ...stock,
        allocationAction: ((stock as any).allocationAction ?? deriveAllocationAction(stock, allocationContext)) as TradeSignal,
      })),
    [filtered, allocationContext],
  );

  useEffect(() => {
    if (!marketFilter || !allocationUniverse.length || (!ENABLE_PORTFOLIO_API && !ENABLE_STRATEGY_API)) return;

    const refreshKey = `${marketFilter}:${allocationUniverse.length}`;

    if (refreshedPortfolioMarkets.current.has(refreshKey)) return;

    const timeout = window.setTimeout(() => {
      // Delayed persistent refresh disabled locally.
      // Backend/API persistence now protects Historical Strategy Validation state.
      setPortfolioRefreshing(false);
    }, 1_250);

    return () => window.clearTimeout(timeout);
  }, [marketFilter, allocationUniverse]);



  const finalOpenPositions = useMemo(
    () =>
      allocationUniverse.filter((stock) => {
        return stock.allocationAction === "Buy" && numeric(stock.suggestedExposure) > 0;
      }),
    [allocationUniverse],
  );

  const ledgerGroups = useMemo(
    () =>
      (["Buy", "Hold", "Sell"] as TradeSignal[]).map((action) => ({
        action,
        items: allocationUniverse.filter((stock) => stock.allocationAction === action),
      })),
    [allocationUniverse],
  );

  const topOpportunities = useMemo(
    () =>
      allocationUniverse
        .filter((stock) => {
          return (
            stock.allocationAction === "Buy" ||
            numeric(stock.suggestedExposure) > 0 ||
            stock.setupQuality >= 70
          );
        })
        .sort((a, b) => {
          return (
            numeric(b.setupQuality) +
            numeric(b.suggestedExposure) * 8 -
            numeric(b.riskPressure) * 0.35
          ) - (
              numeric(a.setupQuality) +
              numeric(a.suggestedExposure) * 8 -
              numeric(a.riskPressure) * 0.35
            );
        })
        .slice(0, 8),
    [allocationUniverse],
  );


  useEffect(() => {
    if (!marketFilter || !ENABLE_PORTFOLIO_API) return;

    let cancelled = false;

    async function loadPortfolio() {
      setPortfolioRefreshing(true);

      try {
        const [summaryResponse, historyResponse] = await Promise.all([
          fetch(`/api/portfolio?action=summary&market=${encodeURIComponent(marketFilter)}`),
          fetch(`/api/portfolio?action=history&market=${encodeURIComponent(marketFilter)}`),
        ]);

        const summary = await asJsonOrNull(summaryResponse);
        const history = await asJsonOrNull(historyResponse);

        if (cancelled) return;

        setPortfolioSummary(normalizeStrategySummary(summary));
        setPersistentPortfolioHistory(
          Array.isArray(history?.data)
            ? history.data.map((point: any, index: number) => ({
              index,
              ...point,
              equity: Number(point.equity),
              returnPct: Number(point.returnPct ?? point.return_pct),
              deployedPct: Number(point.deployedPct ?? point.deployed_pct),
              cashPct: Number(point.cashPct ?? point.cash_pct),
            }))
            : normalizeStrategyArray(history),
        );
      } catch (error) {
        console.warn("Keeping previous portfolio state after refresh failure", error);
      } finally {
        if (!cancelled) {
          setPortfolioRefreshing(false);
        }
      }
    }

    void loadPortfolio();

    const interval = window.setInterval(() => {
      void loadPortfolio();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [marketFilter]);

  useEffect(() => {
    if (!marketFilter || !ENABLE_STRATEGY_API) return;

    let cancelled = false;

    async function loadBacktest() {
      setPortfolioRefreshing(true);

      try {
        const [summaryResponse, historyResponse, tradesResponse] = await Promise.all([
          fetch(`/api/strategy?action=walk-forward-summary&market=${encodeURIComponent(marketFilter)}`),
          fetch(`/api/strategy?action=walk-forward-history&market=${encodeURIComponent(marketFilter)}`),
          fetch(`/api/strategy?action=walk-forward-trades&market=${encodeURIComponent(marketFilter)}&limit=5000`),
        ]);

        const summary = await asJsonOrNull(summaryResponse);
        const history = await asJsonOrNull(historyResponse);
        const trades = await asJsonOrNull(tradesResponse);

        if (cancelled) return;

        setBacktestSummary(normalizeStrategySummary(summary));

        setBacktestHistory(
          Array.isArray(history?.data)
            ? history.data.map((point: any, index: number) => ({
              index,
              ...point,
              equity: Number(point.equity),
              returnPct: Number(point.returnPct ?? point.return_pct),
              deployedPct: Number(point.deployedPct ?? point.deployed_pct),
              cashPct: Number(point.cashPct ?? point.cash_pct),
              positionsCount: Number(point.positionsCount ?? point.positions_count ?? 0),
            }))
            : normalizeStrategyArray(history),
        );

        setWalkForwardTrades(
          Array.isArray(trades?.trades)
            ? trades.trades
            : normalizeStrategyArray(trades),
        );
      } catch (error) {
        console.warn("Keeping previous backtest state after refresh failure", error);
      } finally {
        if (!cancelled) {
          setPortfolioRefreshing(false);
        }
      }
    }

    void loadBacktest();

    const interval = window.setInterval(() => {
      void loadBacktest();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [marketFilter]);

  const surface = useMemo(
    () =>
      allocationUniverse
        .filter((stock) => hasStockEvidence(stock))
        .slice(0, 80)
        .map((stock) => ({
          ticker: normalizedTicker(stock),
          x: clamp(stock.trendQuality),
          y: clamp(100 - stock.riskPressure),
          z: Math.max(40, stock.setupQuality),
          stock,
        })),
    [allocationUniverse],
  );

  const portfolioHistory = useMemo(() => {
    const positions = finalOpenPositions.filter((stock) => {
      return numeric(stock.suggestedExposure) > 0;
    });

    if (!positions.length) return [];

    const maxHistoryLength = Math.max(
      2,
      ...positions.map((stock) => stock.history?.length ?? 0),
    );

    const points = Math.min(120, maxHistoryLength);
    const initialEquity = STARTING_PORTFOLIO_VALUE;
    const deployedFraction = clamp(liveExposure, 0, 100) / 100;
    const cashFraction = 1 - deployedFraction;
    const totalSuggestedExposure = positions.reduce(
      (sum, stock) => sum + numeric(stock.suggestedExposure),
      0,
    );

    if (totalSuggestedExposure <= 0) return [];

    function priceAt(stock: IntelligenceStock, index: number) {
      const history = stock.history ?? [];

      if (history.length >= 2) {
        const start = Math.max(0, history.length - points);
        const sliced = history.slice(start);
        const value = sliced[Math.min(index, sliced.length - 1)];
        return numeric(value, numeric(stock.price));
      }

      const entry = numeric(
        (stock as any).signalEntryPrice,
        numeric(stock.price),
      );

      const current = numeric(stock.price, entry);
      const progress = index / Math.max(1, points - 1);

      return entry + (current - entry) * progress;
    }

    return Array.from({ length: points }, (_, index) => {
      let weightedPositionReturn = 0;

      for (const stock of positions) {
        const weight = numeric(stock.suggestedExposure) / totalSuggestedExposure;
        const basePrice = priceAt(stock, 0);
        const currentPrice = priceAt(stock, index);

        const stockReturn =
          basePrice > 0 && currentPrice > 0
            ? currentPrice / basePrice - 1
            : 0;

        weightedPositionReturn += weight * stockReturn;
      }

      const portfolioReturn = deployedFraction * weightedPositionReturn;
      const equity = initialEquity * (cashFraction + deployedFraction * (1 + weightedPositionReturn));

      return {
        index,
        equity,
        returnPct: portfolioReturn * 100,
        deployedPct: liveExposure,
        cashPct: cashFraction * 100,
      };
    });
  }, [finalOpenPositions, liveExposure]);

  const latestPortfolioPoint = portfolioHistory[portfolioHistory.length - 1];
  const portfolioReturnPct = latestPortfolioPoint?.returnPct ?? null;
  const portfolioEquity = latestPortfolioPoint?.equity ?? null;

  const portfolioReturns = useMemo(() => {
    if (portfolioHistory.length < 2) return [];

    const returns: number[] = [];

    for (let index = 1; index < portfolioHistory.length; index += 1) {
      const previous = numeric(portfolioHistory[index - 1]?.equity);
      const current = numeric(portfolioHistory[index]?.equity);

      if (previous > 0 && current > 0) {
        returns.push((current - previous) / previous);
      }
    }

    return returns;
  }, [portfolioHistory]);

  const normalizedAnnualSharpe = useMemo(() => {
    if (portfolioReturns.length < 2) return null;

    const avgReturn = mean(portfolioReturns);
    const volatility = stdev(portfolioReturns);

    if (volatility <= 0) return null;

    return (avgReturn / volatility) * Math.sqrt(252);
  }, [portfolioReturns]);

  const averageDurationDays = useMemo(() => {
    const active = finalOpenPositions.filter((stock) => numeric(stock.suggestedExposure) > 0);

    if (!active.length) return null;

    const durations = active.map((stock) => {
      const explicitDuration =
        numeric((stock as any).averageDurationDays, NaN) ||
        numeric((stock as any).holdingPeriodDays, NaN) ||
        numeric((stock as any).durationDays, NaN);

      if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
        return explicitDuration;
      }

      const historyLength = stock.history?.length ?? 0;

      if (historyLength > 1) {
        return Math.min(252, historyLength);
      }

      return 1;
    });

    return mean(durations);
  }, [finalOpenPositions]);

  const portfolioProfitFactor = useMemo(() => {
    if (!portfolioReturns.length) return null;

    const grossProfit = portfolioReturns
      .filter((value) => value > 0)
      .reduce((sum, value) => sum + value, 0);

    const grossLoss = Math.abs(
      portfolioReturns
        .filter((value) => value < 0)
        .reduce((sum, value) => sum + value, 0),
    );

    if (grossLoss === 0) return grossProfit > 0 ? Infinity : null;

    return grossProfit / grossLoss;
  }, [portfolioReturns]);

  const portfolioWinRate = useMemo(() => {
    if (!portfolioReturns.length) return null;

    return (
      (portfolioReturns.filter((value) => value > 0).length / portfolioReturns.length) *
      100
    );
  }, [portfolioReturns]);

  const portfolioMaxDrawdown = useMemo(() => {
    if (!portfolioHistory.length) return null;

    let peak = portfolioHistory[0]?.equity ?? STARTING_PORTFOLIO_VALUE;
    let maxDrawdown = 0;

    for (const point of portfolioHistory) {
      const equity = numeric(point.equity, peak);
      peak = Math.max(peak, equity);

      if (peak > 0) {
        const drawdown = ((peak - equity) / peak) * 100;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }

    return maxDrawdown;
  }, [portfolioHistory]);

  const displayedPortfolioHistory = persistentPortfolioHistory.length
    ? persistentPortfolioHistory
    : portfolioHistory;

  const displayedPortfolioEquity =
    portfolioSummary?.equity ?? portfolioEquity;

  const displayedPortfolioReturnPct =
    portfolioSummary?.totalReturnPct ?? portfolioSummary?.total_return_pct ?? portfolioReturnPct;

  const displayedAnnualSharpe =
    portfolioSummary?.annualizedSharpe ?? portfolioSummary?.annualized_sharpe ?? normalizedAnnualSharpe;

  const displayedAverageDurationDays =
    portfolioSummary?.averageDurationDays ?? portfolioSummary?.average_duration_days ?? averageDurationDays;

  const displayedProfitFactor =
    portfolioSummary?.profitFactor ?? portfolioSummary?.profit_factor ?? portfolioProfitFactor;

  const displayedWinRatePct =
    portfolioSummary?.winRatePct ?? portfolioSummary?.win_rate_pct ?? portfolioWinRate;

  const displayedMaxDrawdownPct =
    portfolioSummary?.maxDrawdownPct ?? portfolioSummary?.max_drawdown_pct ?? portfolioMaxDrawdown;

  const displayedBacktestHistory = useMemo(
    () => applyExecutionCostsToCurve(backtestHistory, walkForwardTrades, commissionBps, frontendSlippageBps ?? 0),
    [backtestHistory, walkForwardTrades, commissionBps, frontendSlippageBps],
  );

  const commissionAdjustedBacktestMetrics = useMemo(
    () => metricsFromCurve(displayedBacktestHistory),
    [displayedBacktestHistory],
  );

  const displayedBacktestEquity =
    commissionBps > 0 || (frontendSlippageBps ?? 0) > 0 ? commissionAdjustedBacktestMetrics.equity : backtestSummary?.equity ?? null;

  const displayedBacktestReturnPct =
    commissionBps > 0 || (frontendSlippageBps ?? 0) > 0
      ? commissionAdjustedBacktestMetrics.totalReturnPct
      : backtestSummary?.totalReturnPct ?? backtestSummary?.total_return_pct ?? null;

  const displayedBacktestSharpe =
    commissionBps > 0 || (frontendSlippageBps ?? 0) > 0
      ? commissionAdjustedBacktestMetrics.annualizedSharpe
      : backtestSummary?.annualizedSharpe ?? backtestSummary?.annualized_sharpe ?? null;

  const displayedBacktestMaxDrawdownPct =
    commissionBps > 0 || (frontendSlippageBps ?? 0) > 0
      ? commissionAdjustedBacktestMetrics.maxDrawdownPct
      : backtestSummary?.maxDrawdownPct ?? backtestSummary?.max_drawdown_pct ?? null;

  const displayedBacktestProfitFactor =
    commissionBps > 0 || (frontendSlippageBps ?? 0) > 0
      ? commissionAdjustedBacktestMetrics.profitFactor
      : backtestSummary?.profitFactor ?? backtestSummary?.profit_factor ?? null;

  const displayedBacktestWinRate =
    commissionBps > 0 || (frontendSlippageBps ?? 0) > 0
      ? commissionAdjustedBacktestMetrics.winRatePct
      : backtestSummary?.winRatePct ?? backtestSummary?.win_rate_pct ?? null;

  const hasPersistentPortfolioData =
    Boolean(portfolioSummary?.updatedAt) || persistentPortfolioHistory.length > 1;

  const hasBacktestData =
    Boolean(backtestSummary?.updatedAt) || backtestHistory.length > 1;

  const hasPortfolioProjectionData =
    hasPersistentPortfolioData && displayedPortfolioHistory.length > 1;

  const hasBacktestMetrics =
    hasBacktestData && displayedBacktestReturnPct !== null;

  const resolvedWalkForwardHistory =
    typeof strategyHistory !== "undefined"
      ? strategyHistory
      : typeof backtestHistory !== "undefined"
        ? backtestHistory
        : typeof portfolioHistory !== "undefined"
          ? portfolioHistory
          : [];

  const resolvedWalkForwardTrades =
    typeof strategyTrades !== "undefined"
      ? strategyTrades
      : typeof backtestTrades !== "undefined"
        ? backtestTrades
        : [];

  const resolvedWalkForwardSummary =
    typeof strategySummary !== "undefined"
      ? strategySummary
      : typeof backtestSummary !== "undefined"
        ? backtestSummary
        : null;

  const hasBacktestCurve =
    resolvedWalkForwardHistory.length > 0 ||
    resolvedWalkForwardTrades.length > 0 ||
    Number(resolvedWalkForwardSummary?.tradeCount ?? 0) > 0;

  const backtestTradeCount = extractTradeCount(backtestSummary, walkForwardTrades);
  const backtestSegmentCount = extractSegmentCount(backtestSummary);
  const benchmarkPass = extractBenchmarkPass(backtestSummary);
  const regimeConsistencyPct = extractRegimeConsistency(backtestSummary, regime, walkForwardTrades);

  const lastSyncAgeMs = lastSyncedAt ? Date.now() - lastSyncedAt : null;
  const staleData = lastSyncAgeMs == null ? false : lastSyncAgeMs > REFRESH_INTERVAL_MS * 3;

  const backendFailureFlags = Array.isArray(backtestSummary?.failureFlags)
    ? backtestSummary.failureFlags
    : [];

  const localFailureFlags = [
    !hasMarketData ? "Market data unavailable" : null,
    hasMarketData && !hasProvidedSignals ? "No confirmed live/forward signals" : null,
    hasBacktestData && displayedBacktestMaxDrawdownPct != null && Number(displayedBacktestMaxDrawdownPct) > 25
      ? "Past loss level was above 25%"
      : null,
    hasBacktestData && displayedBacktestSharpe != null && Number(displayedBacktestSharpe) < 0.5
      ? "Risk-adjusted return is below the minimum"
      : null,
    hasBacktestData && displayedBacktestProfitFactor != null && Number(displayedBacktestProfitFactor) < 1
      ? "Profit factor below 1"
      : null,
    staleData ? "Market data appears stale" : null,
  ].filter(Boolean) as string[];

  const derivedFrontendFailureFlags = [
    ...localFailureFlags,
    ...backendFailureFlags,
  ];

  const frontendSharpeIsSuspicious =
    displayedBacktestSharpe == null ||
    !Number.isFinite(Number(displayedBacktestSharpe)) ||
    Number(displayedBacktestSharpe) === 0 ||
    backendFailureFlags.includes("SUSPICIOUS_SHARPE");

  if (
    frontendSharpeIsSuspicious &&
    !derivedFrontendFailureFlags.includes("INVALID_SHARPE")
  ) {
    derivedFrontendFailureFlags.push("SUSPICIOUS_SHARPE");
  }

  const failureFlags = Array.from(new Set(derivedFrontendFailureFlags));

  const baseConfidenceGates: ConfidenceGate[] = [
    {
      key: "walkForward",
      label: "Tested over time",
      passed: hasBacktestCurve,
      value: hasBacktestCurve ? "Available" : "Missing",
      reason: "The strategy should be tested across different time periods, not just one snapshot.",
      severity: hasBacktestCurve ? "good" : "bad",
    },
    {
      key: "sameEngine",
      label: "Live signal match",
      passed: hasProvidedSignals,
      value: hasProvidedSignals ? `${strategySignals.length} signals` : "No confirmed signals",
      reason: "Current signals should come from the same strategy that was tested in the past.",
      severity: hasProvidedSignals ? "good" : "bad",
    },
    {
      key: "positiveReturn",
      label: "Positive return",
      passed: hasBacktestMetrics && Number(displayedBacktestReturnPct) > 0,
      value: fmtPct(displayedBacktestReturnPct),
      reason: "The tested strategy should be positive after estimated costs.",
      severity: hasBacktestMetrics && Number(displayedBacktestReturnPct) > 0 ? "good" : "warn",
    },
    {
      key: "riskAdjusted",
      label: "Return for the risk",
      passed: displayedBacktestSharpe != null && Number(displayedBacktestSharpe) >= 0.75,
      value: displayedBacktestSharpe == null ? "—" : Number(displayedBacktestSharpe).toFixed(2),
      reason: "The return should be strong enough for the amount of volatility.",
      severity: displayedBacktestSharpe != null && Number(displayedBacktestSharpe) >= 0.75 ? "good" : "warn",
    },
    {
      key: "drawdown",
      label: "Loss control",
      passed: displayedBacktestMaxDrawdownPct != null && Number(displayedBacktestMaxDrawdownPct) <= 18,
      value: fmtPlainPct(displayedBacktestMaxDrawdownPct),
      reason: "Large past losses make the strategy harder to trust.",
      severity: displayedBacktestMaxDrawdownPct != null && Number(displayedBacktestMaxDrawdownPct) <= 18 ? "good" : "bad",
    },
    {
      key: "profitFactor",
      label: "Profit factor",
      passed: displayedBacktestProfitFactor != null && Number(displayedBacktestProfitFactor) >= 1.15,
      value:
        displayedBacktestProfitFactor == null
          ? "—"
          : Number(displayedBacktestProfitFactor) >= 999 || displayedBacktestProfitFactor === Infinity
            ? "∞"
            : Number(displayedBacktestProfitFactor).toFixed(2),
      reason: "Winning trades should outweigh losing trades by a clear margin.",
      severity: displayedBacktestProfitFactor != null && Number(displayedBacktestProfitFactor) >= 1.15 ? "good" : "warn",
    },
    {
      key: "sampleSize",
      label: "Sample size",
      passed: backtestTradeCount >= 30,
      value: `${backtestTradeCount} trades`,
      reason: "A small number of trades is less reliable.",
      severity: backtestTradeCount >= 30 ? "good" : "warn",
    },
    {
      key: "benchmark",
      label: "Benchmark comparison",
      passed: benchmarkPass === true,
      value:
        benchmarkPass == null
          ? "Unavailable"
          : benchmarkPass
            ? "Passed"
            : "Failed",
      reason: "The strategy should compare well with a simple buy-and-hold benchmark.",
      severity: benchmarkPass === true ? "good" : benchmarkPass === false ? "bad" : "neutral",
    },
    {
      key: "regime",
      label: "Similar market check",
      passed: regimeConsistencyPct == null || regimeConsistencyPct >= 50,
      value: regimeConsistencyPct == null ? "Pending" : fmtPlainPct(regimeConsistencyPct, 0),
      reason: "Confidence improves when results hold up in similar market conditions.",
      severity: regimeConsistencyPct == null ? "neutral" : regimeConsistencyPct >= 50 ? "good" : "warn",
    },
    {
      key: "dataFreshness",
      label: "Data freshness",
      passed: !staleData,
      value: staleData ? "Stale" : "Fresh",
      reason: "Old price or signal data should not be trusted.",
      severity: staleData ? "bad" : "good",
    },
  ];

  
  
  useEffect(() => {
    if (!marketFilter) return;

    let cancelled = false;

    async function loadStockVisualMap() {
      try {
        const response = await fetch(
          `/api/stocks/list?market=${encodeURIComponent(marketFilter)}&offset=0&limit=1000`,
        );

        const payload = await response.json();
        const rows = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload?.stocks)
              ? payload.stocks
              : Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload?.results)
                  ? payload.results
                  : [];

        const map = new Map<string, any>();

        for (const row of rows) {
          const symbol = instrumentSymbol(row);
          const visual = instrumentVisual(row);

          if (!symbol) continue;

          map.set(symbol, {
            ...row,
            visual,
          });

          const baseSymbol = instrumentBaseSymbol(row);
          if (baseSymbol) {
            map.set(baseSymbol, {
              ...row,
              visual,
            });
          }
        }

        if (!cancelled) {
          console.log("[stock visual map]", marketFilter, {
            rows: rows.length,
            withVisual: Array.from(map.values()).filter((item) => Boolean(item.visual)).length,
            sample: rows.slice(0, 3).map((row) => ({
              symbol: instrumentSymbol(row),
              keys: Object.keys(row ?? {}),
              visual: String(instrumentVisual(row)).slice(0, 80),
            })),
          });

          setStockVisualMap(map);
        }
      } catch (error) {
        console.warn("[stock visual map] failed", error);
        if (!cancelled) {
          setStockVisualMap(new Map());
        }
      }
    }

    void loadStockVisualMap();

    return () => {
      cancelled = true;
    };
  }, [marketFilter]);


const stockVisualBySymbol = useMemo(() => {
    const map = new Map<string, any>();

    for (const item of Array.isArray(stocks) ? stocks : []) {
      const symbol = instrumentSymbol(item);
      const visual = instrumentVisual(item);

      if (symbol && visual) {
        map.set(symbol, item);

        const baseSymbol = instrumentBaseSymbol(item);
        if (baseSymbol) {
          map.set(baseSymbol, item);
        }
      }
    }

    return map;
  }, [stocks]);

  const mergeStockVisual = (candidate: any) => {
    const symbol = instrumentSymbol(candidate);
    const source = stockVisualBySymbol.get(symbol);

    if (!source) return candidate;

    return {
      ...candidate,
      __stockVisualSource: source,
      svg:
        candidate?.svg ??
        candidate?.logo ??
        candidate?.icon ??
        candidate?.image ??
        instrumentVisual(source),
      logoUrl:
        candidate?.logoUrl ??
        candidate?.logo_url ??
        source?.logoUrl ??
        source?.logo_url ??
        source?.imageUrl ??
        source?.image_url ??
        source?.iconUrl ??
        source?.icon_url,
    };
  };


  const mergeCandidateVisual = (candidate: any) => {
    const symbol = instrumentSymbol(candidate);
    const baseSymbol = instrumentBaseSymbol(candidate);
    const source =
      stockVisualMap.get(symbol) ??
      stockVisualMap.get(baseSymbol);

    if (!source) return candidate;

    return {
      ...source,
      ...candidate,
      visual:
        instrumentVisual(candidate) ||
        candidate?.image ||
        source.visual ||
        source?.image ||
        instrumentVisual(source),
      stockListSource: source,
    };
  };

const confidenceGates = applyBackendBlockersToConfidenceGates(
    baseConfidenceGates,
    backtestSummary,
  );


  const hasBackendPromotionTruth =
    backtestSummary?.promotionBlocked === true ||
    backtestSummary?.automaticFailureDetected === true ||
    backendFailureFlags.length > 0 ||
    backtestSummary?.promotionState === "Blocked" ||
    backtestSummary?.readinessLabel === "Blocked";

  const locallyComputedSurvivalScore = computeSurvivalScore({
    hasBacktestData,
    hasBacktestCurve,
    hasProvidedSignals,
    totalReturnPct: displayedBacktestReturnPct,
    sharpe: displayedBacktestSharpe,
    maxDrawdownPct: displayedBacktestMaxDrawdownPct,
    profitFactor: displayedBacktestProfitFactor,
    winRatePct: displayedBacktestWinRate,
    excessReturnPct: backtestSummary?.excessReturnPct ?? backtestSummary?.excess_return_pct,
    excessSharpe: backtestSummary?.excessSharpe ?? backtestSummary?.excess_sharpe,
    tradeCount: backtestTradeCount,
    segmentCount: backtestSegmentCount,
    regimeConsistencyPct,
    staleData,
    hasFailureFlags: failureFlags.length > 0 || backendFailureFlags.length > 0,
  });

  const survivalScore = hasBackendPromotionTruth
    ? Number(backtestSummary?.survivalScore ?? backtestSummary?.promotionConfidence ?? 45)
    : locallyComputedSurvivalScore;

  const confidenceStage = hasBackendPromotionTruth
    ? String(backtestSummary?.lifecycleStage ?? "Research validated")
    : productionStage(survivalScore, confidenceGates);

  const passedGateCount = confidenceGates.filter((gate) => gate.passed).length;

  const lifecycleStageDisplay = hasBackendPromotionTruth
    ? plainStageLabel("Research validated")
    : plainStageLabel(backtestSummary?.lifecycleStage ?? confidenceStage);

  const promotionStateDisplay = hasBackendPromotionTruth
    ? plainStageLabel("Promotion blocked")
    : plainStageLabel(backtestSummary?.promotionState ?? confidenceStage);

  const validationPostureDisplay = hasBackendPromotionTruth
    ? "Blocked by checks"
    : plainStageLabel(backtestSummary?.regime ?? regime);

  const readableFailureFlags = failureFlags.map(formatPromotionBlocker);


  return (
    <div className="min-h-screen bg-black text-white">
      <main className="relative mx-auto max-w-[1500px] px-5 py-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-xl border border-white/10 bg-[#0f0f0f] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-[#FDD000] text-black">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#FDD000]">Investment dashboard</div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Market overview</h1>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <select
              value={marketFilter}
              onChange={(event) => setMarketFilter(event.target.value)}
              className="h-11 rounded-lg border border-white/10 bg-black px-4 text-sm text-white outline-none ring-0"
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
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#FDD000] bg-[#FDD000] px-4 text-sm font-semibold text-black transition hover:bg-[#ffe45c]"
            >
              <RefreshCw className={cx("h-4 w-4", refreshingQuotes && "animate-spin")} />
              Update data
            </button>
          </div>
        </header>

        {refreshError ? (
          <div className="mb-5 flex items-center gap-3 rounded-lg border border-[#FDD000]/30 bg-[#FDD000]/10 px-4 py-3 text-sm text-[#FDD000]">
            <AlertTriangle className="h-4 w-4" />
            {refreshError}
          </div>
        ) : null}

        <section className="mb-6 grid min-w-0 items-stretch gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.85fr)]">
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#111] p-7 shadow-2xl shadow-black/30">
            <div className="max-w-3xl">
              <div className="mb-4 flex flex-wrap gap-2">
                <div
                  className={`top-8 hidden rounded-full border px-4 py-2 text-xs uppercase tracking-[0.2em] lg:block ${marketStatus === "Open"
                    ? "border-[#FDD000]/30 bg-[#FDD000]/10 text-[#FDD000]"
                    : "border-red-300/10 bg-red-300/5 text-red-200"
                    }`}
                >
                  {marketStatus === "Open" ? "Venue Open" : "Venue Closed"} · {lastSyncedLabel}
                </div>
                <StatusPill tone={avgRisk == null ? "neutral" : avgRisk < 45 ? "good" : avgRisk < 70 ? "warn" : "bad"}>
                  Risk level: {hasMarketData ? avgRisk == null ? "Neutral" : avgRisk < 45 ? "Good" : avgRisk < 70 ? "Warn" : "Bad" : ''}
                </StatusPill>
              </div>

              <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
                {hasMarketData ? regime : "Loading market view"}
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300">
                {!hasMarketData
                  ? "Loading prices, signals, and basic market context for the selected market."
                  : avgRisk != null && avgRisk > 72
                    ? "Market conditions look unstable. Keep more money in cash until volatility cools down."
                    : targetExposure < 35
                      ? "Conditions are improving, but only a few assets qualify. Keep position sizes small."
                      : "The trend is improving. Add exposure gradually while risk remains controlled."}
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                <MiniMetric label="Suggested maximum exposure" value={hasProvidedSignals ? fmtPlainPct(targetExposure) : "—"} />
                <MiniMetric label="Confidence score" value={confidence == null ? "—" : fmtPlainPct(confidence, 0)} />
              </div>
            </div>
          </div>

          <SectionShell eyebrow="Portfolio posture" title={hasMarketData ? mandate : "Loading suggested action"}>
            <div className="space-y-5">
              <p className="text-sm leading-6 text-zinc-400">
                {!hasMarketData
                  ? "Waiting for enough market data to make a simple suggestion."
                  : avgRisk != null && avgRisk > 72
                    ? "Risk is high. Avoid forcing new buys."
                    : targetExposure > 30
                      ? "Risk is acceptable. Increase only the clearest positions."
                      : "Stay flexible. These are ideas to review, not automatic buy orders."}
              </p>
              {hasMarketData ? (
                <>
                  <QualityBar value={avgRisk == null ? 0 : 100 - avgRisk} label="Risk control" />
                  <QualityBar value={hasProvidedSignals ? breadth : 0} label="Market participation" />
                </>
              ) : (
                <div className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-5 text-sm text-zinc-500">
                  Suggested action is loading...
                </div>
              )}
            </div>
          </SectionShell>
        </section>

        <section className="mb-6 grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
          <SectionShell
            eyebrow="Investment ideas"
            title="Top ideas for this market"
            action={<StatusPill tone="neutral">Top 5</StatusPill>}
          >
            {!hasMarketData ? (
              <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-8 text-sm text-zinc-500">
                Loading ideas for the selected market...
              </div>
            ) : !topOpportunities.length ? (
              <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-8 text-sm text-zinc-500">
                No buy ideas pass the current risk checks.
              </div>
            ) : null}

            <div className="mt-6 grid gap-3 lg:grid-cols-2">
              {hasMarketData && topOpportunities.map((stock, index) => {
                const ticker = normalizedTicker(stock);
                const isSelected = selected ? normalizedTicker(selected) === ticker : false;
                const isFlipped = isSelected && isSelectedCardFlipped;

                return (
                  <button
                    key={ticker}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setIsSelectedCardFlipped((value) => !value);
                      } else {
                        setSelectedTicker(ticker);
                        setIsSelectedCardFlipped(true);
                      }
                    }}
                    className="relative min-h-[320px] rounded-xl text-left outline-none [perspective:1400px]"
                    aria-label={isSelected && isFlipped ? "Show asset summary" : "Show asset price history"}
                  >
                    <div
                      className={cx(
                        "relative min-h-[320px] rounded-xl transition-transform duration-500 [transform-style:preserve-3d]",
                        isFlipped && "[transform:rotateY(180deg)]",
                      )}
                    >
                      <div
                        className={cx(
                          "absolute inset-0 rounded-xl border p-4 transition hover:-translate-y-0.5 hover:bg-white/[0.06] [backface-visibility:hidden]",
                          isSelected
                            ? "border-[#FDD000]/50 bg-[#FDD000]/10"
                            : "border-white/10 bg-white/[0.035]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <InstrumentAvatar instrument={mergeCandidateVisual(stock)} />
                            <div className="min-w-0">
                              <div className="truncate text-lg font-semibold text-white">{ticker}</div>
                              <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                #{index + 1} · {dataCoverageLabel(stock)}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 space-y-3">
                          <QualityBar value={stock.setupQuality} label="Quality score" />
                          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
                            <div>
                              <div className="text-zinc-500">Max position</div>
                              <div className="font-semibold text-slate-100">{fmtPlainPct(stock.suggestedExposure)}</div>
                            </div>
                            <div>
                              <div className="text-zinc-500">Expected change</div>
                              <div className="font-semibold text-slate-100">{fmtPct(stock.expectedMove)}</div>
                            </div>
                          </div>
                          <p className="line-clamp-3 text-xs leading-5 text-zinc-400">{stock.explanation}</p>
                        </div>
                      </div>

                      <div className="absolute inset-0 rounded-xl border border-[#FDD000]/40 bg-black p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-[#FDD000]">Price history</div>
                            <div className="mt-1 text-lg font-semibold text-white">{ticker}</div>
                            <div className="line-clamp-1 text-xs text-zinc-500">{stockName(stock)}</div>
                          </div>
                          <StatusPill tone={stock.expectedMove >= 0 ? "good" : "bad"}>{fmtPct(stock.expectedMove)}</StatusPill>
                        </div>

                        <div className="h-[200px] min-w-0 overflow-hidden">
                          {selectedHistoryLoading ? (
                            <div className="grid h-full place-items-center text-xs text-zinc-500">
                              Loading return path...
                            </div>
                          ) : !isFlipped || history.length < 2 ? (
                            <div className="grid h-full min-h-[210px] place-items-center text-xs text-zinc-500">
                              {history.length < 2 ? "Price history unavailable" : "Open price history"}
                            </div>
                          ) : (
                            <ResponsiveContainer width="99%" height={210}>
                              <AreaChart data={asChartData(history)} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                <defs>
                                  <linearGradient id={`institutionalPath-${ticker}`} x1="0" x2="0" y1="0" y2="1">
                                    <stop offset="0%" stopColor="#FDD000" stopOpacity={0.28} />
                                    <stop offset="100%" stopColor="#FDD000" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="index" hide />
                                <YAxis domain={["dataMin", "dataMax"]} hide />
                                <Tooltip
                                  content={({ active, payload }) =>
                                    active && payload?.length ? (
                                      <div className="rounded-lg border border-white/10 bg-black px-3 py-2 text-xs text-zinc-200 shadow-xl">
                                        {fmtCurrency(Number(payload[0].payload.price))}
                                      </div>
                                    ) : null
                                  }
                                />
                                <Area
                                  type="monotone"
                                  dataKey="price"
                                  stroke="#FDD000"
                                  strokeWidth={2.5}
                                  fill={`url(#institutionalPath-${ticker})`}
                                  dot={false}
                                  isAnimationActive={false}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </SectionShell>

          <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-5 shadow-2xl shadow-black/20">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FDD000]">
                  Strategy history
                </div>
                <h2 className="mt-1 text-xl font-semibold text-white">Past performance snapshot</h2>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                    Commission bps {backtestSummary?.commissionBps ?? backtestSummary?.commission_bps ?? 0}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                    Slippage bps {backtestSummary?.slippageBps ?? backtestSummary?.slippage_bps ?? 0}
                  </span>
                </div>
              </div>
              <StatusPill tone="warn">Needs review</StatusPill>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              <MiniMetric label="Total Return" value={hasBacktestData ? fmtPct(displayedBacktestReturnPct) : "—"} />
              <MiniMetric
                label="Annualized Sharpe Ratio"
                value={
                  failureFlags.includes("SUSPICIOUS_SHARPE") || failureFlags.includes("INVALID_SHARPE")
                    ? "—"
                    : Number.isFinite(Number(displayedBacktestSharpe))
                      ? Number(displayedBacktestSharpe).toFixed(2)
                      : "—"
                }
                sub="Return compared with volatility. Higher is better."
              />
              <MiniMetric label="Average Holding Time" value="—" sub="Open positions" />
              <MiniMetric label="Profit Factor" value={hasBacktestData ? Number(displayedBacktestProfitFactor).toFixed(2) : "—"} />
              <MiniMetric label="Win Rate" value={hasBacktestData ? fmtPlainPct(displayedBacktestWinRate) : "—"} />
              <MiniMetric
                label="Max Drawdown"
                value={Number.isFinite(Number(displayedBacktestMaxDrawdownPct)) ? fmtPlainPct(displayedBacktestMaxDrawdownPct) : "—"}
              />
              <MiniMetric
                label="Excess Return"
                value={hasBacktestData ? fmtPct(backtestSummary?.excessReturnPct ?? backtestSummary?.excess_return_pct) : "—"}
                sub="vs equal-weight benchmark"
              />
              <MiniMetric
                label="Excess Sharpe"
                value={
                  hasBacktestData && (backtestSummary?.excessSharpe ?? backtestSummary?.excess_sharpe) != null
                    ? Number(backtestSummary?.excessSharpe ?? backtestSummary?.excess_sharpe).toFixed(2)
                    : "—"
                }
                sub="vs equal-weight benchmark"
              />
            </div>

          </div>
        </section>

        <section className="mb-6 grid min-w-0 gap-5">
          <SectionShell
            eyebrow="Readiness check"
            title="Can this strategy be tested live?"
            action={<StatusPill tone={productionTone(confidenceStage)}>{promotionStateDisplay}</StatusPill>}
          >
              <p className="max-w-4xl text-sm leading-6 text-zinc-400">
                This check asks a simple question: is the strategy strong enough to test with real-time data? It reviews past results,
                risk, number of trades, benchmark comparison, and warning flags. It does not guarantee future performance.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Checks passed</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">{passedGateCount}/10 gates</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Reliability score</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">{survivalScore}/100</div>
                  <div className="mt-1 text-[11px] text-zinc-500">Higher means more reliable</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Status</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">{promotionStateDisplay}</div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Review stage</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">{lifecycleStageDisplay}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Tested trades</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">{backtestTradeCount}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">{backtestSegmentCount ?? 0} test periods</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Similar market match</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">
                    {regimeConsistencyPct == null ? "Pending" : fmtPlainPct(regimeConsistencyPct, 0)}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">{validationPostureDisplay}</div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {confidenceGates.map((gate) => (
                  <div
                    key={gate.key}
                    className="rounded-lg border border-white/10 bg-[#151515] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">{gate.label}</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-500">{gate.reason}</div>
                      </div>
                      <StatusPill tone={gate.passed ? "good" : gate.severity}>
                        {gate.passed ? "Pass" : "Watch"}
                      </StatusPill>
                    </div>
                    <div className="mt-3 text-sm font-semibold text-slate-200">
                      {String(gate.value)
                        .replace("1 / 3 segments", "1 of 3 required segments")
                        .replace("8 signals, blocked", "8 live signals, promotion blocked")}
                    </div>
                  </div>
                ))}
              </div>

              {failureFlags.length ? (
                <div className="mt-5 rounded-lg border border-red-400/20 bg-red-500/10 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-100">
                    <AlertTriangle className="h-4 w-4" />
                    Items to fix
                  </div>
                  <div className="space-y-1 text-sm text-rose-100/80">
                    {readableFailureFlags.map((flag) => (
                      <div key={flag}>• {flag}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-lg border border-[#FDD000]/30 bg-[#FDD000]/10 p-4 text-sm text-[#FDD000]">
                  No warning flags are active for the current market view.
                </div>
              )}
          </SectionShell>
        </section>

        <section className="mb-6 grid min-w-0 gap-5">
          <SectionShell
            eyebrow="Action lists"
            title="Buy, hold, and sell lists"
            action={<StatusPill tone="neutral">{hasMarketData ? `${filtered.length} assets` : "Loading"}</StatusPill>}
          >
            <div className="my-4">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by ticker or asset name..."
                className="h-11 w-full rounded-lg border border-white/10 bg-black px-4 text-sm text-white outline-none placeholder:text-zinc-600"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {ledgerGroups.map((group) => (
                <AllocationLedgerTable
                  key={group.action}
                  action={group.action}
                  items={group.items}
                  selectedTicker={selectedTicker}
                  onSelectInstrument={(ticker) => {
                    setSelectedTicker(ticker);
                    setIsSelectedCardFlipped(true);
                  }}
                  loading={loading}
                />
              ))}
            </div>
          </SectionShell>
        </section>

        <section className="mb-6 grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <SectionShell eyebrow="Market explanation" title="What the market data means">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-[#151515] p-4">
                <div className="mb-4 flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-[#FDD000]" />
                  <div>
                    <div className="font-semibold text-white">Trend strength</div>
                    <div className="text-xs text-zinc-500">How clear the price direction looks</div>
                  </div>
                </div>
                {hasMarketData ? <QualityBar value={hasUsableMarketData && avgQuality != null ? avgQuality : 0} /> : null}
                <p className="mt-4 text-sm leading-6 text-zinc-400">
                  {hasMarketData
                    ? "Some trends are present, but not all are strong. Focus on the clearest ideas."
                    : "Trend strength will appear after market data loads."}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#151515] p-4">
                <div className="mb-4 flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-[#FDD000]" />
                  <div>
                    <div className="font-semibold text-white">Risk control</div>
                    <div className="text-xs text-zinc-500">How stable the market looks</div>
                  </div>
                </div>
                {hasMarketData ? <QualityBar value={hasUsableMarketData && avgRisk != null ? 100 - avgRisk : 0} /> : null}
                <p className="mt-4 text-sm leading-6 text-zinc-400">
                  {hasMarketData
                    ? `Volatility is ${avgRisk != null && avgRisk > 65 ? "high" : "under control"} and confidence is ${confidence != null && confidence > 65 ? "acceptable" : "mixed"}.`
                    : "Risk control will appear after live data loads."}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#151515] p-4">
                <div className="mb-4 flex items-center gap-3">
                  <Layers className="h-5 w-5 text-[#FDD000]" />
                  <div>
                    <div className="font-semibold text-white">Position durability</div>
                    <div className="text-xs text-zinc-500">How suitable the ideas are to hold</div>
                  </div>
                </div>
                {hasMarketData ? <QualityBar value={hasProvidedSignals && avgQuality != null && confidence != null ? clamp((avgQuality + confidence) / 2) : 0} /> : null}
                <p className="mt-4 text-sm leading-6 text-zinc-400">
                  {hasMarketData
                    ? "The list favors ideas that have both trend support and risk control."
                    : "Position durability will appear after investment ideas load."}
                </p>
              </div>
            </div>
          </SectionShell>

          <SectionShell className="min-w-0" eyebrow="Risk and opportunity" title="Risk and opportunity map">
            <div className="h-[200px] min-w-0 overflow-hidden">
              {surface.length < 2 ? (
                <div className="grid h-full min-h-[230px] place-items-center text-xs text-zinc-500">
                  {hasMarketData ? "The map will appear after confirmed signals are available." : "Loading map..."}
                </div>
              ) : (
                <ResponsiveContainer width="99%" height={230}>
                  <ScatterChart margin={{ top: 8, right: 10, bottom: 8, left: -20 }}>
                    <CartesianGrid stroke="rgba(148, 163, 184, 0.08)" />
                    <XAxis type="number" dataKey="x" name="Trend" domain={[0, 100]} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                    <YAxis type="number" dataKey="y" name="Risk control" domain={[0, 100]} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as any;
                        return (
                          <div className="rounded-lg border border-white/10 bg-black px-4 py-3 text-xs shadow-xl">
                            <div className="font-semibold text-white">{row.ticker}</div>
                            <div className="mt-1 text-zinc-400">Quality score {Math.round(row.stock.setupQuality)}/100</div>
                            <div className="text-zinc-400">Risk level {Math.round(row.stock.riskPressure)}/100</div>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={asChartData(surface)} fill="#FDD000" />
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>
          </SectionShell>
        </section>

        <footer className="pb-8 text-center text-xs text-zinc-600">
          {totalStocks ? `${totalStocks.toLocaleString()} assets covered in this market` : "Coverage loading"} · Last updated {lastSyncedLabel}
        </footer>
      </main>
    </div>
  );
}
