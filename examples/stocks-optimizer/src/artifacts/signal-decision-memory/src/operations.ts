import { z } from "zod";
import {
  assessCoherence,
  compareReplay,
  createDecisionRecord,
  createRealitySnapshot,
  evaluateOutcome,
  type CoherenceAssessment,
  type DecisionModuleInputs,
  type OutcomeEvaluation,
  type RealitySnapshot,
  type SignalDecisionRecord,
} from "@signal/decision";
import { CompactionJob } from "./compaction";
import { DEFAULT_RETENTION_POLICY, normalizeRetentionTier } from "./retention";
import { summarizeDecisionRecords } from "./summary";
import type {
  CalibrationHistoryEntry,
  DecisionMemoryStore,
  RetentionPolicy,
  TrustHistoryEntry,
} from "./types";

export const DECISION_MEMORY_OPERATION_DEFINITIONS = [
  operation("mutation", "reality.snapshot.record.v1", "Capture a replayable external reality snapshot.", true),
  operation("query", "reality.snapshot.get.v1", "Read a captured external reality snapshot.", true),
  operation("query", "reality.snapshot.list.v1", "List captured external reality snapshots.", true),
  operation("mutation", "decision.record.v1", "Record a durable shared Signal decision.", true),
  operation("query", "decision.get.v1", "Read a durable shared Signal decision.", true),
  operation("query", "decision.list.v1", "List durable shared Signal decisions.", true),
  operation("mutation", "decision.outcome.record.v1", "Record a durable decision outcome.", true),
  operation("query", "decision.replay.v1", "Replay a decision from durable memory.", true),
  operation("mutation", "decision.memory.compact.v1", "Compact old decision memory into durable lessons.", true),
  operation("query", "decision.memory.summary.v1", "Read durable memory summaries.", true),
  operation("mutation", "decision.calibration.update.v1", "Record calibration and trust updates.", true),
  operation("event", "decision.recorded.v1", "A decision record was saved.", true),
  operation("event", "decision.outcome_recorded.v1", "A decision outcome was saved.", true),
  operation("event", "decision.compacted.v1", "Decision memory was compacted.", true),
  operation("event", "decision.replayed.v1", "A decision was replayed.", true),
  operation("event", "decision.calibration_updated.v1", "Calibration or trust history was updated.", true),
  operation("event", "reality.snapshot_recorded.v1", "A reality snapshot was saved.", true),
] as const;

export type DecisionMemoryRegistryLike = {
  registerQuery?: (definition: unknown) => unknown;
  registerMutation?: (definition: unknown) => unknown;
  registerEvent?: (definition: unknown) => unknown;
};

export function listDecisionMemoryOperations() {
  return [...DECISION_MEMORY_OPERATION_DEFINITIONS];
}

export function registerDecisionMemoryOperations(input: {
  registry: DecisionMemoryRegistryLike;
  store: DecisionMemoryStore;
  policy?: RetentionPolicy;
}) {
  const operations = createDecisionMemoryOperations(input.store, input.policy);
  for (const definition of operations) {
    if (definition.kind === "query") input.registry.registerQuery?.(definition);
    if (definition.kind === "mutation") input.registry.registerMutation?.(definition);
    if (definition.kind === "event") input.registry.registerEvent?.(definition);
  }
  return operations;
}

