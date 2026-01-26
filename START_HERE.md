# 🚀 Signal Framework - Start Here

Welcome to Signal, a production-grade backend framework for serverless environments!

## 📚 Where to Start

### 1️⃣ First Time? (5 minutes)
Read **[EXAMPLE.ts](./EXAMPLE.ts)** - A simple, runnable example showing Signal in action.

### 2️⃣ Understand the Basics (15 minutes)
Read **[README.md](./README.md)** - Complete user guide with features, API, and examples.

### 3️⃣ See It in Action (10 minutes)
Run the production test:
```bash
npm install
npm run test
```

### 4️⃣ Understand the Design (20 minutes)
Read **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System design and component overview.

### 5️⃣ Deep Dive (30 minutes)
Read **[DESIGN.md](./DESIGN.md)** - Detailed design decisions and how everything fits together.

### 6️⃣ Build Your First Collection
Look at `test/production.test.ts` and adapt for your use case.

### 7️⃣ Extend Signal (Optional)
Read **[EXTENDING.md](./EXTENDING.md)** - Examples of custom adapters, middleware, and more.

---

## 📁 Project Structure

```
signal/
├── README.md              ← Start here (user guide)
├── EXAMPLE.ts             ← Quick example
├── ARCHITECTURE.md        ← System design
├── DESIGN.md              ← Design decisions
├── EXTENDING.md           ← Extension guide
├── FEATURES.md            ← Complete feature list
├── IMPLEMENTATION.md      ← What's been built
├── DELIVERY.md            ← Project completion summary
├── START_HERE.md          ← This file
├── index.ts               ← Main exports
├── package.json           ← NPM config
├── tsconfig.json          ← TypeScript config
│
├── packages/
│   ├── core/              ← Framework core (Signal, Registry, etc.)
│   ├── db/                ← Database layer (adapters)
│   ├── transport/         ← Event transport (EventBus, etc.)
│   ├── http/              ← HTTP interface (handler, router)
│   ├── security/          ← Auth & access control
│   └── utils/             ← Utilities (freeze, hash, logging)
│
└── test/
    └── production.test.ts ← Full production scenario
```

---

## 🎯 What Is Signal?

Signal is a **Meteor-like backend framework** redesigned for serverless environments.

**Key Features:**
- 🎯 Named queries and mutations only
- 🔒 Declarative access control
- 📡 Event-driven architecture
- 💾 Database-agnostic
- 🚀 Serverless-ready
- 📝 Type-safe (TypeScript strict mode)
- ❄️ Immutable configuration
- 🧪 Production-tested

**Works with:**
- Vercel, Fly.io, AWS Lambda, Cloudflare Workers
- Express, Fastify, Hono, raw Node.js

---

## ⚡ 30-Second Example

```typescript
import { Signal, MemoryAdapter } from "./index";

// Create and configure
const signal = new Signal();
signal.configure({ db: new MemoryAdapter() });

// Define collection with query and mutation
signal
  .collection("posts")
  .access({ query: { list: "public" }, mutation: { create: "auth" } })
  .query("list", async (params, ctx) => {
    return await ctx.db.find("posts", {});
  })
  .mutation("create", async (params, ctx) => {
    const id = await ctx.db.insert("posts", params);
    return { id };
  });

// Start
await signal.start();

// Use it
const posts = await signal.query("posts.list", {}, context);
const result = await signal.mutation("posts.create", { title: "..." }, context);
```

---

## 📖 Documentation Map

| Document | Length | Purpose |
|----------|--------|---------|
| **README.md** | 30 min | Complete user guide, API reference |
| **EXAMPLE.ts** | 5 min | Working code example |
| **ARCHITECTURE.md** | 15 min | System design and components |
| **DESIGN.md** | 25 min | Design decisions and patterns |
| **EXTENDING.md** | 20 min | How to extend Signal |
| **FEATURES.md** | 10 min | Complete feature inventory |
| **IMPLEMENTATION.md** | 10 min | What's been built |
| **DELIVERY.md** | 5 min | Project completion summary |

---

## 🚀 Quick Start Commands

```bash
# Install dependencies
npm install

# Run production test scenario
npm run test

# Build TypeScript
npm run build

# Type checking
npm run type-check

# Watch mode (requires ts-node-dev)
npm run test:watch

# Clean build artifacts
npm run clean
```

---

## 🔑 Core Concepts

### Collections
Group related queries and mutations:
```typescript
signal.collection("posts")
  .query("list", handler)
  .mutation("create", handler)
```

### Queries
Read-only operations:
```typescript
.query("list", async (params, ctx) => {
  return await ctx.db.find("posts", {});
})
```

### Mutations
Write operations (exclusive write path):
```typescript
.mutation("create", async (params, ctx) => {
  const id = await ctx.db.insert("posts", params);
  await ctx.emit("posts.created", { id });
  return { id };
})
```

### Access Control
Declarative rules enforced before execution:
```typescript
.access({
  query: { list: "public" },
  mutation: { create: "auth", delete: "admin" }
})
```

### Events
Emitted only from mutations:
```typescript
await ctx.emit("posts.created", { id, title });
```

### Context
Immutable, request-scoped:
```typescript
ctx.db       // Database adapter
ctx.auth     // Current user
ctx.emit     // Event emission
ctx.request  // Original request
ctx.env      // Environment variables
```

---

## 🎯 Common Tasks

### Make a Collection Public
```typescript
.access({ query: { list: "public" } })
```

### Require Authentication
```typescript
.access({ mutation: { create: "auth" } })
```

### Admin Only
```typescript
.access({ mutation: { delete: "admin" } })
```

