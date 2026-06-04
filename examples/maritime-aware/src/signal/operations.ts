import type { SignalExecutionContext, SignalOperationDefinition } from "@signal/runtime";
import { z } from "zod";
import {
  collectMaritimeContext,
  createFixtureMaritimeAdapters,
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
import { createMaritimeBriefingFromContext } from "./interpreter.js";
import type { MaritimeDecisionMemory } from "./memory.js";

export const MARITIME_OPERATION_NAMES = {
  queries: [
    "maritime.area.search.v1",
    "maritime.guide.get.v1",
    "maritime.guide.details.v1",
    "maritime.sources.list.v1"
  ],
  mutations: [
    "maritime.feedback.submit.v1",
    "maritime.guide.review.v1"
  ],
  events: [
    "maritime.guide.generated.v1",
    "maritime.risk.escalated.v1",
    "maritime.feedback.received.v1",
    "maritime.source.degraded.v1"
  ]
} as const;

export type MaritimeOperationContract = {
  name: string;
  kind: "query" | "mutation" | "event";
  description: string;
  idempotency?: "required" | "optional" | "none";
  emits?: string[];
  replaySafe?: boolean;
};

export type GuideRepository = {
  save(briefing: MaritimeBriefing): void;
  get(briefingId: string): MaritimeBriefing | undefined;
  list(): MaritimeBriefing[];
};

export type FeedbackRepository = {
  save(input: FeedbackInput, receivedAt: string): FeedbackResult;
  list(): FeedbackResult[];
};

export type MaritimeOperationsDependencies = {
  areas: MaritimeAreaService;
  adapters: MaritimeDataAdapter[];
  guides: GuideRepository;
  feedback: FeedbackRepository;
  memory?: MaritimeDecisionMemory;
  now?: () => Date;
};

const fixtureIdSchema = z.enum([
  "steady-harbor",
  "rough-sea",
  "busy-port",
  "environment-watch",
  "route-conflict",
  "stale-evidence",
  "custom-area"
] satisfies [FixtureScenarioId, ...FixtureScenarioId[]]);

const areaSearchInputSchema = z.object({
  q: z.string().min(1),
  limit: z.number().int().min(1).max(20).optional()
});

const guideGetInputSchema = z.object({
  areaId: z.string().min(1),
  fixtureId: fixtureIdSchema.optional()
});

const guideDetailsInputSchema = z.object({
  briefingId: z.string().min(1),
  riskId: z.string().optional()
});

const feedbackInputSchema = z.object({
  briefingId: z.string().min(1),
  riskId: z.string().optional(),
  helpful: z.boolean(),
  comment: z.string().max(1000).optional(),
  idempotencyKey: z.string().optional()
});

const reviewInputSchema = z.object({
  briefingId: z.string().min(1),
  classification: z.enum(["useful", "too_cautious", "too_confident", "missed_context", "inconclusive"]).optional(),
  whatHappened: z.string().max(1200).optional(),
  lesson: z.string().max(1200).optional(),
  idempotencyKey: z.string().optional()
});

const eventPayloadSchema = z.record(z.string(), z.unknown());

export function listMaritimeOperationContracts(): MaritimeOperationContract[] {
  return [
    {
      name: "maritime.area.search.v1",
      kind: "query",
      description: "Search preset or custom maritime areas from plain-language text or coordinates."
    },
    {
      name: "maritime.guide.get.v1",
      kind: "query",
      description: "Collect maritime context and interpret it into a guide-first briefing.",
      emits: [
        "maritime.guide.generated.v1",
        "maritime.risk.escalated.v1",
        "maritime.source.degraded.v1"
      ]
    },
    {
      name: "maritime.guide.details.v1",
      kind: "query",
      description: "Read a generated guide or one risk from a generated guide."
    },
    {
      name: "maritime.sources.list.v1",
      kind: "query",
      description: "List evidence source confidence, freshness, and degradation details for a guide."
    },
    {
      name: "maritime.feedback.submit.v1",
      kind: "mutation",
      description: "Record lightweight user feedback about a maritime guide.",
      idempotency: "required",
      emits: ["maritime.feedback.received.v1"]
    },
    {
      name: "maritime.guide.review.v1",
      kind: "mutation",
      description: "Record a scoped guide review into the Signal decision-memory store.",
      idempotency: "required"
    },
    ...MARITIME_OPERATION_NAMES.events.map((name) => ({
      name,
      kind: "event" as const,
      description: eventDescription(name),
      replaySafe: true
    }))
  ];
}

export function createMaritimeOperations(deps: MaritimeOperationsDependencies): SignalOperationDefinition[] {
  const now = deps.now ?? (() => new Date());
  return [
    {
      name: "maritime.area.search.v1",
      kind: "query",
      description: "Search preset or custom maritime areas from plain-language text or coordinates.",
      inputSchema: areaSearchInputSchema,
      resultSchema: z.object({ areas: z.array(z.custom<MaritimeArea>()) }),
      async handler(input: z.infer<typeof areaSearchInputSchema>) {
        return {
          areas: await deps.areas.search(input.q, input.limit)
        };
      }
    },
    {
      name: "maritime.guide.get.v1",
      kind: "query",
      description: "Collect maritime context and interpret it into a guide-first briefing.",
      inputSchema: guideGetInputSchema,
      resultSchema: z.custom<MaritimeBriefing>(),
      inputSchemaId: "examples/maritime-aware/contracts/guide-get-input.v1",
      resultSchemaId: "examples/maritime-aware/contracts/guide.v1",
      emits: [
        "maritime.guide.generated.v1",
        "maritime.risk.escalated.v1",
        "maritime.source.degraded.v1"
      ],
      async handler(input: z.infer<typeof guideGetInputSchema>) {
        const area = deps.areas.get(input.areaId);
        if (!area) {
          throw new Error(`Unknown maritime area: ${input.areaId}`);
        }
        const adapters = input.fixtureId ? createFixtureMaritimeAdapters(input.fixtureId) : deps.adapters;
        return generateAndSaveGuide({ deps, area, adapters, generatedAt: now().toISOString() });
      }
    },
    {
      name: "maritime.guide.details.v1",
      kind: "query",
      description: "Read a generated guide or one risk from a generated guide.",
      inputSchema: guideDetailsInputSchema,
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: z.infer<typeof guideDetailsInputSchema>) {
        const briefing = deps.guides.get(input.briefingId) ?? await regenerateGuideFromId(deps, input.briefingId, now().toISOString());
        if (!briefing) return { found: false, briefing: null, risk: null };
        const risk = input.riskId ? briefing.risks.find((entry) => entry.id === input.riskId) ?? null : null;
        return { found: true, briefing, risk };
      }
    },
    {
      name: "maritime.sources.list.v1",
      kind: "query",
      description: "List evidence source confidence, freshness, and degradation details for a guide.",
      inputSchema: z.object({ briefingId: z.string().min(1) }),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: { briefingId: string }) {
        const briefing = deps.guides.get(input.briefingId) ?? await regenerateGuideFromId(deps, input.briefingId, now().toISOString());
        return {
          found: Boolean(briefing),
          briefingId: input.briefingId,
          sources: briefing?.sources ?? []
        };
      }
    },
    {
      name: "maritime.feedback.submit.v1",
      kind: "mutation",
      description: "Record lightweight user feedback about a maritime guide.",
      idempotency: "required",
      inputSchema: feedbackInputSchema,
      resultSchema: z.custom<FeedbackResult>(),
      emits: ["maritime.feedback.received.v1"],
      async handler(input: FeedbackInput, context: SignalExecutionContext) {
        const result = deps.feedback.save(input, now().toISOString());
        await context.emit("maritime.feedback.received.v1", {
          feedbackId: result.feedbackId,
          briefingId: result.briefingId,
          receivedAt: result.receivedAt
        });
        return result;
      },
      normalizeIdempotencyInput(input: FeedbackInput) {
        return {
          briefingId: input.briefingId,
          riskId: input.riskId,
          helpful: input.helpful,
          comment: input.comment
        };
      }
    },
    {
      name: "maritime.guide.review.v1",
      kind: "mutation",
      description: "Record a scoped guide review into the Signal decision-memory store.",
      idempotency: "required",
      inputSchema: reviewInputSchema,
      resultSchema: z.custom<MaritimeReviewResult>(),
      async handler(input: MaritimeReviewInput) {
        if (!deps.memory) {
          return {
            reviewId: `maritime-review-disabled-${input.briefingId}`,
            briefingId: input.briefingId,
            recordedAt: now().toISOString(),
            status: "recorded",
            memoryRecordId: "decision-memory-disabled"
          };
        }
        return deps.memory.recordReview(input);
      },
      normalizeIdempotencyInput(input: MaritimeReviewInput) {
        return {
          briefingId: input.briefingId,
          classification: input.classification,
          whatHappened: input.whatHappened,
          lesson: input.lesson
        };
      }
    },
    ...MARITIME_OPERATION_NAMES.events.map((name) => ({
      name,
      kind: "event" as const,
      description: eventDescription(name),
      inputSchema: eventPayloadSchema,
      resultSchema: eventPayloadSchema,
      handler(payload: Record<string, unknown>) {
        return payload;
      }
    }))
  ];
}

