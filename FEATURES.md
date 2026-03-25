# Features

This page lists what Signal gives you out of the box.

## Core Framework

- `Signal` orchestration class
- collection registration with fluent chaining
- named queries and named mutations
- explicit lifecycle management
- immutable configuration
- registry locking after startup

## Data Operations

- read-only queries
- write-only mutations
- request-scoped context
- context-based execution with no globals

## Database

- database abstraction through `SignalDB`
- in-memory adapter for development and tests
- SQL base adapter for custom implementations
- CRUD-style methods for common operations

## Events

- mutation-driven event emission
- stable event names like `posts.created`
- pattern matching for subscribers
- in-memory transport for local use
- custom transport support

## Security

- auth extraction from headers or custom input
- declarative access control
- built-in `public`, `auth`, and `admin` rules
- custom sync or async rules
- access checks before handlers run

## HTTP

- serverless-friendly handler
- framework-agnostic routing
- query endpoint
- mutation endpoint
- introspection endpoint
- request validation

## Validation

- input shape validation
- unknown field rejection
- key validation for operations
- lightweight implementation

## Safety

- deep-freeze immutability
- deterministic hashing and ID generation
- runtime assertions
- safe error serialization

## Type Safety

- TypeScript strict mode support
- typed handlers and context
- typed registry lookups
- typed error handling

## Extensibility

- custom database adapters
- custom transports
- custom authentication providers
- custom access rules
- custom loggers
- middleware-style wrappers

## Testing And Development

- test-friendly in-memory implementations
- production scenario test coverage
- registry introspection
- no-dependency setup

## Deployment

- works in serverless environments
- works in edge runtimes
- works on traditional Node.js servers
- no server affinity required

