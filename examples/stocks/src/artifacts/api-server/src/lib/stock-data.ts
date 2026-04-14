import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { fileURLToPath } from "url";

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
}

export type TradeSignal = "Buy" | "Hold" | "Sell";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR_CANDIDATES = [
  path.resolve(process.cwd(), "stocks-public"),
  path.resolve(process.cwd(), "src", "stocks-public"),
  path.resolve(process.cwd(), "artifacts", "signal-markets", "public"),
  path.resolve(process.cwd(), "artifacts", "signal-markets", "dist", "public"),
  path.resolve(process.cwd(), "examples", "stocks", "src", "artifacts", "signal-markets", "public"),
  path.resolve(process.cwd(), "examples", "stocks", "src", "artifacts", "signal-markets", "dist", "public"),
  path.resolve(process.cwd(), "examples", "stocks", "src", "stocks-public"),
  path.resolve(process.cwd(), "examples", "stocks", "src", "lib", "stocks-optimizer", "public"),
  path.resolve(process.cwd(), "examples", "stocks", "lib", "stocks-optimizer", "public"),
  path.resolve(process.cwd(), "lib", "stocks-optimizer", "public"),
  path.resolve(__dirname, "../../../../..", "lib", "stocks-optimizer", "public"),
  path.resolve(__dirname, "../../../..", "lib", "stocks-optimizer", "public")
];

const DEFAULT_PUBLIC_DIR = PUBLIC_DIR_CANDIDATES.find((candidate) => fs.existsSync(candidate))
  ?? PUBLIC_DIR_CANDIDATES[0];

const STOCKS_PUBLIC_DIR = process.env.STOCKS_PUBLIC_DIR
  ? path.resolve(process.env.STOCKS_PUBLIC_DIR)
  : DEFAULT_PUBLIC_DIR;

const LIST_CACHE_TTL_MS = Number(process.env.STOCKS_LIST_CACHE_TTL_MS ?? 10 * 60 * 1000);
const QUOTE_CACHE_TTL_MS = Number(process.env.TRADINGVIEW_CACHE_TTL_MS ?? 5 * 60 * 1000);
const TRADINGVIEW_BATCH_SIZE = Number(process.env.TRADINGVIEW_BATCH_SIZE ?? 3);
const TRADINGVIEW_BATCH_DELAY_MS = Number(process.env.TRADINGVIEW_BATCH_DELAY_MS ?? 500);
const MAX_SYMBOLS_PER_REQUEST = Number(process.env.TRADINGVIEW_MAX_SYMBOLS ?? 30);
const TRADINGVIEW_REQUESTS_PER_MINUTE = Number(process.env.TRADINGVIEW_REQUESTS_PER_MINUTE ?? 25);
const TRADINGVIEW_BASE_URL = process.env.TRADINGVIEW_DATA_BASE_URL?.trim()
  ?? "https://tradingview-data.vercel.app?symbol=";
const NODE_ECU_API_BASE_URL = (
  process.env.NODE_ECU_API_BASE_URL
  ?? (process.env.VERCEL ? "off" : "http://localhost:4410/api")
).trim();
const NODE_ECU_TIMEOUT_MS = Number(process.env.NODE_ECU_TIMEOUT_MS ?? 6000);
const SIGNAL_CACHE_TTL_MS = Number(process.env.SIGNAL_CACHE_TTL_MS ?? 5 * 60 * 1000);

const listCache = new Map<string, { expiresAt: number; items: StockListItem[] }>();
const marketCache = new Map<string, { expiresAt: number; items: StockListItem[] }>();
const quoteCache = new Map<string, { expiresAt: number; quote: StockQuote }>();
const signalCache = new Map<string, { expiresAt: number; signal: Pick<StockQuote, "signalAction" | "signalConfidence" | "signalSource"> }>();
const tradingViewRequestTimestamps: number[] = [];
let tradingViewQueue: Promise<void> = Promise.resolve();