async function generateAndSaveGuide(input: {
  deps: MaritimeOperationsDependencies;
  area: MaritimeArea;
  adapters: MaritimeDataAdapter[];
  generatedAt: string;
}): Promise<MaritimeBriefing> {
  const collection = await collectMaritimeContext({
    area: input.area,
    adapters: input.adapters,
    now: input.deps.now
  });
  const initial = createMaritimeBriefingFromContext({
    collection,
    generatedAt: input.generatedAt
  });
  const memoryRecordId = input.deps.memory
    ? await input.deps.memory.recordBriefing({ briefing: initial, observations: collection.observations })
    : undefined;
  const briefing = createMaritimeBriefingFromContext({
    collection,
    generatedAt: initial.generatedAt,
    memoryRecordId
  });
  input.deps.guides.save(briefing);
  return briefing;
}

async function regenerateGuideFromId(
  deps: MaritimeOperationsDependencies,
  briefingId: string,
  generatedAt: string
): Promise<MaritimeBriefing | undefined> {
  const areaId = areaIdFromBriefingId(briefingId);
  if (!areaId) return undefined;
  const area = deps.areas.get(areaId);
  if (!area) return undefined;
  return generateAndSaveGuide({
    deps,
    area,
    adapters: deps.adapters,
    generatedAt
  });
}

