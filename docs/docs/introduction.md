---
title: Signal Protocol v1
---

# Signal Protocol v1

Signal is a transport-independent application protocol and Node.js reference
runtime for versioned queries, mutations, events, and decision workflows.

Signal defines the shape of application work:

- standard envelopes
- explicit versioned operation names
- structured results and errors
- idempotent mutation semantics
- replay-safe event assumptions
- capability discovery
- thin binding rules

Signal does not define a business domain. Downstream systems own their own
workflows, processors, ledgers, adapters, and domain policies.

## Why It Exists

Most application integrations mix transport details, business logic, retry
behavior, idempotency, and audit records. Signal separates those concerns.

The public contract is the envelope. The runtime executes registered operations.
Bindings map transports such as HTTP onto the same operation contract.

## When To Use It

Use Signal when you need:

- a stable message contract across transports
- explicit query, mutation, event, or decision operations
- idempotent mutation behavior
- replay-safe event consumers
- runtime-derived capabilities
- auditable results and outcomes

## When Not To Use It

Do not use Signal as:

- a workflow engine
- a payment processor
- a retry scheduler
- an ORM
- a broker-specific framework
- a replacement for domain policy

## Start Here

Read the [architecture](./architecture) first if you are new to the system. Then
run the [quickstart](./guides/quickstart) and inspect the reference runtime
capabilities.
