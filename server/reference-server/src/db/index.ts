import { createPostgresIdempotencyStore } from "@signal/idempotency-postgres";
import type { StoragePort } from "@signal/ports";
import { createMemoryIdempotencyStore } from "@signal/sdk-node";

export function createReferenceIdempotencyStore(): StoragePort {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return createMemoryIdempotencyStore();
  }

  return createPostgresIdempotencyStore({ connectionString });
}
