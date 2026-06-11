import {
  type MetricInput,
  type ReliabilityDiagnostic,
  type ReliabilityRecord,
  type ReliabilityResult,
  type ReliabilityStatus,
  confidenceCapForReliability,
  evaluateReliability,
} from "../../../signal-framework";

export type MarketReliabilitySource = {
  market?: string;
  marketStatus: "Open" | "Closed";
  stocks: Array<Record<string, any>>;
  avgRisk: number | null;
  avgQuality: number | null;
  breadth: number;
  confidence: number | null;
  targetExposure: number;
  survivalScore: number;
  failureFlags: string[];
  staleData: boolean;
  hasBacktestData: boolean;
  hasProvidedSignals: boolean;
  backtestTradeCount: number;
  backtestSharpe: number | null | undefined;
  backtestMaxDrawdownPct: number | null | undefined;
  backtestProfitFactor: number | null | undefined;
  backtestWinRatePct: number | null | undefined;
  backtestReturnPct: number | null | undefined;
  executionProfile?: {
    spreadBps?: number;
    slippageBps?: number;
    rebalanceThresholdBps?: number;
    totalExposureCap?: number;
    riskAversion?: number;
  };
  now?: number;
  lastSuccessfulSync?: number | null;
  expectedAssetCount?: number;
  exchangeSynchronized?: boolean;
  partialApiFailures?: number;
  fallbackMode?: boolean;
};

export type MarketReliabilityPolicy = {
  openFreshnessMs: number;
  closedFreshnessMs: number;
  minTickerCoverageRatio: number;
  minBreadthParticipation: number;
  minSynchronizedSamples: number;
  requireVolume: boolean;
};

export type MarketReliabilityMetadata = {
  venueStatus: "open" | "closed";
  synchronizationStatus: "synced" | "not_synced" | "stale" | "partial";
  validAssets: number;
  rejectedAssets: number;
  staleRecords: number;
  missingFields: number;
  staleCandles: number;
  missingVolume: number;
  missingOhlcv: number;
  duplicateCandles: number;
  lowSynchronizedSamples: number;
  partialApiFailures: number;
  fallbackMode: boolean;
  syntheticDataDetected: boolean;
  lastSuccessfulSync: string | null;
  defensiveMode: boolean;
  primaryIssues: string[];
  explanation: string;
};

export type MarketReliabilityResult = ReliabilityResult & {
  market: MarketReliabilityMetadata;
};

const DEFAULT_POLICY: MarketReliabilityPolicy = {
  openFreshnessMs: 3 * 60_000,
  closedFreshnessMs: 72 * 60 * 60_000,
  minTickerCoverageRatio: 0.35,
  minBreadthParticipation: 10,
  minSynchronizedSamples: 2,
  requireVolume: false,
};

const SOURCE_QUALITY: Record<string, number> = {
  available: 100,
  provided: 95,
  delayed: 76,
  paused: 68,
  pending: 45,
  unavailable: 25,
  failed: 20,
  fallback: 58,
  synthetic: 10,
};

