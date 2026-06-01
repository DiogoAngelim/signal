import { describe, expect, it } from "vitest";
import {
  DecisionOutcomeMemory,
  buildWisdomSummary,
  createWisdom,
  evaluateAgencyEffectiveness,
  evaluateCounterfactuals,
  evaluateDecisionQuality,
  evaluateDiscoveryMaturity,
  evaluateOpportunityEconomics,
  evaluatePortfolioIntelligence,
  recordOutcome,
  type DecisionOutcomeRecord,
} from "./engine";

const decision: DecisionOutcomeRecord = {
  id: "decision-1",
  action: "commit",
  status: "delayed",
  context: { source: "test" },
  realizedResult: { value: 6, adverseImpact: 2, confidence: 90 },
  alternatives: [
    {
      id: "do-nothing",
      kind: "do-nothing",
      expectedValue: 0,
      expectedRisk: 0,
      expectedConfidence: 90,
      counterfactualResult: { value: 0, adverseImpact: 0, confidence: 80 },
    },
    {
      id: "full-action",
      kind: "alternative",
      action: "full action",
      expectedReward: 12,
      expectedRisk: 15,
      expectedConfidence: 90,
      counterfactualResult: { value: 12, adverseImpact: 15, confidence: 70 },
    },
    {
      id: "wait-24h",
      kind: "wait",
      delayHours: 24,
      expectedReward: 8,
      expectedRisk: 4,
      expectedConfidence: 80,
      counterfactualResult: { value: 8, adverseImpact: 4, confidence: 75 },
    },
  ],
};

describe("Wisdom counterfactual intelligence", () => {
  it("scores actual outcomes against alternatives with contributor audits", () => {
    const result = evaluateCounterfactuals({
      decision,
      history: [decision],
    });

    expect(result.decisionQuality).toBeGreaterThan(40);
    expect(result.avoidedLoss).toBeGreaterThan(result.missedUpside);
    expect(result.restrictionValue).toBeGreaterThan(50);
    expect(result.bestAlternative?.id).toBe("full-action");
    expect(result.worstAlternative?.id).toBe("do-nothing");
    expect(result.contributors.decisionQuality.length).toBeGreaterThan(0);
    expect(result.formulas.join(" ")).toContain("decisionQuality");
  });

  it("is monotonic when the actual outcome improves", () => {
    const weak = evaluateCounterfactuals({
      decision: { ...decision, realizedResult: { value: 1, adverseImpact: 4 } },
    });
    const strong = evaluateCounterfactuals({
      decision: { ...decision, realizedResult: { value: 10, adverseImpact: 1 } },
    });

    expect(strong.decisionQuality).toBeGreaterThan(weak.decisionQuality);
    expect(strong.avoidedLoss).toBeGreaterThanOrEqual(weak.avoidedLoss);
  });

  it("handles sparse and contradictory evidence deterministically", () => {
    const sparse = evaluateCounterfactuals();
    const contradictory = evaluateCounterfactuals({
      decision: {
        action: "approve",
        status: "approved",
        realizedResult: { value: -8, adverseImpact: 10 },
        alternatives: [{ kind: "reject", counterfactualResult: { value: 0, adverseImpact: 0 } }],
      },
    });

    expect(sparse.decisionQuality).toBeGreaterThanOrEqual(0);
    expect(sparse.decisionQuality).toBeLessThanOrEqual(100);
    expect(contradictory.decisionQuality).toBeLessThan(50);
    expect(evaluateCounterfactuals({ decision: contradictoryRecord() })).toEqual(
      evaluateCounterfactuals({ decision: contradictoryRecord() }),
    );
  });
});

