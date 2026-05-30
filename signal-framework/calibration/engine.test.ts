import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type CalibrationInput,
  calibrate,
  calibrateConfidence,
} from "./engine";
import {
  FileSystemCalibrationStore,
  InMemoryCalibrationStore,
} from "./history";

function record(
  confidence: number,
  outcome: unknown,
  prediction: unknown = { expectedOutcome: "success" },
): CalibrationInput {
  return { prediction, confidence, outcome };
}

describe("calibrate", () => {
  it("handles missing history without silently inflating confidence", () => {
    const result = calibrate({
      current: { prediction: "route-a", confidence: 90 },
    });

    expect(result.rawConfidence).toBe(90);
    expect(result.calibratedConfidence).toBe(76.5);
    expect(result.historicalAccuracy).toBe(50);
    expect(result.calibrationError).toBe(0);
    expect(result.sampleSize).toBe(0);
    expect(result.warnings).toContain("insufficient history");
    expect(result.warnings).toContain("low trustworthiness");
    expect(result.reliabilityBuckets).toHaveLength(10);
  });

  it("calculates accuracy, buckets, Brier score, and calibrated confidence", () => {
    const history = [
      record(95, { label: "failure" }),
      record(90, { label: "failure" }),
      record(80, { success: true }),
      record(70, true),
      record(65, { correct: true }),
      record(60, { label: "success" }),
      record(40, { label: "partial" }),
      record(30, false),
      record(20, { label: "failure" }),
      record(10, { label: "success" }),
    ];
    const result = calibrate({
      current: { prediction: "next", confidence: 90 },
      history,
      options: { minimumSamples: 3, sufficientSamples: 10 },
    });

    expect(result.sampleSize).toBe(10);
    expect(result.historicalAccuracy).toBe(55);
    expect(result.calibrationError).toBe(1);
    expect(result.brierScore).toBeGreaterThan(0);
    expect(result.trustworthiness).toBeGreaterThan(50);
    expect(result.calibratedConfidence).toBeLessThan(90);
    expect(result.reliabilityBuckets[9]).toMatchObject({
      minConfidence: 90,
      maxConfidence: 100,
      sampleSize: 2,
      actualAccuracy: 0,
    });
    expect(result.warnings).toContain("unstable outcomes");
  });

  it("penalizes overconfidence and poor calibration", () => {
    const history = Array.from({ length: 8 }, () =>
      record(90, { label: "failure" }),
    );
    const result = calibrate({
      current: { prediction: "next", confidence: 0.9 },
      history,
      options: {
        minimumSamples: 3,
        sufficientSamples: 8,
        poorCalibrationThreshold: 20,
        overconfidenceThreshold: 10,
        lowTrustworthinessThreshold: 70,
      },
    });

    expect(result.rawConfidence).toBe(90);
    expect(result.historicalAccuracy).toBe(0);
    expect(result.calibrationError).toBe(90);
    expect(result.calibratedConfidence).toBeCloseTo(14.58, 2);
    expect(result.trustworthiness).toBeLessThan(70);
    expect(result.warnings).toEqual([
      "poor calibration",
      "overconfidence",
      "low trustworthiness",
    ]);
  });

  it("supports underconfident and custom-label histories", () => {
    const result = calibrateConfidence({
      current: { prediction: { expectedOutcome: "handoff" }, confidence: 35 },
      history: [
        record(20, { label: "handoff" }, { expectedOutcome: "handoff" }),
        record(30, "custom", "custom"),
        record(Number.NaN, { success: true }),
      ],
      options: { minimumSamples: 2, sufficientSamples: 3 },
    });

    expect(result.sampleSize).toBe(3);
    expect(result.historicalAccuracy).toBe(100);
    expect(result.calibrationError).toBeLessThan(0);
    expect(result.calibratedConfidence).toBe(35);
    expect(result.reliabilityBuckets[0]?.sampleSize).toBe(1);
    expect(result.warnings).toEqual(["poor calibration"]);
  });

  it("ignores missing and malformed outcomes safely", () => {
    const result = calibrate({
      current: { prediction: "now", confidence: 60 },
      history: [
        { prediction: { expectedOutcome: "unknown" }, confidence: 80 },
        record(50, { label: " " }),
        record(50, { correct: 0.25 }),
        record(50, { correct: false }),
        record(50, { value: "kind-value" }, { kind: "kind-value" }),
        record(50, { label: "different" }, { expectedOutcome: "wanted" }),
        record(50, 1, 1),
        record(50, 2, 1),
      ],
      options: { minimumSamples: 1, sufficientSamples: 4 },
    });

    expect(result.sampleSize).toBe(6);
    expect(result.historicalAccuracy).toBe(37.5);
    expect(result.brierScore).toBeUndefined();
  });
});

describe("calibration history stores", () => {
  it("records, queries, clones, and clears in-memory history", async () => {
    const store = new InMemoryCalibrationStore();
    const first: CalibrationInput = {
      id: "a",
      timestamp: "2026-01-01T00:00:00.000Z",
      prediction: "a",
      confidence: 0.8,
      outcome: true,
      metadata: { group: "x" },
    };
    await store.record(first);
    await store.record({
      id: "b",
      timestamp: "2026-01-02T00:00:00.000Z",
      prediction: "b",
      confidence: 30,
      outcome: false,
      metadata: { group: "y" },
    });
    first.metadata!.group = "mutated";

    const queried = await store.list({
      from: "2026-01-01T12:00:00.000Z",
      to: "2026-01-03T00:00:00.000Z",
      minConfidence: 20,
      maxConfidence: 40,
      metadata: { group: "y" },
      limit: 1,
    });
    queried[0]!.metadata!.group = "changed";

    expect(queried.map((item) => item.id)).toEqual(["b"]);
    expect((await store.list({ metadata: { group: "y" } }))[0]!.metadata!.group).toBe("y");
    expect(await store.list({ limit: 0 })).toEqual([]);
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it("persists filesystem history and tolerates missing or malformed files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "signal-calibration-"));
    const filePath = join(directory, "history.json");
    const store = new FileSystemCalibrationStore(filePath);

    expect(await store.list()).toEqual([]);
    await store.record({
      id: "persisted",
      timestamp: "not-a-date",
      prediction: "p",
      confidence: Infinity,
      outcome: { correct: true },
    });
    await store.record({
      id: "visible",
      timestamp: "2026-01-03T00:00:00.000Z",
      prediction: "p",
      confidence: 100,
      outcome: { correct: true },
    });

    expect((await store.list({ to: "2026-01-04T00:00:00.000Z" })).map((item) => item.id)).toEqual(["visible"]);
    await store.clear();
    expect(await store.list()).toEqual([]);

    await writeFile(filePath, JSON.stringify([{ confidence: 50 }, { prediction: "ok", confidence: 50 }]));
    expect(await store.list()).toEqual([{ prediction: "ok", confidence: 50 }]);

    await writeFile(filePath, JSON.stringify({ malformed: true }));
    expect(await store.list()).toEqual([]);

    await writeFile(filePath, "{");
    await expect(store.list()).rejects.toThrow();
  });
});
