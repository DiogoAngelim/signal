import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CandleAudit, HistoricalDataset, HistoryCoverage, RegimeSegment, RegimeType } from "../../../signal-framework/history/types";
import { buildHistoricalDataset, normalizeRegimeType } from "./historical-dataset";
import { logger } from "./logger";

export type TradingViewHistoricalBar = {
  date: string;
  timestamp?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  source: string;
  sourceStatus: string;
  dataQuality: string;
  regime?: RegimeType;
  regimeConfidence?: number;
  providerSymbol?: string;
  exchange?: string;
  synthetic?: false;
};

type TradingViewHistoryOptions = {
  bars?: number;
  lookbackYears?: number;
  minBars?: number;
  timeoutMs?: number;
};

type Candidate = {
  symbol: string;
  exchange: string;
  providerSymbol: string;
};

const DEFAULT_BARS = 3_780;
const DEFAULT_LOOKBACK_YEARS = 15;
const DEFAULT_TIMEOUT_MS = Number(process.env.TRADINGVIEW_HISTORY_TIMEOUT_MS ?? 20_000);
const HISTORY_CACHE_TTL_MS = Number(process.env.TRADINGVIEW_HISTORY_CACHE_TTL_MS ?? 10 * 60_000);
const BINANCE_KLINE_LIMIT = 1_000;
const HISTORY_CACHE = new Map<string, { expiresAt: number; dataset: HistoricalDataset }>();

let chartDataModulePromise: Promise<any | null> | null = null;

