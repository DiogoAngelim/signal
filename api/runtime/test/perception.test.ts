import { createSignalEnvelope } from "@signal/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineEvent, defineQuery } from "../../sdk-node/src";
import {
  PerceptionLayer,
  type PerceptionObservation,
  type PerceptionSnapshot,
  SignalRuntime,
  interpolatePerceptionSnapshots,
  signalEnvelopeToPerceptionObservation,
} from "../src";

function marketObservation(input: {
  at: string;
  pressure: number;
  volatility: number;
  participation: number;
  alignment: number;
  conflict?: number;
  momentum: number;
}): PerceptionObservation {
  return {
    subject: "market.crypto",
    observedAt: input.at,
    source: "test.market-feed",
    confidence: 0.92,
    dimensions: {
      "flow.pressure": {
        value: input.pressure,
        normalized: true,
        role: "pressure",
        direction: input.pressure >= 0.5 ? 1 : -1,
        weight: 1.3,
      },
      "realized.volatility": {
        value: input.volatility,
        normalized: true,
        role: "volatility",
        weight: 1.2,
      },
      "market.participation": {
        value: input.participation,
        normalized: true,
        role: "participation",
      },
      "cross.asset.alignment": {
        value: input.alignment,
        normalized: true,
        role: "alignment",
      },
      "opposing.flow": {
        value: input.conflict ?? 0.1,
        normalized: true,
        role: "conflict",
        direction: -1,
      },
      "price.momentum": {
        value: input.momentum,
        normalized: true,
        role: "momentum",
      },
    },
    relationships: [
      {
        from: "flow.pressure",
        to: "price.momentum",
        strength: 0.86,
        polarity: 1,
      },
      {
        from: "flow.pressure",
        to: "opposing.flow",
        strength: 0.72,
        polarity: 1,
      },
    ],
    events: [
      {
        name: "market.microstructure.updated.v1",
        intensity: Math.max(input.volatility, input.momentum),
        polarity: input.pressure >= 0.5 ? 1 : -1,
      },
    ],
  };
}

