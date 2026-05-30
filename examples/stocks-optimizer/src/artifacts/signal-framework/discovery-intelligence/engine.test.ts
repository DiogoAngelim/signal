import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
  it("tracks lifecycle promotion and false discovery detection", () => {
    const maturity = evaluateDiscoveryMaturity([
      { id: "d1", stage: "EMERGING" },
      { id: "d2", stage: "DETECTED", previousStage: "EMERGING" },
      { id: "d3", stage: "OBSERVED", previousStage: "DETECTED", novelty: 80 },
      { id: "d4", stage: "CONFIRMED", previousStage: "OBSERVED", novelty: 90 },
      { id: "d5", stage: "REPEATABLE", previousStage: "CONFIRMED" },
      { id: "d6", stage: "TRUSTED", previousStage: "REPEATABLE" },
      { id: "d7", stage: "INSTITUTIONAL", previousStage: "TRUSTED" },
      { id: "d8", stage: "OBSERVED", previousStage: "OBSERVED", abandoned: true, value: -1 },
    ]);

    assert.equal(maturity.discoveryCount, 8);
    assert.equal(maturity.observed, 2);
    assert.equal(maturity.promotionRate, 75);
    assert.equal(maturity.falseDiscoveryRate, 12.5);
    assert.equal(maturity.noveltyConversionRate, 50);
    assert.equal(maturity.institutionalConversionRate, 12.5);
  });

  it("calculates opportunity cost across act, wait, reject, and restrict", () => {
    const decisions: DecisionRecord[] = [
      { id: "a", action: "ACT", alternatives: { ACT: 12, WAIT: 4, REJECT: 0, RESTRICT: 6 } },
      { id: "b", action: "RESTRICT", alternatives: { ACT: 20, WAIT: 8, REJECT: 0, RESTRICT: 10 } },
      { id: "c", action: "WAIT", expectedValue: 10 },
      { id: "d", action: "REJECT", alternatives: { ACT: -8, WAIT: -2, REJECT: 0, RESTRICT: -1 } },
    ];
    const economics = evaluateOpportunityEconomics(decisions, [
      { id: "oa", decisionId: "a", value: 15 },
      { id: "ob", decisionId: "b", value: 9 },
      { id: "oc", decisionId: "c", reward: 5, cost: 1 },
      { id: "od", decisionId: "d", value: 0 },
    ]);

    assert.equal(economics.actValue, 37);
    assert.equal(economics.waitValue, 14);
    assert.equal(economics.restrictValue, 20);
    assert.equal(economics.avoidedLoss, 36);
    assert.equal(economics.missedUpside, 17);
    assert.equal(economics.opportunityCost, -19);
  });

  it("scores governance restrictions as avoided loss minus missed upside", () => {
    const decisions: DecisionRecord[] = [
      { id: "good", action: "RESTRICT", alternatives: { ACT: -10, WAIT: -2, REJECT: 0, RESTRICT: 4 } },
      { id: "bad", action: "WAIT", alternatives: { ACT: 14, WAIT: 2, REJECT: 0, RESTRICT: 8 } },
    ];
    const restrictions: RestrictionRecord[] = [
      { id: "r1", type: "survival scar", decisionId: "good" },
      { id: "r2", type: "trust gate", decisionId: "bad" },
    ];
    const governance = evaluateGovernanceEffectiveness(restrictions, decisions, [
      { id: "og", decisionId: "good", value: 4 },
      { id: "ob", decisionId: "bad", value: 2 },
    ]);

    assert.deepEqual(governance.restrictions.map((item) => item.effectiveness), [14, -12]);
    assert.equal(governance.helpfulRestrictions, 1);
    assert.equal(governance.harmfulRestrictions, 1);
  });

  it("promotes discoveries into institutional knowledge", () => {
    const institutional = evaluateInstitutionalKnowledge([
      { id: "d1", stage: "observed" },
      { id: "d2", institutionalStage: "knowledge" },
      { id: "d3", institutionalStage: "policy" },
      { id: "d4", institutionalStage: "standard" },
      { id: "d5", stage: "INSTITUTIONAL" },
    ]);

    assert.equal(institutional.knowledgeCount, 4);
    assert.equal(institutional.policyCount, 3);
    assert.equal(institutional.standardCount, 2);
    assert.equal(institutional.institutionalCount, 1);
    assert.equal(institutional.institutionalizationScore, 50);
  });

  it("calculates meta-learning trend quality", () => {
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

    assert.equal(metaLearning.calibrationTrend, 20);
    assert.equal(metaLearning.trustTrend, 7.5);
    assert.equal(metaLearning.survivalTrend, -9);
    assert.equal(metaLearning.decisionQualityTrend, 18);
    assert.equal(metaLearning.governanceTrend, 22.5);
  });

  it("uses long-history regime coverage as a capped intelligence signal", () => {
    const weak = evaluateDiscoveryIntelligence({
      discoveries: [{ id: "d1", stage: "OBSERVED" }],
      decisions: [{ id: "wait", action: "WAIT", alternatives: { ACT: 10, WAIT: 4, REJECT: 0, RESTRICT: 6 } }],
      outcomes: [{ id: "wait:outcome", decisionId: "wait", value: 4 }],
      restrictions: [],
      traces: [{ id: "regime", metric: "regime coverage", value: 35 }],
    });
    const broad = evaluateDiscoveryIntelligence({
      discoveries: [{ id: "d1", stage: "OBSERVED" }],
      decisions: [{ id: "wait", action: "WAIT", alternatives: { ACT: 10, WAIT: 4, REJECT: 0, RESTRICT: 6 } }],
      outcomes: [{ id: "wait:outcome", decisionId: "wait", value: 4 }],
      restrictions: [],
      traces: [],
      historyDepthScore: 96,
      regimeCoverageScore: 92,
      regimeDiversityScore: 90,
      sampleDiversityScore: 88,
    });

    assert.equal(weak.regimeCoverageScore, 35);
    assert.equal(broad.regimeCoverageScore, 92);
    assert.ok(broad.score > weak.score);
    assert.ok(weak.recommendations.some((item) => item.id === "expand-regime-coverage"));
  });

  it("keeps property-style invariants over generated generic records", () => {
    for (let seed = 0; seed < 32; seed += 1) {
      const discoveries = generatedDiscoveries(seed);
      const result = evaluateDiscoveryIntelligence({
        discoveries,
        decisions: generatedDecisions(seed),
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

      assert.equal(countedStages, discoveries.length);
      assert.ok(result.score >= 0 && result.score <= 100);
      for (const restriction of result.governance.restrictions) {
        assert.equal(restriction.effectiveness, restriction.avoidedLoss - restriction.missedUpside);
      }
    }
  });

  it("emits framework-level recommendations and empty-state guidance", () => {
    const result = evaluateDiscoveryIntelligence({
      discoveries: [
        { id: "false", stage: "observed", abandoned: true, falseDiscovery: true, value: -3 },
        { id: "trusted", stage: "TRUSTED", previousStage: "REPEATABLE", institutionalStage: "knowledge" },
      ],
      decisions: [
        { id: "missed", action: "WAIT", alternatives: { ACT: 20, WAIT: 3, REJECT: 0, RESTRICT: 8 } },
      ],
      outcomes: [{ id: "outcome", decisionId: "missed", value: 3 }],
      restrictions: [
        { id: "gate", decisionId: "missed", type: "opportunity density gate", avoidedLoss: 0, missedUpside: 17 },
      ],
      traces: [
        { id: "m1", metric: "trust", value: 80, timestamp: 1 },
        { id: "m2", metric: "trust", value: 50, timestamp: 2 },
      ],
    });
    const empty = evaluateDiscoveryIntelligence();

    assert.deepEqual(
      result.recommendations.map((item) => item.id),
      [
        "reduce-false-discoveries",
        "reduce-caution-cost",
        "review-harmful-restrictions",
        "institutionalize-trusted-knowledge",
        "repair-meta-learning",
      ],
    );
    assert.equal(empty.recommendations[0]?.id, "maintain-learning-loop");
    assert.equal(empty.score, 0);
  });
});

function generatedDiscoveries(seed: number): DiscoveryRecord[] {
  const stages = ["EMERGING", "DETECTED", "OBSERVED", "CONFIRMED", "REPEATABLE", "TRUSTED", "INSTITUTIONAL"];
  return stages.map((stage, index) => ({
    id: `${seed}:d:${index}`,
    stage,
    previousStage: stages[Math.max(0, index - 1)],
    novelty: (seed * 13 + index * 7) % 100,
    value: ((seed + index) % 5) - 2,
    abandoned: (seed + index) % 11 === 0,
    falseDiscovery: (seed + index) % 17 === 0,
    institutionalStage: index >= 6 ? "institutional" : index >= 5 ? "policy" : index >= 4 ? "knowledge" : "discovery",
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
  const metrics = ["calibration", "trust", "survival", "decision quality", "governance"];
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
