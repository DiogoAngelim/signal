import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  type DiscoveryEvidence,
  type DiscoveryInput,
  discover,
} from "./engine";

const similarState = { demand: "high", reliability: 82, agreement: 76 };

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

function positiveOutcome(id: string, score = 3) {
  return {
    id,
    state: similarState,
    success: true,
    score,
    evidence: [
      {
        label: "Independent confirmation",
        direction: "support" as const,
        strength: 84,
      },
    ],
    predictiveEvidence: ["Independent confirmation", "Stable state match"],
  };
}

function negativeOutcome(id: string) {
  return {
    id,
    state: similarState,
    success: false,
    score: -2,
    evidence: [
      {
        label: "Weak persistence",
        direction: "support" as const,
        strength: 45,
      },
    ],
    misleadingEvidence: ["Early spike"],
    failureModes: ["Weak persistence"],
    invalidationConditions: ["Prior failure mode returns."],
  };
}

function eligibleInput(
  overrides: Partial<DiscoveryInput> = {},
): DiscoveryInput {
  return {
    subjectId: "subject-1",
    domain: "generic",
    state: similarState,
    candidates: [
      {
        id: "candidate-a",
        label: "Candidate A",
        score: 88,
        confidence: 86,
        previousScore: 70,
        persistence: 84,
        evidenceIds: ["support-1", "support-2"],
      },
    ],
    evidence: [
      {
        ...evidence(
          "support-1",
          "Independent confirmation",
          "support",
          88,
          86,
          "confirmation",
        ),
        candidateId: "candidate-a",
      },
      evidence(
        "support-2",
        "Persistent improvement",
        "support",
        84,
        82,
        "persistence",
      ),
    ],
    historicalStates: [
      {
        id: "state-a",
        label: "Known constructive context",
        state: similarState,
      },
      {
        id: "state-b",
        label: "Partial context",
        state: { demand: "low", reliability: 55, agreement: 50 },
      },
    ],
    priorOutcomes: [
      positiveOutcome("success-1"),
      positiveOutcome("success-2"),
      positiveOutcome("success-3"),
      {
        id: "neutral-1",
        state: similarState,
        outcome: "neutral",
        evidence: [{ label: "Neutral observation" }],
      },
    ],
    constraints: [
      {
        id: "required-confirmation",
        label: "Required confirmation",
        passed: true,
        severity: "high",
      },
    ],
    now: "2026-05-29T12:00:00.000Z",
    ...overrides,
  };
}

test("Discovery covers defaults, weak evidence, emerging, eligible, penalties, and deterministic traces", () => {
  const empty = discover({ state: {} });
  const undefinedInput = discover(undefined as unknown as DiscoveryInput);
  const malformed = discover({
    state: null as unknown as Record<string, unknown>,
  });
  const weak = discover({
    state: { demand: "low", reliability: 30 },
    candidates: [{ id: "weak", score: 5, confidence: 10 }],
    evidence: [evidence("weak-support", "Thin signal", "support", 6, 10)],
    historicalStates: [
      { id: "weak-history", state: { demand: "low", reliability: 31 } },
    ],
    constraints: [{ id: "weak-constraint", passed: false, severity: "high" }],
    now: "not-a-date",
  });
  const emerging = discover(
    eligibleInput({
      candidates: [
        {
          id: "emerging",
          label: "Emerging candidate",
          score: 50,
          confidence: 58,
          previousScore: 30,
          persistence: 54,
        },
      ],
      evidence: [
        evidence("support-1", "Early confirmation", "support", 70, 70),
      ],
      priorOutcomes: [],
      constraints: [
        {
          id: "missing-independent-review",
          label: "Independent review",
          missingEvidence: "independent review",
        },
      ],
    }),
  );
  const eligible = discover(eligibleInput());
  const incomplete = discover(
    eligibleInput({
      evidence: [
        evidence("support-1", "Independent confirmation", "support", 88, 86),
        {
          id: "support-2",
          label: "Persistent improvement",
          direction: "support",
          observed: false,
        },
      ],
      constraints: [
        {
          id: "required",
          passed: false,
          severity: "low",
          missingEvidence: ["persistent improvement"],
        },
      ],
    }),
  );
  const novel = discover(eligibleInput({ historicalStates: [] }));
  const poor = discover(
    eligibleInput({
      priorOutcomes: [
        negativeOutcome("failure-1"),
        negativeOutcome("failure-2"),
        negativeOutcome("failure-3"),
      ],
    }),
  );
  const repeat = discover(eligibleInput());

  assert.equal(empty.status, "none");
  assert.equal(undefinedInput.status, "none");
  assert.ok(malformed.missingEvidence.includes("current state"));
  assert.equal(weak.status, "none");
  assert.equal(emerging.status, "emerging");
  assert.equal(eligible.status, "eligible");
  assert.equal(repeat.confidence, eligible.confidence);
  assert.ok(incomplete.confidence < eligible.confidence);
  assert.ok(novel.confidence < eligible.confidence);
  assert.ok(poor.confidence < eligible.confidence);
  assert.ok(poor.memory.mostMisleadingEvidence.includes("Early spike"));
  assert.ok(eligible.traces.some((trace) => trace.id === "final"));
});

