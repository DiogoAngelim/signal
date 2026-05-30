import { describe, expect, it } from "vitest";
import {
  evaluateResolve,
  resolveActionCommitment,
  resolveCommitment,
  type ResolveInput,
} from "./engine";

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
  blockedActions: 0,
  missingOutcomes: 0,
  similarSamples: 24,
  positiveOutcomes: 23,
  negativeOutcomes: 1,
};

describe("Resolve", () => {
  it("commits with full traceability when every upstream gate is strong", () => {
    const result = resolveCommitment({
      ...strongInput,
      createdAt: "2026-05-29T12:00:00.000Z",
    });

    expect(result.decision).toBe("commit");
    expect(result.commitmentLevel).toBe("full");
    expect(result.resolveScore).toBeGreaterThanOrEqual(result.requiredScore);
    expect(result.humanReviewRequired).toBe(false);
    expect(result.missingEvidence).toEqual([]);
    expect(result.traces).toHaveLength(9);
    expect(result.traces.every((trace) => trace.passed)).toBe(true);
    expect(result.metadata).toEqual({
      module: "resolve",
      version: "v1",
      createdAt: "2026-05-29T12:00:00.000Z",
    });
    expect(result.explanation).toContain("can commit");
  });

  it("keeps missing inputs deterministic and waits for evidence", () => {
    const result = resolveCommitment();

    expect(result.decision).toBe("wait");
    expect(result.commitmentLevel).toBe("watch");
    expect(result.metadata.createdAt).toBe("1970-01-01T00:00:00.000Z");
    expect(result.missingEvidence).toEqual([
      "Agency recommendation",
      "Agency trust",
      "Trust score",
      "Calibrated confidence",
      "Judgement reliability",
      "Outcome stability",
      "Data reliability",
      "Similar outcome sample",
    ]);
    expect(result.unlockConditions).toContain("Raise trust score to at least 70/100.");
    expect(result.explanation).toContain("waits");
  });

  it("treats reduced-size Agency approval as a limited commitment", () => {
    const result = resolveCommitment({
      ...strongInput,
      agencyRecommendation: "act_with_reduced_size",
      sizingMode: "limited",
    });

    expect(result.decision).toBe("commit");
    expect(result.commitmentLevel).toBe("limited");
    expect(result.humanReviewRequired).toBe(false);
  });

  it("uses configurable thresholds to permit a lower-confidence watchful commit", () => {
    const result = resolveCommitment({
      ...strongInput,
      agencyTrust: 66,
      trustScore: 66,
      calibratedConfidence: 61,
      judgementReliability: 62,
      outcomeStability: 61,
      dataReliability: 72,
      riskScore: 45,
      overfitRisk: 32,
      beliefFragility: 40,
      sizingMode: "micro",
      thresholds: {
        minCommitScore: 60,
        minAgencyTrust: 60,
        minTrustScore: 60,
        minCalibratedConfidence: 58,
        minJudgementReliability: 60,
        minSimilarSamples: 4,
      },
    });

    expect(result.decision).toBe("commit");
    expect(result.commitmentLevel).toBe("limited");
    expect(result.requiredScore).toBe(60);
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

    expect(result.decision).toBe("commit");
    expect(result.commitmentLevel).toBe("limited");
    expect(result.resolveScore).toBeLessThan(82);
  });

  it("uses a graduated commitment level for strong but not full-sized action", () => {
    const result = resolveCommitment({
      ...strongInput,
      sizingMode: "small",
      agencyTrust: 84,
      trustScore: 84,
      calibratedConfidence: 82,
      judgementReliability: 83,
      outcomeStability: 82,
      dataReliability: 90,
      riskScore: 28,
      overfitRisk: 20,
      beliefFragility: 20,
    });

    expect(result.decision).toBe("commit");
    expect(result.commitmentLevel).toBe("graduated");
  });

  it("escalates when Agency requires human review even when other signals are strong", () => {
    const result = resolveCommitment({
      ...strongInput,
      agencyRecommendation: "requires_human_review",
      evidence: {
        humanReviewRequired: true,
        unlockConditions: ["Human reviewer must approve the boundary."],
      },
    });

    expect(result.decision).toBe("escalate");
    expect(result.commitmentLevel).toBe("none");
    expect(result.humanReviewRequired).toBe(true);
    expect(result.unlockConditions).toContain("Resolve the human review requirement before commitment.");
    expect(result.unlockConditions).toContain("Human reviewer must approve the boundary.");
    expect(result.explanation).toContain("escalates");
  });

  it("rejects when Agency denies the action", () => {
    const result = resolveCommitment({
      ...strongInput,
      agencyRecommendation: "denied",
    });

    expect(result.decision).toBe("reject");
    expect(result.commitmentLevel).toBe("none");
    expect(result.explanation).toContain("rejects");
  });

  it("rejects low trust and low confidence without pretending missing evidence is enough", () => {
    const result = resolveCommitment({
      ...strongInput,
      agencyRecommendation: "observe",
      agencyTrust: 45,
      trustScore: 20,
      calibratedConfidence: 30,
      judgementReliability: 50,
      dataReliability: 80,
      similarSamples: 12,
    });

    expect(result.decision).toBe("reject");
    expect(result.traces.find((trace) => trace.id === "trust")?.passed).toBe(false);
  });

  it("invalidates when explicit invalidating evidence is present", () => {
    const result = resolveCommitment({
      ...strongInput,
      evidence: {
        invalidated: true,
        invalidationConditions: ["The external invariant failed."],
        createdAt: "2026-05-29T13:30:00.000Z",
      },
    });

    expect(result.decision).toBe("invalidate");
    expect(result.commitmentLevel).toBe("none");
    expect(result.metadata.createdAt).toBe("2026-05-29T13:30:00.000Z");
    expect(result.invalidationConditions).toContain("The external invariant failed.");
  });

  it("invalidates when enough similar outcomes turn net negative and unstable", () => {
    const result = resolveCommitment({
      ...strongInput,
      agencyRecommendation: "act",
      positiveOutcomes: 3,
      negativeOutcomes: 9,
      outcomeStability: 30,
    });

    expect(result.decision).toBe("invalidate");
    expect(result.invalidationConditions).toContain("Invalidate if similar outcomes turn net negative.");
  });

  it("waits rather than escalates when data reliability is moderately below threshold", () => {
    const result = resolveCommitment({
      ...strongInput,
      dataReliability: 62,
    });

    expect(result.decision).toBe("wait");
    expect(result.unlockConditions).toContain("Restore data reliability to at least 70/100.");
  });

  it("escalates when confidence is strong but data reliability is poor", () => {
    const result = resolveCommitment({
      ...strongInput,
      dataReliability: 35,
    });

    expect(result.decision).toBe("escalate");
    expect(result.missingEvidence).not.toContain("Data reliability");
    expect(result.unlockConditions).toContain("Restore data reliability to at least 70/100.");
  });

  it("escalates high trust when overfit risk is extreme", () => {
    const result = resolveCommitment({
      ...strongInput,
      overfitRisk: 80,
    });

    expect(result.decision).toBe("escalate");
    expect(result.unlockConditions).toContain("Reduce overfit risk to 35/100 or lower.");
  });

  it("waits when overfit risk is above policy but not extreme", () => {
    const result = resolveCommitment({
      ...strongInput,
      overfitRisk: 42,
    });

    expect(result.decision).toBe("wait");
    expect(result.commitmentLevel).toBe("watch");
  });

  it("escalates strong judgement with weak agency trust", () => {
    const result = resolveCommitment({
      ...strongInput,
      agencyRecommendation: "wait",
      agencyTrust: 48,
      judgementReliability: 90,
      outcomeStability: 88,
    });

    expect(result.decision).toBe("escalate");
    expect(result.missingEvidence).toContain("Agency trust");
  });

  it("downgrades high belief fragility and reports an unlock condition", () => {
    const result = resolveCommitment({
      ...strongInput,
      beliefFragility: 90,
    });

    expect(result.decision).toBe("escalate");
    expect(result.unlockConditions).toContain("Reduce belief fragility to 55/100 or lower.");
  });

  it("waits when risk is above policy or closed outcomes are missing", () => {
    const result = resolveCommitment({
      ...strongInput,
      riskScore: 85,
      missingOutcomes: 2,
    });

    expect(result.decision).toBe("wait");
    expect(result.missingEvidence).toContain("Closed outcomes");
    expect(result.unlockConditions).toContain("Reduce risk score to 70/100 or lower.");
    expect(result.unlockConditions).toContain("Close or evaluate missing outcomes before raising commitment.");
  });

  it("requires unblocked agency actions and trusted sizing capacity", () => {
    const blocked = resolveCommitment({
      ...strongInput,
      agencyRecommendation: "wait",
      blockedActions: 2,
    });
    const noSizingMode = resolveCommitment({
      ...strongInput,
      sizingMode: "none",
    });
    const zeroSuggestedExposure = resolveCommitment({
      ...strongInput,
      suggestedExposure: 0,
    });
    const zeroTrustedExposure = resolveCommitment({
      ...strongInput,
      maxTrustedExposure: 0,
    });

    expect(blocked.decision).toBe("escalate");
    expect(blocked.humanReviewRequired).toBe(true);
    expect(blocked.missingEvidence).toContain("Unblocked agency action");
    expect(noSizingMode.decision).toBe("wait");
    expect(noSizingMode.missingEvidence).toContain("Trusted sizing capacity");
    expect(zeroSuggestedExposure.missingEvidence).toContain("Trusted sizing capacity");
    expect(zeroTrustedExposure.missingEvidence).toContain("Trusted sizing capacity");
  });

  it("accepts 0-1 scores, custom evidence arrays, and unknown recommendations", () => {
    const result = resolveCommitment({
      ...strongInput,
      agencyRecommendation: "custom-review-state",
      agencyTrust: 0.9,
      trustScore: 0.85,
      calibratedConfidence: 0.82,
      rawConfidence: 0.9,
      judgementReliability: 0.8,
      dataReliability: 0.9,
      evidence: {
        missingEvidence: ["Domain-specific breadth"],
        unlockConditions: ["Broaden domain-specific evidence."],
      },
      createdAt: "not-a-date",
    });

    expect(result.decision).toBe("wait");
    expect(result.metadata.createdAt).toBe("1970-01-01T00:00:00.000Z");
    expect(result.missingEvidence).toContain("Domain-specific breadth");
    expect(result.unlockConditions).toContain("Broaden domain-specific evidence.");
  });

  it("waits when domain evidence declares a missing commitment boundary", () => {
    const result = resolveCommitment({
      ...strongInput,
      evidence: {
        missingEvidence: ["Independent confirmation from another evidence group"],
        unlockConditions: ["Add independent confirmation."],
      },
    });

    expect(result.decision).toBe("wait");
    expect(result.commitmentLevel).toBe("watch");
    expect(result.missingEvidence).toContain("Independent confirmation from another evidence group");
    expect(result.explanation).toContain("Independent confirmation");
  });

  it("waits on unknown agency recommendations with the generic observation boundary", () => {
    const result = resolveCommitment({
      ...strongInput,
      agencyRecommendation: "custom-review-state",
    });

    expect(result.decision).toBe("wait");
    expect(result.missingEvidence).toEqual([]);
    expect(result.unlockConditions).toEqual([]);
    expect(result.explanation).toContain("more evidence");
    expect(result.explanation).toContain("Keep observing");
  });

  it("adds Wisdom quality to Resolve traces when long-term learning evidence is present", () => {
    const result = resolveCommitment({
      ...strongInput,
      decisionQuality: 70,
      restrictionValue: 80,
      opportunityCost: 10,
    });
    const wisdomTrace = result.traces.find((trace) => trace.id === "wisdom");

    expect(wisdomTrace?.score).toBe(80);
    expect(wisdomTrace?.passed).toBe(true);
    expect(result.traces).toHaveLength(10);
  });

  it("keeps weak explicit Wisdom score as a Resolve unlock condition", () => {
    const result = resolveCommitment({
      ...strongInput,
      wisdomScore: 30,
    });

    expect(result.unlockConditions).toContain(
      "Improve Wisdom decision quality, restriction value, or opportunity cost before commitment.",
    );
  });

  it("escalates review recommendations even without explicit review evidence", () => {
    const result = resolveCommitment({
      ...strongInput,
      agencyRecommendation: "review",
    });

    expect(result.decision).toBe("escalate");
    expect(result.humanReviewRequired).toBe(true);
    expect(result.unlockConditions).toContain("Resolve the human review requirement before commitment.");
  });

  it("sanitizes invalid thresholds and trims custom evidence arrays", () => {
    const result = resolveCommitment({
      ...strongInput,
      thresholds: {
        minCommitScore: Number.NaN,
      },
      evidence: {
        missingEvidence: [null, "", "  ", "Independent policy confirmation"],
        unlockConditions: [null, "", "Confirm the policy boundary."],
        invalidationConditions: [null, "", "Invalidate if the policy boundary fails."],
      },
    });

    expect(result.requiredScore).toBe(0);
    expect(result.decision).toBe("wait");
    expect(result.missingEvidence).toEqual(["Independent policy confirmation"]);
    expect(result.unlockConditions).toEqual(["Confirm the policy boundary."]);
    expect(result.invalidationConditions).toContain("Invalidate if the policy boundary fails.");
  });

  it("exports stable aliases", () => {
    expect(evaluateResolve(strongInput).decision).toBe("commit");
    expect(resolveActionCommitment(strongInput).decision).toBe("commit");
  });
});
