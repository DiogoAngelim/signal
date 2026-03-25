# Quick Reference

Use this page when you already know what you need and just want the API names.

## Basic Setup

```ts
import { Signal, MemoryAdapter, InMemoryTransport } from "./index";

const signal = new Signal();

signal.configure({
  db: new MemoryAdapter(),
  transport: new InMemoryTransport(),
});
```

## Collections

```ts
signal
  .collection("posts")
  .access({
    query: { list: "public" },
    mutation: { create: "auth" },
  })
  .query("list", handler)
  .mutation("create", handler);
```

## Core APIs

- `signal.configure(config)` configures the framework
- `signal.collection(name)` starts a collection builder
- `signal.start()` locks registration and starts the app
- `signal.query(key, params, ctx)` runs a named query
- `signal.mutation(key, params, ctx)` runs a named mutation

## Context

The context is request-scoped and immutable.

Common fields:

- `ctx.db`
- `ctx.auth`
- `ctx.emit`
- `ctx.request`
- `ctx.env`

## Access Control

```ts
.access({
  query: {
    list: "public",
    mine: "auth",
  },
  mutation: {
    create: "auth",
    delete: "admin",
  },
});
```

Rules:

- `"public"` means anyone can run it
- `"auth"` means the user must be logged in
- `"admin"` means the user must have the admin role
- custom rules can be a function that returns `boolean` or `Promise<boolean>`

## Database Methods

```ts
ctx.db.find(collection, query)
ctx.db.findOne(collection, query)
ctx.db.findById(collection, id)
ctx.db.count(collection, query)
ctx.db.insert(collection, doc)
ctx.db.update(collection, id, update)
ctx.db.delete(collection, id)
```

## Events

```ts
await ctx.emit("posts.created", { id, title });
```

Pattern matching examples:

- `posts.created`
- `posts.*`
- `*`

## HTTP

```ts
import { createHandler } from "./index";

app.post("/signal/query", createHandler(signal));
app.post("/signal/mutation", createHandler(signal));
```

## Authentication

```ts
import { AuthProvider } from "./index";

const auth = AuthProvider.fromHeaders(req.headers);
```

## Errors

```ts
import { SignalValidationError, SignalAuthError } from "./index";

throw new SignalValidationError("Invalid input");
```

All framework errors are safe to serialize and include a stable `code`, `message`, and `statusCode`.

