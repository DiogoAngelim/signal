import type { SignalMetricsRecorder } from "./observability";

export interface PrometheusMetricsRecorderOptions {
  readonly maxSeries?: number;
  readonly histogramBucketsMs?: readonly number[];
}

export interface PrometheusMetricsRecorder extends SignalMetricsRecorder {
  /** Render current aggregated samples in Prometheus text exposition format. */
  render(): string;
  /** Number of retained label combinations. */
  seriesCount(): number;
  /** New series dropped after reaching maxSeries. */
  droppedSeriesCount(): number;
}

type Labels = Readonly<Record<string, string>>;

interface Sample {
  readonly labels: Labels;
  value: number;
}

interface HistogramSample {
  readonly labels: Labels;
  readonly bucketCounts: number[];
  count: number;
  sum: number;
}

const COUNTERS: Record<string, { name: string; help: string }> = {
  "signal.execution.started": {
    name: "signal_execution_started_total",
    help: "Signal executions started.",
  },
  "signal.execution.completed": {
    name: "signal_execution_completed_total",
    help: "Signal executions completed successfully.",
  },
  "signal.execution.failed": {
    name: "signal_execution_failed_total",
    help: "Signal executions that failed.",
  },
  "signal.execution.replayed": {
    name: "signal_execution_replayed_total",
    help: "Signal executions served from replay.",
  },
  "signal.events.emitted": {
    name: "signal_events_emitted_total",
    help: "Signal event envelopes emitted.",
  },
  "signal.subscribers.delivered": {
    name: "signal_subscribers_delivered_total",
    help: "Signal subscriber deliveries completed.",
  },
  "signal.subscribers.failed": {
    name: "signal_subscribers_failed_total",
    help: "Signal subscriber deliveries that failed.",
  },
  "signal.subscribers.deduplicated": {
    name: "signal_subscribers_deduplicated_total",
    help: "Signal subscriber deliveries suppressed as completed duplicates.",
  },
  "signal.subscribers.coalesced": {
    name: "signal_subscribers_coalesced_total",
    help: "Signal subscriber deliveries coalesced while already in flight.",
  },
  "signal.errors": {
    name: "signal_errors_total",
    help: "Signal runtime errors by bounded source.",
  },
};

const GAUGES: Record<string, { name: string; help: string }> = {
  "signal.outbox.pending": {
    name: "signal_outbox_pending",
    help: "Number of pending Signal outbox records.",
  },
  "signal.outbox.processing": {
    name: "signal_outbox_processing",
    help: "Number of processing Signal outbox records.",
  },
  "signal.outbox.dead_lettered": {
    name: "signal_outbox_dead_lettered",
    help: "Number of dead-lettered Signal outbox records.",
  },
  "signal.outbox.oldest_pending_age_ms": {
    name: "signal_outbox_oldest_pending_age_ms",
    help: "Age in milliseconds of the oldest pending Signal outbox record.",
  },
  "signal.retry_budget.available": {
    name: "signal_retry_budget_available",
    help: "Available retry tokens in the configured shared budget.",
  },
  "signal.telemetry.queued": {
    name: "signal_telemetry_queued",
    help: "Telemetry observations awaiting export.",
  },
  "signal.telemetry.dropped": {
    name: "signal_telemetry_dropped",
    help: "Telemetry observations dropped before durable export.",
  },
  "signal.telemetry.export_failures": {
    name: "signal_telemetry_export_failures",
    help: "Telemetry export batch failures.",
  },
};

const HISTOGRAMS: Record<string, { name: string; help: string }> = {
  "signal.execution.duration_ms": {
    name: "signal_execution_duration_seconds",
    help: "Signal execution duration in seconds.",
  },
  "signal.subscribers.duration_ms": {
    name: "signal_subscribers_duration_seconds",
    help: "Signal subscriber handler duration in seconds.",
  },
  "signal.errors.duration_ms": {
    name: "signal_errors_duration_seconds",
    help: "Elapsed time before Signal runtime errors in seconds.",
  },
};

const LABEL_VALUES: Record<string, ReadonlySet<string>> = {
  operation_kind: new Set(["query", "mutation", "event", "other"]),
  execution_mode: new Set(["live", "replay", "unspecified"]),
  outcome: new Set(["completed", "replayed", "failed", "delivered"]),
  source: new Set(["runtime", "command-dispatch", "subscriber"]),
};

function normalizeLabels(input: Labels = {}): { labels: Labels; key: string } {
  const entries = Object.entries(input).sort(([left], [right]) => left.localeCompare(right));
  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    const allowed = LABEL_VALUES[key];
    if (!allowed || !allowed.has(value)) {
      throw new Error("Unsupported or unbounded Prometheus label: " + key);
    }
    normalized[key] = value;
  }
  return { labels: normalized, key: JSON.stringify(normalized) };
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

function renderLabels(labels: Labels, extra?: [string, string]): string {
  const entries = Object.entries(labels);
  if (extra) entries.push(extra);
  if (entries.length === 0) return "";
  return "{" + entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => key + '="' + escapeLabel(value) + '"')
    .join(",") + "}";
}