export function createDecisionMemoryOperations(
  store: DecisionMemoryStore,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
) {
  return [
    {
      name: "reality.snapshot.record.v1",
      kind: "mutation" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      idempotency: "optional" as const,
      emits: ["reality.snapshot_recorded.v1"],
      async handler(input: Record<string, unknown>, context: OperationContext = {}) {
        const snapshot = realitySnapshotFromInput(input);
        const saved = await store.saveRealitySnapshot(snapshot);
        await context.emit?.("reality.snapshot_recorded.v1", {
          snapshotId: saved.snapshotId,
          source: saved.source,
        });
        return { snapshot: saved, event: "reality.snapshot_recorded.v1" };
      },
      normalizeIdempotencyInput(input: Record<string, unknown>) {
        return { snapshotId: input["snapshotId"] };
      },
    },
    {
      name: "reality.snapshot.get.v1",
      kind: "query" as const,
      inputSchema: z.object({ snapshotId: z.string().min(1) }),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: { snapshotId: string }) {
        const snapshot = await store.getRealitySnapshot(input.snapshotId);
        return { snapshotId: input.snapshotId, found: Boolean(snapshot), snapshot: snapshot ?? null };
      },
    },
    {
      name: "reality.snapshot.list.v1",
      kind: "query" as const,
      inputSchema: z.object({
        source: z.string().optional(),
        limit: z.number().optional(),
      }),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: { source?: string; limit?: number }) {
        const snapshots = await store.listRealitySnapshots(input);
        return { snapshots, count: snapshots.length };
      },
    },
    {
      name: "decision.record.v1",
      kind: "mutation" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      idempotency: "optional" as const,
      emits: ["decision.recorded.v1"],
      async handler(input: Record<string, unknown>, context: OperationContext = {}) {
        const record = recordFromInput(input);
        const saved = await store.saveDecisionRecord(record);
        await context.emit?.("decision.recorded.v1", { decisionId: saved.decisionId, source: saved.source });
        return { record: saved, event: "decision.recorded.v1" };
      },
      normalizeIdempotencyInput(input: Record<string, unknown>) {
        return { decisionId: input["decisionId"] };
      },
    },
    {
      name: "decision.get.v1",
      kind: "query" as const,
      inputSchema: z.object({ decisionId: z.string().min(1) }),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: { decisionId: string }) {
        const record = await store.getDecisionRecord(input.decisionId);
        return { decisionId: input.decisionId, found: Boolean(record), record: record ?? null };
      },
    },
    {
      name: "decision.list.v1",
      kind: "query" as const,
      inputSchema: z.object({
        source: z.string().optional(),
        retentionTier: z.enum(["hot", "warm", "cold", "expired"]).optional(),
        limit: z.number().optional(),
      }),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: { source?: string; retentionTier?: "hot" | "warm" | "cold" | "expired"; limit?: number }) {
        const records = await store.listDecisionRecords(input);
        return { records, count: records.length };
      },
    },
    {
      name: "decision.outcome.record.v1",
      kind: "mutation" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      idempotency: "optional" as const,
      emits: ["decision.outcome_recorded.v1"],
      async handler(input: Record<string, unknown>, context: OperationContext = {}) {
        const outcome = outcomeFromInput(input);
        const saved = await store.recordOutcome(outcome);
        await context.emit?.("decision.outcome_recorded.v1", { decisionId: saved.decisionId, outcomeId: saved.outcomeId });
        return { outcome: saved, event: "decision.outcome_recorded.v1" };
      },
      normalizeIdempotencyInput(input: Record<string, unknown>) {
        return { outcomeId: input["outcomeId"], decisionId: input["decisionId"] };
      },
    },
    {
      name: "decision.replay.v1",
      kind: "query" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: Record<string, unknown>) {
        const decisionId = String(input["decisionId"] ?? "");
        const record = await store.getDecisionRecord(decisionId);
        if (!record) return { decisionId, replayResult: "inconclusive", explanation: "Decision was not found." };
        const current = currentCoherenceFrom(input);
        const replay = current ? compareReplay(record.decisionId, record.coherence, current) : undefined;
        await store.saveReplaySnapshot({
          snapshotId: `replay:${decisionId}:${Date.now()}`,
          decisionId,
          createdAt: new Date().toISOString(),
          source: record.source,
          retentionTier: normalizeRetentionTier(record.retentionTier),
          snapshot: { record, replay },
        });
        return { record, replay, event: "decision.replayed.v1" };
      },
    },
    {
      name: "decision.memory.compact.v1",
      kind: "mutation" as const,
      inputSchema: z.object({ source: z.string().optional(), limit: z.number().optional() }),
      resultSchema: z.record(z.string(), z.unknown()),
      idempotency: "optional" as const,
      emits: ["decision.compacted.v1"],
      async handler(input: { source?: string; limit?: number }, context: OperationContext = {}) {
        const result = await new CompactionJob({ store, policy }).run(input);
        await context.emit?.("decision.compacted.v1", result);
        return result;
      },
    },
    {
      name: "decision.memory.summary.v1",
      kind: "query" as const,
      inputSchema: z.object({ source: z.string().optional(), limit: z.number().optional(), generate: z.boolean().optional() }),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: { source?: string; limit?: number; generate?: boolean }) {
        if (input.generate) {
          const records = await store.listDecisionRecords({ source: input.source, limit: input.limit ?? 100 });
          const outcomes = await store.listOutcomes();
          const summary = summarizeDecisionRecords({ records, outcomes, source: input.source ?? records[0]?.source });
          await store.saveSummary(summary);
        }
        const summaries = await store.listSummaries({ source: input.source, limit: input.limit });
        return { summaries, count: summaries.length };
      },
    },
    {
      name: "decision.calibration.update.v1",
      kind: "mutation" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      idempotency: "optional" as const,
      emits: ["decision.calibration_updated.v1"],
      async handler(input: Record<string, unknown>, context: OperationContext = {}) {
        const now = new Date().toISOString();
        const source = String(input["source"] ?? process.env["SIGNAL_SOURCE_ID"] ?? "signal");
        const decisionId = stringOrUndefined(input["decisionId"]);
        const calibration: CalibrationHistoryEntry = {
          calibrationId: String(input["calibrationId"] ?? `calibration:${decisionId ?? "global"}:${Date.now()}`),
          ...(decisionId ? { decisionId } : {}),
          source,
          createdAt: String(input["createdAt"] ?? now),
          impact: numberOr(input["calibrationImpact"], 0),
          calibration: input["calibration"] ?? input,
        };
        const trust: TrustHistoryEntry = {
          trustId: String(input["trustId"] ?? `trust:${decisionId ?? "global"}:${Date.now()}`),
          ...(decisionId ? { decisionId } : {}),
          source,
          createdAt: calibration.createdAt,
          impact: numberOr(input["trustImpact"], 0),
          trust: input["trust"] ?? input,
        };
        const savedCalibration = await store.recordCalibration(calibration);
        const savedTrust = await store.recordTrust(trust);
        await context.emit?.("decision.calibration_updated.v1", { decisionId, source });
        return { calibration: savedCalibration, trust: savedTrust, event: "decision.calibration_updated.v1" };
      },
    },
    ...DECISION_MEMORY_OPERATION_DEFINITIONS
      .filter((definition) => definition.kind === "event")
      .map((definition) => ({
        name: definition.name,
        kind: "event" as const,
        inputSchema: z.record(z.string(), z.unknown()),
        resultSchema: z.record(z.string(), z.unknown()),
        handler(input: Record<string, unknown>) {
          return input;
        },
      })),
  ];
}

