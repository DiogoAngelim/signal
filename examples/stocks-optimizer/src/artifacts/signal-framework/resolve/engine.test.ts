import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCommitment, type ResolveInput } from "./engine";

const strongInput: ResolveInput = {
  actionName: "Open measured participation",
  agencyRecommendation: "act",
  agencyTrust: 96,
  trustScore: 96,
  calibratedConfidence: 94,
  rawConfidence: 95,
  judgementReliability: 95,
  outcomeStability: 94,
  overfitRisk: 6,
  riskScore: 8,
  dataReliability: 98,
  beliefConfidence: 94,
  beliefFragility: 6,
  sizingMode: "normal",
  suggestedExposure: 4,
  maxTrustedExposure: 6,
  similarSamples: 24,
  positiveOutcomes: 23,
  negativeOutcomes: 1,
};

describe("Resolve", () => {
  it("commits only when upstream Agency, Trust, Judgement, Risk, and sizing all pass", () => {
    const result = resolveCommitment(strongInput);

    assert.equal(result.decision, "commit");
    assert.equal(result.commitmentLevel, "full");
    assert.equal(result.humanReviewRequired, false);
    assert.equal(result.traces.length, 9);
    assert.ok(result.resolveScore >= result.requiredScore);
  });

  it("waits with missing evidence when inputs are incomplete", () => {
    const result = resolveCommitment();

    assert.equal(result.decision, "wait");
    assert.equal(result.commitmentLevel, "watch");
    assert.ok(result.missingEvidence.includes("Agency trust"));
    assert.ok(result.unlockConditions.some((condition) => condition.includes("trust score")));
  });

  it("treats reduced-size Agency approval as a limited commitment", () => {
    const result = resolveCommitment({
      ...strongInput,
      agencyRecommendation: "act_with_reduced_size",
      sizingMode: "limited",
    });

    assert.equal(result.decision, "commit");
    assert.equal(result.commitmentLevel, "limited");
    assert.equal(result.humanReviewRequired, false);
  });

  it("keeps low-scoring commits limited even when sizing is not micro", () => {
    const result = resolveCommitment({
      ...strongInput,
      agencyTrust: 55,
      trustScore: 55,
      calibratedConfidence: 52,
      rawConfidence: 55,
      judgementReliability: 55,
      outcomeStability: 60,
      dataReliability: 72,
      riskScore: 50,
      overfitRisk: 30,
      beliefFragility: 40,
      sizingMode: "small",
      thresholds: {
        minCommitScore: 50,
        minAgencyTrust: 50,
        minTrustScore: 50,
        minCalibratedConfidence: 50,
        minJudgementReliability: 50,
      },
    });

    assert.equal(result.decision, "commit");
    assert.equal(result.commitmentLevel, "limited");
    assert.ok(result.resolveScore < 82);
  });

  it("escalates human review and strong judgement with weak agency trust", () => {
    const review = resolveCommitment({
      ...strongInput,
      agencyRecommendation: "requires_human_review",
    });
    const weakAgency = resolveCommitment({
      ...strongInput,
      agencyRecommendation: "wait",
      agencyTrust: 42,
      judgementReliability: 90,
      outcomeStability: 88,
    });

    assert.equal(review.decision, "escalate");
    assert.equal(review.humanReviewRequired, true);
    assert.equal(weakAgency.decision, "escalate");
    assert.ok(weakAgency.missingEvidence.includes("Agency trust"));
  });

  it("rejects, invalidates, and downgrades unsafe states", () => {
    assert.equal(resolveCommitment({ ...strongInput, agencyRecommendation: "denied" }).decision, "reject");
    assert.equal(resolveCommitment({ ...strongInput, evidence: { invalidated: true } }).decision, "invalidate");
    assert.equal(resolveCommitment({ ...strongInput, dataReliability: 40 }).decision, "escalate");
    assert.equal(resolveCommitment({ ...strongInput, overfitRisk: 45 }).decision, "wait");
    assert.equal(resolveCommitment({ ...strongInput, beliefFragility: 90 }).decision, "escalate");
  });

  it("waits when app evidence names a missing commitment boundary", () => {
    const result = resolveCommitment({
      ...strongInput,
      evidence: {
        missingEvidence: ["Independent confirmation from another evidence group"],
        unlockConditions: ["Add independent confirmation."],
      },
    });

    assert.equal(result.decision, "wait");
    assert.ok(result.missingEvidence.includes("Independent confirmation from another evidence group"));
    assert.ok(result.unlockConditions.includes("Add independent confirmation."));
  });
});
