# Contributing

Signal is split into a public protocol, reference implementations, and docs.

## What To Change

- Protocol behavior belongs in `spec/` first.
- Shared validation and message shapes belong in `packages/protocol`.
- Execution rules belong in `packages/runtime`.
- HTTP behavior belongs in `packages/binding-http`.
- PostgreSQL idempotency belongs in `packages/idempotency-postgres`.
- Public docs belong in `docs/`.
- The homepage belongs in `landing/`.

## Local Workflow

1. Install dependencies with `pnpm install`.
2. Run `pnpm build` or a package-specific build.
3. Run `pnpm test`.
4. Update the matching RFC and docs page when behavior changes.

## Review Standard

- Keep protocol names stable.
- Add tests for behavior changes.
- Prefer explicit contracts over helper magic.
- If a change is breaking, update the versioned name and the RFC together.
