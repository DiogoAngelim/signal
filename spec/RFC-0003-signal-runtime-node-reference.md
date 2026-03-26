# RFC-0003: Signal Runtime Node Reference

## 1. Abstract

This RFC describes the Node.js reference runtime for Signal. The runtime is the reference execution surface for the protocol. It provides registration, validation, in-process execution, event publication, capability generation, and idempotency handling.

## 2. Terminology

- **Registry**: the collection of registered queries, mutations, and events.
- **Dispatcher**: the component that delivers events to subscribers.
- **Runtime**: the execution surface that combines the registry, dispatcher, and storage.
- **Execution context**: the request metadata available to a handler while it runs.
- **Capability provider**: the component that can describe the runtime surface.

## 3. Execution Model

The runtime MUST validate the input payload against the registered input schema before the handler runs. The runtime MUST validate the handler result against the registered result schema before returning it. If a handler or schema fails validation, the runtime MUST return a structured failure result rather than exposing raw internal details to protocol callers.

The runtime MUST construct protocol envelopes for operations and emitted events. The runtime MAY execute queries, mutations, and events in-process as direct function calls, which makes the reference runtime usable in tests and local applications.

## 4. Registration

The runtime MUST allow explicit registration of operations.

- `registerQuery` for read-only operations
- `registerMutation` for state-changing commands
- `registerEvent` for published facts
- `subscribe` for event consumers

Each registration SHOULD include:

- the operation name
- the kind
- the input schema
- the result schema
- the handler
- the idempotency mode for mutations

## 5. Mutation Handling

When a mutation declares `required` or `optional` idempotency, the runtime MUST consult the idempotency store before executing the handler. The runtime MUST reserve the idempotency key before executing the handler, MUST complete the record when execution succeeds, and MUST record the failure when execution fails.

If the same operation name and idempotency key arrive with the same normalized payload, the runtime SHOULD replay the stored logical result. If the same key arrives with a different payload fingerprint, the runtime MUST treat that as a conflict.

## 6. Event Dispatch

The runtime MUST support event publication from mutations and explicit event publication through the runtime API. The runtime SHOULD preserve local emission order within a single execution path. The runtime MUST NOT claim global ordering across the whole system.

Consumers registered through `subscribe` MUST be able to tolerate repeated deliveries. A runtime MAY provide replay-safe wrappers or durable consumer state, but the protocol only requires that duplicate delivery does not corrupt behavior.

## 7. In-Process Binding

The runtime MUST allow direct function calls for queries, mutations, and capability generation. This is the reference path for tests, local embedding, and simple applications. The in-process binding MUST still obey the same protocol rules as any other binding.

## 8. Capabilities

The runtime SHOULD derive a capability document from the registry, the subscribed event names, and the available bindings. The capability document SHOULD reflect the actual runtime surface rather than a hand-written description.

## 9. Error Model

The runtime SHOULD return structured protocol failures for validation problems, missing operations, idempotency conflicts, and unsupported operations. Infrastructure faults MAY surface as internal errors, but protocol failures SHOULD remain machine-readable and stable.

## 10. Versioning

The Node reference runtime targets Signal Protocol v1. Breaking changes to protocol behavior MUST be expressed as new protocol or operation versions. Breaking changes to the runtime API itself SHOULD be handled as package-major changes.

## 11. Security Considerations

The runtime SHOULD keep `auth`, `source`, and trace metadata explicit. It SHOULD avoid ambient mutable request state. The runtime SHOULD not assume that handlers are safe unless the application has validated input and output contracts.

## 12. Observability Considerations

The runtime SHOULD preserve `messageId`, `correlationId`, `causationId`, and `traceId` across nested operations and emitted events. When a mutation emits more than one event, the runtime SHOULD keep the causal chain visible in the emitted envelopes.

## 13. Conformance

A Node.js reference runtime MUST:

1. register versioned operations
2. validate input and result schemas
3. execute queries and mutations in-process
4. enforce mutation idempotency when required
5. publish and dispatch events
6. generate capabilities from the real registry
7. preserve observability metadata

The reference runtime is not the only possible runtime, but any other runtime that claims Signal compatibility MUST preserve the same public semantics.
