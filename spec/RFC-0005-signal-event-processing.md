# RFC-0005: Signal Event Processing

## 1. Abstract

This RFC defines the expectations for Signal event dispatch and consumption.

## 2. Terminology

- **Publisher**: the component that emits the event.
- **Subscriber**: the component that consumes the event.
- **Replay-safe consumer**: a consumer that can process duplicate deliveries without corrupting state.

## 3. Rules

### 3.1 Publishing

Events SHOULD be emitted from mutations after the mutation has established the new logical state.

### 3.2 Delivery

Subscribers MUST tolerate duplicates. The protocol does not define exactly-once delivery.

### 3.3 Ordering

The protocol does not define a global ordering guarantee. Implementations MAY preserve local order within a single mutation.

## 4. Error Model

Subscriber failures SHOULD be visible as structured errors. Retryable errors MAY be retried by the transport or the consumer.

## 5. Security Considerations

Consumers SHOULD verify event names and payload schemas before applying side effects.

## 6. Observability Considerations

Publishers SHOULD preserve `messageId`, `correlationId`, and `causationId` so consumers can trace event lineage.

## 7. Conformance

A conformant event processing implementation MUST support duplicate-tolerant consumption, explicit message identifiers, and replay-safe expectations.
