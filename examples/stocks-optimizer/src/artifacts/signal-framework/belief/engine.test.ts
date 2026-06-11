import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateBelief as exportedEvaluateBelief,
  evaluateEvidence as exportedEvaluateEvidence,
} from "../index";
import {
  calculateBeliefFragility,
  calculateEvidenceAgreement,
  createBeliefReason,
  evaluateBelief,
  evaluateEvidence,
} from "./engine";

function expect<T>(actual: T) {
  return {
    toBe: (expected: unknown) => assert.equal(actual, expected),
    toEqual: (expected: unknown) => assert.deepEqual(actual, expected),
    toContain: (expected: unknown) =>
      assert.ok((actual as any).includes(expected)),
    toHaveLength: (expected: number) =>
      assert.equal((actual as any).length, expected),
    toMatchObject: (expected: unknown) =>
      assert.partialDeepStrictEqual(actual, expected),
    toBeGreaterThan: (expected: number) => assert.ok(Number(actual) > expected),
    toBeGreaterThanOrEqual: (expected: number) =>
      assert.ok(Number(actual) >= expected),
    toBeLessThan: (expected: number) => assert.ok(Number(actual) < expected),
    toBeLessThanOrEqual: (expected: number) =>
      assert.ok(Number(actual) <= expected),
    not: {
      toBe: (expected: unknown) => assert.notEqual(actual, expected),
    },
  };
}

const support = (
  name: string,
  strength = 90,
  confidence = 90,
  source = name,
  weight = 1,
) => ({
  name,
  direction: "support" as const,
  strength,
  confidence,
  source,
  weight,
  reason: `${name} supports the claim.`,
});

const contradict = (
  name: string,
  strength = 80,
  confidence = 90,
  source = name,
  weight = 1,
) => ({
  name,
  direction: "contradict" as const,
  strength,
  confidence,
  source,
  weight,
  reason: `${name} contradicts the claim.`,
});

const neutral = (name: string, strength = 55, confidence = 80) => ({
  name,
  direction: "neutral" as const,
  strength,
  confidence,
  reason: `${name} adds context.`,
});

