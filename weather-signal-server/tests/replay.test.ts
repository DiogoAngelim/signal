import { describe, expect, it } from "vitest";
import { InMemoryStore } from "../src/store/index.js";
import { ReplayService } from "../src/services/replay-service.js";

const store = new InMemoryStore({
  eventRetentionLimit: 5,
  decisionRetentionLimit: 5,
  resultRetentionLimit: 5,
  deliveryLogRetentionLimit: 5
});

const replay = new ReplayService(store);

describe("replay service", () => {
  it("returns recent events", () => {
    store.addEvent({
      protocol: "signal.weather.v1",
      kind: "event",
      name: "weather.alert.issued",
      messageId: "1",
      timestamp: new Date().toISOString(),
      source: { provider: "nws", regionId: "nyc" },
      payload: { ok: true }
    });

    const events = replay.getRecent(1);
    expect(events.length).toBe(1);
  });
});
