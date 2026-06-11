import type { BinanceExecutionDecision } from "./types";

export type AllocationInput = {
  decisions: BinanceExecutionDecision[];
  availableEquity: number;
  strategyEquityCap: number;
  maxDailyNotional: number;
  maxOrderNotional: number;
  useFullAvailableEquity?: boolean;
  usedDailyNotional?: number;
  minNotionalBySymbol?: Record<string, number>;
};

export type AllocationResult = {
  decision: BinanceExecutionDecision;
  weight: number;
  notional: number;
  rejected: boolean;
  reasons: string[];
};

export function normalizeAppSizeToWeight(appSizePct: number) {
  const value = Number(appSizePct);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

export function computeAvailableStrategyEquity(input: {
  accountEquity: number;
  availableEquity?: number;
  strategyEquityCap?: number;
  reservedCapital?: number;
}) {
  const equity =
    input.availableEquity == null
      ? Math.max(
          0,
          finite(input.accountEquity, 0) -
            Math.max(0, finite(input.reservedCapital, 0)),
        )
      : Math.max(0, finite(input.availableEquity, input.accountEquity));
  const cap = Math.max(
    0,
    finite(input.strategyEquityCap, Number.POSITIVE_INFINITY),
  );
  return Math.max(0, Math.min(equity, cap));
}

export function allocateProportionalNotional(
  input: AllocationInput,
): AllocationResult[] {
  const buys = input.decisions.filter((decision) => decision.action === "BUY");
  const weights = buys.map((decision) =>
    normalizeAppSizeToWeight(decision.appSizePct),
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const remainingDaily = Math.max(
    0,
    input.maxDailyNotional - (input.usedDailyNotional ?? 0),
  );
  const allocatable = Math.max(
    0,
    Math.min(input.availableEquity, input.strategyEquityCap, remainingDaily),
  );

  return input.decisions.map((decision) => {
    const reasons: string[] = [];
    const weight = normalizeAppSizeToWeight(decision.appSizePct);
    if (decision.action === "HOLD") reasons.push("hold_decision");
    if (decision.action === "BUY" && weight <= 0)
      reasons.push("non_positive_weight");
    if (decision.action === "BUY" && totalWeight <= 0)
      reasons.push("no_positive_weights");

    const denominator = input.useFullAvailableEquity
      ? Math.max(totalWeight, Number.EPSILON)
      : totalWeight > 1
        ? totalWeight
        : 1;
    const proportional =
      decision.action === "BUY" && totalWeight > 0
        ? (weight / denominator) * allocatable
        : 0;
    const hasSuggested = Number.isFinite(decision.suggestedNotional);
    const suggested = hasSuggested
      ? Number(decision.suggestedNotional)
      : proportional;
    const notional =
      decision.action === "SELL" || decision.action === "EXIT"
        ? 0
        : Math.max(
            0,
            Math.min(proportional, suggested, input.maxOrderNotional),
          );
    const minNotional = input.minNotionalBySymbol?.[decision.symbol] ?? 0;

    if (notional > input.maxOrderNotional)
      reasons.push("max_order_notional_exceeded");
    if (notional > remainingDaily) reasons.push("max_daily_notional_exceeded");
    if (minNotional > 0 && notional > 0 && notional < minNotional) {
      reasons.push("below_min_notional");
    }
    if (notional <= 0 && decision.action === "BUY")
      reasons.push("zero_allocation");

    return {
      decision,
      weight,
      notional: round(notional),
      rejected: reasons.length > 0,
      reasons,
    };
  });
}

function finite(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number) {
  return Number(value.toFixed(8));
}
