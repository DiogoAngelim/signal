import { createMemoryIdempotencyStore } from "@signal/runtime";
import { createPostgresIdempotencyStore } from "@signal/idempotency-postgres";

export function createReferenceIdempotencyStore() {
  const connectionString = process.env["DATABASE_URL"];

  if (!connectionString) {
    return createMemoryIdempotencyStore();
  }

  return createPostgresIdempotencyStore({ connectionString });
}
