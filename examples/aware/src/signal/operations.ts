import type {
  SignalExecutionContext,
  SignalOperationDefinition,
} from "@signal/sdk-node";
import { z } from "zod";
import {
  type RegionService,
  type SafetyDataAdapter,
  collectSafetyObservations,
} from "../adapters.js";
import type {
  Briefing,
  BriefingReviewInput,
  BriefingReviewResult,
  FeedbackInput,
  FeedbackResult,
  FixtureScenarioId,
  Region,
} from "../contracts.js";
import { AWARE_FIXTURE_IDS } from "../fixtures.js";
import { createBriefingFromObservations } from "./interpreter.js";
import type { AwareDecisionMemory } from "./memory.js";

export const AWARE_OPERATION_NAMES = {
  queries: [
    "aware.region.search.v1",
    "aware.briefing.get.v1",
    "aware.briefing.details.v1",
    "aware.sources.list.v1",
  ],
  mutations: ["aware.feedback.submit.v1", "aware.briefing.review.v1"],
  events: [
    "aware.briefing.generated.v1",
    "aware.risk.escalated.v1",
    "aware.feedback.received.v1",
    "aware.source.degraded.v1",
  ],
} as const;

export type AwareOperationContract = {
  name: string;
  kind: "query" | "mutation" | "event";
  description: string;
  idempotency?: "required" | "optional" | "none";
  emits?: string[];
  replaySafe?: boolean;
};

export type BriefingRepository = {
  save(briefing: Briefing): void;
  get(briefingId: string): Briefing | undefined;
  list(): Briefing[];
};

export type FeedbackRepository = {
  save(input: FeedbackInput, receivedAt: string): FeedbackResult;
  list(): FeedbackResult[];
};

export type AwareOperationsDependencies = {
  regions: RegionService;
  adapters: SafetyDataAdapter[];
  briefings: BriefingRepository;
  feedback: FeedbackRepository;
  memory?: AwareDecisionMemory;
  now?: () => Date;
};

const fixtureIdSchema = z.enum([
  "normal-day",
  "strong-uv-day",
  "heat-warning-day",
  "heavy-rain-flood-risk-day",
  "poor-air-quality-day",
  "mosquito-activity-warning",
  "multiple-simultaneous-risks",
  "source-unavailable",
] satisfies [FixtureScenarioId, ...FixtureScenarioId[]]);

const regionSearchInputSchema = z.object({
  q: z.string().min(1),
  limit: z.number().int().min(1).max(20).optional(),
});

const briefingGetInputSchema = z.object({
  regionId: z.string().min(1),
  fixtureId: fixtureIdSchema.optional(),
});

const briefingDetailsInputSchema = z.object({
  briefingId: z.string().min(1),
  itemId: z.string().optional(),
});

const feedbackInputSchema = z.object({
  briefingId: z.string().min(1),
  itemId: z.string().optional(),
  helpful: z.boolean(),
  comment: z.string().max(1000).optional(),
  idempotencyKey: z.string().optional(),
});

const reviewInputSchema = z.object({
  briefingId: z.string().min(1),
  classification: z
    .enum(["correct", "wrong", "early", "late", "inconclusive"])
    .optional(),
  whatHappened: z.string().max(1200).optional(),
  lesson: z.string().max(1200).optional(),
  idempotencyKey: z.string().optional(),
});

const eventPayloadSchema = z.record(z.string(), z.unknown());

export function listAwareOperationContracts(): AwareOperationContract[] {
  return [
    {
      name: "aware.region.search.v1",
      kind: "query",
      description:
        "Search supported demo regions by plain-language city or region text.",
    },
    {
      name: "aware.briefing.get.v1",
      kind: "query",
      description:
        "Fetch normalized safety observations and interpret them into a daily briefing.",
      emits: [
        "aware.briefing.generated.v1",
        "aware.risk.escalated.v1",
        "aware.source.degraded.v1",
      ],
    },
    {
      name: "aware.briefing.details.v1",
      kind: "query",
      description:
        "Read UI-ready details for a generated briefing or one briefing item.",
    },
    {
      name: "aware.sources.list.v1",
      kind: "query",
      description:
        "List source reliability, freshness, and degradation details for a briefing.",
    },
    {
      name: "aware.feedback.submit.v1",
      kind: "mutation",
      description: "Record lightweight user feedback about a briefing.",
      idempotency: "required",
      emits: ["aware.feedback.received.v1"],
    },
    {
      name: "aware.briefing.review.v1",
      kind: "mutation",
      description:
        "Record a scoped review into the example decision-memory store.",
      idempotency: "required",
    },
    ...AWARE_OPERATION_NAMES.events.map((name) => ({
      name,
      kind: "event" as const,
      description: eventDescription(name),
      replaySafe: true,
    })),
  ];
}

