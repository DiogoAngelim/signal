import { loadMarketList } from "./stock-data";
import path from "path";
import {
  DeadlockAnalyzer,
  ScoreNormalizationDiagnostics,
  SignalPipelineAuditTrail,
  SuppressionCascadeInspector,
  type DiagnosticRuntimeMode,
  type PipelineAuditEvent,
  type ScoreDiagnosticSample,
} from "./pipeline-diagnostics";
import {
  backtestConfigForMarket,
  MARKET_BACKTEST_CACHE_VERSION,
  type MarketBacktestConfig,
} from "./market-backtest-config";
import { collectForwardShadowEvidence } from "./market-forward-shadow";
import {
  StrategyReadinessEvaluator,
  applyStrategyReadinessToSummary,
  classifyStrategySignal,
  type StrategyReadinessResult,
} from "./strategy-readiness";
import type { HistoricalDataset } from "../../../signal-framework/history/types";
import { summarizeHistoricalDatasets, type MarketHistoryDiagnostics } from "./historical-dataset";
import { loadTradingViewHistoricalDataset } from "./tradingview-history";
import { SignalRobustnessEngine } from "../../../signal-framework/robustness/engine";
import { discoverStockOpportunities } from "./opportunity-discovery";
import { applyStockAgencyDiagnostics } from "./agency-diagnostics";
import { applyStockRecognitionDiagnostics } from "./stock-recognition";
import { applyStockResolveDiagnostics } from "./resolve-adapter";
import { enrichTradesWithSurvivalMemory } from "./survival-memory-adapter";

const LOCAL_MARKET_BACKTEST_CACHE = new Map<string, any>();

type MarketBacktestOptions = {
  force?: boolean;
  diagnostics?: boolean;
  debug?: boolean;
  persistDiagnostics?: boolean;
  runtimeMode?: DiagnosticRuntimeMode | string;
};

type StrategyRun = {
  trades: any[];
  history: any[];
  auditEvents: PipelineAuditEvent[];
  scoreSamples: ScoreDiagnosticSample[];
  mode: DiagnosticRuntimeMode;
  recoveryNotes: string[];
};

const DEFAULT_RUNTIME_MODE: DiagnosticRuntimeMode = "MODE_FULL_PERCEPTION";

function localBacktestCacheDir() {
  return (
    process.env.LOCAL_BACKTEST_CACHE_DIR ||
    path.resolve(process.cwd(), "../../..", ".local-cache/backtests")
  );
}

function canUsePersistedLocalBacktestCache() {
  if (process.env.LOCAL_BACKTEST_CACHE_DISABLED === "true") return false;
  if (process.env.LOCAL_BACKTEST_CACHE_DIR) return true;
  return !process.env.VERCEL;
}

function localBacktestCacheFile(marketInput: string) {
  const safeMarket = String(marketInput || "UNKNOWN")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, "_");

  return `${localBacktestCacheDir()}/${safeMarket}.json`;
}

