# Capabilities Inspection Example

This example builds a runtime, registers operations, and prints the derived capability document.

## What It Demonstrates

- runtime-derived capability discovery
- explicit queries, mutations, events, and subscriptions
- feature metadata that bindings can expose unchanged

## Run

```bash
pnpm --filter @signal/examples build
node packages/examples/dist/capabilities-inspection/index.js
```
