/**
 * Minimal Monitoring — Logs Only
 *
 * Implements only:
 * - PnL tracking (basic)
 * - Execution logs
 * - Slippage tracking
 * - Signal → Outcome logging
 *
 * FORBIDDEN:
 * - dashboards
 * - analytics engines
 * - replay systems
 * - DAG tracing systems
 */

import type { ExecutionLog, PnlRecord, SignalOutcomeLog } from "./types";

/**
 * In-memory monitoring store for the current process.
 * This is intentionally minimal — just logs and basic tracking.
 */
export class MonitoringStore {
  private signalOutcomes: SignalOutcomeLog[] = [];
  private executionLogs: ExecutionLog[] = [];
  private pnlRecords: PnlRecord[] = [];
  private maxRecords: number;

  constructor(maxRecords = 10_000) {
    this.maxRecords = maxRecords;
  }

  // ── Signal → Outcome Logging ──────────────────────────────────────

  recordSignalOutcome(log: SignalOutcomeLog): void {
    this.signalOutcomes.push(log);
    if (this.signalOutcomes.length > this.maxRecords) {
      this.signalOutcomes = this.signalOutcomes.slice(-this.maxRecords);
    }
    console.info("[monitoring] signal→outcome", {
      asset: log.signalAsset,
      direction: log.signalDirection,
      positionSize: log.positionSize,
      reasons: log.reasons.slice(0, 3),
    });
  }

  getSignalOutcomes(limit = 100): SignalOutcomeLog[] {
    return this.signalOutcomes.slice(-limit);
  }

  // ── Execution Logging ─────────────────────────────────────────────

  recordExecution(log: ExecutionLog): void {
    this.executionLogs.push(log);
    if (this.executionLogs.length > this.maxRecords) {
      this.executionLogs = this.executionLogs.slice(-this.maxRecords);
    }
    console.info("[monitoring] execution", {
      asset: log.positionAsset,
      direction: log.positionDirection,
      orderId: log.orderId,
      status: log.status,
      slippageBps: log.slippageBps,
    });
  }

  getExecutionLogs(limit = 100): ExecutionLog[] {
    return this.executionLogs.slice(-limit);
  }

  // ── PnL Tracking ─────────────────────────────────────────────────

  recordPnl(record: PnlRecord): void {
    this.pnlRecords.push(record);
    if (this.pnlRecords.length > this.maxRecords) {
      this.pnlRecords = this.pnlRecords.slice(-this.maxRecords);
    }
  }

  getPnlRecords(limit = 100): PnlRecord[] {
    return this.pnlRecords.slice(-limit);
  }

  // ── Slippage Tracking ─────────────────────────────────────────────

  getSlippageStats(): {
    avgSlippageBps: number;
    maxSlippageBps: number;
    count: number;
  } {
    const withSlippage = this.executionLogs.filter(
      (log) => log.slippageBps != null,
    );
    if (!withSlippage.length) {
      return { avgSlippageBps: 0, maxSlippageBps: 0, count: 0 };
    }
    const slippages = withSlippage.map((log) => log.slippageBps!);
    return {
      avgSlippageBps:
        slippages.reduce((sum, s) => sum + s, 0) / slippages.length,
      maxSlippageBps: Math.max(...slippages),
      count: slippages.length,
    };
  }

  // ── Summary ───────────────────────────────────────────────────────

  getSummary(): {
    signalOutcomeCount: number;
    executionLogCount: number;
    pnlRecordCount: number;
    slippageStats: ReturnType<MonitoringStore["getSlippageStats"]>;
  } {
    return {
      signalOutcomeCount: this.signalOutcomes.length,
      executionLogCount: this.executionLogs.length,
      pnlRecordCount: this.pnlRecords.length,
      slippageStats: this.getSlippageStats(),
    };
  }
}

/** Singleton monitoring store for the process */
export const monitoringStore = new MonitoringStore();
