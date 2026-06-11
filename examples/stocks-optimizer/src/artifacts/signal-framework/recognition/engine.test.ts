import assert from "node:assert/strict";
import test from "node:test";
import {
  type RecognitionInput,
  type RecognitionSample,
  recognizeState,
} from "./engine";

const currentState = {
  phase: "constructive",
  strength: 82,
  pressure: 18,
  aligned: true,
  tags: ["confirmed", "persistent"],
};

function sample(
  id: string,
  overrides: Partial<RecognitionSample> = {},
): RecognitionSample {
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
  return Array.from({ length: count }, (_, index) =>
    sample(`p-${index}`, { value: 3 + (index % 2) }),
  );
}

function dissimilarSamples(count: number) {
  return Array.from({ length: count }, (_, index) =>
    sample(`n-${index}`, {
      state: {
        phase: "unrelated",
        strength: 20 + index,
        pressure: 75,
        aligned: false,
        tags: ["different"],
      },
      value: index % 2 ? 1 : -1,
    }),
  );
}

test("Recognition recognizes recurrence when Discovery says novel and Judgement is stable", () => {
  const result = recognizeState(base({ outcomeSamples: positiveSamples(16) }));

  assert.equal(result.verdict, "recognized");
  assert.equal(result.matchedSamples, 16);
  assert.equal(result.matchedPositiveOutcomes, 16);
  assert.equal(result.matchedNegativeOutcomes, 0);
  assert.equal(result.discoveryNoveltyJustified, false);
  assert.equal(result.judgementSimilarityJustified, true);
  assert.equal(result.archetype, "stable_positive_state");
  assert.ok(result.reason.includes("stable linked outcomes"));
  assert.deepEqual(result.metadata, {
    module: "recognition",
    version: "v1",
    createdAt: "2026-05-29T12:00:00.000Z",
  });
});

test("Recognition accepts valid novelty with enough comparable memory", () => {
  const result = recognizeState(
    base({
      discovery: {
        confidence: 72,
        novelty: 88,
        memory: { similarOutcomes: 0, reliability: 75 },
      },
      judgement: { similarSampleSize: 0, reliability: 20, outcomeStability: 0 },
      historicalStates: dissimilarSamples(8),
    }),
  );

  assert.equal(result.verdict, "novel");
  assert.equal(result.discoveryNoveltyJustified, true);
  assert.equal(result.judgementSimilarityJustified, false);
  assert.ok(result.noveltyScore >= 65);
  assert.equal(result.matchedSamples, 0);
});

test("Recognition reports conflicted Discovery and Judgement definitions", () => {
  const broadMatches = Array.from({ length: 12 }, (_, index) =>
    sample(`broad-${index}`, {
      state: { phase: "constructive" },
      value: 2,
    }),
  );
  const result = recognizeState(base({ outcomeSamples: broadMatches }));

  assert.equal(result.verdict, "conflicted");
  assert.equal(result.discoveryNoveltyJustified, true);
  assert.equal(result.judgementSimilarityJustified, false);
  assert.ok(
    result.missingEvidence.includes(
      "state-level evidence explaining Judgement similarity",
    ),
  );
  assert.ok(result.reason.includes("broader than Recognition can justify"));
});

test("Recognition reports insufficient evidence for sparse memory", () => {
  const result = recognizeState({
    currentState,
    discovery: { confidence: 35, novelty: 85, memory: { similarOutcomes: 0 } },
  });

  assert.equal(result.verdict, "insufficient_evidence");
  assert.equal(result.discoveryNoveltyJustified, false);
  assert.ok(result.missingEvidence.includes("historical state samples"));
  assert.ok(
    result.missingEvidence.includes(
      "recurring state matches above the recognition threshold",
    ),
  );
  assert.ok(result.missingEvidence.includes("historical outcome linkage"));
  assert.ok(
    result.missingEvidence.includes(
      "memory depth sufficient to justify novelty",
    ),
  );
});

