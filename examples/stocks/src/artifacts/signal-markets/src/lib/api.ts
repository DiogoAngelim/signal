export type StockStatus = "Stable" | "Rising" | "Watch" | "Dip";
export type TradeSignal = "Buy" | "Hold" | "Sell";

export interface MarketOption {
  code: string;
  label: string;
  count: number;
}

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
  status: StockStatus;
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
}

export type StockData = StockListItem & {
  ticker: string;
  price?: number;
  changePercent?: number;
  status?: StockStatus;
  high52?: number;
  low52?: number;
  history?: number[];
  summary?: string;
  impact?: string;
  cap?: string;
  peRatio?: number;
  signalAction?: TradeSignal;
  signalConfidence?: number;
  signalSource?: "node-ecu" | "heuristic";
  signalEmittedAt?: string;
  signalEntryPrice?: number;
  signalReturnPercent?: number;
};

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_RETRY_COUNT = 1;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export class ApiRequestError extends Error {
  status?: number;
  retryable: boolean;
  timedOut: boolean;

  constructor(
    message: string,
    options?: { status?: number; retryable?: boolean; timedOut?: boolean }
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options?.status;
    this.retryable = options?.retryable ?? false;
    this.timedOut = options?.timedOut ?? false;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(
  path: string,
  options?: RequestInit & { timeoutMs?: number; retryCount?: number }
): Promise<T> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, retryCount = DEFAULT_RETRY_COUNT, ...fetchOptions } = options ?? {};

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const externalSignal = fetchOptions.signal;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abortListener = () => controller.abort();

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", abortListener, { once: true });
      }
    }

    try {
      const response = await fetch(`${apiBase}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...fetchOptions,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new ApiRequestError(`Request failed: ${response.status}`, {
          status: response.status,
          retryable: RETRYABLE_STATUSES.has(response.status)
        });
      }

      const body = (await response.json()) as { data: T };
      return body.data;
    } catch (error) {
      const normalized = error instanceof ApiRequestError
        ? error
        : timedOut
          ? new ApiRequestError("Request timed out", { retryable: true, timedOut: true })
          : new ApiRequestError(
            error instanceof Error ? error.message : "Request failed",
            { retryable: true }
          );

      if (attempt < retryCount && normalized.retryable) {
        await delay(500 * (attempt + 1));
        continue;
      }

      throw normalized;
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", abortListener);
      }
    }
  }

  throw new ApiRequestError("Request failed", { retryable: false });
}

export async function fetchMarkets(): Promise<MarketOption[]> {
  return request<MarketOption[]>("/stocks/markets");
}

export async function fetchStockList(
  market: string,
  offset = 0,
  limit = 24
): Promise<{ market: string; total: number; items: StockListItem[] }> {
  const params = new URLSearchParams({
    market,
    offset: String(offset),
    limit: String(limit)
  });
  return request<{ market: string; total: number; items: StockListItem[] }>(`/stocks/list?${params}`);
}

export async function fetchStockQuotes(
  market: string,
  symbols: string[],
  options?: { withSignals?: boolean }
): Promise<StockQuote[]> {
  if (!symbols.length) {
    return [];
  }

  const payload = { market, symbols, withSignals: options?.withSignals ?? false };
  const response = await request<{ market: string; quotes: StockQuote[] }>("/stocks/quotes", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return response.quotes;
}
