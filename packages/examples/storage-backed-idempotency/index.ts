import { createPostgresIdempotencyStore } from "@signal/idempotency-postgres";
import { createSignalRuntime } from "@signal/sdk-node";
import { createPostPublicationState, registerPostPublication } from "../post-publication";

export function createStorageBackedPostPublicationRuntime(
  connectionString = process.env["DATABASE_URL"]
) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the storage-backed idempotency example");
  }

  const runtime = createSignalRuntime({
    idempotencyStore: createPostgresIdempotencyStore({
      connectionString,
    }),
    runtimeName: "signal-storage-backed-example",
  });

  const state = createPostPublicationState();
  registerPostPublication(runtime, state);

  return {
    runtime,
    state,
  };
}

export async function runStorageBackedIdempotencyDemo(
  connectionString = process.env["DATABASE_URL"]
) {
  const { runtime, state } = createStorageBackedPostPublicationRuntime(
    connectionString
  );

  const first = await runtime.mutation(
    "post.publish.v1",
    {
      postId: "post_1001",
      title: "Protocol first",
      body: "Signal keeps transport and execution concerns separate.",
    },
    {
      idempotencyKey: "publish-post_1001-001",
    }
  );

  const replay = await runtime.mutation(
    "post.publish.v1",
    {
      postId: "post_1001",
      title: "Protocol first",
      body: "Signal keeps transport and execution concerns separate.",
    },
    {
      idempotencyKey: "publish-post_1001-001",
    }
  );

  return {
    first,
    replay,
    state,
  };
}

/* c8 ignore start */
if (require.main === module) {
  runStorageBackedIdempotencyDemo().then((output) => {
    console.log(JSON.stringify(output, null, 2));
  });
}
/* c8 ignore end */
