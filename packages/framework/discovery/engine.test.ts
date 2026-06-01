import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  discover,
  type DiscoveryEvidence,
  type DiscoveryInput,
  type DiscoveryStatus,
} from "./engine";

const similarState = {
  demand: "high",
  reliability: 82,
  agreement: 76,
};

function positiveOutcome(id: string, score = 3) {
  return {
    id,
    state: similarState,
    success: true,
    score,
    evidence: [{ label: "Independent confirmation", direction: "support" as const, strength: 84 }],
    predictiveEvidence: ["Independent confirmation", "Stable state match"],
  };
}

function negativeOutcome(id: string) {
  return {
    id,
    state: similarState,
    success: false,
    score: -2,
    evidence: [{ label: "Weak persistence", direction: "support" as const, strength: 45 }],
    misleadingEvidence: ["Early spike"],
    failureModes: ["Weak persistence"],
    invalidationConditions: ["Prior failure mode returns."],
  };
}

function eligibleInput(overrides: Partial<DiscoveryInput> = {}): DiscoveryInput {
  return {
    subjectId: "subject-1",
    domain: "generic",
    state: similarState,
    candidates: [{
      id: "candidate-a",
      label: "Candidate A",
      score: 88,
      confidence: 86,
      previousScore: 70,
      persistence: 84,
      evidenceIds: ["support-1", "support-2"],
    }],
    evidence: [
      { ...evidence("support-1", "Independent confirmation", "support", 88, 86, "confirmation"), candidateId: "candidate-a" },
      evidence("support-2", "Persistent improvement", "support", 84, 82, "persistence"),
    ],
    historicalStates: [
      { id: "state-a", label: "Known constructive context", state: similarState },
      { id: "state-b", label: "Partial context", state: { demand: "low", reliability: 55, agreement: 50 } },
    ],
    priorOutcomes: [
      positiveOutcome("success-1"),
      positiveOutcome("success-2"),
      positiveOutcome("success-3"),
      { id: "neutral-1", state: similarState, outcome: "neutral", evidence: [{ label: "Neutral observation" }] },
    ],
    constraints: [
      { id: "required-confirmation", label: "Required confirmation", passed: true, severity: "high" },
    ],
    now: "2026-05-29T12:00:00.000Z",
    ...overrides,
  };
}

function evidence(
  id: string,
  label: string,
  direction: DiscoveryEvidence["direction"],
  strength: number,
  confidence = 70,
  group = "evidence",
): DiscoveryEvidence {
  return { id, label, direction, strength, confidence, group, weight: 100 };
}

function allScores(value: unknown, key = ""): number[] {
  if (typeof value === "number") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([childKey, childValue]) => {
    if (["weight", "contribution", "sampleSize", "similarOutcomes", "positiveOutcomes", "negativeOutcomes", "neutralOutcomes"].includes(childKey)) {
      return [];
    }
    return /score|confidence|trust|fragility|novelty|maturity|readiness|ratio|similarity|impact|strength|persistence|velocity|risk/i.test(childKey)
      ? allScores(childValue, childKey)
      : Array.isArray(childValue) || (childValue && typeof childValue === "object")
        ? allScores(childValue, key)
        : [];
  });
}