function normalizeKey(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function stripKnownSuffix(symbol: string) {
  return symbol
    .replace(/\.(BR|AS|PA|LS|IR|OL|L|MI|DE|F|SW|MC|SA|AD|AE|DU|TO|V|AX|HK|SS|SZ)$/i, "")
    .replace(/\.P$/i, "");
}

function exchangeAliases(marketInput: unknown, symbolInput: unknown): string[] {
  const market = normalizeKey(marketInput);
  const symbol = normalizeKey(symbolInput);
  const aliases: Record<string, string[]> = {
    ADX: ["ADX"],
    "ABU DHABI": ["ADX"],
    DFM: ["DFM", "DUBAI"],
    DUBAI: ["DFM", "DUBAI"],
    AE: ["ADX", "DFM"],
    UAE: ["ADX", "DFM"],
    B3: ["BMFBOVESPA", "B3"],
    BR: ["BMFBOVESPA", "B3"],
    BMFBOVESPA: ["BMFBOVESPA"],
    BINANCE: ["BINANCE"],
    CRYPTO: ["BINANCE"],
    NASDAQ: ["NASDAQ"],
    NYSE: ["NYSE"],
    AMEX: ["AMEX"],
    US: ["NASDAQ", "NYSE", "AMEX"],
    LSE: ["LSE"],
    LONDON: ["LSE"],
    UK: ["LSE"],
    GB: ["LSE"],
    TSX: ["TSX"],
    TSXV: ["TSXV"],
    EURONEXT: ["EURONEXT"],
    "EURONEXT BRUSSELS": ["EURONEXT"],
    "EURONEXT AMSTERDAM": ["EURONEXT"],
    "EURONEXT PARIS": ["EURONEXT"],
    "EURONEXT LISBON": ["EURONEXT"],
    "EURONEXT DUBLIN": ["EURONEXT"],
    "EURONEXT OSLO": ["OSL", "OSE", "EURONEXT"],
    OSLO: ["OSL", "OSE", "EURONEXT"],
    OSL: ["OSL", "OSE", "EURONEXT"],
    OSE: ["OSE", "OSL", "EURONEXT"],
  };

  const suffixAliases =
    /\.SA$/i.test(symbol) ? ["BMFBOVESPA"] :
    /\.AD$/i.test(symbol) ? ["ADX"] :
    /\.AE$|\.DU$/i.test(symbol) ? ["DFM", "DUBAI"] :
    /\.OL$/i.test(symbol) ? ["OSL", "OSE", "EURONEXT"] :
    /\.(BR|AS|PA|LS|IR)$/i.test(symbol) ? ["EURONEXT"] :
    /\.L$/i.test(symbol) ? ["LSE"] :
    /\.TO$/i.test(symbol) ? ["TSX"] :
    [];

  return Array.from(new Set([...(aliases[market] ?? (market ? [market] : [])), ...suffixAliases]));
}

function buildCandidates(symbolInput: string, marketInput?: string): Candidate[] {
  const raw = String(symbolInput ?? "").trim();
  if (!raw) return [];

  if (raw.includes(":")) {
    const [exchange, ...rest] = raw.split(":");
    const localSymbol = rest.join(":");
    return [
      {
        symbol: localSymbol,
        exchange: exchange.toUpperCase(),
        providerSymbol: `${exchange.toUpperCase()}:${localSymbol}`,
      },
    ];
  }

  const stripped = stripKnownSuffix(raw);
  const symbols = Array.from(new Set([stripped, raw].filter(Boolean)));
  const exchanges = exchangeAliases(marketInput, raw);
  const candidates: Candidate[] = [];

  for (const exchange of exchanges) {
    for (const symbol of symbols) {
      candidates.push({
        symbol,
        exchange,
        providerSymbol: `${exchange}:${symbol}`,
      });
    }
  }

  for (const symbol of symbols) {
    candidates.push({
      symbol,
      exchange: "",
      providerSymbol: symbol,
    });
  }

  return Array.from(
    new Map(candidates.map((candidate) => [candidate.providerSymbol, candidate])).values(),
  );
}

function modulePathCandidates() {
  const configured = process.env.TRADINGVIEW_DATA_MODULE_DIR || process.env.TRADINGVIEW_DATA_DIR;
  return [
    configured,
    path.resolve(process.cwd(), "tradingview-data"),
    path.resolve(process.cwd(), "..", "tradingview-data"),
    path.resolve(process.cwd(), "..", "..", "tradingview-data"),
    path.resolve(process.cwd(), "..", "..", "..", "tradingview-data"),
    "/Users/diogoangelim/tradingview-data",
  ]
    .filter((value): value is string => Boolean(value))
    .map((dir) => path.join(dir, "api", "chart-data.js"));
}

async function loadLocalChartDataModule() {
  if (process.env.TRADINGVIEW_DATA_DISABLE_LOCAL === "true") return null;

  chartDataModulePromise ??= (async () => {
    for (const file of modulePathCandidates()) {
      try {
        if (!fs.existsSync(file)) continue;
        const mod = await import(pathToFileURL(file).href);
        if (typeof mod.fetchTradingViewCandlesForSymbol === "function") {
          logger.info({ file }, "Loaded local tradingview-data module");
          return mod;
        }
      } catch (error) {
        logger.warn({ file, err: error }, "Could not load local tradingview-data module");
      }
    }

    return null;
  })();

  return chartDataModulePromise;
}

function normalizeBar(raw: any, metadata: Record<string, any>): TradingViewHistoricalBar | null {
  const close = Number(raw?.close ?? raw?.price ?? raw?.["Adj Close"]);
  if (!Number.isFinite(close) || close <= 0) return null;

  const open = Number(raw?.open ?? raw?.Open);
  const high = Number(raw?.high ?? raw?.High);
  const low = Number(raw?.low ?? raw?.Low);
  const volume = Number(raw?.volume ?? raw?.Volume);
  const timestamp = String(raw?.timestamp ?? raw?.time ?? raw?.Date ?? raw?.date ?? "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(timestamp)
    ? timestamp
    : Number.isFinite(Date.parse(timestamp))
      ? new Date(timestamp).toISOString().slice(0, 10)
      : "";

  if (!date) return null;

  return {
    date,
    timestamp: Number.isFinite(Date.parse(timestamp))
      ? new Date(timestamp).toISOString()
      : `${date}T00:00:00.000Z`,
    open: Number.isFinite(open) && open > 0 ? open : close,
    high: Number.isFinite(high) && high > 0 ? high : close,
    low: Number.isFinite(low) && low > 0 ? low : close,
    close,
    volume: Number.isFinite(volume) && volume >= 0 ? volume : null,
    source: metadata.source ?? "tradingview-data",
    sourceStatus: metadata.sourceStatus ?? "delayed",
    dataQuality: metadata.dataQuality ?? "real",
    ...(raw?.regime ?? raw?.regimeType ?? metadata.regime
      ? { regime: normalizeRegimeType(raw?.regime ?? raw?.regimeType ?? metadata.regime) }
      : {}),
    ...(Number.isFinite(Number(raw?.regimeConfidence ?? raw?.regime_confidence))
      ? { regimeConfidence: Number(raw?.regimeConfidence ?? raw?.regime_confidence) }
      : {}),
    providerSymbol: metadata.providerSymbol,
    exchange: metadata.exchange,
    synthetic: false,
  };
}

function normalizeBars(rows: any[], metadata: Record<string, any>) {
  const byDate = new Map<string, TradingViewHistoricalBar>();

  for (const row of rows) {
    const bar = normalizeBar(row, metadata);
    if (bar) byDate.set(bar.date, bar);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function datasetFromRows(
  candidate: Candidate,
  options: Required<TradingViewHistoryOptions>,
  rows: any[],
  metadata: Record<string, any>,
  extras: {
    coverage?: Partial<HistoryCoverage> | null;
    audit?: Partial<CandleAudit> | null;
    regimes?: RegimeSegment[] | null;
  } = {},
) {
  const bars = normalizeBars(rows, {
    source: "tradingview-data",
    sourceStatus: metadata.sourceStatus === "unavailable" ? "unavailable" : (metadata.sourceStatus ?? "delayed"),
    dataQuality: metadata.dataQuality === "degraded" ? "degraded" : "real",
    providerSymbol: metadata.providerSymbol ?? candidate.providerSymbol,
    exchange: metadata.exchange ?? candidate.exchange,
  }).filter((bar) => bar.sourceStatus !== "unavailable");

  if (!bars.length) return null;

  return buildHistoricalDataset({
    market: metadata.market,
    symbol: candidate.symbol,
    providerSymbol: metadata.providerSymbol ?? candidate.providerSymbol,
    exchange: metadata.exchange ?? candidate.exchange,
    bars,
    requestedYears: options.lookbackYears,
    requestedBars: options.bars,
    coverage: extras.coverage,
    audit: extras.audit,
    regimes: extras.regimes,
  });
}

function isBinanceMarket(market: string) {
  return /BINANCE|CRYPTO/.test(normalizeKey(market));
}

function normalizeBinanceSymbol(value: string) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^BINANCE:/, "")
    .replace(/\.P$/i, "")
    .replace(/[^A-Z0-9]/g, "");
}

function binanceKlinesBaseUrl() {
  return (
    process.env.BINANCE_KLINES_BASE_URL?.trim() ||
    process.env.BINANCE_HISTORY_BASE_URL?.trim() ||
    "https://api.binance.com/api/v3/klines"
  );
}

function binanceKlineToBar(symbol: string, row: unknown[]): TradingViewHistoricalBar | null {
  const openTime = Number(row[0]);
  const open = Number(row[1]);
  const high = Number(row[2]);
  const low = Number(row[3]);
  const close = Number(row[4]);
  const volume = Number(row[5]);

  if (
    !Number.isFinite(openTime) ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close) ||
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0
  ) {
    return null;
  }

  const timestamp = new Date(openTime).toISOString();

  return {
    date: timestamp.slice(0, 10),
    timestamp,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) && volume >= 0 ? volume : null,
    source: "binance-klines",
    sourceStatus: "real",
    dataQuality: "real",
    providerSymbol: symbol,
    exchange: "BINANCE",
    synthetic: false,
  };
}

