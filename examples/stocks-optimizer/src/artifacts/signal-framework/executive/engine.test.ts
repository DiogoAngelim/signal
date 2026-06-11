import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateCounterfactuals } from "../counterfactual/engine";
import { evaluateDecisionStates } from "../decision-states/engine";
import { evaluateDiscoveryAccountability } from "../discovery-accountability/engine";
import { evaluateExecutionQuality } from "../execution-quality/engine";
import { evaluateExecutiveDecision } from "./engine";

describe("generic executive decision architecture", () => {
  it("separates trust, permission, capacity, and urgency", () => {
    const states = evaluateDecisionStates({
      opportunity: 92,
      risk: 28,
      trustGovernor: {
        trustScore: 44,
        allowsNewExposure: true,
        requiresReview: true,
        maxExposure: 1,
      },
    });

    assert.equal(states.trust.status, "untrusted");
    assert.equal(states.permission.level, "review_required");
    assert.equal(states.capacity.mode, "micro");
    assert.equal(states.urgency.score > 70, true);
  });

  it("scores execution quality independently from asset quality", () => {
    const clean = evaluateExecutionQuality({
      entryQuality: 82,
      exitQuality: 78,
      liquidityQuality: 88,
      slippageRisk: 12,
      volatilityRisk: 24,
      timingUrgency: 84,
      scalingQuality: 75,
      invalidationClarity: 83,
    });
    const blocked = evaluateExecutionQuality({
      liquidityQuality: 10,
      staleDataRisk: 95,
      invalidationClarity: 12,
    });

    assert.equal(clean.recommendedExecutionMode, "normal");
    assert.equal(blocked.status, "blocked");
  });

  it("scores discovery accountability and counterfactual learning", () => {
    const accountability = evaluateDiscoveryAccountability({
      discovery: { status: "emerging", confidence: 54, maturity: 22 },
      events: [],
    });
    const counterfactual = evaluateCounterfactuals({
      actualDecision: { decision: "hold", confidence: 55, risk: 20 },
      ignoredRestrictionDecision: {
        decision: "buy",
        confidence: 70,
        opportunity: 78,
        risk: 92,
        maxExposure: 20,
      },
      restrictions: [{ reason: "Liquidity lock", avoidedLossScore: 80 }],
    });

    assert.equal(accountability.status, "immature");
    assert.equal(
      counterfactual.avoidedLossScore > counterfactual.missedUpsideScore,
      true,
    );
  });

  it("makes Executive the final synthesized authority", () => {
    const executionQuality = evaluateExecutionQuality({
      entryQuality: 76,
      exitQuality: 74,
      liquidityQuality: 82,
      slippageRisk: 18,
      volatilityRisk: 32,
      timingUrgency: 72,
      scalingQuality: 64,
      invalidationClarity: 80,
    });
    const decision = evaluateExecutiveDecision({
      proposedDecision: "buy",
      confidence: 78,
      opportunity: 82,
      risk: 30,
      belief: { confidence: 76, reason: "Belief supports action." },
      judgement: {
        adjustedConfidence: 74,
        reasons: ["Similar states were profitable."],
      },
      resolve: { decision: "commit", resolveScore: 77 },
      trust: {
        score: 74,
        status: "trusted",
        reasons: ["Historical reliability is stable."],
      },
      permission: {
        allowed: true,
        level: "limited",
        reasons: ["Reduced-size approval."],
      },
      capacity: { maxExposure: 4, mode: "reduced", reasons: ["Recovery cap."] },
      urgency: { score: 72, mode: "act_soon", reasons: ["Window is timely."] },
      executionQuality,
      historicalEvidence: ["Backtest and live shadow evidence agree."],
    });

    assert.equal(decision.decision, "buy");
    assert.equal(decision.participationMode, "limited");
    assert.equal(decision.maxExposure, 4);
    assert.equal(
      decision.strongestEvidence.includes(
        "Backtest and live shadow evidence agree.",
      ),
      true,
    );
  });

  it("blocks high-confidence actions when permission or execution is blocked", () => {
    const decision = evaluateExecutiveDecision({
      proposedDecision: "buy",
      confidence: 94,
      trust: {
        score: 90,
        status: "highly_trusted",
        reasons: ["Strong history."],
      },
      permission: {
        allowed: false,
        level: "blocked",
        reasons: ["Venue permission lock."],
      },
      capacity: {
        maxExposure: 25,
        mode: "normal",
        reasons: ["Capacity exists."],
      },
    });
    const executionBlocked = evaluateExecutiveDecision({
      proposedDecision: "buy",
      confidence: 80,
      trust: 82,
      capacity: 10,
      executionQuality: evaluateExecutionQuality({ liquidityQuality: 12 }),
    });

    assert.equal(decision.decision, "avoid");
    assert.equal(decision.trust, 90);
    assert.equal(decision.maxExposure, 0);
    assert.equal(executionBlocked.decision, "avoid");
    assert.equal(executionBlocked.primaryLimiter?.includes("Liquidity"), true);
  });
});
