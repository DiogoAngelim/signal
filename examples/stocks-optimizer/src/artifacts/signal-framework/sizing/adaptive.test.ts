import assert from "node:assert/strict";
import test from "node:test";
import { ADAPTIVE_SIZING_LADDER, sizeAdaptiveOpportunity } from "./adaptive";
import type { DetectedNeed } from "../types";

const increaseNeed: DetectedNeed = {
  needId: "increase-participation:70",
  category: "increase-participation",
  severity: 70,
  confidence: 80,
  explanation: "Alignment supports participation.",
  recommendations: [],
};

function base(overrides = {}) {
  return {
    targetRef: "target",
    opportunityQuality: 85,
    signalConfidence: 82,
    marketParticipation: 75,
    riskControl: 80,
    perceptionAlignment: 78,
    systemTrust: 84,
    discoveryStrength: 82,
    requestedCapacity: 25,
    availableCapacity: 25,
    maxCapacity: 25,
    needs: [increaseNeed],
    ...overrides,
  };
}

test("selects an explainable graduated ladder step inside generic sizing gates", () => {
  const result = sizeAdaptiveOpportunity(base());

  assert.equal(result.decision, "allowed");
  assert.equal(ADAPTIVE_SIZING_LADDER.includes(result.selectedLadderPct as any), true);
  assert.equal(result.size, result.selectedLadderPct);
  assert.equal(result.sizingRationale.length, 4);
  assert.equal(result.reasons.some((reason) => reason.includes("Selected ladder step")), true);
});

test("need detection can block sizing without bypassing hard risk controls", () => {
  const result = sizeAdaptiveOpportunity(base({
    needs: [{
      needId: "reduce-exposure:80",
      category: "reduce-exposure",
      severity: 80,
      confidence: 90,
      explanation: "Risk is too high.",
      recommendations: [],
    }],
  }));

  assert.equal(result.decision, "blocked");
  assert.equal(result.size, 0);
  assert.equal(result.audit.blockedBy?.includes("need:reduce-exposure"), true);
});

test("wait needs can also block adaptive sizing", () => {
  const result = sizeAdaptiveOpportunity(base({
    needs: [{
      needId: "wait:75",
      category: "wait",
      severity: 75,
      confidence: 80,
      explanation: "Signals conflict.",
      recommendations: [],
    }],
  }));

  expectSizingBlocked(result, "need:wait");
});

test("gather-evidence needs reduce sizing through soft constraints", () => {
  const result = sizeAdaptiveOpportunity(base({
    needs: [{
      needId: "gather-evidence:65",
      category: "gather-evidence",
      severity: 65,
      confidence: 50,
      explanation: "Evidence is thin.",
      recommendations: [],
    }],
  }));

  assert.equal(result.decision, "allowed");
  assert.equal(result.constraints.some((constraint) => constraint.id === "need:gather-evidence" && !constraint.passed), true);
});

test("custom ladders are normalized and sizing modes follow selected steps", () => {
  const micro = sizeAdaptiveOpportunity(base({ requestedCapacity: 1, availableCapacity: 1, maxCapacity: 1, ladder: [2, 1, 1, 0] }));
  const small = sizeAdaptiveOpportunity(base({ requestedCapacity: 10, availableCapacity: 10, maxCapacity: 10 }));
  const normal = sizeAdaptiveOpportunity(base({ requestedCapacity: 25, availableCapacity: 25, maxCapacity: 25 }));
  const highConviction = {
    opportunityQuality: 100,
    signalConfidence: 100,
    marketParticipation: 100,
    riskControl: 100,
    perceptionAlignment: 100,
    systemTrust: 100,
    discoveryStrength: 100,
    risk: 0,
  };
  const large = sizeAdaptiveOpportunity(base({ ...highConviction, requestedCapacity: 50, availableCapacity: 50, maxCapacity: 50 }));
  const maxSafe = sizeAdaptiveOpportunity(base({ ...highConviction, requestedCapacity: 100, availableCapacity: 100, maxCapacity: 100 }));
  const none = sizeAdaptiveOpportunity(base({ requestedCapacity: 0, availableCapacity: 0, maxCapacity: 0 }));

  assert.deepEqual(micro.ladder, [0, 1, 2]);
  assert.equal(micro.mode, "micro");
  assert.equal(small.mode, "small");
  assert.equal(normal.mode, "normal");
  assert.equal(large.mode, "large");
  assert.equal(maxSafe.mode, "maxSafe");
  assert.equal(none.mode, "none");
  assert.equal(none.normalizedSize, 0);
});

function expectSizingBlocked(result: ReturnType<typeof sizeAdaptiveOpportunity>, id: string) {
  assert.equal(result.decision, "blocked");
  assert.equal(result.audit.blockedBy?.includes(id), true);
}
