# Start Here

This repository is organized around the Signal contract first and the Node.js reference runtime second.

## Recommended Reading Order

1. `README.md`
2. `spec/RFC-0001-signal-protocol-core.md`
3. `spec/RFC-0004-signal-idempotency.md`
4. `spec/RFC-0005-signal-event-processing.md`
5. `spec/RFC-0006-signal-execution-context-and-outcomes.md`
6. `ARCHITECTURE.md`
7. `QUICK_REFERENCE.md`
8. `packages/examples/post-publication/`
9. `apps/reference-server/`

## If You Want To...

- understand the protocol: start with `README.md` and `spec/`
- embed Signal in-process: read `packages/sdk-node` and `packages/runtime`
- expose HTTP: read `packages/binding-http` and `apps/reference-server`
- inspect concrete behavior: run `EXAMPLE.ts` or the examples package
- extend storage or transports: read `EXTENDING.md`

## Fast Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter @signal/reference-server start
```
