import { describe, expect, it } from "vitest";
import {
  InMemoryIdempotencyStore,
  createIdempotencyKey,
  createIdempotencyRecord,
  isDuplicate,
  rememberIdempotency,
} from "../src";

describe("idempotency", () => {
  it("stores and retrieves idempotency records", async () => {
    const store = new InMemoryIdempotencyStore();
    const record = createIdempotencyRecord({
      key: "meta:deposit-1",
      messageId: "message-1",
      traceId: "trace-1",
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    await store.put(record);

    const stored = await store.get(record.key);
    expect(stored).not.toBeNull();
    expect(stored?.messageId).toBe("message-1");
  });

  it("detects duplicate keys", async () => {
    const store = new InMemoryIdempotencyStore();
    const key = "meta:deposit-1";

    expect(await isDuplicate(store, key)).toBe(false);

    await rememberIdempotency(
      store,
      createIdempotencyRecord({
        key,
        messageId: "message-1",
        traceId: "trace-1",
        createdAt: "2024-01-01T00:00:00.000Z",
      }),
    );

    expect(await isDuplicate(store, key)).toBe(true);
    expect(await isDuplicate(store, key)).toBe(true);
  });

  it("derives idempotency keys consistently", () => {
    const metaKey = createIdempotencyKey({
      kind: "mutation",
      messageId: "message-1",
      meta: { idempotencyKey: "deposit-1" },
    });

    expect(metaKey).toBe("meta:deposit-1");

    const eventKey = createIdempotencyKey({
      kind: "event",
      messageId: "message-2",
    });

    expect(eventKey).toBe("message:message-2");

    const queryKey = createIdempotencyKey({
      kind: "query",
      messageId: "message-3",
    });

    expect(queryKey).toBeNull();
  });
});