export function evaluateMarketReliability(
  source: MarketReliabilitySource,
  policy: Partial<MarketReliabilityPolicy> = {},
): MarketReliabilityResult {
  const resolved = { ...DEFAULT_POLICY, ...policy };
  const now = source.now ?? Date.now();
  const stocks = Array.isArray(source.stocks) ? source.stocks : [];
  const expectedAssets = Math.max(
    1,
    source.expectedAssetCount ?? stocks.length,
  );
  const minimumValidAssets = Math.max(
    1,
    Math.ceil(expectedAssets * resolved.minTickerCoverageRatio),
  );
  const freshnessWindow =
    source.marketStatus === "Closed"
      ? resolved.closedFreshnessMs
      : resolved.openFreshnessMs;
  const marketDiagnostics: ReliabilityDiagnostic[] = [];
  const stats = collectMarketStats(stocks, source, resolved, now);
  const partialFailureRatio = stats.partialApiFailures / expectedAssets;
  const priceBounds = priceBoundsForMarket(source.market);

  if (source.marketStatus === "Closed") {
    marketDiagnostics.push({
      code: "VENUE_CLOSED",
      severity: "info",
      message: "Venue is closed; live updates are expected to pause.",
      observed: "Closed",
      expected: "Open for live synchronization",
    });
  }

  if (source.staleData || stats.staleRecords > 0) {
    marketDiagnostics.push({
      code: "MARKET_DATA_STALE",
      severity: "warning",
      message: "Market data is older than the active synchronization window.",
      observed: stats.staleRecords,
      expected: 0,
    });
  }

  if (stats.validAssets < minimumValidAssets) {
    marketDiagnostics.push({
      code: "TICKER_COVERAGE_LOW",
      severity: "critical",
      message:
        "Ticker universe coverage is below the market policy requirement.",
      observed: stats.validAssets,
      expected: minimumValidAssets,
    });
  }

  if (
    stats.validAssets > 0 &&
    source.breadth < resolved.minBreadthParticipation
  ) {
    marketDiagnostics.push({
      code: "BREADTH_PARTICIPATION_LOW",
      severity: "info",
      message:
        "Market breadth participation is low; this is a market-condition signal, not a data integrity failure.",
      observed: source.breadth,
      expected: `>= ${resolved.minBreadthParticipation}`,
    });
  }

  addCountDiagnostic(
    marketDiagnostics,
    "MISSING_VOLUME",
    stats.missingVolume,
    "Volume is unavailable for part of the market dataset.",
    diagnosticSeverity(
      stats.missingVolume,
      Math.max(1, stats.validAssets),
      resolved.requireVolume ? 0 : 0.05,
    ),
  );
  addCountDiagnostic(
    marketDiagnostics,
    "MISSING_OHLCV",
    stats.missingOhlcv,
    "One or more candle records are missing market-specific fields.",
  );
  addCountDiagnostic(
    marketDiagnostics,
    "DUPLICATED_CANDLES",
    stats.duplicateCandles,
    "Duplicated candle timestamps were detected.",
  );
  addCountDiagnostic(
    marketDiagnostics,
    "LOW_SYNCHRONIZED_CANDLE_COUNT",
    stats.lowSynchronizedSamples,
    "Some assets do not have enough synchronized samples.",
    diagnosticSeverity(
      stats.lowSynchronizedSamples,
      Math.max(1, stats.validAssets),
      0.05,
    ),
  );
  addCountDiagnostic(
    marketDiagnostics,
    "PARTIAL_API_FAILURE",
    stats.partialApiFailures,
    "Some upstream requests returned partial or failed data.",
    diagnosticSeverity(stats.partialApiFailures, expectedAssets, 0.05),
  );

  if (source.exchangeSynchronized === false) {
    marketDiagnostics.push({
      code: "EXCHANGE_DESYNCHRONIZED",
      severity: "critical",
      message:
        "Exchange synchronization has failed or is explicitly marked out of sync.",
      observed: false,
      expected: true,
    });
  }

  if (stats.fallbackMode) {
    marketDiagnostics.push({
      code: "FALLBACK_MODE_ACTIVE",
      severity: "warning",
      message: "Fallback data mode is active.",
      observed: true,
      expected: false,
    });
  }

  if (stats.syntheticDataDetected) {
    marketDiagnostics.push({
      code: "SYNTHETIC_DATA_DETECTED",
      severity: "critical",
      message:
        "Synthetic, demo, or mock data was detected in the market dataset.",
      observed: true,
      expected: false,
    });
  }

  const generic = evaluateReliability({
    now,
    records: stats.records,
    maxAgeMs: freshnessWindow,
    minSampleSize: minimumValidAssets,
    expectedCount: expectedAssets,
    sourceQuality: SOURCE_QUALITY,
    defaultSourceQuality: 72,
    fieldRules: [
      {
        field: "price",
        required: false,
        type: "number",
        min: priceBounds.min,
        allowNull: true,
      },
      {
        field: "volume",
        required: resolved.requireVolume,
        type: "number",
        min: 0,
        allowNull: !resolved.requireVolume,
      },
    ],
    outlierRules: [
      { field: "price", min: priceBounds.min, max: priceBounds.max },
    ],
  });
  const score = clamp(
    generic.score -
      (source.staleData ? 18 : 0) -
      (stats.validAssets <= 0
        ? 44
        : stats.validAssets < minimumValidAssets
          ? 24
          : 0) -
      Math.min(18, partialFailureRatio * 40) -
      (source.exchangeSynchronized === false ? 20 : 0) -
      (stats.fallbackMode ? 8 : 0) -
      (stats.syntheticDataDetected ? 35 : 0),
  );
  const status = marketReliabilityStatus(score, generic.status, {
    stale:
      source.staleData ||
      stats.staleRecords >= Math.max(1, stats.records.length),
    validAssets: stats.validAssets,
    minimumValidAssets,
    recordCount: stats.records.length,
    marketStatus: source.marketStatus,
  });
  const diagnostics = [...generic.diagnostics, ...marketDiagnostics];
  const market = buildMarketMetadata(
    source,
    stats,
    status,
    diagnostics,
    score,
    now,
    minimumValidAssets,
  );

  return {
    ...generic,
    score,
    status,
    confidenceCap: confidenceCapForReliability(score),
    diagnostics,
    market,
  };
}

