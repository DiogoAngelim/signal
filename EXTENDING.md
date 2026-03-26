# Extending Signal

Signal is meant to be extended at clear seams.

## Custom Idempotency Store

Implement `SignalIdempotencyStore` when you need durable replay and conflict handling outside the in-memory helper.

The store must preserve:

- reservation before mutation execution
- same key plus same fingerprint replay
- same key plus different fingerprint conflict
- durable completion and failure records

## Custom Dispatcher

Implement `SignalDispatcher` when you want events to leave the process.

Keep the dispatcher responsible for transport work only. Do not move business policy into the dispatcher.

## Replay-Safe Consumers

Use `createReplaySafeSubscriber()` when you want in-memory dedupe for local or embedded use.

Implement `SignalConsumerDeduper` when you need durable per-consumer dedupe.

## Bindings

Bindings should:

- keep the Signal body contract intact
- map transport metadata into `context`, `delivery`, `auth`, and `meta`
- return structured Signal results
- avoid making the protocol transport-specific