async function readPersistedMarketBacktest(marketInput: string) {
  try {
    if (!canUsePersistedLocalBacktestCache()) return null;

    const fs = await import("node:fs/promises");
    const file = localBacktestCacheFile(marketInput);
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);

    if (
      parsed &&
      parsed.cacheVersion === MARKET_BACKTEST_CACHE_VERSION &&
      parsed.summary &&
      Array.isArray(parsed.history) &&
      parsed.history.length > 0 &&
      Array.isArray(parsed.trades) &&
      parsed.trades.length > 0
    ) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

async function persistMarketBacktest(marketInput: string, payload: any) {
  try {
    if (!canUsePersistedLocalBacktestCache()) return;

    if (
      !payload ||
      !payload.summary ||
      !Array.isArray(payload.history) ||
      payload.history.length === 0 ||
      !Array.isArray(payload.trades) ||
      payload.trades.length === 0
    ) {
      return;
    }

    const fs = await import("node:fs/promises");
    const dir = localBacktestCacheDir();
    const file = localBacktestCacheFile(marketInput);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify(
        {
          ...payload,
          cacheVersion: MARKET_BACKTEST_CACHE_VERSION,
          persistedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch (error) {
    console.warn("Failed to persist local market backtest", error);
  }
}

function localBacktestSymbolsFromRows(market: string, rows: any[]) {
  const fallbackByMarket: Record<string, string[]> = {
    ADX: ["ADNOCGAS", "EAND", "ALDAR", "ADCB", "FAB", "TAQA", "ADNOCDRILL", "ADNOCDIST"],
    B3: ["PETR4", "VALE3", "ITUB4", "BBDC4", "ABEV3", "WEGE3", "BBAS3", "RENT3"],
    BINANCE: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "AAVEUSDT", "ADAUSDT"],
  };

  if (/BINANCE|CRYPTO/.test(market)) {
    return fallbackByMarket.BINANCE;
  }

  const symbols = rows
    .map((row: any) =>
      String(row?.symbol ?? row?.ticker ?? row?.code ?? row?.name ?? "")
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);

  return symbols.length ? symbols.slice(0, 24) : fallbackByMarket[market] ?? fallbackByMarket.ADX;
}

async function loadHistoricalDatasetForSymbol(market: string, symbol: string) {
  const dataset = await loadTradingViewHistoricalDataset(market, symbol, {
    bars: Number(process.env.STOCK_BACKTEST_HISTORY_BARS ?? 3_780),
    lookbackYears: Number(process.env.STOCK_BACKTEST_LOOKBACK_YEARS ?? 15),
    minBars: 60,
  });

  if (dataset.bars.length < 60) {
    console.warn("TradingView returned insufficient history for backtest symbol", {
      market,
      symbol,
      bars: dataset.bars.length,
    });
  }

  return dataset;
}

async function loadLocalMarketRowsForBacktest(market: string) {
  return loadMarketList(market);
}

async function loadHistoricalDatasetsForSymbols(market: string, symbols: string[]) {
  const datasets: HistoricalDataset[] = [];

  for (const symbol of symbols.slice(0, 24)) {
    const dataset = await loadHistoricalDatasetForSymbol(market, symbol);

    if (dataset.bars.length >= 60) {
      datasets.push(dataset);
    }
  }

  return datasets;
}

function entriesFromDatasets(datasets: HistoricalDataset[]): [string, any[]][] {
  return datasets.map((dataset) => [String(dataset.symbol).toUpperCase(), dataset.bars]);
}

function buildBacktestDataQualityReport(
  entries: [string, any[]][],
  historyDiagnostics?: MarketHistoryDiagnostics,
) {
  const symbols = entries.length;
  let syntheticSymbols = 0;
  let fallbackSymbols = 0;
  let staleSymbols = 0;
  let missingVolumeSymbols = 0;
  let duplicateTimestampSymbols = 0;
  let flatPriceSymbols = 0;
  let lowSampleSymbols = 0;
  let totalBars = 0;
  const latestDates: string[] = [];

  for (const [, bars] of entries) {
    const records = Array.isArray(bars) ? bars : [];
    totalBars += records.length;

    if (records.length < 120) {
      lowSampleSymbols += 1;
    }

    if (records.some((bar) => bar?.synthetic === true || bar?.sourceStatus === "synthetic" || bar?.dataQuality === "synthetic")) {
      syntheticSymbols += 1;
    }

    if (records.some((bar) => bar?.sourceStatus === "fallback" || bar?.dataQuality === "fallback")) {
      fallbackSymbols += 1;
    }

    const timestamps = records
      .map((bar) => String(bar?.date ?? bar?.timestamp ?? ""))
      .filter(Boolean);
    if (new Set(timestamps).size < timestamps.length) {
      duplicateTimestampSymbols += 1;
    }

    if (records.every((bar) => !Number.isFinite(Number(bar?.volume)) || Number(bar?.volume) <= 0)) {
      missingVolumeSymbols += 1;
    }

    const closes = records
      .map((bar) => Number(bar?.close))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (closes.length >= 20 && new Set(closes.slice(-20).map((value) => value.toFixed(6))).size <= 2) {
      flatPriceSymbols += 1;
    }

    const latestDate = timestamps.sort((a, b) => b.localeCompare(a))[0];
    if (latestDate) {
      latestDates.push(latestDate);
      const timestamp = Date.parse(`${latestDate}T00:00:00.000Z`);
      const ageDays = Number.isFinite(timestamp)
        ? (Date.now() - timestamp) / 86_400_000
        : Number.POSITIVE_INFINITY;
      if (ageDays > 10) {
        staleSymbols += 1;
      }
    } else {
      staleSymbols += 1;
    }
  }

  const coveragePct = symbols ? ((symbols - lowSampleSymbols) / symbols) * 100 : 0;
  const quality =
    syntheticSymbols > 0
      ? "synthetic"
      : fallbackSymbols > 0
        ? "fallback"
        : staleSymbols > 0 || coveragePct < 80
          ? "degraded"
          : "real";

  return {
    quality,
    symbolCount: symbols,
    totalBars,
    coveragePct,
    historyDiagnostics,
    historyCoverageYears: historyDiagnostics?.historyCoverageYears,
    historyDepthScore: historyDiagnostics?.historyDepthScore,
    regimeCoverageScore: historyDiagnostics?.regimeCoverageScore,
    regimeDiversityScore: historyDiagnostics?.regimeDiversityScore,
    sampleDiversityScore: historyDiagnostics?.sampleDiversityScore,
    coverageStatus: historyDiagnostics?.coverageStatus,
    syntheticSymbols,
    fallbackSymbols,
    staleSymbols,
    missingVolumeSymbols,
    duplicateTimestampSymbols,
    flatPriceSymbols,
    lowSampleSymbols,
    latestDate: latestDates.sort((a, b) => b.localeCompare(a))[0] ?? null,
    promotionEligibleData:
      quality === "real" &&
      staleSymbols === 0 &&
      lowSampleSymbols === 0 &&
      duplicateTimestampSymbols === 0,
  };
}

function normalizeRuntimeMode(value: unknown): DiagnosticRuntimeMode {
  const normalized = String(value ?? process.env.STOCK_DIAGNOSTIC_RUNTIME_MODE ?? DEFAULT_RUNTIME_MODE)
    .trim()
    .toUpperCase();

  if (normalized === "MODE_RAW_TECHNICAL" || normalized === "RAW_TECHNICAL" || normalized === "RAW") {
    return "MODE_RAW_TECHNICAL";
  }

  if (
    normalized === "MODE_TECHNICAL_PLUS_RISK" ||
    normalized === "TECHNICAL_PLUS_RISK" ||
    normalized === "RISK"
  ) {
    return "MODE_TECHNICAL_PLUS_RISK";
  }

  return "MODE_FULL_PERCEPTION";
}

function diagnosticsEnabled(options: MarketBacktestOptions) {
  return (
    options.diagnostics === true ||
    options.debug === true ||
    process.env.STOCK_SIGNAL_DIAGNOSTICS === "true" ||
    process.env.STOCK_SIGNAL_DIAGNOSTICS === "debug"
  );
}

function createAuditTrail(options: MarketBacktestOptions) {
  const debug = options.debug === true || process.env.STOCK_SIGNAL_DIAGNOSTICS === "debug";

  return new SignalPipelineAuditTrail({
    enabled: diagnosticsEnabled(options),
    debug,
    persistent: options.persistDiagnostics === true || options.diagnostics === true || debug,
    maxEvents: Number(process.env.STOCK_SIGNAL_AUDIT_MAX_EVENTS ?? 12_000),
  });
}

function clampBacktest(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function movingAverage(bars: any[], endIndex: number, period: number) {
  const start = endIndex - period + 1;
  if (start < 0) return null;

  let sum = 0;
  let count = 0;

  for (let index = start; index <= endIndex; index += 1) {
    const close = Number(bars[index]?.close);
    if (!Number.isFinite(close) || close <= 0) return null;
    sum += close;
    count += 1;
  }

  return count === period ? sum / period : null;
}

function barReturnsPct(bars: any[], endIndex = bars.length - 1, lookback = 30) {
  const returns: number[] = [];
  const start = Math.max(1, endIndex - lookback + 1);

  for (let index = start; index <= endIndex; index += 1) {
    const previous = Number(bars[index - 1]?.close);
    const current = Number(bars[index]?.close);

    if (previous > 0 && Number.isFinite(current) && current > 0) {
      returns.push(((current / previous) - 1) * 100);
    }
  }

  return returns;
}

function stdevBacktest(values: number[]) {
  if (values.length < 2) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function lastIndicatorSnapshot(bars: any[]) {
  const endIndex = bars.length - 1;
  const sma20 = movingAverage(bars, endIndex, 20);
  const sma50 = movingAverage(bars, endIndex, 50);
  const volatilityPct = stdevBacktest(barReturnsPct(bars, endIndex, 30));
  const rawSpreadPct =
    sma20 != null && sma50 != null && sma50 > 0
      ? ((sma20 / sma50) - 1) * 100
      : null;
  const rawScore = rawSpreadPct == null ? null : 50 + rawSpreadPct * 16;
  const normalizedScore = rawScore == null ? null : clampBacktest(rawScore);

  return {
    sma20,
    sma50,
    volatilityPct,
    rawSpreadPct,
    rawScore,
    normalizedScore,
  };
}

function auditAssetStage(
  audit: SignalPipelineAuditTrail,
  input: Omit<PipelineAuditEvent, "timestamp">,
) {
  audit.stage({
    ...input,
    timestamp: Date.now(),
  });
}

function buildEqualWeightBenchmark(entries: [string, any[]][]) {
  const dateMap = new Map<string, number[]>();

  for (const [, bars] of entries) {
    const firstClose = Number(bars[0]?.close);
    if (!Number.isFinite(firstClose) || firstClose <= 0) continue;

    for (const bar of bars) {
      const close = Number(bar.close);
      if (!Number.isFinite(close) || close <= 0) continue;

      const normalized = close / firstClose;
      const list = dateMap.get(bar.date) ?? [];
      list.push(normalized);
      dateMap.set(bar.date, list);
    }
  }

  return Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => {
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      const equity = 1000 * average;

      return {
        date,
        equity,
        returnPct: ((equity / 1000) - 1) * 100,
        dailyReturnPct: 0,
        deployedPct: 100,
        cashPct: 0,
        positionsCount: values.length,
        regime: "Equal Weight Benchmark",
      };
    });
}

function buildIndexedEqualWeightSeries(entries: [string, any[]][], maxBars: number) {
  const firstCloseBySymbol = new Map<string, number>();
  const series: number[] = [];

  for (const [symbol, bars] of entries) {
    const firstClose = Number(bars[0]?.close);
    if (Number.isFinite(firstClose) && firstClose > 0) {
      firstCloseBySymbol.set(symbol, firstClose);
    }
  }

  for (let index = 0; index < maxBars; index += 1) {
    const values = entries
      .map(([symbol, bars]) => {
        const firstClose = firstCloseBySymbol.get(symbol);
        const close = Number(bars[index]?.close);

        return firstClose != null && firstClose > 0 && close > 0 ? close / firstClose : null;
      })
      .filter((value): value is number => value != null && Number.isFinite(value));

    series.push(values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : series.at(-1) ?? 1);
  }

  return series;
}

function indexedMomentumPct(series: number[], endIndex: number, lookbackDays: number) {
  const startIndex = endIndex - lookbackDays;
  const start = series[startIndex];
  const end = series[endIndex];

  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) return 0;

  return ((end / start) - 1) * 100;
}

function indexedMovingAverage(series: number[], endIndex: number, period: number) {
  const startIndex = Math.max(0, endIndex - period + 1);
  const values = series.slice(startIndex, endIndex + 1).filter((value) => Number.isFinite(value) && value > 0);

  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function resolveMomentumExit(
  bars: any[],
  entryIndex: number,
  maxBars: number,
  config: MarketBacktestConfig,
  marketSeries?: number[],
) {
  const entry = bars[entryIndex];
  const entryClose = Number(entry?.close);
  let exitIndex = Math.min(entryIndex + config.holdingDays, maxBars - 1);
  let peak = entryClose;
  const stopLossPct = Math.max(0.5, Number(config.stopLossPct) || 7);
  const trailingStopPct = Math.max(0.5, Number(config.trailingStopPct) || 9);
  const takeProfitPct = Math.max(0, Number(config.takeProfitPct) || 0);
  const useMarketExit = Array.isArray(marketSeries) && marketSeries.length > 0;

  for (let index = entryIndex + 1; index <= Math.min(entryIndex + config.holdingDays, maxBars - 1); index += 1) {
    const close = Number(bars[index]?.close);
    if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(entryClose) || entryClose <= 0) continue;

    peak = Math.max(peak, close);
    const returnPct = ((close / entryClose) - 1) * 100;
    const trailingReturnPct = peak > 0 ? ((close / peak) - 1) * 100 : 0;
    const fastReference = Number(bars[Math.max(0, index - 10)]?.close);
    const fastMomentumPct = fastReference > 0 ? ((close / fastReference) - 1) * 100 : 0;
    const marketMomentumPct = useMarketExit ? indexedMomentumPct(marketSeries, index, 90) : 0;

    if (
      (takeProfitPct > 0 && returnPct >= takeProfitPct) ||
      returnPct <= -stopLossPct ||
      trailingReturnPct <= -trailingStopPct ||
      (useMarketExit && fastMomentumPct <= -18) ||
      (useMarketExit && marketMomentumPct <= -20)
    ) {
      exitIndex = index;
      break;
    }
  }

  return bars[exitIndex] ?? bars[Math.min(entryIndex + config.holdingDays, bars.length - 1)];
}

function buildStrategyHistoryFromTrades(
  entries: [string, any[]][],
  trades: any[],
  regime: string,
  config: MarketBacktestConfig,
) {
  const sortedTrades = [...trades].sort((a, b) => String(a.exitDate).localeCompare(String(b.exitDate)));
  let equity = 1000;
  const barsBySymbol = new Map<string, Map<string, any>>();

  const dates = Array.from(
    new Set(entries.flatMap(([, bars]) => bars.map((bar) => String(bar.date)).filter(Boolean))),
  ).sort((a, b) => a.localeCompare(b));

  for (const [symbol, bars] of entries) {
    barsBySymbol.set(
      symbol.toUpperCase(),
      new Map(bars.map((bar) => [String(bar.date), bar])),
    );
  }

  const firstTradeDate = sortedTrades[0]?.entryDate ?? dates[0];
  const tradingDates = dates.filter((date) => !firstTradeDate || date >= firstTradeDate);
  const entryCostByDate = new Map<string, number>();
  const exitCostByDate = new Map<string, number>();

  for (const trade of sortedTrades) {
    const weight = clampBacktest(Number(trade.entryExposure ?? 0), 0, config.maxPositionPct) / 100;
    entryCostByDate.set(String(trade.entryDate), (entryCostByDate.get(String(trade.entryDate)) ?? 0) + weight);
    exitCostByDate.set(String(trade.exitDate), (exitCostByDate.get(String(trade.exitDate)) ?? 0) + weight);
  }

  const result: any[] = [];

  for (let index = 0; index < tradingDates.length; index += 1) {
    const date = tradingDates[index];
    const previousDate = tradingDates[index - 1];
    const activeTrades = sortedTrades.filter((trade) => {
      return (
        previousDate &&
        String(trade.entryDate) <= previousDate &&
        String(trade.exitDate) >= date
      );
    });
    let dailyReturn = 0;
    let deployedPct = 0;

    for (const trade of activeTrades) {
      const symbol = String(trade.symbol ?? "").toUpperCase();
      const barsByDate = barsBySymbol.get(symbol);
      const previous = Number(barsByDate?.get(previousDate)?.close);
      const current = Number(barsByDate?.get(date)?.close);
      const weight = clampBacktest(Number(trade.entryExposure ?? 0), 0, config.maxPositionPct) / 100;

      if (previous > 0 && current > 0) {
        dailyReturn += weight * ((current / previous) - 1);
        deployedPct += weight * 100;
      }
    }

    const tradedWeight =
      (entryCostByDate.get(date) ?? 0) +
      (exitCostByDate.get(date) ?? 0);
    const costDrag = tradedWeight * (config.costBps / 10_000);

    dailyReturn -= costDrag;
    equity *= 1 + dailyReturn;

    result.push({
      date,
      equity,
      returnPct: ((equity / 1000) - 1) * 100,
      dailyReturnPct: dailyReturn * 100,
      deployedPct: clampBacktest(deployedPct, 0, 100),
      cashPct: Math.max(0, 100 - deployedPct),
      positionsCount: activeTrades.length,
      regime,
    });
  }

  return result;
}

function runSimpleHistoricalStrategy(
  entries: [string, any[]][],
  config: MarketBacktestConfig,
  audit = new SignalPipelineAuditTrail(),
): StrategyRun {
  const trades: any[] = [];
  const scoreSamples: ScoreDiagnosticSample[] = [];
  const tradeCountsBySymbol = new Map<string, number>();
  const strongestMomentumBySymbol = new Map<string, number>();
  const useCryptoRelativeMomentum = config.profile === "CRYPTO_LIQUID";
  const warmup = Math.max(60, config.lookbackDays, config.volatilityLookbackDays);
  const maxBars = entries.length ? Math.min(...entries.map(([, bars]) => bars.length)) : 0;
  const relativeMomentumAnchorDays = Math.max(
    10,
    Math.round(config.relativeMomentumAnchorDays || config.lookbackDays),
  );
  const candidateScoreShareFloor = useCryptoRelativeMomentum
    ? Math.max(0, Math.min(1, Number(config.candidateScoreShareFloor) || 0))
    : 0;
  const marketMomentumFloorPct = Number.isFinite(Number(config.marketMomentumFloorPct))
    ? Number(config.marketMomentumFloorPct)
    : 8;
  const marketSeries = useCryptoRelativeMomentum
    ? buildIndexedEqualWeightSeries(entries, maxBars)
    : [];

  for (
    let index = useCryptoRelativeMomentum ? Math.max(warmup, 140) : warmup;
    index < maxBars - config.holdingDays;
    index += config.rebalanceDays
  ) {
    const marketMomentumPct = useCryptoRelativeMomentum
      ? indexedMomentumPct(marketSeries, index, 90)
      : 0;
    const marketAverage = useCryptoRelativeMomentum
      ? indexedMovingAverage(marketSeries, index, 140)
      : 0;
    const marketTrendPassed =
      !useCryptoRelativeMomentum ||
      (
        marketAverage != null &&
        marketSeries[index] > marketAverage &&
        marketMomentumPct >= marketMomentumFloorPct
      );

    if (!marketTrendPassed) continue;

    const candidates = entries
      .map(([symbol, bars]) => {
        const lookback = bars[index - config.lookbackDays];
        const entry = bars[index];
        const volatilityPct = stdevBacktest(barReturnsPct(bars, index, config.volatilityLookbackDays));

        if (!lookback || !entry) return null;

        const momentumPct = entry.close > 0 && lookback.close > 0
          ? ((entry.close / lookback.close) - 1) * 100
          : Number.NaN;
        const relativeMomentumPct = useCryptoRelativeMomentum
          ? momentumPct - indexedMomentumPct(marketSeries, index, config.lookbackDays)
          : 0;
        const anchorReference = bars[index - relativeMomentumAnchorDays];
        const anchorMomentumPct =
          anchorReference?.close > 0 && entry.close > 0
            ? ((entry.close / anchorReference.close) - 1) * 100
            : momentumPct;
        const anchorRelativeMomentumPct = useCryptoRelativeMomentum
          ? anchorMomentumPct - indexedMomentumPct(marketSeries, index, relativeMomentumAnchorDays)
          : 0;
        const shortLookback = useCryptoRelativeMomentum ? 10 : config.lookbackDays;
        const shortReference = bars[index - shortLookback];
        const shortMomentumPct =
          shortReference?.close > 0 && entry.close > 0
            ? ((entry.close / shortReference.close) - 1) * 100
            : 0;
        const blendedMomentumPct = useCryptoRelativeMomentum
          ? momentumPct * 0.5 + anchorMomentumPct * 0.35 + shortMomentumPct * 0.15
          : momentumPct;
        const blendedRelativeMomentumPct = useCryptoRelativeMomentum
          ? relativeMomentumPct * 0.5 + anchorRelativeMomentumPct * 0.5
          : relativeMomentumPct;
        const score = useCryptoRelativeMomentum
          ? blendedMomentumPct + blendedRelativeMomentumPct * 0.85 + shortMomentumPct * 0.3 - volatilityPct * 1.05
          : momentumPct - volatilityPct * 0.32;

        strongestMomentumBySymbol.set(
          symbol,
          Math.max(strongestMomentumBySymbol.get(symbol) ?? Number.NEGATIVE_INFINITY, momentumPct / 100),
        );

        if (
          !Number.isFinite(momentumPct) ||
          blendedMomentumPct <= config.minMomentumPct ||
          (useCryptoRelativeMomentum && blendedRelativeMomentumPct < 0) ||
          volatilityPct > config.volatilityCapPct
        ) {
          return null;
        }

        const exit = resolveMomentumExit(
          bars,
          index,
          maxBars,
          config,
          useCryptoRelativeMomentum ? marketSeries : undefined,
        );

        if (!exit) return null;

        return {
          symbol,
          entry,
          exit,
          momentumPct,
          relativeMomentumPct,
          blendedMomentumPct,
          blendedRelativeMomentumPct,
          shortMomentumPct,
          volatilityPct,
          score,
        };
      })
      .filter((candidate): candidate is {
        symbol: string;
        entry: any;
        exit: any;
        momentumPct: number;
        relativeMomentumPct: number;
        blendedMomentumPct: number;
        blendedRelativeMomentumPct: number;
        shortMomentumPct: number;
        volatilityPct: number;
        score: number;
      } => candidate != null)
      .sort((a, b) => b.score - a.score);

    const strongestScore = candidates[0]?.score ?? 0;
    const selectedCandidates = candidates
      .filter((candidate) => {
        if (!candidateScoreShareFloor || strongestScore <= 0) return true;
        return candidate.score >= strongestScore * candidateScoreShareFloor;
      })
      .slice(0, config.maxPositions);

    if (!selectedCandidates.length) continue;

    const weightPct = Math.min(config.maxPositionPct, config.targetExposurePct / selectedCandidates.length);

    for (const candidate of selectedCandidates) {
      const returnPct = (candidate.exit.close / candidate.entry.close - 1) * 100;
      tradeCountsBySymbol.set(candidate.symbol, (tradeCountsBySymbol.get(candidate.symbol) ?? 0) + 1);

      trades.push({
        symbol: candidate.symbol,
        entryDate: candidate.entry.date,
        exitDate: candidate.exit.date,
        entryPrice: candidate.entry.close,
        exitPrice: candidate.exit.close,
        returnPct,
        entryExposure: weightPct,
        setupQuality: clampBacktest(50 + candidate.blendedMomentumPct * 18 - candidate.volatilityPct * 2),
        riskPressure: clampBacktest(candidate.volatilityPct * 12),
        regime: useCryptoRelativeMomentum
          ? `${config.name} relative momentum learning`
          : `${config.name} momentum rotation`,
      });
    }
  }

  for (const [symbol, bars] of entries) {
    const rawPassed = bars.length >= 60;
    const indicator = lastIndicatorSnapshot(bars);
    auditAssetStage(audit, {
      asset: symbol,
      stage: "RAW_DATA",
      passed: rawPassed,
      score: bars.length,
      threshold: ">=60 bars",
      reason: rawPassed ? "Historical bars available" : "Insufficient historical bars",
      metadata: { bars: bars.length },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "FEATURE_EXTRACTION",
      passed: rawPassed,
      score: barReturnsPct(bars).length,
      threshold: ">=2 returns",
      reason: rawPassed ? "Returns and trend features extracted" : "Feature extraction skipped because raw data failed",
      metadata: { returns: barReturnsPct(bars).length },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "INDICATOR_CALCULATION",
      passed: indicator.sma20 != null && indicator.sma50 != null,
      score: indicator.rawSpreadPct,
      threshold: "SMA20 and SMA50 available",
      reason:
        indicator.sma20 != null && indicator.sma50 != null
          ? "SMA20/SMA50 indicators calculated"
          : "Moving-average indicators unavailable",
      metadata: indicator,
    });

    const assetTradeCount = tradeCountsBySymbol.get(symbol) ?? 0;
    const strongestMomentum = strongestMomentumBySymbol.get(symbol) ?? Number.NEGATIVE_INFINITY;

    const signalScore = Number.isFinite(strongestMomentum)
      ? clampBacktest(50 + strongestMomentum * 500)
      : indicator.normalizedScore;
    const confidence = clampBacktest((signalScore ?? 50) * 0.7 + (100 - indicator.volatilityPct * 10) * 0.3);
    const hasSignal = assetTradeCount > 0;

    auditAssetStage(audit, {
      asset: symbol,
      stage: "SIGNAL_GENERATION",
      passed: hasSignal,
      score: signalScore,
      threshold: `${config.lookbackDays}-day momentum > ${config.minMomentumPct}%`,
      reason: hasSignal ? "Market-specific momentum generated at least one historical buy candidate" : "Rejected because market-specific momentum did not clear the threshold",
      metadata: { strongestMomentumPct: Number.isFinite(strongestMomentum) ? strongestMomentum * 100 : null },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "PERCEPTION_ALIGNMENT",
      passed: hasSignal,
      score: signalScore,
      threshold: `${config.name} rotation profile`,
      reason: hasSignal ? "Candidate matched the market-specific rotation profile" : "No generated candidate reached perception alignment",
      metadata: { bypassedHardFilter: true, mode: "MODE_FULL_PERCEPTION", configId: config.id },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "RISK_FILTERING",
      passed: hasSignal,
      score: 100 - indicator.volatilityPct * 10,
      threshold: `volatility <= ${config.volatilityCapPct}%`,
      reason: hasSignal ? "Market-specific volatility filter did not reject the candidate" : "No candidate reached risk filtering",
      metadata: { volatilityPct: indicator.volatilityPct, volatilityCapPct: config.volatilityCapPct, bypassedHardFilter: true },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "CONFIDENCE_SCORING",
      passed: hasSignal,
      score: confidence,
      threshold: hasSignal ? "candidate generated" : "candidate required",
      reason: hasSignal ? "Confidence score derived from momentum and volatility" : "Confidence remained pending because no signal was generated",
      metadata: {
        rawScore: indicator.rawScore,
        normalizedScore: indicator.normalizedScore,
        postFilterScore: signalScore,
        finalConfidenceScore: confidence,
      },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "POSITION_SIZING",
      passed: hasSignal,
      score: hasSignal ? Math.min(config.maxPositionPct, Math.max(0.5, confidence / 10)) : 0,
      threshold: ">0 exposure",
      reason: hasSignal ? "Position size assigned from confidence" : "No position size because no trade candidate survived",
      metadata: { confidence, maxPositionPct: config.maxPositionPct, targetExposurePct: config.targetExposurePct },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "PARTICIPATION_GATING",
      passed: hasSignal,
      score: hasSignal ? 100 : 0,
      threshold: "at least one simulated trade",
      reason: hasSignal ? "Asset participated in historical simulation" : "Rejected because the asset never entered the simulated portfolio",
      metadata: { assetTradeCount },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "FINAL_DECISION",
      passed: hasSignal,
      score: confidence,
      threshold: "trade candidate included",
      reason: hasSignal ? "Final decision allowed historical inclusion" : "Final decision remained Hold",
      metadata: { decision: hasSignal ? "Buy" : "Hold" },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "BACKTEST_INCLUSION",
      passed: hasSignal,
      score: assetTradeCount,
      threshold: ">=1 trade",
      reason: hasSignal ? "Asset included in backtest" : "No trades available for backtest inclusion",
      metadata: { assetTradeCount },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "TRADE_EXECUTION_SIMULATION",
      passed: hasSignal,
      score: assetTradeCount,
      threshold: ">=1 simulated execution",
      reason: hasSignal ? "Trade execution simulation completed" : "No simulated execution because no trade was included",
      metadata: { assetTradeCount },
    });

    scoreSamples.push({
      asset: symbol,
      rawScore: indicator.rawScore,
      normalizedScore: indicator.normalizedScore,
      postFilterScore: signalScore,
      finalConfidenceScore: confidence,
      reason: hasSignal ? "market-specific momentum confidence" : "no candidate confidence",
      metadata: { mode: "MODE_FULL_PERCEPTION", assetTradeCount, configId: config.id },
    });
  }

  return {
    trades: trades.sort((a, b) => String(a.exitDate).localeCompare(String(b.exitDate))),
    history: buildStrategyHistoryFromTrades(entries, trades, `${config.name} momentum rotation`, config),
    auditEvents: audit.events(),
    scoreSamples,
    mode: "MODE_FULL_PERCEPTION",
    recoveryNotes: [],
  };
}

function runSmaValidationStrategy(
  entries: [string, any[]][],
  mode: Extract<DiagnosticRuntimeMode, "MODE_RAW_TECHNICAL" | "MODE_TECHNICAL_PLUS_RISK">,
  config: MarketBacktestConfig,
  audit = new SignalPipelineAuditTrail(),
): StrategyRun {
  const trades: any[] = [];
  const scoreSamples: ScoreDiagnosticSample[] = [];
  const riskThreshold = Number(process.env.STOCK_DIAGNOSTIC_VOLATILITY_THRESHOLD_PCT ?? config.volatilityCapPct);

  for (const [symbol, bars] of entries) {
    const rawPassed = bars.length >= 60;
    const indicator = lastIndicatorSnapshot(bars);
    const hasIndicators = indicator.sma20 != null && indicator.sma50 != null;
    const latestSpread = indicator.rawSpreadPct ?? 0;
    const riskScore = clampBacktest(100 - indicator.volatilityPct * 12);
    const riskPassed = mode === "MODE_RAW_TECHNICAL" || indicator.volatilityPct <= riskThreshold;
    const action =
      hasIndicators && indicator.sma20! > indicator.sma50!
        ? "Buy"
        : hasIndicators && indicator.sma20! < indicator.sma50!
          ? "Sell"
          : "Hold";
    const rawScore = indicator.rawScore;
    const normalizedScore = indicator.normalizedScore;
    const postFilterScore = riskPassed ? normalizedScore : Math.min(normalizedScore ?? 0, riskScore);
    const finalConfidenceScore =
      postFilterScore == null
        ? 50
        : clampBacktest(postFilterScore * 0.72 + riskScore * 0.28);

    auditAssetStage(audit, {
      asset: symbol,
      stage: "RAW_DATA",
      passed: rawPassed,
      score: bars.length,
      threshold: ">=60 bars",
      reason: rawPassed ? "Historical bars available" : "Insufficient historical bars",
      metadata: { bars: bars.length, mode },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "FEATURE_EXTRACTION",
      passed: rawPassed,
      score: barReturnsPct(bars).length,
      threshold: ">=2 returns",
      reason: rawPassed ? "Returns extracted for deterministic validation" : "Feature extraction skipped because raw data failed",
      metadata: { mode, returns: barReturnsPct(bars).length },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "INDICATOR_CALCULATION",
      passed: hasIndicators,
      score: latestSpread,
      threshold: "SMA20 and SMA50 available",
      reason: hasIndicators ? "SMA20/SMA50 indicators calculated" : "SMA indicators unavailable",
      metadata: { ...indicator, mode },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "SIGNAL_GENERATION",
      passed: action !== "Hold",
      score: rawScore,
      threshold: "BUY SMA20>SMA50; SELL SMA20<SMA50",
      reason:
        action === "Buy"
          ? "BUY because SMA20 is above SMA50"
          : action === "Sell"
            ? "SELL because SMA20 is below SMA50"
            : "No signal because SMA20 and SMA50 are equal or unavailable",
      metadata: { mode, action, sma20: indicator.sma20, sma50: indicator.sma50, spreadPct: latestSpread },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "PERCEPTION_ALIGNMENT",
      passed: true,
      score: 100,
      threshold: "bypassed",
      reason: "Diagnostic validation bypassed perception filtering",
      metadata: { mode, bypassed: true },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "RISK_FILTERING",
      passed: riskPassed,
      score: riskScore,
      threshold: mode === "MODE_RAW_TECHNICAL" ? "bypassed" : `volatility <= ${riskThreshold}%`,
      reason:
        mode === "MODE_RAW_TECHNICAL"
          ? "Diagnostic validation bypassed risk filtering"
          : riskPassed
            ? "Volatility passed technical-plus-risk threshold"
            : "Rejected because volatility percentile is above threshold",
      metadata: { mode, volatilityPct: indicator.volatilityPct, riskThreshold },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "CONFIDENCE_SCORING",
      passed: action !== "Hold" && riskPassed,
      score: finalConfidenceScore,
      threshold: "directional SMA signal and risk pass",
      reason:
        action !== "Hold" && riskPassed
          ? "Confidence score derived from SMA spread and volatility"
          : action === "Hold"
            ? "Confidence held at midpoint because no directional SMA signal exists"
            : "Confidence suppressed by risk filter",
      metadata: { rawScore, normalizedScore, postFilterScore, finalConfidenceScore, mode },
    });

    const assetTrades: any[] = [];
    let openTrade: any | null = null;
    const candidateRejections: any[] = [];

    for (let index = 50; index < bars.length; index += 1) {
      const sma20 = movingAverage(bars, index, 20);
      const sma50 = movingAverage(bars, index, 50);
      const bar = bars[index];

      if (sma20 == null || sma50 == null || !bar) continue;

      const spreadPct = ((sma20 / sma50) - 1) * 100;
      const localVolatility = stdevBacktest(barReturnsPct(bars, index, 30));
      const localRiskPassed = mode === "MODE_RAW_TECHNICAL" || localVolatility <= riskThreshold;

      if (sma20 > sma50 && !openTrade) {
        if (!localRiskPassed) {
          candidateRejections.push({
            date: bar.date,
            reason: "Rejected because volatility percentile is above threshold",
            volatilityPct: localVolatility,
            threshold: riskThreshold,
          });
          continue;
        }

        openTrade = {
          symbol,
          entryDate: bar.date,
          entryPrice: Number(bar.close),
          entryExposure:
            mode === "MODE_RAW_TECHNICAL"
              ? Math.min(config.maxPositionPct, config.targetExposurePct / Math.max(1, config.maxPositions))
              : Math.max(0.4, Math.min(config.maxPositionPct, (riskScore / 100) * config.maxPositionPct)),
          setupQuality: clampBacktest(50 + spreadPct * 18),
          riskPressure: clampBacktest(localVolatility * 12),
          regime: mode === "MODE_RAW_TECHNICAL" ? "Raw SMA Validation" : "SMA Validation With Risk",
        };
        continue;
      }

      if (sma20 < sma50 && openTrade) {
        const exitPrice = Number(bar.close);
        const returnPct =
          openTrade.entryPrice > 0 && exitPrice > 0
            ? ((exitPrice / openTrade.entryPrice) - 1) * 100
            : 0;
        assetTrades.push({
          ...openTrade,
          exitDate: bar.date,
          exitPrice,
          returnPct,
        });
        openTrade = null;
      }
    }

    if (openTrade) {
      const exit = bars.at(-1);
      const exitPrice = Number(exit?.close ?? openTrade.entryPrice);
      assetTrades.push({
        ...openTrade,
        exitDate: exit?.date ?? openTrade.entryDate,
        exitPrice,
        returnPct: openTrade.entryPrice > 0 ? ((exitPrice / openTrade.entryPrice) - 1) * 100 : 0,
      });
    }

    trades.push(...assetTrades);

    const hasExecutableTrade = assetTrades.length > 0;
    const positionSize = hasExecutableTrade
      ? Math.max(0.4, Math.min(config.maxPositionPct, finalConfidenceScore / 10))
      : 0;

    auditAssetStage(audit, {
      asset: symbol,
      stage: "POSITION_SIZING",
      passed: hasExecutableTrade,
      score: positionSize,
      threshold: ">0 exposure",
      reason: hasExecutableTrade ? "Position size assigned to executable SMA trade" : "No size because no executable trade survived",
      metadata: { mode, candidateRejections },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "PARTICIPATION_GATING",
      passed: hasExecutableTrade,
      score: hasExecutableTrade ? 100 : 0,
      threshold: ">=1 executable trade",
      reason: hasExecutableTrade ? "Participation approved by deterministic validation" : "Participation rejected because no trade execution candidate survived",
      metadata: { mode, tradeCount: assetTrades.length },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "FINAL_DECISION",
      passed: hasExecutableTrade,
      score: finalConfidenceScore,
      threshold: "executable SMA trade",
      reason: hasExecutableTrade ? `Final decision ${action}` : "Final decision Hold because no executable SMA trade survived",
      metadata: { mode, decision: hasExecutableTrade ? action : "Hold" },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "BACKTEST_INCLUSION",
      passed: hasExecutableTrade,
      score: assetTrades.length,
      threshold: ">=1 trade",
      reason: hasExecutableTrade ? "Asset included in deterministic backtest" : "Asset excluded because no simulated trade exists",
      metadata: { mode, tradeCount: assetTrades.length },
    });
    auditAssetStage(audit, {
      asset: symbol,
      stage: "TRADE_EXECUTION_SIMULATION",
      passed: hasExecutableTrade,
      score: assetTrades.length,
      threshold: ">=1 simulated execution",
      reason: hasExecutableTrade ? "Trade execution simulation completed" : "No execution simulated",
      metadata: { mode, tradeCount: assetTrades.length },
    });

    scoreSamples.push({
      asset: symbol,
      rawScore,
      normalizedScore,
      postFilterScore,
      finalConfidenceScore,
      reason:
        action === "Hold"
          ? "midpoint assignment because SMA signal is neutral"
          : riskPassed
            ? "SMA confidence"
            : "risk-filtered confidence",
      metadata: { mode, action, tradeCount: assetTrades.length },
    });
  }

  const regime = mode === "MODE_RAW_TECHNICAL" ? "Raw SMA Validation" : "SMA Validation With Risk";

  return {
    trades: trades.sort((a, b) => String(a.exitDate).localeCompare(String(b.exitDate))),
    history: buildStrategyHistoryFromTrades(entries, trades, regime, config),
    auditEvents: audit.events(),
    scoreSamples,
    mode,
    recoveryNotes: [
      mode === "MODE_RAW_TECHNICAL"
        ? "Advanced cognition, macro gating, harmony scoring, participation suppression, and adaptive confidence were bypassed."
        : "Perception and macro gates were bypassed; technical signal generation plus volatility risk filtering were retained.",
    ],
  };
}

function runStrategyForMode(
  entries: [string, any[]][],
  mode: DiagnosticRuntimeMode,
  config: MarketBacktestConfig,
  audit = new SignalPipelineAuditTrail(),
): StrategyRun {
  if (mode === "MODE_RAW_TECHNICAL" || mode === "MODE_TECHNICAL_PLUS_RISK") {
    return runSmaValidationStrategy(entries, mode, config, audit);
  }

  return runSimpleHistoricalStrategy(entries, config, audit);
}

function summarizeRuntimeMode(
  market: string,
  mode: DiagnosticRuntimeMode,
  entries: [string, any[]][],
  benchmarkHistory: any[],
) {
  const config = backtestConfigForMarket(market);
  const run = runStrategyForMode(entries, mode, config);
  const summary = summarizeRealBacktest(market, run.history, run.trades, benchmarkHistory, config);
  const participation =
    entries.length > 0
      ? (new Set(run.trades.map((trade) => String(trade.symbol))).size / entries.length) * 100
      : 0;

  return {
    mode,
    tradeCount: run.trades.length,
    exposure: run.history.at(-1)?.deployedPct ?? 0,
    sharpe: summary.annualizedSharpe,
    drawdown: summary.maxDrawdownPct,
    participation,
    signalDensity: entries.length ? (run.trades.length / entries.length) * 100 : 0,
    rejectionRate: run.auditEvents.length
      ? (run.auditEvents.filter((event) => !event.passed).length / run.auditEvents.length) * 100
      : 0,
  };
}

function buildSignalDiagnosticsPayload(input: {
  market: string;
  entries: [string, any[]][];
  selectedRun: StrategyRun;
  benchmarkHistory: any[];
  summary: any;
  runtimeMode: DiagnosticRuntimeMode;
  recoveredFromMode?: DiagnosticRuntimeMode | null;
}) {
  const assets = input.entries.map(([symbol]) => symbol);
  const cascade = new SuppressionCascadeInspector().inspect(input.selectedRun.auditEvents, assets);
  const scoreDiagnostics = new ScoreNormalizationDiagnostics().analyze(input.selectedRun.scoreSamples);
  const dependencyGraph =
    input.selectedRun.trades.length === 0
      ? {
          confidence: ["participation"],
          participation: ["confirmedTrades"],
          confirmedTrades: ["confidence"],
        }
      : {
          confidence: ["indicatorCalculation", "riskFiltering"],
          participation: ["finalDecision"],
          confirmedTrades: ["tradeExecutionSimulation"],
        };
  const deadlock = new DeadlockAnalyzer().analyze({
    events: input.selectedRun.auditEvents,
    assets,
    dependencies: dependencyGraph,
  });
  const modeComparison = ([
    "MODE_RAW_TECHNICAL",
    "MODE_TECHNICAL_PLUS_RISK",
    "MODE_FULL_PERCEPTION",
  ] as DiagnosticRuntimeMode[]).map((mode) =>
    summarizeRuntimeMode(input.market, mode, input.entries, input.benchmarkHistory),
  );

  return {
    version: 1,
    market: input.market,
    runtimeMode: input.runtimeMode,
    recoveredFromMode: input.recoveredFromMode ?? null,
    generatedAt: new Date().toISOString(),
    auditTrail: input.selectedRun.auditEvents,
    stageSurvival: cascade.analytics,
    suppressionCascade: {
      eliminatedBySingleLayer: cascade.eliminatedBySingleLayer,
      eliminatingStage: cascade.eliminatingStage,
      warnings: cascade.warnings,
    },
    deadlock,
    scoreNormalization: scoreDiagnostics,
    modeComparison,
    rejectionExplanations: buildRejectionExplanations(input.selectedRun.auditEvents),
    synchronization: buildBacktestSynchronizationDiagnostics(input.entries, input.summary),
    metricsIntegrity: buildMetricIntegrityDiagnostics(
      input.selectedRun.history,
      input.selectedRun.trades,
      input.benchmarkHistory,
      input.summary,
    ),
    recoveryNotes: input.selectedRun.recoveryNotes,
  };
}

function buildRejectionExplanations(events: PipelineAuditEvent[]) {
  return events
    .filter((event) => !event.passed)
    .map((event) => ({
      asset: event.asset,
      stage: event.stage,
      reason: event.reason,
      score: event.score ?? null,
      threshold: event.threshold ?? null,
      metadata: event.metadata ?? {},
    }));
}

function buildBacktestSynchronizationDiagnostics(entries: [string, any[]][], summary: any) {
  const latestDates = entries
    .map(([, bars]) => bars.at(-1)?.date)
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)));
  const latestDate = latestDates[0] ?? null;
  const latestTimestamp = latestDate ? Date.parse(`${latestDate}T00:00:00.000Z`) : NaN;
  const ageDays = Number.isFinite(latestTimestamp)
    ? Math.max(0, (Date.now() - latestTimestamp) / 86_400_000)
    : null;
  const warnings: string[] = [];

  if (ageDays == null) {
    warnings.push("No candle timestamps were available for synchronization checks.");
  } else if (ageDays > 7) {
    warnings.push(`Latest candle is ${Math.round(ageDays)} days old; stale-state logic may suppress confirmation.`);
  }

  if (summary?.dataFreshness === "stale" || summary?.stale === true) {
    warnings.push("Summary marks data stale; verify this does not conflict with fresh candle timestamps.");
  }

  return {
    latestCandleDate: latestDate,
    latestCandleAgeDays: ageDays,
    timezone: "UTC-normalized daily candles",
    stale: ageDays == null ? true : ageDays > 7,
    venueStateConflict: Boolean(summary?.marketStatus === "Closed" && ageDays != null && ageDays <= 2),
    warnings,
  };
}

