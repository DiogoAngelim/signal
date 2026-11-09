import { describe, expect, it } from "vitest";
import { createMemoryIdempotencyStore } from "./idempotency";

describe("createMemoryIdempotencyStore", () => {
  it("keeps operation and idempotency-key boundaries unambiguous", async () => {
    const store = createMemoryIdempotencyStore();

    const first = await store.reserve({
      operationName: "alpha:beta",
      idempotencyKey: "gamma",
      payloadFingerprint: "fingerprint-1",
    });
    const second = await store.reserve({
      operationName: "alpha",
      idempotencyKey: "beta:gamma",
      payloadFingerprint: "fingerprint-2",
    });

    expect(first.state).toBe("reserved");
    expect(second.state).toBe("reserved");
  });

  it("distinguishes an in-flight retry, a conflicting payload, and a completed replay", async () => {
    const store = createMemoryIdempotencyStore();
    const input = {
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-1",
    };

    expect((await store.reserve(input)).state).toBe("reserved");
    expect((await store.reserve(input)).state).toBe("inflight");
    expect(
      (
        await store.reserve({
          ...input,
          payloadFingerprint: "different-fingerprint",
        })
      ).state,
    ).toBe("conflict");

    await store.complete({ ...input, result: { captured: true } });
    const replay = await store.reserve(input);

    expect(replay.state).toBe("replayed");
    expect(replay.record?.result).toEqual({ captured: true });
  });
});
