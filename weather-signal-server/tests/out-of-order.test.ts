import { describe, expect, it } from "vitest";
import { InMemoryStore } from "../src/store/index.js";

const store = new InMemoryStore({
  eventRetentionLimit: 10,
  decisionRetentionLimit: 10,
  resultRetentionLimit: 10,
  deliveryLogRetentionLimit: 10
});

describe("out-of-order alerts", () => {
  it("ignores older updates", () => {
    const baseAlert = {
      provider: "nws",
      providerEventId: "A1",
      regionId: "nyc",
      hazards: ["flash_flood"],
      severity: "severe",
      certainty: "observed",
      urgency: "immediate",
      status: "active",
      sentAt: "2024-01-01T02:00:00Z"
    } as const;

    const newer = store.upsertAlert({ ...baseAlert, updatedAt: "2024-01-01T03:00:00Z" });
    const older = store.upsertAlert({ ...baseAlert, updatedAt: "2024-01-01T01:00:00Z" });

    expect(newer.changed).toBe(true);
    expect(older.changed).toBe(false);
  });
});
