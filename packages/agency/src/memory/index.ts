import type { AgencyCausalChain, AgencyMemoryStore, AgencyTrace } from "../types";

export function createInMemoryAgencyMemory(initialTraces: readonly AgencyTrace[] = []): AgencyMemoryStore {
  const traces = [...initialTraces];

  return {
    append(trace) {
      traces.push(trace);
      return trace;
    },
    list() {
      return [...traces];
    },
    get(traceId) {
      return traces.find((trace) => trace.traceId === traceId);
    },
    causalChain(traceId) {
      const trace = traces.find((candidate) => candidate.traceId === traceId);
      if (trace === undefined) {
        return undefined;
      }

      return toCausalChain(trace);
    },
    clear() {
      traces.length = 0;
    },
  };
}

export function toCausalChain(trace: AgencyTrace): AgencyCausalChain {
  return {
    traceId: trace.traceId,
    perception: trace.perception,
    intelligence: trace.intelligence,
    decision: trace.decision,
    sizing: trace.sizing,
    policy: trace.policy,
    action: trace.action,
    outcome: trace.outcome,
  };
}
