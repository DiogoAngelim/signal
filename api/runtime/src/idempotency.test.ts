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

    const reservation = await store.reserve(input);
    expect(reservation.state).toBe("reserved");
    expect((await store.reserve(input)).state).toBe("inflight");
    expect(
      (
        await store.reserve({
          ...input,
          payloadFingerprint: "different-fingerprint",
        })
      ).state,
    ).toBe("conflict");

    await store.complete({ ...input, reservationToken: reservation.record!.reservationToken!, result: { captured: true } });
    const replay = await store.reserve(input);

    expect(replay.state).toBe("replayed");
    expect(replay.record?.result).toEqual({ captured: true });
  });
  it("reclaims expired reservations and fences the previous owner", async () => {
    const store = createMemoryIdempotencyStore();
    const input = {
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-expiring",
      payloadFingerprint: "fingerprint-expiring",
    };
    const first = await store.reserve({ ...input, leaseMs: 1_000 });
    first.record!.reservationExpiresAt = new Date(Date.now() - 1_500).toISOString();
      const second = await store.reserve({ ...input, leaseMs: 5_000 });
    expect(second.state).toBe("reserved");
    expect(second.record?.reservationToken).not.toBe(first.record?.reservationToken);
    await expect(store.complete({
        ...input,
        reservationToken: first.record!.reservationToken!,
        result: { stale: true },
    })).rejects.toThrow("missing, expired, or fenced");
    await expect(store.complete({
        ...input,
        reservationToken: second.record!.reservationToken!,
        result: { current: true },
    })).resolves.toBeUndefined();
    expect((await store.reserve(input)).record?.result).toEqual({ current: true });
  });

  it("renews a reservation only while the caller owns an unexpired token", async () => {
    const store = createMemoryIdempotencyStore();
    const input = {
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-renew",
      payloadFingerprint: "fingerprint-renew",
    };
    const reservation = await store.reserve(input);
    const token = reservation.record!.reservationToken!;
    await expect(store.renewReservation({
      ...input, reservationToken: token, leaseMs: 10_000,
    })).resolves.toBe(true);
    await expect(store.renewReservation({
      ...input, reservationToken: "stale-token", leaseMs: 10_000,
    })).resolves.toBe(false);
  });

});