export function createAwareOperations(
  deps: AwareOperationsDependencies,
): SignalOperationDefinition[] {
  const now = deps.now ?? (() => new Date());
  return [
    {
      name: "aware.region.search.v1",
      kind: "query",
      description:
        "Search supported demo regions by plain-language city or region text.",
      inputSchema: regionSearchInputSchema,
      resultSchema: z.object({ regions: z.array(z.custom<Region>()) }),
      async handler(input: z.infer<typeof regionSearchInputSchema>) {
        return {
          regions: await deps.regions.search(input.q, input.limit),
        };
      },
    },
    {
      name: "aware.briefing.get.v1",
      kind: "query",
      description:
        "Fetch normalized safety observations and interpret them into a daily briefing.",
      inputSchema: briefingGetInputSchema,
      resultSchema: z.custom<Briefing>(),
      inputSchemaId: "examples/aware/contracts/briefing-get-input.v1",
      resultSchemaId: "examples/aware/contracts/briefing.v1",
      emits: [
        "aware.briefing.generated.v1",
        "aware.risk.escalated.v1",
        "aware.source.degraded.v1",
      ],
      async handler(input: z.infer<typeof briefingGetInputSchema>) {
        const region = deps.regions.get(input.regionId);
        if (!region) {
          throw new Error(`Unknown region: ${input.regionId}`);
        }
        const adapters = input.fixtureId
          ? await import("../adapters.js").then((mod) =>
              mod.createFixtureAwareAdapters(input.fixtureId),
            )
          : deps.adapters;
        return generateAndSaveBriefing({
          deps,
          region,
          adapters,
          generatedAt: now().toISOString(),
        });
      },
    },
    {
      name: "aware.briefing.details.v1",
      kind: "query",
      description:
        "Read UI-ready details for a generated briefing or one briefing item.",
      inputSchema: briefingDetailsInputSchema,
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: z.infer<typeof briefingDetailsInputSchema>) {
        const briefing =
          deps.briefings.get(input.briefingId) ??
          (await regenerateBriefingFromId(
            deps,
            input.briefingId,
            now().toISOString(),
          ));
        if (!briefing) return { found: false, briefing: null, item: null };
        const item = input.itemId
          ? (briefing.items.find((entry) => entry.id === input.itemId) ?? null)
          : null;
        return { found: true, briefing, item };
      },
    },
    {
      name: "aware.sources.list.v1",
      kind: "query",
      description:
        "List source reliability, freshness, and degradation details for a briefing.",
      inputSchema: z.object({ briefingId: z.string().min(1) }),
      resultSchema: z.record(z.string(), z.unknown()),
      async handler(input: { briefingId: string }) {
        const briefing =
          deps.briefings.get(input.briefingId) ??
          (await regenerateBriefingFromId(
            deps,
            input.briefingId,
            now().toISOString(),
          ));
        return {
          found: Boolean(briefing),
          briefingId: input.briefingId,
          sources: briefing?.sources ?? [],
        };
      },
    },
    {
      name: "aware.feedback.submit.v1",
      kind: "mutation",
      description: "Record lightweight user feedback about a briefing.",
      idempotency: "required",
      inputSchema: feedbackInputSchema,
      resultSchema: z.custom<FeedbackResult>(),
      emits: ["aware.feedback.received.v1"],
      async handler(input: FeedbackInput, context: SignalExecutionContext) {
        const result = deps.feedback.save(input, now().toISOString());
        await context.emit("aware.feedback.received.v1", {
          feedbackId: result.feedbackId,
          briefingId: result.briefingId,
          receivedAt: result.receivedAt,
        });
        return result;
      },
      normalizeIdempotencyInput(input: FeedbackInput) {
        return {
          briefingId: input.briefingId,
          itemId: input.itemId,
          helpful: input.helpful,
          comment: input.comment,
        };
      },
    },
    {
      name: "aware.briefing.review.v1",
      kind: "mutation",
      description:
        "Record a scoped review into the example decision-memory store.",
      idempotency: "required",
      inputSchema: reviewInputSchema,
      resultSchema: z.custom<BriefingReviewResult>(),
      async handler(input: BriefingReviewInput) {
        if (!deps.memory) {
          return {
            reviewId: `aware-review-disabled-${input.briefingId}`,
            briefingId: input.briefingId,
            recordedAt: now().toISOString(),
            status: "recorded",
            memoryRecordId: "decision-memory-disabled",
          };
        }
        return deps.memory.recordReview(input);
      },
      normalizeIdempotencyInput(input: BriefingReviewInput) {
        return {
          briefingId: input.briefingId,
          classification: input.classification,
          whatHappened: input.whatHappened,
          lesson: input.lesson,
        };
      },
    },
    ...AWARE_OPERATION_NAMES.events.map((name) => ({
      name,
      kind: "event" as const,
      description: eventDescription(name),
      inputSchema: eventPayloadSchema,
      resultSchema: eventPayloadSchema,
      handler(payload: Record<string, unknown>) {
        return payload;
      },
    })),
  ];
}

