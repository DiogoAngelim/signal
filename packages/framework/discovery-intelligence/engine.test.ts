import { describe, expect, it } from "vitest";
import {
  evaluateDiscoveryIntelligence,
  evaluateDiscoveryMaturity,
  evaluateGovernanceEffectiveness,
  evaluateInstitutionalKnowledge,
  evaluateMetaLearning,
  evaluateOpportunityEconomics,
  type DecisionRecord,
  type DiscoveryRecord,
  type RestrictionRecord,
} from "./engine";

describe("discovery intelligence", () => {
  it("tracks lifecycle promotion, conversion, abandonment, and false discovery rates", () => {
    const maturity = evaluateDiscoveryMaturity([
      { id: "d1", stage: "EMERGING", value: 1 },
      { id: "d2", stage: "DETECTED", previousStage: "EMERGING" },
      { id: "d3", stage: "OBSERVED", previousStage: "DETECTED", novelty: 80 },
      { id: "d4", stage: "CONFIRMED", previousStage: "OBSERVED", novelty: 90 },
      { id: "d5", stage: "REPEATABLE", previousStage: "CONFIRMED" },
      { id: "d6", stage: "TRUSTED", previousStage: "REPEATABLE" },
      { id: "d7", stage: "INSTITUTIONAL", previousStage: "TRUSTED" },
      {
        id: "d8",
        stage: "OBSERVED",
        previousStage: "OBSERVED",
        abandoned: true,
        value: -1,
      },
    ]);

    expect(maturity.discoveryCount).toBe(8);
    expect(maturity.emerging).toBe(1);
    expect(maturity.detected).toBe(1);
    expect(maturity.observed).toBe(2);
    expect(maturity.confirmed).toBe(1);
    expect(maturity.repeatable).toBe(1);
    expect(maturity.trusted).toBe(1);
    expect(maturity.institutional).toBe(1);
    expect(maturity.promotionRate).toBe(75);
    expect(maturity.abandonmentRate).toBe(12.5);
    expect(maturity.falseDiscoveryRate).toBe(12.5);
    expect(maturity.noveltyConversionRate).toBe(50);
    expect(maturity.trustedConversionRate).toBe(25);
    expect(maturity.institutionalConversionRate).toBe(12.5);
    expect(maturity.maturityScore).toBeGreaterThan(35);
  });

  it("compares act, wait, reject, and restrict economics against realized outcomes", () => {
    const decisions: DecisionRecord[] = [
      {
        id: "a",
        action: "ACT",
        alternatives: { ACT: 12, WAIT: 4, REJECT: 0, RESTRICT: 6 },
      },
      {
        id: "b",
        action: "RESTRICT",
        alternatives: { ACT: 20, WAIT: 8, REJECT: 0, RESTRICT: 10 },
      },
      {
        id: "c",
        action: "WAIT",
        expectedValue: 10,
      },
      {
        id: "d",
        action: "REJECT",
        alternatives: { ACT: -8, WAIT: -2, REJECT: 0, RESTRICT: -1 },
      },
    ];
    const economics = evaluateOpportunityEconomics(decisions, [
      { id: "oa", decisionId: "a", value: 15 },
      { id: "ob", decisionId: "b", value: 9 },
      { id: "oc", decisionId: "c", reward: 5, cost: 1, loss: 0 },
      { id: "od", decisionId: "d", value: 0 },
    ]);

    expect(economics.actValue).toBe(37);
    expect(economics.waitValue).toBe(14);
    expect(economics.rejectValue).toBe(0);
    expect(economics.restrictValue).toBe(20);
    expect(economics.avoidedLoss).toBe(36);
    expect(economics.missedUpside).toBe(17);
    expect(economics.opportunityCost).toBe(-19);
    expect(economics.economicsScore).toBeGreaterThan(75);
  });

  it("audits governance as avoided loss minus missed upside", () => {
    const decisions: DecisionRecord[] = [
      {
        id: "good",
        action: "RESTRICT",
        alternatives: { ACT: -10, WAIT: -2, REJECT: 0, RESTRICT: 4 },
      },
      {
        id: "bad",
        action: "WAIT",
        alternatives: { ACT: 14, WAIT: 2, REJECT: 0, RESTRICT: 8 },
      },
      {
        id: "linked-by-opportunity",
        opportunityId: "o-3",
        action: "RESTRICT",
        alternatives: { ACT: -4, RESTRICT: 2 },
      },
    ];
    const restrictions: RestrictionRecord[] = [
      { id: "r1", type: "survival scar", decisionId: "good" },
      { id: "r2", type: "trust gate", decisionId: "bad" },
      { id: "r3", type: "readiness gate", opportunityId: "o-3" },
    ];
    const governance = evaluateGovernanceEffectiveness(restrictions, decisions, [
      { id: "og", decisionId: "good", value: 4 },
      { id: "ob", decisionId: "bad", value: 2 },
      { id: "oo", opportunityId: "o-3", value: 1 },
    ]);

    expect(governance.restrictions.map((item) => item.effectiveness)).toEqual([
      14, -12, 5,
    ]);
    expect(governance.helpfulRestrictions).toBe(2);
    expect(governance.harmfulRestrictions).toBe(1);
    expect(governance.score).toBeGreaterThan(65);
  });

  it("promotes reusable discoveries into institutional knowledge counts", () => {
    const institutional = evaluateInstitutionalKnowledge([
      { id: "d1", stage: "observed" },
      { id: "d2", institutionalStage: "knowledge" },
      { id: "d3", institutionalStage: "policy" },
      { id: "d4", institutionalStage: "standard" },
      { id: "d5", stage: "INSTITUTIONAL" },
    ]);

    expect(institutional.knowledgeCount).toBe(4);
    expect(institutional.policyCount).toBe(3);
    expect(institutional.standardCount).toBe(2);
    expect(institutional.institutionalCount).toBe(1);
    expect(institutional.institutionalizationScore).toBe(50);
  });

  it("calculates meta-learning trends from traces and outcome records", () => {
    const metaLearning = evaluateMetaLearning(
      [
        { id: "c1", metric: "calibration", value: 40, timestamp: 1 },
        { id: "c2", metric: "calibration", value: 55, timestamp: 2 },
        { id: "t1", metric: "trust", value: 60, timestamp: 1 },
        { id: "t2", metric: "trust", value: 65, timestamp: 2 },
        { id: "s1", metric: "survival", value: 80, timestamp: 1 },
        { id: "s2", metric: "survival", value: 70, timestamp: 2 },
        { id: "d1", metric: "decision quality", value: 45, timestamp: 1 },
        { id: "d2", metric: "decision quality", value: 60, timestamp: 2 },
        { id: "g1", metric: "governance", value: 50, timestamp: 1 },
        { id: "g2", metric: "governance", value: 70, timestamp: 2 },
      ],
      [
        {
          id: "o1",
          calibrationScore: 65,
          trustScore: 70,
          survivalScore: 72,
          decisionQuality: 66,
          governanceScore: 75,
          timestamp: 3,
        },
      ],
    );

    expect(metaLearning.calibrationTrend).toBe(20);
    expect(metaLearning.trustTrend).toBe(7.5);
    expect(metaLearning.survivalTrend).toBe(-9);
    expect(metaLearning.decisionQualityTrend).toBe(18);
    expect(metaLearning.governanceTrend).toBe(22.5);
    expect(metaLearning.score).toBe(61.8);
  });

  it("returns integrated recommendations without domain-specific assumptions", () => {
    const result = evaluateDiscoveryIntelligence({
      discoveries: [
        {
          id: "false",
          stage: "observed",
          abandoned: true,
          falseDiscovery: true,
          value: -3,
        },
        {
          id: "trusted",
          stage: "TRUSTED",
          previousStage: "REPEATABLE",
          institutionalStage: "knowledge",
        },
      ],
      decisions: [
        {
          id: "missed",
          action: "WAIT",
          alternatives: { ACT: 20, WAIT: 3, REJECT: 0, RESTRICT: 8 },
        },
      ],
      outcomes: [{ id: "outcome", decisionId: "missed", value: 3 }],
      restrictions: [
        {
          id: "gate",
          decisionId: "missed",
          type: "opportunity density gate",
          avoidedLoss: 0,
          missedUpside: 17,
        },
      ],
      traces: [
        { id: "m1", metric: "trust", value: 80, timestamp: 1 },
        { id: "m2", metric: "trust", value: 50, timestamp: 2 },
      ],
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.recommendations.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "reduce-false-discoveries",
        "reduce-caution-cost",
        "review-harmful-restrictions",
        "institutionalize-trusted-knowledge",
        "repair-meta-learning",
      ]),
    );
  });

  it("keeps scores bounded and preserves lifecycle count invariants", () => {
    for (let seed = 0; seed < 64; seed += 1) {
      const discoveries = generatedDiscoveries(seed);
      const decisions = generatedDecisions(seed);
      const result = evaluateDiscoveryIntelligence({
        discoveries,
        decisions,
        outcomes: generatedOutcomes(seed),
        restrictions: generatedRestrictions(seed),
        traces: generatedTraces(seed),
      });
      const countedStages =
        result.maturity.emerging +
        result.maturity.detected +
        result.maturity.observed +
        result.maturity.confirmed +
        result.maturity.repeatable +
        result.maturity.trusted +
        result.maturity.institutional;

      expect(countedStages).toBe(discoveries.length);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.maturity.maturityScore).toBeGreaterThanOrEqual(0);
      expect(result.maturity.maturityScore).toBeLessThanOrEqual(100);
      expect(result.economics.economicsScore).toBeGreaterThanOrEqual(0);
      expect(result.economics.economicsScore).toBeLessThanOrEqual(100);
      expect(result.governance.score).toBeGreaterThanOrEqual(0);
      expect(result.governance.score).toBeLessThanOrEqual(100);
      expect(result.metaLearning.score).toBeGreaterThanOrEqual(0);
      expect(result.metaLearning.score).toBeLessThanOrEqual(100);
      for (const restriction of result.governance.restrictions) {
        expect(restriction.effectiveness).toBe(
          restriction.avoidedLoss - restriction.missedUpside,
        );
      }
    }
  });

  it("normalizes flexible vocabularies, sparse links, and timestamp shapes", () => {
    const result = evaluateDiscoveryIntelligence({
      discoveries: [
        { id: "i", stage: "institutionalized", institutionalStage: "institutionalized" },
        { id: "t", stage: "trusted", institutionalStage: "standardized" },
        { id: "r", stage: "recurring", institutionalStage: "governance policy" },
        { id: "v", stage: "validated", institutionalStage: "known" },
        { id: "a", stage: "active" },
        { id: "f", stage: "found" },
        { id: "u", stage: "unknown", trust: 20, value: -1, abandoned: true },
        { id: "tf", stage: "found", trust: 20, abandoned: true },
      ],
      decisions: [
        { id: "execute", action: "execute", expectedValue: 4 },
        { id: "hold", action: "hold", expectedValue: 4 },
        { id: "avoid", action: "avoid", expectedValue: -4 },
        { id: "scale", opportunityId: "s", action: "scale", expectedValue: 8 },
        { id: "unknown", action: "custom", expectedValue: 1 },
        { id: "loss-only", action: "wait", expectedValue: 2 },
        { id: "reward-only", action: "wait", expectedValue: 2 },
      ],
      outcomes: [
        { id: "execute-outcome", decisionId: "execute", value: 5 },
        { id: "hold-outcome", decisionId: "hold", reward: 2, cost: 1, loss: 0 },
        { id: "avoid-outcome", decisionId: "avoid", value: 0 },
        { id: "scale-outcome", opportunityId: "s", value: 3 },
        { id: "loss-only-outcome", decisionId: "loss-only", loss: 1 },
        { id: "reward-only-outcome", decisionId: "reward-only", reward: 2 },
      ],
      restrictions: [
        { id: "explicit", label: "Explicit restriction", avoidedLoss: 2, missedUpside: 1 },
        { id: "linked-outcome", opportunityId: "s" },
      ],
      traces: [
        { id: "unknown-metric", metric: "latency", value: 99 },
        { id: "date-object", metric: "calibration", value: 40, timestamp: new Date("2026-01-01T00:00:00.000Z") },
        { id: "date-string", metric: "calibration", value: 50, timestamp: "2026-01-02T00:00:00.000Z" },
        { id: "bad-date", metric: "trust", value: 10, timestamp: "not-a-date" },
        { id: "valid-date", metric: "trust", value: 20, timestamp: "2026-01-03T00:00:00.000Z" },
      ],
    });

    expect(result.maturity.institutional).toBe(1);
    expect(result.maturity.trusted).toBe(1);
    expect(result.maturity.repeatable).toBe(1);
    expect(result.maturity.confirmed).toBe(1);
    expect(result.maturity.observed).toBe(1);
    expect(result.maturity.detected).toBe(2);
    expect(result.maturity.emerging).toBe(1);
    expect(result.institutionalization.institutionalCount).toBe(1);
    expect(result.institutionalization.standardCount).toBe(2);
    expect(result.institutionalization.policyCount).toBe(3);
    expect(result.institutionalization.knowledgeCount).toBe(4);
    expect(result.governance.restrictions).toHaveLength(2);
    expect(result.metaLearning.calibrationTrend).toBe(10);
    expect(result.metaLearning.trustTrend).toBe(10);
  });

  it("treats empty input as a neutral unlearned layer", () => {
    const result = evaluateDiscoveryIntelligence();

    expect(result.score).toBe(0);
    expect(result.maturity.discoveryCount).toBe(0);
    expect(result.economics.opportunityCost).toBe(0);
    expect(result.governance.restrictions).toEqual([]);
    expect(result.institutionalization.institutionalizationScore).toBe(0);
    expect(result.metaLearning.score).toBe(0);
    expect(result.recommendations[0]?.id).toBe("maintain-learning-loop");
  });
});

