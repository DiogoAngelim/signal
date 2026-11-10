import { describe, expect, it } from "vitest";
import {
  createBufferedObservabilityPort,
  createInMemoryMetricsRecorder,
  createSignalMetricsObservabilityPort,
} from "./index";

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



describe("Signal metrics observability adapter", () => {
  it("maps execution and subscriber lifecycle events to bounded-cardinality metrics", () => {
    const recorder = createInMemoryMetricsRecorder();
    const port = createSignalMetricsObservabilityPort(recorder);

    port.emit({
      event: "execution.start",
      operationName: "private.operation.v1",
      operationKind: "query",
      correlationId: "private-correlation-id",
    });
    port.emit({
      event: "execution.end",
      operationName: "private.operation.v1",
      operationKind: "query",
      durationMs: 12,
      outcome: "failed",
    });
    port.emit({
      event: "event.emitted",
      operationKind: "event",
    });
    port.emit({
      event: "subscriber.delivered",
      operationKind: "event",
      durationMs: 4,
    });
    port.emit({
      event: "subscriber.failed",
      operationKind: "event",
      durationMs: 8,
    });
    port.emit({ event: "subscriber.deduped", operationKind: "event" });
    port.emit({ event: "subscriber.coalesced", operationKind: "event" });
    port.emit({
      event: "error.occurred",
      operationKind: "unsupported-user-value",
      durationMs: 6,
      meta: {
        errorCode: "PRIVATE_ERROR_CODE",
        source: "command-dispatch",
      },
    });

    const metrics = recorder.snapshot();
    const names = metrics.map((metric) => metric.name);
    expect(names).toContain("signal.execution.started");
    expect(names).toContain("signal.execution.failed");
    expect(names).toContain("signal.execution.duration_ms");
    expect(names).toContain("signal.events.emitted");
    expect(names).toContain("signal.subscribers.delivered");
    expect(names).toContain("signal.subscribers.failed");
    expect(names).toContain("signal.subscribers.deduplicated");
    expect(names).toContain("signal.subscribers.coalesced");
    expect(names).toContain("signal.errors");
    expect(names).toContain("signal.errors.duration_ms");
    expect(
      metrics.find((metric) => metric.name === "signal.errors")?.labels.source,
    ).toBe("command-dispatch");
    expect(metrics.every((metric) => metric.labels.operation_kind !== "unsupported-user-value")).toBe(true);
    expect(JSON.stringify(metrics)).not.toContain("private.operation.v1");
    expect(JSON.stringify(metrics)).not.toContain("private-correlation-id");
    expect(JSON.stringify(metrics)).not.toContain("PRIVATE_ERROR_CODE");
  });

  it("does not let a failing metrics recorder affect runtime telemetry calls", () => {
    const port = createSignalMetricsObservabilityPort({
      increment: () => {
        throw new Error("metrics backend failed");
      },
      gauge: () => {
        throw new Error("metrics backend failed");
      },
      timing: () => {
        throw new Error("metrics backend failed");
      },
    });

    expect(() =>
      port.emit({
        event: "execution.end",
        operationKind: "mutation",
        durationMs: 10,
        outcome: "completed",
      }),
    ).not.toThrow();
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
    }, { capacity: 4, batchSize: 2, autoFlush: false });

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