describe("Wisdom opportunity economics", () => {
  it("quantifies the cost of caution and scaling alternatives", () => {
    const result = evaluateOpportunityEconomics({
      selected: "wait",
      action: { expectedReward: 10, expectedRisk: 2, confidence: 90 },
      wait: { expectedReward: 6, expectedRisk: 1, confidence: 90 },
      reject: { expectedReward: 0, expectedRisk: 0, confidence: 100 },
      scale: { expectedReward: 7, expectedRisk: 1.5, confidence: 90 },
    });

    expect(result.actionValue).toBeGreaterThan(result.waitValue);
    expect(result.urgencyCost).toBeGreaterThan(0);
    expect(result.opportunityCost).toBeGreaterThan(0);
    expect(result.bestOption).toBe("action");
    expect(result.contributors.opportunityCost[0]?.reason).toContain("Best option");
  });
});

describe("Wisdom discovery maturity", () => {
  it("replaces raw discovery confidence with lifecycle evidence", () => {
    const result = evaluateDiscoveryMaturity({
      now: "2026-05-30T00:00:00.000Z",
      discoveries: [
        {
          id: "trusted-pattern",
          detectedAt: "2026-04-01T00:00:00.000Z",
          confirmationCount: 6,
          recurrenceCount: 12,
          observationCount: 16,
          conversionCount: 10,
          successCount: 8,
          novelty: 82,
        },
        {
          id: "new-pattern",
          detectedAt: "2026-05-29T00:00:00.000Z",
          confirmationCount: 0,
          recurrenceCount: 0,
          observationCount: 1,
          conversionCount: 0,
          novelty: 95,
        },
      ],
    });

    expect(result.maturityScore).toBeGreaterThan(0);
    expect(result.recurrenceRate).toBeGreaterThan(0);
    expect(result.noveltyPersistence).toBeGreaterThan(0);
    expect(result.trustedDiscoveries.some((item) => item.id === "trusted-pattern")).toBe(true);
    expect(result.lifecycle.map((item) => item.stage)).toEqual([
      "Detected",
      "Observed",
      "Confirmed",
      "Repeatable",
      "Trusted",
      "Institutional",
    ]);
  });
});

describe("Wisdom agency effectiveness", () => {
  it("measures whether Agency improves outcomes or adds friction", () => {
    const result = evaluateAgencyEffectiveness({
      events: [
        { action: "approved", realizedResult: { value: 8 } },
        { action: "blocked", realizedResult: { value: 0 }, counterfactualResult: { value: -10 } },
        { action: "intervened", realizedResult: { value: 5 }, baselineResult: { value: 1 } },
        { action: "overridden", realizedResult: { value: -2 }, baselineResult: { value: -6 }, frictionCost: 2 },
      ],
    });

    expect(result.approvalQuality).toBeGreaterThan(50);
    expect(result.rejectionQuality).toBeGreaterThan(50);
    expect(result.interventionValue).toBeGreaterThan(50);
    expect(result.governanceEffectiveness).toBeGreaterThan(50);
    expect(result.contributors.governanceEffectiveness.length).toBe(5);
  });
});

describe("Wisdom portfolio intelligence", () => {
  it("scores concentration, diversification, efficiency, coverage, and convexity", () => {
    const result = evaluatePortfolioIntelligence({
      opportunities: [
        { id: "a", expectedValue: 12, expectedRisk: 3, requiredCapital: 40, group: "alpha", upside: 16, downside: 4 },
        { id: "b", expectedValue: 8, expectedRisk: 2, requiredCapital: 30, group: "beta", upside: 11, downside: 3 },
        { id: "c", expectedValue: 4, expectedRisk: 6, requiredCapital: 20, group: "beta", upside: 6, downside: 9 },
      ],
      currentAllocations: { a: 45, b: 35, c: 0 },
      capitalConstraints: { availableCapital: 100 },
      correlationStructure: [{ left: "a", right: "b", correlation: 0.2 }],
    });

    expect(result.concentrationRisk).toBeGreaterThan(0);
    expect(result.diversificationQuality).toBeGreaterThan(0);
    expect(result.capitalEfficiency).toBeGreaterThan(50);
    expect(result.opportunityCoverage).toBe(100);
    expect(result.allocationQuality).toBeGreaterThan(50);
  });
});

