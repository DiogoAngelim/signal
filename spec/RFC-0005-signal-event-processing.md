# RFC-0005: Signal Event Processing

## 1. Abstract

This RFC defines the expectations for Signal event dispatch and consumption. Events are immutable facts, so the system must treat them as history that can be replayed, duplicated, or delivered out of order across transports.

## 2. Terminology

- **Publisher**: the component that emits the event.
- **Subscriber**: the component that consumes the event.
- **Replay-safe consumer**: a consumer that can process duplicate deliveries without corrupting state.
- **Duplicate delivery**: the same logical event arriving more than once.
- **Local order**: the order observed within one execution path or one publisher.

## 3. Envelope and Processing Model

Event processing MUST use the standard Signal envelope. The event payload is the immutable fact; the envelope carries the metadata needed to trace, route, and deduplicate it.

Publishers SHOULD attach correlation and causation metadata when the event was created as part of a larger flow. Subscribers SHOULD treat the envelope as the source of observability and lineage data.

## 4. Semantics

### 4.1 Publishing

Events SHOULD be emitted after the mutation that created them has established the new logical state. The event name SHOULD describe the fact that happened, not the command that caused it. A publisher MUST NOT describe an uncommitted or speculative state change as a final event.

### 4.2 Consumption

Subscribers MUST tolerate duplicates. Consumers MUST validate the event name and payload schema before applying side effects. A consumer SHOULD store enough state to recognize repeated message identifiers when duplicate protection is required.

### 4.3 Ordering

The protocol does not define a global ordering guarantee. Implementations MAY preserve local order within a single mutation or publication path, but they MUST NOT rely on that as a protocol-wide invariant.

### 4.4 Replay

Events MAY be replayed for projections, audits, or recovery. Replay-safe consumers MUST be able to process an event more than once without creating incorrect state. A consumer that cannot tolerate replay is not Signal-compatible for public event consumption.

### 4.5 Duplicate Delivery

Duplicate delivery is expected in real transports. The protocol MUST assume that brokers, queues, and subscribers can re-deliver messages. Consumers SHOULD make side effects idempotent where possible.

## 5. Error Model

Subscriber failures SHOULD be surfaced as structured errors. Retryable errors MAY be retried by the transport or by the consumer logic. Non-retryable failures SHOULD be recorded explicitly so the operator can distinguish a bad payload from a transient transport problem.

## 6. Versioning

Event names MUST be versioned. A breaking change to event payload shape or meaning MUST use a new event version, such as `post.published.v2`. Consumers SHOULD subscribe to the version they understand instead of assuming that new fields make a breaking change safe.

## 7. Security Considerations

Consumers SHOULD verify event names and payload schemas before applying side effects. Publishers SHOULD avoid placing secrets in event payloads unless the business case requires it and the storage policy is explicit. Event consumers SHOULD treat external transports as untrusted until the envelope and payload have been validated.

## 8. Observability Considerations

Publishers SHOULD preserve `messageId`, `correlationId`, `causationId`, and `traceId` so consumers can trace event lineage. Consumers SHOULD log the event name, message identifier, and replay outcome when they perform side effects or skip a duplicate.

## 9. Conformance

A conformant event processing implementation MUST:

1. publish events as immutable facts
2. validate event envelopes and payloads
3. tolerate duplicate delivery
4. avoid claiming global order
5. preserve observability metadata
6. support replay-safe consumption

Any runtime that exposes public event subscriptions MUST document how it handles duplicate delivery and replay.