describe("perception layer", () => {
  it("turns market-shaped observations into generic normalized perception primitives", () => {
    const layer = new PerceptionLayer({
      smoothingAlpha: 1,
      expectedSignalCount: 8,
      now: () => Date.parse("2026-05-27T12:00:00.000Z"),
    });

    const calm = layer.observe(
      marketObservation({
        at: "2026-05-27T12:00:00.000Z",
        pressure: 0.42,
        volatility: 0.18,
        participation: 0.54,
        alignment: 0.62,
        momentum: 0.32,
      }),
    );
    const stressed = layer.observe(
      marketObservation({
        at: "2026-05-27T12:01:00.000Z",
        pressure: 0.88,
        volatility: 0.81,
        participation: 0.86,
        alignment: 0.34,
        conflict: 0.74,
        momentum: 0.82,
      }),
    );

    expect(stressed.metrics.pressure).toBeGreaterThan(calm.metrics.pressure);
    expect(stressed.metrics.volatility).toBeGreaterThan(
      calm.metrics.volatility,
    );
    expect(stressed.metrics.stress).toBeGreaterThan(calm.metrics.stress);
    expect(stressed.metrics.transitionProbability).toBeGreaterThan(0.2);
    expect(stressed.conditions.map((condition) => condition.name)).toContain(
      "energized",
    );
    expect(stressed.conditions.length).toBeGreaterThan(3);
    expect(stressed.metrics.confidence).toBeGreaterThan(0);
    expect(stressed.metrics.confidence).toBeLessThanOrEqual(1);
  });

  it("supports replay, persistence tracking, interpolation, and reactive subscribers", async () => {
    const recorded: PerceptionSnapshot[] = [];
    const layer = new PerceptionLayer({
      smoothingAlpha: 0.6,
      store: { record: (snapshot) => recorded.push(snapshot) },
      now: () => Date.parse("2026-05-27T12:10:00.000Z"),
    });
    const seen: string[] = [];
    const unsubscribe = layer.subscribe((snapshot) => {
      seen.push(snapshot.id);
    });

    const snapshots = layer.replay([
      marketObservation({
        at: "2026-05-27T12:04:00.000Z",
        pressure: 0.5,
        volatility: 0.28,
        participation: 0.58,
        alignment: 0.66,
        momentum: 0.42,
      }),
      marketObservation({
        at: "2026-05-27T12:03:00.000Z",
        pressure: 0.48,
        volatility: 0.24,
        participation: 0.57,
        alignment: 0.64,
        momentum: 0.4,
      }),
    ]);

    await Promise.resolve();
    unsubscribe();

    expect(snapshots[0]?.observedAt).toBe("2026-05-27T12:03:00.000Z");
    expect(snapshots[1]?.persistence.observationCount).toBe(2);
    expect(layer.getHistory("market.crypto")).toHaveLength(2);
    expect(recorded).toHaveLength(2);
    expect(seen).toHaveLength(2);

    const [first, second] = snapshots;
    if (!first || !second) {
      throw new Error("Expected replay to produce two perception snapshots");
    }

    const midpoint = interpolatePerceptionSnapshots(first, second, 0.5);
    expect(midpoint.metrics.pressure).toBeGreaterThanOrEqual(
      Math.min(first.metrics.pressure, second.metrics.pressure),
    );
    expect(midpoint.metrics.pressure).toBeLessThanOrEqual(
      Math.max(first.metrics.pressure, second.metrics.pressure),
    );

    const fallbackLayer = new PerceptionLayer({
      smoothingAlpha: 1,
      now: () => Date.parse("2026-05-27T12:10:00.000Z"),
    });
    const fallbackSnapshots = fallbackLayer.replay([
      { subject: "sort.fallback", signals: { first: 0.2 } },
      { subject: "sort.fallback", signals: { first: 0.4 } },
    ]);
    expect(fallbackSnapshots.map((snapshot) => snapshot.observedAt)).toEqual([
      "2026-05-27T12:10:00.000Z",
      "2026-05-27T12:10:00.000Z",
    ]);
  });

  it("is event-aware inside SignalRuntime without coupling consumers to perception", async () => {
    const runtime = new SignalRuntime();

    runtime.registerQuery(
      defineQuery({
        name: "market.snapshot.v1",
        kind: "query",
        inputSchema: z.object({ symbol: z.string() }),
        resultSchema: z.object({
          price: z.number(),
          changePercent: z.number(),
        }),
        handler: () => ({ price: 101, changePercent: 1.4 }),
      }),
    );
    runtime.registerEvent(
      defineEvent({
        name: "market.updated.v1",
        kind: "event",
        inputSchema: z.object({
          pressure: z.number(),
          volatility: z.number(),
        }),
        resultSchema: z.object({
          pressure: z.number(),
          volatility: z.number(),
        }),
        handler: (payload) => payload,
      }),
    );

    const query = await runtime.query("market.snapshot.v1", { symbol: "BTC" });
    await runtime.publish("market.updated.v1", {
      pressure: 0.86,
      volatility: 0.73,
    });

    expect(query.ok).toBe(true);
    expect(runtime.capabilities().features?.perception).toBe(true);
    expect(runtime.perception?.getSnapshot("market.snapshot")).toBeDefined();
    expect(runtime.perception?.getSnapshot("market.updated")).toBeDefined();
  });

  it("can be disabled for runtimes that do not need active perception", () => {
    const runtime = new SignalRuntime({ perception: false });

    expect(runtime.perception).toBeUndefined();
    expect(runtime.capabilities().features?.perception).toBe(false);
  });

  it("covers empty, event-only, filtered, and cleared perception histories", async () => {
    const recorded: PerceptionSnapshot[] = [];
    const layer = new PerceptionLayer({
      historyLimit: 1,
      smoothingAlpha: 1,
      store: {
        record: (snapshot) => {
          recorded.push(snapshot);
          return Promise.reject(new Error(`ignored-${snapshot.sequence}`));
        },
      },
      now: () => Date.parse("2026-05-27T13:00:00.000Z"),
    });
    const unsubscribe = layer.subscribe(() => {
      throw new Error("ignored subscriber failure");
    });

    const empty = layer.observe({
      subject: "empty.environment",
      observedAt: new Date("2026-05-27T13:00:00.000Z"),
      confidence: 0.4,
    });
    const emptyDefault = layer.observe({
      subject: "empty.environment",
      observedAt: "2026-05-27T13:00:30.000Z",
    });
    const eventOnly = layer.observe({
      subject: "empty.environment",
      observedAt: "2026-05-27T13:01:00.000Z",
      events: [{ name: "environment.changed.v1", intensity: 0.7, polarity: 1 }],
    });
    const defaultEventOnly = layer.observe({
      subject: "default.event.environment",
      events: [{ name: "environment.defaulted.v1" }],
    });

    await Promise.resolve();
    unsubscribe();

    expect(empty.signalCount).toBe(0);
    expect(emptyDefault.metrics.persistence).toBeGreaterThanOrEqual(0);
    expect(empty.metrics.stability).toBeGreaterThan(0.45);
    expect(eventOnly.signalCount).toBe(1);
    expect(defaultEventOnly.signalCount).toBe(1);
    expect(layer.getHistory("empty.environment")).toHaveLength(1);
    expect(
      layer.getHistory("empty.environment", "2026-05-27T13:00:30.000Z"),
    ).toEqual([eventOnly]);
    expect(recorded).toHaveLength(4);

    layer.clear("empty.environment");
    expect(layer.getSnapshot("empty.environment")).toBeUndefined();
    layer.observe({
      subject: "another.environment",
      observedAt: 1_779_890_500_000,
      signals: { flat: 0.5 },
    });
    layer.clear();
    expect(layer.getHistory("another.environment")).toEqual([]);
  });

  it("extracts envelope perception signals from nested payloads and metadata", () => {
    const envelope = createSignalEnvelope({
      kind: "mutation",
      name: "execution.updated.v1",
      payload: {
        pressure: 0.72,
        nested: [{ active: true }, { ignored: "text" }],
        nonNumeric: "skip",
      },
      delivery: {
        attempt: 3,
        replayed: true,
      },
      source: {
        runtime: "unit",
      },
      meta: {
        confidence: 0.66,
        flags: [false],
      },
    });

    const observation = signalEnvelopeToPerceptionObservation(envelope, {
      includeMetaNumbers: true,
      maxDepth: 3,
      subject: "custom.subject",
    });

    expect(observation.subject).toBe("custom.subject");
    expect(observation.source).toBe("unit");
    expect(Object.keys(observation.signals ?? {})).toEqual(
      expect.arrayContaining([
        "payload.pressure",
        "payload.nested.0.active",
        "meta.confidence",
        "meta.flags.0",
        "signal.delivery.attempt",
        "signal.activity",
      ]),
    );
    expect(observation.events?.[0]?.confidence).toBe(0.72);

    const defaultObservation = signalEnvelopeToPerceptionObservation(
      createSignalEnvelope({
        kind: "query",
        name: "default.subject.v1",
        payload: { nested: { value: 1 } },
      }),
    );
    const shallowObservation = signalEnvelopeToPerceptionObservation(
      createSignalEnvelope({
        kind: "event",
        name: "depth.checked.v1",
        payload: { nested: { value: 1 }, flag: false },
      }),
      { maxDepth: 0 },
    );
    const metaDefaultObservation = signalEnvelopeToPerceptionObservation(
      createSignalEnvelope({
        kind: "event",
        name: "meta.default.v1",
        payload: {},
      }),
      { includeMetaNumbers: true },
    );

    expect(defaultObservation.subject).toBe("default.subject");
    expect(defaultObservation.signals?.["payload.nested.value"]).toBeDefined();
    expect(
      shallowObservation.signals?.["payload.nested.value"],
    ).toBeUndefined();
    expect(shallowObservation.signals?.["signal.activity"]).toBeDefined();
    expect(metaDefaultObservation.signals?.["signal.activity"]).toBeDefined();
  });

  it("blends role hints, relationship edge cases, anomalies, and transition labels", () => {
    const layer = new PerceptionLayer({
      smoothingAlpha: 1,
      anomalyZScore: 1.2,
      transitionSensitivity: 0.01,
      expectedSignalCount: 4,
      now: () => Date.parse("2026-05-27T14:00:00.000Z"),
    });

    const baseSignals = {
      pressure: { value: 0.5, normalized: true, role: "pressure" as const },
      structural: {
        value: 0.7,
        normalized: true,
        role: "structural-stability" as const,
      },
      energy: { value: 0.4, normalized: true, role: "energy" as const },
      flow: { value: 0.45, normalized: true, role: "flow" as const },
      fragmentation: {
        value: 0.1,
        normalized: true,
        role: "fragmentation" as const,
      },
      divergence: {
        value: 0.15,
        normalized: true,
        role: "divergence" as const,
      },
      convergence: {
        value: 0.55,
        normalized: true,
        role: "convergence" as const,
      },
      reinforcement: {
        value: 0.55,
        normalized: true,
        role: "reinforcement" as const,
      },
      acceleration: {
        value: 4,
        role: "generic" as const,
        direction: Number.POSITIVE_INFINITY,
      },
      invalid: Number.NaN,
    };

    layer.observe({
      subject: "role.environment",
      observedAt: "2026-05-27T14:00:00.000Z",
      confidence: Number.NaN,
      signals: baseSignals,
      relationships: [
        { from: "pressure", to: "missing", strength: 1 },
        { from: "pressure", to: "energy", strength: 1, weight: 0 },
        { from: "pressure", to: "energy", strength: 1 },
      ],
      events: [{ name: "neutral.event.v1", intensity: 0.4, weight: 0 }],
    });
    layer.observe({
      subject: "role.environment",
      observedAt: "2026-05-27T14:01:00.000Z",
      confidence: 0.9,
      signals: baseSignals,
      relationships: [],
      events: [],
    });
    const transition = layer.observe({
      subject: "role.environment",
      observedAt: "2026-05-27T14:02:00.000Z",
      confidence: 1,
      signals: {
        pressure: { value: 1, normalized: true, role: "pressure" },
        structural: {
          value: 0.05,
          normalized: true,
          role: "structural-stability",
        },
        energy: { value: 1, normalized: true, role: "energy" },
        flow: { value: 1, normalized: true, role: "flow" },
        fragmentation: {
          value: 1,
          normalized: true,
          role: "fragmentation",
        },
        divergence: { value: 1, normalized: true, role: "divergence" },
        convergence: { value: 0.1, normalized: true, role: "convergence" },
        reinforcement: {
          value: 0.1,
          normalized: true,
          role: "reinforcement",
        },
        acceleration: { value: 80, role: "generic" },
        weightless: {
          value: 0.9,
          normalized: true,
          role: "momentum",
          weight: 0,
        },
      },
      relationships: [
        { from: "pressure", to: "energy", strength: 1, polarity: 1 },
        { from: "pressure", to: "divergence", strength: 1, polarity: -1 },
      ],
      events: [
        { name: "positive.event.v1", intensity: 0.9, polarity: 1 },
        { name: "negative.event.v1", intensity: 0.8, polarity: -1 },
        { name: "default.event.v1" },
      ],
    });

    expect(transition.anomalies.length).toBeGreaterThan(0);
    expect(transition.drivers.map((driver) => driver.metric)).toEqual(
      expect.arrayContaining([
        "pressure",
        "environmentalEnergy",
        "conflict",
        "coherence",
      ]),
    );
    expect(transition.transition.labels).toEqual(
      expect.arrayContaining(["structural-transition"]),
    );
    expect(transition.conditions.map((condition) => condition.name)).toEqual(
      expect.arrayContaining(["fragmented", "reinforced"]),
    );
  });

  it("normalizes adaptive object signals and surfaces baseline anomalies", () => {
    const layer = new PerceptionLayer({
      smoothingAlpha: 1,
      anomalyZScore: 0.5,
      now: () => Date.parse("2026-05-27T14:30:00.000Z"),
    });

    const first = layer.observe({
      subject: "adaptive.environment",
      signals: { spread: { value: 150 } },
    });
    layer.observe({
      subject: "adaptive.environment",
      signals: { spread: { value: 160 } },
    });
    layer.observe({
      subject: "adaptive.environment",
      signals: { spread: { value: 180 } },
    });
    const outlier = layer.observe({
      subject: "adaptive.environment",
      signals: { spread: { value: 260 } },
    });

    expect(first.drivers[0]?.metric).toBe("pressure");
    expect(outlier.drivers[0]?.signal).toBe("spread");
    expect(outlier.anomalies.map((anomaly) => anomaly.reason)).toContain(
      "adaptive-baseline-deviation",
    );
  });

  it("falls back to neutral relationship interpretation without usable edges", () => {
    const layer = new PerceptionLayer({
      smoothingAlpha: 1,
      now: () => Date.parse("2026-05-27T14:40:00.000Z"),
    });

    const snapshot = layer.observe({
      subject: "relationship.fallback",
      signals: {
        pressure: { value: 0.9, normalized: true, role: "pressure" },
        energy: { value: 0.8, normalized: true, role: "energy" },
      },
      relationships: [
        { from: "pressure", to: "missing", strength: 1 },
        { from: "pressure", to: "energy", strength: 1, weight: 0 },
      ],
    });

    expect(snapshot.metrics.conflict).toBeLessThan(0.2);
  });

  it("labels volatility compression and rising environmental energy", () => {
    const layer = new PerceptionLayer({
      smoothingAlpha: 1,
      transitionSensitivity: 0.01,
      now: () => Date.parse("2026-05-27T14:45:00.000Z"),
    });

    layer.observe({
      subject: "transition.environment",
      observedAt: "2026-05-27T14:45:00.000Z",
      signals: {
        volatility: { value: 1, normalized: true, role: "volatility" },
        energy: { value: 0, normalized: true, role: "energy" },
      },
    });
    const transition = layer.observe({
      subject: "transition.environment",
      observedAt: "2026-05-27T14:46:00.000Z",
      signals: {
        volatility: { value: 0, normalized: true, role: "volatility" },
        energy: { value: 1, normalized: true, role: "energy" },
      },
    });

    expect(transition.transition.labels).toEqual(
      expect.arrayContaining(["volatility-compressing", "energy-rising"]),
    );
  });

  it("covers low-participation normalization and timestamp fallbacks", () => {
    const layer = new PerceptionLayer({
      smoothingAlpha: 1,
      expectedSignalCount: 1,
      now: () => Date.parse("2026-05-27T15:00:00.000Z"),
    });

    const first = layer.observe({
      subject: "weightless.environment",
      observedAt: "not-a-date",
      signals: {
        single: {
          value: 42,
          role: "generic",
          weight: 0,
        },
      },
      events: [],
    });
    const second = layer.observe({
      subject: "weightless.environment",
      observedAt: 1_779_897_000_000,
      signals: {
        single: {
          value: 0,
          normalized: true,
          role: "generic",
          weight: 0,
        },
      },
    });

    expect(first.directionalBias).toBe(0);
    expect(first.metrics.confidence).toBeGreaterThan(0);
    expect(second.transition.labels.length).toBeGreaterThan(0);
  });
});