export function applyReliabilityToMetricInputs(
  metrics: MetricInput[],
  reliability: MarketReliabilityResult,
): MetricInput[] {
  return metrics.map((metric) => {
    const cappedConfidence = Math.min(
      metric.confidence ?? 100,
      reliability.confidenceCap,
    );
    const reliabilityDetail = `Data reliability ${Math.round(reliability.score)}/100 (${reliability.status}); confidence cap ${reliability.confidenceCap}%.`;
    const isSelfAwarenessMetric =
      metric.key === "dataReliability" ||
      metric.key === "modelConfidence" ||
      metric.key === "weightedConfidence";

    return {
      ...metric,
      value: isSelfAwarenessMetric
        ? Math.min(metric.value, reliability.score)
        : metric.value,
      raw:
        metric.key === "dataReliability" && reliability.status !== "healthy"
          ? reliability.market.explanation
          : metric.raw,
      confidence: cappedConfidence,
      detail: metric.detail
        ? `${metric.detail} ${reliabilityDetail}`
        : reliabilityDetail,
    };
  });
}

export function capReliabilityConfidence(
  value: number | null | undefined,
  reliability: MarketReliabilityResult,
) {
  if (value == null || !Number.isFinite(value)) return value;
  return Math.min(value, reliability.confidenceCap);
}

export function capReliabilityExposure(
  value: number,
  reliability: MarketReliabilityResult,
) {
  const exposure = Number.isFinite(value) ? value : 0;
  return clamp(exposure * (reliability.confidenceCap / 100), 0, exposure);
}

export function shouldUseDefensiveReliabilityPosture(
  reliability: MarketReliabilityResult,
) {
  return reliability.market.defensiveMode;
}