async function fetchBinanceKlinesPage(input: {
  symbol: string;
  endTime: number;
  timeoutMs: number;
}) {
  const url = new URL(binanceKlinesBaseUrl());
  url.searchParams.set("symbol", input.symbol);
  url.searchParams.set("interval", "1d");
  url.searchParams.set("limit", String(BINANCE_KLINE_LIMIT));
  url.searchParams.set("endTime", String(input.endTime));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "stocks-optimizer binance-history",
      },
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const payload = await response.json();
    return Array.isArray(payload) && payload.every((row) => Array.isArray(row))
      ? payload as unknown[][]
      : null;
  } catch (error) {
    logger.debug({ symbol: input.symbol, err: error }, "Binance kline history request failed");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchViaBinanceKlines(
  market: string,
  symbolInput: string,
  options: Required<TradingViewHistoryOptions>,
) {
  if (!isBinanceMarket(market) || process.env.BINANCE_HISTORY_DISABLED === "true") {
    return null;
  }

  const symbol = normalizeBinanceSymbol(symbolInput);
  if (!symbol) return null;

  const requestedYearsMs = options.lookbackYears * 365.25 * 86_400_000;
  const startTime = Date.now() - requestedYearsMs;
  let endTime = Date.now();
  const rows: unknown[][] = [];
  const maxPages = Math.max(1, Math.ceil(options.bars / BINANCE_KLINE_LIMIT) + 2);

  for (let page = 0; page < maxPages && rows.length < options.bars; page += 1) {
    const pageRows = await fetchBinanceKlinesPage({
      symbol,
      endTime,
      timeoutMs: options.timeoutMs,
    });

    if (!pageRows?.length) break;

    rows.push(...pageRows);

    const firstOpenTime = Number(pageRows[0]?.[0]);
    if (!Number.isFinite(firstOpenTime) || firstOpenTime <= startTime) break;
    endTime = firstOpenTime - 1;
  }

  const bars = rows
    .map((row) => binanceKlineToBar(symbol, row))
    .filter((bar): bar is TradingViewHistoricalBar => Boolean(bar))
    .filter((bar) => Date.parse(bar.timestamp ?? `${bar.date}T00:00:00.000Z`) >= startTime)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-options.bars);

  if (bars.length < options.minBars) return null;

  return buildHistoricalDataset({
    market: "BINANCE",
    symbol,
    providerSymbol: symbol,
    exchange: "BINANCE",
    bars,
    requestedYears: options.lookbackYears,
    requestedBars: options.bars,
    coverage: {
      source: "binance-klines",
      providerSymbol: symbol,
      exchange: "BINANCE",
    },
    audit: {
      sourceStatus: "real",
      dataQuality: "real",
    },
  });
}

