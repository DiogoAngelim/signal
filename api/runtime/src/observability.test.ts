import { describe, expect, it } from "vitest";
import { createInMemoryMetricsRecorder } from "./observability";

describe("in-memory metrics recorder", () => {
  it("retains a bounded number of samples and counts dropped samples", () => {
    const recorder = createInMemoryMetricsRecorder({ maxMetrics: 2 });

    recorder.increment("requests");
    recorder.gauge("queue.depth", 3);
    recorder.timing("request.duration", 12);

    expect(recorder.snapshot()).toHaveLength(2);
    expect(recorder.droppedCount()).toBe(1);
    expect(recorder.snapshot().map((metric) => metric.name)).toEqual([
      "requests",
      "queue.depth",
    ]);
  });

  it("isolates snapshots and labels from caller mutation", () => {
    const recorder = createInMemoryMetricsRecorder();
    const labels = { operation: "decision" };
    recorder.increment("requests", 1, labels);
    labels.operation = "mutated";

    const snapshot = recorder.snapshot();
    expect(snapshot[0].labels.operation).toBe("decision");
    snapshot[0].labels.operation = "snapshot-mutated";
    expect(recorder.snapshot()[0].labels.operation).toBe("decision");
  });

  it("clears retained samples and the dropped counter", () => {
    const recorder = createInMemoryMetricsRecorder({ maxMetrics: 1 });
    recorder.increment("first");
    recorder.increment("dropped");
    recorder.clear();

    expect(recorder.snapshot()).toEqual([]);
    expect(recorder.droppedCount()).toBe(0);
    recorder.increment("after-clear");
    expect(recorder.snapshot()).toHaveLength(1);
  });

  it("rejects invalid retention limits and non-finite metric values", () => {
    expect(() => createInMemoryMetricsRecorder({ maxMetrics: 0 })).toThrow(
      "maxMetrics must be a positive safe integer.",
    );
    expect(() => createInMemoryMetricsRecorder({ maxMetrics: 1.5 })).toThrow(
      "maxMetrics must be a positive safe integer.",
    );

    const recorder = createInMemoryMetricsRecorder();
    expect(() => recorder.gauge("invalid", Number.NaN)).toThrow(
      "Metric values must be finite numbers.",
    );
    expect(() => recorder.timing("invalid", Number.POSITIVE_INFINITY)).toThrow(
      "Metric values must be finite numbers.",
    );
  });
});
