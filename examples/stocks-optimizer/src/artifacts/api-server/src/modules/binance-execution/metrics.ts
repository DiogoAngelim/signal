export type MetricName =
  | "decisions_received"
  | "decisions_approved"
  | "decisions_rejected"
  | "orders_attempted"
  | "orders_accepted"
  | "orders_filled"
  | "orders_cancelled"
  | "order_latency_ms"
  | "reconciliation_drift"
  | "capital_reserved"
  | "capital_released"
  | "api_failures"
  | "rate_limit_events"
  | "kill_switch_activations";

export class ExecutionMetrics {
  private readonly counters = new Map<MetricName, number>();

  increment(name: MetricName, amount = 1) {
    this.counters.set(name, this.value(name) + amount);
  }

  record(name: MetricName, value: number) {
    this.counters.set(name, value);
  }

  value(name: MetricName) {
    return this.counters.get(name) ?? 0;
  }

  snapshot() {
    const output: Record<string, number> = {};
    for (const [key, value] of this.counters.entries()) output[key] = value;
    return output;
  }

  hydrate(values: Record<string, number> | undefined) {
    if (!values) return;
    for (const [key, value] of Object.entries(values)) {
      if (Number.isFinite(value)) this.counters.set(key as MetricName, value);
    }
  }
}