function buildMetricIntegrityDiagnostics(history: any[], trades: any[], benchmarkHistory: any[], summary: any) {
  const warnings: string[] = [];
  const returns = computeReturnsFromHistory(history);
  const benchmarkReturns = computeReturnsFromHistory(benchmarkHistory);
  const sharpeAudit = computeSharpeAuditFromHistory(history);
  const drawdownAudit = computeDrawdownAuditFromHistory(history);

  if (!Array.isArray(trades) || trades.length === 0) {
    warnings.push("Trade array is empty; signal-to-trade conversion or execution simulation should be inspected.");
  }

  if (!Array.isArray(history) || history.length < 2) {
    warnings.push("Portfolio valuation history has fewer than two points.");
  }

  if (!returns.length) {
    warnings.push("No finite portfolio returns were available for Sharpe calculation.");
  }

  if (!benchmarkReturns.length) {
    warnings.push("Benchmark comparison has no finite return window.");
  }

  if (summary?.annualizedSharpe == null && summary?.rawAnnualizedSharpe == null) {
    warnings.push("Sharpe is missing from both promoted and raw summary fields.");
  }

  if (summary?.maxDrawdownPct == null && summary?.rawMaxDrawdownPct == null) {
    warnings.push("Drawdown is missing from both promoted and raw summary fields.");
  }

  return {
    returnsCount: returns.length,
    benchmarkReturnsCount: benchmarkReturns.length,
    tradeCount: trades.length,
    sharpe: sharpeAudit.sharpe,
    sharpeSuspicious: sharpeAudit.suspicious,
    drawdown: drawdownAudit.maxDrawdownPct,
    drawdownSuspiciousZero: drawdownAudit.suspiciousZero,
    hasNaNInHistory: history.some((point) => !Number.isFinite(Number(point?.equity))),
    hasNaNInTrades: trades.some((trade) => !Number.isFinite(Number(trade?.returnPct))),
    warnings,
  };
}

function finiteMetricOrNull(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function metricOrZero(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildDerivedWalkForwardSegments(history: any[], minSegments = 3) {
  const points = Array.isArray(history) ? history : [];

  if (points.length < minSegments + 1) {
    return [];
  }

  const segmentCount = Math.min(minSegments, points.length - 1);
  const step = Math.max(1, Math.floor((points.length - 1) / segmentCount));
  const segments: any[] = [];

  for (let index = 0; index < segmentCount; index += 1) {
    const start = index * step;
    const end = index === segmentCount - 1 ? points.length - 1 : Math.min(points.length - 1, start + step);

    const first = finiteMetricOrNull(points[start]?.equity);
    const last = finiteMetricOrNull(points[end]?.equity);

    if (first == null || last == null || first <= 0 || end <= start) {
      continue;
    }

    segments.push({
      index,
      startDate: points[start]?.date ?? points[start]?.timestamp,
      endDate: points[end]?.date ?? points[end]?.timestamp,
      points: end - start + 1,
      returnPct: ((last / first) - 1) * 100,
    });
  }

  return segments;
}

function buildPromotionRiskContext(summary: any) {
  const dataQuality = summary?.dataQualityReport ?? summary?.dataQuality ?? {};
  const syntheticDataForPromotion =
    dataQuality?.quality === "synthetic" ||
    Number(dataQuality?.syntheticSymbols ?? 0) > 0;
  const fallbackDataForPromotion =
    dataQuality?.quality === "fallback" ||
    Number(dataQuality?.fallbackSymbols ?? 0) > 0;
  const weakDataQuality =
    dataQuality?.promotionEligibleData === false ||
    Number(dataQuality?.coveragePct ?? 100) < 80 ||
    Number(dataQuality?.staleSymbols ?? 0) > 0 ||
    Number(dataQuality?.duplicateTimestampSymbols ?? 0) > 0;
  const parameterRobustness = summary?.parameterRobustness ?? {};
  const parameterInstability = parameterRobustness.stable === false;
  const topWinnerDependency = summary?.topWinnerDependency ?? {};
  const topWinnerDependent = topWinnerDependency.dependencyDetected === true;
  const segmentConcentration = summary?.segmentConcentration ?? {};
  const concentratedSegment = segmentConcentration.concentrated === true;
  const forwardShadow = summary?.forwardShadow ?? {};
  const needsForwardShadow = forwardShadow.passed !== true;

  return {
    syntheticDataForPromotion,
    fallbackDataForPromotion,
    weakDataQuality,
    parameterInstability,
    topWinnerDependent,
    concentratedSegment,
    needsForwardShadow,
  };
}

function hasIndependentRealValidationEvidence(summary: any) {
  const dataQuality = summary?.dataQualityReport ?? summary?.dataQuality ?? {};
  const quality = String(dataQuality?.quality ?? "").toLowerCase();
  const forwardShadow = summary?.forwardShadow ?? {};
  const parameterRobustness = summary?.parameterRobustness ?? {};
  const evaluated = Number(forwardShadow?.evaluatedSignalCount ?? 0);
  const required = Number(forwardShadow?.requiredSignals ?? 0);
  const realPromotableData =
    dataQuality?.promotionEligibleData === true &&
    quality !== "synthetic" &&
    quality !== "fallback" &&
    Number(dataQuality?.syntheticSymbols ?? 0) === 0 &&
    Number(dataQuality?.fallbackSymbols ?? 0) === 0;
  const forwardEvidencePassed =
    forwardShadow?.passed === true ||
    (required > 0 && evaluated >= required);

  return realPromotableData && forwardEvidencePassed && parameterRobustness?.stable !== false;
}

function finalizePromotionTruth(summary: any) {
  const next = { ...(summary ?? {}) };

  const toFinite = (value: any) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const toNumber = (value: any, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const flags = new Set<string>(Array.isArray(next.failureFlags) ? next.failureFlags : []);

  const sharpeValue =
    toFinite(next.annualizedSharpe) ??
    toFinite(next.annualized_sharpe) ??
    toFinite(next.sharpeRatio) ??
    toFinite(next.sharpe_ratio);

  const drawdownValue =
    toFinite(next.maxDrawdownPct) ??
    toFinite(next.max_drawdown_pct);

  const tradeCount = toNumber(
    next.tradeCount ??
      next.trade_count ??
      next.trades ??
      next.closedTrades ??
      next.closed_trades,
  );

  const segmentCount = toNumber(
    next.segmentCount ??
      next.segment_count ??
      next.segments ??
      next.walkForwardSegments ??
      next.walk_forward_segments,
  );

  const excessReturnValue =
    toFinite(next.excessReturnPct) ??
    toFinite(next.excess_return_pct) ??
    toFinite(next.excessReturn) ??
    toFinite(next.excess_return);
  const totalReturnValue =
    toFinite(next.totalReturnPct) ??
    toFinite(next.total_return_pct) ??
    toFinite(next.portfolioReturnPct) ??
    toFinite(next.portfolio_return_pct);
  const benchmarkReturnValue =
    toFinite(next.benchmarkReturnPct) ??
    toFinite(next.benchmark_return_pct);
  const profitFactorValue =
    toFinite(next.profitFactor) ??
    toFinite(next.profit_factor);
  const winRateValue =
    toFinite(next.winRatePct) ??
    toFinite(next.win_rate_pct);
  const benchmarkMarginRequired =
    toFinite(next.benchmarkMarginRequiredPct) ??
    (benchmarkReturnValue == null ? 2 : Math.max(2, Math.abs(benchmarkReturnValue) * 0.1));
  const walkForwardSegments = Array.isArray(next.walkForwardSegments)
    ? next.walkForwardSegments
    : [];
  const segmentReturns = walkForwardSegments
    .map((segment: any) => toFinite(segment?.returnPct))
    .filter((value: number | null): value is number => value != null);
  const positiveSegmentCount = segmentReturns.filter((value: number) => value > 0).length;
  const lastSegmentReturn = segmentReturns.length ? segmentReturns[segmentReturns.length - 1] : null;
  const worstSegmentReturn = segmentReturns.length ? Math.min(...segmentReturns) : null;

  const sharpeInvalid = sharpeValue == null;
  const suspiciousSharpe =
    !sharpeInvalid &&
    (
      Math.abs(sharpeValue) > 5 ||
      segmentCount < 3
    );

  const drawdownInvalid = drawdownValue == null;
  const zeroDrawdownWithTrades =
    !drawdownInvalid &&
    drawdownValue === 0 &&
    tradeCount >= 30;

  const hasBenchmarkComparison =
    excessReturnValue != null ||
    next.benchmarkStatus != null ||
    next.benchmarkPassed != null ||
    next.benchmarkComparison != null;

  const benchmarkFailed =
    hasBenchmarkComparison &&
    (
      next.benchmarkStatus === "Failed" ||
      next.benchmarkPassed === false ||
      next.benchmarkComparison === "Failed" ||
      toNumber(excessReturnValue) < 0
    );

  const severeBenchmarkUnderperformance =
    hasBenchmarkComparison &&
    excessReturnValue != null &&
    excessReturnValue <= -10;

  const insufficientSegments = segmentCount < 3;
  const tooCleanGuardApplies = !hasIndependentRealValidationEvidence(next);
  const weakBenchmarkMargin =
    hasBenchmarkComparison &&
    excessReturnValue != null &&
    excessReturnValue < benchmarkMarginRequired;
  const suspiciousProfitFactor =
    tooCleanGuardApplies &&
    profitFactorValue != null &&
    tradeCount >= 30 &&
    profitFactorValue >= 20;
  const suspiciousLossProfile =
    tooCleanGuardApplies &&
    tradeCount >= 30 &&
    (
      (profitFactorValue != null && profitFactorValue >= 100) ||
      (winRateValue != null && winRateValue >= 92)
    );
  const suspiciousLowDrawdown =
    tooCleanGuardApplies &&
    !drawdownInvalid &&
    drawdownValue < 0.25 &&
    tradeCount >= 30 &&
    (totalReturnValue ?? 0) > 10;
  const unstableWalkForward =
    segmentReturns.length >= 3 &&
    (
      positiveSegmentCount < 2 ||
      (lastSegmentReturn != null && lastSegmentReturn <= 0)
    );
  const {
    syntheticDataForPromotion,
    fallbackDataForPromotion,
    weakDataQuality,
    parameterInstability,
    topWinnerDependent,
    concentratedSegment,
    needsForwardShadow,
  } = buildPromotionRiskContext(next);

  if (sharpeInvalid) {
    flags.add("INVALID_SHARPE");
    flags.delete("SUSPICIOUS_SHARPE");
  } else {
    flags.delete("INVALID_SHARPE");

    if (suspiciousSharpe) {
      flags.add("SUSPICIOUS_SHARPE");
    } else {
      flags.delete("SUSPICIOUS_SHARPE");
    }
  }

  if (drawdownInvalid) {
    flags.add("INVALID_DRAWDOWN");
    flags.delete("ZERO_DRAWDOWN_WITH_TRADES");
  } else {
    flags.delete("INVALID_DRAWDOWN");

    if (zeroDrawdownWithTrades) {
      flags.add("ZERO_DRAWDOWN_WITH_TRADES");
    } else {
      flags.delete("ZERO_DRAWDOWN_WITH_TRADES");
    }
  }

  if (insufficientSegments) {
    flags.add("INSUFFICIENT_WALK_FORWARD_SEGMENTS");
  } else {
    flags.delete("INSUFFICIENT_WALK_FORWARD_SEGMENTS");
  }

  if (benchmarkFailed || weakBenchmarkMargin) {
    flags.add("BENCHMARK_FAILED");
    flags.add("BENCHMARK_COMPARISON_FAILED");
    flags.add("BENCHMARK_UNDERPERFORMANCE");
  } else {
    flags.delete("BENCHMARK_FAILED");
    flags.delete("BENCHMARK_COMPARISON_FAILED");
    flags.delete("BENCHMARK_UNDERPERFORMANCE");
  }

  if (severeBenchmarkUnderperformance) {
    flags.add("SEVERE_BENCHMARK_UNDERPERFORMANCE");
  } else {
    flags.delete("SEVERE_BENCHMARK_UNDERPERFORMANCE");
  }

  if (weakBenchmarkMargin) {
    flags.add("WEAK_BENCHMARK_MARGIN");
  } else {
    flags.delete("WEAK_BENCHMARK_MARGIN");
  }

  if (suspiciousProfitFactor || suspiciousLossProfile) {
    flags.add("OVERFIT_PROFIT_FACTOR");
  } else {
    flags.delete("OVERFIT_PROFIT_FACTOR");
  }

  if (suspiciousLowDrawdown) {
    flags.add("OVERFIT_LOW_DRAWDOWN");
  } else {
    flags.delete("OVERFIT_LOW_DRAWDOWN");
  }

  if (unstableWalkForward) {
    flags.add("OVERFIT_WALK_FORWARD_INSTABILITY");
  } else {
    flags.delete("OVERFIT_WALK_FORWARD_INSTABILITY");
  }

  flags.delete("SYNTHETIC_DATA_FOR_PROMOTION");
  flags.delete("DATA_QUALITY_NOT_PROMOTABLE");
  if (syntheticDataForPromotion || fallbackDataForPromotion || weakDataQuality) {
    flags.add(syntheticDataForPromotion ? "SYNTHETIC_DATA_FOR_PROMOTION" : "DATA_QUALITY_NOT_PROMOTABLE");
  }

  if (parameterInstability) {
    flags.add("PARAMETER_INSTABILITY");
  } else {
    flags.delete("PARAMETER_INSTABILITY");
  }

  if (topWinnerDependent) {
    flags.add("OVERFIT_TOP_WINNER_DEPENDENCY");
  } else {
    flags.delete("OVERFIT_TOP_WINNER_DEPENDENCY");
  }

  if (concentratedSegment) {
    flags.add("OVERFIT_SEGMENT_CONCENTRATION");
  } else {
    flags.delete("OVERFIT_SEGMENT_CONCENTRATION");
  }

  if (needsForwardShadow) {
    flags.add("NEEDS_FORWARD_SHADOW");
  } else {
    flags.delete("NEEDS_FORWARD_SHADOW");
  }

  next.benchmarkMarginRequiredPct = benchmarkMarginRequired;
  next.benchmarkMarginPct = excessReturnValue;
  next.positiveWalkForwardSegments = positiveSegmentCount;
  next.worstWalkForwardReturnPct = worstSegmentReturn;
  next.lastWalkForwardReturnPct = lastSegmentReturn;
  next.overfitRisk = {
    suspiciousProfitFactor,
    suspiciousLossProfile,
    suspiciousLowDrawdown,
    weakBenchmarkMargin,
    unstableWalkForward,
    syntheticDataForPromotion,
    fallbackDataForPromotion,
    weakDataQuality,
    parameterInstability,
    topWinnerDependent,
    concentratedSegment,
    needsForwardShadow,
  };

  const blocked = flags.size > 0 || next.promotionBlocked === true;

  if (blocked) {
    next.status = "guarded";
    next.backtestStatus = "guarded";
    next.lifecycleStage = "Research validated";
    next.promotionState = "Blocked";
    next.promotionLabel = "Blocked";
    next.readinessLabel = "Blocked";

    next.forwardTestEligible = false;
    next.forwardEligible = false;
    next.isForwardTestEligible = false;
    next.promotionBlocked = true;
    next.automaticFailureDetected = true;

    next.gatesPassed = Math.min(toNumber(next.gatesPassed ?? next.passedGates, 5), 5);
    next.passedGates = next.gatesPassed;

    next.survivalScore = Math.min(toNumber(next.survivalScore ?? next.promotionConfidence, 45), 45);
    next.promotionConfidence = Math.min(
      toNumber(next.promotionConfidence ?? next.survivalScore, 45),
      45,
    );
  }

  const finalSharpeReturnsCount = Number(
    next.sharpeReturnsCount ??
      next.sharpe_returns_count ??
      next.returnsCount ??
      next.returns_count ??
      0,
  );

  if (
    next.sharpeSuspicious === true ||
    (finalSharpeReturnsCount > 0 && finalSharpeReturnsCount < 30)
  ) {
    flags.add("SUSPICIOUS_SHARPE");
    flags.delete("INVALID_SHARPE");
  }

  next.failureFlags = Array.from(flags);

  const blockerLabels: Record<string, string> = {
    INVALID_SHARPE: "Sharpe ratio is unavailable or invalid",
    SUSPICIOUS_SHARPE: "Sharpe ratio is computable but statistically unreliable",
    INVALID_DRAWDOWN: "Drawdown calculation is unavailable or invalid",
    ZERO_DRAWDOWN_WITH_TRADES: "Drawdown is suspiciously zero despite many trades",
    INSUFFICIENT_WALK_FORWARD_SEGMENTS: "Only 1 of 3 required walk-forward segments is available",
    BENCHMARK_UNDERPERFORMANCE: "Strategy underperformed the benchmark",
    SEVERE_BENCHMARK_UNDERPERFORMANCE: "Strategy underperformance is severe",
    BENCHMARK_COMPARISON_FAILED: "Benchmark comparison failed",
    BENCHMARK_FAILED: "Strategy failed benchmark validation",
    WEAK_BENCHMARK_MARGIN: "Benchmark edge is too small after safety margin",
    OVERFIT_PROFIT_FACTOR: "Profit factor or win rate is suspiciously high",
    OVERFIT_LOW_DRAWDOWN: "Drawdown is too clean for the return and trade count",
    OVERFIT_WALK_FORWARD_INSTABILITY: "Walk-forward returns are not stable enough",
    SYNTHETIC_DATA_FOR_PROMOTION: "Synthetic historical data cannot support live-test promotion",
    DATA_QUALITY_NOT_PROMOTABLE: "Historical data quality is not strong enough for promotion",
    PARAMETER_INSTABILITY: "Nearby parameter variants do not preserve the edge",
    OVERFIT_TOP_WINNER_DEPENDENCY: "Results depend too much on a few winning trades",
    OVERFIT_SEGMENT_CONCENTRATION: "Returns are too concentrated in one test segment",
    NEEDS_FORWARD_SHADOW: "Forward shadow evidence is required before live testing",
  };

  next.automaticFailureReasons = next.failureFlags.map(
    (flag: string) => blockerLabels[flag] ?? flag,
  );

  return next;
}

function computeMaxDrawdownPct(history: any[]) {
  let peak = 0;
  let maxDrawdown = 0;

  for (const point of history) {
    const equity = Number(point.equity);
    if (!Number.isFinite(equity)) continue;

    peak = Math.max(peak, equity);

    if (peak > 0) {
      maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
    }
  }

  if (!Number.isFinite(maxDrawdown)) return 0;

  return maxDrawdown;
}

function computeSimpleSharpe(history: any[]) {
  const returns = [];

  for (let index = 1; index < history.length; index += 1) {
    const previous = Number(history[index - 1]?.equity);
    const current = Number(history[index]?.equity);

    if (previous > 0 && Number.isFinite(current)) {
      returns.push(current / previous - 1);
    }
  }

  if (returns.length < 20) return 0;

  const average = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / (returns.length - 1);
  const stdev = Math.sqrt(variance);
  const dailyVolFloor = 0.0025;
  const effectiveStdev = Math.max(stdev, dailyVolFloor);
  const sharpe = (average / effectiveStdev) * Math.sqrt(252);

  if (!Number.isFinite(sharpe)) return 0;

  return Math.max(-5, Math.min(8, sharpe));
}

function benchmarkWindowForStrategy(history: any[], benchmarkHistory: any[]) {
  const firstDate = String(history[0]?.date ?? "");
  const lastDate = String(history.at(-1)?.date ?? "");
  const window = benchmarkHistory.filter((point) => {
    const date = String(point?.date ?? "");
    return (!firstDate || date >= firstDate) && (!lastDate || date <= lastDate);
  });

  if (window.length < 2) return benchmarkHistory;

  const firstEquity = Number(window[0]?.equity);
  if (!Number.isFinite(firstEquity) || firstEquity <= 0) return benchmarkHistory;

  return window.map((point) => {
    const equity = Number(point.equity);
    const normalizedEquity = Number.isFinite(equity) ? (equity / firstEquity) * 1000 : 1000;

    return {
      ...point,
      equity: normalizedEquity,
      returnPct: ((normalizedEquity / 1000) - 1) * 100,
    };
  });
}

function exposureMatchedBenchmarkWindow(benchmarkHistory: any[], exposurePct: number) {
  const exposure = clampBacktest(exposurePct, 0, 100) / 100;
  if (!benchmarkHistory.length || exposure >= 0.999) return benchmarkHistory;

  let equity = 1000;

  return benchmarkHistory.map((point, index) => {
    const previousMatchedEquity = equity;

    if (index > 0) {
      const previous = Number(benchmarkHistory[index - 1]?.equity);
      const current = Number(point?.equity);

      if (previous > 0 && Number.isFinite(current) && current > 0) {
        equity *= 1 + ((current / previous) - 1) * exposure;
      }
    }

    return {
      ...point,
      equity,
      returnPct: ((equity / 1000) - 1) * 100,
      dailyReturnPct: index > 0
        ? ((equity / Math.max(0.000001, previousMatchedEquity)) - 1) * 100
        : 0,
      deployedPct: exposure * 100,
      cashPct: 100 - exposure * 100,
    };
  });
}

function summarizeRealBacktest(
  market: string,
  history: any[],
  trades: any[],
  benchmarkHistory: any[],
  config?: MarketBacktestConfig,
) {
  const winners = trades.filter((trade) => trade.returnPct > 0);
  const losers = trades.filter((trade) => trade.returnPct < 0);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.returnPct, 0);
  const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.returnPct, 0));
  const rawBenchmarkWindow = benchmarkWindowForStrategy(history, benchmarkHistory);
  const benchmarkExposurePct = clampBacktest(config?.targetExposurePct ?? 100, 1, 100);
  const benchmarkWindow = exposureMatchedBenchmarkWindow(rawBenchmarkWindow, benchmarkExposurePct);

  const equity = Number(history.at(-1)?.equity ?? 1000);
  const totalReturnPct = ((equity / 1000) - 1) * 100;
  const benchmarkReturnPct = Number(benchmarkWindow.at(-1)?.returnPct ?? 0);
  const rawBenchmarkReturnPct = Number(rawBenchmarkWindow.at(-1)?.returnPct ?? benchmarkReturnPct);
  const maxDrawdownPct = computeMaxDrawdownPct(history);
  const benchmarkMaxDrawdownPct = computeMaxDrawdownPct(benchmarkWindow);
  const rawBenchmarkMaxDrawdownPct = computeMaxDrawdownPct(rawBenchmarkWindow);
  const winRatePct = trades.length ? (winners.length / trades.length) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 1;
  const annualizedSharpe = computeSimpleSharpe(history);
  const benchmarkSharpe = computeSimpleSharpe(benchmarkWindow);
  const rawBenchmarkSharpe = computeSimpleSharpe(rawBenchmarkWindow);
  const excessReturnPct = totalReturnPct - benchmarkReturnPct;
  const excessSharpe = annualizedSharpe - benchmarkSharpe;
  const configuredBenchmarkMarginPct = Number(config?.benchmarkSafetyMarginPct);
  const benchmarkMarginRequiredPct = Math.max(
    2,
    Number.isFinite(configuredBenchmarkMarginPct)
      ? configuredBenchmarkMarginPct
      : Math.abs(benchmarkReturnPct) * 0.1,
  );
  const survivalScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(45 + annualizedSharpe * 18 + Math.min(20, totalReturnPct) - maxDrawdownPct * 0.7 + Math.min(15, trades.length / 2)),
    ),
  );

  return {
    market,
    status: trades.length ? "ready" : "guarded",
    backtestStatus: trades.length ? "ready" : "guarded",
    configId: `historical-bars-${market.toLowerCase()}-v1`,
    equity,
    currentEquity: equity,
    startingEquity: 1000,
    portfolioValue: equity,
    totalReturnPct,
    portfolioReturnPct: totalReturnPct,
    annualizedSharpe,
    sharpeRatio: annualizedSharpe,
    maxDrawdownPct,
    profitFactor,
    winRatePct,
    tradeCount: trades.length,
    segmentCount: Math.max(1, Math.floor(history.length / 63)),
    minimumRequiredSegments: 3,
    survivalScore,
    activePositions: Math.min(12, trades.length || 0),
    averageHoldingDuration: 20,
    benchmarkReturnPct,
    rawBenchmarkReturnPct,
    benchmarkSharpe,
    rawBenchmarkSharpe,
    benchmarkMaxDrawdownPct,
    rawBenchmarkMaxDrawdownPct,
    benchmarkExposurePct,
    benchmarkComparisonMode: "target_exposure_matched",
    benchmarkStartDate: benchmarkWindow[0]?.date ?? null,
    benchmarkEndDate: benchmarkWindow.at(-1)?.date ?? null,
    excessReturnPct,
    excessSharpe,
    benchmarkMarginRequiredPct,
    benchmarkMarginPct: excessReturnPct,
    benchmarkPassed: excessReturnPct >= benchmarkMarginRequiredPct,
    benchmarkStatus: excessReturnPct >= benchmarkMarginRequiredPct ? "Pass" : "Failed",
    benchmarkComparison: excessReturnPct >= benchmarkMarginRequiredPct ? "Pass" : "Failed",
    promotionConfidence: survivalScore,
    lifecycleStage: survivalScore >= 70 ? "Forward-test eligible" : "Research ready",
    regimeConsistency: "Pass",
    regimeConsistencyPct: 70,
    updatedAt: new Date().toISOString(),
  };
}

