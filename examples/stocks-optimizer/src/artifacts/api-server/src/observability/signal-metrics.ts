type MetricTags = Record<string, string | number | boolean | undefined>;

type CounterRecord = {
  name: string;
  value: number;
  tags: MetricTags;
};

const counters = new Map<string, CounterRecord>();
const latencies = new Map<string, number[]>();

export function incrementSignalCounter(name: string, tags: MetricTags = {}, value = 1) {
  const key = metricKey(name, tags);
  const existing = counters.get(key);
  counters.set(key, {
    name,
    tags: sanitizeTags(tags),
    value: (existing?.value ?? 0) + value,
  });
}

export function observeSignalLatency(name: string, valueMs: number) {
  if (!Number.isFinite(valueMs) || valueMs < 0) return;
  const values = latencies.get(name) ?? [];
  values.push(valueMs);
  if (values.length > 1_000) values.splice(0, values.length - 1_000);
  latencies.set(name, values);
}

export function snapshotSignalMetrics() {
  const latency: Record<string, { count: number; p50: number; p95: number; p99: number; max: number }> = {};
  for (const [name, values] of latencies.entries()) {
    latency[name] = percentileSummary(values);
  }

  return {
    counters: Array.from(counters.values()),
    latency,
    timestamp: new Date().toISOString(),
  };
}

export function resetSignalMetricsForTests() {
  counters.clear();
  latencies.clear();
}

export function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeForLog);
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (/secret|token|key|authorization|signature|password/i.test(key)) {
      output[key] = "[redacted]";
    } else {
      output[key] = sanitizeForLog(nested);
    }
  }
  return output;
}

function metricKey(name: string, tags: MetricTags) {
  const normalized = Object.entries(sanitizeTags(tags))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(",");
  return `${name}{${normalized}}`;
}

function sanitizeTags(tags: MetricTags) {
  const output: MetricTags = {};
  for (const [key, value] of Object.entries(tags)) {
    if (/secret|token|key|authorization|signature|password/i.test(key)) continue;
    if (value == null) continue;
    output[key] = value;
  }
  return output;
}

function percentileSummary(values: number[]) {
  if (!values.length) return { count: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? 0,
  };
}

function percentile(sorted: number[], quantile: number) {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return Math.round(sorted[index] * 100) / 100;
}
