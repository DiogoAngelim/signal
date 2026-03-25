# Architecture

Signal is built as a small set of layers that do one job each.

## High-Level View

```text
HTTP handler
  -> router
  -> validation
  -> Signal core
      -> access control
      -> database adapter
      -> transport / events
      -> mutation ledger / audit hooks
```

## Layers

### HTTP

- `handler.ts` receives requests
- `router.ts` decides whether the call is a query or mutation
- `validation.ts` checks input before execution

### Core

- `Signal.ts` owns the lifecycle and public API
- `Registry.ts` stores collections and named operations
- `Collection.ts` provides the fluent registration API
- `Lifecycle.ts` controls the framework phase
- `Context.ts` builds request-scoped context objects
- `Config.ts` freezes and stores configuration

### Database

- `SignalDB.ts` defines the database contract
- `MemoryAdapter.ts` is the built-in development adapter
- `SqlAdapterBase.ts` is a base class for SQL databases
- write operations can opt into explicit version checks

### Transport

- `EventBus.ts` stores and dispatches events
- `InMemoryTransport.ts` is the built-in transport for local use
- consumers can dedupe work when they provide a stable consumer id

### Security

- `AuthProvider.ts` creates auth objects from headers or input
- `AccessControl.ts` evaluates access rules

### Utilities

- `deepFreeze.ts` enforces immutability
- `stableHash.ts` creates deterministic hashes and IDs
- `invariant.ts` provides runtime assertions
- `logger.ts` provides structured logging

## Request Flow

1. A request reaches the HTTP handler.
2. The request is parsed and validated.
3. The router resolves the operation key.
4. Access control runs before the handler.
5. The handler receives an immutable context.
6. Mutations can write to the database, record outbox entries, and emit events.
7. The response is serialized and returned.
8. Audit hooks and mutation records stay append-only.

## Lifecycle

Signal has a small, explicit lifecycle:

1. `configure()` sets up adapters and shared services.
2. `collection()` registers operations while the app is still being built.
3. `start()` locks the registry and moves the app into the running phase.
4. After startup, runtime registration is rejected.

## Data Model

### Named Operations

Operations are addressed as `collection.operation`, such as `posts.list` or `posts.create`.

### Context

Each request gets its own immutable context with database access, auth data, event emission, and optional request metadata such as idempotency keys and expected versions.

### Events

Events are emitted only from mutations and use stable names like `posts.created`.
The core keeps replay-safe execution, while transports can add inbox/outbox semantics and per-consumer dedupe.

## Guarantees

- Configuration is immutable
- The registry is locked after startup
- Access checks happen before handlers
- Errors have stable codes and safe responses
- Queries are read-only
- Mutations are the only write path
- The framework is stateless across requests
- Idempotent mutations can replay stored results
- Stale writes fail with explicit version mismatch errors
- Audit hooks append to a durable trail instead of rewriting history

## Deployment Fit

Signal works well in places where requests may arrive on any instance and state should live in the database, not in memory.

Good fits:

- serverless functions
- edge runtimes
- containers
- traditional Node.js servers
