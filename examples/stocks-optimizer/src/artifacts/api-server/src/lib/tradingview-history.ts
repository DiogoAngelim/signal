import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

const DEFAULT_BARS = 1_260;
const DEFAULT_LOOKBACK_YEARS = 5;
const DEFAULT_TIMEOUT_MS = Number(process.env.TRADINGVIEW_HISTORY_TIMEOUT_MS ?? 20_000);
const HISTORY_CACHE_TTL_MS = Number(process.env.TRADINGVIEW_HISTORY_CACHE_TTL_MS ?? 10 * 60_000);
const HISTORY_CACHE = new Map<string, { expiresAt: number; bars: TradingViewHistoricalBar[] }>();

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

async function fetchViaLocalModule(candidate: Candidate, options: Required<TradingViewHistoryOptions>) {
  const mod = await loadLocalChartDataModule();
  if (!mod) return [];

  const result = await mod.fetchTradingViewCandlesForSymbol({
    symbol: candidate.symbol,
    exchange: candidate.exchange,
    market: candidate.exchange === "BINANCE" ? "crypto" : "stock",
    interval: "1D",
    bars: options.bars,
    lookbackYears: options.lookbackYears,
    timeoutMs: options.timeoutMs,
  });

  const rows = Array.isArray(result?.bars) ? result.bars : [];
  return normalizeBars(rows, {
    source: "tradingview-data",
    sourceStatus: result?.sourceStatus === "unavailable" ? "unavailable" : (result?.sourceStatus ?? "delayed"),
    dataQuality: result?.dataQuality === "degraded" ? "degraded" : "real",
    providerSymbol: result?.symbol ?? candidate.providerSymbol,
    exchange: result?.exchange ?? candidate.exchange,
  }).filter((bar) => bar.sourceStatus !== "unavailable");
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

    if (!response.ok) return [];

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      const rows = Array.isArray(payload?.bars)
        ? payload.bars
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
      return normalizeBars(rows, {
        source: "tradingview-data",
        sourceStatus: payload?.sourceStatus === "unavailable" ? "unavailable" : (payload?.sourceStatus ?? "delayed"),
        dataQuality: payload?.dataQuality === "degraded" ? "degraded" : "real",
        providerSymbol: payload?.symbol ?? candidate.providerSymbol,
        exchange: payload?.exchange ?? candidate.exchange,
      }).filter((bar) => bar.sourceStatus !== "unavailable");
    }

    const text = await response.text();
    const [headerLine, ...lines] = text.trim().split(/\r?\n/).filter(Boolean);
    const headers = headerLine?.split(",").map((header) => header.trim()) ?? [];
    const rows = lines.map((line) => {
      const cols = line.split(",");
      return Object.fromEntries(headers.map((header, index) => [header, cols[index]]));
    });

    return normalizeBars(rows, {
      source: "tradingview-data",
      sourceStatus: "delayed",
      dataQuality: "real",
      providerSymbol: candidate.providerSymbol,
      exchange: candidate.exchange,
    });
  } catch (error) {
    logger.debug({ candidate, err: error }, "TradingView remote history request failed");
    return [];
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
  const resolvedOptions = {
    bars: Math.max(2, Number(options.bars ?? DEFAULT_BARS)),
    lookbackYears: Math.max(1, Number(options.lookbackYears ?? DEFAULT_LOOKBACK_YEARS)),
    minBars: Math.max(1, Number(options.minBars ?? 60)),
    timeoutMs: Math.max(1_000, Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)),
  };
  const key = cacheKey(market, symbol, resolvedOptions);
  const cached = HISTORY_CACHE.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.bars;
  }

  for (const candidate of buildCandidates(symbol, market)) {
    const localBars = await fetchViaLocalModule(candidate, resolvedOptions);
    if (localBars.length >= resolvedOptions.minBars) {
      HISTORY_CACHE.set(key, { expiresAt: Date.now() + HISTORY_CACHE_TTL_MS, bars: localBars });
      return localBars;
    }

    const remoteBars = await fetchViaRemote(candidate, resolvedOptions);
    if (remoteBars.length >= resolvedOptions.minBars) {
      HISTORY_CACHE.set(key, { expiresAt: Date.now() + HISTORY_CACHE_TTL_MS, bars: remoteBars });
      return remoteBars;
    }
  }

  HISTORY_CACHE.set(key, { expiresAt: Date.now() + Math.min(HISTORY_CACHE_TTL_MS, 60_000), bars: [] });
  return [];
}

