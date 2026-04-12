import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../src/policy/engine.js";

const risk = {
  regionId: "nyc",
  computedAt: new Date().toISOString(),
  dataConfidence: 0.9,
  precipitationRisk: { score: 0.8, level: "high", topDrivers: [] },
  floodRisk: { score: 0.7, level: "high", topDrivers: [] },
  windRisk: { score: 0.6, level: "elevated", topDrivers: [] },
  heatRisk: { score: 0.3, level: "guarded", topDrivers: [] },
  stormRisk: { score: 0.8, level: "high", topDrivers: [] },
  landslideRisk: { score: 0.5, level: "elevated", topDrivers: [] },
  compositeRisk: { score: 0.85, level: "critical", topDrivers: [] }
};

describe("policy engine", () => {
  it("escalates for severe alerts and high risk", () => {
    const decision = evaluatePolicy({
      regionId: "nyc",
      risk,
      alerts: [
        {
          provider: "nws",
          providerEventId: "A1",
          regionId: "nyc",
          hazards: ["flash_flood"],
          severity: "severe",
          certainty: "observed",
          urgency: "immediate",
          status: "active"
        }
      ]
    });

    expect(decision.decision).toBe("ESCALATE");
  });

  it("suppresses duplicates", () => {
    const decision = evaluatePolicy({
      regionId: "nyc",
      risk,
      alerts: [],
      isDuplicate: true
    });
    expect(decision.decision).toBe("SUPPRESS_DUPLICATE");
  });
});
