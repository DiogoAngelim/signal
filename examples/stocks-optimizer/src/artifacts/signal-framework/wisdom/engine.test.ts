import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DecisionOutcomeMemory,
  type DecisionOutcomeRecord,
  buildWisdomSummary,
  createWisdom,
  evaluateAgencyEffectiveness,
  evaluateCounterfactuals,
  evaluateDecisionQuality,
  evaluateDiscoveryMaturity,
  evaluateOpportunityEconomics,
  evaluatePortfolioIntelligence,
} from "./engine";

const decision: DecisionOutcomeRecord = {
  id: "decision-1",
  action: "commit",
  status: "delayed",
  realizedResult: { value: 6, adverseImpact: 2, confidence: 90 },
  alternatives: [
    {
      id: "reject",
      kind: "reject",
      counterfactualResult: { value: 0, adverseImpact: 0, confidence: 80 },
    },
    {
      id: "full",
      kind: "alternative",
      counterfactualResult: { value: 12, adverseImpact: 15, confidence: 70 },
    },
    {
      id: "wait",
      kind: "wait",
      delayHours: 24,
      counterfactualResult: { value: 8, adverseImpact: 4, confidence: 75 },
    },
  ],
};

describe("generic Wisdom module", () => {
  it("evaluates counterfactual decision quality and restriction value", () => {
    const result = evaluateCounterfactuals({ decision, history: [decision] });

    assert.equal(result.decisionQuality > 40, true);
    assert.equal(result.avoidedLoss > result.missedUpside, true);
    assert.equal(result.restrictionValue > 50, true);
    assert.equal(result.bestAlternative?.id, "full");
    assert.equal(result.contributors.decisionQuality.length > 0, true);
  });

  it("quantifies opportunity economics and caution cost", () => {
    const result = evaluateOpportunityEconomics({
      selected: "wait",
      action: { expectedReward: 10, expectedRisk: 2, confidence: 90 },
      wait: { expectedReward: 6, expectedRisk: 1, confidence: 90 },
      reject: { expectedReward: 0, expectedRisk: 0, confidence: 100 },
      scale: { expectedReward: 7, expectedRisk: 1.5, confidence: 90 },
    });

    assert.equal(result.bestOption, "action");
    assert.equal(result.urgencyCost > 0, true);
    assert.equal(result.opportunityCost > 0, true);
  });

  it("tracks discovery maturity lifecycle evidence", () => {
    const result = evaluateDiscoveryMaturity({
      now: "2026-05-30T00:00:00.000Z",
      discoveries: [
        {
          id: "trusted",
          detectedAt: "2026-04-01T00:00:00.000Z",
          confirmationCount: 6,
          recurrenceCount: 12,
          observationCount: 16,
          conversionCount: 10,
          successCount: 8,
          novelty: 82,
        },
        { id: "novel", detectedAt: "2026-05-29T00:00:00.000Z", novelty: 95 },
      ],
    });

    assert.equal(result.maturityScore > 0, true);
    assert.equal(result.recurrenceRate > 0, true);
    assert.equal(
      result.trustedDiscoveries.some((item) => item.id === "trusted"),
      true,
    );
    assert.deepEqual(
      result.lifecycle.map((item) => item.stage),
      [
        "Detected",
        "Observed",
        "Confirmed",
        "Repeatable",
        "Trusted",
        "Institutional",
      ],
    );
  });

  it("evaluates Agency effectiveness from approvals, blocks, interventions, and overrides", () => {
    const result = evaluateAgencyEffectiveness({
      events: [
        { action: "approved", realizedResult: { value: 8 } },
        {
          action: "blocked",
          realizedResult: { value: 0 },
          counterfactualResult: { value: -10 },
        },
        {
          action: "intervened",
          realizedResult: { value: 5 },
          baselineResult: { value: 1 },
        },
        {
          action: "overridden",
          realizedResult: { value: -2 },
          baselineResult: { value: -6 },
          frictionCost: 2,
        },
      ],
    });

    assert.equal(result.approvalQuality > 50, true);
    assert.equal(result.rejectionQuality > 50, true);
    assert.equal(result.interventionValue > 50, true);
    assert.equal(result.governanceEffectiveness > 50, true);
  });

  it("reasons over portfolio capital allocation quality", () => {
    const result = evaluatePortfolioIntelligence({
      opportunities: [
        {
          id: "a",
          expectedValue: 12,
          expectedRisk: 3,
          group: "alpha",
          upside: 16,
          downside: 4,
        },
        {
          id: "b",
          expectedValue: 8,
          expectedRisk: 2,
          group: "beta",
          upside: 11,
          downside: 3,
        },
        {
          id: "c",
          expectedValue: 4,
          expectedRisk: 6,
          group: "beta",
          upside: 6,
          downside: 9,
        },
      ],
      currentAllocations: { a: 45, b: 35, c: 0 },
      capitalConstraints: { availableCapital: 100 },
      correlationStructure: [{ left: "a", right: "b", correlation: 0.2 }],
    });

    assert.equal(result.concentrationRisk > 0, true);
    assert.equal(result.capitalEfficiency > 50, true);
    assert.equal(result.opportunityCoverage, 100);
    assert.equal(result.allocationQuality > 50, true);
  });

  it("persists outcomes and builds deterministic wisdom summaries", () => {
    const wisdom = createWisdom();
    const first = wisdom.recordOutcome(decision);
    wisdom.recordOutcome({
      id: "decision-2",
      action: "reject",
      status: "blocked",
      realizedResult: { value: 0, adverseImpact: 0 },
      alternatives: [
        {
          kind: "alternative",
          counterfactualResult: { value: -6, adverseImpact: 8 },
        },
      ],
    });
    const memory = new DecisionOutcomeMemory(largeMemoryDataset(80));
    const summaryA = buildWisdomSummary({ records: memory.all() });
    const summaryB = buildWisdomSummary({ records: memory.all() });

    assert.equal(first.memorySize, 1);
    assert.equal(wisdom.memory.find("decision-1")?.action, "commit");
    assert.deepEqual(summaryA, summaryB);
    assert.equal(
      summaryA.wisdomSummary[0].includes("Restrictions saved"),
      true,
    );
    assert.equal(memory.clear().length, 0);
  });

  it("keeps score bounds and deterministic replay across sparse evidence", () => {
    const sparse = evaluateDecisionQuality();
    const stronger = evaluateCounterfactuals({
      decision: {
        ...decision,
        realizedResult: { value: 10, adverseImpact: 1 },
      },
    });
    const weaker = evaluateCounterfactuals({
      decision: { ...decision, realizedResult: { value: 1, adverseImpact: 4 } },
    });

    assert.equal(
      sparse.decisionQuality >= 0 && sparse.decisionQuality <= 100,
      true,
    );
    assert.equal(sparse.wisdomScore >= 0 && sparse.wisdomScore <= 100, true);
    assert.equal(stronger.decisionQuality > weaker.decisionQuality, true);
    assert.deepEqual(
      evaluateCounterfactuals({ decision }),
      evaluateCounterfactuals({ decision }),
    );
  });
});

function largeMemoryDataset(size: number): DecisionOutcomeRecord[] {
  return Array.from({ length: size }, (_, index) => ({
    id: `memory-${index}`,
    action: index % 3 === 0 ? "approve" : "wait",
    status:
      index % 5 === 0 ? "blocked" : index % 2 === 0 ? "approved" : "delayed",
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
