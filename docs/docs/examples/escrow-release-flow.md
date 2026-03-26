---
title: Escrow Release Flow
---

# Escrow Release Flow

1. A client sends `escrow.release.v1`.
2. The runtime checks idempotency before repeating the write.
3. The runtime emits `escrow.released.v1`.
4. A repeated call with the same key returns the original result.