type OperationContext = {
  emit?: (name: string, payload: unknown) => Promise<unknown>;
};

function operation(kind: "query" | "mutation" | "event", name: string, description: string, replaySafe: boolean) {
  return {
    kind,
    name,
    version: "v1",
    description,
    idempotent: true,
    replaySafe,
  };
}

function recordFromInput(input: Record<string, unknown>): SignalDecisionRecord {
  if (input["record"] && typeof input["record"] === "object") {
    const record = input["record"] as SignalDecisionRecord;
    return createDecisionRecord({
      ...record,
      realitySnapshotId: record.realitySnapshotId,
      realitySnapshot: record.realitySnapshot,
    });
  }
  return createDecisionRecord({
    decisionId: String(input["decisionId"] ?? `decision:${Date.now()}`),
    source: String(input["source"] ?? process.env["SIGNAL_SOURCE_ID"] ?? "signal"),
    createdAt: String(input["createdAt"] ?? new Date().toISOString()),
    realitySnapshotId: stringOrUndefined(input["realitySnapshotId"]),
    realitySnapshot: objectOrUndefined(input["realitySnapshot"]) as RealitySnapshot | undefined,
    observation: input["observation"] ?? {},
    discovery: input["discovery"],
    judgment: input["judgment"],
    purpose: input["purpose"],
    need: input["need"],
    coherence: (input["coherence"] as SignalDecisionRecord["coherence"] | undefined) ?? assessCoherence(moduleInputs(input["modules"])),
    prediction: input["prediction"] as SignalDecisionRecord["prediction"],
    simulation: input["simulation"] as SignalDecisionRecord["simulation"],
    wisdom: input["wisdom"] as SignalDecisionRecord["wisdom"],
    agency: input["agency"],
    action: input["action"],
    outcome: input["outcome"] as SignalDecisionRecord["outcome"],
    accountability: input["accountability"] as SignalDecisionRecord["accountability"],
    humanSummary: stringOrUndefined(input["humanSummary"]),
    retentionTier: normalizeRetentionTier(input["retentionTier"]),
  });
}

