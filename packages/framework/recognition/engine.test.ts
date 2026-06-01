import { describe, expect, it } from "vitest";
import {
  recognizeState,
  type RecognitionInput,
  type RecognitionSample,
} from "./engine";

const currentState = {
  phase: "constructive",
  strength: 82,
  pressure: 18,
  aligned: true,
  tags: ["confirmed", "persistent"],
};

function sample(id: string, overrides: Partial<RecognitionSample> = {}): RecognitionSample {
  return {
    id,
    state: currentState,
    value: 4,
    confidence: 80,
    ...overrides,
  };
}

function base(overrides: Partial<RecognitionInput> = {}): RecognitionInput {
  return {
    currentState,
    discovery: {
      confidence: 30,
      novelty: 90,
      memory: { similarOutcomes: 0, reliability: 20 },
      missingEvidence: ["similar closed outcomes"],
      invalidationConditions: ["Primary evidence stops recurring."],
    },
    judgement: {
      similarSampleSize: 1049,
      reliability: 88,
      outcomeStability: 91,
      evidence: {
        similarStates: 1049,
        positiveOutcomes: 910,
        negativeOutcomes: 80,
        neutralOutcomes: 59,
      },
    },
    now: "2026-05-29T12:00:00.000Z",
    ...overrides,
  };
}

function positiveSamples(count: number) {
  return Array.from({ length: count }, (_, index) => sample(`p-${index}`, { value: 3 + (index % 2) }));
}

function dissimilarSamples(count: number) {
  return Array.from({ length: count }, (_, index) => sample(`n-${index}`, {
    state: {
      phase: "unrelated",
      strength: 20 + index,
      pressure: 75,
      aligned: false,
      tags: ["different"],
    },
    value: index % 2 ? 1 : -1,
  }));
}

function allScores(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    if (/score|confidence|novelty|stability|outcomes|samples/i.test(key)) return allScores(child);
    return Array.isArray(child) || (child && typeof child === "object") ? allScores(child) : [];
  });
}

