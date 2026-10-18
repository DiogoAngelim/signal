# Instructor answer key — three-source escalation policy

> **Instructor-only reference.** Ask learners to add the regression test and observe the red test run before sharing this file. This branch is a solution variant for the optional exercise, not the baseline release branch.

## Policy change

The baseline uses two distinct qualified source labels. The exercise raises the threshold to three:

```ts
export const TRIAGE_RULES = {
  monitorMaximumScore: 30,
  minimumStrongSourcesToEscalate: 3,
  // Other evidence thresholds remain unchanged.
} as const;
```

The canonical `confirmed-critical` fixture therefore needs a third distinct synthetic source. The solution adds `network-connection` from `network-sensor-west`, with all five evidence dimensions above the configured minimums. This is synthetic corroboration, not proof that the source is independent in a real organization.

## Regression contract

1. Add a test that copies the canonical confirmed alert but keeps only its first two signals. It must return `analyst-review` and explain that three qualified sources are required.
2. Run the test suite before changing the policy. The new test should fail because the baseline policy still accepts two qualified sources.
3. Set the policy threshold to three and add the third qualified synthetic signal to the canonical confirmed fixture.
4. Update evidence-dimension regression expectations: degrading one of three sources leaves two qualified sources, so escalation is withheld and the rationale says `only 2 qualified`.
5. Preserve the duplicate-source test: three indicators from one source label still count as only one qualified source. Keep the contradictory-evidence test; a contradiction still blocks escalation.

## Verification gate

From the repository root, use the pinned package manager:

```bash
corepack pnpm --filter @signal/ai-decision-system build
corepack pnpm --filter @signal/ai-decision-system test
corepack pnpm --filter @signal/ai-decision-system typecheck
corepack pnpm --filter @signal/ai-decision-system start
```

Do not record a pass unless all four commands actually succeed. The solution branch adds an eleventh top-level course test; the baseline release branch retains its ten-test suite.

Expected fixture outcomes remain:

| Fixture | Advisory estimate | Priority |
| --- | ---: | --- |
| `confirmed-critical` | 100/100 | `escalate` |
| `high-score-unconfirmed` | 94/100 | `analyst-review` |
| `low-background` | 14/100 | `monitor` |

## Release boundary

This branch is an instructor solution for the optional exercise. Do **not** merge its policy/code into the baseline course release without also revising the slide deck, narration, and any references that state the baseline requires two sources. The security example remains synthetic and advisory; source-label independence is not independently verified.