function realitySnapshotFromInput(input: Record<string, unknown>): RealitySnapshot {
  if (input["snapshot"] && typeof input["snapshot"] === "object") {
    return createRealitySnapshot(input["snapshot"] as RealitySnapshot);
  }
  return createRealitySnapshot({
    snapshotId: stringOrUndefined(input["snapshotId"]),
    source: stringOrUndefined(input["source"]) ?? process.env["SIGNAL_SOURCE_ID"] ?? "signal",
    createdAt: stringOrUndefined(input["createdAt"]),
    dataQuality: numberOrUndefined(input["dataQuality"]),
    freshnessScore: numberOrUndefined(input["freshnessScore"]),
    payload: input["payload"] ?? {},
    sourceRef: objectOrUndefined(input["sourceRef"]) as RealitySnapshot["sourceRef"],
    metadata: objectOrUndefined(input["metadata"]) as Record<string, unknown> | undefined,
  });
}

function outcomeFromInput(input: Record<string, unknown>): OutcomeEvaluation {
  if (input["outcome"] && typeof input["outcome"] === "object") {
    return input["outcome"] as OutcomeEvaluation;
  }
  return evaluateOutcome({
    outcomeId: stringOrUndefined(input["outcomeId"]),
    decisionId: String(input["decisionId"] ?? "decision:unknown"),
    expectedConfidence: numberOrUndefined(input["expectedConfidence"]),
    expectedRisk: numberOrUndefined(input["expectedRisk"]),
    actualSuccessScore: numberOrUndefined(input["actualSuccessScore"]),
    purposeAlignment: numberOrUndefined(input["purposeAlignment"]),
    needAlignment: numberOrUndefined(input["needAlignment"]),
    realizedReward: numberOrUndefined(input["realizedReward"]),
    riskTaken: numberOrUndefined(input["riskTaken"]),
    unexpected: input["unexpected"] === true,
    inconclusive: input["inconclusive"] === true,
    lessons: Array.isArray(input["lessons"]) ? input["lessons"].map((lesson) => String(lesson)) : undefined,
  });
}

function currentCoherenceFrom(input: Record<string, unknown>): CoherenceAssessment | undefined {
  if (input["currentCoherence"] && typeof input["currentCoherence"] === "object") {
    return input["currentCoherence"] as CoherenceAssessment;
  }
  if (input["modules"] && typeof input["modules"] === "object") {
    return assessCoherence(moduleInputs(input["modules"]));
  }
  return undefined;
}

function moduleInputs(value: unknown): DecisionModuleInputs {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as DecisionModuleInputs;
  return {};
}

function stringOrUndefined(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function objectOrUndefined(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberOr(value: unknown, fallback: number): number {
  return numberOrUndefined(value) ?? fallback;
}
