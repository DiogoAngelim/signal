import { isSignalName, type SignalEnvelope } from "@signal/protocol";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const isoDateTime = z.string().datetime();
const uuid = z.string().uuid();

export const workbenchSignalEventSchema = z.object({
  schemaVersion: z.literal(2),
  sourceRevision: z.number().int().min(1).max(2_147_483_647),
  eventId: z.string().trim().min(8).max(160),
  signalId: z.string().trim().min(8).max(160),
  ownerId: z.string().trim().min(1).max(160),
  eventType: z.enum(["signal.created", "signal.updated", "signal.retracted", "signal.reinstated"]),
  relationshipId: uuid.optional(),
  opportunityId: uuid.optional(),
  sourceName: z.string().trim().min(2).max(160),
  signalType: z.string().trim().min(2).max(80),
  title: z.string().trim().min(3).max(240),
  statement: z.string().trim().min(10).max(5_000),
  sourceUrl: z.string().url().max(2_000).refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }).optional(),
  observedAt: isoDateTime,
  confidence: z.number().finite().min(0).max(1).nullable().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
}).refine((value) => Boolean(value.relationshipId || value.opportunityId), {
  message: "A relationship or opportunity is required.",
});

export type WorkbenchSignalEvent = z.input<typeof workbenchSignalEventSchema>;

const cursorSchema = z.object({
  after: isoDateTime,
  afterId: uuid,
  afterChangeId: uuid,
});

export type WorkbenchOutcomeCursor = z.infer<typeof cursorSchema>;

/** Preserve sub-millisecond precision when comparing PostgreSQL timestamp cursors. */
function timestampNanoseconds(value: string): bigint {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new RangeError("Outcome cursor timestamp is invalid.");
  const fraction = value.match(/\.(\d+)(?=Z$|[+-]\d{2}:\d{2}$)/)?.[1] ?? "";
  const nanoseconds = BigInt(fraction.slice(0, 9).padEnd(9, "0") || "0");
  const millisecondsFraction = BigInt(fraction.slice(0, 3).padEnd(3, "0") || "0") * 1_000_000n;
  return BigInt(milliseconds) * 1_000_000n + nanoseconds - millisecondsFraction;
}

/** Match PostgreSQL's ascending (timestamp, uuid, uuid) keyset ordering. */
function compareOutcomeCursors(left: WorkbenchOutcomeCursor, right: WorkbenchOutcomeCursor): number {
  const leftTime = timestampNanoseconds(left.after);
  const rightTime = timestampNanoseconds(right.after);
  if (leftTime !== rightTime) return leftTime < rightTime ? -1 : 1;
  const leftId = left.afterId.toLowerCase();
  const rightId = right.afterId.toLowerCase();
  if (leftId !== rightId) return leftId < rightId ? -1 : 1;
  const leftChangeId = left.afterChangeId.toLowerCase();
  const rightChangeId = right.afterChangeId.toLowerCase();
  return leftChangeId === rightChangeId ? 0 : leftChangeId < rightChangeId ? -1 : 1;
}

function cursorForOutcome(event: WorkbenchOutcomeEvent): WorkbenchOutcomeCursor {
  return {
    after: event.occurredAt,
    afterId: event.outcomeId,
    afterChangeId: event.cashChangeCursorId,
  };
}

const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/).nullable();

export const workbenchOutcomeEventSchema = z.object({
  eventId: z.string().min(1).max(500),
  schemaVersion: z.literal(1),
  eventType: z.literal("workbench.outcome.recorded"),
  outcomeId: uuid,
  opportunityId: uuid,
  cashChangeCursorId: uuid,
  channel: z.string().nullable(),
  engagementType: z.string().nullable(),
  result: z.string().min(1),
  actualSalesHours: z.number().finite().nonnegative().nullable(),
  actualDeliveryHours: z.number().finite().nonnegative().nullable(),
  actualRevenueUsd: decimal,
  actualCostUsd: decimal,
  collectedUsd: z.string().regex(/^-?\d+(?:\.\d+)?$/),
  currency: z.literal("USD"),
  outcomeRecordedAt: isoDateTime,
  occurredAt: isoDateTime,
});

export type WorkbenchOutcomeEvent = z.infer<typeof workbenchOutcomeEventSchema>;

const outcomePageSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal("workbench"),
  events: z.array(workbenchOutcomeEventSchema).max(100),
  nextCursor: cursorSchema.nullable(),
  limitation: z.string().optional(),
});

type OutcomePage = z.infer<typeof outcomePageSchema>;

export interface WorkbenchOutcomeSink {
  /** Return the last durably committed cursor for this owner, or null. */
  getCursor(ownerId: string): Promise<WorkbenchOutcomeCursor | null>;
  /**
   * Persist the complete page, deduplicate on (ownerId,eventId), and advance
   * the cursor in one durable transaction. Throwing must leave both unchanged.
   * Keep owner partitions isolated; never train across owners implicitly.
   */
  persistPage(input: {
    ownerId: string;
    previousCursor: WorkbenchOutcomeCursor | null;
    nextCursor: WorkbenchOutcomeCursor | null;
    events: readonly WorkbenchOutcomeEvent[];
  }): Promise<{ accepted: number; duplicates: number }>;
}

