import { describe, expect, it } from "vitest";
import { normalizeNwsAlert } from "../../src/normalization/alerts.js";
import { nwsAlertIssuedFixture } from "../../src/fixtures/nws-alert-issued.js";

const region = {
  id: "nyc",
  name: "New York City",
  country: "US",
  latitude: 40.7128,
  longitude: -74.006,
  timezone: "America/New_York"
};

describe("alert normalization", () => {
  it("normalizes NWS alert", () => {
    const feature = nwsAlertIssuedFixture.features[0];
    const alert = normalizeNwsAlert({
      id: feature.id,
      properties: feature.properties
    }, region);
    expect(alert.provider).toBe("nws");
    expect(alert.hazards[0]).toBe("flash_flood");
    expect(alert.severity).toBe("severe");
    expect(alert.urgency).toBe("immediate");
  });
});
