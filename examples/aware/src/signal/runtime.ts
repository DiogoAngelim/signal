import {
  SignalRuntime,
  createMemoryIdempotencyStore,
  type SignalEventDefinition,
  type SignalMutationDefinition,
  type SignalQueryDefinition
} from "@signal/runtime";
import {
  createDefaultAwareAdapters,
  createRegionService,
  type RegionService,
  type SafetyDataAdapter
} from "../adapters.js";
import type {
  Briefing,
  BriefingReviewInput,
  BriefingReviewResult,
  FeedbackInput,
  FeedbackResult,
  FixtureScenarioId,
  Region
} from "../contracts.js";
import { createAwareDecisionMemory, type AwareDecisionMemory } from "./memory.js";
import {
  AWARE_OPERATION_NAMES,
  createAwareOperations,
  createBriefingRepository,
  createFeedbackRepository,
  listAwareOperationContracts,
  type BriefingRepository,
  type FeedbackRepository
} from "./operations.js";

export type AwareEventJournal = {
  record(envelope: AwareEventEnvelope): void;
  list(): AwareEventEnvelope[];
};

export type AwareEventEnvelope = {
  messageId: string;
  name: string;
  kind: string;
  timestamp: string;
  payload?: unknown;
};

export type AwareSignalApp = {
  runtime: SignalRuntime;
  events: AwareEventJournal;
  regions: RegionService;
  briefings: BriefingRepository;
  feedback: FeedbackRepository;
  memory: AwareDecisionMemory;
  searchRegions(query: string, limit?: number): Promise<Region[]>;
  getBriefing(regionId: string, options?: { fixtureId?: FixtureScenarioId }): Promise<Briefing>;
  getBriefingDetails(briefingId: string, itemId?: string): Promise<{ found: boolean; briefing: Briefing | null; item: Briefing["items"][number] | null }>;
  listSources(briefingId: string): Promise<{ found: boolean; briefingId: string; sources: Briefing["sources"] }>;
  submitFeedback(input: FeedbackInput): Promise<FeedbackResult>;
  reviewBriefing(input: BriefingReviewInput): Promise<BriefingReviewResult>;
};

export type AwareSignalAppOptions = {
  regions?: RegionService;
  adapters?: SafetyDataAdapter[];
  briefings?: BriefingRepository;
  feedback?: FeedbackRepository;
  memory?: AwareDecisionMemory;
  now?: () => Date;
};

