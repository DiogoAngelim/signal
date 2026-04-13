# Signal Backend

## Summary

Signal is a modular, TypeScript-based toolkit for modeling, validating, and executing Signal messages across a consistent lifecycle. It provides small, composable packages for input, validation, evaluation, decisioning, execution, logging, local persistence, and synchonization.

## Why This Exists

The backend packages are built to:
- Provide a consistent messaging protocol and lifecycle for sensors and IoT devices.
- Keep validation, processing, and persistence concerns modular and testable.
- Support offline-first workflows with local storage and replay-safe synchronization.
- Enable multiple transport layers (HTTP today, or any other modern transport protocol).

## Modules and API Reference

### @digelim/01.intent

Normalizes high-level intent into a `SignalEnvelope`.

- `Intent`
- `IntentContext`
- `IntentNormalizer`
- `intentCapabilities()`

### @digelim/02.received

Message input and transition to `received` lifecycle.

- `receiveEnvelope()`
- `isReceivedEnvelope()`
- `SignalContextEnvelope`
- `ReceiveEnvelopeOptions`
- `ReceivedResult`
- `ValidationIssue`
- `SignalFrameworkError`
- `createFrameworkError()`, `createFrameworkErrorCause()`

### @digelim/03.validated

Validates against protocol and transition to the `validated` status.

- `validateEnvelope()`
- `validateOperationName()`
- `SignalContextEnvelope`
- `ValidateEnvelopeOptions`
- `ValidationResult`
- `ValidationIssue`
- `SignalFrameworkError`
- `createFrameworkError()`, `createFrameworkErrorCause()`

### @digelim/04.source

Enriches messages with source and meta.

- `SourceNormalizer`
- `SourceContext`
- `sourceCapabilities()`

### @digelim/05.pulse

Evaluation pipeline for scoring and confidence.

- `PulseEngine`
- `PulseInput`, `PulseOutput`, `PulseEvaluationResult`
- `pulseCapabilities()`
- Domain exports: `types`, `schemas`
- Runtime exports: `confidenceEngine`, `explanationEngine`, `frameFactory`, `gateEngine`, `ids`, `normalizer`, `pipeline`, `repositories`, `scoreEngine`, `usecases`

### @digelim/06.core

Policy-based decisioning engine.

- `CoreEngine`
- `CoreDecision`
- `CorePolicyRule`
- `CoreContext`
- `coreCapabilities()`

### @digelim/07.action

Action execution with optional idempotency support.

- `ActionDefinition<TInput>`
- `ActionResult`
- `ActionContext`
- `ActionExecutor`
- `actionCapabilities()`

### @digelim/08.result

Result recording and lookup.

- `ResultStore`
- `InMemoryResultStore`
- `ResultRecorder`
- `ResultRecord`
- `resultCapabilities()`

### @digelim/09.sense

Orchestrates evaluation, decisioning, and action execution.

- `SenseOrchestrator`
- `SenseExecutionResult`
- `senseCapabilities()`

### @digelim/10.app

App-level gateway that connects intent, source, and sense.

- `AppGateway`
- `appCapabilities()`

### @digelim/11.adapter

Fastify HTTP adapter for `SignalRuntime`.

- `createSignalHttpServer(runtime, options)`
- `CreateSignalHttpServerOptions`
- `registerSignalHttpRoutes(app, runtime, options)`
- `handleQueryRequest()`, `handleMutationRequest()`
- `handleCapabilitiesRequest()`
- `SignalHttpBody`
- `adapterCapabilities()`

### @digelim/12.signal

Core protocol, runtime, lifecycle, security, observability, and utilities.

Protocol:
- `SignalEnvelope`, `SignalEnvelopeInput`
- `SignalContext`, `SignalDelivery`, `SignalAuth`
- `createSignalEnvelope()`, `validateSignalEnvelope()`, `isSignalEnvelope()`
- `signalProtocolVersion`, `signalEnvelopeSchema`
- `SignalErrorEnvelope`, `SignalErrorCode`, `createSignalError()`, `createProtocolError()`, `signalErrorHttpStatus()`
- `SignalResult`, `SignalResultMeta`, `ok()`, `fail()`, `signalResultSchema`
- `signalEnvelopeJsonSchema`, `signalErrorJsonSchema`, `signalResultJsonSchema`, `signalCapabilitiesJsonSchema`
- `signalNamePattern`, `signalNameSchema`, `createSignalName()`, `parseSignalName()`, `isSignalName()`, `looksPastTense()`
- `SignalCapabilities`, `SignalOperationCapability`, `CapabilityDocument`
- `createSignalCapabilities()`, `createCapabilityDocument()`, `toCapabilityDocument()`

