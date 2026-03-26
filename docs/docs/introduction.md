---
title: Signal Protocol v1
---

# Signal Protocol v1

Signal is a transport-independent application protocol and reference runtime for versioned queries, mutations, and events.

Signal defines:

- standard envelopes
- explicit versioned operation names
- structured results and errors
- idempotent mutation semantics
- replay-safe event assumptions
- capability discovery
- thin binding rules

Signal does not define a business domain. Downstream systems own their own workflows, processors, ledgers, adapters, and domain policies.