function areaIdFromBriefingId(briefingId: string): string | undefined {
  const match = briefingId.match(/^maritime-(.+)-\d{4}-\d{2}-\d{2}-[a-z0-9]+$/);
  return match?.[1];
}

export function createGuideRepository(): GuideRepository {
  const guides = new Map<string, MaritimeBriefing>();
  return {
    save(briefing) {
      guides.set(briefing.id, briefing);
    },
    get(briefingId) {
      return guides.get(briefingId);
    },
    list() {
      return [...guides.values()].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
    }
  };
}

export function createFeedbackRepository(): FeedbackRepository {
  const feedback = new Map<string, FeedbackResult>();
  return {
    save(input, receivedAt) {
      const feedbackId = `maritime-feedback-${smallHash(`${input.briefingId}:${input.riskId ?? "guide"}:${input.helpful}:${input.comment ?? ""}`)}`;
      const result: FeedbackResult = {
        feedbackId,
        briefingId: input.briefingId,
        receivedAt,
        status: "recorded",
        message: "Thanks. Your feedback was recorded for this example."
      };
      feedback.set(feedbackId, result);
      return result;
    },
    list() {
      return [...feedback.values()].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
    }
  };
}

function eventDescription(name: string): string {
  if (name === "maritime.guide.generated.v1") return "A maritime guide was generated.";
  if (name === "maritime.risk.escalated.v1") return "A generated guide reached action or urgent guidance.";
  if (name === "maritime.feedback.received.v1") return "Feedback was recorded for a maritime guide.";
  return "A source used by the maritime guide was degraded, stale, or unavailable.";
}

function smallHash(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(5, "0").slice(0, 8);
}
