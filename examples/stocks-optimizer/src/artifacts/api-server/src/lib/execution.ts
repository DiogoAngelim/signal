/**
 * Execution Layer — Order Assessment
 *
 * This layer assesses execution conditions for position decisions.
 * It consumes PositionDecisions and outputs ExecutionAssessments.
 *
 * Execution ONLY assesses:
 *   - Spread conditions (bid/ask)
 *   - Liquidity assessment (can the order be filled?)
 *   - Execution feasibility (is the market open/available?)
 *
 * Execution does NOT:
 *   - Make portfolio decisions (that's Portfolio & Risk)
 *   - Generate signals (that's Alpha)
 *   - Produce market commentary (that's Monitoring)
 *
 * Output type: ExecutionAssessment
 *
 * Flow: PositionDecision + MarketQuote → Execution → ExecutionAssessment
 */
import type { ExecutionAssessment, PositionDecision, StockQuote } from "./types";

import { estimateSpread } from "./stock-data";

/**
 * Assesses execution conditions for a position decision.
 * This is the Execution layer's main entry point.
 *
 * It evaluates whether a position can be executed given current
 * market conditions, and provides the execution assessment.
 */
export function assessExecution(
  position: PositionDecision,
  quote: StockQuote,
): ExecutionAssessment {
  const spread = estimateSpread(quote.price, quote.history);
  const changePercent = quote.changePercent ?? 0;
  const absChange = Math.abs(changePercent);

  // Execution feasibility: can this position be filled?
  const feasible = position.riskConstraints.allowed
    && position.positionSize > 0
    && Number.isFinite(quote.price)
    && quote.price > 0;

  // Liquidity assessment based on spread width
  const midPrice = quote.price;
  const halfSpread = (spread.ask - spread.bid) / 2;
  const spreadBps = midPrice > 0 ? (halfSpread / midPrice) * 10_000 : 0;
  const liquidity = spreadBps < 5 ? "GOOD" : spreadBps < 20 ? "MODERATE" : "POOR";

  // Build summary (execution-focused, not market commentary)
  const summary = feasible
    ? buildExecutionSummary(position, spreadBps, liquidity)
    : `Execution not feasible: ${position.riskConstraints.reason ?? "position not allowed"}`;

  // Build impact (execution-focused)
  const impact = buildExecutionImpact(position, feasible, liquidity);

  return {
    symbol: position.symbol,
    summary,
    impact,
    spread: { bid: spread.bid, ask: spread.ask },
  };
}

/**
 * Builds an execution-focused summary.
 * This describes execution conditions, not market commentary.
 */
function buildExecutionSummary(
  position: PositionDecision,
  spreadBps: number,
  liquidity: string,
): string {
  const direction = position.direction === "Buy" ? "BUY" : position.direction === "Sell" ? "SELL" : "HOLD";
  const size = position.targetNotional > 0
    ? `$${position.targetNotional.toLocaleString()}`
    : "no size";

  return `${direction} ${position.symbol}: ${size}, spread ${spreadBps.toFixed(1)}bps, liquidity ${liquidity}`;
}

/**
 * Builds an execution-focused impact assessment.
 * This describes execution risk, not market outlook.
 */
function buildExecutionImpact(
  position: PositionDecision,
  feasible: boolean,
  liquidity: string,
): string {
  if (!feasible) {
    return "Position cannot be executed under current constraints.";
  }
  if (liquidity === "POOR") {
    return "Wide spread — consider limit order or delay execution.";
  }
  if (liquidity === "MODERATE") {
    return "Moderate liquidity — use limit orders for larger sizes.";
  }
  return "Good liquidity — market order execution feasible.";
}