test("Recognition partially recognizes high recurrence with unstable outcomes", () => {
  const unstable = Array.from({ length: 12 }, (_, index) =>
    sample(`unstable-${index}`, {
      value: index % 2 === 0 ? 100 : -100,
    }),
  );
  const result = recognizeState(
    base({
      discovery: {
        confidence: 58,
        novelty: 25,
        memory: { similarOutcomes: 12, reliability: 70 },
      },
      judgement: {
        similarSampleSize: 12,
        reliability: 55,
        outcomeStability: 35,
      },
      outcomeSamples: unstable,
    }),
  );

  assert.equal(result.verdict, "partially_recognized");
  assert.ok(result.recurrenceConfidence >= 50);
  assert.ok(result.outcomeStability < 60);
  assert.equal(result.archetype, "unstable_recurring_state");
});

test("Recognition does not justify high novelty with one sample", () => {
  const result = recognizeState(
    base({
      judgement: { similarSampleSize: 0, reliability: 0, outcomeStability: 0 },
      historicalStates: dissimilarSamples(1),
    }),
  );

  assert.equal(result.verdict, "insufficient_evidence");
  assert.ok(result.noveltyScore > 65);
  assert.equal(result.discoveryNoveltyJustified, false);
});

test("Recognition rejects broad Judgement matches with low coverage", () => {
  const broadSummaryOnly = Array.from({ length: 20 }, (_, index) =>
    sample(`summary-${index}`, {
      state: undefined,
      similarity: index === 0 ? 92 : 0.92,
      featureCoverage: index === 0 ? 12 : 0.12,
      value: 2,
    }),
  );
  const result = recognizeState(
    base({ similarOutcomeSamples: broadSummaryOnly }),
  );

  assert.equal(result.verdict, "conflicted");
  assert.equal(result.matchedSamples, 0);
  assert.equal(result.judgementSimilarityJustified, false);
  assert.ok(
    result.invalidationConditions.includes(
      "Invalidate Judgement similarity if feature coverage remains too broad or outcome linkage is missing.",
    ),
  );
});

test("Recognition accepts explicit archetypes", () => {
  const result = recognizeState(
    base({
      judgement: {
        similarSampleSize: 40,
        reliability: 86,
        outcomeStability: 88,
      },
      archetypes: [
        {
          id: "known-constructive",
          label: "constructive_recurrence",
          state: currentState,
          confidence: 91,
          sampleSize: 40,
          positiveOutcomes: 34,
          negativeOutcomes: 3,
          neutralOutcomes: 3,
          outcomeStability: 88,
        },
      ],
    }),
  );

  assert.equal(result.verdict, "recognized");
  assert.equal(result.archetype, "constructive_recurrence");
  assert.ok(result.archetypeConfidence >= 90);
  assert.equal(result.matchedSamples, 40);
  assert.equal(result.matchedPositiveOutcomes, 34);
});

test("Recognition accepts explicit archetypes as state patterns with extra recovery evidence", () => {
  const result = recognizeState(
    base({
      recovery: {
        status: "recovering",
        mode: "reduced-size",
        audit: {
          blockerCount: 4,
          notes: ["separate recovery context"],
        },
      },
      judgement: {
        similarSampleSize: 40,
        reliability: 86,
        outcomeStability: 88,
      },
      archetypes: [
        {
          id: "known-constructive",
          label: "constructive_recurrence",
          state: currentState,
          confidence: 91,
          sampleSize: 40,
          positiveOutcomes: 34,
          negativeOutcomes: 3,
          neutralOutcomes: 3,
          outcomeStability: 88,
        },
      ],
    }),
  );

  assert.equal(result.verdict, "recognized");
  assert.equal(result.matchedSamples, 40);
  assert.equal(result.discoveryNoveltyJustified, false);
  assert.equal(result.judgementSimilarityJustified, true);
});

test("Recognition gives partial credit when current regime is not represented", () => {
  const result = recognizeState(
    base({
      outcomeSamples: positiveSamples(10),
      historyDiagnostics: {
        historyDepthScore: 90,
        regimeCoverageScore: 78,
        regimeDiversityScore: 76,
        sampleDiversityScore: 74,
        currentRegime: "sideways",
        keyRegimesCovered: ["bull", "bear"],
      },
    }),
  );

  assert.ok(result.historicalSimilarityConfidence > 0);
  assert.ok(
    result.recurrenceConfidence >= result.historicalSimilarityConfidence * 0.2,
  );
});

