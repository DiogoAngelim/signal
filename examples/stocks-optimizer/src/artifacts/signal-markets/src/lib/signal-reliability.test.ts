import { describe, expect, it } from "vitest";
import {
  ReliabilityEngine,
  confidenceCapForReliability,
  evaluateReliability,
  type ReliabilityEvaluation,
  type ReliabilityRecord,
} from "../../../signal-framework";

const now = Date.parse("2026-05-28T12:00:00.000Z");

function record(overrides: Partial<ReliabilityRecord> = {}): ReliabilityRecord {
  return {
    id: "record-a",
    timestamp: now - 1_000,
    source: "primary",
    fields: {
      value: 42,
      label: "ready",
      active: true,
      payload: { ok: true },
      samples: [1, 2, 3],
      optional: null,
    },
    ...overrides,
  };
}

function baseEvaluation(overrides: Partial<ReliabilityEvaluation> = {}): ReliabilityEvaluation {
  return {
    now,
    maxAgeMs: 60_000,
    minSampleSize: 1,
    expectedCount: 1,
    fieldRules: [
      { field: "value", required: true, type: "number", min: 1, max: 100 },
      { field: "label", required: true, type: "string" },
      { field: "active", required: true, type: "boolean" },
      { field: "payload", required: true, type: "object" },
      { field: "samples", required: true, type: "array" },
      { field: "optional", allowNull: true },
    ],
    records: [record()],
    ...overrides,
  };
}

