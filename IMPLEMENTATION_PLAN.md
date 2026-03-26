# Implementation Plan

## Current Gaps

- Root docs and examples still describe an older framework shape and overuse payment-centric examples.
- The protocol package is missing explicit outcome/failure categories, richer context and delivery metadata, and stronger capability metadata.
- The runtime does not yet freeze request-scoped context, expose deadline and cancellation metadata clearly, or standardize replay metadata in results.
- Event replay safety exists, but the extension points for consumer dedupe and delivery metadata are still thin.
- The HTTP binding is functional but under-specified around request validation, status mapping, and metadata propagation.
- Conformance guidance exists, but reusable fixtures and implementation-independent tests are still minimal.

## Planned Work

1. Harden the protocol contract.
   - Expand envelope, context, delivery, result, and error definitions.
   - Clarify capability and conformance metadata.
   - Add an RFC for execution context and logical outcomes.

2. Harden the runtime.
   - Make request context immutable.
   - Add deadline and cancellation helpers.
   - Standardize idempotency replay, conflict, and failure metadata.
   - Add generic replay-safe consumer and dedupe extension points.

3. Harden the HTTP binding.
   - Validate request bodies explicitly.
   - Preserve protocol metadata without making the protocol HTTP-specific.
   - Map protocol failures consistently.

4. Refresh examples and the reference server.
   - Replace payment-led examples with generic protocol examples.
   - Add examples for in-process execution, replay, conflict, event emission, capability inspection, storage-backed idempotency, and transport skeletons.

5. Align docs, schemas, and tests.
   - Rewrite root docs around the protocol/runtime model.
   - Update Docusaurus docs and JSON schemas to match the code.
   - Add conformance fixtures and tests for the strengthened guarantees.

## Guardrails

- Keep Signal protocol-first and transport-independent.
- Keep registration explicit and avoid magic.
- Do not add business-domain modules, retry engines, or broker-specific behavior to the core.
