import { clamp, mean, stdev } from "../math/statistics";
import type { RegimeName, SignalOutcome, SignalRecord, ValidationState } from "../types";

export class SignalJournal {
  private readonly signals = new Map<string, SignalRecord>();
  private readonly outcomes: SignalOutcome[] = [];

  record(signal: SignalRecord) {
    if (this.signals.has(signal.id)) return;
    this.signals.set(signal.id, structuredClone(signal));
  }

  evaluate(outcome: SignalOutcome) {
    const signal = this.signals.get(outcome.signalId);
    if (!signal || outcome.evaluatedAt < signal.timestamp) return;
    this.outcomes.push(structuredClone(outcome));
  }

  snapshot(): ValidationState {
    const evaluated = this.outcomes
      .map((outcome) => ({ outcome, signal: this.signals.get(outcome.signalId) }))
      .filter((entry): entry is { outcome: SignalOutcome; signal: SignalRecord } => Boolean(entry.signal));
    const returns = evaluated.map(({ outcome, signal }) => directionalReturn(signal, outcome));
    const losses = returns.filter((value) => value < 0);
    const wins = evaluated.filter(({ outcome, signal }) => outcome.realizedDirection === signal.expectedDirection).length;
    const byRegime = new Map<RegimeName, { wins: number; total: number }>();

    for (const entry of evaluated) {
      const bucket = byRegime.get(entry.signal.regime) ?? { wins: 0, total: 0 };
      bucket.total += 1;
      if (entry.outcome.realizedDirection === entry.signal.expectedDirection) bucket.wins += 1;
      byRegime.set(entry.signal.regime, bucket);
    }

    const regimeAccuracy = Object.fromEntries(
      Array.from(byRegime.entries()).map(([regime, bucket]) => [regime, clamp((bucket.wins / Math.max(1, bucket.total)) * 100)]),
    ) as Partial<Record<RegimeName, number>>;
    const calibrationErrors = evaluated.map(({ outcome, signal }) => Math.abs(Math.abs(outcome.realizedMagnitude) - signal.expectedMagnitude));

    return {
      expectancy: mean(returns),
      sharpe: stdev(returns) > 0 ? mean(returns) / stdev(returns) : 0,
      drawdown: Math.abs(Math.min(0, ...losses)),
      regimeAccuracy,
      calibrationAccuracy: clamp(100 - mean(calibrationErrors) * 8),
      confidenceRealism: evaluated.length ? clamp((wins / evaluated.length) * 100) : 72,
      evaluatedSignals: evaluated.length,
    };
  }

  listSignals() {
    return Array.from(this.signals.values()).map((signal) => structuredClone(signal));
  }
}

function directionalReturn(signal: SignalRecord, outcome: SignalOutcome) {
  if (signal.expectedDirection === "unknown" || signal.expectedDirection === "flat") {
    return -Math.abs(outcome.realizedMagnitude) * 0.25;
  }
  const correct = signal.expectedDirection === outcome.realizedDirection;
  return correct ? Math.abs(outcome.realizedMagnitude) : -Math.abs(outcome.realizedMagnitude);
}

