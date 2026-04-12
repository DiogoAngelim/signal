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
};

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const body = (await response.json()) as { data: T };
  return body.data;
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
