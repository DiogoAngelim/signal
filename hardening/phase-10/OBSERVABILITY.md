# Observability — Phase 10

## Overview

Signal's observability stack provides structured logging, distributed tracing, and metrics recording. All telemetry is deterministic and locally verifiable.

## Logs

### Structured Logging

All log entries follow the `SignalLogEntry` schema (defined in `api/runtime/src/observability.ts`):

```typescript
{
  timestamp: string;      // ISO 8601
  level: "debug" | "info" | "warn" | "error";
  message: string;        // Human-readable description
  operationName?: string; // e.g., "payment.capture.v1"
  operationKind?: string; // "mutation" | "query" | "event"
  messageId?: string;     // Unique per execution
  correlationId?: string; // Cross-request correlation
  traceId?: string;       // Distributed trace ID
  durationMs?: number;    // Execution duration
  outcome?: string;       // "completed" | "replayed" | "failed"
  [key: string]: unknown; // Additional context
}
```

### Log Levels

| Level | Usage |
|-------|-------|
| `error` | Unrecoverable failures, handler exceptions |
| `warn` | Recoverable issues, idempotency conflicts, circuit breaker trips |
| `info` | Operation start/end, replay detection, subscriber delivery |
| `debug` | Internal state transitions, fingerprint computation |

### Log Output

- JSON format to stdout/stderr
- `createConsoleLogger(minLevel)` filters by level
- Production default: `info`
- Debug mode: `debug`

## Traces

### Distributed Tracing

Each mutation/query execution creates a `SignalTraceSpan`:

```typescript
{
  traceId: string;        // Unique per request
  spanId: string;         // Unique per operation
  parentSpanId?: string;  // For nested operations
  operationName: string;  // e.g., "payment.capture.v1"
  operationKind: string;  // "mutation" | "query"
  startTime: string;      // ISO 8601
  endTime?: string;       // ISO 8601
  status: "ok" | "error";
  attributes: Record<string, unknown>;
}
```

### Trace Points

1. **HTTP request received** → span starts
2. **Auth validation** → attribute recorded
3. **Idempotency reservation** → attribute recorded
4. **Handler execution** → child span
5. **Event dispatch** → attribute recorded
6. **Response sent** → span ends

## Metrics

### Metric Types

| Metric | Type | Unit | Description |
|--------|------|------|-------------|
| `signal.mutation.completed` | counter | count | Successful mutations |
| `signal.mutation.failed` | counter | count | Failed mutations |
| `signal.mutation.replayed` | counter | count | Replayed mutations |
| `signal.mutation.duration_ms` | timing | ms | Mutation execution time |
| `signal.query.completed` | counter | count | Successful queries |
| `signal.query.duration_ms` | timing | ms | Query execution time |
| `signal.idempotency.conflict` | counter | count | Idempotency conflicts |
| `signal.subscriber.delivered` | counter | count | Event deliveries |
| `signal.subscriber.deduped` | counter | count | Deduplicated deliveries |
| `signal.circuit_breaker.state` | gauge | state | Circuit breaker state (0=closed, 1=open, 2=half-open) |

### Metrics Recorder

`createInMemoryMetricsRecorder()` provides an in-memory implementation for testing and local verification. Production implementations should export to Prometheus/OTLP.

## Integration

The observability primitives are integrated into the runtime:

- `createConsoleLogger()` → injected into runtime for structured logging
- `SignalTraceSpan` → created per execution context
- `createInMemoryMetricsRecorder()` → records counters, gauges, timings
- All telemetry is optional and non-blocking — failures in observability do not affect execution