function generatedDiscoveries(seed: number): DiscoveryRecord[] {
  const stages = [
    "EMERGING",
    "DETECTED",
    "OBSERVED",
    "CONFIRMED",
    "REPEATABLE",
    "TRUSTED",
    "INSTITUTIONAL",
  ];

  return stages.map((stage, index) => ({
    id: `${seed}:d:${index}`,
    stage,
    previousStage: stages[Math.max(0, index - 1)],
    novelty: (seed * 13 + index * 7) % 100,
    value: ((seed + index) % 5) - 2,
    abandoned: (seed + index) % 11 === 0,
    falseDiscovery: (seed + index) % 17 === 0,
    institutionalStage:
      index >= 6
        ? "institutional"
        : index >= 5
          ? "policy"
          : index >= 4
            ? "knowledge"
            : "discovery",
  }));
}

function generatedDecisions(seed: number): DecisionRecord[] {
  const actions = ["ACT", "WAIT", "REJECT", "RESTRICT"];
  return actions.map((action, index) => ({
    id: `${seed}:decision:${index}`,
    action,
    expectedValue: ((seed + index) % 9) - 2,
    alternatives: {
      ACT: ((seed * 3 + index) % 20) - 8,
      WAIT: ((seed * 5 + index) % 12) - 4,
      REJECT: 0,
      RESTRICT: ((seed * 7 + index) % 14) - 5,
    },
  }));
}

