import type {
  CandleAudit,
  HistoricalCandle,
  HistoricalDataset,
  HistoryCoverage,
  RegimeSegment,
  RegimeStatistics,
  RegimeType,
} from "../../../signal-framework/history/types";

export type MarketHistoryDiagnostics = {
  symbolCount: number;
  requestedYears: number;
  historyCoverageYears: number;
  coveragePct: number;
  coverageStatus: HistoryCoverage["status"];
  historyDepthScore: number;
  regimeCoverageScore: number;
  regimeDiversityScore: number;
  sampleDiversityScore: number;
  temporalConcentrationScore: number;
  currentRegime: RegimeType;
  regimeCounts: Partial<Record<RegimeType, number>>;
  keyRegimesCovered: RegimeType[];
  totalBars: number;
  auditQualityScore: number;
  auditWarnings: string[];
  explanation: string;
};

type HistoricalDatasetInput = {
  market?: string;
  symbol: string;
  providerSymbol?: string;
  exchange?: string;
  bars: HistoricalCandle[];
  requestedYears: number;
  requestedBars: number;
  coverage?: Partial<HistoryCoverage> | null;
  audit?: Partial<CandleAudit> | null;
  regimes?: RegimeSegment[] | null;
  generatedAt?: string;
};

const TARGET_HISTORY_YEARS = 15;
const TRADING_DAYS_PER_YEAR = 252;
const KEY_REGIMES: RegimeType[] = [
  "bull",
  "bear",
  "crash",
  "recovery",
  "volatility_transition",
];
const REGIME_STATS_CACHE = new Map<string, RegimeStatistics>();

export function normalizeRegimeType(value: unknown): RegimeType {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

  if (text === "bull" || text === "bullish" || text === "trending" || text === "expansion") return "bull";
  if (text === "bear" || text === "bearish" || text === "downtrend") return "bear";
  if (text === "crash" || text === "panic" || text === "capitulation") return "crash";
  if (text === "recovery" || text === "rebound") return "recovery";
  if (text === "volatility_transition" || text === "vol_transition" || text === "transition") return "volatility_transition";
  if (text === "low_volatility" || text === "low_vol") return "low_volatility";
  if (text === "high_volatility" || text === "high_vol" || text === "volatile") return "high_volatility";
  if (text === "sideways" || text === "range") return "sideways";
  return "unknown";
}

