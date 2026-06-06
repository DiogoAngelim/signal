import { BinanceApiError, BinanceRateLimitError } from "./errors";
import { RateLimiter } from "./rate-limit";
import { canonicalQuery, signedQuery } from "./signer";
import type {
  BinanceAccountSnapshot,
  BinanceClientResponse,
  BinanceExecutionConfig,
  BinanceExchangeInfo,
  BinanceOpenOrder,
  BinanceTrade,
  NormalizedOrderRequest,
} from "./types";

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  signed?: boolean;
  params?: Record<string, string | number | boolean | undefined | null>;
};

export class BinanceHttpClient {
  private timeOffsetMs = 0;

  constructor(
    private readonly config: BinanceExecutionConfig,
    private readonly rateLimiter: RateLimiter,
  ) {}

  get baseUrl() {
    return this.config.mode === "testnet" ? this.config.testnetBaseUrl : this.config.baseUrl;
  }

  async syncTime() {
    const response = await this.request<{ serverTime: number }>("/api/v3/time", { signed: false });
    this.timeOffsetMs = Number(response.data.serverTime) - Date.now();
    return response.data;
  }

  async account() {
    return this.signedData<BinanceAccountSnapshot>("/api/v3/account");
  }

  async openOrders(symbol?: string) {
    return this.signedData<BinanceOpenOrder[]>("/api/v3/openOrders", {
      symbol,
    });
  }

  async order(params: { symbol: string; orderId?: number | string; origClientOrderId?: string }) {
    return this.signedData<BinanceOpenOrder>("/api/v3/order", params);
  }

  async myTrades(params: { symbol: string; limit?: number }) {
    return this.signedData<BinanceTrade[]>("/api/v3/myTrades", params);
  }

  async exchangeInfo(symbol?: string) {
    return this.request<BinanceExchangeInfo>("/api/v3/exchangeInfo", {
      params: { symbol },
    }).then((response) => response.data);
  }

  async createOrder(order: NormalizedOrderRequest) {
    const params: Record<string, string | number | undefined> = {
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      quantity: order.quantity,
      newClientOrderId: order.clientOrderId,
    };

    if (order.price != null) params.price = order.price;
    if (order.timeInForce) params.timeInForce = order.timeInForce;
    if (order.quoteOrderQty != null) params.quoteOrderQty = order.quoteOrderQty;

    return this.signedData<BinanceOpenOrder>("/api/v3/order", params, "POST");
  }

  async cancelOrder(input: { symbol: string; orderId?: string | number; origClientOrderId?: string }) {
    return this.signedData<BinanceOpenOrder>("/api/v3/order", input, "DELETE");
  }

  async cancelAll(symbol?: string) {
    return this.signedData<BinanceOpenOrder[]>("/api/v3/openOrders", { symbol }, "DELETE");
  }

  private async signedData<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined | null> = {},
    method: "GET" | "POST" | "DELETE" = "GET",
  ) {
    return this.request<T>(path, { signed: true, params, method }).then((response) => response.data);
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<BinanceClientResponse<T>> {
    return this.rateLimiter.schedule(async () => {
      const url = new URL(path, this.baseUrl);
      const headers: Record<string, string> = {};
      let query = "";

      if (options.signed) {
        if (!this.config.apiKey || !this.config.apiSecret) {
          throw new BinanceApiError(401, "Binance API credentials are required for signed requests");
        }
        headers["X-MBX-APIKEY"] = this.config.apiKey;
        query = signedQuery(
          {
            ...(options.params ?? {}),
            timestamp: Date.now() + this.timeOffsetMs,
            recvWindow: this.config.recvWindow,
          },
          this.config.apiSecret,
        );
      } else {
        query = canonicalQuery(options.params ?? {});
      }

      if (query) url.search = query;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
      let response: Response;
      try {
        response = await this.config.fetch(url, {
          method: options.method ?? "GET",
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const data = await parseResponse(response);
      if (response.status === 418) {
        throw new BinanceRateLimitError("Binance IP ban protection activated", {
          banned: true,
          retryAfterMs: retryAfterMs(response.headers),
        });
      }

      if (response.status === 429) {
        throw new BinanceRateLimitError("Binance rate limit exceeded", {
          retryAfterMs: retryAfterMs(response.headers),
        });
      }

      if (!response.ok) {
        throw new BinanceApiError(response.status, apiErrorMessage(data, response.status), data);
      }

      return {
        status: response.status,
        data: data as T,
        headers: response.headers,
      };
    });
  }
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function apiErrorMessage(data: unknown, status: number) {
  if (data && typeof data === "object") {
    const message = (data as { msg?: string; message?: string }).msg ?? (data as { message?: string }).message;
    if (message) return message;
  }
  return `Binance API request failed with HTTP ${status}`;
}

function retryAfterMs(headers: Headers) {
  const value = headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : undefined;
}