describe("Recognition", () => {
  it("recognizes a recurring state when Discovery calls it novel but Judgement has stable similar outcomes", () => {
    const result = recognizeState(base({
      outcomeSamples: positiveSamples(16),
    }));

    expect(result.verdict).toBe("recognized");
    expect(result.matchedSamples).toBe(16);
    expect(result.matchedPositiveOutcomes).toBe(16);
    expect(result.matchedNegativeOutcomes).toBe(0);
    expect(result.discoveryNoveltyJustified).toBe(false);
    expect(result.judgementSimilarityJustified).toBe(true);
    expect(result.archetype).toBe("stable_positive_state");
    expect(result.reason).toContain("stable linked outcomes");
    expect(result.metadata).toEqual({
      module: "recognition",
      version: "v1",
      createdAt: "2026-05-29T12:00:00.000Z",
    });
  });

  it("classifies valid novelty when comparable memory is broad and recurrence is weak", () => {
    const result = recognizeState(base({
      discovery: { confidence: 72, novelty: 88, memory: { similarOutcomes: 0, reliability: 75 } },
      judgement: { similarSampleSize: 0, reliability: 20, outcomeStability: 0 },
      historicalStates: dissimilarSamples(8),
    }));

    expect(result.verdict).toBe("novel");
    expect(result.discoveryNoveltyJustified).toBe(true);
    expect(result.judgementSimilarityJustified).toBe(false);
    expect(result.noveltyScore).toBeGreaterThanOrEqual(65);
    expect(result.matchedSamples).toBe(0);
  });

  it("reports conflict when Discovery novelty and Judgement similarity use incompatible definitions", () => {
    const broadMatches = Array.from({ length: 12 }, (_, index) => sample(`broad-${index}`, {
      state: { phase: "constructive" },
      value: 2,
    }));
    const result = recognizeState(base({ outcomeSamples: broadMatches }));

    expect(result.verdict).toBe("conflicted");
    expect(result.discoveryNoveltyJustified).toBe(true);
    expect(result.judgementSimilarityJustified).toBe(false);
    expect(result.missingEvidence).toContain("state-level evidence explaining Judgement similarity");
    expect(result.reason).toContain("broader than Recognition can justify");
  });

  it("returns insufficient evidence when current memory cannot justify novelty or recurrence", () => {
    const result = recognizeState({
      currentState,
      discovery: { confidence: 35, novelty: 85, memory: { similarOutcomes: 0 } },
    });

    expect(result.verdict).toBe("insufficient_evidence");
    expect(result.discoveryNoveltyJustified).toBe(false);
    expect(result.missingEvidence).toEqual(expect.arrayContaining([
      "historical state samples",
      "recurring state matches above the recognition threshold",
      "historical outcome linkage",
      "memory depth sufficient to justify novelty",
    ]));
  });

  it("partially recognizes high recurrence when outcome confidence is unstable", () => {
    const unstable = Array.from({ length: 12 }, (_, index) => sample(`unstable-${index}`, {
      value: index % 2 === 0 ? 100 : -100,
    }));
    const result = recognizeState(base({
      discovery: { confidence: 58, novelty: 25, memory: { similarOutcomes: 12, reliability: 70 } },
      judgement: { similarSampleSize: 12, reliability: 55, outcomeStability: 35 },
      outcomeSamples: unstable,
    }));

    expect(result.verdict).toBe("partially_recognized");
    expect(result.recurrenceConfidence).toBeGreaterThanOrEqual(50);
    expect(result.outcomeStability).toBeLessThan(60);
    expect(result.archetype).toBe("unstable_recurring_state");
  });

  it("does not accept high novelty with a low sample count as justified novelty", () => {
    const result = recognizeState(base({
      judgement: { similarSampleSize: 0, reliability: 0, outcomeStability: 0 },
      historicalStates: dissimilarSamples(1),
    }));

    expect(result.verdict).toBe("insufficient_evidence");
    expect(result.noveltyScore).toBeGreaterThan(65);
    expect(result.discoveryNoveltyJustified).toBe(false);
  });

  it("rejects broad Judgement matches when feature coverage is too low", () => {
    const broadSummaryOnly = Array.from({ length: 20 }, (_, index) => sample(`summary-${index}`, {
      state: undefined,
      similarity: index === 0 ? 92 : 0.92,
      featureCoverage: index === 0 ? 12 : 0.12,
      value: 2,
    }));
    const result = recognizeState(base({ similarOutcomeSamples: broadSummaryOnly }));

    expect(result.verdict).toBe("conflicted");
    expect(result.matchedSamples).toBe(0);
    expect(result.judgementSimilarityJustified).toBe(false);
    expect(result.invalidationConditions).toContain("Invalidate Judgement similarity if feature coverage remains too broad or outcome linkage is missing.");
  });

  it("accepts a valid archetype match even when raw samples are not supplied", () => {
    const result = recognizeState(base({
      judgement: { similarSampleSize: 40, reliability: 86, outcomeStability: 88 },
      archetypes: [{
        id: "known-constructive",
        label: "constructive_recurrence",
        state: currentState,
        confidence: 91,
        sampleSize: 40,
        positiveOutcomes: 34,
        negativeOutcomes: 3,
        neutralOutcomes: 3,
        outcomeStability: 88,
      }],
    }));

    expect(result.verdict).toBe("recognized");
    expect(result.archetype).toBe("constructive_recurrence");
    expect(result.archetypeConfidence).toBeGreaterThanOrEqual(90);
    expect(result.matchedSamples).toBe(40);
    expect(result.matchedPositiveOutcomes).toBe(34);
  });

  it("accepts explicit archetypes as state patterns when the current context has extra recovery evidence", () => {
    const result = recognizeState(base({
      recovery: {
        status: "recovering",
        mode: "reduced-size",
        audit: {
          blockerCount: 4,
          notes: ["separate recovery context"],
        },
      },
      judgement: { similarSampleSize: 40, reliability: 86, outcomeStability: 88 },
      archetypes: [{
        id: "known-constructive",
        label: "constructive_recurrence",
        state: currentState,
        confidence: 91,
        sampleSize: 40,
        positiveOutcomes: 34,
        negativeOutcomes: 3,
        neutralOutcomes: 3,
        outcomeStability: 88,
      }],
    }));

    expect(result.verdict).toBe("recognized");
    expect(result.matchedSamples).toBe(40);
    expect(result.discoveryNoveltyJustified).toBe(false);
    expect(result.judgementSimilarityJustified).toBe(true);
  });

  it("chooses explicit archetypes deterministically when confidence ties", () => {
    const archetype = {
      state: currentState,
      confidence: 91,
      sampleSize: 40,
      positiveOutcomes: 34,
      negativeOutcomes: 3,
      neutralOutcomes: 3,
      outcomeStability: 88,
    };
    const result = recognizeState(base({
      judgement: { similarSampleSize: 40, reliability: 86, outcomeStability: 88 },
      archetypes: [
        { ...archetype, id: "later", label: "z_later_state" },
        { ...archetype, id: "earlier", label: "a_earlier_state" },
      ],
    }));

    expect(result.archetype).toBe("a_earlier_state");
  });

  it("derives stable negative archetypes from linked outcome labels", () => {
    const failures = Array.from({ length: 8 }, (_, index) => sample(`failure-${index}`, {
      value: undefined,
      outcome: { label: "failure" },
    }));
    const result = recognizeState(base({
      discovery: { confidence: 62, novelty: 20, memory: { similarOutcomes: 8, reliability: 80 } },
      judgement: {
        similarSampleSize: 8,
        reliability: 82,
        outcomeStability: 88,
        evidence: { similarStates: 8, positiveOutcomes: 0, negativeOutcomes: 8, neutralOutcomes: 0 },
      },
      outcomeSamples: failures,
    }));

    expect(result.verdict).toBe("recognized");
    expect(result.archetype).toBe("stable_negative_state");
    expect(result.matchedNegativeOutcomes).toBe(8);
  });

  it("reports generic conflicts when Discovery novelty remains unproven without Judgement support", () => {
    const loose = Array.from({ length: 6 }, (_, index) => sample(`loose-${index}`, {
      state: undefined,
      similarity: 0.6,
      featureCoverage: 1,
      value: 0,
    }));
    const result = recognizeState(base({
      discovery: { confidence: 38, novelty: 88, memory: { similarOutcomes: 0, reliability: 40 } },
      judgement: { similarSampleSize: 0, reliability: 0, outcomeStability: 0 },
      similarOutcomeSamples: loose,
    }));

    expect(result.verdict).toBe("conflicted");
    expect(result.reason).toContain("different similarity definitions");
  });

  it("derives mixed archetypes and accepts exact fingerprint archetypes", () => {
    const mixed = [
      ...Array.from({ length: 3 }, (_, index) => sample(`mixed-positive-${index}`, { value: 2 })),
      ...Array.from({ length: 2 }, (_, index) => sample(`mixed-negative-${index}`, { value: -1 })),
      ...Array.from({ length: 2 }, (_, index) => sample(`mixed-neutral-${index}`, { value: 0 })),
    ];
    const mixedResult = recognizeState(base({
      discovery: { confidence: 62, novelty: 18, memory: { similarOutcomes: 7, reliability: 78 } },
      judgement: { similarSampleSize: 7, reliability: 78, outcomeStability: 68 },
      outcomeSamples: mixed,
    }));
    const fingerprint = recognizeState({ currentState }).stateFingerprint;
    const fingerprintResult = recognizeState(base({
      archetypes: [{
        fingerprint,
        label: "fingerprinted_state",
        confidence: 90,
        sampleSize: 12,
        positiveOutcomes: 10,
        negativeOutcomes: 1,
        neutralOutcomes: 1,
        outcomeStability: 86,
      }],
      outcomeSamples: [{ id: "exact-fingerprint", fingerprint, value: 3 }],
    }));

    expect(mixedResult.archetype).toBe("mixed_recurring_state");
    expect(fingerprintResult.verdict).toBe("recognized");
    expect(fingerprintResult.archetype).toBe("fingerprinted_state");
  });

  it("uses sample archetype groups before deriving fallback archetypes", () => {
    const grouped = Array.from({ length: 6 }, (_, index) => sample(`grouped-${index}`, {
      value: index < 5 ? 2 : -1,
      archetype: "known_group",
    }));
    const tiedGroups = [
      ...Array.from({ length: 3 }, (_, index) => sample(`z-group-${index}`, {
        value: 2,
        archetype: "z_group",
      })),
      ...Array.from({ length: 3 }, (_, index) => sample(`a-group-${index}`, {
        value: 2,
        archetype: "a_group",
      })),
    ];
    const result = recognizeState(base({
      discovery: { confidence: 62, novelty: 20, memory: { similarOutcomes: 6, reliability: 75 } },
      judgement: { similarSampleSize: 6, reliability: 76, outcomeStability: 78 },
      outcomeSamples: grouped,
    }));
    const tieResult = recognizeState(base({
      discovery: { confidence: 62, novelty: 20, memory: { similarOutcomes: 6, reliability: 75 } },
      judgement: { similarSampleSize: 6, reliability: 76, outcomeStability: 78 },
      outcomeSamples: tiedGroups,
    }));

    expect(result.archetype).toBe("known_group");
    expect(tieResult.archetype).toBe("a_group");
    expect(result.archetypeConfidence).toBeGreaterThan(70);
  });

  it("handles archetype groups without linked outcomes", () => {
    const grouped = Array.from({ length: 5 }, (_, index) => sample(`empty-group-${index}`, {
      value: undefined,
      outcome: undefined,
      archetype: "empty_group",
    }));
    const result = recognizeState(base({
      discovery: { confidence: 55, novelty: 30, memory: { similarOutcomes: 5, reliability: 60 } },
      judgement: { similarSampleSize: 5, reliability: 55, outcomeStability: 0 },
      outcomeSamples: grouped,
    }));

    expect(result.archetype).toBe("empty_group");
  });


  it("keeps sparse recurrence partial when only loose matches or weak archetypes exist", () => {
    const loose = Array.from({ length: 6 }, (_, index) => sample(`partial-loose-${index}`, {
      state: undefined,
      similarity: 0.6,
      featureCoverage: 1,
    }));
    const looseResult = recognizeState(base({
      discovery: { confidence: 55, novelty: 30, memory: { similarOutcomes: 6, reliability: 65 } },
      judgement: { similarSampleSize: 20, reliability: 80, outcomeStability: 80 },
      similarOutcomeSamples: loose,
      thresholds: { partialRecurrence: 45 },
    }));
    const weakArchetypeResult = recognizeState(base({
      discovery: { confidence: 55, novelty: 30, memory: { similarOutcomes: 2, reliability: 65 } },
      judgement: { similarSampleSize: 2, reliability: 80, outcomeStability: 80 },
      archetypes: [
        { id: "unmatched-empty" },
        {
          label: "weak_known_state",
          state: currentState,
          confidence: 70,
          sampleSize: 2,
          positiveOutcomes: 2,
          outcomeStability: 75,
        },
      ],
    }));

    expect(looseResult.verdict).toBe("partially_recognized");
    expect(weakArchetypeResult.verdict).toBe("partially_recognized");
    expect(weakArchetypeResult.archetype).toBe("weak_known_state");
  });

  it("uses fallback archetype labels and handles token-empty string comparisons", () => {
    const fallbackLabel = recognizeState(base({
      archetypes: [{
        state: currentState,
        confidence: 70,
        sampleSize: 2,
        positiveOutcomes: 2,
        outcomeStability: 75,
      }],
    }));
    const emptyTokenComparison = recognizeState({
      currentState: { marker: "!!!" },
      discovery: { confidence: 70, novelty: 10 },
      historicalStates: Array.from({ length: 5 }, () => ({ state: { marker: "???" } })),
    });

    expect(fallbackLabel.archetype).toBe("known_state");
    expect(emptyTokenComparison.verdict).toBe("novel");
  });

  it("labels recurring states when matches lack enough linked outcomes", () => {
    const noOutcomes = Array.from({ length: 5 }, (_, index) => sample(`no-outcome-${index}`, {
      value: undefined,
      outcome: undefined,
      success: null,
    }));
    const result = recognizeState(base({
      discovery: { confidence: 58, novelty: 25, memory: { similarOutcomes: 5, reliability: 60 } },
      judgement: { similarSampleSize: 5, reliability: 60, outcomeStability: 0 },
      outcomeSamples: noOutcomes,
    }));

    expect(result.archetype).toBe("recurring_state");
    expect(result.missingEvidence).toContain("historical outcome linkage");
  });

  it("returns the final insufficient evidence verdict for non-novel sparse recurrence", () => {
    const result = recognizeState({
      currentState: { ...currentState, ignored: null, emptyTags: [null, ""], emptyLabel: "" },
      discovery: { confidence: 70, novelty: 10, memory: { similarOutcomes: 0, reliability: 20 } },
      judgement: { similarSampleSize: 0, reliability: 0, outcomeStability: 0 },
      similarOutcomeSamples: Array.from({ length: 6 }, (_, index) => sample(`final-sparse-${index}`, {
        state: undefined,
        similarity: 0.6,
        featureCoverage: 1,
      })).concat([
        { state: undefined, similarity: 0.6, featureCoverage: 1 },
        { state: { other: 1 } },
        { id: "dupe", state: undefined, similarity: 0.6, featureCoverage: 1 },
        { id: "dupe", state: undefined, similarity: 0.6, featureCoverage: 1 },
        {},
      ]),
    });

    expect(result.verdict).toBe("insufficient_evidence");
  });

  it("treats low Discovery confidence with no memory matches as a novelty claim", () => {
    const result = recognizeState({
      currentState,
      discovery: { confidence: 30, novelty: 10, memory: { similarOutcomes: 0, reliability: 20 } },
      judgement: { similarSampleSize: 0, reliability: 0, outcomeStability: 0 },
      historicalStates: dissimilarSamples(5),
    });

    expect(result.discoveryNoveltyJustified).toBe(true);
  });

  it("keeps fingerprints stable after normalization and keeps outputs bounded", () => {
    const first = recognizeState(base({
      currentState: { ...currentState, nested: { z: "last", a: 1 } },
      normalizedFeatures: { operatorReview: "cleared", score: 0.8 },
      perception: { agreement: 0.9 },
      recovery: { status: "restored" },
      outcomeSamples: [
        {
          id: "metadata",
          metadata: {
            state: { ...currentState, nested: { a: 1, z: "last" } },
            features: { operatorReview: "cleared", score: 0.8 },
            perception: { agreement: 0.9 },
            context: { status: "restored" },
          },
          result: { label: "success", value: 5 },
        },
        {
          id: "result-label",
          metadata: {
            state: { ...currentState, nested: { a: 1, z: "last" } },
            features: { operatorReview: "cleared", score: 0.8 },
            perception: { agreement: 0.9 },
            context: { status: "restored" },
          },
          result: { label: "success" },
        },
        {
          id: "outcome-string",
          metadata: {
            state: { ...currentState, nested: { a: 1, z: "last" } },
            features: { operatorReview: "cleared", score: 0.8 },
            perception: { agreement: 0.9 },
            context: { status: "restored" },
          },
          outcome: "neutral",
        },
        {
          id: "result-string",
          metadata: {
            state: { ...currentState, nested: { a: 1, z: "last" } },
            features: { operatorReview: "cleared", score: 0.8 },
            perception: { agreement: 0.9 },
            context: { status: "restored" },
          },
          result: "approved",
        },
        {
          id: "unknown-label",
          metadata: {
            state: { ...currentState, nested: { a: 1, z: "last" } },
            features: { operatorReview: "cleared", score: 0.8 },
            perception: { agreement: 0.9 },
            context: { status: "restored" },
          },
          outcome: "ambiguous",
        },
        {
          id: "success-true",
          metadata: {
            state: { ...currentState, nested: { a: 1, z: "last" } },
            features: { operatorReview: "cleared", score: 0.8 },
            perception: { agreement: 0.9 },
            context: { status: "restored" },
          },
          success: true,
        },
        {
          id: "success-false",
          metadata: {
            state: { ...currentState, nested: { a: 1, z: "last" } },
            features: { operatorReview: "cleared", score: 0.8 },
            perception: { agreement: 0.9 },
            context: { status: "restored" },
          },
          success: false,
        },
        ...positiveSamples(5),
      ],
      now: new Date("2026-05-29T13:00:00.000Z"),
    }));
    const second = recognizeState(base({
      currentState: { nested: { a: 1, z: "last" }, tags: ["persistent", "confirmed"], aligned: true, pressure: 18, strength: 82, phase: "constructive" },
      normalizedFeatures: { score: 0.8, operatorReview: "cleared" },
      perception: { agreement: 0.9 },
      recovery: { status: "restored" },
      outcomeSamples: [
        {
          id: "metadata",
          metadata: {
            features: { score: 0.8, operatorReview: "cleared" },
            state: { nested: { z: "last", a: 1 }, tags: ["confirmed", "persistent"], aligned: true, pressure: 18, strength: 82, phase: "constructive" },
            perception: { agreement: 0.9 },
            context: { status: "restored" },
          },
          result: { label: "success", value: 5 },
        },
        {
          id: "result-label",
          metadata: {
            features: { score: 0.8, operatorReview: "cleared" },
            state: { nested: { z: "last", a: 1 }, tags: ["confirmed", "persistent"], aligned: true, pressure: 18, strength: 82, phase: "constructive" },
            perception: { agreement: 0.9 },
            context: { status: "restored" },
          },
          result: { label: "success" },
        },
        {
          id: "outcome-string",
          metadata: {
            features: { score: 0.8, operatorReview: "cleared" },
            state: { nested: { z: "last", a: 1 }, tags: ["confirmed", "persistent"], aligned: true, pressure: 18, strength: 82, phase: "constructive" },
            perception: { agreement: 0.9 },
            context: { status: "restored" },
          },
          outcome: "neutral",
        },
        {
          id: "result-string",
          metadata: {
            features: { score: 0.8, operatorReview: "cleared" },
            state: { nested: { z: "last", a: 1 }, tags: ["confirmed", "persistent"], aligned: true, pressure: 18, strength: 82, phase: "constructive" },
            perception: { agreement: 0.9 },
            context: { status: "restored" },
          },
          result: "approved",
        },
        {
          id: "unknown-label",
          metadata: {
            features: { score: 0.8, operatorReview: "cleared" },
            state: { nested: { z: "last", a: 1 }, tags: ["confirmed", "persistent"], aligned: true, pressure: 18, strength: 82, phase: "constructive" },
            perception: { agreement: 0.9 },
            context: { status: "restored" },
          },
          outcome: "ambiguous",
        },
        ...positiveSamples(5),
      ],
      now: "not-a-date",
    }));

    expect(second.stateFingerprint).toBe(first.stateFingerprint);
    expect(first.metadata.createdAt).toBe("2026-05-29T13:00:00.000Z");
    expect(second.metadata.createdAt).toBe("1970-01-01T00:00:00.000Z");
    expect(recognizeState({ currentState, now: new Date("not-a-date") }).metadata.createdAt).toBe("1970-01-01T00:00:00.000Z");
    expect(allScores(first).every((value) => value >= 0 && value <= 1049)).toBe(true);
  });

  it("normalizes malformed inputs and neutral outcomes safely", () => {
    const result = recognizeState({
      currentState: null as unknown as Record<string, unknown>,
      perception: "bad" as unknown as Record<string, unknown>,
      discovery: {
        novelty: 0.2,
        confidence: 0.3,
        missingEvidence: ["state review"],
      },
      survivalMemory: {
        currentStateSimilarity: 0.7,
        survivalConfidence: 0.8,
        missingEvidence: ["survival linkage"],
        invalidationConditions: ["survival state changes"],
      },
      judgement: {
        similarSampleSize: 0.2,
        reliability: 0.4,
        outcomeStability: 0.5,
      },
      outcomeSamples: [{
        id: "neutral",
        state: { other: 1 },
        outcome: { label: "neutral" },
      }],
    });

    expect(result.verdict).toBe("insufficient_evidence");
    expect(result.stateFingerprint).toContain("recog-v1");
    expect(result.missingEvidence).toContain("current state features");
    expect(result.missingEvidence).toContain("state review");
    expect(result.missingEvidence).toContain("survival linkage");
    expect(result.invalidationConditions).toContain("survival state changes");
  });
});
