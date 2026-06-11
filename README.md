# Signal

Signal is a reusable decision-processing platform for events, evidence,
assessment, decisions, learning, memory, replay, and audit.

It makes dangerous backend operations explicit, replay-safe, and auditable.
It also provides a protocol-governed, domain-agnostic architecture for
building systems that reason under uncertainty.

## Understand Signal Fast

In 10 seconds: Signal is a decision-processing platform. It makes judgment
representable as system state — with evidence, replay, and audit built in.

In 30 seconds: applications define reads as Queries, dangerous state changes
as Mutations, and completed facts as Events. Signal gives those operations
stable names, schemas, idempotency, replay metadata, subscriber dedupe, audit
evidence, and certification. Domain packages provide evidence assessment,
confidence caps, outcome reviews, and learning records.

In 5 minutes, a developer should be able to run the reference proof, execute a
dangerous mutation, retry it safely, observe replay, observe conflict, observe
emitted events, observe audit evidence, and run certification.

## What Signal Is

- **Decision-processing infrastructure** — reusable machinery for events,
  evidence, assessment, decisions, learning, memory, replay, and audit
- **A protocol platform** — protocol-first contracts that are
  transport-independent and versioned
- **A replayable execution system** — deterministic evidence and hash-chained
  audit trails
- **An auditable reasoning framework** — traceable, challengeable, improvable
  judgment

## What Signal Is Not

- **Trading-only software** — Trading (Stocks Optimizer) is one example
  application; Signal applies to any domain requiring structured judgment
- **A brokerage platform, UI framework, database abstraction layer, workflow
  engine, or message broker**
- **A prediction engine** — Signal reasons from evidence and reviewed history;
  it does not forecast outcomes

See [What Signal Is](docs/what-signal-is.md) for the full definition.

## The Decision Processing Model

Signal implements a general-purpose pattern:

```txt
Event → Evidence → Assessment → Decision → Learning → Memory → Action
```

This model is domain-agnostic. Trading is one instantiation. Healthcare,
cybersecurity, education, AI agents, recommendation systems, and business
automation are equally valid instantiations. See
[Multi-Domain Examples](docs/multi-domain-examples.md).

## What Signal Makes Possible

Signal makes judgment representable as system state. Decisions can carry
evidence, uncertainty, execution history, outcome review, and learning across
time.

### Structural Shift

| Without Signal | With Signal |
| --- | --- |
| Implicit decisions | Explicit decision objects |
| Execution logs | Decision lifecycle history |
| Stateless systems | Outcome-aware systems |
| Reactive logic | Learning systems |
| Opaque behavior | Auditable judgment |

### System Capability Classes

- **Decision-tracking systems** preserve decisions, evidence, constraints, and
  review state as software state.
- **Outcome-learning systems** connect outcomes back to prior judgment so later
  decisions can use reviewed history.
- **Audit-first execution systems** make risk, authorization, replay, and result
  evidence part of the execution record.
- **Stewardship-aware systems** represent responsibility, policy, constraints,
  and review obligations in the decision lifecycle.
- **Uncertainty-aware systems** keep unknowns, assumptions, contradictions,
  confidence, and evidence limits visible.

### Newly Possible Properties

- Decisions persist across time and teams.
- Reasoning is traceable.
- Execution is reviewable and reversible in record.
- Systems improve from outcomes.
- Uncertainty becomes first-class state.

### Mental Model Shift

```txt
software executes logic -> software manages evolving judgment
```

## Start Here

```bash
pnpm install
pnpm proof:reference
```

The proof executes `payment.capture.v1`, retries it with the same idempotency
key, forces an idempotency conflict, verifies redacted audit and outbox
evidence, checks subscriber dedupe, and runs `reference.certification.v1`.

To inspect the HTTP binding too:

```bash
pnpm --filter @signal/reference-server... build
pnpm --filter @signal/reference-server start
```

Then call the dangerous mutation:

```bash
curl -X POST http://127.0.0.1:3001/signal/mutation/payment.capture.v1 \
  -H 'content-type: application/json' \
  -d '{"idempotencyKey":"tenant_acme:capture:readme","auth":{"actor":{"id":"ops_alice"},"subject":"tenant:tenant_acme","scopes":["payment:capture","tenant:tenant_acme"]},"payload":{"tenantId":"tenant_acme","authorizationId":"auth_readme","amountCents":12500,"currency":"USD","paymentMethod":{"token":"tok_live_secret","last4":"4242"},"risk":{"declared":true,"classification":"high","reason":"Customer-visible payment capture moves funds.","approvedBy":"ops_alice"}}}'
```

## The Signal Kernel

The architectural core that all domains build upon:

| Package | Role |
| --- | --- |
| `@signal/protocol` | Shared language: operation names, kinds, envelopes, errors, results, capabilities, schemas |
| `@signal/runtime` | Execution mechanics: registry, dispatch, idempotency, replay, audit, orchestration |
| `@signal/ports` | Capability boundaries: pure interfaces for dependency inversion |

Domain intelligence is NOT part of the kernel. Runtime executes. Domain
packages reason. See [Architecture](docs/architecture.md).

## Domain Packages

| Package | Role |
| --- | --- |
| `@signal/decision` | Decision-quality model: evidence, assessment, confidence caps, journals, outcome reviews, learning |
| `@signal/decision-memory` | Durable decision memory, learning records, retention, compaction |
| `@signal/agency` | Agency pipeline: state evaluation, calibration, policy, self-diagnosis |
| `@signal/commitment` | Commitment evaluation from decisions, trust, constraints, and policy |
| `@signal/semantic-state` | Semantic-state resolution and bundled lexicon |

`@signal/decision` owns the reusable decision-quality model. New code should
prefer `@signal/decision/core`. See [Architecture](docs/architecture.md).

## Folder Shape

```txt
api/                 client/server interface packages
server/              backend packages and reference server
examples/            runnable examples and example-only integrations
packages/            reusable Signal domain packages
frontend/            reserved local frontend support, not a workspace package
docs/                developer documentation
spec/                protocol RFCs and contract assets
spec/contracts/      published schemas and shared fixtures
```

Core protocol/runtime code lives in `api/`. Backend implementation packages
live in `server/`. Example-only packages and runnable frontends live in
`examples/`. `frontend/` is reserved local support and is not currently a
pnpm workspace package. Published schemas and shared fixtures live together
under `spec/contracts/`.

The reusable decision lifecycle is:

```txt
Objective -> Resources -> Allocation -> Position -> State -> Evaluation
-> Constraints -> Threats -> Assumptions -> Similarity -> Reviewed History
-> Judgment -> Tradeoffs -> Strategies -> Execution -> Outcome
-> Observation -> Review -> Verification -> Lesson
```

Signal is not a prediction engine. It helps applications make reviewable,
learning-informed judgments from current evidence and reviewed history. Stocks
Optimizer remains an application/adapter that translates investment concepts
into Signal's generic contracts; Signal core does not depend on Stocks
Optimizer.

## Common Commands

```bash
pnpm proof:reference
pnpm proof:reference:postgres # requires DATABASE_URL
pnpm db:migrate              # requires DATABASE_URL
pnpm release:library
pnpm test
pnpm typecheck
pnpm lint
pnpm verify:exports
pnpm -r --if-present --sort run test:coverage
```

Before production changes, run the non-example library surface when you are not
working on apps:

```bash
pnpm typecheck:library
pnpm lint:library
pnpm test:library
pnpm verify:exports
```

## Documentation

- [Architecture](docs/architecture.md) — architectural patterns, Signal Kernel, domain packages
- [What Signal Is](docs/what-signal-is.md) — platform definition and decision processing model
- [Dependency Rules](docs/dependency-rules.md) — package boundary rules and enforcement
- [Replay and Auditability](docs/replay-auditability.md) — replay model, determinism, audit guarantees
- [Governance](docs/governance.md) — protocol evolution, RFCs, contract management
- [Multi-Domain Examples](docs/multi-domain-examples.md) — how Signal applies across domains
- [Constitution](docs/constitution.md) — Signal's correctness rules and change principles
- [Developer Documentation](docs/README.md) — full developer-oriented source of truth

## Example App Links

- Aware: <https://aware-guide.vercel.app>
- Stocks Optimizer: <https://stocks-optimizer.vercel.app>

## License

MIT