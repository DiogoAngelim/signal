## Signal Design Document

### Executive Summary

Signal is a production-grade backend framework that brings Meteor's excellent developer experience to modern serverless architectures. It enforces statelessness, determinism, and explicit operation naming while remaining completely database-agnostic.

### Design Principles

#### 1. Explicitness Over Convenience
- No magic subscriptions or implicit queries
- Named operations only: `posts.public`, `posts.create`
- All context is explicit in function parameters
- No hidden global state

#### 2. Statelessness for Serverless
- No server affinity required
- No long-lived connections assumed
- Database adapters are completely stateless
- Events use at-least-once semantics (acceptable for idempotent handlers)

#### 3. Database Agnosticism
- SignalDB interface allows any adapter
- No ORM-specific models leaked
- No SQL queries exposed
- Adapters implement simple CRUD + count

#### 4. Determinism & Safety
- Same input → same output, always
- No side effects during queries
- Errors are deterministic with stable codes
- Frozen configuration after startup

#### 5. Production-Ready by Design
- Immutable configuration
- Explicit lifecycle phases
- Comprehensive error handling
- Built-in validation
- No stack traces in production responses

### Architecture Layers

#### HTTP Layer
- **handler.ts**: Serverless-compatible request handler
- **router.ts**: Routes to query/mutation endpoints
- **validation.ts**: Lightweight input validation

The handler is framework-agnostic and works with Express, Hono, Fastify, or raw Node.js.

#### Core Framework
- **Signal.ts**: Main class, orchestrates everything
- **Registry.ts**: Tracks collections, queries, mutations
- **Collection.ts**: Fluent API for registration
- **Lifecycle.ts**: Phase management (CONFIGURING → REGISTERING → RUNNING)
- **Context.ts**: Immutable request context builder
- **Config.ts**: Configuration container (frozen)

#### Data Layer
- **SignalDB.ts**: Abstract interface + helpers
- **MemoryAdapter.ts**: In-memory for dev/test (simple)
- **SqlAdapterBase.ts**: Template for SQL implementations

#### Transport Layer
- **EventBus.ts**: Pub/sub with pattern matching
- **InMemoryTransport.ts**: Uses EventBus for local events
- Custom transports can implement SignalTransport

#### Security
- **AuthProvider.ts**: Extracts and manages authentication
- **AccessControl.ts**: Evaluates declarative access rules

#### Utilities
- **deepFreeze.ts**: Recursive object freezing
- **stableHash.ts**: Deterministic hashing for IDs
- **invariant.ts**: Runtime assertions
- **logger.ts**: Structured logging

### Lifecycle & State Management

#### Phases

1. **CONFIGURING** (initial)
   - Create Signal instance
   - Call `configure()`
   - Registry transitions to REGISTERING

2. **REGISTERING**
   - Register collections
   - Define queries and mutations
   - Set access control rules
   - Call `start()` to transition to RUNNING

3. **RUNNING** (operational)
   - Accept queries and mutations
   - Execute handlers
   - Emit events
   - Registry is immutable

4. **FAILED** (error state)
   - Unrecoverable error occurred
   - Framework must be recreated

#### Immutability Strategy

```typescript
// Configuration is frozen after creation
const config = new Config(input);
deepFreeze(config); // Prevents mutation

// Registry is frozen before RUNNING
deepFreeze(registry); // No new collections/queries/mutations

// Context is frozen per-request
const ctx = contextBuilder.build();
deepFreeze(ctx); // Prevents side effects
```

### Registry Design

The Registry tracks all registered operations with enforcement:

```typescript
class Registry {
  collections: Map<string, CollectionDef>
  queries: Map<string, QueryDef>        // Key: "collection.name"
  mutations: Map<string, MutationDef>   // Key: "collection.name"
}
```

#### Key Format
`collection.operation` (e.g., `posts.public`, `posts.create`)

#### Guarantees
- Unique collection names
- Unique operation names within collection
- No query/mutation override
- Introspection support
- Type-safe lookups

### Access Control Architecture

Declarative, enforced before handler execution:

```typescript
collection.access({
  query: {
    public: "public",                    // String rule
    mine: (ctx) => ctx.auth.user != null // Function rule
  },
  mutation: {
    create: "auth",
    delete: (ctx) => ctx.auth.user?.roles?.includes("admin")
  }
})
```

#### Built-in Rules
- `"public"` → Always allowed
- `"auth"` → User must be authenticated
- `"admin"` → User must have admin role

#### Custom Rules
Functions that return `boolean | Promise<boolean>` for dynamic decisions.

#### Enforcement
AccessControl evaluated before handler, throws if denied.

### Context Design

Per-request, immutable, never shared across requests:

```typescript
interface SignalContext {
  db: SignalDB;                    // Database adapter
  auth: SignalAuth;                // Authentication info
  emit: (name, payload) => Promise<void>;
  request?: HTTPRequest;           // Original request
  env?: Record<string, any>;       // Environment
}
```

#### Construction
Built with ContextBuilder, frozen after `build()`.

#### Safety
- Immutable prevents side effects
- Per-request prevents data leaks
- Serializable where possible

### Event Architecture

Events model state changes from mutations:

```typescript
interface SignalEvent {
  id: string;              // Unique event ID
  name: string;            // "collection.action"
  payload: any;            // Event data
  timestamp: number;       // Emission time
}
```

#### Emission
Only from mutations via `ctx.emit(name, payload)`.

#### Delivery Semantics
- At-least-once (may be received multiple times)
- Unordered (no ordering guarantee)
- Stateless (idempotent handlers recommended)

#### Subscriptions
Support wildcard patterns:
- `"posts.created"` - Exact
- `"posts.*"` - All posts events
- `"*"` - All events

### Database Abstraction

#### SignalDB Interface
Simple CRUD + count operations:

```typescript
interface SignalDB {
  // Queries
  find(collection, query)
  findOne(collection, query)
  findById(collection, id)
  count(collection, query)
  
  // Writes (mutations only)
  insert(collection, doc)
  update(collection, id, update)
  delete(collection, id)
  
  // Management
  isConnected()
  disconnect()
}
```

#### Adapter Implementation
Minimal contract, maximum flexibility.

**MemoryAdapter**: Simple Map-based store for dev/test.

**SqlAdapterBase**: Abstract base for SQL databases.
- Provides WHERE clause building
- Connection pooling hooks
- Safe parameterized queries

### HTTP Interface Design

#### Endpoints

**POST /signal/query**
```json
{ "key": "posts.public", "params": {...} }
```

**POST /signal/mutation**
```json
{ "key": "posts.create", "params": {...} }
```

**GET /signal/introspect**
Returns schema information.

#### Response Format
```json
{
  "ok": true,
  "data": ...
}
```
or
```json
{
  "ok": false,
  "error": { "code": "AUTH_REQUIRED", "message": "..." }
}
```

#### Handler Compatibility
Works with any HTTP framework via createHandler wrapper.

### Error Handling Strategy

#### Error Types

**SignalError** (base)
- All framework errors extend this
- Have deterministic `code` and `statusCode`
- Safe for production serialization

**Specific Types**
- SignalAuthError (401)
- SignalForbiddenError (403)
- SignalValidationError (400)
- SignalNotFoundError (404)
- SignalConflictError (409)
- SignalInternalError (500)

#### Production Safety
- No stack traces in responses
- Deterministic error codes
- Safe JSON serialization

### Validation Strategy

Lightweight, no external dependencies:

```typescript
// Shape validation only
validateInput(value) → { valid, errors }

// Reject unknown fields
// Type checking is minimal (JavaScript limitation)
// Schema validation delegated to application
```

### Type Safety

Full TypeScript with strict mode:

```typescript
interface QueryDef<Params = any, Result = any> {
  name: string
  handler: QueryHandler<Params, Result>
}
```

Generic parameters allow type-safe handlers:

```typescript
query<{ limit: number }, Post[]>("list", async (params, ctx) => {
  // params.limit is typed as number
  // return value must be Post[]
})
```

### Deployment Considerations

#### Statelessness
- No session affinity
- No shared memory between instances
- Horizontal scaling without coordination

#### Cold Starts
- Minimal initialization
- Fast startup (no DB migrations)

#### Database Compatibility
- Adapter per database
- Multiple databases possible (different adapters)

#### Event Processing
- At-least-once delivery
- Idempotent handlers recommended
- Transaction-free (by design)

### Security Model

#### Authentication
- No built-in user system
- Integrates with existing auth (JWT, etc.)
- Extracted from headers via AuthProvider

#### Authorization
- Declarative access rules
- Function-based for dynamic decisions
- Evaluated before handler execution

#### Data Validation
- Input shape validation
- Reserved field filtering (underscore prefix)
- No automatic sanitization

### Testing Strategy

#### Unit Testing
Test individual handlers in isolation with mocked context.

#### Integration Testing
Use MemoryAdapter + InMemoryTransport for full-stack tests.

#### Production Scenarios
See test/production.test.ts for comprehensive example.

### Performance Characteristics

#### Query Execution
- No indexing (delegated to database)
- Linear search in memory adapter
- Database-specific in SQL adapters

#### Memory Usage
- One context per request (frozen)
- Events buffered in memory (configurable limit)
- No long-lived connections

#### Concurrency
- Stateless handlers allow parallel execution
- No locking required (single writer per collection possible)
- Database constraints enforce consistency

### Extensibility Points

#### Custom Database Adapters
Extend `SignalDB` interface.

#### Custom Transport
Implement `SignalTransport` interface.

#### Custom Logger
Implement `SignalLogger` interface.

#### Custom Auth
Use `AuthProvider.fromHeaders()` result or custom extraction.

#### Custom Error Handling
Wrap Signal methods with error mapping.

### Non-Features (Explicitly NOT Implemented)

- ❌ React hooks / client SDK
- ❌ WebSocket connections
- ❌ Long-lived observers
- ❌ Change streams
- ❌ DB-level triggers
- ❌ Schema migration tools
- ❌ Implicit subscriptions
- ❌ CLI tooling
- ❌ Plugin system
- ❌ Hot reload

These intentional omissions keep Signal focused and predictable.

### Future Extensibility

The framework is designed for future extensions without rewrites:

- Additional database adapters
- Additional transport implementations
- Middleware system (request/response hooks)
- Batch operations
- Transactions (if database supports)
- Real-time subscriptions (new transport)
- Schema validation middleware
