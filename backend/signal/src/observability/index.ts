import pino, { type Logger } from "pino";

const MAX_LATENCY_SAMPLES = 1000;

export type StructuredLogger = Pick<
  Logger,
  "info" | "error" | "warn" | "debug" | "child"
>;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});

export const createLogger = (
  context: Record<string, unknown> = {},
): StructuredLogger => logger.child(context);

export async function withTiming<T>(
  span: string,
  log: StructuredLogger | undefined,
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  try {
    const result = await fn();
    const durationMs = Math.max(0, Date.now() - start);
    log?.info({ event: "timing", span, durationMs }, "Timing captured");
    return { result, durationMs };
  } catch (error) {
    const durationMs = Math.max(0, Date.now() - start);
    log?.error({ event: "timing", span, durationMs, error }, "Timing failed");
    throw error;
  }
}

export type MetricsSnapshot = {
  evaluationsTotal: number;
  rejectedTotal: number;
  latencyMsAvg: number;
  latencyMsP95: number;
};

const percentile = (samples: number[], percentileValue: number): number => {
  if (samples.length === 0) {
    return 0;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.floor(percentileValue * (sorted.length - 1));
  return sorted[index] ?? 0;
};

export class MetricsRegistry {
  private evaluationsTotal = 0;
  private rejectedTotal = 0;
  private latencySamples: number[] = [];

  recordEvaluation(durationMs: number, rejected: boolean): void {
    this.evaluationsTotal += 1;
    if (rejected) {
      this.rejectedTotal += 1;
    }
    this.latencySamples.push(durationMs);
    if (this.latencySamples.length > MAX_LATENCY_SAMPLES) {
      this.latencySamples.shift();
    }
  }

  snapshot(): MetricsSnapshot {
    const avg =
      this.latencySamples.reduce((sum, value) => sum + value, 0) /
      (this.latencySamples.length || 1);
    return {
      evaluationsTotal: this.evaluationsTotal,
      rejectedTotal: this.rejectedTotal,
      latencyMsAvg: avg,
      latencyMsP95: percentile(this.latencySamples, 0.95),
    };
  }

  toPrometheus(): string {
    const snapshot = this.snapshot();
    return [
      "# HELP sense_evaluations_total Total evaluations",
      "# TYPE sense_evaluations_total counter",
      `sense_evaluations_total ${snapshot.evaluationsTotal}`,
      "# HELP sense_rejected_total Total rejected evaluations",
      "# TYPE sense_rejected_total counter",
      `sense_rejected_total ${snapshot.rejectedTotal}`,
      "# HELP sense_latency_ms_avg Average evaluation latency in ms",
      "# TYPE sense_latency_ms_avg gauge",
      `sense_latency_ms_avg ${snapshot.latencyMsAvg}`,
      "# HELP sense_latency_ms_p95 P95 evaluation latency in ms",
      "# TYPE sense_latency_ms_p95 gauge",
      `sense_latency_ms_p95 ${snapshot.latencyMsP95}`,
    ].join("\n");
  }
}
