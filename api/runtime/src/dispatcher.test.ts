import { describe, expect, it, vi } from "vitest";
import { createSignalEnvelope } from "@signal/protocol";
import {
  createInMemoryConsumerDeduper,
  createReplaySafeSubscriber,
} from "./dispatcher";

function envelope(messageId = "message-1") {
  return createSignalEnvelope({
    kind: "event",
    name: "orders.order.created.v1",
    messageId,
    payload: { orderId: "order-1" },
  });
}

describe("createReplaySafeSubscriber", () => {
  it("does not mark a failed handler as consumed and allows redelivery", async () => {
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(undefined);
    const subscriber = createReplaySafeSubscriber(handler, {
      deduper: createInMemoryConsumerDeduper(),
    });

    await expect(subscriber(envelope())).rejects.toThrow("temporary failure");
    await expect(subscriber(envelope())).resolves.toBeUndefined();
    await expect(subscriber(envelope())).resolves.toBeUndefined();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight handler execution for concurrent redeliveries", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = vi.fn(async () => gate);
    const subscriber = createReplaySafeSubscriber(handler);

    const first = subscriber(envelope());
    const second = subscriber(envelope());
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    release();
    await Promise.all([first, second]);
    await subscriber(envelope());

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("deduplicates successfully completed messages by consumer identity", async () => {
    const handler = vi.fn();
    const deduper = createInMemoryConsumerDeduper();
    const subscriber = createReplaySafeSubscriber(handler, {
      consumerId: "billing",
      deduper,
    });

    await subscriber(envelope("same-id"));
    await subscriber(envelope("same-id"));
    await createReplaySafeSubscriber(handler, {
      consumerId: "shipping",
      deduper,
    })(envelope("same-id"));

    expect(handler).toHaveBeenCalledTimes(2);
  });
});
