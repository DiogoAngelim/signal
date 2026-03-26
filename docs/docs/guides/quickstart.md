---
title: Quickstart
---

# Quickstart

1. Install dependencies.
2. Build the workspace.
3. Start the reference server.
4. Call a query or mutation.

## Run

```bash
pnpm install
pnpm build
pnpm --filter @signal/reference-server start
```

## Try It

```bash
curl -X POST http://127.0.0.1:3001/signal/mutation/payment.capture.v1 \
  -H 'content-type: application/json' \
  -d '{"payload":{"paymentId":"pay_1001","amount":120,"currency":"USD"},"idempotencyKey":"capture-pay_1001-001"}'
```
