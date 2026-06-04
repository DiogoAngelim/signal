import {
  SignalRuntime,
  createMemoryIdempotencyStore,
  type SignalEventDefinition,
  type SignalMutationDefinition,
  type SignalQueryDefinition
} from "@signal/runtime";
import {
  createDefaultMaritimeAdapters,
  createMaritimeAreaService,
  type MaritimeAreaService,
  type MaritimeDataAdapter
} from "../adapters.js";
import type {
  FeedbackInput,
  FeedbackResult,
  FixtureScenarioId,
  MaritimeArea,
  MaritimeBriefing,
  MaritimeReviewInput,
  MaritimeReviewResult
} from "../contracts.js";
import { createMaritimeDecisionMemory, type MaritimeDecisionMemory } from "./memory.js";
import {
  MARITIME_OPERATION_NAMES,
  createFeedbackRepository,
  createGuideRepository,
  createMaritimeOperations,
  listMaritimeOperationContracts,
  type FeedbackRepository,
  type GuideRepository
} from "./operations.js";

export type MaritimeEventJournal = {
  record(envelope: MaritimeEventEnvelope): void;
  list(): MaritimeEventEnvelope[];
};

export type MaritimeEventEnvelope = {
  messageId: string;
  name: string;
  kind: string;
  timestamp: string;
  payload?: unknown;
};

export type MaritimeSignalApp = {
  runtime: SignalRuntime;
  events: MaritimeEventJournal;
  areas: MaritimeAreaService;
  guides: GuideRepository;
  feedback: FeedbackRepository;
  memory: MaritimeDecisionMemory;
  searchAreas(query: string, limit?: number): Promise<MaritimeArea[]>;
  getGuide(areaId: string, options?: { fixtureId?: FixtureScenarioId }): Promise<MaritimeBriefing>;
  getGuideDetails(briefingId: string, riskId?: string): Promise<{ found: boolean; briefing: MaritimeBriefing | null; risk: MaritimeBriefing["risks"][number] | null }>;
  listSources(briefingId: string): Promise<{ found: boolean; briefingId: string; sources: MaritimeBriefing["sources"] }>;
  submitFeedback(input: FeedbackInput): Promise<FeedbackResult>;
  reviewGuide(input: MaritimeReviewInput): Promise<MaritimeReviewResult>;
};

export type MaritimeSignalAppOptions = {
  areas?: MaritimeAreaService;
  adapters?: MaritimeDataAdapter[];
  guides?: GuideRepository;
  feedback?: FeedbackRepository;
  memory?: MaritimeDecisionMemory;
  now?: () => Date;
};

