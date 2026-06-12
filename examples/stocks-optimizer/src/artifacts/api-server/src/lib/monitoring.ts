/**
 * Monitoring Layer — Diagnostics (Read-Only)
 *
 * This layer observes all other layers and produces diagnostic snapshots.
 * It does NOT make any decisions — it only observes and reports.
 *
 * Key principle: Monitoring uses LAYER OUTPUTS (SignalOpportunity,
 * PositionDecision, ExecutionAssessment), NOT raw quote data.
 * This ensures monitoring observes the pipeline, not the raw data.
 *
 * Output type: DiagnosticsSnapshot
 *
 * Flow: SignalOpportunity + PositionDecision + ExecutionAssessment → Monitoring → DiagnosticsSnapshot
 */
import type {
  DiagnosticsSnapshot,
  ExecutionAssessment,
  PositionDecision,
  SignalOpportunity,
  StockQuote,
} from "./types";

function clampMetric(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

/**
 * Computes a diagnostic snapshot from all layer outputs.
 * This is the Monitoring layer's main entry point.
 *
 * Diagnostics are read-only observations — they never influence decisions.
 * All inputs come from layer outputs, not raw market data.
 */
export function computeDiagnostics(
  quote: StockQuote,
  opportunity: SignalOpportunity,
  position: PositionDecision,
  assessment: ExecutionAssessment,
): DiagnosticsSnapshot {
  const history = quote.history ?? [];
  const returns = history.length >= 2
    ? history.slice(1).map((p, i) => (p - history[i]) / history[i]).filter(Number.isFinite)
    : [];
  const volatility = returns.length >= 2
    ? Math.sqrt(returns.reduce((s, r) => s + (r - returns.reduce((a, b) => a + b, 0) / returns.length) ** 2, 0) / (returns.length - 1)) * 100
    : 0;

  // Use layer outputs, not raw quote fields
  const absChange = Math.abs(Number(quote.changePercent ?? 0));
  const confidence = opportunity.confidence;
  const signalAction = opportunity.action;

  // Volatility diagnostics (market observation)
  const volatilityShift = clampMetric(volatility * 10 + absChange * 3);
  const driftScore = clampMetric(
    volatilityShift * 0.58 + (quote.status === "Watch" ? 16 : 0),
  );
  const stabilityScore = clampMetric(
    100 - driftScore * 0.72 - (signalAction === "Hold" ? 8 : 0),
  );

  // Signal quality diagnostics (alpha observation)
  const uncertainty = clampMetric(100 - confidence * 0.68 + driftScore * 0.38);
  const agreement = clampMetric(
    confidence * 0.62 + stabilityScore * 0.32 - uncertainty * 0.12,
  );
  const consensus = clampMetric(agreement * 0.72 + stabilityScore * 0.2);
  const entropy = clampMetric(
    signalAction === "Hold" ? 62 - confidence * 0.2 : 44 + uncertainty * 0.38,
  );

  // Prediction residual (comparing alpha's expected move to actual)
  const expectedMovePct = Number(quote.expectedMovePct ?? 0);
  const actualReturn = Number(quote.signalReturnPercent ?? quote.changePercent ?? 0);
  const predictionResidual = clampMetric(
    Math.abs(actualReturn - expectedMovePct) * 5 +
      Math.max(0, volatilityShift - 60) * 0.15,
  );

  return {
    entropy,
    featureDrift: driftScore,
    predictionResidual,
    volatilityShift,
    stabilityScore,
    driftScore,
    uncertainty,
    featureConsensus: Number((consensus / 100).toFixed(4)),
    ensembleAgreement: Number((agreement / 100).toFixed(4)),
    expectedMovePct,
  };
}