describe("Discovery", () => {
  it("returns safe deterministic defaults for empty input", () => {
    const result = discover({ state: {} });

    expect(result.status).toBe("none");
    expect(result.opportunities).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.trust).toBeGreaterThanOrEqual(0);
    expect(result.missingEvidence).toEqual([
      "current state",
      "candidate opportunity",
      "supporting evidence",
    ]);
    expect(result.metadata).toEqual({
      module: "discovery",
      version: "v1",
      createdAt: "1970-01-01T00:00:00.000Z",
    });
    expect(() => discover(undefined as unknown as DiscoveryInput)).not.toThrow();
    expect(discover({ state: null as unknown as Record<string, unknown> }).missingEvidence).toContain("current state");
  });

  it("detects no opportunity when evidence is weak", () => {
    const result = discover({
      state: { demand: "low", reliability: 30 },
      candidates: [{ id: "weak", score: 5, confidence: 10 }],
      evidence: [evidence("weak-support", "Thin signal", "support", 6, 10)],
      historicalStates: [{ id: "weak-history", state: { demand: "low", reliability: 31 } }],
      constraints: [{ id: "weak-constraint", passed: false, severity: "high" }],
      now: "not-a-date",
    });

    expect(result.status).toBe("none");
    expect(result.metadata.createdAt).toBe("1970-01-01T00:00:00.000Z");
    expect(result.recommendedNextStep).toContain("Wait");
  });

  it("detects an emerging opportunity when evidence improves but remains incomplete", () => {
    const result = discover(eligibleInput({
      candidates: [{
        id: "emerging",
        label: "Emerging candidate",
        score: 50,
        confidence: 58,
        previousScore: 30,
        persistence: 54,
      }],
      evidence: [evidence("support-1", "Early confirmation", "support", 70, 70)],
      priorOutcomes: [],
      constraints: [{
        id: "missing-independent-review",
        label: "Independent review",
        missingEvidence: "independent review",
      }],
    }));

    expect(result.status).toBe("emerging");
    expect(result.confidence).toBeLessThan(70);
    expect(result.missingEvidence).toContain("independent review");
    expect(result.lifecycle.velocity).toBeGreaterThan(50);
  });

  it("marks an opportunity eligible when evidence, memory, context, and foresight align", () => {
    const result = discover(eligibleInput());

    expect(result.status).toBe("eligible");
    expect(result.opportunities[0]?.status).toBe("eligible");
    expect(result.confidence).toBeGreaterThanOrEqual(78);
    expect(result.trust).toBeGreaterThan(70);
    expect(result.lifecycle.transitionReason).toContain("eligible");
    expect(result.foresight.safetyDrivers).toContain("Independent confirmation");
    expect(result.metadata.createdAt).toBe("2026-05-29T12:00:00.000Z");
  });

  it("penalizes confidence for missing evidence", () => {
    const complete = discover(eligibleInput());
    const incomplete = discover(eligibleInput({
      evidence: [
        evidence("support-1", "Independent confirmation", "support", 88, 86),
        { id: "support-2", label: "Persistent improvement", direction: "support", observed: false },
      ],
      constraints: [{ id: "required", passed: false, severity: "low", missingEvidence: ["persistent improvement"] }],
    }));

    expect(incomplete.confidence).toBeLessThan(complete.confidence);
    expect(incomplete.missingEvidence).toContain("Persistent improvement");
    expect(incomplete.missingEvidence).toContain("persistent improvement");
  });

  it("penalizes confidence for high novelty", () => {
    const familiar = discover(eligibleInput());
    const novel = discover(eligibleInput({ historicalStates: [] }));

    expect(novel.novelty).toBe(100);
    expect(novel.confidence).toBeLessThan(familiar.confidence);
    expect(novel.foresight.unlockConditions).toContain("Add historical states that resemble the current context.");
  });

  it("penalizes confidence for poor prior outcomes and remembers misleading evidence", () => {
    const positive = discover(eligibleInput());
    const poor = discover(eligibleInput({
      priorOutcomes: [
        negativeOutcome("failure-1"),
        negativeOutcome("failure-2"),
        negativeOutcome("failure-3"),
      ],
    }));

    expect(poor.memory.negativeOutcomes).toBe(3);
    expect(poor.memory.failureRatio).toBe(100);
    expect(poor.memory.mostMisleadingEvidence).toContain("Early spike");
    expect(poor.confidence).toBeLessThan(positive.confidence);
    expect(poor.invalidationConditions).toContain("Similar prior outcomes continue to fail more often than they succeed.");
  });

  it("reports contradictory evidence and invalidation counterfactuals", () => {
    const result = discover(eligibleInput({
      evidence: [
        evidence("support-1", "Independent confirmation", "support", 78, 76),
        evidence("contradiction-1", "Conflicting observation", "contradict", 82, 80),
      ],
      constraints: [{
        id: "stop-condition",
        passed: false,
        severity: "critical",
        invalidationCondition: "The primary assumption fails.",
        unlockCondition: "Repair the failed assumption.",
      }],
    }));

    expect(result.explanation.contradictoryEvidence[0]?.label).toBe("Conflicting observation");
    expect(result.foresight.counterfactuals.some((item) => item.type === "invalidate")).toBe(true);
    expect(result.invalidationConditions).toContain("The primary assumption fails.");
    expect(result.foresight.unlockConditions).toContain("Repair the failed assumption.");
  });

  it("produces lifecycle transitions including explicit sized, active, and closed stages", () => {
    const sized = discover(eligibleInput({
      candidates: [{ id: "sized", score: 80, confidence: 80, lifecycleStatus: "sized", previousScore: 66 }],
    }));
    const active = discover(eligibleInput({
      candidates: [{ id: "active", score: 82, confidence: 84, status: "active", previousScore: 72 }],
    }));
    const closed = discover(eligibleInput({
      candidates: [{ id: "closed", score: 55, confidence: 55, status: "closed", previousScore: 82 }],
    }));

    expect(sized.status).toBe("sized");
    expect(active.status).toBe("active");
    expect(closed.status).toBe("closed");
    expect(sized.lifecycle.previousStatus).toBe("strengthening");
    expect(active.lifecycle.transitionReason).toContain("active");
  });

  it("stays domain-agnostic and avoids disallowed domain wording in the module", () => {
    const source = readFileSync(new URL("./engine.ts", import.meta.url), "utf8").toLowerCase();
    const forbidden = ["sharpe", "portfolio", "binance", "crypto", "drawdown", "exposure", "ticker"];

    for (const word of forbidden) {
      expect(source.includes(word)).toBe(false);
    }
  });

  it("keeps all score outputs normalized and remains deterministic", () => {
    const input = eligibleInput({
      candidates: [{ id: "deterministic", score: 62, confidence: 64, previousScore: 62, persistence: 62 }],
      evidence: [
        evidence("neutral", "Neutral evidence", "neutral", 50, 50),
        { id: "negative-score", label: "Negative raw score", strength: -5 },
      ],
      priorOutcomes: [
        { candidateId: "deterministic", state: similarState, outcome: "positive" },
        { id: "numeric-positive", state: similarState, value: 2 },
        { id: "numeric-negative", state: similarState, value: -1 },
        { id: "named-success", state: similarState, outcome: "success" },
        { id: "named-failure", state: similarState, outcome: "failure" },
      ],
      constraints: [
        { id: "medium", passed: false, severity: "medium" },
        { id: "scored", score: 65 },
      ],
    });
    const first = discover(input);
    const second = discover(input);
    const statuses: DiscoveryStatus[] = ["none", "detected", "emerging", "strengthening", "eligible", "sized", "active", "closed"];

    expect(second).toEqual(first);
    expect(statuses).toContain(first.status);
    expect(allScores(first).every((value) => value >= 0 && value <= 100)).toBe(true);
    expect(first.traces).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "candidate" }),
      expect.objectContaining({ id: "final" }),
    ]));
  });

  it("builds aggregate opportunities and covers generic fallback paths", () => {
    const result = discover({
      subjectId: "aggregate-subject",
      domain: "ops",
      state: { demand: "high", ready: true, ignored: null },
      evidence: [
        {
          description: "Description-only support",
          source: "sensor",
          strength: 96,
          confidence: 92,
          weight: 0,
          predictive: true,
        },
        { id: "id-only", strength: 50, confidence: 50 },
        { id: "tie-evidence", label: "Tie evidence", strength: 50, confidence: 50 },
        { id: "score-negative", score: -2 },
      ],
      historicalStates: [
        { domain: "partial", state: { demand: "low", ready: false } },
        { id: "tie-b", label: "Tie B", state: { demand: "high", ready: true } },
        { id: "tie-a", label: "Tie A", state: { demand: "high", ready: true } },
        { id: "missing-state" },
        { state: { demand: "high", ready: true, ignored: null } },
      ],
      priorOutcomes: [{
        candidateId: "aggregate-subject",
        state: { demand: "high", ready: true },
        result: "valid",
        evidence: [{ id: "Description-only support" }],
      }, {
        state: { demand: "high", ready: true },
        outcome: "unknown",
        evidence: [{}],
      }, {
        outcome: "neutral",
        evidence: [{ label: "No state evidence" }],
      }],
      constraints: [{
        id: "default-severity",
        passed: false,
        missingEvidence: "operator review",
      }],
      now: new Date("2026-05-29T15:00:00.000Z"),
    });

    expect(result.opportunities[0]?.id).toBe("aggregate-subject");
    expect(result.opportunities[0]?.supportingEvidence[0]?.group).toBe("sensor");
    expect(result.contextMatch.some((match) => match.reason.includes("partially"))).toBe(true);
    expect(result.memory.positiveOutcomes).toBe(1);
    expect(result.missingEvidence).toContain("candidate opportunity");
    expect(result.missingEvidence).toContain("operator review");
    expect(result.metadata.createdAt).toBe("2026-05-29T15:00:00.000Z");
  });

  it("covers strengthening and fragile next-step branches without changing the public shape", () => {
    const strengthening = discover(eligibleInput({
      candidates: [{ id: "strengthening-next", score: 78, confidence: 78, previousScore: 56 }],
      priorOutcomes: [],
      constraints: [{ id: "ok", passed: true }],
    }));
    const fragile = discover(eligibleInput({
      candidates: [{ id: "fragile", score: 100, confidence: 100, previousScore: 70, lifecycleStatus: "emerging" }],
      evidence: [
        evidence("support-1", "Support remains", "support", 100, 100),
        evidence("contradict-1", "Major contradiction", "contradict", 79, 79),
      ],
      historicalStates: [],
      priorOutcomes: [],
      constraints: [{ id: "hard-stop", passed: false, severity: "critical" }],
    }));
    const emptySimilarity = discover({
      state: {},
      candidates: [{ id: "empty-context", score: 50, confidence: 50 }],
      evidence: [evidence("support-empty", "Support", "support", 60, 60)],
      historicalStates: [{ id: "empty", state: {} }],
    });
    const fallbackCandidateFields = discover(eligibleInput({
      candidates: [
        { candidateId: "candidate-id-only", kind: "Kind Label", strength: 68, trust: 70 },
        { subjectId: "subject-id-only", maturity: 66, readiness: 67 },
        { score: 64, confidence: 64 },
        { id: "aaa-tie", score: 64, confidence: 64 },
      ],
      priorOutcomes: [],
    }));
    const anonymousAggregate = discover({
      state: { ready: true },
      evidence: [evidence("aggregate-support", "Aggregate support", "support", 95, 95)],
      historicalStates: [{ state: { ready: true } }],
      constraints: [{ id: "ok", passed: true }],
    });
    const oneMissing = discover(eligibleInput({
      candidates: [{ id: "one-missing", score: 66, confidence: 66 }],
      evidence: [evidence("support-1", "Scoped elsewhere", "support", 68, 68, "scope")].map((item) => ({
        ...item,
        candidateId: "other-candidate",
      })),
      priorOutcomes: [],
      constraints: [{ id: "one-required", missingEvidence: "single missing check" }],
    }));

    expect(strengthening.status).toBe("strengthening");
    expect(strengthening.recommendedNextStep).toContain("Keep tracking");
    expect(fragile.fragility).toBeGreaterThanOrEqual(70);
    expect(fragile.recommendedNextStep).toContain("Reduce fragility");
    expect(emptySimilarity.contextMatch[0]?.similarity).toBe(0);
    expect(fallbackCandidateFields.opportunities.map((item) => item.id)).toEqual([
      "candidate-id-only",
      "subject-id-only",
      "aaa-tie",
      "candidate:3",
    ]);
    expect(fallbackCandidateFields.opportunities[0]?.label).toBe("Kind Label");
    expect(anonymousAggregate.opportunities[0]?.label).toBe("Aggregate opportunity");
    expect(oneMissing.lifecycle.transitionReason).toContain("1 missing evidence item.");
    expect((oneMissing.opportunities[0]?.supportingEvidence[0] as any)?.candidateId).toBe("other-candidate");
  });
});