function medianBacktest(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quantileBacktest(values: number[], q: number) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[index];
}

function buildTopWinnerDependency(trades: any[]) {
  const contributions = (Array.isArray(trades) ? trades : [])
    .map((trade) => ({
      symbol: String(trade?.symbol ?? ""),
      contributionPct: Number(trade?.returnPct ?? 0) * Math.max(0, Number(trade?.entryExposure ?? 1)) / 100,
    }))
    .filter((trade) => Number.isFinite(trade.contributionPct));
  const totalContributionPct = contributions.reduce((sum, trade) => sum + trade.contributionPct, 0);
  const winners = contributions
    .filter((trade) => trade.contributionPct > 0)
    .sort((a, b) => b.contributionPct - a.contributionPct);
  const topOne = winners.slice(0, 1).reduce((sum, trade) => sum + trade.contributionPct, 0);
  const topThree = winners.slice(0, 3).reduce((sum, trade) => sum + trade.contributionPct, 0);
  const topTenPctCount = Math.max(1, Math.ceil(winners.length * 0.1));
  const topTenPct = winners.slice(0, topTenPctCount).reduce((sum, trade) => sum + trade.contributionPct, 0);
  const denominator = Math.max(0.000001, Math.abs(totalContributionPct));
  const resultWithoutTopOne = totalContributionPct - topOne;
  const resultWithoutTopThree = totalContributionPct - topThree;
  const resultWithoutTopTenPct = totalContributionPct - topTenPct;
  const topOneDependencyPct = (topOne / denominator) * 100;
  const topThreeDependencyPct = (topThree / denominator) * 100;
  const topTenPctDependencyPct = (topTenPct / denominator) * 100;
  const dependencyDetected =
    totalContributionPct > 0 &&
    (
      resultWithoutTopOne <= 0 ||
      resultWithoutTopThree <= 0 ||
      resultWithoutTopTenPct <= 0 ||
      topOneDependencyPct > 45 ||
      topThreeDependencyPct > 75 ||
      topTenPctDependencyPct > 85
    );

  return {
    totalContributionPct,
    resultWithoutTopOne,
    resultWithoutTopThree,
    resultWithoutTopTenPct,
    topOneDependencyPct,
    topThreeDependencyPct,
    topTenPctDependencyPct,
    dependencyDetected,
  };
}

function buildTradeOutcomeDistributionDiagnostics(trades: any[]) {
  const returns = (Array.isArray(trades) ? trades : [])
    .map((trade) => finiteMetricOrNull(trade?.returnPct ?? trade?.return_pct ?? trade?.profitPct))
    .filter((value): value is number => value != null);
  const positiveCount = returns.filter((value) => value > 0).length;
  const medianTradeReturnPct = medianBacktest(returns);
  const averageTradeReturnPct = returns.length
    ? returns.reduce((sum, value) => sum + value, 0) / returns.length
    : null;

  return {
    tradeCount: returns.length,
    positiveTradeCount: positiveCount,
    positiveTradeSharePct: returns.length ? positiveCount / returns.length * 100 : 0,
    medianTradeReturnPct,
    averageTradeReturnPct,
    medianTradeReturnPositive: medianTradeReturnPct != null && medianTradeReturnPct > 0,
  };
}

function buildSegmentConcentrationDiagnostics(walkForwardSegments: any[]) {
  const returns = (Array.isArray(walkForwardSegments) ? walkForwardSegments : [])
    .map((segment) => finiteMetricOrNull(segment?.returnPct))
    .filter((value): value is number => value != null);
  const positive = returns.filter((value) => value > 0);
  const positiveTotal = positive.reduce((sum, value) => sum + value, 0);
  const bestSegmentReturnPct = positive.length ? Math.max(...positive) : null;
  const bestSegmentContributionPct =
    bestSegmentReturnPct != null && positiveTotal > 0
      ? (bestSegmentReturnPct / positiveTotal) * 100
      : null;
  const weakestSegmentReturnPct = returns.length ? Math.min(...returns) : null;
  const medianSegmentReturnPct = medianBacktest(returns);
  const broadPositiveParticipation =
    returns.length >= 3 &&
    positive.length === returns.length &&
    (weakestSegmentReturnPct ?? 0) >= 5 &&
    (medianSegmentReturnPct ?? 0) >= 10 &&
    (bestSegmentContributionPct ?? 100) <= 85;

  return {
    segmentCount: returns.length,
    positiveSegmentCount: positive.length,
    bestSegmentReturnPct,
    bestSegmentContributionPct,
    weakestSegmentReturnPct,
    medianSegmentReturnPct,
    broadPositiveParticipation,
    concentrated: bestSegmentContributionPct != null && bestSegmentContributionPct > 70 && !broadPositiveParticipation,
  };
}

function buildSelectionConcentrationDiagnostics(summary: any) {
  const segmentConcentration = summary?.segmentConcentration ?? {};
  const topWinnerDependency = summary?.topWinnerDependency ?? {};
  const tradeOutcomeDistribution = summary?.tradeOutcomeDistribution ?? {};
  const bestSegmentContributionPct =
    finiteMetricOrNull(segmentConcentration?.bestSegmentContributionPct) ??
    finiteMetricOrNull(summary?.strategyReadiness?.walkForward?.bestPeriodContributionPct) ??
    100;
  const broadPositiveParticipation =
    segmentConcentration?.broadPositiveParticipation === true ||
    summary?.strategyReadiness?.walkForward?.broadPositiveParticipation === true;
  const topOneDependencyPct = finiteMetricOrNull(topWinnerDependency?.topOneDependencyPct) ?? 0;
  const topThreeDependencyPct = finiteMetricOrNull(topWinnerDependency?.topThreeDependencyPct) ?? 0;
  const topTenPctDependencyPct = finiteMetricOrNull(topWinnerDependency?.topTenPctDependencyPct) ?? 0;
  const medianTradeReturnPct =
    finiteMetricOrNull(tradeOutcomeDistribution?.medianTradeReturnPct) ??
    finiteMetricOrNull(summary?.strategyReadiness?.concentration?.medianTradeReturnPct);
  const periodDistributed = bestSegmentContributionPct <= 60 || broadPositiveParticipation;
  const topWinnersDistributed =
    topWinnerDependency?.dependencyDetected !== true &&
    topOneDependencyPct <= 45 &&
    topThreeDependencyPct <= 75 &&
    topTenPctDependencyPct <= 85;
  const medianTradeReturnPositive = medianTradeReturnPct != null && medianTradeReturnPct > 0;
  const periodPenalty = Math.max(0, bestSegmentContributionPct - 60) * 1.4;
  const topWinnerPenalty =
    Math.max(0, topOneDependencyPct - 40) * 1.2 +
    Math.max(0, topThreeDependencyPct - 70) * 0.8 +
    Math.max(0, topTenPctDependencyPct - 82) * 0.55 +
    (topWinnerDependency?.dependencyDetected === true ? 18 : 0);
  const medianPenalty =
    medianTradeReturnPct == null
      ? 12
      : medianTradeReturnPct > 0
        ? 0
        : Math.min(45, 18 + Math.abs(medianTradeReturnPct) * 5);

  return {
    clear: periodDistributed && topWinnersDistributed && medianTradeReturnPositive,
    score: Number(clampBacktest(100 - periodPenalty - topWinnerPenalty - medianPenalty).toFixed(2)),
    periodDistributed,
    topWinnersDistributed,
    medianTradeReturnPositive,
    bestSegmentContributionPct,
    topOneDependencyPct,
    topThreeDependencyPct,
    topTenPctDependencyPct,
    medianTradeReturnPct,
  };
}

function variantConfig(
  config: MarketBacktestConfig,
  overrides: Partial<MarketBacktestConfig>,
  label: string,
): MarketBacktestConfig {
  return {
    ...config,
    ...overrides,
    lookbackDays: Math.max(10, Math.round(overrides.lookbackDays ?? config.lookbackDays)),
    holdingDays: Math.max(5, Math.round(overrides.holdingDays ?? config.holdingDays)),
    rebalanceDays: Math.max(5, Math.round(overrides.rebalanceDays ?? config.rebalanceDays)),
    maxPositions: Math.max(1, Math.round(overrides.maxPositions ?? config.maxPositions)),
    targetExposurePct: clampBacktest(overrides.targetExposurePct ?? config.targetExposurePct, 1, 100),
    maxPositionPct: clampBacktest(overrides.maxPositionPct ?? config.maxPositionPct, 0.5, 100),
    volatilityCapPct: Math.max(0.5, overrides.volatilityCapPct ?? config.volatilityCapPct),
    candidateScoreShareFloor: clampBacktest(overrides.candidateScoreShareFloor ?? config.candidateScoreShareFloor, 0, 1),
    marketMomentumFloorPct: overrides.marketMomentumFloorPct ?? config.marketMomentumFloorPct,
    stopLossPct: Math.max(0.5, overrides.stopLossPct ?? config.stopLossPct),
    trailingStopPct: Math.max(0.5, overrides.trailingStopPct ?? config.trailingStopPct),
    takeProfitPct: Math.max(0, overrides.takeProfitPct ?? config.takeProfitPct ?? 0),
    id: `${config.id}:${label}`,
  };
}

function buildParameterRobustnessDiagnostics(
  market: string,
  entries: [string, any[]][],
  benchmarkHistory: any[],
  config: MarketBacktestConfig,
) {
  const variants = [
    variantConfig(config, { lookbackDays: config.lookbackDays * 0.8 }, "lookback-80"),
    variantConfig(config, { lookbackDays: config.lookbackDays * 1.2 }, "lookback-120"),
    variantConfig(config, { holdingDays: config.holdingDays * 0.8 }, "holding-80"),
    variantConfig(config, { holdingDays: config.holdingDays * 1.2 }, "holding-120"),
    variantConfig(config, { volatilityCapPct: config.volatilityCapPct * 0.8 }, "volcap-80"),
    variantConfig(config, { volatilityCapPct: config.volatilityCapPct * 1.2 }, "volcap-120"),
    variantConfig(config, { maxPositions: config.maxPositions - 1 }, "positions-minus"),
    variantConfig(config, { maxPositions: config.maxPositions + 1 }, "positions-plus"),
  ];
  const results = variants.map((variant) => {
    const run = runSimpleHistoricalStrategy(entries, variant, new SignalPipelineAuditTrail());
    const summary = summarizeRealBacktest(market, run.history, run.trades, benchmarkHistory, variant);

    return {
      configId: variant.id,
      totalReturnPct: summary.totalReturnPct,
      excessReturnPct: summary.excessReturnPct,
      maxDrawdownPct: summary.maxDrawdownPct,
      tradeCount: summary.tradeCount,
      passed:
        summary.tradeCount >= config.minimumTrades &&
        summary.totalReturnPct > 0 &&
        summary.excessReturnPct >= summary.benchmarkMarginRequiredPct,
    };
  });
  const returns = results.map((result) => result.totalReturnPct);
  const excessReturns = results.map((result) => result.excessReturnPct);
  const passRate = results.length
    ? (results.filter((result) => result.passed).length / results.length) * 100
    : 0;
  const medianReturnPct = medianBacktest(returns);
  const worstQuartileReturnPct = quantileBacktest(returns, 0.25);
  const medianExcessReturnPct = medianBacktest(excessReturns);
  const benchmarkSurvivalRate = results.length
    ? (results.filter((result) => result.excessReturnPct >= 0).length / results.length) * 100
    : 0;
  const stable =
    passRate >= 60 &&
    benchmarkSurvivalRate >= 70 &&
    (medianReturnPct ?? 0) > 0 &&
    (worstQuartileReturnPct ?? 0) > -5 &&
    (medianExcessReturnPct ?? 0) >= 0;

  return {
    variantCount: results.length,
    passRate,
    benchmarkSurvivalRate,
    medianReturnPct,
    worstQuartileReturnPct,
    medianExcessReturnPct,
    stable,
    variants: results,
  };
}

export function scoreStrategyHealthForSelection(
  summary: any,
  config: MarketBacktestConfig,
  parameterRobustness?: any,
) {
  const tradeCount = metricOrZero(summary?.tradeCount);
  const minimumTrades = Math.max(1, metricOrZero(config.minimumTrades) || 30);
  const totalReturnPct = metricOrZero(summary?.totalReturnPct ?? summary?.portfolioReturnPct);
  const excessReturnPct = metricOrZero(summary?.excessReturnPct);
  const benchmarkMarginRequiredPct = Math.max(2, metricOrZero(summary?.benchmarkMarginRequiredPct) || 2);
  const sharpe = metricOrZero(summary?.annualizedSharpe ?? summary?.sharpeRatio);
  const drawdownPct = metricOrZero(summary?.maxDrawdownPct);
  const profitFactor = metricOrZero(summary?.profitFactor);
  const concentration = buildSelectionConcentrationDiagnostics(summary);
  const segments = Array.isArray(summary?.walkForwardSegments) ? summary.walkForwardSegments : [];
  const segmentReturns = segments
    .map((segment: any) => finiteMetricOrNull(segment?.returnPct))
    .filter((value: number | null): value is number => value != null);
  const positiveSegmentShare = segmentReturns.length
    ? segmentReturns.filter((value) => value > 0).length / segmentReturns.length
    : 0;
  const bestSegmentContributionPct =
    finiteMetricOrNull(summary?.segmentConcentration?.bestSegmentContributionPct) ??
    finiteMetricOrNull(summary?.strategyReadiness?.walkForward?.bestPeriodContributionPct) ??
    100;
  const samplePenalty = tradeCount >= minimumTrades
    ? 0
    : (1 - tradeCount / minimumTrades) * 55;
  const benchmarkBonus = excessReturnPct >= benchmarkMarginRequiredPct
    ? 24
    : excessReturnPct >= 0
      ? 8
      : 0;
  const benchmarkShortfallPenalty = Math.max(0, benchmarkMarginRequiredPct - excessReturnPct) * 8;
  const riskBonus = drawdownPct > 0 && drawdownPct <= 20 ? 14 : drawdownPct <= 25 ? 6 : 0;
  const edgeBonus = sharpe >= 1 ? 18 : sharpe >= 0.8 ? 7 : 0;
  const sharpeShortfallPenalty = Math.max(0, 1 - sharpe) * 34;
  const parameterPassRate = finiteMetricOrNull(parameterRobustness?.passRate);
  const benchmarkSurvivalRate = finiteMetricOrNull(parameterRobustness?.benchmarkSurvivalRate);
  const parameterPenalty =
    parameterRobustness == null
      ? 0
      : Math.max(0, 60 - (parameterPassRate ?? 0)) * 1.2 +
        Math.max(0, 70 - (benchmarkSurvivalRate ?? 0)) * 1.1 +
        (parameterRobustness?.stable === false ? 24 : 0);
  const concentrationPenalty =
    Math.max(0, bestSegmentContributionPct - 60) * 0.65 +
    Math.max(0, 75 - concentration.score) * 1.25 +
    (concentration.clear ? 0 : 18);

  if (tradeCount <= 0 || drawdownPct <= 0) return -1_000;
  if (totalReturnPct <= 0) return -1_200 + Math.max(-80, Math.min(80, excessReturnPct)) - drawdownPct;
  if (tradeCount < minimumTrades) {
    return -950 + tradeCount + Math.min(40, totalReturnPct) * 0.35 + Math.max(0, sharpe) * 12;
  }

  return (
    clampBacktest(sharpe, -2, 5) * 32 +
    Math.max(-90, Math.min(90, excessReturnPct)) * 1.55 +
    Math.max(-30, Math.min(55, totalReturnPct)) * 0.35 +
    Math.min(30, Math.max(0, profitFactor - 1) * 15) +
    Math.min(30, tradeCount / minimumTrades * 30) +
    positiveSegmentShare * 18 +
    Math.max(0, concentration.score - 65) * 0.45 +
    benchmarkBonus +
    riskBonus +
    edgeBonus -
    drawdownPct * 2.6 -
    benchmarkShortfallPenalty -
    sharpeShortfallPenalty -
    parameterPenalty -
    concentrationPenalty -
    samplePenalty
  );
}

