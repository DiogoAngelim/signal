---
title: Define Your First Mutation
---

# Define Your First Mutation

```ts
import { z } from "zod";
import { createSignalRuntime, defineMutation } from "@signal/sdk-node";

const runtime = createSignalRuntime();

runtime.registerMutation(
  defineMutation({
    name: "post.publish.v1",
    kind: "mutation",
    idempotency: "required",
    emits: ["post.published.v1"],
    inputSchema: z.object({
      postId: z.string().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
    }),
    resultSchema: z.object({
      postId: z.string().min(1),
      status: z.literal("published"),
    }),
    handler: async (input, context) => {
      await context.emit("post.published.v1", {
        postId: input.postId,
        title: input.title,
        publishedAt: new Date().toISOString(),
      });

      return {
        postId: input.postId,
        status: "published",
      };
    },
  })
);
```
