import { createHmac } from "node:crypto";
import { createSignalEnvelope } from "@signal/protocol";
import { describe, expect, it, vi } from "vitest";
import {
  createWorkbenchConnector,
  subscribeToSignalEvents,
  type WorkbenchOutcomeEvent,
  type WorkbenchOutcomeCursor,
} from "../src";

const token = "a".repeat(48);
const ownerId = "owner-123";
const event = {
  schemaVersion: 2 as const,
  sourceRevision: 1,
  eventId: "event_00000001",
  signalId: "signal_0000001",
  ownerId,
  eventType: "signal.created" as const,
  opportunityId: "2b46c98b-97f3-4d35-9cc3-5a21a1a6f922",
  sourceName: "Company newsroom",
  signalType: "delivery_capacity",
  title: "New delivery team",
  statement: "The company announced a new enterprise delivery team.",
  sourceUrl: "https://example.com/news/team",
  observedAt: "2026-11-12T12:00:00.000Z",
  confidence: 0.82,
  payload: { sourcePublishedAt: "2026-11-11T09:00:00.000Z" },
};

function signed(raw: string): string {
  return "sha256=" + createHmac("sha256", token).update(raw).digest("hex");
}

function outcome(overrides: Partial<WorkbenchOutcomeEvent> = {}): WorkbenchOutcomeEvent {
  return {
    eventId: "workbench-outcome:11111111-1111-4111-8111-111111111111:initial",
    schemaVersion: 1,
    eventType: "workbench.outcome.recorded",
    outcomeId: "11111111-1111-4111-8111-111111111111",
    opportunityId: "22222222-2222-4222-8222-222222222222",
    cashChangeCursorId: "22222222-2222-4222-8222-222222222222",
    channel: "agency",
    engagementType: "retainer",
    result: "won",
    actualSalesHours: 3,
    actualDeliveryHours: 24,
    actualRevenueUsd: "2500.00",
    actualCostUsd: "250.00",
    collectedUsd: "1250.00",
    currency: "USD",
    outcomeRecordedAt: "2026-11-12T12:00:00.000Z",
    occurredAt: "2026-11-12T12:00:00.000Z",
    ...overrides,
  };
}

const cursor: WorkbenchOutcomeCursor = {
  after: "2026-11-12T12:00:00.000Z",
  afterId: "11111111-1111-4111-8111-111111111111",
  afterChangeId: "22222222-2222-4222-8222-222222222222",
};