function collectMarketStats(
  stocks: Array<Record<string, any>>,
  source: MarketReliabilitySource,
  policy: MarketReliabilityPolicy,
  now: number,
) {
  let validAssets = 0;
  let missingVolume = 0;
  let missingOhlcv = 0;
  let duplicateCandles = 0;
  let lowSynchronizedSamples = 0;
  let staleRecords = 0;
  let partialApiFailures = source.partialApiFailures ?? 0;
  let fallbackMode = source.fallbackMode ?? false;
  let syntheticDataDetected = false;

  const records = stocks.map((stock, index): ReliabilityRecord => {
    const id = instrumentId(stock, index);
    const sourceName = sourceLabel(stock);
    const price = marketPrice(stock);
    const volume = firstFiniteNumber([
      stock.volume,
      stock.regularMarketVolume,
      stock.quoteVolume,
    ]);
    const history = Array.isArray(stock.history) ? stock.history : [];
    const timestamp = recordTimestamp(stock, source.lastSuccessfulSync, now);
    const explicitSampleCount = firstFiniteNumber([
      stock.sampleCount,
      stock.samples,
      stock.historyCount,
      stock.barCount,
    ]);
    const sampleCount = Math.max(
      history.length,
      explicitSampleCount ?? 0,
      price != null ? 1 : 0,
    );

    const hasEvidence = hasMarketEvidence(stock);

    if (hasEvidence) validAssets += 1;
    if (hasEvidence && volume == null) missingVolume += 1;
    if (hasEvidence && sampleCount < policy.minSynchronizedSamples)
      lowSynchronizedSamples += 1;
    if (
      timestamp != null &&
      now - timestamp > policy.openFreshnessMs &&
      source.marketStatus === "Open"
    )
      staleRecords += 1;
    if (hasPartialFailure(stock)) partialApiFailures += 1;
    if (hasFallbackSource(stock)) fallbackMode = true;
    if (isSyntheticSource(stock)) syntheticDataDetected = true;

    const candleStats = inspectCandleHistory(history);
    missingOhlcv += candleStats.missingOhlcv;
    duplicateCandles += candleStats.duplicates;

    return {
      id,
      timestamp,
      source: sourceName,
      quality: qualityFromStock(stock),
      fields: {
        price,
        volume,
        sampleCount,
      },
    };
  });

  return {
    records,
    validAssets,
    missingVolume,
    missingOhlcv,
    duplicateCandles,
    lowSynchronizedSamples,
    staleRecords,
    partialApiFailures,
    fallbackMode,
    syntheticDataDetected,
  };
}

function buildMarketMetadata(
  source: MarketReliabilitySource,
  stats: ReturnType<typeof collectMarketStats>,
  status: ReliabilityStatus,
  diagnostics: ReliabilityDiagnostic[],
  score: number,
  now: number,
  minimumValidAssets: number,
): MarketReliabilityMetadata {
  const criticalOrWarning = diagnostics.filter(
    (diagnostic) => diagnostic.severity !== "info",
  );
  const primaryIssues = Array.from(
    new Set(criticalOrWarning.map((diagnostic) => issueLabel(diagnostic.code))),
  ).slice(0, 5);
  const resolvedPrimaryIssues = primaryIssues.length
    ? primaryIssues
    : [
        source.marketStatus === "Closed"
          ? "Venue closed"
          : "No dominant reliability issues",
      ];
  const synchronizationStatus =
    source.staleData || status === "stale"
      ? "stale"
      : source.exchangeSynchronized === false
        ? "not_synced"
        : stats.validAssets < minimumValidAssets ||
            stats.validAssets /
              Math.max(1, source.expectedAssetCount ?? stats.records.length) <
              0.95
          ? "partial"
          : "synced";
  const defensiveMode =
    status === "invalid" ||
    status === "insufficient" ||
    status === "stale" ||
    score < 60 ||
    source.exchangeSynchronized === false ||
    stats.syntheticDataDetected;

  return {
    venueStatus: source.marketStatus === "Open" ? "open" : "closed",
    synchronizationStatus,
    validAssets: stats.validAssets,
    rejectedAssets: Math.max(
      0,
      (source.expectedAssetCount ?? stats.records.length) - stats.validAssets,
    ),
    staleRecords: stats.staleRecords,
    missingFields: diagnostics.filter(
      (diagnostic) => diagnostic.code === "FIELD_MISSING",
    ).length,
    staleCandles: stats.staleRecords,
    missingVolume: stats.missingVolume,
    missingOhlcv: stats.missingOhlcv,
    duplicateCandles: stats.duplicateCandles,
    lowSynchronizedSamples: stats.lowSynchronizedSamples,
    partialApiFailures: stats.partialApiFailures,
    fallbackMode: stats.fallbackMode,
    syntheticDataDetected: stats.syntheticDataDetected,
    lastSuccessfulSync: source.lastSuccessfulSync
      ? new Date(source.lastSuccessfulSync).toISOString()
      : null,
    defensiveMode,
    primaryIssues: resolvedPrimaryIssues,
    explanation: reliabilityExplanation(
      status,
      resolvedPrimaryIssues,
      source.marketStatus,
      now,
    ),
  };
}

