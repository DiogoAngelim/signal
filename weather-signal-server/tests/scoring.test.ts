import { describe, expect, it } from "vitest";
import { computeRiskScore } from "../src/scoring/engine.js";

describe("scoring engine", () => {
  it("computes composite risk", () => {
    const risk = computeRiskScore({
      region: {
        id: "miami",
        name: "Miami",
        country: "US",
        latitude: 25.76,
        longitude: -80.19,
        timezone: "America/New_York",
        tags: ["coastal", "urban_dense"]
      },
      forecast: {
        fetchedAt: new Date().toISOString(),
        precipitationMmNext6h: 25,
        precipitationMmNext24h: 60,
        windGustKphMax: 80,
        temperatureCMax: 35,
        temperatureCMin: 20
      },
      alerts: []
    });

    expect(risk.compositeRisk.score).toBeGreaterThan(0.2);
    expect(risk.compositeRisk.level).toBeDefined();
  });
});
