# Extending Signal

Signal is intentionally small so it is easy to extend.

## Custom Database Adapter

Implement the `SignalDB` interface and plug the adapter into `signal.configure()`.

```ts
import { SignalDB } from "./index";

class PostgresAdapter implements SignalDB {
  async find(collection, query) {
    return [];
  }

  async findOne(collection, query) {
    return null;
  }

  async findById(collection, id) {
    return null;
  }

  async count(collection, query) {
    return 0;
  }

  async insert(collection, doc) {
    return "id";
  }

  async update(collection, id, update) {}

  async delete(collection, id) {}
}
```

Keep the adapter focused on persistence, not framework policy.

## Custom Transport

Use a custom transport when you want events to leave the process.

```ts
import { TransportInterface, SignalEvent, EventSubscriber } from "./index";

class RedisTransport implements TransportInterface {
  async emit(event: SignalEvent): Promise<void> {
    // Publish to Redis or another broker
  }

  async subscribe(pattern: string, handler: EventSubscriber): Promise<() => void> {
    return () => {};
  }
}
```

## Custom Logger

```ts
import { Logger } from "./index";

class JsonLogger implements Logger {
  info(message: string, data?: unknown) {
    console.log(JSON.stringify({ level: "info", message, data }));
  }

  debug(message: string, data?: unknown) {
    console.log(JSON.stringify({ level: "debug", message, data }));
  }

  warn(message: string, data?: unknown) {
    console.warn(JSON.stringify({ level: "warn", message, data }));
  }

  error(message: string, data?: unknown) {
    console.error(JSON.stringify({ level: "error", message, data }));
  }
}
```

## Custom Access Rules

Access rules can be strings or functions.

```ts
import { Signal } from "./index";

const signal = new Signal();

signal.collection("posts").access({
  query: {
    mine: (ctx) => ctx.auth.user != null,
  },
  mutation: {
    update: async (ctx) => {
      return ctx.auth.user?.roles?.includes("editor") ?? false;
    },
  },
});
```

## Middleware Pattern

Signal does not ship with a middleware system, but it is easy to wrap the public API.

```ts
import { Signal } from "./index";

class SignalWithHooks {
  constructor(private signal: Signal) {}

  async query(key, params, ctx) {
    console.log("before query", key);
    const result = await this.signal.query(key, params, ctx);
    console.log("after query", key);
    return result;
  }
}
```

## Error Mapping

If your app needs a different error shape, map Signal errors at the edge.

```ts
import { SignalAuthError, SignalValidationError } from "./index";

try {
  await signal.query("posts.list", {}, ctx);
} catch (error) {
  if (error instanceof SignalAuthError) {
    // map to your API format
  }
  if (error instanceof SignalValidationError) {
    // map to your API format
  }
}
```

## Practical Advice

- Keep extensions small
- Prefer adapters over forks
- Put app-specific policy outside the framework
- Reuse the built-in abstractions when possible