function addCountDiagnostic(
  diagnostics: ReliabilityDiagnostic[],
  code: string,
  count: number,
  message: string,
  severity: ReliabilityDiagnostic["severity"] = code === "DUPLICATED_CANDLES"
    ? "critical"
    : "warning",
) {
  if (count <= 0) return;
  diagnostics.push({
    code,
    severity,
    message,
    observed: count,
    expected: 0,
  });
}

function diagnosticSeverity(
  count: number,
  total: number,
  warningRatio: number,
): ReliabilityDiagnostic["severity"] {
  if (count / Math.max(1, total) >= warningRatio) return "warning";
  return "info";
}

function marketReliabilityStatus(
  score: number,
  genericStatus: ReliabilityStatus,
  state: {
    stale: boolean;
    validAssets: number;
    minimumValidAssets: number;
    recordCount: number;
    marketStatus: MarketReliabilitySource["marketStatus"];
  },
): ReliabilityStatus {
  if (state.validAssets <= 0) {
    return state.marketStatus === "Closed" && state.recordCount > 0
      ? "insufficient"
      : "invalid";
  }
  if (genericStatus === "invalid") return "invalid";
  if (state.stale || genericStatus === "stale") return "stale";
  if (
    state.validAssets < state.minimumValidAssets ||
    score < 40 ||
    genericStatus === "insufficient"
  )
    return "insufficient";
  if (score < 80 || genericStatus === "degraded") return "degraded";
  return "healthy";
}

function hasMarketEvidence(stock: Record<string, any>) {
  if (hasInvalidPriceEvidence(stock)) return false;
  return (
    stock.signalStatus === "provided" ||
    hasPositivePriceEvidence(stock) ||
    hasSynchronizedHistory(stock)
  );
}

function hasInvalidPriceEvidence(stock: Record<string, any>) {
  const price = marketPrice(stock);
  return price != null && price <= 0;
}

function hasPositivePriceEvidence(stock: Record<string, any>) {
  const price = marketPrice(stock);
  return price != null && price > 0;
}

function hasSynchronizedHistory(stock: Record<string, any>) {
  const history = Array.isArray(stock.history) ? stock.history : [];
  return history.filter((value) => finiteNumber(value) != null).length >= 2;
}

function instrumentId(stock: Record<string, any>, index: number) {
  return (
    String(
      stock.ticker ?? stock.symbol ?? stock.name ?? `asset-${index}`,
    ).trim() || `asset-${index}`
  );
}

function sourceLabel(stock: Record<string, any>) {
  const source = String(
    stock.source ??
      stock.quoteSource ??
      stock.quoteStatus ??
      stock.sourceFile ??
      "available",
  ).toLowerCase();
  if (/synthetic|demo|mock/.test(source)) return "synthetic";
  if (/fallback/.test(source)) return "fallback";
  if (/failed|unavailable|blocked/.test(source)) return "failed";
  if (/pending/.test(source)) return "pending";
  if (/paused/.test(source)) return "paused";
  if (/provided/.test(source)) return "provided";
  return "available";
}

function qualityFromStock(stock: Record<string, any>) {
  const explicit = firstFiniteNumber([
    stock.sourceQuality,
    stock.reliability,
    stock.dataQuality,
  ]);
  return explicit ?? undefined;
}

function recordTimestamp(
  stock: Record<string, any>,
  lastSuccessfulSync: number | null | undefined,
  now: number,
) {
  const candidates = [
    stock.updatedAt,
    stock.syncedAt,
    stock.timestamp,
    stock.lastSyncedAt,
    lastSuccessfulSync,
  ];
  for (const candidate of candidates) {
    const parsed = parseTime(candidate);
    if (parsed != null) return parsed;
  }
  return now;
}

