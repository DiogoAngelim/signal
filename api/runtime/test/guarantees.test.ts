import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineEvent, defineMutation, defineQuery } from "../../sdk-node/src";
import {
  SignalRuntime,
  createInMemoryConsumerDeduper,
  createMemoryIdempotencyStore,
  createReplaySafeSubscriber,
} from "../src";

describe("runtime guarantees", () => {
  it("freezes request-scoped context and surfaces replay metadata", async () => {
    const runtime = new SignalRuntime({
      idempotencyStore: createMemoryIdempotencyStore(),
    });

    runtime.registerMutation(
      defineMutation({
        name: "post.publish.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({
          postId: z.string(),
        }),
        resultSchema: z.object({
          postId: z.string(),
          status: z.literal("published"),
        }),
        handler: (input, context) => {
          expect(Object.isFrozen(context.request)).toBe(true);
          return {
            postId: input.postId,
            status: "published" as const,
          };
        },
      })
    );

    const first = await runtime.mutation(
      "post.publish.v1",
      { postId: "post_1001" },
      { idempotencyKey: "publish-post_1001-001" }
    );
    const replay = await runtime.mutation(
      "post.publish.v1",
      { postId: "post_1001" },
      { idempotencyKey: "publish-post_1001-001" }
    );

    expect(first.ok).toBe(true);
    expect(first.ok && first.meta.outcome).toBe("completed");
    expect(replay.ok).toBe(true);
    expect(replay.ok && replay.meta.outcome).toBe("replayed");
    expect(replay.ok && replay.meta.replay?.reason).toBe("idempotency");
  });

  it("classifies deadline and cancellation failures", async () => {
    const runtime = new SignalRuntime();

    runtime.registerQuery(
      defineQuery({
        name: "note.get.v1",
        kind: "query",
        inputSchema: z.object({ noteId: z.string() }),
        resultSchema: z.object({ noteId: z.string() }),
        handler: (input) => input,
      })
    );

    const expired = await runtime.query(
      "note.get.v1",
      { noteId: "note_1001" },
      {
        deadlineAt: "2020-01-01T00:00:00.000Z",
      }
    );
    const abortController = new AbortController();
    abortController.abort("caller-requested");
    const cancelled = await runtime.query(
      "note.get.v1",
      { noteId: "note_1001" },
      {
        abortSignal: abortController.signal,
      }
    );

    expect(expired.ok).toBe(false);
    expect(expired.ok === false && expired.error.code).toBe("DEADLINE_EXCEEDED");
    expect(cancelled.ok).toBe(false);
    expect(cancelled.ok === false && cancelled.error.code).toBe("CANCELLED");
  });

  it("supports per-consumer dedupe helpers", async () => {
    const runtime = new SignalRuntime();
    const seen: string[] = [];
    const deduper = createInMemoryConsumerDeduper();

    runtime.registerEvent(
      defineEvent({
        name: "post.published.v1",
        kind: "event",
        inputSchema: z.object({
          postId: z.string(),
        }),
        resultSchema: z.object({
          postId: z.string(),
        }),
        handler: (payload) => payload,
      })
    );

    runtime.subscribe(
      "post.published.v1",
      createReplaySafeSubscriber(async (event) => {
        seen.push(event.messageId);
      }, {
        consumerId: "projection-a",
        deduper,
      })
    );

    const event = await runtime.publish("post.published.v1", {
      postId: "post_1001",
    });

    await runtime.dispatcher.dispatch(event);
    await runtime.dispatcher.dispatch(event);

    expect(seen).toEqual([event.messageId]);
  });
});