export class WorkbenchConnectorError extends Error {
  // Preserve retryability when passing through SignalRuntime.toSignalFailure.
  // Without a protocol error code, the runtime falls back to INTERNAL_ERROR
  // and mistakenly marks permanent downstream 4xx rejections retryable.
  readonly code = "TRANSPORT_ERROR" as const;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly responseBody: string | null;

  constructor(message: string, options: {
    status?: number | null;
    retryable?: boolean;
    responseBody?: string | null;
  } = {}) {
    super(message);
    this.name = "WorkbenchConnectorError";
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
    this.responseBody = options.responseBody ?? null;
  }
}

export interface CreateWorkbenchConnectorOptions {
  baseUrl: string;
  ownerId: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface WorkbenchConnector {
  publishSignalEvent(event: WorkbenchSignalEvent): Promise<{
    accepted: true;
    duplicate: boolean;
    eventId: string;
    sourceRevision: number;
  }>;
  pollOutcomePage(cursor?: WorkbenchOutcomeCursor | null, limit?: number): Promise<{
    events: WorkbenchOutcomeEvent[];
    nextCursor: WorkbenchOutcomeCursor | null;
    limitation?: string;
  }>;
  syncOutcomes(input: {
    sink: WorkbenchOutcomeSink;
    cursor?: WorkbenchOutcomeCursor | null;
    pageSize?: number;
    maxPages?: number;
  }): Promise<{
    pages: number;
    accepted: number;
    duplicates: number;
    cursor: WorkbenchOutcomeCursor | null;
  }>;
}

function signature(raw: string, token: string): string {
  return createHmac("sha256", token).update(raw, "utf8").digest("hex");
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new WorkbenchConnectorError("Workbench response exceeded the configured size limit.", {
          status: response.status,
          retryable: false,
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function safeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Build a tenant-scoped, signed client for the Workbench v2 event contract. */
export function createWorkbenchConnector(options: CreateWorkbenchConnectorOptions): WorkbenchConnector {
  const baseUrl = new URL(options.baseUrl);
  if (baseUrl.protocol !== "https:" && baseUrl.hostname !== "localhost" && baseUrl.hostname !== "127.0.0.1") {
    throw new RangeError("Workbench baseUrl must use HTTPS outside localhost.");
  }
  if (!options.ownerId.trim() || options.ownerId.length > 160) {
    throw new RangeError("ownerId must contain 1 to 160 characters.");
  }
  if (options.token.length < 32) throw new RangeError("Workbench token must contain at least 32 characters.");

  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? 1_048_576;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    throw new RangeError("timeoutMs must be between 100 and 120000.");
  }
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1_024 || maxResponseBytes > 5_000_000) {
    throw new RangeError("maxResponseBytes must be between 1024 and 5000000.");
  }

  async function request<T>(path: string, raw: string, signatureHeader: string): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signal-token": options.token,
          [signatureHeader]: "sha256=" + signature(raw, options.token),
        },
        body: raw,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
        redirect: "error",
      });
    } catch (error) {
      throw new WorkbenchConnectorError(
        error instanceof Error ? error.message : "Workbench request failed.",
        { retryable: true },
      );
    }

    const body = await readLimitedBody(response, maxResponseBytes);
    if (!response.ok) {
      throw new WorkbenchConnectorError("Workbench rejected the connector request.", {
        status: response.status,
        retryable: response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500,
        responseBody: body.slice(0, 2_000),
      });
    }
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new WorkbenchConnectorError("Workbench returned invalid JSON.", {
        status: response.status,
        retryable: false,
        responseBody: body.slice(0, 2_000),
      });
    }
  }

  return {
    async publishSignalEvent(input) {
      const event = workbenchSignalEventSchema.parse(input);
      if (event.ownerId !== options.ownerId) {
        throw new WorkbenchConnectorError("Signal event owner does not match the configured credential owner.");
      }
      const raw = JSON.stringify(event);
      const result = await request<unknown>("/api/integrations/signal/events", raw, "x-signal-signature");
      const accepted = z.object({
        accepted: z.literal(true),
        duplicate: z.boolean(),
        eventId: z.string(),
        sourceRevision: z.number().int(),
      }).parse(result);
      if (accepted.eventId !== event.eventId || accepted.sourceRevision !== event.sourceRevision) {
        throw new WorkbenchConnectorError("Workbench acknowledgement does not match the submitted event.");
      }
      return accepted;
    },

    async pollOutcomePage(cursor = null, limit = 50) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new RangeError("Outcome page limit must be an integer between 1 and 100.");
      }
      const parsedCursor = cursor === null ? null : cursorSchema.parse(cursor);
      const body = {
        ownerId: options.ownerId,
        ...(parsedCursor ? parsedCursor : {}),
        limit,
      };
      const raw = JSON.stringify(body);
      const result = outcomePageSchema.parse(
        await request<unknown>("/api/integrations/signal/outcomes", raw, "x-signal-export-signature"),
      ) satisfies OutcomePage;
      return {
        events: result.events,
        nextCursor: result.nextCursor,
        ...(result.limitation ? { limitation: result.limitation } : {}),
      };
    },

    async syncOutcomes(input) {
      const pageSize = input.pageSize ?? 50;
      const maxPages = input.maxPages ?? 20;
      if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 1_000) {
        throw new RangeError("maxPages must be an integer between 1 and 1000.");
      }
      let cursor = input.cursor ? cursorSchema.parse(input.cursor) : await input.sink.getCursor(options.ownerId);
      let pages = 0;
      let accepted = 0;
      let duplicates = 0;

      while (pages < maxPages) {
        const page = await this.pollOutcomePage(cursor, pageSize);
        if (page.events.length > 0 && !page.nextCursor) {
          throw new WorkbenchConnectorError("Workbench returned outcome events without a continuation cursor.");
        }
        if (cursor && page.nextCursor && compareOutcomeCursors(page.nextCursor, cursor) <= 0) {
          throw new WorkbenchConnectorError("Workbench outcome cursor did not advance.");
        }
        let previousEventCursor = cursor;
        for (const event of page.events) {
          const eventCursor = cursorForOutcome(event);
          if (previousEventCursor && compareOutcomeCursors(eventCursor, previousEventCursor) <= 0) {
            throw new WorkbenchConnectorError("Workbench outcome events are not strictly ordered after the committed cursor.");
          }
          previousEventCursor = eventCursor;
        }
        if (page.events.length > 0 && page.nextCursor &&
            compareOutcomeCursors(page.nextCursor, cursorForOutcome(page.events[page.events.length - 1])) !== 0) {
          throw new WorkbenchConnectorError("Workbench continuation cursor does not match the final event in the page.");
        }
        const persisted = await input.sink.persistPage({
          ownerId: options.ownerId,
          previousCursor: cursor,
          nextCursor: page.nextCursor ?? cursor,
          events: page.events,
        });
        if (!Number.isSafeInteger(persisted.accepted) || persisted.accepted < 0 ||
            !Number.isSafeInteger(persisted.duplicates) || persisted.duplicates < 0 ||
            persisted.accepted + persisted.duplicates !== page.events.length) {
          throw new WorkbenchConnectorError("Outcome sink did not account for every event in the page.");
        }
        accepted += persisted.accepted;
        duplicates += persisted.duplicates;
        pages += 1;
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
        if (page.events.length === 0) break;
      }
      return { pages, accepted, duplicates, cursor };
    },
  };
}