function inspectCandleHistory(history: unknown[]) {
  let missingOhlcv = 0;
  let duplicates = 0;
  const seen = new Set<string>();

  for (const item of history) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const timestamp = String(row.date ?? row.time ?? row.timestamp ?? "");
    if (timestamp) {
      if (seen.has(timestamp)) duplicates += 1;
      seen.add(timestamp);
    }

    const hasAnyOhlcvField = ["open", "high", "low", "close", "volume"].some(
      (field) => row[field] != null,
    );
    const hasAllPriceFields = ["open", "high", "low", "close"].every(
      (field) => finiteNumber(row[field]) != null,
    );
    if (hasAnyOhlcvField && !hasAllPriceFields) missingOhlcv += 1;
  }

  return { missingOhlcv, duplicates };
}

function hasPartialFailure(stock: Record<string, any>) {
  return /failed|unavailable|blocked|timeout/i.test(
    String(stock.source ?? stock.quoteStatus ?? stock.quoteStatusReason ?? ""),
  );
}

function hasFallbackSource(stock: Record<string, any>) {
  return /fallback/i.test(
    String(stock.source ?? stock.quoteSource ?? stock.quoteStatusReason ?? ""),
  );
}

function isSyntheticSource(stock: Record<string, any>) {
  return /synthetic|demo|mock/i.test(
    String(
      `${stock.source ?? ""} ${stock.sourceFile ?? ""} ${stock.name ?? ""} ${stock.description ?? ""}`,
    ),
  );
}

function issueLabel(code: string) {
  const labels: Record<string, string> = {
    MARKET_DATA_STALE: "Stale market data",
    TICKER_COVERAGE_LOW: "Low ticker coverage",
    BREADTH_PARTICIPATION_LOW: "Low breadth participation",
    MISSING_VOLUME: "Partial volume availability",
    MISSING_OHLCV: "Missing candle fields",
    DUPLICATED_CANDLES: "Duplicated candles",
    LOW_SYNCHRONIZED_CANDLE_COUNT: "Missing synchronized samples",
    EXCHANGE_DESYNCHRONIZED: "Exchange synchronization failure",
    PARTIAL_API_FAILURE: "Partial API failure",
    FALLBACK_MODE_ACTIVE: "Fallback mode active",
    SYNTHETIC_DATA_DETECTED: "Synthetic data detected",
    RECORD_STALE: "Stale records",
    FIELD_MISSING: "Missing required fields",
    FIELD_INVALID: "Invalid fields",
    FIELD_OUT_OF_RANGE: "Invalid field ranges",
    SAMPLE_SIZE_LOW: "Low sample size",
    SOURCE_QUALITY_DEGRADED: "Degraded source quality",
  };

  return labels[code] ?? code;
}

function priceBoundsForMarket(market: string | undefined) {
  const normalized = String(market ?? "").toUpperCase();
  if (/BINANCE|CRYPTO/.test(normalized)) {
    return {
      min: 1e-12,
      max: 1_000_000_000_000,
    };
  }

  return {
    min: 0.000001,
    max: 1_000_000,
  };
}

function reliabilityExplanation(
  status: ReliabilityStatus,
  primaryIssues: string[],
  marketStatus: MarketReliabilitySource["marketStatus"],
  now: number,
) {
  void now;
  if (status === "healthy") {
    return marketStatus === "Closed"
      ? "Market data is synchronized; the venue is closed so live updates are paused."
      : "Market data is synchronized and usable.";
  }
  if (status === "stale")
    return "Waiting for fresh market synchronization before increasing conviction.";
  if (status === "insufficient")
    return "Insufficient data; waiting for broader synchronized market coverage.";
  if (status === "invalid")
    return "Market data is invalid or unavailable; confidence is capped defensively.";
  return `Market data is usable but degraded by ${primaryIssues[0].toLowerCase()}.`;
}

function finiteNumber(value: unknown) {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function firstFiniteNumber(values: unknown[]) {
  for (const value of values) {
    const numeric = finiteNumber(value);
    if (numeric != null) return numeric;
  }
  return null;
}

function marketPrice(stock: Record<string, any>) {
  return firstFiniteNumber([
    stock.price,
    stock.last,
    stock.close,
    stock.regularMarketPrice,
  ]);
}

function parseTime(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
