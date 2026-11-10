import type { ObservabilityContext, ObservabilityPort } from "@signal/ports";

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

/**
 * Adapts runtime lifecycle observations into bounded, low-cardinality metrics.
 * Operation names, request identifiers, error messages, and payload data are
 * deliberately excluded from metric labels.
 */
export function createSignalMetricsObservabilityPort(
  recorder: SignalMetricsRecorder,
): ObservabilityPort {
  if (
    !recorder ||
    typeof recorder.increment !== "function" ||
    typeof recorder.timing !== "function"
  ) {
    throw new Error("A compatible Signal metrics recorder is required.");
  }

  const operationKind = (value?: string): string => {
    if (value === "query" || value === "mutation" || value === "event") {
      return value;
    }
    return "other";
  };

  return {
    emit(event) {
      const labels = {
        operation_kind: operationKind(event.operationKind),
        execution_mode:
          event.isReplay === true
            ? "replay"
            : event.isReplay === false
              ? "live"
              : "unspecified",
      };
      try {
        switch (event.event) {
          case "execution.start":
            recorder.increment("signal.execution.started", 1, labels);
            break;
          case "execution.end": {
            const outcome =
              event.outcome === "failed"
                ? "failed"
                : event.outcome === "replayed"
                  ? "replayed"
                  : "completed";
            recorder.increment(`signal.execution.${outcome}`, 1, labels);
            if (typeof event.durationMs === "number" && Number.isFinite(event.durationMs)) {
              recorder.timing("signal.execution.duration_ms", event.durationMs, {
                ...labels,
                outcome,
              });
            }
            break;
          }
          case "event.emitted":
            recorder.increment("signal.events.emitted", 1, labels);
            break;
          case "subscriber.delivered":
            recorder.increment("signal.subscribers.delivered", 1, labels);
            if (typeof event.durationMs === "number" && Number.isFinite(event.durationMs)) {
              recorder.timing("signal.subscribers.duration_ms", event.durationMs, {
                ...labels,
                outcome: "delivered",
              });
            }
            break;
          case "subscriber.failed":
            recorder.increment("signal.subscribers.failed", 1, labels);
            if (typeof event.durationMs === "number" && Number.isFinite(event.durationMs)) {
              recorder.timing("signal.subscribers.duration_ms", event.durationMs, {
                ...labels,
                outcome: "failed",
              });
            }
            break;
          case "subscriber.deduped":
            recorder.increment("signal.subscribers.deduplicated", 1, labels);
            break;
          case "subscriber.coalesced":
            recorder.increment("signal.subscribers.coalesced", 1, labels);
            break;
          case "error.occurred": {
            const source =
              event.meta?.source === "command-dispatch" ||
              event.meta?.source === "subscriber"
                ? event.meta.source
                : "runtime";
            const errorLabels = { ...labels, source };
            recorder.increment("signal.errors", 1, errorLabels);
            if (typeof event.durationMs === "number" && Number.isFinite(event.durationMs)) {
              recorder.timing("signal.errors.duration_ms", event.durationMs, errorLabels);
            }
            break;
          }
          default:
            break;
        }
      } catch {
        // A metrics backend must never change the runtime result.
      }
    },
  };
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
    if (!Number.isFinite(value)) {
      throw new Error("Metric values must be finite numbers.");
    }
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


export interface BufferedObservabilityExporter {
  export(events: readonly ObservabilityContext[]): Promise<void>;
}

export interface BufferedObservabilityPort extends ObservabilityPort {
  /** Retry pending exports and wait for the current queue to drain. */
  flush(): Promise<void>;
  /** Stop accepting new events and attempt to export all queued events. */
  close(): Promise<void>;
  stats(): {
    queued: number;
    dropped: number;
    exportFailures: number;
  };
}

export interface BufferedObservabilityOptions {
  /** Automatically schedule a non-blocking microtask flush. Defaults to true. */
  autoFlush?: boolean;
  /** Maximum pending events. Defaults to 5,000. */
  capacity?: number;
  /** Maximum events sent in one export call. Defaults to 100. */
  batchSize?: number;
}

/**
 * A bounded, non-blocking adapter between runtime lifecycle hooks and an
 * application-owned exporter (for example, an OTLP collector or durable
 * telemetry service). The adapter does not claim local disk durability.
 *
 * When capacity is exhausted, newest events are dropped and counted. Failed
 * batches are retained for an explicit later flush; no retry loop can amplify
 * an exporter outage. The exporter must provide the durability/retention
 * guarantees required by the deployment.
 */
export function createBufferedObservabilityPort(
  exporter: BufferedObservabilityExporter,
  options: BufferedObservabilityOptions = {},
): BufferedObservabilityPort {
  if (!exporter || typeof exporter.export !== "function") {
    throw new Error("A telemetry exporter with an export method is required.");
  }
  const autoFlush = options.autoFlush ?? true;
  const capacity = options.capacity ?? 5_000;
  const batchSize = options.batchSize ?? 100;
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError("capacity must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > capacity) {
    throw new RangeError("batchSize must be between 1 and capacity.");
  }

  const queue: ObservabilityContext[] = [];
  let dropped = 0;
  let exportFailures = 0;
  let closed = false;
  let draining: Promise<void> | undefined;
  let flushScheduled = false;

  const scheduleFlush = () => {
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(() => {
      flushScheduled = false;
      void flush().catch(() => {
        // Failed batches remain queued; the next event or explicit flush retries.
      });
    });
  };

  const flush = async (): Promise<void> => {
    // Serialize concurrent flush requests. If an earlier export failed, the
    // retained batch is retried by this explicit/new flush request.
    while (draining) {
      const active = draining;
      try {
        await active;
      } catch {
        // The failed batch remains at the head of the queue.
      }
      if (draining === active) draining = undefined;
    }
    if (queue.length === 0) return;

    const current = (async () => {
      while (queue.length > 0) {
        const batch = queue.splice(0, batchSize);
        try {
          await exporter.export(batch);
        } catch (error) {
          queue.unshift(...batch);
          exportFailures += 1;
          throw error;
        }
      }
    })();
    draining = current;
    try {
      await current;
    } finally {
      if (draining === current) draining = undefined;
    }
  };

  return {
    emit(event) {
      if (closed || queue.length >= capacity) {
        dropped += 1;
        return;
      }
      queue.push({ ...event, meta: event.meta ? { ...event.meta } : undefined });
      // Defer I/O so the synchronous runtime lifecycle hook remains bounded.
      if (autoFlush) scheduleFlush();
    },
    flush,
    async close() {
      closed = true;
      await flush();
    },
    stats() {
      return { queued: queue.length, dropped, exportFailures };
    },
  };
}
