import { describe, expect, it } from "vitest";
import {
  createBufferedObservabilityPort,
  createInMemoryMetricsRecorder,
} from "./observability";

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


describe("buffered observability port", () => {
  it("batches events through an exporter and reports bounded-buffer drops", async () => {
    const batches: number[] = [];
    const port = createBufferedObservabilityPort({
      export: async (events) => { batches.push(events.length); },
    }, { capacity: 3, batchSize: 2 });

    port.emit({ event: "execution.start" });
    port.emit({ event: "execution.end" });
    port.emit({ event: "error.occurred" });
    port.emit({ event: "event.emitted" });
    await port.flush();

    expect(batches).toEqual([2, 1]);
    expect(port.stats()).toEqual({ queued: 0, dropped: 1, exportFailures: 0 });
  });

  it("retains a failed batch for an explicit retry and closes the adapter", async () => {
    let fail = true;
    const exported: string[] = [];
    const port = createBufferedObservabilityPort({
      export: async (events) => {
        if (fail) throw new Error("collector unavailable");
        exported.push(...events.map((event) => event.event));
      },
    }, { capacity: 4, batchSize: 2 });

    port.emit({ event: "execution.start" });
    await expect(port.flush()).rejects.toThrow("collector unavailable");
    expect(port.stats().queued).toBe(1);
    expect(port.stats().exportFailures).toBe(1);

    fail = false;
    await port.flush();
    await port.close();
    port.emit({ event: "execution.end" });

    expect(exported).toEqual(["execution.start"]);
    expect(port.stats()).toEqual({ queued: 0, dropped: 1, exportFailures: 1 });
  });
});
