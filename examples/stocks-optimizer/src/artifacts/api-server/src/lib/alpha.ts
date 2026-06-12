/**
 * Alpha Layer — Signal Generation
 *
 * This layer generates trading opportunities from market data.
 * It does NOT control money — it only identifies opportunities.
 *
 * Output type: SignalOpportunity
 *
 * Flow: MarketQuote → Alpha → SignalOpportunity
 */
import type {
  AdaptiveRegime,
  SignalDecision,
  SignalOpportunity,
  StockQuote,
} from "./types";

// ─── Alpha-specific helpers ──────────────────────────────────────

/**
 * Derives the market regime from a quote.
 * Regime is alpha context — it describes the market environment
 * in which the signal was generated.
 */
export function deriveRegime(quote: StockQuote): AdaptiveRegime {
  const change = Number(quote.changePercent ?? 0);
  const absChange = Math.abs(change);
  const history = quote.history ?? [];
  const returns = history.length >= 2
    ? history.slice(1).map((p, i) => (p - history[i]) / history[i]).filter(Number.isFinite)
    : [];
  const volatility = returns.length >= 2
    ? Math.sqrt(returns.reduce((s, r) => s + (r - returns.reduce((a, b) => a + b, 0) / returns.length) ** 2, 0) / (returns.length - 1)) * 100
    : 0;
  const range =
    quote.high52 && quote.low52 && quote.price
      ? ((quote.high52 - quote.low52) / Math.max(quote.price, 0.0001)) * 100
      : 0;

  if (absChange >= 8 || (quote.status === "Watch" && change < -3))
    return "PANIC";
  if (quote.status === "Watch" || volatility >= 2.5) return "HIGH_VOL";
  if (
    quote.signalAction === "Buy" &&
    quote.status === "Rising" &&
    absChange >= 1.2
  )
    return "BREAKOUT";
  if (quote.signalAction === "Buy" && change > 0) return "TRENDING";
  if (quote.signalAction === "Sell" || quote.status === "Dip")
    return "MEAN_REVERTING";
  if (volatility <= 0.35 && range <= 12) return "COMPRESSION";
  return "LOW_VOL";
}

/**
 * Converts a SignalDecision into a SignalOpportunity.
 * This is the alpha layer's output — a pure opportunity,
 * not yet subject to portfolio governance.
 */
export function toSignalOpportunity(
  quote: StockQuote,
  signal: SignalDecision,
): SignalOpportunity {
  return {
    symbol: quote.symbol,
    action: signal.signalAction,
    confidence: signal.signalConfidence,
    source: signal.signalSource,
    regime: deriveRegime(quote),
    emittedAt: new Date().toISOString(),
    entryPrice: quote.price,
  };
}