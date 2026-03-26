---
title: Define Your First Query
---

# Define Your First Query

This guide shows the smallest complete query: define the schema, register the handler, and call it through the runtime.

## What this guide covers

You will:

1. define the input schema
2. define the result schema
3. register the query
4. execute it in-process
5. see how validation and errors behave

## Example

```ts
import { z } from "zod";
import { createSignalRuntime, defineQuery } from "@signal/sdk-node";

const userProfileInputSchema = z.object({
  userId: z.string().min(1),
});

const userProfileResultSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  plan: z.enum(["free", "pro"]),
  status: z.enum(["draft", "onboarded"]),
});

const runtime = createSignalRuntime();

runtime.registerQuery(
  defineQuery({
    name: "user.profile.v1",
    kind: "query",
    inputSchema: userProfileInputSchema,
    resultSchema: userProfileResultSchema,
    handler: async (input) => {
      const user = await repository.getUser(input.userId);

      if (!user) {
        throw createProtocolError("NOT_FOUND", `Unknown user ${input.userId}`);
      }

      return user;
    },
  })
);

const result = await runtime.query("user.profile.v1", { userId: "user_3001" });
```

## What the schema should guarantee

- the input must be a valid object
- required fields must exist
- formats must be explicit, for example `email` or `string().min(1)`
- the result must also pass validation before it leaves the runtime

## Rules

- queries MUST be read-only
- queries MUST use versioned names
- queries MUST validate input and output
- queries MUST NOT emit domain events
- queries MAY use transient local cache, as long as the external behavior remains read-only

## How to think about the handler

The handler receives already validated input. It does not need to validate the raw request shape because the runtime already did that. The handler may read a database or assemble a projection, but it must not write durable domain state.

## What to avoid

- writing to a database inside the query
- using a query to hide side effects
- returning objects that do not satisfy the result schema
- omitting the version suffix from the name

## Expected result

If the query exists, the runtime returns `{ ok: true, result: ... }`. If the input is invalid, it returns a structured `VALIDATION_ERROR`. If the operation does not exist, the implementation can return `UNSUPPORTED_OPERATION` or `NOT_FOUND`, depending on the layer that received the call.