async function generateAndSaveBriefing(input: {
  deps: AwareOperationsDependencies;
  region: Region;
  adapters: SafetyDataAdapter[];
  generatedAt: string;
}): Promise<Briefing> {
  const collection = await collectSafetyObservations({
    region: input.region,
    adapters: input.adapters,
  });
  const initial = createBriefingFromObservations({
    collection,
    generatedAt: input.generatedAt,
  });
  const memoryRecordId = input.deps.memory
    ? await input.deps.memory.recordBriefing({
        briefing: initial,
        observations: collection.observations,
      })
    : undefined;
  const briefing = createBriefingFromObservations({
    collection,
    generatedAt: initial.generatedAt,
    memoryRecordId,
  });
  input.deps.briefings.save(briefing);
  return briefing;
}

async function regenerateBriefingFromId(
  deps: AwareOperationsDependencies,
  briefingId: string,
  generatedAt: string,
): Promise<Briefing | undefined> {
  const regionId = regionIdFromBriefingId(briefingId);
  if (!regionId) return undefined;
  const region = deps.regions.get(regionId);
  if (!region) return undefined;
  return generateAndSaveBriefing({
    deps,
    region,
    adapters: deps.adapters,
    generatedAt,
  });
}

function regionIdFromBriefingId(briefingId: string): string | undefined {
  const match = briefingId.match(/^aware-(.+)-\d{4}-\d{2}-\d{2}-[a-z0-9]+$/);
  return match?.[1];
}

export function createBriefingRepository(): BriefingRepository {
  const briefings = new Map<string, Briefing>();
  return {
    save(briefing) {
      briefings.set(briefing.id, briefing);
    },
    get(briefingId) {
      return briefings.get(briefingId);
    },
    list() {
      return [...briefings.values()].sort((left, right) =>
        right.generatedAt.localeCompare(left.generatedAt),
      );
    },
  };
}

export function createFeedbackRepository(): FeedbackRepository {
  const feedback = new Map<string, FeedbackResult>();
  return {
    save(input, receivedAt) {
      const feedbackId = `aware-feedback-${smallHash(`${input.briefingId}:${input.itemId ?? "briefing"}:${input.helpful}:${input.comment ?? ""}`)}`;
      const result: FeedbackResult = {
        feedbackId,
        briefingId: input.briefingId,
        receivedAt,
        status: "recorded",
        message: "Thanks. Your feedback was recorded for this example.",
      };
      feedback.set(feedbackId, result);
      return result;
    },
    list() {
      return [...feedback.values()].sort((left, right) =>
        right.receivedAt.localeCompare(left.receivedAt),
      );
    },
  };
}

function eventDescription(name: string): string {
  if (name === "aware.briefing.generated.v1")
    return "A regional briefing was generated.";
  if (name === "aware.risk.escalated.v1")
    return "A generated briefing reached urgency or emergency attention.";
  if (name === "aware.feedback.received.v1")
    return "Feedback was recorded for a briefing.";
  return "A source used by the briefing was degraded or unavailable.";
}

function smallHash(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(5, "0").slice(0, 8);
}
