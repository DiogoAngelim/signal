---
title: Payment Capture Flow
---

# Payment Capture Flow

1. A client sends `payment.capture.v1` with an idempotency key.
2. The mutation validates the request and updates the payment record.
3. The mutation emits `payment.captured.v1`.
4. A replay of the same request returns the stored result.

## Retry Behavior

- same key + same payload => same logical result
- same key + different payload => conflict
- event subscribers must tolerate duplicate delivery