describe("generic signal reliability engine", () => {
  it("scores a complete fresh dataset as healthy", () => {
    const result = evaluateReliability(baseEvaluation());

    expect(result.status).toBe("healthy");
    expect(result.score).toBe(100);
    expect(result.confidenceCap).toBe(100);
    expect(result.metadata).toEqual({
      evaluatedAt: "2026-05-28T12:00:00.000Z",
      inputCount: 1,
      validCount: 1,
      rejectedCount: 0,
    });
  });

  it("detects stale records and invalid timestamps", () => {
    const result = evaluateReliability(
      baseEvaluation({
        records: [
          record({ id: "stale-number", timestamp: now - 120_000 }),
          record({ id: "stale-date", timestamp: new Date(now - 120_000) }),
          record({ id: "fresh-string", timestamp: new Date(now - 2_000).toISOString() }),
          record({ id: "invalid-time", timestamp: "not-a-date" }),
        ],
        minSampleSize: 4,
        expectedCount: 4,
      }),
    );

    expect(result.status).toBe("degraded");
    expect(result.components.freshness).toBeLessThan(70);
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["RECORD_STALE", "TIMESTAMP_INVALID"]),
    );
  });

  it("marks fully stale datasets as stale", () => {
    const result = evaluateReliability(
      baseEvaluation({
        records: [record({ id: "a", timestamp: now - 120_000 }), record({ id: "b", timestamp: now - 90_000 })],
        minSampleSize: 2,
        expectedCount: 2,
      }),
    );

    expect(result.status).toBe("stale");
    expect(result.confidenceCap).toBe(75);
  });

  it("rejects missing, invalid, and out-of-range fields", () => {
    const result = evaluateReliability(
      baseEvaluation({
        records: [
          record({ id: "missing", fields: { label: "missing value" } }),
          record({ id: "invalid-type", fields: { value: "42", label: "bad", active: true, payload: {}, samples: [] } }),
          record({ id: "too-small", fields: { value: 0, label: "low", active: true, payload: {}, samples: [] } }),
          record({ id: "too-large", fields: { value: 101, label: "high", active: true, payload: {}, samples: [] } }),
        ],
        minSampleSize: 4,
        expectedCount: 4,
      }),
    );

    expect(result.status).toBe("invalid");
    expect(result.metadata.rejectedCount).toBe(4);
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["FIELD_MISSING", "FIELD_INVALID", "FIELD_OUT_OF_RANGE"]),
    );
  });

  it("reports min-only, max-only, and null timestamp diagnostics", () => {
    const result = evaluateReliability({
      now,
      maxAgeMs: 60_000,
      records: [
        record({ id: "min-only", timestamp: null, fields: { value: -1, ceiling: 5 } }),
        record({ id: "max-only", fields: { value: 5, ceiling: 11 } }),
      ],
      fieldRules: [
        { field: "value", required: true, type: "number", min: 0 },
        { field: "ceiling", required: true, type: "number", max: 10 },
      ],
    });

    const expected = result.diagnostics.map((item) => item.expected);
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["TIMESTAMP_INVALID", "FIELD_OUT_OF_RANGE"]),
    );
    expect(expected).toEqual(expect.arrayContaining([">= 0", "<= 10"]));
  });

  it("detects duplicate records and low sample sizes", () => {
    const result = new ReliabilityEngine().evaluate(
      baseEvaluation({
        records: [record({ id: "dup" }), record({ id: "dup" })],
        minSampleSize: 3,
        expectedCount: 6,
      }),
    );

    expect(result.status).toBe("insufficient");
    expect(result.metadata.validCount).toBe(1);
    expect(result.components.sampleSize).toBe(16.67);
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["RECORD_DUPLICATE", "SAMPLE_SIZE_LOW"]),
    );
  });

  it("detects fixed-limit and z-score outliers without rejecting the records", () => {
    const result = evaluateReliability(
      baseEvaluation({
        records: [
          record({ id: "normal-a", fields: { value: 10, label: "a", active: true, payload: {}, samples: [] } }),
          record({ id: "normal-b", fields: { value: 10, label: "b", active: true, payload: {}, samples: [] } }),
          record({ id: "extreme", fields: { value: 100, label: "c", active: true, payload: {}, samples: [] } }),
        ],
        minSampleSize: 3,
        expectedCount: 3,
        outlierRules: [
          { field: "value", min: 5, max: 80 },
          { field: "value", zScoreLimit: 1 },
        ],
      }),
    );

    expect(result.metadata.rejectedCount).toBe(0);
    expect(result.components.outlierSafety).toBeLessThan(60);
    expect(result.diagnostics.filter((item) => item.code === "FIELD_OUTLIER")).toHaveLength(2);
  });

  it("degrades source quality from record, source map, and defaults", () => {
    const result = evaluateReliability(
      baseEvaluation({
        records: [
          record({ id: "record-quality", source: "direct", quality: 30 }),
          record({ id: "mapped-quality", source: "mapped" }),
          record({ id: "default-quality", source: "unknown" }),
        ],
        minSampleSize: 3,
        expectedCount: 3,
        sourceQuality: { mapped: 40 },
        defaultSourceQuality: 50,
      }),
    );

    expect(result.status).toBe("degraded");
    expect(result.components.sourceQuality).toBe(40);
    expect(result.diagnostics.map((item) => item.code)).toContain("SOURCE_QUALITY_DEGRADED");
  });

  it("handles empty and malformed datasets", () => {
    const empty = evaluateReliability(baseEvaluation({ records: [] }));
    const malformed = evaluateReliability({ records: null as unknown as ReliabilityRecord[], now });

    expect(empty.status).toBe("invalid");
    expect(empty.diagnostics.map((item) => item.code)).toContain("INPUT_EMPTY");
    expect(malformed.status).toBe("invalid");
    expect(malformed.diagnostics.map((item) => item.code)).toEqual(["INPUT_MALFORMED", "INPUT_EMPTY"]);
  });

  it("supports partial datasets and custom zero weights", () => {
    const partial = evaluateReliability(
      baseEvaluation({
        records: [record({ id: "fresh" }), record({ id: "old", timestamp: now - 120_000 })],
        minSampleSize: 1,
        expectedCount: 4,
        weights: {
          freshness: 0,
          completeness: 0,
          sampleSize: 0,
          sourceQuality: 0,
          consistency: 0,
          outlierSafety: 0,
        },
      }),
    );

    expect(partial.status).toBe("stale");
    expect(partial.score).toBe(0);
    expect(partial.components.sampleSize).toBe(50);
  });

  it("generates deterministic confidence caps", () => {
    expect(confidenceCapForReliability(-1)).toBe(20);
    expect(confidenceCapForReliability(24.99)).toBe(20);
    expect(confidenceCapForReliability(39.99)).toBe(35);
    expect(confidenceCapForReliability(59.99)).toBe(55);
    expect(confidenceCapForReliability(79.99)).toBe(75);
    expect(confidenceCapForReliability(80)).toBe(100);
    expect(confidenceCapForReliability(Number.POSITIVE_INFINITY)).toBe(20);
  });

  it("covers generic fallback defaults and scalar edge cases", () => {
    const fallback = evaluateReliability({
      maxAgeMs: 60_000,
      records: [
        { id: "", timestamp: Number.NaN, fields: { free: "ok", solo: 1 } },
        { timestamp: now, fields: { free: "ok" } } as unknown as ReliabilityRecord,
        { id: "bad-date", timestamp: new Date("bad-date"), fields: { free: "ok" } },
      ],
      fieldRules: [{ field: "free", required: true }],
      outlierRules: [
        { field: "missing", zScoreLimit: 1 },
        { field: "solo", zScoreLimit: 1 },
      ],
    });
    const noRules = evaluateReliability({
      now,
      records: [{ id: "no-rules" }],
    });
    const criticalSource = evaluateReliability({
      now,
      records: [record({ id: "bad-source-a", quality: 20 }), record({ id: "bad-source-b", quality: 30 })],
      minSampleSize: 2,
    });
    const weightedSampleSize = evaluateReliability({
      now,
      records: [record({ id: "weighted" })],
      minSampleSize: 1,
      expectedCount: 2,
      weights: {
        freshness: 0,
        completeness: 0,
        sampleSize: 1,
        sourceQuality: 0,
        consistency: 0,
        outlierSafety: 0,
      },
    });
    const scoreOnlyDegraded = evaluateReliability({
      now,
      records: [record({ id: "source-70", quality: 70 })],
      weights: {
        freshness: 0,
        completeness: 0,
        sampleSize: 0,
        sourceQuality: 1,
        consistency: 0,
        outlierSafety: 0,
      },
    });

    expect(fallback.diagnostics.map((item) => item.code)).toContain("TIMESTAMP_INVALID");
    expect(noRules.status).toBe("healthy");
    expect(criticalSource.diagnostics.find((item) => item.code === "SOURCE_QUALITY_DEGRADED")?.severity).toBe("critical");
    expect(weightedSampleSize.status).toBe("degraded");
    expect(weightedSampleSize.score).toBe(50);
    expect(scoreOnlyDegraded.status).toBe("degraded");
    expect(scoreOnlyDegraded.score).toBe(70);
  });
});
