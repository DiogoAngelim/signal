import type { BinanceOpenOrder, BinanceTrade } from "./types";

export type DryRunSimulation =
  | "fill"
  | "partial_fill"
  | "reject"
  | "cancel";

export class DryRunSimulator {
  private sequence = 1;

  constructor(
    private readonly options: {
      simulation?: DryRunSimulation;
      priceBySymbol?: Record<string, number>;
      now?: () => Date;
    } = {},
  ) {}

  referencePrice(symbol: string, fallback = 1) {
    const value = this.options.priceBySymbol?.[symbol.toUpperCase()];
    return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
  }

  placeOrder(order: {
    symbol: string;
    clientOrderId: string;
    price?: number;
    quantity: number;
    side: "BUY" | "SELL";
    type: string;
  }): BinanceOpenOrder {
    const mode = this.options.simulation ?? "fill";
    const executedQty = mode === "partial_fill" ? order.quantity / 2 : mode === "reject" ? 0 : order.quantity;
    const status = mode === "partial_fill" ? "PARTIALLY_FILLED" : mode === "reject" ? "REJECTED" : mode === "cancel" ? "CANCELED" : "FILLED";
    const now = this.options.now?.() ?? new Date();

    return {
      symbol: order.symbol,
      orderId: this.sequence++,
      clientOrderId: order.clientOrderId,
      price: String(order.price ?? this.referencePrice(order.symbol)),
      origQty: String(order.quantity),
      executedQty: String(executedQty),
      status,
      side: order.side,
      type: order.type as BinanceOpenOrder["type"],
      time: now.getTime(),
    };
  }

  tradeFor(order: BinanceOpenOrder): BinanceTrade {
    return {
      id: Number(order.orderId),
      orderId: Number(order.orderId),
      price: order.price,
      qty: order.executedQty,
      quoteQty: String(Number(order.executedQty) * Number(order.price)),
      commission: "0",
      commissionAsset: "USDT",
      time: order.time ?? Date.now(),
      isBuyer: order.side === "BUY",
    };
  }
}

export function quoteAssetForSymbol(symbol: string) {
  const normalized = symbol.toUpperCase();
  for (const quote of ["USDT", "USDC", "FDUSD", "BUSD", "BTC", "ETH"]) {
    if (normalized.endsWith(quote)) return quote;
  }
  return "USDT";
}

export function baseAssetForSymbol(symbol: string) {
  const quote = quoteAssetForSymbol(symbol);
  return symbol.toUpperCase().slice(0, -quote.length);
}
