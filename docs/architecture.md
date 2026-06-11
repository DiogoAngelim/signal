# Signal Architecture

This document describes Signal's architectural patterns, the Signal Kernel,
domain packages, and why these patterns were chosen.

## Architectural Patterns

Signal combines several established patterns to achieve its goals of
domain-agnostic decision processing, replayable execution, and auditable
judgment.

### Hexagonal Architecture (Ports and Adapters)

Signal uses hexagonal architecture to isolate core logic from infrastructure.
The application core (`@signal/protocol`, `@signal/runtime`, domain packages)
has no direct dependency on databases, message brokers, or HTTP frameworks.
All infrastructure access flows through port interfaces defined in
`@signal/ports`.

**Why:** Hexagonal architecture ensures that Signal's decision-processing logic
can be tested without infrastructure, deployed in any environment, and extended
with new adapters without modifying core packages.

### Dependency Inversion

Port interfaces are defined by the core; adapters implement them. The runtime
depends on `EventPort`, `StoragePort`, `DecisionPort`, and
`ObservabilityPort` — not on concrete implementations. Adapters (Postgres
storage, HTTP bindings, CLI tools) depend on the core; the core never depends
on adapters.

**Why:** Dependency inversion prevents infrastructure concerns from leaking
into decision logic. It also enables the same runtime to operate with
different storage backends, event dispatchers, and observability systems.

### Protocol-First Design

Every operation in Signal begins with a protocol contract: a versioned name,
an operation kind (Query, Mutation, or Event), input and result schemas, and
semantic metadata. The protocol is defined before transport, before storage,
and before any handler logic.

**Why:** Protocol-first design ensures that contracts are stable, versioned,
and transport-independent. Breaking changes require new versions, not
modifications to existing operations. This protects consumers and enables
evolution without coordination.

### Event-Oriented Processing

Signal processes events as immutable facts. Mutations emit events; subscribers
react to events. Events are dispatched only from mutation context, ensuring
that side effects are traceable to the operation that caused them.

**Why:** Event-oriented processing provides a clear audit trail, enables
replay, and decouples producers from consumers. Events represent what
happened; subscribers decide what to do about it.

### Replayable Execution

Every operation produces deterministic evidence. The same inputs produce the
same audit trail. Idempotency keys protect against accidental retries.
Replay reconstructs past decisions from stored evidence.

**Why:** Replayable execution is essential for audit, debugging, and
regulatory compliance. When something goes wrong, the full decision trail can
be reconstructed without guessing.

### Auditability

Every decision carries evidence, assessment, and a journal. Outcome reviews
connect results back to prior judgment. The stewardship ledger tracks
traceability across decisions, evidence, threats, and protections.

**Why:** Auditability is not an afterthought — it is a core property. Systems
that make consequential decisions must be able to explain why those decisions
were made, what evidence supported them, and what was known vs. assumed at the
time.

### Domain-Driven Modularization

Signal separates the kernel (protocol, runtime, ports) from domain packages
(decision, decision-memory, agency, commitment, semantic-state). The kernel
provides execution mechanics; domain packages provide reasoning logic.
Applications own domain language, APIs, and UX.

**Why:** Domain-driven modularization prevents the kernel from becoming
coupled to any specific domain. It allows new domains to adopt Signal without
modifying core packages, and it keeps domain intelligence where it belongs —
in domain packages and application adapters.

---

## The Signal Kernel

The Signal Kernel is the architectural core that all domains build upon. It
consists of three packages:

### `@signal/protocol` — Shared Language

Protocol defines the canonical contract surface:

- **Operation names** — Versioned identifiers (e.g., `payment.capture.v1`)
- **Operation kinds** — Query, Mutation, Event
- **Envelopes** — Standardized request/response shapes
- **Errors** — Structured error codes and messages
- **Results** — Typed result objects
- **Capabilities** — Runtime operation discovery
- **JSON schema objects** — Published schema definitions

Protocol is the shared language of the system. Every package, adapter, and
application speaks protocol. It carries semantic meaning, not just data
shapes.

### `@signal/runtime` — Execution Mechanics

Runtime provides the in-process execution engine:

