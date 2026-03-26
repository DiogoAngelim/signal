# Quick Reference

## Core Protocol

- kinds: `query`, `mutation`, `event`
- name shape: `<domain>.<action>.<version>`
- protocol version: `signal.v1`
- success result: `{ ok: true, result, meta? }`
- failure result: `{ ok: false, error }`

## Runtime Construction

```ts
import { createSignalRuntime, defineMutation, defineQuery, defineEvent } from "@signal/sdk-node";
import { createInProcessDispatcher, createMemoryIdempotencyStore } from "@signal/runtime";
```

## Registration

- `runtime.registerQuery(definition)`
- `runtime.registerMutation(definition)`
- `runtime.registerEvent(definition)`
- `runtime.subscribe(name, handler, options?)`
- `runtime.capabilities()`
- `runtime.lock()`

## Request Metadata

- `correlationId`
- `causationId`
- `traceId`
- `trace`
- `idempotencyKey`
- `deadlineAt`
- `delivery`
- `auth`
- `meta`

## Idempotency Modes

- `required`
- `optional`
- `none`

## Success Metadata

- `meta.outcome`
- `meta.context`
- `meta.idempotency`
- `meta.replay`
- `meta.deadline`
- `meta.delivery`

## Common Error Codes

- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `BUSINESS_REJECTION`
- `IDEMPOTENCY_CONFLICT`
- `DEADLINE_EXCEEDED`
- `CANCELLED`
- `UNSUPPORTED_OPERATION`
- `INTERNAL_ERROR`

## HTTP Binding

- `GET /signal/capabilities`
- `POST /signal/query/:name`
- `POST /signal/mutation/:name`

Request body:

```json
{
  "payload": {},
  "idempotencyKey": "optional-for-mutations",
  "context": {
    "correlationId": "optional",
    "deadlineAt": "optional"
  },
  "delivery": {
    "attempt": 1
  }
}
```
