import { describe, expect, it } from "vitest";
import { evaluateDecision } from "./pipeline";

const MODULES = [
  "discovery", "judgment", "purpose", "need", "trust",
  "reflection", "recovery", "memory", "learning", "calibration",
  "identity", "awareness", "agency",
] as const;

function decisionForScore(score: number) {
  return evaluateDecision({
    decisionId: `wait-consistency-${score}`,
    createdAt: "2026-11-14T00:00:00.000Z",
    observation: { candidate: "test-item" },
    action: { operation: "show-recommendation", item: "test-item" },
    modules: Object.fromEntries(MODULES.map((module) => [module, score])),
    prediction: {
      currentScore: score,
      expectedReward: score,
      expectedRisk: 100 - score,
      uncertainty: 100 - score,
      purposeAlignment: score,
      needAlignment: score,
      confidence: score,
    },
    wisdom: {
      expectedReward: score,
      downsideRisk: 100 - score,
      irreversibleRisk: 30,
      survivalPriority: 80,
      longTermAlignment: score,
      shortTermTemptation: score,
      uncertainty: 100 - score,
      confidence: score,
    },
  });
}

describe("decision action permission consistency", () => {
  it("never allows action or persists a proposed action at zero effective scale", () => {
    let waited = 0;
    let hadZeroScale = 0;
    for (let score = 25; score <= 95; score += 5) {
      const result = decisionForScore(score);
      expect(result.actionScale).toBeGreaterThanOrEqual(0);
      expect(result.actionScale).toBeLessThanOrEqual(1);
      expect(result.actionAllowed).toBe(result.actionScale > 0);
      if (result.actionScale === 0) {
        hadZeroScale += 1;
        expect(result.record.action).toBeUndefined();
      } else {
        expect(result.record.action).toMatchObject({
          operation: "show-recommendation",
        });
      }
      if (result.simulationRecommendation === "wait") {
        waited += 1;
        expect(result.actionAllowed).toBe(false);
        expect(result.actionScale).toBe(0);
        expect(result.record.action).toBeUndefined();
      }
    }
    expect(hadZeroScale).toBeGreaterThan(0);
    expect(waited).toBeGreaterThan(0);
  });

  it("keeps a fixed-input abstention deterministic", () => {
    const left = decisionForScore(75);
    const right = decisionForScore(75);
    expect([left.actionAllowed, left.actionScale, left.record.action]).toEqual([
      right.actionAllowed, right.actionScale, right.record.action,
    ]);
  });
});
