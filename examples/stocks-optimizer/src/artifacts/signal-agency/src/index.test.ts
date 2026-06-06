import { describe, expect, it } from "vitest";
import {
  calibrateConfidence,
  createAgencyPipeline,
  createInMemoryAgencyMemory,
  diagnoseAgencyState,
  evaluateAgencyState,
  evaluatePolicy,
  learnFromTraces,
  resolveOutcome,
  runAgencyCycle,
  toCausalChain,
  type AgencyDecision,
} from ".";

describe("public index", () => {
  it("exports the agency public API from the package entrypoint", () => {
    const decision: AgencyDecision = {
      kind: "prepare_response",
      confidence: 0.7,
    };
    const trace = runAgencyCycle({ decision, outcome: { success: true } });
    const memory = createInMemoryAgencyMemory([trace]);
    const pipeline = createAgencyPipeline({ memory });
    const evaluation = evaluateAgencyState(memory.list());
    const calibration = calibrateConfidence(memory.list(), { minimumSamples: 1 });
    const learning = learnFromTraces(memory.list(), calibration);

    expect(trace.traceId).toBe("agency-1");
    expect(Date.parse(trace.timestamp)).not.toBeNaN();
    expect(pipeline.evaluateAgencyState().traceCount).toBe(1);
    expect(evaluation.traceCount).toBe(1);
    expect(resolveOutcome({ success: false }).outcomeLabel).toBe("negative");
    expect(evaluatePolicy({ decision }).allowed).toBe(true);
    expect(toCausalChain(trace).decision).toBe(decision);
    expect(diagnoseAgencyState({
      history: memory.list(),
      calibration,
      learning,
    }).trust).toBeGreaterThan(0);
  });
});
