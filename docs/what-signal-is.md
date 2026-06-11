# What Signal Is

## Signal IS

- **Decision-processing infrastructure** — Signal provides the reusable machinery for events, evidence, assessment, decisions, learning, memory, replay, and audit. Any domain that needs structured judgment can build on Signal.
- **A protocol platform** — Signal defines a protocol-first contract surface (`@signal/protocol`) that establishes shared language, envelopes, and semantic meaning. All operations flow through versioned, schema-validated contracts.
- **A replayable execution system** — Every operation produces deterministic, replay-safe evidence. The same inputs produce the same audit trail, enabling trace reconstruction and historical analysis.
- **An auditable reasoning framework** — Decisions carry evidence, uncertainty, assumptions, and outcome reviews. Judgment is traceable, challengeable, and improvable over time.
- **Domain-agnostic** — Signal's core packages contain no domain-specific logic. Trading, healthcare, cybersecurity, education, and other domains are applications that consume Signal through adapters.
- **Protocol-first and transport-independent** — Contracts are defined before transport. HTTP, CLI, and future bindings are adapters over the same protocol.
- **A correctness layer** — Signal makes dangerous operations explicit, idempotent, and auditable. Risk is declared, authorization is enforced, and evidence is collected.

## Signal IS NOT

- **Trading-only software** — Trading (Stocks Optimizer) is one example application. Signal's decision-processing model applies to any domain requiring structured judgment.
- **A brokerage platform** — Signal has no order routing, market data feeds, or exchange connectivity. Those are application concerns.
- **A UI framework** — Signal provides backend infrastructure and decision logic. Frontend rendering is an application concern.
- **A database abstraction layer** — Signal uses ports for dependency inversion. Storage implementations (Postgres, in-memory, etc.) are adapters, not core concerns.
- **A workflow engine** — Signal does not orchestrate arbitrary task graphs. It processes decisions through a defined lifecycle.
- **A message broker** — Signal dispatches events from mutation context, but it is not a general-purpose messaging system.
- **A framework replacement** — Signal does not replace Express, Fastify, Next.js, or any application framework. It integrates alongside them.
- **A prediction engine** — Signal reasons from evidence and reviewed history. It does not forecast outcomes. Similarity informs judgment; it does not guarantee futures.

## The Decision Processing Model

Signal implements a general-purpose pattern that applies across domains:

```txt
Event → Evidence → Assessment → Decision → Learning → Memory → Action
```

Each stage is domain-agnostic:

| Stage | What Happens | Domain Example |
|-------|-------------|----------------|
| **Event** | Something observable occurs | Market tick, patient observation, security alert |
| **Evidence** | The event is characterized with quality, reliability, freshness | Price data quality, sensor accuracy, log confidence |
| **Assessment** | Uncertainty is made visible; knowns, unknowns, assumptions separated | Risk assessment, diagnosis, threat classification |
| **Decision** | Judgment is formed from evidence and assessment | Trade execution, treatment plan, incident response |
| **Learning** | Outcome is reviewed; lessons extracted | Postmortem, clinical review, incident retrospective |
| **Memory** | Surviving lessons persist for future judgment | Historical patterns, clinical guidelines, threat signatures |
| **Action** | The decision produces an observable effect | Order placed, prescription written, alert escalated |

This model is not specific to any domain. Trading is one instantiation. Healthcare, cybersecurity, education, AI agents, recommendation systems, and business automation are equally valid instantiations.

## Why This Matters

When Signal is understood as a decision-processing platform rather than a trading system:

- **New domains become obvious consumers** — Any system that needs structured, auditable judgment can use Signal.
- **Architecture boundaries stay clean** — Domain intelligence lives in application adapters, not in the kernel.
- **Protocol contracts remain reusable** — The same evidence, assessment, and decision contracts serve every domain.
- **Replay and audit apply universally** — Every domain benefits from traceable, replayable decision records.
- **Learning compounds across domains** — The same lesson survival and reviewed history mechanisms improve judgment in any context.