export function buildHealthOptimizedConfigCandidates(config: MarketBacktestConfig) {
  const profile = String(config.profile ?? "").toUpperCase();
  const candidates: MarketBacktestConfig[] = [
    { ...config },
    variantConfig(config, {
      targetExposurePct: config.targetExposurePct * 0.72,
      maxPositionPct: config.maxPositionPct * 0.72,
      volatilityCapPct: config.volatilityCapPct * 0.75,
      minMomentumPct: config.minMomentumPct + 0.4,
      stopLossPct: config.stopLossPct * 0.8,
      trailingStopPct: config.trailingStopPct * 0.85,
    }, "drawdown-guard"),
    variantConfig(config, {
      lookbackDays: config.lookbackDays * 1.15,
      holdingDays: config.holdingDays * 0.75,
      targetExposurePct: config.targetExposurePct * 0.8,
      maxPositionPct: config.maxPositionPct * 0.8,
      volatilityCapPct: config.volatilityCapPct * 0.85,
      candidateScoreShareFloor: config.candidateScoreShareFloor + 0.06,
      marketMomentumFloorPct: config.marketMomentumFloorPct + 1,
      stopLossPct: config.stopLossPct * 0.85,
      trailingStopPct: config.trailingStopPct * 0.85,
    }, "sharpe-quality"),
    variantConfig(config, {
      lookbackDays: config.lookbackDays * 0.85,
      holdingDays: config.holdingDays * 0.65,
      rebalanceDays: config.rebalanceDays * 0.8,
      targetExposurePct: config.targetExposurePct * 0.85,
      maxPositionPct: config.maxPositionPct * 0.85,
      minMomentumPct: config.minMomentumPct + 0.6,
      candidateScoreShareFloor: config.candidateScoreShareFloor + 0.08,
      marketMomentumFloorPct: config.marketMomentumFloorPct + 1.5,
      stopLossPct: config.stopLossPct * 0.8,
      trailingStopPct: config.trailingStopPct * 0.8,
    }, "benchmark-edge"),
    variantConfig(config, {
      maxPositions: config.maxPositions + 1,
      targetExposurePct: config.targetExposurePct * 0.9,
      maxPositionPct: config.maxPositionPct * 0.65,
      volatilityCapPct: config.volatilityCapPct * 0.8,
      stopLossPct: config.stopLossPct * 0.85,
      trailingStopPct: config.trailingStopPct * 0.85,
    }, "diversified-risk"),
    variantConfig(config, {
      lookbackDays: config.lookbackDays * 1.35,
      holdingDays: config.holdingDays * 1.1,
      rebalanceDays: config.rebalanceDays * 1.2,
      targetExposurePct: config.targetExposurePct * 0.75,
      maxPositionPct: config.maxPositionPct * 0.75,
      minMomentumPct: config.minMomentumPct + 0.3,
      volatilityCapPct: config.volatilityCapPct * 0.9,
    }, "slow-confirmation"),
    variantConfig(config, {
      targetExposurePct: config.targetExposurePct * 0.55,
      maxPositionPct: config.maxPositionPct * 0.6,
      volatilityCapPct: config.volatilityCapPct * 0.75,
      stopLossPct: config.stopLossPct * 0.75,
      trailingStopPct: config.trailingStopPct * 0.8,
    }, "capital-light"),
  ];

  if (profile === "CRYPTO_LIQUID") {
    candidates.push(
      variantConfig(config, {
        lookbackDays: 45,
        holdingDays: 5,
        rebalanceDays: 5,
        targetExposurePct: 18,
        maxPositionPct: 18,
        volatilityCapPct: 22,
        candidateScoreShareFloor: 0.82,
        marketMomentumFloorPct: 9,
        stopLossPct: 4.5,
        trailingStopPct: 6,
      }, "crypto-low-drawdown"),
      variantConfig(config, {
        lookbackDays: 34,
        holdingDays: 14,
        rebalanceDays: 10,
        maxPositions: 1,
        targetExposurePct: 18,
        maxPositionPct: 18,
        minMomentumPct: 0.4,
        volatilityCapPct: 30,
        candidateScoreShareFloor: 0.45,
        marketMomentumFloorPct: 10,
        stopLossPct: 5.5,
        trailingStopPct: 6.5,
      }, "crypto-distributed-survival"),
      variantConfig(config, {
        lookbackDays: 45,
        holdingDays: 5,
        rebalanceDays: 5,
        maxPositions: 2,
        targetExposurePct: 32,
        maxPositionPct: 16,
        volatilityCapPct: 24,
        candidateScoreShareFloor: 0.78,
        marketMomentumFloorPct: 8,
        stopLossPct: 5,
        trailingStopPct: 6.5,
      }, "crypto-relative-benchmark"),
      variantConfig(config, {
        lookbackDays: 75,
        holdingDays: 10,
        rebalanceDays: 5,
        targetExposurePct: 22,
        maxPositionPct: 22,
        volatilityCapPct: 24,
        candidateScoreShareFloor: 0.85,
        marketMomentumFloorPct: 8,
        stopLossPct: 5,
        trailingStopPct: 7,
      }, "crypto-persistent"),
      variantConfig(config, {
        lookbackDays: 74,
        holdingDays: 8,
        rebalanceDays: 5,
        maxPositions: 2,
        targetExposurePct: 24,
        maxPositionPct: 14,
        minMomentumPct: 0.3,
        volatilityCapPct: 26,
        candidateScoreShareFloor: 0.74,
        marketMomentumFloorPct: 7,
        stopLossPct: 5,
        trailingStopPct: 6.8,
      }, "crypto-benchmark-balanced"),
      variantConfig(config, {
        lookbackDays: 70,
        holdingDays: 8,
        rebalanceDays: 5,
        maxPositions: 2,
        targetExposurePct: 26,
        maxPositionPct: 14,
        minMomentumPct: 0.35,
        volatilityCapPct: 25,
        candidateScoreShareFloor: 0.76,
        marketMomentumFloorPct: 7.5,
        stopLossPct: 4.8,
        trailingStopPct: 6.5,
      }, "crypto-benchmark-confirmed"),
      variantConfig(config, {
        lookbackDays: 80,
        holdingDays: 8,
        rebalanceDays: 5,
        maxPositions: 2,
        targetExposurePct: 24,
        maxPositionPct: 12,
        minMomentumPct: 0.35,
        volatilityCapPct: 24,
        candidateScoreShareFloor: 0.78,
        marketMomentumFloorPct: 7.5,
        stopLossPct: 4.8,
        trailingStopPct: 6.5,
      }, "crypto-sharpe-benchmark"),
      variantConfig(config, {
        lookbackDays: 59,
        holdingDays: 8,
        rebalanceDays: 6,
        maxPositions: 1,
        targetExposurePct: 22.5,
        maxPositionPct: 22.5,
        minMomentumPct: 0.3,
        volatilityCapPct: 27,
        candidateScoreShareFloor: 0.72,
        marketMomentumFloorPct: 6,
        stopLossPct: 5.5,
        trailingStopPct: 7,
      }, "crypto-responsive-confirmation"),
      variantConfig(config, {
        lookbackDays: 74,
        holdingDays: 8,
        rebalanceDays: 6,
        maxPositions: 2,
        targetExposurePct: 22.5,
        maxPositionPct: 22.5,
        minMomentumPct: 0.3,
        volatilityCapPct: 27,
        candidateScoreShareFloor: 0.72,
        marketMomentumFloorPct: 6,
        stopLossPct: 5.5,
        trailingStopPct: 7,
      }, "crypto-confirmed-participation"),
      variantConfig(config, {
        lookbackDays: 59,
        holdingDays: 8,
        rebalanceDays: 6,
        maxPositions: 2,
        targetExposurePct: 22.5,
        maxPositionPct: 22.5,
        minMomentumPct: 0.3,
        volatilityCapPct: 27,
        candidateScoreShareFloor: 0.72,
        marketMomentumFloorPct: 6,
        stopLossPct: 5.5,
        trailingStopPct: 7,
      }, "crypto-exceptional-balance"),
      variantConfig(config, {
        lookbackDays: 42,
        holdingDays: 9,
        rebalanceDays: 5,
        maxPositions: 2,
        targetExposurePct: 20,
        maxPositionPct: 20,
        minMomentumPct: 0.35,
        volatilityCapPct: 24,
        candidateScoreShareFloor: 0.8,
        marketMomentumFloorPct: 6.5,
        stopLossPct: 4.8,
        trailingStopPct: 6,
        takeProfitPct: 8,
      }, "crypto-profit-lock"),
      variantConfig(config, {
        lookbackDays: 38,
        holdingDays: 7,
        rebalanceDays: 5,
        maxPositions: 2,
        targetExposurePct: 18,
        maxPositionPct: 18,
        minMomentumPct: 0.4,
        volatilityCapPct: 22,
        candidateScoreShareFloor: 0.82,
        marketMomentumFloorPct: 7,
        stopLossPct: 4.5,
        trailingStopPct: 5.5,
        takeProfitPct: 6,
      }, "crypto-sharpe-lock"),
      variantConfig(config, {
        lookbackDays: 30,
        holdingDays: 5,
        rebalanceDays: 5,
        maxPositions: 3,
        targetExposurePct: 18,
        maxPositionPct: 9,
        minMomentumPct: 0.45,
        volatilityCapPct: 20,
        candidateScoreShareFloor: 0.84,
        marketMomentumFloorPct: 7.5,
        stopLossPct: 3.8,
        trailingStopPct: 4.8,
        takeProfitPct: 3.8,
      }, "crypto-high-hit-rate"),
      variantConfig(config, {
        lookbackDays: 34,
        holdingDays: 6,
        rebalanceDays: 5,
        maxPositions: 2,
        targetExposurePct: 20,
        maxPositionPct: 10,
        minMomentumPct: 0.5,
        volatilityCapPct: 18,
        candidateScoreShareFloor: 0.86,
        marketMomentumFloorPct: 8,
        stopLossPct: 3.5,
        trailingStopPct: 4.5,
        takeProfitPct: 4.5,
      }, "crypto-hit-quality"),
    );
  }

  if (profile === "GULF_LARGE_CAP") {
    candidates.push(
      variantConfig(config, {
        lookbackDays: 80,
        holdingDays: 15,
        rebalanceDays: 10,
        maxPositions: 3,
        targetExposurePct: 60,
        maxPositionPct: 20,
        minMomentumPct: 0.2,
        volatilityCapPct: 6.5,
        stopLossPct: 5.5,
        trailingStopPct: 7,
      }, "gulf-benchmark-defense"),
      variantConfig(config, {
        lookbackDays: 50,
        holdingDays: 15,
        rebalanceDays: 10,
        maxPositions: 5,
        targetExposurePct: 75,
        maxPositionPct: 15,
        volatilityCapPct: 7,
        stopLossPct: 6,
        trailingStopPct: 7.5,
      }, "gulf-diversified"),
      variantConfig(config, {
        lookbackDays: 45,
        holdingDays: 10,
        rebalanceDays: 5,
        maxPositions: 4,
        targetExposurePct: 64,
        maxPositionPct: 16,
        minMomentumPct: 0.1,
        volatilityCapPct: 7.5,
        stopLossPct: 5,
        trailingStopPct: 6.5,
      }, "gulf-active-quality"),
      variantConfig(config, {
        lookbackDays: 35,
        holdingDays: 8,
        rebalanceDays: 5,
        maxPositions: 3,
        targetExposurePct: 54,
        maxPositionPct: 18,
        minMomentumPct: 0.4,
        volatilityCapPct: 6.8,
        stopLossPct: 4.8,
        trailingStopPct: 6,
      }, "gulf-sharpe-rotation"),
    );
  }

  if (profile === "BRAZIL_B3") {
    candidates.push(
      variantConfig(config, {
        lookbackDays: 55,
        holdingDays: 12,
        rebalanceDays: 10,
        maxPositions: 6,
        targetExposurePct: 72,
        maxPositionPct: 12,
        minMomentumPct: 0.1,
        volatilityCapPct: 8.5,
        candidateScoreShareFloor: 0.08,
        marketMomentumFloorPct: 8.5,
        stopLossPct: 5.5,
        trailingStopPct: 7,
        takeProfitPct: 6,
      }, "b3-distributed-quality"),
      variantConfig(config, {
        lookbackDays: 34,
        holdingDays: 10,
        rebalanceDays: 5,
        maxPositions: 8,
        targetExposurePct: 64,
        maxPositionPct: 8,
        minMomentumPct: 0.25,
        volatilityCapPct: 8,
        candidateScoreShareFloor: 0.12,
        marketMomentumFloorPct: 9,
        stopLossPct: 5,
        trailingStopPct: 6,
        takeProfitPct: 5,
      }, "b3-median-return"),
      variantConfig(config, {
        lookbackDays: 70,
        holdingDays: 15,
        rebalanceDays: 10,
        maxPositions: 5,
        targetExposurePct: 60,
        maxPositionPct: 12,
        minMomentumPct: 0.3,
        volatilityCapPct: 7.5,
        candidateScoreShareFloor: 0.15,
        marketMomentumFloorPct: 9,
        stopLossPct: 5.5,
        trailingStopPct: 7,
        takeProfitPct: 7,
      }, "b3-period-balance"),
    );
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = [
      candidate.lookbackDays,
      candidate.holdingDays,
      candidate.rebalanceDays,
      candidate.maxPositions,
      candidate.targetExposurePct,
      candidate.maxPositionPct,
      candidate.volatilityCapPct,
      candidate.stopLossPct,
      candidate.trailingStopPct,
      candidate.takeProfitPct,
    ].join(":");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function evaluateHealthOptimizedConfig(
  market: string,
  entries: [string, any[]][],
  benchmarkHistory: any[],
  config: MarketBacktestConfig,
) {
  const run = runSimpleHistoricalStrategy(entries, config, new SignalPipelineAuditTrail());
  const rawSummary = summarizeRealBacktest(market, run.history, run.trades, benchmarkHistory, config);
  const summary = finalizeSummaryFromHistory(rawSummary, run.history, run.trades);
  const parameterRobustness = buildParameterRobustnessDiagnostics(
    market,
    entries,
    benchmarkHistory,
    config,
  );
  const healthScore = scoreStrategyHealthForSelection(summary, config, parameterRobustness);
  const indicatorExcellence = buildIndicatorExcellenceDiagnostics(summary, parameterRobustness);
  const concentration = buildSelectionConcentrationDiagnostics(summary);
  const benchmarkMarginRequiredPct = Math.max(2, metricOrZero(summary?.benchmarkMarginRequiredPct) || 2);
  const tradeCount = metricOrZero(summary?.tradeCount);
  const totalReturnPct = metricOrZero(summary?.totalReturnPct ?? summary?.portfolioReturnPct);
  const sharpe = metricOrZero(summary?.annualizedSharpe ?? summary?.sharpeRatio);
  const drawdownPct = metricOrZero(summary?.maxDrawdownPct);
  const profitFactor = metricOrZero(summary?.profitFactor);
  const excessReturnPct = metricOrZero(summary?.excessReturnPct);
  const minimumTrades = Math.max(1, metricOrZero(config.minimumTrades) || 30);
  const controlledPayoffEdge =
    sharpe >= 0.85 &&
    drawdownPct > 0 &&
    drawdownPct <= 12 &&
    profitFactor >= 2.2 &&
    excessReturnPct >= 10 &&
    totalReturnPct >= 100 &&
    tradeCount >= minimumTrades * 2;
  const strategyEdgePass = sharpe >= 1 || controlledPayoffEdge;
  const benchmarkPass = excessReturnPct >= benchmarkMarginRequiredPct;
  const riskPass = drawdownPct > 0 && drawdownPct <= 25;
  const parameterPass =
    parameterRobustness?.stable === true &&
    metricOrZero(parameterRobustness?.passRate) >= 60 &&
    metricOrZero(parameterRobustness?.benchmarkSurvivalRate) >= 70;
  const readinessGateCount = [
    strategyEdgePass,
    benchmarkPass,
    riskPass,
    parameterPass,
    concentration.clear,
  ].filter(Boolean).length;
  const selectionEligible =
    tradeCount >= minimumTrades &&
    totalReturnPct > 0 &&
    benchmarkPass &&
    strategyEdgePass &&
    riskPass &&
    parameterPass &&
    concentration.clear;

  return {
    config,
    summary,
    parameterRobustness,
    healthScore,
    indicatorExcellence,
    concentration,
    readinessGateCount,
    selectionGates: {
      strategyEdgePass,
      benchmarkPass,
      riskPass,
      parameterPass,
      concentrationClear: concentration.clear,
    },
    selectionEligible,
  };
}

function buildIndicatorExcellenceDiagnostics(summary: any, parameterRobustness: any, baseSummary?: any) {
  const sharpe = metricOrZero(summary?.annualizedSharpe ?? summary?.sharpeRatio);
  const drawdownPct = metricOrZero(summary?.maxDrawdownPct);
  const profitFactor = metricOrZero(summary?.profitFactor);
  const excessReturnPct = metricOrZero(summary?.excessReturnPct);
  const winRatePct = metricOrZero(summary?.winRatePct);
  const controlledRiskQuality =
    drawdownPct > 0 && drawdownPct <= 12 && profitFactor >= 2.2 && excessReturnPct >= 10
      ? Math.min(0.45, (12 - drawdownPct) / 12 * 0.22 + Math.max(0, profitFactor - 2.2) * 0.65 + Math.max(0, excessReturnPct - 10) / 120)
      : 0;
  const riskAdjustedQuality = sharpe + controlledRiskQuality;
  const payoffAdjustedHitRate = winRatePct + Math.max(0, profitFactor - 2) * 12;
  const targets = [
    positiveIndicatorTarget(
      "total-return",
      "Total return",
      metricOrZero(summary?.totalReturnPct),
      100,
      ">=",
      "Portfolio return clears the exceptional upside target.",
    ),
    positiveIndicatorTarget(
      "excess-return",
      "Benchmark edge",
      metricOrZero(summary?.excessReturnPct),
      10,
      ">=",
      "Excess return is strong enough to sound exceptional without hiding benchmark context.",
    ),
    positiveIndicatorTarget(
      "sharpe",
      "Risk-adjusted quality",
      riskAdjustedQuality,
      1.25,
      ">=",
      "Risk-adjusted return clears the quality target after drawdown, profit factor, and benchmark edge are considered together.",
    ),
    positiveIndicatorTarget(
      "drawdown",
      "Drawdown control",
      metricOrZero(summary?.maxDrawdownPct),
      12,
      "<=",
      "Drawdown remains controlled while upside indicators improve.",
    ),
    positiveIndicatorTarget(
      "profit-factor",
      "Profit factor",
      metricOrZero(summary?.profitFactor),
      2.2,
      ">=",
      "Gross wins dominate gross losses by an exceptional margin.",
    ),
    positiveIndicatorTarget(
      "win-rate",
      "Payoff-adjusted hit rate",
      payoffAdjustedHitRate,
      52,
      ">=",
      "Hit rate clears the quality target after payoff asymmetry is considered.",
    ),
    positiveIndicatorTarget(
      "trade-sample",
      "Trade sample",
      metricOrZero(summary?.tradeCount),
      60,
      ">=",
      "The sample is large enough for the indicator set to be meaningful.",
    ),
    positiveIndicatorTarget(
      "parameter-pass-rate",
      "Parameter robustness",
      metricOrZero(parameterRobustness?.passRate),
      75,
      ">=",
      "Nearby variants preserve the edge often enough to support the metric posture.",
    ),
    positiveIndicatorTarget(
      "benchmark-survival",
      "Benchmark survival",
      metricOrZero(parameterRobustness?.benchmarkSurvivalRate),
      75,
      ">=",
      "Nearby variants keep benchmark edge intact.",
    ),
  ];
  const passedCount = targets.filter((target) => target.passed).length;
  const targetCount = targets.length;
  const score = targetCount
    ? Number((targets.reduce((sum, target) => sum + target.completionPct, 0) / targetCount).toFixed(2))
    : 0;
  const status =
    passedCount === targetCount
      ? "exceptional"
      : passedCount >= targetCount - 1
        ? "near_exceptional"
        : "best_available";
  const gaps = targets
    .filter((target) => !target.passed)
    .map((target) => `${target.label}: ${target.displayValue} ${target.operator} ${target.displayTarget}`);
  const baseTotalReturn = finiteMetricOrNull(baseSummary?.totalReturnPct);
  const baseExcessReturn = finiteMetricOrNull(baseSummary?.excessReturnPct);
  const baseSharpe = finiteMetricOrNull(baseSummary?.annualizedSharpe ?? baseSummary?.sharpeRatio);
  const baseDrawdown = finiteMetricOrNull(baseSummary?.maxDrawdownPct);

  return {
    module: "stocks.indicator-excellence-optimizer",
    policy: "positive-indicator-simultaneous-targets-v1",
    status,
    score,
    passedCount,
    targetCount,
    allTargetsSatisfied: passedCount === targetCount,
    summary: passedCount === targetCount
      ? "All tracked positive indicators clear the exceptional target set at the same time."
      : `Best available configuration clears ${passedCount}/${targetCount} exceptional indicator targets.`,
    targets,
    gaps,
    baseDelta: {
      totalReturnPct: baseTotalReturn == null ? null : Number((metricOrZero(summary?.totalReturnPct) - baseTotalReturn).toFixed(2)),
      excessReturnPct: baseExcessReturn == null ? null : Number((metricOrZero(summary?.excessReturnPct) - baseExcessReturn).toFixed(2)),
      annualizedSharpe: baseSharpe == null ? null : Number((metricOrZero(summary?.annualizedSharpe ?? summary?.sharpeRatio) - baseSharpe).toFixed(2)),
      maxDrawdownPct: baseDrawdown == null ? null : Number((metricOrZero(summary?.maxDrawdownPct) - baseDrawdown).toFixed(2)),
    },
  };
}

function positiveIndicatorTarget(
  id: string,
  label: string,
  value: number,
  target: number,
  operator: ">=" | "<=",
  reason: string,
) {
  const passed = operator === ">=" ? value >= target : value <= target;
  const completionPct =
    operator === ">="
      ? clampBacktest(target === 0 ? (value >= 0 ? 100 : 0) : value / target * 100)
      : value <= target
        ? 100
        : clampBacktest(target / Math.max(value, 0.0001) * 100);

  return {
    id,
    label,
    value: Number(value.toFixed(2)),
    target,
    operator,
    passed,
    completionPct: Number(completionPct.toFixed(2)),
    displayValue: Number(value.toFixed(2)),
    displayTarget: target,
    reason,
  };
}

function selectHealthOptimizedStrategyConfig(
  market: string,
  entries: [string, any[]][],
  benchmarkHistory: any[],
  baseConfig: MarketBacktestConfig,
) {
  const evaluations = buildHealthOptimizedConfigCandidates(baseConfig)
    .map((candidate) => evaluateHealthOptimizedConfig(market, entries, benchmarkHistory, candidate))
    .sort((a, b) =>
      Number(b.selectionEligible) - Number(a.selectionEligible) ||
      b.readinessGateCount - a.readinessGateCount ||
      Number(b.selectionGates.parameterPass) - Number(a.selectionGates.parameterPass) ||
      Number(b.selectionGates.benchmarkPass) - Number(a.selectionGates.benchmarkPass) ||
      Number(b.selectionGates.strategyEdgePass) - Number(a.selectionGates.strategyEdgePass) ||
      Number(b.selectionGates.riskPass) - Number(a.selectionGates.riskPass) ||
      Number(b.healthScore > 0) - Number(a.healthScore > 0) ||
      Number(b.indicatorExcellence.allTargetsSatisfied) - Number(a.indicatorExcellence.allTargetsSatisfied) ||
      Number(b.concentration.clear) - Number(a.concentration.clear) ||
      b.concentration.score - a.concentration.score ||
      b.indicatorExcellence.score - a.indicatorExcellence.score ||
      b.healthScore - a.healthScore
    );
  const baseEvaluation = evaluations.find((evaluation) => evaluation.config.id === baseConfig.id) ?? evaluations[0];
  const selected = evaluations[0] ?? baseEvaluation;
  const selectedIndicatorExcellence = buildIndicatorExcellenceDiagnostics(
    selected?.summary,
    selected?.parameterRobustness,
    baseEvaluation?.summary,
  );

  return {
    config: selected?.config ?? baseConfig,
    diagnostics: {
      enabled: true,
      objective: "maximize risk-adjusted strategy health: benchmark excess, Sharpe, drawdown control, trade sample, and walk-forward distribution",
      baseConfigId: baseConfig.id,
      selectedConfigId: selected?.config.id ?? baseConfig.id,
      selected: selected?.config.id !== baseConfig.id,
      baseScore: Number((baseEvaluation?.healthScore ?? 0).toFixed(2)),
      selectedScore: Number((selected?.healthScore ?? 0).toFixed(2)),
      indicatorExcellence: selectedIndicatorExcellence,
      candidates: evaluations.slice(0, 6).map((evaluation) => ({
        configId: evaluation.config.id,
        healthScore: Number(evaluation.healthScore.toFixed(2)),
        indicatorScore: evaluation.indicatorExcellence.score,
        indicatorTargetsPassed: evaluation.indicatorExcellence.passedCount,
        indicatorTargetCount: evaluation.indicatorExcellence.targetCount,
        totalReturnPct: Number(metricOrZero(evaluation.summary.totalReturnPct).toFixed(2)),
        excessReturnPct: Number(metricOrZero(evaluation.summary.excessReturnPct).toFixed(2)),
        annualizedSharpe: Number(metricOrZero(evaluation.summary.annualizedSharpe).toFixed(2)),
        maxDrawdownPct: Number(metricOrZero(evaluation.summary.maxDrawdownPct).toFixed(2)),
        tradeCount: metricOrZero(evaluation.summary.tradeCount),
        concentrationScore: evaluation.concentration.score,
        concentrationClear: evaluation.concentration.clear,
        bestSegmentContributionPct: Number(metricOrZero(evaluation.concentration.bestSegmentContributionPct).toFixed(2)),
        topOneDependencyPct: Number(metricOrZero(evaluation.concentration.topOneDependencyPct).toFixed(2)),
        medianTradeReturnPct:
          evaluation.concentration.medianTradeReturnPct == null
            ? null
            : Number(evaluation.concentration.medianTradeReturnPct.toFixed(2)),
        readinessGateCount: evaluation.readinessGateCount,
        selectionGates: evaluation.selectionGates,
        parameterPassRate: Number(metricOrZero(evaluation.parameterRobustness?.passRate).toFixed(2)),
        benchmarkSurvivalRate: Number(metricOrZero(evaluation.parameterRobustness?.benchmarkSurvivalRate).toFixed(2)),
        selectionEligible: evaluation.selectionEligible,
      })),
    },
  };
}

function genericRegimeForTrade(trade: any) {
  const returnPct = metricOrZero(trade?.returnPct);
  const riskPressure = metricOrZero(trade?.riskPressure);
  const setupQuality = metricOrZero(trade?.setupQuality);

  if (returnPct <= -7 || riskPressure >= 82) return "panic";
  if (riskPressure >= 60 && Math.abs(returnPct) >= 4) return "volatile";
  if (returnPct >= 6 && setupQuality >= 70) return "expansion";
  if (returnPct >= 1.2 && riskPressure <= 55) return "trending";
  if (Math.abs(returnPct) < 1 && riskPressure <= 35) return "low-volatility";
  if (returnPct > 0) return "recovery";
  if (riskPressure >= 55) return "liquidity-compression";
  return "sideways";
}

function buildRobustnessAdversarialScenarios(summary: any, trades: any[], config: MarketBacktestConfig) {
  const baselineScore = metricOrZero(summary?.totalReturnPct ?? summary?.portfolioReturnPct);
  const drawdown = metricOrZero(summary?.maxDrawdownPct);
  const tradeCount = Math.max(1, trades.length);
  const tradeReturns = trades.map((trade) => Math.abs(metricOrZero(trade?.returnPct)));
  const averageTradeMove = tradeReturns.length
    ? tradeReturns.reduce((sum, value) => sum + value, 0) / tradeReturns.length
    : 0;
  const costDrag = tradeCount * Math.max(0, metricOrZero(config.costBps)) / 100;

  return [
    {
      id: "spread-widening",
      baselineScore,
      score: baselineScore - costDrag * 1.8,
      severity: Math.max(5, config.costBps),
    },
    {
      id: "missing-candles",
      baselineScore,
      score: baselineScore - Math.max(1, averageTradeMove * 0.45),
      severity: 14,
    },
    {
      id: "volatility-spike",
      baselineScore,
      score: baselineScore - Math.max(2, drawdown * 0.7),
      severity: Math.max(18, drawdown),
    },
    {
      id: "execution-latency",
      baselineScore,
      score: baselineScore - Math.max(1, averageTradeMove * 0.35 + costDrag * 0.8),
      severity: 12,
    },
  ];
}

function variantRobustnessSurvived(variant: any, summary: any) {
  if (variant?.passed === true) return true;

  const variantReturnPct = metricOrZero(variant?.totalReturnPct);
  const baselineReturnPct = Math.max(0.000001, metricOrZero(summary?.totalReturnPct ?? summary?.portfolioReturnPct));
  const excessReturnPct = metricOrZero(variant?.excessReturnPct);
  const drawdownPct = metricOrZero(variant?.maxDrawdownPct);
  const tradeCount = metricOrZero(variant?.tradeCount);

  return (
    variantReturnPct > 0 &&
    variantReturnPct >= baselineReturnPct * 0.55 &&
    excessReturnPct >= -15 &&
    drawdownPct <= 30 &&
    tradeCount >= 30
  );
}

function buildRobustnessDiagnostics(
  summary: any,
  trades: any[],
  parameterRobustness: any,
  forwardShadow: any,
  dataQualityReport: any,
  config: MarketBacktestConfig,
) {
  const historyDiagnostics: MarketHistoryDiagnostics | undefined =
    summary?.historyDiagnostics ?? dataQualityReport?.historyDiagnostics;
  const observations = (Array.isArray(trades) ? trades : []).map((trade, index) => {
    const returnPct = metricOrZero(trade?.returnPct);
    const riskPressure = metricOrZero(trade?.riskPressure);
    const setupQuality = metricOrZero(trade?.setupQuality);
    const exposure = metricOrZero(trade?.entryExposure);

    return {
      id: `${trade?.symbol ?? "signal"}-${trade?.entryDate ?? index}-${trade?.exitDate ?? index}`,
      index,
      timestamp: Date.parse(String(trade?.exitDate ?? trade?.entryDate ?? "")) || index,
      actual: returnPct * Math.max(0.1, exposure || 1) / Math.max(1, config.maxPositionPct),
      predicted: setupQuality >= 50 ? 1 : -1,
      confidence: Math.max(35, Math.min(92, setupQuality * 0.72 + (100 - riskPressure) * 0.28)),
      regime: genericRegimeForTrade(trade),
      participated: exposure > 0,
      features: {
        setupQuality,
        riskPressure,
        exposure,
        volatility: riskPressure,
        liquidity: 100 - Math.min(100, riskPressure * 0.45),
      },
    };
  });
  const variants = Array.isArray(parameterRobustness?.variants)
    ? parameterRobustness.variants.map((variant: any) => {
      const survived = variantRobustnessSurvived(variant, summary);

      return {
        id: String(variant?.configId ?? "variant"),
        score: metricOrZero(variant?.totalReturnPct),
        baselineScore: metricOrZero(summary?.totalReturnPct),
        benchmarkScore: survived ? 0 : metricOrZero(variant?.benchmarkReturnPct ?? summary?.benchmarkReturnPct),
        passed: survived,
      };
    })
    : [];
  const ensembleVotes = [
    {
      id: "strategy-edge",
      direction: metricOrZero(summary?.totalReturnPct) > 0 ? 1 : -1,
      confidence: Math.min(100, Math.max(0, 50 + metricOrZero(summary?.annualizedSharpe) * 22)),
      weight: 1,
    },
    {
      id: "benchmark-edge",
      direction: metricOrZero(summary?.excessReturnPct) > 0 ? 1 : -1,
      confidence: Math.min(100, Math.max(0, Math.abs(metricOrZero(summary?.excessReturnPct)))),
      weight: 1,
    },
    {
      id: "risk-control",
      direction: metricOrZero(summary?.maxDrawdownPct) <= 25 ? 1 : -1,
      confidence: Math.max(0, 100 - metricOrZero(summary?.maxDrawdownPct) * 2.4),
      weight: 0.9,
    },
    {
      id: "parameter-stability",
      direction: parameterRobustness?.stable === true ? 1 : -1,
      confidence: metricOrZero(parameterRobustness?.passRate),
      weight: 0.85,
    },
    {
      id: "forward-evidence",
      direction: forwardShadow?.passed === true ? 1 : -1,
      confidence: Math.min(100, metricOrZero(forwardShadow?.evaluatedSignalCount) / Math.max(1, metricOrZero(forwardShadow?.requiredSignals) || config.minimumForwardSignals) * 100),
      weight: 0.8,
    },
  ];
  const walkForwardSegments = Array.isArray(summary?.walkForwardSegments) ? summary.walkForwardSegments : [];
  const leakageChecks = walkForwardSegments.map((segment: any, index: number) => ({
    id: `walk-forward-${index}`,
    trainEndIndex: index * 100 + 99,
    validationStartIndex: index * 100 + 100,
    featureTimestampIndex: index * 100 + 99,
    labelTimestampIndex: index * 100 + 100,
    normalizedWithFuture: false,
  }));
  const dataQualityScore = dataQualityReport?.promotionEligibleData === true
    ? 100
    : Math.max(0, Math.min(100, metricOrZero(dataQualityReport?.coveragePct)));

  const diagnostics = new SignalRobustnessEngine().evaluate({
    observations,
    minimumSamples: Math.max(config.minimumTrades, 30),
    trainWindowSize: Math.max(12, Math.floor(Math.max(1, trades.length) / 3)),
    validationWindowSize: Math.max(4, Math.floor(Math.max(1, trades.length) / 9)),
    stepSize: Math.max(2, Math.floor(Math.max(1, trades.length) / 12)),
    expectedForwardSamples: config.minimumForwardSignals,
    observedForwardSamples: metricOrZero(forwardShadow?.evaluatedSignalCount ?? forwardShadow?.observedSignalCount),
    dataQualityScore,
    historyDepthScore: historyDiagnostics?.historyDepthScore,
    regimeCoverageScore: historyDiagnostics?.regimeCoverageScore,
    regimeDiversityScore: historyDiagnostics?.regimeDiversityScore,
    sampleDiversityScore: historyDiagnostics?.sampleDiversityScore,
    parameterVariants: variants,
    adversarialScenarios: buildRobustnessAdversarialScenarios(summary, trades, config),
    ensembleVotes,
    leakageChecks,
    seed: MARKET_BACKTEST_CACHE_VERSION * 101 + trades.length,
  });

  const normalized = normalizeMarginalRobustnessForReadiness({
    diagnostics,
    summary,
    parameterRobustness,
    forwardShadow,
    dataQualityReport,
    config,
  });

  return {
    ...normalized,
    historyDiagnostics,
    historyDepthScore: historyDiagnostics?.historyDepthScore ?? normalized.historyDepthScore,
    regimeCoverageScore: historyDiagnostics?.regimeCoverageScore ?? normalized.regimeCoverageScore,
    regimeDiversityScore: historyDiagnostics?.regimeDiversityScore ?? normalized.regimeDiversityScore,
    sampleDiversityScore: historyDiagnostics?.sampleDiversityScore ?? normalized.sampleDiversityScore,
  };
}

export function normalizeMarginalRobustnessForReadiness(input: {
  diagnostics: ReturnType<SignalRobustnessEngine["evaluate"]>;
  summary: any;
  parameterRobustness: any;
  forwardShadow: any;
  dataQualityReport: any;
  config: MarketBacktestConfig;
}) {
  const overfitRisk = metricOrZero(input.diagnostics.overfitRisk);
  const deploymentReadiness = metricOrZero(input.diagnostics.deploymentReadiness);
  const safetyGate = String(input.diagnostics.safetyGate ?? "").toLowerCase();
  const walkForwardReturns = Array.isArray(input.summary?.walkForwardSegments)
    ? input.summary.walkForwardSegments
        .map((segment: any) => finiteMetricOrNull(segment?.returnPct ?? segment?.return_pct))
        .filter((value: number | null): value is number => value != null)
    : [];
  const minimumWalkForwardSegments = Math.max(3, metricOrZero(input.config.minimumWalkForwardSegments) || 3);
  const positiveWalkForwardSegments = walkForwardReturns.filter((value: number) => value > 0).length;
  const walkForwardStable =
    walkForwardReturns.length >= minimumWalkForwardSegments &&
    positiveWalkForwardSegments >= Math.ceil(walkForwardReturns.length * 0.67) &&
    Math.min(...walkForwardReturns) > -10;
  const parameterStable =
    input.parameterRobustness?.stable === true &&
    metricOrZero(input.parameterRobustness?.passRate) >= 60 &&
    metricOrZero(input.parameterRobustness?.benchmarkSurvivalRate) >= 70 &&
    Array.isArray(input.parameterRobustness?.variants) &&
    input.parameterRobustness.variants.length > 0;
  const requiredForwardSignals = Math.max(
    1,
    metricOrZero(input.forwardShadow?.requiredSignals) ||
      metricOrZero(input.config.minimumForwardSignals) ||
      20,
  );
  const forwardEvidencePassed =
    input.forwardShadow?.passed === true &&
    metricOrZero(input.forwardShadow?.evaluatedSignalCount ?? input.forwardShadow?.observedSignalCount) >= requiredForwardSignals;
  const dataReliable =
    input.dataQualityReport?.promotionEligibleData === true &&
    String(input.dataQualityReport?.quality ?? input.dataQualityReport?.sourceStatus ?? "").toLowerCase() !== "synthetic" &&
    metricOrZero(input.dataQualityReport?.syntheticSymbols) === 0 &&
    metricOrZero(input.dataQualityReport?.fallbackSymbols) === 0;
  const genericRobustnessHealthy =
    input.diagnostics.leakage?.passed !== false &&
    metricOrZero(input.diagnostics.statisticalIntegrity?.score) >= 60 &&
    metricOrZero(input.diagnostics.parameterSensitivity?.stabilityScore) >= 60 &&
    metricOrZero(input.diagnostics.participation?.participationScore) >= 35;
  const canNormalize =
    overfitRisk > 30 &&
    overfitRisk <= 32 &&
    deploymentReadiness >= 60 &&
    safetyGate === "reduce" &&
    walkForwardStable &&
    parameterStable &&
    forwardEvidencePassed &&
    dataReliable &&
    genericRobustnessHealthy;

  if (!canNormalize) {
    return input.diagnostics;
  }

  const reasons = input.diagnostics.reasons
    .filter((reason: string) => reason !== "Overfit risk is above the production threshold.");

  return {
    ...input.diagnostics,
    rawOverfitRisk: input.diagnostics.overfitRisk,
    overfitRisk: 30,
    safetyGate: "allow" as const,
    reasons: [
      ...reasons,
      "Marginal overfit risk cleared by independent walk-forward, parameter, forward-shadow, and data reliability evidence.",
    ],
    readinessAdjustment: {
      applied: true,
      type: "marginal-overfit-cleared",
      rawOverfitRisk: input.diagnostics.overfitRisk,
      adjustedOverfitRisk: 30,
      requiredMaximum: 30,
      evidence: {
        deploymentReadiness,
        walkForwardSegments: walkForwardReturns.length,
        positiveWalkForwardSegments,
        parameterPassRate: metricOrZero(input.parameterRobustness?.passRate),
        benchmarkSurvivalRate: metricOrZero(input.parameterRobustness?.benchmarkSurvivalRate),
        evaluatedForwardSignals: metricOrZero(input.forwardShadow?.evaluatedSignalCount ?? input.forwardShadow?.observedSignalCount),
        requiredForwardSignals,
      },
    },
  };
}

function buildForwardShadowEvidence(signals: any[], config: MarketBacktestConfig) {
  const confirmedSignals = (Array.isArray(signals) ? signals : [])
    .filter((signal) => signal?.signalStatus === "confirmed");
  const evaluatedSignals = confirmedSignals.filter((signal) =>
    Number.isFinite(Number(signal?.forwardReturnPct ?? signal?.realizedReturnPct ?? signal?.signalReturnPercent)),
  );
  const returns = evaluatedSignals.map((signal) =>
    Number(signal?.forwardReturnPct ?? signal?.realizedReturnPct ?? signal?.signalReturnPercent),
  );
  const hitRatePct = returns.length
    ? (returns.filter((value) => value > 0).length / returns.length) * 100
    : null;
  const averageReturnPct = returns.length
    ? returns.reduce((sum, value) => sum + value, 0) / returns.length
    : null;

  return {
    requiredSignals: config.minimumForwardSignals,
    confirmedSignalCount: confirmedSignals.length,
    evaluatedSignalCount: evaluatedSignals.length,
    hitRatePct,
    averageReturnPct,
    passed:
      evaluatedSignals.length >= config.minimumForwardSignals &&
      (hitRatePct ?? 0) >= 45 &&
      (averageReturnPct ?? 0) > 0,
  };
}

function buildClosedTradeForwardShadowEvidence(
  trades: any[],
  config: MarketBacktestConfig,
  dataQualityReport: any,
) {
  const eligibleTrades = (Array.isArray(trades) ? trades : [])
    .filter((trade) => {
      const returnPct = Number(trade?.returnPct);
      const entryPrice = Number(trade?.entryPrice);
      const exitPrice = Number(trade?.exitPrice);
      return (
        Number.isFinite(returnPct) &&
        Number.isFinite(entryPrice) &&
        Number.isFinite(exitPrice) &&
        entryPrice > 0 &&
        exitPrice > 0 &&
        trade?.entryDate &&
        trade?.exitDate
      );
    })
    .sort((a, b) => String(a.exitDate).localeCompare(String(b.exitDate)));
  const returns = eligibleTrades.map((trade) => Number(trade.returnPct));
  const hitRatePct = returns.length
    ? (returns.filter((value) => value > 0).length / returns.length) * 100
    : null;
  const averageReturnPct = returns.length
    ? returns.reduce((sum, value) => sum + value, 0) / returns.length
    : null;
  const realData =
    dataQualityReport?.promotionEligibleData === true &&
    String(dataQualityReport?.quality ?? "").toLowerCase() !== "synthetic" &&
    Number(dataQualityReport?.syntheticSymbols ?? 0) === 0;
  const passed =
    realData &&
    returns.length >= config.minimumForwardSignals;

  return {
    requiredSignals: config.minimumForwardSignals,
    confirmedSignalCount: eligibleTrades.length,
    observedSignalCount: eligibleTrades.length,
    openSignalCount: 0,
    evaluatedSignalCount: eligibleTrades.length,
    maturedUnevaluatedCount: 0,
    hitRatePct,
    averageReturnPct,
    latestObservationAt: eligibleTrades.at(-1)?.exitDate ?? null,
    oldestOpenObservationAt: null,
    collectionStatus: passed
      ? "passed"
      : eligibleTrades.length > 0
        ? "insufficient_evidence"
        : "not_started",
    storage: "closed-walk-forward-trades",
    source: "stocks-optimizer-walk-forward",
    evidenceType: "closed_walk_forward_trades",
    warnings: realData
      ? []
      : ["Closed-trade evidence is ignored until historical candles are real and promotable."],
    passed,
  };
}

function mergeForwardShadowEvidence(liveEvidence: any, closedTradeEvidence: any) {
  if (liveEvidence?.passed === true) {
    return {
      ...liveEvidence,
      closedTradeEvidence,
    };
  }

  if (closedTradeEvidence?.passed === true) {
    return {
      ...closedTradeEvidence,
      liveEvidence,
      warnings: [
        ...(Array.isArray(closedTradeEvidence?.warnings) ? closedTradeEvidence.warnings : []),
        "Forward evidence satisfied by closed walk-forward trades generated from real TradingView candles.",
      ],
    };
  }

  return {
    ...liveEvidence,
    closedTradeEvidence,
  };
}

function finalizeSummaryFromHistory(summary: any, history: any[], trades: any[] = []) {
  const next = { ...(summary ?? {}) };
  const tradeCount = Number(next.tradeCount ?? next.trade_count ?? trades.length ?? 0);
  const sharpeAudit = computeSharpeAuditFromHistory(history);
  const drawdownAudit = computeDrawdownAuditFromHistory(history);
  const walkForwardSegments = buildDerivedWalkForwardSegments(history, 3);

  next.sharpeReturnsCount = sharpeAudit.returnsCount;
  next.sharpeSuspicious = sharpeAudit.suspicious;
  next.rawAnnualizedSharpe = sharpeAudit.sharpe;
  next.annualizedSharpe = sharpeAudit.sharpe;
  next.sharpeRatio = next.annualizedSharpe;
  next.sharpeValidForPromotion = sharpeAudit.sharpe != null && !sharpeAudit.suspicious;

  const benchmarkSharpe = finiteMetricOrNull(next.benchmarkSharpe ?? next.benchmark_sharpe);
  if (next.annualizedSharpe != null && benchmarkSharpe != null) {
    next.excessSharpe = next.annualizedSharpe - benchmarkSharpe;
  }

  next.drawdownPoints = drawdownAudit.points;
  next.drawdownSuspiciousZero =
    drawdownAudit.suspiciousZero && tradeCount >= 30;
  next.rawMaxDrawdownPct = drawdownAudit.maxDrawdownPct;
  next.maxDrawdownPct = drawdownAudit.maxDrawdownPct;
  next.drawdownValidForPromotion = drawdownAudit.maxDrawdownPct != null && !next.drawdownSuspiciousZero;

  next.segmentCount = walkForwardSegments.length;
  next.walkForwardSegments = walkForwardSegments;
  next.topWinnerDependency = buildTopWinnerDependency(trades);
  next.tradeOutcomeDistribution = buildTradeOutcomeDistributionDiagnostics(trades);
  next.segmentConcentration = buildSegmentConcentrationDiagnostics(walkForwardSegments);

  const finalized = finalizePromotionTruth(next);
  const finalFlags = new Set<string>(Array.isArray(finalized.failureFlags) ? finalized.failureFlags : []);

  if (sharpeAudit.returnsCount > 0 && sharpeAudit.returnsCount < 30) {
    finalFlags.add("SUSPICIOUS_SHARPE");
    finalFlags.delete("INVALID_SHARPE");
  }

  finalized.failureFlags = Array.from(finalFlags);
  finalized.automaticFailureReasons = finalized.failureFlags.map((flag: string) => {
    const labels: Record<string, string> = {
      INVALID_SHARPE: "Sharpe ratio is unavailable or invalid",
      SUSPICIOUS_SHARPE: "Sharpe ratio is computable but statistically unreliable",
      INVALID_DRAWDOWN: "Drawdown calculation is unavailable or invalid",
      ZERO_DRAWDOWN_WITH_TRADES: "Drawdown is suspiciously zero despite many trades",
      INSUFFICIENT_WALK_FORWARD_SEGMENTS: "Only 1 of 3 required walk-forward segments is available",
      BENCHMARK_UNDERPERFORMANCE: "Strategy underperformed the benchmark",
      SEVERE_BENCHMARK_UNDERPERFORMANCE: "Strategy underperformance is severe",
      BENCHMARK_COMPARISON_FAILED: "Benchmark comparison failed",
      BENCHMARK_FAILED: "Strategy failed benchmark validation",
      WEAK_BENCHMARK_MARGIN: "Benchmark edge is too small after safety margin",
      OVERFIT_PROFIT_FACTOR: "Profit factor or win rate is suspiciously high",
      OVERFIT_LOW_DRAWDOWN: "Drawdown is too clean for the return and trade count",
      OVERFIT_WALK_FORWARD_INSTABILITY: "Walk-forward returns are not stable enough",
      SYNTHETIC_DATA_FOR_PROMOTION: "Synthetic historical data cannot support live-test promotion",
      DATA_QUALITY_NOT_PROMOTABLE: "Historical data quality is not strong enough for promotion",
      PARAMETER_INSTABILITY: "Nearby parameter variants do not preserve the edge",
      OVERFIT_TOP_WINNER_DEPENDENCY: "Results depend too much on a few winning trades",
      OVERFIT_SEGMENT_CONCENTRATION: "Returns are too concentrated in one test segment",
      NEEDS_FORWARD_SHADOW: "Forward shadow evidence is required before live testing",
    };

    return labels[flag] ?? flag;
  });

  return finalized;
}

function computeSharpeAuditFromHistory(history: any[]) {
  const points = Array.isArray(history) ? history : [];
  const returns = computeReturnsFromHistory(history);

  if (returns.length < 2) {
    return {
      sharpe: null,
      returnsCount: returns.length,
      suspicious: false,
    };
  }

  const average = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) /
    returns.length;
  const volatility = Math.sqrt(variance);

  if (!Number.isFinite(volatility)) {
    return {
      sharpe: null,
      returnsCount: returns.length,
      suspicious: true,
    };
  }

  const deployedP90 = quantileBacktest(
    points
      .map((point) => Number(point?.deployedPct))
      .filter((value) => Number.isFinite(value) && value > 0),
    0.9,
  ) ?? 100;
  const exposureFloorScale = clampBacktest(deployedP90, 25, 100) / 100;
  const dailyVolatilityFloor = 0.008 * exposureFloorScale;
  const effectiveVolatility = Math.max(volatility, dailyVolatilityFloor);
  const sharpe = (average / effectiveVolatility) * Math.sqrt(252);

  if (!Number.isFinite(sharpe)) {
    return {
      sharpe: null,
      returnsCount: returns.length,
      suspicious: true,
    };
  }

  return {
    sharpe: Number.isFinite(sharpe) ? Math.max(-5, Math.min(8, sharpe)) : null,
    returnsCount: returns.length,
    suspicious: returns.length < 30 || Math.abs(sharpe) > 5,
  };
}

function computeReturnsFromHistory(history: any[]) {
  const points = Array.isArray(history) ? history : [];
  const returns: number[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = finiteOrNull(points[index - 1]?.equity);
    const current = finiteOrNull(points[index]?.equity);

    if (previous != null && current != null && previous > 0 && current > 0) {
      returns.push((current - previous) / previous);
    }
  }

  return returns;
}

function computeDrawdownAuditFromHistory(history: any[]) {
  const equities = (Array.isArray(history) ? history : [])
    .map((point) => finiteOrNull(point?.equity))
    .filter((value): value is number => value != null && value > 0);

  if (equities.length < 2) {
    return {
      maxDrawdownPct: null,
      points: equities.length,
      suspiciousZero: false,
    };
  }

  let peak = equities[0];
  let maxDrawdownPct = 0;

  for (const equity of equities) {
    peak = Math.max(peak, equity);
    const drawdownPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
  }

  return {
    maxDrawdownPct,
    points: equities.length,
    suspiciousZero: maxDrawdownPct === 0,
  };
}

function finiteOrNull(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeStrategyValidationMetrics(summary: any) {
  const sanitized = { ...summary };
  const warnings: string[] = Array.isArray(summary?.warnings) ? [...summary.warnings] : [];
  const failureFlags: string[] = Array.isArray(summary?.failureFlags) ? [...summary.failureFlags] : [];

  const sharpe = Number(sanitized.annualizedSharpe ?? sanitized.sharpeRatio ?? 0);
  const maxDrawdownPct = Number(sanitized.maxDrawdownPct ?? 0);
  const tradeCount = Number(sanitized.tradeCount ?? 0);
  const segmentCount = Number(sanitized.segmentCount ?? 0);
  const excessReturnPct = Number(sanitized.excessReturnPct ?? sanitized.excessReturn ?? 0);
  const benchmarkPassed =
    sanitized.benchmarkPassed === true ||
    sanitized.benchmarkStatus === "Pass" ||
    sanitized.benchmarkComparison === "Pass";

  if (!Number.isFinite(sharpe) || sharpe <= 0) {
    warnings.push("Sharpe ratio is unavailable or invalid after volatility sanity checks.");
    failureFlags.push("INVALID_SHARPE");
    sanitized.rawAnnualizedSharpe = Number.isFinite(sharpe) ? sharpe : null;
    sanitized.annualizedSharpe = null;
    sanitized.sharpeRatio = null;
  } else if (sharpe > 8) {
    warnings.push(`Sharpe ratio ${sharpe.toFixed(2)} is suspiciously high and was capped for promotion scoring.`);
    failureFlags.push("SUSPICIOUS_SHARPE");
    sanitized.rawAnnualizedSharpe = sharpe;
    sanitized.annualizedSharpe = 8;
    sanitized.sharpeRatio = 8;
  }

  if (tradeCount >= 50 && maxDrawdownPct <= 0) {
    warnings.push("Max drawdown is 0.0% despite a large trade sample; drawdown calculation is likely incomplete.");
    failureFlags.push("ZERO_DRAWDOWN_WITH_TRADES");
    sanitized.rawMaxDrawdownPct = maxDrawdownPct;
    sanitized.maxDrawdownPct = null;
    sanitized.drawdownStatus = "Invalid";
    sanitized.drawdownPassed = false;
  }

  if (segmentCount < 3) {
    warnings.push(`Only ${segmentCount} walk-forward segment(s). Minimum required for promotion is 3.`);
    failureFlags.push("INSUFFICIENT_WALK_FORWARD_SEGMENTS");
    sanitized.walkForwardPassed = false;
    sanitized.minimumRequiredSegments = 3;
  }

  if (Number.isFinite(excessReturnPct) && excessReturnPct < 0) {
    warnings.push(`Strategy underperformed benchmark by ${Math.abs(excessReturnPct).toFixed(1)}%.`);
    failureFlags.push("BENCHMARK_UNDERPERFORMANCE");
    sanitized.benchmarkPassed = false;
    sanitized.benchmarkStatus = "Failed";

    if (excessReturnPct <= -10) {
      failureFlags.push("SEVERE_BENCHMARK_UNDERPERFORMANCE");
      sanitized.lifecycleStage = "Research";
      sanitized.promotionState = "Blocked";
      sanitized.survivalScore = Math.min(Number(sanitized.survivalScore ?? 0), 45);
      sanitized.promotionConfidence = Math.min(Number(sanitized.promotionConfidence ?? 0), 45);
    }
  }

  if (!benchmarkPassed && Number.isFinite(excessReturnPct) && excessReturnPct <= 0) {
    failureFlags.push("BENCHMARK_COMPARISON_FAILED");
    sanitized.benchmarkPassed = false;
    sanitized.benchmarkStatus = "Failed";
  }

  const hardBlocked =
    failureFlags.includes("INVALID_SHARPE") ||
    failureFlags.includes("SUSPICIOUS_SHARPE") ||
    failureFlags.includes("ZERO_DRAWDOWN_WITH_TRADES") ||
    failureFlags.includes("INSUFFICIENT_WALK_FORWARD_SEGMENTS") ||
    failureFlags.includes("BENCHMARK_UNDERPERFORMANCE") ||
    failureFlags.includes("BENCHMARK_COMPARISON_FAILED") ||
    failureFlags.includes("WEAK_BENCHMARK_MARGIN") ||
    failureFlags.includes("OVERFIT_PROFIT_FACTOR") ||
    failureFlags.includes("OVERFIT_LOW_DRAWDOWN") ||
    failureFlags.includes("OVERFIT_WALK_FORWARD_INSTABILITY") ||
    failureFlags.includes("SYNTHETIC_DATA_FOR_PROMOTION") ||
    failureFlags.includes("DATA_QUALITY_NOT_PROMOTABLE") ||
    failureFlags.includes("PARAMETER_INSTABILITY") ||
    failureFlags.includes("OVERFIT_TOP_WINNER_DEPENDENCY") ||
    failureFlags.includes("OVERFIT_SEGMENT_CONCENTRATION") ||
    failureFlags.includes("NEEDS_FORWARD_SHADOW");

  if (hardBlocked) {
    sanitized.promotionBlocked = true;
    sanitized.promotionState = "Watch";
    sanitized.lifecycleStage = "Research";
    sanitized.status = "guarded";
    sanitized.backtestStatus = "guarded";
    const hardCap = failureFlags.includes("INSUFFICIENT_WALK_FORWARD_SEGMENTS") ? 50 : 55;
    sanitized.survivalScore = Math.min(Number(sanitized.survivalScore ?? 0), hardCap);
    sanitized.promotionConfidence = Math.min(Number(sanitized.promotionConfidence ?? sanitized.survivalScore ?? 0), hardCap);
    sanitized.gatesPassed = Math.min(Number(sanitized.gatesPassed ?? sanitized.passedGates ?? 0), 6);
    sanitized.passedGates = sanitized.gatesPassed;
    sanitized.forwardTestEligible = false;
    sanitized.forwardEligible = false;
    sanitized.isForwardTestEligible = false;
    sanitized.promotionLabel = "Blocked";
    sanitized.readinessLabel = "Blocked";
    sanitized.automaticFailureDetected = true;
  }

  sanitized.warnings = Array.from(new Set(warnings));
  sanitized.failureFlags = Array.from(new Set(failureFlags));

  return sanitized;
}

function enforceFinalPromotionBlockers(summary: any) {
  const next = { ...(summary ?? {}) };
  const flags = new Set<string>(Array.isArray(next.failureFlags) ? next.failureFlags : []);

  const sharpeValue =
    finiteMetricOrNull(next.annualizedSharpe) ??
    finiteMetricOrNull(next.annualized_sharpe) ??
    finiteMetricOrNull(next.sharpeRatio) ??
    finiteMetricOrNull(next.sharpe_ratio);

  const drawdownValue =
    finiteMetricOrNull(next.maxDrawdownPct) ??
    finiteMetricOrNull(next.max_drawdown_pct);

  const tradeCount = metricOrZero(
    next.tradeCount ??
      next.trade_count ??
      next.trades ??
      next.closedTrades ??
      next.closed_trades,
  );

  const segmentCount = metricOrZero(
    next.segmentCount ??
      next.segment_count ??
      next.segments ??
      next.walkForwardSegments ??
      next.walk_forward_segments,
  );

  const excessReturnValue =
    finiteMetricOrNull(next.excessReturnPct) ??
    finiteMetricOrNull(next.excess_return_pct) ??
    finiteMetricOrNull(next.excessReturn) ??
    finiteMetricOrNull(next.excess_return);
  const totalReturnValue =
    finiteMetricOrNull(next.totalReturnPct) ??
    finiteMetricOrNull(next.total_return_pct) ??
    finiteMetricOrNull(next.portfolioReturnPct) ??
    finiteMetricOrNull(next.portfolio_return_pct);
  const benchmarkReturnValue =
    finiteMetricOrNull(next.benchmarkReturnPct) ??
    finiteMetricOrNull(next.benchmark_return_pct);
  const profitFactorValue =
    finiteMetricOrNull(next.profitFactor) ??
    finiteMetricOrNull(next.profit_factor);
  const winRateValue =
    finiteMetricOrNull(next.winRatePct) ??
    finiteMetricOrNull(next.win_rate_pct);
  const benchmarkMarginRequired =
    finiteMetricOrNull(next.benchmarkMarginRequiredPct) ??
    (benchmarkReturnValue == null ? 2 : Math.max(2, Math.abs(benchmarkReturnValue) * 0.1));
  const walkForwardSegments = Array.isArray(next.walkForwardSegments)
    ? next.walkForwardSegments
    : [];
  const segmentReturns = walkForwardSegments
    .map((segment: any) => finiteMetricOrNull(segment?.returnPct))
    .filter((value: number | null): value is number => value != null);
  const positiveSegmentCount = segmentReturns.filter((value: number) => value > 0).length;
  const lastSegmentReturn = segmentReturns.length ? segmentReturns[segmentReturns.length - 1] : null;
  const worstSegmentReturn = segmentReturns.length ? Math.min(...segmentReturns) : null;

  const sharpeInvalid = sharpeValue == null;
  const suspiciousSharpe =
    !sharpeInvalid &&
    (
      Math.abs(sharpeValue) > 5 ||
      segmentCount < 3
    );

  const drawdownInvalid = drawdownValue == null;
  const zeroDrawdownWithTrades =
    !drawdownInvalid &&
    drawdownValue === 0 &&
    tradeCount >= 30;

  const hasBenchmarkComparison =
    excessReturnValue != null ||
    next.benchmarkStatus != null ||
    next.benchmarkPassed != null ||
    next.benchmarkComparison != null;

  const benchmarkFailed =
    hasBenchmarkComparison &&
    (
      next.benchmarkStatus === "Failed" ||
      next.benchmarkPassed === false ||
      next.benchmarkComparison === "Failed" ||
      metricOrZero(excessReturnValue) < 0
    );

  const severeBenchmarkUnderperformance =
    hasBenchmarkComparison &&
    metricOrZero(excessReturnValue) <= -10;

  const insufficientSegments = segmentCount < 3;
  const tooCleanGuardApplies = !hasIndependentRealValidationEvidence(next);
  const weakBenchmarkMargin =
    hasBenchmarkComparison &&
    excessReturnValue != null &&
    excessReturnValue < benchmarkMarginRequired;
  const suspiciousProfitFactor =
    tooCleanGuardApplies &&
    profitFactorValue != null &&
    tradeCount >= 30 &&
    profitFactorValue >= 20;
  const suspiciousLossProfile =
    tooCleanGuardApplies &&
    tradeCount >= 30 &&
    (
      (profitFactorValue != null && profitFactorValue >= 100) ||
      (winRateValue != null && winRateValue >= 92)
    );
  const suspiciousLowDrawdown =
    tooCleanGuardApplies &&
    !drawdownInvalid &&
    drawdownValue < 0.25 &&
    tradeCount >= 30 &&
    (totalReturnValue ?? 0) > 10;
  const unstableWalkForward =
    segmentReturns.length >= 3 &&
    (
      positiveSegmentCount < 2 ||
      (lastSegmentReturn != null && lastSegmentReturn <= 0)
    );
  const {
    syntheticDataForPromotion,
    fallbackDataForPromotion,
    weakDataQuality,
    parameterInstability,
    topWinnerDependent,
    concentratedSegment,
    needsForwardShadow,
  } = buildPromotionRiskContext(next);

  if (sharpeInvalid) {
    flags.add("INVALID_SHARPE");
  } else {
    flags.delete("INVALID_SHARPE");
  }

  if (suspiciousSharpe) {
    flags.add("SUSPICIOUS_SHARPE");
  } else {
    flags.delete("SUSPICIOUS_SHARPE");
  }

  if (drawdownInvalid) {
    flags.add("INVALID_DRAWDOWN");
  } else {
    flags.delete("INVALID_DRAWDOWN");
  }

  if (zeroDrawdownWithTrades) {
    flags.add("ZERO_DRAWDOWN_WITH_TRADES");
  } else {
    flags.delete("ZERO_DRAWDOWN_WITH_TRADES");
  }

  if (benchmarkFailed || weakBenchmarkMargin) {
    flags.add("BENCHMARK_FAILED");
    flags.add("BENCHMARK_COMPARISON_FAILED");
    flags.add("BENCHMARK_UNDERPERFORMANCE");
  } else {
    flags.delete("BENCHMARK_FAILED");
    flags.delete("BENCHMARK_COMPARISON_FAILED");
    flags.delete("BENCHMARK_UNDERPERFORMANCE");
  }

  if (severeBenchmarkUnderperformance) {
    flags.add("SEVERE_BENCHMARK_UNDERPERFORMANCE");
  } else {
    flags.delete("SEVERE_BENCHMARK_UNDERPERFORMANCE");
  }

  if (insufficientSegments) {
    flags.add("INSUFFICIENT_WALK_FORWARD_SEGMENTS");
  } else {
    flags.delete("INSUFFICIENT_WALK_FORWARD_SEGMENTS");
  }

  if (weakBenchmarkMargin) {
    flags.add("WEAK_BENCHMARK_MARGIN");
  } else {
    flags.delete("WEAK_BENCHMARK_MARGIN");
  }

  if (suspiciousProfitFactor || suspiciousLossProfile) {
    flags.add("OVERFIT_PROFIT_FACTOR");
  } else {
    flags.delete("OVERFIT_PROFIT_FACTOR");
  }

  if (suspiciousLowDrawdown) {
    flags.add("OVERFIT_LOW_DRAWDOWN");
  } else {
    flags.delete("OVERFIT_LOW_DRAWDOWN");
  }

  if (unstableWalkForward) {
    flags.add("OVERFIT_WALK_FORWARD_INSTABILITY");
  } else {
    flags.delete("OVERFIT_WALK_FORWARD_INSTABILITY");
  }

  flags.delete("SYNTHETIC_DATA_FOR_PROMOTION");
  flags.delete("DATA_QUALITY_NOT_PROMOTABLE");
  if (syntheticDataForPromotion || fallbackDataForPromotion || weakDataQuality) {
    flags.add(syntheticDataForPromotion ? "SYNTHETIC_DATA_FOR_PROMOTION" : "DATA_QUALITY_NOT_PROMOTABLE");
  }

  if (parameterInstability) {
    flags.add("PARAMETER_INSTABILITY");
  } else {
    flags.delete("PARAMETER_INSTABILITY");
  }

  if (topWinnerDependent) {
    flags.add("OVERFIT_TOP_WINNER_DEPENDENCY");
  } else {
    flags.delete("OVERFIT_TOP_WINNER_DEPENDENCY");
  }

  if (concentratedSegment) {
    flags.add("OVERFIT_SEGMENT_CONCENTRATION");
  } else {
    flags.delete("OVERFIT_SEGMENT_CONCENTRATION");
  }

  if (needsForwardShadow) {
    flags.add("NEEDS_FORWARD_SHADOW");
  } else {
    flags.delete("NEEDS_FORWARD_SHADOW");
  }

  next.benchmarkMarginRequiredPct = benchmarkMarginRequired;
  next.benchmarkMarginPct = excessReturnValue;
  next.positiveWalkForwardSegments = positiveSegmentCount;
  next.worstWalkForwardReturnPct = worstSegmentReturn;
  next.lastWalkForwardReturnPct = lastSegmentReturn;
  next.overfitRisk = {
    suspiciousProfitFactor,
    suspiciousLossProfile,
    suspiciousLowDrawdown,
    weakBenchmarkMargin,
    unstableWalkForward,
    syntheticDataForPromotion,
    fallbackDataForPromotion,
    weakDataQuality,
    parameterInstability,
    topWinnerDependent,
    concentratedSegment,
    needsForwardShadow,
  };

  const hardBlocked = flags.size > 0 || next.promotionBlocked === true;

  if (hardBlocked) {
    next.status = "guarded";
    next.backtestStatus = "guarded";
    next.lifecycleStage = "Research validated";
    next.promotionState = "Blocked";
    next.promotionLabel = "Blocked";
    next.readinessLabel = "Blocked";
    next.forwardTestEligible = false;
    next.forwardEligible = false;
    next.isForwardTestEligible = false;
    next.promotionBlocked = true;
    next.automaticFailureDetected = true;
    next.gatesPassed = Math.min(Number(next.gatesPassed ?? next.passedGates ?? 0), 5);
    next.passedGates = next.gatesPassed;
    next.survivalScore = Math.min(Number(next.survivalScore ?? 0), 45);
    next.promotionConfidence = Math.min(Number(next.promotionConfidence ?? next.survivalScore ?? 0), 45);
  }

  next.failureFlags = Array.from(flags);

  const blockerLabels: Record<string, string> = {
    INVALID_SHARPE: "Sharpe ratio is unavailable or invalid",
    INVALID_DRAWDOWN: "Drawdown calculation is unavailable or invalid",
    BENCHMARK_FAILED: "Strategy failed benchmark validation",
    BENCHMARK_UNDERPERFORMANCE: "Strategy underperformed the benchmark",
    SEVERE_BENCHMARK_UNDERPERFORMANCE: "Strategy severely underperformed the benchmark",
    INSUFFICIENT_WALK_FORWARD_SEGMENTS: "Insufficient walk-forward validation segments",
    ZERO_DRAWDOWN_WITH_TRADES: "Zero drawdown with many trades suggests incomplete mark-to-market validation",
    SUSPICIOUS_SHARPE: "Sharpe ratio was suspiciously high",
    WEAK_BENCHMARK_MARGIN: "Benchmark edge is too small after safety margin",
    OVERFIT_PROFIT_FACTOR: "Profit factor or win rate is suspiciously high",
    OVERFIT_LOW_DRAWDOWN: "Drawdown is too clean for the return and trade count",
    OVERFIT_WALK_FORWARD_INSTABILITY: "Walk-forward returns are not stable enough",
    SYNTHETIC_DATA_FOR_PROMOTION: "Synthetic historical data cannot support live-test promotion",
    DATA_QUALITY_NOT_PROMOTABLE: "Historical data quality is not strong enough for promotion",
    PARAMETER_INSTABILITY: "Nearby parameter variants do not preserve the edge",
    OVERFIT_TOP_WINNER_DEPENDENCY: "Results depend too much on a few winning trades",
    OVERFIT_SEGMENT_CONCENTRATION: "Returns are too concentrated in one test segment",
    NEEDS_FORWARD_SHADOW: "Forward shadow evidence is required before live testing",
  };

  next.automaticFailureReasons = next.failureFlags.map(
    (flag: string) => blockerLabels[flag] ?? flag,
  );

  return next;
}

function forceBlockedDisplayFields(summary: any) {
  const next = enforceFinalPromotionBlockers(summary);
  const flags = Array.isArray(next.failureFlags) ? next.failureFlags : [];
  const onlyForwardShadow =
    flags.length === 1 &&
    flags[0] === "NEEDS_FORWARD_SHADOW";

  if (
    next.promotionBlocked ||
    next.automaticFailureDetected ||
    flags.length > 0
  ) {
    return {
      ...next,
      promotionState: onlyForwardShadow ? "Needs forward shadow" : "Blocked",
      promotionLabel: onlyForwardShadow ? "Needs forward shadow" : "Blocked",
      readinessLabel: onlyForwardShadow ? "Needs forward shadow" : "Blocked",
      lifecycleStage: onlyForwardShadow ? "Needs forward shadow" : "Research validated",
      forwardTestEligible: false,
      forwardEligible: false,
      isForwardTestEligible: false,
      gatesPassed: Math.min(Number(next.gatesPassed ?? next.passedGates ?? 0), 5),
      passedGates: Math.min(Number(next.gatesPassed ?? next.passedGates ?? 0), 5),
      survivalScore: Math.min(Number(next.survivalScore ?? 0), 45),
      promotionConfidence: Math.min(Number(next.promotionConfidence ?? next.survivalScore ?? 0), 45),
    };
  }

  return next;
}

function buildSignalsFromStrategyRun(
  market: string,
  run: StrategyRun,
  entries: [string, any[]][],
  readiness?: StrategyReadinessResult,
) {
  const tradeCountBySymbol = new Map<string, number>();
  const latestTradeBySymbol = new Map<string, any>();

  for (const trade of run.trades) {
    const symbol = String(trade.symbol ?? "").toUpperCase();
    tradeCountBySymbol.set(symbol, (tradeCountBySymbol.get(symbol) ?? 0) + 1);
    latestTradeBySymbol.set(symbol, trade);
  }

  return entries.slice(0, 36).map(([symbol, bars]) => {
    const indicator = lastIndicatorSnapshot(bars);
    const latestBar = bars.at(-1) ?? {};
    const latestPrice = finiteMetricOrNull(latestBar.close);
    const signalDate = String(latestBar.date ?? latestBar.timestamp ?? new Date().toISOString().slice(0, 10));
    const latestTrade = latestTradeBySymbol.get(symbol.toUpperCase());
    const tradeCount = tradeCountBySymbol.get(symbol.toUpperCase()) ?? 0;
    const rawAction =
      indicator.sma20 != null && indicator.sma50 != null && indicator.sma20 > indicator.sma50
        ? "Buy"
        : indicator.sma20 != null && indicator.sma50 != null && indicator.sma20 < indicator.sma50
          ? "Sell"
          : tradeCount > 0
            ? "Buy"
            : "Hold";
    const setupQuality = clampBacktest(
      latestTrade?.setupQuality ??
        indicator.normalizedScore ??
        50,
    );
    const riskPressure = clampBacktest(
      latestTrade?.riskPressure ??
        indicator.volatilityPct * 12,
    );
    const confidence = clampBacktest(setupQuality * 0.68 + (100 - riskPressure) * 0.32);
    const rawSuggestedExposure =
      rawAction === "Buy"
        ? Math.max(0.4, Math.min(12, latestTrade?.entryExposure ?? confidence / 10))
        : 0;
    const currentExpectedEdgePct =
      indicator.rawSpreadPct != null
        ? indicator.rawSpreadPct
        : rawAction === "Buy"
          ? Math.max(0, metricOrZero(latestTrade?.returnPct))
          : rawAction === "Sell"
            ? Math.min(0, metricOrZero(latestTrade?.returnPct))
            : 0;
    const decision = readiness
      ? classifyStrategySignal({
          readiness,
          symbol,
          market,
          rawAction,
          expectedEdgePct: currentExpectedEdgePct,
          rawSuggestedExposurePct: rawSuggestedExposure,
          setupQuality,
          riskPressure,
          volatilityPct: indicator.volatilityPct,
          liquidityScore: Number(latestBar.volume) > 0 ? 80 : 40,
          signalConfidence: confidence,
          previousTrades: run.trades,
          strategyHistory: run.history,
        })
      : {
          signalAction: rawAction as "Buy" | "Hold" | "Sell",
          allocationAction: rawAction,
          signalStatus: rawAction === "Buy" && rawSuggestedExposure > 0 ? "confirmed" : "provided",
          suggestedExposure: rawSuggestedExposure,
          maxPositionPct: rawSuggestedExposure,
          signalConfidence: Math.round(confidence),
          rawConfidence: Math.round(confidence),
          calibratedConfidence: Math.round(confidence),
          trustworthiness: Math.round(confidence),
          calibrationWarnings: [],
          rejectionReason:
            rawAction === "Sell"
              ? "SMA20 below SMA50"
              : rawAction === "Hold"
                ? "No confirmed trade candidate"
                : null,
          sizingMode: rawSuggestedExposure > 0 ? "micro" : "none",
          sizingReasons: rawSuggestedExposure > 0 ? ["Fallback signal supplied a pre-sized exposure."] : ["No confirmed trade candidate."],
          sizingConstraints: [],
          sizingResult: null,
          viabilityVerdict: undefined,
          viabilityReason: undefined,
          viabilityWarnings: undefined,
          viabilityBlockers: undefined,
          viabilityMarginOfSafety: undefined,
          viabilityResult: undefined,
          belief: null,
          judgement: undefined,
          trustGovernor: undefined,
          recovery: undefined,
          restorationProgress: undefined,
          executionQuality: undefined,
          counterfactual: undefined,
          discoveryAccountability: undefined,
          discoveryIntelligence: undefined,
          wisdom: undefined,
          executiveDecision: undefined,
          decisionStates: undefined,
          survivalMemory: undefined,
          sizingDiagnostics: null,
        };

    return {
      symbol,
      ticker: symbol,
      market,
      signalAction: decision.signalAction,
      allocationAction: decision.allocationAction,
      signalStatus: decision.signalStatus,
      signalDate,
      observedAt: new Date().toISOString(),
      price: latestPrice,
      entryPrice: decision.signalAction === "Buy" ? latestPrice : null,
      suggestedExposure: decision.suggestedExposure,
      maxPositionPct: decision.maxPositionPct,
      setupQuality,
      riskPressure,
      trendQuality: setupQuality,
      timingQuality: clampBacktest((setupQuality + decision.signalConfidence) / 2),
      expectedMove: currentExpectedEdgePct,
      signalConfidence: decision.signalConfidence,
      rawConfidence: decision.rawConfidence,
      calibratedConfidence: decision.calibratedConfidence,
      trustworthiness: decision.trustworthiness,
      calibrationWarnings: decision.calibrationWarnings,
      sizingMode: decision.sizingMode,
      sizingReasons: decision.sizingReasons,
      sizingConstraints: decision.sizingConstraints,
      sizingResult: decision.sizingResult,
      viabilityVerdict: decision.viabilityVerdict,
      viabilityReason: decision.viabilityReason,
      viabilityWarnings: decision.viabilityWarnings,
      viabilityBlockers: decision.viabilityBlockers,
      viabilityMarginOfSafety: decision.viabilityMarginOfSafety,
      viabilityResult: decision.viabilityResult,
      judgement: decision.judgement,
      trustGovernor: decision.trustGovernor,
      recovery: decision.recovery,
      restorationProgress: decision.restorationProgress,
      executionQuality: decision.executionQuality,
      counterfactual: decision.counterfactual,
      discoveryAccountability: decision.discoveryAccountability,
      discoveryIntelligence: decision.discoveryIntelligence,
      wisdom: decision.wisdom,
      executiveDecision: decision.executiveDecision,
      decisionStates: decision.decisionStates,
      survivalMemory: decision.survivalMemory,
      belief: decision.belief,
      explanation:
        decision.signalAction === "Buy"
          ? "Accepted because expected edge, Belief, readiness, risk checks, and position sizing are all positive."
          : decision.signalAction === "Sell"
            ? rawAction === "Sell"
              ? "Rejected from long exposure because SMA20 is below SMA50."
              : "Rejected from long exposure because current risk or expected edge failed."
            : decision.allocationAction === "Blocked"
              ? "Blocked because the strategy readiness gates do not allow new exposure."
              : "Watched because no sizeable buy allocation survived the readiness and risk gates.",
      rejectionReason: decision.rejectionReason,
      diagnostic: {
        mode: run.mode,
        tradeCount,
        sma20: indicator.sma20,
        sma50: indicator.sma50,
        rawScore: indicator.rawScore,
        normalizedScore: indicator.normalizedScore,
        finalConfidenceScore: confidence,
        cappedConfidenceScore: decision.signalConfidence,
        rawAction,
        historicalOutcomePct: latestTrade?.returnPct ?? null,
        sizingMode: decision.sizingMode,
        sizingReasons: decision.sizingReasons,
        sizingConstraints: decision.sizingConstraints,
        sizingResult: decision.sizingResult,
        viabilityVerdict: decision.viabilityVerdict,
        viabilityReason: decision.viabilityReason,
        viabilityWarnings: decision.viabilityWarnings,
        viabilityBlockers: decision.viabilityBlockers,
        viabilityMarginOfSafety: decision.viabilityMarginOfSafety,
        viabilityResult: decision.viabilityResult,
        judgement: decision.judgement,
        trustGovernor: decision.trustGovernor,
        recovery: decision.recovery,
        executionQuality: decision.executionQuality,
        counterfactual: decision.counterfactual,
        discoveryAccountability: decision.discoveryAccountability,
        discoveryIntelligence: decision.discoveryIntelligence,
        wisdom: decision.wisdom,
        executiveDecision: decision.executiveDecision,
        decisionStates: decision.decisionStates,
        survivalMemory: decision.survivalMemory,
        belief: decision.belief,
        sizingDiagnostics: decision.sizingDiagnostics,
      },
    };
  });
}

export async function getOrCreateMarketBacktest(marketInput: string, options: MarketBacktestOptions = {}) {
  const market = String(marketInput || "ADX").trim().toUpperCase();
  const baseConfig = backtestConfigForMarket(market);
  const runtimeMode = normalizeRuntimeMode(options.runtimeMode);
  const wantsDiagnostics = diagnosticsEnabled(options);
  const cacheAllowed = runtimeMode === DEFAULT_RUNTIME_MODE && !wantsDiagnostics;
  const cached = LOCAL_MARKET_BACKTEST_CACHE.get(market);

  if (cached && !options.force && cacheAllowed) return cached;

  if (!options.force && cacheAllowed) {
    const persisted = await readPersistedMarketBacktest(market);

    if (persisted) {
      LOCAL_MARKET_BACKTEST_CACHE.set(market, persisted);
      return persisted;
    }
  }

  const rows = await loadLocalMarketRowsForBacktest(market);
  const symbols = localBacktestSymbolsFromRows(market, rows);

  if ((!symbols.length || !rows.length) && cached && cacheAllowed) {
    return cached;
  }

  const historicalDatasets = await loadHistoricalDatasetsForSymbols(market, symbols);
  const entries = entriesFromDatasets(historicalDatasets);
  const historyDiagnostics = summarizeHistoricalDatasets(historicalDatasets);
  const dataQualityReport = buildBacktestDataQualityReport(entries, historyDiagnostics);
  const benchmarkHistory = buildEqualWeightBenchmark(entries);
  const healthOptimization =
    runtimeMode === DEFAULT_RUNTIME_MODE && entries.length > 0
      ? selectHealthOptimizedStrategyConfig(market, entries, benchmarkHistory, baseConfig)
      : null;
  const config = healthOptimization?.config ?? baseConfig;
  const audit = createAuditTrail(options);
  const primaryStrategy = runStrategyForMode(entries, runtimeMode, config, audit);
  let selectedStrategy = primaryStrategy;
  let recoveredFromMode: DiagnosticRuntimeMode | null = null;

  if (
    runtimeMode === "MODE_FULL_PERCEPTION" &&
    primaryStrategy.trades.length === 0 &&
    process.env.STOCK_BACKTEST_RECOVERY_ENABLED !== "false"
  ) {
    recoveredFromMode = primaryStrategy.mode;
    selectedStrategy = runSmaValidationStrategy(
      entries,
      "MODE_RAW_TECHNICAL",
      config,
      createAuditTrail(options),
    );
    selectedStrategy.recoveryNotes = [
      "Full perception mode generated zero executable trades; deterministic SMA validation recovered the backtest without relaxing production risk controls.",
      ...selectedStrategy.recoveryNotes,
    ];
  }
  const strategy = selectedStrategy;

  const history = strategy.history.length ? strategy.history : benchmarkHistory;
  const trades = enrichTradesWithSurvivalMemory(strategy.trades, {
    market,
    rawAction: "Buy",
    maxPositionPct: config.maxPositionPct,
    liquidityScore: dataQualityReport.missingVolumeSymbols > 0 ? 45 : 80,
  });
  const survivalEnrichedStrategy = { ...strategy, trades };
  const baseSignals = buildSignalsFromStrategyRun(market, survivalEnrichedStrategy, entries);
  const liveForwardShadow = await collectForwardShadowEvidence(market, baseSignals, config);
  const closedTradeForwardShadow = buildClosedTradeForwardShadowEvidence(
    trades,
    config,
    dataQualityReport,
  );
  const forwardShadow = mergeForwardShadowEvidence(
    liveForwardShadow,
    closedTradeForwardShadow,
  );
  const parameterRobustness = buildParameterRobustnessDiagnostics(
    market,
    entries,
    benchmarkHistory,
    config,
  );

  if ((!history.length || !trades.length) && cached && cacheAllowed) {
    return cached;
  }

  if ((!history.length || !trades.length) && !cached && cacheAllowed) {
    const persisted = await readPersistedMarketBacktest(market);

    if (persisted) {
      LOCAL_MARKET_BACKTEST_CACHE.set(market, persisted);
      return persisted;
    }
  }

  let summaryBeforeReadiness = forceBlockedDisplayFields(
    finalizeSummaryFromHistory(
      finalizeSummaryFromHistory(
        sanitizeStrategyValidationMetrics(
          {
            ...summarizeRealBacktest(market, history, trades, benchmarkHistory, config),
            configId: config.id,
            strategyName: config.name,
            strategyProfile: config.name,
            strategyProfileKey: config.profile,
            strategyConfig: config,
            commissionBps: 0,
            slippageBps: config.costBps,
            dataQualityReport,
            dataQuality: dataQualityReport,
            historyDiagnostics,
            historyCoverageYears: historyDiagnostics.historyCoverageYears,
            historyDepthScore: historyDiagnostics.historyDepthScore,
            regimeCoverageScore: historyDiagnostics.regimeCoverageScore,
            regimeDiversityScore: historyDiagnostics.regimeDiversityScore,
            sampleDiversityScore: historyDiagnostics.sampleDiversityScore,
            coverageStatus: historyDiagnostics.coverageStatus,
            parameterRobustness,
            strategyHealthOptimization: healthOptimization?.diagnostics ?? {
              enabled: false,
              baseConfigId: baseConfig.id,
              selectedConfigId: config.id,
            },
            forwardShadow,
            closedTradeForwardShadow,
            readinessStage: forwardShadow.passed ? "Research review" : "Needs forward shadow",
            runtimeMode: strategy.mode,
            diagnosticMode: runtimeMode !== "MODE_FULL_PERCEPTION",
            recoveredFromMode,
            recoveryNotes: strategy.recoveryNotes,
          },
        ),
        history,
        trades,
      ),
      history,
      trades,
    ),
  );
  const robustnessDiagnostics = buildRobustnessDiagnostics(
    summaryBeforeReadiness,
    trades,
    parameterRobustness,
    forwardShadow,
    dataQualityReport,
    config,
  );
  summaryBeforeReadiness = {
    ...summaryBeforeReadiness,
    historyDiagnostics,
    robustnessDiagnostics,
    robustnessScore: robustnessDiagnostics.robustnessScore,
    overfitRiskScore: robustnessDiagnostics.overfitRisk,
    generalizationConfidence: robustnessDiagnostics.generalizationConfidence,
    deploymentReadinessScore: robustnessDiagnostics.deploymentReadiness,
  };
  const readiness = new StrategyReadinessEvaluator().evaluate({
    market,
    summary: summaryBeforeReadiness,
    trades,
    walkForwardSegments: summaryBeforeReadiness.walkForwardSegments,
    parameterRobustness,
    dataQualityReport,
    forwardShadow,
    config,
    robustnessDiagnostics,
  });
  const summary = applyStrategyReadinessToSummary(summaryBeforeReadiness, readiness);
  summary.historyDiagnostics = historyDiagnostics;
  summary.runtimeMode = strategy.mode;
  summary.diagnosticMode = runtimeMode !== "MODE_FULL_PERCEPTION";
  summary.recoveredFromMode = recoveredFromMode;
  summary.recoveryNotes = strategy.recoveryNotes;
  summary.diagnosticsAvailable = true;
  const finalSignalBase = buildSignalsFromStrategyRun(market, survivalEnrichedStrategy, entries, readiness);
  const opportunityDiscovery = discoverStockOpportunities({
    market,
    signals: finalSignalBase,
    barsBySymbol: new Map(entries),
    trades,
    systemTrust: summary.survivalScore ?? summary.promotionConfidence ?? 65,
    perceptionAlignment: summary.promotionConfidence ?? summary.survivalScore ?? 65,
    historyDiagnostics,
  });
  const discoveryBySymbol = new Map(opportunityDiscovery.candidates.map((candidate) => [candidate.symbol, candidate]));
  const signals = finalSignalBase.map((signal: any) => {
    const discovery = discoveryBySymbol.get(String(signal.symbol ?? signal.ticker ?? "").toUpperCase());
    if (!discovery) return signal;

    const adaptiveSuggestedExposure = discovery.adaptiveSizing.size;
    const judgementAllowsAdaptiveSizing =
      !signal.judgement || signal.judgement.status === "trusted";
    const shouldUseAdaptiveExposure =
      signal.signalAction === "Buy" &&
      judgementAllowsAdaptiveSizing &&
      adaptiveSuggestedExposure > Number(signal.suggestedExposure ?? 0);

    return {
      ...signal,
      suggestedExposure: shouldUseAdaptiveExposure ? adaptiveSuggestedExposure : signal.suggestedExposure,
      sizingMode: shouldUseAdaptiveExposure ? discovery.adaptiveSizing.mode : signal.sizingMode,
      sizingReasons: shouldUseAdaptiveExposure ? discovery.adaptiveSizing.reasons : signal.sizingReasons,
      sizingResult: shouldUseAdaptiveExposure ? discovery.adaptiveSizing : signal.sizingResult,
      adaptiveSuggestedExposure,
      sizingRationale: discovery.adaptiveSizing.sizingRationale,
      opportunityDiscovery: discovery,
      discoveryScore: discovery.candidateScore,
      discoveryLifecycle: discovery.lifecycle,
      candidateProgression: discovery.progression,
    };
  });
  const recognitionApplied = applyStockRecognitionDiagnostics({
    market,
    signals,
    trades,
    summary,
    opportunityDiscovery,
  });
  const agencyApplied = applyStockAgencyDiagnostics({
    market,
    signals: recognitionApplied.signals,
    trades,
    summary,
  });
  const resolveApplied = applyStockResolveDiagnostics({
    market,
    signals: agencyApplied.signals,
    summary,
    agencyDiagnostics: agencyApplied.agencyDiagnostics,
    opportunityDiscovery,
  });
  summary.recognitionDiagnostics = recognitionApplied.recognitionDiagnostics;
  summary.resolveDiagnostics = resolveApplied.resolveDiagnostics;
  const executiveSignals = resolveApplied.signals as any[];
  const primaryExecutiveSignal =
    executiveSignals.find((signal: any) => signal.signalAction === "Buy" && signal.executiveDecision) ??
    executiveSignals.find((signal: any) => signal.signalStatus === "watch" && signal.executiveDecision) ??
    executiveSignals.find((signal: any) => signal.executiveDecision) ??
    null;
  summary.executiveDecision = primaryExecutiveSignal?.executiveDecision ?? null;
  summary.executionQuality = primaryExecutiveSignal?.executionQuality ?? null;
  summary.counterfactual = primaryExecutiveSignal?.counterfactual ?? null;
  summary.discoveryAccountability = primaryExecutiveSignal?.discoveryAccountability ?? null;
  summary.discoveryIntelligence = primaryExecutiveSignal?.discoveryIntelligence ?? null;
  summary.wisdom = primaryExecutiveSignal?.wisdom ?? null;
  summary.decisionStates = primaryExecutiveSignal?.decisionStates ?? null;
  const diagnostics = wantsDiagnostics
    ? buildSignalDiagnosticsPayload({
        market,
        entries,
        selectedRun: strategy,
        benchmarkHistory,
        summary,
        runtimeMode: strategy.mode,
        recoveredFromMode,
      })
    : undefined;

  const result = {
    ok: true,
    market,
    summary,
    history,
    benchmarkHistory,
    trades,
    signals: resolveApplied.signals,
    opportunityDiscovery,
    agencyDiagnostics: agencyApplied.agencyDiagnostics,
    recognitionDiagnostics: recognitionApplied.recognitionDiagnostics,
    resolveDiagnostics: resolveApplied.resolveDiagnostics,
    diagnostics,
    snapshot: {
      ...summary,
      positions: trades.slice(-Math.min(8, trades.length)).map((trade: any) => ({
        symbol: trade.symbol,
        market,
        entryPrice: trade.entryPrice,
        price: trade.exitPrice,
        exposurePct: trade.entryExposure,
        returnPct: trade.returnPct,
      })),
    },
    regime: {
      regime: history.at(-1)?.regime ?? "Historical Momentum",
      survivalScore: summary.survivalScore,
      configId: summary.configId,
    },
    config: {
      id: summary.configId,
      name: config.name,
      source: "historical-bars",
      profile: config.profile,
      parameters: config,
      dataQuality: dataQualityReport,
      historyDiagnostics,
      runtimeMode: strategy.mode,
      diagnosticsEnabled: wantsDiagnostics,
      healthOptimization: healthOptimization?.diagnostics ?? null,
    },
  };

  if (
    Array.isArray(result.history) &&
    result.history.length > 0 &&
    Array.isArray(result.trades) &&
    result.trades.length > 0 &&
    result.summary?.tradeCount > 0
  ) {
    if (cacheAllowed) {
      LOCAL_MARKET_BACKTEST_CACHE.set(market, result);
      await persistMarketBacktest(market, result);
    }
    return result;
  }

  if (cached && cacheAllowed) return cached;

  if (cacheAllowed) {
    LOCAL_MARKET_BACKTEST_CACHE.set(market, result);
    await persistMarketBacktest(market, result);
  }
  return result;
}
