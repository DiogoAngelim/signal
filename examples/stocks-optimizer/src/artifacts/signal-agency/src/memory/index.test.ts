import { describe, expect, it } from "vitest";
import { createInMemoryAgencyMemory, toCausalChain } from ".";
import type { AgencyTrace } from "../types";

function trace(traceId: string): AgencyTrace {
  return {
    traceId,
    timestamp: "2026-01-01T00:00:00.000Z",
    perception: { signal: traceId },
    intelligence: { score: 1 },
    decision: { kind: "prepare_response", confidence: 0.8 },
    sizing: { size: 1 },
    policy: {
      allowed: true,
      requiresApproval: false,
      reason: "Policy allowed action.",
      violations: [],
    },
    action: { kind: "send_response" },
    outcome: { success: true, outcomeLabel: "positive" },
    selfDiagnosis: {
      trust: 0.9,
      dataReliability: 1,
      calibrationHealth: 1,
      overfitRisk: 0,
      recommendation: "act",
      reasons: ["Agency state is healthy."],
    },
  };
}

describe("memory", () => {
  it("stores, lists, retrieves, and clears traces", () => {
    const first = trace("trace-1");
    const memory = createInMemoryAgencyMemory([first]);
    const second = trace("trace-2");

    expect(memory.list()).toEqual([first]);
    expect(memory.append(second)).toBe(second);
    expect(memory.get("trace-2")).toBe(second);
    expect(memory.get("missing")).toBeUndefined();
    expect(memory.list()).toEqual([first, second]);

    memory.clear();
    expect(memory.list()).toEqual([]);
  });

  it("returns causal chains without learning or diagnosis fields", () => {
    const storedTrace = trace("trace-1");
    const memory = createInMemoryAgencyMemory([storedTrace]);

    expect(memory.causalChain("trace-1")).toEqual(toCausalChain(storedTrace));
    expect(memory.causalChain("missing")).toBeUndefined();
    expect(Object.keys(toCausalChain(storedTrace))).toEqual([
      "traceId",
      "perception",
      "intelligence",
      "decision",
      "sizing",
      "policy",
      "action",
      "outcome",
    ]);
  });
});
