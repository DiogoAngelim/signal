# RFC-0003: Signal Runtime Node Reference

## 1. Abstract

This RFC describes the Node.js reference runtime for Signal. The runtime provides operation registration, in-process execution, event dispatch, and capability generation.

## 2. Terminology

- **Registry**: the collection of registered operations.
- **Dispatcher**: the component that delivers events to subscribers.
- **Runtime**: the execution surface that ties the registry, dispatcher, and storage together.

## 3. Execution Model

The runtime MUST validate input against the registered schema before executing a handler. The runtime MUST validate results before returning them to the caller.

## 4. Mutation Handling

The runtime MUST check idempotency before executing a mutation when the mutation requires or supports idempotency. Completed results SHOULD be replayed from durable storage when available.

## 5. Event Dispatch

The runtime MUST preserve local emission order within a single mutation execution. The runtime MUST NOT claim global event ordering.

## 6. In-Process Binding

The runtime MUST allow direct function calls for queries and mutations. This binding is the reference path for tests and local embedding.

## 7. Capabilities

The runtime SHOULD generate a capability document from the registry and the subscribed event names.

## 8. Security Considerations

The runtime SHOULD keep auth, source, and trace metadata explicit. It SHOULD avoid ambient mutable request state.

## 9. Observability Considerations

The runtime SHOULD preserve `messageId`, `correlationId`, and `causationId` across nested emits.

## 10. Conformance

A Node reference runtime MUST provide the registration and execution surface defined in this RFC and the protocol core RFC.