test("Discovery reports contradictions, foresight, lifecycle transitions, and domain-neutral source text", () => {
  const contradiction = discover(
    eligibleInput({
      evidence: [
        evidence("support-1", "Independent confirmation", "support", 78, 76),
        evidence(
          "contradiction-1",
          "Conflicting observation",
          "contradict",
          82,
          80,
        ),
      ],
      constraints: [
        {
          id: "stop-condition",
          passed: false,
          severity: "critical",
          invalidationCondition: "The primary assumption fails.",
          unlockCondition: "Repair the failed assumption.",
        },
      ],
    }),
  );
  const sized = discover(
    eligibleInput({
      candidates: [
        {
          id: "sized",
          score: 80,
          confidence: 80,
          lifecycleStatus: "sized",
          previousScore: 66,
        },
      ],
    }),
  );
  const active = discover(
    eligibleInput({
      candidates: [
        {
          id: "active",
          score: 82,
          confidence: 84,
          status: "active",
          previousScore: 72,
        },
      ],
    }),
  );
  const closed = discover(
    eligibleInput({
      candidates: [
        {
          id: "closed",
          score: 55,
          confidence: 55,
          status: "closed",
          previousScore: 82,
        },
      ],
    }),
  );
  const deterministic = discover(
    eligibleInput({
      candidates: [
        {
          id: "deterministic",
          score: 62,
          confidence: 64,
          previousScore: 62,
          persistence: 62,
        },
      ],
      evidence: [
        evidence("neutral", "Neutral evidence", "neutral", 50, 50),
        { id: "negative-score", label: "Negative raw score", strength: -5 },
      ],
      priorOutcomes: [
        {
          candidateId: "deterministic",
          state: similarState,
          outcome: "positive",
        },
        { id: "numeric-positive", state: similarState, value: 2 },
        { id: "numeric-negative", state: similarState, value: -1 },
        { id: "named-success", state: similarState, outcome: "success" },
        { id: "named-failure", state: similarState, outcome: "failure" },
      ],
      constraints: [
        { id: "medium", passed: false, severity: "medium" },
        { id: "scored", score: 65 },
      ],
    }),
  );
  const source = readFileSync(
    new URL("./engine.ts", import.meta.url),
    "utf8",
  ).toLowerCase();

  assert.equal(
    contradiction.explanation.contradictoryEvidence[0]?.label,
    "Conflicting observation",
  );
  assert.ok(
    contradiction.invalidationConditions.includes(
      "The primary assumption fails.",
    ),
  );
  assert.equal(sized.status, "sized");
  assert.equal(active.status, "active");
  assert.equal(closed.status, "closed");
  assert.deepEqual(
    discover(
      eligibleInput({
        candidates: [
          {
            id: "deterministic",
            score: 62,
            confidence: 64,
            previousScore: 62,
            persistence: 62,
          },
        ],
        evidence: [
          evidence("neutral", "Neutral evidence", "neutral", 50, 50),
          { id: "negative-score", label: "Negative raw score", strength: -5 },
        ],
        priorOutcomes: [
          {
            candidateId: "deterministic",
            state: similarState,
            outcome: "positive",
          },
          { id: "numeric-positive", state: similarState, value: 2 },
          { id: "numeric-negative", state: similarState, value: -1 },
          { id: "named-success", state: similarState, outcome: "success" },
          { id: "named-failure", state: similarState, outcome: "failure" },
        ],
        constraints: [
          { id: "medium", passed: false, severity: "medium" },
          { id: "scored", score: 65 },
        ],
      }),
    ),
    deterministic,
  );

  for (const word of [
    "sharpe",
    "portfolio",
    "binance",
    "crypto",
    "drawdown",
    "exposure",
    "ticker",
  ]) {
    assert.equal(source.includes(word), false);
  }
});

test("Discovery infers regime coverage from historical states when explicit scores are absent", () => {
  const result = discover({
    state: { demand: "high", reliability: 80 },
    candidates: [{ id: "regime", score: 62, confidence: 64 }],
    historicalStates: [
      { id: "bull-state", state: { regime: "bull", reliability: 80 } },
      { id: "bear-state", state: { regimeType: "bear", reliability: 62 } },
      {
        id: "recovery-state",
        metadata: { regime: "recovery" },
        state: { reliability: 72 },
      },
    ],
  });

  assert.equal(result.regimeCoverageScore, 60);
  assert.equal(result.metadata.module, "discovery");
});