async function fetchViaLocalModule(candidate: Candidate, options: Required<TradingViewHistoryOptions>) {
  const mod = await loadLocalChartDataModule();
  if (!mod) return null;

  const result = typeof mod.fetchHistoricalDataset === "function"
    ? await mod.fetchHistoricalDataset({
        symbol: candidate.symbol,
        exchange: candidate.exchange,
        market: candidate.exchange === "BINANCE" ? "crypto" : "stock",
        interval: "1D",
        bars: options.bars,
        lookbackYears: options.lookbackYears,
        timeoutMs: options.timeoutMs,
      })
    : await mod.fetchTradingViewCandlesForSymbol({
        symbol: candidate.symbol,
        exchange: candidate.exchange,
        market: candidate.exchange === "BINANCE" ? "crypto" : "stock",
        interval: "1D",
        bars: options.bars,
        lookbackYears: options.lookbackYears,
        timeoutMs: options.timeoutMs,
      });

  const dataset = result?.dataset ?? result?.historicalDataset ?? result;
  const rows = Array.isArray(dataset?.bars)
    ? dataset.bars
    : Array.isArray(result?.bars)
      ? result.bars
      : [];
  return datasetFromRows(candidate, options, rows, {
    market: candidate.exchange,
    sourceStatus: dataset?.sourceStatus ?? result?.sourceStatus,
    dataQuality: dataset?.dataQuality ?? result?.dataQuality,
    providerSymbol: dataset?.symbol ?? dataset?.providerSymbol ?? result?.symbol ?? candidate.providerSymbol,
    exchange: dataset?.exchange ?? result?.exchange ?? candidate.exchange,
  }, {
    coverage: dataset?.coverage,
    audit: dataset?.audit,
    regimes: Array.isArray(dataset?.regimes) ? dataset.regimes : null,
  });
}

function tradingViewRemoteBaseUrl() {
  return (
    process.env.TRADINGVIEW_DATA_BASE_URL?.trim() ||
    "https://tradingview-data.vercel.app/api/chart-data"
  );
}

