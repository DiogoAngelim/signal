import { describe, expect, it } from "vitest";
import { createFixtureMaritimeAdapters } from "../src/adapters.js";
import {
  MARITIME_OPERATION_NAMES,
  createMaritimeSignalApp,
  listMaritimeOperationContracts
} from "../src/signal.js";

const now = () => new Date("2026-06-03T12:04:00.000Z");

describe("Maritime Signal integration", () => {
  it("exposes query, mutation, and event contracts", () => {
    const contracts = listMaritimeOperationContracts();

    expect(contracts.filter((contract) => contract.kind === "query").map((contract) => contract.name)).toEqual(MARITIME_OPERATION_NAMES.queries);
    expect(contracts.filter((contract) => contract.kind === "mutation").map((contract) => contract.name)).toEqual(MARITIME_OPERATION_NAMES.mutations);
    expect(contracts.filter((contract) => contract.kind === "event").map((contract) => contract.name)).toEqual(MARITIME_OPERATION_NAMES.events);
    expect(contracts.find((contract) => contract.name === "maritime.feedback.submit.v1")?.idempotency).toBe("required");
  });

  it("records generated guides with events and decision memory", async () => {
    const app = createMaritimeSignalApp({
      adapters: createFixtureMaritimeAdapters("rough-sea"),
      now
    });

    const briefing = await app.getGuide("south-atlantic");
    const eventNames = app.events.list().map((event) => event.name);

    expect(briefing.guidanceLevel).toBe("urgent");
    expect(briefing.operation.envelopeId).toEqual(expect.any(String));
    expect(briefing.operation.generatedEventId).toEqual(expect.any(String));
    expect(briefing.decisionMemory.enabled).toBe(true);
    expect(eventNames).toContain("maritime.guide.generated.v1");
    expect(eventNames).toContain("maritime.risk.escalated.v1");
  });

  it("publishes source degradation events and records feedback idempotently", async () => {
    const app = createMaritimeSignalApp({
      adapters: createFixtureMaritimeAdapters("stale-evidence"),
      now
    });
    const briefing = await app.getGuide("valparaiso-coast-cl");

    const first = await app.submitFeedback({
      briefingId: briefing.id,
      helpful: true,
      idempotencyKey: "maritime-feedback-test"
    });
    const replay = await app.submitFeedback({
      briefingId: briefing.id,
      helpful: true,
      idempotencyKey: "maritime-feedback-test"
    });

    expect(app.events.list().map((event) => event.name)).toContain("maritime.source.degraded.v1");
    expect(replay.feedbackId).toBe(first.feedbackId);
    expect(app.events.list().filter((event) => event.name === "maritime.feedback.received.v1")).toHaveLength(1);
  });
});