export function buildHistoricalDataset(input: HistoricalDatasetInput): HistoricalDataset {
  const bars = normalizeCandles(input.bars);
  const audit = {
    ...auditCandles(bars),
    ...(input.audit ?? {}),
  };
  const coverage = {
    ...coverageForBars({
      bars,
      requestedBars: input.requestedBars,
      requestedYears: input.requestedYears,
      providerSymbol: input.providerSymbol,
      exchange: input.exchange,
    }),
    ...(input.coverage ?? {}),
  };
  const classifiedBars = classifyBars(bars);
  const regimes = input.regimes?.length ? input.regimes : buildRegimeSegments(classifiedBars);
  const regimeStats = cachedRegimeStats({
    bars: classifiedBars,
    regimes,
    coverage,
    audit,
  });

  return {
    symbol: input.symbol,
    ...(input.market ? { market: input.market } : {}),
    ...(input.providerSymbol ? { providerSymbol: input.providerSymbol } : {}),
    ...(input.exchange ? { exchange: input.exchange } : {}),
    bars: classifiedBars,
    coverage,
    audit,
    regimes,
    regimeStats,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}

export function summarizeHistoricalDatasets(datasets: HistoricalDataset[]): MarketHistoryDiagnostics {
  const usable = datasets.filter((dataset) => dataset.bars.length > 0);
  const regimeCounts: Partial<Record<RegimeType, number>> = {};
  let totalBars = 0;

  for (const dataset of usable) {
    totalBars += dataset.bars.length;
    for (const [regime, count] of Object.entries(dataset.regimeStats.regimeCounts)) {
      regimeCounts[regime as RegimeType] = (regimeCounts[regime as RegimeType] ?? 0) + Number(count ?? 0);
    }
  }

  const historyCoverageYears = roundOne(mean(usable.map((dataset) => dataset.coverage.availableYears)));
  const coveragePct = roundScore(mean(usable.map((dataset) => dataset.coverage.coveragePct)));
  const historyDepthScore = roundScore(mean(usable.map((dataset) => dataset.regimeStats.historyDepthScore)));
  const regimeCoverageScore = roundScore(Math.max(
    regimeCoverageScoreForCounts(regimeCounts, totalBars, historyCoverageYears),
    mean(usable.map((dataset) => dataset.regimeStats.regimeCoverageScore)) * 0.85,
  ));
  const regimeDiversityScore = roundScore(regimeDiversityScoreForCounts(regimeCounts));
  const sampleDiversityScore = roundScore(mean([
    mean(usable.map((dataset) => dataset.regimeStats.sampleDiversityScore)),
    clamp((usable.length / 24) * 100),
    clamp((totalBars / Math.max(1, usable.length * TARGET_HISTORY_YEARS * 180)) * 100),
  ]));
  const temporalConcentrationScore = roundScore(mean(usable.map((dataset) => dataset.regimeStats.temporalConcentrationScore)));
  const auditQualityScore = roundScore(mean(usable.map((dataset) => dataset.audit.qualityScore)));
  const coverageStatus = coverageStatusForScore(coveragePct, historyCoverageYears, historyDepthScore, usable.length);
  const keyRegimesCovered = KEY_REGIMES.filter((regime) => (regimeCounts[regime] ?? 0) > 0);
  const currentRegime = mostCommon(
    usable.map((dataset) => dataset.regimeStats.currentRegime).filter((regime) => regime !== "unknown"),
  ) ?? "unknown";
  const auditWarnings = unique(usable.flatMap((dataset) => dataset.audit.warnings)).slice(0, 8);

  return {
    symbolCount: usable.length,
    requestedYears: TARGET_HISTORY_YEARS,
    historyCoverageYears,
    coveragePct,
    coverageStatus,
    historyDepthScore,
    regimeCoverageScore,
    regimeDiversityScore,
    sampleDiversityScore,
    temporalConcentrationScore,
    currentRegime,
    regimeCounts,
    keyRegimesCovered,
    totalBars,
    auditQualityScore,
    auditWarnings,
    explanation: "Extended history improves regime awareness and calibration. Recent outcomes still govern sizing restoration.",
  };
}

function normalizeCandles(bars: HistoricalCandle[]) {
  const byDate = new Map<string, HistoricalCandle>();

  for (const bar of Array.isArray(bars) ? bars : []) {
    const close = finiteNumber(bar.close);
    const date = dateKey(bar.date ?? bar.timestamp);
    if (!date || close == null || close <= 0) continue;
    const open = positiveNumber(bar.open) ?? close;
    const high = positiveNumber(bar.high) ?? Math.max(open, close);
    const low = positiveNumber(bar.low) ?? Math.min(open, close);
    const volume = finiteNumber(bar.volume);

    byDate.set(date, {
      ...bar,
      date,
      timestamp: bar.timestamp ?? `${date}T00:00:00.000Z`,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      volume: volume != null && volume >= 0 ? volume : null,
      ...(bar.regime ? { regime: normalizeRegimeType(bar.regime) } : {}),
    });
  }

  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function auditCandles(bars: HistoricalCandle[]): CandleAudit {
  const dates = bars.map((bar) => bar.date).filter(Boolean);
  const duplicateCount = dates.length - new Set(dates).size;
  let invalidOhlcCount = 0;
  let missingVolumeCount = 0;
  let gapCount = 0;
  let longestGapDays = 0;

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    if (bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) {
      invalidOhlcCount += 1;
    }
    if (bar.volume == null || !Number.isFinite(Number(bar.volume))) {
      missingVolumeCount += 1;
    }
    if (index > 0) {
      const gapDays = daysBetween(bars[index - 1].date, bar.date);
      if (gapDays > 7) {
        gapCount += 1;
        longestGapDays = Math.max(longestGapDays, gapDays);
      }
    }
  }

  const latestDate = bars.at(-1)?.date;
  const staleDays = latestDate ? Math.max(0, Math.floor((Date.now() - Date.parse(`${latestDate}T00:00:00.000Z`)) / 86_400_000)) : 999;
  const stale = staleDays > 10;
  const warnings = [
    duplicateCount > 0 ? `${duplicateCount} duplicate candle date(s) were removed.` : "",
    invalidOhlcCount > 0 ? `${invalidOhlcCount} candle(s) had invalid OHLC ranges.` : "",
    gapCount > 0 ? `${gapCount} history gap(s), longest ${longestGapDays} days.` : "",
    stale ? `Latest candle is ${staleDays} days old.` : "",
  ].filter(Boolean);
  const qualityScore = roundScore(
    100 -
      duplicateCount * 2 -
      invalidOhlcCount * 4 -
      gapCount * 1.5 -
      Math.max(0, longestGapDays - 7) * 0.2 -
      (stale ? Math.min(25, staleDays) : 0) -
      (bars.length ? (missingVolumeCount / bars.length) * 8 : 8),
  );

  return {
    duplicateCount,
    gapCount,
    longestGapDays,
    invalidOhlcCount,
    missingVolumeCount,
    stale,
    staleDays,
    qualityScore,
    warnings,
  };
}

function coverageForBars(input: {
  bars: HistoricalCandle[];
  requestedYears: number;
  requestedBars: number;
  providerSymbol?: string;
  exchange?: string;
}): HistoryCoverage {
  const firstDate = input.bars[0]?.date ?? null;
  const lastDate = input.bars.at(-1)?.date ?? null;
  const requestedYears = Math.max(1, input.requestedYears || TARGET_HISTORY_YEARS);
  const requestedBars = Math.max(1, input.requestedBars || requestedYears * TRADING_DAYS_PER_YEAR);
  const expectedBars = Math.min(requestedBars, Math.round(requestedYears * TRADING_DAYS_PER_YEAR));
  const availableYears = firstDate && lastDate
    ? Math.max(0, daysBetween(firstDate, lastDate) / 365.25)
    : 0;
  const barCoverage = input.bars.length / Math.max(1, expectedBars);
  const yearCoverage = availableYears / requestedYears;
  const coveragePct = roundScore(Math.min(1, barCoverage, yearCoverage || barCoverage) * 100);
  const status = coverageStatusForScore(coveragePct, availableYears, historyDepthScoreFor(availableYears, requestedYears, coveragePct, 100), input.bars.length);

  return {
    requestedYears,
    availableYears: roundOne(availableYears),
    requestedBars,
    returnedBars: input.bars.length,
    expectedBars,
    firstDate,
    lastDate,
    coveragePct,
    status,
    source: "tradingview-data",
    ...(input.providerSymbol ? { providerSymbol: input.providerSymbol } : {}),
    ...(input.exchange ? { exchange: input.exchange } : {}),
  };
}

function classifyBars(bars: HistoricalCandle[]) {
  return bars.map((bar, index) => {
    const inferred = bar.regime ?? inferRegime(bars, index);
    return {
      ...bar,
      regime: inferred,
      regimeConfidence: bar.regimeConfidence ?? regimeConfidenceFor(inferred, bars, index),
    };
  });
}

function inferRegime(bars: HistoricalCandle[], index: number): RegimeType {
  const close = bars[index].close;
  const previous = bars[index - 1]?.close;
  const dayReturn = previous && previous > 0 ? ((close / previous) - 1) * 100 : 0;
  const lookback20 = pctMove(bars[Math.max(0, index - 20)]?.close, close);
  const lookback60 = pctMove(bars[Math.max(0, index - 60)]?.close, close);
  const volatility20 = stdev(returns(bars.slice(Math.max(0, index - 20), index + 1))) * 100;
  const volatility60 = stdev(returns(bars.slice(Math.max(0, index - 60), index + 1))) * 100;
  const recentPeak = Math.max(...bars.slice(Math.max(0, index - 90), index + 1).map((bar) => bar.close));
  const drawdown = recentPeak > 0 ? ((close / recentPeak) - 1) * 100 : 0;
  const priorDrawdown = index > 15
    ? Math.min(...bars.slice(Math.max(0, index - 90), Math.max(0, index - 15)).map((bar) => {
        const peak = Math.max(...bars.slice(Math.max(0, index - 90), index + 1).map((item) => item.close));
        return peak > 0 ? ((bar.close / peak) - 1) * 100 : 0;
      }))
    : 0;

  if (dayReturn <= -8 || drawdown <= -28 || (lookback20 <= -18 && volatility20 >= 3.8)) return "crash";
  if (priorDrawdown <= -18 && lookback20 >= 8) return "recovery";
  if (Math.abs(volatility20 - volatility60) >= 1.8 && index > 60) return "volatility_transition";
  if (lookback60 >= 8 && drawdown > -12) return "bull";
  if (lookback60 <= -8 || drawdown <= -16) return "bear";
  if (volatility20 >= 3) return "high_volatility";
  if (volatility20 <= 0.8) return "low_volatility";
  return "sideways";
}

function regimeConfidenceFor(regime: RegimeType, bars: HistoricalCandle[], index: number) {
  if (regime === "unknown") return 0;
  const volatility = stdev(returns(bars.slice(Math.max(0, index - 20), index + 1))) * 100;
  const sampleScore = clamp((Math.min(index + 1, 60) / 60) * 100);
  const volatilityPenalty = regime === "bull" || regime === "bear" ? Math.min(18, volatility * 2) : 0;
  return roundScore(sampleScore * 0.7 + 30 - volatilityPenalty);
}

function buildRegimeSegments(bars: HistoricalCandle[]): RegimeSegment[] {
  const segments: RegimeSegment[] = [];
  let start = 0;

  for (let index = 1; index <= bars.length; index += 1) {
    const previousRegime = bars[index - 1]?.regime ?? "unknown";
    const currentRegime = bars[index]?.regime ?? null;
    if (index < bars.length && currentRegime === previousRegime) continue;

    const slice = bars.slice(start, index);
    const startClose = slice[0]?.close ?? 0;
    const endClose = slice.at(-1)?.close ?? startClose;
    segments.push({
      regime: previousRegime,
      startDate: slice[0]?.date ?? "",
      endDate: slice.at(-1)?.date ?? "",
      samples: slice.length,
      returnPct: roundScore(pctMove(startClose, endClose)),
      volatilityPct: roundScore(stdev(returns(slice)) * 100),
    });
    start = index;
  }

  return segments.filter((segment) => segment.samples > 0 && segment.startDate && segment.endDate);
}

function cachedRegimeStats(input: {
  bars: HistoricalCandle[];
  regimes: RegimeSegment[];
  coverage: HistoryCoverage;
  audit: CandleAudit;
}): RegimeStatistics {
  const signature = [
    input.bars[0]?.date ?? "none",
    input.bars.at(-1)?.date ?? "none",
    input.bars.length,
    input.coverage.requestedYears,
    input.audit.qualityScore,
    input.regimes.map((segment) => `${segment.regime}:${segment.samples}`).join(","),
  ].join("|");
  const cached = REGIME_STATS_CACHE.get(signature);
  if (cached) return cached;

  const regimeCounts: Partial<Record<RegimeType, number>> = {};
  for (const bar of input.bars) {
    const regime = bar.regime ?? "unknown";
    regimeCounts[regime] = (regimeCounts[regime] ?? 0) + 1;
  }
  const regimeSharePct = Object.fromEntries(
    Object.entries(regimeCounts).map(([regime, count]) => [regime, roundScore((Number(count) / Math.max(1, input.bars.length)) * 100)]),
  ) as Partial<Record<RegimeType, number>>;
  const currentRegime = input.bars.at(-1)?.regime ?? "unknown";
  const availableYears = input.coverage.availableYears;
  const historyDepthScore = historyDepthScoreFor(
    availableYears,
    input.coverage.requestedYears,
    input.coverage.coveragePct,
    input.audit.qualityScore,
  );
  const result: RegimeStatistics = {
    regimeCounts,
    regimeSharePct,
    keyRegimesCovered: KEY_REGIMES.filter((regime) => (regimeCounts[regime] ?? 0) > 0),
    historyDepthScore,
    regimeCoverageScore: regimeCoverageScoreForCounts(regimeCounts, input.bars.length, availableYears),
    regimeDiversityScore: regimeDiversityScoreForCounts(regimeCounts),
    sampleDiversityScore: sampleDiversityScoreFor(input.bars, regimeCounts, availableYears),
    temporalConcentrationScore: temporalConcentrationScoreFor(input.bars),
    currentRegime,
  };

  REGIME_STATS_CACHE.set(signature, result);
  return result;
}

function historyDepthScoreFor(availableYears: number, requestedYears: number, coveragePct: number, auditQualityScore: number) {
  return roundScore(
    clamp((availableYears / Math.max(1, requestedYears || TARGET_HISTORY_YEARS)) * 72) +
      clamp(coveragePct) * 0.2 +
      clamp(auditQualityScore) * 0.08,
  );
}

function regimeCoverageScoreForCounts(
  regimeCounts: Partial<Record<RegimeType, number>>,
  totalBars: number,
  availableYears: number,
) {
  const keyCoverage = KEY_REGIMES.filter((regime) => (regimeCounts[regime] ?? 0) > 0).length / KEY_REGIMES.length;
  const keySamples = KEY_REGIMES.reduce((sum, regime) => sum + (regimeCounts[regime] ?? 0), 0);
  const sampleShare = totalBars > 0 ? keySamples / totalBars : 0;
  return roundScore(keyCoverage * 72 + Math.min(1, sampleShare / 0.55) * 14 + Math.min(1, availableYears / TARGET_HISTORY_YEARS) * 14);
}

function regimeDiversityScoreForCounts(regimeCounts: Partial<Record<RegimeType, number>>) {
  const counts = Object.values(regimeCounts).map(Number).filter((value) => value > 0);
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (!total || counts.length <= 1) return counts.length ? 20 : 0;
  const entropy = -counts.reduce((sum, count) => {
    const p = count / total;
    return sum + p * Math.log2(p);
  }, 0);
  return roundScore((entropy / Math.log2(Math.max(2, counts.length))) * 100);
}

function sampleDiversityScoreFor(
  bars: HistoricalCandle[],
  regimeCounts: Partial<Record<RegimeType, number>>,
  availableYears: number,
) {
  return roundScore(mean([
    clamp((bars.length / (TARGET_HISTORY_YEARS * 180)) * 100),
    regimeDiversityScoreForCounts(regimeCounts),
    clamp((availableYears / TARGET_HISTORY_YEARS) * 100),
    temporalConcentrationScoreFor(bars),
  ]));
}

function temporalConcentrationScoreFor(bars: HistoricalCandle[]) {
  if (!bars.length) return 0;
  const counts = new Map<string, number>();
  for (const bar of bars) {
    const year = bar.date.slice(0, 4);
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  const dominantShare = Math.max(...counts.values()) / bars.length;
  return roundScore(clamp(100 - Math.max(0, dominantShare - 0.2) * 125));
}

function coverageStatusForScore(
  coveragePct: number,
  availableYears: number,
  historyDepthScore: number,
  returnedBars: number,
): HistoryCoverage["status"] {
  if (returnedBars <= 0) return "unavailable";
  if (availableYears >= 14 && coveragePct >= 85 && historyDepthScore >= 88) return "full";
  if (availableYears >= 4 && coveragePct >= 35 && historyDepthScore >= 45) return "partial";
  return "thin";
}

function pctMove(previous: number | undefined, current: number | undefined) {
  return previous && current && previous > 0 ? ((current / previous) - 1) * 100 : 0;
}

function returns(bars: HistoricalCandle[]) {
  const output: number[] = [];
  for (let index = 1; index < bars.length; index += 1) {
    const previous = bars[index - 1].close;
    const current = bars[index].close;
    if (previous > 0 && current > 0) output.push(current / previous - 1);
  }
  return output;
}

function stdev(values: number[]) {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) return 0;
  const average = mean(clean);
  return Math.sqrt(mean(clean.map((value) => (value - average) ** 2)));
}

function mean(values: number[]) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function dateKey(value: unknown) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}

function daysBetween(start: string, end: string) {
  const startTime = Date.parse(`${start}T00:00:00.000Z`);
  const endTime = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(0, Math.round((endTime - startTime) / 86_400_000));
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumber(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function roundScore(value: number) {
  return Math.round(clamp(value));
}

function roundOne(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(1));
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function mostCommon<T extends string>(values: T[]) {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
}
