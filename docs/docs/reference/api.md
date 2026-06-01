---
title: API Reference
---

# API Reference

Most users start with these packages.

## `@signal/sdk-node`

```ts
createSignalRuntime(options);
defineQuery(definition);
defineMutation(definition);
defineEvent(definition);
```

Use this package to create a runtime and define operations.

## `@signal/runtime`

```ts
new SignalRuntime(options);
createMemoryIdempotencyStore();
createInProcessDispatcher();
createReplaySafeSubscriber(handler, options);
```

Use this package when you need runtime behavior directly.

## `@signal/binding-http`

```ts
createSignalHttpServer(runtime, options);
registerSignalHttpRoutes(app, runtime, options);
```

Use this package when you want HTTP routes.

## `@signal/protocol`

```ts
createSignalEnvelope(input);
ok(result, meta);
fail(error);
createProtocolError(code, message);
```

Use this package when you need protocol objects, schemas, or errors.

## `@signal/idempotency-postgres`

```ts
createPostgresIdempotencyStore(options);
```

Use this package when idempotency records should survive process restarts.

## What You Learned

Most apps need `@signal/sdk-node`, `@signal/runtime`, and optionally
`@signal/binding-http`.

## Next Recommended Page

[Protocol Reference](protocol.md)

Estimated reading time: 5 minutes.