test("Recognition scores history diagnostics when current regime is absent", () => {
  const result = recognizeState(
    base({
      outcomeSamples: positiveSamples(10),
      historyDiagnostics: {
        historyDepthScore: 88,
        regimeCoverageScore: 80,
        regimeDiversityScore: 78,
        sampleDiversityScore: 76,
        keyRegimesCovered: ["bull", "bear", "crash"],
      },
    }),
  );

  assert.ok(result.historicalSimilarityConfidence > 0);
  assert.ok(result.recurrenceConfidence > 0);
});

test("Recognition chooses explicit archetypes deterministically when confidence ties", () => {
  const archetype = {
    state: currentState,
    confidence: 91,
    sampleSize: 40,
    positiveOutcomes: 34,
    negativeOutcomes: 3,
    neutralOutcomes: 3,
    outcomeStability: 88,
  };
  const result = recognizeState(
    base({
      judgement: {
        similarSampleSize: 40,
        reliability: 86,
        outcomeStability: 88,
      },
      archetypes: [
        { ...archetype, id: "later", label: "z_later_state" },
        { ...archetype, id: "earlier", label: "a_earlier_state" },
      ],
    }),
  );

  assert.equal(result.archetype, "a_earlier_state");
});

test("Recognition derives stable negative archetypes from outcome labels", () => {
  const failures = Array.from({ length: 8 }, (_, index) =>
    sample(`failure-${index}`, {
      value: undefined,
      outcome: { label: "failure" },
    }),
  );
  const result = recognizeState(
    base({
      discovery: {
        confidence: 62,
        novelty: 20,
        memory: { similarOutcomes: 8, reliability: 80 },
      },
      judgement: {
        similarSampleSize: 8,
        reliability: 82,
        outcomeStability: 88,
        evidence: {
          similarStates: 8,
          positiveOutcomes: 0,
          negativeOutcomes: 8,
          neutralOutcomes: 0,
        },
      },
      outcomeSamples: failures,
    }),
  );

  assert.equal(result.verdict, "recognized");
  assert.equal(result.archetype, "stable_negative_state");
  assert.equal(result.matchedNegativeOutcomes, 8);
});

test("Recognition reports generic conflicts without Judgement support", () => {
  const loose = Array.from({ length: 6 }, (_, index) =>
    sample(`loose-${index}`, {
      state: undefined,
      similarity: 0.6,
      featureCoverage: 1,
      value: 0,
    }),
  );
  const result = recognizeState(
    base({
      discovery: {
        confidence: 38,
        novelty: 88,
        memory: { similarOutcomes: 0, reliability: 40 },
      },
      judgement: { similarSampleSize: 0, reliability: 0, outcomeStability: 0 },
      similarOutcomeSamples: loose,
    }),
  );

  assert.equal(result.verdict, "conflicted");
  assert.ok(result.reason.includes("different similarity definitions"));
});

test("Recognition derives mixed archetypes and accepts exact fingerprint archetypes", () => {
  const mixed = [
    ...Array.from({ length: 3 }, (_, index) =>
      sample(`mixed-positive-${index}`, { value: 2 }),
    ),
    ...Array.from({ length: 2 }, (_, index) =>
      sample(`mixed-negative-${index}`, { value: -1 }),
    ),
    ...Array.from({ length: 2 }, (_, index) =>
      sample(`mixed-neutral-${index}`, { value: 0 }),
    ),
  ];
  const mixedResult = recognizeState(
    base({
      discovery: {
        confidence: 62,
        novelty: 18,
        memory: { similarOutcomes: 7, reliability: 78 },
      },
      judgement: {
        similarSampleSize: 7,
        reliability: 78,
        outcomeStability: 68,
      },
      outcomeSamples: mixed,
    }),
  );
  const fingerprint = recognizeState({ currentState }).stateFingerprint;
  const fingerprintResult = recognizeState(
    base({
      archetypes: [
        {
          fingerprint,
          label: "fingerprinted_state",
          confidence: 90,
          sampleSize: 12,
          positiveOutcomes: 10,
          negativeOutcomes: 1,
          neutralOutcomes: 1,
          outcomeStability: 86,
        },
      ],
      outcomeSamples: [{ id: "exact-fingerprint", fingerprint, value: 3 }],
    }),
  );

  assert.equal(mixedResult.archetype, "mixed_recurring_state");
  assert.equal(fingerprintResult.verdict, "recognized");
  assert.equal(fingerprintResult.archetype, "fingerprinted_state");
});