export function createMaritimeSignalApp(options: MaritimeSignalAppOptions = {}): MaritimeSignalApp {
  const areas = options.areas ?? createMaritimeAreaService();
  const adapters = options.adapters ?? createDefaultMaritimeAdapters({ now: options.now });
  const guides = options.guides ?? createGuideRepository();
  const feedback = options.feedback ?? createFeedbackRepository();
  const memory = options.memory ?? createMaritimeDecisionMemory();
  const runtime = new SignalRuntime({
    runtimeName: "signal-maritime-aware-example",
    idempotencyStore: createMemoryIdempotencyStore(),
    bindings: {
      inProcess: true,
      http: {
        basePath: "/api"
      }
    }
  });
  const events = createEventJournal();

  for (const operation of createMaritimeOperations({
    areas,
    adapters,
    guides,
    feedback,
    memory,
    now: options.now
  })) {
    if (operation.kind === "query") runtime.registerQuery(operation as SignalQueryDefinition);
    if (operation.kind === "mutation") runtime.registerMutation(operation as SignalMutationDefinition);
    if (operation.kind === "event") runtime.registerEvent(operation as SignalEventDefinition);
  }

  for (const eventName of MARITIME_OPERATION_NAMES.events) {
    runtime.subscribe(eventName, (envelope) => events.record(envelope), {
      replaySafe: true,
      consumerId: "maritime-aware-event-journal",
      description: "Replay-safe journal for generated guides, action-level risks, feedback, and source degradation."
    });
  }

  return {
    runtime,
    events,
    areas,
    guides,
    feedback,
    memory,
    async searchAreas(query, limit) {
      const result = await runtime.query<{ q: string; limit?: number }, { areas: MaritimeArea[] }>(
        "maritime.area.search.v1",
        { q: query, limit },
        signalRequest("maritime-aware-ui")
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.result.areas;
    },
    async getGuide(areaId, callOptions = {}) {
      const result = await runtime.query<{ areaId: string; fixtureId?: FixtureScenarioId }, MaritimeBriefing>(
        "maritime.guide.get.v1",
        { areaId, fixtureId: callOptions.fixtureId },
        signalRequest("maritime-aware-api")
      );
      if (!result.ok) throw new Error(result.error.message);

      let briefing: MaritimeBriefing = {
        ...result.result,
        operation: {
          ...result.result.operation,
          envelopeId: result.envelope.messageId
        }
      };

      const generated = await runtime.publish("maritime.guide.generated.v1", {
        briefingId: briefing.id,
        areaId: briefing.area.id,
        guidanceLevel: briefing.guidanceLevel,
        generatedAt: briefing.generatedAt
      }, signalRequest("maritime-aware-api", result.envelope.messageId));

      briefing = {
        ...briefing,
        operation: {
          ...briefing.operation,
          generatedEventId: generated.messageId
        }
      };
      guides.save(briefing);

      if (briefing.guidanceLevel === "act" || briefing.guidanceLevel === "urgent") {
        await runtime.publish("maritime.risk.escalated.v1", {
          briefingId: briefing.id,
          areaId: briefing.area.id,
          guidanceLevel: briefing.guidanceLevel,
          riskIds: briefing.risks
            .filter((risk) => risk.guidanceLevel === "act" || risk.guidanceLevel === "urgent")
            .map((risk) => risk.id)
        }, signalRequest("maritime-aware-api", generated.messageId));
      }

      for (const source of briefing.sources.filter((source) => source.status !== "available")) {
        await runtime.publish("maritime.source.degraded.v1", {
          briefingId: briefing.id,
          areaId: briefing.area.id,
          sourceId: source.id,
          status: source.status,
          freshness: source.freshness
        }, signalRequest("maritime-aware-api", generated.messageId));
      }

      return briefing;
    },
    async getGuideDetails(briefingId, riskId) {
      const result = await runtime.query<{ briefingId: string; riskId?: string }, { found: boolean; briefing: MaritimeBriefing | null; risk: MaritimeBriefing["risks"][number] | null }>(
        "maritime.guide.details.v1",
        { briefingId, riskId },
        signalRequest("maritime-aware-api")
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.result;
    },
    async listSources(briefingId) {
      const result = await runtime.query<{ briefingId: string }, { found: boolean; briefingId: string; sources: MaritimeBriefing["sources"] }>(
        "maritime.sources.list.v1",
        { briefingId },
        signalRequest("maritime-aware-api")
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.result;
    },
    async submitFeedback(input) {
      const idempotencyKey = input.idempotencyKey ?? `feedback:${input.briefingId}:${input.riskId ?? "guide"}:${input.helpful}`;
      const result = await runtime.mutation<FeedbackInput, FeedbackResult>(
        "maritime.feedback.submit.v1",
        input,
        {
          ...signalRequest("maritime-aware-api"),
          idempotencyKey
        }
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.result;
    },
    async reviewGuide(input) {
      const idempotencyKey = input.idempotencyKey ?? `review:${input.briefingId}:${input.classification ?? "inconclusive"}`;
      const result = await runtime.mutation<MaritimeReviewInput, MaritimeReviewResult>(
        "maritime.guide.review.v1",
        input,
        {
          ...signalRequest("maritime-aware-api"),
          idempotencyKey
        }
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.result;
    }
  };
}

export { MARITIME_OPERATION_NAMES, listMaritimeOperationContracts };

function createEventJournal(): MaritimeEventJournal {
  const seen = new Set<string>();
  const events: MaritimeEventEnvelope[] = [];
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
      runtime: "signal-maritime-aware-example"
    },
    meta: {
      contracts: listMaritimeOperationContracts().map((contract) => contract.name)
    }
  };
}
