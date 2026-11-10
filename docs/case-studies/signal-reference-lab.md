# Case study: Signal Reference Lab

**Status:** Reproducible CI verification  
**Verified:** 2026-11-10  
**Signal commit:** `7611e0e0fa61b1dd8299127f1754d631488fc089`  
**Workflow:** [Signal Reference Lab run 42853111860](https://github.com/DiogoAngelim/signal/actions/runs/42853111860)

## The engineering problem

A decision-processing platform needs evidence that its contracts and runtime work together across a complete decision lifecycle—not simply that packages compile or isolated unit tests pass. It also needs a way to distinguish capabilities that are exercised from those that are only partially covered or not verified.

## What was evaluated

Signal Reference Lab is a runnable case-management application built against Signal's public workspace packages. It exercises a generic flow:

`request → sourced evidence → assessment → decision → human authorization → action → outcome → review`

The evaluation covers public SDK operation registration and dispatch, schema validation, authorization, tenant-boundary checks, evidence assessment, commitment constraints, semantic-state interpretation, decision memory, event publication, HTTP binding, PostgreSQL adapters, retry budgets, circuit breakers, replay evidence, audit integrity, kernel orchestration, CLI verification, and observability instrumentation.

The CI workflow provisions an ephemeral PostgreSQL 16 service, installs the locked workspace, builds Signal libraries and the CLI, applies database migrations, builds and typechecks the lab, runs compiled tests and coverage verification, and stores machine-readable evaluation and benchmark artifacts.

## Verified result

The completed workflow reported:

| Measure | Observed result |
|---|---:|
| Overall scenarios | **17 / 17 passed** |
| Blocked scenarios | **0** |
| Failed scenarios | **0** |
| Signal-targeted scenarios | **12 / 12 passed** |
| Capabilities directly exercised | **28 / 34** |
| Capabilities marked partial | **6** |
| PostgreSQL integration assertions | **21 passed** |

The GitHub Actions job completed successfully. PostgreSQL health checks, frozen dependency installation, library build, migrations, CLI build, Reference Lab build, semantic typecheck, compiled tests, coverage verification, and evidence artifact generation all succeeded.

The result is tied to the exact commit and workflow above. The artifact was uploaded as `signal-reference-lab-42853111860-1` (artifact ID `13782365395`).

## What this demonstrates

- Signal's public packages can be exercised together by a real example application.
- The evaluated lifecycle includes evidence, decision, authorization, execution, outcome, and review—not only a prediction or isolated function.
- PostgreSQL-backed adapter behavior is tested against a real ephemeral PostgreSQL 16 service in CI.
- The harness records machine-readable results and distinguishes exercised, partial, blocked, and unverified capabilities.
- The result is reproducible from a versioned repository commit and a visible CI workflow.

## Limitations

This is a **technical reference case study**, not a customer deployment or production certification.

The evaluation does not establish:
- production throughput, latency SLOs, or long-duration soak behavior;
- multi-region or cross-host contention under representative production load;
- external identity-provider integration or a complete production authorization system;
- crash-after-claim recovery and stale-worker fencing in the Reference Lab harness;
- provider/network fault injection across all relevant failure modes;
- full historical replay execution or cross-version replay compatibility;
- external key custody or independent audit-checkpoint anchoring;
- external telemetry scraping, trace export, or operational alerting;
- improved customer, revenue, conversion, or other business outcomes.

The six partial capabilities remain visible in the evaluation output. In-process delivery is not proof of distributed delivery, and a CI benchmark is not a production SLO measurement. Synthetic outcome fixtures are not live calibration evidence.

## Reproduce

From the Signal repository root:

```bash
pnpm install --frozen-lockfile
pnpm build:library
pnpm --filter @signal/reference-lab db:migrate
npm ci --prefix signal-cli
npm run build --prefix signal-cli
export SIGNAL_CLI_READY=1
pnpm --filter @signal/reference-lab build
pnpm --filter @signal/reference-lab typecheck
node --test examples/signal-reference-lab/dist/test/*.test.js
node examples/signal-reference-lab/dist/src/cli.js coverage
node examples/signal-reference-lab/dist/src/cli.js evaluate --out evaluation.json
node examples/signal-reference-lab/dist/src/cli.js benchmark --out benchmark.json
```

The database commands require the isolated PostgreSQL service and `DATABASE_URL` configured as in [the Reference Lab README](../examples/signal-reference-lab/README.md).

## Evidence and interpretation

- [Reference Lab source and reproduction instructions](../examples/signal-reference-lab/README.md)
- [Workflow definition](../.github/workflows/reference-lab.yml)
- [Completed CI run](https://github.com/DiogoAngelim/signal/actions/runs/42853111860)
- [Integration and claim standard](application-integration-contract.md)
- [Case-study selection and deferred application assessments](credibility-case-study-selection.md)

**Claim boundary:** Signal has a reproducible, CI-verified technical reference case. This evidence does not establish that Workbench or Stocks Optimizer currently execute through Signal, nor that Signal has been validated in production.