test("Recognition uses sample archetype groups before fallback archetypes", () => {
  const grouped = Array.from({ length: 6 }, (_, index) =>
    sample(`grouped-${index}`, {
      value: index < 5 ? 2 : -1,
      archetype: "known_group",
    }),
  );
  const tiedGroups = [
    ...Array.from({ length: 3 }, (_, index) =>
      sample(`z-group-${index}`, {
        value: 2,
        archetype: "z_group",
      }),
    ),
    ...Array.from({ length: 3 }, (_, index) =>
      sample(`a-group-${index}`, {
        value: 2,
        archetype: "a_group",
      }),
    ),
  ];
  const result = recognizeState(
    base({
      discovery: {
        confidence: 62,
        novelty: 20,
        memory: { similarOutcomes: 6, reliability: 75 },
      },
      judgement: {
        similarSampleSize: 6,
        reliability: 76,
        outcomeStability: 78,
      },
      outcomeSamples: grouped,
    }),
  );
  const tieResult = recognizeState(
    base({
      discovery: {
        confidence: 62,
        novelty: 20,
        memory: { similarOutcomes: 6, reliability: 75 },
      },
      judgement: {
        similarSampleSize: 6,
        reliability: 76,
        outcomeStability: 78,
      },
      outcomeSamples: tiedGroups,
    }),
  );

  assert.equal(result.archetype, "known_group");
  assert.equal(tieResult.archetype, "a_group");
  assert.ok(result.archetypeConfidence > 70);
});

test("Recognition handles archetype groups without linked outcomes", () => {
  const grouped = Array.from({ length: 5 }, (_, index) =>
    sample(`empty-group-${index}`, {
      value: undefined,
      outcome: undefined,
      archetype: "empty_group",
    }),
  );
  const result = recognizeState(
    base({
      discovery: {
        confidence: 55,
        novelty: 30,
        memory: { similarOutcomes: 5, reliability: 60 },
      },
      judgement: { similarSampleSize: 5, reliability: 55, outcomeStability: 0 },
      outcomeSamples: grouped,
    }),
  );

  assert.equal(result.archetype, "empty_group");
});

test("Recognition keeps sparse recurrence partial for loose matches or weak archetypes", () => {
  const loose = Array.from({ length: 6 }, (_, index) =>
    sample(`partial-loose-${index}`, {
      state: undefined,
      similarity: 0.6,
      featureCoverage: 1,
    }),
  );
  const looseResult = recognizeState(
    base({
      discovery: {
        confidence: 55,
        novelty: 30,
        memory: { similarOutcomes: 6, reliability: 65 },
      },
      judgement: {
        similarSampleSize: 20,
        reliability: 80,
        outcomeStability: 80,
      },
      similarOutcomeSamples: loose,
      thresholds: { partialRecurrence: 45 },
    }),
  );
  const weakArchetypeResult = recognizeState(
    base({
      discovery: {
        confidence: 55,
        novelty: 30,
        memory: { similarOutcomes: 2, reliability: 65 },
      },
      judgement: {
        similarSampleSize: 2,
        reliability: 80,
        outcomeStability: 80,
      },
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
    }),
  );

  assert.equal(looseResult.verdict, "partially_recognized");
  assert.equal(weakArchetypeResult.verdict, "partially_recognized");
  assert.equal(weakArchetypeResult.archetype, "weak_known_state");
});

test("Recognition uses fallback archetype labels and token-empty comparisons", () => {
  const fallbackLabel = recognizeState(
    base({
      archetypes: [
        {
          state: currentState,
          confidence: 70,
          sampleSize: 2,
          positiveOutcomes: 2,
          outcomeStability: 75,
        },
      ],
    }),
  );
  const emptyTokenComparison = recognizeState({
    currentState: { marker: "!!!" },
    discovery: { confidence: 70, novelty: 10 },
    historicalStates: Array.from({ length: 5 }, () => ({
      state: { marker: "???" },
    })),
  });

  assert.equal(fallbackLabel.archetype, "known_state");
  assert.equal(emptyTokenComparison.verdict, "novel");
});