/** Bounded Prometheus recorder with fixed metric and label allowlists. */
export function createPrometheusMetricsRecorder(
  options: PrometheusMetricsRecorderOptions = {},
): PrometheusMetricsRecorder {
  const maxSeries = options.maxSeries ?? 1_000;
  const buckets = [...(options.histogramBucketsMs ?? [1, 5, 10, 25, 50, 100, 250, 500, 1_000, 5_000])];
  if (!Number.isSafeInteger(maxSeries) || maxSeries < 1) {
    throw new RangeError("maxSeries must be a positive safe integer.");
  }
  if (
    buckets.length === 0 ||
    buckets.some((value, index) =>
      !Number.isFinite(value) || value <= 0 || (index > 0 && value <= buckets[index - 1]!),
    )
  ) {
    throw new RangeError("histogramBucketsMs must be finite, positive, and strictly increasing.");
  }

  const counters = new Map<string, Map<string, Sample>>();
  const gauges = new Map<string, Map<string, Sample>>();
  const histograms = new Map<string, Map<string, HistogramSample>>();
  let dropped = 0;
  let series = 0;

  const createSeries = <T>(
    collection: Map<string, Map<string, T>>,
    name: string,
    key: string,
    factory: () => T,
    seriesWeight = 1,
  ): T | undefined => {
    let family = collection.get(name);
    if (!family) {
      family = new Map();
      collection.set(name, family);
    }
    const existing = family.get(key);
    if (existing) return existing;
    if (series + seriesWeight > maxSeries) {
      dropped += 1;
      return undefined;
    }
    const created = factory();
    family.set(key, created);
    series += seriesWeight;
    return created;
  };

  return {
    increment(name, value = 1, labels = {}) {
      const definition = COUNTERS[name];
      if (!definition) throw new Error("Unsupported Signal Prometheus counter: " + name);
      if (!Number.isFinite(value) || value < 0) throw new RangeError("Counter increments must be finite and non-negative.");
      const normalized = normalizeLabels(labels);
      const sample = createSeries(counters, name, normalized.key, () => ({
        labels: normalized.labels,
        value: 0,
      }));
      if (sample) sample.value += value;
    },

    gauge(name, value, labels = {}) {
      const definition = GAUGES[name];
      if (!definition) throw new Error("Unsupported Signal Prometheus gauge: " + name);
      if (!Number.isFinite(value)) throw new RangeError("Gauge values must be finite.");
      const normalized = normalizeLabels(labels);
      const sample = createSeries(gauges, name, normalized.key, () => ({
        labels: normalized.labels,
        value,
      }));
      if (sample) sample.value = value;
    },

    timing(name, durationMs, labels = {}) {
      const definition = HISTOGRAMS[name];
      if (!definition) throw new Error("Unsupported Signal Prometheus histogram: " + name);
      if (!Number.isFinite(durationMs) || durationMs < 0) {
        throw new RangeError("Histogram durations must be finite and non-negative.");
      }
      const normalized = normalizeLabels(labels);
      const sample = createSeries(histograms, name, normalized.key, () => ({
        labels: normalized.labels,
        bucketCounts: buckets.map(() => 0),
        count: 0,
        sum: 0,
      }), buckets.length + 3);
      if (!sample) return;
      sample.count += 1;
      sample.sum += durationMs / 1_000;
      for (let index = 0; index < buckets.length; index += 1) {
        if (durationMs <= buckets[index]!) {
          sample.bucketCounts[index]! += 1;
          break;
        }
      }
    },

    render() {
      const lines: string[] = [
        "# HELP signal_prometheus_recorder_dropped_series_total New metric label series rejected by the configured cardinality limit.",
        "# TYPE signal_prometheus_recorder_dropped_series_total counter",
        "signal_prometheus_recorder_dropped_series_total " + dropped,
      ];
      for (const [source, definition] of Object.entries(COUNTERS)) {
        const samples = counters.get(source);
        if (!samples?.size) continue;
        lines.push("# HELP " + definition.name + " " + definition.help);
        lines.push("# TYPE " + definition.name + " counter");
        for (const sample of samples.values()) {
          lines.push(definition.name + renderLabels(sample.labels) + " " + sample.value);
        }
      }
      for (const [source, definition] of Object.entries(GAUGES)) {
        const samples = gauges.get(source);
        if (!samples?.size) continue;
        lines.push("# HELP " + definition.name + " " + definition.help);
        lines.push("# TYPE " + definition.name + " gauge");
        for (const sample of samples.values()) {
          lines.push(definition.name + renderLabels(sample.labels) + " " + sample.value);
        }
      }
      for (const [source, definition] of Object.entries(HISTOGRAMS)) {
        const samples = histograms.get(source);
        if (!samples?.size) continue;
        lines.push("# HELP " + definition.name + " " + definition.help);
        lines.push("# TYPE " + definition.name + " histogram");
        for (const sample of samples.values()) {
          let cumulative = 0;
          for (let index = 0; index < buckets.length; index += 1) {
            cumulative += sample.bucketCounts[index]!;
            lines.push(
              definition.name + "_bucket" +
              renderLabels(sample.labels, ["le", String(buckets[index]! / 1_000)]) +
              " " + cumulative,
            );
          }
          lines.push(definition.name + "_bucket" + renderLabels(sample.labels, ["le", "+Inf"]) + " " + sample.count);
          lines.push(definition.name + "_sum" + renderLabels(sample.labels) + " " + sample.sum);
          lines.push(definition.name + "_count" + renderLabels(sample.labels) + " " + sample.count);
        }
      }
      return lines.join("\n") + (lines.length > 0 ? "\n" : "");
    },

    seriesCount() {
      return series;
    },

    droppedSeriesCount() {
      return dropped;
    },
  };
}