describe("@signal/workbench-connector", () => {
  it("signs the exact Signal event body and checks the owner-scoped acknowledgement", async () => {
    const fetchMock = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const raw = String(init?.body);
      expect((init?.headers as Record<string, string>)["x-signal-signature"]).toBe(signed(raw));
      expect((init?.headers as Record<string, string>)["x-signal-token"]).toBe(token);
      expect(JSON.parse(raw)).toMatchObject(event);
      return Response.json({
        accepted: true, duplicate: false, eventId: event.eventId, sourceRevision: 1,
      });
    });
    const connector = createWorkbenchConnector({
      baseUrl: "https://workbench.example",
      ownerId,
      token,
      fetch: fetchMock as typeof fetch,
    });
    await expect(connector.publishSignalEvent(event)).resolves.toEqual({
      accepted: true, duplicate: false, eventId: event.eventId, sourceRevision: 1,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects cross-owner publication before making a network request", async () => {
    const fetchMock = vi.fn();
    const connector = createWorkbenchConnector({
      baseUrl: "https://workbench.example", ownerId, token, fetch: fetchMock as typeof fetch,
    });
    await expect(connector.publishSignalEvent({ ...event, ownerId: "other-owner" })).rejects.toThrow(/owner/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs outcome polling and validates USD-denominated snapshots", async () => {
    const fetchMock = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const raw = String(init?.body);
      expect((init?.headers as Record<string, string>)["x-signal-export-signature"]).toBe(signed(raw));
      expect(JSON.parse(raw)).toEqual({ ownerId, limit: 50 });
      return Response.json({
        schemaVersion: 1,
        source: "workbench",
        events: [outcome()],
        nextCursor: cursor,
      });
    });
    const connector = createWorkbenchConnector({
      baseUrl: "https://workbench.example", ownerId, token, fetch: fetchMock as typeof fetch,
    });
    const page = await connector.pollOutcomePage();
    expect(page.events).toHaveLength(1);
    expect(page.events[0].collectedUsd).toBe("1250.00");
    expect(page.nextCursor).toEqual(cursor);
  });

  it("rejects outcomes with unexpected currency instead of normalizing them", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      schemaVersion: 1, source: "workbench", events: [outcome({ currency: "BRL" as "USD" })], nextCursor: null,
    }));
    const connector = createWorkbenchConnector({
      baseUrl: "https://workbench.example", ownerId, token, fetch: fetchMock as typeof fetch,
    });
    await expect(connector.pollOutcomePage()).rejects.toThrow();
  });

  it("persists each outcome page and its cursor through the caller's atomic sink", async () => {
    const pages = [
      { schemaVersion: 1, source: "workbench", events: [outcome()], nextCursor: cursor },
      { schemaVersion: 1, source: "workbench", events: [], nextCursor: null },
    ];
    const fetchMock = vi.fn(async () => Response.json(pages.shift()));
    const persistPage = vi.fn(async (input: {
      ownerId: string; previousCursor: WorkbenchOutcomeCursor | null;
      nextCursor: WorkbenchOutcomeCursor | null; events: readonly WorkbenchOutcomeEvent[];
    }) => ({ accepted: input.events.length, duplicates: 0 }));
    const getCursor = vi.fn(async () => null);
    const connector = createWorkbenchConnector({
      baseUrl: "https://workbench.example", ownerId, token, fetch: fetchMock as typeof fetch,
    });
    const result = await connector.syncOutcomes({ sink: { getCursor, persistPage } });
    expect(result).toEqual({ pages: 2, accepted: 1, duplicates: 0, cursor });
    expect(getCursor).toHaveBeenCalledWith(ownerId);
    expect(persistPage).toHaveBeenCalledTimes(2);
    expect(persistPage.mock.calls[1][0].previousCursor).toEqual(cursor);
    expect(persistPage.mock.calls[1][0].nextCursor).toEqual(cursor);
  });


  it("bridges only explicitly mapped Signal runtime events and propagates publish failures", async () => {
    const handlers = new Map<string, (envelope: ReturnType<typeof createSignalEnvelope>) => void | Promise<void>>();
    const subscribe = vi.fn((name: string, handler: (envelope: ReturnType<typeof createSignalEnvelope>) => void | Promise<void>, options?: { consumerId?: string; description?: string; replaySafe?: boolean }) => {
      handlers.set(name, handler);
      expect(options).toMatchObject({ consumerId: "workbench-connector:signal.finding.created.v1", replaySafe: true });
      return () => { handlers.delete(name); };
    });
    const runtime = { subscribe };
    const publishSignalEvent = vi.fn(async () => ({
      accepted: true as const, duplicate: false, eventId: event.eventId, sourceRevision: event.sourceRevision,
    }));
    const unsubscribe = subscribeToSignalEvents(
      runtime,
      { publishSignalEvent },
      ["signal.finding.created.v1"],
      (envelope) => envelope.name === "signal.finding.created.v1" ? event : null,
    );
    const envelope = createSignalEnvelope({
      kind: "event",
      name: "signal.finding.created.v1",
      payload: { signalId: event.signalId },
    });
    await handlers.get("signal.finding.created.v1")?.(envelope);
    expect(publishSignalEvent).toHaveBeenCalledWith(event);
    expect(subscribe).toHaveBeenCalledOnce();
    unsubscribe();
    expect(handlers.has("signal.finding.created.v1")).toBe(false);
  });

  it("rejects unversioned Signal event subscription names", () => {
    const runtime = { subscribe: vi.fn(() => () => undefined) };
    const connector = { publishSignalEvent: vi.fn() };
    expect(() => subscribeToSignalEvents(
      runtime,
      connector,
      ["signal.finding.created"],
      () => null,
    )).toThrow(/versioned/);
    expect(runtime.subscribe).not.toHaveBeenCalled();
  });


  it("rejects a non-advancing outcome cursor before committing the page", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      schemaVersion: 1, source: "workbench", events: [outcome()], nextCursor: cursor,
    }));
    const getCursor = vi.fn(async () => cursor);
    const persistPage = vi.fn(async () => ({ accepted: 1, duplicates: 0 }));
    const connector = createWorkbenchConnector({
      baseUrl: "https://workbench.example", ownerId, token, fetch: fetchMock as typeof fetch,
    });
    await expect(connector.syncOutcomes({ sink: { getCursor, persistPage } }))
      .rejects.toThrow(/cursor did not advance/i);
    expect(persistPage).not.toHaveBeenCalled();
  });

  it("rejects a regressive cursor even when it is not identical to the committed cursor", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      schemaVersion: 1, source: "workbench", events: [], nextCursor: {
        ...cursor, after: "2026-11-12T11:59:00.000Z",
      },
    }));
    const getCursor = vi.fn(async () => cursor);
    const persistPage = vi.fn(async () => ({ accepted: 0, duplicates: 0 }));
    const connector = createWorkbenchConnector({
      baseUrl: "https://workbench.example", ownerId, token, fetch: fetchMock as typeof fetch,
    });
    await expect(connector.syncOutcomes({ sink: { getCursor, persistPage } }))
      .rejects.toThrow(/cursor did not advance/i);
    expect(persistPage).not.toHaveBeenCalled();
  });

  it("requires the continuation cursor to identify the final event in its page", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      schemaVersion: 1, source: "workbench", events: [outcome()],
      nextCursor: { ...cursor, afterChangeId: "33333333-3333-4333-8333-333333333333" },
    }));
    const getCursor = vi.fn(async () => null);
    const persistPage = vi.fn(async () => ({ accepted: 1, duplicates: 0 }));
    const connector = createWorkbenchConnector({
      baseUrl: "https://workbench.example", ownerId, token, fetch: fetchMock as typeof fetch,
    });
    await expect(connector.syncOutcomes({ sink: { getCursor, persistPage } }))
      .rejects.toThrow(/does not match the final event/i);
    expect(persistPage).not.toHaveBeenCalled();
  });

  it("rejects outcome events without a continuation cursor before persistence", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      schemaVersion: 1, source: "workbench", events: [outcome()], nextCursor: null,
    }));
    const getCursor = vi.fn(async () => null);
    const persistPage = vi.fn(async () => ({ accepted: 1, duplicates: 0 }));
    const connector = createWorkbenchConnector({
      baseUrl: "https://workbench.example", ownerId, token, fetch: fetchMock as typeof fetch,
    });
    await expect(connector.syncOutcomes({ sink: { getCursor, persistPage } }))
      .rejects.toThrow(/without a continuation cursor/i);
    expect(persistPage).not.toHaveBeenCalled();
  });

  it("requires HTTPS outside localhost and sufficiently strong owner credentials", () => {
    expect(() => createWorkbenchConnector({ baseUrl: "http://workbench.example", ownerId, token })).toThrow(/HTTPS/);
    expect(() => createWorkbenchConnector({ baseUrl: "https://workbench.example", ownerId, token: "short" })).toThrow(/32 characters/);
  });
});
