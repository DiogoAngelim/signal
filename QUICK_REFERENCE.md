# Signal - Quick Reference

## Setup & Usage
```typescript
import { Signal, MemoryAdapter } from "./index";

const signal = new Signal();
signal.configure({ db: new MemoryAdapter() });

signal.collection("posts")
  .access({ query: { list: "public" }, mutation: { create: "auth" } })
  .query("list", async (params, ctx) => await ctx.db.find("posts", {}))
  .mutation("create", async (params, ctx) => {
    const id = await ctx.db.insert("posts", params);
    await ctx.emit("posts.created", { id });
    return { id };
  });

await signal.start();
```

## Documentation Map
- **START_HERE.md** - Navigation guide
- **README.md** - Full user guide
- **ARCHITECTURE.md** - System design
- **DESIGN.md** - Design rationale
- **EXTENDING.md** - Extension patterns
- **FEATURES.md** - Feature inventory
- **EXAMPLE.ts** - Quick example
- **QUICK_REFERENCE.md** - This file

## Core APIs
- `signal.configure(config)` - Configure with db & transport
- `signal.collection(name)` - Create collection builder
- `signal.start()` - Start framework
- `signal.query(key, params, ctx)` - Execute query
- `signal.mutation(key, params, ctx)` - Execute mutation

## Access Control
```typescript
.access({
  query: { list: "public", mine: "auth" },
  mutation: { create: "auth", delete: "admin" }
})
```

Built-in rules: `"public"`, `"auth"`, `"admin"`
Custom: `(ctx) => boolean | Promise<boolean>`

## HTTP Interface
```typescript
import { createHandler } from "./index";
app.post("/signal/query", createHandler(signal));
app.post("/signal/mutation", createHandler(signal));
```

Request: `POST /signal/query` with `{ key, params }`
Response: `{ ok: true, data: ... }` or `{ ok: false, error: {...} }`

## Database
```typescript
ctx.db.find(collection, query)
ctx.db.findOne(collection, query)
ctx.db.insert(collection, doc)
ctx.db.update(collection, id, update)
ctx.db.delete(collection, id)
```

## Events
```typescript
await ctx.emit("posts.created", { id, title });
transport.getEventBus().subscribe("posts.*", (event) => {
  // Matches: posts.created, posts.updated, etc.
});
```

## Authentication
```typescript
import { AuthProvider } from "./index";
const auth = AuthProvider.fromHeaders(req.headers);
if (AuthProvider.isAuthenticated(auth)) { ... }
```

## Common Tasks
| Task | How |
|------|-----|
| Deploy to Vercel | `export default createHandler(signal)` |
| Use with Express | `app.post("/signal/query", createHandler(signal))` |
| Custom database | Extend `SignalDB` interface |
| Production logging | Implement `SignalLogger` |
| Custom events | Implement `SignalTransport` |

## Error Handling
```typescript
import { SignalValidationError, SignalAuthError } from "./index";
throw new SignalValidationError("message", { field: ["error"] });
```

All errors have: `code`, `message`, `statusCode`, safe serialization

---
**Run `npm run test` to see full example. See START_HERE.md for complete guide.**
