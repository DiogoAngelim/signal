import { z } from "zod";

export const LUMINA_MARKETS = {
  BTCUSDT: { label: "Bitcoin", currency: "USD", tradingViewSymbol: "BINANCE:BTCUSDT" },
  ETHUSDT: { label: "Ethereum", currency: "USD", tradingViewSymbol: "BINANCE:ETHUSDT" },
  SOLUSDT: { label: "Solana", currency: "USD", tradingViewSymbol: "BINANCE:SOLUSDT" },
  BNBUSDT: { label: "BNB", currency: "USD", tradingViewSymbol: "BINANCE:BNBUSDT" },
} as const;
export type LuminaSymbol = keyof typeof LUMINA_MARKETS;

export function luminaSymbol(value: unknown): LuminaSymbol | null {
  const symbol = String(value ?? "").trim().toUpperCase();
  return Object.hasOwn(LUMINA_MARKETS, symbol) ? symbol as LuminaSymbol : null;
}
const BinanceTicker = z.object({
  symbol: z.string(),
  lastPrice: z.coerce.number().finite().positive(),
  priceChangePercent: z.coerce.number().finite(),
  closeTime: z.coerce.number().int().nonnegative(),
});
type RequestFetch = typeof fetch;

export async function getLuminaMarketQuote(
  symbol: LuminaSymbol,
  fetcher: RequestFetch = fetch,
  now = Date.now(),
) {
  const meta = LUMINA_MARKETS[symbol];
  try {
    const response = await fetcher(
      "https://api.binance.com/api/v3/ticker/24hr?symbol=" + encodeURIComponent(symbol),
      { signal: AbortSignal.timeout(4_000), headers: { accept: "application/json" } },
    );
    if (!response.ok) throw new Error("Provider request failed");
    const result = BinanceTicker.safeParse(await response.json());
    if (!result.success || result.data.symbol !== symbol) throw new Error("Invalid provider payload");
    const receivedAt = new Date(now).toISOString();
    const quoteAt = new Date(result.data.closeTime).toISOString();
    const ageMs = now - result.data.closeTime;
    const fresh = ageMs >= -10_000 && ageMs <= 120_000;
    return {
      symbol, label: meta.label, tradingViewSymbol: meta.tradingViewSymbol,
      currency: meta.currency, price: result.data.lastPrice,
      change24hPercent: result.data.priceChangePercent,
      status: fresh ? "fresh" as const : "stale" as const,
      provider: "Binance Spot public API",
      receivedAt, quoteAt,
      eligibleForLiveCalculations: fresh,
      note: fresh ? "Exchange-reported price; not an investment recommendation." : "Price is stale. Do not use it to make a new financial decision.",
    };
  } catch {
    return {
      symbol, label: meta.label, tradingViewSymbol: meta.tradingViewSymbol,
      currency: meta.currency, price: null, change24hPercent: null,
      status: "unavailable" as const, provider: "Binance Spot public API",
      receivedAt: new Date(now).toISOString(), quoteAt: null,
      eligibleForLiveCalculations: false,
      note: "Current prices cannot be verified. Historical exploration remains available.",
    };
  }
}
