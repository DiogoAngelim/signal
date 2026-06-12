/**
 * Pipeline Orchestration — Layer Composition
 *
 * This is the ONLY place where all layers are composed.
 * Each layer is independently callable.
 *
 * Pipeline flow:
 *   Market Data → Alpha → Portfolio & Risk → Execution → Monitoring
 *
 * The pipeline assembles layer outputs into a backward-compatible
 * `StockQuote` for the frontend.
 */
import type {
  DiagnosticsSnapshot,
  ExecutionAssessment,
  PortfolioConfig,
  PositionDecision,
  SignalOpportunity,
  StockQuote,
} from "./types";

import { toSignalOpportunity } from "./alpha";
import { assessExecution } from "./execution";
import { computeDiagnostics } from "./monitoring";
import { DEFAULT_PORTFOLIO_CONFIG, evaluatePosition } from "./portfolio-risk";

// ─── Re-export public API functions for backward compatibility ───
export { attachSignalsToQuotes, fetchMarketQuotes, fetchQuotes } from "./stock-data";
export { DEFAULT_PORTFOLIO_CONFIG } from "./portfolio-risk";

/**
 * Runs the full pipeline on a single quote.
 *
 * This is the canonical pipeline flow:
 *   1. Market Data — quote already fetched
 *   2. Alpha — signal already attached via attachSignalsToQuotes
 *   3. Portfolio & Risk — position sizing, exposure control, risk constraints
 *   4. Execution — execution assessment
 *   5. Monitoring — diagnostic snapshot
 *
 * @param quote Raw market data quote
 * @param governedSignal Signal decision from governance
 * @param config Portfolio configuration (defaults to conservative institutional)
 * @param currentExposurePct Current portfolio exposure (0-1+)
 */
export function runPipeline(
  quote: StockQuote,
  governedSignal: {
    direction: typeof quote.signalAction;
    confidence: number;
    allocationMultiplier: number;
    canOpenNewTrades: boolean;
    modelId: string;
    modelLifecycleState: string;
    modelLifecycleAction: string;
  },
  config: PortfolioConfig = DEFAULT_PORTFOLIO_CONFIG,
  currentExposurePct: number = 0,
): {
  opportunity: SignalOpportunity;
  position: PositionDecision;
  assessment: ExecutionAssessment;
  diagnostics: DiagnosticsSnapshot;
  enrichedQuote: StockQuote;
} {
  // Layer 2: Alpha — extract signal opportunity from quote
  const signal: SignalDecision = {
    signalAction: governedSignal.direction ?? "Hold",
    signalConfidence: governedSignal.confidence ?? 50,
    signalSource: quote.signalSource ?? "heuristic",
  };
  const opportunity = toSignalOpportunity(quote, signal);

  // Layer 3: Portfolio & Risk — position sizing, exposure, risk constraints
  const position = evaluatePosition(
    opportunity,
    quote,
    governedSignal as Parameters<typeof evaluatePosition>[2],
    config,
    currentExposurePct,
  );

  // Layer 4: Execution — assess execution conditions
  const assessment = assessExecution(position, quote);

  // Layer 5: Monitoring — observe all layers
  const diagnostics = computeDiagnostics(quote, opportunity, position, assessment);

  // Assemble into backward-compatible StockQuote
  const enrichedQuote = enrichQuoteWithPipeline(
    quote,
    opportunity,
    position,
    assessment,
    diagnostics,
  );

  return { opportunity, position, assessment, diagnostics, enrichedQuote };
}

/**
 * Enriches a single quote through the full pipeline.
 *
 * This function maps layer outputs to the backward-compatible
 * `StockQuote` format for the frontend.
 */
export function enrichQuoteWithPipeline(
  quote: StockQuote,
  opportunity: SignalOpportunity,
  position: PositionDecision,
  assessment: ExecutionAssessment,
  diagnostics: DiagnosticsSnapshot,
): StockQuote {
  return {
    ...quote,
    // Alpha layer output
    signalAction: opportunity.action,
    signalConfidence: opportunity.confidence,
    signalSource: opportunity.source,
    signalEmittedAt: opportunity.emittedAt,
    signalEntryPrice: opportunity.entryPrice,
    regime: opportunity.regime,
    // Portfolio & Risk layer output
    modelId: position.modelId,
    modelLifecycleState: position.modelLifecycleState,
    modelLifecycleAction: position.modelLifecycleAction,
    modelCanOpenNewTrades: position.canOpenNewTrades,
    modelAllocationMultiplier: position.allocationMultiplier,
    lifecycleState: position.lifecycleState,
    liveMetrics: position.liveMetrics,
    // Execution layer output
    summary: assessment.summary,
    impact: assessment.impact,
    bid: assessment.spread.bid,
    ask: assessment.spread.ask,
    // Monitoring layer output
    confidence: position.confidence,
    uncertainty: diagnostics.uncertainty,
    driftScore: diagnostics.driftScore,
    stabilityScore: diagnostics.stabilityScore,
    expectedMovePct: diagnostics.expectedMovePct,
    featureConsensus: diagnostics.featureConsensus,
    ensembleAgreement: diagnostics.ensembleAgreement,
    diagnostics: {
      entropy: diagnostics.entropy,
      featureDrift: diagnostics.featureDrift,
      predictionResidual: diagnostics.predictionResidual,
      volatilityShift: diagnostics.volatilityShift,
    },
  };
}

// Internal type for signal decision (used in runPipeline)
type SignalDecision = {
  signalAction: "Buy" | "Hold" | "Sell";
  signalConfidence: number;
  signalSource: "node-ecu" | "heuristic";
};