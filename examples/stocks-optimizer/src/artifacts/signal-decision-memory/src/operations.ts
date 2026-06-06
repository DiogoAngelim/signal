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
import { MEMORY_SCOPE_METADATA_KEY, assertMemoryScope, createDecisionMemoryContractAdapter, memoryStorageDecisionId } from "./contracts";
import { DEFAULT_RETENTION_POLICY, normalizeRetentionTier } from "./retention";
import { summarizeDecisionRecords } from "./summary";
import type {
  CalibrationHistoryEntry,
  DecisionMemoryStore,
  DecisionRecordContractInput,
  LessonRecordContractInput,
  MemoryScope,
  OutcomeRecordContractInput,
  RetentionPolicy,
  ReviewRecordContractInput,
  SimilarityQueryContractInput,
  TrustHistoryEntry,
} from "./types";

export const DECISION_MEMORY_OPERATION_DEFINITIONS = [
  operation("mutation", "reality.snapshot.record.v1", "Capture a replayable external reality snapshot.", true),
  operation("query", "reality.snapshot.get.v1", "Read a captured external reality snapshot.", true),
  operation("query", "reality.snapshot.list.v1", "List captured external reality snapshots.", true),
  operation("mutation", "decision.record.v1", "Record a durable shared Signal decision.", true),
  operation("query", "decision.get.v1", "Read a durable shared Signal decision.", true),
  operation("query", "decision.list.v1", "List durable shared Signal decisions.", true),
  operation("mutation", "outcome.record.v1", "Record a scoped durable decision outcome.", true),
  operation("mutation", "review.record.v1", "Record a scoped durable decision review.", true),
  operation("mutation", "lesson.record.v1", "Record a scoped durable decision lesson.", true),
  operation("query", "similarity.query.v1", "Query scoped similar cases and outcome distribution.", true),
  operation("query", "calibration.query.v1", "Query scoped calibration history.", true),
  operation("query", "memory.timeline.v1", "Reconstruct a scoped decision timeline.", true),
  operation("query", "memory.stats.v1", "Read scoped memory statistics.", true),
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
  const contracts = createDecisionMemoryContractAdapter(store);
  return [
    {
      name: "reality.snapshot.record.v1",
      kind: "mutation" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      idempotency: "optional" as const,
      emits: ["reality.snapshot_recorded.v1"],
      async handler(input: Record<string, unknown>, context: OperationContext = {}) {
        const scope = scopeFromInput(input);
        const snapshot = realitySnapshotFromInput(input);
        const saved = await store.saveRealitySnapshot({
          ...snapshot,
          source: scope.appId,
          metadata: {
            ...(snapshot.metadata ?? {}),
            [MEMORY_SCOPE_METADATA_KEY]: {
              scope,
              correlationId: stringOrUndefined(input["correlationId"]) ?? `corr:reality:${snapshot.snapshotId}`,
              version: "v1",
              recordKind: "Decision",
            },
          },
        });
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
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: Record<string, unknown>) {
        scopeFromInput(input);
        const snapshotId = String(input["snapshotId"] ?? "");
        const snapshot = await store.getRealitySnapshot(snapshotId);
        return { snapshotId, found: Boolean(snapshot), snapshot: snapshot ?? null };
      },
    },
    {
      name: "reality.snapshot.list.v1",
      kind: "query" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: Record<string, unknown>) {
        const scope = scopeFromInput(input);
        const snapshots = await store.listRealitySnapshots({
          appId: scope.appId,
          domain: scope.domain,
          source: scope.appId,
          limit: typeof input["limit"] === "number" ? input["limit"] : undefined,
        });
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
        const saved = await contracts.recordDecision(input as DecisionRecordContractInput);
        await context.emit?.("decision.recorded.v1", {
          decisionId: saved.originalDecisionId ?? saved.decisionId,
          appId: saved.appId,
          domain: saved.domain,
          source: saved.source,
        });
        return { record: saved, event: "decision.recorded.v1" };
      },
      normalizeIdempotencyInput(input: Record<string, unknown>) {
        return { scope: input["scope"] };
      },
    },
    {
      name: "decision.get.v1",
      kind: "query" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: Record<string, unknown>) {
        const scope = scopeFromInput(input);
        const decisionId = memoryStorageDecisionId(scope);
        const record = await store.getDecisionRecord(decisionId);
        return { decisionId: scope.decisionId, found: Boolean(record), record: record ?? null };
      },
    },
    {
      name: "decision.list.v1",
      kind: "query" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: Record<string, unknown>) {
        const scope = scopeFromInput(input);
        const records = await store.listDecisionRecords({
          appId: scope.appId,
          domain: scope.domain,
          source: scope.appId,
          retentionTier: input["retentionTier"] as "hot" | "warm" | "cold" | "expired" | undefined,
          limit: typeof input["limit"] === "number" ? input["limit"] : undefined,
        });
        return { records, count: records.length };
      },
    },
    {
      name: "outcome.record.v1",
      kind: "mutation" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      idempotency: "optional" as const,
      emits: ["decision.outcome_recorded.v1"],
      async handler(input: Record<string, unknown>, context: OperationContext = {}) {
        const saved = await contracts.recordOutcome(input as OutcomeRecordContractInput);
        await context.emit?.("decision.outcome_recorded.v1", {
          decisionId: saved.originalDecisionId ?? saved.decisionId,
          outcomeId: saved.outcomeId,
          appId: saved.appId,
          domain: saved.domain,
        });
        return { outcome: saved, event: "decision.outcome_recorded.v1" };
      },
      normalizeIdempotencyInput(input: Record<string, unknown>) {
        return { scope: input["scope"], outcomeId: (input["outcome"] as Record<string, unknown> | undefined)?.["outcomeId"] };
      },
    },
    {
      name: "review.record.v1",
      kind: "mutation" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      idempotency: "optional" as const,
      async handler(input: Record<string, unknown>) {
        const review = await contracts.recordReview(input as ReviewRecordContractInput);
        return { review, event: "review.recorded.v1" };
      },
      normalizeIdempotencyInput(input: Record<string, unknown>) {
        return { scope: input["scope"], reviewId: (input["review"] as Record<string, unknown> | undefined)?.["reviewId"] };
      },
    },
    {
      name: "lesson.record.v1",
      kind: "mutation" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      idempotency: "optional" as const,
      async handler(input: Record<string, unknown>) {
        const lesson = await contracts.recordLesson(input as LessonRecordContractInput);
        return { lesson, event: "lesson.recorded.v1" };
      },
      normalizeIdempotencyInput(input: Record<string, unknown>) {
        return { scope: input["scope"] };
      },
    },
    {
      name: "similarity.query.v1",
      kind: "query" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: Record<string, unknown>) {
        return contracts.querySimilarity(input as SimilarityQueryContractInput);
      },
    },
    {
      name: "calibration.query.v1",
      kind: "query" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: Record<string, unknown>) {
        return contracts.queryCalibration(input as Parameters<typeof contracts.queryCalibration>[0]);
      },
    },
    {
      name: "memory.timeline.v1",
      kind: "query" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: Record<string, unknown>) {
        return contracts.timeline(input as Parameters<typeof contracts.timeline>[0]);
      },
    },
    {
      name: "memory.stats.v1",
      kind: "query" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: Record<string, unknown>) {
        return contracts.stats(input as Parameters<typeof contracts.stats>[0]);
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
        const saved = await contracts.recordOutcome(input as OutcomeRecordContractInput);
        await context.emit?.("decision.outcome_recorded.v1", {
          decisionId: saved.originalDecisionId ?? saved.decisionId,
          outcomeId: saved.outcomeId,
          appId: saved.appId,
          domain: saved.domain,
        });
        return { outcome: saved, event: "decision.outcome_recorded.v1" };
      },
      normalizeIdempotencyInput(input: Record<string, unknown>) {
        return { scope: input["scope"], outcomeId: (input["outcome"] as Record<string, unknown> | undefined)?.["outcomeId"] };
      },
    },
    {
      name: "decision.replay.v1",
      kind: "query" as const,
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: Record<string, unknown>) {
        const scope = scopeFromInput(input);
        const decisionId = memoryStorageDecisionId(scope);
        const record = await store.getDecisionRecord(decisionId);
        if (!record) return { decisionId: scope.decisionId, replayResult: "inconclusive", explanation: "Decision was not found." };
        const current = currentCoherenceFrom(input);
        const replay = current ? compareReplay(record.decisionId, record.coherence, current) : undefined;
        await store.saveReplaySnapshot({
          snapshotId: `replay:${decisionId}:${Date.now()}`,
          decisionId,
          appId: scope.appId,
          domain: scope.domain,
          timestamp: scope.timestamp,
          version: "v1",
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
      inputSchema: z.record(z.string(), z.unknown()),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: Record<string, unknown>) {
        const scope = scopeFromInput(input);
        const limit = typeof input["limit"] === "number" ? input["limit"] : undefined;
        if (input["generate"]) {
          const records = await store.listDecisionRecords({
            appId: scope.appId,
            domain: scope.domain,
            source: scope.appId,
            limit: limit ?? 100,
          });
          const outcomes = await store.listOutcomes();
          const summary = summarizeDecisionRecords({ records, outcomes, source: scope.appId });
          await store.saveSummary({ ...summary, appId: scope.appId, domain: scope.domain });
        }
        const summaries = await store.listSummaries({
          appId: scope.appId,
          domain: scope.domain,
          source: scope.appId,
          limit,
        });
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

function scopeFromInput(input: Record<string, unknown>): MemoryScope {
  return assertMemoryScope(input["scope"] as MemoryScope | undefined);
}

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
