import { describe, expect, it } from "vitest";
import {
  createFixtureAwareAdapters,
  createRegionService,
} from "../src/adapters.js";
import { attentionLabels } from "../src/contracts.js";
import {
  AWARE_OPERATION_NAMES,
  createAwareSignalApp,
  listAwareOperationContracts,
} from "../src/signal.js";

const now = () => new Date("2026-06-01T12:20:00.000Z");

describe("Aware Signal integration", () => {
  it("exposes the required query, mutation, and event contracts", () => {
    const contracts = listAwareOperationContracts();

    expect(
      contracts
        .filter((contract) => contract.kind === "query")
        .map((contract) => contract.name),
    ).toEqual(AWARE_OPERATION_NAMES.queries);
    expect(
      contracts
        .filter((contract) => contract.kind === "mutation")
        .map((contract) => contract.name),
    ).toEqual(AWARE_OPERATION_NAMES.mutations);
    expect(
      contracts
        .filter((contract) => contract.kind === "event")
        .map((contract) => contract.name),
    ).toEqual(AWARE_OPERATION_NAMES.events);
    expect(
      contracts.find((contract) => contract.name === "aware.feedback.submit.v1")
        ?.idempotency,
    ).toBe("required");
  });

  it("maps attention levels and prioritizes stronger risks first", async () => {
    const app = createAwareSignalApp({
      adapters: createFixtureAwareAdapters("multiple-simultaneous-risks"),
      now,
    });

    const briefing = await app.getBriefing("miami-fl");

    expect(briefing.attentionLevel).toBe("warning");
    expect(briefing.attentionLabel).toBe(attentionLabels.warning);
    expect(briefing.items.length).toBeGreaterThanOrEqual(3);
    expect(briefing.items[0]?.attentionLevel).toBe("warning");
    expect(briefing.items[0]?.rank).toBe(1);
    expect(briefing.items.every((item) => item.sources.length > 0)).toBe(true);
  });

  it("generates urgency briefings with events and decision memory", async () => {
    const app = createAwareSignalApp({
      regions: createRegionService(),
      adapters: createFixtureAwareAdapters("heat-warning-day"),
      now,
    });

    const briefing = await app.getBriefing("phoenix-az");
    const eventNames = app.events.list().map((event) => event.name);

    expect(briefing.attentionLevel).toBe("urgency");
    expect(briefing.operation.envelopeId).toEqual(expect.any(String));
    expect(briefing.operation.generatedEventId).toEqual(expect.any(String));
    expect(briefing.decisionMemory.enabled).toBe(true);
    expect(eventNames).toContain("aware.briefing.generated.v1");
    expect(eventNames).toContain("aware.risk.escalated.v1");
  });

  it("keeps degraded-mode responses cautious", async () => {
    const app = createAwareSignalApp({
      adapters: createFixtureAwareAdapters("source-unavailable"),
      now,
    });

    const briefing = await app.getBriefing("miami-fl");

    expect(briefing.degraded).toBe(true);
    expect(briefing.summary).toBe(
      "Evidence is limited, so this guidance is cautious.",
    );
    expect(
      briefing.items.some((item) => item.fallbackBehavior.includes("cautious")),
    ).toBe(true);
    expect(app.events.list().map((event) => event.name)).toContain(
      "aware.source.degraded.v1",
    );
  });

  it("records feedback idempotently", async () => {
    const app = createAwareSignalApp({
      adapters: createFixtureAwareAdapters("strong-uv-day"),
      now,
    });
    const briefing = await app.getBriefing("miami-fl");

    const first = await app.submitFeedback({
      briefingId: briefing.id,
      helpful: true,
      idempotencyKey: "feedback-test-key",
    });
    const replay = await app.submitFeedback({
      briefingId: briefing.id,
      helpful: true,
      idempotencyKey: "feedback-test-key",
    });

    expect(replay.feedbackId).toBe(first.feedbackId);
    expect(
      app.events
        .list()
        .filter((event) => event.name === "aware.feedback.received.v1"),
    ).toHaveLength(1);
  });
});