const exchangeLabelOverrides: Record<string, string> = {
  UK: "United Kingdom",
  GB: "United Kingdom",
  KSA: "Saudi Arabia",
  SA: "Saudi Arabia",
  AE: "United Arab Emirates",
  CRYPTO: "Crypto",
  ETF: "ETF"
};

const regionNames = typeof Intl !== "undefined" && "DisplayNames" in Intl
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

export function listExchanges(): Array<{ code: string; label: string; count: number }> {
  const exchangeCodes = listExchangeCodes();

  return exchangeCodes
    .map((code) => {
      const label = exchangeToCountry(code);
      const count = getListCount(code);
      return { code, label, count };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function listMarkets(): Array<{ code: string; label: string; count: number }> {
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

  const filePath = path.join(STOCKS_PUBLIC_DIR, `stocks_list_${normalized}.json`);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const text = fs.readFileSync(filePath, "utf8");
  const raw = JSON.parse(text) as Array<{ symbol?: string; name?: string; market?: string; sector?: string; image?: string }>;

  const items = (raw ?? [])
    .filter((item) => item?.symbol && item?.name)
    .map((item) => ({
      symbol: String(item.symbol),
      name: String(item.name),
      market: item.market ? String(item.market) : undefined,
      sector: item.sector ? String(item.sector) : undefined,
      image: item.image ? String(item.image) : undefined,
      exchange: normalized,
      country: exchangeToCountry(normalized)
    }));

  listCache.set(normalized, {
    expiresAt: Date.now() + LIST_CACHE_TTL_MS,
    items
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
    loadStockList(exchange).filter((item) => (item.market ?? "").trim().toUpperCase() === normalized)
  );

  marketCache.set(normalized, {
    expiresAt: Date.now() + LIST_CACHE_TTL_MS,
    items
  });

  return items;
}

export async function fetchQuotes(exchange: string, symbols: string[]): Promise<StockQuote[]> {
  const normalized = exchange.trim().toUpperCase();
  const uniqueSymbols = Array.from(new Set(symbols.map((symbol) => symbol.trim()))).filter(Boolean);
  const limitedSymbols = uniqueSymbols.slice(0, MAX_SYMBOLS_PER_REQUEST);
  const stockList = loadStockList(normalized);
  const marketBySymbol = new Map(stockList.map((stock) => [stock.symbol, stock.market]));

  const results: StockQuote[] = [];

  await runBatched(
    limitedSymbols,
    TRADINGVIEW_BATCH_SIZE,
    TRADINGVIEW_BATCH_DELAY_MS,
    async (symbol) => {
      const quote = await fetchQuote(normalized, symbol, marketBySymbol.get(symbol));
      if (quote) {
        results.push(quote);
      }
    }
  );

  return results;
}

export async function fetchMarketQuotes(market: string, symbols: string[]): Promise<StockQuote[]> {
  const normalized = market.trim().toUpperCase();
  const uniqueSymbols = Array.from(new Set(symbols.map((symbol) => symbol.trim()))).filter(Boolean);
  const limitedSymbols = uniqueSymbols.slice(0, MAX_SYMBOLS_PER_REQUEST);
  const stockList = loadMarketList(normalized);
  const marketBySymbol = new Map(stockList.map((stock) => [stock.symbol, stock.market]));

  const results: StockQuote[] = [];

  await runBatched(
    limitedSymbols,
    TRADINGVIEW_BATCH_SIZE,
    TRADINGVIEW_BATCH_DELAY_MS,
    async (symbol) => {
      const quote = await fetchQuote(normalized, symbol, marketBySymbol.get(symbol) ?? normalized);
      if (quote) {
        results.push(quote);
      }
    }
  );

  return results;
}

export async function attachSignalsToQuotes(quotes: StockQuote[], market?: string): Promise<StockQuote[]> {
  if (!quotes.length) return quotes;
  const signalResults = await Promise.all(
    quotes.map(async (quote) => ({
      symbol: quote.symbol,
      signal: await getSignalForQuote(quote, market)
    }))
  );
  const signalMap = new Map(signalResults.map((item) => [item.symbol, item.signal]));
  return quotes.map((quote) => ({
    ...quote,
    ...(signalMap.get(quote.symbol) ?? {})
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

  return fs.readdirSync(STOCKS_PUBLIC_DIR)
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

async function fetchQuote(exchange: string, symbol: string, market?: string): Promise<StockQuote | null> {
  const cacheKey = `${exchange}:${symbol}`;
  const cached = quoteCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.quote;
  }

  const rows = await fetchTradingViewRows(symbol, market);
  if (!rows.length) {
    return cached?.quote ?? null;
  }

  const recentRows = rows.slice(-252);
  const last = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : last;
  const price = last.price;
  const changePercent = prev?.price ? ((price - prev.price) / prev.price) * 100 : 0;
  const high52 = Math.max(...recentRows.map((row) => row.price));
  const low52 = Math.min(...recentRows.map((row) => row.price));
  const history = rows.slice(-30).map((row) => row.price);
  const status = statusFromChange(changePercent);

  const summary = buildSummary(symbol, changePercent, status);
  const impact = buildImpact(status, changePercent);

  const quote: StockQuote = {
    symbol,
    price,
    changePercent: Number(changePercent.toFixed(2)),
    status,
    high52: Number.isFinite(high52) ? high52 : price,
    low52: Number.isFinite(low52) ? low52 : price,
    history,
    summary,
    impact,
    cap: "N/A",
    peRatio: undefined
  };

  quoteCache.set(cacheKey, {
    expiresAt: Date.now() + QUOTE_CACHE_TTL_MS,
    quote
  });

  return quote;
}

async function getSignalForQuote(
  quote: StockQuote,
  market?: string
): Promise<Pick<StockQuote, "signalAction" | "signalConfidence" | "signalSource">> {
  const cacheKey = `${(market ?? "GLOBAL").toUpperCase()}:${quote.symbol}`;
  const cached = signalCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.signal;
  }

  const fromModel = await evaluateNodeEcuSignal(quote, market);
  const signal = fromModel ?? deriveHeuristicSignal(quote);

  signalCache.set(cacheKey, {
    expiresAt: Date.now() + SIGNAL_CACHE_TTL_MS,
    signal
  });

  return signal;
}

function deriveHeuristicSignal(
  quote: StockQuote
): Pick<StockQuote, "signalAction" | "signalConfidence" | "signalSource"> {
  const change = quote.changePercent ?? 0;
  const absChange = Math.abs(change);
  const signalAction: TradeSignal = change >= 1.2
    ? "Buy"
    : change <= -1.2
      ? "Sell"
      : "Hold";
  const signalConfidence = clampNumber(20 + absChange * 12, 15, 95);

  return {
    signalAction,
    signalConfidence: Math.round(signalConfidence),
    signalSource: "heuristic"
  };
}

async function evaluateNodeEcuSignal(
  quote: StockQuote,
  market?: string
): Promise<Pick<StockQuote, "signalAction" | "signalConfidence" | "signalSource"> | null> {
  if (!NODE_ECU_API_BASE_URL || NODE_ECU_API_BASE_URL.toLowerCase() === "off") {
    return null;
  }

  const input = buildNodeEcuInput(quote, market);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NODE_ECU_TIMEOUT_MS);

  try {
    const response = await fetch(`${NODE_ECU_API_BASE_URL.replace(/\/$/, "")}/signals/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      core?: { decision?: string | null; evidenceScore?: number };
      action?: { intent?: string };
      pulse?: { confidence?: number };
    };
    const intent = data.action?.intent ?? data.core?.decision ?? null;
    const confidence = typeof data.pulse?.confidence === "number"
      ? data.pulse.confidence
      : typeof data.core?.evidenceScore === "number"
        ? data.core.evidenceScore
        : 0;

    return {
      signalAction: mapIntentToTradeSignal(intent),
      signalConfidence: Math.round(clampNumber(confidence, 0, 100)),
      signalSource: "node-ecu"
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildNodeEcuInput(quote: StockQuote, market?: string) {
  const history = quote.history?.length ? quote.history : [quote.price];
  const previousClose = history.length > 1 ? history[history.length - 2] : quote.price;
  const trendStrength = clampUnit(0.5 + ((history[history.length - 1] - history[0]) / history[0]) / 0.2);
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
      resolvedTradingviewSymbol: market ? `${market}:${quote.symbol}` : quote.symbol
    }
  };
}

function mapIntentToTradeSignal(intent: string | null | undefined): TradeSignal {
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
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
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

async function fetchTradingViewRows(symbol: string, market?: string): Promise<Array<{ date: string; price: number }>> {
  const candidates = market
    ? [`${market}:${symbol}`, symbol]
    : [symbol];

  for (const candidate of candidates) {
    const rows = await fetchTradingViewRowsForSymbol(candidate);
    if (rows.length) {
      return rows;
    }
  }

  return [];
}

async function fetchTradingViewRowsForSymbol(tvSymbol: string): Promise<Array<{ date: string; price: number }>> {
  const url = buildTradingViewUrl(tvSymbol);

  try {
    await scheduleTradingViewRequest();
    const response = await fetch(url, { headers: { Accept: "text/csv, text/plain, */*" } });
    if (!response.ok) {
      return [];
    }

    const csv = await response.text();
    return parseCsvRows(csv);
  } catch {
    return [];
  }
}

async function scheduleTradingViewRequest(): Promise<void> {
  if (!Number.isFinite(TRADINGVIEW_REQUESTS_PER_MINUTE) || TRADINGVIEW_REQUESTS_PER_MINUTE <= 0) {
    return;
  }

  const limit = Math.max(1, Math.floor(TRADINGVIEW_REQUESTS_PER_MINUTE));
  const windowMs = 60 * 1000;

  tradingViewQueue = tradingViewQueue.then(async () => {
    const now = Date.now();
    while (tradingViewRequestTimestamps.length && now - tradingViewRequestTimestamps[0] >= windowMs) {
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
  if (TRADINGVIEW_BASE_URL.includes("symbol=") || TRADINGVIEW_BASE_URL.endsWith("?symbol")) {
    return `${TRADINGVIEW_BASE_URL}${encoded}`;
  }
  if (TRADINGVIEW_BASE_URL.endsWith("/")) {
    return `${TRADINGVIEW_BASE_URL}${encoded}`;
  }
  return `${TRADINGVIEW_BASE_URL}?symbol=${encoded}`;
}

function parseCsvRows(csv: string): Array<{ date: string; price: number }> {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;

  return parsed
    .map((row) => {
      const dateValue = findField(row, ["Date", "date", "Time", "time", "Datetime", "datetime"]);
      const priceValue = findField(row, ["Adj Close", "adj close", "Adj_Close", "adj_close", "Close", "close"]);
      const date = String(dateValue ?? "").trim();
      const price = Number(priceValue);

      if (!date || !Number.isFinite(price) || price <= 0) {
        return null;
      }

      return { date, price };
    })
    .filter((row): row is { date: string; price: number } => Boolean(row));
}

function findField(row: Record<string, string>, candidates: string[]): string | undefined {
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

function buildSummary(symbol: string, changePercent: number, status: StockQuote["status"]): string {
  const direction = changePercent >= 0 ? "up" : "down";
  const magnitude = Math.abs(changePercent).toFixed(2);
  if (status === "Watch") {
    return `${symbol} moved ${direction} ${magnitude}% today — volatility elevated.`;
  }
  return `${symbol} is ${direction} ${magnitude}% today.`;
}

function buildImpact(status: StockQuote["status"], changePercent: number): string {
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
  handler: (item: T) => Promise<void>
): Promise<void> {
  const size = Math.max(1, Math.floor(batchSize));
  const delay = Math.max(0, Math.floor(batchDelayMs));

  for (let index = 0; index < items.length; index += size) {
    const batch = items.slice(index, index + size);
    await Promise.all(batch.map(handler));
    if (delay > 0 && index + size < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