Runtime:
- `SignalRuntime`
- `SignalRegistry`
- `createInProcessDispatcher()`
- `createReplaySafeSubscriber()`
- `createInMemoryConsumerDeduper()`
- `executeQuery()`
- `executeMutation()`
- `dispatchEvent()`
- `buildCapabilities()`
- `buildCapabilityDocument()`
- `createMemoryIdempotencyStore()`
- `normalizeRequestContext()`, `freezeRequestContext()`
- `createExecutionSuccessMeta()`, `toSignalFailure()`
- `fingerprint()`, `stableStringify()`

Lifecycle:
- `LifecycleTracker`
- `LifecycleStage`, `LifecycleEntry`

Security:
- `SecurityHooks`
- `AuthenticationHook`, `AuthorizationHook`, `MessageSignatureHook`
- `AuthContext`
- `createNoopSecurityHooks()`

Observability:
- `logger`, `createLogger()`
- `StructuredLogger`
- `withTiming()`
- `MetricsRegistry`, `MetricsSnapshot`

Utils:
- `clamp()`, `nowIso()`, `parseIsoDate()`, `isValidDate()`

### @digelim/13.store

Local persistence for lifecycle records.

- `SignalStore`
- `LocalSignalRecord`
- `InMemorySignalStore`
- `createFrameworkError()`, `createFrameworkErrorCause()`

### @digelim/14.idempotency

Idempotency helpers and store.

- `IdempotencyStore`
- `IdempotencyRecord`
- `IdempotencySource`
- `createIdempotencyKey()`
- `createIdempotencyRecord()`
- `isDuplicate()`
- `rememberIdempotency()`
- `InMemoryIdempotencyStore`
- `createFrameworkError()`, `createFrameworkErrorCause()`

### @digelim/15.sync

Offline-first sync for local records.

- `SyncTransport`
- `SyncTransportResult`
- `syncPendingRecords()`
- `SyncResult`
- `createCollectingTransport()`

## Usage Examples

### 1) Receive, then validate

```ts
import { receiveEnvelope } from "@digelim/02.received";
import { validateEnvelope } from "@digelim/03.validated";
import { InMemorySignalStore } from "@digelim/13.store";

const store = new InMemorySignalStore();

const received = await receiveEnvelope(
  { kind: "query", name: "portfolio.evaluate.v1", payload: { accountId: "acc-1" } },
  { store },
);

if (received.ok) {
  const validated = await validateEnvelope(received.value, { store });
  console.log(validated.ok ? validated.value.lifecycle : validated.error);
}
```

### 2) Run a SignalRuntime over HTTP

```ts
import { SignalRuntime } from "@digelim/12.signal";
import { createSignalHttpServer } from "@digelim/11.adapter";
import { z } from "zod";

const runtime = new SignalRuntime();

runtime.registerQuery({
  name: "demo.ping.v1",
  kind: "query",
  inputSchema: z.object({ message: z.string() }),
  resultSchema: z.object({ ok: z.boolean() }),
  handler: async (input) => ({ ok: !!input.message }),
});

const app = createSignalHttpServer(runtime);
await app.listen({ port: 3000 });
```

### 3) Sync stored records

```ts
import { InMemorySignalStore } from "@digelim/13.store";
import { InMemoryIdempotencyStore } from "@digelim/14.idempotency";
import { createCollectingTransport, syncPendingRecords } from "@digelim/15.sync";

const store = new InMemorySignalStore();
const idempotencyStore = new InMemoryIdempotencyStore();
const { transport } = createCollectingTransport();

const result = await syncPendingRecords({
  store,
  transport,
  idempotencyStore,
});

console.log(result);
```

## Credits

Diogo de Aquino Angelim
