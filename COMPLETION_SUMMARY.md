# Completion Summary

## What Changed

- hardened the protocol contract around envelope metadata, logical result metadata, structured error categories, and capability features
- added RFC-0006 for execution context, deadlines, cancellation, and logical outcomes
- strengthened the runtime with immutable request context, deadline and cancellation checks, normalized idempotency input, replay metadata, and pluggable consumer dedupe
- tightened the HTTP binding so it maps protocol failures consistently without redefining the contract
- refreshed the public example surface with generic runnable examples and aligned the reference server to them
- replaced payment-centric top-level docs and docs-site pages with generic protocol/runtime documentation
- added conformance fixtures and additional tests for replay metadata, context immutability, deadline/cancellation handling, and replay-safe consumers

## Guarantees Strengthened

- same key plus same normalized mutation payload yields the same logical result with explicit replay metadata
- same key plus different normalized mutation payload yields explicit `IDEMPOTENCY_CONFLICT`
- request metadata is frozen per execution
- deadline and cancellation failures are explicit protocol failures, not hidden transport behavior
- event consumers can use generic replay-safe and dedupe primitives without assuming global ordering
- capability documents now describe runtime features, emitted events, and replay-safe subscriptions more clearly

## Kept Out Of Scope

- payment processors
- retry schedulers
- workflow engines
- broker-specific core behavior
- domain-specific orchestration modules

## What Downstream Systems Can Build Safely

- workflow and routing layers on top of explicit mutation and event contracts
- durable idempotency and replay handling with alternate stores
- broker-backed transports that preserve the Signal envelope
- projection and inbox/outbox style consumers using the replay-safe hooks
- higher-level orchestration modules that need deadlines, cancellation, delivery attempts, and correlation metadata without changing the Signal protocol
