/**
 * Portfolio & Risk Layer — Public API
 *
 * This is the SINGLE authoritative module where financial decisions exist.
 *
 * System Flow:
 *   Market Data → Signal Engine (BLACK BOX) → Portfolio & Risk Engine → Execution Engine → Exchange
 *
 * Signal ≠ Decision ≠ Execution
 * Risk is the single source of financial truth.
 */

// Types
export type {
  Signal,
  ValidatedSignal,
  SignalDirection,
  SignalHorizon,
  Position,
  PositionDirection,
  PortfolioRiskConfig,
  PortfolioRiskInput,
  PortfolioRiskResult,
  PositionDecision,
  RejectedSignal,
  SignalOutcomeLog,
  ExecutionLog,
  PnlRecord,
} from "./types";

export { DEFAULT_PORTFOLIO_RISK_CONFIG } from "./types";

// Signal Adapter (validation only — no logic changes)
export {
  validateSignal,
  validateSignals,
  adaptStrategySignal,
  adaptStrategySignals,
} from "./signal-adapter";

// Portfolio & Risk Engine (THE CORE)
export { evaluatePortfolioRisk } from "./engine";

// Monitoring (minimal — logs only)
export { MonitoringStore, monitoringStore } from "./monitoring";

// Pipeline (orchestration — no intelligence)
export { runTradingPipeline } from "./pipeline";
export type { TradingPipelineInput, TradingPipelineResult } from "./pipeline";