test("Recognition labels recurring states with sparse outcome linkage", () => {
  const noOutcomes = Array.from({ length: 5 }, (_, index) =>
    sample(`no-outcome-${index}`, {
      value: undefined,
      outcome: undefined,
      success: null,
    }),
  );
  const result = recognizeState(
    base({
      discovery: {
        confidence: 58,
        novelty: 25,
        memory: { similarOutcomes: 5, reliability: 60 },
      },
      judgement: { similarSampleSize: 5, reliability: 60, outcomeStability: 0 },
      outcomeSamples: noOutcomes,
    }),
  );

  assert.equal(result.archetype, "recurring_state");
  assert.ok(result.missingEvidence.includes("historical outcome linkage"));
});

test("Recognition returns final insufficient evidence for non-novel sparse recurrence", () => {
  const result = recognizeState({
    currentState: {
      ...currentState,
      ignored: null,
      emptyTags: [null, ""],
      emptyLabel: "",
    },
    discovery: {
      confidence: 70,
      novelty: 10,
      memory: { similarOutcomes: 0, reliability: 20 },
    },
    judgement: { similarSampleSize: 0, reliability: 0, outcomeStability: 0 },
    similarOutcomeSamples: Array.from({ length: 6 }, (_, index) =>
      sample(`final-sparse-${index}`, {
        state: undefined,
        similarity: 0.6,
        featureCoverage: 1,
      }),
    ).concat([
      { state: undefined, similarity: 0.6, featureCoverage: 1 },
      { state: { other: 1 } },
      { id: "dupe", state: undefined, similarity: 0.6, featureCoverage: 1 },
      { id: "dupe", state: undefined, similarity: 0.6, featureCoverage: 1 },
      {},
    ]),
  });

  assert.equal(result.verdict, "insufficient_evidence");
});

test("Recognition treats low Discovery confidence with no memory matches as novelty", () => {
  const result = recognizeState({
    currentState,
    discovery: {
      confidence: 30,
      novelty: 10,
      memory: { similarOutcomes: 0, reliability: 20 },
    },
    judgement: { similarSampleSize: 0, reliability: 0, outcomeStability: 0 },
    historicalStates: dissimilarSamples(5),
  });

  assert.equal(result.discoveryNoveltyJustified, true);
});

test("Recognition keeps fingerprints deterministic and normalizes defensive inputs", () => {
  const first = recognizeState(
    base({
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
    }),
  );
  const second = recognizeState(
    base({
      currentState: {
        nested: { a: 1, z: "last" },
        tags: ["persistent", "confirmed"],
        aligned: true,
        pressure: 18,
        strength: 82,
        phase: "constructive",
      },
      normalizedFeatures: { score: 0.8, operatorReview: "cleared" },
      perception: { agreement: 0.9 },
      recovery: { status: "restored" },
      outcomeSamples: [
        {
          id: "metadata",
          metadata: {
            features: { score: 0.8, operatorReview: "cleared" },
            state: {
              nested: { z: "last", a: 1 },
              tags: ["confirmed", "persistent"],
              aligned: true,
              pressure: 18,
              strength: 82,
              phase: "constructive",
            },
            perception: { agreement: 0.9 },
            context: { status: "restored" },
          },
          result: { label: "success", value: 5 },
        },
        ...positiveSamples(5),
      ],
      now: "not-a-date",
    }),
  );
  const malformed = recognizeState({
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
    outcomeSamples: [
      {
        id: "neutral",
        state: { other: 1 },
        outcome: { label: "neutral" },
      },
    ],
  });
  const invalidDate = recognizeState({
    currentState,
    now: new Date("not-a-date"),
  });

  assert.equal(second.stateFingerprint, first.stateFingerprint);
  assert.equal(first.metadata.createdAt, "2026-05-29T13:00:00.000Z");
  assert.equal(second.metadata.createdAt, "1970-01-01T00:00:00.000Z");
  assert.equal(invalidDate.metadata.createdAt, "1970-01-01T00:00:00.000Z");
  assert.equal(malformed.verdict, "insufficient_evidence");
  assert.ok(malformed.stateFingerprint.includes("recog-v1"));
  assert.ok(malformed.missingEvidence.includes("current state features"));
  assert.ok(malformed.missingEvidence.includes("state review"));
  assert.ok(malformed.missingEvidence.includes("survival linkage"));
  assert.ok(
    malformed.invalidationConditions.includes("survival state changes"),
  );
});
