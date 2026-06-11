# Architecture Fitness Tests — Phase 8

## Overview

Local static analysis that enforces architectural boundaries. These tests ensure that layer dependencies flow in the correct direction and that no boundary violations exist.

## Dependency Direction Rules

### Rule 1: Pulse does not import Execution
- **Pulse** (perception/observation layer) must not import from **Execution** (mutation/query handlers)
- Pulse observes envelopes; it does not control execution
- **Check**: `api/runtime/src/perception.ts` must not import from `api/runtime/src/mutation.ts`, `api/runtime/src/query.ts`, or `api/runtime/src/event.ts`

### Rule 2: Execution does not import Pulse
- **Execution** (mutation/query/event handlers) must not import from **Pulse** (perception layer)
- Execution produces outcomes; Pulse observes them
- **Check**: `api/runtime/src/mutation.ts`, `api/runtime/src/query.ts`, `api/runtime/src/event.ts` must not import from `api/runtime/src/perception.ts`

### Rule 3: Audit is immutable
- Audit chain entries are `readonly` and cannot be modified after creation
- `AuditChainEntry` interface uses `readonly` on all fields
- `verifyChain()` detects any tampering
- **Check**: No mutation of `AuditChainEntry` fields; `verifyChain()` returns `false` for tampered chains

### Rule 4: Protocol does not import Runtime
- `@signal/protocol` must not depend on `@signal/runtime`
- Protocol defines contracts; Runtime implements them
- **Check**: `api/protocol/src/` must not contain `import ... from "@signal/runtime"`

### Rule 5: Binding-HTTP does not import Protocol internals directly
- `@signal/binding-http` imports from `@signal/protocol` and `@signal/runtime` public APIs only
- **Check**: No direct imports of internal protocol modules

## Fitness Test Implementation

```bash
# Static dependency analysis
grep -r "from.*./mutation" api/runtime/src/perception.ts && echo "FAIL: Pulse imports Execution" || echo "PASS"
grep -r "from.*./perception" api/runtime/src/mutation.ts && echo "FAIL: Execution imports Pulse" || echo "PASS"
grep -r "from.*./query" api/runtime/src/perception.ts && echo "FAIL: Pulse imports Query" || echo "PASS"
grep -r "from.*./event" api/runtime/src/perception.ts && echo "FAIL: Pulse imports Event" || echo "PASS"
grep -r "from.*@signal/runtime" api/protocol/src/ && echo "FAIL: Protocol imports Runtime" || echo "PASS"
```

## Current Status

| Rule | Status | Evidence |
|------|--------|----------|
| Pulse does not import Execution | PASS | `perception.ts` has no imports from mutation/query/event |
| Execution does not import Pulse | PASS | `mutation.ts`, `query.ts`, `event.ts` have no imports from perception |
| Audit is immutable | PASS | `AuditChainEntry` uses `readonly`; `verifyChain()` detects tampering |
| Protocol does not import Runtime | PASS | `api/protocol/src/` has no `@signal/runtime` imports |
| Binding-HTTP uses public APIs only | PASS | `binding-http/src/` imports from `@signal/protocol` and `@signal/runtime` |