test("Discovery infers regime coverage from nested history diagnostics", () => {
  const result = discover({
    state: {
      historyDiagnostics: {
        keyRegimesCovered: ["crash", "", "volatility_transition"],
      },
    },
    candidates: [{ id: "nested-regime", score: 58, confidence: 60 }],
  });

  assert.equal(result.regimeCoverageScore, 40);
});

test("Discovery infers regime coverage from state-level regime labels", () => {
  const result = discover({
    state: {
      keyRegimesCovered: ["bull", "bear", ""],
    },
    candidates: [{ id: "state-regime", score: 58, confidence: 60 }],
  });

  assert.equal(result.regimeCoverageScore, 40);
});

test("Discovery covers aggregate, fallback, scoped evidence, and next-step paths", () => {
  const aggregate = discover({
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
      {
        id: "tie-evidence",
        label: "Tie evidence",
        strength: 50,
        confidence: 50,
      },
      { id: "score-negative", score: -2 },
    ],
    historicalStates: [
      { domain: "partial", state: { demand: "low", ready: false } },
      { id: "tie-b", label: "Tie B", state: { demand: "high", ready: true } },
      { id: "tie-a", label: "Tie A", state: { demand: "high", ready: true } },
      { id: "missing-state" },
      { state: { demand: "high", ready: true, ignored: null } },
    ],
    priorOutcomes: [
      {
        candidateId: "aggregate-subject",
        state: { demand: "high", ready: true },
        result: "valid",
        evidence: [{ id: "Description-only support" }],
      },
      {
        state: { demand: "high", ready: true },
        outcome: "unknown",
        evidence: [{}],
      },
      { outcome: "neutral", evidence: [{ label: "No state evidence" }] },
    ],
    constraints: [
      {
        id: "default-severity",
        passed: false,
        missingEvidence: "operator review",
      },
    ],
    now: new Date("2026-05-29T15:00:00.000Z"),
  });
  const strengthening = discover(
    eligibleInput({
      candidates: [
        {
          id: "strengthening-next",
          score: 78,
          confidence: 78,
          previousScore: 56,
        },
      ],
      priorOutcomes: [],
      constraints: [{ id: "ok", passed: true }],
    }),
  );
  const fragile = discover(
    eligibleInput({
      candidates: [
        {
          id: "fragile",
          score: 100,
          confidence: 100,
          previousScore: 70,
          lifecycleStatus: "emerging",
        },
      ],
      evidence: [
        evidence("support-1", "Support remains", "support", 100, 100),
        evidence("contradict-1", "Major contradiction", "contradict", 79, 79),
      ],
      historicalStates: [],
      priorOutcomes: [],
      constraints: [{ id: "hard-stop", passed: false, severity: "critical" }],
    }),
  );
  const emptySimilarity = discover({
    state: {},
    candidates: [{ id: "empty-context", score: 50, confidence: 50 }],
    evidence: [evidence("support-empty", "Support", "support", 60, 60)],
    historicalStates: [{ id: "empty", state: {} }],
  });
  const fallbackCandidateFields = discover(
    eligibleInput({
      candidates: [
        {
          candidateId: "candidate-id-only",
          kind: "Kind Label",
          strength: 68,
          trust: 70,
        },
        { subjectId: "subject-id-only", maturity: 66, readiness: 67 },
        { score: 64, confidence: 64 },
        { id: "aaa-tie", score: 64, confidence: 64 },
      ],
      priorOutcomes: [],
    }),
  );
  const anonymousAggregate = discover({
    state: { ready: true },
    evidence: [
      evidence("aggregate-support", "Aggregate support", "support", 95, 95),
    ],
    historicalStates: [{ state: { ready: true } }],
    constraints: [{ id: "ok", passed: true }],
  });
  const oneMissing = discover(
    eligibleInput({
      candidates: [{ id: "one-missing", score: 66, confidence: 66 }],
      evidence: [
        evidence("support-1", "Scoped elsewhere", "support", 68, 68, "scope"),
      ].map((item) => ({ ...item, candidateId: "other-candidate" })),
      priorOutcomes: [],
      constraints: [
        { id: "one-required", missingEvidence: "single missing check" },
      ],
    }),
  );

  assert.equal(aggregate.opportunities[0]?.id, "aggregate-subject");
  assert.equal(strengthening.status, "strengthening");
  assert.ok(fragile.recommendedNextStep.includes("Reduce fragility"));
  assert.equal(emptySimilarity.contextMatch[0]?.similarity, 0);
  assert.deepEqual(
    fallbackCandidateFields.opportunities.map((item) => item.id),
    ["candidate-id-only", "subject-id-only", "aaa-tie", "candidate:3"],
  );
  assert.equal(
    anonymousAggregate.opportunities[0]?.label,
    "Aggregate opportunity",
  );
  assert.ok(
    oneMissing.lifecycle.transitionReason.includes("1 missing evidence item."),
  );
  assert.equal(
    (oneMissing.opportunities[0]?.supportingEvidence[0] as any)?.candidateId,
    "other-candidate",
  );
});