describe("Signal Belief", () => {
  it("returns a justified belief when strong support is covered, trusted, and stable", () => {
    const result = evaluateBelief({
      claim: "The route should proceed.",
      priorConfidence: 60,
      uncertainty: 5,
      evidence: [
        support("direct observation", 92, 95, "sensor-a"),
        support("historical match", 88, 92, "memory"),
        support("independent check", 86, 90, "validator"),
      ],
    });

    expect(result.verdict).toBe("justified");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
    expect(result.trustworthiness).toBeGreaterThanOrEqual(70);
    expect(result.fragility).toBeLessThanOrEqual(35);
    expect(result.blockers).toEqual([]);
    expect(result.supportingEvidence.map((item) => item.name)).toEqual([
      "direct observation",
      "historical match",
      "independent check",
    ]);
    expect(result.reason).toContain("Belief is justified");
  });

  it("returns weak when support exists but does not clear justified coverage", () => {
    const result = evaluateBelief({
      claim: "The route may proceed.",
      evidence: [
        support("moderate observation", 64, 72),
        support("moderate memory", 62, 70),
        support("moderate validator", 60, 70),
      ],
    });

    expect(result.verdict).toBe("weak");
    expect(result.confidence).toBeGreaterThanOrEqual(55);
    expect(result.blockers).toEqual([]);
    expect(createBeliefReason(result)).toContain("Belief is weak");
  });

  it("returns contradicted when contradiction is stronger than support", () => {
    const result = evaluateBelief({
      claim: "The route should proceed.",
      evidence: [
        support("small support", 35, 80),
        contradict("large contradiction", 88, 95),
        contradict("independent contradiction", 82, 90),
      ],
    });

    expect(result.verdict).toBe("contradicted");
    expect(result.contradictionStrength).toBeGreaterThan(
      result.supportStrength,
    );
    expect(result.blockers).toContain(
      "Contradictory evidence is stronger than supporting evidence.",
    );
    expect(result.blockers).toContain("Contradictory evidence is strong.");
  });

  it("returns uncertain when evidence is too thin and fragile", () => {
    const result = evaluateBelief({
      claim: "The route should proceed.",
      uncertainty: 100,
      evidence: [support("weak low-confidence support", 10, 0)],
    });

    expect(result.verdict).toBe("uncertain");
    expect(result.fragility).toBeGreaterThan(65);
    expect(result.blockers).toContain("Belief is too fragile.");
    expect(result.blockers).toContain("Evidence coverage is insufficient.");
  });

  it("handles empty evidence as uncertain with a deterministic no-evidence reason", () => {
    const result = evaluateBelief({
      claim: "The route should proceed.",
      evidence: [],
    });

    expect(result.verdict).toBe("uncertain");
    expect(result.evidenceCoverage).toBe(0);
    expect(result.evidenceAgreement).toBe(0);
    expect(result.fragility).toBe(100);
    expect(result.blockers).toEqual(["No evidence was supplied."]);
    expect(result.reason).toContain("No directional evidence is available.");
  });

  it("scores strong support above weak support", () => {
    const strong = evaluateBelief({
      claim: "Strongly supported.",
      evidence: [
        support("trend", 95, 95),
        support("quality", 92, 92),
        support("agreement", 90, 90),
      ],
    });
    const weak = evaluateBelief({
      claim: "Weakly supported.",
      evidence: [
        support("trend", 55, 60),
        support("quality", 52, 60),
        support("agreement", 50, 60),
      ],
    });

    expect(strong.confidence).toBeGreaterThan(weak.confidence);
    expect(strong.supportStrength).toBeGreaterThan(weak.supportStrength);
  });

  it("strong contradiction prevents a justified verdict", () => {
    const result = evaluateBelief({
      claim: "The route should proceed.",
      contradictionTolerance: 30,
      evidence: [
        support("excellent support", 95, 95),
        support("second support", 92, 95),
        contradict("serious contradiction", 85, 90),
      ],
    });

    expect(result.verdict).not.toBe("justified");
    expect(
      result.warnings.some((warning) => warning.includes("exceeds tolerance")),
    ).toBe(true);
  });

  it("mixed evidence lowers agreement and increases fragility", () => {
    const supportOnly = evaluateBelief({
      claim: "Support only.",
      evidence: [
        support("support a", 80, 85, "a"),
        support("support b", 78, 85, "b"),
        support("support c", 76, 85, "c"),
      ],
    });
    const mixed = evaluateBelief({
      claim: "Mixed.",
      evidence: [
        support("support a", 80, 85, "a"),
        support("support b", 78, 85, "b"),
        contradict("contradiction", 70, 85, "c"),
      ],
    });

    expect(mixed.evidenceAgreement).toBeLessThan(supportOnly.evidenceAgreement);
    expect(mixed.fragility).toBeGreaterThan(supportOnly.fragility);
    expect(mixed.warnings).toContain(
      "Supporting and contradictory evidence are close.",
    );
  });

  it("neutral evidence contributes coverage without directional confidence", () => {
    const result = evaluateBelief({
      claim: "Neutral context only.",
      evidence: [
        neutral("watchlist presence", 70, 80),
        neutral("lifecycle stage", 60, 70),
        neutral("age", 50, 60),
      ],
    });

    expect(result.verdict).toBe("uncertain");
    expect(result.evidenceCoverage).toBeGreaterThan(0);
    expect(result.evidenceAgreement).toBe(50);
    expect(result.supportStrength).toBe(0);
    expect(result.contradictionStrength).toBe(0);
    expect(result.neutralEvidence).toHaveLength(3);
  });

  it("high uncertainty reduces trustworthiness and increases fragility", () => {
    const certain = evaluateBelief({
      claim: "Certain.",
      uncertainty: 0,
      evidence: [
        support("support a", 90, 90, "a"),
        support("support b", 90, 90, "b"),
        support("support c", 90, 90, "c"),
      ],
    });
    const uncertain = evaluateBelief({
      claim: "Uncertain.",
      uncertainty: 85,
      evidence: [
        support("support a", 90, 90, "a"),
        support("support b", 90, 90, "b"),
        support("support c", 90, 90, "c"),
      ],
    });

    expect(uncertain.trustworthiness).toBeLessThan(certain.trustworthiness);
    expect(uncertain.fragility).toBeGreaterThan(certain.fragility);
    expect(uncertain.verdict).not.toBe("justified");
    expect(
      uncertain.warnings.some((warning) =>
        warning.includes("Uncertainty is high"),
      ),
    ).toBe(true);
  });

  it("low evidence count reduces coverage and prevents a justified verdict", () => {
    const result = evaluateBelief({
      claim: "One piece of evidence.",
      minimumEvidenceCount: 4,
      evidence: [support("single support", 95, 95, "single")],
    });

    expect(result.evidenceCoverage).toBeLessThan(60);
    expect(result.verdict).not.toBe("justified");
    expect(result.warnings[0]).toContain(
      "Evidence count 1 is below minimum 4.",
    );
  });

  it("low evidence confidence reduces trust and is surfaced as a warning", () => {
    const result = evaluateBelief({
      claim: "Low confidence evidence.",
      evidence: [
        support("support a", 90, 30, "a"),
        support("support b", 90, 35, "b"),
        support("support c", 90, 40, "c"),
      ],
    });

    expect(result.trustworthiness).toBeLessThan(80);
    expect(
      result.warnings.some((warning) =>
        warning.includes("Average evidence confidence is low"),
      ),
    ).toBe(true);
  });

  it("one dominant source increases fragility", () => {
    const independent = evaluateBelief({
      claim: "Independent sources.",
      evidence: [
        support("support a", 80, 90, "a"),
        support("support b", 80, 90, "b"),
        support("support c", 80, 90, "c"),
      ],
    });
    const dominated = evaluateBelief({
      claim: "Dominated source.",
      evidence: [
        support("support a", 80, 90, "same"),
        support("support b", 80, 90, "same"),
        support("support c", 80, 90, "same"),
      ],
    });

    expect(dominated.fragility).toBeGreaterThan(independent.fragility);
    expect(
      dominated.warnings.some((warning) =>
        warning.includes("One evidence source dominates"),
      ),
    ).toBe(true);
  });

  it("prior confidence influences final confidence without overriding evidence", () => {
    const lowPrior = evaluateBelief({
      claim: "Prior low.",
      priorConfidence: 20,
      evidence: [
        support("support a", 75, 85, "a"),
        support("support b", 75, 85, "b"),
        support("support c", 75, 85, "c"),
      ],
    });
    const highPrior = evaluateBelief({
      claim: "Prior high.",
      priorConfidence: 90,
      evidence: [
        support("support a", 75, 85, "a"),
        support("support b", 75, 85, "b"),
        support("support c", 75, 85, "c"),
      ],
    });

    expect(highPrior.confidence).toBeGreaterThan(lowPrior.confidence);
    expect(highPrior.supportStrength).toBe(lowPrior.supportStrength);
  });

  it("produces deterministic audit output", () => {
    const input = {
      claim: "Audit determinism.",
      evidence: [
        support("support", 80, 90, "source-a"),
        contradict("contradiction", 40, 70, "source-b"),
        neutral("neutral", 55, 60),
      ],
    };
    const first = evaluateBelief(input);
    const second = evaluateBelief(input);

    expect(first.audit).toEqual(second.audit);
    expect(first.audit.steps).toEqual(second.audit.steps);
    expect(first.audit.normalized).toEqual(second.audit.normalized);
  });

  it("clamps invalid numeric values and normalizes invalid directions", () => {
    const evidence = evaluateEvidence({
      name: "",
      direction: "invalid" as any,
      strength: -10,
      confidence: Number.POSITIVE_INFINITY,
      weight: Number.NaN,
      metadata: { kept: true },
    });
    const result = evaluateBelief({
      claim: "",
      priorConfidence: Number.POSITIVE_INFINITY,
      uncertainty: 200,
      minimumEvidenceCount: -5,
      minimumCoverage: 120,
      contradictionTolerance: -1,
      evidence: [evidence as any],
    });

    expect(evidence).toMatchObject({
      name: "evidence",
      direction: "neutral",
      strength: 0,
      confidence: 50,
      weight: 1,
      weightedStrength: 0,
      metadata: { kept: true },
    });
    expect(result.claim).toBe("Unspecified claim");
    expect(result.uncertainty).toBe(100);
    expect(result.audit.normalized.priorConfidence).toBe(50);
    expect(result.audit.normalized.minimumEvidenceCount).toBe(1);
    expect(result.audit.normalized.minimumCoverage).toBe(100);
    expect(result.audit.normalized.contradictionTolerance).toBe(0);
  });

  it("exports the public Belief API from the framework index", () => {
    expect(exportedEvaluateEvidence(support("exported"))).toMatchObject({
      name: "exported",
      direction: "support",
    });
    expect(
      exportedEvaluateBelief({
        claim: "Exported belief works.",
        evidence: [
          support("support a", 90, 90, "a"),
          support("support b", 90, 90, "b"),
          support("support c", 90, 90, "c"),
        ],
      }).verdict,
    ).toBe("justified");
  });

  it("calculates agreement and fragility for direct helper calls", () => {
    const supportResult = evaluateEvidence(support("support", 80, 90));
    const contradictionResult = evaluateEvidence(
      contradict("contradiction", 80, 90),
    );
    const neutralResult = evaluateEvidence(neutral("neutral", 80, 90));

    expect(calculateEvidenceAgreement([])).toBe(0);
    expect(calculateEvidenceAgreement(undefined as any)).toBe(0);
    expect(calculateEvidenceAgreement([neutralResult])).toBe(50);
    expect(calculateEvidenceAgreement([supportResult])).toBe(100);
    expect(
      calculateEvidenceAgreement([supportResult, contradictionResult]),
    ).toBe(50);

    const fragile = calculateBeliefFragility(
      {
        claim: "Fragile.",
        uncertainty: 80,
        evidence: [support("support", 20, 10)],
      },
      [evaluateEvidence(support("support", 20, 10))],
    );
    const fallbackFragile = calculateBeliefFragility(
      { claim: "Fallback fragile.", evidence: [] },
      undefined as any,
    );
    expect(fragile).toBeGreaterThan(50);
    expect(fallbackFragile).toBe(100);
  });

  it("normalizes missing runtime fields defensively", () => {
    const evidence = evaluateEvidence({} as any);
    const result = evaluateBelief({} as any);

    expect(evidence).toMatchObject({
      name: "evidence",
      direction: "neutral",
      strength: 0,
      confidence: 50,
      weight: 1,
      reason: "evidence provides neutral evidence with strength 0/100.",
    });
    expect(result.claim).toBe("Unspecified claim");
    expect(result.audit.inputs.claim).toBe("");
    expect(result.audit.inputs.evidence).toEqual([]);
  });
});
