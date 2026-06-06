import type { BinanceExchangeInfo, BinanceSymbolInfo } from "./types";

export class ExchangeInfoCache {
  private value: BinanceExchangeInfo | null = null;
  private loadedAt = 0;

  constructor(private readonly ttlMs: number) {}

  get fresh() {
    return this.value && Date.now() - this.loadedAt < this.ttlMs;
  }

  get() {
    return this.value;
  }

  set(value: BinanceExchangeInfo) {
    this.value = value;
    this.loadedAt = Date.now();
  }

  symbol(symbol: string): BinanceSymbolInfo | null {
    const normalized = symbol.toUpperCase();
    return this.value?.symbols.find((entry) => entry.symbol.toUpperCase() === normalized) ?? null;
  }

  clear() {
    this.value = null;
    this.loadedAt = 0;
  }
}