### Custom Access Rule
```typescript
.access({
  mutation: {
    delete: (ctx) => ctx.auth.user?.roles?.includes("admin")
  }
})
```

### Use Custom Database
```typescript
signal.configure({ db: new PostgresAdapter(...) })
```

### Subscribe to Events
```typescript
await transport.getEventBus().subscribe("posts.*", async (event) => {
  console.log(event.name, event.payload);
});
```

### Deploy to Vercel
```typescript
export default createHandler(signal);
```

---

## 🧪 Testing

Signal includes a complete production test scenario in `test/production.test.ts`:

```bash
npm run test
```

This demonstrates:
- Framework boot and configuration
- Collection registration
- Public and authenticated queries
- Mutations with access control
- Event emission and consumption
- Error handling
- Registry immutability

---

## 🔒 Security

Signal handles:
- **Authentication** - Extract from headers, manage user context
- **Authorization** - Declarative access rules enforced before execution
- **Validation** - Input shape validation, unknown field rejection
- **Error Safety** - No stack traces in production, deterministic codes
- **Immutability** - Prevents accidental runtime changes

---

## 💾 Databases

**Built-in:**
- MemoryAdapter (development/testing)
- SqlAdapterBase (template for PostgreSQL, MySQL, etc.)

**Easy to add:**
- MongoDB adapter
- DynamoDB adapter
- Custom database adapter

Just implement the `SignalDB` interface.

---

## 📡 Events

Events model state changes from mutations:

```typescript
// Emit from mutation
await ctx.emit("posts.created", { id, title });

// Subscribe to events
await transport.subscribe("posts.*", async (event) => {
  console.log(`${event.name}: ${JSON.stringify(event.payload)}`);
});
```

Patterns supported:
- `"posts.created"` - Exact match
- `"posts.*"` - All posts events
- `"*"` - All events

---

## 🚀 Deployment

Works with any HTTP framework:

```typescript
import { createHandler } from "./index";

// Express
app.post("/signal/query", createHandler(signal));
app.post("/signal/mutation", createHandler(signal));

// Fastify
fastify.post("/signal/query", createHandler(signal));
fastify.post("/signal/mutation", createHandler(signal));

// Vercel
export default createHandler(signal);
```

---

## 📚 Learning Resources

### For Beginners
1. EXAMPLE.ts
2. README.md
3. Run `npm run test`

### For Understanding Design
1. ARCHITECTURE.md
2. DESIGN.md
3. Review packages/core/Signal.ts

### For Extending
1. EXTENDING.md
2. Review packages/db/adapters/MemoryAdapter.ts
3. Implement your own adapter

### For Production
1. Review error handling in packages/core/Errors.ts
2. Set up custom logger
3. Configure access control rules
4. Deploy to Vercel or your platform

---

## ❓ FAQ

**Q: Is Signal production-ready?**  
A: Yes. It's fully tested, thoroughly documented, and includes complete error handling.

**Q: Does Signal require dependencies?**  
A: No. Only TypeScript. Everything else is pure JavaScript.

**Q: Can I use my own database?**  
A: Yes. Implement the `SignalDB` interface. See EXTENDING.md for examples.

**Q: Can I add custom auth?**  
A: Yes. Use `AuthProvider` or create custom authentication extraction.

**Q: How do I deploy?**  
A: Use `createHandler()` with your HTTP framework or deploy directly to Vercel.

**Q: Can I use with Express/Fastify/etc?**  
A: Yes. Signal is framework-agnostic.

**Q: Is it type-safe?**  
A: Yes. Full TypeScript with strict mode enabled.

**Q: Can I extend Signal?**  
A: Yes. See EXTENDING.md for custom adapters, middleware, and utilities.

---

## 🎯 Next Steps

1. **Run the test:** `npm run test`
2. **Read the README:** [README.md](./README.md)
3. **Review an example:** [EXAMPLE.ts](./EXAMPLE.ts)
4. **Understand the design:** [ARCHITECTURE.md](./ARCHITECTURE.md)
5. **Build your first collection**
6. **Deploy to Vercel/Fly/Lambda**

---

## 💬 Key Files to Review

| File | Purpose |
|------|---------|
| `index.ts` | All public exports |
| `packages/core/Signal.ts` | Main Signal class |
| `packages/core/Registry.ts` | Operation tracking |
| `packages/db/adapters/MemoryAdapter.ts` | Example adapter |
| `packages/http/handler.ts` | HTTP integration |
| `test/production.test.ts` | Full example |

---

## ✨ What Makes Signal Special

- **Explicit** - No magic, all operations named
- **Deterministic** - Same input always produces same output
- **Immutable** - Configuration locked, context frozen
- **Type-safe** - Full TypeScript, strict mode
- **Serverless-ready** - Stateless, no affinity
- **Database-agnostic** - Swap databases anytime
- **Production-grade** - Error handling, validation, logging
- **Extensible** - Easy to add adapters and middleware

---

## 🎓 Learning Time Estimate

- **Understand basics:** 15 minutes
- **Run example:** 5 minutes
- **Review design:** 20 minutes
- **Build simple backend:** 30 minutes
- **Deploy:** 10 minutes

**Total: ~80 minutes to production**

---

## 📞 Questions?

Read the appropriate guide:
- **How do I use Signal?** → README.md
- **How does it work?** → ARCHITECTURE.md
- **Why this design?** → DESIGN.md
- **How do I extend it?** → EXTENDING.md
- **What features does it have?** → FEATURES.md

---

## 🚀 You're Ready!

Signal is complete, documented, and ready for use.

**Start with [README.md](./README.md) and [EXAMPLE.ts](./EXAMPLE.ts).**

Enjoy building with Signal! 🎉
