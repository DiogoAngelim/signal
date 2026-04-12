# Signal Framework Migration Report

## Source locations used
- signal: /Users/diogoangelim/node-ecu/server/signal/packages/protocol, /Users/diogoangelim/node-ecu/server/signal/packages/runtime
- adapter: /Users/diogoangelim/node-ecu/server/signal/packages/binding-http
- pulse: /Users/diogoangelim/node-ecu/server/sense/packages/sense-domain, /Users/diogoangelim/node-ecu/server/sense/packages/sense-runtime
- core: rebuilt with reference to /Users/diogoangelim/node-ecu/server/sense/packages/core-domain
- intent, app, source, sense, action, result: new modules created for migration
- shared/observability: /Users/diogoangelim/node-ecu/server/sense/packages/shared, /Users/diogoangelim/node-ecu/server/sense/packages/observability

## Major refactors performed
- Consolidated protocol/runtime into @digelim/signal with a unified envelope contract and runtime helpers.
- Added lifecycle tracking with enforced transitions and structured logging hooks.
- Introduced module capability documents for all packages.
- Built a new Sense orchestration path that composes intent/source/pulse/core/action/result in order.
- Updated HTTP adapter to the unified contract with traceId propagation and validation errors.

## Boundary corrections
- Pulse logic remains read-only and emits no side effects (only evaluations and events).
- Core decision engine is deterministic and does not reach external APIs.
- Action owns side-effect execution and returns standardized ActionResult shape.
- Adapter owns HTTP transport bindings and does not embed business logic.
- Result owns persistence interfaces and record storage.

## Contract changes introduced
- SignalEnvelope now requires `traceId` and uses `protocol: "signal.v1"` with top-level `meta` for idempotency/replay.
- Error model normalized with categories and retryability, including traceId/messageId fields.
- Canonical lifecycle enforced: received → validated → enriched → evaluated → decided → executed → completed.
- Capability discovery standardized via CapabilityDocument helpers.

## Tests added
- Envelope validation and lifecycle transition enforcement.
- Idempotency replay behavior and replay-safe subscriber behavior.
- Core deterministic decision behavior.
- Action result shape validation.

## Unresolved risks
- Publishing blocked due to missing npm registry credentials (see release report).
- Only in-memory idempotency store is provided by default; production stores should be wired via interfaces.
