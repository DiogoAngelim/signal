/**
 * Observability primitives for Signal runtime.
 * Provides structured logging, trace context, and metric recording.
 */

export interface SignalLogEntry {
  readonly timestamp: string;
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message: string;
  readonly operationName?: string;
  readonly operationKind?: string;
  readonly messageId?: string;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly durationMs?: number;
  readonly outcome?: string;
  readonly [key: string]: unknown;
}

export interface SignalTraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly operationName: string;
  readonly operationKind: string;
  readonly startTime: string;
  readonly endTime?: string;
  readonly status: "ok" | "error";
  readonly attributes: Record<string, unknown>;
}

export interface SignalMetric {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly labels: Record<string, string>;
  readonly timestamp: string;
}

export type SignalLogLevel = "debug" | "info" | "warn" | "error";

export interface SignalLogger {
  debug(entry: Omit<SignalLogEntry, "level" | "timestamp">): void;
  info(entry: Omit<SignalLogEntry, "level" | "timestamp">): void;
  warn(entry: Omit<SignalLogEntry, "level" | "timestamp">): void;
  error(entry: Omit<SignalLogEntry, "level" | "timestamp">): void;
}

export function createConsoleLogger(
  minLevel: SignalLogLevel = "info",
): SignalLogger {
  const shouldLog = (level: SignalLogLevel): boolean => {
    const levels: SignalLogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(minLevel);
  };

  const log = (
    level: SignalLogLevel,
    entry: Omit<SignalLogEntry, "level" | "timestamp">,
  ): void => {
    if (!shouldLog(level)) return;
    const full: SignalLogEntry = {
      ...entry,
      level,
      timestamp: new Date().toISOString(),
    } as SignalLogEntry;
    const output = JSON.stringify(full);
    switch (level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      default:
        console.log(output);
        break;
    }
  };

  return {
    debug: (e) => log("debug", e),
    info: (e) => log("info", e),
    warn: (e) => log("warn", e),
    error: (e) => log("error", e),
  };
}

export interface SignalMetricsRecorder {
  increment(
    name: string,
    value?: number,
    labels?: Record<string, string>,
  ): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
  timing(
    name: string,
    durationMs: number,
    labels?: Record<string, string>,
  ): void;
}

export function createInMemoryMetricsRecorder(): SignalMetricsRecorder & {
  snapshot(): SignalMetric[];
} {
  const metrics: SignalMetric[] = [];
  return {
    increment(name, value = 1, labels = {}) {
      metrics.push({
        name,
        value,
        unit: "count",
        labels,
        timestamp: new Date().toISOString(),
      });
    },
    gauge(name, value, labels = {}) {
      metrics.push({
        name,
        value,
        unit: "gauge",
        labels,
        timestamp: new Date().toISOString(),
      });
    },
    timing(name, durationMs, labels = {}) {
      metrics.push({
        name,
        value: durationMs,
        unit: "ms",
        labels,
        timestamp: new Date().toISOString(),
      });
    },
    snapshot() {
      return [...metrics];
    },
  };
}
