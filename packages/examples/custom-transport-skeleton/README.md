# Custom Transport Skeleton

This example is intentionally incomplete. It shows the explicit adapter surface a broker-backed or queue-backed transport needs to implement without changing the Signal protocol.

## What It Demonstrates

- `SignalDispatcher` shape
- explicit event dispatch and subscription hooks
- where delivery metadata can be attached

## Run

```bash
pnpm --filter @signal/examples build
node packages/examples/dist/custom-transport-skeleton/index.js
```
