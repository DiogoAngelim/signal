import { describe, expect, it } from "vitest";
import {
  createAgencyPipeline,
  evaluateAgencyState,
  runAgencyCycle,
} from "./agency";
import { createInMemoryAgencyMemory } from "./memory";
import type { AgencyCycleInput } from "./types";

const baseInput: AgencyCycleInput = {
  perception: { completeness: 1 },
  intelligence: { confidenceBand: "high" },
  decision: {
    decisionId: "decision-1",
    kind: "prepare_response",
    confidence: 0.8,
    rationale: "Evidence is coherent.",
  },
  sizing: {
    size: 2,
    unit: "steps",
    rationale: "Small reversible action.",
  },
  action: {
    actionId: "action-1",
    kind: "send_response",
  },
  outcome: {
    success: true,
    reward: 1,
    durationMs: 50,
  },
};

describe("agency pipeline", () => {
  it("produces a complete trace and stores its causal chain", () => {
    const pipeline = createAgencyPipeline({
      policy: {
        minimumConfidence: 0.5,
        maximumSize: 5,
      },
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
      idGenerator: (_input, sequence) => `trace-${sequence}`,
      calibration: { minimumSamples: 1 },
      selfDiagnosis: { minimumTraceCount: 1 },
    });

    const trace = pipeline.runAgencyCycle(baseInput);

    expect(trace).toMatchObject({
      traceId: "trace-1",
      timestamp: "2026-01-01T00:00:00.000Z",
      decision: baseInput.decision,
      sizing: baseInput.sizing,
      policy: {
        allowed: true,
        maxSize: 5,
        requiresApproval: false,
        violations: [],
      },
      action: baseInput.action,
      outcome: {
        success: true,
        reward: 1,
        durationMs: 50,
        outcomeLabel: "positive",
      },
    });
    expect(trace.learning).toEqual({
      learnedPatterns: [],
      confidenceAdjustment: 0.05,
      policySuggestions: [],
    });
    expect(trace.selfDiagnosis.recommendation).toBe("act");
    expect(pipeline.memory.list()).toEqual([trace]);
    expect(pipeline.memory.causalChain("trace-1")).toEqual({
      traceId: "trace-1",
      perception: baseInput.perception,
      intelligence: baseInput.intelligence,
      decision: baseInput.decision,
      sizing: baseInput.sizing,
      policy: trace.policy,
      action: baseInput.action,
      outcome: trace.outcome,
    });
  });

  it("omits unsafe actions when policy blocks the cycle", () => {
    const trace = runAgencyCycle(baseInput, {
      policy: {
        minimumConfidence: 0.95,
        maximumSize: 1,
        humanApprovalRequired: true,
      },
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(trace.traceId).toBe("agency-1");
    expect(trace.policy.allowed).toBe(false);
    expect(trace.policy.violations).toEqual([
      "confidence_below_minimum",
      "size_above_maximum",
      "human_approval_required",
    ]);
    expect(trace.policy.recommendedSize).toBe(1);
    expect(trace.action).toBeUndefined();
  });

  it("works without an action and with an unknown outcome", () => {
    const trace = runAgencyCycle({
      decision: {
        kind: "collect_context",
        confidence: 0.6,
      },
    }, {
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(trace.action).toBeUndefined();
    expect(trace.outcome).toEqual({
      success: null,
      outcomeLabel: "unknown",
    });
    expect(trace.learning?.learnedPatterns).toEqual(["1 trace(s) are missing outcome data."]);
    expect(trace.selfDiagnosis.recommendation).toBe("requires_human_review");
  });

  it("evaluates stored and supplied history", () => {
    const memory = createInMemoryAgencyMemory();
    const pipeline = createAgencyPipeline({
      memory,
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
      idGenerator: (_input, sequence) => `stored-${sequence}`,
      calibration: { minimumSamples: 2 },
      selfDiagnosis: { minimumTraceCount: 2 },
    });

    const first = pipeline.runAgencyCycle(baseInput);
    const second = pipeline.runAgencyCycle({
      ...baseInput,
      decision: { kind: "collect_context", confidence: 0.9 },
      outcome: { success: false, loss: 1 },
    });
    const storedEvaluation = pipeline.evaluateAgencyState();
    const suppliedEvaluation = pipeline.evaluateAgencyState([first]);
    const standaloneEvaluation = evaluateAgencyState([first, second], {
      calibration: { minimumSamples: 2 },
      selfDiagnosis: { minimumTraceCount: 2 },
    });

    expect(storedEvaluation.traceCount).toBe(2);
    expect(suppliedEvaluation.traceCount).toBe(1);
    expect(standaloneEvaluation.calibration.sampleSize).toBe(2);
    expect(standaloneEvaluation.learning.learnedPatterns).toEqual([
      "1 high-confidence decision(s) had poor outcomes.",
    ]);
  });
});
