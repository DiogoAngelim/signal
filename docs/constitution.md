# Signal Constitution

Signal is a production correctness standard.

Signal makes dangerous backend operations explicit, replay-safe, and
auditable. Every protocol, runtime, server, package, example, and document
should strengthen that sentence.

## Adoption Test

A new engineer must be able to install Signal, run the reference proof, execute
a dangerous mutation, retry it safely, observe replay, observe conflict,
observe emitted events, observe audit evidence, and run certification within
five minutes.

If a change does not make that path easier to trust, reject the change.

## Principles

1. Signal is a correctness layer.
2. Signal is protocol-first.
3. Signal is transport-independent.
4. Queries, Mutations, and Events are explicit contracts.
5. Dangerous mutations must declare risk.
6. Versioned operations are immutable contracts.
7. Events are immutable facts.
8. Production guarantees require evidence.
9. Unsafe high-risk configurations fail loudly.
10. Simplicity beats flexibility.

## Category Boundaries

Signal is not a framework replacement, workflow engine, message broker,
database, auth provider, API gateway, full-stack platform, or payment network.

Signal is a correctness layer for Queries, Mutations, and Events:

- Queries read state.
- Mutations make intentional state changes.
- Events record facts that already happened.

## Trust Rule

Before adding or changing code, ask:

```txt
Would a skeptical senior engineer trust Signal more because of this?
```

If the answer is not clearly yes, do not implement it.

## Complexity Rule

Prefer deletion over addition, consolidation over expansion, and
simplification over flexibility.

Before adding an abstraction, package, dependency, interface, hook, table,
feature, or document, ask:

1. Can an existing Signal concept solve this?
2. Does this reduce adoption risk?
3. Does this reduce operational risk?
4. Does this reduce cognitive load?

If all answers are not yes, do not add it.

## Evidence Rule

High-risk production guarantees require executable evidence. A complete
high-trust path must prove:

- high-risk mutation declaration
- scoped idempotency
- tenant isolation
- authorization before handler execution
- audit evidence
- redaction evidence
- transactional outbox evidence
- subscriber dedupe
- certification
- conformance tests
- adversarial tests
- reference proof

Documentation may explain guarantees, but tests and the reference proof must
demonstrate them.