export function createAwareSignalApp(options: AwareSignalAppOptions = {}): AwareSignalApp {
  const regions = options.regions ?? createRegionService();
  const adapters = options.adapters ?? createDefaultAwareAdapters();
  const briefings = options.briefings ?? createBriefingRepository();
  const feedback = options.feedback ?? createFeedbackRepository();
  const memory = options.memory ?? createAwareDecisionMemory();
  const runtime = new SignalRuntime({
    runtimeName: "signal-aware-example",
    idempotencyStore: createMemoryIdempotencyStore(),
    bindings: {
      inProcess: true,
      http: {
        basePath: "/api"
      }
    }
  });
  const events = createEventJournal();

  for (const operation of createAwareOperations({
    regions,
    adapters,
    briefings,
    feedback,
    memory,
    now: options.now
  })) {
    if (operation.kind === "query") runtime.registerQuery(operation as SignalQueryDefinition);
    if (operation.kind === "mutation") runtime.registerMutation(operation as SignalMutationDefinition);
    if (operation.kind === "event") runtime.registerEvent(operation as SignalEventDefinition);
  }

  for (const eventName of AWARE_OPERATION_NAMES.events) {
    runtime.subscribe(eventName, (envelope) => events.record(envelope), {
      replaySafe: true,
      consumerId: "aware-example-event-journal",
      description: "Replay-safe journal for generated briefings, escalations, feedback, and source degradation."
    });
  }

  return {
    runtime,
    events,
    regions,
    briefings,
    feedback,
    memory,
    async searchRegions(query, limit) {
      const result = await runtime.query<{ q: string; limit?: number }, { regions: Region[] }>(
        "aware.region.search.v1",
        { q: query, limit },
        signalRequest("aware-ui")
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.result.regions;
    },
    async getBriefing(regionId, callOptions = {}) {
      const result = await runtime.query<{ regionId: string; fixtureId?: FixtureScenarioId }, Briefing>(
        "aware.briefing.get.v1",
        { regionId, fixtureId: callOptions.fixtureId },
        signalRequest("aware-api")
      );
      if (!result.ok) throw new Error(result.error.message);

      let briefing: Briefing = {
        ...result.result,
        operation: {
          ...result.result.operation,
          envelopeId: result.envelope.messageId
        }
      };

      const generated = await runtime.publish("aware.briefing.generated.v1", {
        briefingId: briefing.id,
        regionId: briefing.region.id,
        attentionLevel: briefing.attentionLevel,
        generatedAt: briefing.generatedAt
      }, signalRequest("aware-api", result.envelope.messageId));

      briefing = {
        ...briefing,
        operation: {
          ...briefing.operation,
          generatedEventId: generated.messageId
        }
      };
      briefings.save(briefing);

      if (briefing.attentionLevel === "urgency" || briefing.attentionLevel === "emergency") {
        await runtime.publish("aware.risk.escalated.v1", {
          briefingId: briefing.id,
          regionId: briefing.region.id,
          attentionLevel: briefing.attentionLevel,
          itemIds: briefing.items
            .filter((item) => item.attentionLevel === "urgency" || item.attentionLevel === "emergency")
            .map((item) => item.id)
        }, signalRequest("aware-api", generated.messageId));
      }

      for (const source of briefing.sources.filter((source) => source.status !== "available")) {
        await runtime.publish("aware.source.degraded.v1", {
          briefingId: briefing.id,
          regionId: briefing.region.id,
          sourceId: source.id,
          status: source.status,
          freshness: source.freshness
        }, signalRequest("aware-api", generated.messageId));
      }

      return briefing;
    },
    async getBriefingDetails(briefingId, itemId) {
      const result = await runtime.query<{ briefingId: string; itemId?: string }, { found: boolean; briefing: Briefing | null; item: Briefing["items"][number] | null }>(
        "aware.briefing.details.v1",
        { briefingId, itemId },
        signalRequest("aware-api")
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.result;
    },
    async listSources(briefingId) {
      const result = await runtime.query<{ briefingId: string }, { found: boolean; briefingId: string; sources: Briefing["sources"] }>(
        "aware.sources.list.v1",
        { briefingId },
        signalRequest("aware-api")
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.result;
    },
    async submitFeedback(input) {
      const idempotencyKey = input.idempotencyKey ?? `feedback:${input.briefingId}:${input.itemId ?? "briefing"}:${input.helpful}`;
      const result = await runtime.mutation<FeedbackInput, FeedbackResult>(
        "aware.feedback.submit.v1",
        input,
        {
          ...signalRequest("aware-api"),
          idempotencyKey
        }
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.result;
    },
    async reviewBriefing(input) {
      const idempotencyKey = input.idempotencyKey ?? `review:${input.briefingId}:${input.classification ?? "inconclusive"}`;
      const result = await runtime.mutation<BriefingReviewInput, BriefingReviewResult>(
        "aware.briefing.review.v1",
        input,
        {
          ...signalRequest("aware-api"),
          idempotencyKey
        }
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.result;
    }
  };
}

export { AWARE_OPERATION_NAMES, listAwareOperationContracts };

function createEventJournal(): AwareEventJournal {
  const seen = new Set<string>();
  const events: AwareEventEnvelope[] = [];
  return {
    record(envelope) {
      if (seen.has(envelope.messageId)) return;
      seen.add(envelope.messageId);
      events.push(envelope);
    },
    list() {
      return [...events];
    }
  };
}

function signalRequest(system: string, causationId?: string) {
  return {
    causationId,
    source: {
      system,
      transport: "in-process",
      runtime: "signal-aware-example"
    },
    meta: {
      contracts: listAwareOperationContracts().map((contract) => contract.name)
    }
  };
}