- **Registry** — Operation registration and lookup
- **Query/Mutation/Event execution** — `run()`, `execute()`, `query()`
- **Idempotency** — Safe retry handling for mutations
- **Subscribers** — Event dispatch and deduplication
- **Dispatch** — Event delivery from mutation context
- **Perception** — Capability discovery
- **Replay** — Deterministic re-execution from stored evidence
- **Audit** — Evidence collection and hash-chained audit trail

Runtime executes. It does not reason. Domain logic is injected through ports,
not imported from domain packages.

### `@signal/ports` — Capability Boundaries

Ports define pure interfaces for dependency inversion:

- **EventPort** — Event dispatch interface
- **StoragePort** — Persistence interface (idempotency, audit)
- **DecisionPort** — Domain logic interface
- **ObservabilityPort** — Lifecycle hooks interface
- **RuntimePort** — Runtime introspection interface

Ports are the boundary between the kernel and the outside world. They define
what the kernel needs; adapters define how those needs are met.

### What the Kernel Does NOT Contain

The kernel explicitly excludes:

- Domain-specific logic (trading, healthcare, etc.)
- Business rules or decision-quality models
- Storage implementations (Postgres, Redis, etc.)
- Transport implementations (HTTP, gRPC, etc.)
- Application workflows or UX

Domain intelligence lives in domain packages and application adapters. The
kernel provides the execution and contract infrastructure that makes domain
intelligence auditable, replayable, and transportable.

---

## Domain Packages

Domain packages provide reusable reasoning logic. They depend on protocol for
shared contracts but are independent of runtime, ports, and infrastructure.

### `@signal/decision` — Decision Quality

The core decision-quality model:

- Evidence assessment with quality, reliability, freshness, independence
- Confidence caps that prevent confidence from exceeding evidence
- Journals that capture reasoning before outcomes are known
- Outcome reviews that connect results to prior judgment
- Learning records and lesson survival tracking
- Coherence and pipeline evaluation

New code should prefer `@signal/decision/core` for evidence-centered
operations.

### `@signal/decision-memory` — Durable Memory

Persistent decision memory:

- Learning record storage and retrieval
- Retention and compaction policies
- Summary generation
- Neon/Postgres-backed storage adapter
- Signal memory operations

### `@signal/agency` — Agency Pipeline

Agency pipeline primitives:

- State evaluation and calibration
- Learning and memory integration
- Outcome tracking
- Policy enforcement
- Self-diagnosis

### `@signal/commitment` — Commitment Evaluation

Generic commitment evaluator:

- Decision-to-commitment translation
- Trust and constraint assessment
- Resource and policy integration
- Recommended commitment output

### `@signal/semantic-state` — Semantic State Resolution

Semantic-state mapping:

- Numeric dimension to named state mapping
- Bundled lexicon for common state resolutions
- Reusable across domains

### The Runtime vs. Domain Distinction

A critical architectural rule:

- **Runtime executes** — It provides the machinery for running operations,
  collecting evidence, dispatching events, and enforcing idempotency.
- **Domain packages reason** — They provide the logic for assessing evidence,
  forming judgments, tracking learning, and evaluating commitment.

Runtime does not own business logic. Domain packages do not own execution
mechanics. This separation ensures that both can evolve independently and that
new domains can adopt the runtime without modifying it.

---

## How to Build a New Domain on Signal

1. **Define your domain's adapter layer** — Translate domain concepts into
   Signal's generic contracts (evidence, assessment, decision, outcome,
   learning).

2. **Depend on `@signal/protocol`** — Use versioned operation names, schemas,
   and envelope shapes.

3. **Use `@signal/runtime` for execution** — Register queries, mutations, and
   events. Inject domain logic through `DecisionPort`.

4. **Use `@signal/decision` for reasoning** — Assess evidence, evaluate
   decisions, review outcomes, and track learning.

5. **Use `@signal/decision-memory` for persistence** — Store learning records,
   compact history, and retrieve reviewed situations.

6. **Own your domain language** — Keep domain-specific terminology, APIs, and
   UX in your application. Signal provides the infrastructure; you provide
   the domain intelligence.

See [Multi-Domain Examples](multi-domain-examples.md) for concrete examples
of how different domains map to Signal's model.