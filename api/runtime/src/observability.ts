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

export interface InMemoryMetricsRecorderOptions {
  /** Maximum number of metric samples retained in memory. Defaults to 10,000. */
  readonly maxMetrics?: number;
}

export interface InMemoryMetricsRecorder extends SignalMetricsRecorder {
  /** Returns an isolated copy of the retained samples, oldest first. */
  snapshot(): SignalMetric[];
  /** Number of samples rejected because the bounded buffer was full. */
  droppedCount(): number;
  /** Removes retained samples and resets the dropped-sample counter. */
  clear(): void;
}

const DEFAULT_MAX_METRICS = 10_000;

export function createInMemoryMetricsRecorder(
  options: InMemoryMetricsRecorderOptions = {},
): InMemoryMetricsRecorder {
  const maxMetrics = options.maxMetrics ?? DEFAULT_MAX_METRICS;
  if (!Number.isSafeInteger(maxMetrics) || maxMetrics < 1) {
    throw new Error("maxMetrics must be a positive safe integer.");
  }

  const metrics: SignalMetric[] = [];
  let dropped = 0;

  const record = (
    name: string,
    value: number,
    unit: SignalMetric["unit"],
    labels: Record<string, string>,
  ): void => {
    if (metrics.length >= maxMetrics) {
      dropped += 1;
      return;
    }
    metrics.push({
      name,
      value,
      unit,
      labels: { ...labels },
      timestamp: new Date().toISOString(),
    });
  };

  return {
    increment(name, value = 1, labels = {}) {
      record(name, value, "count", labels);
    },
    gauge(name, value, labels = {}) {
      record(name, value, "gauge", labels);
    },
    timing(name, durationMs, labels = {}) {
      record(name, durationMs, "ms", labels);
    },
    snapshot() {
      return metrics.map((metric) => ({
        ...metric,
        labels: { ...metric.labels },
      }));
    },
    droppedCount() {
      return dropped;
    },
    clear() {
      metrics.length = 0;
      dropped = 0;
    },
  };
}
