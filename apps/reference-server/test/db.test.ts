import { beforeEach, describe, expect, it, vi } from "vitest";

const postgresMock = vi.hoisted(() => ({
  createPostgresIdempotencyStore: vi.fn(() => ({ kind: "postgres" })),
}));

vi.mock("@signal/idempotency-postgres", () => postgresMock);

import { createReferenceIdempotencyStore } from "../src/db";
import { referenceServerSchema } from "../src/db/schema";

beforeEach(() => {
  delete process.env.DATABASE_URL;
  postgresMock.createPostgresIdempotencyStore.mockClear();
});

describe("reference db", () => {
  it("uses the memory store when no database url is configured", async () => {
    const store = createReferenceIdempotencyStore();

    const reservation = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-a",
    });

    expect(reservation.state).toBe("reserved");
    expect(postgresMock.createPostgresIdempotencyStore).not.toHaveBeenCalled();
  });

  it("uses postgres when a database url is configured", () => {
    process.env.DATABASE_URL = "postgres://example";

    const store = createReferenceIdempotencyStore();

    expect(store).toEqual({ kind: "postgres" });
    expect(postgresMock.createPostgresIdempotencyStore).toHaveBeenCalledWith({
      connectionString: "postgres://example",
    });
    expect(referenceServerSchema.note).toContain("reference server");
  });
});