async function fetchViaRemote(candidate: Candidate, options: Required<TradingViewHistoryOptions>) {
  const url = new URL(tradingViewRemoteBaseUrl());
  url.searchParams.set("symbol", candidate.symbol);
  if (candidate.exchange) url.searchParams.set("exchange", candidate.exchange);
  url.searchParams.set("interval", "1D");
  url.searchParams.set("bars", String(options.bars));
  url.searchParams.set("lookbackYears", String(options.lookbackYears));
  url.searchParams.set("format", "json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, text/csv, text/plain, */*",
        "User-Agent": "stocks-optimizer tradingview-history",
      },
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      const dataset = payload?.dataset ?? payload?.historicalDataset ?? payload;
      const rows = Array.isArray(dataset?.bars)
        ? dataset.bars
        : Array.isArray(payload?.bars)
        ? payload.bars
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
      return datasetFromRows(candidate, options, rows, {
        market: candidate.exchange,
        sourceStatus: dataset?.sourceStatus ?? payload?.sourceStatus,
        dataQuality: dataset?.dataQuality ?? payload?.dataQuality,
        providerSymbol: dataset?.symbol ?? dataset?.providerSymbol ?? payload?.symbol ?? candidate.providerSymbol,
        exchange: dataset?.exchange ?? payload?.exchange ?? candidate.exchange,
      }, {
        coverage: dataset?.coverage,
        audit: dataset?.audit,
        regimes: Array.isArray(dataset?.regimes) ? dataset.regimes : null,
      });
    }

    const text = await response.text();
    const [headerLine, ...lines] = text.trim().split(/\r?\n/).filter(Boolean);
    const headers = headerLine?.split(",").map((header) => header.trim()) ?? [];
    const rows = lines.map((line) => {
      const cols = line.split(",");
      return Object.fromEntries(headers.map((header, index) => [header, cols[index]]));
    });

    return datasetFromRows(candidate, options, rows, {
      source: "tradingview-data",
      sourceStatus: "delayed",
      dataQuality: "real",
      providerSymbol: candidate.providerSymbol,
      exchange: candidate.exchange,
    });
  } catch (error) {
    logger.debug({ candidate, err: error }, "TradingView remote history request failed");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function cacheKey(market: string, symbol: string, options: Required<TradingViewHistoryOptions>) {
  return `${normalizeKey(market)}:${normalizeKey(symbol)}:${options.bars}:${options.lookbackYears}`;
}

export async function loadTradingViewHistoricalBars(
  market: string,
  symbol: string,
  options: TradingViewHistoryOptions = {},
): Promise<TradingViewHistoricalBar[]> {
  const dataset = await loadTradingViewHistoricalDataset(market, symbol, options);
  return dataset.bars as TradingViewHistoricalBar[];
}

export async function loadTradingViewHistoricalDataset(
  market: string,
  symbol: string,
  options: TradingViewHistoryOptions = {},
): Promise<HistoricalDataset> {
  const resolvedOptions = {
    bars: Math.max(2, Number(options.bars ?? DEFAULT_BARS)),
    lookbackYears: Math.max(1, Number(options.lookbackYears ?? DEFAULT_LOOKBACK_YEARS)),
    minBars: Math.max(1, Number(options.minBars ?? 60)),
    timeoutMs: Math.max(1_000, Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)),
  };
  const key = cacheKey(market, symbol, resolvedOptions);
  const cached = HISTORY_CACHE.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.dataset;
  }

  const binanceDataset = await fetchViaBinanceKlines(market, symbol, resolvedOptions);
  if (binanceDataset && binanceDataset.bars.length >= resolvedOptions.minBars) {
    HISTORY_CACHE.set(key, { expiresAt: Date.now() + HISTORY_CACHE_TTL_MS, dataset: binanceDataset });
    return binanceDataset;
  }

  for (const candidate of buildCandidates(symbol, market)) {
    const localDataset = await fetchViaLocalModule(candidate, resolvedOptions);
    if (localDataset && localDataset.bars.length >= resolvedOptions.minBars) {
      HISTORY_CACHE.set(key, { expiresAt: Date.now() + HISTORY_CACHE_TTL_MS, dataset: localDataset });
      return localDataset;
    }

    const remoteDataset = await fetchViaRemote(candidate, resolvedOptions);
    if (remoteDataset && remoteDataset.bars.length >= resolvedOptions.minBars) {
      HISTORY_CACHE.set(key, { expiresAt: Date.now() + HISTORY_CACHE_TTL_MS, dataset: remoteDataset });
      return remoteDataset;
    }
  }

  const emptyDataset = buildHistoricalDataset({
    market,
    symbol,
    bars: [],
    requestedYears: resolvedOptions.lookbackYears,
    requestedBars: resolvedOptions.bars,
  });
  HISTORY_CACHE.set(key, { expiresAt: Date.now() + Math.min(HISTORY_CACHE_TTL_MS, 60_000), dataset: emptyDataset });
  return emptyDataset;
}
