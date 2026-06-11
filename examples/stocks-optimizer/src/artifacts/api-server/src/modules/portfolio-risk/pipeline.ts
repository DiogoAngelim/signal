/**
 * Trading Pipeline — Orchestrates the 4-layer architecture
 *
 * System Flow:
 *   Market Data → Signal Engine (BLACK BOX) → Portfolio & Risk Engine → Execution Engine → Exchange
 *
 * This module wires the layers together without introducing any intelligence.
 * It is pure orchestration: validate signals, evaluate risk, execute positions.
 */

import { adaptStrategySignals } from "./signal-adapter";
import { evaluatePortfolioRisk } from "./engine";
import { monitoringStore } from "./monitoring";
import type {
  ValidatedSignal,
  PortfolioRiskConfig,
  PortfolioRiskResult,
  Position,
} from "./types";
import type { BinanceExecutionModule } from "../binance-execution/index";
import type { ExecutionResult } from "../binance-execution/types";

// ── Pipeline Input ──────────────────────────────────────────────────

export type TradingPipelineInput = {
  /** Raw signals from the signal engine (BLACK BOX output) */
  rawSignals: Record<string, unknown>[];
  /** Total account equity */
  equity: number;
  /** Available equity for new positions */
  availableEquity: number;
  /** Current exposure by asset (asset → notional amount) */
  currentExposureByAsset?: Record<string, number>;
  /** Total current portfolio exposure */
  totalCurrentExposure?: number;
  /** Last trade timestamp by asset (for cooldown) */
  lastTradeTimestampByAsset?: Record<string, number>;
  /** Current time in ms (defaults to Date.now()) */
  nowMs?: number;
  /** Optional config overrides */
  config?: Partial<PortfolioRiskConfig>;
};

// ── Pipeline Output ────────────────────────────────────────────────

export type TradingPipelineResult = {
  /** Signals that were validated and processed */
  validatedSignals: ValidatedSignal[];
  /** Portfolio & Risk evaluation result */
  riskResult: PortfolioRiskResult;
  /** Execution results (only if executionModule was provided) */
  executionResults?: ExecutionResult[];
  /** Positions that were sent to execution */
  positions: Position[];
};

// ── Pipeline ───────────────────────────────────────────────────────

/**
 * Run the full trading pipeline:
 *   1. Validate signals (schema only, no logic changes)
 *   2. Evaluate portfolio risk (Signal → Position)
 *   3. Execute positions (Position → Order → Exchange) [optional]
 *
 * This is the main entry point for the 4-layer architecture.
 */
export async function runTradingPipeline(
  input: TradingPipelineInput,
  executionModule?: BinanceExecutionModule,
): Promise<TradingPipelineResult> {
  // ── Layer 1: Signal Adapter (validation only) ────────────────────
  const validatedSignals = adaptStrategySignals(input.rawSignals);

  // ── Layer 2: Portfolio & Risk Engine (Signal → Position) ─────────
  const riskResult = evaluatePortfolioRisk({
    signals: validatedSignals,
    equity: input.equity,
    availableEquity: input.availableEquity,
    currentExposureByAsset: input.currentExposureByAsset ?? {},
    totalCurrentExposure: input.totalCurrentExposure ?? 0,
    lastTradeTimestampByAsset: input.lastTradeTimestampByAsset ?? {},
    nowMs: input.nowMs ?? Date.now(),
    config: input.config,
  });

  // ── Log signal outcomes ──────────────────────────────────────────
  for (const positionDecision of riskResult.positions) {
    monitoringStore.recordSignalOutcome({
      signalAsset: positionDecision.signal.asset,
      signalDirection: positionDecision.signal.direction,
      signalConfidence: positionDecision.signal.confidence,
      signalStrength: positionDecision.signal.strength,
      signalTimestamp: positionDecision.signal.timestamp,
      positionSize: positionDecision.position.size,
      positionDirection: positionDecision.position.direction,
      evaluatedAt: new Date().toISOString(),
      reasons: positionDecision.reasons,
    });
  }

  for (const rejected of riskResult.rejected) {
    monitoringStore.recordSignalOutcome({
      signalAsset: rejected.signal.asset,
      signalDirection: rejected.signal.direction,
      signalConfidence: rejected.signal.confidence,
      signalStrength: rejected.signal.strength,
      signalTimestamp: rejected.signal.timestamp,
      positionSize: 0,
      positionDirection: "long", // default for rejected
      evaluatedAt: new Date().toISOString(),
      reasons: rejected.reasons,
    });
  }

  // ── Layer 3: Execution Engine (Position → Order → Exchange) ─────
  let executionResults: ExecutionResult[] | undefined;
  const positions = riskResult.positions.map((pd) => pd.position);

  if (executionModule && positions.length > 0) {
    executionResults = await executionModule.executePositions(positions);
  }

  return {
    validatedSignals,
    riskResult,
    executionResults,
    positions,
  };
}