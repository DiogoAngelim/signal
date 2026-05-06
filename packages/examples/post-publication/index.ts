import { createProtocolError } from "@signal/protocol";
import { defineEvent, defineMutation, defineQuery } from "@signal/sdk-node";
import {
  createExampleRuntime,
  ensureExampleSelfTraining,
  instrumentExampleEvent,
  instrumentExampleMutation,
  instrumentExampleQuery,
  instrumentExampleSubscriber,
  type ExampleStateWithSelfTraining,
} from "../support";
import {
  postGetInputSchema,
  postPublishedEventSchema,
  postPublishInputSchema,
  postStateSchema,
  type PostState,
} from "./schemas";

export interface PostPublicationState extends ExampleStateWithSelfTraining {
  posts: Map<string, PostState>;
  deliveredEventIds: string[];
}

export function createPostPublicationState(): PostPublicationState {
  return {
    posts: new Map([
      [
        "post_1001",
        {
          postId: "post_1001",
          title: "Protocol first",
          body: "Signal keeps transport and execution concerns separate.",
          status: "draft",
          publishedAt: null,
          publishAttempts: 0,
        },
      ],
    ]),
    deliveredEventIds: [],
  };
}

export function registerPostPublication(
  runtime = createExampleRuntime(),
  state = createPostPublicationState(),
  options: {
    registerSubscriber?: boolean;
  } = {}
) {
  const selfTraining = ensureExampleSelfTraining(state, "post-publication");

  runtime.registerQuery(
    defineQuery({
      name: "post.get.v1",
      kind: "query",
      description: "Read the current post state.",
      inputSchema: postGetInputSchema,
      resultSchema: postStateSchema,
      handler: instrumentExampleQuery(selfTraining, "post.get.v1", (input) => {
        const post = state.posts.get(input.postId);
        if (!post) {
          throw createProtocolError("NOT_FOUND", `Unknown post ${input.postId}`);
        }

        return post;
      }),
    })
  );

  runtime.registerEvent(
    defineEvent({
      name: "post.published.v1",
      kind: "event",
      description: "Record that a post became publicly visible.",
      inputSchema: postPublishedEventSchema,
      resultSchema: postPublishedEventSchema,
      handler: instrumentExampleEvent(selfTraining, "post.published.v1", (payload) => payload),
    })
  );

  runtime.registerMutation(
    defineMutation({
      name: "post.publish.v1",
      kind: "mutation",
      description: "Publish a post exactly once per logical request.",
      idempotency: "required",
      emits: ["post.published.v1"],
      inputSchema: postPublishInputSchema,
      resultSchema: postStateSchema,
      normalizeIdempotencyInput: (input) => ({
        postId: input.postId,
        title: input.title.trim(),
        body: input.body.trim(),
      }),
      handler: instrumentExampleMutation(selfTraining, "post.publish.v1", async (input, context) => {
        const post = state.posts.get(input.postId);
        if (!post) {
          throw createProtocolError("NOT_FOUND", `Unknown post ${input.postId}`);
        }

        if (post.title !== input.title || post.body !== input.body) {
          throw createProtocolError(
            "BUSINESS_REJECTION",
            "Publish payload does not match the current draft"
          );
        }

        if (post.status === "published") {
          return post;
        }

        post.status = "published";
        post.publishedAt = new Date().toISOString();
        post.publishAttempts += 1;

        await context.emit("post.published.v1", {
          postId: post.postId,
          title: post.title,
          publishedAt: post.publishedAt,
        });

        return post;
      }),
    })
  );

  if (options.registerSubscriber ?? true) {
    runtime.subscribe(
      "post.published.v1",
      instrumentExampleSubscriber(selfTraining, "post.published.v1", async (event) => {
        state.deliveredEventIds.push(event.messageId);
      }),
      {
        consumerId: "post-projection",
        replaySafe: true,
        description: "Example projection that records published event ids once.",
      }
    );
  }

  return { runtime, state };
}

export async function runPostPublicationDemo() {
  const { runtime, state } = registerPostPublication();

  const before = await runtime.query("post.get.v1", {
    postId: "post_1001",
  });

  const first = await runtime.mutation(
    "post.publish.v1",
    {
      postId: "post_1001",
      title: "Protocol first",
      body: "Signal keeps transport and execution concerns separate.",
    },
    {
      idempotencyKey: "publish-post_1001-001",
      correlationId: "corr-post-1001",
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
      correlationId: "corr-post-1001",
    }
  );

  const conflict = await runtime.mutation(
    "post.publish.v1",
    {
      postId: "post_1001",
      title: "Protocol first",
      body: "Changed body",
    },
    {
      idempotencyKey: "publish-post_1001-001",
    }
  );

  return {
    before,
    first,
    replay,
    conflict,
    capabilities: runtime.capabilities(),
    state,
  };
}

/* c8 ignore start */
if (require.main === module) {
  runPostPublicationDemo().then((output) => {
    console.log(JSON.stringify(output, null, 2));
  });
}
/* c8 ignore end */
