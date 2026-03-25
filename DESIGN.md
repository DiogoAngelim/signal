# Design

This document explains the choices behind Signal.

## Design Principles

### 1. Explicit over implicit

- Operations are named
- Context is passed in directly
- There are no hidden subscriptions
- Behavior is easy to trace

### 2. Stateless over sticky

- No long-lived server state is required
- Requests can land on any instance
- Adapters do the real storage work
- The framework stays easy to scale

### 3. Database-agnostic

- Signal defines a small database contract
- Adapters can target PostgreSQL, MySQL, or something else
- The framework does not expose SQL to app code

### 4. Deterministic and safe

- Same input should produce the same result
- Idempotency keys can replay stored mutation results
- Queries stay read-only
- Writes can enforce expected versions explicitly
- Errors are stable and serializable
- Configuration is frozen after setup

### 5. Production-friendly

- Lifecycle phases prevent misuse
- Access control runs before handlers
- Validation rejects bad input early
- Events follow explicit rules
- Event execution is replay-safe and out-of-order tolerant

## Architectural Choices

### Core first

The core package owns the public framework behavior. Everything else plugs into it.

### Separate transport

Events are separated from database writes so transport can change without changing app logic.
This is also where inbox/outbox style delivery and per-consumer dedupe can live.

### Separate security

Authentication and access control are isolated so they can evolve independently.

### Separate HTTP

HTTP handling is its own layer so the same framework logic can work in different runtimes.

## Lifecycle Trade-Offs

Signal uses a three-step lifecycle:

1. configure
2. register
3. start

This makes startup stricter, but it prevents runtime mutation and keeps the framework predictable.

## Access Control Model

Access rules are declarative because that makes them easier to read, test, and apply consistently.

```ts
.access({
  query: {
    list: "public",
    mine: (ctx) => ctx.auth.user != null,
  },
  mutation: {
    create: "auth",
    delete: "admin",
  },
});
```

Rules can be strings for common cases or functions for custom logic.

## Error Model

Errors are designed to be useful without leaking internal details.

- Stable error codes
- HTTP-friendly status codes
- Safe serialized responses
- No stack traces in normal API output

## Event Model

Signal uses stateless event emission from mutations.

Why:

- it keeps writes explicit
- it avoids hidden side effects
- it fits serverless retry behavior
- it encourages idempotent handlers
- it makes replay-safe execution possible

## Reliability Model

Signal keeps reliability features explicit instead of hiding them behind framework magic.

- idempotent mutations use an idempotency key plus payload fingerprint
- repeated requests can replay stored results instead of re-running the handler
- optimistic concurrency surfaces version mismatch errors early
- transports can dedupe events per consumer
- audit hooks append to history instead of mutating it

## Extensibility

The framework stays small by making these parts replaceable:

- database adapters
- event transports
- authentication providers
- access rules
- loggers
- HTTP integration

## Non-Goals

Signal is not trying to be:

- a full-stack UI framework
- an ORM
- a change-stream system
- a reactive subscription platform

## Mental Model

Think of Signal as:

- a registry for named operations
- a guardrail around request handling
- a stable contract between HTTP, auth, database, and events
