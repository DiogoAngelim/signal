# Signal production SLO and alerting contract

This document defines how operators turn lifecycle metrics, outbox statistics,
and benchmark evidence into a deployment-specific operating contract. It does
not invent universal latency or availability targets. Set targets only after
measuring the deployment workload and dependency topology.

## Required service-level indicators

| SLI | Measurement | Segmentation |
|---|---|---|
| Execution availability | Successful terminal executions / all terminal executions, excluding explicitly classified caller validation and authorization rejections | operation kind, live vs replay |
| Execution latency | p50/p95/p99 of signal.execution.duration_ms | operation kind, live vs replay, success vs failure |
| Execution error rate | signal.errors / started executions | bounded error source and operation kind |
| Event delivery latency | Delivered timestamp minus outbox creation timestamp | consumer class, not message ID |
| Queue age | OutboxStats.oldestPendingAgeMs | queue |
| Queue backlog | pending + processing records from getStats() | queue |
| Dead-letter rate | dead-lettered / attempted deliveries | consumer class |
| Subscriber reliability | delivered / (delivered + failed) | allowlisted event family only |
| Replay coverage | executions with complete replay evidence / executions requiring replay | operation version |
| Audit checkpoint freshness | now minus latest independently anchored checkpoint timestamp | environment |
| Telemetry health | exporter failures, dropped events, queue depth | exporter identity |

Execution availability measures infrastructure contract fulfillment, not
whether an application made a good real-world decision.

## Metric and label contract

The built-in metrics adapter uses bounded dimensions:
- operation_kind: query, mutation, event, or other;
- execution_mode: live, replay, or unspecified;
- outcome: bounded completed, replayed, failed, delivered, or subscriber-failed;
- source: runtime, command-dispatch, or subscriber.

Do not add operation names, request IDs, correlation IDs, tenant IDs, raw error
codes, payload values, user identifiers, or arbitrary event names as metric
labels. Put high-cardinality diagnostic identifiers in access-controlled logs
or traces with redaction and retention controls.

The buffered exporter is bounded and non-blocking, but process-local and
best-effort. It counts dropped events and export failures; it is not a durable
queue. If telemetry must survive process loss, provide a durable collector or
agent outside the process and monitor the collector independently.

## Prometheus scrape integration

Signal exports a bounded Prometheus text recorder through
`createPrometheusMetricsRecorder` from `@signal/runtime`. Compose it with
`createSignalMetricsObservabilityPort` and expose `recorder.render()` from an
authenticated or network-restricted `/metrics` endpoint using
`text/plain; version=0.0.4; charset=utf-8`. Configure Prometheus to scrape
each replica and remote-write or retain samples in the operator-managed
monitoring backend.

The recorder uses a fixed metric-name and label-value allowlist, defaults to
1,000 retained label series, counts dropped new series, and exports duration
histograms in seconds. It deliberately rejects arbitrary metric names and
unbounded labels. The recorder itself is process-local and is not a durable
telemetry store; Prometheus scraping and backend retention provide the
persistence boundary. Monitor scrape failures and target availability
independently from Signal.

Example wiring:

    import {
      createPrometheusMetricsRecorder,
      createSignalMetricsObservabilityPort,
    } from "@signal/runtime";

    const metrics = createPrometheusMetricsRecorder({ maxSeries: 1000 });
    const observability = createSignalMetricsObservabilityPort(metrics);
    // Supply observability to the Signal runtime.
    // Expose metrics.render() at a restricted /metrics endpoint.

## Define targets from measured baselines

For each SLI, store:
1. baseline window and workload;
2. target and error budget;
3. exclusions and classification rules;
4. measurement source and dashboard link;
5. service owner and escalation contact;
6. review cadence and target-change rationale.

Set separate targets for live execution and replay where their cost profiles
differ. Do not average a healthy query path with a degraded mutation or
subscriber path. Report p50, p95, and p99; averages conceal tail latency.

An SLO without an owner, time window, and alert action is not an operational
SLO. Use multi-window burn-rate alerts for availability and latency budgets.

## Alert policy

Configure alerts for:
- sustained execution error-rate or latency-budget burn;
- growing oldest-pending queue age or backlog without recovery;
- any dead-lettered event;
- stale audit checkpoint or failed signature/chain verification;
- telemetry export failures or dropped-event growth;
- repeated retry-budget exhaustion;
- coordination-store failure or circuit-breaker lease anomalies;
- database pool saturation, lock waits, and transaction timeouts.

Page only when the runbook defines an immediate customer or integrity risk.
Route lower-severity capacity trends to the service owner. Alert on dead letters
even when overall delivery rate remains high.

## Incident runbook minimum

Every deployment must publish an owner-specific runbook containing:
- service owner, on-call escalation, and incident commander;
- dashboards and log/trace access;
- safe degradation and traffic-shedding behavior;
- outbox backlog inspection, consumer dedupe verification, and controlled
  dead-letter redrive;
- retry-budget exhaustion diagnosis and dependency health checks;
- audit-chain and signature verification, trusted checkpoint lookup, and
  checkpoint freshness response;
- backup restore and recovery-point procedure;
- rollback criteria, rollback steps, and post-incident evidence preservation.

Do not redrive a dead letter until consumer idempotency and downstream side
effects have been checked. Do not disable audit protections or retry budgets
without a recorded risk acceptance.

## Deployment validation

Before declaring operational readiness:
- connect a durable exporter and prove process termination does not lose data
  beyond the explicitly accepted telemetry loss window;
- test telemetry backend outage and verify decision execution remains
  available while export failures/drops remain observable;
- validate alert routing with a test incident;
- measure alert detection and acknowledgement latency;
- run a restore drill and record RTO/RPO;
- test queue backlog recovery and dead-letter redrive;
- verify a signed checkpoint against an independently stored trust anchor;
- record measurements against the deployed commit and infrastructure.

CI simulations and local benchmarks are regression evidence, not production
SLO evidence.
