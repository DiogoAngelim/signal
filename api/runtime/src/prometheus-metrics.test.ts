import { describe, expect, it } from "vitest";
import { createPrometheusMetricsRecorder } from "./prometheus-metrics";

describe("Prometheus metrics recorder", () => {
  it("aggregates counters, gauges, and cumulative histograms in exposition format", () => {
    const recorder = createPrometheusMetricsRecorder({
      histogramBucketsMs: [10, 100],
    });
    recorder.increment("signal.execution.completed", 2, {
      operation_kind: "query",
      execution_mode: "live",
    });
    recorder.increment("signal.execution.completed", 3, {
      execution_mode: "live",
      operation_kind: "query",
    });
    recorder.gauge("signal.outbox.pending", 7);
    recorder.timing("signal.execution.duration_ms", 5, {
      operation_kind: "query",
      execution_mode: "live",
      outcome: "completed",
    });
    recorder.timing("signal.execution.duration_ms", 50, {
      operation_kind: "query",
      execution_mode: "live",
      outcome: "completed",
    });

    const output = recorder.render();
    expect(output).toContain("# TYPE signal_execution_completed_total counter");
    expect(output).toContain('signal_execution_completed_total{execution_mode="live",operation_kind="query"} 5');
    expect(output).toContain("signal_outbox_pending 7");
    expect(output).toContain('signal_execution_duration_seconds_bucket{execution_mode="live",le="0.01",operation_kind="query",outcome="completed"} 1');
    expect(output).toContain('signal_execution_duration_seconds_bucket{execution_mode="live",le="0.1",operation_kind="query",outcome="completed"} 2');
    expect(output).toContain('signal_execution_duration_seconds_bucket{execution_mode="live",le="+Inf",operation_kind="query",outcome="completed"} 2');
    expect(output).toContain("signal_execution_duration_seconds_sum");
    expect(output).toContain("signal_execution_duration_seconds_count");
  });

  it("rejects arbitrary metric names and unbounded label dimensions", () => {
    const recorder = createPrometheusMetricsRecorder();
    expect(() => recorder.increment("signal.custom.metric")).toThrow("Unsupported");
    expect(() => recorder.increment("signal.errors", 1, { request_id: "request-123" }))
      .toThrow("Unsupported or unbounded Prometheus label");
    expect(() => recorder.increment("signal.errors", -1)).toThrow("non-negative");
  });

  it("bounds total label series and counts dropped series", () => {
    const recorder = createPrometheusMetricsRecorder({ maxSeries: 1 });
    recorder.increment("signal.execution.started", 1, {
      operation_kind: "query",
      execution_mode: "live",
    });
    recorder.increment("signal.execution.started", 1, {
      operation_kind: "query",
      execution_mode: "live",
    });
    recorder.increment("signal.execution.started", 1, {
      operation_kind: "mutation",
      execution_mode: "live",
    });
    expect(recorder.seriesCount()).toBe(1);
    expect(recorder.droppedSeriesCount()).toBe(1);
  });

  it("validates histogram bucket configuration", () => {
    expect(() => createPrometheusMetricsRecorder({
      histogramBucketsMs: [10, 10],
    })).toThrow("strictly increasing");
  });
});