export function verifyWorkbenchSignature(raw: string, supplied: string, token: string): boolean {
  const value = supplied.replace(/^sha256=/i, "").trim();
  return safeEqualHex(signature(raw, token), value);
}

export { createPostgresWorkbenchOutcomeSink } from "./postgres-outcome-sink";
export type { CreatePostgresWorkbenchOutcomeSinkOptions } from "./postgres-outcome-sink";


/**
 * Connect Signal's durable event dispatch to Workbench. The mapper is explicit
 * so the adapter never guesses owner, relationship, opportunity, source, or
 * business meaning from arbitrary Signal payloads. A publish failure is
 * re-thrown to the EventPort dispatcher so its outbox can retry the delivery.
 */
export interface SignalEventSubscriber {
  subscribe(
    name: string,
    handler: (envelope: SignalEnvelope) => void | Promise<void>,
    options?: { consumerId?: string; description?: string; replaySafe?: boolean },
  ): () => void;
}

export function subscribeToSignalEvents(
  runtime: SignalEventSubscriber,
  connector: Pick<WorkbenchConnector, "publishSignalEvent">,
  eventNames: readonly string[],
  mapEnvelope: (envelope: SignalEnvelope) => WorkbenchSignalEvent | null | Promise<WorkbenchSignalEvent | null>,
): () => void {
  const names = [...new Set(eventNames.map((name) => name.trim()).filter(Boolean))];
  if (names.length === 0) throw new RangeError("At least one Signal event name is required.");
  if (names.some((name) => !isSignalName(name))) {
    throw new RangeError("Signal event names must use the versioned domain.action.vN format.");
  }
  const unsubscribers = names.map((name) => runtime.subscribe(name, async (envelope) => {
    const event = await mapEnvelope(envelope);
    if (event) await connector.publishSignalEvent(event);
  }, {
    consumerId: `workbench-connector:${name}`,
    description: "Publish selected Signal events to the owner-scoped Workbench integration.",
    replaySafe: true,
  }));
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
