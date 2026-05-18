import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { fileURLToPath } from "url";
import {
  calibrateSignalDecision,
  getAdaptiveThresholds,
  getSignalTrainingState,
  recordSignalSnapshot,
  type SignalTrainingState,
} from "./signal-training";
import { logger } from "./logger";

export interface StockListItem {
  symbol: string;
  name: string;
  market?: string;
  sector?: string;
  image?: string;
  exchange: string;
  country: string;
}

export interface StockQuote {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  changePercent: number;
  status: "Stable" | "Rising" | "Watch" | "Dip";
  high52: number;
  low52: number;
  history: number[];
  summary: string;
  impact: string;
  cap?: string;
  peRatio?: number;
  signalAction?: TradeSignal;
  signalConfidence?: number;
  signalSource?: "node-ecu" | "heuristic";
  signalEmittedAt?: string;
  signalEntryPrice?: number;
  signalReturnPercent?: number;
  quoteSource?: "binance-spot" | "binance-futures" | "tradingview";
}

export type TradeSignal = "Buy" | "Hold" | "Sell";
export interface QuoteFetchOptions {
  bypassCache?: boolean;
}

export interface SignalAttachOptions {
  bypassSignalCache?: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR_CANDIDATES = [
  path.resolve(process.cwd(), "stocks-public"),
  path.resolve(process.cwd(), "src", "stocks-public"),
  path.resolve(process.cwd(), "artifacts", "signal-markets", "public"),
  path.resolve(process.cwd(), "artifacts", "signal-markets", "dist", "public"),
  path.resolve(
    process.cwd(),
    "examples",
    "stocks",
    "src",
    "artifacts",
    "signal-markets",
    "public",
  ),
  path.resolve(
    process.cwd(),
    "examples",
    "stocks",
    "src",
    "artifacts",
    "signal-markets",
    "dist",
    "public",
  ),
  path.resolve(process.cwd(), "examples", "stocks", "src", "stocks-public"),
  path.resolve(
    process.cwd(),
    "examples",
    "stocks",
    "src",
    "lib",
    "stocks-optimizer",
    "public",
  ),
  path.resolve(
    process.cwd(),
    "examples",
    "stocks",
    "lib",
    "stocks-optimizer",
    "public",
  ),
  path.resolve(process.cwd(), "lib", "stocks-optimizer", "public"),
  path.resolve(
    __dirname,
    "../../../../..",
    "lib",
    "stocks-optimizer",
    "public",
  ),
  path.resolve(__dirname, "../../../..", "lib", "stocks-optimizer", "public"),
];

const DEFAULT_PUBLIC_DIR =
  PUBLIC_DIR_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ??
  PUBLIC_DIR_CANDIDATES[0];

const STOCKS_PUBLIC_DIR = process.env.STOCKS_PUBLIC_DIR
  ? path.resolve(process.env.STOCKS_PUBLIC_DIR)
  : DEFAULT_PUBLIC_DIR;

const LIST_CACHE_TTL_MS = Number(
  process.env.STOCKS_LIST_CACHE_TTL_MS ?? 10 * 60 * 1000,
);
const QUOTE_CACHE_TTL_MS = Number(
  process.env.TRADINGVIEW_CACHE_TTL_MS ?? 5 * 60 * 1000,
);
const TRADINGVIEW_BATCH_SIZE = Number(process.env.TRADINGVIEW_BATCH_SIZE ?? 8);
const TRADINGVIEW_BATCH_DELAY_MS = Number(
  process.env.TRADINGVIEW_BATCH_DELAY_MS ?? 500,
);
const MAX_SYMBOLS_PER_REQUEST = Number(
  process.env.TRADINGVIEW_MAX_SYMBOLS ?? 30,
);
const TRADINGVIEW_REQUESTS_PER_MINUTE = Number(
  process.env.TRADINGVIEW_REQUESTS_PER_MINUTE ?? 120,
);
const TRADINGVIEW_TIMEOUT_MS = Number(
  process.env.TRADINGVIEW_TIMEOUT_MS ?? 10_000,
);
const TRADINGVIEW_BASE_URL =
  process.env.TRADINGVIEW_DATA_BASE_URL?.trim() ??
  "https://tradingview-data.vercel.app?symbol=";
const BINANCE_SPOT_BASE_URL = (
  process.env.BINANCE_SPOT_BASE_URL ?? "https://api.binance.com"
).replace(/\/$/, "");
const BINANCE_FUTURES_BASE_URL = (
  process.env.BINANCE_FUTURES_BASE_URL ?? "https://fapi.binance.com"
).replace(/\/$/, "");
const BINANCE_TICKER_CACHE_TTL_MS = Number(
  process.env.BINANCE_TICKER_CACHE_TTL_MS ?? 5_000,
);
const BINANCE_QUOTE_CACHE_TTL_MS = Number(
  process.env.BINANCE_QUOTE_CACHE_TTL_MS ?? 10_000,
);
const NODE_ECU_API_BASE_URL = (
  process.env.NODE_ECU_API_BASE_URL ??
  (process.env.VERCEL ? "off" : "http://localhost:4410/api")
).trim();
const NODE_ECU_TIMEOUT_MS = Number(process.env.NODE_ECU_TIMEOUT_MS ?? 6000);
const SIGNAL_CACHE_TTL_MS = Number(
  process.env.SIGNAL_CACHE_TTL_MS ?? 5 * 60 * 1000,
);

const listCache = new Map<
  string,
  { expiresAt: number; items: StockListItem[] }
>();
const marketCache = new Map<
  string,
  { expiresAt: number; items: StockListItem[] }
>();
const quoteCache = new Map<string, { expiresAt: number; quote: StockQuote }>();
type SignalSnapshot = Pick<
  StockQuote,
  | "signalAction"
  | "signalConfidence"
  | "signalSource"
  | "signalEmittedAt"
  | "signalEntryPrice"
  | "signalReturnPercent"
>;

type SignalDecision = {
  signalAction: TradeSignal;
  signalConfidence: number;
  signalSource: "node-ecu" | "heuristic";
};

const signalCache = new Map<
  string,
  { expiresAt: number; signal: SignalDecision; snapshot?: SignalSnapshot }
>();
const tradingViewRequestTimestamps: number[] = [];
let tradingViewQueue: Promise<void> = Promise.resolve();

type BinanceTicker = {
  symbol: string;
  priceChangePercent?: string;
  lastPrice?: string;
  bidPrice?: string;
  askPrice?: string;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  closeTime?: number;
};

type BinanceTickerCache = {
  expiresAt: number;
  spot: Map<string, BinanceTicker>;
  futures: Map<string, BinanceTicker>;
};

let binanceTickerCache: BinanceTickerCache | null = null;
let binanceTickerCachePromise: Promise<BinanceTickerCache> | null = null;

const exchangeLabelOverrides: Record<string, string> = {
  UK: "United Kingdom",
  GB: "United Kingdom",
  KSA: "Saudi Arabia",
  SA: "Saudi Arabia",
  AE: "United Arab Emirates",
  CRYPTO: "Crypto",
  ETF: "ETF",
};

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export function listExchanges(): Array<{
  code: string;
  label: string;
  count: number;
}> {
  const exchangeCodes = listExchangeCodes();

  return exchangeCodes
    .map((code) => {
      const label = exchangeToCountry(code);
      const count = getListCount(code);
      return { code, label, count };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function listMarkets(): Array<{
  code: string;
  label: string;
  count: number;
}> {
  const exchangeCodes = listExchangeCodes();
  const marketCounts = new Map<string, { label: string; count: number }>();

  for (const exchange of exchangeCodes) {
    const items = loadStockList(exchange);
    for (const item of items) {
      const rawMarket = item.market?.trim();
      if (!rawMarket) continue;
      const code = rawMarket.toUpperCase();
      const current = marketCounts.get(code);
      if (current) {
        current.count += 1;
      } else {
        marketCounts.set(code, { label: rawMarket, count: 1 });
      }
    }
  }

  return Array.from(marketCounts.entries())
    .map(([code, value]) => ({ code, label: value.label, count: value.count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function loadStockList(exchange: string): StockListItem[] {
  const normalized = exchange.trim().toUpperCase();
  const cached = listCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.items;
  }

  const filePath = path.join(
    STOCKS_PUBLIC_DIR,
    `stocks_list_${normalized}.json`,
  );
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const text = fs.readFileSync(filePath, "utf8");
  const raw = JSON.parse(text) as Array<{
    symbol?: string;
    name?: string;
    market?: string;
    sector?: string;
    image?: string;
  }>;

  const items = (raw ?? [])
    .filter((item) => item?.symbol && item?.name)
    .map((item) => ({
      symbol: String(item.symbol),
      name: String(item.name),
      market: item.market ? String(item.market) : undefined,
      sector: item.sector ? String(item.sector) : undefined,
      image: item.image ? String(item.image) : undefined,
      exchange: normalized,
      country: exchangeToCountry(normalized),
    }));

  listCache.set(normalized, {
    expiresAt: Date.now() + LIST_CACHE_TTL_MS,
    items,
  });

  return items;
}

export function loadMarketList(market: string): StockListItem[] {
  const normalized = market.trim().toUpperCase();
  const cached = marketCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.items;
  }

  const exchangeCodes = listExchangeCodes();
  const items = exchangeCodes.flatMap((exchange) =>
    loadStockList(exchange).filter(
      (item) => (item.market ?? "").trim().toUpperCase() === normalized,
    ),
  );

  marketCache.set(normalized, {
    expiresAt: Date.now() + LIST_CACHE_TTL_MS,
    items,
  });

  return items;
}

export async function fetchQuotes(
  exchange: string,
  symbols: string[],
  options?: QuoteFetchOptions,
): Promise<StockQuote[]> {
  const normalized = exchange.trim().toUpperCase();
  const uniqueSymbols = Array.from(
    new Set(symbols.map((symbol) => symbol.trim())),
  ).filter(Boolean);
  const limitedSymbols = uniqueSymbols.slice(0, MAX_SYMBOLS_PER_REQUEST);
  const stockList = loadStockList(normalized);
  const marketBySymbol = new Map(
    stockList.map((stock) => [stock.symbol, stock.market]),
  );

  const results: StockQuote[] = [];

  await runBatched(
    limitedSymbols,
    TRADINGVIEW_BATCH_SIZE,
    TRADINGVIEW_BATCH_DELAY_MS,
    async (symbol) => {
      let quote = null;
      let lastError = null;
      const maxAttempts = isBinanceScope(normalized, normalized) ? 1 : 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          quote = await fetchQuote(
            normalized,
            symbol,
            normalized, // Always try both plain and prefixed symbols
            options,
          );
          if (quote) break;
        } catch (err) {
          lastError = err;
        }
        // Exponential backoff
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
      if (quote) {
        results.push(quote);
      } else if (lastError) {
        logger.warn({ symbol, err: lastError }, "Failed to fetch quote after retries");
      } else {
        logger.warn({ exchange: normalized, symbol }, "No live quote rows returned after retries");
      }
    },
  );

  return results;
}

export async function fetchMarketQuotes(
  market: string,
  symbols: string[],
  options?: QuoteFetchOptions,
): Promise<StockQuote[]> {
  const normalized = market.trim().toUpperCase();
  const uniqueSymbols = Array.from(
    new Set(symbols.map((symbol) => symbol.trim())),
  ).filter(Boolean);
  const limitedSymbols = uniqueSymbols.slice(0, MAX_SYMBOLS_PER_REQUEST);
  const stockList = loadMarketList(normalized);
  const marketBySymbol = new Map(
    stockList.map((stock) => [stock.symbol, stock.market]),
  );

  const results: StockQuote[] = [];

  await runBatched(
    limitedSymbols,
    TRADINGVIEW_BATCH_SIZE,
    TRADINGVIEW_BATCH_DELAY_MS,
    async (symbol) => {
      let quote = null;
      let lastError = null;
      const maxAttempts = isBinanceScope(normalized, normalized) ? 1 : 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          quote = await fetchQuote(
            normalized,
            symbol,
            normalized, // Always try both plain and prefixed symbols
            options,
          );
          if (quote) break;
        } catch (err) {
          lastError = err;
        }
        // Exponential backoff
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
      if (quote) {
        results.push(quote);
      } else if (lastError) {
        logger.warn({ symbol, err: lastError }, "Failed to fetch quote after retries");
      } else {
        logger.warn({ market: normalized, symbol }, "No live quote rows returned after retries");
      }
    },
  );

  return results;
}

export async function attachSignalsToQuotes(
  quotes: StockQuote[],
  market?: string,
  options?: SignalAttachOptions,
): Promise<StockQuote[]> {
  if (!quotes.length) return quotes;
  const signalResults = await Promise.all(
    quotes.map(async (quote) => ({
      symbol: quote.symbol,
      signal: await getSignalForQuote(quote, market, options),
    })),
  );
  const signalMap = new Map(
    signalResults.map((item) => [item.symbol, item.signal]),
  );
  return quotes.map((quote) => ({
    ...quote,
    ...(signalMap.get(quote.symbol) ?? {}),
  }));
}

function getListCount(exchange: string): number {
  const filePath = path.join(STOCKS_PUBLIC_DIR, `stocks_list_${exchange}.json`);
  if (!fs.existsSync(filePath)) {
    return 0;
  }
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(text);
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

function listExchangeCodes(): string[] {
  if (!fs.existsSync(STOCKS_PUBLIC_DIR)) {
    return [];
  }

  return fs
    .readdirSync(STOCKS_PUBLIC_DIR)
    .filter((file) => file.startsWith("stocks_list_") && file.endsWith(".json"))
    .map((file) => file.replace("stocks_list_", "").replace(".json", "").trim())
    .filter(Boolean);
}

function exchangeToCountry(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (exchangeLabelOverrides[normalized]) {
    return exchangeLabelOverrides[normalized];
  }
  if (regionNames && normalized.length === 2) {
    return regionNames.of(normalized) ?? normalized;
  }
  return normalized;
}

async function fetchQuote(
  exchange: string,
  symbol: string,
  market?: string,
  options?: QuoteFetchOptions,
): Promise<StockQuote | null> {
  const cacheKey = `${exchange}:${symbol}`;
  const cached = quoteCache.get(cacheKey);
  if (!options?.bypassCache && cached && cached.expiresAt > Date.now()) {
    return cached.quote;
  }

  if (isBinanceScope(exchange, market)) {
    const binanceQuote = await fetchBinanceQuote(symbol);
    if (binanceQuote) {
      quoteCache.set(cacheKey, {
        expiresAt: Date.now() + BINANCE_QUOTE_CACHE_TTL_MS,
        quote: binanceQuote,
      });
      return binanceQuote;
    }
    return cached?.quote ?? null;
  }

  const rows = await fetchTradingViewRows(symbol, market);
  if (!rows.length) {
    logger.warn(
      { market, symbol, candidates: buildTradingViewCandidates(symbol, market) },
      "TradingView returned no rows for quote",
    );
    return cached?.quote ?? null;
  }

  const recentRows = rows.slice(-252);
  const last = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : last;
  const price = last.price;
  const changePercent = prev?.price
    ? ((price - prev.price) / prev.price) * 100
    : 0;
  const high52 = Math.max(...recentRows.map((row) => row.price));
  const low52 = Math.min(...recentRows.map((row) => row.price));
  const history = rows.slice(-30).map((row) => row.price);
  const status = statusFromChange(changePercent);

  const summary = buildSummary(symbol, changePercent, status);
  const impact = buildImpact(status, changePercent);

  const { bid, ask } = estimateSpread(price, history);

  const quote: StockQuote = {
    symbol,
    price,
    bid,
    ask,
    changePercent: Number(changePercent.toFixed(2)),
    status,
    high52: Number.isFinite(high52) ? high52 : price,
    low52: Number.isFinite(low52) ? low52 : price,
    history,
    summary,
    impact,
    cap: "N/A",
    peRatio: undefined,
    quoteSource: "tradingview",
  };

  quoteCache.set(cacheKey, {
    expiresAt: Date.now() + QUOTE_CACHE_TTL_MS,
    quote,
  });

  return quote;
}

async function getSignalForQuote(
  quote: StockQuote,
  market?: string,
  options?: SignalAttachOptions,
): Promise<SignalSnapshot> {
  const cacheKey = `${(market ?? "GLOBAL").toUpperCase()}:${quote.symbol}`;
  const cached = signalCache.get(cacheKey);
  const useCache = !options?.bypassSignalCache && cached && cached.expiresAt > Date.now();

  // Full cache hit: return snapshot directly, skipping all DB I/O
  if (useCache && cached.snapshot) {
    return cached.snapshot;
  }

  // Cache miss or snapshot not yet stored: compute signal + record snapshot
  const trainingState = await getSignalTrainingState(
    market ?? "GLOBAL",
    quote.symbol,
  );
  const signal = useCache
    ? cached.signal
    : await createSignalDecision(quote, market, trainingState);

  const currentPrice =
    Number.isFinite(quote.price) && quote.price > 0 ? quote.price : 0;
  const snapshot = await recordSignalSnapshot({
    market: market ?? "GLOBAL",
    symbol: quote.symbol,
    currentPrice,
    signal,
    previousState: trainingState,
  });

  // Store snapshot in signal cache so subsequent hits skip all DB I/O
  const existingEntry = signalCache.get(cacheKey);
  if (existingEntry) {
    existingEntry.snapshot = snapshot;
  } else {
    signalCache.set(cacheKey, {
      expiresAt: Date.now() + SIGNAL_CACHE_TTL_MS,
      signal,
      snapshot,
    });
  }

  return snapshot;
}

async function createSignalDecision(
  quote: StockQuote,
  market: string | undefined,
  trainingState: SignalTrainingState,
): Promise<SignalDecision> {
  const fromModel = await evaluateNodeEcuSignal(quote, market);
  const signal = calibrateSignalDecision(
    fromModel ?? deriveHeuristicSignal(quote, trainingState),
    trainingState,
  );
  const cacheKey = `${(market ?? "GLOBAL").toUpperCase()}:${quote.symbol}`;

  signalCache.set(cacheKey, {
    expiresAt: Date.now() + SIGNAL_CACHE_TTL_MS,
    signal,
  });

  return signal;
}

function deriveHeuristicSignal(
  quote: StockQuote,
  trainingState: SignalTrainingState,
): SignalDecision {
  const change = quote.changePercent ?? 0;
  const absChange = Math.abs(change);
  const { buyThreshold, sellThreshold } = getAdaptiveThresholds(trainingState);
  const signalAction: TradeSignal =
    change >= buyThreshold ? "Buy" : change <= sellThreshold ? "Sell" : "Hold";
  const signalConfidence = clampNumber(20 + absChange * 12, 15, 95);

  return {
    signalAction,
    signalConfidence: Math.round(signalConfidence),
    signalSource: "heuristic",
  };
}

function isBinanceScope(exchange: string, market?: string): boolean {
  const values = [exchange, market ?? ""].map((value) =>
    value.trim().toUpperCase(),
  );
  return values.some((value) => value === "BINANCE" || value === "CRYPTO");
}

async function fetchBinanceQuote(symbol: string): Promise<StockQuote | null> {
  const normalized = normalizeBinanceSymbol(symbol);
  if (!normalized) return null;

  const cache = await getBinanceTickerCache();
  let ticker =
    normalized.kind === "futures"
      ? cache.futures.get(normalized.apiSymbol)
      : cache.spot.get(normalized.apiSymbol);

  if (!ticker) {
    ticker = (await fetchBinanceTickerRow(normalized)) ?? undefined;
  }

  if (!ticker) {
    logger.warn(
      {
        symbol,
        apiSymbol: normalized.apiSymbol,
        marketType: normalized.kind,
      },
      "Binance ticker snapshot has no row for symbol",
    );
    return null;
  }

  const price = parseFiniteNumber(ticker.lastPrice);
  if (!Number.isFinite(price) || price <= 0) {
    logger.warn(
      {
        symbol,
        apiSymbol: normalized.apiSymbol,
        marketType: normalized.kind,
        lastPrice: ticker.lastPrice,
      },
      "Binance ticker row has no usable last price",
    );
    return null;
  }

  const changePercent = parseFiniteNumber(ticker.priceChangePercent) || 0;
  const open = parseFiniteNumber(ticker.openPrice);
  const high = parseFiniteNumber(ticker.highPrice);
  const low = parseFiniteNumber(ticker.lowPrice);
  const history = buildBinanceTickerHistory({
    open: Number.isFinite(open) && open > 0 ? open : price,
    high: Number.isFinite(high) && high > 0 ? high : price,
    low: Number.isFinite(low) && low > 0 ? low : price,
    close: price,
  });
  const bid = parseFiniteNumber(ticker.bidPrice);
  const ask = parseFiniteNumber(ticker.askPrice);
  const estimatedSpread = estimateSpread(price, history);
  const status = statusFromChange(changePercent);

  return {
    symbol,
    price,
    bid: Number.isFinite(bid) && bid > 0 ? bid : estimatedSpread.bid,
    ask: Number.isFinite(ask) && ask > 0 ? ask : estimatedSpread.ask,
    changePercent: Number(changePercent.toFixed(2)),
    status,
    high52: Number.isFinite(high) && high > 0 ? high : price,
    low52: Number.isFinite(low) && low > 0 ? low : price,
    history,
    summary: buildSummary(symbol, changePercent, status),
    impact: buildImpact(status, changePercent),
    cap: "N/A",
    peRatio: undefined,
    quoteSource:
      normalized.kind === "futures" ? "binance-futures" : "binance-spot",
  };
}

function normalizeBinanceSymbol(
  symbol: string,
): { apiSymbol: string; kind: "spot" | "futures" } | null {
  const rawSymbol = symbol.trim().toUpperCase();
  if (!rawSymbol) return null;
  const withoutExchange = rawSymbol.includes(":")
    ? rawSymbol.split(":").pop() ?? rawSymbol
    : rawSymbol;
  const kind = withoutExchange.endsWith(".P") ? "futures" : "spot";
  const apiSymbol = withoutExchange.replace(/\.P$/, "").replace(/[^A-Z0-9]/g, "");
  return apiSymbol ? { apiSymbol, kind } : null;
}

async function fetchBinanceTickerRow(input: {
  apiSymbol: string;
  kind: "spot" | "futures";
}): Promise<BinanceTicker | null> {
  const baseUrl =
    input.kind === "futures" ? BINANCE_FUTURES_BASE_URL : BINANCE_SPOT_BASE_URL;
  const path =
    input.kind === "futures" ? "/fapi/v1/ticker/24hr" : "/api/v3/ticker/24hr";
  const url = `${baseUrl}${path}?symbol=${encodeURIComponent(input.apiSymbol)}`;
  const rows = await fetchBinanceTickerRows(url, input.kind);
  return rows[0] ?? null;
}

async function getBinanceTickerCache(): Promise<BinanceTickerCache> {
  if (binanceTickerCache && binanceTickerCache.expiresAt > Date.now()) {
    return binanceTickerCache;
  }
  if (binanceTickerCachePromise) {
    return binanceTickerCachePromise;
  }

  binanceTickerCachePromise = Promise.all([
    fetchBinanceTickerRows(`${BINANCE_SPOT_BASE_URL}/api/v3/ticker/24hr`, "spot"),
    fetchBinanceTickerRows(
      `${BINANCE_FUTURES_BASE_URL}/fapi/v1/ticker/24hr`,
      "futures",
    ),
  ])
    .then(([spotRows, futuresRows]) => {
      const cache: BinanceTickerCache = {
        expiresAt: Date.now() + BINANCE_TICKER_CACHE_TTL_MS,
        spot: new Map(spotRows.map((row) => [row.symbol, row])),
        futures: new Map(futuresRows.map((row) => [row.symbol, row])),
      };
      binanceTickerCache = cache;
      return cache;
    })
    .finally(() => {
      binanceTickerCachePromise = null;
    });

  return binanceTickerCachePromise;
}

async function fetchBinanceTickerRows(
  url: string,
  marketType: "spot" | "futures",
): Promise<BinanceTicker[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRADINGVIEW_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn(
        {
          marketType,
          status: response.status,
          statusText: response.statusText,
        },
        "Binance ticker snapshot request failed",
      );
      return [];
    }

    const data = (await response.json()) as unknown;
    const records = Array.isArray(data) ? data : [data];

    return records
      .filter((item): item is BinanceTicker =>
        Boolean(
          item &&
            typeof item === "object" &&
            "symbol" in item &&
            typeof (item as { symbol?: unknown }).symbol === "string",
        ),
      )
      .map((item) => ({
        ...item,
        symbol: item.symbol.toUpperCase(),
      }));
  } catch (error) {
    logger.warn({ marketType, err: error }, "Binance ticker snapshot request errored");
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function parseFiniteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function buildBinanceTickerHistory(input: {
  open: number;
  high: number;
  low: number;
  close: number;
}): number[] {
  const { open, high, low, close } = input;
  const points: number[] = [];
  const steps: number = 30;
  for (let index = 0; index < steps; index++) {
    const progress = steps === 1 ? 1 : index / (steps - 1);
    const trend = open + (close - open) * progress;
    const wave =
      Math.sin(progress * Math.PI * 2) * (high - low) * 0.08 +
      Math.sin(progress * Math.PI * 5) * (high - low) * 0.03;
    const value = Math.min(high, Math.max(low, trend + wave));
    points.push(Number(value.toFixed(8)));
  }
  points[points.length - 1] = close;
  return points;
}

async function evaluateNodeEcuSignal(
  quote: StockQuote,
  market?: string,
): Promise<SignalDecision | null> {
  if (!NODE_ECU_API_BASE_URL || NODE_ECU_API_BASE_URL.toLowerCase() === "off") {
    return null;
  }

  const input = buildNodeEcuInput(quote, market);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NODE_ECU_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${NODE_ECU_API_BASE_URL.replace(/\/$/, "")}/signals/evaluate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      core?: { decision?: string | null; evidenceScore?: number };
      action?: { intent?: string };
      pulse?: { confidence?: number };
    };
    const intent = data.action?.intent ?? data.core?.decision ?? null;
    const confidence =
      typeof data.pulse?.confidence === "number"
        ? data.pulse.confidence
        : typeof data.core?.evidenceScore === "number"
          ? data.core.evidenceScore
          : 0;

    return {
      signalAction: mapIntentToTradeSignal(intent),
      signalConfidence: Math.round(clampNumber(confidence, 0, 100)),
      signalSource: "node-ecu",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildNodeEcuInput(quote: StockQuote, market?: string) {
  const history = quote.history?.length ? quote.history : [quote.price];
  const previousClose =
    history.length > 1 ? history[history.length - 2] : quote.price;
  const trendStrength = clampUnit(
    0.5 + (history[history.length - 1] - history[0]) / history[0] / 0.2,
  );
  const volatilityPct = clampUnit(computeVolatility(history) / 0.08);
  const drawdownPct = clampUnit(computeDrawdown(history));
  const changePercent = quote.changePercent ?? 0;

  return {
    source: "market_feed",
    symbol: quote.symbol,
    price: quote.price,
    previousClose,
    volume: 1_050_000,
    averageVolume: 1_000_000,
    trendStrength,
    volatilityPct,
    liquidityScore: 0.6,
    sentimentScore: clampNumber(changePercent / 5, -1, 1),
    convictionIndex: clampUnit(Math.abs(changePercent) / 6),
    drawdownPct,
    signalAgeMinutes: 30,
    metadata: {
      candleInterval: "1D",
      resolvedTradingviewSymbol: market
        ? `${market}:${quote.symbol}`
        : quote.symbol,
    },
  };
}

function mapIntentToTradeSignal(
  intent: string | null | undefined,
): TradeSignal {
  if (!intent) return "Hold";
  const normalized = intent.toLowerCase();
  if (["approve", "positive", "buy"].includes(normalized)) return "Buy";
  if (["reject", "negative", "sell"].includes(normalized)) return "Sell";
  return "Hold";
}

function computeVolatility(history: number[]): number {
  if (history.length < 3) return 0.02;
  const returns = history.slice(1).map((price, index) => {
    const prev = history[index];
    return prev ? (price - prev) / prev : 0;
  });
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    returns.length;
  return Math.sqrt(variance);
}

function computeDrawdown(history: number[]): number {
  const peak = Math.max(...history);
  const last = history[history.length - 1] ?? peak;
  if (!Number.isFinite(peak) || peak <= 0) return 0;
  return (peak - last) / peak;
}

function clampUnit(value: number): number {
  return clampNumber(value, 0, 1);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function fetchTradingViewRows(
  symbol: string,
  market?: string,
): Promise<Array<{ date: string; price: number }>> {
  const candidates = buildTradingViewCandidates(symbol, market);

  for (const candidate of candidates) {
    const rows = await fetchTradingViewRowsForSymbol(candidate);
    if (rows.length) {
      return rows;
    }
  }

  return [];
}

function buildTradingViewCandidates(symbol: string, market?: string): string[] {
  const normalizedSymbol = symbol.trim();
  const strippedSymbol = stripYahooSuffix(normalizedSymbol);
  const symbolVariants = Array.from(
    new Set([strippedSymbol, normalizedSymbol].filter(Boolean)),
  );
  const marketVariants = resolveTradingViewMarkets(market);
  const candidates: string[] = [];

  for (const tvSymbol of symbolVariants) {
    if (tvSymbol.includes(":")) {
      candidates.push(tvSymbol);
    }
  }

  for (const tvMarket of marketVariants) {
    for (const tvSymbol of symbolVariants) {
      if (tvSymbol.includes(":")) continue;
      candidates.push(`${tvMarket}:${tvSymbol}`);
    }
  }

  candidates.push(...symbolVariants);

  return Array.from(new Set(candidates));
}

function resolveTradingViewMarkets(market?: string): string[] {
  const normalized = market?.trim().toUpperCase();
  if (!normalized) return [];

  const aliases: Record<string, string[]> = {
    B3: ["BMFBOVESPA", "B3"],
    BINANCE: ["BINANCE"],
    CRYPTO: ["BINANCE", "CRYPTO"],
    FX: ["FX_IDC", "FX", "OANDA"],
    FOREX: ["FX_IDC", "FX", "OANDA"],
  };

  return aliases[normalized] ?? [normalized];
}

function stripYahooSuffix(symbol: string): string {
  return symbol.replace(/\.[A-Z]{1,4}$/i, "");
}

async function fetchTradingViewRowsForSymbol(
  tvSymbol: string,
): Promise<Array<{ date: string; price: number }>> {
  const url = buildTradingViewUrl(tvSymbol);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRADINGVIEW_TIMEOUT_MS);

  try {
    await scheduleTradingViewRequest();
    const response = await fetch(url, {
      headers: { Accept: "text/csv, text/plain, */*" },
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn(
        { symbol: tvSymbol, status: response.status, statusText: response.statusText },
        "TradingView quote request failed",
      );
      return [];
    }

    const csv = await response.text();
    const rows = parseCsvRows(csv);
    if (!rows.length) {
      logger.warn(
        { symbol: tvSymbol, bytes: csv.length, preview: csv.slice(0, 120) },
        "TradingView quote response contained no parseable rows",
      );
    }
    return rows;
  } catch (error) {
    logger.warn({ symbol: tvSymbol, err: error }, "TradingView quote request errored");
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function scheduleTradingViewRequest(): Promise<void> {
  if (
    !Number.isFinite(TRADINGVIEW_REQUESTS_PER_MINUTE) ||
    TRADINGVIEW_REQUESTS_PER_MINUTE <= 0
  ) {
    return;
  }

  const limit = Math.max(1, Math.floor(TRADINGVIEW_REQUESTS_PER_MINUTE));
  const windowMs = 60 * 1000;

  tradingViewQueue = tradingViewQueue.then(async () => {
    const now = Date.now();
    while (
      tradingViewRequestTimestamps.length &&
      now - tradingViewRequestTimestamps[0] >= windowMs
    ) {
      tradingViewRequestTimestamps.shift();
    }

    if (tradingViewRequestTimestamps.length >= limit) {
      const waitMs = windowMs - (now - tradingViewRequestTimestamps[0]) + 10;
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, waitMs)));
    }

    tradingViewRequestTimestamps.push(Date.now());
  });

  return tradingViewQueue;
}

function buildTradingViewUrl(symbol: string): string {
  const encoded = encodeURIComponent(symbol);
  if (TRADINGVIEW_BASE_URL.includes("{symbol}")) {
    return TRADINGVIEW_BASE_URL.replaceAll("{symbol}", encoded);
  }
  if (
    TRADINGVIEW_BASE_URL.includes("symbol=") ||
    TRADINGVIEW_BASE_URL.endsWith("?symbol")
  ) {
    return `${TRADINGVIEW_BASE_URL}${encoded}`;
  }
  if (TRADINGVIEW_BASE_URL.endsWith("/")) {
    return `${TRADINGVIEW_BASE_URL}${encoded}`;
  }
  return `${TRADINGVIEW_BASE_URL}?symbol=${encoded}`;
}

function parseCsvRows(csv: string): Array<{ date: string; price: number }> {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  }).data;

  return parsed
    .map((row) => {
      const dateValue = findField(row, [
        "Date",
        "date",
        "Time",
        "time",
        "Datetime",
        "datetime",
      ]);
      const priceValue = findField(row, [
        "Adj Close",
        "adj close",
        "Adj_Close",
        "adj_close",
        "Close",
        "close",
      ]);
      const date = String(dateValue ?? "").trim();
      const price = Number(priceValue);

      if (!date || !Number.isFinite(price) || price <= 0) {
        return null;
      }

      return { date, price };
    })
    .filter((row): row is { date: string; price: number } => Boolean(row));
}

function findField(
  row: Record<string, string>,
  candidates: string[],
): string | undefined {
  if (!row || typeof row !== "object") {
    return undefined;
  }

  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const normalizedCandidate = candidate.trim().toLowerCase();
    for (const [key, value] of entries) {
      if (String(key).trim().toLowerCase() === normalizedCandidate) {
        return value;
      }
    }
  }

  return undefined;
}

function statusFromChange(changePercent: number): StockQuote["status"] {
  const absChange = Math.abs(changePercent);
  if (absChange >= 4) return "Watch";
  if (changePercent >= 1) return "Rising";
  if (changePercent <= -1) return "Dip";
  return "Stable";
}

/**
 * Estimates bid/ask spread using a heuristic based on price level and
 * historical volatility. Higher volatility and lower-priced stocks tend
 * to have wider spreads.
 *
 * Spread tiers (as % of price):
 *   price >= 100  → base 0.02% + volatility component
 *   price >= 10   → base 0.05% + volatility component
 *   price >= 1    → base 0.15% + volatility component
 *   price < 1     → base 0.50% + volatility component
 */
function estimateSpread(
  price: number,
  history: number[],
): { bid: number; ask: number } {
  if (!Number.isFinite(price) || price <= 0) {
    return { bid: price, ask: price };
  }

  // Compute annualised daily volatility from history (last 30 prices)
  let volatility = 0;
  if (history.length >= 2) {
    const returns: number[] = [];
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const curr = history[i];
      if (prev > 0 && curr > 0) {
        returns.push(Math.log(curr / prev));
      }
    }
    if (returns.length >= 2) {
      const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
      const variance =
        returns.reduce((s, v) => s + (v - mean) ** 2, 0) /
        (returns.length - 1);
      volatility = Math.sqrt(variance); // daily std dev (log returns)
    }
  }

  // Base half-spread percentage by price tier
  const basePct =
    price >= 100 ? 0.0002 : price >= 10 ? 0.0005 : price >= 1 ? 0.0015 : 0.005;

  // Add a volatility contribution (daily std dev scaled down)
  const halfSpreadPct = basePct + volatility * 0.1;

  const halfSpread = price * halfSpreadPct;
  const bid = Number((price - halfSpread).toFixed(4));
  const ask = Number((price + halfSpread).toFixed(4));

  return { bid, ask };
}

function buildSummary(
  symbol: string,
  changePercent: number,
  status: StockQuote["status"],
): string {
  const direction = changePercent >= 0 ? "up" : "down";
  const magnitude = Math.abs(changePercent).toFixed(2);
  if (status === "Watch") {
    return `${symbol} moved ${direction} ${magnitude}% today — volatility elevated.`;
  }
  return `${symbol} is ${direction} ${magnitude}% today.`;
}

function buildImpact(
  status: StockQuote["status"],
  changePercent: number,
): string {
  if (status === "Watch") {
    return "Higher volatility detected. Consider tighter risk controls.";
  }
  if (status === "Rising") {
    return "Momentum is positive. Monitor for continuation.";
  }
  if (status === "Dip") {
    return "Selling pressure is present. Watch support levels.";
  }
  if (Math.abs(changePercent) < 0.5) {
    return "Quiet trading range. No immediate action required.";
  }
  return "Routine movement within expected range.";
}

async function runBatched<T>(
  items: T[],
  batchSize: number,
  batchDelayMs: number,
  handler: (item: T) => Promise<void>,
): Promise<void> {
  const size = Math.max(1, Math.floor(batchSize));
  const delay = Math.max(0, Math.floor(batchDelayMs));

  for (let index = 0; index < items.length; index += size) {
    const batch = items.slice(index, index + size);
    // Restrict to one at a time to minimize memory usage and concurrency
    for (const item of batch) {
      await handler(item);
    }
    if (delay > 0 && index + size < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
