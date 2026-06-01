import { describe, expect, it } from "vitest";
import { evaluateDiscoveryAccountability } from "./engine";

describe("discovery accountability", () => {
  it("keeps emerging discovery immature until statistically confirmed", () => {
    const result = evaluateDiscoveryAccountability({
      discovery: { status: "emerging", confidence: 54, maturity: 22 },
      events: [],
    });

    expect(result.status).toBe("immature");
    expect(result.blockers).toContain("Discovery maturity is still immature.");
    expect(result.unlockConditions).toContain("Raise discovery maturity with more confirmed outcome samples.");
  });

  it("scores reliable early detection with novelty conversion", () => {
    const result = evaluateDiscoveryAccountability({
      now: "2026-05-30T00:00:00.000Z",
      discovery: { status: "strengthening", confidence: 78, maturity: 72, trust: 76 },
      events: [
        {
          detectedAt: "2026-05-20T00:00:00.000Z",
          confirmedAt: "2026-05-21T00:00:00.000Z",
          outcome: "positive",
          profitScore: 78,
          novelty: 70,
          wasEarly: true,
        },
        {
          detectedAt: "2026-05-22T00:00:00.000Z",
          confirmedAt: "2026-05-23T00:00:00.000Z",
          outcome: "positive",
          profitScore: 62,
          novelty: 60,
          wasEarly: true,
        },
      ],
    });

    expect(result.earlyDetectionAccuracy).toBe(100);
    expect(result.falseDiscoveryRate).toBe(0);
    expect(result.noveltyToProfitConversion).toBe(100);
    expect(result.status).not.toBe("immature");
  });

  it("penalizes false discoveries, missed opportunities, and rejected outcomes", () => {
    const result = evaluateDiscoveryAccountability({
      discovery: { status: "eligible", confidence: 65, maturity: 58 },
      events: [
        { outcome: "negative", wasFalseDiscovery: true, novelty: 80, profitScore: 10 },
        { outcome: "positive", novelty: 30, profitScore: 70 },
      ],
      missedOpportunities: [{ outcome: "missed", wasMissedOpportunity: true }],
      rejectedOutcomes: [{ outcome: "rejected", wasRejected: true, wasFalseDiscovery: true }],
    });

    expect(result.falseDiscoveryRate).toBeGreaterThan(30);
    expect(result.missedOpportunityRate).toBeGreaterThan(0);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it("explains trusted discovery and maps slow confirmation to its unlock", () => {
    const trusted = evaluateDiscoveryAccountability({
      now: "2026-05-30T00:00:00.000Z",
      discovery: { status: "trusted", confidence: 92, maturity: 90, trust: 90 },
      events: Array.from({ length: 10 }, (_, index) => ({
        detectedAt: `2026-05-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`,
        confirmedAt: `2026-05-${String(10 + index).padStart(2, "0")}T12:00:00.000Z`,
        outcome: "positive",
        profitScore: 82,
        novelty: 75,
        wasEarly: true,
      })),
    });
    const slow = evaluateDiscoveryAccountability({
      discovery: { status: "developing", confidence: 70, maturity: 72 },
      events: [
        { detectedAt: "2026-05-01T00:00:00.000Z", confirmedAt: "2026-05-20T00:00:00.000Z", outcome: "positive", profitScore: 80, novelty: 50, wasEarly: true },
      ],
    });

    expect(trusted.status).toBe("trusted");
    expect(trusted.blockers).toEqual([]);
    expect(trusted.explanation).toContain("with score");
    expect(slow.blockers).toContain("Confirmation latency is too slow for early discovery claims.");
    expect(slow.unlockConditions).toContain("Reduce confirmation latency with faster post-detection validation.");
  });
});
