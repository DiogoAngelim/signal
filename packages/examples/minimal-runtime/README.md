# Minimal Runtime Example

This example shows the smallest useful Signal runtime: one in-process query, explicit registration, and a capability document.

## What It Demonstrates

- in-process runtime creation
- explicit query registration
- validated query execution
- capability inspection without HTTP

## Operations

- `note.get.v1` query

## Run

```bash
pnpm --filter @signal/examples build
node packages/examples/dist/minimal-runtime/index.js
```