function generatedOutcomes(seed: number) {
  return generatedDecisions(seed).map((decision, index) => ({
    id: `${decision.id}:outcome`,
    decisionId: decision.id,
    value: ((seed * 11 + index) % 16) - 6,
    calibrationScore: 40 + ((seed + index) % 40),
    trustScore: 42 + ((seed + index * 2) % 38),
    survivalScore: 44 + ((seed + index * 3) % 36),
    decisionQuality: 46 + ((seed + index * 4) % 34),
    governanceScore: 48 + ((seed + index * 5) % 32),
    timestamp: index,
  }));
}

function generatedRestrictions(seed: number): RestrictionRecord[] {
  return generatedDecisions(seed).slice(0, 2).map((decision, index) => ({
    id: `${decision.id}:restriction`,
    type: index === 0 ? "survival scar" : "readiness gate",
    decisionId: decision.id,
  }));
}

function generatedTraces(seed: number) {
  const metrics = [
    "calibration",
    "trust",
    "survival",
    "decision quality",
    "governance",
  ];
  return metrics.flatMap((metric, index) => [
    {
      id: `${seed}:${metric}:early`,
      metric,
      value: 40 + ((seed + index) % 30),
      timestamp: 1,
    },
    {
      id: `${seed}:${metric}:late`,
      metric,
      value: 45 + ((seed + index * 2) % 35),
      timestamp: 2,
    },
  ]);
}