describe("Wisdom memory, integration, and replay", () => {
  it("persists outcomes and evaluates decision quality from memory", () => {
    const wisdom = createWisdom();
    const first = wisdom.recordOutcome(decision);
    const second = recordOutcome({
      memory: wisdom.memory,
      record: {
        id: "decision-2",
        action: "reject",
        status: "blocked",
        realizedResult: { value: 0, adverseImpact: 0 },
        alternatives: [{ kind: "alternative", counterfactualResult: { value: -6, adverseImpact: 8 } }],
      },
    });

    expect(first.memorySize).toBe(1);
    expect(second.memorySize).toBe(2);
    expect(wisdom.memory.find("decision-1")?.action).toBe("commit");
    expect(wisdom.evaluateDecisionQuality({ decision }).sourceModules).toContain("counterfactuals");
    expect(wisdom.buildWisdomSummary().wisdomSummary[0]).toContain("Restrictions saved");
  });

  it("supports loading, clearing, historical replay, and alternative replay", () => {
    const records = largeMemoryDataset(120);
    const memory = new DecisionOutcomeMemory(records);
    const summaryA = buildWisdomSummary({ records: memory.all() });
    const summaryB = buildWisdomSummary({ records: memory.all() });

    expect(summaryA).toEqual(summaryB);
    expect(summaryA.counterfactualReview.decisionQuality).toBeGreaterThanOrEqual(0);
    expect(memory.all()).toHaveLength(120);
    expect(memory.clear()).toEqual([]);
    expect(memory.load(records.slice(0, 3))).toHaveLength(3);
  });

  it("keeps every score bounded across property-style samples", () => {
    for (let index = 0; index < 40; index += 1) {
      const quality = evaluateDecisionQuality({
        decision: {
          action: "sample",
          status: index % 2 === 0 ? "approved" : "reduced-size",
          realizedResult: { value: index - 20, adverseImpact: Math.max(0, 20 - index) },
          alternatives: [
            { kind: "wait", counterfactualResult: { value: index / 2, adverseImpact: index % 7 } },
            { kind: "reject", counterfactualResult: { value: 0, adverseImpact: 0 } },
          ],
        },
        history: largeMemoryDataset(10),
      });

      expect(quality.decisionQuality).toBeGreaterThanOrEqual(0);
      expect(quality.decisionQuality).toBeLessThanOrEqual(100);
      expect(quality.wisdomScore).toBeGreaterThanOrEqual(0);
      expect(quality.wisdomScore).toBeLessThanOrEqual(100);
      expect(quality.learningConfidence).toBeGreaterThanOrEqual(0);
      expect(quality.learningConfidence).toBeLessThanOrEqual(100);
    }
  });
});

function contradictoryRecord(): DecisionOutcomeRecord {
  return {
    action: "approve",
    status: "approved",
    realizedResult: { value: -8, adverseImpact: 10 },
    alternatives: [{ kind: "reject", counterfactualResult: { value: 0, adverseImpact: 0 } }],
  };
}

function largeMemoryDataset(size: number): DecisionOutcomeRecord[] {
  return Array.from({ length: size }, (_, index) => ({
    id: `memory-${index}`,
    action: index % 3 === 0 ? "approve" : "wait",
    status: index % 5 === 0 ? "blocked" : index % 2 === 0 ? "approved" : "delayed",
    realizedResult: {
      value: index % 5 === 0 ? 0 : 4 + (index % 7),
      adverseImpact: index % 5 === 0 ? 1 : index % 4,
    },
    alternatives: [
      {
        id: `memory-${index}-full`,
        kind: "alternative",
        counterfactualResult: {
          value: 6 + (index % 9),
          adverseImpact: index % 5 === 0 ? 12 : index % 6,
        },
      },
      {
        id: `memory-${index}-wait`,
        kind: "wait",
        counterfactualResult: {
          value: 3 + (index % 4),
          adverseImpact: index % 2,
        },
      },
    ],
  }));
}
