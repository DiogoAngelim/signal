# Independent developer adoption validation

Signal's developer experience score must be based on a developer who did not
author the feature or documentation being evaluated. A successful CI build or
self-reported quick start is not an independent adoption measurement.

## Protocol

Run at least three sessions with developers unfamiliar with the repository.
Use a clean machine or disposable environment with no preinstalled workspace
dependencies, cached build output, or prior Signal configuration.

Give each participant only:
- the public repository URL;
- the README and linked developer documentation;
- published Node.js and pnpm prerequisites;
- a fixed task: install, build the library, run the reference proof, execute
  one idempotent mutation twice, inspect replay behavior, and locate audit
  evidence.

Do not coach participants during the timed attempt. Record assistance
separately rather than silently removing it from elapsed time.

## Measurements

For each session record:
- environment, OS, CPU, Node.js, pnpm, network conditions, and commit SHA;
- elapsed time to successful install, build, and first proof;
- elapsed time to complete mutation/retry/replay task;
- commands attempted and whether documentation predicted them;
- blockers, failed commands, ambiguous concepts, and recovery time;
- number and duration of moderator interventions;
- whether the participant correctly identifies limits of replay,
  at-least-once delivery, audit-chain trust, and production certification;
- participant confidence and evidence used for each conclusion.

Report median and range across participants. Keep failed sessions in the
dataset. Do not count a task as completed if the participant bypasses
authorization, changes tests, or edits source without understanding the
documented workflow.

## Acceptance criteria

Set target times only after the first baseline round. Improvements should
reduce time to first proof, undocumented steps, failed commands, moderator
interventions, incorrect assumptions about guarantees, and time to diagnose a
deliberately introduced idempotency or replay issue.

Repeat the same task after material README, SDK, or runtime API changes. Keep
task wording, environment profile, and scoring rubric constant.

## Current evidence status

The repository has a documented quick start, reference proof, package
entrypoint validation, and isolated package-consumer installation in release
CI. No independent developer study is recorded yet. Until that study is
completed, developer adoption is implemented/documented but not independently
validated.
