import { describe, expect, it } from "vitest";
import { MetricRegistry } from "../metrics/registry";
import type { MetricInput, PerceptionLayerKey, SignalContext } from "../types";
import { SignalFrameworkEngine } from "./engine";

const layerMetrics: Array<{
  key: string;
  layer: PerceptionLayerKey;
  value: number;
}> = [
  { key: "survivalMetric", layer: "survival", value: 70 },
  { key: "emotionMetric", layer: "emotion", value: 70 },
  { key: "convictionMetric", layer: "conviction", value: 72 },
  { key: "harmonyMetric", layer: "harmony", value: 70 },
  { key: "informationMetric", layer: "information", value: 74 },
  { key: "intuitionMetric", layer: "intuition", value: 72 },
  { key: "macroMetric", layer: "macroContext", value: 70 },
  { key: "selfMetric", layer: "selfAwareness", value: 80 },
];

function registry() {
  const result = new MetricRegistry();
  for (const metric of layerMetrics) {
    result.register({
      key: metric.key,
      label: metric.key,
      description: `${metric.layer} test metric`,
      layerMappings: [{ layer: metric.layer, weight: 1 }],
    });
  }
  return result;
}

function metrics(timestamp = 1_800_000_000_000): MetricInput[] {
  return layerMetrics.map((metric) => ({
    key: metric.key,
    value: metric.value,
    confidence: 95,
    timestamp,
  }));
}

describe("SignalFrameworkEngine lifecycle", () => {
  it("materializes Reflection and Agency in snapshots and feeds self-awareness generically", async () => {
    const engine = new SignalFrameworkEngine(registry());
    const snapshot = await engine.cycleOnce({
      id: "cycle-1",
      timestamp: 1_800_000_000_000,
      metrics: metrics(),
      signals: [
        {
          id: "prediction-1",
          timestamp: 1_800_000_000_000,
          regime: "Low-Vol Grind",
          environment: {},
          confidence: 90,
          composition: {},
          expectedDirection: "up",
          expectedMagnitude: 1,
          executionAssumptions: {},
        },
      ],
      outcomes: [
        {
          signalId: "prediction-1",
          window: "next",
          evaluatedAt: 1_800_000_000_100,
          realizedDirection: "up",
          realizedMagnitude: 1,
        },
      ],
      decision: {
        id: "decision-1",
        type: "generic-decision",
        confidence: 90,
        uncertainty: 10,
        impact: 20,
      },
      agency: {
        authority: "autonomous",
        requiredAuthority: "observer",
        reviewPolicy: { mode: "fully-autonomous" },
        execution: { readiness: 95 },
      },
    });

    expect(snapshot.reflection?.reflectionScore).toBeGreaterThan(0);
    expect(snapshot.recognition?.metadata.module).toBe("recognition");
    expect(snapshot.agency?.status).toBe("approved");
    expect(snapshot.decision?.id).toBe("decision-1");
    expect(snapshot.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["reflection.completed", expect.stringMatching(/^recognition\./), "agency.approved"]),
    );
    expect(
      snapshot.perception.layers.selfAwareness.contributors.map(
        (contributor) => contributor.metricKey,
      ),
    ).toEqual(expect.arrayContaining(["reflectionScore", "agencyScore"]));
    expect(snapshot.perception.layers.selfAwareness.classification).toBe(
      "Active agency",
    );
  });

  it("keeps Agency separate from Decision when no decision is supplied", async () => {
    const engine = new SignalFrameworkEngine(registry());
    const snapshot = await engine.cycleOnce({
      id: "cycle-1",
      timestamp: 1_800_000_000_000,
      metrics: metrics(),
      agency: {
        authority: "autonomous",
        reviewPolicy: { mode: "fully-autonomous" },
      },
    } satisfies SignalContext);

    expect(snapshot.decision).toBeNull();
    expect(snapshot.agency?.status).toBe("deferred");
    expect(snapshot.agency?.audit.statusResolution).toContain(
      "No decision was supplied.",
    );
    expect(snapshot.events.map((event) => event.type)).toContain(
      "agency.deferred",
    );
  });
});
