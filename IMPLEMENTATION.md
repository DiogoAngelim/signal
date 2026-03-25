# Implementation

This document summarizes what is already in the repo.

## Built Components

### Core

- `Signal` for orchestration and lifecycle
- `Registry` for named operation tracking
- `Collection` for fluent registration
- `Lifecycle` for phase control
- `Context` for request-scoped data
- `Config` for immutable configuration
- `Types` for shared interfaces
- `Errors` for framework error types

### Database

- `SignalDB` as the database contract
- `MemoryAdapter` for development and tests
- `SqlAdapterBase` for SQL-backed adapters

### Transport

- `SignalTransport` as the transport contract
- `EventBus` for local event delivery
- `InMemoryTransport` for testing and local runs

### HTTP

- `handler` for request handling
- `router` for operation dispatch
- `validation` for input checks

### Security

- `AuthProvider` for auth extraction
- `AccessControl` for rule evaluation

### Utilities

- `deepFreeze` for immutability
- `stableHash` for deterministic hashes and IDs
- `invariant` for assertions
- `logger` for structured logging

## Enforced Guarantees

- configuration is frozen
- the registry is locked after startup
- context is immutable per request
- access control runs before handlers
- validation rejects malformed input
- events are emitted from mutations
- errors are safe to serialize

## Example Scenario

The repo includes a production-style example test that shows:

- configuration
- collection registration
- public and authenticated queries
- authenticated mutations
- access denial
- event emission
- registry immutability
- HTTP-style request flow

## What Is Not Included

- client UI
- browser state management
- WebSocket subscriptions
- ORM-style entity models
- hidden server-side observers

## How To Verify

```bash
npm install
npm run build
npm run test
```

