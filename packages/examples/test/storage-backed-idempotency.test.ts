import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPostgresIdempotencyStore: vi.fn(() => {
    const records = new Map<
      string,
      {
        payloadFingerprint: string;
        status: "pending" | "completed" | "failed";
        result?: unknown;
        messageId?: string;
        createdAt: string;
        updatedAt: string;
      }
    >();

    return {
      async reserve(input: {
        operationName: string;
        idempotencyKey: string;
        payloadFingerprint: string;
      }) {
        const key = `${input.operationName}:${input.idempotencyKey}`;
        const existing = records.get(key);
        if (existing) {
          const record = {
            operationName: input.operationName,
            idempotencyKey: input.idempotencyKey,
            ...existing,
          };
          if (existing.payloadFingerprint !== input.payloadFingerprint) {
            return { state: "conflict" as const, record };
          }
          if (existing.status === "pending") {
            return { state: "inflight" as const, record };
          }
          return { state: "replayed" as const, record };
        }

        const now = new Date().toISOString();
        records.set(key, {
          payloadFingerprint: input.payloadFingerprint,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        });
        return { state: "reserved" as const };
      },
      async complete(input: {
        operationName: string;
        idempotencyKey: string;
        payloadFingerprint: string;
        result: unknown;
        messageId?: string;
      }) {
        const key = `${input.operationName}:${input.idempotencyKey}`;
        const now = new Date().toISOString();
        records.set(key, {
          payloadFingerprint: input.payloadFingerprint,
          status: "completed",
          result: input.result,
          messageId: input.messageId,
          createdAt: records.get(key)?.createdAt ?? now,
          updatedAt: now,
        });
      },
      async fail() {
        return;
      },
    };
  }),
}));

vi.mock("@signal/idempotency-postgres", () => ({
  createPostgresIdempotencyStore: mocks.createPostgresIdempotencyStore,
}));

import {
  createStorageBackedPostPublicationRuntime,
  runStorageBackedIdempotencyDemo,
} from "../storage-backed-idempotency";

describe("storage-backed idempotency example", () => {
  it("requires a database URL and wires the postgres-backed runtime", async () => {
    expect(() => createStorageBackedPostPublicationRuntime("")).toThrow(
      "DATABASE_URL is required",
    );

    const created =
      createStorageBackedPostPublicationRuntime("postgres://example");
    const result = await created.runtime.query("post.get.v1", {
      postId: "post_1001",
    });
    const demo = await runStorageBackedIdempotencyDemo("postgres://example");

    expect(result.ok).toBe(true);
    expect(demo.first.ok).toBe(true);
    expect(demo.replay.ok).toBe(true);
    expect(demo.replay.ok && demo.replay.meta.outcome).toBe("replayed");
    expect(mocks.createPostgresIdempotencyStore).toHaveBeenCalledWith({
      connectionString: "postgres://example",
    });
  });
});
