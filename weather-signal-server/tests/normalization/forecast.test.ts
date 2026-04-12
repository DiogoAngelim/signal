import { describe, expect, it } from "vitest";
import { buildForecastSnapshot } from "../../src/normalization/forecast.js";
import { openMeteoFixture } from "../../src/fixtures/open-meteo.js";

const region = {
  id: "nyc",
  name: "New York City",
  country: "US",
  latitude: 40.7128,
  longitude: -74.006,
  timezone: "America/New_York"
};

describe("forecast normalization", () => {
  it("builds forecast snapshot metrics", () => {
    const snapshot = buildForecastSnapshot(region, "open-meteo", openMeteoFixture, "2024-01-01T00:00:00Z");
    expect(snapshot.regionId).toBe("nyc");
    expect(snapshot.metrics.precipitationMmNext6h).toBeGreaterThan(0);
    expect(snapshot.metrics.windGustKphMax).toBeGreaterThan(0);
    expect(snapshot.metrics.temperatureCMax).toBeGreaterThan(snapshot.metrics.temperatureCMin);
  });
});
