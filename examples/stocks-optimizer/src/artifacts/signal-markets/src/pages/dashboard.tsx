import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Brain,
  ChevronDown,
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
  fetchStockList,
  fetchStockQuoteBatch,
  registerSignalWatchlist,
  type AllocationAction,
  type BeliefDiagnostic,
  type CounterfactualDiagnostic,
  type DecisionStatesDiagnostic,
  type DiscoveryAccountabilityDiagnostic,
  type DiscoveryIntelligenceDiagnostic,
  type ExecutiveDecisionDiagnostic,
  type ExecutionQualityDiagnostic,
  type HistoryDiagnostics,
  type JudgementDiagnostic,
  type MarketOption,
  type ReadinessRemediationDiagnostic,
  type RecognitionDiagnostic,
  type RecoveryDiagnostic,
  type RestorationProgressDiagnostic,
  type ResolveDiagnostic,
  type StockData,
  type StockQuote,
  type StockStatus,
  type SurvivalMemoryDiagnostic,
  type TradeSignal,
  type TrustGovernorDiagnostic,
  type WisdomDiagnostic,
} from "@/lib/api";
import CommandCenter from "@/components/CommandCenter";
import DecisionOperatingSystem, {
  type DecisionEvidenceStage,
  type DecisionOpportunity,
  type DecisionTone,
  type DecisionWorkflowStep,
} from "@/components/DecisionOperatingSystem";
import MarketPerceptionEngine from "@/components/MarketPerceptionEngine";
import { buildCommandCenterViewModel } from "@/lib/command-center";
import { resolveDashboardViewState } from "@/lib/dashboard-state";
import {
  MarketStateEngine,
  buildMarketPerceptionMetrics,
  createDefaultMetricRegistry,
  type MarketStateSnapshot,
} from "@/lib/market-perception";
import {
  capReliabilityConfidence,
  capReliabilityExposure,
  evaluateMarketReliability,
  shouldUseDefensiveReliabilityPosture,
} from "@/lib/market-reliability";
import {
  assetSizingLabel,
  buildDashboardExposureSizing,
  requestedExposureForAsset,
  sizeAssetExposure,
  sizingModeLabelForOperator,
  sizingModeSentenceForOperator,
} from "@/lib/sizing";
import { buildDashboardSemanticMetrics } from "@/lib/semantic-metrics";
import { buildExecutiveDashboardIA } from "@/lib/dashboard-ia";

const STOCK_LIST_PAGE_SIZE = 500;
const INITIAL_QUOTE_SYMBOL_LIMIT = 140;
const MAX_QUOTE_SYMBOL_LIMIT = 500;
const MIN_QUOTE_COVERAGE_RATIO = 1;
const QUOTE_BATCH_SIZE = 25;
const REFRESH_INTERVAL_MS = 60_000;
const STARTING_PORTFOLIO_VALUE = 1_000;
const ENABLE_STRATEGY_API =
  import.meta.env.VITE_ENABLE_STRATEGY_API !== "false";
const ENABLE_PORTFOLIO_API =
  import.meta.env.VITE_ENABLE_PORTFOLIO_API === "true";

const DEFAULT_MARKET_OPTIONS: MarketOption[] = [
  { code: "US", label: "Stocks", count: 0 },
  { code: "BINANCE", label: "Crypto", count: 0 },
  { code: "FOREX", label: "Forex", count: 0 },
  { code: "ETF", label: "ETFs", count: 0 },
  { code: "FUTURES", label: "Commodities", count: 0 },
  { code: "INDEXES", label: "Indexes", count: 0 },
];

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
  signalStatus?:
    | "confirmed"
    | "provided"
    | "missing"
    | "watch"
    | "blocked"
    | "risk-exit";
  allocationAction?: AllocationAction;
  sizingMode?: "none" | "micro" | "small" | "normal" | "large" | "maxSafe";
  sizingReasons?: string[];
  sizingConstraints?: Array<{
    id: string;
    label?: string;
    passed: boolean;
    reason?: string;
  }>;
  sizingRationale?: string[];
  opportunityDiscovery?: any;
  discovery?: any;
  agencyTrace?: any;
  agency?: any;
  belief?: BeliefDiagnostic | null;
  recognition?: RecognitionDiagnostic;
  judgement?: JudgementDiagnostic;
  survivalMemory?: SurvivalMemoryDiagnostic;
  trustGovernor?: TrustGovernorDiagnostic;
  recovery?: RecoveryDiagnostic;
  restorationProgress?: RestorationProgressDiagnostic;
  resolve?: ResolveDiagnostic;
  wisdom?: WisdomDiagnostic;
  discoveryIntelligence?: DiscoveryIntelligenceDiagnostic;
  discoveryScore?: number;
  discoveryLifecycle?: string;
  candidateProgression?: Array<any>;
  adaptiveSuggestedExposure?: number;
  rejectionReason?: string | null;
  decisionIntelligence?: any;
  coherenceScore?: number;
  coherenceStatus?: string;
  consensusLevel?: number;
  predictionScenarios?: Array<any>;
  simulationRecommendation?: string;
  wisdomDecision?: string;
  outcomeAccuracy?: number | null;
  accountabilitySummary?: string;
  decisionReplayAvailable?: boolean;
  actionAllowed?: boolean;
  actionScale?: number;
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
  sizingMode?: "none" | "micro" | "small" | "normal" | "large" | "maxSafe";
  sizingReasons?: string[];
  sizingConstraints?: Array<{
    id: string;
    label?: string;
    passed: boolean;
    reason?: string;
  }>;
  sizingRationale?: string[];
  opportunityDiscovery?: any;
  discovery?: any;
  agencyTrace?: any;
  agency?: any;
  belief?: BeliefDiagnostic | null;
  recognition?: RecognitionDiagnostic;
  judgement?: JudgementDiagnostic;
  survivalMemory?: SurvivalMemoryDiagnostic;
  trustGovernor?: TrustGovernorDiagnostic;
  recovery?: RecoveryDiagnostic;
  restorationProgress?: RestorationProgressDiagnostic;
  resolve?: ResolveDiagnostic;
  wisdom?: WisdomDiagnostic;
  discoveryIntelligence?: DiscoveryIntelligenceDiagnostic;
  discoveryScore?: number;
  discoveryLifecycle?: string;
  candidateProgression?: Array<any>;
  adaptiveSuggestedExposure?: number;
};

const MARKET_SCHEDULES: Array<{ match: RegExp; schedule: MarketSchedule }> = [
  {
    match: /BINANCE|CRYPTO/i,
    schedule: { timeZone: "UTC", open: [0, 0], close: [24, 0], weekend: [] },
  },
  {
    match: /ADX|DFM|DUBAI|ABU DHABI|UAE/i,
    schedule: {
      timeZone: "Asia/Dubai",
      open: [10, 0],
      close: [15, 0],
      weekend: [0, 6],
    },
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
    match: /NASDAQ|NYSE|AMEX|ARCA|BATS|IEX|US\b/i,
    schedule: {
      timeZone: "America/New_York",
      open: [9, 30],
      close: [16, 0],
      weekend: [0, 6],
    },
  },
  {
    match: /LSE|LONDON|AIM|UK\b/i,
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

type MarketExecutionProfileName =
  | "CRYPTO_LIQUID"
  | "US_LARGE_CAP"
  | "BRAZIL_B3"
  | "EUROPE_LIQUID"
  | "JAPAN_LIQUID";

type MarketExecutionPreset = {
  name: string;
  profile: MarketExecutionProfileName;
  spreadBps: number;
  slippageBps: number;
  rebalanceThresholdBps: number;
  totalExposureCap: number;
  maxPositionPct: number;
  mptLookback: number;
  riskAversion: number;
  shrinkage: number;
};

const MARKET_EXECUTION_PRESETS: Record<MarketExecutionProfileName, MarketExecutionPreset> = {
  CRYPTO_LIQUID: {
    name: "Crypto liquid",
    profile: "CRYPTO_LIQUID",
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
    name: "US large cap",
    profile: "US_LARGE_CAP",
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
    name: "Brazil B3",
    profile: "BRAZIL_B3",
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
    name: "Europe liquid",
    profile: "EUROPE_LIQUID",
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
    name: "Japan liquid",
    profile: "JAPAN_LIQUID",
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
  const normalized = market.trim().toUpperCase();

  if (/BINANCE|CRYPTO/.test(normalized)) {
    return MARKET_EXECUTION_PRESETS.CRYPTO_LIQUID;
  }

  if (/B3|BMFBOVESPA|BRASIL|BRAZIL/.test(normalized)) {
    return MARKET_EXECUTION_PRESETS.BRAZIL_B3;
  }

  if (/NASDAQ|NYSE|AMEX|ARCA|BATS|IEX|US\b|USA/.test(normalized)) {
    return MARKET_EXECUTION_PRESETS.US_LARGE_CAP;
  }

  if (
    /LSE|LONDON|AIM|UK\b|EURONEXT|PARIS|AMSTERDAM|BRUSSELS|LISBON|EUROPE/.test(
      normalized,
    )
  ) {
    return MARKET_EXECUTION_PRESETS.EUROPE_LIQUID;
  }

  if (/TSE|TOKYO|JAPAN|JP\b/.test(normalized)) {
    return MARKET_EXECUTION_PRESETS.JAPAN_LIQUID;
  }

  return MARKET_EXECUTION_PRESETS.CRYPTO_LIQUID;
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
  if (value == null) return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positiveNumberOrNull(value: unknown) {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function optionalNumber(value: unknown) {
  if (value == null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
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

function fmtPlainNumber(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function fmtYears(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} years`;
}

function coverageStatusLabel(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "Pending";
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  return String(
    anyMarket.label ??
      anyMarket.name ??
      anyMarket.code ??
      anyMarket.value ??
      "",
  );
}

function resolveMarketSchedule(market: string): MarketSchedule {
  const normalized = market.trim().toUpperCase();
  return (
    MARKET_SCHEDULES.find((entry) => entry.match.test(normalized))?.schedule ??
    DEFAULT_MARKET_SCHEDULE
  );
}

function getMarketStatus(market: string): "Open" | "Closed" {
  const schedule = resolveMarketSchedule(market);
  if (
    schedule.open[0] === 0 &&
    schedule.close[0] === 24 &&
    schedule.weekend.length === 0
  )
    return "Open";

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
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
  const day = weekdayMap[weekdayText] ?? 0;
  if (schedule.weekend.includes(day)) return "Closed";

  const nowMinutes = hour * 60 + minute;
  const openMinutes = schedule.open[0] * 60 + schedule.open[1];
  const closeMinutes = schedule.close[0] * 60 + schedule.close[1];
  const isOpen =
    closeMinutes >= openMinutes
      ? nowMinutes >= openMinutes && nowMinutes < closeMinutes
      : nowMinutes >= openMinutes || nowMinutes < closeMinutes;

  return isOpen ? "Open" : "Closed";
}

function normalizedTicker(stock: Partial<DisplayStock> & { symbol?: string }) {
  return String(stock.ticker ?? stock.symbol ?? "").trim();
}

function instrumentMatchKeys(
  value: Partial<DisplayStock> | Record<string, any>,
) {
  const raw = String(value?.ticker ?? value?.symbol ?? "")
    .trim()
    .toUpperCase();
  const bare = raw.replace(/^[A-Z0-9_]+:/, "");
  return Array.from(new Set([raw, bare].filter(Boolean)));
}

function stockName(stock: Partial<DisplayStock>) {
  return String(
    (stock as any).name ??
      (stock as any).description ??
      normalizedTicker(stock),
  );
}

function hasStockEvidence(stock: Partial<DisplayStock>) {
  const history = Array.isArray((stock as any).history)
    ? (stock as any).history
    : [];
  const price = positiveNumberOrNull((stock as any).price);
  const changePercent = optionalNumber((stock as any).changePercent);
  const signalConfidence = optionalNumber((stock as any).signalConfidence);

  return (
    stock.quoteStatus === "available" ||
    stock.signalStatus === "provided" ||
    stock.signalStatus === "confirmed" ||
    history.length >= 2 ||
    (price != null && changePercent != null && changePercent !== 0) ||
    signalConfidence != null
  );
}

function quoteHasLivePrice(
  quote: Partial<StockQuote> | Partial<DisplayStock> | Record<string, unknown>,
) {
  return (
    positiveNumberOrNull(
      (quote as any).price ?? (quote as any).last ?? (quote as any).close,
    ) != null
  );
}

function hasLiveQuoteCoverage(list: DisplayStock[]) {
  return list.some(
    (item) => item.quoteStatus === "available" || quoteHasLivePrice(item),
  );
}

function hasSessionMarketCoverage(list: DisplayStock[]) {
  return list.some((item) => hasStockEvidence(item));
}

function dataCoverageLabel(stock: Partial<DisplayStock>) {
  if (stock.quoteStatus === "available") return "live quote";
  if (stock.signalStatus === "provided" || stock.signalStatus === "confirmed")
    return "signal";
  if (
    Array.isArray((stock as any).history) &&
    (stock as any).history.length >= 2
  )
    return "history";
  return "pending";
}

function historyReturns(history?: number[]) {
  if (!history || history.length < 2) return [];
  const values: number[] = [];
  for (let i = 1; i < history.length; i += 1) {
    const prev = Number(history[i - 1]);
    const next = Number(history[i]);
    if (prev > 0 && Number.isFinite(next))
      values.push(((next - prev) / prev) * 100);
  }
  return values;
}

function mean(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
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
  const annualizedSharpe =
    volatility > 0 ? (avgReturn / volatility) * Math.sqrt(252) : null;

  const grossProfit = returns
    .filter((value) => value > 0)
    .reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(
    returns.filter((value) => value < 0).reduce((sum, value) => sum + value, 0),
  );
  const profitFactor =
    grossLoss === 0
      ? grossProfit > 0
        ? Infinity
        : null
      : grossProfit / grossLoss;
  const winRatePct = returns.length
    ? (returns.filter((value) => value > 0).length / returns.length) * 100
    : null;

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
    totalReturnPct:
      numeric(first?.equity) > 0
        ? (numeric(last?.equity) / numeric(first?.equity) - 1) * 100
        : null,
    annualizedSharpe,
    profitFactor,
    winRatePct,
    maxDrawdownPct,
    equity: numeric(last?.equity),
  };
}

function applyExecutionCostsToCurve(
  curve: Array<any>,
  trades: Array<any>,
  commissionBps: number,
  slippageBps: number,
) {
  const totalCostBps = Math.max(0, commissionBps) + Math.max(0, slippageBps);

  if (!curve.length || !trades.length || totalCostBps <= 0) return curve;

  const commissionRate = totalCostBps / 10_000;
  const events = new Map<string, number>();

  for (const trade of trades) {
    const exposure = Math.max(0, numeric(trade.entryExposure)) / 100;

    if (exposure <= 0) continue;

    const entryDate = dateKey(trade.entryDate);
    const exitDate = dateKey(trade.exitDate);

    events.set(
      entryDate,
      (events.get(entryDate) ?? 0) + exposure * commissionRate,
    );

    if (exitDate) {
      events.set(
        exitDate,
        (events.get(exitDate) ?? 0) + exposure * commissionRate,
      );
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
    const baseEquity =
      index === 0 ? adjustedEquity : numeric(curve[0]?.equity) * dragFactor;

    return {
      ...point,
      equity: adjustedEquity,
      returnPct:
        baseEquity > 0
          ? (adjustedEquity / baseEquity - 1) * 100
          : numeric(point.returnPct),
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

type DashboardNeedDiagnostic = {
  needId: string;
  category: string;
  severity: number;
  confidence: number;
  explanation: string;
  recommendations: string[];
};

export function resolveDashboardNeedDiagnostics(input: {
  rawNeeds: DashboardNeedDiagnostic[];
  strategyReadinessBlocked: boolean;
  strategyMaxPositionPct: number | null;
  calibrationStatus: string;
  calibrationTrustworthiness: number | null;
  calibratedConfidence: number | null;
  rawConfidence: number | null;
}) {
  const calibrationRequiresReview = [
    "insufficient-history",
    "poor-calibration",
    "unstable-outcomes",
  ].includes(input.calibrationStatus);
  const commitmentBlocked =
    input.strategyReadinessBlocked ||
    input.strategyMaxPositionPct === 0 ||
    calibrationRequiresReview;

  if (!commitmentBlocked) return input.rawNeeds;

  const trustedConfidence =
    input.calibratedConfidence ?? input.rawConfidence ?? 50;
  const severity = Math.round(clamp(Math.max(35, 100 - trustedConfidence)));
  const confidence = Math.round(
    clamp(
      input.calibrationTrustworthiness ??
        input.calibratedConfidence ??
        input.rawConfidence ??
        50,
    ),
  );
  const explanation =
    input.strategyReadinessBlocked && calibrationRequiresReview
      ? "Strategy readiness and calibration gates block participation; wait for readiness and outcome stability before increasing exposure."
      : input.strategyReadinessBlocked
        ? "Strategy readiness gates block participation; wait for readiness before increasing exposure."
        : input.calibrationStatus === "unstable-outcomes"
          ? "Calibration history has enough samples, but outcomes are unstable; wait for similar signals to become more consistent before increasing participation."
          : input.calibrationStatus === "poor-calibration"
            ? "Historical calibration is not reliable enough yet; keep this review-gated before increasing participation."
            : input.calibrationStatus === "insufficient-history"
              ? "Calibration history is still insufficient; keep this review-gated before increasing participation."
              : "Sizing gates set available capacity to zero; wait until commitment capacity reopens.";

  return [
    {
      needId: `wait:${severity}`,
      category: "wait",
      severity,
      confidence,
      explanation,
      recommendations: [
        "Keep the objective under human review until the blocking gate clears.",
        "Do not convert improving perception signals into action while commitment is blocked.",
      ],
    },
  ];
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
  if (
    summary?.benchmarkPassed === true ||
    summary?.benchmarkStatus === "Pass" ||
    summary?.benchmarkComparison === "Pass"
  ) {
    return true;
  }

  if (
    summary?.benchmarkPassed === false ||
    summary?.benchmarkStatus === "Failed" ||
    summary?.benchmarkComparison === "Failed"
  ) {
    return false;
  }

  const excessReturn = finiteNumber(
    summary?.excessReturnPct ?? summary?.excess_return_pct,
  );
  const excessSharpe = finiteNumber(
    summary?.excessSharpe ?? summary?.excess_sharpe,
  );

  if (excessReturn == null && excessSharpe == null) return null;

  return (excessReturn ?? 0) >= 0 && (excessSharpe ?? 0) >= -0.1;
}

function extractRegimeConsistency(
  summary: any,
  currentRegime: string,
  trades: Array<any>,
) {
  const explicit =
    finiteNumber(summary?.regimeConsistencyPct) ??
    finiteNumber(summary?.regime_consistency_pct) ??
    finiteNumber(summary?.regimeSurvivalPct) ??
    finiteNumber(summary?.regime_survival_pct);

  if (explicit != null) return explicit;

  const current = normalizeRegimeLabel(currentRegime);
  const regimeTrades = trades
    .map((trade) =>
      normalizeRegimeLabel(
        trade.regime ?? trade.marketRegime ?? trade.market_regime,
      ),
    )
    .filter(Boolean);

  if (!current || !regimeTrades.length) return null;

  const matching = regimeTrades.filter((regime) => regime === current).length;
  return (matching / regimeTrades.length) * 100;
}

function extractAverageHoldingDays(summary: any, trades: Array<any>) {
  const explicit =
    finiteNumber(summary?.averageHoldingDuration) ??
    finiteNumber(summary?.average_holding_duration) ??
    finiteNumber(summary?.averageHoldingDays) ??
    finiteNumber(summary?.average_holding_days) ??
    finiteNumber(summary?.averageDurationDays) ??
    finiteNumber(summary?.average_duration_days);

  if (explicit != null) return explicit;

  const durations = trades
    .map((trade) => {
      const explicitTradeDuration =
        finiteNumber(trade.durationDays) ??
        finiteNumber(trade.duration_days) ??
        finiteNumber(trade.holdingDays) ??
        finiteNumber(trade.holding_days);

      if (explicitTradeDuration != null) return explicitTradeDuration;

      const entry = Date.parse(
        String(trade.entryDate ?? trade.entry_date ?? ""),
      );
      const exit = Date.parse(String(trade.exitDate ?? trade.exit_date ?? ""));

      if (!Number.isFinite(entry) || !Number.isFinite(exit) || exit < entry)
        return null;
      return Math.max(1, Math.round((exit - entry) / 86_400_000));
    })
    .filter(
      (value): value is number => value != null && Number.isFinite(value),
    );

  return durations.length ? mean(durations) : null;
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
  score += scoreGate(maxDrawdown <= 25, 12);
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
  const failedBadGates = gates.filter(
    (gate) => !gate.passed && gate.severity === "bad",
  ).length;

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
  const flags = Array.isArray(summary?.failureFlags)
    ? summary.failureFlags
    : [];

  const blocked =
    summary?.promotionBlocked === true ||
    summary?.automaticFailureDetected === true ||
    summary?.promotionState === "Blocked" ||
    summary?.readinessLabel === "Blocked" ||
    flags.length > 0;

  if (!blocked) return gates;

  const hasSharpeValue =
    finiteNumber(
      summary?.annualizedSharpe ??
        summary?.annualized_sharpe ??
        summary?.sharpeRatio ??
        summary?.sharpe_ratio,
    ) != null;

  const hasInvalidSharpe =
    flags.includes("INVALID_SHARPE") ||
    flags.includes("SUSPICIOUS_SHARPE") ||
    flags.includes("LOW_SHARPE") ||
    !hasSharpeValue;

  const hasDrawdownValue =
    finiteNumber(
      summary?.maxDrawdownPct ??
        summary?.max_drawdown_pct ??
        summary?.rawMaxDrawdownPct ??
        summary?.raw_max_drawdown_pct,
    ) != null;

  const hasInvalidDrawdown =
    flags.includes("INVALID_DRAWDOWN") ||
    flags.includes("ZERO_DRAWDOWN_WITH_TRADES") ||
    flags.includes("OVERFIT_LOW_DRAWDOWN") ||
    !hasDrawdownValue;

  const hasInsufficientSegments =
    flags.includes("INSUFFICIENT_WALK_FORWARD_SEGMENTS") ||
    Number(summary?.segmentCount ?? summary?.segment_count ?? 0) < 3;
  const hasWalkForwardInstability =
    flags.includes("WALK_FORWARD_UNSTABLE") ||
    flags.includes("OVERFIT_WALK_FORWARD_INSTABILITY");
  const hasProfitFactorOverfit = flags.includes("OVERFIT_PROFIT_FACTOR");
  const hasParameterInstability = flags.includes("PARAMETER_INSTABILITY");
  const hasConcentrationDependency =
    flags.includes("OUTLIER_DEPENDENCY") ||
    flags.includes("OVERFIT_TOP_WINNER_DEPENDENCY") ||
    flags.includes("OVERFIT_SEGMENT_CONCENTRATION");
  const hasLiveSignalMismatch = flags.includes("LIVE_SIGNAL_MISMATCH");
  const hasRobustnessFailure =
    flags.includes("ROBUSTNESS_OVERFIT_RISK") ||
    flags.includes("ROBUSTNESS_EXECUTION_BLOCKED") ||
    summary?.robustnessPassed === false ||
    summary?.strategyReadiness?.components?.robustness?.passed === false;

  const hasBenchmarkFailure =
    flags.includes("BENCHMARK_FAILED") ||
    flags.includes("BENCHMARK_COMPARISON_FAILED") ||
    flags.includes("BENCHMARK_UNDERPERFORMANCE") ||
    flags.includes("SEVERE_BENCHMARK_UNDERPERFORMANCE") ||
    flags.includes("WEAK_BENCHMARK_MARGIN") ||
    summary?.benchmarkStatus === "Failed" ||
    summary?.benchmarkPassed === false ||
    Number(
      summary?.excessReturnPct ??
        summary?.excess_return_pct ??
        summary?.excessReturn ??
        0,
    ) < 0;

  return gates.map((gate) => {
    if (
      gate.key === "walkForward" &&
      (hasInsufficientSegments || hasWalkForwardInstability)
    ) {
      return {
        ...gate,
        passed: false,
        value: hasInsufficientSegments
          ? `${Number(summary?.segmentCount ?? summary?.segment_count ?? 1)} / 3 segments`
          : "Unstable returns",
        severity: "warn",
      };
    }

    if (gate.key === "sameEngine" && hasLiveSignalMismatch) {
      const forwardShadow = summary?.forwardShadow ?? {};
      const averageReturn = finiteNumber(
        forwardShadow?.averageReturnPct ?? forwardShadow?.meanReturnPct,
      );

      return {
        ...gate,
        passed: false,
        value:
          averageReturn == null
            ? "Forward evidence failed"
            : `Forward avg ${fmtPct(averageReturn)}`,
        severity: "warn",
      };
    }

    if (gate.key === "riskAdjusted" && hasInvalidSharpe) {
      return {
        ...gate,
        passed: false,
        value: flags.includes("LOW_SHARPE")
          ? "Sharpe below 1.00"
          : "Statistically unreliable",
        severity: "warn",
      };
    }

    if (gate.key === "drawdown" && hasInvalidDrawdown) {
      return {
        ...gate,
        passed: false,
        value: flags.includes("OVERFIT_LOW_DRAWDOWN")
          ? "Too clean"
          : flags.includes("ZERO_DRAWDOWN_WITH_TRADES")
            ? "Suspicious zero drawdown"
            : flags.includes("INVALID_DRAWDOWN")
              ? "Unavailable"
              : fmtPlainPct(
                  summary?.maxDrawdownPct ?? summary?.max_drawdown_pct ?? 0,
                ),
        severity: "warn",
      };
    }

    if (gate.key === "profitFactor" && hasProfitFactorOverfit) {
      return {
        ...gate,
        passed: false,
        value: "Suspiciously high",
        severity: "warn",
      };
    }

    if (gate.key === "regime" && hasParameterInstability) {
      return gate;
    }

    if (gate.key === "parameterRobustness" && hasParameterInstability) {
      return {
        ...gate,
        passed: false,
        value: "Unstable variants",
        severity: "warn",
      };
    }

    if (gate.key === "concentration" && hasConcentrationDependency) {
      return {
        ...gate,
        passed: false,
        value: "Outlier dependent",
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

    if (gate.key === "robustness" && hasRobustnessFailure) {
      return {
        ...gate,
        passed: false,
        value: flags.includes("ROBUSTNESS_EXECUTION_BLOCKED")
          ? "Safety gate blocked"
          : gate.value,
        severity: "bad",
      };
    }

    return gate;
  });
}

function formatPromotionBlocker(flag: string, summary?: any) {
  if (flag === "NEEDS_FORWARD_SHADOW") {
    const forwardShadow = summary?.forwardShadow ?? {};
    const observed = Number(forwardShadow?.observedSignalCount ?? 0);
    const evaluated = Number(forwardShadow?.evaluatedSignalCount ?? 0);
    const required = Number(forwardShadow?.requiredSignals ?? 0);

    if (observed > 0 && evaluated < required) {
      return `Forward shadow evidence is collecting (${evaluated}/${required} evaluated)`;
    }
  }

  const labels: Record<string, string> = {
    INVALID_SHARPE: "Risk-adjusted return is not reliable enough yet",
    SUSPICIOUS_SHARPE: "Risk-adjusted return is not reliable enough yet",
    ZERO_DRAWDOWN_WITH_TRADES: "The drawdown result looks unrealistic",
    INSUFFICIENT_WALK_FORWARD_SEGMENTS: "More test periods are needed",
    BENCHMARK_UNDERPERFORMANCE:
      "The strategy did not beat the simple benchmark",
    SEVERE_BENCHMARK_UNDERPERFORMANCE:
      "The strategy was far below the simple benchmark",
    BENCHMARK_COMPARISON_FAILED: "Benchmark comparison failed",
    INVALID_DRAWDOWN: "Drawdown could not be checked",
    BENCHMARK_FAILED: "The strategy failed the benchmark check",
    WEAK_BENCHMARK_MARGIN:
      "The benchmark edge is too small after safety margin",
    OVERFIT_PROFIT_FACTOR: "Profit factor or win rate looks too clean",
    OVERFIT_LOW_DRAWDOWN:
      "Drawdown is too clean for the return and trade count",
    OVERFIT_WALK_FORWARD_INSTABILITY:
      "Walk-forward returns are not stable enough",
    SYNTHETIC_DATA_FOR_PROMOTION:
      "Synthetic historical data cannot support live testing",
    DATA_QUALITY_NOT_PROMOTABLE: "Historical data quality is not strong enough",
    PARAMETER_INSTABILITY: "Nearby parameter variants do not preserve the edge",
    OVERFIT_TOP_WINNER_DEPENDENCY: "Results depend too much on a few winners",
    OVERFIT_SEGMENT_CONCENTRATION:
      "Returns are too concentrated in one test period",
    NEEDS_FORWARD_SHADOW: "Forward shadow evidence is required",
    LOW_SHARPE: "Risk-adjusted return is below the minimum",
    INSUFFICIENT_STRATEGY_EDGE: "Strategy edge is not strong enough",
    HIGH_DRAWDOWN: "Past loss level was above 25%",
    WALK_FORWARD_UNSTABLE: "Walk-forward returns are not stable enough",
    LIVE_SIGNAL_MISMATCH: "Live signal evidence is not consistent enough",
    OUTLIER_DEPENDENCY: "Results depend too much on a few winners",
  };

  return labels[flag] ?? flag;
}

function promotionBlockerGroup(
  flag: string,
): { key: string; label: string; priority: number } | null {
  const text = String(flag ?? "").toLowerCase();
  const code = String(flag ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");

  if (
    /DATA|SYNTHETIC|STALE|MARKET_DATA_UNAVAILABLE/.test(code) ||
    text.includes("market data")
  ) {
    return {
      key: "data",
      label: "Confirm data quality and freshness before live testing.",
      priority: 5,
    };
  }

  if (/SHARPE|STRATEGY_EDGE/.test(code) || text.includes("risk-adjusted")) {
    return {
      key: "risk-adjusted-return",
      label:
        "Improve risk-adjusted return; current Sharpe is below the live-test minimum.",
      priority: 10,
    };
  }

  if (/BENCHMARK/.test(code) || text.includes("benchmark")) {
    return {
      key: "benchmark",
      label:
        "Rebuild benchmark edge; returns do not clear the benchmark safety margin.",
      priority: 20,
    };
  }

  if (
    /DRAWDOWN|HIGH_DRAWDOWN/.test(code) ||
    text.includes("past loss") ||
    text.includes("drawdown")
  ) {
    return {
      key: "drawdown",
      label:
        "Reduce drawdown; past loss level is above the strategy risk limit.",
      priority: 30,
    };
  }

  if (
    /WALK_FORWARD|SEGMENT|PERIOD/.test(code) ||
    text.includes("walk-forward") ||
    text.includes("test period")
  ) {
    return {
      key: "walk-forward",
      label: "Stabilize walk-forward results across independent test periods.",
      priority: 40,
    };
  }

  if (/PARAMETER/.test(code) || text.includes("parameter")) {
    return {
      key: "parameter-robustness",
      label:
        "Improve parameter robustness; nearby variants do not preserve the edge.",
      priority: 50,
    };
  }

  if (
    /OUTLIER|TOP_WINNER|CONCENTRATION/.test(code) ||
    text.includes("few winners") ||
    text.includes("concentrated")
  ) {
    return {
      key: "concentration",
      label:
        "Reduce concentration risk; results depend too much on a few winners or periods.",
      priority: 60,
    };
  }

  if (
    /FORWARD_SHADOW|LIVE_SIGNAL/.test(code) ||
    text.includes("confirmed live") ||
    text.includes("forward signal")
  ) {
    return {
      key: "forward-evidence",
      label:
        "Collect more forward-shadow evidence from the same live signal engine.",
      priority: 70,
    };
  }

  if (/ROBUSTNESS|OVERFIT/.test(code) || text.includes("overfit")) {
    return {
      key: "robustness",
      label: "Resolve robustness risk before allowing execution.",
      priority: 80,
    };
  }

  return null;
}

function summarizePromotionBlockers(flags: string[], summary?: any) {
  const grouped = new Map<string, { label: string; priority: number }>();

  for (const flag of flags) {
    const group = promotionBlockerGroup(flag);

    if (group) {
      const existing = grouped.get(group.key);
      if (!existing || group.priority < existing.priority) {
        grouped.set(group.key, {
          label: group.label,
          priority: group.priority,
        });
      }
      continue;
    }

    const label = formatPromotionBlocker(flag, summary);
    grouped.set(label, { label, priority: 90 });
  }

  return Array.from(grouped.values())
    .sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label))
    .map((item) => item.label)
    .slice(0, 8);
}

function gateStatusLabel(gate: ConfidenceGate) {
  if (gate.passed) return "Pass";
  if (gate.severity === "bad") return "Fail";
  if (gate.severity === "neutral") return "Pending";
  return "Watch";
}

function productionTone(stage: string): "good" | "warn" | "bad" | "neutral" {
  if (stage === "Production eligible") return "good";
  if (
    stage === "Forward-test eligible" ||
    stage === "Research validated" ||
    stage === "Shadow test" ||
    stage === "Paper trade" ||
    stage === "Limited live"
  )
    return "warn";
  if (stage === "Not ready" || stage === "Research only" || stage === "Blocked")
    return "bad";
  return "neutral";
}

function plainStageLabel(value: unknown) {
  const text = String(value ?? "").trim();
  const labels: Record<string, string> = {
    "Production eligible": "Ready for live review",
    "Forward-test eligible": "Ready for real-time testing",
    "Needs forward shadow": "Needs forward shadow",
    "Research validated": "Research review",
    "Research only": "Research only",
    "Shadow test": "Shadow test",
    "Paper trade": "Paper trade",
    "Limited live": "Limited live",
    "Candidate only": "Idea only",
    "Not ready": "Not ready",
    "Promotion blocked": "Blocked",
    Blocked: "Blocked",
  };

  return labels[text] ?? text;
}

function inferIntelligence(stock: DisplayStock): IntelligenceStock {
  const returns = historyReturns(stock.history).slice(-30);
  const recentReturn = returns.length
    ? returns[returns.length - 1]
    : numeric(stock.changePercent);
  const avgReturn = mean(returns);
  const volatility = stdev(returns);
  const positiveBreadth = returns.length
    ? (returns.filter((r) => r >= 0).length / returns.length) * 100
    : 50;

  const hasEvidence = hasStockEvidence(stock);
  const signalConfidence = numeric(
    (stock as any).signalConfidence,
    stock.signalAction === "Buy" ? 62 : 50,
  );

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

  const trendQuality = clamp(
    numeric((stock as any).trendQuality, inferredTrendQuality),
  );
  const riskPressure = clamp(
    numeric((stock as any).riskPressure, inferredRiskPressure),
  );
  const setupQuality = clamp(
    numeric(
      (stock as any).setupQuality,
      signalConfidence * 0.45 +
        trendQuality * 0.45 +
        (100 - riskPressure) * 0.1,
    ),
  );
  const timingQuality = clamp(
    numeric(
      (stock as any).timingQuality,
      (setupQuality + trendQuality + positiveBreadth) / 3,
    ),
  );
  const expectedMove = numeric(
    (stock as any).expectedMove,
    numeric((stock as any).signalReturnPercent, recentReturn || avgReturn),
  );
  const hasProvidedSignal =
    stock.signalStatus === "provided" || stock.signalStatus === "confirmed";

  const maxExposurePct =
    positiveNumberOrNull((stock as any).maxPositionPct) ?? 5.5;
  const upstreamSuggestedExposure = optionalNumber(
    (stock as any).suggestedExposure,
  );
  const rawSuggestedExposure = hasProvidedSignal
    ? requestedExposureForAsset({
        signalAction: (stock.signalAction ?? "Hold") as TradeSignal,
        allocationAction: (stock as any).allocationAction,
        suggestedExposurePct: upstreamSuggestedExposure ?? null,
        setupQuality,
        riskPressure,
        maxExposurePct,
      })
    : 0;
  const assetSizing = sizeAssetExposure({
    targetRef: normalizedTicker(stock),
    signalAction: (stock.signalAction ?? "Hold") as TradeSignal,
    signalStatus: stock.signalStatus,
    setupQuality,
    riskPressure,
    trendQuality,
    timingQuality,
    expectedMove,
    requestedExposurePct: rawSuggestedExposure,
    maxExposurePct,
    hasEvidence,
  });
  const suggestedExposure =
    hasProvidedSignal && stock.signalAction === "Buy"
      ? assetSizing.suggestedExposurePct
      : 0;
  const resynthesizedBuyExposure =
    hasProvidedSignal &&
    stock.signalAction === "Buy" &&
    rawSuggestedExposure > 0 &&
    !(
      Number.isFinite(upstreamSuggestedExposure) &&
      Number(upstreamSuggestedExposure) > 0
    );
  const sizingReasons = resynthesizedBuyExposure
    ? assetSizing.sizingReasons
    : ((stock as any).sizingReasons ?? assetSizing.sizingReasons);
  const sizingConstraints = resynthesizedBuyExposure
    ? assetSizing.sizingConstraints
    : ((stock as any).sizingConstraints ?? assetSizing.sizingConstraints);
  const sizingMode = resynthesizedBuyExposure
    ? assetSizing.sizingMode
    : ((stock as any).sizingMode ?? assetSizing.sizingMode);
  const sizingRationale = resynthesizedBuyExposure
    ? assetSizing.sizingRationale
    : ((stock as any).sizingRationale ?? assetSizing.sizingRationale);

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
    suggestedExposure <= 0 && sizingReasons.length
      ? sizingReasons[0]
      : mandate === "Avoid / Reduce"
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
    sizingMode,
    sizingReasons,
    sizingConstraints,
    sizingRationale,
    recognition: (stock as any).recognition,
    judgement: (stock as any).judgement,
    survivalMemory:
      (stock as any).survivalMemory ?? (stock as any).judgement?.survivalMemory,
  };
}

function primarySizingReason(stock: Partial<IntelligenceStock>) {
  const reasons = Array.isArray(stock.sizingReasons) ? stock.sizingReasons : [];
  return reasons.find(Boolean) ?? String((stock as any).rejectionReason ?? "");
}

function isOpportunityDensityOnlyBlock(stock: Partial<IntelligenceStock>) {
  const reason = primarySizingReason(stock);
  return (
    /opportunity density/i.test(reason) &&
    !/calibration|readiness|strategy readiness/i.test(reason)
  );
}

function isAgencyBlockedParticipation(stock: Partial<IntelligenceStock>) {
  const agency = (stock as any).agency ?? (stock as any).agencyTrace;
  const decisionKind = String(
    agency?.decisionKind ?? agency?.decision ?? "",
  ).toLowerCase();

  return (
    agency?.allowed === false &&
    /blocked[_\s-]?participation/.test(decisionKind)
  );
}

function isCommitmentReviewCandidate(stock: IntelligenceStock) {
  if (
    stock.signalStatus === "blocked" ||
    stock.allocationAction === "Blocked" ||
    isAgencyBlockedParticipation(stock)
  ) {
    return stock.riskPressure < 78 && !isOpportunityDensityOnlyBlock(stock);
  }

  if (stock.signalAction !== "Buy") return false;
  if (stock.riskPressure >= 78) return false;
  if (stock.expectedMove <= 0 && numeric(stock.discoveryScore) < 55)
    return false;
  if (isOpportunityDensityOnlyBlock(stock)) return false;

  return (
    numeric(stock.setupQuality) >= 58 ||
    numeric(stock.discoveryScore) >= 55 ||
    stock.signalStatus === "confirmed"
  );
}

function deriveAllocationAction(
  stock: IntelligenceStock,
  context: {
    regime: string;
    avgRisk: number;
    breadth: number;
    targetExposure: number;
    marketStatus: "Open" | "Closed";
    defensiveReliability?: boolean;
    strategyBlocked?: boolean;
    strategyMaxPositionPct?: number | null;
  },
): AllocationAction {
  const rawAction = (stock.signalAction ?? "Hold") as TradeSignal;
  const hasExplicitSignal =
    stock.signalStatus === "provided" ||
    stock.signalStatus === "confirmed" ||
    stock.signalStatus === "blocked" ||
    stock.signalStatus === "watch" ||
    stock.signalStatus === "risk-exit";

  if (hasExplicitSignal && rawAction === "Sell") {
    return "Sell";
  }

  if (stock.mandate === "Avoid / Reduce" || stock.riskPressure >= 78) {
    return "Sell";
  }

  if (context.strategyBlocked || context.strategyMaxPositionPct === 0) {
    return isCommitmentReviewCandidate(stock) ? "Blocked" : "Watch";
  }

  if (isAgencyBlockedParticipation(stock)) {
    return "Blocked";
  }

  if (context.defensiveReliability) {
    if (
      hasExplicitSignal &&
      rawAction === "Buy" &&
      stock.setupQuality >= 84 &&
      stock.riskPressure < 35
    ) {
      return "Buy";
    }

    return "Watch";
  }

  if (context.regime === "Capital Preservation Phase") {
    if (
      stock.setupQuality >= 82 &&
      stock.riskPressure < 38 &&
      stock.expectedMove > 0
    ) {
      return "Buy";
    }

    if (stock.riskPressure > 64 || stock.expectedMove < -1.5) {
      return "Sell";
    }

    return "Watch";
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

    return "Watch";
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

  return "Watch";
}

function mergeQuotes(
  current: DisplayStock[],
  quotes: Array<{ symbol: string } & Partial<StockQuote>>,
): DisplayStock[] {
  if (!quotes.length) return current;
  const map = new Map(
    quotes.map((quote) => [String(quote.symbol).toUpperCase(), quote]),
  );
  return current.map((stock) => {
    const quote = map.get(normalizedTicker(stock).toUpperCase());
    if (!quote) return stock;
    const quotePrice = positiveNumberOrNull(
      (quote as any).price ?? (quote as any).last ?? (quote as any).close,
    );
    const stockPrice = positiveNumberOrNull(stock.price);
    const nextPrice = quotePrice ?? stockPrice ?? optionalNumber(stock.price);
    const hasLivePrice = quotePrice != null;
    const quoteHistory = Array.isArray((quote as any).history)
      ? (quote as any).history
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isFinite(value) && value > 0)
      : [];
    const quoteSampleCount = Number((quote as any).sampleCount);
    const stockSampleCount = Number((stock as any).sampleCount);
    const sampleCount =
      Number.isFinite(quoteSampleCount) && quoteSampleCount > 0
        ? quoteSampleCount
        : quoteHistory.length ||
          (Number.isFinite(stockSampleCount) ? stockSampleCount : 0);
    const entryPrice = numeric(
      (quote as any).signalEntryPrice,
      numeric((stock as any).signalEntryPrice, nextPrice),
    );
    const signalReturnPercent =
      entryPrice > 0 && nextPrice > 0
        ? ((nextPrice - entryPrice) / entryPrice) * 100
        : numeric(
            (quote as any).signalReturnPercent,
            numeric((stock as any).signalReturnPercent),
          );
    return {
      ...stock,
      ...(quote as any),
      ticker: normalizedTicker(stock),
      price: nextPrice,
      history: quoteHistory.length ? quoteHistory : stock.history,
      sampleCount,
      changePercent: numeric(
        (quote as any).changePercent,
        numeric(stock.changePercent),
      ),
      signalAction: ((quote as any).signalAction ??
        stock.signalAction) as TradeSignal,
      signalStatus: (quote as any).signalAction
        ? "provided"
        : (stock.signalStatus ?? "missing"),
      signalConfidence: numeric(
        (quote as any).signalConfidence,
        numeric((stock as any).signalConfidence),
      ),
      signalEntryPrice: entryPrice,
      signalReturnPercent,
      quoteStatus: hasLivePrice ? "available" : "unavailable",
      quoteStatusReason: hasLivePrice
        ? undefined
        : String((quote as any).source ?? "Live price was unavailable"),
      quoteLastAttemptedAt: Date.now(),
    };
  });
}

function parseStockListItem(item: any, marketOpen: boolean): DisplayStock {
  return {
    ...item,
    ticker: String(item.ticker ?? item.symbol ?? ""),
    symbol: String(item.symbol || item.ticker || ""),
    price: optionalNumber(
      item.price ?? item.last ?? item.close ?? item.regularMarketPrice,
    ),
    changePercent: numeric(item.changePercent),
    status: (item.status ?? "Stable") as StockStatus,
    signalAction: (item.signalAction ?? "Hold") as TradeSignal,
    signalStatus: item.signalAction ? "provided" : "missing",
    summary:
      item.summary ??
      (marketOpen
        ? "Live quote sync in progress."
        : "Market closed. Quote sync paused."),
    impact:
      item.impact ??
      (marketOpen
        ? "Live data will refresh as quote coverage reaches this asset."
        : "Live quotes and signals will resume when this venue opens."),
    quoteStatus: marketOpen ? "pending" : "paused",
  };
}

function getInstrumentSymbol(value: any) {
  return String(
    value?.symbol ?? value?.ticker ?? value?.code ?? value?.id ?? "",
  )
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
      (lowerKey.includes("svg") ||
        lowerKey.includes("logo") ||
        lowerKey.includes("icon") ||
        lowerKey.includes("image") ||
        text.startsWith("<svg") ||
        text.startsWith("data:image/svg+xml") ||
        text.endsWith(".svg"))
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

function MiniMetric({
  label,
  value,
  sub,
  emphasis = "normal",
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: "normal" | "strong" | "quiet";
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  return (
    <div
      className={cx(
        "min-w-0 rounded-lg bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.045]",
        emphasis === "strong" && "bg-[#FDD000]/10 ring-[#FDD000]/25",
        emphasis === "quiet" && "bg-transparent ring-white/[0.04]",
      )}
    >
      <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </div>
      <div
        className={cx(
          "mt-2 break-words font-semibold leading-snug tracking-tight",
          emphasis === "strong" ? "text-3xl text-white" : "text-xl text-white",
          emphasis === "quiet" && "text-lg text-zinc-200",
          tone === "good" && emphasis !== "strong" && "text-[#FDD000]",
          tone === "warn" && "text-[#FDD000]",
          tone === "bad" && "text-red-200",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function ExecutiveMetric({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "bad" | "neutral";
  icon?: ReactNode;
}) {
  const valueSize =
    value.length > 14
      ? "text-xl md:text-[1.75rem]"
      : value.length >= 9
        ? "text-2xl md:text-[2rem]"
        : "text-3xl md:text-4xl";

  return (
    <div
      className={cx(
        "min-h-[112px] min-w-0 rounded-lg bg-black/35 p-3.5 ring-1 ring-white/[0.06] md:p-4",
        tone === "good" && "bg-[#FDD000]/10 ring-[#FDD000]/25",
        tone === "warn" && "bg-[#FDD000]/10 ring-[#FDD000]/20",
        tone === "bad" && "bg-red-500/10 ring-red-300/20",
      )}
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 md:text-[11px]">
        {icon ? <span className="text-[#FDD000]">{icon}</span> : null}
        {label}
      </div>
      <div
        className={cx(
          "mt-3 break-words font-semibold leading-none tracking-tight text-white",
          valueSize,
        )}
      >
        {value}
      </div>
      {sub ? (
        <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-zinc-500 md:text-xs">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function beliefTone(
  belief?: BeliefDiagnostic | null,
): "good" | "warn" | "bad" | "neutral" {
  if (!belief) return "neutral";
  if (belief.verdict === "justified") return "good";
  if (belief.verdict === "contradicted") return "bad";
  return "warn";
}

function recognitionTone(
  recognition?: RecognitionDiagnostic | null,
): "good" | "warn" | "bad" | "neutral" {
  if (!recognition) return "neutral";
  if (recognition.verdict === "recognized") return "good";
  if (
    recognition.verdict === "novel" ||
    recognition.verdict === "partially_recognized"
  )
    return "warn";
  if (recognition.verdict === "conflicted") return "bad";
  return "neutral";
}

export function recognitionClearsDiscoveryNoveltyNarrative(
  recognition?: RecognitionDiagnostic | null,
) {
  if (!recognition) return false;

  return (
    recognition.verdict === "recognized" &&
    recognition.recurrenceConfidence >= 70 &&
    recognition.recognitionScore >= 65 &&
    recognition.noveltyScore <= 35 &&
    recognition.discoveryNoveltyJustified === false &&
    recognition.judgementSimilarityJustified === true &&
    (recognition.matchedSamples >= 5 || recognition.archetypeConfidence >= 70)
  );
}

export function reconcileDiscoveryInvalidationConditions(
  conditions: string[],
  recognition?: RecognitionDiagnostic | null,
) {
  if (!recognitionClearsDiscoveryNoveltyNarrative(recognition))
    return conditions;

  const filtered = conditions.filter(
    (condition) => !/too novel|novel to compare|known states/i.test(condition),
  );
  const archetype =
    recognition?.archetype?.replace(/_/g, " ") || "recognized state";
  const recognitionCondition = `Re-open Discovery novelty only if Recognition recurrence falls below 70/100 or the ${archetype} outcome linkage weakens.`;

  return Array.from(new Set([...filtered, recognitionCondition]));
}

export function discoveryRecognitionSentence(input: {
  discoveryConfidence?: number | null;
  discoveryNovelty?: number | null;
  recognition?: RecognitionDiagnostic | null;
}) {
  const discoveryConfidence = finiteNumber(input.discoveryConfidence);
  const discoveryNovelty = finiteNumber(input.discoveryNovelty);
  if (discoveryConfidence == null || discoveryNovelty == null) return "";

  const raw = ` Discovery confidence is ${fmtPlainPct(discoveryConfidence, 0)} with ${fmtPlainPct(discoveryNovelty, 0)} novelty.`;
  if (!recognitionClearsDiscoveryNoveltyNarrative(input.recognition))
    return raw;

  return `${raw} Recognition rejects that novelty with ${fmtPlainPct(numeric(input.recognition?.recurrenceConfidence), 0)} recurrence.`;
}

export function recognitionStateRecurrenceLine(
  recognition?: RecognitionDiagnostic | null,
) {
  if (!recognitionClearsDiscoveryNoveltyNarrative(recognition)) return "";

  return `Recognition state recurrence ${numeric(recognition?.matchedSamples)} matched samples; Discovery outcome memory remains separate.`;
}

export function reconcileRecoveryBlockersWithRecognition(
  blockers: string[],
  recognition?: RecognitionDiagnostic | null,
) {
  if (!recognitionClearsDiscoveryNoveltyNarrative(recognition)) return blockers;

  const matchedSamples = numeric(recognition?.matchedSamples);
  const hasOutcomeLinkageBlocker = blockers.some((blocker) =>
    /similar outcome sample count|positive similar-outcome ratio/i.test(
      blocker,
    ),
  );
  const filtered = blockers.filter(
    (blocker) =>
      !/similar outcome sample count|positive similar-outcome ratio/i.test(
        blocker,
      ),
  );
  const recognitionBlocker = hasOutcomeLinkageBlocker
    ? `Recovery needs survival-safe outcome linkage; Recognition has ${matchedSamples} state matches, but normal sizing still requires reduced-size outcomes with acceptable drawdown and stress.`
    : "";

  return uniqueStrings([...filtered, recognitionBlocker]);
}

export function reconcileRecoveryUnlockConditionsWithRecognition(
  conditions: string[],
  recognition?: RecognitionDiagnostic | null,
) {
  if (!recognitionClearsDiscoveryNoveltyNarrative(recognition))
    return conditions;

  const archetype =
    recognition?.archetype?.replace(/_/g, " ") || "recognized state";
  return uniqueStrings([
    ...conditions,
    `Close reduced-size outcomes for the ${archetype} archetype with survival cost below the recovery boundary before restoring normal sizing.`,
  ]);
}

export function reconcileResolveUnlockConditionsWithRecognition(input: {
  conditions: string[];
  missingEvidence: string[];
  recognition?: RecognitionDiagnostic | null;
}) {
  if (!recognitionClearsDiscoveryNoveltyNarrative(input.recognition))
    return input.conditions;

  const archetype =
    input.recognition?.archetype?.replace(/_/g, " ") || "recognized state";
  const needsReducedSizeReview = input.missingEvidence.some((item) =>
    /reduced-size survival review/i.test(item),
  );
  const needsAgencyTrust = input.missingEvidence.some((item) =>
    /agency trust/i.test(item),
  );

  return uniqueStrings([
    ...input.conditions,
    needsAgencyTrust
      ? "Convert additional clean reduced-size outcomes into Agency trust until the average clears 70/100."
      : "",
    needsReducedSizeReview
      ? `Close reduced-size outcomes for the ${archetype} archetype with acceptable drawdown and stress before normal sizing is restored.`
      : "",
  ]);
}

function displaySizingMode(mode: string | undefined) {
  return sizingModeLabelForOperator(mode);
}

type ExecutiveMetricTone = "good" | "warn" | "bad" | "neutral";

export type ExecutiveSummaryMetricSnapshot = {
  market: string;
  confidenceValue: string;
  confidenceSub?: string;
  confidenceTone: ExecutiveMetricTone;
  maxExposureValue: string;
  maxExposureSub?: string;
  exposureTone: ExecutiveMetricTone;
  portfolioPostureValue: string;
  portfolioPostureSub: string;
  postureTone: ExecutiveMetricTone;
  marketHealthValue: string;
  marketHealthSub: string;
  marketHealthTone: ExecutiveMetricTone;
};

export function selectStableExecutiveSummaryMetrics(input: {
  current: ExecutiveSummaryMetricSnapshot;
  previous: ExecutiveSummaryMetricSnapshot | null;
  refreshing: boolean;
}) {
  if (
    input.refreshing &&
    input.previous != null &&
    input.previous.market === input.current.market
  ) {
    return input.previous;
  }

  return input.current;
}

export function maximumExposureSubLabel(input: {
  sizingMode?: string;
  suggestedMaximumExposurePct?: number;
  semanticWord?: string;
}) {
  if (
    !finiteNumber(input.suggestedMaximumExposurePct) ||
    numeric(input.suggestedMaximumExposurePct) <= 0
  ) {
    return input.sizingMode === "none" ? "Sizing locked by governance" : undefined;
  }

  if (input.sizingMode === "micro") return "reduced-size portfolio cap";
  if (input.sizingMode && input.sizingMode !== "none") {
    return `${displaySizingMode(input.sizingMode).toLowerCase()} portfolio cap`;
  }

  return `${(input.semanticWord || "portfolio").toLowerCase()} cap`;
}

function operatorActionLabel(input: {
  finalDecision?: string;
  sizingMode?: string;
  exposurePct?: number | null;
  hasMarketData: boolean;
}) {
  if (!input.hasMarketData) return "Loading";

  const exposurePct = finiteNumber(input.exposurePct) ?? 0;
  if (exposurePct <= 0) return "Observe";

  const mode = displaySizingMode(input.sizingMode);
  const decision = String(input.finalDecision ?? "").toLowerCase();

  if (decision.includes("escalate") && mode === "Micro") {
    return "Micro escalation";
  }

  if (decision.includes("escalate") && input.sizingMode !== "none") {
    return `${mode} escalation`;
  }

  if (mode === "Micro" || mode === "Small" || mode === "Limited") {
    return `${mode} participation`;
  }

  return input.finalDecision || "Review";
}

function restrictionImpactPct(code?: string, index = 0) {
  const impactByCode: Record<string, number> = {
    survival_scar: 70,
    trust_below_threshold: 18,
    reduced_size: 14,
    recovery_incomplete: 12,
    agency_unresolved: 10,
    opportunity_density_low: 9,
    discovery_immature: 7,
    calibration_review: 6,
    readiness_blocked: 6,
    overfit_risk: 5,
    walk_forward_instability: 5,
    data_reliability_low: 5,
  };

  if (code && impactByCode[code] != null) return impactByCode[code];
  return Math.max(5, 30 - index * 6);
}

function expectedMoveScore(value: number | null | undefined) {
  return clamp(50 + numeric(value) * 12, 0, 100);
}

function assetRankReason(stock: IntelligenceStock) {
  const expectedMove = numeric(stock.expectedMove);
  const riskControl = clamp(100 - numeric(stock.riskPressure));

  if (numeric(stock.setupQuality) >= 90 && expectedMove < 0.75) {
    return `High quality mostly comes from fit and risk control; expected move is modest and sizing remains ${sizingModeSentenceForOperator(stock.sizingMode)}.`;
  }

  if (riskControl >= 70 && expectedMove >= 1) {
    return `Rank is supported by controlled risk, improving trend quality, and a usable expected move.`;
  }

  if (stock.allocationAction === "Blocked") {
    return stock.rejectionReason ?? "Rank is review-only because governance is still blocking allocation.";
  }

  return stock.sizingReasons?.[0] ?? stock.explanation;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function judgementTone(
  judgement?: JudgementDiagnostic | null,
): "good" | "warn" | "bad" | "neutral" {
  if (!judgement) return "neutral";
  if (judgement.status === "trusted") return "good";
  if (judgement.status === "blocked") return "bad";
  return "warn";
}

function trustGovernorTone(
  trustGovernor?: TrustGovernorDiagnostic | null,
): "good" | "warn" | "bad" | "neutral" {
  if (!trustGovernor) return "neutral";
  if (
    trustGovernor.participationMode === "normal" ||
    trustGovernor.participationMode === "limited"
  )
    return "good";
  if (
    trustGovernor.participationMode === "blocked" ||
    trustGovernor.participationMode === "exits_only"
  )
    return "bad";
  return "warn";
}

function resolveTone(
  resolve?: ResolveDiagnostic | null,
): "good" | "warn" | "bad" | "neutral" {
  if (!resolve) return "neutral";
  if (resolve.decision === "commit") return "good";
  if (resolve.decision === "reject" || resolve.decision === "invalidate")
    return "bad";
  if (resolve.decision === "escalate") return "bad";
  return "warn";
}

function survivalMemoryTone(
  survivalMemory?: SurvivalMemoryDiagnostic | null,
): "good" | "warn" | "bad" | "neutral" {
  if (!survivalMemory) return "neutral";
  if (survivalMemory.status === "clear") return "good";
  if (survivalMemory.status === "near_ruin") return "bad";
  if (survivalMemory.status === "scarred" || survivalMemory.status === "watch")
    return "warn";
  return "neutral";
}

function recoveryTone(
  recovery?: RecoveryDiagnostic | null,
): "good" | "warn" | "bad" | "neutral" {
  if (!recovery) return "neutral";
  if (recovery.status === "restored") return "good";
  if (recovery.status === "recovering") return "warn";
  if (recovery.status === "locked" || recovery.status === "regressed")
    return "bad";
  return "neutral";
}

function restorationProgressTone(
  progress?: RestorationProgressDiagnostic | null,
): "good" | "warn" | "bad" | "neutral" {
  if (!progress) return "neutral";
  if (progress.status === "restored" || progress.status === "ready_for_restoration")
    return "good";
  if (progress.status === "blocked") return "bad";
  return "warn";
}

function remediationTone(
  plan?: ReadinessRemediationDiagnostic | null,
): "good" | "warn" | "bad" | "neutral" {
  if (!plan) return "neutral";
  if (plan.status === "ready") return "good";
  if (plan.status === "blocked") return "bad";
  return "warn";
}

function topBeliefEvidence(
  belief: BeliefDiagnostic | null,
  key: "supportingEvidence" | "contradictoryEvidence",
) {
  return Array.isArray(belief?.[key]) ? belief[key]!.slice(0, 2) : [];
}

function SectionShell({
  eyebrow,
  title,
  action,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-lg border border-white/[0.07] bg-[#0d0d0d]/95 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]",
        className,
      )}
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FDD000]">
              {eyebrow}
            </div>
          ) : null}
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function DashboardGroup({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("mb-12 min-w-0", className)}>
      <div className="mb-5 flex flex-col gap-2 border-t border-white/[0.055] pt-7 md:flex-row md:items-end md:justify-between">
        <div>
          {eyebrow ? (
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FDD000]">
              {eyebrow}
            </div>
          ) : null}
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-[1.7rem]">
            {title}
          </h2>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-zinc-500 md:text-right">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function AdvancedDisclosure({
  title,
  description,
  summary,
  children,
  className,
}: {
  title: string;
  description?: string;
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details
      data-advanced-section={title}
      className={cx(
        "group rounded-lg border border-white/[0.07] bg-white/[0.025] p-4",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-white">
            {title}
          </div>
          {description ? (
            <div className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
              {description}
            </div>
          ) : null}
          {summary ? <div className="mt-3">{summary}</div> : null}
        </div>
        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500 transition group-open:rotate-180" />
      </summary>
      <div className="mt-5 border-t border-white/[0.06] pt-5">{children}</div>
    </details>
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

function StatusPill({
  children,
  tone = "neutral",
}: { children: ReactNode; tone?: "good" | "warn" | "bad" | "neutral" }) {
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
  action: AllocationAction;
  items: IntelligenceStock[];
  selectedTicker: string | null;
  onSelectInstrument: (ticker: string) => void;
  loading: boolean;
}) {
  const tone =
    action === "Buy"
      ? "good"
      : action === "Sell"
        ? "bad"
        : action === "Blocked"
          ? "warn"
          : "neutral";

  return (
    <div
      data-layout="responsive-ledger-row"
      className="overflow-hidden rounded-lg bg-[#101010] ring-1 ring-white/[0.055]"
    >
      <div className="flex flex-col gap-3 bg-white/[0.025] px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <StatusPill tone={tone}>{action}</StatusPill>
          <div>
            <div className="text-sm font-semibold text-white">{action}</div>
            <div className="text-xs text-zinc-500">{items.length} items</div>
          </div>
        </div>
      </div>

      <div className="hidden grid-cols-[1.1fr_0.55fr_0.55fr_1fr] gap-3 border-t border-white/[0.045] bg-white/[0.018] px-4 py-3 text-[9px] uppercase tracking-[0.16em] text-zinc-500 md:grid">
        <div>Asset</div>
        <div>Max position</div>
        <div>Score</div>
        <div>Why</div>
      </div>

      <div className="max-h-[360px] divide-y divide-white/[0.045] overflow-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-700/60 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-500/80 [&::-webkit-scrollbar-corner]:bg-transparent">
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
                data-layout="responsive-ledger-row"
                className={cx(
                  "grid w-full grid-cols-1 items-start gap-3 px-4 py-4 text-left text-sm transition hover:bg-white/[0.04] md:grid-cols-[1.1fr_0.55fr_0.55fr_1fr] md:items-center",
                  isSelected && "bg-[#FDD000]/10",
                )}
              >
                <div>
                  <div className="font-semibold text-white">{ticker}</div>
                  <div className="mt-1 line-clamp-1 text-xs text-zinc-500">
                    {stockName(stock)}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-600">
                    {assetSizingLabel(stock)} · {dataCoverageLabel(stock)}
                  </div>
                </div>
                <div className="text-zinc-300">
                  <span className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-zinc-600 md:hidden">
                    Max position
                  </span>
                  <span>{fmtPlainPct(stock.suggestedExposure)}</span>
                </div>
                <div className="font-medium text-slate-100">
                  <span className="mb-1 block text-[10px] font-normal uppercase tracking-[0.16em] text-zinc-600 md:hidden">
                    Score
                  </span>
                  <span>{Math.round(stock.setupQuality)}%</span>
                </div>
                <div className="text-xs leading-5 text-zinc-500">
                  <span className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-zinc-600 md:hidden">
                    Why
                  </span>
                  <span className="line-clamp-2">
                    {stock.sizingReasons?.[0] ??
                      stock.rejectionReason ??
                      stock.explanation}
                  </span>
                </div>
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

type MarketScopedDashboardData = {
  stocks: DisplayStock[];
  totalStocks: number;
  loading: boolean;
  lastSyncedAt: number | null;
  refreshError: string | null;
  stockVisualMap: Map<string, any>;
  portfolioSummary: any | null;
  persistentPortfolioHistory: Array<any>;
  backtestSummary: any | null;
  backtestHistory: Array<any>;
  walkForwardTrades: Array<any>;
  strategySignals: Array<any>;
  strategyRegime: any | null;
  opportunityDiscovery: any | null;
  agencyDiagnostics: any | null;
  marketPerceptionSnapshot: MarketStateSnapshot | null;
};

function createEmptyMarketData(): MarketScopedDashboardData {
  return {
    stocks: [],
    totalStocks: 0,
    loading: true,
    lastSyncedAt: null,
    refreshError: null,
    stockVisualMap: new Map(),
    portfolioSummary: null,
    persistentPortfolioHistory: [],
    backtestSummary: null,
    backtestHistory: [],
    walkForwardTrades: [],
    strategySignals: [],
    strategyRegime: null,
    opportunityDiscovery: null,
    agencyDiagnostics: null,
    marketPerceptionSnapshot: null,
  };
}

export default function Dashboard() {
  const [stockVisualMap, setStockVisualMap] = useState<Map<string, any>>(
    new Map(),
  );
  const marketStateEngineRef = useRef<MarketStateEngine | null>(null);
  if (marketStateEngineRef.current === null) {
    marketStateEngineRef.current = new MarketStateEngine(
      createDefaultMetricRegistry(),
    );
  }
  const marketDataByMarketRef = useRef(
    new Map<string, MarketScopedDashboardData>(),
  );
  const executiveSummaryMetricSnapshotRef =
    useRef<ExecutiveSummaryMetricSnapshot | null>(null);
  const activeMarketRef = useRef("");

  const [markets] = useState<MarketOption[]>(DEFAULT_MARKET_OPTIONS);
  const [marketFilter, setMarketFilter] = useState("");
  activeMarketRef.current = marketFilter;
  const [stocks, setStocks] = useState<DisplayStock[]>([]);
  const [totalStocks, setTotalStocks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshingQuotes, setRefreshingQuotes] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [continueWithCachedData, setContinueWithCachedData] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [isSelectedCardFlipped, setIsSelectedCardFlipped] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<
    Array<{ index: number; date?: string; price: number }>
  >([]);
  const [selectedHistoryLoading, setSelectedHistoryLoading] = useState(false);
  const [portfolioSummary, setPortfolioSummary] = useState<any | null>(null);
  const [persistentPortfolioHistory, setPersistentPortfolioHistory] = useState<
    Array<any>
  >([]);
  const [backtestSummary, setBacktestSummary] = useState<any | null>(null);
  const [backtestHistory, setBacktestHistory] = useState<Array<any>>([]);
  const [walkForwardTrades, setWalkForwardTrades] = useState<Array<any>>([]);
  const [commissionBps, setCommissionBps] = useState(0);
  const [frontendSlippageBps, setFrontendSlippageBps] = useState(0);
  const [strategySignals, setStrategySignals] = useState<Array<any>>([]);
  const [strategyRegime, setStrategyRegime] = useState<any | null>(null);
  const [opportunityDiscovery, setOpportunityDiscovery] = useState<any | null>(
    null,
  );
  const [agencyDiagnostics, setAgencyDiagnostics] = useState<any | null>(null);
  const [marketPerceptionSnapshot, setMarketPerceptionSnapshot] =
    useState<MarketStateSnapshot | null>(null);
  const [portfolioRefreshing, setPortfolioRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [ambition, setAmbition] = useState(50);
  const [meaningText, setMeaningText] = useState("");
  const registeredWatchlists = useRef(new Set<string>());
  const refreshedPortfolioMarkets = useRef(new Set<string>());

  function getMarketData(market: string) {
    const existing = marketDataByMarketRef.current.get(market);
    if (existing) return existing;

    const next = createEmptyMarketData();
    marketDataByMarketRef.current.set(market, next);
    return next;
  }

  function applyMarketDataPatch(
    market: string,
    patch: Partial<MarketScopedDashboardData>,
  ) {
    if (!market) return;

    const next = {
      ...getMarketData(market),
      ...patch,
    };
    marketDataByMarketRef.current.set(market, next);

    if (activeMarketRef.current !== market) return;

    if ("stocks" in patch) setStocks(next.stocks);
    if ("totalStocks" in patch) setTotalStocks(next.totalStocks);
    if ("loading" in patch) setLoading(next.loading);
    if ("lastSyncedAt" in patch) setLastSyncedAt(next.lastSyncedAt);
    if ("refreshError" in patch) setRefreshError(next.refreshError);
    if ("stockVisualMap" in patch) setStockVisualMap(next.stockVisualMap);
    if ("portfolioSummary" in patch) setPortfolioSummary(next.portfolioSummary);
    if ("persistentPortfolioHistory" in patch)
      setPersistentPortfolioHistory(next.persistentPortfolioHistory);
    if ("backtestSummary" in patch) setBacktestSummary(next.backtestSummary);
    if ("backtestHistory" in patch) setBacktestHistory(next.backtestHistory);
    if ("walkForwardTrades" in patch)
      setWalkForwardTrades(next.walkForwardTrades);
    if ("strategySignals" in patch) setStrategySignals(next.strategySignals);
    if ("strategyRegime" in patch) setStrategyRegime(next.strategyRegime);
    if ("opportunityDiscovery" in patch)
      setOpportunityDiscovery(next.opportunityDiscovery);
    if ("agencyDiagnostics" in patch)
      setAgencyDiagnostics(next.agencyDiagnostics);
    if ("marketPerceptionSnapshot" in patch)
      setMarketPerceptionSnapshot(next.marketPerceptionSnapshot);
  }

  function renderMarketData(market: string) {
    const data = getMarketData(market);

    setStocks(data.stocks);
    setTotalStocks(data.totalStocks);
    setLoading(data.loading);
    setLastSyncedAt(data.lastSyncedAt);
    setRefreshError(data.refreshError);
    setStockVisualMap(data.stockVisualMap);
    setPortfolioSummary(data.portfolioSummary);
    setPersistentPortfolioHistory(data.persistentPortfolioHistory);
    setBacktestSummary(data.backtestSummary);
    setBacktestHistory(data.backtestHistory);
    setWalkForwardTrades(data.walkForwardTrades);
    setStrategySignals(data.strategySignals);
    setStrategyRegime(data.strategyRegime);
    setOpportunityDiscovery(data.opportunityDiscovery);
    setAgencyDiagnostics(data.agencyDiagnostics);
    setMarketPerceptionSnapshot(data.marketPerceptionSnapshot);
    setRefreshingQuotes(false);
  }

  useEffect(() => {
    if (!marketFilter) return;

    renderMarketData(marketFilter);
    setSelectedTicker(null);
    setIsSelectedCardFlipped(false);
    setContinueWithCachedData(false);
  }, [marketFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOnlineStatus = () => {
      const online = window.navigator.onLine;
      setIsOnline(online);
      if (online) setContinueWithCachedData(false);
    };

    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  async function refreshQuotes(
    market: string,
    list: DisplayStock[],
    bypass = false,
  ) {
    if (!market || !list.length) return;
    const hasExistingLiveCoverage = hasLiveQuoteCoverage(list);
    const hasExistingMarketCoverage =
      hasExistingLiveCoverage || hasSessionMarketCoverage(list);
    const currentMarketStatus = getMarketStatus(market);
    const cachedMarketData = getMarketData(market);

    if (currentMarketStatus === "Closed" && hasExistingMarketCoverage) {
      applyMarketDataPatch(market, {
        loading: false,
        refreshError: null,
        lastSyncedAt: cachedMarketData.lastSyncedAt ?? Date.now(),
      });
      if (activeMarketRef.current === market) {
        setRefreshingQuotes(false);
        setRefreshError(null);
      }
      return;
    }

    const shouldRefreshClosedVenue =
      bypass ||
      currentMarketStatus === "Open" ||
      !hasExistingLiveCoverage ||
      cachedMarketData.lastSyncedAt == null;
    if (!shouldRefreshClosedVenue) return;
    if (activeMarketRef.current === market) {
      setRefreshingQuotes(true);
      setRefreshError(null);
    }
    applyMarketDataPatch(market, { refreshError: null });

    try {
      let liveQuoteCount = 0;
      const quoteLimit = Math.min(
        MAX_QUOTE_SYMBOL_LIMIT,
        Math.max(
          INITIAL_QUOTE_SYMBOL_LIMIT,
          Math.ceil(list.length * MIN_QUOTE_COVERAGE_RATIO),
        ),
      );
      const symbols = list
        .map((item) => normalizedTicker(item))
        .filter(Boolean)
        .slice(0, quoteLimit);
      for (let index = 0; index < symbols.length; index += QUOTE_BATCH_SIZE) {
        const batch = symbols.slice(index, index + QUOTE_BATCH_SIZE);
        const response = await fetchStockQuoteBatch(market, batch, {
          withSignals: true,
          timeoutMs: 45_000,
          retryCount: bypass || !hasExistingLiveCoverage ? 1 : 0,
        } as any);
        const quotes = ((response as any).quotes ?? []) as Array<
          { symbol: string } & Partial<StockQuote>
        >;
        const batchLiveQuotes = quotes.filter(quoteHasLivePrice).length;
        liveQuoteCount += batchLiveQuotes;
        const cached = getMarketData(market);
        const merged = mergeQuotes(
          cached.stocks.length ? cached.stocks : list,
          quotes,
        );
        applyMarketDataPatch(market, {
          stocks: merged,
          lastSyncedAt: batchLiveQuotes > 0 ? Date.now() : cached.lastSyncedAt,
          loading: false,
          refreshError:
            batchLiveQuotes > 0 || liveQuoteCount > 0
              ? null
              : cached.refreshError,
        });
      }
      if (liveQuoteCount === 0) {
        applyMarketDataPatch(market, {
          loading: false,
          refreshError: hasExistingLiveCoverage
            ? null
            : "Quote sync returned no live prices for this market.",
        });
      }
    } catch (error) {
      applyMarketDataPatch(market, {
        refreshError: hasExistingLiveCoverage
          ? null
          : currentMarketStatus === "Closed"
            ? "Venue is closed. Live quote updates will resume at the next session."
            : "Live quote sync paused. Retrying shortly.",
      });
    } finally {
      if (activeMarketRef.current === market) {
        setRefreshingQuotes(false);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadStocks() {
      if (!marketFilter) return;
      const market = marketFilter;
      const cached = getMarketData(market);
      applyMarketDataPatch(market, {
        loading: cached.stocks.length === 0,
        refreshError: null,
        stocks: cached.stocks,
        totalStocks: cached.totalStocks,
        lastSyncedAt: cached.lastSyncedAt,
      });

      const marketOpen = getMarketStatus(market) === "Open";
      try {
        let offset = 0;
        let total = 0;
        const items: DisplayStock[] = [];

        do {
          const response = await fetchStockList(
            market,
            offset,
            STOCK_LIST_PAGE_SIZE,
          );
          if (cancelled) return;
          const responseItems = ((response as any).items ?? []) as any[];
          total = Number((response as any).total ?? responseItems.length);
          items.push(
            ...responseItems.map((item) =>
              parseStockListItem(item, marketOpen),
            ),
          );
          offset += responseItems.length;
        } while (offset < total && offset < 2_000);

        if (cancelled) return;
        applyMarketDataPatch(market, {
          stocks: items,
          totalStocks: total || items.length,
          lastSyncedAt:
            cached.lastSyncedAt ??
            (hasSessionMarketCoverage(items) ? Date.now() : null),
          loading: false,
          refreshError: null,
        });

        const key = `${market}:${items.length}`;
        if (!registeredWatchlists.current.has(key)) {
          registeredWatchlists.current.add(key);
          void registerSignalWatchlist(
            market,
            items.map((item) => normalizedTicker(item)),
          ).catch(() => {
            registeredWatchlists.current.delete(key);
          });
        }

        void refreshQuotes(market, items);
      } catch (error) {
        if (!cancelled) {
          applyMarketDataPatch(market, {
            refreshError: "Could not load market coverage.",
            loading: false,
          });
        }
      }
    }

    void loadStocks();

    const interval = window.setInterval(() => {
      const market = marketFilter;
      void refreshQuotes(market, getMarketData(market).stocks);
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [marketFilter]);

  useEffect(() => {
    if (!marketFilter || !ENABLE_STRATEGY_API) {
      if (!marketFilter) {
        setStrategySignals([]);
        setStrategyRegime(null);
        setOpportunityDiscovery(null);
      }
      return;
    }

    let cancelled = false;
    const market = marketFilter;

    async function loadStrategySignals() {
      try {
        const response = await fetchJsonOrNull(
          "/api/strategy?action=live-market",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              market,
              limitSymbols: 25,
            }),
          },
        );

        const payload = await asJsonOrNull(response);

        if (cancelled) return;

        applyMarketDataPatch(market, {
          strategySignals: Array.isArray(payload?.signals)
            ? payload.signals
            : [],
          strategyRegime: payload?.regime ?? null,
          opportunityDiscovery: payload?.opportunityDiscovery ?? null,
          agencyDiagnostics: payload?.agencyDiagnostics ?? null,
        });
      } catch (error) {
        console.warn(
          "Keeping previous backtest/portfolio state after refresh failure",
          error,
        );
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

    const signalMap = new Map<string, any>();
    for (const signal of strategySignals) {
      for (const key of instrumentMatchKeys(signal)) {
        signalMap.set(key, signal);
      }
    }
    const matchedSignals = new Set<any>();

    const merged = stocks.map((stock) => {
      const ticker = normalizedTicker(stock);
      const signal = instrumentMatchKeys(stock)
        .map((key) => signalMap.get(key))
        .find(Boolean);

      if (!signal) return stock;
      matchedSignals.add(signal);

      return {
        ...stock,
        ticker,
        symbol: ticker,
        price: optionalNumber(signal.price) ?? optionalNumber(stock.price),
        signalAction: signal.signalAction ?? stock.signalAction,
        allocationAction: signal.allocationAction ?? stock.allocationAction,
        signalStatus: signal.signalStatus ?? "provided",
        suggestedExposure: numeric(
          signal.suggestedExposure,
          numeric((stock as any).suggestedExposure),
        ),
        setupQuality: numeric(
          signal.setupQuality,
          numeric((stock as any).setupQuality),
        ),
        riskPressure: numeric(
          signal.riskPressure,
          numeric((stock as any).riskPressure),
        ),
        trendQuality: numeric(
          signal.trendQuality,
          numeric((stock as any).trendQuality),
        ),
        timingQuality: numeric(
          signal.timingQuality,
          numeric((stock as any).timingQuality),
        ),
        expectedMove: numeric(
          signal.expectedMove,
          numeric((stock as any).expectedMove),
        ),
        sizingMode: signal.sizingMode ?? (stock as any).sizingMode,
        sizingReasons: signal.sizingReasons ?? (stock as any).sizingReasons,
        sizingConstraints:
          signal.sizingConstraints ?? (stock as any).sizingConstraints,
        sizingRationale:
          signal.sizingRationale ?? (stock as any).sizingRationale,
        opportunityDiscovery:
          signal.opportunityDiscovery ?? (stock as any).opportunityDiscovery,
        discovery:
          signal.opportunityDiscovery?.discovery ?? (stock as any).discovery,
        agencyTrace: signal.agencyTrace ?? (stock as any).agencyTrace,
        agency: signal.agency ?? (stock as any).agency,
        belief: signal.belief ?? (stock as any).belief ?? null,
        recognition: signal.recognition ?? (stock as any).recognition,
        judgement: signal.judgement ?? (stock as any).judgement,
        survivalMemory:
          signal.survivalMemory ??
          signal.judgement?.survivalMemory ??
          (stock as any).survivalMemory,
        trustGovernor: signal.trustGovernor ?? (stock as any).trustGovernor,
        recovery: signal.recovery ?? (stock as any).recovery,
        restorationProgress:
          signal.restorationProgress ?? (stock as any).restorationProgress,
        resolve: signal.resolve ?? (stock as any).resolve,
        discoveryScore: numeric(
          signal.discoveryScore,
          numeric((stock as any).discoveryScore),
        ),
        discoveryLifecycle:
          signal.discoveryLifecycle ?? (stock as any).discoveryLifecycle,
        candidateProgression:
          signal.candidateProgression ?? (stock as any).candidateProgression,
        adaptiveSuggestedExposure: numeric(
          signal.adaptiveSuggestedExposure,
          numeric((stock as any).adaptiveSuggestedExposure),
        ),
        rejectionReason:
          signal.rejectionReason ?? (stock as any).rejectionReason,
        decisionIntelligence:
          signal.decisionIntelligence ?? (stock as any).decisionIntelligence,
        coherenceScore: numeric(
          signal.coherenceScore,
          numeric((stock as any).coherenceScore),
        ),
        coherenceStatus:
          signal.coherenceStatus ?? (stock as any).coherenceStatus,
        consensusLevel: numeric(
          signal.consensusLevel,
          numeric((stock as any).consensusLevel),
        ),
        predictionScenarios:
          signal.predictionScenarios ?? (stock as any).predictionScenarios,
        simulationRecommendation:
          signal.simulationRecommendation ??
          (stock as any).simulationRecommendation,
        wisdomDecision:
          signal.wisdomDecision ?? (stock as any).wisdomDecision,
        outcomeAccuracy:
          signal.outcomeAccuracy ?? (stock as any).outcomeAccuracy,
        accountabilitySummary:
          signal.accountabilitySummary ?? (stock as any).accountabilitySummary,
        decisionReplayAvailable:
          signal.decisionReplayAvailable ??
          (stock as any).decisionReplayAvailable,
        actionAllowed:
          signal.actionAllowed ?? (stock as any).actionAllowed,
        actionScale: numeric(signal.actionScale, numeric((stock as any).actionScale)),
        regime: signal.regime,
        quoteStatus: stock.quoteStatus ?? "available",
      } as DisplayStock;
    });
    const appendedSignals = strategySignals
      .filter((signal) => !matchedSignals.has(signal))
      .map((signal) => {
        const ticker = String(signal.ticker ?? signal.symbol ?? "").trim();
        return {
          ticker,
          symbol: ticker,
          name: String(signal.name ?? signal.description ?? ticker),
          description: String(signal.description ?? signal.name ?? ticker),
          market: String(signal.market ?? marketFilter ?? ""),
          exchange: String(
            signal.exchange ?? signal.market ?? marketFilter ?? "",
          ),
          country: String(
            signal.country ?? signal.market ?? marketFilter ?? "",
          ),
          price: optionalNumber(signal.price),
          status: "Stable" as StockStatus,
          signalAction: (signal.signalAction ?? "Hold") as TradeSignal,
          allocationAction: signal.allocationAction,
          signalStatus: signal.signalStatus ?? "provided",
          suggestedExposure: numeric(signal.suggestedExposure),
          setupQuality: numeric(signal.setupQuality),
          riskPressure: numeric(signal.riskPressure),
          trendQuality: numeric(signal.trendQuality),
          timingQuality: numeric(signal.timingQuality),
          expectedMove: numeric(signal.expectedMove),
          sizingMode: signal.sizingMode,
          sizingReasons: signal.sizingReasons,
          sizingConstraints: signal.sizingConstraints,
          sizingRationale: signal.sizingRationale,
          opportunityDiscovery: signal.opportunityDiscovery,
          discovery: signal.opportunityDiscovery?.discovery,
          agencyTrace: signal.agencyTrace,
          agency: signal.agency,
          belief: signal.belief ?? null,
          recognition: signal.recognition,
          judgement: signal.judgement,
          survivalMemory:
            signal.survivalMemory ?? signal.judgement?.survivalMemory,
          trustGovernor: signal.trustGovernor,
          recovery: signal.recovery,
          restorationProgress: signal.restorationProgress,
          resolve: signal.resolve,
          discoveryScore: numeric(signal.discoveryScore),
          discoveryLifecycle: signal.discoveryLifecycle,
          candidateProgression: signal.candidateProgression,
          adaptiveSuggestedExposure: numeric(signal.adaptiveSuggestedExposure),
          rejectionReason: signal.rejectionReason,
          decisionIntelligence: signal.decisionIntelligence,
          coherenceScore: numeric(signal.coherenceScore),
          coherenceStatus: signal.coherenceStatus,
          consensusLevel: numeric(signal.consensusLevel),
          predictionScenarios: signal.predictionScenarios,
          simulationRecommendation: signal.simulationRecommendation,
          wisdomDecision: signal.wisdomDecision,
          outcomeAccuracy: signal.outcomeAccuracy,
          accountabilitySummary: signal.accountabilitySummary,
          decisionReplayAvailable: signal.decisionReplayAvailable,
          actionAllowed: signal.actionAllowed,
          actionScale: numeric(signal.actionScale),
          quoteStatus:
            optionalNumber(signal.price) != null ? "available" : "pending",
          summary:
            optionalNumber(signal.price) != null
              ? "Strategy signal"
              : "Strategy signal awaiting live quote",
        } as DisplayStock;
      });

    return [...merged, ...appendedSignals];
  }, [marketFilter, stocks, strategySignals]);

  const rawIntelligence = useMemo(
    () =>
      stocksWithStrategySignals
        .map(inferIntelligence)
        .sort((a, b) => b.setupQuality - a.setupQuality),
    [stocksWithStrategySignals],
  );

  const rawCoveredIntelligence = useMemo(
    () => rawIntelligence.filter((stock) => hasStockEvidence(stock)),
    [rawIntelligence],
  );

  const hasUsableMarketData =
    !loading &&
    rawIntelligence.length > 0 &&
    rawIntelligence.some((stock) => {
      return (
        stock.quoteStatus === "available" ||
        stock.signalStatus === "provided" ||
        positiveNumberOrNull(stock.price) != null
      );
    });
  const backtestDataQuality =
    backtestSummary?.dataQualityReport ?? backtestSummary?.dataQuality ?? {};
  const hasRealBacktestMarketData =
    Boolean(backtestSummary?.updatedAt) &&
    (backtestDataQuality?.promotionEligibleData === true ||
      (String(backtestDataQuality?.quality ?? "").toLowerCase() === "real" &&
        Number(backtestDataQuality?.symbolCount ?? 0) > 0 &&
        Number(backtestDataQuality?.syntheticSymbols ?? 0) === 0));
  const hasStrategyMarketData = strategySignals.some((signal) => {
    return (
      positiveNumberOrNull(signal?.price ?? signal?.entryPrice) != null ||
      signal?.signalStatus === "provided" ||
      signal?.signalStatus === "confirmed"
    );
  });

  const forwardShadow = backtestSummary?.forwardShadow ?? {};
  const confirmedStrategySignalCount = strategySignals.filter((signal) => {
    return (
      signal?.signalStatus === "confirmed" &&
      numeric(signal?.suggestedExposure, 0) > 0
    );
  }).length;
  const forwardShadowConfirmedCount = Number(
    forwardShadow?.confirmedSignalCount ?? 0,
  );
  const forwardShadowObservedCount = Number(
    forwardShadow?.observedSignalCount ?? 0,
  );
  const forwardShadowEvaluatedCount = Number(
    forwardShadow?.evaluatedSignalCount ?? 0,
  );
  const forwardShadowRequiredCount = Number(
    forwardShadow?.requiredSignals ?? 0,
  );
  const hasConfirmedForwardSignals =
    confirmedStrategySignalCount > 0 ||
    forwardShadowConfirmedCount > 0 ||
    forwardShadowObservedCount > 0;

  const hasProvidedSignals =
    (hasUsableMarketData ||
      hasRealBacktestMarketData ||
      hasStrategyMarketData) &&
    (hasConfirmedForwardSignals ||
      rawIntelligence.some((stock) => {
        const status = String(stock.signalStatus ?? "");
        return status === "provided" || status === "confirmed";
      }));

  const hasMarketData =
    hasUsableMarketData || hasRealBacktestMarketData || hasStrategyMarketData;

  const rawMarketUniverse = rawCoveredIntelligence.length
    ? rawCoveredIntelligence
    : rawIntelligence;
  const rawOpenPositions = rawCoveredIntelligence.filter(
    (stock) => stock.suggestedExposure > 0,
  );
  const rawTargetExposure = clamp(
    rawOpenPositions.reduce((sum, stock) => sum + stock.suggestedExposure, 0),
    0,
    65,
  );
  const rawAvgQuality = mean(
    rawCoveredIntelligence.slice(0, 30).map((item) => item.setupQuality),
  );
  const rawAvgRisk = mean(
    rawCoveredIntelligence.slice(0, 30).map((item) => item.riskPressure),
  );
  const rawBreadth = rawCoveredIntelligence.length
    ? (rawCoveredIntelligence.filter((item) => item.suggestedExposure > 0)
        .length /
        rawCoveredIntelligence.length) *
      100
    : 0;
  const rawConfidence = clamp(rawAvgQuality * 0.75 + (100 - rawAvgRisk) * 0.25);

  const lastSyncedLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not synced";

  const lastSyncAgeMs = lastSyncedAt ? Date.now() - lastSyncedAt : null;
  const staleData =
    lastSyncAgeMs == null ? false : lastSyncAgeMs > REFRESH_INTERVAL_MS * 3;
  const lastSuccessfulUpdateLabel =
    lastSyncAgeMs == null
      ? lastSyncedLabel
      : lastSyncAgeMs < 60_000
        ? `${Math.max(1, Math.round(lastSyncAgeMs / 1000))} seconds ago`
        : lastSyncAgeMs < 3_600_000
          ? `${Math.max(1, Math.round(lastSyncAgeMs / 60_000))} minutes ago`
          : `${Math.max(1, Math.round(lastSyncAgeMs / 3_600_000))} hours ago`;

  const marketStatus = marketFilter ? getMarketStatus(marketFilter) : "Closed";

  const marketReliability = useMemo(
    () =>
      evaluateMarketReliability({
        market: marketFilter,
        marketStatus,
        stocks: rawMarketUniverse,
        avgRisk: rawAvgRisk,
        avgQuality: rawAvgQuality,
        breadth: rawBreadth,
        confidence: rawConfidence,
        targetExposure: rawTargetExposure,
        survivalScore: rawConfidence,
        failureFlags: [],
        staleData,
        hasBacktestData: false,
        hasProvidedSignals,
        backtestTradeCount: 0,
        backtestSharpe: null,
        backtestMaxDrawdownPct: null,
        backtestProfitFactor: null,
        backtestWinRatePct: null,
        backtestReturnPct: null,
        lastSuccessfulSync: lastSyncedAt,
        expectedAssetCount:
          rawMarketUniverse.length ||
          rawIntelligence.length ||
          totalStocks ||
          1,
      }),
    [
      marketFilter,
      marketStatus,
      rawMarketUniverse,
      rawAvgRisk,
      rawAvgQuality,
      rawBreadth,
      rawConfidence,
      rawTargetExposure,
      staleData,
      hasProvidedSignals,
      lastSyncedAt,
      totalStocks,
      rawIntelligence.length,
    ],
  );
  const visibleRefreshError =
    refreshError &&
    !(
      marketReliability.status === "healthy" &&
      marketReliability.market.synchronizationStatus === "synced" &&
      (marketReliability.market.lastSuccessfulSync != null ||
        lastSyncedAt != null)
    )
      ? refreshError
      : null;

  const intelligence = useMemo(
    () =>
      rawIntelligence.map((stock) => ({
        ...stock,
        suggestedExposure: capReliabilityExposure(
          stock.suggestedExposure,
          marketReliability,
        ),
      })),
    [rawIntelligence, marketReliability],
  );

  const coveredIntelligence = useMemo(
    () => intelligence.filter((stock) => hasStockEvidence(stock)),
    [intelligence],
  );

  const marketUniverse = coveredIntelligence.length
    ? coveredIntelligence
    : intelligence;

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

  const selected = useMemo(() => {
    return (
      filtered.find((item) => normalizedTicker(item) === selectedTicker) ??
      filtered[0] ??
      null
    );
  }, [filtered, selectedTicker]);

  useEffect(() => {
    setIsSelectedCardFlipped(false);
  }, [marketFilter]);

  useEffect(() => {
    refreshedPortfolioMarkets.current.clear();
  }, [marketFilter]);

  useEffect(() => {
    // Disabled damaged selected-history refresh effect after syntax recovery.
    // Backend/API persistence remains the source of truth for validation state.
  }, []);

  const openPositions = coveredIntelligence.filter(
    (stock) => stock.suggestedExposure > 0,
  );
  const targetExposure = clamp(
    openPositions.reduce((sum, stock) => sum + stock.suggestedExposure, 0),
    0,
    65,
  );
  const liveExposure = targetExposure;
  const capitalDeployed = "******";
  const riskBudget = Math.max(
    0,
    STARTING_PORTFOLIO_VALUE * ((targetExposure - liveExposure) / 100),
  );
  const avgQuality = mean(
    coveredIntelligence.slice(0, 30).map((item) => item.setupQuality),
  );
  const avgRisk = mean(
    coveredIntelligence.slice(0, 30).map((item) => item.riskPressure),
  );
  const breadth = coveredIntelligence.length
    ? (coveredIntelligence.filter((item) => item.suggestedExposure > 0).length /
        coveredIntelligence.length) *
      100
    : 0;
  const payloadDiscoveryCandidates = Array.isArray(
    opportunityDiscovery?.candidates,
  )
    ? opportunityDiscovery.candidates
    : [];
  const signalDiscoveryCandidates = strategySignals
    .map((signal) => signal?.opportunityDiscovery)
    .filter(Boolean);
  const discoveryCandidates = payloadDiscoveryCandidates.length
    ? payloadDiscoveryCandidates
    : signalDiscoveryCandidates;
  const discoveryDensityDiagnostics = opportunityDiscovery?.density ?? null;
  const adaptiveOpportunityDensityPct = clamp(
    finiteNumber(discoveryDensityDiagnostics?.density) ??
      (discoveryCandidates.length
        ? mean(
            discoveryCandidates.map((candidate: any) =>
              numeric(
                candidate.candidateScore ??
                  candidate.genericOpportunity?.strength,
              ),
            ),
          )
        : breadth),
  );
  const discoveryPipelineDiagnostics = opportunityDiscovery?.diagnostics ?? {
    candidateCount: discoveryCandidates.length,
    eligibleCount: discoveryCandidates.filter(
      (candidate: any) => candidate.eligible,
    ).length,
    improvingCount: discoveryCandidates.filter(
      (candidate: any) => numeric(candidate.scoreVelocity) > 0,
    ).length,
    averageScore: discoveryCandidates.length
      ? mean(
          discoveryCandidates.map((candidate: any) =>
            numeric(candidate.candidateScore),
          ),
        )
      : 0,
    averageVelocity: discoveryCandidates.length
      ? mean(
          discoveryCandidates.map((candidate: any) =>
            numeric(candidate.scoreVelocity),
          ),
        )
      : 0,
  };
  const rawNeedDiagnostics = Array.isArray(
    (marketPerceptionSnapshot?.framework as any)?.needs,
  )
    ? (marketPerceptionSnapshot?.framework as any).needs
    : [];
  const frameworkOpportunities = Array.isArray(
    (marketPerceptionSnapshot?.framework as any)?.opportunities,
  )
    ? (marketPerceptionSnapshot?.framework as any).opportunities
    : [];
  const purposeView = marketPerceptionSnapshot?.purpose;
  const meaningView = marketPerceptionSnapshot?.meaning;
  const purposeTone =
    purposeView == null || purposeView.mode === "legacy"
      ? "neutral"
      : purposeView.purposeScore >= 72
        ? "good"
        : purposeView.purposeScore >= 52
          ? "warn"
          : "bad";
  const purposeScoreLabel = purposeView
    ? `${Math.round(purposeView.purposeScore)}/100`
    : "Pending";
  const purposeSubLabel = purposeView
    ? `${purposeView.primaryFocus} · trust ${fmtPlainPct(purposeView.alignmentTrustScore, 0)}`
    : "Building momentum";
  const meaningTone =
    meaningView == null || meaningView.mode === "legacy"
      ? "neutral"
      : meaningView.gravityScore <= -7
        ? "bad"
        : meaningView.gravityScore < 0 || meaningView.mode === "degraded"
          ? "warn"
          : "good";
  const discoveryFindings = Array.isArray(opportunityDiscovery?.findings)
    ? opportunityDiscovery.findings
    : [];
  const leadingDiscoveryCandidate = discoveryCandidates[0] ?? null;
  const genericDiscovery =
    opportunityDiscovery?.discovery ??
    leadingDiscoveryCandidate?.discovery ??
    null;
  const discoverySupportEvidence = Array.isArray(
    genericDiscovery?.explanation?.supportingEvidence,
  )
    ? genericDiscovery.explanation.supportingEvidence
    : [];
  const discoveryContradictoryEvidence = Array.isArray(
    genericDiscovery?.explanation?.contradictoryEvidence,
  )
    ? genericDiscovery.explanation.contradictoryEvidence
    : [];
  const discoveryMissingEvidence = Array.isArray(
    genericDiscovery?.missingEvidence,
  )
    ? genericDiscovery.missingEvidence
    : [];
  const discoveryInvalidationConditions = Array.isArray(
    genericDiscovery?.invalidationConditions,
  )
    ? genericDiscovery.invalidationConditions
    : [];
  const discoveryMemory = genericDiscovery?.memory ?? null;
  const discoveryLifecycle = genericDiscovery?.lifecycle ?? null;
  const agencySummary = agencyDiagnostics?.summary ?? {};
  const agencyState = agencyDiagnostics?.state ?? {};
  const agencySelfDiagnosis = agencyState.selfDiagnosis ?? {};
  const agencyAudits = Array.isArray(agencyDiagnostics?.signalAudits)
    ? agencyDiagnostics.signalAudits
    : strategySignals.map((signal) => signal?.agency).filter(Boolean);
  const agencyRecommendation = String(
    agencySummary.recommendation ??
      agencyState.selfDiagnosis?.recommendation ??
      "wait",
  );
  const agencyTrustPct = clamp(
    (finiteNumber(agencySummary.averageTrust) ??
      finiteNumber(agencySelfDiagnosis.trust) ??
      0) * 100,
  );
  const agencyTrustAdjustmentPct =
    finiteNumber(agencySummary.trustAdjustment) == null
      ? null
      : clamp(Number(agencySummary.trustAdjustment) * 100);
  const agencyTraceCount = numeric(
    agencySummary.traceCount ?? agencyState.traceCount ?? agencyAudits.length,
  );
  const agencyAllowedActions = numeric(
    agencySummary.allowedActions ??
      agencyAudits.filter((audit: any) => audit?.allowed === true).length,
  );
  const agencyBlockedActions = numeric(agencySummary.blockedActions);
  const agencyMissingOutcomes = numeric(agencySummary.missingOutcomes);
  const agencyDataReliabilityPct = finiteNumber(
    agencySelfDiagnosis.dataReliability,
  );
  const agencySelfDiagnosisCalibrationHealthPct = finiteNumber(
    agencySelfDiagnosis.calibrationHealth,
  );
  const agencyOverfitRiskPct = finiteNumber(agencySelfDiagnosis.overfitRisk);
  const agencyReasons = Array.isArray(agencySelfDiagnosis.reasons)
    ? agencySelfDiagnosis.reasons
    : undefined;
  const hasAgencyDiagnostics =
    Boolean(agencyDiagnostics) ||
    agencyAudits.length > 0 ||
    finiteNumber(agencySummary.averageTrust) != null ||
    finiteNumber(agencySelfDiagnosis.trust) != null;
  const strategyReadiness = backtestSummary?.strategyReadiness ?? {};
  const strategyHealthOptimization =
    backtestSummary?.strategyHealthOptimization ?? null;
  const indicatorExcellence =
    strategyHealthOptimization?.indicatorExcellence ?? null;
  const indicatorExcellenceTone: "good" | "warn" | "bad" | "neutral" =
    indicatorExcellence?.allTargetsSatisfied
      ? "good"
      : indicatorExcellence?.status === "near_exceptional"
        ? "warn"
        : indicatorExcellence
          ? "neutral"
          : "warn";
  const indicatorExcellenceLabel = indicatorExcellence
    ? indicatorExcellence.allTargetsSatisfied
      ? "Exceptional indicators"
      : indicatorExcellence.status?.replace(/_/g, " ") ?? "Optimized"
    : "Needs review";
  const trustGovernor: TrustGovernorDiagnostic | null =
    backtestSummary?.trustGovernor ?? strategyReadiness?.trustGovernor ?? null;
  const readinessRemediation: ReadinessRemediationDiagnostic | null =
    backtestSummary?.readinessRemediation ??
    backtestSummary?.remediationPlan ??
    strategyReadiness?.readinessRemediation ??
    null;
  const trustGovernorBlocks =
    Boolean(trustGovernor) &&
    trustGovernor?.allowsNewExposure === false &&
    Array.isArray(trustGovernor?.blockedActions) &&
    trustGovernor.blockedActions.includes("new_exposure");
  const trustGovernorPrimaryReason =
    trustGovernor?.blockers?.[0]?.reason ?? trustGovernor?.reasons?.[0] ?? "";
  const strategyFailureFlags = Array.isArray(backtestSummary?.failureFlags)
    ? backtestSummary.failureFlags
    : [];
  const strategyReadinessBlocked =
    backtestSummary?.promotionBlocked === true ||
    strategyFailureFlags.length > 0 ||
    backtestSummary?.automaticFailureDetected === true ||
    strategyReadiness?.blocked === true ||
    backtestSummary?.readinessLabel === "Blocked" ||
    backtestSummary?.promotionLabel === "Blocked";
  const strategyMaxPositionPct =
    finiteNumber(trustGovernor?.maxExposure) ??
    finiteNumber(backtestSummary?.trustedMaxExposurePct) ??
    finiteNumber(backtestSummary?.maxPositionPct) ??
    finiteNumber(strategyReadiness?.maxPositionPct);
  const strategyConfidenceCap =
    finiteNumber(backtestSummary?.modelConfidence) ??
    finiteNumber(strategyReadiness?.maxConfidence) ??
    finiteNumber(backtestSummary?.promotionConfidence);
  const calibrationDiagnostics =
    strategyReadiness?.calibration ?? backtestSummary?.calibration ?? null;
  const rawConfidenceDisplay =
    finiteNumber(backtestSummary?.rawConfidence) ??
    finiteNumber(strategyReadiness?.rawConfidence) ??
    finiteNumber(calibrationDiagnostics?.rawConfidence) ??
    strategyConfidenceCap;
  const calibratedConfidenceDisplay =
    finiteNumber(backtestSummary?.calibratedConfidence) ??
    finiteNumber(strategyReadiness?.calibratedConfidence) ??
    finiteNumber(calibrationDiagnostics?.calibratedConfidence) ??
    strategyConfidenceCap;
  const calibrationTrustworthinessDisplay =
    finiteNumber(backtestSummary?.trustworthiness) ??
    finiteNumber(strategyReadiness?.trustworthiness) ??
    finiteNumber(calibrationDiagnostics?.trustworthiness);
  const calibrationWarnings = Array.isArray(
    backtestSummary?.calibrationWarnings,
  )
    ? backtestSummary.calibrationWarnings
    : Array.isArray(calibrationDiagnostics?.warnings)
      ? calibrationDiagnostics.warnings
      : [];
  const calibrationSampleSize = numeric(
    calibrationDiagnostics?.sampleSize ?? 0,
  );
  const rawCalibrationStatus = String(
    backtestSummary?.calibrationStatus ??
      calibrationDiagnostics?.status ??
      (calibrationSampleSize > 0 ? "tracked" : "insufficient-history"),
  );
  const calibrationStatus =
    rawCalibrationStatus === "trusted" &&
    calibrationWarnings.includes("unstable outcomes")
      ? "unstable-outcomes"
      : rawCalibrationStatus;
  const calibrationTone =
    calibrationStatus === "trusted" || calibrationStatus === "tracked"
      ? "good"
      : calibrationStatus === "poor-calibration"
        ? "bad"
        : "warn";
  const calibrationExplanation = calibrationWarnings.includes(
    "unstable outcomes",
  )
    ? "Calibration has enough history, but outcomes are unstable. Keep this review-gated until outcomes become more consistent."
    : String(
        backtestSummary?.calibrationExplanation ??
          calibrationDiagnostics?.explanation ??
          (calibrationSampleSize > 0
            ? "Calibration checks whether past confidence matched actual outcomes."
            : "Calibration history is still insufficient."),
      );
  const calibrationStatusLabel = calibrationStatus.replace(/-/g, " ");
  const calibrationConfidenceDrop =
    rawConfidenceDisplay != null && calibratedConfidenceDisplay != null
      ? rawConfidenceDisplay - calibratedConfidenceDisplay
      : 0;
  const topCalibrationMessage =
    calibrationSampleSize <= 0
      ? "Calibration history is still insufficient."
      : calibrationWarnings.includes("unstable outcomes")
        ? `Calibration has ${calibrationSampleSize} samples, but outcomes are unstable. The system should stay review-gated until similar signals become more consistent.`
        : strategyReadinessBlocked
          ? `Calibration has ${calibrationSampleSize} samples, but strategy readiness gates still block exposure. Calibrated confidence is ${calibratedConfidenceDisplay == null ? "not available" : fmtPlainPct(calibratedConfidenceDisplay, 0)}.`
          : calibrationConfidenceDrop >= 5
            ? `Raw confidence is ${fmtPlainPct(rawConfidenceDisplay, 0)}; calibrated confidence is ${fmtPlainPct(calibratedConfidenceDisplay, 0)}. The system is cautious because similar past signals have not yet proven reliable enough.`
            : `Calibration checks whether past confidence matched actual outcomes across ${calibrationSampleSize} samples.`;
  const calibrationRequiresReview = [
    "insufficient-history",
    "poor-calibration",
    "unstable-outcomes",
  ].includes(calibrationStatus);
  const strategyCapacityBlocked = strategyMaxPositionPct === 0;
  const commitmentBlocked =
    strategyReadinessBlocked ||
    strategyCapacityBlocked ||
    calibrationRequiresReview ||
    trustGovernorBlocks;
  const commitmentBlockReason =
    trustGovernorBlocks && trustGovernorPrimaryReason
      ? trustGovernorPrimaryReason
      : strategyReadinessBlocked
        ? "Strategy readiness gates block new exposure."
        : calibrationRequiresReview
          ? "Calibration gates block new exposure until outcomes stabilize."
          : strategyCapacityBlocked
            ? "Sizing gates block new exposure until commitment capacity reopens."
            : "";
  const commitmentBlockLabel =
    trustGovernorBlocks && trustGovernorPrimaryReason
      ? "Signal Trust Governor"
      : calibrationRequiresReview && !strategyReadinessBlocked
        ? "Calibration"
        : "Strategy readiness";
  const reviewIdeasMessage = commitmentBlockReason
    ? `${commitmentBlockReason} Showing the strongest review candidates instead of buy orders.`
    : "Showing the strongest review candidates instead of buy orders.";
  const needDiagnostics = resolveDashboardNeedDiagnostics({
    rawNeeds: rawNeedDiagnostics,
    strategyReadinessBlocked,
    strategyMaxPositionPct,
    calibrationStatus,
    calibrationTrustworthiness: calibrationTrustworthinessDisplay,
    calibratedConfidence: calibratedConfidenceDisplay,
    rawConfidence: rawConfidenceDisplay,
  });
  const agencyCalibrationHealthPct =
    calibrationTrustworthinessDisplay != null
      ? calibrationTrustworthinessDisplay / 100
      : agencySelfDiagnosisCalibrationHealthPct;
  const agencyLevel = useMemo(
    () =>
      hasAgencyDiagnostics
        ? {
            recommendation: agencyRecommendation,
            trustPct: agencyTrustPct,
            traceCount: agencyTraceCount,
            allowedActions: agencyAllowedActions,
            blockedActions: agencyBlockedActions,
            missingOutcomes: agencyMissingOutcomes,
            dataReliabilityPct: agencyDataReliabilityPct,
            calibrationHealthPct: agencyCalibrationHealthPct,
            overfitRiskPct: agencyOverfitRiskPct,
            reasons: agencyReasons,
          }
        : null,
    [
      hasAgencyDiagnostics,
      agencyRecommendation,
      agencyTrustPct,
      agencyTraceCount,
      agencyAllowedActions,
      agencyBlockedActions,
      agencyMissingOutcomes,
      agencyDataReliabilityPct,
      agencyCalibrationHealthPct,
      agencyOverfitRiskPct,
      agencyReasons,
    ],
  );
  const confidence = Math.min(
    capReliabilityConfidence(
      clamp(avgQuality * 0.75 + (100 - avgRisk) * 0.25),
      marketReliability,
    ) ?? 0,
    strategyConfidenceCap ?? 100,
  );
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
  const marketHealthPct = clamp(avgQuality * 0.55 + (100 - avgRisk) * 0.45);
  const dashboardSizing = buildDashboardExposureSizing({
    marketRef: marketFilter || "market",
    marketHealthPct,
    opportunityDensityPct: adaptiveOpportunityDensityPct,
    confidencePct: confidence ?? 0,
    riskPct: avgRisk ?? 100,
    requestedExposurePct: targetExposure,
    strategyCapPct: 65,
    hasMarketData,
    hasProvidedSignals,
    strategyBlocked: commitmentBlocked,
    strategyBlockedLabel: commitmentBlockLabel,
    strategyBlockedReason: commitmentBlockReason || undefined,
  });
  const opportunityParticipationPct = hasProvidedSignals
    ? adaptiveOpportunityDensityPct
    : 0;
  const semanticMetrics = useMemo(
    () =>
      buildDashboardSemanticMetrics({
        marketHealthPct,
        opportunityDensityPct: adaptiveOpportunityDensityPct,
        confidencePct: confidence ?? 0,
        riskPct: avgRisk ?? 100,
        avgQualityPct: avgQuality ?? 0,
        suggestedMaximumExposurePct:
          dashboardSizing.suggestedMaximumExposurePct,
        strategyCapPct: 65,
        sizingMode: dashboardSizing.sizingMode,
      }),
    [
      marketHealthPct,
      adaptiveOpportunityDensityPct,
      confidence,
      avgRisk,
      avgQuality,
      dashboardSizing.suggestedMaximumExposurePct,
      dashboardSizing.sizingMode,
    ],
  );
  const sizingModeMetricValue = hasProvidedSignals
    ? dashboardSizing.operatorState.sizingModeLabel
    : "—";
  const maximumExposureMetricValue = hasProvidedSignals
    ? dashboardSizing.operatorState.portfolioCapLabel
    : "—";
  const maximumExposureMetricSub =
    hasProvidedSignals
      ? maximumExposureSubLabel({
          sizingMode: dashboardSizing.sizingMode,
          suggestedMaximumExposurePct:
            dashboardSizing.suggestedMaximumExposurePct,
          semanticWord: semanticMetrics.maximumExposure.word,
        })
      : undefined;

  const allocationContext = useMemo(
    () => ({
      regime,
      avgRisk,
      breadth,
      targetExposure,
      marketStatus,
      defensiveReliability:
        shouldUseDefensiveReliabilityPosture(marketReliability),
      strategyBlocked: commitmentBlocked,
      strategyMaxPositionPct,
    }),
    [
      regime,
      avgRisk,
      breadth,
      targetExposure,
      marketStatus,
      marketReliability,
      commitmentBlocked,
      strategyMaxPositionPct,
    ],
  );

  const allocationUniverse = useMemo(
    () =>
      filtered.map((stock) => {
        const action = ((stock as any).allocationAction ??
          deriveAllocationAction(stock, allocationContext)) as AllocationAction;
        const normalizedAction =
          action === "Blocked" &&
          commitmentBlocked &&
          !isCommitmentReviewCandidate(stock)
            ? "Watch"
            : action;

        return {
          ...stock,
          allocationAction: normalizedAction,
        };
      }),
    [filtered, allocationContext, commitmentBlocked],
  );

  useEffect(() => {
    if (
      !marketFilter ||
      !allocationUniverse.length ||
      (!ENABLE_PORTFOLIO_API && !ENABLE_STRATEGY_API)
    )
      return;

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
        return (
          stock.allocationAction === "Buy" &&
          numeric(stock.suggestedExposure) > 0
        );
      }),
    [allocationUniverse],
  );

  const ledgerGroups = useMemo(() => {
    const middleAction: AllocationAction = commitmentBlocked
      ? "Blocked"
      : "Watch";

    return (["Buy", middleAction, "Sell"] as AllocationAction[]).map(
      (action) => ({
        action,
        items: allocationUniverse.filter(
          (stock) => stock.allocationAction === action,
        ),
      }),
    );
  }, [allocationUniverse, commitmentBlocked]);

  const topOpportunities = useMemo(
    () =>
      allocationUniverse
        .filter((stock) => {
          return (
            stock.allocationAction === "Buy" &&
            numeric(stock.suggestedExposure) > 0
          );
        })
        .sort((a, b) => {
          return (
            numeric(b.setupQuality) +
            numeric(b.suggestedExposure) * 8 -
            numeric(b.riskPressure) * 0.35 -
            (numeric(a.setupQuality) +
              numeric(a.suggestedExposure) * 8 -
              numeric(a.riskPressure) * 0.35)
          );
        })
        .slice(0, 8),
    [allocationUniverse],
  );

  const reviewOpportunities = useMemo(
    () =>
      allocationUniverse
        .filter((stock) => {
          return (
            stock.allocationAction === "Blocked" &&
            stock.riskPressure < 78 &&
            (stock.signalAction === "Buy" ||
              numeric(stock.setupQuality) >= 58 ||
              numeric(stock.discoveryScore) >= 55)
          );
        })
        .sort((a, b) => {
          return (
            numeric(b.setupQuality) +
            numeric(b.discoveryScore) * 0.4 -
            numeric(b.riskPressure) * 0.35 -
            (numeric(a.setupQuality) +
              numeric(a.discoveryScore) * 0.4 -
              numeric(a.riskPressure) * 0.35)
          );
        })
        .slice(0, 8),
    [allocationUniverse],
  );

  const showingBlockedReviewIdeas =
    topOpportunities.length === 0 && reviewOpportunities.length > 0;
  const displayedTopOpportunities = topOpportunities.length
    ? topOpportunities
    : reviewOpportunities;
  const selectedAllocationStock = allocationUniverse.find(
    (stock) => normalizedTicker(stock) === selectedTicker,
  );
  const beliefDiagnostic =
    selectedAllocationStock?.belief ??
    displayedTopOpportunities[0]?.belief ??
    allocationUniverse.find((stock) => stock.belief)?.belief ??
    null;
  const beliefSupportEvidence = topBeliefEvidence(
    beliefDiagnostic,
    "supportingEvidence",
  );
  const beliefContradictoryEvidence = topBeliefEvidence(
    beliefDiagnostic,
    "contradictoryEvidence",
  );
  const recognitionDiagnostic: RecognitionDiagnostic | null =
    selectedAllocationStock?.recognition ??
    displayedTopOpportunities[0]?.recognition ??
    allocationUniverse.find((stock) => stock.recognition)?.recognition ??
    backtestSummary?.recognitionDiagnostics?.primary ??
    null;
  const recognitionMissingEvidence = recognitionDiagnostic?.missingEvidence
    ?.length
    ? recognitionDiagnostic.missingEvidence
    : [
        recognitionDiagnostic
          ? "No recognition evidence gap reported."
          : "Recognition is waiting for Discovery and Judgement evidence.",
      ];
  const recognitionInvalidationConditions = recognitionDiagnostic
    ?.invalidationConditions?.length
    ? recognitionDiagnostic.invalidationConditions
    : [
        recognitionDiagnostic
          ? "No recognition invalidation condition reported."
          : "Recognition invalidation conditions are pending.",
      ];
  const recognitionClearsDiscoveryNovelty =
    recognitionClearsDiscoveryNoveltyNarrative(recognitionDiagnostic);
  const displayedDiscoveryInvalidationConditions =
    reconcileDiscoveryInvalidationConditions(
      discoveryInvalidationConditions,
      recognitionDiagnostic,
    );
  const discoveryMemoryRecognitionLine = recognitionStateRecurrenceLine(
    recognitionDiagnostic,
  );
  const judgementDiagnostic =
    selectedAllocationStock?.judgement ??
    displayedTopOpportunities[0]?.judgement ??
    allocationUniverse.find((stock) => stock.judgement)?.judgement ??
    null;
  const judgementReasons = Array.isArray(judgementDiagnostic?.reasons)
    ? judgementDiagnostic.reasons.slice(0, 3)
    : [];
  const survivalMemoryDiagnostic: SurvivalMemoryDiagnostic | null =
    selectedAllocationStock?.survivalMemory ??
    selectedAllocationStock?.judgement?.survivalMemory ??
    displayedTopOpportunities[0]?.survivalMemory ??
    displayedTopOpportunities[0]?.judgement?.survivalMemory ??
    allocationUniverse.find((stock) => stock.survivalMemory)?.survivalMemory ??
    allocationUniverse.find((stock) => stock.judgement?.survivalMemory)
      ?.judgement?.survivalMemory ??
    backtestSummary?.survivalMemory ??
    strategyReadiness?.survivalMemory ??
    null;
  const survivalWarnings = survivalMemoryDiagnostic?.mainWarnings?.length
    ? survivalMemoryDiagnostic.mainWarnings
    : survivalMemoryDiagnostic?.reasons?.length
      ? survivalMemoryDiagnostic.reasons
      : [
          survivalMemoryDiagnostic
            ? "No survival warnings reported."
            : "Survival memory is waiting for outcome records with drawdown and stress fields.",
        ];
  const recoveryDiagnostic: RecoveryDiagnostic | null =
    selectedAllocationStock?.recovery ??
    displayedTopOpportunities[0]?.recovery ??
    allocationUniverse.find((stock) => stock.recovery)?.recovery ??
    backtestSummary?.recovery ??
    strategyReadiness?.recovery ??
    null;
  const restorationProgressDiagnostic: RestorationProgressDiagnostic | null =
    selectedAllocationStock?.restorationProgress ??
    displayedTopOpportunities[0]?.restorationProgress ??
    allocationUniverse.find((stock) => stock.restorationProgress)
      ?.restorationProgress ??
    backtestSummary?.restorationProgress ??
    strategyReadiness?.restorationProgress ??
    null;
  const recoveryBlockers = recoveryDiagnostic?.blockers?.length
    ? recoveryDiagnostic.blockers
    : [
        recoveryDiagnostic
          ? "No recovery blockers reported."
          : "Recovery diagnostics are pending.",
      ];
  const recoveryUnlockConditions = recoveryDiagnostic?.unlockConditions?.length
    ? recoveryDiagnostic.unlockConditions
    : [
        recoveryDiagnostic
          ? "No recovery unlock conditions reported."
          : "Recovery unlock conditions are pending.",
      ];
  const displayedRecoveryBlockers = reconcileRecoveryBlockersWithRecognition(
    recoveryBlockers,
    recognitionDiagnostic,
  );
  const displayedRecoveryUnlockConditions =
    reconcileRecoveryUnlockConditionsWithRecognition(
      recoveryUnlockConditions,
      recognitionDiagnostic,
    );
  const resolveDiagnostic =
    selectedAllocationStock?.resolve ??
    displayedTopOpportunities[0]?.resolve ??
    allocationUniverse.find((stock) => stock.resolve)?.resolve ??
    backtestSummary?.resolveDiagnostics?.primary ??
    null;
  const resolveMissingEvidence = resolveDiagnostic?.missingEvidence?.length
    ? resolveDiagnostic.missingEvidence
    : [
        resolveDiagnostic
          ? "No missing evidence reported."
          : "Resolve evidence is pending.",
      ];
  const resolveUnlockConditions = resolveDiagnostic?.unlockConditions?.length
    ? resolveDiagnostic.unlockConditions
    : [
        resolveDiagnostic
          ? "No unlock conditions reported."
          : "Resolve unlock conditions are pending.",
      ];
  const displayedResolveUnlockConditions =
    reconcileResolveUnlockConditionsWithRecognition({
      conditions: resolveUnlockConditions,
      missingEvidence: resolveMissingEvidence,
      recognition: recognitionDiagnostic,
    });
  const resolveInvalidationConditions = resolveDiagnostic
    ?.invalidationConditions?.length
    ? resolveDiagnostic.invalidationConditions
    : [
        resolveDiagnostic
          ? "No invalidation conditions reported."
          : "Resolve invalidation conditions are pending.",
      ];
  const executionQualityDiagnostic: ExecutionQualityDiagnostic | null =
    selectedAllocationStock?.executionQuality ??
    displayedTopOpportunities[0]?.executionQuality ??
    allocationUniverse.find((stock) => stock.executionQuality)?.executionQuality ??
    backtestSummary?.executionQuality ??
    null;
  const counterfactualDiagnostic: CounterfactualDiagnostic | null =
    selectedAllocationStock?.counterfactual ??
    displayedTopOpportunities[0]?.counterfactual ??
    allocationUniverse.find((stock) => stock.counterfactual)?.counterfactual ??
    backtestSummary?.counterfactual ??
    null;
  const discoveryAccountabilityDiagnostic: DiscoveryAccountabilityDiagnostic | null =
    selectedAllocationStock?.discoveryAccountability ??
    displayedTopOpportunities[0]?.discoveryAccountability ??
    allocationUniverse.find((stock) => stock.discoveryAccountability)
      ?.discoveryAccountability ??
    backtestSummary?.discoveryAccountability ??
    null;
  const discoveryIntelligenceDiagnostic: DiscoveryIntelligenceDiagnostic | null =
    selectedAllocationStock?.discoveryIntelligence ??
    displayedTopOpportunities[0]?.discoveryIntelligence ??
    allocationUniverse.find((stock) => stock.discoveryIntelligence)
      ?.discoveryIntelligence ??
    backtestSummary?.discoveryIntelligence ??
    null;
  const wisdomDiagnostic: WisdomDiagnostic | null =
    selectedAllocationStock?.wisdom ??
    displayedTopOpportunities[0]?.wisdom ??
    allocationUniverse.find((stock) => stock.wisdom)?.wisdom ??
    backtestSummary?.wisdom ??
    null;
  const executiveDecisionDiagnostic: ExecutiveDecisionDiagnostic | null =
    selectedAllocationStock?.executiveDecision ??
    displayedTopOpportunities[0]?.executiveDecision ??
    allocationUniverse.find((stock) => stock.executiveDecision)
      ?.executiveDecision ??
    backtestSummary?.executiveDecision ??
    null;
  const decisionStatesDiagnostic: DecisionStatesDiagnostic | null =
    selectedAllocationStock?.decisionStates ??
    displayedTopOpportunities[0]?.decisionStates ??
    allocationUniverse.find((stock) => stock.decisionStates)?.decisionStates ??
    backtestSummary?.decisionStates ??
    null;

  useEffect(() => {
    if (!marketFilter || !ENABLE_PORTFOLIO_API) return;

    let cancelled = false;
    const market = marketFilter;

    async function loadPortfolio() {
      setPortfolioRefreshing(true);

      try {
        const [summaryResponse, historyResponse] = await Promise.all([
          fetch(
            `/api/portfolio?action=summary&market=${encodeURIComponent(market)}`,
          ),
          fetch(
            `/api/portfolio?action=history&market=${encodeURIComponent(market)}`,
          ),
        ]);

        const summary = await asJsonOrNull(summaryResponse);
        const history = await asJsonOrNull(historyResponse);

        if (cancelled) return;

        const nextPortfolioSummary = normalizeStrategySummary(summary);
        const nextPortfolioHistory = Array.isArray(history?.data)
          ? history.data.map((point: any, index: number) => ({
              index,
              ...point,
              equity: Number(point.equity),
              returnPct: Number(point.returnPct ?? point.return_pct),
              deployedPct: Number(point.deployedPct ?? point.deployed_pct),
              cashPct: Number(point.cashPct ?? point.cash_pct),
            }))
          : normalizeStrategyArray(history);

        applyMarketDataPatch(market, {
          portfolioSummary: nextPortfolioSummary,
          persistentPortfolioHistory: nextPortfolioHistory,
        });
      } catch (error) {
        console.warn(
          "Keeping previous portfolio state after refresh failure",
          error,
        );
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
    const market = marketFilter;

    async function loadBacktest() {
      setPortfolioRefreshing(true);

      try {
        const [summaryResponse, historyResponse, tradesResponse] =
          await Promise.all([
            fetch(
              `/api/strategy?action=walk-forward-summary&market=${encodeURIComponent(market)}`,
            ),
            fetch(
              `/api/strategy?action=walk-forward-history&market=${encodeURIComponent(market)}`,
            ),
            fetch(
              `/api/strategy?action=walk-forward-trades&market=${encodeURIComponent(market)}&limit=5000`,
            ),
          ]);

        const summary = await asJsonOrNull(summaryResponse);
        const history = await asJsonOrNull(historyResponse);
        const trades = await asJsonOrNull(tradesResponse);

        if (cancelled) return;

        const nextBacktestSummary = normalizeStrategySummary(summary);
        const nextBacktestHistory = Array.isArray(history?.data)
          ? history.data.map((point: any, index: number) => ({
              index,
              ...point,
              equity: Number(point.equity),
              returnPct: Number(point.returnPct ?? point.return_pct),
              deployedPct: Number(point.deployedPct ?? point.deployed_pct),
              cashPct: Number(point.cashPct ?? point.cash_pct),
              positionsCount: Number(
                point.positionsCount ?? point.positions_count ?? 0,
              ),
            }))
          : normalizeStrategyArray(history);

        const nextWalkForwardTrades = Array.isArray(trades?.trades)
          ? trades.trades
          : normalizeStrategyArray(trades);

        applyMarketDataPatch(market, {
          backtestSummary: nextBacktestSummary,
          backtestHistory: nextBacktestHistory,
          walkForwardTrades: nextWalkForwardTrades,
        });
      } catch (error) {
        console.warn(
          "Keeping previous backtest state after refresh failure",
          error,
        );
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
        const weight =
          numeric(stock.suggestedExposure) / totalSuggestedExposure;
        const basePrice = priceAt(stock, 0);
        const currentPrice = priceAt(stock, index);

        const stockReturn =
          basePrice > 0 && currentPrice > 0 ? currentPrice / basePrice - 1 : 0;

        weightedPositionReturn += weight * stockReturn;
      }

      const portfolioReturn = deployedFraction * weightedPositionReturn;
      const equity =
        initialEquity *
        (cashFraction + deployedFraction * (1 + weightedPositionReturn));

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
    const active = finalOpenPositions.filter(
      (stock) => numeric(stock.suggestedExposure) > 0,
    );

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
      (portfolioReturns.filter((value) => value > 0).length /
        portfolioReturns.length) *
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

  const displayedPortfolioEquity = portfolioSummary?.equity ?? portfolioEquity;

  const displayedPortfolioReturnPct =
    portfolioSummary?.totalReturnPct ??
    portfolioSummary?.total_return_pct ??
    portfolioReturnPct;

  const displayedAnnualSharpe =
    portfolioSummary?.annualizedSharpe ??
    portfolioSummary?.annualized_sharpe ??
    normalizedAnnualSharpe;

  const displayedAverageDurationDays =
    portfolioSummary?.averageDurationDays ??
    portfolioSummary?.average_duration_days ??
    averageDurationDays;

  const displayedProfitFactor =
    portfolioSummary?.profitFactor ??
    portfolioSummary?.profit_factor ??
    portfolioProfitFactor;

  const displayedWinRatePct =
    portfolioSummary?.winRatePct ??
    portfolioSummary?.win_rate_pct ??
    portfolioWinRate;

  const displayedMaxDrawdownPct =
    portfolioSummary?.maxDrawdownPct ??
    portfolioSummary?.max_drawdown_pct ??
    portfolioMaxDrawdown;

  const displayedBacktestHistory = useMemo(
    () =>
      applyExecutionCostsToCurve(
        backtestHistory,
        walkForwardTrades,
        commissionBps,
        frontendSlippageBps ?? 0,
      ),
    [backtestHistory, walkForwardTrades, commissionBps, frontendSlippageBps],
  );

  const commissionAdjustedBacktestMetrics = useMemo(
    () => metricsFromCurve(displayedBacktestHistory),
    [displayedBacktestHistory],
  );

  const displayedBacktestEquity =
    commissionBps > 0 || (frontendSlippageBps ?? 0) > 0
      ? commissionAdjustedBacktestMetrics.equity
      : (backtestSummary?.equity ?? null);

  const displayedBacktestReturnPct =
    commissionBps > 0 || (frontendSlippageBps ?? 0) > 0
      ? commissionAdjustedBacktestMetrics.totalReturnPct
      : (backtestSummary?.totalReturnPct ??
        backtestSummary?.total_return_pct ??
        null);

  const displayedBacktestSharpe =
    commissionBps > 0 || (frontendSlippageBps ?? 0) > 0
      ? commissionAdjustedBacktestMetrics.annualizedSharpe
      : (backtestSummary?.annualizedSharpe ??
        backtestSummary?.annualized_sharpe ??
        backtestSummary?.rawAnnualizedSharpe ??
        backtestSummary?.raw_annualized_sharpe ??
        null);

  const displayedBacktestMaxDrawdownPct =
    commissionBps > 0 || (frontendSlippageBps ?? 0) > 0
      ? commissionAdjustedBacktestMetrics.maxDrawdownPct
      : (backtestSummary?.maxDrawdownPct ??
        backtestSummary?.max_drawdown_pct ??
        backtestSummary?.rawMaxDrawdownPct ??
        backtestSummary?.raw_max_drawdown_pct ??
        null);

  const displayedBacktestProfitFactor =
    commissionBps > 0 || (frontendSlippageBps ?? 0) > 0
      ? commissionAdjustedBacktestMetrics.profitFactor
      : (backtestSummary?.profitFactor ??
        backtestSummary?.profit_factor ??
        null);

  const displayedBacktestWinRate =
    commissionBps > 0 || (frontendSlippageBps ?? 0) > 0
      ? commissionAdjustedBacktestMetrics.winRatePct
      : (backtestSummary?.winRatePct ?? backtestSummary?.win_rate_pct ?? null);

  const hasPersistentPortfolioData =
    Boolean(portfolioSummary?.updatedAt) ||
    persistentPortfolioHistory.length > 1;

  const hasBacktestData =
    Boolean(backtestSummary?.updatedAt) || backtestHistory.length > 1;

  const hasPortfolioProjectionData =
    hasPersistentPortfolioData && displayedPortfolioHistory.length > 1;

  const hasBacktestMetrics =
    hasBacktestData && displayedBacktestReturnPct !== null;

  const resolvedWalkForwardHistory = backtestHistory.length
    ? backtestHistory
    : portfolioHistory;
  const resolvedWalkForwardTrades = walkForwardTrades;
  const resolvedWalkForwardSummary = backtestSummary;

  const hasBacktestCurve =
    resolvedWalkForwardHistory.length > 0 ||
    resolvedWalkForwardTrades.length > 0 ||
    Number(resolvedWalkForwardSummary?.tradeCount ?? 0) > 0;

  const backtestTradeCount = extractTradeCount(
    backtestSummary,
    walkForwardTrades,
  );
  const backtestSegmentCount = extractSegmentCount(backtestSummary);
  const benchmarkPass = extractBenchmarkPass(backtestSummary);
  const regimeConsistencyPct = extractRegimeConsistency(
    backtestSummary,
    regime,
    walkForwardTrades,
  );
  const backtestAverageHoldingDays = extractAverageHoldingDays(
    backtestSummary,
    walkForwardTrades,
  );

  const backendFailureFlags = Array.isArray(backtestSummary?.failureFlags)
    ? backtestSummary.failureFlags
    : [];

  const localFailureFlags = [
    !hasMarketData ? "Market data unavailable" : null,
    hasMarketData && !hasConfirmedForwardSignals
      ? "No confirmed live/forward signals"
      : null,
    hasBacktestData &&
    displayedBacktestMaxDrawdownPct != null &&
    Number(displayedBacktestMaxDrawdownPct) > 25
      ? "Past loss level was above 25%"
      : null,
    hasBacktestData &&
    displayedBacktestSharpe != null &&
    Number(displayedBacktestSharpe) < 0.5
      ? "Risk-adjusted return is below the minimum"
      : null,
    hasBacktestData &&
    displayedBacktestProfitFactor != null &&
    Number(displayedBacktestProfitFactor) < 1
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
  const robustnessDiagnostics = backtestSummary?.robustnessDiagnostics ?? {};
  const historyDiagnostics: HistoryDiagnostics =
    backtestSummary?.historyDiagnostics ??
    strategyReadiness?.historyDiagnostics ??
    robustnessDiagnostics?.historyDiagnostics ??
    backtestSummary?.dataQualityReport?.historyDiagnostics ??
    {};
  const historyCoverageYears =
    finiteNumber(historyDiagnostics?.historyCoverageYears) ??
    finiteNumber(historyDiagnostics?.availableYears) ??
    finiteNumber(backtestSummary?.historyCoverageYears);
  const historyDepthScore =
    finiteNumber(historyDiagnostics?.historyDepthScore) ??
    finiteNumber(backtestSummary?.historyDepthScore) ??
    finiteNumber(robustnessDiagnostics?.historyDepthScore);
  const regimeCoverageScore =
    finiteNumber(historyDiagnostics?.regimeCoverageScore) ??
    finiteNumber(backtestSummary?.regimeCoverageScore) ??
    finiteNumber(robustnessDiagnostics?.regimeCoverageScore);
  const regimeDiversityScore =
    finiteNumber(historyDiagnostics?.regimeDiversityScore) ??
    finiteNumber(backtestSummary?.regimeDiversityScore) ??
    finiteNumber(robustnessDiagnostics?.regimeDiversityScore);
  const sampleDiversityScore =
    finiteNumber(historyDiagnostics?.sampleDiversityScore) ??
    finiteNumber(backtestSummary?.sampleDiversityScore) ??
    finiteNumber(robustnessDiagnostics?.sampleDiversityScore);
  const historyCoverageStatus = coverageStatusLabel(
    historyDiagnostics?.coverageStatus ?? backtestSummary?.coverageStatus,
  );
  const historyExplanation =
    historyDiagnostics?.explanation ??
    "Extended history improves regime awareness and calibration. Recent outcomes still govern sizing restoration.";
  const robustnessScore = finiteNumber(
    backtestSummary?.robustnessScore ?? robustnessDiagnostics?.robustnessScore,
  );
  const robustnessOverfitRisk = finiteNumber(
    backtestSummary?.overfitRiskScore ?? robustnessDiagnostics?.overfitRisk,
  );
  const deploymentReadinessScore = finiteNumber(
    backtestSummary?.deploymentReadinessScore ??
      robustnessDiagnostics?.deploymentReadiness,
  );
  const backendRobustnessComponent = strategyReadiness?.components?.robustness;
  const backendRobustnessPassed =
    typeof backendRobustnessComponent?.passed === "boolean"
      ? backendRobustnessComponent.passed
      : null;
  const backendRobustnessScore = finiteNumber(
    backendRobustnessComponent?.score,
  );
  const robustnessSafetyGate = String(
    robustnessDiagnostics?.safetyGate ?? "",
  ).toLowerCase();
  const hasRobustnessDiagnostics =
    Boolean(backendRobustnessComponent) ||
    robustnessScore != null ||
    robustnessOverfitRisk != null ||
    deploymentReadinessScore != null ||
    Boolean(robustnessSafetyGate);
  const robustnessPassed =
    backendRobustnessPassed ??
    (!hasRobustnessDiagnostics
      ? true
      : (robustnessOverfitRisk == null || robustnessOverfitRisk <= 30) &&
        (deploymentReadinessScore == null || deploymentReadinessScore >= 60) &&
        robustnessSafetyGate !== "block");
  const robustnessFailureReason =
    Array.isArray(backendRobustnessComponent?.reasons) &&
    backendRobustnessComponent.reasons.length
      ? String(backendRobustnessComponent.reasons[0])
      : "The strategy should stay live-test blocked when robustness or overfit checks are unstable.";
  const robustnessReason = robustnessPassed
    ? robustnessOverfitRisk != null
      ? `Robustness is inside the execution threshold; overfit risk is ${fmtPlainPct(robustnessOverfitRisk, 0)}.`
      : "Robustness and overfit checks are inside the execution thresholds."
    : robustnessFailureReason;
  const robustnessValue =
    robustnessOverfitRisk != null
      ? `Overfit ${fmtPlainPct(robustnessOverfitRisk, 0)}`
      : deploymentReadinessScore != null
        ? `Readiness ${fmtPlainPct(deploymentReadinessScore, 0)}`
        : backendRobustnessScore != null
          ? `${Math.round(backendRobustnessScore)}/100`
          : "Healthy";
  const backendStrategyEdgeComponent =
    strategyReadiness?.components?.strategyEdge;
  const backendStrategyEdgePassed =
    typeof backendStrategyEdgeComponent?.passed === "boolean"
      ? backendStrategyEdgeComponent.passed
      : null;
  const strategyEdgePassed =
    backendStrategyEdgePassed ??
    (displayedBacktestSharpe != null &&
      Number(displayedBacktestSharpe) >= 1 &&
      hasBacktestMetrics &&
      Number(displayedBacktestReturnPct) > 0 &&
      backtestTradeCount >= 30);
  const strategyEdgeReason =
    Array.isArray(backendStrategyEdgeComponent?.reasons) &&
    backendStrategyEdgeComponent.reasons.length
      ? String(backendStrategyEdgeComponent.reasons[0])
      : "Risk-adjusted return should clear the production threshold before new exposure is allowed.";
  const backendWalkForwardComponent =
    strategyReadiness?.components?.walkForwardRobustness;
  const backendWalkForwardPassed =
    typeof backendWalkForwardComponent?.passed === "boolean"
      ? backendWalkForwardComponent.passed
      : null;
  const walkForwardPassed =
    backendWalkForwardPassed ??
    (hasBacktestCurve &&
      (backtestSegmentCount == null || backtestSegmentCount >= 3));
  const walkForwardReason =
    Array.isArray(backendWalkForwardComponent?.reasons) &&
    backendWalkForwardComponent.reasons.length
      ? String(backendWalkForwardComponent.reasons[0])
      : "The strategy should hold up across independent test periods, not only one snapshot.";
  const walkForwardValue =
    strategyReadiness?.walkForward?.segmentCount != null
      ? `${strategyReadiness.walkForward.positiveSegmentCount ?? 0}/${strategyReadiness.walkForward.segmentCount} positive periods`
      : hasBacktestCurve
        ? "Available"
        : "Missing";
  const backendParameterComponent =
    strategyReadiness?.components?.parameterRobustness;
  const backendParameterPassed =
    typeof backendParameterComponent?.passed === "boolean"
      ? backendParameterComponent.passed
      : null;
  const parameterStability =
    strategyReadiness?.parameterStability ??
    backtestSummary?.parameterRobustness ??
    {};
  const parameterVariantCount = numeric(
    parameterStability?.variantCount ?? parameterStability?.variants?.length,
  );
  const parameterPassRate = finiteNumber(parameterStability?.passRate);
  const parameterPassed =
    backendParameterPassed ??
    (parameterStability?.stable === true &&
      parameterVariantCount > 0 &&
      (parameterPassRate == null || parameterPassRate >= 60));
  const parameterReason =
    Array.isArray(backendParameterComponent?.reasons) &&
    backendParameterComponent.reasons.length
      ? String(backendParameterComponent.reasons[0])
      : "Nearby parameter variants should preserve the edge before live exposure is trusted.";
  const parameterValue =
    parameterVariantCount > 0
      ? `${parameterVariantCount} variants${parameterPassRate == null ? "" : `, ${fmtPlainPct(parameterPassRate, 0)} pass`}`
      : "Not evaluated";
  const backendConcentrationComponent =
    strategyReadiness?.components?.concentrationControl;
  const backendConcentrationPassed =
    typeof backendConcentrationComponent?.passed === "boolean"
      ? backendConcentrationComponent.passed
      : null;
  const concentrationRisk =
    strategyReadiness?.concentration ??
    backtestSummary?.concentrationRisk ??
    {};
  const top1TradeContributionPct = finiteNumber(
    concentrationRisk?.top1TradeContributionPct,
  );
  const top5TradeContributionPct = finiteNumber(
    concentrationRisk?.top5TradeContributionPct,
  );
  const concentrationPassed = backendConcentrationPassed ?? true;
  const concentrationReason =
    Array.isArray(backendConcentrationComponent?.reasons) &&
    backendConcentrationComponent.reasons.length
      ? String(backendConcentrationComponent.reasons[0])
      : "Returns should not depend too heavily on a few winning trades or one test period.";
  const concentrationValue =
    top1TradeContributionPct != null
      ? `Top trade ${fmtPlainPct(top1TradeContributionPct, 0)}`
      : top5TradeContributionPct != null
        ? `Top 5 ${fmtPlainPct(top5TradeContributionPct, 0)}`
        : "Distributed";
  const backendRiskControlComponent =
    strategyReadiness?.components?.riskControl;
  const backendRiskControlPassed =
    typeof backendRiskControlComponent?.passed === "boolean"
      ? backendRiskControlComponent.passed
      : null;
  const displayedBacktestDrawdownNumber = finiteNumber(
    displayedBacktestMaxDrawdownPct,
  );
  const lossControlPassed =
    backendRiskControlPassed ??
    (displayedBacktestDrawdownNumber != null &&
      displayedBacktestDrawdownNumber <= 25);
  const lossControlSeverity: ConfidenceGate["severity"] = lossControlPassed
    ? displayedBacktestDrawdownNumber != null &&
      displayedBacktestDrawdownNumber > 18
      ? "warn"
      : "good"
    : "bad";
  const lossControlReason =
    Array.isArray(backendRiskControlComponent?.reasons) &&
    backendRiskControlComponent.reasons.length
      ? String(backendRiskControlComponent.reasons[0])
      : "Large past losses make the strategy harder to trust.";

  const baseConfidenceGates: ConfidenceGate[] = [
    {
      key: "walkForward",
      label: "Walk-forward stability",
      passed: walkForwardPassed,
      value: walkForwardValue,
      reason: walkForwardReason,
      severity: walkForwardPassed ? "good" : "warn",
    },
    {
      key: "sameEngine",
      label: "Live signal match",
      passed: hasConfirmedForwardSignals,
      value: hasConfirmedForwardSignals
        ? `${Math.max(confirmedStrategySignalCount, forwardShadowConfirmedCount)} live, ${forwardShadowObservedCount} shadow, ${forwardShadowEvaluatedCount}/${forwardShadowRequiredCount || "?"} eval`
        : "No confirmed signals",
      reason:
        "Current signals should come from the same strategy that was tested in the past.",
      severity: hasConfirmedForwardSignals ? "good" : "bad",
    },
    {
      key: "positiveReturn",
      label: "Positive return",
      passed: hasBacktestMetrics && Number(displayedBacktestReturnPct) > 0,
      value: fmtPct(displayedBacktestReturnPct),
      reason: "The tested strategy should be positive after estimated costs.",
      severity:
        hasBacktestMetrics && Number(displayedBacktestReturnPct) > 0
          ? "good"
          : "warn",
    },
    {
      key: "riskAdjusted",
      label: "Strategy edge",
      passed: strategyEdgePassed,
      value:
        displayedBacktestSharpe == null
          ? "—"
          : Number(displayedBacktestSharpe).toFixed(2),
      reason: strategyEdgeReason,
      severity: strategyEdgePassed ? "good" : "warn",
    },
    {
      key: "drawdown",
      label: "Loss control",
      passed: lossControlPassed,
      value: fmtPlainPct(displayedBacktestMaxDrawdownPct),
      reason: lossControlReason,
      severity: lossControlSeverity,
    },
    {
      key: "profitFactor",
      label: "Profit factor",
      passed:
        displayedBacktestProfitFactor != null &&
        Number(displayedBacktestProfitFactor) >= 1.15,
      value:
        displayedBacktestProfitFactor == null
          ? "—"
          : Number(displayedBacktestProfitFactor) >= 999 ||
              displayedBacktestProfitFactor === Infinity
            ? "∞"
            : Number(displayedBacktestProfitFactor).toFixed(2),
      reason: "Winning trades should outweigh losing trades by a clear margin.",
      severity:
        displayedBacktestProfitFactor != null &&
        Number(displayedBacktestProfitFactor) >= 1.15
          ? "good"
          : "warn",
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
      reason:
        "The strategy should compare well with a simple buy-and-hold benchmark.",
      severity:
        benchmarkPass === true
          ? "good"
          : benchmarkPass === false
            ? "bad"
            : "neutral",
    },
    {
      key: "regime",
      label: "Similar market check",
      passed: regimeConsistencyPct == null || regimeConsistencyPct >= 50,
      value:
        regimeConsistencyPct == null
          ? "Pending"
          : fmtPlainPct(regimeConsistencyPct, 0),
      reason:
        "Confidence improves when results hold up in similar market conditions.",
      severity:
        regimeConsistencyPct == null
          ? "neutral"
          : regimeConsistencyPct >= 50
            ? "good"
            : "warn",
    },
    {
      key: "parameterRobustness",
      label: "Parameter robustness",
      passed: parameterPassed,
      value: parameterValue,
      reason: parameterReason,
      severity: parameterPassed ? "good" : "warn",
    },
    {
      key: "concentration",
      label: "Return concentration",
      passed: concentrationPassed,
      value: concentrationValue,
      reason: concentrationReason,
      severity: concentrationPassed ? "good" : "warn",
    },
    {
      key: "robustness",
      label: "Robustness risk",
      passed: robustnessPassed,
      value: robustnessValue,
      reason: robustnessReason,
      severity: robustnessPassed ? "good" : "bad",
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
    const market = marketFilter;

    async function loadStockVisualMap() {
      try {
        const response = await fetch(
          `/api/stocks/list?market=${encodeURIComponent(market)}&offset=0&limit=1000`,
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
          console.log("[stock visual map]", market, {
            rows: rows.length,
            withVisual: Array.from(map.values()).filter((item) =>
              Boolean(item.visual),
            ).length,
            sample: rows.slice(0, 3).map((row) => ({
              symbol: instrumentSymbol(row),
              keys: Object.keys(row ?? {}),
              visual: String(instrumentVisual(row)).slice(0, 80),
            })),
          });

          applyMarketDataPatch(market, { stockVisualMap: map });
        }
      } catch (error) {
        console.warn("[stock visual map] failed", error);
        if (!cancelled) {
          applyMarketDataPatch(market, { stockVisualMap: new Map() });
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
    const source = stockVisualMap.get(symbol) ?? stockVisualMap.get(baseSymbol);

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

  const hasBackendReadinessTruth =
    Boolean(backtestSummary?.strategyReadiness) ||
    finiteNumber(backtestSummary?.readinessScore) != null ||
    backtestSummary?.readinessStage != null ||
    backtestSummary?.productionReadinessStatus != null;

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
    excessReturnPct:
      backtestSummary?.excessReturnPct ?? backtestSummary?.excess_return_pct,
    excessSharpe:
      backtestSummary?.excessSharpe ?? backtestSummary?.excess_sharpe,
    tradeCount: backtestTradeCount,
    segmentCount: backtestSegmentCount,
    regimeConsistencyPct,
    staleData,
    hasFailureFlags: failureFlags.length > 0 || backendFailureFlags.length > 0,
  });

  const survivalScore = hasBackendReadinessTruth
    ? Number(
        backtestSummary?.survivalScore ??
          backtestSummary?.promotionConfidence ??
          strategyReadiness?.maxConfidence ??
          locallyComputedSurvivalScore,
      )
    : locallyComputedSurvivalScore;
  const readinessScoreDisplay = hasBackendReadinessTruth
    ? (finiteNumber(
        backtestSummary?.strategyReadiness?.readinessScore ??
          backtestSummary?.readinessScore,
      ) ?? survivalScore)
    : survivalScore;

  const confidenceStage = hasBackendReadinessTruth
    ? String(
        backtestSummary?.lifecycleStage ??
          strategyReadiness?.stage ??
          "Research validated",
      )
    : productionStage(survivalScore, confidenceGates);

  const passedGateCount = confidenceGates.filter((gate) => gate.passed).length;

  const lifecycleStageDisplay = hasBackendReadinessTruth
    ? plainStageLabel(
        backtestSummary?.readinessStage ??
          backtestSummary?.lifecycleStage ??
          strategyReadiness?.stage ??
          "Research only",
      )
    : plainStageLabel(backtestSummary?.lifecycleStage ?? confidenceStage);

  const promotionStateDisplay = hasBackendPromotionTruth
    ? plainStageLabel(
        backtestSummary?.promotionLabel ??
          backtestSummary?.readinessLabel ??
          (backtestSummary?.promotionBlocked
            ? "Blocked"
            : (backtestSummary?.promotionState ?? confidenceStage)),
      )
    : hasBackendReadinessTruth
      ? plainStageLabel(
          backtestSummary?.promotionLabel ??
            backtestSummary?.readinessLabel ??
            strategyReadiness?.stage ??
            confidenceStage,
        )
      : plainStageLabel(backtestSummary?.promotionState ?? confidenceStage);
  const executionGateDisplay = commitmentBlocked ? "Review gated" : "Open";
  const executionGateDetail = commitmentBlocked
    ? commitmentBlockLabel
    : promotionStateDisplay;

  const validationPostureDisplay = hasBackendPromotionTruth
    ? "Blocked by checks"
    : calibrationRequiresReview
      ? "Calibration review"
      : commitmentBlocked
        ? "Commitment review"
        : plainStageLabel(backtestSummary?.regime ?? regime);

  const readableFailureFlags = summarizePromotionBlockers(
    failureFlags,
    backtestSummary,
  );
  const trustReviewItems = Array.from(
    new Set(
      [
        ...readableFailureFlags,
        calibrationRequiresReview
          ? calibrationStatus === "unstable-outcomes"
            ? "Stabilize calibration outcomes; keep review mode until similar closed signals are consistent."
            : calibrationStatus === "poor-calibration"
              ? "Improve calibration quality before allowing new exposure."
              : "Collect enough evaluated outcomes before allowing new exposure."
          : null,
        calibrationConfidenceDrop >= 15
          ? `Reduce raw-vs-calibrated confidence gap (${fmtPlainPct(rawConfidenceDisplay, 0)} raw vs ${fmtPlainPct(calibratedConfidenceDisplay, 0)} calibrated).`
          : null,
        calibrationWarnings.includes("overconfidence")
          ? "Reduce overconfidence warnings by closing outcomes that match predicted confidence."
          : null,
        trustGovernorBlocks && trustGovernorPrimaryReason
          ? `Trust Governor blocks new exposure: ${trustGovernorPrimaryReason}`
          : null,
        ...(trustGovernor?.unlockCriteria ?? [])
          .slice(0, 3)
          .map((item) => `Unlock: ${item}`),
      ].filter(Boolean) as string[],
    ),
  ).slice(0, 8);

  const executionProfile = useMemo(
    () => executionPresetForMarket(marketFilter || ""),
    [marketFilter],
  );

  const failureFlagKey = failureFlags.join("|");

  const marketPerceptionMetrics = useMemo(
    () =>
      buildMarketPerceptionMetrics({
        marketStatus,
        stocks: marketUniverse,
        avgRisk,
        avgQuality,
        breadth,
        confidence,
        targetExposure,
        survivalScore,
        failureFlags,
        staleData,
        hasBacktestData,
        hasProvidedSignals,
        backtestTradeCount,
        backtestSharpe: displayedBacktestSharpe,
        backtestMaxDrawdownPct: displayedBacktestMaxDrawdownPct,
        backtestProfitFactor: displayedBacktestProfitFactor,
        backtestWinRatePct: displayedBacktestWinRate,
        backtestReturnPct: displayedBacktestReturnPct,
        robustnessScore,
        robustnessOverfitRisk,
        deploymentReadinessScore,
        calibrationRawConfidence: rawConfidenceDisplay,
        calibrationCalibratedConfidence: calibratedConfidenceDisplay,
        calibrationHistoricalAccuracy:
          calibrationDiagnostics?.historicalAccuracy,
        calibrationError: calibrationDiagnostics?.calibrationError,
        calibrationTrustworthiness: calibrationTrustworthinessDisplay,
        calibrationSampleSize,
        calibrationStatus,
        calibrationWarnings,
        lastSuccessfulSync: lastSyncedAt,
        expectedAssetCount: marketUniverse.length || totalStocks || 1,
        exchangeSynchronized: !staleData,
        partialApiFailures: marketReliability.market.partialApiFailures,
        fallbackMode: marketReliability.market.fallbackMode,
        executionProfile,
        ambition,
        meaningText: meaningText.trim() || undefined,
      }),
    [
      marketStatus,
      marketUniverse,
      avgRisk,
      avgQuality,
      breadth,
      confidence,
      targetExposure,
      survivalScore,
      failureFlagKey,
      staleData,
      hasBacktestData,
      hasProvidedSignals,
      backtestTradeCount,
      displayedBacktestSharpe,
      displayedBacktestMaxDrawdownPct,
      displayedBacktestProfitFactor,
      displayedBacktestWinRate,
      displayedBacktestReturnPct,
      robustnessScore,
      robustnessOverfitRisk,
      deploymentReadinessScore,
      rawConfidenceDisplay,
      calibratedConfidenceDisplay,
      calibrationDiagnostics,
      calibrationTrustworthinessDisplay,
      calibrationSampleSize,
      calibrationStatus,
      calibrationWarnings,
      lastSyncedAt,
      totalStocks,
      marketReliability,
      executionProfile,
      ambition,
      meaningText,
    ],
  );

  useEffect(() => {
    if (!marketFilter || (loading && marketUniverse.length === 0)) return;

    let cancelled = false;
    const perceptionSource = {
      marketStatus,
      stocks: marketUniverse,
      avgRisk,
      avgQuality,
      breadth,
      confidence,
      targetExposure,
      survivalScore,
      failureFlags,
      staleData,
      hasBacktestData,
      hasProvidedSignals,
      backtestTradeCount,
      backtestSharpe: displayedBacktestSharpe,
      backtestMaxDrawdownPct: displayedBacktestMaxDrawdownPct,
      backtestProfitFactor: displayedBacktestProfitFactor,
      backtestWinRatePct: displayedBacktestWinRate,
      backtestReturnPct: displayedBacktestReturnPct,
      robustnessScore,
      robustnessOverfitRisk,
      deploymentReadinessScore,
      calibrationRawConfidence: rawConfidenceDisplay,
      calibrationCalibratedConfidence: calibratedConfidenceDisplay,
      calibrationHistoricalAccuracy: calibrationDiagnostics?.historicalAccuracy,
      calibrationError: calibrationDiagnostics?.calibrationError,
      calibrationTrustworthiness: calibrationTrustworthinessDisplay,
      calibrationSampleSize,
      calibrationStatus,
      calibrationWarnings,
      lastSuccessfulSync: lastSyncedAt,
      expectedAssetCount: marketUniverse.length || totalStocks || 1,
      exchangeSynchronized: !staleData,
      partialApiFailures: marketReliability.market.partialApiFailures,
      fallbackMode: marketReliability.market.fallbackMode,
      executionProfile,
      ambition,
      meaningText: meaningText.trim() || undefined,
    };

    marketStateEngineRef.current?.setSource(perceptionSource);
    void marketStateEngineRef.current
      ?.ingest(marketPerceptionMetrics, {
        market: marketFilter || "Unknown",
        timeframe: "live",
      })
      .then((snapshot) => {
        if (!cancelled) {
          applyMarketDataPatch(marketFilter, {
            marketPerceptionSnapshot: snapshot,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [marketPerceptionMetrics, marketFilter, loading, marketUniverse.length]);

  const executiveIA = buildExecutiveDashboardIA({
    discovery: genericDiscovery,
    discoveryDensity: discoveryDensityDiagnostics,
    discoveryPipeline: discoveryPipelineDiagnostics,
    recognition: recognitionDiagnostic,
    belief: beliefDiagnostic,
    judgement: judgementDiagnostic,
    agency: {
      recommendation: agencyRecommendation,
      trustPct: agencyTrustPct,
      blockedActions: agencyBlockedActions,
      dataReliabilityPct: agencyDataReliabilityPct,
      calibrationHealthPct: agencyCalibrationHealthPct,
      reasons: agencyReasons,
    },
    agencyDiagnostics,
    resolve: resolveDiagnostic,
    executive: executiveDecisionDiagnostic as any,
    executionQuality: executionQualityDiagnostic as any,
    counterfactual: counterfactualDiagnostic as any,
    discoveryAccountability: discoveryAccountabilityDiagnostic as any,
    discoveryIntelligence: discoveryIntelligenceDiagnostic as any,
    wisdom: wisdomDiagnostic as any,
    decisionStates: decisionStatesDiagnostic ?? undefined,
    survivalMemory: survivalMemoryDiagnostic,
    recovery: recoveryDiagnostic,
    sizing: {
      sizingMode: dashboardSizing.sizingMode,
      sizingDecision: dashboardSizing.sizingDecision,
      suggestedMaximumExposurePct: dashboardSizing.suggestedMaximumExposurePct,
      limitedReason: dashboardSizing.limitedReason,
      exposureExplanation: dashboardSizing.exposureExplanation,
      sizingReasons: dashboardSizing.sizingReasons,
      sizingRationale: dashboardSizing.sizingRationale,
    },
    trustGovernor,
    calibration: {
      status: calibrationStatus,
      rawConfidence: rawConfidenceDisplay,
      calibratedConfidence: calibratedConfidenceDisplay,
      trustworthiness: calibrationTrustworthinessDisplay,
      sampleSize: calibrationSampleSize,
      warnings: calibrationWarnings,
      explanation: calibrationExplanation,
    },
    readiness: {
      readinessScore: readinessScoreDisplay,
      maxPositionPct: strategyMaxPositionPct,
      maxConfidence: strategyConfidenceCap,
      blocked: strategyReadinessBlocked,
      components: strategyReadiness?.components,
      failureFlags,
      walkForward: strategyReadiness?.walkForward,
      stage: lifecycleStageDisplay,
    },
    strategyReadiness,
    strategyHistory: {
      sharpeRatio: displayedBacktestSharpe,
      profitFactor: displayedBacktestProfitFactor,
      maxDrawdownPct: displayedBacktestMaxDrawdownPct,
      tradeCount: backtestTradeCount,
      overfitRisk: robustnessOverfitRisk,
      modelReliability: robustnessScore ?? deploymentReadinessScore,
      dataReliability: strategyReadiness?.components?.dataReliability?.score,
      walkForward: strategyReadiness?.walkForward,
    },
    backtestSummary,
    opportunity: {
      densityPct: adaptiveOpportunityDensityPct,
      candidateQualityPct:
        finiteNumber(discoveryDensityDiagnostics?.quality) ??
        numeric(discoveryPipelineDiagnostics.averageScore),
      candidateCount: numeric(discoveryPipelineDiagnostics.candidateCount),
    },
    riskPct: avgRisk,
    sourceState: {
      market: marketFilter,
      selectedTicker,
    },
  });

  const topCanonicalRestriction =
    executiveIA.executiveReasoning.mainReasonForRestriction;
  const governanceEvolution = executiveIA.governanceEvolution;
  const governanceCommand = governanceEvolution.command;
  const activeExposureState =
    governanceEvolution.exposureStates.find((state) => state.status === "active") ??
    governanceEvolution.exposureStates[0];
  const dashboardDecisionStates = executiveIA.decisionStates;
  const trustStateTone =
    dashboardDecisionStates.trust.score >= 72
      ? "good"
      : dashboardDecisionStates.trust.score >= 50
        ? "warn"
        : "bad";
  const permissionTone =
    dashboardDecisionStates.permission.level === "approved"
      ? "good"
      : dashboardDecisionStates.permission.level === "blocked"
        ? "bad"
        : "warn";
  const capacityTone =
    dashboardDecisionStates.capacity.mode === "normal" ||
    dashboardDecisionStates.capacity.mode === "expanded"
      ? "good"
      : dashboardDecisionStates.capacity.mode === "none"
        ? "bad"
        : "warn";
  const urgencyTone =
    dashboardDecisionStates.urgency.mode === "act_now" ||
    dashboardDecisionStates.urgency.mode === "act_soon"
      ? "good"
      : dashboardDecisionStates.urgency.mode === "wait"
        ? "warn"
        : "neutral";
  const executionQualityTone =
    executionQualityDiagnostic?.status === "excellent" ||
    executionQualityDiagnostic?.status === "good"
      ? "good"
      : executionQualityDiagnostic?.status === "blocked" ||
          executionQualityDiagnostic?.status === "poor"
        ? "bad"
        : executionQualityDiagnostic
          ? "warn"
          : "neutral";
  const discoveryAccountabilityTone =
    discoveryAccountabilityDiagnostic?.status === "trusted" ||
    discoveryAccountabilityDiagnostic?.status === "reliable"
      ? "good"
      : discoveryAccountabilityDiagnostic?.status === "immature"
        ? "warn"
        : discoveryAccountabilityDiagnostic
          ? "warn"
          : "neutral";
  const counterfactualTone =
    counterfactualDiagnostic &&
    counterfactualDiagnostic.avoidedLossScore >
      counterfactualDiagnostic.missedUpsideScore
      ? "good"
      : counterfactualDiagnostic?.missedUpsideScore &&
          counterfactualDiagnostic.missedUpsideScore >= 55
        ? "warn"
        : "neutral";
  const wisdomTone =
    wisdomDiagnostic?.wisdomScore != null && wisdomDiagnostic.wisdomScore >= 70
      ? "good"
      : wisdomDiagnostic?.wisdomScore != null && wisdomDiagnostic.wisdomScore < 45
        ? "bad"
        : wisdomDiagnostic
          ? "warn"
          : "neutral";
  const executiveRestrictionExplanation =
    topCanonicalRestriction?.explanation ?? dashboardSizing.limitedReason;
  const currentStrategyStateName = hasMarketData
    ? regime
    : "Awaiting market confirmation";
  const executiveConfidencePct =
    calibratedConfidenceDisplay ?? rawConfidenceDisplay ?? confidence ?? null;
  const executiveTrustPct =
    (trustGovernor ? finiteNumber(trustGovernor.trustScore) : null) ??
    finiteNumber(agencyTrustPct) ??
    calibrationTrustworthinessDisplay ??
    null;
  const riskTone =
    avgRisk == null
      ? "neutral"
      : avgRisk < 45
        ? "good"
        : avgRisk < 70
          ? "warn"
          : "bad";
  const confidenceTone =
    executiveConfidencePct == null
      ? "neutral"
      : executiveConfidencePct >= 70 &&
          (executiveTrustPct ?? executiveConfidencePct) >= 70
        ? "good"
        : executiveConfidencePct >= 50
          ? "warn"
          : "bad";
  const exposureTone =
    dashboardSizing.sizingDecision === "blocked"
      ? "bad"
      : dashboardSizing.suggestedMaximumExposurePct > 20
        ? "good"
        : dashboardSizing.suggestedMaximumExposurePct > 0
          ? "warn"
          : "neutral";
  const postureTone =
    dashboardSizing.sizingDecision === "allowed"
      ? "good"
      : dashboardSizing.sizingDecision === "blocked"
        ? "bad"
        : "warn";
  const executiveDecisionSentence = !hasMarketData
    ? "Do not allocate capital until prices, signals, and governance evidence are synchronized."
    : dashboardSizing.suggestedMaximumExposurePct === 0 &&
        dashboardSizing.marketHealthPct >= 60
      ? dashboardSizing.exposureExplanation
      : avgRisk != null && avgRisk > 72
        ? "Risk is elevated; keep capital protected and avoid forcing new buys."
        : targetExposure < 35
          ? "Conditions are improving, but only the clearest setups justify reduced exposure."
          : "Market structure supports gradual participation while risk remains controlled.";
  const confidenceTrustSub =
    executiveTrustPct == null
      ? "Trust pending"
      : `Trusted by governance at ${fmtPlainPct(executiveTrustPct, 0)}`;
  const venueSyncStatus = `${marketStatus === "Open" ? "Venue open" : "Venue closed"} · ${lastSyncedLabel}`;
  const strategyHeadlineSize =
    currentStrategyStateName.length > 38
      ? "text-3xl md:text-5xl xl:text-6xl"
      : "text-3xl md:text-6xl";
  const actionableTickers = displayedTopOpportunities
    .filter((stock) => stock.allocationAction === "Buy")
    .slice(0, 3)
    .map((stock) => normalizedTicker(stock));
  const actionableTickersLabel = actionableTickers.length
    ? actionableTickers.join(", ")
    : showingBlockedReviewIdeas
      ? "Review candidates only"
      : "No eligible buys";
  const maxAssetExposurePct =
    displayedTopOpportunities.length > 0
      ? Math.max(
          ...displayedTopOpportunities.map((stock) =>
            numeric(stock.suggestedExposure),
          ),
        )
      : (finiteNumber(strategyMaxPositionPct) ??
        finiteNumber(dashboardDecisionStates.capacity.maxExposure) ??
        0);
  const starterExposurePct = Math.min(
    maxAssetExposurePct || dashboardSizing.suggestedMaximumExposurePct || 0,
    finiteNumber(dashboardDecisionStates.capacity.maxExposure) ??
      maxAssetExposurePct ??
      0,
  );
  const canonicalPortfolioCap = hasProvidedSignals
    ? maximumExposureMetricValue
    : "Pending";
  const canonicalPerAssetCap =
    maxAssetExposurePct > 0
      ? fmtPlainPct(maxAssetExposurePct)
      : dashboardSizing.operatorState.zeroExposureLabel;
  const canonicalStarterSize =
    starterExposurePct > 0 ? fmtPlainPct(starterExposurePct) : "Wait";
  const operatorAction = !hasMarketData
    ? "Wait"
    : operatorActionLabel({
        finalDecision: executiveIA.executiveReasoning.finalDecision,
        sizingMode: dashboardSizing.sizingMode,
        exposurePct: dashboardSizing.suggestedMaximumExposurePct,
        hasMarketData,
      });
  const operatorTone =
    !hasMarketData || dashboardSizing.sizingDecision === "blocked"
      ? dashboardSizing.sizingDecision === "blocked"
        ? "bad"
        : "neutral"
      : dashboardSizing.sizingMode === "micro" ||
          dashboardSizing.sizingMode === "small"
        ? "warn"
        : "good";
  const primaryUnlockCondition =
    executiveIA.executiveReasoning.primaryUnlockCondition;
  const primaryInvalidationCondition =
    executiveIA.executiveReasoning.primaryInvalidationCondition;
  const survivalConfidenceValue = finiteNumber(
    survivalMemoryDiagnostic?.survivalConfidence,
  );
  const survivalUnlockThreshold = 70;
  const survivalProgressPct =
    survivalConfidenceValue == null
      ? 0
      : clamp((survivalConfidenceValue / survivalUnlockThreshold) * 100);
  const survivalUnlockStatus =
    restorationProgressDiagnostic?.status === "restored"
      ? "Normal sizing restored"
      : restorationProgressDiagnostic?.status === "ready_for_restoration"
        ? "Ready for restoration review"
        : survivalConfidenceValue == null
      ? "Waiting for survival score"
      : restorationProgressDiagnostic == null && recoveryDiagnostic?.canRestoreSizing
        ? "Normal sizing restored"
        : survivalConfidenceValue >= survivalUnlockThreshold
          ? "Score passed; needs clean confirmation"
          : `${Math.ceil(survivalUnlockThreshold - survivalConfidenceValue)} pts short`;
  const unlockProgressTone =
    restorationProgressDiagnostic != null
      ? restorationProgressTone(restorationProgressDiagnostic)
      : recoveryDiagnostic?.canRestoreSizing
        ? "good"
        : survivalConfidenceValue != null &&
            survivalConfidenceValue >= survivalUnlockThreshold
          ? "warn"
          : "neutral";
  const restorationProgressPct =
    restorationProgressDiagnostic?.progressPct ?? survivalProgressPct;
  const restorationPrimaryBlocker =
    restorationProgressDiagnostic?.primaryBlocker ?? primaryUnlockCondition;
  const restorationOutcomeProof = restorationProgressDiagnostic?.outcomeProof;
  const restorationLedger = restorationProgressDiagnostic?.ledger;
  const restorationActionPlan = restorationProgressDiagnostic?.actionPlan;
  const restorationLedgerEntries =
    restorationLedger?.entries?.length
      ? restorationLedger.entries.slice(-3).reverse()
      : [];
  const restorationLedgerStateLabel =
    restorationLedger?.state?.replace(/_/g, " ") ??
    restorationProgressDiagnostic?.status?.replace(/_/g, " ") ??
    survivalUnlockStatus;
  const restorationGatePreview =
    restorationProgressDiagnostic?.gates?.length
      ? restorationProgressDiagnostic.gates.slice(0, 4)
      : [];
  const restorationNextActions =
    restorationProgressDiagnostic?.nextActions?.length
      ? restorationProgressDiagnostic.nextActions
      : [primaryUnlockCondition];
  const restorationActionInstruction =
    restorationActionPlan?.activeInstruction ??
    restorationNextActions[0] ??
    primaryUnlockCondition;
  const restorationExposureInstruction =
    restorationActionPlan?.exposureInstruction ??
    "Keep reduced-size participation in place until Survival Memory proof clears.";
  const restorationProofLaneOpen =
    restorationProgressDiagnostic?.canRestoreSizing === true ||
    (restorationProgressDiagnostic?.currentExposureCapPct ?? 0) > 0;
  const survivalConfidenceRestorationGate =
    restorationProgressDiagnostic?.gates?.find(
      (gate) => gate.id === "survival-confidence" && !gate.passed,
    ) ?? null;
  const cleanProofRestorationGate =
    restorationProgressDiagnostic?.gates?.find(
      (gate) =>
        gate.id === "clean-reduced-size-outcomes" &&
        !gate.passed &&
        (restorationActionPlan?.remainingCleanOutcomes ?? 0) > 0,
    ) ?? null;
  const actionableRestorationGate =
    survivalConfidenceRestorationGate ??
    (restorationProofLaneOpen ? cleanProofRestorationGate : null) ??
    restorationProgressDiagnostic?.gates?.find(
      (gate) =>
        !gate.passed &&
        gate.id !== "survival-status" &&
        gate.id !== "clean-reduced-size-outcomes",
    ) ??
    restorationProgressDiagnostic?.gates?.find((gate) => !gate.passed) ??
    null;
  const restorationRemainingCleanOutcomes =
    restorationActionPlan?.remainingCleanOutcomes ??
    restorationOutcomeProof?.remainingCleanReducedSizeOutcomes;
  const restorationActiveBoundaryBreaks =
    restorationActionPlan?.activeBoundaryBreaks ??
    restorationOutcomeProof?.activeProofBoundaryBreakCount ??
    restorationOutcomeProof?.failedReducedSizeOutcomeCount;
  const cleanReducedSizeOutcomeValue = restorationOutcomeProof
    ? `${restorationOutcomeProof.cleanReducedSizeOutcomeCount}/${restorationOutcomeProof.requiredCleanOutcomes}`
    : "Pending";
  const reducedSizeOutcomeSub = restorationOutcomeProof
    ? `${restorationOutcomeProof.reducedSizeOutcomeCount} reduced-size outcomes / ${restorationActiveBoundaryBreaks ?? 0} active-lane breaks`
    : undefined;
  const restorationCurrentCapValue = restorationProgressDiagnostic
    ? fmtPlainPct(restorationProgressDiagnostic.currentExposureCapPct)
    : canonicalPortfolioCap;
  const restorationNormalTargetValue = restorationProgressDiagnostic
    ? fmtPlainPct(restorationProgressDiagnostic.targetNormalExposurePct)
    : "Pending";
  const restorationActionPlanStatus =
    restorationActionPlan?.status?.replace(/_/g, " ") ??
    restorationProgressDiagnostic?.status?.replace(/_/g, " ") ??
    "pending";
  const restorationActionPlanTone =
    restorationActionPlan?.status === "restored" ||
    restorationActionPlan?.status === "ready_for_review"
      ? "good"
      : restorationActionPlan?.status === "reset_required"
        ? "bad"
        : "warn";
  const operatorSummary = !hasMarketData
    ? "Loading prices, signals, and governance before issuing a decision."
    : dashboardSizing.suggestedMaximumExposurePct <= 0
      ? `Stay flat for now. ${primaryInvalidationCondition}`
      : `Use ${sizingModeSentenceForOperator(dashboardSizing.sizingMode)} exposure in ${actionableTickersLabel}. ${restorationExposureInstruction}`;
  const restrictionImpactRows = (
    executiveIA.whyNotFullSize.factors.length
      ? executiveIA.whyNotFullSize.factors
      : [
          {
            priority: 1,
            code: "clear",
            label: "No active restriction",
            explanation:
              "The current IA layer has not identified a limiting gate.",
            unlockCondition:
              "Maintain trust, safety, reliability, and opportunity thresholds.",
          },
        ]
  )
    .slice(0, 4)
    .map((factor, index) => ({
      ...factor,
      impactPct: restrictionImpactPct(factor.code, index),
    }));
  const hiddenRestrictionCount = Math.max(
    0,
    executiveIA.whyNotFullSize.factors.length - restrictionImpactRows.length,
  );
  const increaseExposureTriggers = uniqueStrings([
    restorationActionInstruction,
    ...executiveIA.decisionChange.increaseExposure.filter(
      (item) => item !== primaryUnlockCondition,
    ),
  ]).slice(0, 4);
  const reduceOrInvalidateTriggers = uniqueStrings([
    ...executiveIA.decisionChange.reduceExposure,
    ...executiveIA.decisionChange.invalidateSignal,
  ]).slice(0, 4);
  const restorationPathTriggers = uniqueStrings(
    restorationActionPlan?.steps?.length
      ? restorationActionPlan.steps.map(
          (step) => `${step.label}: ${step.detail}`,
        )
      : executiveIA.decisionChange.watchToLimitedToNormal,
  ).slice(0, 3);
  const accountabilityHighlights = governanceEvolution.accountabilityLoop
    .filter((step) => step.status !== "complete")
    .slice(0, 3);
  const commandCenterModel = buildCommandCenterViewModel({
    market: marketFilter || "Market",
    strategyState: currentStrategyStateName,
    operatorAction,
    operatorSummary,
    finalDecision: executiveIA.executiveReasoning.finalDecision,
    participationMode:
      executiveIA.executiveReasoning.recommendedParticipationMode,
    sizingMode: dashboardSizing.sizingMode,
    exposurePct: dashboardSizing.suggestedMaximumExposurePct,
    topRestriction: topCanonicalRestriction
      ? {
          label: topCanonicalRestriction.label,
          explanation: topCanonicalRestriction.explanation,
          unlockCondition: primaryUnlockCondition,
          invalidationCondition: primaryInvalidationCondition,
        }
      : null,
    trustScore:
      (trustGovernor ? finiteNumber(trustGovernor.trustScore) : null) ??
      (hasAgencyDiagnostics ? agencyTrustPct : null) ??
      calibrationTrustworthinessDisplay,
    survivalConfidence: survivalConfidenceValue,
    readinessScore: readinessScoreDisplay,
    historyDepthScore,
    historyCoverageYears,
    regimeCoverageScore,
    sampleDiversityScore,
    calibrationTrustworthiness: calibrationTrustworthinessDisplay,
    calibrationSampleSize,
    knowledgeCompletenessScore:
      finiteNumber(
        discoveryIntelligenceDiagnostic?.institutionalization
          ?.institutionalizationScore,
      ) ??
      finiteNumber(wisdomDiagnostic?.discoveryMaturity?.maturityScore) ??
      finiteNumber(discoveryAccountabilityDiagnostic?.maturity),
    dataReliabilityScore:
      finiteNumber(strategyReadiness?.components?.dataReliability?.score) ??
      agencyDataReliabilityPct,
    agencyMaturityScore: agencyTrustPct,
    memoryDepthScore: historyDepthScore,
    discoveryScore:
      finiteNumber(discoveryIntelligenceDiagnostic?.score) ??
      finiteNumber(discoveryAccountabilityDiagnostic?.accountabilityScore),
    recognitionScore: finiteNumber(recognitionDiagnostic?.recognitionScore),
    judgementScore:
      finiteNumber(judgementDiagnostic?.trust) ??
      finiteNumber(judgementDiagnostic?.reliability) ??
      finiteNumber(judgementDiagnostic?.calibration),
    recoveryScore:
      finiteNumber(recoveryDiagnostic?.recoveryScore) ?? restorationProgressPct,
    wisdomScore: finiteNumber(wisdomDiagnostic?.wisdomScore),
    riskControlScore: avgRisk == null ? null : 100 - avgRisk,
    overfitRiskScore:
      robustnessOverfitRisk ??
      finiteNumber(judgementDiagnostic?.overfitRisk) ??
      agencyOverfitRiskPct,
    restorationProgress: restorationProgressDiagnostic,
    recovery: recoveryDiagnostic,
    trustGovernor,
    readinessRemediation,
    activeRestrictions: restrictionImpactRows
      .filter((restriction) => restriction.code !== "clear")
      .map((restriction) => ({
        code: restriction.code,
        label: restriction.label,
        explanation: restriction.explanation,
        unlockCondition: restriction.unlockCondition,
        progressPct: 100 - restriction.impactPct,
      })),
    unlockConditions: increaseExposureTriggers,
    invalidationConditions: reduceOrInvalidateTriggers,
    nextActions: restorationPathTriggers,
    cleanOutcomeCount: restorationOutcomeProof?.cleanReducedSizeOutcomeCount,
    requiredCleanOutcomeCount: restorationOutcomeProof?.requiredCleanOutcomes,
    activeBoundaryBreakCount: restorationActiveBoundaryBreaks,
    historicalMatches:
      finiteNumber(recognitionDiagnostic?.matchedSamples) ??
      finiteNumber(judgementDiagnostic?.similarSampleSize),
    normalSizingRestored:
      restorationProgressDiagnostic?.canRestoreSizing === true ||
      recoveryDiagnostic?.canRestoreSizing === true ||
      dashboardSizing.sizingMode === "normal",
    governanceApproved:
      dashboardDecisionStates.permission.allowed === true &&
      (dashboardDecisionStates.capacity.mode === "normal" ||
        dashboardDecisionStates.capacity.mode === "expanded"),
    hasSurvivalScar:
      (survivalMemoryDiagnostic?.scarCount ?? 0) > 0 ||
      ["scarred", "watch", "limited"].includes(
        String(restorationProgressDiagnostic?.restorationState ?? ""),
      ),
  });

  const decisionToneForPct = (
    value: number | null | undefined,
    reverse = false,
  ): DecisionTone => {
    if (value == null || !Number.isFinite(Number(value))) return "neutral";
    const normalized = clamp(Number(value));
    if (reverse) {
      if (normalized <= 38) return "good";
      if (normalized <= 68) return "warn";
      return "bad";
    }
    if (normalized >= 72) return "good";
    if (normalized >= 48) return "warn";
    return "bad";
  };
  const decisionStageStatus = (
    value: number | null | undefined,
    reverse = false,
  ): "Pass" | "Caution" | "Fail" => {
    const tone = decisionToneForPct(value, reverse);
    if (tone === "good") return "Pass";
    if (tone === "bad") return "Fail";
    return "Caution";
  };
  const compactDecisionLines = (values: Array<unknown>, fallback: string) => {
    const lines = uniqueStrings(
      values
        .flat()
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ).slice(0, 3);
    return lines.length ? lines : [fallback];
  };

  const decisionOpportunitySource = displayedTopOpportunities.length
    ? displayedTopOpportunities
    : allocationUniverse
        .filter((stock) => hasStockEvidence(stock))
        .sort(
          (a, b) =>
            numeric(b.setupQuality) -
            numeric(b.riskPressure) * 0.3 -
            (numeric(a.setupQuality) - numeric(a.riskPressure) * 0.3),
        )
        .slice(0, 6);
  const decisionOpportunities: DecisionOpportunity[] =
    decisionOpportunitySource.map((stock) => {
      const ticker = normalizedTicker(stock) || "PENDING";
      const qualityPct = clamp(numeric(stock.setupQuality));
      const trustPct =
        finiteNumber(stock.trustGovernor?.trustScore) ??
        finiteNumber(stock.judgement?.trust) ??
        finiteNumber(stock.judgement?.reliability) ??
        executiveTrustPct;
      const riskPct = clamp(numeric(stock.riskPressure));
      const timingPct = clamp(numeric(stock.timingQuality));
      const trendPct = clamp(numeric(stock.trendQuality));
      const discoveryPct =
        finiteNumber(stock.discoveryScore) ??
        finiteNumber((stock.discovery as any)?.score) ??
        qualityPct;
      const decisionIntelligence = (stock as any).decisionIntelligence ?? {};
      const coherencePct =
        finiteNumber((stock as any).coherenceScore) ??
        finiteNumber(decisionIntelligence?.coherenceScore);
      const consensusPct =
        finiteNumber((stock as any).consensusLevel) ??
        finiteNumber(decisionIntelligence?.consensusLevel);
      const stockActionScale = finiteNumber((stock as any).actionScale);
      const intelligenceActionScale = finiteNumber(
        decisionIntelligence?.actionScale,
      );
      const actionScalePct =
        stockActionScale != null
          ? stockActionScale * 100
          : intelligenceActionScale != null
            ? intelligenceActionScale * 100
            : null;
      const predictionScenarios = Array.isArray(
        (stock as any).predictionScenarios,
      )
        ? (stock as any).predictionScenarios
        : Array.isArray(decisionIntelligence?.predictionScenarios)
          ? decisionIntelligence.predictionScenarios
          : [];
      const highestDownside = predictionScenarios.length
        ? Math.max(
            ...predictionScenarios.map((scenario: any) =>
              numeric(scenario?.downsideRisk),
            ),
          )
        : null;
      const simulationRecommendation = String(
        (stock as any).simulationRecommendation ??
          decisionIntelligence?.simulationRecommendation ??
          "",
      );
      const wisdomDecision = String(
        (stock as any).wisdomDecision ??
          decisionIntelligence?.wisdomDecision ??
          "",
      );
      const guide = Array.isArray(decisionIntelligence?.guide)
        ? decisionIntelligence.guide
        : [];
      const plainGuide = (step: number) =>
        String(guide.find((item: any) => item?.step === step)?.text ?? "").trim();
      const readinessPct = clamp(
        qualityPct * 0.24 +
          (coherencePct ?? qualityPct) * 0.2 +
          (trustPct ?? qualityPct) * 0.22 +
          (100 - riskPct) * 0.16 +
          timingPct * 0.14 +
          trendPct * 0.08 +
          discoveryPct * 0.04 +
          (consensusPct ?? qualityPct) * 0.06,
      );
      const failedConstraints = (stock.sizingConstraints ?? [])
        .filter((constraint) => constraint && !constraint.passed)
        .map(
          (constraint) =>
            constraint.reason ??
            constraint.label ??
            "A sizing constraint is still unresolved.",
        );
      const discoveryMissing = Array.isArray(
        (stock.discovery as any)?.missingEvidence,
      )
        ? (stock.discovery as any).missingEvidence
        : [];
      const discoveryInvalidations = Array.isArray(
        (stock.discovery as any)?.invalidationConditions,
      )
        ? (stock.discovery as any).invalidationConditions
        : [];

      return {
        id: ticker,
        ticker,
        name: stockName(stock),
        action: String(
          stock.allocationAction ?? stock.signalAction ?? operatorAction,
        ),
        readinessPct,
        exposureLabel:
          numeric(stock.suggestedExposure) > 0
            ? fmtPlainPct(numeric(stock.suggestedExposure))
            : "Watch",
        maxExposureLabel:
          numeric(stock.suggestedExposure) > 0
            ? fmtPlainPct(numeric(stock.suggestedExposure))
            : canonicalPerAssetCap,
        qualityPct,
        trustPct: trustPct ?? null,
        riskPct,
        timingPct,
        thesis:
          stock.explanation ??
          `${ticker} is ranked by opportunity quality, timing, trend, risk pressure, and current allocation permission.`,
        context:
          stock.mandate ??
          `${marketFilter || "The market"} is in ${currentStrategyStateName}; participation is ${executiveIA.executiveReasoning.recommendedParticipationMode}.`,
        support: compactDecisionLines(
          [
            decisionIntelligence?.humanSummary,
            plainGuide(1),
            stock.sizingRationale,
            stock.sizingReasons,
            stock.discoveryLifecycle
              ? `Discovery lifecycle: ${stock.discoveryLifecycle}`
              : "",
            coherencePct != null
              ? `Signal agreement is ${fmtPlainPct(coherencePct, 0)}.`
              : "",
            trendPct >= 60 ? "Trend quality supports continued review." : "",
          ],
          `${ticker} is inside the ranked opportunity set.`,
        ),
        contradictions: compactDecisionLines(
          [
            plainGuide(2),
            highestDownside != null && highestDownside >= 70
              ? "Prediction includes high downside risk."
              : "",
            simulationRecommendation === "wait"
              ? "Simulation prefers waiting over full action."
              : "",
            wisdomDecision === "avoid"
              ? "Wisdom blocks the action to protect survival."
              : "",
            failedConstraints,
            stock.rejectionReason,
            riskPct >= 70 ? "Risk pressure is elevated." : "",
            numeric(stock.suggestedExposure) <= 0
              ? "Exposure has not cleared sizing permission."
              : "",
          ],
          "No promoted contradiction.",
        ),
        missing: compactDecisionLines(
          [
            discoveryMissing,
            failedConstraints,
            numeric(stock.suggestedExposure) <= 0 ? primaryUnlockCondition : "",
          ],
          primaryUnlockCondition,
        ),
        invalidations: compactDecisionLines(
          [discoveryInvalidations, primaryInvalidationCondition],
          primaryInvalidationCondition,
        ),
        drivers: compactDecisionLines(
          [
            `Quality ${fmtPlainPct(qualityPct, 0)}`,
            coherencePct != null
              ? `Coherence ${fmtPlainPct(coherencePct, 0)}`
              : "",
            consensusPct != null
              ? `Consensus ${fmtPlainPct(consensusPct, 0)}`
              : "",
            actionScalePct != null
              ? `Action scale ${fmtPlainPct(actionScalePct, 0)}`
              : "",
            `Timing ${fmtPlainPct(timingPct, 0)}`,
            `Risk ${fmtPlainPct(riskPct, 0)}`,
          ],
          `${ticker} is being monitored by the decision engine.`,
        ),
        decisionIntelligence,
        coherenceScore: coherencePct ?? null,
        coherenceStatus:
          (stock as any).coherenceStatus ??
          decisionIntelligence?.coherenceStatus ??
          null,
        consensusLevel: consensusPct ?? null,
        simulationRecommendation: simulationRecommendation || null,
        wisdomDecision: wisdomDecision || null,
        outcomeAccuracy:
          finiteNumber((stock as any).outcomeAccuracy) ??
          finiteNumber(decisionIntelligence?.outcomeAccuracy),
        actionAllowed:
          (stock as any).actionAllowed ??
          decisionIntelligence?.actionAllowed ??
          null,
        actionScale:
          finiteNumber((stock as any).actionScale) ??
          finiteNumber(decisionIntelligence?.actionScale),
      };
    });
  const selectedDecisionOpportunityId =
    selectedTicker &&
    decisionOpportunities.some((opportunity) => opportunity.id === selectedTicker)
      ? selectedTicker
      : decisionOpportunities[0]?.id ?? null;
  const primaryDecisionOpportunity =
    decisionOpportunities.find(
      (opportunity) => opportunity.id === selectedDecisionOpportunityId,
    ) ??
    decisionOpportunities[0] ??
    null;
  const primaryDecisionIntelligence =
    primaryDecisionOpportunity?.decisionIntelligence ?? null;
  const primaryDecisionGuide = Array.isArray(primaryDecisionIntelligence?.guide)
    ? primaryDecisionIntelligence.guide
    : [];
  const decisionGuideText = (step: number) =>
    String(
      primaryDecisionGuide.find((item: any) => item?.step === step)?.text ?? "",
    ).trim();
  const primaryCoherenceScore =
    primaryDecisionOpportunity?.coherenceScore ??
    finiteNumber(primaryDecisionIntelligence?.coherenceScore);
  const primaryConsensusLevel =
    primaryDecisionOpportunity?.consensusLevel ??
    finiteNumber(primaryDecisionIntelligence?.consensusLevel);
  const primarySimulationRecommendation = String(
    primaryDecisionOpportunity?.simulationRecommendation ??
      primaryDecisionIntelligence?.simulationRecommendation ??
      "",
  );
  const primaryWisdomDecision = String(
    primaryDecisionOpportunity?.wisdomDecision ??
      primaryDecisionIntelligence?.wisdomDecision ??
      "",
  );
  const primaryOutcomeAccuracy =
    primaryDecisionOpportunity?.outcomeAccuracy ??
    finiteNumber(primaryDecisionIntelligence?.outcomeAccuracy);
  const primaryActionScalePct =
    primaryDecisionOpportunity?.actionScale != null
      ? primaryDecisionOpportunity.actionScale * 100
      : finiteNumber(primaryDecisionIntelligence?.actionScale) != null
        ? finiteNumber(primaryDecisionIntelligence?.actionScale)! * 100
        : null;
  const decisionReadinessPct = hasMarketData
    ? clamp(
        (readinessScoreDisplay ?? 50) * 0.28 +
          dashboardSizing.marketHealthPct * 0.18 +
          (executiveTrustPct ?? 50) * 0.18 +
          (executiveConfidencePct ?? 50) * 0.14 +
          (100 - (avgRisk ?? 50)) * 0.12 +
          (dashboardSizing.suggestedMaximumExposurePct > 0 ? 75 : 35) * 0.1,
      )
    : 0;
  const decisionReadinessState = !hasMarketData
    ? "Observe"
    : dashboardSizing.sizingDecision === "blocked" || decisionReadinessPct < 25
      ? "Not Investable"
      : decisionReadinessPct < 40
        ? "Observe"
        : decisionReadinessPct < 55
          ? "Watch"
          : decisionReadinessPct < 70
            ? "Prepare"
            : decisionReadinessPct < 85
              ? "Ready"
              : "Execute";
  const decisionReadinessTone = decisionToneForPct(decisionReadinessPct);
  const bestOpportunityLabel =
    primaryDecisionOpportunity?.ticker ??
    (showingBlockedReviewIdeas ? "Review candidates" : "Pending");
  const mainRiskLabel = !hasMarketData
    ? "Data unavailable"
    : topCanonicalRestriction?.label ?? "No active limiter";
  const missingEvidenceLabel = !hasMarketData
    ? "Market data synchronization"
    : primaryDecisionOpportunity?.missing[0] ??
      primaryUnlockCondition ??
      "Market confirmation";
  const readinessWhy = hasMarketData
    ? (executiveIA.executiveReasoning as any).summary ?? executiveDecisionSentence
    : "Prices, signals, and governance evidence are still synchronizing.";
  const readinessImprover =
    !hasMarketData
      ? "Restore market and strategy data sync."
      : increaseExposureTriggers[0] ??
        primaryDecisionOpportunity?.support[0] ??
        "Improve market confirmation and sizing permission.";
  const readinessBlocker =
    !hasMarketData
      ? "No market data has cleared the briefing gate."
      : reduceOrInvalidateTriggers[0] ??
        topCanonicalRestriction?.explanation ??
        "No hard blocker is currently promoted.";
  const executionStatus = String(executionQualityDiagnostic?.status ?? "");
  const executionStatusPct =
    executionStatus === "excellent" || executionStatus === "good"
      ? 78
      : executionStatus === "blocked" || executionStatus === "poor"
        ? 30
        : 55;
  const decisionEvidenceLadder: DecisionEvidenceStage[] = [
    {
      id: "market-context",
      label: "Market Context",
      status: hasMarketData
        ? decisionStageStatus(dashboardSizing.marketHealthPct)
        : "Caution",
      explanation: hasMarketData
        ? `${currentStrategyStateName} with market health at ${fmtPlainPct(dashboardSizing.marketHealthPct, 0)}.`
        : "Market context is loading.",
    },
    {
      id: "decision-coherence",
      label: "Decision Coherence",
      status: decisionStageStatus(primaryCoherenceScore),
      explanation:
        primaryCoherenceScore == null
          ? "Signal coherence is still forming."
          : `Signal coherence is ${fmtPlainPct(primaryCoherenceScore, 0)} with consensus at ${fmtPlainPct(primaryConsensusLevel, 0)}.`,
    },
    {
      id: "signal-agreement",
      label: "Signal Agreement",
      status: decisionStageStatus(executiveConfidencePct),
      explanation: `Confidence is ${fmtPlainPct(executiveConfidencePct, 0)} after calibration and signal agreement.`,
    },
    {
      id: "opportunity-quality",
      label: "Opportunity Quality",
      status: decisionStageStatus(primaryDecisionOpportunity?.qualityPct),
      explanation: primaryDecisionOpportunity
        ? `${primaryDecisionOpportunity.ticker} quality is ${fmtPlainPct(primaryDecisionOpportunity.qualityPct, 0)}.`
        : "No ranked opportunity has cleared the evidence filter.",
    },
    {
      id: "risk-control",
      label: "Risk Control",
      status: decisionStageStatus(avgRisk, true),
      explanation:
        avgRisk == null
          ? "Risk pressure is pending."
          : `Risk pressure is ${fmtPlainPct(avgRisk, 0)} across covered opportunities.`,
    },
    {
      id: "survival-memory",
      label: "Survival Memory",
      status: decisionStageStatus(survivalConfidenceValue),
      explanation:
        survivalConfidenceValue == null
          ? "Survival memory has not reported a confidence value."
          : `Survival confidence is ${fmtPlainPct(survivalConfidenceValue, 0)}.`,
    },
    {
      id: "calibration",
      label: "Calibration",
      status: decisionStageStatus(calibrationTrustworthinessDisplay),
      explanation:
        calibrationTrustworthinessDisplay == null
          ? "Calibration trustworthiness is pending."
        : `Calibration trustworthiness is ${fmtPlainPct(calibrationTrustworthinessDisplay, 0)} across ${calibrationSampleSize ?? 0} samples.`,
    },
    {
      id: "prediction-simulation",
      label: "Prediction & Simulation",
      status:
        primarySimulationRecommendation === "block"
          ? "Fail"
          : primarySimulationRecommendation === "wait"
            ? "Caution"
            : "Pass",
      explanation:
        decisionGuideText(4) ||
        (primarySimulationRecommendation
          ? `Simulation recommends ${primarySimulationRecommendation}.`
          : "Simulation is comparing action paths."),
    },
    {
      id: "wisdom",
      label: "Wisdom",
      status:
        primaryWisdomDecision === "avoid"
          ? "Fail"
          : primaryWisdomDecision === "wait" ||
              primaryWisdomDecision === "proceed-small"
            ? "Caution"
            : "Pass",
      explanation:
        decisionGuideText(6) ||
        (primaryWisdomDecision
          ? `Wisdom says ${primaryWisdomDecision}.`
          : "Wisdom prioritizes long-term survival over short-term upside."),
    },
    {
      id: "liquidity",
      label: "Liquidity",
      status: decisionStageStatus(executionStatusPct),
      explanation:
        (executionQualityDiagnostic as any)?.liquidityExplanation ??
        "Execution quality is inferred from current readiness and venue state.",
    },
    {
      id: "governance",
      label: "Governance",
      status: dashboardDecisionStates.permission.allowed
        ? "Pass"
        : dashboardDecisionStates.permission.level === "blocked"
          ? "Fail"
          : "Caution",
      explanation: `Permission is ${dashboardDecisionStates.permission.level.replace(/_/g, " ")}.`,
    },
    {
      id: "execution-quality",
      label: "Execution Quality",
      status: decisionStageStatus(executionStatusPct),
      explanation:
        (executionQualityDiagnostic as any)?.summary ??
        `Execution status is ${executionStatus || "pending"}.`,
    },
    {
      id: "decision-readiness",
      label: "Decision Readiness",
      status: decisionStageStatus(decisionReadinessPct),
      explanation: `${decisionReadinessState} at ${fmtPlainPct(decisionReadinessPct, 0)}.`,
    },
  ];
  const decisionActionPlan = {
    asset: primaryDecisionOpportunity?.ticker ?? "Pending",
    direction: operatorAction,
    exposure: primaryDecisionOpportunity?.exposureLabel ?? canonicalStarterSize,
    entryLogic:
      !hasMarketData
        ? "Wait for market data synchronization before changing exposure."
        : primaryDecisionOpportunity?.support[0] ??
          "Wait for market confirmation before changing exposure.",
    riskConstraints:
      !hasMarketData
        ? "No new exposure while the market feed is unavailable."
        : primaryDecisionOpportunity?.contradictions[0] ??
          topCanonicalRestriction?.explanation ??
          "Respect current portfolio and per-asset caps.",
    exitConditions:
      reduceOrInvalidateTriggers[0] ??
      primaryDecisionOpportunity?.invalidations[0] ??
      primaryInvalidationCondition,
    invalidation:
      primaryDecisionOpportunity?.invalidations[0] ??
      primaryInvalidationCondition,
    portfolioImpact: `Portfolio cap ${canonicalPortfolioCap}; per-asset cap ${primaryDecisionOpportunity?.maxExposureLabel ?? canonicalPerAssetCap}.`,
    nextAction: operatorAction,
  };
  const decisionWorkflow: DecisionWorkflowStep[] = [
    {
      id: "opportunity",
      label: "Opportunity",
      question: "What deserves attention?",
      output: primaryDecisionOpportunity
        ? `${primaryDecisionOpportunity.ticker} leads the ranked list.`
        : "No ranked opportunity yet.",
      detail:
        primaryDecisionOpportunity?.context ??
        "The system is waiting for enough context to explain the opportunity.",
      status: hasMarketData ? `${decisionOpportunities.length} ranked` : "Waiting for data",
    },
    {
      id: "trust",
      label: "Trust",
      question: "Can I trust it?",
      output: decisionEvidenceLadder
        .map((stage) => stage.status)
        .includes("Fail")
        ? "Trust is constrained."
        : "Trust is explainable.",
      detail: `The evidence ladder is ${decisionEvidenceLadder.filter((stage) => stage.status === "Pass").length}/10 pass with ${decisionEvidenceLadder.filter((stage) => stage.status === "Caution").length} cautions.`,
      status: "Trust report",
    },
    {
      id: "size",
      label: "Size",
      question: "How much should I risk?",
      output: decisionActionPlan.exposure,
      detail: dashboardSizing.exposureExplanation,
      status: displaySizingMode(dashboardSizing.sizingMode),
    },
    {
      id: "action",
      label: "Action",
      question: "What exactly should I do?",
      output: decisionActionPlan.nextAction,
      detail: `${decisionActionPlan.asset}: ${decisionActionPlan.direction} at ${decisionActionPlan.exposure}.`,
      status: operatorAction,
    },
  ];
  const decisionRawMetrics = [
    { label: "Coherence", value: fmtPlainPct(primaryCoherenceScore, 0) },
    { label: "Consensus", value: fmtPlainPct(primaryConsensusLevel, 0) },
    { label: "Confidence", value: fmtPlainPct(executiveConfidencePct, 0) },
    { label: "Trust", value: fmtPlainPct(executiveTrustPct, 0) },
    { label: "Market Health", value: fmtPlainPct(dashboardSizing.marketHealthPct, 0) },
    { label: "Simulation", value: primarySimulationRecommendation || "Pending" },
    { label: "Wisdom", value: primaryWisdomDecision || "Pending" },
    { label: "Action Scale", value: fmtPlainPct(primaryActionScalePct, 0) },
    { label: "Outcome Accuracy", value: fmtPlainPct(primaryOutcomeAccuracy, 0) },
    { label: "Opportunity Density", value: fmtPlainPct(adaptiveOpportunityDensityPct, 0) },
    { label: "Risk Pressure", value: fmtPlainPct(avgRisk, 0) },
    { label: "Readiness", value: fmtPlainPct(decisionReadinessPct, 0) },
    { label: "Portfolio Cap", value: canonicalPortfolioCap },
    { label: "Starter Size", value: canonicalStarterSize },
    { label: "Survival", value: fmtPlainPct(survivalConfidenceValue, 0) },
    { label: "Calibration", value: fmtPlainPct(calibrationTrustworthinessDisplay, 0) },
    { label: "History Depth", value: historyDepthScore == null ? "—" : fmtPlainPct(historyDepthScore, 0) },
    { label: "Regime Coverage", value: regimeCoverageScore == null ? "—" : fmtPlainPct(regimeCoverageScore, 0) },
  ];
  const trustAnalysisUnavailable =
    hasMarketData &&
    !loading &&
    trustGovernor == null &&
    beliefDiagnostic == null &&
    recognitionDiagnostic == null &&
    judgementDiagnostic == null &&
    calibrationTrustworthinessDisplay == null;
  const dashboardViewState = resolveDashboardViewState({
    selectedMarket: marketFilter,
    isOnline,
    continueWithCachedData,
    initialLoading: loading,
    refreshing: refreshingQuotes || portfolioRefreshing,
    errorMessage: visibleRefreshError,
    hasMarketData,
    qualifiedOpportunityCount: decisionOpportunities.length,
    cachedOpportunityCount:
      decisionOpportunities.length ||
      topOpportunities.length ||
      reviewOpportunities.length,
    cachedMarketItemCount: marketUniverse.length || stocks.length || totalStocks,
    cachedMarketLabel: marketFilter || "No market selected",
    lastSuccessfulUpdateLabel,
    missingTrustAnalysis: trustAnalysisUnavailable,
  });

  return (
    <DecisionOperatingSystem
      state={dashboardViewState}
      marketOptions={markets.map((market) => ({
        value: marketCode(market),
        label: marketLabel(market),
      }))}
      selectedMarket={marketFilter}
      onMarketChange={setMarketFilter}
      onRefresh={() => void refreshQuotes(marketFilter, stocks, true)}
      onContinueUsingCachedData={() => setContinueWithCachedData(true)}
      refreshing={refreshingQuotes}
      refreshError={visibleRefreshError}
      marketState={currentStrategyStateName}
      marketStatus={marketStatus === "Open" ? "Venue open" : "Venue closed"}
      lastSyncedLabel={lastSyncedLabel}
      readinessPct={decisionReadinessPct}
      readinessState={decisionReadinessState}
      readinessTone={decisionReadinessTone}
      bestOpportunityLabel={bestOpportunityLabel}
      recommendedAction={operatorAction}
      suggestedExposure={
        primaryDecisionOpportunity?.exposureLabel ?? canonicalStarterSize
      }
      mainRisk={mainRiskLabel}
      missingEvidence={missingEvidenceLabel}
      executiveNarrative={executiveDecisionSentence}
      readinessWhy={readinessWhy}
      readinessImprover={readinessImprover}
      readinessBlocker={readinessBlocker}
      opportunities={decisionOpportunities}
      selectedOpportunityId={selectedDecisionOpportunityId}
      onSelectOpportunity={setSelectedTicker}
      evidenceLadder={decisionEvidenceLadder}
      workflow={decisionWorkflow}
      actionPlan={decisionActionPlan}
      rawMetrics={decisionRawMetrics}
    />
  );

  const currentExecutiveSummaryMetrics: ExecutiveSummaryMetricSnapshot = {
    market: marketFilter,
    confidenceValue:
      executiveConfidencePct == null
        ? "Pending"
        : fmtPlainPct(executiveConfidencePct, 0),
    confidenceSub: confidenceTrustSub,
    confidenceTone,
    maxExposureValue: maximumExposureMetricValue,
    maxExposureSub: maximumExposureMetricSub,
    exposureTone,
    portfolioPostureValue:
      executiveIA.executiveReasoning.recommendedParticipationMode,
    portfolioPostureSub: hasMarketData ? mandate : "Suggested action loading",
    postureTone,
    marketHealthValue: hasMarketData
      ? semanticMetrics.marketHealth.word
      : "Pending",
    marketHealthSub: hasMarketData
      ? fmtPlainPct(dashboardSizing.marketHealthPct, 0)
      : "Awaiting synchronized data",
    marketHealthTone: riskTone,
  };
  const executiveSummaryMetrics = selectStableExecutiveSummaryMetrics({
    current: currentExecutiveSummaryMetrics,
    previous: executiveSummaryMetricSnapshotRef.current,
    refreshing: refreshingQuotes,
  });

  useEffect(() => {
    if (!refreshingQuotes) {
      executiveSummaryMetricSnapshotRef.current = currentExecutiveSummaryMetrics;
    }
  });

  return (
    <div className="min-h-screen overflow-x-hidden bg-black text-white">
      <main className="relative mx-auto w-full max-w-[1560px] overflow-x-hidden px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-[#FDD000] text-black">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#FDD000]">
                Command Center
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-white">
                Signal command center
              </h1>
            </div>
          </div>

          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:w-auto lg:grid-cols-[minmax(220px,1fr)_auto]">
            <select
              value={marketFilter}
              onChange={(event) => setMarketFilter(event.target.value)}
              className="h-11 w-full min-w-0 rounded-lg border border-white/[0.08] bg-[#080808] px-4 text-sm text-white outline-none ring-0"
            >
              {!markets.length ? (
                <option value="">Loading markets</option>
              ) : null}
              {markets.map((market) => (
                <option key={marketCode(market)} value={marketCode(market)}>
                  {marketLabel(market)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void refreshQuotes(marketFilter, stocks, true)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#FDD000] bg-[#FDD000] px-4 text-sm font-semibold text-black transition hover:bg-[#ffe45c] sm:w-auto"
            >
              <RefreshCw
                className={cx("h-4 w-4", refreshingQuotes && "animate-spin")}
              />
              Update data
            </button>
          </div>
        </header>

        {visibleRefreshError ? (
          <div className="mb-5 flex items-center gap-3 rounded-lg border border-[#FDD000]/30 bg-[#FDD000]/10 px-4 py-3 text-sm text-[#FDD000]">
            <AlertTriangle className="h-4 w-4" />
            {visibleRefreshError}
          </div>
        ) : null}

        <CommandCenter model={commandCenterModel} />

        <section
          data-testid="executive-summary"
          data-layout="responsive-executive-grid"
          className="mb-12 grid min-w-0 items-stretch gap-5 rounded-lg border border-white/[0.07] bg-[radial-gradient(circle_at_15%_0%,rgba(253,208,0,0.13),transparent_28%),linear-gradient(135deg,#111,#070707_64%,#050505)] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.38)] sm:p-5 lg:p-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]"
        >
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2 md:mb-5">
              <StatusPill tone={marketStatus === "Open" ? "good" : "bad"}>
                {venueSyncStatus}
              </StatusPill>
              <StatusPill tone={riskTone}>
                Risk state:{" "}
                {hasMarketData ? semanticMetrics.risk.word : "Pending"}
              </StatusPill>
              <span className="rounded-full border border-white/[0.08] bg-black/35 px-3 py-1 text-xs text-zinc-400">
                {marketFilter || "Market"} strategy state
              </span>
            </div>

            <div className="max-w-5xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FDD000]">
                Executive Summary
              </div>
              <h2
                className={cx(
                  "mt-3 max-w-5xl text-balance font-semibold leading-[0.95] tracking-tight text-white",
                  strategyHeadlineSize,
                )}
              >
                {currentStrategyStateName}
              </h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-300 md:mt-5 md:text-lg">
                {executiveDecisionSentence}
              </p>
            </div>

            <div
              data-mobile-posture-summary="true"
              className="mt-5 rounded-lg bg-black/30 p-4 ring-1 ring-white/[0.06] xl:hidden"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Active limiter
                  </div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-white">
                    {topCanonicalRestriction?.label ?? "No active limiter"}
                  </div>
                </div>
                <StatusPill
                  tone={executiveIA.whyNotFullSize.active ? "warn" : "good"}
                >
                  {sizingModeMetricValue}
                </StatusPill>
              </div>
              <p className="mt-3 line-clamp-2 text-xs leading-5 text-zinc-500">
                {executiveRestrictionExplanation}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-[11px] text-zinc-500">
                <div>
                  <span className="block text-zinc-600">Cap</span>
                  <span className="font-semibold text-slate-100">
                    {canonicalPortfolioCap}
                  </span>
                </div>
                <div>
                  <span className="block text-zinc-600">Starter</span>
                  <span className="font-semibold text-slate-100">
                    {canonicalStarterSize}
                  </span>
                </div>
                <div>
                  <span className="block text-zinc-600">Survival</span>
                  <span className="font-semibold text-slate-100">
                    {survivalConfidenceValue == null
                      ? "—"
                      : `${Math.round(survivalConfidenceValue)}/100`}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-lg bg-black/25 px-4 py-3 ring-1 ring-white/[0.06] sm:mt-8">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 md:text-[11px]">
                    <Sparkles className="h-4 w-4 text-[#FDD000]" />
                    Ambition
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-300">
                    {purposeView?.purposeStatement ??
                      "I am willing to sacrifice unnecessary urgency to achieve meaningful progress within a steady adaptive pace while respecting survivability."}
                  </p>
                </div>
                <div className="w-full shrink-0 md:w-[280px]">
                  <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                    <span>{purposeView?.primaryFocus ?? "Building momentum"}</span>
                    <span className="font-semibold text-zinc-200">
                      {Math.round(ambition)}/100
                    </span>
                  </div>
                  <input
                    aria-label="Ambition"
                    className="h-2 w-full accent-[#FDD000]"
                    max={100}
                    min={0}
                    onChange={(event) =>
                      setAmbition(clamp(Number(event.target.value), 0, 100))
                    }
                    type="range"
                    value={ambition}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-black/25 px-4 py-4 ring-1 ring-white/[0.06]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 lg:max-w-2xl">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 md:text-[11px]">
                    <Brain className="h-4 w-4 text-[#FDD000]" />
                    Goal alignment
                  </div>
                  <textarea
                    aria-label="Goal alignment"
                    className="mt-3 min-h-[74px] w-full resize-none rounded-md border border-white/[0.08] bg-black/35 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#FDD000]/45"
                    onChange={(event) => setMeaningText(event.target.value)}
                    placeholder="I want to grow aggressively but I do not want to blow up."
                    value={meaningText}
                  />
                </div>
                <div className="shrink-0">
                  <StatusPill tone={meaningTone}>
                    {meaningView && meaningView.mode !== "legacy"
                      ? `${Math.round(meaningView.gravityScore)}/10`
                      : "Legacy"}
                  </StatusPill>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <MiniMetric
                  label="What you seem to want"
                  value={meaningView?.whatYouSeemToWant ?? "No goal text yet"}
                  emphasis="quiet"
                />
                <MiniMetric
                  label="What this really points to"
                  value={
                    meaningView?.whatThisReallyPointsTo ??
                    "Existing market posture"
                  }
                  emphasis="quiet"
                />
                <MiniMetric
                  label="Safer goal"
                  value={
                    meaningView?.saferGoal ??
                    "Sustainable progress with survival protected"
                  }
                  emphasis="quiet"
                />
                <MiniMetric
                  label="Why we adjusted it"
                  value={
                    meaningView?.whyAdjusted ??
                    "No goal text was supplied"
                  }
                  emphasis="quiet"
                />
                <MiniMetric
                  label="What we will protect"
                  value={
                    meaningView?.whatWeWillProtect?.slice(0, 2).join(" · ") ||
                    "Risk of ruin · Recovery capacity"
                  }
                  emphasis="quiet"
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-5">
              <ExecutiveMetric
                label="Confidence / Trust"
                value={executiveSummaryMetrics.confidenceValue}
                sub={executiveSummaryMetrics.confidenceSub}
                tone={executiveSummaryMetrics.confidenceTone}
                icon={<Gauge className="h-4 w-4" />}
              />
              <ExecutiveMetric
                label="Max Exposure"
                value={executiveSummaryMetrics.maxExposureValue}
                sub={executiveSummaryMetrics.maxExposureSub}
                tone={executiveSummaryMetrics.exposureTone}
                icon={<CircleDollarSign className="h-4 w-4" />}
              />
              <ExecutiveMetric
                label="Portfolio Posture"
                value={executiveSummaryMetrics.portfolioPostureValue}
                sub={executiveSummaryMetrics.portfolioPostureSub}
                tone={executiveSummaryMetrics.postureTone}
                icon={<Compass className="h-4 w-4" />}
              />
              <ExecutiveMetric
                label="Market Health"
                value={executiveSummaryMetrics.marketHealthValue}
                sub={executiveSummaryMetrics.marketHealthSub}
                tone={executiveSummaryMetrics.marketHealthTone}
                icon={<ShieldCheck className="h-4 w-4" />}
              />
              <ExecutiveMetric
                label="Purpose"
                value={purposeScoreLabel}
                sub={purposeSubLabel}
                tone={purposeTone}
                icon={<Sparkles className="h-4 w-4" />}
              />
            </div>
          </div>

          <aside className="hidden min-w-0 flex-col justify-between rounded-lg bg-black/35 p-5 ring-1 ring-white/[0.07] xl:flex">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Active limiter
                  </div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    {topCanonicalRestriction?.label ?? "No active limiter"}
                  </div>
                </div>
                <StatusPill
                  tone={executiveIA.whyNotFullSize.active ? "warn" : "good"}
                >
                  {sizingModeMetricValue}
                </StatusPill>
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-400">
                {executiveRestrictionExplanation}
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <QualityBar
                value={avgRisk == null ? 0 : 100 - avgRisk}
                label={`Risk control · ${hasMarketData ? semanticMetrics.risk.word : "Pending"}`}
              />
              <QualityBar
                value={opportunityParticipationPct}
                label={`Opportunity density · ${hasProvidedSignals ? semanticMetrics.opportunityDensity.word : "Pending"}`}
              />
              <div className="grid grid-cols-3 gap-3 text-xs text-zinc-500">
                <MiniMetric
                  label="Portfolio cap"
                  value={canonicalPortfolioCap}
                  emphasis="quiet"
                />
                <MiniMetric
                  label="Starter"
                  value={canonicalStarterSize}
                  emphasis="quiet"
                />
                <MiniMetric
                  label="Survival"
                  value={
                    survivalConfidenceValue == null
                      ? "—"
                      : `${Math.round(survivalConfidenceValue)}/100`
                  }
                  emphasis="quiet"
                />
              </div>
            </div>
          </aside>
        </section>

        <DashboardGroup
          eyebrow="Decision layer"
          title="Executive Summary"
          description="The first layer keeps the operator focused on state, posture, exposure, and the few conditions that would change the recommendation."
        >
          <section className="grid min-w-0 gap-5">
            <SectionShell
              eyebrow="Executive Reasoning"
              title="Final action"
              action={
                <StatusPill
                  tone={executiveIA.whyNotFullSize.active ? "warn" : "good"}
                >
                  {operatorAction}
                </StatusPill>
              }
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
                <div className="rounded-lg border border-[#FDD000]/25 bg-[#FDD000]/10 px-5 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FDD000]">
                        Operator command
                      </div>
                      <div className="mt-2 text-3xl font-semibold tracking-tight text-white">
                        {operatorAction}
                      </div>
                    </div>
                    <StatusPill tone={operatorTone}>
                      {sizingModeMetricValue}
                    </StatusPill>
                  </div>
                  <p className="mt-4 max-w-4xl text-base leading-7 text-zinc-200">
                    {operatorSummary}
                  </p>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <MiniMetric
                      label="Assets"
                      value={actionableTickersLabel}
                      sub={showingBlockedReviewIdeas ? reviewIdeasMessage : undefined}
                      emphasis="quiet"
                    />
                    <MiniMetric
                      label="Portfolio cap"
                      value={canonicalPortfolioCap}
                      sub="canonical sizing output"
                      emphasis="quiet"
                    />
                    <MiniMetric
                      label="Starter size"
                      value={canonicalStarterSize}
                      sub="current capacity gate"
                      emphasis="quiet"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                        Primary unlock
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {topCanonicalRestriction?.label ?? "No active limiter"}
                      </div>
                    </div>
                    <StatusPill tone={unlockProgressTone}>
                      {survivalUnlockStatus}
                    </StatusPill>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    {restorationActionInstruction}
                  </p>
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
                      <span>Survival confidence</span>
                      <span>
                        {survivalConfidenceValue == null
                          ? "Pending"
                          : `${Math.round(survivalConfidenceValue)}/100`}
                      </span>
                    </div>
	                    <div className="h-2 rounded-full bg-zinc-800">
	                      <div
	                        className="h-2 rounded-full bg-[#FDD000]"
	                        style={{ width: `${restorationProgressPct}%` }}
	                      />
	                    </div>
                  </div>
                  <div className="mt-4 rounded-lg bg-black/25 px-3 py-2 text-xs leading-5 text-zinc-500 ring-1 ring-white/[0.05]">
                    Invalidate: {primaryInvalidationCondition}
                  </div>
	                </div>
	              </div>

	              <div className="mt-4 rounded-lg border border-white/10 bg-[#101010] px-4 py-4">
	                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
	                    <div className="min-w-0">
	                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FDD000]">
	                      Survival Memory Restoration Ledger
	                    </div>
	                    <div className="mt-2 text-lg font-semibold text-white">
	                      {restorationLedger?.exactUnlockCondition ??
	                        restorationProgressDiagnostic?.summary ??
	                        restorationPrimaryBlocker}
	                    </div>
	                  </div>
	                  <StatusPill tone={unlockProgressTone}>
	                    {restorationLedgerStateLabel}
	                  </StatusPill>
	                </div>
	                {restorationLedger?.boundarySummary ? (
	                  <p className="mt-3 text-sm leading-6 text-zinc-500">
	                    {restorationLedger.boundarySummary}
	                  </p>
	                ) : null}
	                <div className="mt-4">
	                  <QualityBar
	                    value={restorationProgressPct}
	                    label="Normal sizing restoration"
	                  />
	                </div>
	                <div className="mt-4 grid gap-3 md:grid-cols-4">
	                  <MiniMetric
	                    label="Clean proof"
	                    value={cleanReducedSizeOutcomeValue}
	                    sub={reducedSizeOutcomeSub}
	                    tone={
	                      restorationOutcomeProof &&
	                      restorationOutcomeProof.cleanReducedSizeOutcomeCount >=
	                        restorationOutcomeProof.requiredCleanOutcomes
	                        ? "good"
	                        : "warn"
	                    }
	                  />
	                  <MiniMetric
	                    label="Ledger state"
	                    value={restorationLedgerStateLabel}
	                    sub="scarred -> watch -> limited -> clear"
	                    tone={unlockProgressTone}
	                  />
	                  <MiniMetric
	                    label="Current cap"
	                    value={restorationCurrentCapValue}
	                    sub="reduced-size proof lane"
	                  />
	                  <MiniMetric
	                    label="Normal target"
	                    value={restorationNormalTargetValue}
	                    sub="restoration destination"
	                  />
	                </div>
	                <div className="mt-4 rounded-lg border border-[#FDD000]/20 bg-[#FDD000]/10 px-4 py-3">
	                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
	                    <div className="min-w-0">
	                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FDD000]">
	                        Restoration action plan
	                      </div>
	                      <div className="mt-2 text-base font-semibold text-white">
	                        {restorationActionInstruction}
	                      </div>
	                      <p className="mt-2 text-sm leading-6 text-zinc-300">
	                        {restorationExposureInstruction}
	                      </p>
	                    </div>
	                    <StatusPill tone={restorationActionPlanTone}>
	                      {restorationActionPlanStatus}
	                    </StatusPill>
	                  </div>
	                  <div className="mt-4 grid gap-3 md:grid-cols-3">
	                    <MiniMetric
	                      label="Remaining clean outcomes"
	                      value={
	                        restorationRemainingCleanOutcomes == null
	                          ? "Pending"
	                          : String(restorationRemainingCleanOutcomes)
	                      }
	                      sub="current reduced-size streak"
	                      emphasis="quiet"
	                    />
	                    <MiniMetric
	                      label="Active lane breaks"
	                      value={
	                        restorationActiveBoundaryBreaks == null
	                          ? "Pending"
	                          : String(restorationActiveBoundaryBreaks)
	                      }
	                      sub="resets proof if above zero"
	                      tone={
	                        restorationActiveBoundaryBreaks && restorationActiveBoundaryBreaks > 0
	                          ? "bad"
	                          : "good"
	                      }
	                      emphasis="quiet"
	                    />
	                    <MiniMetric
	                      label="Normal sizing"
	                      value={
	                        restorationProgressDiagnostic?.canRestoreSizing
	                          ? "Review"
	                          : "Locked"
	                      }
	                      sub="until proof lane clears"
	                      tone={
	                        restorationProgressDiagnostic?.canRestoreSizing
	                          ? "good"
	                          : "warn"
	                      }
	                      emphasis="quiet"
	                    />
	                  </div>
	                  {restorationActionPlan?.steps?.length ? (
	                    <div className="mt-4 grid gap-2 md:grid-cols-3">
	                      {restorationActionPlan.steps.map((step) => (
	                        <div
	                          key={step.id}
	                          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
	                        >
	                          <div className="flex items-start justify-between gap-3">
	                            <div className="min-w-0 text-sm font-medium text-zinc-100">
	                              {step.label}
	                            </div>
	                            <StatusPill
	                              tone={
	                                step.status === "done"
	                                  ? "good"
	                                  : step.status === "blocked"
	                                    ? "neutral"
	                                    : "warn"
	                              }
	                            >
	                              {step.status}
	                            </StatusPill>
	                          </div>
	                          <div className="mt-2 line-clamp-3 text-xs leading-5 text-zinc-400">
	                            {step.detail}
	                          </div>
	                        </div>
	                      ))}
	                    </div>
	                  ) : null}
	                </div>
	                {restorationLedger?.statePath?.length ? (
	                  <div className="mt-4 grid gap-2 md:grid-cols-4">
	                    {restorationLedger.statePath.map((step) => (
	                      <div
	                        key={step.state}
	                        className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
	                      >
	                        <div className="flex items-center justify-between gap-2">
	                          <div className="min-w-0 text-sm font-medium text-zinc-200">
	                            {step.label}
	                          </div>
	                          <StatusPill tone={step.passed ? "good" : "neutral"}>
	                            {step.passed ? "clear" : "open"}
	                          </StatusPill>
	                        </div>
	                        <div className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
	                          {step.detail}
	                        </div>
	                      </div>
	                    ))}
	                  </div>
	                ) : null}
	                <div className="mt-4 grid gap-3 md:grid-cols-1">
	                  <MiniMetric
	                    label="Next gate"
	                    value={actionableRestorationGate?.label ?? "Clear"}
	                    sub={restorationActionInstruction}
	                    tone={
	                      actionableRestorationGate
	                        ? "warn"
	                        : "good"
	                    }
	                  />
	                </div>
	                {restorationLedgerEntries.length ? (
	                  <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-black/20">
	                    <div className="grid grid-cols-[minmax(0,1fr)_80px_100px_110px] gap-3 border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
	                      <span>Reduced-size trade</span>
	                      <span>Clean</span>
	                      <span>MAE</span>
	                      <span>Cost</span>
	                    </div>
	                    {restorationLedgerEntries.map((entry) => (
	                      <div
	                        key={entry.id}
	                        className="grid grid-cols-[minmax(0,1fr)_80px_100px_110px] gap-3 border-b border-white/[0.06] px-3 py-2 text-xs last:border-b-0"
	                      >
	                        <div className="min-w-0">
	                          <div className="truncate font-medium text-zinc-200">
	                            {entry.asset ?? entry.id}
	                          </div>
	                          <div className="truncate text-zinc-600">
	                            {fmtPlainPct(entry.maxExposure)} cap · {fmtPlainPct(entry.realizedReturn)} result
	                          </div>
	                        </div>
	                        <StatusPill tone={entry.clean ? "good" : "bad"}>
	                          {entry.clean ? "yes" : "no"}
	                        </StatusPill>
	                        <div className="text-zinc-400">
	                          {Math.round(entry.maxAdverseExcursion)} / {entry.maxAdverseExcursionBoundary}
	                        </div>
	                        <div className="truncate text-zinc-400">
	                          {Math.round(entry.survivalCost)} / {entry.survivalCostBoundary}
	                        </div>
	                      </div>
	                    ))}
	                  </div>
	                ) : null}
	                {restorationGatePreview.length ? (
	                  <div className="mt-4 grid gap-2 md:grid-cols-2">
	                    {restorationGatePreview.map((gate) => (
	                      <div
	                        key={gate.id}
	                        className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
	                      >
	                        <div className="flex items-start justify-between gap-3">
	                          <div className="min-w-0 text-sm font-medium text-zinc-200">
	                            {gate.id === "trust-score"
	                              ? "Restoration trust"
	                              : gate.label}
	                          </div>
	                          <StatusPill tone={gate.passed ? "good" : "warn"}>
	                            {gate.passed ? "clear" : "open"}
	                          </StatusPill>
	                        </div>
	                        <div className="mt-2 text-xs leading-5 text-zinc-500">
	                          {gate.current} / target {gate.target}
	                        </div>
	                      </div>
	                    ))}
	                  </div>
	                ) : null}
	              </div>

	              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <MiniMetric
                  label="Per-asset cap"
                  value={canonicalPerAssetCap}
                  sub="top idea cap"
                  tone={capacityTone}
                />
                <MiniMetric
                  label="Trust"
                  value={fmtPlainPct(dashboardDecisionStates.trust.score, 0)}
                  sub={dashboardDecisionStates.trust.status.replace(/_/g, " ")}
                  tone={trustStateTone}
                />
                <MiniMetric
                  label="Permission"
                  value={dashboardDecisionStates.permission.level.replace(
                    /_/g,
                    " ",
                  )}
                  sub={
                    dashboardDecisionStates.permission.allowed
                      ? "Allowed inside governance"
                      : "Not allowed now"
                  }
                  tone={permissionTone}
                />
                <MiniMetric
                  label="Urgency"
                  value={dashboardDecisionStates.urgency.mode.replace(
                    /_/g,
                    " ",
                  )}
                  sub={`${Math.round(dashboardDecisionStates.urgency.score)}/100`}
                  tone={urgencyTone}
                />
              </div>
            </SectionShell>

            <AdvancedDisclosure
              title="Governance and learning audit"
              description="Decision authority, execution quality, discovery learning, and wisdom diagnostics are preserved here without competing with the live command."
              summary={
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Command"
                    value={governanceCommand.label}
                    sub={governanceCommand.action}
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Execution"
                    value={
                      executionQualityDiagnostic
                        ? `${Math.round(executionQualityDiagnostic.score)}/100`
                        : "Pending"
                    }
                    sub={
                      executionQualityDiagnostic?.recommendedExecutionMode?.replace(
                        /_/g,
                        " ",
                      ) ?? "mode pending"
                    }
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Learning"
                    value={fmtPlainPct(discoveryIntelligenceDiagnostic?.score, 0)}
                    sub="Discovery Intelligence"
                    emphasis="quiet"
                  />
                </div>
              }
            >
              <div className="grid gap-5">
            <SectionShell
              eyebrow="Governance Evolution"
              title="Decision authority and learning loop"
              action={
                <StatusPill tone={governanceCommand.tone}>
                  {governanceCommand.label}
                </StatusPill>
              }
            >
              <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                        Operator command
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight text-white">
                        {governanceCommand.label}
                      </div>
                    </div>
                    <StatusPill tone={governanceCommand.tone}>
                      {governanceCommand.action}
                    </StatusPill>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    {governanceCommand.reason}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MiniMetric
                      label="Authority"
                      value={governanceEvolution.arbitration.authority}
                      sub={`${governanceEvolution.arbitration.vetoes.length} vetoes`}
                      emphasis="quiet"
                    />
                    <MiniMetric
                      label="Exposure state"
                      value={activeExposureState?.label ?? "Observe"}
                      sub={`${governanceCommand.maxExposure} max`}
                      tone={governanceCommand.tone}
                      emphasis="quiet"
                    />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-zinc-500">
                    Next audit: {governanceCommand.nextAudit}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                        Arbitration
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {governanceEvolution.arbitration.reason}
                      </div>
                    </div>
                    <StatusPill
                      tone={
                        governanceEvolution.arbitration.conflicts.length
                          ? "warn"
                          : "good"
                      }
                    >
                      {governanceEvolution.arbitration.conflicts.length} conflicts
                    </StatusPill>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(governanceEvolution.arbitration.conflicts.length
                      ? governanceEvolution.arbitration.conflicts
                      : [{
                          id: "clear",
                          label: "No active contradiction",
                          severity: "good" as const,
                          detail: "Executive, Wisdom, Survival, and Trust do not currently disagree.",
                          resolution: "Continue normal governance monitoring.",
                        }]
                    ).slice(0, 4).map((conflict) => (
                      <div
                        key={conflict.id}
                        className="rounded-lg bg-black/25 px-3 py-2 ring-1 ring-white/[0.05]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs font-semibold text-zinc-200">
                            {conflict.label}
                          </div>
                          <StatusPill tone={conflict.severity}>
                            {conflict.severity}
                          </StatusPill>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                          {conflict.detail}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">
                          {conflict.resolution}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 xl:grid-cols-5">
                {governanceEvolution.exposureStates.map((state) => (
                  <div
                    key={state.state}
                    className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                          {state.label}
                        </div>
                        <div className="mt-2 text-xl font-semibold text-white">
                          {fmtPlainPct(state.capPct, state.capPct < 1 ? 2 : 0)}
                        </div>
                      </div>
                      <StatusPill
                        tone={
                          state.status === "active"
                            ? "warn"
                            : state.status === "available"
                              ? "good"
                              : "neutral"
                        }
                      >
                        {state.status}
                      </StatusPill>
                    </div>
                    <p className="mt-3 line-clamp-2 text-xs leading-5 text-zinc-500">
                      {state.entryRule}
                    </p>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-400">
                      Unlock: {state.unlockCondition}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Confidence ledger
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {governanceEvolution.confidenceLedger.map((item) => (
                      <div
                        key={item.kind}
                        className="rounded-lg bg-black/25 px-3 py-2 ring-1 ring-white/[0.05]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-semibold text-zinc-200">
                              {item.label}
                            </div>
                            <div className="mt-1 text-lg font-semibold text-white">
                              {fmtPlainPct(item.score, 0)}
                            </div>
                          </div>
                          <StatusPill
                            tone={
                              item.status === "trusted"
                                ? "good"
                                : item.status === "blocked"
                                  ? "bad"
                                  : "warn"
                            }
                          >
                            {item.status}
                          </StatusPill>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                          {item.question}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">
                          {item.interpretation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Restriction accountability
                  </div>
                  <div className="mt-3 space-y-2">
                    {(governanceEvolution.restrictionBets.length
                      ? governanceEvolution.restrictionBets
                      : [{
                          code: "reduced_size",
                          label: "No active restriction",
                          status: "pending",
                          avoidedLoss: null,
                          missedUpside: null,
                          falseBlockRate: null,
                          timeToRecovery: null,
                          interpretation: "Restriction economics are pending.",
                          nextAudit: "Keep monitoring governance economics.",
                        }]
                    ).slice(0, 4).map((bet) => (
                      <div
                        key={`${bet.code}-${bet.label}`}
                        className="rounded-lg bg-black/25 px-3 py-2 ring-1 ring-white/[0.05]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs font-semibold text-zinc-200">
                            {bet.label}
                          </div>
                          <StatusPill
                            tone={
                              bet.status === "helpful"
                                ? "good"
                                : bet.status === "harmful"
                                  ? "bad"
                                  : "warn"
                            }
                          >
                            {bet.status}
                          </StatusPill>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                          <div>Avoided {fmtPlainNumber(bet.avoidedLoss)}</div>
                          <div>Missed {fmtPlainNumber(bet.missedUpside)}</div>
                          <div>False blocks {fmtPlainPct(bet.falseBlockRate, 0)}</div>
                          <div>Recovery {fmtPlainNumber(bet.timeToRecovery)}</div>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-400">
                          {bet.interpretation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Discovery institutionalization
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {governanceEvolution.discoveryInstitutionalization.currentStage}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    {governanceEvolution.discoveryInstitutionalization.allowedInfluence}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(
                      governanceEvolution.discoveryInstitutionalization.stageCounts,
                    ).map(([stage, count]) => (
                      <span
                        key={stage}
                        className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-400"
                      >
                        {stage} {count}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-zinc-400">
                    Next: {governanceEvolution.discoveryInstitutionalization.nextStage}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Accountability loop
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {governanceEvolution.accountabilityLoop.map((step) => (
                      <div
                        key={step.id}
                        className="rounded-lg bg-black/25 px-3 py-2 ring-1 ring-white/[0.05]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs font-semibold text-zinc-200">
                            {step.label}
                          </div>
                          <StatusPill
                            tone={
                              step.status === "complete"
                                ? "good"
                                : step.status === "blocked"
                                  ? "bad"
                                  : step.status === "review"
                                    ? "warn"
                                    : "neutral"
                            }
                          >
                            {step.status}
                          </StatusPill>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                          {step.evidenceRequired}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">
                          {step.nextAction}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </SectionShell>

            <SectionShell
              eyebrow="Execution, Learning & Accountability"
              title="Action quality and feedback loops"
              action={
                <StatusPill tone={executionQualityTone}>
                  {executionQualityDiagnostic?.recommendedExecutionMode?.replace(
                    /_/g,
                    " ",
                  ) ?? "Pending"}
                </StatusPill>
              }
            >
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                        Execution Quality
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-white">
                        {executionQualityDiagnostic
                          ? `${Math.round(executionQualityDiagnostic.score)}/100`
                          : "Pending"}
                      </div>
                    </div>
                    <StatusPill tone={executionQualityTone}>
                      {executionQualityDiagnostic?.status ?? "pending"}
                    </StatusPill>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>Entry {fmtPlainPct(executionQualityDiagnostic?.entryQuality, 0)}</div>
                    <div>Exit {fmtPlainPct(executionQualityDiagnostic?.exitQuality, 0)}</div>
                    <div>Liquidity {fmtPlainPct(executionQualityDiagnostic?.liquidityQuality, 0)}</div>
                    <div>Slippage {fmtPlainPct(executionQualityDiagnostic?.slippageRisk, 0)}</div>
                    <div>Timing {fmtPlainPct(executionQualityDiagnostic?.timingUrgency, 0)}</div>
                    <div>Invalidation {fmtPlainPct(executionQualityDiagnostic?.invalidationClarity, 0)}</div>
                  </div>
                  <p className="mt-3 line-clamp-3 text-xs leading-5 text-zinc-500">
                    {executionQualityDiagnostic?.blockers?.[0] ??
                      executionQualityDiagnostic?.warnings?.[0] ??
                      executionQualityDiagnostic?.explanation ??
                      "Execution quality will appear when a selected signal carries execution diagnostics."}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                        Counterfactual
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-white">
                        {counterfactualDiagnostic
                          ? `${Math.round(counterfactualDiagnostic.restrictionValueScore)}/100`
                          : "Pending"}
                      </div>
                    </div>
                    <StatusPill tone={counterfactualTone}>
                      {counterfactualDiagnostic?.shouldAdjustSizingPolicy ||
                      counterfactualDiagnostic?.shouldAdjustDiscoveryPolicy ||
                      counterfactualDiagnostic?.shouldAdjustRestrictionPolicy
                        ? "adjust"
                        : "observe"}
                    </StatusPill>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>Avoided loss {fmtPlainPct(counterfactualDiagnostic?.avoidedLossScore, 0)}</div>
                    <div>Missed upside {fmtPlainPct(counterfactualDiagnostic?.missedUpsideScore, 0)}</div>
                    <div>Restriction value {fmtPlainPct(counterfactualDiagnostic?.restrictionValueScore, 0)}</div>
                    <div>Caution cost {fmtPlainPct(counterfactualDiagnostic?.cautionCostScore, 0)}</div>
                  </div>
                  <p className="mt-3 line-clamp-3 text-xs leading-5 text-zinc-500">
                    {counterfactualDiagnostic?.scenarios?.[0]?.summary ??
                      counterfactualDiagnostic?.explanation ??
                      "Counterfactual learning will compare acted, waited, normal-size, and ignored-restriction scenarios."}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                        Discovery Accountability
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-white">
                        {discoveryAccountabilityDiagnostic
                          ? `${Math.round(discoveryAccountabilityDiagnostic.accountabilityScore)}/100`
                          : "Pending"}
                      </div>
                    </div>
                    <StatusPill tone={discoveryAccountabilityTone}>
                      {discoveryAccountabilityDiagnostic?.status ?? "pending"}
                    </StatusPill>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>Maturity {fmtPlainPct(discoveryAccountabilityDiagnostic?.maturity, 0)}</div>
                    <div>False discoveries {fmtPlainPct(discoveryAccountabilityDiagnostic?.falseDiscoveryRate, 0)}</div>
                    <div>Missed opportunities {fmtPlainPct(discoveryAccountabilityDiagnostic?.missedOpportunityRate, 0)}</div>
                    <div>Novelty conversion {fmtPlainPct(discoveryAccountabilityDiagnostic?.noveltyToProfitConversion, 0)}</div>
                  </div>
                  <p className="mt-3 line-clamp-3 text-xs leading-5 text-zinc-500">
                    {discoveryAccountabilityDiagnostic?.blockers?.[0] ??
                      discoveryAccountabilityDiagnostic?.explanation ??
                      "Discovery accountability will mature as accepted, rejected, and missed opportunities collect outcomes."}
                  </p>
                </div>
              </div>
            </SectionShell>

            <SectionShell
              eyebrow="Discovery Intelligence"
              title="Learning value and institutional trust"
              action={
                <StatusPill
                  tone={
                    numeric(discoveryIntelligenceDiagnostic?.score) >= 70
                      ? "good"
                      : numeric(discoveryIntelligenceDiagnostic?.score) >= 45
                        ? "warn"
                        : "neutral"
                  }
                >
                  {discoveryIntelligenceDiagnostic
                    ? `${Math.round(discoveryIntelligenceDiagnostic.score)}/100`
                    : "Pending"}
                </StatusPill>
              }
            >
              <div className="grid gap-3 xl:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Discovery Intelligence
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {fmtPlainPct(discoveryIntelligenceDiagnostic?.score, 0)}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>Maturity {fmtPlainPct(discoveryIntelligenceDiagnostic?.maturity.maturityScore, 0)}</div>
                    <div>Economics {fmtPlainPct(discoveryIntelligenceDiagnostic?.economics.economicsScore, 0)}</div>
                    <div>Governance {fmtPlainPct(discoveryIntelligenceDiagnostic?.governance.score, 0)}</div>
                    <div>Learning {fmtPlainPct(discoveryIntelligenceDiagnostic?.metaLearning.score, 0)}</div>
                  </div>
                  <p className="mt-3 line-clamp-3 text-xs leading-5 text-zinc-500">
                    {discoveryIntelligenceDiagnostic?.recommendations?.[0]?.message ??
                      "Discovery Intelligence is waiting for lifecycle, outcome, restriction, and trace records."}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Discovery Maturity
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>Emerging {discoveryIntelligenceDiagnostic?.maturity.emerging ?? 0}</div>
                    <div>Detected {discoveryIntelligenceDiagnostic?.maturity.detected ?? 0}</div>
                    <div>Observed {discoveryIntelligenceDiagnostic?.maturity.observed ?? 0}</div>
                    <div>Confirmed {discoveryIntelligenceDiagnostic?.maturity.confirmed ?? 0}</div>
                    <div>Repeatable {discoveryIntelligenceDiagnostic?.maturity.repeatable ?? 0}</div>
                    <div>Trusted {discoveryIntelligenceDiagnostic?.maturity.trusted ?? 0}</div>
                    <div>Institutional {discoveryIntelligenceDiagnostic?.maturity.institutional ?? 0}</div>
                    <div>False {fmtPlainPct(discoveryIntelligenceDiagnostic?.maturity.falseDiscoveryRate, 0)}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Opportunity Economics
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>Act {fmtPlainNumber(discoveryIntelligenceDiagnostic?.economics.actValue)}</div>
                    <div>Wait {fmtPlainNumber(discoveryIntelligenceDiagnostic?.economics.waitValue)}</div>
                    <div>Reject {fmtPlainNumber(discoveryIntelligenceDiagnostic?.economics.rejectValue)}</div>
                    <div>Restrict {fmtPlainNumber(discoveryIntelligenceDiagnostic?.economics.restrictValue)}</div>
                    <div>Avoided Loss {fmtPlainNumber(discoveryIntelligenceDiagnostic?.economics.avoidedLoss)}</div>
                    <div>Missed Upside {fmtPlainNumber(discoveryIntelligenceDiagnostic?.economics.missedUpside)}</div>
                  </div>
                  <div className="mt-3 text-sm font-semibold text-white">
                    Cost {fmtPlainNumber(discoveryIntelligenceDiagnostic?.economics.opportunityCost)}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Governance Effectiveness
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>Helpful Restrictions {discoveryIntelligenceDiagnostic?.governance.helpfulRestrictions ?? 0}</div>
                    <div>Harmful Restrictions {discoveryIntelligenceDiagnostic?.governance.harmfulRestrictions ?? 0}</div>
                    <div>Score {fmtPlainPct(discoveryIntelligenceDiagnostic?.governance.score, 0)}</div>
                    <div>Audits {discoveryIntelligenceDiagnostic?.governance.restrictions.length ?? 0}</div>
                  </div>
                  <p className="mt-3 line-clamp-3 text-xs leading-5 text-zinc-500">
                    {discoveryIntelligenceDiagnostic?.governance.restrictions[0]?.recommendation ??
                      "Restriction audits are pending."}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 xl:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Institutional Knowledge
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>Knowledge {discoveryIntelligenceDiagnostic?.institutionalization.knowledgeCount ?? 0}</div>
                    <div>Policies {discoveryIntelligenceDiagnostic?.institutionalization.policyCount ?? 0}</div>
                    <div>Standards {discoveryIntelligenceDiagnostic?.institutionalization.standardCount ?? 0}</div>
                    <div>Institutional Assets {discoveryIntelligenceDiagnostic?.institutionalization.institutionalCount ?? 0}</div>
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {fmtPlainPct(discoveryIntelligenceDiagnostic?.institutionalization.institutionalizationScore, 0)}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Meta-Learning
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>Calibration Trend {fmtPlainNumber(discoveryIntelligenceDiagnostic?.metaLearning.calibrationTrend)}</div>
                    <div>Trust Trend {fmtPlainNumber(discoveryIntelligenceDiagnostic?.metaLearning.trustTrend)}</div>
                    <div>Survival Trend {fmtPlainNumber(discoveryIntelligenceDiagnostic?.metaLearning.survivalTrend)}</div>
                    <div>Decision Quality Trend {fmtPlainNumber(discoveryIntelligenceDiagnostic?.metaLearning.decisionQualityTrend)}</div>
                    <div>Governance Trend {fmtPlainNumber(discoveryIntelligenceDiagnostic?.metaLearning.governanceTrend)}</div>
                    <div>Score {fmtPlainPct(discoveryIntelligenceDiagnostic?.metaLearning.score, 0)}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Recommendations
                  </div>
                  <div className="mt-3 space-y-2">
                    {(discoveryIntelligenceDiagnostic?.recommendations?.length
                      ? discoveryIntelligenceDiagnostic.recommendations
                      : [{ id: "pending", priority: "low", message: "No Discovery Intelligence recommendation is available yet." }]
                    ).slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        className="rounded-md bg-black/25 px-3 py-2 text-xs leading-5 text-zinc-400 ring-1 ring-white/[0.05]"
                      >
                        <span className="font-semibold text-zinc-300">
                          {item.priority}
                        </span>{" "}
                        {item.message}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </SectionShell>

            <SectionShell
              eyebrow="Wisdom"
              title="Decision quality and capital learning"
              action={
                <StatusPill tone={wisdomTone}>
                  {wisdomDiagnostic
                    ? `${Math.round(wisdomDiagnostic.wisdomScore)}/100`
                    : "Pending"}
                </StatusPill>
              }
            >
              <div className="grid gap-3 xl:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                        Wisdom Summary
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-white">
                        {fmtPlainPct(wisdomDiagnostic?.decisionQuality, 0)}
                      </div>
                    </div>
                    <StatusPill tone={wisdomTone}>
                      {fmtPlainPct(wisdomDiagnostic?.learningConfidence, 0)}
                    </StatusPill>
                  </div>
                  <p className="mt-3 line-clamp-4 text-xs leading-5 text-zinc-500">
                    {wisdomDiagnostic?.explanation ??
                      "Wisdom will appear after decisions include alternatives and outcome memory."}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Counterfactual Review
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>Actual {fmtPlainPct(wisdomDiagnostic?.counterfactuals?.actualOutcome?.utility, 0)}</div>
                    <div>Best {fmtPlainPct(wisdomDiagnostic?.counterfactuals?.bestAlternative?.utility, 0)}</div>
                    <div>Worst {fmtPlainPct(wisdomDiagnostic?.counterfactuals?.worstAlternative?.utility, 0)}</div>
                    <div>Quality {fmtPlainPct(wisdomDiagnostic?.counterfactuals?.decisionQuality, 0)}</div>
                    <div>Avoided {fmtPlainPct(wisdomDiagnostic?.counterfactuals?.avoidedLoss, 0)}</div>
                    <div>Missed {fmtPlainPct(wisdomDiagnostic?.counterfactuals?.missedUpside, 0)}</div>
                  </div>
                  <p className="mt-3 line-clamp-3 text-xs leading-5 text-zinc-500">
                    {wisdomDiagnostic?.counterfactuals?.explanation ??
                      "Actual, best alternative, worst alternative, and restriction value are pending."}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Opportunity Economics
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>Act {fmtPlainPct(wisdomDiagnostic?.opportunityEconomics?.actionValue, 0)}</div>
                    <div>Wait {fmtPlainPct(wisdomDiagnostic?.opportunityEconomics?.waitValue, 0)}</div>
                    <div>Reject {fmtPlainPct(wisdomDiagnostic?.opportunityEconomics?.rejectValue, 0)}</div>
                    <div>Scale {fmtPlainPct(wisdomDiagnostic?.opportunityEconomics?.scaleValue, 0)}</div>
                    <div>Urgency {fmtPlainPct(wisdomDiagnostic?.opportunityEconomics?.urgencyCost, 0)}</div>
                    <div>Cost {fmtPlainPct(wisdomDiagnostic?.opportunityEconomics?.opportunityCost, 0)}</div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-zinc-500">
                    Best option:{" "}
                    <span className="font-semibold text-zinc-300">
                      {wisdomDiagnostic?.opportunityEconomics?.bestOption ?? "Pending"}
                    </span>
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Discovery Maturity
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(wisdomDiagnostic?.discoveryMaturity?.lifecycle?.length
                      ? wisdomDiagnostic.discoveryMaturity.lifecycle
                      : [
                          { stage: "Detected", count: 0 },
                          { stage: "Observed", count: 0 },
                          { stage: "Confirmed", count: 0 },
                          { stage: "Repeatable", count: 0 },
                          { stage: "Trusted", count: 0 },
                          { stage: "Institutional", count: 0 },
                        ]
                    ).map((item) => (
                      <span
                        key={item.stage}
                        className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-400"
                      >
                        {item.stage} {item.count}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>Maturity {fmtPlainPct(wisdomDiagnostic?.discoveryMaturity?.maturityScore, 0)}</div>
                    <div>Recurrence {fmtPlainPct(wisdomDiagnostic?.discoveryMaturity?.recurrenceRate, 0)}</div>
                    <div>Novelty {fmtPlainPct(wisdomDiagnostic?.discoveryMaturity?.noveltyPersistence, 0)}</div>
                    <div>Conversion {fmtPlainPct(wisdomDiagnostic?.discoveryMaturity?.conversionRate, 0)}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Agency Effectiveness
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>Accuracy {fmtPlainPct(wisdomDiagnostic?.agencyEffectiveness?.agencyAccuracy, 0)}</div>
                    <div>Intervention {fmtPlainPct(wisdomDiagnostic?.agencyEffectiveness?.interventionValue, 0)}</div>
                    <div>Approval {fmtPlainPct(wisdomDiagnostic?.agencyEffectiveness?.approvalQuality, 0)}</div>
                    <div>Rejection {fmtPlainPct(wisdomDiagnostic?.agencyEffectiveness?.rejectionQuality, 0)}</div>
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {fmtPlainPct(wisdomDiagnostic?.agencyEffectiveness?.governanceEffectiveness, 0)}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Portfolio Intelligence
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div>Concentration {fmtPlainPct(wisdomDiagnostic?.portfolioIntelligence?.concentrationRisk, 0)}</div>
                    <div>Diversification {fmtPlainPct(wisdomDiagnostic?.portfolioIntelligence?.diversificationQuality, 0)}</div>
                    <div>Capital {fmtPlainPct(wisdomDiagnostic?.portfolioIntelligence?.capitalEfficiency, 0)}</div>
                    <div>Coverage {fmtPlainPct(wisdomDiagnostic?.portfolioIntelligence?.opportunityCoverage, 0)}</div>
                    <div>Convexity {fmtPlainPct(wisdomDiagnostic?.portfolioIntelligence?.portfolioConvexity, 0)}</div>
                    <div>Allocation {fmtPlainPct(wisdomDiagnostic?.portfolioIntelligence?.allocationQuality, 0)}</div>
                  </div>
                </div>
              </div>
            </SectionShell>
              </div>
            </AdvancedDisclosure>

            <SectionShell
              eyebrow="Evidence Summary"
              title="Strongest justification"
              action={
                <StatusPill tone="neutral">
                  {executiveIA.evidenceSummary.length} checks
                </StatusPill>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {executiveIA.evidenceSummary.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                          {item.label}
                        </div>
                        <div className="mt-2 text-xl font-semibold tracking-tight text-white">
                          {item.value}
                        </div>
                      </div>
                      <StatusPill tone={item.tone}>{item.tone}</StatusPill>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
              <AdvancedDisclosure
                title="All evidence checks"
                description="Full audit list for reliability, robustness, calibration, readiness, and validation."
                summary={
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MiniMetric
                      label="Visible first"
                      value="4"
                      sub="decision-critical checks"
                      emphasis="quiet"
                    />
                    <MiniMetric
                      label="Total checks"
                      value={String(executiveIA.evidenceSummary.length)}
                      sub="available in audit"
                      emphasis="quiet"
                    />
                    <MiniMetric
                      label="Primary limiter"
                      value={topCanonicalRestriction?.label ?? "None"}
                      emphasis="quiet"
                    />
                  </div>
                }
                className="mt-5"
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {executiveIA.evidenceSummary.map((item) => (
                    <div
                      key={`all-${item.id}`}
                      className="rounded-lg bg-black/25 px-4 py-3 ring-1 ring-white/[0.055]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                            {item.label}
                          </div>
                          <div className="mt-2 text-xl font-semibold tracking-tight text-white">
                            {item.value}
                          </div>
                        </div>
                        <StatusPill tone={item.tone}>{item.tone}</StatusPill>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </AdvancedDisclosure>
            </SectionShell>

            <AdvancedDisclosure
              title="Decision pipeline"
              description="Discovery through Resolve remains available without competing with the executive posture."
              summary={
                <MiniMetric
                  label="Pipeline outcome"
                  value={executiveIA.executiveReasoning.finalDecision}
                  sub={`${executiveIA.decisionPipeline.length} stages`}
                  emphasis="quiet"
                />
              }
            >
              <SectionShell
                eyebrow="Decision Pipeline"
                title="Discovery to Output"
                action={
                  <StatusPill tone="neutral">
                    {executiveIA.decisionPipeline.length} stages
                  </StatusPill>
                }
              >
                <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
                  {executiveIA.decisionPipeline.map((step, index) => (
                    <div
                      key={step.stage}
                      className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                          {index + 1}
                        </div>
                        <StatusPill
                          tone={
                            step.outcome === "passed"
                              ? "good"
                              : step.outcome === "blocked" ||
                                  step.outcome === "escalated"
                                ? "bad"
                                : "warn"
                          }
                        >
                          {step.outcome}
                        </StatusPill>
                      </div>
                      <div className="text-sm font-semibold text-white">
                        {step.stage}
                      </div>
                      <div className="mt-1 text-xs text-[#FDD000]">
                        {step.status} · {step.confidenceLabel}
                      </div>
                      <p className="mt-3 line-clamp-3 text-xs leading-5 text-zinc-500">
                        {step.reason}
                      </p>
                      <div className="mt-3 border-t border-white/10 pt-3 text-[11px] leading-5 text-zinc-500">
                        Next: {step.nextRequiredImprovement}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionShell>
            </AdvancedDisclosure>

            <section className="grid min-w-0 items-start gap-5 xl:grid-cols-2">
              <SectionShell
                eyebrow="Restrictions"
                title="Why not full size?"
                action={
                  <StatusPill
                    tone={executiveIA.whyNotFullSize.active ? "warn" : "good"}
                  >
                    {executiveIA.whyNotFullSize.mode}
                  </StatusPill>
              }
            >
                <div className="space-y-3">
                  {restrictionImpactRows.map((factor) => (
                    <div
                      key={`${factor.code}-${factor.priority}`}
                      className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#FDD000]/30 bg-[#FDD000]/10 text-xs font-semibold text-[#FDD000]">
                          {factor.priority}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {factor.label}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-zinc-500">
                            {factor.explanation}
                          </p>
                          <div className="mt-3">
                            <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
                              <span>Sizing impact</span>
                              <span>{factor.impactPct}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-zinc-800">
                              <div
                                className="h-1.5 rounded-full bg-[#FDD000]"
                                style={{
                                  width: `${clamp(factor.impactPct)}%`,
                                }}
                              />
                            </div>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-400">
                            Unlock: {factor.unlockCondition}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {hiddenRestrictionCount ? (
                    <div className="rounded-lg border border-white/10 bg-white/[0.025] px-4 py-3 text-xs text-zinc-500">
                      {hiddenRestrictionCount} lower-impact restrictions are in
                      the raw audit.
                    </div>
                  ) : null}
                </div>
              </SectionShell>

              <SectionShell
                eyebrow="Decision Change"
                title="What would change the decision?"
                action={<StatusPill tone="neutral">Unlocks</StatusPill>}
              >
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Increase exposure
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                      {increaseExposureTriggers.map((item, index) => (
                        <div key={`${item}-${index}`}>{item}</div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Reduce or invalidate
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                      {reduceOrInvalidateTriggers.map((item, index) => (
                        <div key={`${item}-${index}`}>{item}</div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Restoration path
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                      {restorationPathTriggers.map((item, index) => (
                        <div key={`${item}-${index}`}>{item}</div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.025] px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Accountability next
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {(accountabilityHighlights.length
                      ? accountabilityHighlights
                      : governanceEvolution.accountabilityLoop.slice(0, 3)
                    ).map((step) => (
                      <div
                        key={`decision-next-${step.id}`}
                        className="rounded-md bg-black/25 px-3 py-2 ring-1 ring-white/[0.05]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-zinc-200">
                            {step.label}
                          </span>
                          <StatusPill
                            tone={
                              step.status === "complete"
                                ? "good"
                                : step.status === "blocked"
                                  ? "bad"
                                  : step.status === "review"
                                    ? "warn"
                                    : "neutral"
                            }
                          >
                            {step.status}
                          </StatusPill>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                          {step.nextAction}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionShell>
            </section>

            <AdvancedDisclosure
              title="Terminology hierarchy"
              description="Metric groups and source mapping for audit review."
              summary={
                <MiniMetric
                  label="Concept groups"
                  value={String(executiveIA.terminologyGroups.length)}
                  sub="Includes Discovery Intelligence"
                  emphasis="quiet"
                />
              }
            >
              <SectionShell
                eyebrow="Terminology hierarchy"
                title="Metric groups"
                action={
                  <StatusPill tone="neutral">
                    {executiveIA.terminologyGroups.length} concepts
                  </StatusPill>
                }
              >
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {executiveIA.terminologyGroups.map((group) => (
                    <div
                      key={group.concept}
                      className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                    >
                      <div className="text-sm font-semibold text-white">
                        {group.concept}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
                        {group.description}
                      </p>
                      <div className="mt-3 space-y-2">
                        {group.metrics.slice(0, 4).map((metric) => (
                          <div
                            key={`${group.concept}-${metric.label}`}
                            className="border-t border-white/10 pt-2 text-xs leading-5"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-zinc-500">
                                {metric.label}
                              </span>
                              <span className="font-semibold text-slate-100">
                                {metric.value}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-600">
                              {metric.source}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionShell>
            </AdvancedDisclosure>
          </section>
        </DashboardGroup>

        <DashboardGroup
          eyebrow="Market layer"
          title="Market Health"
          description="The premium visual anchor shows how live metrics combine into market state, agreement, dominant pressure, and data reliability."
        >
          <MarketPerceptionEngine
            snapshot={marketPerceptionSnapshot}
            agencyLevel={agencyLevel}
            visualContext={{
              historyDiagnostics,
              recognition: recognitionDiagnostic,
              opportunityDiscovery,
              operatorState: dashboardSizing.operatorState,
              robustness: {
                robustnessScore,
                overfitRisk: robustnessOverfitRisk,
                deploymentReadiness: deploymentReadinessScore,
                generalizationConfidence:
                  backtestSummary?.generalizationConfidence ??
                  robustnessDiagnostics?.generalizationConfidence,
                safetyGate: robustnessDiagnostics?.safetyGate,
              },
            }}
            className="mb-0"
          />
        </DashboardGroup>

        <DashboardGroup
          eyebrow="Diagnostics layer"
          title="Signal Diagnostics"
          description="Advanced engine detail is available on demand, while the main dashboard stays focused on the decision."
        >
          <AdvancedDisclosure
            title="Signal diagnostics and internal engine traces"
            description="Open this when you need Discovery, Recognition, Belief, Judgement, Agency, Resolve, lifecycle, and trace-level contributors."
            summary={
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniMetric
                  label="Pipeline"
                  value={executiveIA.executiveReasoning.finalDecision}
                  sub={
                    executiveIA.executiveReasoning.recommendedParticipationMode
                  }
                  emphasis="quiet"
                />
                <MiniMetric
                  label="Discovery"
                  value={
                    genericDiscovery?.status?.replace(/_/g, " ") ?? "Pending"
                  }
                  sub={
                    genericDiscovery
                      ? fmtPlainPct(numeric(genericDiscovery.confidence), 0)
                      : undefined
                  }
                  emphasis="quiet"
                />
                <MiniMetric
                  label="Resolve"
                  value={
                    resolveDiagnostic?.decision?.replace(/_/g, " ") ?? "Pending"
                  }
                  sub={
                    resolveDiagnostic
                      ? `${Math.round(numeric(resolveDiagnostic.resolveScore))}/100`
                      : undefined
                  }
                  emphasis="quiet"
                />
              </div>
            }
          >
            <section className="grid min-w-0 items-start gap-5 xl:grid-cols-2">
              <SectionShell
                eyebrow="Opportunity diagnostics"
                title="Opportunity density diagnostics"
                action={
                  <StatusPill
                    tone={
                      adaptiveOpportunityDensityPct > 45
                        ? "good"
                        : adaptiveOpportunityDensityPct > 20
                          ? "warn"
                          : "neutral"
                    }
                  >
                    {fmtPlainPct(adaptiveOpportunityDensityPct, 0)}
                  </StatusPill>
                }
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Future density"
                    value={fmtPlainPct(adaptiveOpportunityDensityPct, 0)}
                    sub={String(discoveryDensityDiagnostics?.trend ?? "flat")}
                  />
                  <MiniMetric
                    label="Candidate quality"
                    value={fmtPlainPct(
                      finiteNumber(discoveryDensityDiagnostics?.quality) ??
                        numeric(discoveryPipelineDiagnostics.averageScore),
                      0,
                    )}
                    sub={`${numeric(discoveryPipelineDiagnostics.candidateCount)} candidates`}
                  />
                  <MiniMetric
                    label="Conviction"
                    value={fmtPlainPct(
                      finiteNumber(discoveryDensityDiagnostics?.confidence) ??
                        confidence ??
                        0,
                      0,
                    )}
                    sub={`${numeric(discoveryPipelineDiagnostics.improvingCount)} improving`}
                  />
                </div>
                <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-zinc-400">
                  {discoveryDensityDiagnostics?.explanation ??
                    "Candidate density is being inferred from current signal progression."}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-5">
                  <MiniMetric
                    label="Discovery confidence"
                    value={
                      genericDiscovery
                        ? fmtPlainPct(numeric(genericDiscovery.confidence), 0)
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Maturity"
                    value={
                      genericDiscovery
                        ? fmtPlainPct(numeric(genericDiscovery.maturity), 0)
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Novelty"
                    value={
                      genericDiscovery
                        ? fmtPlainPct(numeric(genericDiscovery.novelty), 0)
                        : "—"
                    }
                    sub={
                      recognitionClearsDiscoveryNovelty
                        ? "Recognition rejected"
                        : undefined
                    }
                  />
                  <MiniMetric
                    label="Fragility"
                    value={
                      genericDiscovery
                        ? fmtPlainPct(numeric(genericDiscovery.fragility), 0)
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Next step"
                    value={
                      genericDiscovery?.status?.replace(/_/g, " ") ?? "Pending"
                    }
                    sub={genericDiscovery?.recommendedNextStep}
                  />
                </div>
              </SectionShell>

              <SectionShell
                eyebrow="Recognition"
                title="Recognition diagnostics"
                action={
                  <StatusPill tone={recognitionTone(recognitionDiagnostic)}>
                    {recognitionDiagnostic?.verdict?.replace(/_/g, " ") ??
                      "Pending"}
                  </StatusPill>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                  <MiniMetric
                    label="Recognition score"
                    value={
                      recognitionDiagnostic
                        ? fmtPlainPct(
                            numeric(recognitionDiagnostic.recognitionScore),
                            0,
                          )
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Recurrence"
                    value={
                      recognitionDiagnostic
                        ? fmtPlainPct(
                            numeric(recognitionDiagnostic.recurrenceConfidence),
                            0,
                          )
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Historical similarity"
                    value={
                      recognitionDiagnostic
                        ? fmtPlainPct(
                            numeric(
                              recognitionDiagnostic.historicalSimilarityConfidence,
                            ),
                            0,
                          )
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Novelty"
                    value={
                      recognitionDiagnostic
                        ? fmtPlainPct(
                            numeric(recognitionDiagnostic.noveltyScore),
                            0,
                          )
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Archetype"
                    value={
                      recognitionDiagnostic?.archetype?.replace(/_/g, " ") ??
                      "—"
                    }
                    sub={
                      recognitionDiagnostic
                        ? fmtPlainPct(
                            numeric(recognitionDiagnostic.archetypeConfidence),
                            0,
                          )
                        : undefined
                    }
                  />
                  <MiniMetric
                    label="Matched samples"
                    value={
                      recognitionDiagnostic
                        ? String(numeric(recognitionDiagnostic.matchedSamples))
                        : "—"
                    }
                    sub={
                      recognitionDiagnostic
                        ? `${numeric(recognitionDiagnostic.matchedPositiveOutcomes)} / ${numeric(recognitionDiagnostic.matchedNegativeOutcomes)} outcomes`
                        : undefined
                    }
                  />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Outcome stability"
                    value={
                      recognitionDiagnostic
                        ? fmtPlainPct(
                            numeric(recognitionDiagnostic.outcomeStability),
                            0,
                          )
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Discovery novelty"
                    value={
                      recognitionDiagnostic
                        ? recognitionDiagnostic.discoveryNoveltyJustified
                          ? "Justified"
                          : "Rejected"
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Judgement similarity"
                    value={
                      recognitionDiagnostic
                        ? recognitionDiagnostic.judgementSimilarityJustified
                          ? "Justified"
                          : "Rejected"
                        : "—"
                    }
                  />
                </div>
                <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-zinc-400">
                  {recognitionDiagnostic?.reason ??
                    "Recognition diagnostics will appear after comparable states are evaluated."}
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Missing evidence
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                      {recognitionMissingEvidence
                        .slice(0, 4)
                        .map((item: string, index: number) => (
                          <div key={`${item}-${index}`}>{item}</div>
                        ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Invalidation conditions
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                      {recognitionInvalidationConditions
                        .slice(0, 4)
                        .map((item: string, index: number) => (
                          <div key={`${item}-${index}`}>{item}</div>
                        ))}
                    </div>
                  </div>
                </div>
              </SectionShell>

              <SectionShell
                eyebrow="Need detection"
                title="Need detection diagnostics"
                action={
                  <StatusPill
                    tone={needDiagnostics.length ? "warn" : "neutral"}
                  >
                    {needDiagnostics.length || "Stable"}
                  </StatusPill>
                }
              >
                <div className="space-y-3">
                  {(needDiagnostics.length
                    ? needDiagnostics
                    : [
                        {
                          needId: "maintain",
                          category: "maintain",
                          severity: 0,
                          confidence: confidence ?? 0,
                          explanation:
                            "No active need is blocking the current objective.",
                          recommendations: [],
                        },
                      ]
                  )
                    .slice(0, 4)
                    .map((need: any) => (
                      <div
                        key={need.needId}
                        className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {String(need.category).replace(/-/g, " ")}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-zinc-500">
                              {need.explanation}
                            </div>
                          </div>
                          <StatusPill
                            tone={
                              numeric(need.severity) > 70
                                ? "bad"
                                : numeric(need.severity) > 35
                                  ? "warn"
                                  : "neutral"
                            }
                          >
                            {fmtPlainPct(numeric(need.severity), 0)}
                          </StatusPill>
                        </div>
                      </div>
                    ))}
                </div>
              </SectionShell>

              <SectionShell
                eyebrow="Belief"
                title="Belief diagnostics"
                action={
                  <StatusPill tone={beliefTone(beliefDiagnostic)}>
                    {beliefDiagnostic?.verdict ?? "Pending"}
                  </StatusPill>
                }
              >
                <div className="grid gap-3 sm:grid-cols-5">
                  <MiniMetric
                    label="Verdict"
                    value={beliefDiagnostic?.verdict ?? "—"}
                  />
                  <MiniMetric
                    label="Confidence"
                    value={
                      beliefDiagnostic
                        ? fmtPlainPct(beliefDiagnostic.confidence, 0)
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Trustworthiness"
                    value={
                      beliefDiagnostic
                        ? fmtPlainPct(beliefDiagnostic.trustworthiness, 0)
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Evidence strength"
                    value={
                      beliefDiagnostic
                        ? fmtPlainPct(beliefDiagnostic.evidenceStrength, 0)
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Fragility"
                    value={
                      beliefDiagnostic
                        ? fmtPlainPct(beliefDiagnostic.fragility, 0)
                        : "—"
                    }
                  />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <MiniMetric
                    label="Evidence agreement"
                    value={
                      beliefDiagnostic
                        ? fmtPlainPct(beliefDiagnostic.evidenceAgreement, 0)
                        : "—"
                    }
                  />
                  <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      Reason
                    </div>
                    <div className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-300">
                      {beliefDiagnostic?.reason ??
                        "Belief evidence will appear after strategy candidates are evaluated."}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      Top supporting evidence
                    </div>
                    <div className="mt-2 space-y-2">
                      {(beliefSupportEvidence.length
                        ? beliefSupportEvidence
                        : [
                            {
                              name: "Pending",
                              weightedStrength: 0,
                              reason: "No supporting evidence is selected yet.",
                            },
                          ]
                      ).map((item: any) => (
                        <div
                          key={`${item.name}-${item.weightedStrength}`}
                          className="text-xs leading-5 text-zinc-400"
                        >
                          <span className="font-semibold text-slate-200">
                            {item.name}
                          </span>
                          {item.weightedStrength ? (
                            <span className="text-zinc-500">
                              {" "}
                              · {fmtPlainPct(item.weightedStrength, 0)}
                            </span>
                          ) : null}
                          <div className="text-zinc-500">{item.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      Top contradictory evidence
                    </div>
                    <div className="mt-2 space-y-2">
                      {(beliefContradictoryEvidence.length
                        ? beliefContradictoryEvidence
                        : [
                            {
                              name: "Pending",
                              weightedStrength: 0,
                              reason:
                                "No contradictory evidence is selected yet.",
                            },
                          ]
                      ).map((item: any) => (
                        <div
                          key={`${item.name}-${item.weightedStrength}`}
                          className="text-xs leading-5 text-zinc-400"
                        >
                          <span className="font-semibold text-slate-200">
                            {item.name}
                          </span>
                          {item.weightedStrength ? (
                            <span className="text-zinc-500">
                              {" "}
                              · {fmtPlainPct(item.weightedStrength, 0)}
                            </span>
                          ) : null}
                          <div className="text-zinc-500">{item.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SectionShell>

              <SectionShell
                eyebrow="Discovery pipeline"
                title="Discovery pipeline diagnostics"
                action={
                  <StatusPill tone="neutral">
                    {numeric(discoveryPipelineDiagnostics.candidateCount)}{" "}
                    candidates
                  </StatusPill>
                }
              >
                <div className="grid gap-3 sm:grid-cols-4">
                  <MiniMetric
                    label="Eligible"
                    value={String(
                      numeric(discoveryPipelineDiagnostics.eligibleCount),
                    )}
                  />
                  <MiniMetric
                    label="Improving"
                    value={String(
                      numeric(discoveryPipelineDiagnostics.improvingCount),
                    )}
                  />
                  <MiniMetric
                    label="Avg score"
                    value={fmtPlainPct(
                      numeric(discoveryPipelineDiagnostics.averageScore),
                      0,
                    )}
                  />
                  <MiniMetric
                    label="Velocity"
                    value={numeric(
                      discoveryPipelineDiagnostics.averageVelocity,
                    ).toFixed(1)}
                  />
                </div>
                <div className="mt-4 space-y-2">
                  {discoveryFindings.slice(0, 3).map((finding: any) => (
                    <div
                      key={finding.findingId}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-5 text-zinc-400"
                    >
                      <span className="font-semibold text-slate-200">
                        {finding.pattern}
                      </span>
                      <span className="text-zinc-500">
                        {" "}
                        - support {fmtPlainPct(numeric(finding.support), 0)}
                      </span>
                    </div>
                  ))}
                  {!discoveryFindings.length ? (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-zinc-500">
                      Explorer findings will appear after recurring outcomes are
                      observed.
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Discovery support
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                      {(discoverySupportEvidence.length
                        ? discoverySupportEvidence
                        : [
                            {
                              label: "Pending",
                              contribution: 0,
                              reason: "Supporting evidence is pending.",
                            },
                          ]
                      )
                        .slice(0, 4)
                        .map((item: any, index: number) => (
                          <div key={`${item.label}-${index}`}>
                            <span className="font-semibold text-slate-200">
                              {item.label}
                            </span>
                            {item.contribution != null ? (
                              <span className="text-zinc-500">
                                {" "}
                                · {fmtPlainPct(numeric(item.contribution), 0)}
                              </span>
                            ) : null}
                            <div className="text-zinc-500">{item.reason}</div>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Discovery contradictions
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                      {(discoveryContradictoryEvidence.length
                        ? discoveryContradictoryEvidence
                        : [
                            {
                              label: "None reported",
                              contribution: 0,
                              reason:
                                "No contradictory discovery evidence is active.",
                            },
                          ]
                      )
                        .slice(0, 4)
                        .map((item: any, index: number) => (
                          <div key={`${item.label}-${index}`}>
                            <span className="font-semibold text-slate-200">
                              {item.label}
                            </span>
                            {item.contribution != null ? (
                              <span className="text-zinc-500">
                                {" "}
                                · {fmtPlainPct(numeric(item.contribution), 0)}
                              </span>
                            ) : null}
                            <div className="text-zinc-500">{item.reason}</div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Missing evidence
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                      {(discoveryMissingEvidence.length
                        ? discoveryMissingEvidence
                        : ["No missing discovery evidence reported."]
                      )
                        .slice(0, 4)
                        .map((item: string, index: number) => (
                          <div key={`${item}-${index}`}>{item}</div>
                        ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Invalidation conditions
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                      {(displayedDiscoveryInvalidationConditions.length
                        ? displayedDiscoveryInvalidationConditions
                        : ["No discovery invalidation conditions reported."]
                      )
                        .slice(0, 4)
                        .map((item: string, index: number) => (
                          <div key={`${item}-${index}`}>{item}</div>
                        ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Memory summary
                    </div>
                    <div className="mt-3 space-y-1 text-xs leading-5 text-zinc-400">
                      <div>
                        Discovery similar outcomes{" "}
                        {numeric(discoveryMemory?.similarOutcomes)}
                      </div>
                      <div>
                        Discovery success/failure{" "}
                        {fmtPlainPct(numeric(discoveryMemory?.successRatio), 0)}{" "}
                        /{" "}
                        {fmtPlainPct(numeric(discoveryMemory?.failureRatio), 0)}
                      </div>
                      <div>
                        Discovery predictive{" "}
                        {(
                          discoveryMemory?.mostPredictiveEvidence ?? ["Pending"]
                        )
                          .slice(0, 2)
                          .join(" · ")}
                      </div>
                      <div>
                        Discovery misleading{" "}
                        {(
                          discoveryMemory?.mostMisleadingEvidence ?? ["Pending"]
                        )
                          .slice(0, 2)
                          .join(" · ")}
                      </div>
                      {discoveryMemoryRecognitionLine ? (
                        <div>{discoveryMemoryRecognitionLine}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </SectionShell>

              <SectionShell
                eyebrow="Sizing"
                title="Sizing diagnostics"
                action={
                  <StatusPill
                    tone={
                      dashboardSizing.sizingDecision === "allowed"
                        ? "good"
                        : dashboardSizing.sizingDecision === "blocked"
                          ? "bad"
                          : "warn"
                    }
                  >
                    {sizingModeMetricValue}
                  </StatusPill>
                }
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Selected step"
                    value={fmtPlainPct(
                      numeric(
                        (dashboardSizing.sizingResult as any)
                          ?.selectedLadderPct,
                      ),
                      0,
                    )}
                  />
                  <MiniMetric
                    label="Max exposure"
                    value={fmtPlainPct(
                      dashboardSizing.suggestedMaximumExposurePct,
                    )}
                  />
                  <MiniMetric
                    label="Risk"
                    value={fmtPlainPct(avgRisk ?? 100, 0)}
                  />
                </div>
                <div className="mt-4 space-y-2 text-sm leading-6 text-zinc-400">
                  {(dashboardSizing.sizingRationale?.length
                    ? dashboardSizing.sizingRationale
                    : dashboardSizing.sizingReasons
                  )
                    .slice(0, 3)
                    .map((reason) => (
                      <div
                        key={reason}
                        className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                      >
                        {reason}
                      </div>
                    ))}
                </div>
              </SectionShell>

              <SectionShell
                eyebrow="Survival Memory"
                title="Survival memory diagnostics"
                action={
                  <StatusPill
                    tone={survivalMemoryTone(survivalMemoryDiagnostic)}
                  >
                    {survivalMemoryDiagnostic?.status?.replace(/_/g, " ") ??
                      "Pending"}
                  </StatusPill>
                }
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Survival memory status"
                    value={
                      survivalMemoryDiagnostic?.status?.replace(/_/g, " ") ??
                      "—"
                    }
                  />
                  <MiniMetric
                    label="Scar count"
                    value={
                      survivalMemoryDiagnostic
                        ? String(survivalMemoryDiagnostic.scarCount)
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Near-ruin count"
                    value={
                      survivalMemoryDiagnostic
                        ? String(survivalMemoryDiagnostic.nearRuinCount)
                        : "—"
                    }
                  />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Average survival cost"
                    value={
                      survivalMemoryDiagnostic
                        ? `${Math.round(numeric(survivalMemoryDiagnostic.averageSurvivalCost))}/100`
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Recovery burden"
                    value={
                      survivalMemoryDiagnostic
                        ? `${Math.round(numeric(survivalMemoryDiagnostic.recoveryBurden))}/100`
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Survival confidence"
                    value={
                      survivalMemoryDiagnostic
                        ? `${Math.round(numeric(survivalMemoryDiagnostic.survivalConfidence))}/100`
                        : "—"
                    }
                  />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <MiniMetric
                    label="Current state similarity to past fragile states"
                    value={
                      survivalMemoryDiagnostic
                        ? fmtPlainPct(
                            numeric(
                              survivalMemoryDiagnostic.currentStateSimilarity,
                            ),
                            0,
                          )
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Recovery exposure cap"
                    value={
                      survivalMemoryDiagnostic
                        ? fmtPlainPct(
                            numeric(survivalMemoryDiagnostic.maxExposurePct),
                          )
                        : "—"
                    }
                    sub={survivalMemoryDiagnostic?.recommendation?.replace(
                      /_/g,
                      " ",
                    )}
                  />
                </div>
                <div className="mt-4 space-y-2 text-sm leading-6 text-zinc-400">
                  {survivalWarnings.slice(0, 4).map((warning) => (
                    <div
                      key={warning}
                      className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                    >
                      {warning}
                    </div>
                  ))}
                </div>
              </SectionShell>

              <SectionShell
                eyebrow="Recovery"
                title="Recovery diagnostics"
                action={
                  <StatusPill tone={recoveryTone(recoveryDiagnostic)}>
                    {recoveryDiagnostic?.status?.replace(/-/g, " ") ??
                      "Pending"}
                  </StatusPill>
                }
              >
                <div className="grid gap-3 sm:grid-cols-4">
                  <MiniMetric
                    label="Recovery score"
                    value={
                      recoveryDiagnostic
                        ? `${Math.round(numeric(recoveryDiagnostic.recoveryScore))}/100`
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Trusted capacity"
                    value={
                      recoveryDiagnostic
                        ? fmtPlainPct(
                            numeric(recoveryDiagnostic.trustedCapacity),
                            0,
                          )
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Confidence cap lift"
                    value={
                      recoveryDiagnostic
                        ? `+${numeric(recoveryDiagnostic.confidenceCapLift).toFixed(1)}`
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Recommended exposure cap"
                    value={
                      recoveryDiagnostic
                        ? fmtPlainPct(
                            numeric(recoveryDiagnostic.recommendedExposureCap),
                          )
                        : "—"
                    }
                    sub={recoveryDiagnostic?.mode?.replace(/-/g, " ")}
                  />
                </div>
                <div className="mt-4 space-y-2 text-sm leading-6 text-zinc-400">
                  {displayedRecoveryBlockers.slice(0, 3).map((blocker) => (
                    <div
                      key={blocker}
                      className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                    >
                      {blocker}
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs leading-5 text-zinc-500">
                  Unlock:{" "}
                  {displayedRecoveryUnlockConditions.slice(0, 2).join(" ")}
                </div>
              </SectionShell>

              <SectionShell
                eyebrow="Signal Trust Governor"
                title="Participation decision"
                action={
                  <StatusPill tone={trustGovernorTone(trustGovernor)}>
                    {trustGovernor?.participationMode?.replace(/_/g, " ") ??
                      "Pending"}
                  </StatusPill>
                }
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Trust score"
                    value={
                      trustGovernor
                        ? fmtPlainPct(trustGovernor.trustScore, 0)
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Confidence cap"
                    value={
                      trustGovernor
                        ? fmtPlainPct(trustGovernor.confidenceCap, 0)
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Trusted exposure"
                    value={
                      trustGovernor
                        ? fmtPlainPct(trustGovernor.maxExposure)
                        : "—"
                    }
                  />
                </div>
                <div className="mt-4 space-y-2 text-sm leading-6 text-zinc-400">
                  {(trustGovernor?.reasons?.length
                    ? trustGovernor.reasons
                    : [
                        "Trust governance will appear after strategy readiness is evaluated.",
                      ]
                  )
                    .slice(0, 3)
                    .map((reason) => (
                      <div
                        key={reason}
                        className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                      >
                        {reason}
                      </div>
                    ))}
                </div>
                {trustGovernor?.unlockCriteria?.length ? (
                  <div className="mt-3 text-xs leading-5 text-zinc-500">
                    Unlock: {trustGovernor.unlockCriteria.slice(0, 2).join(" ")}
                  </div>
                ) : null}
              </SectionShell>

              <SectionShell
                eyebrow="Remediation"
                title="Readiness remediation planner"
                action={
                  <StatusPill tone={remediationTone(readinessRemediation)}>
                    {readinessRemediation?.status?.replace(/_/g, " ") ??
                      "Pending"}
                  </StatusPill>
                }
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Top action"
                    value={readinessRemediation?.topAction ?? "—"}
                  />
                  <MiniMetric
                    label="Expected lift"
                    value={
                      readinessRemediation
                        ? `+${readinessRemediation.totalExpectedTrustLift.toFixed(1)}`
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Execution gate"
                    value={
                      readinessRemediation?.executionGate?.replace(/_/g, " ") ??
                      "—"
                    }
                  />
                </div>
                <div className="mt-4 space-y-2">
                  {(readinessRemediation?.steps?.length
                    ? readinessRemediation.steps
                    : []
                  )
                    .slice(0, 4)
                    .map((step) => (
                      <div
                        key={step.id}
                        className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">
                              {step.title}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-zinc-500">
                              {step.reason}
                            </div>
                          </div>
                          <StatusPill
                            tone={step.status === "blocked" ? "bad" : "warn"}
                          >
                            +{step.expectedTrustLift.toFixed(1)}
                          </StatusPill>
                        </div>
                        <div className="mt-2 text-xs leading-5 text-zinc-500">
                          {step.evidenceRequired.slice(0, 2).join(" · ")}
                        </div>
                      </div>
                    ))}
                  {readinessRemediation &&
                  !readinessRemediation.steps.length ? (
                    <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                      No remediation steps are active.
                    </div>
                  ) : null}
                  {!readinessRemediation ? (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-500">
                      Remediation diagnostics are pending.
                    </div>
                  ) : null}
                </div>
              </SectionShell>

              <SectionShell
                eyebrow="Judgement"
                title="Judgement diagnostics"
                action={
                  <StatusPill tone={judgementTone(judgementDiagnostic)}>
                    {judgementDiagnostic?.status?.replace(/_/g, " ") ??
                      "Pending"}
                  </StatusPill>
                }
              >
                <div className="text-sm leading-6 text-zinc-400">
                  Judgement compares the current state with similar historical
                  situations and checks whether past outcomes justify trusting
                  the current signal.
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Adjusted confidence"
                    value={
                      judgementDiagnostic
                        ? fmtPlainPct(judgementDiagnostic.adjustedConfidence, 0)
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Reliability"
                    value={
                      judgementDiagnostic
                        ? fmtPlainPct(judgementDiagnostic.reliability, 0)
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Similar samples"
                    value={
                      judgementDiagnostic
                        ? String(judgementDiagnostic.similarSampleSize)
                        : "—"
                    }
                  />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <MiniMetric
                    label="Outcome stability"
                    value={
                      judgementDiagnostic
                        ? fmtPlainPct(judgementDiagnostic.outcomeStability, 0)
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Overfit risk"
                    value={
                      judgementDiagnostic
                        ? fmtPlainPct(judgementDiagnostic.overfitRisk, 0)
                        : "—"
                    }
                  />
                </div>
                <div className="mt-4 space-y-2 text-sm leading-6 text-zinc-400">
                  {(judgementReasons.length
                    ? judgementReasons
                    : [
                        "Judgement will appear after similar historical outcomes are available.",
                      ]
                  ).map((reason) => (
                    <div
                      key={reason}
                      className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                    >
                      {reason}
                    </div>
                  ))}
                </div>
              </SectionShell>

              <SectionShell
                eyebrow="Agency"
                title="Agency diagnostics"
                action={
                  <StatusPill
                    tone={
                      agencyRecommendation === "act"
                        ? "good"
                        : agencyRecommendation === "requires_human_review"
                          ? "bad"
                          : "warn"
                    }
                  >
                    {agencyRecommendation.replace(/_/g, " ")}
                  </StatusPill>
                }
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Trust"
                    value={fmtPlainPct(agencyTrustPct, 0)}
                    sub={
                      agencyTrustAdjustmentPct != null &&
                      agencyTrustAdjustmentPct > 0
                        ? `+${fmtPlainPct(agencyTrustAdjustmentPct, 0)} reduced-size outcome credit`
                        : undefined
                    }
                  />
                  <MiniMetric
                    label="Calibration"
                    value={
                      agencyCalibrationHealthPct == null
                        ? "—"
                        : fmtPlainPct(agencyCalibrationHealthPct * 100, 0)
                    }
                  />
                  <MiniMetric
                    label="Blocked"
                    value={String(agencyBlockedActions)}
                  />
                </div>
                <div className="mt-4 space-y-2">
                  {agencyAudits.slice(0, 3).map((audit: any) => (
                    <div
                      key={audit.traceId ?? audit.symbol}
                      className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">
                            {audit.symbol ?? audit.traceId}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {String(audit.decisionKind ?? "decision").replace(
                              /_/g,
                              " ",
                            )}
                          </div>
                        </div>
                        <StatusPill tone={audit.allowed ? "good" : "bad"}>
                          {audit.allowed ? "Allowed" : "Blocked"}
                        </StatusPill>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-zinc-500">
                        {audit.rawConfidence != null &&
                        audit.calibratedConfidence != null
                          ? `Raw ${fmtPlainPct(audit.rawConfidence, 0)} -> calibrated ${fmtPlainPct(audit.calibratedConfidence, 0)}.`
                          : ((audit.violations ?? audit.reasons ?? []).slice(
                              0,
                              1,
                            )[0] ??
                            `Outcome ${audit.outcomeLabel ?? "unknown"}`)}
                      </div>
                    </div>
                  ))}
                  {!agencyAudits.length ? (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-8 text-sm text-zinc-500">
                      Agency traces will appear after strategy decisions are
                      evaluated.
                    </div>
                  ) : null}
                </div>
              </SectionShell>

              <SectionShell
                eyebrow="Resolve"
                title="Resolve diagnostics"
                action={
                  <StatusPill tone={resolveTone(resolveDiagnostic)}>
                    {resolveDiagnostic?.decision?.replace(/_/g, " ") ??
                      "Pending"}
                  </StatusPill>
                }
              >
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <MiniMetric
                    label="Decision"
                    value={
                      resolveDiagnostic?.decision?.replace(/_/g, " ") ?? "—"
                    }
                  />
                  <MiniMetric
                    label="Commitment level"
                    value={
                      resolveDiagnostic?.commitmentLevel?.replace(/_/g, " ") ??
                      "—"
                    }
                  />
                  <MiniMetric
                    label="Resolve score"
                    value={
                      resolveDiagnostic
                        ? `${Math.round(numeric(resolveDiagnostic.resolveScore))}/100`
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Required score"
                    value={
                      resolveDiagnostic
                        ? `${Math.round(numeric(resolveDiagnostic.requiredScore))}/100`
                        : "—"
                    }
                  />
                  <MiniMetric
                    label="Human review required"
                    value={
                      resolveDiagnostic
                        ? resolveDiagnostic.humanReviewRequired
                          ? "Yes"
                          : "No"
                        : "—"
                    }
                  />
                </div>
                <div className="mt-4 rounded-lg border border-white/10 bg-[#151515] px-4 py-3 text-sm leading-6 text-zinc-400">
                  {resolveDiagnostic?.explanation ??
                    "Resolve will appear after Agency, Trust, Judgement, Risk, and sizing evidence are evaluated."}
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Missing evidence
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                      {resolveMissingEvidence.slice(0, 4).map((item, index) => (
                        <div key={`${item}-${index}`}>{item}</div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Unlock conditions
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                      {displayedResolveUnlockConditions
                        .slice(0, 6)
                        .map((item, index) => (
                          <div key={`${item}-${index}`}>{item}</div>
                        ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Invalidation conditions
                    </div>
                    <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                      {resolveInvalidationConditions
                        .slice(0, 4)
                        .map((item, index) => (
                          <div key={`${item}-${index}`}>{item}</div>
                        ))}
                    </div>
                  </div>
                </div>
              </SectionShell>

              <SectionShell
                eyebrow="Candidate progression"
                title="Candidate progression view"
                action={
                  <StatusPill
                    tone={leadingDiscoveryCandidate ? "neutral" : "warn"}
                  >
                    {leadingDiscoveryCandidate?.symbol ?? "Pending"}
                  </StatusPill>
                }
              >
                {leadingDiscoveryCandidate ? (
                  <div className="space-y-3">
                    {(leadingDiscoveryCandidate.progression ?? []).map(
                      (point: any, index: number) => (
                        <div
                          key={`${point.stage}-${index}`}
                          className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-white">
                              {point.stage}
                            </div>
                            <div className="text-xs text-[#FDD000]">
                              {fmtPlainPct(numeric(point.score), 0)}
                            </div>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-zinc-500">
                            {point.explanation}
                          </div>
                        </div>
                      ),
                    )}
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-5 text-zinc-400">
                      <span className="font-semibold text-slate-200">
                        Discovery transition
                      </span>
                      <div className="mt-1 text-zinc-500">
                        {leadingDiscoveryCandidate.discovery?.lifecycle
                          ?.transitionReason ??
                          discoveryLifecycle?.transitionReason ??
                          "Lifecycle transition reason is pending."}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-8 text-sm text-zinc-500">
                    Candidate progression is pending.
                  </div>
                )}
              </SectionShell>

              <SectionShell
                eyebrow="Lifecycle"
                title="Opportunity lifecycle"
                action={
                  <StatusPill tone="neutral">
                    {frameworkOpportunities.length + discoveryCandidates.length}{" "}
                    observed
                  </StatusPill>
                }
              >
                <div className="space-y-3">
                  {discoveryCandidates.slice(0, 5).map((candidate: any) => (
                    <div
                      key={candidate.symbol ?? candidate.opportunityId}
                      className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">
                            {candidate.symbol ?? candidate.opportunityId}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            Detected -&gt; Emerging -&gt; Strengthening -&gt;
                            Eligible -&gt; Sized -&gt; Active -&gt; Closed
                          </div>
                        </div>
                        <StatusPill
                          tone={
                            candidate.lifecycle === "Sized" ||
                            candidate.lifecycle === "Active"
                              ? "good"
                              : candidate.lifecycle === "Detected"
                                ? "neutral"
                                : "warn"
                          }
                        >
                          {candidate.lifecycle ?? candidate.type}
                        </StatusPill>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-zinc-500">
                        {candidate.explanation ?? candidate.evidence?.[0]}
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <MiniMetric
                          label="Discovery maturity"
                          value={
                            candidate.discovery
                              ? fmtPlainPct(
                                  numeric(candidate.discovery.maturity),
                                  0,
                                )
                              : "—"
                          }
                        />
                        <MiniMetric
                          label="Discovery confidence"
                          value={
                            candidate.discovery
                              ? fmtPlainPct(
                                  numeric(candidate.discovery.confidence),
                                  0,
                                )
                              : "—"
                          }
                        />
                        <MiniMetric
                          label="Transition reason"
                          value={
                            candidate.discovery?.status?.replace(/_/g, " ") ??
                            "Pending"
                          }
                          sub={candidate.discovery?.lifecycle?.transitionReason}
                        />
                      </div>
                    </div>
                  ))}
                  {!discoveryCandidates.length ? (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-8 text-sm text-zinc-500">
                      Opportunity lifecycle is pending.
                    </div>
                  ) : null}
                </div>
              </SectionShell>
            </section>
          </AdvancedDisclosure>
        </DashboardGroup>

        <DashboardGroup
          eyebrow="Allocation layer"
          title="Opportunity & Allocation"
          description="Ideas and ledgers stay scannable after the headline decision, with asset-level evidence available in place."
        >
          <section className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
            <SectionShell
              eyebrow="Investment ideas"
              title="Top ideas for this market"
              action={
                <StatusPill
                  tone={showingBlockedReviewIdeas ? "warn" : "neutral"}
                >
                  {showingBlockedReviewIdeas ? "Review" : "Top 5"}
                </StatusPill>
              }
            >
              {!hasMarketData ? (
                <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-8 text-sm text-zinc-500">
                  Loading ideas for the selected market...
                </div>
              ) : showingBlockedReviewIdeas ? (
                <div className="mt-6 rounded-lg border border-[#FDD000]/25 bg-[#FDD000]/10 px-4 py-4 text-sm leading-6 text-[#FDD000]">
                  {reviewIdeasMessage}
                </div>
              ) : !displayedTopOpportunities.length ? (
                <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-8 text-sm text-zinc-500">
                  No buy ideas pass the current risk checks.
                </div>
              ) : null}

              <div className="mt-6 grid gap-3 lg:grid-cols-2">
                {hasMarketData &&
                  displayedTopOpportunities.map((stock, index) => {
                    const ticker = normalizedTicker(stock);
                    const isSelected = selected
                      ? normalizedTicker(selected) === ticker
                      : false;
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
                        className="relative min-h-[430px] rounded-xl text-left outline-none [perspective:1400px]"
                        aria-label={
                          isSelected && isFlipped
                            ? "Show asset summary"
                            : "Show asset price history"
                        }
                      >
                        <div
                          className={cx(
                            "relative min-h-[430px] rounded-xl transition-transform duration-500 [transform-style:preserve-3d]",
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
                                <InstrumentAvatar
                                  instrument={mergeCandidateVisual(stock)}
                                />
                                <div className="min-w-0">
                                  <div className="truncate text-lg font-semibold text-white">
                                    {ticker}
                                  </div>
                                  <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                    #{index + 1} · {dataCoverageLabel(stock)}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-5 space-y-3">
                              <QualityBar
                                value={stock.setupQuality}
                                label="Overall quality"
                              />
                              <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
                                <QualityBar
                                  value={numeric(stock.trendQuality)}
                                  label="Trend"
                                />
                                <QualityBar
                                  value={clamp(100 - numeric(stock.riskPressure))}
                                  label="Risk control"
                                />
                                <QualityBar
                                  value={expectedMoveScore(stock.expectedMove)}
                                  label="Return setup"
                                />
                                <QualityBar
                                  value={numeric(stock.timingQuality)}
                                  label="Timing"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
                                <div>
                                  <div className="text-zinc-500">
                                    Max position
                                  </div>
                                  <div className="font-semibold text-slate-100">
                                    {fmtPlainPct(stock.suggestedExposure)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-zinc-500">
                                    Expected change
                                  </div>
                                  <div className="font-semibold text-slate-100">
                                    {fmtPct(stock.expectedMove)}
                                  </div>
                                </div>
                                {stock.judgement ? (
                                  <div>
                                    <div className="text-zinc-500">
                                      Judgement
                                    </div>
                                    <div className="font-semibold text-slate-100">
                                      {stock.judgement.status.replace(
                                        /_/g,
                                        " ",
                                      )}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              <p className="line-clamp-3 text-xs leading-5 text-zinc-400">
                                {assetRankReason(stock)}
                              </p>
                              {stock.discovery ? (
                                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-zinc-400">
                                  <span className="font-semibold text-slate-200">
                                    Discovery {stock.discovery.status}
                                  </span>
                                  <span className="text-zinc-500">
                                    {" "}
                                    · confidence{" "}
                                    {fmtPlainPct(
                                      numeric(stock.discovery.confidence),
                                      0,
                                    )}
                                  </span>
                                  <div className="line-clamp-2 text-zinc-500">
                                    {stock.discovery.supportingEvidence?.[0]
                                      ?.label ?? stock.discovery.explanation}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="absolute inset-0 rounded-xl border border-[#FDD000]/40 bg-black p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.18em] text-[#FDD000]">
                                  Price history
                                </div>
                                <div className="mt-1 text-lg font-semibold text-white">
                                  {ticker}
                                </div>
                                <div className="line-clamp-1 text-xs text-zinc-500">
                                  {stockName(stock)}
                                </div>
                              </div>
                              <StatusPill
                                tone={stock.expectedMove >= 0 ? "good" : "bad"}
                              >
                                {fmtPct(stock.expectedMove)}
                              </StatusPill>
                            </div>

                            <div className="h-[200px] min-w-0 overflow-hidden">
                              {selectedHistoryLoading ? (
                                <div className="grid h-full place-items-center text-xs text-zinc-500">
                                  Loading return path...
                                </div>
                              ) : !isFlipped || history.length < 2 ? (
                                <div className="grid h-full min-h-[210px] place-items-center text-xs text-zinc-500">
                                  {history.length < 2
                                    ? "Price history unavailable"
                                    : "Open price history"}
                                </div>
                              ) : (
                                <ResponsiveContainer width="99%" height={210}>
                                  <AreaChart
                                    data={asChartData(history)}
                                    margin={{
                                      top: 8,
                                      right: 8,
                                      bottom: 0,
                                      left: 0,
                                    }}
                                  >
                                    <defs>
                                      <linearGradient
                                        id={`institutionalPath-${ticker}`}
                                        x1="0"
                                        x2="0"
                                        y1="0"
                                        y2="1"
                                      >
                                        <stop
                                          offset="0%"
                                          stopColor="#FDD000"
                                          stopOpacity={0.28}
                                        />
                                        <stop
                                          offset="100%"
                                          stopColor="#FDD000"
                                          stopOpacity={0}
                                        />
                                      </linearGradient>
                                    </defs>
                                    <XAxis dataKey="index" hide />
                                    <YAxis
                                      domain={["dataMin", "dataMax"]}
                                      hide
                                    />
                                    <Tooltip
                                      content={({ active, payload }) =>
                                        active && payload?.length ? (
                                          <div className="rounded-lg border border-white/10 bg-black px-3 py-2 text-xs text-zinc-200 shadow-xl">
                                            {fmtCurrency(
                                              Number(payload[0].payload.price),
                                            )}
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

            <SectionShell
              eyebrow="Strategy history"
              title="Past performance snapshot"
              description="The visible layer keeps only the performance facts that change posture; benchmark and fee context stays one click away."
              action={
                <StatusPill tone={indicatorExcellenceTone}>
                  {indicatorExcellenceLabel}
                </StatusPill>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <MiniMetric
                  label="Total Return"
                  value={
                    hasBacktestData ? fmtPct(displayedBacktestReturnPct) : "—"
                  }
                />
                <MiniMetric
                  label="Annualized Sharpe Ratio"
                  value={
                    Number.isFinite(Number(displayedBacktestSharpe))
                      ? Number(displayedBacktestSharpe).toFixed(2)
                      : "—"
                  }
                  sub="Return compared with volatility. Higher is better."
                />
                <MiniMetric
                  label="Win Rate"
                  value={
                    hasBacktestData
                      ? fmtPlainPct(displayedBacktestWinRate)
                      : "—"
                  }
                />
                <MiniMetric
                  label="Max Drawdown"
                  value={
                    Number.isFinite(Number(displayedBacktestMaxDrawdownPct))
                      ? fmtPlainPct(displayedBacktestMaxDrawdownPct)
                      : "—"
                  }
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MiniMetric
                  label="History Coverage"
                  value={fmtYears(historyCoverageYears)}
                />
                <MiniMetric
                  label="History Depth"
                  value={
                    historyDepthScore == null
                      ? "—"
                      : `${Math.round(historyDepthScore)}/100`
                  }
                />
                <MiniMetric
                  label="Regime Coverage"
                  value={
                    regimeCoverageScore == null
                      ? "—"
                      : `${Math.round(regimeCoverageScore)}/100`
                  }
                />
                <MiniMetric
                  label="Regime Diversity"
                  value={
                    regimeDiversityScore == null
                      ? "—"
                      : `${Math.round(regimeDiversityScore)}/100`
                  }
                />
                <MiniMetric
                  label="Coverage Status"
                  value={historyCoverageStatus}
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                {historyExplanation}
              </p>

              {indicatorExcellence ? (
                <div className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-zinc-300">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#FDD000]">
                        Indicator excellence
                      </div>
                      <div className="mt-1 text-white">
                        {indicatorExcellence.summary}
                      </div>
                    </div>
                    <StatusPill tone={indicatorExcellenceTone}>
                      {numeric(indicatorExcellence.passedCount)}/
                      {numeric(indicatorExcellence.targetCount)}
                    </StatusPill>
                  </div>
                </div>
              ) : null}

              <AdvancedDisclosure
                title="Backtest detail and benchmark context"
                description="Fee assumptions, holding time, profit factor, and benchmark deltas."
                summary={
                  <div className="grid gap-3 sm:grid-cols-4">
                    <MiniMetric
                      label="Profit factor"
                      value={
                        hasBacktestData
                          ? Number(displayedBacktestProfitFactor).toFixed(2)
                          : "—"
                      }
                      emphasis="quiet"
                    />
                    <MiniMetric
                      label="Excess return"
                      value={
                        hasBacktestData
                          ? fmtPct(
                              backtestSummary?.excessReturnPct ??
                                backtestSummary?.excess_return_pct,
                            )
                          : "—"
                      }
                      sub="vs equal-weight"
                      emphasis="quiet"
                    />
                    <MiniMetric
                      label="Trades"
                      value={String(backtestTradeCount || 0)}
                      sub="closed trades"
                      emphasis="quiet"
                    />
                    <MiniMetric
                      label="Indicator targets"
                      value={
                        indicatorExcellence
                          ? `${numeric(indicatorExcellence.passedCount)}/${numeric(
                              indicatorExcellence.targetCount,
                            )}`
                          : "—"
                      }
                      sub={
                        indicatorExcellence?.status?.replace(/_/g, " ") ??
                        "pending"
                      }
                      emphasis="quiet"
                    />
                  </div>
                }
                className="mt-5"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniMetric
                    label="Average Holding Time"
                    value={
                      hasBacktestData && backtestAverageHoldingDays != null
                        ? `${Math.round(backtestAverageHoldingDays)}d`
                        : "—"
                    }
                    sub={`${backtestTradeCount || 0} closed trades`}
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Profit Factor"
                    value={
                      hasBacktestData
                        ? Number(displayedBacktestProfitFactor).toFixed(2)
                        : "—"
                    }
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Excess Return"
                    value={
                      hasBacktestData
                        ? fmtPct(
                            backtestSummary?.excessReturnPct ??
                              backtestSummary?.excess_return_pct,
                          )
                        : "—"
                    }
                    sub="vs equal-weight benchmark"
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Excess Sharpe"
                    value={
                      hasBacktestData &&
                      (backtestSummary?.excessSharpe ??
                        backtestSummary?.excess_sharpe) != null
                        ? Number(
                            backtestSummary?.excessSharpe ??
                              backtestSummary?.excess_sharpe,
                          ).toFixed(2)
                        : "—"
                    }
                    sub="vs equal-weight benchmark"
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Commission bps"
                    value={String(
                      backtestSummary?.commissionBps ??
                        backtestSummary?.commission_bps ??
                        0,
                    )}
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Slippage bps"
                    value={String(
                      backtestSummary?.slippageBps ??
                        backtestSummary?.slippage_bps ??
                        0,
                    )}
                    emphasis="quiet"
                  />
                </div>
              </AdvancedDisclosure>
            </SectionShell>
          </section>
        </DashboardGroup>

        <DashboardGroup
          eyebrow="Constraint layer"
          title="Risk & Constraints"
          description="Readiness, calibration, execution gates, and review items sit below the decision so constraints explain rather than overwhelm."
        >
          <section className="grid min-w-0 gap-5">
            <SectionShell
              eyebrow="Readiness check"
              title="Can this strategy be tested live?"
              action={
                <StatusPill tone={productionTone(confidenceStage)}>
                  {promotionStateDisplay}
                </StatusPill>
              }
            >
              <p className="max-w-4xl text-sm leading-6 text-zinc-400">
                This check asks a simple question: is the strategy strong enough
                to test with real-time data? It reviews past results, risk,
                number of trades, benchmark comparison, and warning flags. It
                does not guarantee future performance.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Checks passed
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">
                    {passedGateCount}/{confidenceGates.length} gates
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Readiness score
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">
                    {readinessScoreDisplay}/100
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    Higher means more live-test ready
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#151515] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Execution gate
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">
                    {executionGateDisplay}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {executionGateDetail}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Review stage
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">
                    {lifecycleStageDisplay}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Tested trades
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">
                    {backtestTradeCount}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {backtestSegmentCount ?? 0} test periods
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Similar market match
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">
                    {regimeConsistencyPct == null
                      ? "Pending"
                      : fmtPlainPct(regimeConsistencyPct, 0)}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {validationPostureDisplay}
                  </div>
                </div>
              </div>

              <AdvancedDisclosure
                title="Calibration internals and readiness gates"
                description="Raw confidence, calibrated confidence, trustworthiness, and the full gate checklist."
                summary={
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MiniMetric
                      label="Readiness"
                      value={`${readinessScoreDisplay}/100`}
                      sub={`${passedGateCount}/${confidenceGates.length} gates`}
                      emphasis="quiet"
                    />
                    <MiniMetric
                      label="Calibration"
                      value={calibrationStatusLabel}
                      sub={topCalibrationMessage}
                      emphasis="quiet"
                    />
                    <MiniMetric
                      label="Execution gate"
                      value={executionGateDisplay}
                      sub={executionGateDetail}
                      emphasis="quiet"
                    />
                  </div>
                }
                className="mt-5"
              >
                <div className="rounded-lg border border-white/10 bg-[#151515] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        Calibration
                      </div>
                      <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
                        Calibration checks whether past confidence matched
                        actual outcomes. Raw confidence is what the model
                        currently believes. Calibrated confidence is what the
                        system is willing to trust based on past evidence.
                      </p>
                    </div>
                    <StatusPill tone={calibrationTone}>
                      {calibrationStatusLabel}
                    </StatusPill>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <MiniMetric
                      label="Raw confidence"
                      value={
                        rawConfidenceDisplay == null
                          ? "—"
                          : fmtPlainPct(rawConfidenceDisplay, 0)
                      }
                    />
                    <MiniMetric
                      label="Calibrated confidence"
                      value={
                        calibratedConfidenceDisplay == null
                          ? "—"
                          : fmtPlainPct(calibratedConfidenceDisplay, 0)
                      }
                    />
                    <MiniMetric
                      label="Trustworthiness"
                      value={
                        calibrationTrustworthinessDisplay == null
                          ? "—"
                          : fmtPlainPct(calibrationTrustworthinessDisplay, 0)
                      }
                    />
                    <MiniMetric
                      label="Sample size"
                      value={String(calibrationSampleSize)}
                    />
                  </div>
                  <div className="mt-3 text-xs leading-5 text-zinc-500">
                    {calibrationExplanation}
                    {calibrationWarnings.length
                      ? ` Warnings: ${calibrationWarnings.slice(0, 3).join(", ")}.`
                      : ""}
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
                          <div className="font-medium text-white">
                            {gate.label}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-zinc-500">
                            {gate.reason}
                          </div>
                        </div>
                        <StatusPill tone={gate.passed ? "good" : gate.severity}>
                          {gateStatusLabel(gate)}
                        </StatusPill>
                      </div>
                      <div className="mt-3 text-sm font-semibold text-slate-200">
                        {String(gate.value)
                          .replace("1 / 3 segments", "1 of 3 required segments")
                          .replace(
                            "8 signals, blocked",
                            "8 live signals, promotion blocked",
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </AdvancedDisclosure>

              {failureFlags.length || trustReviewItems.length ? (
                <div
                  className={cx(
                    "mt-5 rounded-lg p-4",
                    failureFlags.length
                      ? "border border-red-400/20 bg-red-500/10"
                      : "border border-[#FDD000]/30 bg-[#FDD000]/10",
                  )}
                >
                  <div
                    className={cx(
                      "mb-2 flex items-center gap-2 text-sm font-semibold",
                      failureFlags.length ? "text-rose-100" : "text-[#FDD000]",
                    )}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    {failureFlags.length
                      ? "Items to fix"
                      : "Trust items to improve"}
                  </div>
                  <div
                    className={cx(
                      "space-y-1 text-sm",
                      failureFlags.length
                        ? "text-rose-100/80"
                        : "text-[#FDD000]/85",
                    )}
                  >
                    {trustReviewItems.map((flag) => (
                      <div key={flag}>• {flag}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  No readiness or trust review items are active for the current
                  market view.
                </div>
              )}
            </SectionShell>
          </section>
        </DashboardGroup>

        <DashboardGroup
          eyebrow="Opportunity & Allocation"
          title="Allocation Ledger"
          description="The full buy, watch, and sell lists remain available after the main posture and top ideas."
        >
          <section className="grid min-w-0 gap-5">
            <SectionShell
              eyebrow="Action lists"
              title="Buy, watch, and sell lists"
              action={
                <StatusPill tone="neutral">
                  {hasMarketData ? `${filtered.length} assets` : "Loading"}
                </StatusPill>
              }
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
        </DashboardGroup>

        <DashboardGroup
          eyebrow="System layer"
          title="System Intelligence"
          description="Market explanations and maps translate internal scores into the operator-facing narrative."
        >
          <section className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
            <SectionShell
              eyebrow="Market explanation"
              title="What the market data means"
            >
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-[#151515] p-4">
                  <div className="mb-4 flex items-center gap-3">
                    <TrendingUp className="h-5 w-5 text-[#FDD000]" />
                    <div>
                      <div className="font-semibold text-white">
                        Trend strength
                      </div>
                      <div className="text-xs text-zinc-500">
                        How clear the price direction looks
                      </div>
                    </div>
                  </div>
                  {hasMarketData ? (
                    <QualityBar
                      value={
                        hasUsableMarketData && avgQuality != null
                          ? avgQuality
                          : 0
                      }
                    />
                  ) : null}
                  <p className="mt-4 text-sm leading-6 text-zinc-400">
                    {hasMarketData
                      ? `Trend structure is ${semanticMetrics.trend.word.toLowerCase()}. Focus on the clearest ideas.`
                      : "Trend strength will appear after market data loads."}
                    {genericDiscovery
                      ? discoveryRecognitionSentence({
                          discoveryConfidence: finiteNumber(
                            genericDiscovery.confidence,
                          ),
                          discoveryNovelty: finiteNumber(
                            genericDiscovery.novelty,
                          ),
                          recognition: recognitionDiagnostic,
                        })
                      : ""}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#151515] p-4">
                  <div className="mb-4 flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-[#FDD000]" />
                    <div>
                      <div className="font-semibold text-white">
                        Risk control
                      </div>
                      <div className="text-xs text-zinc-500">
                        How stable the market looks
                      </div>
                    </div>
                  </div>
                  {hasMarketData ? (
                    <QualityBar
                      value={
                        hasUsableMarketData && avgRisk != null
                          ? 100 - avgRisk
                          : 0
                      }
                    />
                  ) : null}
                  <p className="mt-4 text-sm leading-6 text-zinc-400">
                    {hasMarketData
                      ? `Risk control is ${semanticMetrics.risk.word.toLowerCase()} with ${semanticMetrics.marketHealth.word.toLowerCase()} market health.`
                      : "Risk control will appear after live data loads."}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#151515] p-4">
                  <div className="mb-4 flex items-center gap-3">
                    <Layers className="h-5 w-5 text-[#FDD000]" />
                    <div>
                      <div className="font-semibold text-white">
                        Position durability
                      </div>
                      <div className="text-xs text-zinc-500">
                        How suitable the ideas are to hold
                      </div>
                    </div>
                  </div>
                  {hasMarketData ? (
                    <QualityBar
                      value={
                        hasProvidedSignals &&
                        avgQuality != null &&
                        confidence != null
                          ? clamp((avgQuality + confidence) / 2)
                          : 0
                      }
                    />
                  ) : null}
                  <p className="mt-4 text-sm leading-6 text-zinc-400">
                    {hasMarketData
                      ? `Position durability is ${semanticMetrics.durability.word.toLowerCase()}, based on trend support, confidence, and risk control.`
                      : "Position durability will appear after investment ideas load."}
                  </p>
                </div>
              </div>
            </SectionShell>

            <SectionShell
              className="min-w-0"
              eyebrow="Risk and opportunity"
              title="Risk and opportunity map"
            >
              <div className="h-[200px] min-w-0 overflow-hidden">
                {surface.length < 2 ? (
                  <div className="grid h-full min-h-[230px] place-items-center text-xs text-zinc-500">
                    {hasMarketData
                      ? "The map will appear after confirmed signals are available."
                      : "Loading map..."}
                  </div>
                ) : (
                  <ResponsiveContainer width="99%" height={230}>
                    <ScatterChart
                      margin={{ top: 8, right: 10, bottom: 8, left: -20 }}
                    >
                      <CartesianGrid stroke="rgba(148, 163, 184, 0.08)" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Trend"
                        domain={[0, 100]}
                        tick={{ fill: "#a1a1aa", fontSize: 11 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="Risk control"
                        domain={[0, 100]}
                        tick={{ fill: "#a1a1aa", fontSize: 11 }}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0].payload as any;
                          return (
                            <div className="rounded-lg border border-white/10 bg-black px-4 py-3 text-xs shadow-xl">
                              <div className="font-semibold text-white">
                                {row.ticker}
                              </div>
                              <div className="mt-1 text-zinc-400">
                                Quality score{" "}
                                {Math.round(row.stock.setupQuality)}/100
                              </div>
                              <div className="text-zinc-400">
                                Risk level {Math.round(row.stock.riskPressure)}
                                /100
                              </div>
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
        </DashboardGroup>

        <DashboardGroup
          eyebrow="Audit layer"
          title="Raw/Advanced Details"
          description="Collapsed audit material for calibration, traceability, raw contributors, overfit diagnostics, and strategy logs."
        >
          <div className="grid gap-4 xl:grid-cols-4">
            <AdvancedDisclosure
              title="Calibration internals"
              description="Raw model confidence, calibrated confidence, trustworthiness, sample size, and warnings."
              summary={
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniMetric
                    label="Raw confidence"
                    value={
                      rawConfidenceDisplay == null
                        ? "—"
                        : fmtPlainPct(rawConfidenceDisplay, 0)
                    }
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Calibrated"
                    value={
                      calibratedConfidenceDisplay == null
                        ? "—"
                        : fmtPlainPct(calibratedConfidenceDisplay, 0)
                    }
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Trust"
                    value={
                      calibrationTrustworthinessDisplay == null
                        ? "—"
                        : fmtPlainPct(calibrationTrustworthinessDisplay, 0)
                    }
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Samples"
                    value={String(calibrationSampleSize)}
                    emphasis="quiet"
                  />
                </div>
              }
            >
              <div className="space-y-3 text-sm leading-6 text-zinc-400">
                <div className="rounded-lg bg-black/25 p-4 ring-1 ring-white/[0.06]">
                  {calibrationExplanation}
                </div>
                <div className="rounded-lg bg-black/25 p-4 ring-1 ring-white/[0.06]">
                  {topCalibrationMessage}
                </div>
                {calibrationWarnings.length ? (
                  <div className="rounded-lg bg-[#FDD000]/10 p-4 text-[#FDD000] ring-1 ring-[#FDD000]/20">
                    {calibrationWarnings.slice(0, 6).join(", ")}
                  </div>
                ) : null}
              </div>
            </AdvancedDisclosure>

            <AdvancedDisclosure
              title="Trace details and raw contributors"
              description="Canonical restrictions, decision-change triggers, and terminology source mapping."
              summary={
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Restriction"
                    value={topCanonicalRestriction?.label ?? "None"}
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Unlocks"
                    value={String(
                      executiveIA.decisionChange.increaseExposure.length,
                    )}
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Concepts"
                    value={String(executiveIA.terminologyGroups.length)}
                    emphasis="quiet"
                  />
                </div>
              }
            >
              <div className="space-y-4">
                <div className="rounded-lg bg-black/25 p-4 text-sm leading-6 text-zinc-400 ring-1 ring-white/[0.06]">
                  {executiveRestrictionExplanation}
                </div>
                <div className="grid gap-3">
                  {executiveIA.terminologyGroups.map((group) => (
                    <div
                      key={`raw-${group.concept}`}
                      className="rounded-lg bg-black/25 p-4 ring-1 ring-white/[0.06]"
                    >
                      <div className="text-sm font-semibold text-white">
                        {group.concept}
                      </div>
                      <div className="mt-2 grid gap-2 text-xs leading-5 text-zinc-500">
                        {group.metrics.map((metric) => (
                          <div
                            key={`raw-${group.concept}-${metric.label}`}
                            className="flex items-center justify-between gap-4"
                          >
                            <span>{metric.label}</span>
                            <span className="font-semibold text-zinc-200">
                              {metric.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </AdvancedDisclosure>

            <AdvancedDisclosure
              title="Discovery Intelligence audit"
              description="Lifecycle maturity, opportunity economics, governance audits, institutional knowledge, and meta-learning traces."
              summary={
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Score"
                    value={fmtPlainPct(discoveryIntelligenceDiagnostic?.score, 0)}
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Regime coverage"
                    value={fmtPlainPct(discoveryIntelligenceDiagnostic?.regimeCoverageScore, 0)}
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Restriction audits"
                    value={String(discoveryIntelligenceDiagnostic?.governance.restrictions.length ?? 0)}
                    emphasis="quiet"
                  />
                </div>
              }
            >
              <div className="space-y-3 text-sm leading-6 text-zinc-400">
                {(discoveryIntelligenceDiagnostic?.governance.restrictions.length
                  ? discoveryIntelligenceDiagnostic.governance.restrictions
                  : []
                )
                  .slice(0, 6)
                  .map((restriction) => (
                    <div
                      key={`di-restriction-${restriction.id}`}
                      className="rounded-lg bg-black/25 p-3 ring-1 ring-white/[0.06]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-white">
                          {restriction.label}
                        </span>
                        <StatusPill tone={restriction.helpful ? "good" : "bad"}>
                          {fmtPlainNumber(restriction.effectiveness)}
                        </StatusPill>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        Avoided {fmtPlainNumber(restriction.avoidedLoss)} · Missed {fmtPlainNumber(restriction.missedUpside)}
                      </div>
                    </div>
                  ))}
                {(discoveryIntelligenceDiagnostic?.recommendations ?? [])
                  .slice(0, 4)
                  .map((item) => (
                    <div
                      key={`di-recommendation-${item.id}`}
                      className="rounded-lg bg-black/25 p-3 ring-1 ring-white/[0.06]"
                    >
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        {item.category}
                      </div>
                      <div className="mt-1 text-sm text-zinc-300">
                        {item.message}
                      </div>
                    </div>
                  ))}
                {!discoveryIntelligenceDiagnostic ? (
                  <div className="rounded-lg bg-black/25 p-4 ring-1 ring-white/[0.06]">
                    Discovery Intelligence audit records are pending.
                  </div>
                ) : null}
              </div>
            </AdvancedDisclosure>

            <AdvancedDisclosure
              title="Overfit/risk diagnostics and strategy audit logs"
              description="Readiness flags, trust review items, robustness, and recent agency audits."
              summary={
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <MiniMetric
                    label="Overfit risk"
                    value={
                      robustnessOverfitRisk == null
                        ? "—"
                        : fmtPlainPct(robustnessOverfitRisk, 0)
                    }
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Failure flags"
                    value={String(failureFlags.length)}
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="History depth"
                    value={
                      historyDepthScore == null
                        ? "—"
                        : `${Math.round(historyDepthScore)}/100`
                    }
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Sample diversity"
                    value={
                      sampleDiversityScore == null
                        ? "—"
                        : `${Math.round(sampleDiversityScore)}/100`
                    }
                    emphasis="quiet"
                  />
                  <MiniMetric
                    label="Agency audits"
                    value={String(agencyAudits.length)}
                    emphasis="quiet"
                  />
                </div>
              }
            >
              <div className="space-y-3 text-sm leading-6 text-zinc-400">
                {(failureFlags.length
                  ? failureFlags.map((flag) =>
                      formatPromotionBlocker(flag, backtestSummary),
                    )
                  : ["No active failure flags."]
                )
                  .slice(0, 8)
                  .map((item, index) => (
                    <div
                      key={`flag-${item}-${index}`}
                      className="rounded-lg bg-black/25 p-3 ring-1 ring-white/[0.06]"
                    >
                      {item}
                    </div>
                  ))}
                {agencyAudits.slice(0, 5).map((audit: any) => (
                  <div
                    key={`audit-${audit.traceId ?? audit.symbol}`}
                    className="rounded-lg bg-black/25 p-3 ring-1 ring-white/[0.06]"
                  >
                    <div className="font-semibold text-white">
                      {audit.symbol ?? audit.traceId ?? "Audit trace"}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {audit.rawConfidence != null &&
                      audit.calibratedConfidence != null
                        ? `Raw ${fmtPlainPct(audit.rawConfidence, 0)} -> calibrated ${fmtPlainPct(audit.calibratedConfidence, 0)}.`
                        : ((audit.violations ?? audit.reasons ?? []).slice(
                            0,
                            1,
                          )[0] ?? `Outcome ${audit.outcomeLabel ?? "unknown"}`)}
                    </div>
                  </div>
                ))}
              </div>
            </AdvancedDisclosure>
          </div>
        </DashboardGroup>

        <footer className="pb-8 text-center text-xs text-zinc-600">
          {totalStocks
            ? `${totalStocks.toLocaleString()} assets covered in this market`
            : "Coverage loading"}{" "}
          · Last updated {lastSyncedLabel}
        </footer>
      </main>
    </div>
  );
}
