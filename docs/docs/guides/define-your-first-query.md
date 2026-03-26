---
title: Define Your First Query
---

# Define Your First Query

```ts
import { z } from "zod";
import { createSignalRuntime, defineQuery } from "@signal/sdk-node";

const runtime = createSignalRuntime();

runtime.registerQuery(
  defineQuery({
    name: "note.get.v1",
    kind: "query",
    inputSchema: z.object({
      noteId: z.string().min(1),
    }),
    resultSchema: z.object({
      noteId: z.string().min(1),
      body: z.string().min(1),
    }),
    handler: async (input) => ({
      noteId: input.noteId,
      body: "Signal keeps protocol contracts explicit.",
    }),
  })
);
```
