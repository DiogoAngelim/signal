import type { DecisionOperationDefinition } from "./types";

export const DECISION_OPERATION_DEFINITIONS: readonly DecisionOperationDefinition[] =
  [
    {
      kind: "mutation",
      name: "decision.record.v1",
      version: "v1",
      description: "Record a durable shared decision record.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "query",
      name: "decision.get.v1",
      version: "v1",
      description: "Read a durable shared decision record.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "query",
      name: "decision.list.v1",
      version: "v1",
      description: "List durable shared decision records.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "query",
      name: "decision.evaluate.v1",
      version: "v1",
      description:
        "Evaluate observation and module evidence into a decision record.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "query",
      name: "decision.replay.v1",
      version: "v1",
      description:
        "Replay a previous decision with original or current knowledge.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "mutation",
      name: "decision.outcome.record.v1",
      version: "v1",
      description:
        "Record an outcome and derive trust and calibration feedback.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "mutation",
      name: "decision.memory.compact.v1",
      version: "v1",
      description: "Compact old detailed decision memory into durable lessons.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "query",
      name: "decision.memory.summary.v1",
      version: "v1",
      description: "Return decision memory summaries and lessons.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "mutation",
      name: "decision.calibration.update.v1",
      version: "v1",
      description: "Record calibration and trust changes from outcomes.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "query",
      name: "decision.accountability.get.v1",
      version: "v1",
      description: "Return the accountability report for a stored decision.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "query",
      name: "decision.scenarios.predict.v1",
      version: "v1",
      description: "Generate domain-agnostic future scenarios.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "query",
      name: "decision.simulate.v1",
      version: "v1",
      description: "Compare action paths against scenarios.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "event",
      name: "decision.recorded.v1",
      version: "v1",
      description: "Emitted after a decision record is saved.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "event",
      name: "decision.evaluated.v1",
      version: "v1",
      description: "Emitted after a decision has been evaluated.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "event",
      name: "decision.blocked.v1",
      version: "v1",
      description:
        "Emitted when coherence, simulation, or wisdom blocks action.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "event",
      name: "decision.action_scaled.v1",
      version: "v1",
      description: "Emitted when agency is reduced instead of fully allowed.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "event",
      name: "decision.outcome_recorded.v1",
      version: "v1",
      description: "Emitted after an outcome closes the loop with reality.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "event",
      name: "decision.compacted.v1",
      version: "v1",
      description: "Emitted when decision memory is compacted.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "event",
      name: "decision.calibration_updated.v1",
      version: "v1",
      description: "Emitted when calibration or trust history is updated.",
      idempotent: true,
      replaySafe: true,
    },
    {
      kind: "event",
      name: "decision.replayed.v1",
      version: "v1",
      description: "Emitted when a decision replay comparison is produced.",
      idempotent: true,
      replaySafe: true,
    },
  ];

export type DecisionRegistryLike = {
  registerQuery?: (definition: DecisionOperationDefinition) => unknown;
  registerMutation?: (definition: DecisionOperationDefinition) => unknown;
  registerEvent?: (definition: DecisionOperationDefinition) => unknown;
};

export function listDecisionOperations(): DecisionOperationDefinition[] {
  return [...DECISION_OPERATION_DEFINITIONS];
}

export function registerDecisionOperations(
  registry: DecisionRegistryLike,
): DecisionOperationDefinition[] {
  const registered: DecisionOperationDefinition[] = [];
  for (const definition of DECISION_OPERATION_DEFINITIONS) {
    if (definition.kind === "query") registry.registerQuery?.(definition);
    if (definition.kind === "mutation") registry.registerMutation?.(definition);
    if (definition.kind === "event") registry.registerEvent?.(definition);
    registered.push(definition);
  }
  return registered;
}
